package vn.fpt.campusstay.regression;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionTemplate;

import vn.fpt.campusstay.PostgresTestcontainer;
import vn.fpt.campusstay.event.PaymentClaimRejected;
import vn.fpt.campusstay.event.UtilityTerminationDue;

/** Wave 3 (security branch): listeners after commit and the races BE-2ND-08, BE-ASG-21, BE-ASG-11. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class Wave3SecurityRegressionIT {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    ApplicationEventPublisher events;

    @Autowired
    TransactionTemplate tx;

    RegressionSupport r;

    @BeforeEach
    void setUp() {
        r = new RegressionSupport(mvc, jdbc);
    }

    /** TC-NTF-300: BE-2ND-08: a notification that cannot be built does not roll back the payment confirmation. */
    @Test
    void notificationFailureKeepsPaymentConfirmation() throws Exception {
        RegressionSupport.Applied app = r.apply(40, "2-bed", "Basic");
        r.claim(app.auth(), app.depositInvoiceId()).andExpect(status().isOk());
        jdbc.sql("UPDATE ntf_template SET key = 'PAYMENT_CONFIRMED_OFF' WHERE key = 'PAYMENT_CONFIRMED'").update();
        try {
            r.confirm(app.depositInvoiceId()).andExpect(status().isOk());
        } finally {
            jdbc.sql("UPDATE ntf_template SET key = 'PAYMENT_CONFIRMED' WHERE key = 'PAYMENT_CONFIRMED_OFF'").update();
        }
        assertThat(jdbc.sql("SELECT status FROM bil_invoice WHERE code = :c").param("c", app.depositInvoiceId())
                .query(String.class).single()).isEqualTo("PAID");
    }

    /**
     * TC-ASG-300: BE-ASG-21: a termination opened by another transaction while Billing's debt rule fires does not
     * roll back Billing's transaction.
     */
    @Test
    void duplicateTerminationDoesNotRollBackBilling() throws Exception {
        long allocation = r.livesIn(41, "A-109", "A", true);
        long student = r.userId(RegressionSupport.student(41));
        CountDownLatch inserted = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        CompletableFuture<Void> manager = CompletableFuture.runAsync(() -> tx.executeWithoutResult(s -> {
            jdbc.sql("""
                    INSERT INTO asg_termination (allocation_id, term_id, student_id, reason, note, started_at, move_out_by)
                    VALUES (:a, :t, :s, 'MANAGER', 'Test', now(), CURRENT_DATE + 7)
                    """).param("a", allocation).param("t", r.termId).param("s", student).update();
            inserted.countDown();
            await(release);
        }));
        if (!inserted.await(10, TimeUnit.SECONDS)) {
            manager.join();
        }
        CompletableFuture<Void> billing = CompletableFuture.runAsync(() -> tx.executeWithoutResult(s -> {
            events.publishEvent(new UtilityTerminationDue(allocation, student, r.termId, 500000, 3));
        }));
        Thread.sleep(500); // Billing waits on the open termination's unique index
        release.countDown();
        manager.get(10, TimeUnit.SECONDS);
        billing.get(10, TimeUnit.SECONDS); // threw ALREADY_TERMINATED before the fix
        assertThat(r.count("SELECT count(*) FROM asg_termination WHERE allocation_id = ?", allocation)).isEqualTo(1);
    }

    /** TC-ASG-301: BE-ASG-11: a Balance cancelled by rejected claims forfeits the Allocation even while it is locked. */
    @Test
    void forfeitWaitsForLockedAllocation() throws Exception {
        long allocation = r.livesIn(42, "A-108", "A", false);
        long student = r.userId(RegressionSupport.student(42));
        CountDownLatch locked = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        CompletableFuture<Void> desk = CompletableFuture.runAsync(() -> tx.executeWithoutResult(s -> {
            jdbc.sql("SELECT id FROM asg_allocation WHERE id = :a FOR UPDATE").param("a", allocation)
                    .query(Long.class).single();
            locked.countDown();
            await(release);
        }));
        assertThat(locked.await(10, TimeUnit.SECONDS)).isTrue();
        CompletableFuture<Void> billing = CompletableFuture.runAsync(() -> tx.executeWithoutResult(s -> events.publishEvent(
                new PaymentClaimRejected(-1, "INV-NONE", student, null, allocation, "BALANCE", "Balance", 1000000,
                        "No transfer found", java.time.Instant.now(), 3, true))));
        Thread.sleep(500);
        release.countDown();
        desk.get(10, TimeUnit.SECONDS);
        billing.get(10, TimeUnit.SECONDS);
        assertThat(jdbc.sql("SELECT status FROM asg_allocation WHERE id = :a").param("a", allocation)
                .query(String.class).single()).isEqualTo("CANCELLED");
    }

    /** TC-MNT-300: BE-OPS-10: the Admin (no PROCESS_MAINTENANCE) cannot read the maintenance queue or a request. */
    @Test
    void adminCannotReadMaintenanceQueue() throws Exception {
        r.livesIn(43, "A-107", "A", true);
        String id = r.report(43, "Normal");
        String admin = r.bearer(vn.fpt.campusstay.TestAuth.ADMIN);
        r.getAs("/maintenance-requests", admin).andExpect(status().isForbidden());
        r.getAs("/maintenance-requests/" + id, admin).andExpect(status().isForbidden());
        r.getAs("/maintenance-requests/" + id, r.bearer(vn.fpt.campusstay.TestAuth.STAFF_A)).andExpect(status().isOk());
    }

    /** TC-REQ-300: BE-OPS-10: the Admin (no DECIDE_ROOM_CHANGES) cannot read the room-change and swap queues. */
    @Test
    void adminCannotReadRoomChangeAndSwapQueues() throws Exception {
        String admin = r.bearer(vn.fpt.campusstay.TestAuth.ADMIN);
        r.getAs("/room-changes", admin).andExpect(status().isForbidden());
        r.getAs("/room-changes/RC-1/matching-beds", admin).andExpect(status().isForbidden());
        r.getAs("/swaps", admin).andExpect(status().isForbidden());
    }

    /** TC-AUTH-301: BE-AUTH-06: a locked account answers a wrong password like any other (no ACCOUNT_LOCKED). */
    @Test
    void lockedAccountRevealsNothingToWrongPassword() throws Exception {
        String email = RegressionSupport.student(44);
        String wrong = "{\"email\":\"" + email + "\",\"password\":\"Wrong12345\"}";
        for (int i = 0; i < 5; i++) {
            signIn(wrong).andExpect(status().isUnauthorized());
        }
        signIn(wrong).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
        signIn("{\"email\":\"" + email + "\",\"password\":\"" + vn.fpt.campusstay.TestAuth.PASSWORD
                + "\"}").andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("ACCOUNT_LOCKED"));
    }

    /** TC-NTF-301: BE-PLT-20: a device token moves to another account only after its owner let it go. */
    @Test
    void deviceTokenIsReboundOnlyAfterOwnerLetsGo() throws Exception {
        String owner = r.bearer(RegressionSupport.student(45));
        String other = r.bearer(RegressionSupport.student(46));
        String body = "{\"token\":\"fcm-token-300\",\"platform\":\"android\"}";
        r.postJson("/devices", owner, body).andExpect(status().isNoContent());
        r.postJson("/devices", owner, body).andExpect(status().isNoContent());
        r.postJson("/devices", other, body).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("DEVICE_IN_USE"));
        r.postJson("/auth/sign-out", owner, "{}").andExpect(status().isNoContent());
        r.postJson("/devices", other, body).andExpect(status().isNoContent());
        assertThat(r.count("SELECT count(*) FROM ntf_device WHERE token = 'fcm-token-300' AND user_id = ?",
                r.userId(RegressionSupport.student(46)))).isEqualTo(1);
    }

    private org.springframework.test.web.servlet.ResultActions signIn(String body) throws Exception {
        return mvc.perform(post("/auth/sign-in").contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .content(body));
    }

    private static void await(CountDownLatch latch) {
        try {
            latch.await(10, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}

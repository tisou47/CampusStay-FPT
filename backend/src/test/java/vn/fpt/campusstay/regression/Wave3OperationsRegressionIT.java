package vn.fpt.campusstay.regression;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import javax.sql.DataSource;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import vn.fpt.campusstay.PostgresTestcontainer;
import vn.fpt.campusstay.TestAuth;
import vn.fpt.campusstay.service.maintenance.InspectionScheduleService;
import vn.fpt.campusstay.service.maintenance.MaintenanceService;

/** Wave 3 business findings on locks and states: BE-3RD-14, BE-3RD-12, BE-OPS-14, BE-OPS-15. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class Wave3OperationsRegressionIT {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    DataSource dataSource;

    @Autowired
    InspectionScheduleService schedules;

    @Autowired
    MaintenanceService maintenance;

    RegressionSupport r;

    @BeforeEach
    void setUp() {
        r = new RegressionSupport(mvc, jdbc);
    }

    private static String at(Duration fromNow) {
        return Instant.now().plus(fromNow).truncatedTo(ChronoUnit.SECONDS).toString();
    }

    private String schedule(String name, String repeat, String scope) throws Exception {
        String body = """
                {"block":"A","name":"%s","checklistId":"CL-ROOM","scope":"%s","repeat":"%s",
                 "assignee":"%d","dueWithinDays":3,"createRequests":false,"notifyResidents":false}"""
                .formatted(name, scope, repeat, r.userId("staff.a2@campusstay.test"));
        return JsonPath.read(RegressionSupport.body(r.postJson("/inspection-schedules", r.manager(), body)
                .andExpect(status().isOk())), "$.id");
    }

    private long scheduleId(String name) {
        return r.count("SELECT id FROM mnt_inspection_schedule WHERE name = ?", name);
    }

    /**
     * TC-VIS-400 (BE-3RD-14): a registration that arrives while a Manager is cancelling the Family Day waits for the
     * cancellation and is refused, instead of surviving on a cancelled day.
     */
    @Test
    void registrationWaitsForTheCancellation() throws Exception {
        r.livesIn(1, "A-101", "A", true);
        String manager = r.manager();
        String draft = """
                {"block":"A","title":"Lock test","area":"Lobby","maxGuests":4,
                 "registrationOpensAt":"%s","registrationClosesAt":"%s",
                 "slots":[{"startsAt":"%s","endsAt":"%s","capacity":10}]}
                """.formatted(at(Duration.ofHours(-1)), at(Duration.ofHours(1)), at(Duration.ofHours(2)),
                at(Duration.ofHours(4)));
        String id = JsonPath.read(RegressionSupport.body(r.postJson("/family-days", manager, draft)
                .andExpect(status().isCreated())), "$.id");
        r.postJson("/family-days/" + id + "/publish", manager, "{}").andExpect(status().isOk());
        String slot = JsonPath.read(RegressionSupport.body(r.getAs("/family-days/" + id, manager)), "$.slots[0].id");
        String student = r.bearer(RegressionSupport.student(1));
        ExecutorService pool = Executors.newSingleThreadExecutor();
        try (Connection lock = dataSource.getConnection()) {
            lock.setAutoCommit(false);
            try (PreparedStatement ps = lock.prepareStatement("SELECT id FROM vis_family_day WHERE id = ? FOR UPDATE")) {
                ps.setLong(1, Long.parseLong(id));
                ps.executeQuery();
            }
            Future<Integer> call = pool.submit(() -> r.postJson("/students/me/family-days/" + id + "/registration",
                    student, "{\"slotId\":\"%s\",\"guests\":[{\"fullName\":\"Tran Van Mot\",\"relationship\":\"Parent\",\"birthYear\":1975}]}"
                            .formatted(slot)).andReturn().getResponse().getStatus());
            long deadline = System.currentTimeMillis() + 10_000;
            while (System.currentTimeMillis() < deadline && !call.isDone() && jdbc.sql("""
                    SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE '%vis_family_day%'
                    """).query(Long.class).single() < 1) {
                Thread.sleep(100);
            }
            try (PreparedStatement ps = lock.prepareStatement("UPDATE vis_family_day SET status = 'CANCELLED' WHERE id = ?")) {
                ps.setLong(1, Long.parseLong(id));
                ps.executeUpdate();
            }
            lock.commit();
            assertThat(call.get(30, TimeUnit.SECONDS)).as("registration during the cancellation").isEqualTo(409);
        } finally {
            pool.shutdownNow();
        }
        assertThat(r.count("SELECT count(*) FROM vis_registration WHERE family_day_id = ? AND status = 'APPROVED'",
                Long.parseLong(id))).isZero();
    }

    /** TC-MNT-400 (BE-3RD-12): a one-off schedule is Completed after its run. */
    @Test
    void oneOffScheduleCompletes() throws Exception {
        schedule("Once check", "ONCE", "FLOOR_2");
        assertThat(jdbc.sql("SELECT status FROM mnt_inspection_schedule WHERE name = 'Once check'")
                .query(String.class).single()).isEqualTo("COMPLETED");
    }

    /** TC-MNT-401 (BE-3RD-12): a Completed schedule set back to Active is due again. */
    @Test
    void reactivatedScheduleRunsAgain() throws Exception {
        String id = schedule("Weekly reactivated", "WEEKLY", "FLOOR_3");
        String manager = r.manager();
        for (String s : new String[] { "Completed", "Active" }) {
            mvc.perform(put("/inspection-schedules/" + id).header(HttpHeaders.AUTHORIZATION, manager)
                    .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"" + s + "\"}"))
                    .andExpect(status().is2xxSuccessful());
        }
        assertThat(r.count("SELECT count(*) FROM mnt_inspection_schedule WHERE id = ? AND status = 'ACTIVE' AND next_run_at <= now()",
                scheduleId("Weekly reactivated"))).isEqualTo(1);
    }

    /** TC-MNT-402 (BE-3RD-12): a schedule does not open a new run while its previous run is not submitted. */
    @Test
    void runsDoNotOverlap() throws Exception {
        schedule("Weekly overlap", "WEEKLY", "FLOOR_4");
        long id = scheduleId("Weekly overlap");
        jdbc.sql("UPDATE mnt_inspection_schedule SET next_run_at = now() - interval '1 minute' WHERE id = :id")
                .param("id", id).update();
        schedules.startDue();
        assertThat(r.count("SELECT count(*) FROM mnt_inspection_run WHERE schedule_id = ?", id)).isEqualTo(1);
    }

    /** TC-MNT-403 (BE-OPS-14): a public update on a Closed request is refused; an internal note is still allowed. */
    @Test
    void closedRequestTakesOnlyInternalNotes() throws Exception {
        r.livesIn(2, "A-102", "A", true);
        String code = r.report(2, "Normal");
        // Staff work only the requests assigned to them (feat/manager-ui-1).
        jdbc.sql("UPDATE mnt_request SET status = 'CLOSED', resolved_at = now(), closed_at = now(), assignee_id = (SELECT id FROM auth_user WHERE email = 'staff.a1@campusstay.test') WHERE code = :c")
                .param("c", code).update();
        String staff = r.bearer(TestAuth.STAFF_A);
        var res = r.postJson("/maintenance-requests/" + code + "/updates", staff,
                "{\"message\":\"We will come back\",\"internal\":false}").andReturn().getResponse();
        assertThat(res.getStatus()).isEqualTo(409);
        assertThat(res.getContentAsString()).contains("REQUEST_CLOSED");
        r.postJson("/maintenance-requests/" + code + "/updates", staff, "{\"message\":\"Checked\",\"internal\":true}")
                .andExpect(status().is2xxSuccessful());
    }

    /** TC-MNT-404 (BE-OPS-15): a request Resolved longer than maintenance.auto_close_days ago closes by itself. */
    @Test
    void resolvedRequestClosesAutomatically() throws Exception {
        r.livesIn(3, "A-103", "A", true);
        String code = r.report(3, "Normal");
        jdbc.sql("UPDATE mnt_request SET status = 'RESOLVED', resolved_at = now() - interval '30 days', assignee_id = (SELECT id FROM auth_user WHERE email = 'staff.a1@campusstay.test') WHERE code = :c")
                .param("c", code).update();
        assertThat(maintenance.closeResolved()).isGreaterThanOrEqualTo(1);
        assertThat(jdbc.sql("SELECT status FROM mnt_request WHERE code = :c").param("c", code).query(String.class)
                .single()).isEqualTo("CLOSED");
        assertThat(r.count("""
                SELECT count(*) FROM mnt_request_event e JOIN mnt_request m ON m.id = e.request_id
                WHERE m.code = ? AND e.text = 'Closed automatically'
                """, code)).isEqualTo(1);
    }
}

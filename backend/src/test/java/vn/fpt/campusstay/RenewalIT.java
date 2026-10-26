package vn.fpt.campusstay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.MANAGER_A;
import static vn.fpt.campusstay.TestAuth.STAFF_A;
import static vn.fpt.campusstay.TestAuth.bearer;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import vn.fpt.campusstay.service.assignment.DoorCodeRelease;
import vn.fpt.campusstay.service.assignment.RenewalService;

/**
 * The Term transition (spec §5.1, §6.10): the requests window opens with a next-Term Allocation for every resident
 * (continuing, or awaiting extension in the Stay's last Term), M3 releases the Beds not extended, a Manager issues
 * the next-Term fees once the requests are decided and the enrolled list reconciled (one fee per continuing resident,
 * never twice), M7 releases the Beds whose fee is unpaid, and the turnover hands the next Term's door codes to the paid
 * residents (TC-ASG-038…042).
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class RenewalIT {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    RenewalService renewals;

    @Autowired
    DoorCodeRelease release;

    ApplyFlow flow;
    StayFlow stay;
    RenewalFlow renewal;
    long next;

    @BeforeEach
    void setUp() {
        flow = new ApplyFlow(mvc, jdbc);
        stay = new StayFlow(mvc, jdbc, flow, flow.openTerm());
        renewal = new RenewalFlow(jdbc, stay);
        next = renewal.openNextTerm();
        renewal.reset();
    }

    private ResultActions postJson(String path, String auth, String body) throws Exception {
        return mvc.perform(post(path).header(HttpHeaders.AUTHORIZATION, auth).contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private ResultActions getAs(String path, String auth) throws Exception {
        return mvc.perform(get(path).header(HttpHeaders.AUTHORIZATION, auth));
    }

    private ResultActions reconcile(String auth, byte[] csv) throws Exception {
        return mvc.perform(multipart("/reconciliations").file(new MockMultipartFile("file", "enrolled.csv", "text/csv",
                csv)).param("termId", String.valueOf(next)).param("kind", "enrolled")
                .header(HttpHeaders.AUTHORIZATION, auth));
    }

    /**
     * TC-ASG-038: M2 opens the requests window once: a resident with Terms left keeps the Bed as continuing, one in the
     * Stay's last Term as awaiting extension; a student not living in the Room yet and a terminated resident get none.
     * My Room shows the next Term with its price, the students are told, Staff and Managers read the overview, and the
     * new students' assignment of the next Term waits for the request deadline.
     */
    @Test
    void windowOpens() throws Exception {
        renewal.resident(1, "A-105", "A", 2);
        renewal.resident(2, "A-105", "B", 1);
        stay.livesIn(3, "A-105", "C", false);
        renewal.resident(4, "A-106", "A", 3);
        String manager = bearer(mvc, MANAGER_A);
        postJson("/terminations", manager, "{\"studentCode\":\"SE190004\",\"reason\":\"Manager decision\","
                + "\"note\":\"Repeated noise.\"}").andExpect(status().isOk());

        assertThat(renewals.openDue()).isEqualTo(2);
        assertThat(renewals.openDue()).isZero();

        String first = bearer(mvc, StayFlow.student(1));
        getAs("/students/me/allocation", first)
                .andExpect(jsonPath("$.allocation.room").value("A-105"))
                .andExpect(jsonPath("$.stay.committedTerms").value(2))
                .andExpect(jsonPath("$.stay.termsLeft").value(1))
                .andExpect(jsonPath("$.nextTerm.term.name").value(RenewalFlow.NEXT_NAME))
                .andExpect(jsonPath("$.nextTerm.state").value("Continuing"))
                .andExpect(jsonPath("$.nextTerm.room").value("A-105"))
                .andExpect(jsonPath("$.nextTerm.bed").value("A"))
                .andExpect(jsonPath("$.nextTerm.termPrice").value(renewal.nextPrice("4-bed", "Basic")))
                .andExpect(jsonPath("$.nextTerm.window.filing").value(true));
        getAs("/notifications", first).andExpect(jsonPath("$.items[*].title",
                hasItem("You stay in Room A-105 in " + RenewalFlow.NEXT_NAME)));
        String second = bearer(mvc, StayFlow.student(2));
        getAs("/students/me/allocation", second).andExpect(jsonPath("$.nextTerm.state").value("Awaiting extension"));
        mvc.perform(get("/notifications").header(HttpHeaders.AUTHORIZATION, second).header("Accept-Language", "vi"))
                .andExpect(jsonPath("$.items[*].title", hasItem("Đây là kỳ cuối trong hợp đồng ở của bạn")));
        getAs("/students/me/allocation", bearer(mvc, StayFlow.student(3))).andExpect(jsonPath("$.nextTerm").isEmpty());
        assertThat(jdbc.sql("""
                SELECT count(*) FROM asg_allocation a JOIN auth_user u ON u.id = a.student_id
                WHERE a.term_id = :t AND u.email IN (:e) AND a.status = 'ACTIVE'
                """).param("t", next).param("e", java.util.List.of(StayFlow.student(3), StayFlow.student(4)))
                .query(Long.class).single()).isZero();

        getAs("/renewals/overview?termId=" + next, bearer(mvc, STAFF_A))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.opened").value(true))
                .andExpect(jsonPath("$.filing").value(true))
                .andExpect(jsonPath("$.counts.continuing").value(1))
                .andExpect(jsonPath("$.counts.awaitingExtension").value(1))
                .andExpect(jsonPath("$.milestones[0].key").value("requestsOpenAt"));
        getAs("/renewals", bearer(mvc, STAFF_A))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.termName == '%s')].opened".formatted(RenewalFlow.NEXT_NAME), hasItem(true)));
        // The room map: a resident without a Bed next Term is leaving; the next Term shows the continuing Beds.
        getAs("/inventory/rooms?termId=" + stay.termId() + "&block=A&floor=1", manager)
                .andExpect(jsonPath("$.rooms[*].beds[?(@.id == 'A-105-A')].state", hasItem("resident")))
                .andExpect(jsonPath("$.rooms[*].beds[?(@.id == 'A-106-A')].state", hasItem("leaving")));
        getAs("/inventory/rooms?termId=" + next + "&block=A&floor=1", manager)
                .andExpect(jsonPath("$.rooms[*].beds[?(@.id == 'A-105-A')].state", hasItem("next_term")))
                .andExpect(jsonPath("$.rooms[*].beds[?(@.id == 'A-106-A')].state", hasItem("available")));
        getAs("/renewals/overview?termId=" + next, first).andExpect(status().isForbidden());
        postJson("/assignment-runs", manager, "{\"termId\":\"%d\"}".formatted(next))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("RENEWAL_FILING"));
    }

    /**
     * TC-ASG-039: M3 closes filing: a Bed still awaiting extension is released (the student is told in-app and by
     * email, with the day to check out), a continuing one stays; the overview counts the ending.
     */
    @Test
    void notExtendedAtTheDeadline() throws Exception {
        renewal.resident(5, "A-107", "A", 2);
        renewal.resident(6, "A-107", "B", 1);
        renewals.openDue();
        renewal.milestone("requests_close_at", "-1 minute");

        assertThat(renewals.closeDue()).isEqualTo(1);
        assertThat(renewals.closeDue()).isZero();

        String sixth = bearer(mvc, StayFlow.student(6));
        getAs("/students/me/allocation", sixth)
                .andExpect(jsonPath("$.nextTerm.state").value("Not continuing"))
                .andExpect(jsonPath("$.nextTerm.endReason").value("Not extended"))
                .andExpect(jsonPath("$.nextTerm.checkOutBy").value("2031-04-28"));
        getAs("/notifications", sixth).andExpect(jsonPath("$.items[*].title",
                hasItem("No Bed for " + RenewalFlow.NEXT_NAME)));
        assertThat(jdbc.sql("SELECT count(*) FROM ntf_email_outbox WHERE to_email = :e AND subject LIKE '%released%'")
                .param("e", StayFlow.student(6)).query(Long.class).single()).isEqualTo(1);
        getAs("/students/me/allocation", bearer(mvc, StayFlow.student(5)))
                .andExpect(jsonPath("$.nextTerm.state").value("Continuing"));
        getAs("/renewals/overview?termId=" + next, bearer(mvc, MANAGER_A))
                .andExpect(jsonPath("$.filing").value(false))
                .andExpect(jsonPath("$.counts.ending['Not extended']").isNumber());
    }

    /**
     * TC-ASG-040: Issue next-Term fees: the preview names what blocks them (filing still open, no reconciliation);
     * once filing closed and the enrolled list is reconciled a Manager issues one fee per continuing resident = 100 %
     * of the next Term's price of the Bed (no Deposit); issuing again charges nobody twice; leavers receive the
     * end-of-stay notice; Staff may not issue; the fee cannot be claimed while Utility is overdue; paid, the Stay
     * counts the next Term.
     */
    @Test
    void nextTermFees() throws Exception {
        renewal.resident(7, "A-108", "A", 2);
        renewal.resident(8, "A-108", "B", 1);
        renewals.openDue();
        String manager = bearer(mvc, MANAGER_A);
        getAs("/next-term-fees?termId=" + next, manager)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.count").value(1))
                .andExpect(jsonPath("$.total").value(renewal.nextPrice("4-bed", "Basic")))
                .andExpect(jsonPath("$.blockers[*].code", hasItem("FILING_OPEN")))
                .andExpect(jsonPath("$.blockers[*].code", hasItem("NOT_RECONCILED")));
        postJson("/next-term-fees/issue", manager, "{\"termId\":\"%d\"}".formatted(next))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("FEES_BLOCKED"));
        getAs("/next-term-fees?termId=" + next, bearer(mvc, STAFF_A)).andExpect(status().isForbidden());

        renewal.milestone("requests_close_at", "-1 minute");
        renewals.closeDue();
        reconcile(manager, RenewalFlow.enrolled("SE190007", "SE190008")).andExpect(status().isOk());
        getAs("/next-term-fees?termId=" + next, manager).andExpect(jsonPath("$.blockers").isEmpty());
        postJson("/next-term-fees/issue", manager, "{\"termId\":\"%d\"}".formatted(next))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.issued").value(1))
                .andExpect(jsonPath("$.total").value(renewal.nextPrice("4-bed", "Basic")));
        postJson("/next-term-fees/issue", manager, "{\"termId\":\"%d\"}".formatted(next))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.issued").value(0));
        assertThat(jdbc.sql("""
                SELECT count(*) FROM bil_invoice WHERE type = 'TERM_FEE' AND status <> 'VOID' AND student_id IN (:s)
                """).param("s", java.util.List.of(stay.userId(StayFlow.student(7)), stay.userId(StayFlow.student(8))))
                .query(Long.class).single()).isEqualTo(1);
        getAs("/next-term-fees?termId=" + next, manager).andExpect(jsonPath("$.issued.count").value(1));

        String seventh = bearer(mvc, StayFlow.student(7));
        String fee = renewal.feeOf(7);
        getAs("/students/me/allocation", seventh)
                .andExpect(jsonPath("$.nextTerm.fee.invoiceId").value(fee))
                .andExpect(jsonPath("$.nextTerm.fee.amount").value(renewal.nextPrice("4-bed", "Basic")))
                .andExpect(jsonPath("$.nextTerm.fee.status").value("Unpaid"));
        // Payments of the Term the student lives in list the next-Term fee too.
        getAs("/students/me/invoices?termId=" + stay.termId(), seventh)
                .andExpect(jsonPath("$.items[?(@.type == 'termFee')].id", hasItem(fee)));
        getAs("/notifications", bearer(mvc, StayFlow.student(8))).andExpect(jsonPath("$.items[*].title",
                hasItem("Your stay ends after " + ApplyFlow.TERM_NAME)));

        renewal.overdueUtility(7, 250_000);
        flow.claim(seventh, fee).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("UTILITY_OVERDUE"));
        jdbc.sql("UPDATE bil_invoice SET status = 'VOID' WHERE code LIKE 'INV-TU-%'").update();
        flow.pay(seventh, fee);
        getAs("/students/me/allocation", seventh)
                .andExpect(jsonPath("$.nextTerm.fee.status").value("Paid"))
                .andExpect(jsonPath("$.stay.termsUsed").value(2));
    }

    /**
     * TC-ASG-041: M7: a next-Term fee unpaid at its deadline with no claim waiting is void and its Bed released
     * (nothing kept); a fee whose claim waits for a Manager keeps the Bed.
     */
    @Test
    void unpaidFeesReleaseTheBed() throws Exception {
        renewal.resident(9, "A-109", "A", 2);
        renewal.resident(10, "A-109", "B", 2);
        renewals.openDue();
        renewal.milestone("requests_close_at", "-1 minute");
        renewals.closeDue();
        String manager = bearer(mvc, MANAGER_A);
        reconcile(manager, RenewalFlow.enrolled("SE190009", "SE190010")).andExpect(status().isOk());
        postJson("/next-term-fees/issue", manager, "{\"termId\":\"%d\"}".formatted(next)).andExpect(status().isOk());
        flow.claim(bearer(mvc, StayFlow.student(10)), renewal.feeOf(10)).andExpect(status().isOk());
        String unpaid = renewal.feeOf(9);
        jdbc.sql("UPDATE bil_invoice SET due_at = now() - interval '1 minute' WHERE type = 'TERM_FEE' AND student_id IN (:s)")
                .param("s", java.util.List.of(stay.userId(StayFlow.student(9)), stay.userId(StayFlow.student(10))))
                .update();

        assertThat(renewals.cancelUnpaidFees()).isEqualTo(1);
        assertThat(jdbc.sql("SELECT status FROM bil_invoice WHERE code = :c").param("c", unpaid).query(String.class)
                .single()).isEqualTo("VOID");
        getAs("/students/me/allocation", bearer(mvc, StayFlow.student(9)))
                .andExpect(jsonPath("$.nextTerm.state").value("Not continuing"))
                .andExpect(jsonPath("$.nextTerm.endReason").value("Next-Term fee not paid"));
        getAs("/students/me/allocation", bearer(mvc, StayFlow.student(10)))
                .andExpect(jsonPath("$.nextTerm.state").value("Continuing"));
        assertThat(jdbc.sql("""
                SELECT count(*) FROM bil_refund r JOIN auth_user u ON u.id = r.student_id WHERE u.email = :e
                """).param("e", StayFlow.student(9)).query(Long.class).single()).isZero();
    }

    /**
     * TC-ASG-042: the turnover: from the next Term's check-in start a paid continuing resident receives the Room's code
     * and lives in the next Term (the current Term's Allocation ends); a mover's old Room needs a new code; the
     * turnover list shows leavers, movers and the Rooms whose residents change, and Staff record their meter readings.
     */
    @Test
    void turnover() throws Exception {
        renewal.resident(11, "A-110", "A", 2);
        renewal.resident(12, "A-110", "B", 2);
        renewal.resident(13, "A-110", "C", 1);
        renewals.openDue();
        String manager = bearer(mvc, MANAGER_A);
        String staff = bearer(mvc, STAFF_A);
        // Student 12 moves to A-210 for the next Term (a Manager's move of the next-Term Bed).
        String moved = renewal.allocationOf(12, next);
        postJson("/operational-moves", manager, "{\"allocationId\":\"%s\",\"bedId\":\"A-210-A\",\"reason\":\"Safety\"}"
                .formatted(moved)).andExpect(status().isOk());
        renewal.milestone("requests_close_at", "-1 minute");
        renewals.closeDue();
        reconcile(manager, RenewalFlow.enrolled("SE190011", "SE190012", "SE190013")).andExpect(status().isOk());
        postJson("/next-term-fees/issue", manager, "{\"termId\":\"%d\"}".formatted(next))
                .andExpect(jsonPath("$.issued").value(2));
        flow.pay(bearer(mvc, StayFlow.student(11)), renewal.feeOf(11));
        flow.pay(bearer(mvc, StayFlow.student(12)), renewal.feeOf(12));
        for (String room : new String[] { "A-110", "A-210" }) {
            postJson("/door-codes/" + room, staff, "{\"code\":\"135792\"}").andExpect(status().isOk());
            mvc.perform(post("/door-codes/" + room + "/confirm").header(HttpHeaders.AUTHORIZATION, staff))
                    .andExpect(status().isNoContent());
        }
        assertThat(release.releaseDue()).isZero();

        jdbc.sql("UPDATE cfg_term SET check_in_start = CURRENT_DATE WHERE code = :c")
                .param("c", RenewalFlow.NEXT_CODE).update();
        assertThat(release.releaseDue()).isEqualTo(2);
        assertThat(jdbc.sql("""
                SELECT a.end_reason FROM asg_allocation a JOIN auth_user u ON u.id = a.student_id
                WHERE u.email = :e AND a.term_id = :t
                """).param("e", StayFlow.student(11)).param("t", stay.termId()).query(String.class).single())
                .isEqualTo("TERM_END");
        getAs("/students/me/allocation", bearer(mvc, StayFlow.student(12)))
                .andExpect(jsonPath("$.term.name").value(RenewalFlow.NEXT_NAME))
                .andExpect(jsonPath("$.allocation.room").value("A-210"))
                .andExpect(jsonPath("$.allocation.status").value("Resident"));
        assertThat(jdbc.sql("""
                SELECT count(*) FROM inv_door_code_task t JOIN inv_room r ON r.id = t.room_id
                WHERE r.code = 'A-110' AND t.done_at IS NULL
                """).query(Long.class).single()).isEqualTo(1);

        getAs("/turnover?termId=" + next, staff)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.counts.leavers").value(1))
                .andExpect(jsonPath("$.leavers[0].student.studentCode").value("SE190013"))
                .andExpect(jsonPath("$.leavers[0].status").value("To check out"))
                .andExpect(jsonPath("$.movers[0].student.studentCode").value("SE190012"))
                .andExpect(jsonPath("$.movers[0].to").value("A-210-A"))
                .andExpect(jsonPath("$.movers[0].moved").value(true))
                .andExpect(jsonPath("$.rooms[*].room", hasItem("A-110")))
                .andExpect(jsonPath("$.rooms[*].room", not(hasItem("A-101"))));
        postJson("/turnover/meter-cuts", staff, "{\"room\":\"A-110\",\"electricity\":1250.5,\"water\":80}")
                .andExpect(status().isNoContent());
        postJson("/turnover/meter-cuts", staff, "{\"room\":\"A-110\",\"electricity\":1200,\"water\":80}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.electricity").isString());
        getAs("/turnover?termId=" + next, staff).andExpect(jsonPath("$.rooms[?(@.room == 'A-110')].lastMeterCut")
                .isNotEmpty());
        postJson("/turnover/meter-cuts", bearer(mvc, TestAuth.STAFF_B2), "{\"room\":\"A-110\",\"electricity\":1300,"
                + "\"water\":81}").andExpect(status().isBadRequest());
    }
}

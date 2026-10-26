package vn.fpt.campusstay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.MANAGER_A;
import static vn.fpt.campusstay.TestAuth.bearer;

import java.time.LocalDate;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.service.billing.UtilityDebtService;

/**
 * Utility debt (spec §6.14, D-27): warning 1 for an overdue Utility Invoice, the final warning with its termination
 * day, warnings closed by paying everything, and the termination when two months are overdue or the debt reaches the
 * Utility Deposit held (TC-BIL-037, 038).
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class UtilityDebtIT {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    UtilityDebtService debts;

    ApplyFlow flow;
    StayFlow stay;

    @BeforeEach
    void setUp() {
        flow = new ApplyFlow(mvc, jdbc);
        stay = new StayFlow(mvc, jdbc, flow, flow.openTerm());
    }

    private ResultActions getAs(String path, String auth) throws Exception {
        return mvc.perform(get(path).header(HttpHeaders.AUTHORIZATION, auth));
    }

    /** A resident of A-110 whose paid Balance holds a Utility Deposit of 600,000 VND. */
    private String resident(int n, String bed) throws Exception {
        stay.livesIn(n, "A-110", bed, true);
        invoice(n, "B", "BALANCE", "Balance", 8_000_000, 600_000, "PAID", "-1 day");
        return bearer(mvc, StayFlow.student(n));
    }

    private String invoice(int n, String suffix, String type, String title, long amount, long utilityDeposit,
            String status, String dueIn) {
        String code = "INV-TT31-" + suffix + n;
        jdbc.sql("""
                INSERT INTO bil_invoice (code, term_id, student_id, allocation_id, building_id, type, title, amount,
                                         utility_deposit, status, transfer_content, due_at, paid_at, payment_method,
                                         student_name, student_code, gender)
                SELECT :code, a.term_id, a.student_id, a.id, r.building_id, :type, :title, :amount, :deposit, :status,
                       'CSTAY' || :suffix || :n, now() + CAST(:due AS interval),
                       CASE WHEN :status = 'PAID' THEN now() END, CASE WHEN :status = 'PAID' THEN 'TRANSFER' END,
                       u.display_name, s.student_code, s.gender
                FROM asg_allocation a JOIN auth_user u ON u.id = a.student_id JOIN auth_student s ON s.user_id = u.id
                JOIN inv_bed b ON b.id = a.bed_id JOIN inv_room r ON r.id = b.room_id
                WHERE u.email = :email AND a.status = 'ACTIVE'
                """).param("code", code).param("type", type).param("title", title).param("amount", amount)
                .param("deposit", utilityDeposit).param("status", status).param("suffix", suffix).param("n", n)
                .param("due", dueIn).param("email", StayFlow.student(n)).update();
        return code;
    }

    private long notifications(int n, String key) {
        return jdbc.sql("""
                SELECT count(*) FROM ntf_notification x JOIN auth_user u ON u.id = x.user_id
                WHERE u.email = :e AND x.event_key = :k
                """).param("e", StayFlow.student(n)).param("k", key).query(Long.class).single();
    }

    /**
     * TC-BIL-037: an overdue Utility Invoice gives warning 1 (in-app and email), once; a second overdue month gives
     * the final warning with the termination day (today + 3); paying everything closes both.
     */
    @Test
    void warningsThenPaidInFull() throws Exception {
        String auth = resident(20, "A");
        String first = invoice(20, "U", "UTILITY", "Utility · 10/2031", 320_000, 0, "OVERDUE", "-2 days");
        debts.evaluateAll();
        debts.evaluateAll();
        assertThat(notifications(20, "UTILITY_WARNING")).isEqualTo(1);
        getAs("/students/me/invoices", auth)
                .andExpect(jsonPath("$.summary.warning.level").value("Warning"))
                .andExpect(jsonPath("$.summary.warning.debt").value(320_000));
        assertThat(jdbc.sql("SELECT count(*) FROM ntf_email_outbox WHERE to_email = :e").param("e", StayFlow.student(20))
                .query(Long.class).single()).isEqualTo(1);

        String second = invoice(20, "V", "UTILITY", "Utility · 11/2031", 280_000, 0, "OVERDUE", "-1 day");
        debts.evaluateAll();
        assertThat(notifications(20, "UTILITY_FINAL_WARNING")).isEqualTo(1);
        getAs("/students/me/invoices", auth)
                .andExpect(jsonPath("$.summary.warning.level").value("Final warning"))
                .andExpect(jsonPath("$.summary.warning.debt").value(600_000))
                .andExpect(jsonPath("$.summary.warning.terminateOn")
                        .value(LocalDate.now(TimeConfig.CAMPUS_ZONE).plusDays(3).toString()));
        getAs("/notifications", auth).andExpect(jsonPath("$.items[*].title", hasItem("Final warning: Utility debt")));

        flow.pay(auth, first);
        getAs("/students/me/invoices", auth).andExpect(jsonPath("$.summary.warning.level").value("Final warning"));
        flow.pay(auth, second);
        getAs("/students/me/invoices", auth).andExpect(jsonPath("$.summary.warning").value((Object) null));
        assertThat(jdbc.sql("""
                SELECT count(*) FROM bil_utility_warning w JOIN auth_user u ON u.id = w.student_id
                WHERE u.email = :e AND w.closed_reason = 'PAID'
                """).param("e", StayFlow.student(20)).query(Long.class).single()).isEqualTo(2);
    }

    /**
     * TC-BIL-038 (business rule): from the termination day, two overdue months terminate the stay (notice to the
     * student, the Managers' list); a debt reaching the Utility Deposit does too, even in its first month; with that
     * rule off one month does not, and nothing happens before the termination day.
     */
    @Test
    void debtTerminatesTheStay() throws Exception {
        String auth = resident(21, "B");
        invoice(21, "U", "UTILITY", "Utility · 10/2031", 200_000, 0, "OVERDUE", "-40 days");
        invoice(21, "V", "UTILITY", "Utility · 11/2031", 200_000, 0, "OVERDUE", "-10 days");
        assertThat(debts.evaluateAll()).isZero();
        assertThat(debts.evaluateAll()).isZero();
        jdbc.sql("""
                UPDATE bil_utility_warning SET terminate_on = current_date
                WHERE student_id = (SELECT id FROM auth_user WHERE email = :e) AND level = 'FINAL'
                """).param("e", StayFlow.student(21)).update();
        assertThat(debts.evaluateAll()).isEqualTo(1);
        assertThat(debts.evaluateAll()).isZero();
        getAs("/terminations?status=Notice sent", bearer(mvc, MANAGER_A))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[*].studentCode", hasItem("SE190021")))
                .andExpect(jsonPath("$.items[?(@.studentCode == 'SE190021')].reason", hasItem("Utility debt")))
                .andExpect(jsonPath("$.items[?(@.studentCode == 'SE190021')].debt", hasItem(400_000)));
        getAs("/notifications", auth).andExpect(jsonPath("$.items[*].title", hasItem("Your stay is terminated · Room A-110")));

        // One month whose debt reaches the 600,000 VND Utility Deposit held.
        resident(22, "C");
        invoice(22, "U", "UTILITY", "Utility · 10/2031", 650_000, 0, "OVERDUE", "-5 days");
        debts.evaluateAll();
        assertThat(notifications(22, "UTILITY_FINAL_WARNING")).isEqualTo(1);
        jdbc.sql("UPDATE cfg_parameter SET value = 'false' WHERE key = 'termination.debt_reaches_deposit'").update();
        jdbc.sql("""
                UPDATE bil_utility_warning SET terminate_on = current_date
                WHERE student_id = (SELECT id FROM auth_user WHERE email = :e) AND level = 'FINAL'
                """).param("e", StayFlow.student(22)).update();
        assertThat(debts.evaluateAll()).isZero();
        jdbc.sql("UPDATE cfg_parameter SET value = 'true' WHERE key = 'termination.debt_reaches_deposit'").update();
        assertThat(debts.evaluateAll()).isEqualTo(1);
        assertThat(notifications(22, "TERMINATION_NOTICE")).isEqualTo(1);
    }
}

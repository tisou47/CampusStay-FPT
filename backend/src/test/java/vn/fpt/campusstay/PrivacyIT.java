package vn.fpt.campusstay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.bearer;

import com.jayway.jsonpath.JsonPath;
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

import vn.fpt.campusstay.service.billing.RefundAccountRetention;

/** My data under Decree 13/2023 (W3-D3): consent, export, erasure requests and the refund-account retention. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class PrivacyIT {

    private static final String MANAGER = "manager.a@campusstay.test";

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    RefundAccountRetention retention;

    private String erasure(String auth, String reason) throws Exception {
        String body = mvc.perform(post("/students/me/privacy/erasure").header(HttpHeaders.AUTHORIZATION, auth)
                .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"" + reason + "\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("Pending"))
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.id");
    }

    private org.springframework.test.web.servlet.ResultActions decide(String id, String body) throws Exception {
        return mvc.perform(post("/privacy/erasure-requests/" + id + "/decision")
                .header(HttpHeaders.AUTHORIZATION, bearer(mvc, MANAGER))
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    /**
     * TC-AUTH-401: a student accepts only the current privacy notice; the acceptance is recorded with its version,
     * and an older version is refused.
     */
    @Test
    void consentToTheCurrentNoticeOnly() throws Exception {
        String auth = bearer(mvc, StayFlow.student(44));
        mvc.perform(post("/students/me/privacy/consent").header(HttpHeaders.AUTHORIZATION, auth)
                .contentType(MediaType.APPLICATION_JSON).content("{\"version\":\"2020-01\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.privacyNoticeVersion").exists());
        mvc.perform(post("/students/me/privacy/consent").header(HttpHeaders.AUTHORIZATION, auth)
                .contentType(MediaType.APPLICATION_JSON).content("{\"version\":\"2026-11\"}"))
                .andExpect(status().isNoContent());
        mvc.perform(get("/students/me/privacy").header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.noticeVersion").value("2026-11"))
                .andExpect(jsonPath("$.consent.version").value("2026-11"))
                .andExpect(jsonPath("$.consentCurrent").value(true));
    }

    /** TC-AUTH-402: the export holds the student's own account and profile, sent as a download, and is audited. */
    @Test
    void exportHoldsOnlyTheStudentsOwnData() throws Exception {
        String auth = bearer(mvc, StayFlow.student(45));
        mvc.perform(get("/students/me/privacy/export").header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"my-data.json\""))
                .andExpect(jsonPath("$.account.email").value(StayFlow.student(45)))
                .andExpect(jsonPath("$.profile.studentCode").exists())
                .andExpect(jsonPath("$.records.applications").isArray());
        assertThat(jdbc.sql("SELECT count(*) FROM shared_audit_log WHERE action = 'PERSONAL_DATA_EXPORTED'")
                .query(Long.class).single()).isPositive();
    }

    /**
     * TC-AUTH-403: an erasure request waits for a Manager (one at a time); a student holding a Bed is refused with
     * ERASURE_HAS_ALLOCATION and the request stays Pending; a rejection needs a note.
     */
    @Test
    void erasureIsBlockedWhileTheStudentHoldsABed() throws Exception {
        String auth = bearer(mvc, StayFlow.student(46));
        String id = erasure(auth, "I left the university");
        mvc.perform(post("/students/me/privacy/erasure").header(HttpHeaders.AUTHORIZATION, auth)
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ERASURE_PENDING"));
        ApplyFlow flow = new ApplyFlow(mvc, jdbc);
        new StayFlow(mvc, jdbc, flow, flow.openTerm()).livesIn(46, "A-101", "A", true);
        decide(id, "{\"decision\":\"Approved\"}").andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ERASURE_HAS_ALLOCATION"));
        decide(id, "{\"decision\":\"Rejected\"}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.note").exists());
        decide(id, "{\"decision\":\"Rejected\",\"note\":\"Still living in A-101\"}").andExpect(status().isNoContent());
        decide(id, "{\"decision\":\"Approved\"}").andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ALREADY_DECIDED"));
    }

    /**
     * TC-AUTH-404: approving the erasure of a student with no stay and no money open anonymises the account and ends
     * its sessions; the Managers' list shows it Completed.
     */
    @Test
    void approvedErasureAnonymisesTheAccount() throws Exception {
        String email = StayFlow.student(47);
        String auth = bearer(mvc, email);
        long userId = jdbc.sql("SELECT id FROM auth_user WHERE email = :e").param("e", email).query(Long.class).single();
        String id = erasure(auth, "Please delete my data");
        decide(id, "{\"decision\":\"Approved\"}").andExpect(status().isNoContent());
        assertThat(jdbc.sql("SELECT email FROM auth_user WHERE id = :id").param("id", userId).query(String.class).single())
                .isEqualTo("erased-" + userId + "@erased.invalid");
        assertThat(jdbc.sql("SELECT phone IS NULL AND date_of_birth IS NULL FROM auth_student WHERE user_id = :id")
                .param("id", userId).query(Boolean.class).single()).isTrue();
        mvc.perform(get("/students/me/privacy").header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/privacy/erasure-requests?status=Completed").header(HttpHeaders.AUTHORIZATION, bearer(mvc, MANAGER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[?(@.id == '" + id + "')].status").value("Completed"));
    }

    /** TC-AUTH-405: the erasure queue is for Managers; a student gets 403. */
    @Test
    void erasureQueueIsForManagers() throws Exception {
        mvc.perform(get("/privacy/erasure-requests").header(HttpHeaders.AUTHORIZATION, bearer(mvc, StayFlow.student(44))))
                .andExpect(status().isForbidden());
    }

    /**
     * TC-BIL-410: a refund bank account is cleared once the last refund was paid longer ago than the retention
     * period and no refund of the student is open; an account with an open refund is kept.
     */
    @Test
    void refundAccountsAreClearedAfterTheRetention() throws Exception {
        long kept = studentWithAccount(42);
        long cleared = studentWithAccount(43);
        long term = jdbc.sql("SELECT id FROM cfg_term ORDER BY id LIMIT 1").query(Long.class).single();
        refund(term, cleared, "PAID", "now() - interval '200 days'");
        refund(term, kept, "PAID", "now() - interval '200 days'");
        refund(term, kept, "PENDING", "NULL");
        retention.run();
        assertThat(accountNumber(cleared)).isNull();
        assertThat(accountNumber(kept)).isNotNull();
    }

    private long studentWithAccount(int n) {
        long id = jdbc.sql("SELECT id FROM auth_user WHERE email = :e").param("e", StayFlow.student(n))
                .query(Long.class).single();
        jdbc.sql("""
                UPDATE auth_student SET refund_account_holder = 'TEST HOLDER', refund_account_number = '0123456789',
                       refund_bank = 'Test Bank', refund_account_at = now() WHERE user_id = :id
                """).param("id", id).update();
        return id;
    }

    private void refund(long term, long student, String status, String paidAt) {
        jdbc.sql("""
                INSERT INTO bil_refund (term_id, student_id, student_name, student_code, gender, source_type, reason, paid_amount, amount,
                                        status, paid_at)
                VALUES (:t, :s, 'Test Student', 'SE000000', 'M', 'OTHER', 'test', 100000, 100000, :st, %s)
                """.formatted(paidAt)).param("t", term).param("s", student).param("st", status).update();
    }

    private String accountNumber(long id) {
        return jdbc.sql("SELECT refund_account_number FROM auth_student WHERE user_id = :id").param("id", id)
                .query((rs, i) -> rs.getString(1)).list().getFirst();
    }
}

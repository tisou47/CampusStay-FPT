package vn.fpt.campusstay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.ADMIN;
import static vn.fpt.campusstay.TestAuth.MANAGER_A;
import static vn.fpt.campusstay.TestAuth.STAFF_A;
import static vn.fpt.campusstay.TestAuth.STAFF_B2;
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
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** Manager › Students: the student list, the student hub, directory fields, verification and locking (spec §6.2, §11.3). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class StudentAccountsIT {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    ApplyFlow flow;
    StayFlow stay;

    @BeforeEach
    void openTerm() {
        flow = new ApplyFlow(mvc, jdbc);
        stay = new StayFlow(mvc, jdbc, flow, flow.openTerm());
    }

    private ResultActions call(MockHttpServletRequestBuilder request, String auth) throws Exception {
        return mvc.perform(request.header(HttpHeaders.AUTHORIZATION, auth));
    }

    private ResultActions json(MockHttpServletRequestBuilder request, String auth, String body) throws Exception {
        return mvc.perform(request.header(HttpHeaders.AUTHORIZATION, auth).contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    /** A student who signed up and sent the form: Pending verification, with a password. */
    private long pendingStudent(String email, String code) {
        jdbc.sql("""
                INSERT INTO auth_user (email, display_name, role, status, password_hash)
                SELECT :email, 'Pending ' || :code, 'STUDENT', 'ACTIVE', password_hash FROM auth_user WHERE email = :admin
                ON CONFLICT DO NOTHING
                """).param("email", email).param("code", code).param("admin", ADMIN).update();
        long id = stay.userId(email);
        jdbc.sql("""
                INSERT INTO auth_student (user_id, student_code, gender, major, cohort, phone, verification, source)
                VALUES (:id, :code, 'F', 'SE', 'K20', '0901112233', 'PENDING', 'SIGN_UP') ON CONFLICT (user_id) DO NOTHING
                """).param("id", id).param("code", code).update();
        return id;
    }

    /**
     * TC-AUTH-042: Managers list every student with filters and the count waiting for verification; Staff see only
     * the residents of their Blocks; students may not list.
     */
    @Test
    void listsStudentsWithFilters() throws Exception {
        long pending = pendingStudent("ittest.pending42@fpt.edu.vn", "SE200042");
        stay.livesIn(3, "A-101", "A", true);
        String manager = bearer(mvc, MANAGER_A);
        call(get("/student-accounts").param("verification", "Pending verification"), manager)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[*].id", hasItem(String.valueOf(pending))))
                .andExpect(jsonPath("$.items[*].verification", everyItem(is("Pending verification"))))
                .andExpect(jsonPath("$.counts.pending").value(org.hamcrest.Matchers.greaterThanOrEqualTo(1)))
                .andExpect(jsonPath("$.options.enrollments", hasItem("Not enrolled")));
        call(get("/student-accounts").param("q", "SE190003"), manager)
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].residence").value("A-101 · Bed A"))
                .andExpect(jsonPath("$.items[0].block").value("A"))
                .andExpect(jsonPath("$.items[0].demo").value(true))
                .andExpect(jsonPath("$.items[0].account").value("Active"));
        call(get("/student-accounts").param("resident", "yes").param("gender", "Male"), manager)
                .andExpect(jsonPath("$.items[*].studentCode", hasItem("SE190003")));
        call(get("/student-accounts").param("resident", "maybe"), manager).andExpect(status().isBadRequest());
        // Staff of Block A see its residents only; Staff of Block B see none of them.
        call(get("/student-accounts"), bearer(mvc, STAFF_A))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[*].studentCode", hasItem("SE190003")))
                .andExpect(jsonPath("$.items[*].id", org.hamcrest.Matchers.not(hasItem(String.valueOf(pending)))));
        call(get("/student-accounts").param("block", "A"), bearer(mvc, STAFF_B2)).andExpect(status().isForbidden());
        call(get("/student-accounts"), bearer(mvc, StayFlow.student(4))).andExpect(status().isForbidden());
    }

    /**
     * TC-AUTH-043: the student hub shows the profile, the account, the Bed, the Applications, Invoices and requests
     * and the history; Staff open only residents of their Blocks; an unknown id is 404.
     */
    @Test
    void studentHub() throws Exception {
        String student = bearer(mvc, StayFlow.student(6));
        ApplyFlow.Applied applied = flow.apply(student, "4-bed", "Standard", null);
        long id = stay.userId(StayFlow.student(6));
        String manager = bearer(mvc, MANAGER_A);
        call(get("/student-accounts/" + id), manager)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.profile.studentCode").value("SE190006"))
                .andExpect(jsonPath("$.verification.status").value("Verified"))
                .andExpect(jsonPath("$.account.status").value("Active"))
                .andExpect(jsonPath("$.residence").doesNotExist())
                .andExpect(jsonPath("$.sections.applications[0].id").value(applied.id()))
                .andExpect(jsonPath("$.sections.applications[0].kind").value("application"))
                .andExpect(jsonPath("$.sections.invoices[0].id").value(applied.depositInvoiceId()))
                .andExpect(jsonPath("$.sections.invoices[0].amount").isNumber())
                .andExpect(jsonPath("$.sections.requests", hasSize(0)))
                .andExpect(jsonPath("$.actions.edit").value(true))
                .andExpect(jsonPath("$.actions.verify").value(false))
                .andExpect(jsonPath("$.actions.lock").value(true));
        // Staff: not a resident of their Blocks → 404; once the student lives in Block A, Block A's Staff may read.
        call(get("/student-accounts/" + id), bearer(mvc, STAFF_A)).andExpect(status().isNotFound());
        stay.livesIn(6, "A-102", "A", false);
        call(get("/student-accounts/" + id), bearer(mvc, STAFF_A))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.residence.room").value("A-102"))
                .andExpect(jsonPath("$.sections.allocations[0].title").value("Room A-102 · Bed A"))
                .andExpect(jsonPath("$.actions.edit").value(false));
        call(get("/student-accounts/" + id), bearer(mvc, STAFF_B2)).andExpect(status().isNotFound());
        call(get("/student-accounts/999999999"), manager).andExpect(status().isNotFound());
        call(get("/student-accounts/abc"), manager).andExpect(status().isNotFound());
    }

    /** TC-AUTH-044: a Manager corrects directory fields; each is checked; the change is audited; Staff cannot edit. */
    @Test
    void editDirectoryFields() throws Exception {
        long id = stay.userId(StayFlow.student(7));
        String manager = bearer(mvc, MANAGER_A);
        json(put("/student-accounts/" + id), manager, """
                {"name":"X","gender":"Other","major":"Cooking","cohort":"19","semester":30,"region":"Mars",
                 "enrollment":"Sleeping","priorityGroups":["NOPE"],"phone":"1"}""")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.name").exists())
                .andExpect(jsonPath("$.details.fields.gender").exists())
                .andExpect(jsonPath("$.details.fields.major").exists())
                .andExpect(jsonPath("$.details.fields.semester").exists())
                .andExpect(jsonPath("$.details.fields.region").exists())
                .andExpect(jsonPath("$.details.fields.enrollment").exists())
                .andExpect(jsonPath("$.details.fields.priorityGroups").exists())
                .andExpect(jsonPath("$.details.fields.phone").exists());
        json(put("/student-accounts/" + id), manager, """
                {"name":"Nguyen Van Sua","studentCode":"SE299999","gender":"Male","major":"SE","cohort":"K19"}""")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.studentCode")
                        .value("The student code cannot change once the account is verified."));
        json(put("/student-accounts/" + id), manager, """
                {"name":"Nguyen Van Sua","gender":"Male","major":"AI","cohort":"K20","semester":3,"region":"Southeast",
                 "enrollment":"Suspended","priorityGroups":["SCHOLARSHIP"],"phone":"0909000111"}""")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Nguyen Van Sua"))
                .andExpect(jsonPath("$.profile.major").value("AI"))
                .andExpect(jsonPath("$.profile.region").value("SOUTHEAST"))
                .andExpect(jsonPath("$.profile.enrollment").value("Suspended"))
                .andExpect(jsonPath("$.history[0].action").value("Student profile edited"));
        json(put("/student-accounts/" + id), bearer(mvc, STAFF_A), "{\"name\":\"Staff Edit\"}")
                .andExpect(status().isForbidden());
    }

    /**
     * TC-AUTH-045: a Manager verifies a pending account (the student is told) or rejects it (locked); locking signs
     * the student out until a Manager unlocks the account; a rejected account comes back as pending.
     */
    @Test
    void verifyRejectLockUnlock() throws Exception {
        String manager = bearer(mvc, MANAGER_A);
        long first = pendingStudent("ittest.pending45@fpt.edu.vn", "SE200045");
        call(post("/student-accounts/" + first + "/verify"), manager).andExpect(status().isNoContent());
        call(post("/student-accounts/" + first + "/verify"), manager)
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("NOT_PENDING"));
        assertThat(jdbc.sql("SELECT count(*) FROM ntf_notification WHERE user_id = :id AND event_key = 'STUDENT_VERIFIED'")
                .param("id", first).query(Long.class).single()).isEqualTo(1);

        long second = pendingStudent("ittest.pending46@fpt.edu.vn", "SE200046");
        json(post("/student-accounts/" + second + "/reject"), manager, "{\"reason\":\" \"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.details.fields.reason").exists());
        json(post("/student-accounts/" + second + "/reject"), manager, "{\"reason\":\"Not a student of FPT\"}")
                .andExpect(status().isNoContent());
        call(get("/student-accounts/" + second), manager)
                .andExpect(jsonPath("$.verification.status").value("Rejected"))
                .andExpect(jsonPath("$.verification.note").value("Not a student of FPT"))
                .andExpect(jsonPath("$.account.status").value("Locked"))
                .andExpect(jsonPath("$.actions.unlock").value(true));
        call(post("/student-accounts/" + second + "/unlock"), manager).andExpect(status().isNoContent());
        call(get("/student-accounts/" + second), manager)
                .andExpect(jsonPath("$.verification.status").value("Pending verification"))
                .andExpect(jsonPath("$.account.status").value("Active"));

        String student = bearer(mvc, StayFlow.student(8));
        long id = stay.userId(StayFlow.student(8));
        json(post("/student-accounts/" + id + "/lock"), manager, "{\"reason\":\"Asked to leave\"}")
                .andExpect(status().isNoContent());
        call(get("/auth/me"), student).andExpect(status().isUnauthorized());
        json(post("/student-accounts/" + id + "/lock"), manager, "{\"reason\":\"Again\"}")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ALREADY_LOCKED"));
        call(post("/student-accounts/" + id + "/unlock"), manager).andExpect(status().isNoContent());
        call(post("/student-accounts/" + id + "/unlock"), manager)
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("NOT_LOCKED"));
        bearer(mvc, StayFlow.student(8));
        call(post("/student-accounts/" + id + "/unlock"), bearer(mvc, STAFF_A)).andExpect(status().isForbidden());
    }

    /** TC-APP-022: only a verified account may apply: a pending one sees why and is refused (ADR-26). */
    @Test
    void pendingAccountCannotApply() throws Exception {
        long id = pendingStudent("ittest.pending47@fpt.edu.vn", "SE200047");
        jdbc.sql("""
                UPDATE auth_student SET emergency_name = 'Parent', emergency_relationship = 'MOTHER',
                       emergency_phone = '0901000222' WHERE user_id = :id
                """).param("id", id).update();
        String student = bearer(mvc, "ittest.pending47@fpt.edu.vn");
        call(get("/applications/eligibility"), student)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.eligible").value(false))
                .andExpect(jsonPath("$.checks[?(@.title == 'Account verified')].passed").value(hasItem(false)));
        flow.submit(student, flow.body("4-bed", "Standard", null))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("NOT_ELIGIBLE"));
        call(post("/student-accounts/" + id + "/verify"), bearer(mvc, ADMIN)).andExpect(status().isNoContent());
        call(get("/applications/eligibility"), student)
                .andExpect(jsonPath("$.checks[?(@.title == 'Account verified')]", hasSize(0)));
    }
}

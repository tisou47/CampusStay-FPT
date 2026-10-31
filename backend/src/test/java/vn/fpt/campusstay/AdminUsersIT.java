package vn.fpt.campusstay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.oneOf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.ADMIN;
import static vn.fpt.campusstay.TestAuth.STAFF_A;
import static vn.fpt.campusstay.TestAuth.bearer;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

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

import vn.fpt.campusstay.security.Permission;

/** Admin › Users and Roles, permission matrix, Audit Log, and the invite → set password → change password flow. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class AdminUsersIT {

    private static final Pattern TOKEN = Pattern.compile("token=([A-Za-z0-9_-]+)");

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    /** TC-AUTH-011: the list holds back-office accounts only, with labels and string ids; filters by role and Block. */
    @Test
    void listsBackOfficeUsersWithFilters() throws Exception {
        String admin = bearer(mvc, ADMIN);
        mvc.perform(get("/admin/users").header(HttpHeaders.AUTHORIZATION, admin).param("pageSize", "100"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[*].role", everyItem(oneOf("Staff", "Manager", "Admin"))))
                .andExpect(jsonPath("$.items[0].id").isString())
                .andExpect(jsonPath("$.roles", hasSize(3)))
                .andExpect(jsonPath("$.blocks", hasItem("A")))
                .andExpect(jsonPath("$.scopeOptions[0]").value("All Blocks"));
        mvc.perform(get("/admin/users").header(HttpHeaders.AUTHORIZATION, admin)
                .param("role", "Staff").param("block", "B").param("q", "staff.b1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].email").value("staff.b1@campusstay.test"))
                .andExpect(jsonPath("$.items[0].scope").value("B"))
                .andExpect(jsonPath("$.items[0].status").value("Active"));
        // Managers work for every Block (ADR-19).
        mvc.perform(get("/admin/users").header(HttpHeaders.AUTHORIZATION, admin).param("role", "Manager"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[*].scope", everyItem(oneOf("All Blocks"))));
    }

    /**
     * TC-AUTH-012: an invited Staff sets the password from the emailed link (one use only), signs in with the
     * Block scope, and a password change keeps the current session but signs out the others.
     */
    @Test
    void invitedUserSetsAndChangesPassword() throws Exception {
        String admin = bearer(mvc, ADMIN);
        String email = "new.staff@fpt.edu.vn";
        String id = JsonPath.read(mvc.perform(post("/admin/users").header(HttpHeaders.AUTHORIZATION, admin)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Ly Thanh Tam\",\"email\":\"" + email + "\",\"role\":\"Staff\",\"scope\":\"A\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").isString())
                .andReturn().getResponse().getContentAsString(), "$.id");
        mvc.perform(get("/admin/users").header(HttpHeaders.AUTHORIZATION, admin).param("q", "new.staff"))
                .andExpect(jsonPath("$.items[0].id").value(id))
                .andExpect(jsonPath("$.items[0].status").value("Invited"))
                .andExpect(jsonPath("$.items[0].scope").value("A"));

        String body = jdbc.sql("SELECT body_html FROM ntf_email_outbox WHERE to_email = :to ORDER BY id DESC LIMIT 1")
                .param("to", email).query(String.class).single();
        Matcher m = TOKEN.matcher(body);
        assertThat(m.find()).isTrue();
        String reset = "{\"token\":\"" + m.group(1) + "\",\"newPassword\":\"Dorm2026pass\"}";
        mvc.perform(post("/auth/password/reset").contentType(MediaType.APPLICATION_JSON).content(reset))
                .andExpect(status().isNoContent());
        mvc.perform(post("/auth/password/reset").contentType(MediaType.APPLICATION_JSON).content(reset))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("LINK_INVALID"));

        String first = bearer(mvc, email, "Dorm2026pass");
        String second = bearer(mvc, email, "Dorm2026pass");
        mvc.perform(get("/auth/me").header(HttpHeaders.AUTHORIZATION, first))
                .andExpect(jsonPath("$.role").value("staff"))
                .andExpect(jsonPath("$.blocks[0]").value("A"));
        mvc.perform(post("/auth/password/change").header(HttpHeaders.AUTHORIZATION, first)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"currentPassword\":\"wrong-one1\",\"newPassword\":\"Another2026pass\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("WRONG_PASSWORD"));
        mvc.perform(post("/auth/password/change").header(HttpHeaders.AUTHORIZATION, first)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"currentPassword\":\"Dorm2026pass\",\"newPassword\":\"short\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("WEAK_PASSWORD"));
        mvc.perform(post("/auth/password/change").header(HttpHeaders.AUTHORIZATION, first)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"currentPassword\":\"Dorm2026pass\",\"newPassword\":\"Another2026pass\"}"))
                .andExpect(status().isNoContent());
        mvc.perform(get("/auth/me").header(HttpHeaders.AUTHORIZATION, first)).andExpect(status().isOk());
        mvc.perform(get("/auth/me").header(HttpHeaders.AUTHORIZATION, second)).andExpect(status().isUnauthorized());
        mvc.perform(get("/admin/users").header(HttpHeaders.AUTHORIZATION, admin).param("q", "new.staff"))
                .andExpect(jsonPath("$.items[0].status").value("Active"));
    }

    /** TC-AUTH-013 (negative): invite validation names each field. */
    @Test
    void inviteIsValidated() throws Exception {
        String admin = bearer(mvc, ADMIN);
        mvc.perform(post("/admin/users").header(HttpHeaders.AUTHORIZATION, admin).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Dup\",\"email\":\"STAFF.A2@campusstay.test\",\"role\":\"Student\",\"scope\":\"\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.details.fields.email").value("An account with this email already exists."))
                .andExpect(jsonPath("$.details.fields.role").exists());
        mvc.perform(post("/admin/users").header(HttpHeaders.AUTHORIZATION, admin).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"No Block\",\"email\":\"no.block@fpt.edu.vn\",\"role\":\"Staff\",\"scope\":\"Z\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.scope").value("Block Z does not exist."));
    }

    /** TC-AUTH-014: disabling a user signs them out at once and is written to the Audit Log. */
    @Test
    void disablingRevokesSessions() throws Exception {
        String admin = bearer(mvc, ADMIN);
        String staff = bearer(mvc, "staff.a2@campusstay.test");
        String id = JsonPath.read(mvc.perform(get("/admin/users").header(HttpHeaders.AUTHORIZATION, admin)
                .param("q", "staff.a2")).andReturn().getResponse().getContentAsString(), "$.items[0].id");
        mvc.perform(put("/admin/users/" + id).header(HttpHeaders.AUTHORIZATION, admin)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Vo Thanh Tung\",\"role\":\"Staff\",\"scope\":\"A\",\"status\":\"Disabled\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("Disabled"));
        mvc.perform(get("/auth/me").header(HttpHeaders.AUTHORIZATION, staff)).andExpect(status().isUnauthorized());
        mvc.perform(get("/admin/audit-log").header(HttpHeaders.AUTHORIZATION, admin)
                .param("action", "User disabled").param("range", "7d"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].action").value("User disabled"))
                .andExpect(jsonPath("$.items[0].tone").value("warning"))
                .andExpect(jsonPath("$.items[0].object").value("User staff.a2@campusstay.test"))
                .andExpect(jsonPath("$.items[0].change").value("status: Active → Disabled"));
        mvc.perform(get("/admin/audit-log").header(HttpHeaders.AUTHORIZATION, admin)
                .param("action", "User disabled").param("role", "Admin"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].action").value("User disabled"));
        mvc.perform(get("/admin/audit-log").header(HttpHeaders.AUTHORIZATION, admin)
                .param("action", "User disabled").param("role", "Staff"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(0));
        mvc.perform(get("/admin/audit-log").header(HttpHeaders.AUTHORIZATION, admin).param("role", "Guest"))
                .andExpect(status().isBadRequest());
        mvc.perform(put("/admin/users/" + id).header(HttpHeaders.AUTHORIZATION, admin)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Vo Thanh Tung\",\"role\":\"Staff\",\"scope\":\"A\",\"status\":\"Active\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("Active"));
    }

    /** TC-AUTH-015 (negative): the Admin cannot lock themselves out. */
    @Test
    void adminCannotDisableThemselves() throws Exception {
        String admin = bearer(mvc, ADMIN);
        String id = JsonPath.read(mvc.perform(get("/auth/me").header(HttpHeaders.AUTHORIZATION, admin))
                .andReturn().getResponse().getContentAsString(), "$.id");
        mvc.perform(put("/admin/users/" + id).header(HttpHeaders.AUTHORIZATION, admin)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Tran Minh Quan\",\"role\":\"Admin\",\"scope\":\"All Blocks\",\"status\":\"Disabled\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("OWN_ACCOUNT"));
    }

    /** TC-AUTH-016 (permission): Staff cannot open Admin screens. */
    @Test
    void staffCannotManageUsers() throws Exception {
        String staff = bearer(mvc, STAFF_A);
        mvc.perform(get("/admin/users").header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
        mvc.perform(get("/admin/audit-log").header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(status().isForbidden());
    }

    /** TC-AUTH-017: the permission matrix is the enforced rule table. */
    @Test
    void permissionMatrixComesFromTheRuleTable() throws Exception {
        mvc.perform(get("/admin/permissions").header(HttpHeaders.AUTHORIZATION, bearer(mvc, ADMIN)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.roles", hasSize(4)))
                .andExpect(jsonPath("$.roles[3].key").value("admin"))
                .andExpect(jsonPath("$.roles[3].short").value("Adm"))
                .andExpect(jsonPath("$.rows", hasSize(Permission.values().length)))
                .andExpect(jsonPath("$.rows[0].allowed", hasSize(4)));
    }

    /** TC-AUTH-018: Audit Log filters, labels and retention; a bad range is refused. */
    @Test
    void auditLogListsSignIns() throws Exception {
        String admin = bearer(mvc, ADMIN);
        mvc.perform(get("/admin/audit-log").header(HttpHeaders.AUTHORIZATION, admin)
                .param("action", "Sign in").param("q", "admin@campusstay").param("range", "30d"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].id").isString())
                .andExpect(jsonPath("$.items[0].actor").value("Tran Minh Quan"))
                .andExpect(jsonPath("$.items[0].change").value("method: PASSWORD"))
                .andExpect(jsonPath("$.actors", hasItem("Tran Minh Quan")))
                .andExpect(jsonPath("$.actions", hasItem("Sign in")))
                .andExpect(jsonPath("$.actions", not(hasItem("SIGN_IN"))))
                .andExpect(jsonPath("$.retentionMonths").value(24));
        mvc.perform(get("/admin/audit-log").header(HttpHeaders.AUTHORIZATION, admin).param("range", "1y"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("BAD_PARAMETER"));
    }
}

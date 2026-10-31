package vn.fpt.campusstay.service.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import vn.fpt.campusstay.PostgresTestcontainer;
import vn.fpt.campusstay.TestAuth;

/**
 * Google sign-up (ADR-26, spec §6.1): a new account, its first password, the sign-up form, verification by the
 * student list. Google's ID token check is replaced by a stub; the real check is covered by the code exchange tests
 * and the manual test with a real account.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class GoogleSignUpIT {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @MockitoBean
    GoogleIdTokenVerifier google;

    /** Signs in with a stubbed Google identity and returns the response. */
    private ResultActions google(String sub, String email, String name) throws Exception {
        when(google.verify("token-" + sub)).thenReturn(new GoogleIdTokenVerifier.GoogleIdentity(sub, email, name));
        return mvc.perform(post("/auth/google").header(HttpHeaders.ACCEPT_LANGUAGE, "en")
                .contentType(MediaType.APPLICATION_JSON).content("{\"credential\":\"token-" + sub + "\"}"));
    }

    private String bearer(String sub, String email, String name) throws Exception {
        String body = google(sub, email, name).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return "Bearer " + JsonPath.read(body, "$.token");
    }

    private ResultActions json(MockHttpServletRequestBuilder request,
            String auth, String body) throws Exception {
        return mvc.perform(request.header(HttpHeaders.AUTHORIZATION, auth).contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    /** A student of an imported list who has not signed in yet. */
    private void imported(String email, String name, String code) {
        jdbc.sql("INSERT INTO auth_user (email, display_name, role, status) VALUES (:email, :name, 'STUDENT', 'INVITED')")
                .param("email", email).param("name", name).update();
        jdbc.sql("""
                INSERT INTO auth_student (user_id, student_code, gender, major, cohort, source)
                SELECT id, :code, 'M', 'SE', 'K19', 'IMPORT' FROM auth_user WHERE email = :email
                """).param("code", code).param("email", email).update();
    }

    private static String form(String code) {
        return """
                {"studentCode":"%s","name":"Tran Thi Thu","gender":"Female","dateOfBirth":"2005-06-01","major":"SE",
                 "cohort":"K19","phone":"0901234567"}""".formatted(code);
    }

    /**
     * TC-AUTH-038: an unknown FPT Google account signs up as a student without a password; until it sets one only the
     * setup endpoints answer; the password follows the usual rules and is set once.
     */
    @Test
    void signUpThenSetAPassword() throws Exception {
        google("sub-038", "ittest.se199038@fpt.edu.vn", "Le Van Moi").andExpect(status().isOk())
                .andExpect(jsonPath("$.user.role").value("student"))
                .andExpect(jsonPath("$.user.passwordSet").value(false))
                .andExpect(jsonPath("$.user.verification").value("Profile needed"));
        String auth = bearer("sub-038", "ittest.se199038@fpt.edu.vn", "Le Van Moi");
        assertThat(jdbc.sql("SELECT demo FROM auth_user WHERE email = 'ittest.se199038@fpt.edu.vn'")
                .query(Boolean.class).single()).isFalse();

        mvc.perform(get("/students/me/home").header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("PASSWORD_REQUIRED"));
        mvc.perform(get("/auth/me").header(HttpHeaders.AUTHORIZATION, auth)).andExpect(status().isOk());
        mvc.perform(get("/students/me/verification").header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("PASSWORD_REQUIRED"));
        json(post("/auth/password/set"), auth, "{\"newPassword\":\"short\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("WEAK_PASSWORD"));
        json(post("/auth/password/set"), auth, "{\"newPassword\":\"Moi@2026xyz\"}").andExpect(status().isNoContent());
        json(post("/auth/password/set"), auth, "{\"newPassword\":\"Moi@2026abc\"}")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PASSWORD_ALREADY_SET"));
        mvc.perform(get("/auth/me").header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(jsonPath("$.passwordSet").value(true));
        // The password now works for email sign-in too.
        TestAuth.bearer(mvc, "ittest.se199038@fpt.edu.vn", "Moi@2026xyz");
        // Next step: the sign-up form, prefilled from the address.
        mvc.perform(get("/students/me/home").header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("PROFILE_REQUIRED"));
        mvc.perform(get("/students/me/verification").header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("Profile needed"))
                .andExpect(jsonPath("$.form.studentCode").value("SE199038"))
                .andExpect(jsonPath("$.form.cohort").value("K19"))
                .andExpect(jsonPath("$.options.majors[*].value", hasItem("SE")));
    }

    /**
     * TC-AUTH-039: the sign-up form checks every field and the student code; once sent the account is Pending
     * verification, every Manager is told, and the student cannot apply.
     */
    @Test
    void signUpFormWaitsForAManager() throws Exception {
        String auth = bearer("sub-039", "ittest.se199039@fpt.edu.vn", "Tran Thi Thu");
        json(post("/auth/password/set"), auth, "{\"newPassword\":\"Thu@2026xyz\"}").andExpect(status().isNoContent());
        json(put("/students/me/verification"), auth, """
                {"studentCode":"S1","name":"T","gender":"X","major":"Cooking","cohort":"19x","phone":"12"}""")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.studentCode").exists())
                .andExpect(jsonPath("$.details.fields.name").exists())
                .andExpect(jsonPath("$.details.fields.gender").value("Choose Male or Female."))
                .andExpect(jsonPath("$.details.fields.dateOfBirth").exists())
                .andExpect(jsonPath("$.details.fields.major").exists())
                .andExpect(jsonPath("$.details.fields.cohort").exists())
                .andExpect(jsonPath("$.details.fields.phone").exists());
        // A code a real account holds is refused (the account of TC-AUTH-038 may not have one yet, so make one).
        imported("ittest.real@fpt.edu.vn", "Real Holder", "SE199900");
        json(put("/students/me/verification"), auth, form("SE199900")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.studentCode")
                        .value("This student code belongs to another account. Contact the dormitory office."));

        json(put("/students/me/verification"), auth, form("SE199039")).andExpect(status().isNoContent());
        mvc.perform(get("/auth/me").header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(jsonPath("$.verification").value("Pending verification"))
                .andExpect(jsonPath("$.studentCode").value("SE199039"))
                .andExpect(jsonPath("$.name").value("Tran Thi Thu"));
        long managersTold = jdbc.sql("""
                SELECT count(*) FROM ntf_notification n JOIN auth_user u ON u.id = n.user_id
                WHERE n.event_key = 'STUDENT_VERIFICATION_REQUESTED' AND u.role = 'MANAGER' AND n.body LIKE '%SE199039%'
                """).query(Long.class).single();
        assertThat(managersTold).isEqualTo(2); // manager.a and manager.b of the test seed
        // Pending students read the portal but cannot apply.
        mvc.perform(get("/applications/eligibility").header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.eligible").value(false))
                .andExpect(jsonPath("$.checks[?(@.title == 'Account verified')].passed").value(hasItem(false)));
        // The form may be corrected while pending, but not once verified.
        json(put("/students/me/verification"), auth, form("SE199039").replace("0901234567", "0907654321"))
                .andExpect(status().isNoContent());
        jdbc.sql("UPDATE auth_student SET verification = 'VERIFIED' WHERE student_code = 'SE199039'").update();
        json(put("/students/me/verification"), auth, form("SE199039"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ALREADY_VERIFIED"));
    }

    /**
     * TC-AUTH-040: an address ending with the code of an imported, unused account signs in to that account (Verified,
     * linked to Google); a fictional account's code is never matched, and a real student who needs it takes it.
     */
    @Test
    void codeInTheAddressFindsTheImportedStudent() throws Exception {
        imported("old.address@fpt.edu.vn", "Pham Van Nhap", "SE199040");
        google("sub-040", "nhappvse199040@fpt.edu.vn", "Pham Van Nhap").andExpect(status().isOk())
                .andExpect(jsonPath("$.user.email").value("nhappvse199040@fpt.edu.vn"))
                .andExpect(jsonPath("$.user.studentCode").value("SE199040"))
                .andExpect(jsonPath("$.user.verification").value("Verified"))
                .andExpect(jsonPath("$.user.passwordSet").value(false));
        assertThat(jdbc.sql("SELECT count(*) FROM auth_user WHERE email = 'old.address@fpt.edu.vn'").query(Long.class)
                .single()).isZero();

        // SE190005 belongs to a fictional test-seed student: not matched, so this is a new account.
        String auth = bearer("sub-040b", "ittest.se190005@fpt.edu.vn", "Real Student");
        mvc.perform(get("/auth/me").header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(jsonPath("$.verification").value("Profile needed"));
        json(post("/auth/password/set"), auth, "{\"newPassword\":\"Real@2026xyz\"}").andExpect(status().isNoContent());
        json(put("/students/me/verification"), auth, form("SE190005")).andExpect(status().isNoContent());
        assertThat(jdbc.sql("""
                SELECT s.student_code FROM auth_student s JOIN auth_user u ON u.id = s.user_id
                WHERE u.email = 'se190005@student.campusstay.test'
                """).query(String.class).single()).isEqualTo("DEMO-SE190005");
    }

    /** TC-AUTH-041: a rejected account cannot sign in, and the answer gives the Manager's reason. */
    @Test
    void rejectedAccountSaysWhy() throws Exception {
        String auth = bearer("sub-041", "ittest.se199041@fpt.edu.vn", "Ho Van Tu");
        json(post("/auth/password/set"), auth, "{\"newPassword\":\"Tu@2026xyz1\"}").andExpect(status().isNoContent());
        json(put("/students/me/verification"), auth, form("SE199041")).andExpect(status().isNoContent());
        String id = jdbc.sql("SELECT id FROM auth_user WHERE email = 'ittest.se199041@fpt.edu.vn'").query(Long.class)
                .single().toString();
        json(post("/student-accounts/" + id + "/reject"), TestAuth.bearer(mvc, TestAuth.MANAGER_A),
                "{\"reason\":\"The student code is not on the enrolled list.\"}").andExpect(status().isNoContent());
        mvc.perform(get("/auth/me").header(HttpHeaders.AUTHORIZATION, auth)).andExpect(status().isUnauthorized());
        google("sub-041", "ittest.se199041@fpt.edu.vn", "Ho Van Tu").andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCOUNT_REJECTED"))
                .andExpect(jsonPath("$.message").value("Your student account was not verified: The student code is not on"
                        + " the enrolled list. Contact the dormitory office."));
    }

    /**
     * TC-AUTH-059 (security): a fictional back-office account of the seed signs in with its password only, so whoever
     * owns that address at FPT cannot take its role through Google; a real staff account still can.
     */
    @Test
    void demoBackOfficeAccountsRefuseGoogle() throws Exception {
        for (String email : new String[] { TestAuth.ADMIN, TestAuth.MANAGER_A, TestAuth.STAFF_A }) {
            google("sub-059-" + email, email, "Someone Else").andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("GOOGLE_NOT_FOR_DEMO"));
        }
        assertThat(jdbc.sql("SELECT count(*) FROM auth_user WHERE google_sub LIKE 'sub-059-%'").query(Long.class)
                .single()).isZero();
        jdbc.sql("""
                INSERT INTO auth_user (email, display_name, role, title)
                VALUES ('real.staff059@fpt.edu.vn', 'Tran Van That', 'STAFF', 'Residence Life Officer')
                """).update();
        google("sub-059-real", "real.staff059@fpt.edu.vn", "Tran Van That").andExpect(status().isOk())
                .andExpect(jsonPath("$.user.email").value("real.staff059@fpt.edu.vn"));
    }
}

package vn.fpt.campusstay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.ADMIN;
import static vn.fpt.campusstay.TestAuth.MANAGER_A;
import static vn.fpt.campusstay.TestAuth.MANAGER_B;
import static vn.fpt.campusstay.TestAuth.STAFF_A;
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
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** Manager › Staff accounts: Managers create Staff accounts, choose their Blocks and disable them (spec §3). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class StaffAccountsIT {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    private ResultActions json(MockHttpServletRequestBuilder request, String auth, String body) throws Exception {
        return mvc.perform(request.header(HttpHeaders.AUTHORIZATION, auth).contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private long id(String email) {
        return jdbc.sql("SELECT id FROM auth_user WHERE email = :e").param("e", email).query(Long.class).single();
    }

    /**
     * TC-AUTH-049: a Manager creates a Staff account for Blocks A and B; it is Invited and gets the set-password email;
     * the email, name and Blocks are checked; Staff cannot create accounts.
     */
    @Test
    void managerCreatesStaff() throws Exception {
        String manager = bearer(mvc, MANAGER_A);
        json(post("/staff-accounts"), manager, "{\"name\":\"\",\"email\":\"someone@gmail.com\",\"blocks\":[\"Z\"]}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.name").exists())
                .andExpect(jsonPath("$.details.fields.email").value("Use an @fpt.edu.vn email."))
                .andExpect(jsonPath("$.details.fields.blocks").value("Block Z does not exist."));
        json(post("/staff-accounts"), manager, "{\"name\":\"Duplicate\",\"email\":\"staff.a1@campusstay.test\",\"blocks\":[]}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.blocks").value("Choose the Blocks this person works in."));
        String body = json(post("/staff-accounts"), manager, """
                {"name":"Ngo Thi Moi","email":"ITTest.NewStaff@fpt.edu.vn","title":"Night desk officer","blocks":["B","A"]}""")
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String id = JsonPath.read(body, "$.id");
        mvc.perform(get("/staff-accounts").param("q", "Ngo Thi Moi").header(HttpHeaders.AUTHORIZATION, manager))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].id").value(id))
                .andExpect(jsonPath("$.items[0].email").value("ittest.newstaff@fpt.edu.vn"))
                .andExpect(jsonPath("$.items[0].status").value("Invited"))
                .andExpect(jsonPath("$.items[0].title").value("Night desk officer"))
                .andExpect(jsonPath("$.items[0].blocks", contains("A", "B")));
        mvc.perform(get("/staff-accounts").param("block", "B").param("status", "Invited")
                .header(HttpHeaders.AUTHORIZATION, bearer(mvc, MANAGER_B)))
                .andExpect(jsonPath("$.items[*].id", hasItem(id)));
        assertThat(jdbc.sql("SELECT count(*) FROM ntf_email_outbox WHERE to_email = 'ittest.newstaff@fpt.edu.vn'")
                .query(Long.class).single()).isEqualTo(1);
        json(post("/staff-accounts"), manager, """
                {"name":"Again","email":"ittest.newstaff@fpt.edu.vn","blocks":["A"]}""")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.email").value("An account with this email already exists."));
        json(post("/staff-accounts"), bearer(mvc, STAFF_A), "{\"name\":\"X\",\"email\":\"x@fpt.edu.vn\",\"blocks\":[\"A\"]}")
                .andExpect(status().isForbidden());
    }

    /**
     * TC-AUTH-050: a Manager renames a Staff member, changes the title and Blocks, disables the account (signed out)
     * and restores it; Managers and Admins are not Staff accounts (404); an invitation is resent only while Invited.
     */
    @Test
    void managerEditsStaff() throws Exception {
        String manager = bearer(mvc, MANAGER_A);
        String staff = bearer(mvc, "staff.a2@campusstay.test");
        long a2 = id("staff.a2@campusstay.test");
        json(put("/staff-accounts/" + a2), manager, """
                {"name":"Vo Thanh Tung Moi","title":"Senior technician","blocks":["A","B"]}""")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Vo Thanh Tung Moi"))
                .andExpect(jsonPath("$.title").value("Senior technician"))
                .andExpect(jsonPath("$.blocks", contains("A", "B")))
                .andExpect(jsonPath("$.status").value("Active"));
        json(put("/staff-accounts/" + a2), manager, "{\"status\":\"Disabled\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("Disabled"));
        mvc.perform(get("/auth/me").header(HttpHeaders.AUTHORIZATION, staff)).andExpect(status().isUnauthorized());
        mvc.perform(post("/staff-accounts/" + a2 + "/invitation").header(HttpHeaders.AUTHORIZATION, manager))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("NOT_INVITED"));
        json(put("/staff-accounts/" + a2), manager, "{\"status\":\"Active\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("Active"));
        json(put("/staff-accounts/" + a2), manager, "{\"status\":\"Invited\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("ALREADY_ACTIVE"));
        assertThat(jdbc.sql("SELECT count(*) FROM shared_audit_log WHERE object_id = :id AND action = 'USER_DISABLED'")
                .param("id", String.valueOf(a2)).query(Long.class).single()).isEqualTo(1);

        json(put("/staff-accounts/" + id(MANAGER_B)), manager, "{\"name\":\"Not Staff\"}").andExpect(status().isNotFound());
        json(put("/staff-accounts/" + id(ADMIN)), manager, "{\"name\":\"Not Staff\"}").andExpect(status().isNotFound());

        String invited = JsonPath.read(json(post("/staff-accounts"), manager, """
                {"name":"Cho Moi","email":"ittest.invited@fpt.edu.vn","blocks":["A"]}""")
                .andReturn().getResponse().getContentAsString(), "$.id");
        mvc.perform(post("/staff-accounts/" + invited + "/invitation").header(HttpHeaders.AUTHORIZATION, manager))
                .andExpect(status().isNoContent());
        assertThat(jdbc.sql("SELECT count(*) FROM ntf_email_outbox WHERE to_email = 'ittest.invited@fpt.edu.vn'")
                .query(Long.class).single()).isEqualTo(2);
    }

    /**
     * TC-NTF-040: emails remember whether their recipient is a fictional account: a seed account's are, a real
     * person's are not, so only the first may go to the demo mailbox (spec O-3).
     */
    @Test
    void outboxKnowsDemoRecipients() throws Exception {
        mvc.perform(post("/auth/password/forgot").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + STAFF_A + "\"}")).andExpect(status().isNoContent());
        json(post("/staff-accounts"), bearer(mvc, MANAGER_A), """
                {"name":"Real Person","email":"ittest.real.person@fpt.edu.vn","blocks":["A"]}""")
                .andExpect(status().isOk());
        assertThat(jdbc.sql("SELECT bool_and(demo_recipient) FROM ntf_email_outbox WHERE to_email = :e")
                .param("e", STAFF_A).query(Boolean.class).single()).isTrue();
        assertThat(jdbc.sql("SELECT bool_or(demo_recipient) FROM ntf_email_outbox WHERE to_email = 'ittest.real.person@fpt.edu.vn'")
                .query(Boolean.class).single()).isFalse();
    }
}

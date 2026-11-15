package vn.fpt.campusstay;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.STAFF_A;
import static vn.fpt.campusstay.TestAuth.bearer;

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

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** A student's own contact details and emergency contacts on My profile (TC-AUTH-060). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class StudentContactIT {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    private final JsonMapper json = JsonMapper.builder().build();

    private ResultActions send(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder req,
            String auth, String body) throws Exception {
        if (body != null) {
            req = req.contentType(MediaType.APPLICATION_JSON).content(body);
        }
        return mvc.perform(req.header(HttpHeaders.AUTHORIZATION, auth));
    }

    private JsonNode body(ResultActions result) throws Exception {
        return json.readTree(result.andReturn().getResponse().getContentAsString());
    }

    /**
     * TC-AUTH-060: a student edits their phone and personal email, adds emergency contacts up to the limit, edits,
     * reorders and removes them; the first contact is mirrored in the student record that Applications read, each
     * field is checked, another student's contact is not found and only students have contacts.
     */
    @Test
    void studentKeepsTheirContacts() throws Exception {
        String email = StayFlow.student(46);
        String student = bearer(mvc, email);
        jdbc.sql("""
                UPDATE auth_student SET emergency_name = 'Pham Van Ba', emergency_relationship = 'FATHER',
                       emergency_phone = '0912000111'
                WHERE user_id = (SELECT id FROM auth_user WHERE email = :email)
                """).param("email", email).update();

        // The single contact already on the record becomes the first of the list.
        send(get("/students/me/contacts"), student, null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value(email))
                .andExpect(jsonPath("$.emergencyContacts", hasSize(1)))
                .andExpect(jsonPath("$.emergencyContacts[0].name").value("Pham Van Ba"))
                .andExpect(jsonPath("$.emergencyContacts[0].relationshipLabel").value("Father"))
                .andExpect(jsonPath("$.emergencyContacts[0].primary").value(true))
                .andExpect(jsonPath("$.maxEmergencyContacts").value(3))
                .andExpect(jsonPath("$.relationships[0].value").value("FATHER"));

        send(put("/students/me/contacts"), student, "{\"phone\":\"12\",\"personalEmail\":\"not-an-email\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.phone").isString())
                .andExpect(jsonPath("$.details.fields.personalEmail").isString());
        send(put("/students/me/contacts"), student, "{\"phone\":\" 0901 234 567 \",\"personalEmail\":\"me@example.com\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.phone").value("0901 234 567"))
                .andExpect(jsonPath("$.personalEmail").value("me@example.com"));

        send(post("/students/me/contacts/emergency"), student, "{\"name\":\"A\",\"relationship\":\"Cousin\",\"phone\":\"1\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.name").isString())
                .andExpect(jsonPath("$.details.fields.relationship").isString())
                .andExpect(jsonPath("$.details.fields.phone").isString());
        send(post("/students/me/contacts/emergency"), student,
                "{\"name\":\"Le Thi Hoa\",\"relationship\":\"Mother\",\"phone\":\"0988777666\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.emergencyContacts", hasSize(2)))
                .andExpect(jsonPath("$.emergencyContacts[1].relationship").value("MOTHER"));
        JsonNode third = body(send(post("/students/me/contacts/emergency"), student,
                "{\"name\":\"Pham Thi Lan\",\"relationship\":\"SIBLING\",\"phone\":\"0977111222\"}")
                .andExpect(status().isOk()));
        send(post("/students/me/contacts/emergency"), student,
                "{\"name\":\"Tran Van Nam\",\"relationship\":\"GUARDIAN\",\"phone\":\"0966111222\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("EMERGENCY_CONTACTS_FULL"));

        // The sibling becomes the first contact: the student record follows.
        String siblingId = third.get("emergencyContacts").get(2).get("id").asString();
        send(post("/students/me/contacts/emergency/" + siblingId + "/primary"), student, null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.emergencyContacts[0].name").value("Pham Thi Lan"))
                .andExpect(jsonPath("$.emergencyContacts[0].primary").value(true))
                .andExpect(jsonPath("$.emergencyContacts[1].name").value("Pham Van Ba"));
        send(put("/students/me/contacts/emergency/" + siblingId), student,
                "{\"name\":\"Pham Thi Lan Anh\",\"relationship\":\"SIBLING\",\"phone\":\"0977111333\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.emergencyContacts[0].name").value("Pham Thi Lan Anh"));
        String mirrored = jdbc.sql("""
                SELECT emergency_name || '|' || emergency_relationship || '|' || emergency_phone FROM auth_student
                WHERE user_id = (SELECT id FROM auth_user WHERE email = :email)
                """).param("email", email).query(String.class).single();
        org.junit.jupiter.api.Assertions.assertEquals("Pham Thi Lan Anh|SIBLING|0977111333", mirrored);

        // Another student cannot touch it.
        String other = bearer(mvc, StayFlow.student(45));
        send(delete("/students/me/contacts/emergency/" + siblingId), other, null).andExpect(status().isNotFound());

        send(delete("/students/me/contacts/emergency/" + siblingId), student, null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.emergencyContacts", hasSize(2)))
                .andExpect(jsonPath("$.emergencyContacts[0].name").value("Pham Van Ba"));

        send(get("/students/me/contacts"), bearer(mvc, STAFF_A), null).andExpect(status().isForbidden());
    }
}

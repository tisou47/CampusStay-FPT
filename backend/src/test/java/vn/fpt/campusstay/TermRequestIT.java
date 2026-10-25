package vn.fpt.campusstay;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.ADMIN;
import static vn.fpt.campusstay.TestAuth.MANAGER_A;
import static vn.fpt.campusstay.TestAuth.MANAGER_B;
import static vn.fpt.campusstay.TestAuth.STAFF_A;
import static vn.fpt.campusstay.TestAuth.STUDENT;
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

import com.jayway.jsonpath.JsonPath;

/**
 * Registration-period requests (spec §6.3, D-10, D-11; TC-CFG-016…018): a Manager asks the Admin to open a Term;
 * Admins and the other Managers are told; Managers comment; the Admin sends it back, the Manager sends it again, the
 * Admin rejects it.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class TermRequestIT {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    private String id(String table, String column, String value) {
        return jdbc.sql("SELECT id::text FROM " + table + " WHERE " + column + " = :v").param("v", value)
                .query(String.class).single();
    }

    /** A request for {@code name} staying in 2033 (no other Term uses those dates). */
    private String body(String name, String extra) {
        return """
                {"termName":"%s","stayStart":"2033-01-10","stayEnd":"2033-04-30",
                 "timeline":{"registrationOpensAt":"2032-11-01T01:00:00Z","registrationClosesAt":"2032-11-25T16:59:00Z",
                             "resultsPublishedAt":"2032-12-01T01:00:00Z"},
                 "blocks":["A"],"excludedRooms":["a-101"],
                 "places":[{"roomTypeId":"%s","roomClassId":"%s","gender":"M","places":40}],
                 "prices":[{"roomTypeId":"%s","roomClassId":"%s","price":7500000}],
                 "notes":"Standard Rooms of Block A only"%s}"""
                .formatted(name, id("cfg_room_type", "name", "4-bed"), id("cfg_room_class", "name", "Standard"),
                        id("cfg_room_type", "name", "4-bed"), id("cfg_room_class", "name", "Standard"), extra);
    }

    private ResultActions send(String method, String path, String auth, String json) throws Exception {
        var builder = switch (method) {
            case "PUT" -> put(path);
            default -> post(path);
        };
        return mvc.perform(builder.header(HttpHeaders.AUTHORIZATION, auth).contentType(MediaType.APPLICATION_JSON)
                .content(json));
    }

    private static String content(ResultActions result) throws Exception {
        return result.andReturn().getResponse().getContentAsString();
    }

    /**
     * TC-CFG-016: a Manager files a request; it is Submitted with its proposal and history, every Admin and every
     * other Manager is notified with a link to the requests list, and the requester is not.
     */
    @Test
    void managerFilesARequest() throws Exception {
        String managerA = bearer(mvc, MANAGER_A);
        String created = content(send("POST", "/term-requests", managerA, body("Spring 2033", ""))
                .andExpect(status().isCreated()));
        String id = JsonPath.read(created, "$.id");

        mvc.perform(get("/term-requests/" + id).header(HttpHeaders.AUTHORIZATION, managerA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("RP-" + id))
                .andExpect(jsonPath("$.status").value("Submitted"))
                .andExpect(jsonPath("$.termName").value("Spring 2033"))
                .andExpect(jsonPath("$.blocks", contains("A")))
                .andExpect(jsonPath("$.excludedRooms", contains("A-101")))
                .andExpect(jsonPath("$.places[0].roomType").value("4-bed"))
                .andExpect(jsonPath("$.places[0].gender").value("M"))
                .andExpect(jsonPath("$.prices[0].price").value(7500000))
                .andExpect(jsonPath("$.prices[0].defaultPrice").value(6900000))
                .andExpect(jsonPath("$.history[0].kind").value("Submitted"))
                .andExpect(jsonPath("$.actions.edit").value(true))
                .andExpect(jsonPath("$.actions.decide").value(false));

        String admin = bearer(mvc, ADMIN);
        mvc.perform(get("/term-requests").header(HttpHeaders.AUTHORIZATION, admin).param("status", "Open"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].id").value(id))
                .andExpect(jsonPath("$.items[0].requestedBy").value("Le Hoang Nam"))
                .andExpect(jsonPath("$.counts.Submitted").value(1));
        mvc.perform(get("/notifications").header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(jsonPath("$.items[0].title").value("Registration period requested · Spring 2033"))
                .andExpect(jsonPath("$.items[0].link").value("/admin/term-requests?id=" + id));
        mvc.perform(get("/notifications").header(HttpHeaders.AUTHORIZATION, bearer(mvc, MANAGER_B)))
                .andExpect(jsonPath("$.items[0].link").value("/manager/term-requests?id=" + id));
        mvc.perform(get("/notifications").header(HttpHeaders.AUTHORIZATION, managerA))
                .andExpect(jsonPath("$.items[*].title", not(hasItem("Registration period requested · Spring 2033"))));
    }

    /**
     * TC-CFG-017 (negative): missing fields and an unknown Block are named per field; a second open request for the
     * same Term is refused; Staff and students cannot file or read requests.
     */
    @Test
    void refusesInvalidAndDuplicateRequests() throws Exception {
        String manager = bearer(mvc, MANAGER_A);
        send("POST", "/term-requests", manager, "{\"termName\":\" \"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.termName").exists())
                .andExpect(jsonPath("$.details.fields.stayStart").value("Enter the first day of the stay."))
                .andExpect(jsonPath("$.details.fields.registrationOpensAt").value("Enter when registration opens."));
        send("POST", "/term-requests", manager, body("Fall 2033", "").replace("[\"A\"]", "[\"Z\"]"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.blocks").value("Block Z does not exist."));
        send("POST", "/term-requests", manager, body("Fall 2033", "")).andExpect(status().isCreated());
        send("POST", "/term-requests", bearer(mvc, MANAGER_B), body("fall 2033", ""))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("TERM_REQUEST_OPEN"));
        send("POST", "/term-requests", bearer(mvc, STAFF_A), body("Summer 2033", ""))
                .andExpect(status().isForbidden());
        mvc.perform(get("/term-requests").header(HttpHeaders.AUTHORIZATION, bearer(mvc, STUDENT)))
                .andExpect(status().isForbidden());
    }

    /**
     * TC-CFG-018: another Manager comments (the requester and the Admin are told); the Admin asks for changes only
     * with a note; the requester changes and sends it again; the Admin rejects it with a reason; a closed request
     * takes no comment, and every step is in the history.
     */
    @Test
    void commentsChangesAndRejection() throws Exception {
        String managerA = bearer(mvc, MANAGER_A);
        String managerB = bearer(mvc, MANAGER_B);
        String admin = bearer(mvc, ADMIN);
        String id = JsonPath.read(content(send("POST", "/term-requests", managerA, body("Summer 2034", "")
                .replace("2033-01-10", "2034-05-10").replace("2033-04-30", "2034-08-20"))), "$.id");

        send("POST", "/term-requests/" + id + "/comments", managerB, "{\"text\":\"Block B is free in summer too.\"}")
                .andExpect(status().isNoContent());
        mvc.perform(get("/notifications").header(HttpHeaders.AUTHORIZATION, managerA))
                .andExpect(jsonPath("$.items[0].title").value("New comment · Summer 2034"))
                .andExpect(jsonPath("$.items[0].body").value("Pham Thu Ha on RP-" + id + ": Block B is free in summer too."));

        send("POST", "/term-requests/" + id + "/decision", admin, "{\"status\":\"Needs changes\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.note").value("Say what the Manager should change."));
        send("POST", "/term-requests/" + id + "/decision", managerB, "{\"status\":\"Rejected\",\"note\":\"No\"}")
                .andExpect(status().isForbidden());
        send("POST", "/term-requests/" + id + "/decision", admin,
                "{\"status\":\"Needs changes\",\"note\":\"Add the places for female students.\"}")
                .andExpect(status().isNoContent());
        mvc.perform(get("/notifications").header(HttpHeaders.AUTHORIZATION, managerA))
                .andExpect(jsonPath("$.items[0].title").value("Changes needed · Summer 2034"));

        send("PUT", "/term-requests/" + id, managerB, body("Summer 2034", "")).andExpect(status().isForbidden());
        send("PUT", "/term-requests/" + id, managerA, body("Summer 2034", "")
                .replace("2033-01-10", "2034-05-10").replace("2033-04-30", "2034-08-20")
                .replace("\"gender\":\"M\",\"places\":40}", "\"gender\":\"M\",\"places\":40},{\"roomTypeId\":\""
                        + id("cfg_room_type", "name", "4-bed") + "\",\"roomClassId\":\""
                        + id("cfg_room_class", "name", "Standard") + "\",\"gender\":\"F\",\"places\":30}"))
                .andExpect(status().isOk());
        mvc.perform(get("/term-requests/" + id).header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(jsonPath("$.status").value("Submitted"))
                .andExpect(jsonPath("$.places[1].gender").value("F"))
                .andExpect(jsonPath("$.actions.decide").value(true))
                .andExpect(jsonPath("$.actions.build").value(true));

        send("POST", "/term-requests/" + id + "/decision", admin,
                "{\"status\":\"Rejected\",\"note\":\"Summer stays closed this year.\"}")
                .andExpect(status().isNoContent());
        send("POST", "/term-requests/" + id + "/comments", managerB, "{\"text\":\"Too bad.\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("REQUEST_CLOSED"));
        mvc.perform(get("/term-requests/" + id).header(HttpHeaders.AUTHORIZATION, managerA))
                .andExpect(jsonPath("$.status").value("Rejected"))
                .andExpect(jsonPath("$.decisionNote").value("Summer stays closed this year."))
                .andExpect(jsonPath("$.history[*].kind",
                        contains("Submitted", "Comment", "Needs changes", "Submitted", "Rejected")))
                .andExpect(jsonPath("$.actions.edit").value(false));
        mvc.perform(get("/notifications").header(HttpHeaders.AUTHORIZATION, managerA))
                .andExpect(jsonPath("$.items[0].title").value("Request rejected · Summer 2034"));
    }
}

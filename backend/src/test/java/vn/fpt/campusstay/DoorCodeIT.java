package vn.fpt.campusstay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.matchesPattern;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.ADMIN;
import static vn.fpt.campusstay.TestAuth.MANAGER_B;
import static vn.fpt.campusstay.TestAuth.STAFF_A;
import static vn.fpt.campusstay.TestAuth.STAFF_B2;
import static vn.fpt.campusstay.TestAuth.bearer;

import java.nio.charset.StandardCharsets;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.support.TransactionTemplate;

import vn.fpt.campusstay.event.ResidentLeftRoom;

/** Door codes: set, confirm, view, import, rotation and the student's code (ADR-23, spec §6.8; TC-INV-019…023). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class DoorCodeIT {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    ApplicationEventPublisher events;

    @Autowired
    TransactionTemplate transactions;

    StayFlow stay;

    @BeforeEach
    void setUp() {
        long fall = jdbc.sql("SELECT id FROM cfg_term WHERE code = 'FA26'").query(Long.class).single();
        stay = new StayFlow(mvc, jdbc, null, fall);
    }

    private ResultActions propose(String auth, String room, String code) throws Exception {
        return mvc.perform(post("/door-codes/" + room).header(HttpHeaders.AUTHORIZATION, auth)
                .contentType(MediaType.APPLICATION_JSON).content(code == null ? "{}" : "{\"code\":\"" + code + "\"}"));
    }

    private ResultActions act(String auth, String room, String action) throws Exception {
        return mvc.perform(post("/door-codes/" + room + "/" + action).header(HttpHeaders.AUTHORIZATION, auth));
    }

    private long notifications(String email, String key) {
        return jdbc.sql("""
                SELECT count(*) FROM ntf_notification n JOIN auth_user u ON u.id = n.user_id
                WHERE u.email = :e AND n.event_key = :k
                """).param("e", email).param("k", key).query(Long.class).single();
    }

    /**
     * TC-INV-019: Staff draw a random code, read it to set the lock, confirm it, and it becomes the Room's code; the
     * database holds it encrypted and every view is in the Audit Log.
     */
    @Test
    void proposesConfirmsAndReveals() throws Exception {
        String staff = bearer(mvc, STAFF_A);
        String body = propose(staff, "A-101", null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.room").value("A-101"))
                .andExpect(jsonPath("$.code", matchesPattern("\\d{6}")))
                .andReturn().getResponse().getContentAsString();
        String code = JsonPath.read(body, "$.code");
        mvc.perform(get("/door-codes").header(HttpHeaders.AUTHORIZATION, staff).param("status", "Waiting for confirmation"))
                .andExpect(jsonPath("$.items[*].room", hasItem("A-101")))
                .andExpect(jsonPath("$.items[?(@.room == 'A-101')].status", contains("Not set")))
                .andExpect(jsonPath("$.items[?(@.room == 'A-101')].proposed", contains(true)))
                .andExpect(jsonPath("$.counts.proposed").isNumber());
        act(staff, "A-101", "reveal")
                .andExpect(jsonPath("$.active").value((Object) null))
                .andExpect(jsonPath("$.proposed").value(code));
        act(staff, "a-101", "confirm").andExpect(status().isNoContent());
        mvc.perform(get("/door-codes").header(HttpHeaders.AUTHORIZATION, staff).param("q", "A-101"))
                .andExpect(jsonPath("$.items[0].status").value("Active"))
                .andExpect(jsonPath("$.items[0].proposed").value(false))
                .andExpect(jsonPath("$.items[0].activeSince").isString());
        act(staff, "A-101", "reveal")
                .andExpect(jsonPath("$.active").value(code))
                .andExpect(jsonPath("$.proposed").value((Object) null));
        String stored = jdbc.sql("""
                SELECT d.code_cipher FROM inv_door_code d JOIN inv_room r ON r.id = d.room_id
                WHERE r.code = 'A-101' AND d.status = 'ACTIVE'
                """).query(String.class).single();
        assertThat(stored).doesNotContain(code);
        mvc.perform(get("/admin/audit-log").header(HttpHeaders.AUTHORIZATION, bearer(mvc, ADMIN)).param("q", "A-101")
                        .param("action", "Door code viewed"))
                .andExpect(jsonPath("$.total").value(2));
        // A Manager works for every Block (ADR-19).
        propose(bearer(mvc, MANAGER_B), "B-101", "135790").andExpect(status().isOk());
    }

    /** TC-INV-020 (validation, scope, permission): codes are 6 new digits; other Blocks and other roles are refused. */
    @Test
    void refusesWrongCodes() throws Exception {
        String staff = bearer(mvc, STAFF_A);
        propose(staff, "A-201", "12345")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.code").value("Enter 6 digits."));
        propose(staff, "A-201", "246802").andExpect(status().isOk());
        act(staff, "A-201", "confirm").andExpect(status().isNoContent());
        propose(staff, "A-201", "246802")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.code").value("Choose a code different from the current one."));
        act(staff, "A-201", "confirm")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("NO_PROPOSED_CODE"));
        propose(staff, "A-201", "111111").andExpect(status().isOk());
        act(staff, "A-201", "cancel").andExpect(status().isNoContent());
        act(staff, "A-201", "reveal").andExpect(jsonPath("$.active").value("246802"))
                .andExpect(jsonPath("$.proposed").value((Object) null));
        propose(bearer(mvc, STAFF_B2), "A-201", null)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("BLOCK_OUT_OF_SCOPE"));
        mvc.perform(get("/door-codes").header(HttpHeaders.AUTHORIZATION, bearer(mvc, ADMIN)))
                .andExpect(status().isForbidden());
        mvc.perform(get("/door-codes").header(HttpHeaders.AUTHORIZATION, bearer(mvc, TestAuth.STUDENT)))
                .andExpect(status().isForbidden());
        propose(staff, "A-999", null).andExpect(status().isNotFound());
    }

    /** TC-INV-021: a CSV of Rooms and codes is checked line by line; a correct file proposes every code at once. */
    @Test
    void importsCodes() throws Exception {
        String staff = bearer(mvc, STAFF_A);
        MockMultipartFile bad = new MockMultipartFile("file", "codes.csv", "text/csv",
                "Room,Code\nA-301,123456\nB-301,123456\nA-302,12ab56\nA-301,654321\n".getBytes(StandardCharsets.UTF_8));
        mvc.perform(multipart("/door-codes/import").file(bad).header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.line3").value("Line 3: Room B-301 is not one of your Rooms."))
                .andExpect(jsonPath("$.details.fields.line4").value("Line 4: the code must be 6 digits."))
                .andExpect(jsonPath("$.details.fields.line5").value("Line 5: Room A-301 is in the file twice."));
        mvc.perform(multipart("/door-codes/import").file(bad).header(HttpHeaders.AUTHORIZATION, staff)
                        .header(HttpHeaders.ACCEPT_LANGUAGE, "vi"))
                .andExpect(jsonPath("$.details.fields.line4").value("Dòng 4: mã phải gồm 6 chữ số."));
        assertThat(jdbc.sql("""
                SELECT count(*) FROM inv_door_code d JOIN inv_room r ON r.id = d.room_id WHERE r.code IN ('A-301', 'A-302')
                """).query(Long.class).single()).isZero();
        MockMultipartFile good = new MockMultipartFile("file", "codes.csv", "text/csv",
                "﻿Room;Code\na-301;123456\nA-302;654321\n".getBytes(StandardCharsets.UTF_8));
        mvc.perform(multipart("/door-codes/import").file(good).header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.proposed").value(2));
        act(staff, "A-302", "reveal").andExpect(jsonPath("$.proposed").value("654321"));
    }

    /**
     * TC-INV-022: when a resident leaves a Room its code must change: a task opens once, the Block's Staff are told,
     * and confirming the new code closes it and tells the remaining residents (never the code itself).
     */
    @Test
    void rotatesTheCodeWhenSomeoneLeaves() throws Exception {
        stay.livesIn(1, "A-103", "A", true);
        stay.livesIn(2, "A-103", "B", true);
        long room = jdbc.sql("SELECT id FROM inv_room WHERE code = 'A-103'").query(Long.class).single();
        transactions.executeWithoutResult(s -> {
            events.publishEvent(new ResidentLeftRoom(room, "CHECK_OUT"));
            events.publishEvent(new ResidentLeftRoom(room, "MOVE_OUT"));
        });
        String staff = bearer(mvc, STAFF_A);
        mvc.perform(get("/door-codes").header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(jsonPath("$.items[0].room").value("A-103"))
                .andExpect(jsonPath("$.items[0].status").value("Change needed"))
                .andExpect(jsonPath("$.items[0].task.reason").value("Check-out"))
                .andExpect(jsonPath("$.items[0].residents").value(2))
                .andExpect(jsonPath("$.counts.toChange").value(1));
        assertThat(notifications(STAFF_A, "DOOR_CODE_TO_SET")).isEqualTo(1);
        assertThat(notifications("staff.b2@campusstay.test", "DOOR_CODE_TO_SET")).isZero();
        propose(staff, "A-103", "908172").andExpect(status().isOk());
        act(staff, "A-103", "confirm").andExpect(status().isNoContent());
        mvc.perform(get("/door-codes").header(HttpHeaders.AUTHORIZATION, staff).param("q", "A-103"))
                .andExpect(jsonPath("$.items[0].status").value("Active"))
                .andExpect(jsonPath("$.items[0].task").value((Object) null));
        assertThat(notifications(StayFlow.student(1), "DOOR_CODE_CHANGED")).isEqualTo(1);
        String text = jdbc.sql("""
                SELECT n.body || n.title || n.body_vi FROM ntf_notification n JOIN auth_user u ON u.id = n.user_id
                WHERE u.email = :e AND n.event_key = 'DOOR_CODE_CHANGED'
                """).param("e", StayFlow.student(2)).query(String.class).single();
        assertThat(text).contains("A-103").doesNotContain("908172");
    }

    /**
     * TC-INV-023: a student sees the code of the Room they are checked in to, once Staff confirmed it; before
     * check-in or without a Bed there is nothing to show.
     */
    @Test
    void showsTheStudentTheirCode() throws Exception {
        stay.livesIn(5, "A-104", "A", false);
        String student = bearer(mvc, StayFlow.student(5));
        mvc.perform(get("/students/me/door-code").header(HttpHeaders.AUTHORIZATION, student))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.room").value("A-104"))
                .andExpect(jsonPath("$.status").value("Not ready"));
        mvc.perform(post("/students/me/door-code/reveal").header(HttpHeaders.AUTHORIZATION, student))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("DOOR_CODE_NOT_READY"));
        jdbc.sql("""
                UPDATE asg_allocation SET checked_in_at = now()
                WHERE student_id = (SELECT id FROM auth_user WHERE email = :e) AND status = 'ACTIVE'
                """).param("e", StayFlow.student(5)).update();
        mvc.perform(get("/students/me/door-code").header(HttpHeaders.AUTHORIZATION, student))
                .andExpect(jsonPath("$.status").value("Not set"));
        String staff = bearer(mvc, STAFF_A);
        propose(staff, "A-104", "564738").andExpect(status().isOk());
        act(staff, "A-104", "confirm").andExpect(status().isNoContent());
        mvc.perform(get("/students/me/door-code").header(HttpHeaders.AUTHORIZATION, student))
                .andExpect(jsonPath("$.status").value("Ready"))
                .andExpect(jsonPath("$.changedAt").isString());
        mvc.perform(post("/students/me/door-code/reveal").header(HttpHeaders.AUTHORIZATION, student))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("564738"));
        mvc.perform(get("/students/me/furniture").header(HttpHeaders.AUTHORIZATION, student))
                .andExpect(jsonPath("$.room").value("A-104"))
                .andExpect(jsonPath("$.items[*].type", contains("Ceiling fan")));
        mvc.perform(get("/students/me/door-code").header(HttpHeaders.AUTHORIZATION, bearer(mvc, StayFlow.student(20))))
                .andExpect(status().isNotFound());
        mvc.perform(get("/students/me/door-code").header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(status().isForbidden());
    }
}

package vn.fpt.campusstay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.MANAGER_A;
import static vn.fpt.campusstay.TestAuth.MANAGER_B;
import static vn.fpt.campusstay.TestAuth.STAFF_A;
import static vn.fpt.campusstay.TestAuth.bearer;

import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

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

/**
 * Manager › Staff and workload: open work by kind and lateness, the overload mark, the Block's queue, one person's work
 * and moving it to someone else (TC-AUTH-061…070). Each test works with staff members of its own so the counts of one
 * test never depend on another.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class StaffWorkloadIT {

    private static final AtomicInteger SEQ = new AtomicInteger();

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    StayFlow stay;

    @BeforeEach
    void openTerm() {
        ApplyFlow flow = new ApplyFlow(mvc, jdbc);
        stay = new StayFlow(mvc, jdbc, flow, flow.openTerm());
    }

    // ---------------------------------------------------------------- helpers

    /** A Staff member of Block A (and the other Blocks given) who handles the request types given (codes). */
    private long staff(String name, String handles, String... otherBlocks) {
        String email = "wl" + SEQ.incrementAndGet() + "@campusstay.test";
        long id = jdbc.sql("""
                INSERT INTO auth_user (email, display_name, password_hash, role, title)
                SELECT :email, :name, password_hash, 'STAFF', 'Maintenance Technician' FROM auth_user
                WHERE email = 'staff.a1@campusstay.test' RETURNING id
                """).param("email", email).param("name", name).query(Long.class).single();
        jdbc.sql("""
                INSERT INTO auth_user_block (user_id, building_id)
                SELECT :id, b.id FROM inv_building b WHERE b.code = 'A' OR b.code IN (:others)
                """).param("id", id).param("others", otherBlocks.length == 0 ? List.of("-") : List.of(otherBlocks))
                .update();
        jdbc.sql("INSERT INTO auth_staff_profile (user_id, handles, on_duty) VALUES (:id, string_to_array(:h, ','), TRUE)")
                .param("id", id).param("h", handles).update();
        return id;
    }

    /** An open Maintenance Request of Room A-201 assigned to the person; {@code late} puts its SLA in the past. */
    private long maintenance(long assignee, boolean late) {
        return jdbc.sql("""
                INSERT INTO mnt_request (code, room_id, building_id, room_code, reporter_id, title, description, category,
                                         location, urgency, priority, status, assignee_id, sla_due_at, reported_at)
                SELECT :code, r.id, r.building_id, r.code, u.id, 'Tap is leaking', 'Water drips all night.', 'PLUMBING',
                       'BATHROOM', 'NORMAL', 'MEDIUM', 'ASSIGNED', :a,
                       now() + CASE WHEN :late THEN interval '-2 hours' ELSE interval '2 days' END, now() - interval '1 day'
                FROM inv_room r, auth_user u WHERE r.code = 'A-201' AND u.email = :student
                RETURNING id
                """).param("code", "MR-W%05d".formatted(SEQ.incrementAndGet())).param("a", assignee).param("late", late)
                .param("student", StayFlow.student(1)).query(Long.class).single();
    }

    /** A scheduled inspection run of Block A with the person as inspector. */
    private long inspection(long inspector) {
        jdbc.sql("""
                INSERT INTO mnt_checklist (family_key, name, version, status) VALUES ('WORKLOAD_TEST', 'Fire safety', 1, 'DRAFT')
                ON CONFLICT (family_key, version) DO NOTHING
                """).update();
        return jdbc.sql("""
                INSERT INTO mnt_inspection_run (building_id, checklist_id, run_date, due_at, inspector_id, status)
                SELECT b.id, c.id, current_date + 1, now() + interval '2 days', :i, 'SCHEDULED'
                FROM inv_building b, mnt_checklist c WHERE b.code = 'A' AND c.family_key = 'WORKLOAD_TEST'
                RETURNING id
                """).param("i", inspector).query(Long.class).single();
    }

    private ResultActions list(String auth) throws Exception {
        return mvc.perform(get("/block-staff").param("block", "A").header(HttpHeaders.AUTHORIZATION, auth));
    }

    private ResultActions reassign(long from, String body) throws Exception {
        return mvc.perform(post("/block-staff/" + from + "/work/reassign").header(HttpHeaders.AUTHORIZATION,
                bearer(mvc, MANAGER_A)).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private static String person(String name) {
        return "$.items[?(@.name == '" + name + "')]";
    }

    private Long assignee(long requestId) {
        return jdbc.sql("SELECT assignee_id FROM mnt_request WHERE id = :id").param("id", requestId).query(Long.class)
                .single();
    }

    // ---------------------------------------------------------------- tests

    /** TC-AUTH-061: a Manager changing someone's duty must say why; the reason is kept in the Audit Log. */
    @Test
    void changingSomeonesDutyNeedsANote() throws Exception {
        long id = staff("Duty Person", "DESK");
        String manager = bearer(mvc, MANAGER_A);
        mvc.perform(put("/block-staff/" + id).header(HttpHeaders.AUTHORIZATION, manager)
                .contentType(MediaType.APPLICATION_JSON).content("{\"onDuty\":false}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.note").exists());
        mvc.perform(put("/block-staff/" + id).header(HttpHeaders.AUTHORIZATION, manager)
                .contentType(MediaType.APPLICATION_JSON).content("{\"onDuty\":false,\"note\":\"Sick leave today\"}"))
                .andExpect(status().isNoContent());
        assertThat(jdbc.sql("SELECT on_duty FROM auth_staff_profile WHERE user_id = :id").param("id", id)
                .query(Boolean.class).single()).isFalse();
        assertThat(jdbc.sql("""
                SELECT change::text FROM shared_audit_log WHERE action = 'STAFF_PROFILE_UPDATED' AND object_id = :id
                """).param("id", String.valueOf(id)).query(String.class).single()).contains("Sick leave today");
        // Handles alone need no note.
        mvc.perform(put("/block-staff/" + id).header(HttpHeaders.AUTHORIZATION, manager)
                .contentType(MediaType.APPLICATION_JSON).content("{\"handles\":[\"Payments\"]}"))
                .andExpect(status().isNoContent());
    }

    /** TC-AUTH-062: open work is split by kind, a Maintenance Request past its SLA counts as overdue. */
    @Test
    void splitsOpenWorkByKindAndCountsOverdue() throws Exception {
        long id = staff("Split Person", "MAINTENANCE");
        maintenance(id, true);
        maintenance(id, false);
        list(bearer(mvc, MANAGER_A)).andExpect(status().isOk())
                .andExpect(jsonPath(person("Split Person") + ".open").value(hasItem(2)))
                .andExpect(jsonPath(person("Split Person") + ".openByType.Maintenance").value(hasItem(2)))
                .andExpect(jsonPath(person("Split Person") + ".openByType['Room change']").value(hasItem(0)))
                .andExpect(jsonPath(person("Split Person") + ".openByType.Inspection").value(hasItem(0)))
                .andExpect(jsonPath(person("Split Person") + ".overdue").value(hasItem(1)))
                .andExpect(jsonPath(person("Split Person") + ".oldestOpenAt").isNotEmpty())
                .andExpect(jsonPath("$.summary.overdue").isNumber())
                .andExpect(jsonPath("$.summary.maxOpen").value(8));
    }

    /** TC-AUTH-063: an inspection run with the person as inspector counts as Inspection work. */
    @Test
    void countsAnInspectionRun() throws Exception {
        long id = staff("Inspector Person", "INSPECTIONS");
        inspection(id);
        list(bearer(mvc, MANAGER_A))
                .andExpect(jsonPath(person("Inspector Person") + ".openByType.Inspection").value(hasItem(1)))
                .andExpect(jsonPath(person("Inspector Person") + ".open").value(hasItem(1)))
                .andExpect(jsonPath(person("Inspector Person") + ".overdue").value(hasItem(0)));
    }

    /** TC-AUTH-064: a person is overloaded above {@code workload.max_open_per_staff}, not at it. */
    @Test
    void marksOverloadAboveTheLimit() throws Exception {
        long id = staff("Busy Person", "MAINTENANCE");
        jdbc.sql("UPDATE cfg_parameter SET value = '2' WHERE key = 'workload.max_open_per_staff'").update();
        try {
            maintenance(id, false);
            maintenance(id, false);
            list(bearer(mvc, MANAGER_A)).andExpect(jsonPath(person("Busy Person") + ".overloaded").value(hasItem(false)));
            maintenance(id, false);
            list(bearer(mvc, MANAGER_A)).andExpect(jsonPath(person("Busy Person") + ".overloaded").value(hasItem(true)))
                    .andExpect(jsonPath("$.summary.overloaded").isNumber());
        } finally {
            jdbc.sql("UPDATE cfg_parameter SET value = '8' WHERE key = 'workload.max_open_per_staff'").update();
        }
    }

    /** TC-AUTH-065: a swap waiting for Staff is in the Block's queue and in nobody's open count. */
    @Test
    void aSwapWaitingForStaffIsInTheBlockQueue() throws Exception {
        String manager = bearer(mvc, MANAGER_A);
        java.util.List<Integer> counts = com.jayway.jsonpath.JsonPath.read(list(manager).andReturn().getResponse().getContentAsString(),
                "$.queue[?(@.type == 'SWAP_WAITING_STAFF')].count");
        int before = counts.get(0);
        long open = ((Number) com.jayway.jsonpath.JsonPath.read(list(manager).andReturn().getResponse()
                .getContentAsString(), "$.summary.open")).longValue();
        stay.livesIn(30, "A-201", "A", true);
        stay.livesIn(31, "A-201", "B", true);
        jdbc.sql("""
                INSERT INTO req_swap (term_id, kind, a_allocation_id, b_allocation_id, status, cross_block, expires_at,
                                      agreed_at, a_building_id, b_building_id)
                SELECT :t, 'DIRECT', a.id, b.id, 'PENDING', FALSE, now() + interval '1 day', now(), r.building_id,
                       r.building_id
                FROM asg_allocation a, asg_allocation b, inv_room r
                WHERE a.term_id = :t AND b.term_id = :t AND r.code = 'A-201'
                  AND a.student_id = (SELECT id FROM auth_user WHERE email = :sa)
                  AND b.student_id = (SELECT id FROM auth_user WHERE email = :sb)
                """).param("t", stay.termId()).param("sa", StayFlow.student(30)).param("sb", StayFlow.student(31))
                .update();
        list(manager)
                .andExpect(jsonPath("$.queue[?(@.type == 'SWAP_WAITING_STAFF')].count").value(contains(before + 1)))
                .andExpect(jsonPath("$.queue[?(@.type == 'SWAP_WAITING_STAFF')].link")
                        .value(contains("/manager/room-changes/swaps")))
                .andExpect(jsonPath("$.queue[?(@.type == 'NEXT_TERM_WAITING')].count").isNotEmpty())
                .andExpect(jsonPath("$.summary.open").value((int) open));
    }

    /** TC-AUTH-066: one person's open work is listed with the overdue items first. */
    @Test
    void listsAPersonsWorkOverdueFirst() throws Exception {
        long id = staff("Listed Person", "MAINTENANCE,INSPECTIONS");
        long onTime = maintenance(id, false);
        long late = maintenance(id, true);
        inspection(id);
        mvc.perform(get("/block-staff/" + id + "/work").header(HttpHeaders.AUTHORIZATION, bearer(mvc, MANAGER_A)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(3))
                .andExpect(jsonPath("$.items[0].id").value(String.valueOf(late)))
                .andExpect(jsonPath("$.items[0].overdue").value(true))
                .andExpect(jsonPath("$.items[0].type").value("Maintenance"))
                .andExpect(jsonPath("$.items[0].roomCode").value("A-201"))
                .andExpect(jsonPath("$.items[*].id", hasItem(String.valueOf(onTime))))
                .andExpect(jsonPath("$.items[*].type", hasItem("Inspection")));
    }

    /** TC-AUTH-067: the work of someone who shares no Block with the Manager is not found; Staff may not read it. */
    @Test
    void cannotReadWorkOutsideTheBlocks() throws Exception {
        String manager = bearer(mvc, MANAGER_A);
        mvc.perform(get("/block-staff/" + stay.userId(MANAGER_B) + "/work").header(HttpHeaders.AUTHORIZATION, manager))
                .andExpect(status().isNotFound());
        mvc.perform(get("/block-staff/" + stay.userId(StayFlow.student(2)) + "/work")
                .header(HttpHeaders.AUTHORIZATION, manager)).andExpect(status().isNotFound());
        mvc.perform(get("/block-staff/" + stay.userId(STAFF_A) + "/work").header(HttpHeaders.AUTHORIZATION,
                bearer(mvc, STAFF_A))).andExpect(status().isForbidden());
    }

    /** TC-AUTH-068: moving two items gives them to the receiver, audits each move and tells the receiver. */
    @Test
    void reassignsTwoItems() throws Exception {
        long from = staff("Leaving Person", "MAINTENANCE");
        long to = staff("Receiving Person", "MAINTENANCE");
        long first = maintenance(from, true);
        long second = maintenance(from, false);
        reassign(from, """
                {"items":[{"type":"Maintenance","id":"%d"},{"type":"MAINTENANCE","id":"%d"}],"toStaffId":"%d",
                 "note":"Shift ended"}""".formatted(first, second, to))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.moved").value(2));
        assertThat(assignee(first)).isEqualTo(to);
        assertThat(assignee(second)).isEqualTo(to);
        assertThat(jdbc.sql("""
                SELECT count(*) FROM shared_audit_log WHERE action = 'WORK_REASSIGNED' AND change::text LIKE '%Receiving Person%'
                """).query(Long.class).single()).isEqualTo(2);
        assertThat(jdbc.sql("SELECT count(*) FROM ntf_notification WHERE user_id = :u AND event_key = 'WORK_REASSIGNED'")
                .param("u", to).query(Long.class).single()).isEqualTo(2);
        assertThat(jdbc.sql("SELECT text FROM mnt_request_event WHERE request_id = :id ORDER BY id DESC LIMIT 1")
                .param("id", first).query(String.class).single())
                .contains("Receiving Person", "reassigned by a Manager: Shift ended");
        mvc.perform(get("/block-staff/" + from + "/work").header(HttpHeaders.AUTHORIZATION, bearer(mvc, MANAGER_A)))
                .andExpect(jsonPath("$.total").value(0));
    }

    /** TC-AUTH-069: a receiver who does not handle the kind of work gets nothing: 422, no item moved. */
    @Test
    void refusesAReceiverWhoDoesNotHandleTheWork() throws Exception {
        long from = staff("Holder Person", "MAINTENANCE");
        long desk = staff("Desk Person", "DESK,ROOM_CHANGES");
        long first = maintenance(from, false);
        long second = maintenance(from, false);
        reassign(from, """
                {"items":[{"type":"Maintenance","id":"%d"},{"type":"Maintenance","id":"%d"}],"toStaffId":"%d",
                 "note":"Cover"}""".formatted(first, second, desk))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.code").value("HANDLE_MISMATCH"));
        assertThat(assignee(first)).isEqualTo(from);
        assertThat(assignee(second)).isEqualTo(from);

        // The note and the receiver are required; the holder cannot receive their own work.
        reassign(from, "{\"items\":[{\"type\":\"Maintenance\",\"id\":\"%d\"}],\"toStaffId\":\"%d\"}".formatted(first, from))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.note").exists())
                .andExpect(jsonPath("$.details.fields.toStaffId").exists());
    }

    /** TC-AUTH-070: when one item was closed meanwhile the whole move is refused: 409, nothing moved. */
    @Test
    void refusesWhenAnItemWasClosedMeanwhile() throws Exception {
        long from = staff("Closing Person", "MAINTENANCE");
        long to = staff("Waiting Person", "MAINTENANCE");
        long open = maintenance(from, false);
        long closed = maintenance(from, false);
        jdbc.sql("UPDATE mnt_request SET status = 'RESOLVED', resolved_at = now() WHERE id = :id").param("id", closed)
                .update();
        reassign(from, """
                {"items":[{"type":"Maintenance","id":"%d"},{"type":"Maintenance","id":"%d"}],"toStaffId":"%d",
                 "note":"Cover"}""".formatted(open, closed, to))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ITEM_CLOSED"));
        assertThat(assignee(open)).isEqualTo(from);
    }
}

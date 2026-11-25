package vn.fpt.campusstay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.ADMIN;
import static vn.fpt.campusstay.TestAuth.MANAGER_A;
import static vn.fpt.campusstay.TestAuth.STAFF_A;
import static vn.fpt.campusstay.TestAuth.STAFF_B2;
import static vn.fpt.campusstay.TestAuth.bearer;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import com.jayway.jsonpath.JsonPath;

/** The work inbox (owner decision 25/11/2026): {@code GET /work/summary} per role and Block. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
class WorkSummaryIT {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @AfterEach
    void cleanUp() {
        jdbc.sql("DELETE FROM mnt_request WHERE code IN ('MR-WORK-1', 'MR-WORK-2')").update();
        jdbc.sql("DELETE FROM inv_door_code_task WHERE created_at = timestamptz '2001-01-01 00:00Z'").update();
        jdbc.sql("DELETE FROM req_escalation WHERE title = 'work-summary-it'").update();
    }

    /** kind → {count, overdue, dueSoon} of the user's summary. */
    private Map<String, List<Number>> summary(String email) throws Exception {
        String body = mvc.perform(get("/work/summary").header(HttpHeaders.AUTHORIZATION, bearer(mvc, email)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        List<Map<String, Object>> items = JsonPath.read(body, "$.items");
        return items.stream().collect(java.util.stream.Collectors.toMap(i -> (String) i.get("kind"),
                i -> List.of((Number) i.get("count"), (Number) i.get("overdue"), (Number) i.get("dueSoon"))));
    }

    private long count(Map<String, List<Number>> s, String kind, int at) {
        return s.containsKey(kind) ? s.get(kind).get(at).longValue() : 0;
    }

    private long id(String sql) {
        return jdbc.sql(sql).query(Long.class).single();
    }

    /**
     * TC-RPT-018: a Staff member counts the Maintenance Requests assigned to them (overdue by their SLA) and the
     * door codes to set in their own Blocks; Staff of another Block see neither.
     */
    @Test
    void staffCountTheirOwnWork() throws Exception {
        Map<String, List<Number>> before = summary(STAFF_A);
        Map<String, List<Number>> otherBefore = summary(STAFF_B2);
        long room = id("SELECT r.id FROM inv_room r JOIN inv_building b ON b.id = r.building_id WHERE b.code = 'A' "
                + "ORDER BY r.id LIMIT 1");
        long staff = id("SELECT id FROM auth_user WHERE email = '" + STAFF_A + "'");
        jdbc.sql("""
                INSERT INTO mnt_request (code, building_id, room_code, room_id, reporter_id, title, description, category, location, urgency,
                                         priority, status, assignee_id, sla_due_at)
                VALUES ('MR-WORK-1', (SELECT building_id FROM inv_room WHERE id = :room), (SELECT code FROM inv_room WHERE id = :room), :room, :staff, 'Leak', 'Leak', 'PLUMBING', 'ROOM', 'URGENT', 'HIGH', 'ASSIGNED',
                        :staff, now() - interval '1 hour')
                """).param("room", room).param("staff", staff).update();
        jdbc.sql("""
                INSERT INTO inv_door_code_task (room_id, reason, created_at)
                VALUES (:room, 'CHECK_OUT', timestamptz '2001-01-01 00:00Z')
                """).param("room", room).update();

        Map<String, List<Number>> after = summary(STAFF_A);
        assertThat(count(after, "maintenance", 0)).isEqualTo(count(before, "maintenance", 0) + 1);
        assertThat(count(after, "maintenance", 1)).isEqualTo(count(before, "maintenance", 1) + 1);
        assertThat(count(after, "door-code", 0)).isEqualTo(count(before, "door-code", 0) + 1);
        Map<String, List<Number>> other = summary(STAFF_B2);
        assertThat(count(other, "maintenance", 0)).isEqualTo(count(otherBefore, "maintenance", 0));
        assertThat(count(other, "door-code", 0)).isEqualTo(count(otherBefore, "door-code", 0));
    }

    /** TC-RPT-019: Managers count the open escalations of every Block, already overdue; Staff do not get them. */
    @Test
    void managersCountEscalations() throws Exception {
        Map<String, List<Number>> before = summary(MANAGER_A);
        long block = id("SELECT id FROM inv_building WHERE code = 'B'");
        jdbc.sql("""
                INSERT INTO req_escalation (building_id, kind, source_type, source_id, title, why)
                VALUES (:b, 'MANUAL', 'MAINTENANCE', 0, 'work-summary-it', 'test')
                """).param("b", block).update();

        Map<String, List<Number>> after = summary(MANAGER_A);
        assertThat(count(after, "escalation", 0)).isEqualTo(count(before, "escalation", 0) + 1);
        assertThat(count(after, "escalation", 1)).isEqualTo(count(before, "escalation", 1) + 1);
        assertThat(summary(STAFF_A)).doesNotContainKey("escalation");
    }

    /** TC-RPT-020: students may not read the work inbox; the Admin gets none of the Staff or Manager kinds. */
    @Test
    void studentsAreRefusedAndAdminSeesOnlyTheirs() throws Exception {
        mvc.perform(get("/work/summary").header(HttpHeaders.AUTHORIZATION, bearer(mvc, TestAuth.STUDENT)))
                .andExpect(status().isForbidden());
        assertThat(summary(ADMIN).keySet()).allMatch(k -> k.equals("term-request") || k.equals("job-failed"));
    }

    /**
     * TC-RPT-021: a Maintenance Request nobody took counts for every Staff member of its Block, due when it would be
     * escalated ({@code sla.unassigned_max_hours}, one hour in the seed: due soon); Staff of another Block do not see it.
     */
    @Test
    void unassignedRequestsCountForTheBlocksStaff() throws Exception {
        Map<String, List<Number>> before = summary(STAFF_A);
        Map<String, List<Number>> otherBefore = summary(STAFF_B2);
        long room = id("SELECT r.id FROM inv_room r JOIN inv_building b ON b.id = r.building_id WHERE b.code = 'A' "
                + "ORDER BY r.id LIMIT 1");
        long reporter = id("SELECT id FROM auth_user WHERE email = '" + STAFF_A + "'");
        jdbc.sql("""
                INSERT INTO mnt_request (code, building_id, room_code, room_id, reporter_id, title, description, category,
                                         location, urgency, priority, status)
                SELECT 'MR-WORK-2', building_id, code, id, :staff, 'Light', 'Light', 'ELECTRIC', 'ROOM', 'NORMAL', 'LOW',
                       'SUBMITTED'
                FROM inv_room WHERE id = :room
                """).param("room", room).param("staff", reporter).update();

        Map<String, List<Number>> after = summary(STAFF_A);
        assertThat(count(after, "maintenance-unassigned", 0)).isEqualTo(count(before, "maintenance-unassigned", 0) + 1);
        assertThat(count(after, "maintenance-unassigned", 2)).isEqualTo(count(before, "maintenance-unassigned", 2) + 1);
        assertThat(count(summary(STAFF_B2), "maintenance-unassigned", 0))
                .isEqualTo(count(otherBefore, "maintenance-unassigned", 0));
    }
}

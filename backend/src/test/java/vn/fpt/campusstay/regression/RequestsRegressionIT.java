package vn.fpt.campusstay.regression;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

import com.jayway.jsonpath.JsonPath;
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

import vn.fpt.campusstay.PostgresTestcontainer;
import vn.fpt.campusstay.TestAuth;
import vn.fpt.campusstay.service.assignment.RenewalService;
import vn.fpt.campusstay.service.assignment.TerminationService;
import vn.fpt.campusstay.service.request.EscalationService;

/** Review findings BE-OPS-02…08 (requests, routing, escalations): regression tests (each reproduced the finding before Wave 1 fixed it). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class RequestsRegressionIT {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    EscalationService escalations;

    @Autowired
    RenewalService renewals;

    @Autowired
    TerminationService terminations;

    RegressionSupport r;

    @BeforeEach
    void setUp() {
        r = new RegressionSupport(mvc, jdbc);
        jdbc.sql("DELETE FROM req_sla_policy").update();
    }

    /** Next Term TT32 with its requests window open (as RenewalFlow), and a clean window. */
    private void openNextTermWindow() {
        jdbc.sql("""
                INSERT INTO cfg_term (code, name, status, stay_start, stay_end, registration_opens_at,
                                      registration_closes_at, results_published_at, roommate_hours, deposit_hours,
                                      balance_due_at, check_in_start, check_in_end, check_out_by, published_at,
                                      publish_at, requests_open_at, requests_close_at, decisions_due_at,
                                      reconciliation_due_at, fees_issue_at, fees_due_at)
                VALUES ('TT32', 'Test Term 2031 Summer', 'PUBLISHED', DATE '2031-05-11', DATE '2031-08-30',
                        now() + interval '20 days', now() + interval '25 days', now() + interval '26 days', 48, 48,
                        now() + interval '40 days', DATE '2031-05-07', DATE '2031-05-10', DATE '2031-08-31',
                        now() - interval '2 days', now() - interval '2 days', now() - interval '1 hour',
                        now() + interval '2 days', now() + interval '3 days', now() + interval '3 days',
                        now() + interval '3 days', now() + interval '10 days')
                ON CONFLICT (code) DO NOTHING
                """).update();
        long next = jdbc.sql("SELECT id FROM cfg_term WHERE code = 'TT32'").query(Long.class).single();
        jdbc.sql("""
                INSERT INTO cfg_term_price (term_id, room_type_id, room_class_id, price)
                SELECT :t, rt.id, rc.id, round(rt.base_price * (1 + rc.surcharge_rate) * 1.1 / 1000) * 1000
                FROM cfg_room_type rt CROSS JOIN cfg_room_class rc ON CONFLICT DO NOTHING
                """).param("t", next).update();
        jdbc.sql("DELETE FROM asg_renewal WHERE term_id = :t").param("t", next).update();
        jdbc.sql("""
                UPDATE asg_allocation SET status = 'CANCELLED', ended_at = now(), end_reason = 'CANCELLED',
                       version = version + 1
                WHERE status = 'ACTIVE' AND term_id IN (:terms)
                """).param("terms", List.of(r.termId, next)).update();
        jdbc.sql("UPDATE asg_stay SET status = 'ENDED', ended_at = now(), end_kind = 'ENDED_EARLY' WHERE status = 'ACTIVE'")
                .update();
    }

    /** A resident of N whose Stay commits two Terms, then the window opens (M2): they hold a next-Term Bed. */
    private void continuingResident(int n, String room) {
        r.livesIn(n, room, "A", true);
        jdbc.sql("""
                WITH s AS (
                    INSERT INTO asg_stay (student_id, first_term_id, last_term_id, committed_terms, terms_used, started_at)
                    SELECT u.id, :t, :t, 2, 1, now() FROM auth_user u WHERE u.email = :email
                    RETURNING id, student_id)
                UPDATE asg_allocation a SET stay_id = s.id FROM s
                WHERE a.student_id = s.student_id AND a.term_id = :t AND a.status = 'ACTIVE'
                """).param("t", r.termId).param("email", RegressionSupport.student(n)).update();
        renewals.openDue();
    }

    private String roomChange(int n) throws Exception {
        return JsonPath.read(RegressionSupport.body(r.postJson("/room-changes", r.bearer(RegressionSupport.student(n)),
                "{\"kind\":\"same\",\"reason\":\"Health\"}").andExpect(status().isOk())), "$.id");
    }

    private long notificationsOf(int n) {
        return jdbc.sql("""
                SELECT count(*) FROM ntf_notification x JOIN auth_user u ON u.id = x.user_id WHERE u.email = :e
                """).param("e", RegressionSupport.student(n)).query(Long.class).single();
    }

    /** TC-REQ-023 (Wave 1 regression): BE-OPS-02: "Offer temporary Bed" must do something: at least the student is told. */
    @Test
    void beOps02_temporaryBedActionReachesTheStudent() throws Exception {
        openNextTermWindow();
        continuingResident(3, "A-303");
        String code = roomChange(3);
        jdbc.sql("""
                UPDATE req_room_change SET submitted_at = now() - interval '80 hours', sla_due_at = now() - interval '8 hours'
                WHERE code = :c
                """).param("c", code).update();
        escalations.scan();
        long before = notificationsOf(3);
        r.postJson("/escalations/" + code + "/actions", r.manager(),
                "{\"action\":\"temporary-bed\",\"note\":\"A-310 bed C until a Bed frees up.\"}")
                .andExpect(status().isNoContent());
        long bedsHeld = jdbc.sql("""
                SELECT count(*) FROM asg_allocation a JOIN auth_user u ON u.id = a.student_id
                WHERE u.email = :e AND a.status = 'ACTIVE'
                """).param("e", RegressionSupport.student(3)).query(Long.class).single();
        assertThat(notificationsOf(3)).as("student notifications after the temporary-bed action (Beds held: %d)",
                bedsHeld).isGreaterThan(before);
    }

    /** TC-REQ-024 (Wave 1 regression): BE-OPS-03: the Block's Room-change timer (24 h) sets the new Room-Change Request's deadline. */
    @Test
    void beOps03_roomChangeTimerSetsTheDeadline() throws Exception {
        openNextTermWindow();
        jdbc.sql("""
                INSERT INTO req_sla_policy (building_id, urgent_hours, normal_hours, room_change_hours, updated_at)
                SELECT id, 4, 48, 24, now() FROM inv_building WHERE code = 'A'
                """).update();
        continuingResident(4, "A-304");
        String code = roomChange(4);
        Instant due = jdbc.sql("SELECT sla_due_at FROM req_room_change WHERE code = :c").param("c", code)
                .query(java.sql.Timestamp.class).single().toInstant();
        assertThat(due).as("deadline of a Room-Change Request with a 24-hour timer")
                .isBefore(Instant.now().plus(Duration.ofHours(25)));
    }

    /** TC-REQ-025 (Wave 1 regression): BE-OPS-04: routing rules can only be created for kinds that are routed (Maintenance, Room change). */
    @Test
    void beOps04_swapRoutingRuleIsRefused() throws Exception {
        int status = r.postJson("/routing-rules", r.manager(), """
                {"block":"A","type":"Swap","scope":"All","assigneeId":"%d"}""".formatted(r.userId(TestAuth.STAFF_A)))
                .andReturn().getResponse().getStatus();
        assertThat(status).as("create a Swap routing rule").isEqualTo(400);
    }

    /** TC-REQ-026 (Wave 1 regression): BE-OPS-05: the scan escalates on the stored deadline, not on reported_at + today's timer. */
    @Test
    void beOps05_escalationUsesStoredDeadline() throws Exception {
        r.livesIn(5, "A-205", "A", true);
        String code = r.report(5, "Normal");
        jdbc.sql("""
                UPDATE mnt_request SET reported_at = now() - interval '13 hours', sla_due_at = now() + interval '35 hours'
                WHERE code = :c
                """).param("c", code).update();
        jdbc.sql("""
                INSERT INTO req_sla_policy (building_id, urgent_hours, normal_hours, room_change_hours, updated_at)
                SELECT id, 4, 12, 72, now() FROM inv_building WHERE code = 'A'
                """).update();
        escalations.scan();
        String json = RegressionSupport.body(mvc.perform(get("/escalations").param("block", "A")
                .header(HttpHeaders.AUTHORIZATION, r.manager())).andExpect(status().isOk()));
        List<String> why = JsonPath.read(json, "$.items[?(@.id == '" + code + "')].why");
        assertThat(why).as("escalation reasons of a request due in 35 hours").noneMatch(w -> w.startsWith("Past the"));
    }

    /** TC-MNT-011 (Wave 1 regression): BE-OPS-06: Staff cannot close a Submitted, unassigned request directly. */
    @Test
    void beOps06_submittedRequestCannotBeClosedDirectly() throws Exception {
        r.livesIn(6, "A-206", "A", true);
        String code = r.report(6, "Normal");
        int status = mvc.perform(patch("/maintenance-requests/" + code).header(HttpHeaders.AUTHORIZATION,
                r.bearer(TestAuth.STAFF_A)).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"Closed\"}"))
                .andReturn().getResponse().getStatus();
        String now = jdbc.sql("SELECT status FROM mnt_request WHERE code = :c").param("c", code).query(String.class)
                .single();
        assertThat(status).as("PATCH Closed on a Submitted request → status now " + now).isBetween(400, 499);
    }

    private long nextTermBeds(int n) {
        return jdbc.sql("""
                SELECT count(*) FROM asg_allocation a JOIN auth_user u ON u.id = a.student_id
                JOIN cfg_term t ON t.id = a.term_id WHERE u.email = :e AND t.code = 'TT32' AND a.status = 'ACTIVE'
                """).param("e", RegressionSupport.student(n)).query(Long.class).single();
    }

    /** TC-ASG-071 (Wave 1 regression):
     * BE-ASG-06 (uses the requests window, hence here): cancelling an OVERDUE termination either is refused or gives
     * back the next-Term Bed that becoming overdue took away.
     */
    @Test
    void beAsg06_cancellingOverdueTerminationRestoresNextTermBed() throws Exception {
        openNextTermWindow();
        continuingResident(13, "A-401");
        assertThat(nextTermBeds(13)).isEqualTo(1);
        String id = JsonPath.read(RegressionSupport.body(r.postJson("/terminations", r.manager(), """
                {"studentCode":"SE190013","reason":"Manager decision","note":"Repeated noise after midnight."}""")
                .andExpect(status().isOk())), "$.id");
        jdbc.sql("UPDATE asg_termination SET move_out_by = CURRENT_DATE - 2 WHERE status = 'NOTICE_SENT'").update();
        terminations.markOverdue();
        assertThat(nextTermBeds(13)).as("next-Term Bed once the termination is overdue").isZero();
        int cancel = r.postJson("/terminations/" + id + "/cancel", r.manager(), "{\"reason\":\"Started by mistake.\"}")
                .andReturn().getResponse().getStatus();
        assertThat(cancel == 409 || nextTermBeds(13) == 1)
                .as("cancel OVERDUE → HTTP %d, next-Term Beds now %d", cancel, nextTermBeds(13)).isTrue();
    }

    /** TC-ASG-074: My Room shows the longest stay allowed, so the extension options come from the server (WEB-STU-06). */
    @Test
    void allocationStayShowsMaxTerms() throws Exception {
        openNextTermWindow();
        continuingResident(16, "A-403");
        int max = Integer.parseInt(jdbc.sql("SELECT value FROM cfg_parameter WHERE key = 'stay.max_terms'")
                .query(String.class).single());
        String json = RegressionSupport.body(r.getAs("/students/me/allocation", r.bearer(RegressionSupport.student(16))));
        assertThat((Integer) JsonPath.read(json, "$.stay.maxTerms")).isEqualTo(max);
        assertThat((Integer) JsonPath.read(json, "$.stay.committedTerms")).isEqualTo(2);
    }

    /** TC-ASG-072 (Wave 1 regression): BE-ASG-09: a resident whose Bed is already taken in the next Term at M2 is told (not only an audit line). */
    @Test
    void beAsg09_residentWhoseNextTermBedIsTakenIsTold() throws Exception {
        openNextTermWindow();
        long next = jdbc.sql("SELECT id FROM cfg_term WHERE code = 'TT32'").query(Long.class).single();
        jdbc.sql("""
                INSERT INTO asg_allocation (term_id, student_id, bed_id, source, allocated_at)
                SELECT :t, u.id, b.id, 'MANUAL', now() FROM auth_user u, inv_bed b JOIN inv_room ro ON ro.id = b.room_id
                WHERE u.email = :e AND ro.code = 'A-402' AND b.label = 'A'
                """).param("t", next).param("e", RegressionSupport.student(15)).update();
        long before = notificationsOf(14);
        long managersBefore = jdbc.sql("SELECT count(*) FROM ntf_notification n JOIN auth_user u ON u.id = n.user_id WHERE u.role = 'MANAGER'").query(Long.class).single();
        continuingResident(14, "A-402");
        long managerAlerts = jdbc.sql("SELECT count(*) FROM ntf_notification n JOIN auth_user u ON u.id = n.user_id WHERE u.role = 'MANAGER'").query(Long.class).single() - managersBefore;
        assertThat(nextTermBeds(14)).isZero();
        assertThat(notificationsOf(14) > before || managerAlerts > 0)
                .as("student notified: %d → %d; Manager alerts: %d", before, notificationsOf(14), managerAlerts).isTrue();
    }

    /** TC-REQ-027 (Wave 1 regression):
     * BE-OPS-07: a Manager's bulk approval keeps a Block A student in Block A when a matching Bed is free there, even if
     * another male Block's Bed (Block "0", partly filled) sorts first.
     */
    @Test
    void beOps07_bulkApprovalPrefersTheStudentsOwnBlock() throws Exception {
        openNextTermWindow();
        long next = jdbc.sql("SELECT id FROM cfg_term WHERE code = 'TT32'").query(Long.class).single();
        jdbc.sql("INSERT INTO inv_building (code, name, gender) VALUES ('0', 'Block 0', 'M') ON CONFLICT (code) DO NOTHING")
                .update();
        jdbc.sql("""
                INSERT INTO inv_floor (building_id, floor_no, room_class_id)
                SELECT b.id, 3, (SELECT id FROM cfg_room_class WHERE name = 'Standard') FROM inv_building b WHERE b.code = '0'
                ON CONFLICT (building_id, floor_no) DO NOTHING
                """).update();
        jdbc.sql("""
                INSERT INTO inv_room (code, building_id, floor_id, room_type_id, room_class_id)
                SELECT '0-309', b.id, f.id, (SELECT id FROM cfg_room_type WHERE name = '6-bed'), f.room_class_id
                FROM inv_building b JOIN inv_floor f ON f.building_id = b.id AND f.floor_no = 3 WHERE b.code = '0'
                ON CONFLICT (code) DO NOTHING
                """).update();
        jdbc.sql("""
                INSERT INTO inv_bed (room_id, label) SELECT r.id, l FROM inv_room r, unnest(ARRAY['A','B','C','D','E','F']) l
                WHERE r.code = '0-309' ON CONFLICT (room_id, label) DO NOTHING
                """).update();
        jdbc.sql("""
                INSERT INTO asg_allocation (term_id, student_id, bed_id, source, allocated_at)
                SELECT :t, u.id, b.id, 'MANUAL', now() FROM auth_user u, inv_bed b JOIN inv_room ro ON ro.id = b.room_id
                WHERE u.email = :e AND ro.code = '0-309' AND b.label = 'A'
                """).param("t", next).param("e", RegressionSupport.student(17)).update();
        continuingResident(16, "A-403");
        String rc = JsonPath.read(RegressionSupport.body(r.postJson("/room-changes", r.bearer(RegressionSupport.student(16)),
                "{\"kind\":\"type\",\"roomTypeId\":\"%s\",\"roomClassId\":\"%s\",\"reason\":\"Price\"}".formatted(
                        r.roomTypeId("6-bed"), r.roomClassId("Standard"))).andExpect(status().isOk())), "$.id");
        String result = RegressionSupport.body(r.postJson("/next-term-requests/decision", r.manager(),
                "{\"items\":[{\"kind\":\"room-change\",\"id\":\"%s\"}],\"decision\":\"Approved\"}".formatted(rc)));
        String room = jdbc.sql("""
                SELECT ro.code FROM asg_allocation a JOIN auth_user u ON u.id = a.student_id
                JOIN inv_bed b ON b.id = a.bed_id JOIN inv_room ro ON ro.id = b.room_id
                WHERE u.email = :e AND a.term_id = :t AND a.status = 'ACTIVE'
                """).param("e", RegressionSupport.student(16)).param("t", next).query(String.class).single();
        assertThat(room).as("next-Term Room after the bulk approval (%s)", result).startsWith("A-");
    }

    /** TC-REQ-028 (Wave 1 regression): BE-OPS-08: a Block timer above the Admin's lowered limit is capped by it. */
    @Test
    void beOps08_adminLimitCapsSavedBlockTimers() throws Exception {
        jdbc.sql("""
                INSERT INTO req_sla_policy (building_id, urgent_hours, normal_hours, room_change_hours, updated_at)
                SELECT id, 4, 96, 72, now() FROM inv_building WHERE code = 'A'
                """).update();
        String old = jdbc.sql("SELECT value FROM cfg_parameter WHERE key = 'sla.normal_max_hours'").query(String.class)
                .single();
        jdbc.sql("UPDATE cfg_parameter SET value = '48' WHERE key = 'sla.normal_max_hours'").update();
        try {
            String json = RegressionSupport.body(r.getAs("/routing-rules?block=A", r.manager()).andExpect(status().isOk()));
            assertThat((String) JsonPath.read(json, "$.timers.normal")).isEqualTo("48 hours");
        } finally {
            jdbc.sql("UPDATE cfg_parameter SET value = :v WHERE key = 'sla.normal_max_hours'").param("v", old).update();
        }
    }
}

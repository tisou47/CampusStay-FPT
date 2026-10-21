package vn.fpt.campusstay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.ADMIN;
import static vn.fpt.campusstay.TestAuth.MANAGER_A;
import static vn.fpt.campusstay.TestAuth.STAFF_A;
import static vn.fpt.campusstay.TestAuth.bearer;

import java.nio.charset.StandardCharsets;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/** Dashboards, reports and exports, read from the reporting views (TC-RPT-001…008, TC-RPT-010). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class ReportIT {

    private static final byte[] PNG = { (byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0x0D, 'I', 'H',
            'D', 'R' };

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

    private ResultActions getAs(String path, String auth) throws Exception {
        return mvc.perform(get(path + (path.contains("?") ? "&" : "?") + "termId=" + stay.termId())
                .header(HttpHeaders.AUTHORIZATION, auth));
    }

    private void applyAndPay(int student) throws Exception {
        String auth = bearer(mvc, StayFlow.student(student));
        flow.pay(auth, flow.apply(auth, "4-bed", "Basic", null).depositInvoiceId());
    }

    private long count(String sql) {
        return jdbc.sql(sql).param("term", stay.termId()).query(Long.class).single();
    }

    /** TC-RPT-001: Staff dashboard: the review queue, Rooms out of service, the Block's Beds, what needs attention. */
    @Test
    void staffDashboard() throws Exception {
        applyAndPay(6);
        applyAndPay(7);
        long submitted = count("SELECT count(*) FROM app_application WHERE term_id = :term AND status = 'SUBMITTED' AND gender = 'M'");
        getAs("/dashboards/staff", bearer(mvc, STAFF_A)).andExpect(status().isOk())
                .andExpect(jsonPath("$.kpis.submitted").value((int) submitted))
                .andExpect(jsonPath("$.kpis.toReview").value(greaterThanOrEqualTo((int) submitted)))
                .andExpect(jsonPath("$.kpis.proposal").value((Object) null))
                .andExpect(jsonPath("$.kpis.firstOutOfService.room").value("A-305"))
                .andExpect(jsonPath("$.applicationsByStatus[?(@.status == 'Submitted')].count").value(hasItem((int) submitted)))
                .andExpect(jsonPath("$.attention[*].kind").value(hasItem("queue")))
                .andExpect(jsonPath("$.attention[*].kind").value(hasItem("room")))
                .andExpect(jsonPath("$.bedsByBlock[*].block", contains("A")))
                .andExpect(jsonPath("$.bedsByBlock[0].capacity").value(greaterThanOrEqualTo(1)));
        getAs("/dashboards/staff", bearer(mvc, StayFlow.student(6))).andExpect(status().isForbidden());
    }

    /** TC-RPT-002: Block Manager dashboard: occupancy by floor, the SLA rate and target, what is waiting. */
    @Test
    void managerDashboard() throws Exception {
        stay.livesIn(8, "A-201", "A", true);
        String code = JsonPath.read(mvc.perform(multipart("/maintenance-requests")
                .file(new MockMultipartFile("photos", "leak.png", "image/png", PNG))
                .param("title", "Tap drips").param("description", "The tap drips all night.").param("location", "Bathroom")
                .param("category", "Plumbing").param("urgency", "Normal").param("staffMayEnter", "true")
                .header(HttpHeaders.AUTHORIZATION, bearer(mvc, StayFlow.student(8))))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(), "$.id");
        jdbc.sql("""
                UPDATE mnt_request SET status = 'RESOLVED', assignee_id = (SELECT id FROM auth_user WHERE email = :a),
                       resolved_at = reported_at + interval '1 hour'
                WHERE code = :c
                """).param("a", "staff.a2@campusstay.test").param("c", code).update();
        String manager = bearer(mvc, MANAGER_A);
        getAs("/dashboards/manager", manager).andExpect(status().isOk())
                .andExpect(jsonPath("$.block").value("A"))
                .andExpect(jsonPath("$.kpis.allocated").value(greaterThanOrEqualTo(1)))
                .andExpect(jsonPath("$.kpis.slaHours").value(48))
                .andExpect(jsonPath("$.kpis.slaTarget").value(0.9))
                .andExpect(jsonPath("$.kpis.slaRate").value(1.0))
                .andExpect(jsonPath("$.kpis.escalationsWaiting").value(0))
                .andExpect(jsonPath("$.floors[*].floor", contains(1, 2, 3, 4, 5)))
                .andExpect(jsonPath("$.floorNote").value("1 Room out of service is not counted."))
                .andExpect(jsonPath("$.waiting[?(@.kind == 'routing')]", hasSize(2)));
        getAs("/dashboards/manager", bearer(mvc, STAFF_A)).andExpect(status().isForbidden());
    }

    /** TC-RPT-003: the Manager's approval counts; Staff may not see them. */
    @Test
    void approvalCounts() throws Exception {
        getAs("/approvals/summary", bearer(mvc, MANAGER_A)).andExpect(status().isOk())
                .andExpect(jsonPath("$.assignment").value(0))
                .andExpect(jsonPath("$.lateCheckIn").value(0))
                .andExpect(jsonPath("$.swaps").value(0))
                .andExpect(jsonPath("$.refunds").value(0));
        getAs("/approvals/summary", bearer(mvc, STAFF_A)).andExpect(status().isForbidden());
    }

    /** TC-RPT-004: Admin dashboard: the Term, people, the funnel, Blocks, configuration checks and integrations. */
    @Test
    void adminDashboard() throws Exception {
        applyAndPay(9);
        getAs("/dashboards/admin", bearer(mvc, ADMIN)).andExpect(status().isOk())
                .andExpect(jsonPath("$.term.name").value(ApplyFlow.TERM_NAME))
                .andExpect(jsonPath("$.term.statusLabel").value("registration open"))
                .andExpect(jsonPath("$.term.endsAt").value("2031-04-27"))
                .andExpect(jsonPath("$.kpis.students").value(48))
                .andExpect(jsonPath("$.kpis.managers").value(2))
                .andExpect(jsonPath("$.kpis.activeUsers").value(greaterThanOrEqualTo(2)))
                .andExpect(jsonPath("$.funnel[0].label").value("Applied"))
                .andExpect(jsonPath("$.funnel[1].label").value("Deposit paid"))
                .andExpect(jsonPath("$.blocks[*].block", contains("A", "B")))
                .andExpect(jsonPath("$.blocks[*].gender", contains("Male", "Female")))
                .andExpect(jsonPath("$.checks", hasSize(4)))
                .andExpect(jsonPath("$.checks[?(@.link == '/admin/inspection-checklists')].ok").value(hasItem(true)))
                .andExpect(jsonPath("$.integrations[*].name").value(hasItem("SePay bank feed")));
        getAs("/dashboards/admin", bearer(mvc, MANAGER_A)).andExpect(status().isForbidden());
    }

    /** TC-RPT-005: occupancy by Block, Room Type and Room Class; capacity leaves Rooms out of service out. */
    @Test
    void occupancyReport() throws Exception {
        stay.livesIn(10, "A-202", "A", false);
        long capacity = jdbc.sql("""
                SELECT count(*) FROM inv_bed b JOIN inv_room r ON r.id = b.room_id
                WHERE b.status = 'IN_SERVICE' AND r.status = 'IN_SERVICE'
                """).query(Long.class).single();
        long allocated = count("SELECT count(*) FROM asg_allocation WHERE term_id = :term AND status = 'ACTIVE'");
        getAs("/reports/occupancy", bearer(mvc, ADMIN)).andExpect(status().isOk())
                .andExpect(jsonPath("$.roomClasses", contains("Basic", "Standard", "Premium")))
                .andExpect(jsonPath("$.summary.capacity").value((int) capacity))
                .andExpect(jsonPath("$.summary.allocated").value((int) allocated))
                .andExpect(jsonPath("$.summary.blocks").value(2))
                .andExpect(jsonPath("$.blocks[*].block", contains("A", "B")))
                .andExpect(jsonPath("$.note").value("1 Room is out of service and not counted."));
        getAs("/reports/occupancy", bearer(mvc, STAFF_A)).andExpect(status().isForbidden());
    }

    /** TC-RPT-006: money per Block; Deposits of students without a Bed have a row of their own. */
    @Test
    void financialReport() throws Exception {
        applyAndPay(11);
        long collected = count("""
                SELECT coalesce(sum(amount), 0) FROM bil_invoice WHERE term_id = :term AND status IN ('PAID', 'REFUNDED')
                """);
        getAs("/reports/financial", bearer(mvc, ADMIN)).andExpect(status().isOk())
                .andExpect(jsonPath("$.blocks", contains("A", "B")))
                .andExpect(jsonPath("$.rows[*].block", contains("A", "B", "Not allocated")))
                .andExpect(jsonPath("$.summary.collected").value(collected));
        getAs("/reports/financial?block=A", bearer(mvc, MANAGER_A))
                .andExpect(jsonPath("$.rows[*].block", contains("A", "Not allocated")));
    }

    /** TC-RPT-007: the Block report counts check-ins per week and who has not checked in yet. */
    @Test
    void blockReport() throws Exception {
        stay.livesIn(12, "A-203", "A", false);
        long notCheckedIn = count("""
                SELECT count(*) FROM asg_allocation a JOIN inv_bed b ON b.id = a.bed_id JOIN inv_room r ON r.id = b.room_id
                JOIN inv_building bl ON bl.id = r.building_id
                WHERE a.term_id = :term AND a.status = 'ACTIVE' AND a.checked_in_at IS NULL AND bl.code = 'A'
                """);
        getAs("/reports/block", bearer(mvc, MANAGER_A)).andExpect(status().isOk())
                .andExpect(jsonPath("$.notCheckedIn").value((int) notCheckedIn))
                .andExpect(jsonPath("$.followUpBy").value("2031-01-05"));
    }

    /**
     * TC-RPT-010: a Term that has ended still reports who lived there (Allocations ended by check-out, not by a room
     * change), and a refunded Deposit without a Bed counts in the row of its own.
     */
    @Test
    void pastTermReports() throws Exception {
        jdbc.sql("""
                INSERT INTO cfg_term (code, name, status, stay_start, stay_end, registration_opens_at,
                                      registration_closes_at, results_published_at, roommate_hours, deposit_hours,
                                      balance_due_at, check_in_start, check_in_end, check_out_by, published_at)
                VALUES ('FA20', 'Fall 2020', 'PUBLISHED', DATE '2020-09-07', DATE '2020-12-27', '2020-07-01 01:00+00',
                        '2020-07-31 16:59+00', '2020-08-10 01:00+00', 48, 48, '2020-08-25 16:59+00',
                        DATE '2020-09-03', DATE '2020-09-06', DATE '2020-12-28', '2020-06-20 01:00+00')
                """).update();
        long past = jdbc.sql("SELECT id FROM cfg_term WHERE code = 'FA20'").query(Long.class).single();
        jdbc.sql("""
                INSERT INTO asg_allocation (term_id, student_id, bed_id, source, status, allocated_at, checked_in_at,
                                            ended_at, end_reason)
                SELECT :term, u.id, b.id, 'MANUAL', 'ENDED', TIMESTAMPTZ '2020-08-10 09:00+07',
                       TIMESTAMPTZ '2020-09-04 10:00+07', TIMESTAMPTZ '2020-12-27 10:00+07', v.reason
                FROM (VALUES ('A-204', 'ROOM_CHANGE'), ('A-205', 'CHECK_OUT')) AS v (room, reason)
                JOIN auth_user u ON u.email = :email
                JOIN inv_room r ON r.code = v.room JOIN inv_bed b ON b.room_id = r.id AND b.label = 'A'
                """).param("term", past).param("email", StayFlow.student(13)).update();
        jdbc.sql("""
                INSERT INTO bil_refund (term_id, student_id, source_type, reason, paid_amount, amount, status, decided_at,
                                        student_name, student_code, gender)
                SELECT :term, u.id, 'APPLICATION_CANCEL', 'Application cancelled', 1000000, 1000000, 'PAID',
                       TIMESTAMPTZ '2020-08-01 09:00+07', u.display_name, s.student_code, s.gender
                FROM auth_user u JOIN auth_student s ON s.user_id = u.id WHERE u.email = :email
                """).param("term", past).param("email", StayFlow.student(14)).update();
        String admin = bearer(mvc, ADMIN);

        mvc.perform(get("/reports/occupancy").param("termId", String.valueOf(past)).header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.summary.allocated").value(1))
                .andExpect(jsonPath("$.summary.checkedIn").value(1));
        mvc.perform(get("/dashboards/admin").param("termId", String.valueOf(past)).header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(jsonPath("$.term.statusLabel").value("ended"))
                .andExpect(jsonPath("$.kpis.residents").value(1));
        mvc.perform(get("/reports/block").param("termId", String.valueOf(past)).param("block", "A")
                .header(HttpHeaders.AUTHORIZATION, bearer(mvc, MANAGER_A)))
                .andExpect(jsonPath("$.allocated").value(1))
                .andExpect(jsonPath("$.notCheckedIn").value(0))
                .andExpect(jsonPath("$.followUpBy").value((Object) null));
        mvc.perform(get("/reports/financial").param("termId", String.valueOf(past)).header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(jsonPath("$.rows[?(@.block == 'Not allocated')].refunded").value(hasItem(1000000)))
                .andExpect(jsonPath("$.summary.refunded").value(1000000))
                .andExpect(jsonPath("$.summary.refundCount").value(1));
    }

    /** TC-RPT-008: exports are CSV files with the screen's columns, written to the Audit Log; scope and permissions. */
    @Test
    void exports() throws Exception {
        String admin = bearer(mvc, ADMIN);
        String csv = getAs("/exports/occupancy", admin).andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, startsWith("attachment; filename=\"occupancy.csv\"")))
                .andExpect(header().string(HttpHeaders.CONTENT_TYPE, startsWith("text/csv")))
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(csv).startsWith("﻿Block,Room Type,Basic allocated,Basic capacity");

        String staff = bearer(mvc, STAFF_A);
        String applications = getAs("/exports/applications?block=A&status=Submitted", staff).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(applications).startsWith("﻿Application,Student,Student code,Roommate pair");
        getAs("/exports/block-residents?block=A", bearer(mvc, MANAGER_A)).andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, startsWith("attachment; filename=\"block-residents-A.csv\"")));

        getAs("/exports/audit-log", staff).andExpect(status().isForbidden());
        getAs("/exports/block-residents?block=B", bearer(mvc, MANAGER_A)).andExpect(status().isForbidden());
        getAs("/exports/no-such-report", admin).andExpect(status().isNotFound());
        mvc.perform(get("/admin/audit-log").param("action", "Exported").header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(jsonPath("$.items", hasSize(3)));
    }
}

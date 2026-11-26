package vn.fpt.campusstay.regression;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionTemplate;

import vn.fpt.campusstay.PostgresTestcontainer;
import vn.fpt.campusstay.TestAuth;
import vn.fpt.campusstay.service.assignment.Moves;

/**
 * Wave 3 business findings on stays and check-out: BE-ASG-12, BE-APP-BIL-11, BE-ASG-20, BE-ASG-13, BE-ASG-14,
 * BE-2ND-09.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class Wave3AssignmentRegressionIT {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    Moves moves;

    @Autowired
    TransactionTemplate tx;

    @org.springframework.beans.factory.annotation.Value("${campusstay.files.dir:data/files}")
    String filesDir;

    private long storedFiles() throws java.io.IOException {
        java.nio.file.Path dir = java.nio.file.Path.of(filesDir);
        if (!java.nio.file.Files.isDirectory(dir)) {
            return 0;
        }
        try (var list = java.nio.file.Files.list(dir)) {
            return list.count();
        }
    }

    RegressionSupport r;

    @BeforeEach
    void setUp() {
        r = new RegressionSupport(mvc, jdbc);
    }

    private long damageInvoices(int n) {
        return r.count("""
                SELECT count(*) FROM bil_invoice i JOIN auth_user u ON u.id = i.student_id
                WHERE u.email = ? AND i.type = 'DAMAGE'
                """, RegressionSupport.student(n));
    }

    private String furniture(long allocation, String item, String staff) throws Exception {
        return RegressionSupport.body(mvc.perform(put("/check-outs/" + allocation + "/furniture")
                .header(HttpHeaders.AUTHORIZATION, staff).contentType(MediaType.APPLICATION_JSON)
                .content("{\"items\":[{\"itemId\":\"" + item + "\",\"condition\":\"Damaged\"}],\"studentPresent\":false}"))
                .andExpect(status().isOk()));
    }

    /**
     * TC-ASG-401 (BE-ASG-12): three roommates; the first leaver's check-out records a shared desk Damaged and the two
     * others pay their share. When Staff record the same damage at the second check-out, nobody is charged again.
     */
    @Test
    void sharedDamageIsChargedOnce() throws Exception {
        long a = r.livesIn(1, "A-305", "A", true);
        long b = r.livesIn(2, "A-305", "B", true);
        r.livesIn(3, "A-305", "C", true);
        String item = jdbc.sql("""
                SELECT 'furniture-' || i.id FROM inv_furniture_item i JOIN inv_room ro ON ro.id = i.room_id
                JOIN inv_furniture_type t ON t.id = i.furniture_type_id
                WHERE ro.code = 'A-305' AND i.bed_id IS NULL AND t.unit_price > 0 ORDER BY i.id LIMIT 1
                """).query(String.class).single();
        String staff = r.bearer(TestAuth.STAFF_A);
        furniture(a, item, staff);
        r.postJson("/check-out/" + a, staff, "{\"electricity\":10,\"water\":1,\"conditionGood\":false,\"draft\":false}")
                .andExpect(status().isOk());
        assertThat(damageInvoices(3)).isEqualTo(1);

        String view = furniture(b, item, staff);
        List<Number> amounts = JsonPath.read(view, "$.items[?(@.itemId == '" + item + "')].amount");
        assertThat(amounts.getFirst().longValue()).as("B's line for damage already charged").isZero();
        r.postJson("/check-out/" + b, staff, "{\"electricity\":12,\"water\":2,\"conditionGood\":false,\"draft\":false}")
                .andExpect(status().isOk());
        assertThat(damageInvoices(3)).as("C's DAMAGE Invoices after the second check-out").isEqualTo(1);
    }

    /** TC-ASG-402 (BE-ASG-20): a student listed without a Block is waitlisted when the run's last Block is committed. */
    @Test
    void blocklessItemIsWaitlisted() throws Exception {
        List<RegressionSupport.Applied> apps = r.approved("2-bed", "Basic", 6, 7);
        String run = r.startRun();
        long runId = Long.parseLong(run.substring("RUN-".length()));
        jdbc.sql("""
                UPDATE asg_proposal_item SET building_id = NULL, bed_id = NULL, issue_code = 'NO_BED', issue_tone = 'WARNING'
                WHERE run_id = :run AND application_id = (SELECT id FROM app_application WHERE code = :c)
                """).param("run", runId).param("c", apps.get(1).id()).update();
        r.postJson("/assignment-runs/" + run + "/commit", r.manager(), "{\"block\":\"A\"}").andExpect(status().is2xxSuccessful());
        assertThat(jdbc.sql("SELECT status FROM app_application WHERE code = :c").param("c", apps.get(1).id())
                .query(String.class).single()).isEqualTo("WAITLISTED");
    }

    /** TC-ASG-403 (BE-ASG-13): the desk cannot record a late arrival past the last day the online request allows. */
    @Test
    void deskLateCheckInIsLimited() throws Exception {
        r.livesIn(8, "A-307", "A", false);
        var res = mvc.perform(multipart("/late-check-ins").param("studentCode", "SE190008")
                .param("reason", "Flight delayed").param("requestedFor", "2031-12-01")
                .header(HttpHeaders.AUTHORIZATION, r.bearer(TestAuth.STAFF_A))).andReturn().getResponse();
        assertThat(res.getStatus()).as(res.getContentAsString()).isEqualTo(400);
        assertThat(res.getContentAsString()).contains("requestedFor");
    }

    /** TC-ASG-404 (BE-ASG-14): a second online late check-in is refused before its evidence file is stored. */
    @Test
    void duplicateOnlineLateCheckInStoresNoFile() throws Exception {
        r.livesIn(9, "A-308", "A", false);
        String student = r.bearer(RegressionSupport.student(9));
        mvc.perform(multipart("/students/me/late-check-in")
                .file(new MockMultipartFile("evidence", "ticket.png", "image/png", RegressionSupport.PNG))
                .param("reason", "Flight delayed").param("requestedFor", "2031-01-04")
                .header(HttpHeaders.AUTHORIZATION, student)).andExpect(status().isOk());
        long files = storedFiles();
        var second = mvc.perform(multipart("/students/me/late-check-in")
                .file(new MockMultipartFile("evidence", "ticket2.png", "image/png", RegressionSupport.PNG))
                .param("reason", "Flight delayed again").param("requestedFor", "2031-01-05")
                .header(HttpHeaders.AUTHORIZATION, student)).andReturn().getResponse();
        assertThat(second.getStatus()).isEqualTo(409);
        assertThat(second.getContentAsString()).contains("LATE_REQUEST_EXISTS");
        assertThat(storedFiles()).as("files on disk").isEqualTo(files);
    }

    /**
     * TC-ASG-405 (BE-2ND-09): an approved late check-in and a saved check-out draft follow the student when Staff move
     * them to another Bed.
     */
    @Test
    void lateCheckInAndCheckOutDraftFollowAMove() {
        long arriving = r.livesIn(10, "A-309", "A", false);
        jdbc.sql("""
                INSERT INTO asg_late_check_in (allocation_id, reason, requested_for, window_closed_at, status, deadline)
                VALUES (:a, 'Visa', DATE '2031-01-08', now(), 'APPROVED', DATE '2031-01-08')
                """).param("a", arriving).update();
        long leaving = r.livesIn(11, "A-310", "A", true);
        jdbc.sql("""
                INSERT INTO asg_check_out (allocation_id, reason, status, electricity, water) VALUES (:a, 'TERM_END', 'DRAFT', 5, 1)
                """).param("a", leaving).update();
        long manager = r.userId(TestAuth.MANAGER_A);
        long bed1 = r.count("SELECT b.id FROM inv_bed b JOIN inv_room ro ON ro.id = b.room_id WHERE ro.code = 'A-409' AND b.label = 'A'");
        long bed2 = r.count("SELECT b.id FROM inv_bed b JOIN inv_room ro ON ro.id = b.room_id WHERE ro.code = 'A-410' AND b.label = 'A'");
        long[] moved = tx.execute(s -> new long[] { moves.move(arriving, bed1, "MOVE", manager),
                moves.move(leaving, bed2, "MOVE", manager) });
        assertThat(r.count("SELECT allocation_id FROM asg_late_check_in WHERE reason = 'Visa'")).isEqualTo(moved[0]);
        assertThat(r.count("SELECT count(*) FROM asg_check_out WHERE allocation_id = ? AND status = 'DRAFT'", moved[1]))
                .isEqualTo(1);
    }
}

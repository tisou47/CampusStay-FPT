package vn.fpt.campusstay.regression;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import vn.fpt.campusstay.PostgresTestcontainer;

/** 
 * Review findings BE-ASG-01, 02, 04, 05, 07. A second male Block C (one 2-bed Premium Room C-501) is added, and
 * Block A's 2-bed Premium Rooms are out of service, so a run for 2-bed Premium proposes Block C's two Beds and
 * leaves the third applicant without a Bed in Block A.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class AssignmentRegressionIT {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    RegressionSupport r;

    @BeforeEach
    void setUp() {
        r = new RegressionSupport(mvc, jdbc);
        jdbc.sql("INSERT INTO inv_building (code, name, gender) VALUES ('C', 'Block C', 'M') ON CONFLICT (code) DO NOTHING")
                .update();
        jdbc.sql("""
                INSERT INTO inv_floor (building_id, floor_no, room_class_id)
                SELECT b.id, 5, (SELECT id FROM cfg_room_class WHERE name = 'Premium') FROM inv_building b WHERE b.code = 'C'
                ON CONFLICT (building_id, floor_no) DO NOTHING
                """).update();
        jdbc.sql("""
                INSERT INTO inv_room (code, building_id, floor_id, room_type_id, room_class_id)
                SELECT 'C-501', b.id, f.id, (SELECT id FROM cfg_room_type WHERE name = '2-bed'), f.room_class_id
                FROM inv_building b JOIN inv_floor f ON f.building_id = b.id AND f.floor_no = 5 WHERE b.code = 'C'
                ON CONFLICT (code) DO NOTHING
                """).update();
        jdbc.sql("""
                INSERT INTO inv_bed (room_id, label) SELECT r.id, l FROM inv_room r, unnest(ARRAY['A', 'B']) l
                WHERE r.code = 'C-501' ON CONFLICT (room_id, label) DO NOTHING
                """).update();
        jdbc.sql("""
                UPDATE inv_room SET status = 'OUT_OF_SERVICE', oos_since = now(), oos_reason = 'MAINTENANCE'
                WHERE code IN ('A-501', 'A-502', 'A-503', 'A-504') AND status = 'IN_SERVICE'
                """).update();
        // Each test starts its own run: earlier runs and their leftover applicants are set aside.
        jdbc.sql("UPDATE asg_run SET status = 'DISCARDED' WHERE status IN ('RUNNING', 'PROPOSED', 'IN_REVIEW')").update();
        jdbc.sql("UPDATE app_application SET status = 'CANCELLED' WHERE status = 'APPROVED'").update();
        jdbc.sql("UPDATE app_round2_option SET held = FALSE WHERE held").update();
        jdbc.sql("""
                UPDATE asg_allocation SET status = 'CANCELLED', ended_at = now(), end_reason = 'CANCELLED'
                WHERE status = 'ACTIVE' AND bed_id IN (SELECT b.id FROM inv_bed b JOIN inv_room r ON r.id = b.room_id
                                                      WHERE r.code = 'C-501')
                """).update();
    }

    /** Three 2-bed Premium applicants approved, a run started: two proposed in C-501, one without a Bed (Block A). */
    private String runWithBlockC(int... students) throws Exception {
        r.approved("2-bed", "Premium", students);
        String run = r.startRun();
        List<String> inC = proposedBeds(run, "C");
        assertThat(inC).as("Beds proposed in Block C").hasSize(2);
        return run;
    }

    private List<String> proposedBeds(String run, String block) {
        return jdbc.sql("""
                SELECT i.bed_id::text FROM asg_proposal_item i JOIN inv_building b ON b.id = i.building_id
                WHERE i.run_id = :run AND b.code = :block AND i.bed_id IS NOT NULL
                """).param("run", Long.parseLong(run.replace("RUN-", ""))).param("block", block).query(String.class)
                .list();
    }

    private void commitA(String run) throws Exception {
        String conflicts = RegressionSupport.body(r.getAs("/assignment-runs/" + run + "/proposal?block=A&view=conflicts&pageSize=100",
                r.manager()));
        for (String id : JsonPath.<List<String>>read(conflicts, "$.items[*].applicationId")) {
            r.postJson("/assignment-runs/" + run + "/conflicts/" + id + "/resolve", r.manager(), "{\"waitlist\":true}")
                    .andExpect(status().isOk());
        }
        r.postJson("/assignment-runs/" + run + "/commit", r.manager(), "{\"block\":\"A\"}").andExpect(status().isNoContent());
    }

    /** TC-ASG-063 (Wave 1 regression): BE-ASG-01: committing Block A must not offer Round-2 options on Beds proposed in Block C of the same live run. */
    @Test
    void beAsg01_round2OffersExcludeBedsProposedInUncommittedBlocks() throws Exception {
        String run = runWithBlockC(1, 2, 3);
        commitA(run);
        List<String> held = jdbc.sql("SELECT bed_id::text FROM app_round2_option WHERE held").query(String.class).list();
        assertThat(held).as("held Round-2 options (Block C proposal: %s)", proposedBeds(run, "C"))
                .doesNotContainAnyElementsOf(proposedBeds(run, "C"));
    }

    /** TC-ASG-064 (Wave 1 regression): BE-ASG-02: resolving an item must not place it in a Block that is already committed. */
    @Test
    void beAsg02_resolveDoesNotPlaceIntoCommittedBlock() throws Exception {
        String run = runWithBlockC(4, 5, 6);
        commitA(run);
        String app = jdbc.sql("""
                SELECT a.code FROM asg_proposal_item i JOIN inv_building b ON b.id = i.building_id
                JOIN app_application a ON a.id = i.application_id
                WHERE i.run_id = :run AND b.code = 'C' AND i.bed_id IS NOT NULL ORDER BY a.code LIMIT 1
                """).param("run", Long.parseLong(run.replace("RUN-", ""))).query(String.class).single();
        String key = "TYPE:" + r.roomTypeId("2-bed") + ":" + r.roomClassId("Basic");
        var res = r.postJson("/assignment-runs/" + run + "/conflicts/" + app + "/resolve", r.manager(),
                "{\"optionKey\":\"" + key + "\"}").andReturn().getResponse();
        String block = jdbc.sql("""
                SELECT b.code FROM asg_proposal_item i JOIN inv_building b ON b.id = i.building_id
                JOIN app_application a ON a.id = i.application_id WHERE i.run_id = :run AND a.code = :app
                """).param("run", Long.parseLong(run.replace("RUN-", ""))).param("app", app).query(String.class).single();
        assertThat(block).as("Block of the item after resolve (HTTP %d %s); Block A is committed", res.getStatus(),
                res.getContentAsString()).isNotEqualTo("A");
    }

    /** TC-ASG-065 (Wave 1 regression):
     * BE-ASG-04: when a proposed Bed was taken meanwhile, committing the Block does not fail as a whole with
     * BED_TAKEN and nothing to resolve: the item becomes a conflict.
     */
    @Test
    void beAsg04_takenProposedBedBecomesAConflict() throws Exception {
        String run = runWithBlockC(7, 8, 9);
        commitA(run);
        String bed = proposedBeds(run, "C").getFirst();
        jdbc.sql("""
                INSERT INTO asg_allocation (term_id, student_id, bed_id, source, allocated_at)
                SELECT :t, u.id, :bed, 'MANUAL', now() FROM auth_user u WHERE u.email = :e
                """).param("t", r.termId).param("bed", Long.parseLong(bed)).param("e", RegressionSupport.student(10)).update();
        var res = r.postJson("/assignment-runs/" + run + "/commit", r.manager(), "{\"block\":\"C\"}").andReturn()
                .getResponse();
        String conflicts = RegressionSupport.body(r.getAs("/assignment-runs/" + run + "/proposal?block=C&view=conflicts&pageSize=100",
                r.manager()));
        List<Object> items = JsonPath.read(conflicts, "$.items");
        assertThat(res.getStatus() == 204 || !items.isEmpty())
                .as("commit Block C → HTTP %d %s; conflicts offered: %s", res.getStatus(), res.getContentAsString(), items)
                .isTrue();
    }

    private String terminate(int n, String room) throws Exception {
        r.livesIn(n, room, "A", true);
        return JsonPath.read(RegressionSupport.body(r.postJson("/terminations", r.manager(), """
                {"studentCode":"SE19%04d","reason":"Manager decision","note":"Repeated noise after midnight."}"""
                .formatted(n)).andExpect(status().isOk())), "$.id");
    }

    /** TC-ASG-066 (Wave 1 regression): BE-ASG-05: a resident with an overdue termination cannot be moved (which would hand them a new Room). */
    @Test
    void beAsg05_moveRefusedWhileTerminationOverdue() throws Exception {
        terminate(11, "A-107");
        jdbc.sql("""
                UPDATE asg_termination SET status = 'OVERDUE', overdue_at = now() WHERE allocation_id IN (
                    SELECT a.id FROM asg_allocation a JOIN auth_user u ON u.id = a.student_id WHERE u.email = :e)
                """).param("e", RegressionSupport.student(11)).update();
        String allocation = jdbc.sql("""
                SELECT a.id::text FROM asg_allocation a JOIN auth_user u ON u.id = a.student_id
                WHERE u.email = :e AND a.status = 'ACTIVE'
                """).param("e", RegressionSupport.student(11)).query(String.class).single();
        var res = r.postJson("/operational-moves", r.bearer(vn.fpt.campusstay.TestAuth.STAFF_A), """
                {"allocationId":"%s","bedId":"A-108-A","reason":"Room unusable","fromElectricity":120.5,"fromWater":10,
                 "toElectricity":340,"toWater":22}""".formatted(allocation)).andReturn().getResponse();
        assertThat(res.getStatus()).as("move of a resident with an OVERDUE termination: " + res.getContentAsString())
                .isEqualTo(409);
    }

    /** TC-ASG-067 (Wave 1 regression): BE-ASG-07: cancelling a termination keeps a check-out that was pending for another reason. */
    @Test
    void beAsg07_cancelledTerminationKeepsEarlierCheckOut() throws Exception {
        long allocation = r.livesIn(12, "A-110", "A", true);
        jdbc.sql("INSERT INTO asg_check_out (allocation_id, reason) VALUES (:a, 'TERM_END')").param("a", allocation)
                .update();
        String id = JsonPath.read(RegressionSupport.body(r.postJson("/terminations", r.manager(), """
                {"studentCode":"SE190012","reason":"Manager decision","note":"Repeated noise after midnight."}""")
                .andExpect(status().isOk())), "$.id");
        r.postJson("/terminations/" + id + "/cancel", r.manager(), "{\"reason\":\"Started by mistake.\"}")
                .andExpect(status().isNoContent());
        List<String> reasons = jdbc.sql("SELECT reason FROM asg_check_out WHERE allocation_id = :a")
                .param("a", allocation).query(String.class).list();
        assertThat(reasons).as("check-out rows after cancelling the termination").containsExactly("TERM_END");
    }
}

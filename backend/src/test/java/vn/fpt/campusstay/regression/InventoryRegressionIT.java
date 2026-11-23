package vn.fpt.campusstay.regression;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

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

import vn.fpt.campusstay.PostgresTestcontainer;
import vn.fpt.campusstay.TestAuth;
import vn.fpt.campusstay.service.inventory.Inventory;
import vn.fpt.campusstay.service.setting.FeePolicy;

/** Wave 2 review findings on Blocks, Room Classes, prices and Beds still promised to someone. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class InventoryRegressionIT {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    Inventory inventory;

    @Autowired
    FeePolicy fees;

    RegressionSupport r;

    @BeforeEach
    void setUp() {
        r = new RegressionSupport(mvc, jdbc);
        // The test Term's frozen price table: every Room Type in Basic only (no Premium).
        jdbc.sql("""
                INSERT INTO cfg_term_price (term_id, room_type_id, room_class_id, price)
                SELECT :t, rt.id, c.id, 5000000 FROM cfg_room_type rt, cfg_room_class c WHERE c.name = 'Basic'
                ON CONFLICT DO NOTHING
                """).param("t", r.termId).update();
    }

    private ResultActions putJson(String path, String auth, String body) throws Exception {
        return mvc.perform(put(path).header(HttpHeaders.AUTHORIZATION, auth).contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    /** A live (REAL, PROPOSED) run proposing the given Bed to student n's Application. */
    private void proposed(int n, String room, String bed) throws Exception {
        RegressionSupport.Applied app = r.apply(n, "2-bed", "Basic");
        // A Term has one live run: reuse it when an earlier test made it.
        long run = jdbc.sql("SELECT id FROM asg_run WHERE term_id = :t AND status = 'PROPOSED'").param("t", r.termId)
                .query(Long.class).optional().orElseGet(() -> jdbc.sql("""
                INSERT INTO asg_run (term_id, kind, status, matching_snapshot_id, started_by)
                SELECT :t, 'REAL', 'PROPOSED', (SELECT id FROM cfg_matching_snapshot ORDER BY id LIMIT 1),
                       (SELECT id FROM auth_user WHERE email = :admin)
                RETURNING id
                """).param("t", r.termId).param("admin", TestAuth.ADMIN).query(Long.class).single());
        jdbc.sql("""
                INSERT INTO asg_proposal_item (run_id, application_id, building_id, bed_id)
                SELECT :run, a.id, ro.building_id, b.id
                FROM app_application a, inv_bed b JOIN inv_room ro ON ro.id = b.room_id
                WHERE a.code = :app AND ro.code = :room AND b.label = :bed
                """).param("run", run).param("app", app.id()).param("room", room).param("bed", bed).update();
    }

    /** TC-INV-031 (BE-2ND-03): a Block whose Beds a live run proposes cannot change gender. */
    @Test
    void blockGenderLockedWhileALiveRunProposesItsBeds() throws Exception {
        proposed(20, "B-301", "A");
        long b = jdbc.sql("SELECT id FROM inv_building WHERE code = 'B'").query(Long.class).single();
        var res = putJson("/admin/buildings/" + b, r.bearer(TestAuth.ADMIN),
                "{\"gender\":\"Male\",\"status\":\"Active\"}").andReturn().getResponse();
        assertThat(res.getStatus()).as(res.getContentAsString()).isEqualTo(409);
        assertThat(res.getContentAsString()).contains("BLOCK_IN_USE");
    }

    /** TC-INV-032 (BE-3RD-04): a Room whose Bed a live run proposes cannot be set out of service. */
    @Test
    void roomWithAProposedBedStaysInService() throws Exception {
        proposed(21, "B-302", "A");
        var res = r.postJson("/inventory/rooms/B-302/out-of-service", r.bearer(TestAuth.MANAGER_B),
                "{\"reason\":\"Maintenance\"}").andReturn().getResponse();
        assertThat(res.getStatus()).as(res.getContentAsString()).isEqualTo(409);
        assertThat(res.getContentAsString()).contains("ROOM_PROMISED");
    }

    /** TC-INV-033 (BE-2ND-04): a Room Class the Term's frozen price table does not offer is refused (NO_PRICE). */
    @Test
    void roomClassWithoutATermPriceIsRefused() throws Exception {
        long premium = jdbc.sql("SELECT id FROM cfg_room_class WHERE name = 'Premium'").query(Long.class).single();
        var res = putJson("/inventory/room-classes", r.manager(), """
                {"termId":"%d","rooms":["A-101"],"roomClassId":"%d"}""".formatted(r.termId, premium))
                .andReturn().getResponse();
        assertThat(res.getStatus()).as(res.getContentAsString()).isEqualTo(409);
        assertThat(res.getContentAsString()).contains("NO_PRICE");
    }

    /** TC-INV-034 (BE-3RD-02): a furniture type the Admin never priced is not charged at an invented price. */
    @Test
    void unpricedFurnitureHasNoPrice() {
        long type = jdbc.sql("SELECT id FROM inv_furniture_type ORDER BY id LIMIT 1").query(Long.class).single();
        jdbc.sql("UPDATE inv_furniture_type SET unit_price = NULL WHERE id = :id").param("id", type).update();
        assertThat(inventory.furniturePrices()).doesNotContainKey(type);
    }

    /** TC-CFG-033 (BE-3RD-03): a Room Class made Inactive keeps its frozen price in a published Term. */
    @Test
    void inactiveRoomClassKeepsItsTermPrice() {
        var row = jdbc.sql("SELECT room_type_id, room_class_id, price FROM cfg_term_price WHERE term_id = :t LIMIT 1")                .param("t", r.termId).query((rs, i) -> new long[] { rs.getLong(1), rs.getLong(2), rs.getLong(3) })
                .single();
        jdbc.sql("UPDATE cfg_room_class SET status = 'INACTIVE' WHERE id = :c").param("c", row[1]).update();
        try {
            assertThat(fees.termPrice(r.termId, row[0], row[1])).hasValue(row[2]);
        } finally {
            jdbc.sql("UPDATE cfg_room_class SET status = 'ACTIVE' WHERE id = :c").param("c", row[1]).update();
        }
    }
}

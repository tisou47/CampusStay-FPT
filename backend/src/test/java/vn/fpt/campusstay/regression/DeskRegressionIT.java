package vn.fpt.campusstay.regression;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.util.List;
import com.jayway.jsonpath.JsonPath;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import javax.sql.DataSource;

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

import vn.fpt.campusstay.PostgresTestcontainer;
import vn.fpt.campusstay.TestAuth;
import vn.fpt.campusstay.service.assignment.CheckOutFurnitureService;

/** Review findings BE-2ND-01, BE-2ND-02, BE-ASG-03, BE-OPS-01 (desk, check-out, furniture). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class DeskRegressionIT {

    private static final String CHECK_OUT = "{\"electricity\":10,\"water\":1,\"conditionGood\":true}";

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    DataSource dataSource;

    @Autowired
    CheckOutFurnitureService checkOutFurniture;

    RegressionSupport r;

    @BeforeEach
    void setUp() {
        r = new RegressionSupport(mvc, jdbc);
    }

    /** TC-ASG-068 (Wave 1 regression):
     * BE-2ND-01: a resident who holds the door code but never had a desk check-in (a continuing resident, or
     * handover off) can still be checked out.
     */
    @Test
    void be2nd01_residentWithoutDeskCheckInCanCheckOut() throws Exception {
        long id = r.livesIn(1, "A-101", "A", true, false);
        var res = r.postJson("/check-out/" + id, r.bearer(TestAuth.STAFF_A), CHECK_OUT).andReturn().getResponse();
        assertThat(res.getStatus()).as("check-out of a resident without desk check-in: " + res.getContentAsString())
                .isEqualTo(200);
    }

    /** TC-ASG-069 (Wave 1 regression): BE-2ND-02: two "Complete check-out" submits at once settle the check-out once (one meter cut). */
    @Test
    void be2nd02_doubleSubmittedCheckOutSettlesOnce() throws Exception {
        long id = r.livesIn(2, "A-102", "A", true);
        String staff = r.bearer(TestAuth.STAFF_A);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try (Connection lock = dataSource.getConnection()) {
            lock.setAutoCommit(false);
            try (PreparedStatement ps = lock.prepareStatement("SELECT id FROM asg_allocation WHERE id = ? FOR UPDATE")) {
                ps.setLong(1, id);
                ps.executeQuery();
            }
            // Both requests read the check-out state, then wait on the Allocation lock held here.
            List<Future<Integer>> calls = List.of(
                    pool.submit(() -> r.postJson("/check-out/" + id, staff, CHECK_OUT).andReturn().getResponse().getStatus()),
                    pool.submit(() -> r.postJson("/check-out/" + id, staff, CHECK_OUT).andReturn().getResponse().getStatus()));
            long deadline = System.currentTimeMillis() + 15_000;
            while (System.currentTimeMillis() < deadline && jdbc.sql("""
                    SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE '%asg_allocation%'
                    """).query(Long.class).single() < 2) {
                Thread.sleep(100);
            }
            lock.commit();
            List<Integer> statuses = List.of(calls.get(0).get(30, TimeUnit.SECONDS), calls.get(1).get(30, TimeUnit.SECONDS));
            long cuts = jdbc.sql("SELECT count(*) FROM bil_meter_cut WHERE allocation_id = :a AND reason = 'CHECK_OUT'")
                    .param("a", id).query(Long.class).single();
            assertThat(cuts).as("check-out meter cuts after two concurrent submits (HTTP %s)", statuses).isEqualTo(1);
        } finally {
            pool.shutdownNow();
        }
    }

    /** TC-ASG-070 (Wave 1 regression):
     * BE-ASG-03: a shared item's damage split among 3 residents at check-out is charged to the roommates who lived
     * with it, not to whoever lives in the Room when a Manager keeps the line a week later.
     */
    @Test
    void beAsg03_sharedDamageChargesTheRoommatesOfTheCheckOut() {
        long leaver = r.livesIn(3, "A-105", "A", true);
        long x = r.livesIn(4, "A-105", "B", true);
        r.livesIn(5, "A-105", "C", true);
        long item = jdbc.sql("""
                SELECT i.id FROM inv_furniture_item i JOIN inv_room ro ON ro.id = i.room_id
                WHERE ro.code = 'A-105' AND i.bed_id IS NULL AND i.status <> 'DISPOSED' ORDER BY i.id LIMIT 1
                """).query(Long.class).single();
        long checkOut = jdbc.sql("""
                INSERT INTO asg_check_out (allocation_id, reason, status, electricity, water, condition_good, key_returned,
                                           completed_at)
                VALUES (:a, 'TERM_END', 'COMPLETED', 10, 1, FALSE, TRUE, now()) RETURNING id
                """).param("a", leaver).query(Long.class).single();
        jdbc.sql("""
                INSERT INTO asg_check_out_damage (check_out_id, furniture_item_id, amount, condition, percent,
                                                  manager_review, shared_with, full_amount)
                VALUES (:c, :i, 300000, 'DAMAGED', 100, 'KEPT', 3, 900000)
                """).param("c", checkOut).param("i", item).update();
        jdbc.sql("UPDATE asg_allocation SET status = 'ENDED', end_reason = 'CHECK_OUT', ended_at = now() WHERE id IN (:ids)")
                .param("ids", List.of(leaver, x)).update();
        r.livesIn(6, "A-105", "D", true); // Y moves in after the damage

        checkOutFurniture.chargeRoommates(leaver, item);
        long yCharged = damageInvoices(6);
        long xCharged = damageInvoices(4);
        assertThat(yCharged).as("DAMAGE Invoices of Y, who moved in after the check-out (X has %d)", xCharged).isZero();
        assertThat(xCharged).as("DAMAGE Invoices of X, a roommate at the check-out").isEqualTo(1);
    }

    private static final byte[] PNG = { (byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0x0D, 'I', 'H',
            'D', 'R' };

    /** Adds a photo to the student's declaration of {@code item} (photos are required at check-out); its id. */
    private String declarePhoto(String bearer, long item) throws Exception {
        String added = mvc.perform(multipart("/students/me/furniture/report/photos")
                .file(new MockMultipartFile("photo", "item.png", "image/png", PNG))
                .param("itemId", "furniture-" + item).header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(added, "$.id");
    }

    /** TC-INV-030 (BE-OPS-09): a resident's in-stay furniture report shows on My Room and at the check-out desk. */
    @Test
    void inStayFurnitureReportReachesTheCheckOutDesk() throws Exception {
        long allocation = r.livesIn(11, "A-108", "A", true);
        long item = jdbc.sql("""
                SELECT i.id FROM inv_furniture_item i JOIN inv_room ro ON ro.id = i.room_id
                WHERE ro.code = 'A-108' AND i.bed_id IS NULL AND i.status <> 'DISPOSED' ORDER BY i.id LIMIT 1
                """).query(Long.class).single();
        String student = r.bearer(RegressionSupport.student(11));
        declarePhoto(student, item);
        mvc.perform(put("/students/me/furniture/report").header(HttpHeaders.AUTHORIZATION, student)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"itemId\":\"furniture-%d\",\"condition\":\"Damaged\",\"note\":\"Wardrobe door cracked\"}".formatted(item)))
                .andExpect(status().isOk());
        String mine = RegressionSupport.body(r.getAs("/students/me/furniture", student));
        assertThat((List<String>) JsonPath.read(mine, "$.items[?(@.reportedNote == 'Wardrobe door cracked')].reportedCondition"))
                .containsExactly("Damaged");
        String desk = RegressionSupport.body(r.getAs("/check-outs/" + allocation + "/furniture", r.bearer(TestAuth.STAFF_A)));
        assertThat((List<String>) JsonPath.read(desk, "$.items[?(@.studentReportedNote == 'Wardrobe door cracked')].studentReportedCondition"))
                .containsExactly("Damaged");
    }

    /**
     * TC-INV-035: a declared item and the meter readings need a photo first; the photos and readings show on My Room
     * and at the check-out desk; a student removes only their own photos, Good keeps them; the declaration is submitted
     * only once every item and the meters have a photo, and is final after that.
     */
    @Test
    void furnitureDeclarationPhotosReachTheCheckOutDesk() throws Exception {
        long allocation = r.livesIn(12, "A-109", "A", true);
        long item = jdbc.sql("""
                SELECT i.id FROM inv_furniture_item i JOIN inv_room ro ON ro.id = i.room_id
                WHERE ro.code = 'A-109' AND i.bed_id IS NULL AND i.status <> 'DISPOSED' ORDER BY i.id LIMIT 1
                """).query(Long.class).single();
        String student = r.bearer(RegressionSupport.student(12));
        String declaration = "{\"itemId\":\"furniture-%d\",\"condition\":\"Damaged\",\"note\":\"Leg cracked\"}".formatted(item);
        mvc.perform(put("/students/me/furniture/report").header(HttpHeaders.AUTHORIZATION, student)
                .contentType(MediaType.APPLICATION_JSON).content(declaration))
                .andExpect(status().isBadRequest()); // a photo first
        String photoId = declarePhoto(student, item);
        mvc.perform(put("/students/me/furniture/report").header(HttpHeaders.AUTHORIZATION, student)
                .contentType(MediaType.APPLICATION_JSON).content(declaration))
                .andExpect(status().isOk());

        String mine = RegressionSupport.body(r.getAs("/students/me/furniture", student));
        assertThat((List<String>) JsonPath.read(mine, "$.items[?(@.reportedNote == 'Leg cracked')].reportedPhotos[*].id"))
                .containsExactly(photoId);
        String desk = RegressionSupport.body(r.getAs("/check-outs/" + allocation + "/furniture", r.bearer(TestAuth.STAFF_A)));
        assertThat((List<Object>) JsonPath.read(desk, "$.items[?(@.studentReportedNote == 'Leg cracked')].studentReportedPhotos[*]"))
                .hasSize(1);

        String meters = "{\"electricity\":1234.5,\"water\":56}";
        mvc.perform(put("/students/me/check-out/meters").header(HttpHeaders.AUTHORIZATION, student)
                .contentType(MediaType.APPLICATION_JSON).content(meters))
                .andExpect(status().isBadRequest()); // a photo of the meters first
        mvc.perform(multipart("/students/me/check-out/meters/photos")
                .file(new MockMultipartFile("photo", "meters.png", "image/png", PNG))
                .header(HttpHeaders.AUTHORIZATION, student))
                .andExpect(status().isOk());
        mvc.perform(put("/students/me/check-out/meters").header(HttpHeaders.AUTHORIZATION, student)
                .contentType(MediaType.APPLICATION_JSON).content("{\"electricity\":-1,\"water\":56}"))
                .andExpect(status().isBadRequest());
        mvc.perform(put("/students/me/check-out/meters").header(HttpHeaders.AUTHORIZATION, student)
                .contentType(MediaType.APPLICATION_JSON).content(meters))
                .andExpect(status().isOk());
        String desk2 = RegressionSupport.body(r.getAs("/check-outs/" + allocation + "/furniture", r.bearer(TestAuth.STAFF_A)));
        assertThat(((Number) JsonPath.read(desk2, "$.studentMeters.electricity")).doubleValue()).isEqualTo(1234.5);
        assertThat((List<Object>) JsonPath.read(desk2, "$.studentMeters.photos")).hasSize(1);
        assertThat((List<Object>) JsonPath.read(desk2, "$.items[?(@.studentReportedNote == 'Leg cracked')].studentReportedPhotos[*]"))
                .as("a meter photo is not an item's photo").hasSize(1);

        mvc.perform(delete("/students/me/furniture/report/photos/" + photoId)
                .header(HttpHeaders.AUTHORIZATION, r.bearer(RegressionSupport.student(11))))
                .andExpect(status().isNotFound());
        mvc.perform(put("/students/me/furniture/report").header(HttpHeaders.AUTHORIZATION, student)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"itemId\":\"furniture-%d\",\"condition\":\"Good\"}".formatted(item)))
                .andExpect(status().isOk());
        long kept = jdbc.sql("SELECT count(*) FROM asg_furniture_report_photo WHERE allocation_id = :a AND furniture_item_id = :i")
                .param("a", allocation).param("i", item).query(Long.class).single();
        assertThat(kept).as("photos kept after the item was declared Good again").isEqualTo(1);

        jdbc.sql("""
                INSERT INTO inv_furniture_item (asset_code, furniture_type_id, status, room_id)
                SELECT 'TST-A109-2', i.furniture_type_id, 'IN_USE', i.room_id FROM inv_furniture_item i WHERE i.id = :i
                """).param("i", item).update(); // a second item, still without a photo
        mvc.perform(post("/students/me/check-out/submit").header(HttpHeaders.AUTHORIZATION, student))
                .andExpect(status().isBadRequest()); // every item needs a photo
        List<Long> others = jdbc.sql("""
                SELECT i.id FROM inv_furniture_item i JOIN inv_furniture_type ty ON ty.id = i.furniture_type_id
                JOIN inv_room ro ON ro.id = i.room_id
                LEFT JOIN inv_bed b ON b.id = i.bed_id
                WHERE ro.code = 'A-109' AND i.status <> 'DISPOSED' AND i.id <> :i
                  AND (ty.use_scope <> 'PERSONAL' OR i.bed_id IS NULL OR b.label = 'A')
                """).param("i", item).query(Long.class).list();
        for (long other : others) {
            declarePhoto(student, other);
        }
        mvc.perform(post("/students/me/check-out/submit").header(HttpHeaders.AUTHORIZATION, student))
                .andExpect(status().isOk());
        String desk3 = RegressionSupport.body(r.getAs("/check-outs/" + allocation + "/furniture", r.bearer(TestAuth.STAFF_A)));
        assertThat((String) JsonPath.read(desk3, "$.declarationSubmittedAt")).isNotNull();
        mvc.perform(put("/students/me/check-out/meters").header(HttpHeaders.AUTHORIZATION, student)
                .contentType(MediaType.APPLICATION_JSON).content(meters))
                .andExpect(status().isConflict()); // final once submitted
    }

    /** TC-ASG-075 (BE-ASG-10): a shared item's damage split among 3 residents invoices each roommate full/3 (rounded down). */
    @Test
    void sharedDamageIsSplitEvenlyAmongTheRoommates() {
        long leaver = r.livesIn(8, "A-107", "A", true);
        r.livesIn(9, "A-107", "B", true);
        r.livesIn(10, "A-107", "C", true);
        long item = jdbc.sql("""
                SELECT i.id FROM inv_furniture_item i JOIN inv_room ro ON ro.id = i.room_id
                WHERE ro.code = 'A-107' AND i.bed_id IS NULL AND i.status <> 'DISPOSED' ORDER BY i.id LIMIT 1
                """).query(Long.class).single();
        long checkOut = jdbc.sql("""
                INSERT INTO asg_check_out (allocation_id, reason, status, electricity, water, condition_good, key_returned,
                                           completed_at)
                VALUES (:a, 'TERM_END', 'COMPLETED', 10, 1, FALSE, TRUE, now()) RETURNING id
                """).param("a", leaver).query(Long.class).single();
        jdbc.sql("""
                INSERT INTO asg_check_out_damage (check_out_id, furniture_item_id, amount, condition, percent,
                                                  manager_review, shared_with, full_amount)
                VALUES (:c, :i, 333334, 'DAMAGED', 100, 'KEPT', 3, 1000000)
                """).param("c", checkOut).param("i", item).update();
        jdbc.sql("UPDATE asg_allocation SET status = 'ENDED', end_reason = 'CHECK_OUT', ended_at = now() WHERE id = :id")
                .param("id", leaver).update();

        checkOutFurniture.chargeRoommates(leaver, item);
        for (int n : new int[] { 9, 10 }) {
            long amount = jdbc.sql("""
                    SELECT coalesce(sum(i.amount), 0) FROM bil_invoice i JOIN auth_user u ON u.id = i.student_id
                    WHERE u.email = :e AND i.type = 'DAMAGE'
                    """).param("e", RegressionSupport.student(n)).query(Long.class).single();
            assertThat(amount).as("roommate %d's share of 1,000,000 ÷ 3", n).isEqualTo(333_333);
        }
    }

    private long damageInvoices(int n) {
        return jdbc.sql("""
                SELECT count(*) FROM bil_invoice i JOIN auth_user u ON u.id = i.student_id
                WHERE u.email = :e AND i.type = 'DAMAGE'
                """).param("e", RegressionSupport.student(n)).query(Long.class).single();
    }

    /** TC-INV-029 (Wave 1 regression):
     * BE-OPS-01: once the student also holds a next-Term Allocation (from M2), a furniture report still attaches to
     * the Allocation of the current stay, the one the check-out reads.
     */
    @Test
    void beOps01_furnitureReportAttachesToCurrentStay() throws Exception {
        long current = r.livesIn(7, "A-106", "A", true);
        jdbc.sql("""
                INSERT INTO asg_allocation (term_id, student_id, bed_id, source, allocated_at)
                SELECT t.id, a.student_id, a.bed_id, 'RENEWAL', now() + interval '1 minute'
                FROM asg_allocation a, cfg_term t WHERE a.id = :a AND t.code = 'SP27'
                """).param("a", current).update();
        long item = jdbc.sql("""
                SELECT i.id FROM inv_furniture_item i JOIN inv_room ro ON ro.id = i.room_id
                WHERE ro.code = 'A-106' AND i.bed_id IS NULL AND i.status <> 'DISPOSED' ORDER BY i.id LIMIT 1
                """).query(Long.class).single();
        declarePhoto(r.bearer(RegressionSupport.student(7)), item);
        mvc.perform(put("/students/me/furniture/report").header(HttpHeaders.AUTHORIZATION, r.bearer(RegressionSupport.student(7)))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"itemId\":\"furniture-%d\",\"condition\":\"Damaged\",\"note\":\"Door hinge broken\"}".formatted(item)))
                .andExpect(status().isOk());
        List<Long> on = jdbc.sql("SELECT allocation_id FROM asg_furniture_report WHERE furniture_item_id = :i")
                .param("i", item).query(Long.class).list();
        assertThat(on).as("Allocation(s) the report was written to (current stay = %d)", current).containsExactly(current);
    }
}

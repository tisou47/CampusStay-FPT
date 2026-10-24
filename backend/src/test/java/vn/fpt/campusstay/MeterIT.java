package vn.fpt.campusstay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.MANAGER_B;
import static vn.fpt.campusstay.TestAuth.bearer;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
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
import org.springframework.test.web.servlet.ResultActions;

import vn.fpt.campusstay.config.TimeConfig;

/** Monthly meter readings and Utility Invoices (TC-BIL-023…026). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class MeterIT {

    private static final String STAFF_A2 = "staff.a2@campusstay.test";

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    StayFlow stay;

    @BeforeEach
    void setUp() {
        ApplyFlow flow = new ApplyFlow(mvc, jdbc);
        stay = new StayFlow(mvc, jdbc, flow, flow.openTerm());
    }

    /** Two residents of a Room, and last month's closed reading of that Room (1,000 kWh, 40 m³; it used 100 kWh). */
    private void residentsWithLastMonth(String block, String room, int first, int second) {
        stay.livesIn(first, room, "A", true);
        stay.livesIn(second, room, "B", true);
        LocalDate start = LocalDate.now(TimeConfig.CAMPUS_ZONE).withDayOfMonth(1).minusMonths(1);
        jdbc.sql("""
                INSERT INTO bil_meter_period (building_id, label, period_start, period_end, due_at, closed_at)
                SELECT id, :label, :start, :end, now(), now() FROM inv_building WHERE code = :block
                ON CONFLICT (building_id, period_start) DO NOTHING
                """).param("block", block).param("label", "%02d/%d".formatted(start.getMonthValue(), start.getYear())).param("start", start)
                .param("end", start.withDayOfMonth(start.lengthOfMonth())).update();
        jdbc.sql("""
                INSERT INTO bil_meter_reading (period_id, room_id, electricity_prev, electricity_curr, water_prev,
                                               water_curr, status)
                SELECT p.id, r.id, 900, 1000, 30, 40, 'CONFIRMED'
                FROM bil_meter_period p JOIN inv_building b ON b.id = p.building_id, inv_room r
                WHERE b.code = :block AND p.period_start = :start AND r.code = :room
                ON CONFLICT (period_id, room_id) DO NOTHING
                """).param("block", block).param("start", start).param("room", room).update();
    }

    private String currentPeriod(String auth, String block) throws Exception {
        String json = mvc.perform(get("/meter-periods").param("block", block).header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(json, "$.items[0].id");
    }

    private ResultActions putReading(String auth, String period, String room, String body) throws Exception {
        return mvc.perform(put("/meter-periods/" + period + "/readings/" + room).header(HttpHeaders.AUTHORIZATION, auth)
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private ResultActions readings(String auth, String period) throws Exception {
        return mvc.perform(get("/meter-periods/" + period + "/readings").param("pageSize", "100")
                .header(HttpHeaders.AUTHORIZATION, auth));
    }

    /** TC-BIL-023: the current month opens on first use; Rooms with residents wait for a reading. */
    @Test
    void periodsAndReadings() throws Exception {
        residentsWithLastMonth("A", "A-101", 1, 2);
        String staff = bearer(mvc, STAFF_A2);
        LocalDate today = LocalDate.now(TimeConfig.CAMPUS_ZONE);
        String label = "%02d/%d".formatted(today.getMonthValue(), today.getYear());

        mvc.perform(get("/meter-periods").param("block", "A").header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].label").value(label))
                .andExpect(jsonPath("$.items[0].closed").value(false))
                .andExpect(jsonPath("$.items[1].closed").value(true));
        String period = currentPeriod(staff, "A");

        readings(staff, period).andExpect(status().isOk())
                .andExpect(jsonPath("$.period.label").value(label))
                .andExpect(jsonPath("$.items[?(@.room == 'A-101')].status").value(hasItem("Missing")))
                .andExpect(jsonPath("$.items[?(@.room == 'A-101')].residents").value(hasItem(2)))
                .andExpect(jsonPath("$.items[?(@.room == 'A-101')].electricity.previous").value(hasItem(1000.0)));
        mvc.perform(get("/meter-periods/" + period + "/readings").param("status", "Lost")
                .header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.details.fields.status").exists());

        // Scope: Block B's Staff and students cannot read Block A's meters.
        readings(bearer(mvc, TestAuth.STAFF_B2), period).andExpect(status().isForbidden());
        readings(bearer(mvc, StayFlow.student(1)), period).andExpect(status().isForbidden());
    }

    /** TC-BIL-024: a reading may not go back; an unusual jump waits for a confirmation. */
    @Test
    void readingRules() throws Exception {
        residentsWithLastMonth("A", "A-102", 3, 4);
        String staff = bearer(mvc, STAFF_A2);
        String period = currentPeriod(staff, "A");
        readings(staff, period).andExpect(status().isOk());

        putReading(staff, period, "A-102", "{\"electricity\":950,\"water\":45}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.electricity").exists());
        mvc.perform(post("/meter-periods/" + period + "/readings/A-102/confirm").header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("READING_MISSING"));

        // 500 kWh against 100 kWh last month: more than three times as much.
        putReading(staff, period, "A-102", "{\"electricity\":1500,\"water\":45}").andExpect(status().isNoContent());
        readings(staff, period).andExpect(jsonPath("$.items[?(@.room == 'A-102')].status").value(hasItem("Check value")));
        mvc.perform(post("/meter-periods/" + period + "/close").header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("READINGS_TO_CHECK"));

        mvc.perform(post("/meter-periods/" + period + "/readings/A-102/confirm").header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(status().isNoContent());
        readings(staff, period).andExpect(jsonPath("$.items[?(@.room == 'A-102')].status").value(hasItem("Confirmed")));

        putReading(staff, period, "A-102", "{\"electricity\":1100,\"water\":45}").andExpect(status().isNoContent());
        mvc.perform(get("/meter-periods/" + period + "/readings/A-102").header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("Entered"))
                .andExpect(jsonPath("$.priceKwh").value(3500))
                .andExpect(jsonPath("$.segments.length()").value(1))
                .andExpect(jsonPath("$.segments[0].electricityCost").value(350_000))
                .andExpect(jsonPath("$.segments[0].waterCost").value(75_000))
                .andExpect(jsonPath("$.shares.length()").value(2))
                .andExpect(jsonPath("$.shares[0].amount").value(213_000));
        putReading(staff, period, "A-999", "{\"electricity\":1,\"water\":1}").andExpect(status().isNotFound());
    }

    /** TC-BIL-025: a CSV import checks every line before it saves any. */
    @Test
    void importCsv() throws Exception {
        residentsWithLastMonth("A", "A-103", 5, 6);
        String staff = bearer(mvc, STAFF_A2);
        String period = currentPeriod(staff, "A");
        readings(staff, period).andExpect(status().isOk());

        MockMultipartFile bad = new MockMultipartFile("file", "readings.csv", "text/csv",
                "room,electricity,water\nA-103,1100,45\nZ-999,1,1\n".getBytes(StandardCharsets.UTF_8));
        mvc.perform(multipart("/meter-periods/" + period + "/import").file(bad).header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.details.fields.file").exists());
        readings(staff, period).andExpect(jsonPath("$.items[?(@.room == 'A-103')].status").value(hasItem("Missing")));

        MockMultipartFile good = new MockMultipartFile("file", "readings.csv", "text/csv",
                "room,electricity,water\nA-103,1100,45\n".getBytes(StandardCharsets.UTF_8));
        mvc.perform(multipart("/meter-periods/" + period + "/import").file(good).header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(status().isOk()).andExpect(jsonPath("$.imported").value(1));
        readings(staff, period).andExpect(jsonPath("$.items[?(@.room == 'A-103')].status").value(hasItem("Entered")));
    }

    /** TC-BIL-026: closing the month issues each resident's Utility Invoice with its breakdown; then it is read-only. */
    @Test
    void closeIssuesUtilityInvoices() throws Exception {
        residentsWithLastMonth("B", "B-101", 25, 26);
        String staff = bearer(mvc, MANAGER_B);
        String period = currentPeriod(staff, "B");
        String json = readings(staff, period).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        List<String> rooms = JsonPath.read(json, "$.items[*].room");
        mvc.perform(post("/meter-periods/" + period + "/close").header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("READINGS_MISSING"));

        long before = jdbc.sql("SELECT count(*) FROM bil_invoice WHERE type = 'UTILITY'").query(Long.class).single();
        for (String room : rooms) {
            putReading(staff, period, room, "{\"electricity\":1100,\"water\":45}").andExpect(status().isNoContent());
        }
        mvc.perform(post("/meter-periods/" + period + "/readings/B-101/confirm").header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(status().isNoContent());
        String closed = mvc.perform(post("/meter-periods/" + period + "/close").header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        int issued = JsonPath.read(closed, "$.invoicesIssued");
        assertThat(issued).isGreaterThanOrEqualTo(2);
        assertThat(jdbc.sql("SELECT count(*) FROM bil_invoice WHERE type = 'UTILITY'").query(Long.class).single())
                .isEqualTo(before + issued);

        String student = bearer(mvc, StayFlow.student(25));
        String mine = mvc.perform(get("/students/me/invoices").header(HttpHeaders.AUTHORIZATION, student))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        List<String> utility = JsonPath.read(mine, "$.items[?(@.typeLabel == 'Utility')].id");
        assertThat(utility).hasSize(1);
        mvc.perform(get("/invoices/" + utility.getFirst()).header(HttpHeaders.AUTHORIZATION, student))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.room").value("B-101"))
                .andExpect(jsonPath("$.amount").value(213_000))
                .andExpect(jsonPath("$.breakdown.segments.length()").value(1))
                .andExpect(jsonPath("$.breakdown.segments[0].residents").value(2))
                .andExpect(jsonPath("$.breakdown.priceKwh").value(3500));

        putReading(staff, period, "B-101", "{\"electricity\":1200,\"water\":50}").andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PERIOD_CLOSED"));
        mvc.perform(get("/meter-periods").param("block", "B").header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(jsonPath("$.items[0].closed").value(true));
    }
}

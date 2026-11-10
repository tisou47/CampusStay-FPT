package vn.fpt.campusstay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.ADMIN;
import static vn.fpt.campusstay.TestAuth.MANAGER_A;
import static vn.fpt.campusstay.TestAuth.MANAGER_B;
import static vn.fpt.campusstay.TestAuth.STUDENT;
import static vn.fpt.campusstay.TestAuth.bearer;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

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

import com.jayway.jsonpath.JsonPath;

/**
 * Admin › Registration periods › Terms: the wizard (spec §6.4, ADR-20; TC-CFG-019…022, 030). Terms of these tests stay in
 * 2032; their registration opens yesterday so students can apply to them.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class TermWizardIT {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    private static final Instant NOW = Instant.now().truncatedTo(ChronoUnit.MINUTES);

    private String id(String table, String column, String value) {
        return jdbc.sql("SELECT id::text FROM " + table + " WHERE " + column + " = :v").param("v", value)
                .query(String.class).single();
    }

    private ResultActions send(String method, String path, String auth, String json) throws Exception {
        var builder = method.equals("PUT") ? put(path) : post(path);
        return mvc.perform(builder.header(HttpHeaders.AUTHORIZATION, auth).contentType(MediaType.APPLICATION_JSON)
                .content(json));
    }

    private String json(String path, String auth) throws Exception {
        return mvc.perform(get(path).header(HttpHeaders.AUTHORIZATION, auth)).andExpect(status().isOk()).andReturn()
                .getResponse().getContentAsString();
    }

    private static String at(long days) {
        return "\"" + NOW.plus(days, ChronoUnit.DAYS) + "\"";
    }

    /** Registration from yesterday to {@code closes} days from now; Check-in and the stay in {@code year}. */
    private static String timeline(int closes, String checkInStart, String checkInEnd, String checkOutBy) {
        return """
                {"registrationOpensAt":%s,"registrationClosesAt":%s,"resultsPublishedAt":%s,"roommateHours":48,
                 "depositHours":48,"balanceDueAt":%s,"checkInStart":"%s","checkInEnd":"%s","checkOutBy":"%s"}"""
                .formatted(at(-1), at(closes), at(closes + 5), at(closes + 20), checkInStart, checkInEnd, checkOutBy);
    }

    /** Every price line of the wizard, with one line changed. */
    private static String prices(String wizard, String typeId, String classId, long price) {
        List<Map<String, Object>> rows = JsonPath.read(wizard, "$.prices.rows");
        List<String> lines = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            boolean changed = r.get("roomTypeId").equals(typeId) && r.get("roomClassId").equals(classId);
            lines.add("{\"roomTypeId\":\"%s\",\"roomClassId\":\"%s\",\"price\":%s}".formatted(r.get("roomTypeId"),
                    r.get("roomClassId"), changed ? price : r.get("price")));
        }
        return "[" + String.join(",", lines) + "]";
    }

    private String fourBed() {
        return id("cfg_room_type", "name", "4-bed");
    }

    private String standard() {
        return id("cfg_room_class", "name", "Standard");
    }

    /** A Draft that goes through every step; returns its id. */
    private String fullDraft(String admin, String name, String stayStart, String stayEnd, String checkIn) throws Exception {
        String id = JsonPath.read(send("POST", "/admin/terms/drafts", admin,
                "{\"name\":\"%s\",\"stayStart\":\"%s\",\"stayEnd\":\"%s\"}".formatted(name, stayStart, stayEnd))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(), "$.id");
        String base = "/admin/terms/" + id + "/wizard/";
        send("PUT", base + "general", admin, "{\"name\":\"%s\",\"stayStart\":\"%s\",\"stayEnd\":\"%s\"}"
                .formatted(name, stayStart, stayEnd)).andExpect(status().isOk());
        send("PUT", base + "timeline", admin, "{\"timeline\":" + timeline(20, checkIn, checkIn, stayEnd) + "}")
                .andExpect(status().isOk());
        send("PUT", base + "rooms", admin, "{\"blockIds\":[],\"excludedRooms\":[],\"reservedNewPercent\":10}")
                .andExpect(status().isOk());
        String wizard = json("/admin/terms/" + id + "/wizard", admin);
        send("PUT", base + "prices", admin, "{\"prices\":" + prices(wizard, fourBed(), standard(), 7_200_000)
                + ",\"depositPercent\":25,\"utilityDeposit\":500000}").andExpect(status().isOk());
        send("PUT", base + "rules", admin, "{}").andExpect(status().isOk());
        send("PUT", base + "information", admin, """
                {"houseRules":"No cooking in the Rooms.","faq":[{"question":"Can I choose my Bed?","answer":"No."}],
                 "documents":[{"title":"Dormitory rules","url":"https://example.edu/rules.pdf"}]}""")
                .andExpect(status().isOk());
        return id;
    }

    /**
     * TC-CFG-019: the Admin builds the Draft from a Manager's request: it holds the request's dates, Blocks, Rooms and
     * prices, the request is In progress (the Manager is told) and building again opens the same Draft; a price that
     * differs from the request needs a reason, which the request then shows next to the difference.
     */
    @Test
    void buildsTheTermFromARequest() throws Exception {
        String manager = bearer(mvc, MANAGER_A);
        String admin = bearer(mvc, ADMIN);
        String request = """
                {"termName":"Summer 2032","stayStart":"2032-05-10","stayEnd":"2032-08-20",
                 "timeline":%s,"blocks":["A"],"excludedRooms":["A-101"],
                 "places":[{"roomTypeId":"%s","roomClassId":"%s","gender":"M","places":20}],
                 "prices":[{"roomTypeId":"%s","roomClassId":"%s","price":7500000}]}"""
                .formatted(timeline(20, "2032-05-07", "2032-05-09", "2032-08-21"), fourBed(), standard(), fourBed(),
                        standard());
        String requestId = JsonPath.read(send("POST", "/term-requests", manager, request)
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");

        String termId = JsonPath.read(send("POST", "/admin/terms/drafts", admin, "{\"requestId\":\"" + requestId + "\"}")
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(), "$.id");
        send("POST", "/admin/terms/drafts", admin, "{\"requestId\":\"" + requestId + "\"}")
                .andExpect(jsonPath("$.id").value(termId));
        mvc.perform(get("/term-requests/" + requestId).header(HttpHeaders.AUTHORIZATION, manager))
                .andExpect(jsonPath("$.status").value("In progress"))
                .andExpect(jsonPath("$.term.id").value(termId))
                .andExpect(jsonPath("$.history[*].kind", contains("Submitted", "Draft built")));
        mvc.perform(get("/notifications").header(HttpHeaders.AUTHORIZATION, manager))
                .andExpect(jsonPath("$.items[0].title").value("Being built · Summer 2032"));

        String wizard = json("/admin/terms/" + termId + "/wizard", admin);
        assertThat((String) JsonPath.read(wizard, "$.status")).isEqualTo("Draft");
        assertThat((String) JsonPath.read(wizard, "$.request.code")).isEqualTo("RP-" + requestId);
        assertThat((String) JsonPath.read(wizard, "$.general.stayStart")).isEqualTo("2032-05-10");
        assertThat((String) JsonPath.read(wizard, "$.timeline.values.checkInStart")).isEqualTo("2032-05-07");
        assertThat((List<String>) JsonPath.read(wizard, "$.rooms.excludedRooms")).containsExactly("A-101");
        assertThat((List<Boolean>) JsonPath.read(wizard, "$.rooms.blocks[?(@.code == 'B')].used")).containsExactly(false);
        String line = "$.prices.rows[?(@.roomType == '4-bed' && @.roomClass == 'Standard')]";
        assertThat((List<Integer>) JsonPath.read(wizard, line + ".price")).containsExactly(7_500_000);
        assertThat((List<Integer>) JsonPath.read(wizard, line + ".requested")).containsExactly(7_500_000);
        assertThat((List<Integer>) JsonPath.read(wizard, line + ".defaultPrice")).containsExactly(6_900_000);
        assertThat((List<Integer>) JsonPath.read(wizard, "$.rooms.supply[?(@.roomType == '4-bed' && @.roomClass == "
                + "'Standard' && @.gender == 'M')].requested")).containsExactly(20);
        assertThat((List<Object>) JsonPath.read(wizard, "$.differences")).isEmpty();

        String field = "price:" + fourBed() + ":" + standard();
        String body = "{\"prices\":" + prices(wizard, fourBed(), standard(), 7_800_000)
                + ",\"depositPercent\":20,\"utilityDeposit\":600000%s}";
        send("PUT", "/admin/terms/" + termId + "/wizard/prices", admin, body.formatted(""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields['" + field + "']")
                        .value("Give a reason for changing the Manager's value."));
        send("PUT", "/admin/terms/" + termId + "/wizard/prices", admin,
                body.formatted(",\"reasons\":{\"" + field + "\":\"Air conditioners were replaced this year.\"}"))
                .andExpect(status().isOk());
        mvc.perform(get("/term-requests/" + requestId).header(HttpHeaders.AUTHORIZATION, manager))
                .andExpect(jsonPath("$.differences", hasSize(1)))
                .andExpect(jsonPath("$.differences[0].label").value("Price · 4-bed · Standard"))
                .andExpect(jsonPath("$.differences[0].proposed").value("7500000"))
                .andExpect(jsonPath("$.differences[0].built").value("7800000"))
                .andExpect(jsonPath("$.differences[0].reason").value("Air conditioners were replaced this year."));
    }

    /**
     * TC-CFG-030: the Manager proposes prices as a base price per Room Type and a surcharge per Room Class (BR-10: the
     * request computes each line, rounded up), offers one Room Type and one Room Class, and proposes the Deposit,
     * Utility Deposit, the share for new students and the house rules (review R-02, R-03), starting from the defaults
     * ({@code /term-requests/defaults}). The Draft built from it
     * holds them all; the Admin's different Deposit needs a reason and is listed for the Manager; a surcharge above
     * 500% is refused.
     */
    @Test
    void buildsTheOfferAndMoneyTheManagerProposed() throws Exception {
        String manager = bearer(mvc, MANAGER_A);
        String admin = bearer(mvc, ADMIN);
        String body = """
                {"termName":"Spring 2034","stayStart":"2034-01-10","stayEnd":"2034-04-20","timeline":%s,
                 "roomTypes":["%s"],"roomClasses":["%s"],
                 "basePrices":[{"roomTypeId":"%s","price":6100123}],
                 "surcharges":[{"roomClassId":"%s","percent":%s}],
                 "reservedNewPercent":15,"depositPercent":25,"utilityDeposit":700000,
                 "houseRules":"No pets.","faq":[{"question":"Is there a gym?","answer":"Yes, in Block B."}]}""";
        String timeline = timeline(20, "2034-01-07", "2034-01-09", "2034-04-21");
        long base = jdbc.sql("SELECT base_price FROM cfg_room_type WHERE name = '4-bed'").query(Long.class).single();
        mvc.perform(get("/term-requests/defaults").header(HttpHeaders.AUTHORIZATION, manager))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.roomTypes[?(@.name == '4-bed')].basePrice", contains((int) base)))
                .andExpect(jsonPath("$.roomClasses[?(@.name == 'Standard')].surchargePercent", hasSize(1)))
                .andExpect(jsonPath("$.depositPercent").isNumber())
                .andExpect(jsonPath("$.utilityDeposit").isNumber());
        send("POST", "/term-requests", manager, body.formatted(timeline, fourBed(), standard(), fourBed(), standard(),
                "600")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.surcharges").value("Enter a surcharge from 0% to 500%."));
        String requestId = JsonPath.read(send("POST", "/term-requests", manager, body.formatted(timeline, fourBed(),
                standard(), fourBed(), standard(), "15.5")).andExpect(status().isCreated()).andReturn().getResponse()
                .getContentAsString(), "$.id");
        mvc.perform(get("/term-requests/" + requestId).header(HttpHeaders.AUTHORIZATION, manager))
                .andExpect(jsonPath("$.prices", hasSize(1)))
                .andExpect(jsonPath("$.prices[0].price").value(7_046_000))
                .andExpect(jsonPath("$.basePrices[0].price").value(6_100_123))
                .andExpect(jsonPath("$.basePrices[0].defaultPrice").value(base))
                .andExpect(jsonPath("$.surcharges[0].percent").value(15.5))
                .andExpect(jsonPath("$.surcharges[0].defaultPercent").isNumber())
                .andExpect(jsonPath("$.settings.roomTypes[*].name", contains("4-bed")))
                .andExpect(jsonPath("$.settings.roomClasses[*].name", contains("Standard")))
                .andExpect(jsonPath("$.settings.depositPercent").value(25))
                .andExpect(jsonPath("$.settings.utilityDeposit").value(700_000))
                .andExpect(jsonPath("$.settings.reservedNewPercent").value(15))
                .andExpect(jsonPath("$.settings.houseRules").value("No pets."));

        String termId = JsonPath.read(send("POST", "/admin/terms/drafts", admin, "{\"requestId\":\"" + requestId + "\"}")
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(), "$.id");
        String wizard = json("/admin/terms/" + termId + "/wizard", admin);
        assertThat((List<String>) JsonPath.read(wizard, "$.rooms.roomTypes[?(@.used == true)].name"))
                .containsExactly("4-bed");
        assertThat((List<String>) JsonPath.read(wizard, "$.rooms.roomClasses[?(@.used == true)].name"))
                .containsExactly("Standard");
        assertThat((List<Object>) JsonPath.read(wizard, "$.rooms.supply[?(@.roomType != '4-bed')]")).isEmpty();
        assertThat(JsonPath.read(wizard, "$.rooms.reservedNewPercent").toString()).isIn("15", "15.0");
        assertThat((List<Object>) JsonPath.read(wizard, "$.prices.rows")).hasSize(1);
        assertThat((Integer) JsonPath.read(wizard, "$.prices.rows[0].price")).isEqualTo(7_046_000);
        assertThat((Integer) JsonPath.read(wizard, "$.prices.utilityDeposit")).isEqualTo(700_000);
        assertThat(JsonPath.read(wizard, "$.prices.depositPercent").toString()).isEqualTo("25");
        assertThat((String) JsonPath.read(wizard, "$.information.houseRules")).isEqualTo("No pets.");
        assertThat((List<Object>) JsonPath.read(wizard, "$.differences")).isEmpty();

        String prices = "{\"prices\":" + prices(wizard, fourBed(), standard(), 7_046_000)
                + ",\"depositPercent\":20,\"utilityDeposit\":700000%s}";
        send("PUT", "/admin/terms/" + termId + "/wizard/prices", admin, prices.formatted(""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.depositPercent")
                        .value("Give a reason for changing the Manager's value."));
        send("PUT", "/admin/terms/" + termId + "/wizard/prices", admin,
                prices.formatted(",\"reasons\":{\"depositPercent\":\"The same Deposit for every Term.\"}"))
                .andExpect(status().isOk());
        send("PUT", "/admin/terms/" + termId + "/wizard/rooms", admin,
                "{\"blockIds\":[],\"excludedRooms\":[],\"reservedNewPercent\":15,\"roomTypeIds\":[],"
                        + "\"roomClassIds\":[\"" + standard() + "\"]}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.roomTypeIds").value("Choose at least one active Room Type."));
        mvc.perform(get("/term-requests/" + requestId).header(HttpHeaders.AUTHORIZATION, manager))
                .andExpect(jsonPath("$.differences", hasSize(1)))
                .andExpect(jsonPath("$.differences[0].label").value("Deposit"))
                .andExpect(jsonPath("$.differences[0].proposed").value("25"))
                .andExpect(jsonPath("$.differences[0].built").value("20"))
                .andExpect(jsonPath("$.differences[0].reason").value("The same Deposit for every Term."));
    }

    /**
     * TC-CFG-020 (negative): the Timeline step checks spec §5.2 per field: registration closing before it opens,
     * renewal milestones filled in only partly or out of order, Check-in before the Term before is left.
     */
    @Test
    void timelineFollowsTheRules() throws Exception {
        String admin = bearer(mvc, ADMIN);
        String id = JsonPath.read(send("POST", "/admin/terms/drafts", admin,
                "{\"name\":\"Fall 2032\",\"stayStart\":\"2032-09-06\",\"stayEnd\":\"2032-12-20\"}")
                .andReturn().getResponse().getContentAsString(), "$.id");
        String path = "/admin/terms/" + id + "/wizard/timeline";
        send("PUT", path, admin, "{\"timeline\":{\"registrationOpensAt\":" + at(5) + ",\"registrationClosesAt\":"
                + at(1) + "}}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.registrationClosesAt").value("Registration must close after it opens."))
                .andExpect(jsonPath("$.details.fields.checkInStart").value("Enter the first Check-in day."));
        String valid = timeline(20, "2032-09-02", "2032-09-05", "2032-12-21");
        send("PUT", path, admin, "{\"timeline\":" + valid.replace("{", "{\"requestsOpenAt\":" + at(2) + ",") + "}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.publishAt")
                        .value("Fill in every renewal milestone, or leave them all empty."));
        String renewal = "{\"publishAt\":%s,\"requestsOpenAt\":%s,\"requestsCloseAt\":%s,\"decisionsDueAt\":%s,"
                + "\"reconciliationDueAt\":%s,\"feesIssueAt\":%s,\"feesDueAt\":%s,";
        send("PUT", path, admin, "{\"timeline\":" + valid.replace("{", renewal.formatted(at(3), at(2), at(10), at(9),
                at(12), at(13), at(15))) + "}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.requestsOpenAt")
                        .value("The requests window opens on or after the Term is published."))
                .andExpect(jsonPath("$.details.fields.decisionsDueAt")
                        .value("Decisions are due after the requests window closes."));
        // A Term published just before: Check-in may not start before its residents must leave.
        jdbc.sql("""
                INSERT INTO cfg_term (code, name, status, stay_start, stay_end, registration_opens_at,
                                      registration_closes_at, results_published_at, roommate_hours, deposit_hours,
                                      balance_due_at, check_in_start, check_in_end, check_out_by, published_at)
                VALUES ('SU32X', 'Summer 2032 X', 'PUBLISHED', DATE '2032-05-01', DATE '2032-08-25', now(), now() + interval '1 day',
                        now() + interval '2 days', 48, 48, now() + interval '3 days', DATE '2032-04-28',
                        DATE '2032-04-30', DATE '2032-09-03', now())
                """).update();
        send("PUT", path, admin, "{\"timeline\":" + valid + "}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.checkInStart").value(startsWith("Check-in starts on or after 03/09/2032")));
        send("PUT", path, admin, "{\"timeline\":" + valid.replace("2032-09-02", "2032-09-03") + "}")
                .andExpect(status().isOk());
        jdbc.sql("DELETE FROM cfg_term WHERE code = 'SU32X'").update();
    }

    /**
     * TC-CFG-021: a Draft with unsaved steps cannot be published; once every step is saved, publishing fixes the
     * Term's prices, Deposit and rules, tells every Manager (Term dashboard link) and puts the Term announcement on the
     * students' board and bell. A later default-price change leaves the Term's prices alone, an Application pays
     * the Term's Deposit, and once an Invoice exists the prices are locked.
     */
    @Test
    void publishingFixesTheTerm() throws Exception {
        String admin = bearer(mvc, ADMIN);
        String early = JsonPath.read(send("POST", "/admin/terms/drafts", admin,
                "{\"name\":\"Spring 2032\",\"stayStart\":\"2032-01-05\",\"stayEnd\":\"2032-04-25\"}")
                .andReturn().getResponse().getContentAsString(), "$.id");
        mvc.perform(post("/admin/terms/" + early + "/publish").header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("TERM_NOT_READY"))
                .andExpect(jsonPath("$.details.checks[*].step", hasItem("timeline")));

        String id = fullDraft(admin, "Winter 2032", "2032-12-28", "2033-04-20", "2032-12-27");
        mvc.perform(get("/admin/terms/" + id + "/wizard").header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(jsonPath("$.checks", hasSize(0)))
                .andExpect(jsonPath("$.step").value(6));
        mvc.perform(post("/admin/terms/" + id + "/publish").header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(status().isOk());
        Map<String, Object> frozen = jdbc.sql("""
                SELECT status, deposit_percent, utility_deposit, matching_snapshot_id IS NOT NULL AS pinned,
                       eligibility_keys::text AS keys FROM cfg_term WHERE id = :id
                """).param("id", Long.parseLong(id)).query().singleRow();
        assertThat(frozen.get("status")).isEqualTo("PUBLISHED");
        assertThat(frozen.get("pinned")).isEqualTo(true);
        assertThat((String) frozen.get("keys")).contains("ENROLLED");
        mvc.perform(get("/notifications").header(HttpHeaders.AUTHORIZATION, bearer(mvc, MANAGER_B)))
                .andExpect(jsonPath("$.items[0].title").value("Winter 2032 is published"))
                .andExpect(jsonPath("$.items[0].link").value("/manager/terms/" + id));
        String student = bearer(mvc, STUDENT);
        mvc.perform(get("/students/me/board").header(HttpHeaders.AUTHORIZATION, student))
                .andExpect(jsonPath("$.items[0].title").value("Registration period: Winter 2032"))
                .andExpect(jsonPath("$.items[0].category").value("Registration"))
                .andExpect(jsonPath("$.items[0].pinned").value(true))
                .andExpect(jsonPath("$.items[0].link").value("/student/registration-periods/" + id));
        mvc.perform(get("/notifications").header(HttpHeaders.AUTHORIZATION, student))
                .andExpect(jsonPath("$.items[?(@.kind == 'announcement')].title", hasItem("Registration period: Winter 2032")));

        // Default prices change only the Terms built afterwards (spec §8).
        String fourBedId = fourBed();
        send("PUT", "/admin/room-types/" + fourBedId, admin,
                "{\"name\":\"4-bed\",\"beds\":4,\"basePrice\":6500000,\"roommateSelection\":\"auto\",\"status\":\"Active\"}")
                .andExpect(status().isOk());
        mvc.perform(get("/catalog").header(HttpHeaders.AUTHORIZATION, student).param("termId", id))
                .andExpect(jsonPath("$.depositRate").value(0.25))
                .andExpect(jsonPath("$.utilityDeposit").value(500000))
                .andExpect(jsonPath("$.prices[?(@.roomTypeId == '" + fourBedId + "' && @.roomClassId == '" + standard()
                        + "')].termPrice", contains(7_200_000)));
        String applied = send("POST", "/applications", student, """
                {"termId":"%s","roomTypeId":"%s","roomClassId":"%s",
                 "contact":{"phone":"0901234567","email":"me@example.com","emergencyName":"Nguyen Van A",
                            "relationship":"Mother","emergencyPhone":"0912345678"},
                 "consent":{"matching":true,"rules":true}}""".formatted(id, fourBedId, standard()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        long deposit = jdbc.sql("SELECT amount FROM bil_invoice WHERE code = :c")
                .param("c", (String) JsonPath.read(applied, "$.depositInvoiceId")).query(Long.class).single();
        assertThat(deposit).isEqualTo(1_800_000L);
        String wizard = json("/admin/terms/" + id + "/wizard", admin);
        assertThat((Boolean) JsonPath.read(wizard, "$.prices.locked")).isTrue();
        send("PUT", "/admin/terms/" + id + "/wizard/prices", admin, "{\"prices\":" + prices(wizard, fourBedId,
                standard(), 7_000_000) + ",\"depositPercent\":20,\"utilityDeposit\":500000,\"changeReason\":\"Cheaper\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PRICES_LOCKED"));
    }

    /**
     * TC-CFG-022: after publishing, a passed date is fixed and an open deadline is only extended; a change needs a
     * reason and becomes a change announcement with old → new values (also in Vietnamese); the rules stay fixed.
     */
    @Test
    void publishedTermChangesWithinTheRules() throws Exception {
        String admin = bearer(mvc, ADMIN);
        String id = fullDraft(admin, "Autumn 2032", "2032-09-06", "2032-12-20", "2032-09-03");
        mvc.perform(post("/admin/terms/" + id + "/publish").header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(status().isOk());
        String path = "/admin/terms/" + id + "/wizard/timeline";
        String wizard = json("/admin/terms/" + id + "/wizard", admin);
        assertThat((List<String>) JsonPath.read(wizard, "$.timeline.fixed")).contains("registrationOpensAt");
        assertThat((List<String>) JsonPath.read(wizard, "$.timeline.extendOnly")).contains("registrationClosesAt");

        String shorter = timeline(10, "2032-09-03", "2032-09-03", "2032-12-20");
        send("PUT", path, admin, "{\"timeline\":" + shorter + ",\"changeReason\":\"Earlier\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.registrationClosesAt")
                        .value("This deadline is open: it can be extended but never shortened."));
        String moved = timeline(20, "2032-09-03", "2032-09-03", "2032-12-20").replace(at(-1), at(-2));
        send("PUT", path, admin, "{\"timeline\":" + moved + ",\"changeReason\":\"Typo\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.registrationOpensAt").value("This date has passed, so it cannot change."));
        String longer = timeline(20, "2032-09-03", "2032-09-03", "2032-12-20").replace(at(20), at(25));
        send("PUT", path, admin, "{\"timeline\":" + longer + "}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.changeReason").exists());
        send("PUT", path, admin, "{\"timeline\":" + longer + ",\"changeReason\":\"More time for first-year students.\"}")
                .andExpect(status().isOk());

        String student = bearer(mvc, STUDENT);
        mvc.perform(get("/students/me/board").header(HttpHeaders.AUTHORIZATION, student))
                .andExpect(jsonPath("$.items[?(@.title == 'Changed: Autumn 2032')].changes[0].field",
                        contains("Registration closes")))
                .andExpect(jsonPath("$.items[?(@.title == 'Changed: Autumn 2032')].body",
                        contains(org.hamcrest.Matchers.containsString("Reason: More time for first-year students."))));
        mvc.perform(get("/students/me/board").header(HttpHeaders.AUTHORIZATION, student).header("Accept-Language", "vi"))
                .andExpect(jsonPath("$.items[*].title", hasItem("Thay đổi: Autumn 2032")))
                .andExpect(jsonPath("$.items[?(@.title == 'Thay đổi: Autumn 2032')].body",
                        contains(org.hamcrest.Matchers.containsString("Đóng đăng ký"))));

        send("PUT", "/admin/terms/" + id + "/wizard/rules", admin, "{}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("RULES_FIXED"));
        mvc.perform(get("/admin/terms").header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(jsonPath("$.items[?(@.id == '" + id + "')].wizardStep", contains(7)));
    }
}

package vn.fpt.campusstay;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.ADMIN;
import static vn.fpt.campusstay.TestAuth.MANAGER_A;
import static vn.fpt.campusstay.TestAuth.bearer;

import java.util.List;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** Admin configuration screens of CFG (TC-CFG-NNN). Changes shared reference data, so it gets its own database. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class AdminConfigIT {

    @Autowired
    MockMvc mvc;

    /** TC-CFG-002: Terms list with string ids, windows and status labels. */
    @Test
    void listsTerms() throws Exception {
        mvc.perform(as(get("/admin/terms")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].id").isString())
                .andExpect(jsonPath("$.items[?(@.name == 'Spring 2027')].depositHours", contains(48)))
                .andExpect(jsonPath("$.items[?(@.name == 'Spring 2027')].checkOutBy", contains("2027-04-26")))
                .andExpect(jsonPath("$.items[?(@.name == 'Fall 2026')].roommateHours", contains(48)));
    }

    /** TC-CFG-003 (negative): missing and inconsistent windows are named per field. */
    @Test
    void termValidationNamesFields() throws Exception {
        mvc.perform(as(post("/admin/terms")).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Summer 2031\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.details.fields.stayStart").value("Enter the first day of the stay."))
                .andExpect(jsonPath("$.details.fields.checkOutBy").exists());
        mvc.perform(as(post("/admin/terms")).contentType(MediaType.APPLICATION_JSON)
                .content(term("Backwards 2031", "2031-08-20", "2031-05-10", "2031-05-06", "2031-05-09", null)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.stayEnd").value("The stay must end after it starts."));
    }

    /**
     * TC-CFG-004: a Draft is invisible to students and takes the default Deposit window; publishing shows it;
     * a second publish and an overlapping Term are refused.
     */
    @Test
    void publishTermLifecycle() throws Exception {
        int defaultHours = JsonPath.read(body(as(get("/admin/fees"))), "$.depositHours");
        String id = JsonPath.read(body(as(post("/admin/terms")).contentType(MediaType.APPLICATION_JSON)
                .content(term("Summer 2030", "2030-05-10", "2030-08-20", "2030-05-06", "2030-05-09", null))), "$.id");
        mvc.perform(as(get("/admin/terms")))
                .andExpect(jsonPath("$.items[?(@.id == '" + id + "')].status", contains("Draft")))
                .andExpect(jsonPath("$.items[?(@.id == '" + id + "')].depositHours", contains(defaultHours)));
        mvc.perform(as(get("/terms"))).andExpect(jsonPath("$.items[*].name", not(hasItem("Summer 2030"))));

        mvc.perform(as(post("/admin/terms/" + id + "/publish")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id));
        mvc.perform(as(get("/terms"))).andExpect(jsonPath("$.items[*].name", hasItem("Summer 2030")));
        mvc.perform(as(get("/admin/terms")))
                .andExpect(jsonPath("$.items[?(@.id == '" + id + "')].status", contains("Published")));
        mvc.perform(as(post("/admin/terms/" + id + "/publish")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("TERM_ALREADY_PUBLISHED"));

        String overlapping = JsonPath.read(body(as(post("/admin/terms")).contentType(MediaType.APPLICATION_JSON)
                .content(term("Overlap 2030", "2030-06-01", "2030-09-01", "2030-06-01", "2030-06-03", 24))), "$.id");
        mvc.perform(as(post("/admin/terms/" + overlapping + "/publish")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("TERM_OVERLAP"));
        mvc.perform(as(put("/admin/terms/" + id)).contentType(MediaType.APPLICATION_JSON)
                .content(term("Summer 2030", "2030-05-10", "2030-08-25", "2030-05-06", "2030-05-09", 36)))
                .andExpect(status().isOk());
        mvc.perform(as(get("/admin/terms")))
                .andExpect(jsonPath("$.items[?(@.id == '" + id + "')].stayEnd", contains("2030-08-25")))
                .andExpect(jsonPath("$.items[?(@.id == '" + id + "')].depositHours", contains(36)));
    }

    /** TC-CFG-005: Room Types with inventory counts; mutual invite only for 2 Beds; names are unique. */
    @Test
    void roomTypes() throws Exception {
        mvc.perform(as(get("/admin/room-types")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totals.rooms").value(100))
                .andExpect(jsonPath("$.totals.beds").value(360))
                .andExpect(jsonPath("$.items[?(@.name == '2-bed')].rooms", contains(40)))
                .andExpect(jsonPath("$.items[?(@.name == '2-bed')].roommateSelection", contains("mutual")))
                .andExpect(jsonPath("$.items[?(@.name == '2-bed')].hasAllocations", contains(false)))
                .andExpect(jsonPath("$.roomClasses[?(@.name == 'Standard')].surchargeRate", contains(0.15)));
        mvc.perform(as(post("/admin/room-types")).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"8-bed\",\"beds\":8,\"basePrice\":3500000,\"roommateSelection\":\"mutual\",\"status\":\"Active\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.roommateSelection")
                        .value("Only Room Types with 2 Beds can allow mutual invite."));
        mvc.perform(as(post("/admin/room-types")).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"8-bed\",\"beds\":8,\"basePrice\":3500000,\"roommateSelection\":\"auto\",\"status\":\"Active\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").isString());
        mvc.perform(as(post("/admin/room-types")).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"8-BED\",\"beds\":0,\"basePrice\":3500000}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.name").value("A Room Type with this name already exists."))
                .andExpect(jsonPath("$.details.fields.beds").exists());
    }

    /** TC-CFG-006: changing the Beds of a Room Type adds or retires Beds in its Rooms. */
    @Test
    void roomTypeBedsChangeTheInventory() throws Exception {
        String sixBed = this.<List<String>>read(as(get("/admin/room-types")), "$.items[?(@.name == '6-bed')].id").getFirst();
        String body = "{\"name\":\"6-bed\",\"beds\":%d,\"basePrice\":4500000,\"roommateSelection\":\"auto\",\"status\":\"Active\"}";
        mvc.perform(as(put("/admin/room-types/" + sixBed)).contentType(MediaType.APPLICATION_JSON)
                .content(body.formatted(5))).andExpect(status().isOk());
        mvc.perform(as(get("/admin/buildings")))
                .andExpect(jsonPath("$.items[?(@.name == 'A')].floors[0].beds", contains(34)));
        mvc.perform(as(put("/admin/room-types/" + sixBed)).contentType(MediaType.APPLICATION_JSON)
                .content(body.formatted(6))).andExpect(status().isOk());
        mvc.perform(as(get("/admin/buildings")))
                .andExpect(jsonPath("$.items[?(@.name == 'A')].floors[0].beds", contains(36)));
    }

    /** TC-CFG-007: Room Classes show where they are used and the deposit rate; the surcharge is bounded. */
    @Test
    void roomClasses() throws Exception {
        mvc.perform(as(get("/admin/room-classes")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.depositRate").value(0.2))
                .andExpect(jsonPath("$.items[?(@.name == 'Basic')].floors", contains("A 1–2 · B 1–2")))
                .andExpect(jsonPath("$.items[?(@.name == 'Basic')].rooms", contains(40)))
                .andExpect(jsonPath("$.items[?(@.name == 'Basic')].surchargeRate", contains(0)))
                .andExpect(jsonPath("$.roomTypes[*].name", hasItem("4-bed")));
        mvc.perform(as(post("/admin/room-classes")).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Deluxe\",\"surchargeRate\":6,\"amenities\":[],\"status\":\"Active\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.surchargeRate").value("Enter a surcharge from 0% to 500%."));
        mvc.perform(as(post("/admin/room-classes")).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Deluxe\",\"surchargeRate\":0.5,\"amenities\":[\" Sofa \",\"\",\"Sofa\"],\"status\":\"Inactive\"}"))
                .andExpect(status().isOk());
        mvc.perform(as(get("/admin/room-classes")))
                .andExpect(jsonPath("$.items[?(@.name == 'Deluxe')].amenities[*]", contains("Sofa")))
                .andExpect(jsonPath("$.items[?(@.name == 'Deluxe')].status", contains("Inactive")))
                .andExpect(jsonPath("$.items[?(@.name == 'Deluxe')].floors", contains((Object) null)));
        String deluxe = this.<List<String>>read(as(get("/admin/room-classes")), "$.items[?(@.name == 'Deluxe')].id").getFirst();
        mvc.perform(as(put("/admin/room-classes/" + deluxe)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Deluxe\",\"surchargeRate\":0.45,\"amenities\":[\"Sofa\",\"Bathtub\"],\"status\":\"Active\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(deluxe));
        mvc.perform(as(get("/admin/room-classes")))
                .andExpect(jsonPath("$.items[?(@.name == 'Deluxe')].surchargeRate", contains(0.45)))
                .andExpect(jsonPath("$.items[?(@.name == 'Deluxe')].amenities[*]", contains("Sofa", "Bathtub")))
                .andExpect(jsonPath("$.items[?(@.name == 'Deluxe')].status", contains("Active")));
    }

    /** TC-CFG-008: fees and refund rules save as one document; a new rule gets an id; bad rates are refused. */
    @Test
    void feesAndRefundRules() throws Exception {
        mvc.perform(as(get("/admin/fees")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.depositPercent").value(20))
                .andExpect(jsonPath("$.rules", hasSize(4)))
                .andExpect(jsonPath("$.rules[0].approver").value("System"))
                .andExpect(jsonPath("$.approverOptions", contains("System", "Staff", "Manager", "Admin")));
        String fees = """
                {"depositPercent":%s,"depositHours":48,"balanceDays":14,"blockCheckIn":true,"manualConfirm":true,
                 "policyConfirmed":true,"rules":[{"id":"new-1","when":"Student moves out for health reasons",
                 "refundPercent":80,"approver":"Manager","active":true}]}""";
        mvc.perform(as(put("/admin/fees")).contentType(MediaType.APPLICATION_JSON).content(fees.formatted("0")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.depositPercent").exists());
        mvc.perform(as(put("/admin/fees")).contentType(MediaType.APPLICATION_JSON).content(fees.formatted("\"25\"")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.depositPercent").value(25))
                .andExpect(jsonPath("$.policyConfirmed").value(true))
                .andExpect(jsonPath("$.rules", hasSize(5)))
                .andExpect(jsonPath("$.rules[4].id").value(not("new-1")))
                .andExpect(jsonPath("$.rules[4].refundPercent").value(80));
        mvc.perform(as(get("/admin/room-classes"))).andExpect(jsonPath("$.depositRate").value(0.25));
        mvc.perform(as(get("/admin/audit-log")).param("action", "Refund policy confirmed"))
                .andExpect(jsonPath("$.items", hasSize(1)));
    }

    /** TC-CFG-009: criteria switches and priority groups (order, new group, member counts). */
    @Test
    void eligibilityRules() throws Exception {
        String current = body(as(get("/admin/eligibility")));
        List<String> ids = JsonPath.read(current, "$.groups[*].id");
        mvc.perform(as(get("/admin/eligibility")))
                .andExpect(jsonPath("$.criteria", hasSize(5)))
                .andExpect(jsonPath("$.groups[?(@.title == 'First-year students')].applied", contains(16)));
        String save = """
                {"criteria":[{"key":"CONTACT_COMPLETE","on":false}],
                 "groups":[{"id":"%s","title":"Scholarship holders","note":"Flag from the student directory"},
                           {"id":"%s","title":"First-year students","note":"Students in their first two semesters"},
                           {"title":"Students from remote provinces","note":""}]}""".formatted(ids.get(2), ids.get(0));
        mvc.perform(as(put("/admin/eligibility")).contentType(MediaType.APPLICATION_JSON).content(save))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.groups[*].title",
                        contains("Scholarship holders", "First-year students", "Students from remote provinces")))
                .andExpect(jsonPath("$.groups[2].id").isString())
                .andExpect(jsonPath("$.groups[2].applied").value(0))
                .andExpect(jsonPath("$.criteria[?(@.key == 'CONTACT_COMPLETE')].on", contains(false)));
        mvc.perform(as(put("/admin/eligibility")).contentType(MediaType.APPLICATION_JSON)
                .content("{\"criteria\":[],\"groups\":[{\"title\":\" \"}]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.groups").exists());
    }

    /** TC-CFG-010: weights must total 100%; saving creates the next snapshot; a dry run allocates nothing. */
    @Test
    void matchingSnapshots() throws Exception {
        mvc.perform(as(get("/admin/matching")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.snapshot").value(1))
                .andExpect(jsonPath("$.hardConstraints", hasSize(5)))
                .andExpect(jsonPath("$.weights[*].value", contains(40, 30, 30)))
                .andExpect(jsonPath("$.boost").value(1.2))
                .andExpect(jsonPath("$.preview").value((Object) null));
        String settings = """
                {"order":[{"key":"SUBMITTED_AT"},{"key":"PRIORITY_GROUP"}],
                 "weights":[{"key":"MAJOR","on":true,"value":%d},{"key":"COHORT","on":true,"value":25},
                            {"key":"REGION","on":true,"value":25}],
                 "boost":false}""";
        mvc.perform(as(put("/admin/matching")).contentType(MediaType.APPLICATION_JSON).content(settings.formatted(40)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.weights").value("The weights that are on must total 100%."));
        mvc.perform(as(post("/admin/matching/preview")).contentType(MediaType.APPLICATION_JSON)
                .content(settings.formatted(50)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.toRound2").value(0))
                .andExpect(jsonPath("$.source").isString());
        mvc.perform(as(put("/admin/matching")).contentType(MediaType.APPLICATION_JSON).content(settings.formatted(50)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.snapshot").value(2));
        mvc.perform(as(get("/admin/matching")))
                .andExpect(jsonPath("$.snapshot").value(2))
                .andExpect(jsonPath("$.order[0].key").value("SUBMITTED_AT"))
                .andExpect(jsonPath("$.order[0].title").value("Submission time"))
                .andExpect(jsonPath("$.weights[*].value", contains(50, 25, 25)))
                .andExpect(jsonPath("$.boost").value(1));
    }

    /** TC-CFG-011: system parameters are typed; an invalid value is named by its key. */
    @Test
    void systemParameters() throws Exception {
        mvc.perform(as(get("/admin/system-parameters")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sections[*].title", hasItem("Uploads")))
                .andExpect(jsonPath("$.sections[*].fields[?(@.key == 'upload.max_photos')].value", contains(5)))
                .andExpect(jsonPath("$.sections[*].fields[?(@.key == 'application.cancel_until')].options[0].value",
                        contains("RESULTS_PUBLISHED")));
        String body = "{\"sections\":[{\"title\":\"Uploads\",\"fields\":[{\"key\":\"upload.max_photos\",\"value\":%s}]}]}";
        mvc.perform(as(put("/admin/system-parameters")).contentType(MediaType.APPLICATION_JSON).content(body.formatted("\"0\"")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields['upload.max_photos']").value("Enter a whole number from 1 to 1,000,000."));
        mvc.perform(as(put("/admin/system-parameters")).contentType(MediaType.APPLICATION_JSON).content(body.formatted("6")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sections[*].fields[?(@.key == 'upload.max_photos')].value", contains(6)));
    }

    /** TC-CFG-013: Admin › Utility loads with its option lists, rejects values outside them and audits a change. */
    @Test
    void utilityPolicy() throws Exception {
        mvc.perform(as(get("/admin/utility")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.priceKwh").value(3500))
                .andExpect(jsonPath("$.rounding").value("ROUND_UP_1000"))
                .andExpect(jsonPath("$.options.rounding[*].value").value(hasItem("NONE")))
                .andExpect(jsonPath("$.options.paymentDueDays[*].value").value(hasItem("7")));
        String valid = """
                {"priceKwh":3800,"priceM3":16000,"readingDay":25,"paymentDueDays":10,"rounding":"ROUND_UP_500",
                 "overdueReminder":"WEEKLY","estimateMonthly":300000,"monthsHeld":2,"blockChangesWhenOverdue":true}""";
        mvc.perform(as(put("/admin/utility")).contentType(MediaType.APPLICATION_JSON)
                .content(valid.replace("\"paymentDueDays\":10", "\"paymentDueDays\":9").replace("ROUND_UP_500", "HALF")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.paymentDueDays").exists())
                .andExpect(jsonPath("$.details.fields.rounding").exists());
        mvc.perform(as(put("/admin/utility")).contentType(MediaType.APPLICATION_JSON).content(valid))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.priceKwh").value(3800))
                .andExpect(jsonPath("$.paymentDueDays").value(10));
        mvc.perform(as(get("/admin/audit-log")).param("action", "Utility updated"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(1)));
    }

    /** TC-CFG-012 (permission): a Manager cannot open Admin configuration. */
    @Test
    void managerCannotConfigure() throws Exception {
        mvc.perform(get("/admin/fees").header(HttpHeaders.AUTHORIZATION, bearer(mvc, MANAGER_A)))
                .andExpect(status().isForbidden());
    }

    private MockHttpServletRequestBuilder as(MockHttpServletRequestBuilder request) throws Exception {
        return request.header(HttpHeaders.AUTHORIZATION, bearer(mvc, ADMIN));
    }

    private String body(MockHttpServletRequestBuilder request) throws Exception {
        return mvc.perform(request).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }

    private <T> T read(MockHttpServletRequestBuilder request, String path) throws Exception {
        return JsonPath.read(body(request), path);
    }

    /** A complete Term; registration closes before the stay, results a week later, Balance due before Check-in. */
    private static String term(String name, String stayStart, String stayEnd, String checkInStart, String checkInEnd,
            Integer depositHours) {
        String year = stayStart.substring(0, 4);
        return """
                {"name":"%s","stayStart":"%s","stayEnd":"%s",
                 "registrationOpensAt":"%s-02-01T01:00:00Z","registrationClosesAt":"%s-03-01T16:59:00Z",
                 "resultsPublishedAt":"%s-03-08T01:00:00Z","roommateHours":48,"depositHours":%s,
                 "balanceDueAt":"%s-04-01T16:59:00Z","checkInStart":"%s","checkInEnd":"%s","checkOutBy":"%s"}"""
                .formatted(name, stayStart, stayEnd, year, year, year, depositHours, year, checkInStart, checkInEnd,
                        stayEnd);
    }
}

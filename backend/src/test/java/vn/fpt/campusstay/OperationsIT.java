package vn.fpt.campusstay;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.MANAGER_A;
import static vn.fpt.campusstay.TestAuth.STAFF_A;
import static vn.fpt.campusstay.TestAuth.STAFF_B2;
import static vn.fpt.campusstay.TestAuth.bearer;

import java.time.Instant;
import java.util.List;

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

import com.jayway.jsonpath.JsonPath;

/**
 * Change Specification v2 phase 7 "Operations": SLA deadlines and furniture on Maintenance Requests, the Room hub,
 * the Term hub's requests window, staff workload next to the routing rules and the back-office search.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class OperationsIT {

    private static final String STAFF_A2 = "staff.a2@campusstay.test";

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    long termId;
    StayFlow stay;

    @BeforeEach
    void openTerm() {
        ApplyFlow flow = new ApplyFlow(mvc, jdbc);
        termId = flow.openTerm();
        stay = new StayFlow(mvc, jdbc, flow, termId);
    }

    private ResultActions getAs(String path, String auth) throws Exception {
        return mvc.perform(get(path).header(HttpHeaders.AUTHORIZATION, auth));
    }

    private ResultActions patchAs(String path, String auth, String body) throws Exception {
        return mvc.perform(patch(path).header(HttpHeaders.AUTHORIZATION, auth).contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private boolean livesNowhere(int n) {
        return jdbc.sql("""
                SELECT count(*) FROM asg_allocation a JOIN auth_user u ON u.id = a.student_id
                WHERE u.email = :e AND a.status = 'ACTIVE'
                """).param("e", StayFlow.student(n)).query(Long.class).single() == 0;
    }

    private String furnitureOf(String room, String type) {
        return jdbc.sql("""
                SELECT i.id::text FROM inv_furniture_item i JOIN inv_room r ON r.id = i.room_id
                JOIN inv_furniture_type t ON t.id = i.furniture_type_id
                WHERE r.code = :room AND t.code = :type ORDER BY i.asset_code LIMIT 1
                """).param("room", room).param("type", type).query(String.class).single();
    }

    private String report(String auth, String urgency, String furnitureItemId) throws Exception {
        var request = multipart("/maintenance-requests");
        request.header(HttpHeaders.AUTHORIZATION, auth);
        request.param("title", "Air conditioner drips").param("description", "Water drips from the unit at night.")
                .param("category", "Electrical").param("location", "Room").param("urgency", urgency);
        if (furnitureItemId != null) {
            request.param("furnitureItemId", furnitureItemId);
        }
        return JsonPath.read(mvc.perform(request).andExpect(status().isOk()).andReturn().getResponse()
                .getContentAsString(), "$.id");
    }

    /**
     * TC-MNT-008: a new Maintenance Request gets its SLA deadline from the Block's timer (urgent sooner than normal)
     * and may name a furniture item of the Room, which the queue and the detail show; the item's history keeps the
     * repair, reported and resolved; an item of another Room is refused.
     */
    @Test
    void slaDeadlineAndFurnitureItem() throws Exception {
        if (livesNowhere(31)) {
            stay.livesIn(31, "A-501", "A", true);
        }
        String student = bearer(mvc, StayFlow.student(31));
        String ac = furnitureOf("A-501", "AC");
        getAs("/maintenance-requests/options?for=student", student)
                .andExpect(jsonPath("$.furniture[*].id", hasItem(ac)));

        var wrong = multipart("/maintenance-requests");
        wrong.header(HttpHeaders.AUTHORIZATION, student);
        wrong.param("title", "Fan").param("description", "Broken").param("category", "Electrical")
                .param("location", "Room").param("urgency", "Normal").param("furnitureItemId", furnitureOf("A-502", "AC"));
        mvc.perform(wrong).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.furnitureItemId").value("Choose an item of this Room."));

        Instant before = Instant.now();
        String urgent = report(student, "Urgent", ac);
        String normal = report(student, "Normal", null);
        String staff = bearer(mvc, STAFF_A);
        String detail = getAs("/maintenance-requests/" + urgent, staff).andExpect(status().isOk())
                .andExpect(jsonPath("$.furnitureItem.id").value(ac))
                .andExpect(jsonPath("$.furnitureOptions[*].id", hasItem(ac)))
                .andReturn().getResponse().getContentAsString();
        Instant urgentDue = Instant.parse(JsonPath.read(detail, "$.slaDueAt"));
        Instant normalDue = Instant.parse(JsonPath.read(getAs("/maintenance-requests/" + normal, staff)
                .andReturn().getResponse().getContentAsString(), "$.slaDueAt"));
        org.assertj.core.api.Assertions.assertThat(urgentDue).isAfter(before).isBefore(normalDue);
        getAs("/maintenance-requests?block=A&q=" + urgent, staff)
                .andExpect(jsonPath("$.items[0].slaDueAt").isString());

        long a2 = stay.userId(STAFF_A2);
        patchAs("/maintenance-requests/" + urgent, staff, "{\"assigneeId\":\"%d\"}".formatted(a2))
                .andExpect(status().isNoContent());
        patchAs("/maintenance-requests/" + urgent, staff, "{\"status\":\"In progress\"}").andExpect(status().isNoContent());
        patchAs("/maintenance-requests/" + urgent, staff, "{\"status\":\"Resolved\"}").andExpect(status().isNoContent());
        getAs("/furniture/" + ac, staff).andExpect(status().isOk())
                .andExpect(jsonPath("$.history[?(@.kind == 'Repair')].from", hasItem(urgent)))
                .andExpect(jsonPath("$.history[?(@.kind == 'Repair')].to", hasItem("Resolved")))
                .andExpect(jsonPath("$.history[?(@.kind == 'Repair')].to", hasItem("Reported")));
        patchAs("/maintenance-requests/" + normal, staff, "{\"furnitureItemId\":\"" + furnitureOf("A-502", "AC") + "\"}")
                .andExpect(status().isBadRequest());
    }

    /**
     * TC-INV-024: the Room hub lists the Room's residents, Maintenance Requests, meter readings and inspections next
     * to its class, furniture and door code; Staff of another Block may not open it.
     */
    @Test
    void roomHub() throws Exception {
        if (livesNowhere(32)) {
            stay.livesIn(32, "A-503", "B", true);
        }
        String code = report(bearer(mvc, StayFlow.student(32)), "Normal", null);
        String manager = bearer(mvc, MANAGER_A);
        getAs("/inventory/rooms/A-503/hub", manager).andExpect(status().isOk())
                .andExpect(jsonPath("$.details.room").value("A-503"))
                .andExpect(jsonPath("$.details.furniture").isArray())
                .andExpect(jsonPath("$.sections.residents[*].detail", hasItem("Bed B · " + ApplyFlow.TERM_NAME)))
                .andExpect(jsonPath("$.sections.residents[0].kind").value("student"))
                .andExpect(jsonPath("$.sections.maintenance[*].id", hasItem(code)))
                .andExpect(jsonPath("$.sections.meterReadings").isArray())
                .andExpect(jsonPath("$.sections.inspections").isArray());
        getAs("/inventory/rooms/A-503/hub", bearer(mvc, STAFF_B2)).andExpect(status().isForbidden());
        getAs("/inventory/rooms/Z-999/hub", manager).andExpect(status().isNotFound());
    }

    /**
     * TC-RPT-013: the back-office search finds students by code or name, Rooms with or without the dash and request
     * codes inside the user's Blocks; Staff of another Block find neither the Room nor its resident; short queries
     * find nothing and students may not search.
     */
    @Test
    void search() throws Exception {
        if (livesNowhere(33)) {
            stay.livesIn(33, "A-504", "A", true);
        }
        String code = report(bearer(mvc, StayFlow.student(33)), "Normal", null);
        String studentCode = "SE190033";
        String manager = bearer(mvc, MANAGER_A);
        getAs("/search?q=" + studentCode.toLowerCase(), manager).andExpect(status().isOk())
                .andExpect(jsonPath("$.items[?(@.kind == 'student')].detail", hasItem(org.hamcrest.Matchers.startsWith(studentCode))));
        getAs("/search?q=A504", manager)
                .andExpect(jsonPath("$.items[?(@.kind == 'room')].id", hasItem("A-504")));
        getAs("/search?q=" + code, bearer(mvc, STAFF_A))
                .andExpect(jsonPath("$.items[?(@.kind == 'maintenance')].id", hasItem(code)))
                .andExpect(jsonPath("$.items[?(@.kind == 'student')]").isEmpty());
        String staffB = bearer(mvc, STAFF_B2);
        getAs("/search?q=A-504", staffB).andExpect(jsonPath("$.items[?(@.kind == 'room')]", hasSize(0)));
        getAs("/search?q=" + studentCode, staffB).andExpect(jsonPath("$.items[*].kind", not(hasItem("student"))));
        getAs("/search?q=A", manager).andExpect(jsonPath("$.items").isEmpty());
        getAs("/search?q=A-504", bearer(mvc, StayFlow.student(33))).andExpect(status().isForbidden());
    }

    /** TC-REQ-022: the routing rules page lists the Block's staff with their open and finished work. */
    @Test
    void routingShowsWorkload() throws Exception {
        if (livesNowhere(34)) {
            stay.livesIn(34, "A-505", "A", true);
        }
        String code = report(bearer(mvc, StayFlow.student(34)), "Normal", null);
        long a2 = stay.userId(STAFF_A2);
        patchAs("/maintenance-requests/" + code, bearer(mvc, STAFF_A), "{\"assigneeId\":\"%d\"}".formatted(a2))
                .andExpect(status().isNoContent());
        String page = getAs("/routing-rules?block=A", bearer(mvc, MANAGER_A)).andExpect(status().isOk())
                .andExpect(jsonPath("$.staff[*].name", hasItem("Vo Thanh Tung")))
                .andReturn().getResponse().getContentAsString();
        List<Integer> open = JsonPath.read(page, "$.staff[?(@.id == '%d')].open".formatted(a2));
        org.assertj.core.api.Assertions.assertThat(open.getFirst()).isGreaterThanOrEqualTo(1);
    }

    /**
     * TC-RPT-014: the Term hub shows the requests window once it opened (open requests, Continuing residents,
     * next-Term fees issued and paid, Beds released) and nothing before.
     */
    @Test
    void termHubTransition() throws Exception {
        String manager = bearer(mvc, MANAGER_A);
        getAs("/dashboards/term?termId=" + termId, manager).andExpect(status().isOk())
                .andExpect(jsonPath("$.transition").doesNotExist());
        RenewalFlow renewal = new RenewalFlow(jdbc, stay);
        long next = renewal.openNextTerm();
        jdbc.sql("""
                INSERT INTO asg_renewal (term_id, previous_term_id, opened_at) VALUES (:next, :term, now())
                ON CONFLICT (term_id) DO NOTHING
                """).param("next", next).param("term", termId).update();
        getAs("/dashboards/term?termId=" + next, manager).andExpect(status().isOk())
                .andExpect(jsonPath("$.transition.requestsOpen").isNumber())
                .andExpect(jsonPath("$.transition.feesIssued").value(0))
                .andExpect(jsonPath("$.transition.released").value(0));
        jdbc.sql("DELETE FROM asg_renewal WHERE term_id = :next").param("next", next).update();
    }
}

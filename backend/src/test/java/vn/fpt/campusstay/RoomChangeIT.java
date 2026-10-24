package vn.fpt.campusstay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.lessThan;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.StayFlow.student;
import static vn.fpt.campusstay.TestAuth.MANAGER_B;
import static vn.fpt.campusstay.TestAuth.STAFF_A;
import static vn.fpt.campusstay.TestAuth.bearer;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/** Room-Change Requests from the student's request to the Staff decision (TC-REQ-001…003). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class RoomChangeIT {

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
        return mvc.perform(get(path).header(HttpHeaders.AUTHORIZATION, auth));
    }

    private String ask(String auth, String kind, String roomType, String roomClass, String reason) throws Exception {
        return JsonPath.read(stay.postJson("/room-changes", auth,
                "{\"kind\":\"%s\",\"roomTypeId\":\"%s\",\"roomClassId\":\"%s\",\"reason\":\"%s\"}".formatted(kind,
                        flow.roomTypeId(roomType), flow.roomClassId(roomClass), reason))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(), "$.id");
    }

    /** TC-REQ-001: the options, a request for a cheaper Room Type, one open request per Term; validation. */
    @Test
    void studentAsks() throws Exception {
        stay.livesIn(3, "A-301", "A", true);
        String auth = bearer(mvc, student(3));
        getAs("/room-changes/options", auth)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.currentRoom.room").value("A-301"))
                .andExpect(jsonPath("$.currentRoom.roomTypeName").value("2-bed"))
                .andExpect(jsonPath("$.currentRoom.roomClassName").value("Standard"))
                .andExpect(jsonPath("$.reasons", hasItem("Roommate conflict")))
                .andExpect(jsonPath("$.prices[0].termPrice").isNumber())
                .andExpect(jsonPath("$.termDays").isNumber())
                .andExpect(jsonPath("$.hasOpenRequest").value(false));
        stay.postJson("/room-changes", auth, "{\"kind\":\"class\",\"roomClassId\":\"%s\",\"reason\":\"Health\"}"
                .formatted(flow.roomClassId("Standard")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.roomClassId").isString());
        stay.postJson("/room-changes", auth, "{\"kind\":\"swap\",\"reason\":\"Health\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.kind").isString());

        String id = ask(auth, "type", "4-bed", "Standard", "Roommate conflict");
        assertThat(id).startsWith("RC-" + ApplyFlow.TERM_CODE + "-");
        stay.postJson("/room-changes", auth, "{\"kind\":\"type\",\"roomTypeId\":\"%s\",\"roomClassId\":\"%s\",\"reason\":\"Health\"}"
                .formatted(flow.roomTypeId("6-bed"), flow.roomClassId("Standard")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("OPEN_REQUEST"));
        getAs("/room-changes/options", auth).andExpect(jsonPath("$.hasOpenRequest").value(true));
        getAs("/students/me/requests?kind=room-changes", auth)
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.counts.roomChanges").value(1))
                .andExpect(jsonPath("$.items[0].id").value(id))
                .andExpect(jsonPath("$.items[0].typeLabel").value("Room change"))
                .andExpect(jsonPath("$.items[0].status").value("Pending"))
                .andExpect(jsonPath("$.items[0].summary", containsString("4-bed · Standard")));

        stay.livesIn(4, "A-304", "A", false);
        stay.postJson("/room-changes", bearer(mvc, student(4)), "{\"kind\":\"same\",\"reason\":\"Health\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("NOT_CHECKED_IN"));
    }

    /**
     * TC-REQ-002: Staff of the Block approve with a free matching Bed: the student moves; a cheaper Room is
     * credited to the student, a dearer one is invoiced.
     */
    @Test
    void staffApprove() throws Exception {
        stay.livesIn(5, "A-302", "A", true);
        stay.livesIn(6, "A-303", "A", true);
        String cheaper = bearer(mvc, student(5));
        String dearer = bearer(mvc, student(6));
        String first = ask(cheaper, "type", "4-bed", "Standard", "Price");
        String second = ask(dearer, "class", "2-bed", "Premium", "Study environment");
        String staff = bearer(mvc, STAFF_A);

        getAs("/room-changes?termId=" + stay.termId() + "&status=Pending&kind=type", staff)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[?(@.id == '%s')].from.room".formatted(first), hasItem("A-302")))
                .andExpect(jsonPath("$.items[?(@.id == '%s')].to.roomTypeName".formatted(first), hasItem("4-bed")))
                .andExpect(jsonPath("$.items[?(@.id == '%s')].difference".formatted(first), hasItem(lessThan(0))))
                .andExpect(jsonPath("$.rejectReasons", hasItem("Outstanding Invoice")));
        String beds = getAs("/room-changes/" + first + "/matching-beds", staff).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String bed = JsonPath.read(beds, "$.items[0].bedId");
        assertThat(bed).startsWith("A-");
        getAs("/room-changes/" + first + "/matching-beds", bearer(mvc, TestAuth.STAFF_B2))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("BLOCK_OUT_OF_SCOPE"));

        stay.postJson("/room-changes/" + first + "/decision", staff, "{\"decision\":\"Approved\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.bedId").isString());
        stay.postJson("/room-changes/" + first + "/decision", staff, "{\"decision\":\"Approved\",\"bedId\":\"%s\"}".formatted(bed))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.note", startsWith("Moved to Room ")))
                .andExpect(jsonPath("$.note", containsString("refund")));
        assertThat(bed).startsWith(stay.roomOf(cheaper) + "-");
        stay.postJson("/room-changes/" + first + "/decision", staff, "{\"decision\":\"Approved\",\"bedId\":\"%s\"}".formatted(bed))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ALREADY_DECIDED"));
        getAs("/room-changes?termId=" + stay.termId() + "&status=Approved", staff)
                .andExpect(jsonPath("$.items[?(@.id == '%s')].decision.bed".formatted(first), hasItem(bed)));
        assertThat(jdbc.sql("""
                SELECT count(*) FROM bil_refund WHERE source_type = 'ROOM_CHANGE' AND status = 'PENDING'
                  AND student_id = :s
                """).param("s", stay.userId(student(5))).query(Long.class).single()).isEqualTo(1);
        getAs("/notifications", cheaper).andExpect(jsonPath("$.items[0].title").value("Room change decision"));

        String premium = JsonPath.read(getAs("/room-changes/" + second + "/matching-beds", staff)
                .andReturn().getResponse().getContentAsString(), "$.items[0].bedId");
        stay.postJson("/room-changes/" + second + "/decision", staff,
                "{\"decision\":\"Approved\",\"bedId\":\"%s\"}".formatted(premium))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.note", containsString("Invoice INV-" + ApplyFlow.TERM_CODE + "-")));
        getAs("/students/me/requests?kind=room-changes", dearer)
                .andExpect(jsonPath("$.items[0].status").value("Approved"))
                .andExpect(jsonPath("$.items[0].invoiceId", startsWith("INV-")));
        getAs("/notifications", dearer).andExpect(jsonPath("$.items[*].title", hasItem("New Invoice")));
    }

    /** TC-REQ-003: a rejection needs a listed reason; the student sees it. */
    @Test
    void staffReject() throws Exception {
        stay.livesIn(7, "A-401", "A", true);
        String auth = bearer(mvc, student(7));
        String id = ask(auth, "type", "6-bed", "Standard", "Price");
        String staff = bearer(mvc, STAFF_A);
        stay.postJson("/room-changes/" + id + "/decision", staff, "{\"decision\":\"Rejected\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.reason").isString());
        stay.postJson("/room-changes/" + id + "/decision", auth, "{\"decision\":\"Rejected\",\"reason\":\"Price\"}")
                .andExpect(status().isForbidden());
        stay.postJson("/room-changes/" + id + "/decision", staff,
                "{\"decision\":\"Rejected\",\"reason\":\"No matching Bed available\",\"message\":\"Try again next week.\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.note").value("Rejected: No matching Bed available."));
        getAs("/students/me/requests?kind=room-changes", auth)
                .andExpect(jsonPath("$.items[0].status").value("Rejected"))
                .andExpect(jsonPath("$.items[0].decision.note", containsString("Try again next week.")));
        getAs("/room-changes?termId=" + stay.termId() + "&status=Rejected", staff)
                .andExpect(jsonPath("$.items[?(@.id == '%s')].decision.reason".formatted(id),
                        hasItem("No matching Bed available")));
    }
}

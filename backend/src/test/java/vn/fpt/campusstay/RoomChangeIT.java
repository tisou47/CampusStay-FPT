package vn.fpt.campusstay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.StayFlow.student;
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

import vn.fpt.campusstay.service.assignment.RenewalService;

/**
 * Next-Term Room-Change Requests (spec §6.10, D-14): a continuing resident asks during the requests window, Staff of
 * the Block decide with a free matching Bed of the next Term; the student moves there next Term and pays its price
 * then, so nothing is charged or credited now (TC-REQ-001…003).
 */
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

    @Autowired
    RenewalService renewals;

    ApplyFlow flow;
    StayFlow stay;
    RenewalFlow renewal;
    long next;

    @BeforeEach
    void openTerm() {
        flow = new ApplyFlow(mvc, jdbc);
        stay = new StayFlow(mvc, jdbc, flow, flow.openTerm());
        renewal = new RenewalFlow(jdbc, stay);
        next = renewal.openNextTerm();
        renewal.reset();
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

    /**
     * TC-REQ-001: the options show the next-Term Bed and the next Term's prices; a request for another Room Type, one
     * open request per window; validation; a student without a Bed kept for the next Term, or in the last Term of the
     * Stay, cannot ask yet.
     */
    @Test
    void studentAsks() throws Exception {
        renewal.resident(3, "A-301", "A", 2);
        renewal.resident(4, "A-304", "A", 1);
        stay.livesIn(8, "A-304", "B", false);
        renewals.openDue();
        String auth = bearer(mvc, student(3));
        getAs("/room-changes/options", auth)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.currentRoom.room").value("A-301"))
                .andExpect(jsonPath("$.currentRoom.roomTypeName").value("2-bed"))
                .andExpect(jsonPath("$.currentRoom.roomClassName").value("Standard"))
                .andExpect(jsonPath("$.window.termName").value(RenewalFlow.NEXT_NAME))
                .andExpect(jsonPath("$.reasons", hasItem("Roommate conflict")))
                .andExpect(jsonPath("$.prices[?(@.roomTypeId == '%s' && @.roomClassId == '%s')].termPrice"
                        .formatted(flow.roomTypeId("4-bed"), flow.roomClassId("Standard")),
                        hasItem((int) renewal.nextPrice("4-bed", "Standard"))))
                .andExpect(jsonPath("$.canAsk").value(true))
                .andExpect(jsonPath("$.hasOpenRequest").value(false));
        stay.postJson("/room-changes", auth, "{\"kind\":\"class\",\"roomClassId\":\"%s\",\"reason\":\"Health\"}"
                .formatted(flow.roomClassId("Standard")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.roomClassId").isString());
        stay.postJson("/room-changes", auth, "{\"kind\":\"swap\",\"reason\":\"Health\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.kind").isString());

        String id = ask(auth, "type", "4-bed", "Standard", "Roommate conflict");
        assertThat(id).startsWith("RC-" + RenewalFlow.NEXT_CODE + "-");
        stay.postJson("/room-changes", auth, "{\"kind\":\"type\",\"roomTypeId\":\"%s\",\"roomClassId\":\"%s\",\"reason\":\"Health\"}"
                .formatted(flow.roomTypeId("6-bed"), flow.roomClassId("Standard")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("OPEN_REQUEST"));
        getAs("/room-changes/options", auth).andExpect(jsonPath("$.hasOpenRequest").value(true))
                .andExpect(jsonPath("$.canAsk").value(false));
        getAs("/students/me/requests?kind=room-changes", auth)
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.counts.roomChanges").value(1))
                .andExpect(jsonPath("$.items[0].id").value(id))
                .andExpect(jsonPath("$.items[0].typeLabel").value("Room change"))
                .andExpect(jsonPath("$.items[0].status").value("Pending"))
                .andExpect(jsonPath("$.items[0].summary", containsString(RenewalFlow.NEXT_NAME)))
                .andExpect(jsonPath("$.items[0].summary", containsString("4-bed · Standard")));

        stay.postJson("/room-changes", bearer(mvc, student(4)), "{\"kind\":\"same\",\"reason\":\"Health\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("EXTEND_FIRST"));
        stay.postJson("/room-changes", bearer(mvc, student(8)), "{\"kind\":\"same\",\"reason\":\"Health\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("NO_NEXT_TERM_BED"));
    }

    /**
     * TC-REQ-002: Staff of the Block approve with a free matching Bed of the next Term: the next-Term Allocation moves
     * there (the student still lives in their Room this Term) and the next-Term fee will be that Bed's price; no
     * Invoice or refund is made; Staff of another Block see nothing; after the next-Term fees the Beds are fixed.
     */
    @Test
    void staffApprove() throws Exception {
        renewal.resident(5, "A-302", "A", 3);
        renewals.openDue();
        String auth = bearer(mvc, student(5));
        String id = ask(auth, "type", "4-bed", "Standard", "Price");
        String staff = bearer(mvc, STAFF_A);

        getAs("/room-changes?termId=" + next + "&status=Pending&kind=type", staff)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[?(@.id == '%s')].from.room".formatted(id), hasItem("A-302")))
                .andExpect(jsonPath("$.items[?(@.id == '%s')].to.roomTypeName".formatted(id), hasItem("4-bed")))
                .andExpect(jsonPath("$.items[?(@.id == '%s')].dueAt".formatted(id), hasItem(startsWith("20"))))
                .andExpect(jsonPath("$.window.termName").value(RenewalFlow.NEXT_NAME))
                .andExpect(jsonPath("$.rejectReasons", hasItem("Outstanding Invoice")));
        getAs("/room-changes", staff).andExpect(jsonPath("$.items[?(@.id == '%s')]".formatted(id)).isNotEmpty());
        String beds = getAs("/room-changes/" + id + "/matching-beds", staff).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String bed = JsonPath.read(beds, "$.items[0].bedId");
        assertThat(bed).startsWith("A-3");
        getAs("/room-changes/" + id + "/matching-beds", bearer(mvc, TestAuth.STAFF_B2))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("BLOCK_OUT_OF_SCOPE"));

        stay.postJson("/room-changes/" + id + "/decision", staff, "{\"decision\":\"Approved\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.bedId").isString());
        stay.postJson("/room-changes/" + id + "/decision", staff, "{\"decision\":\"Approved\",\"bedId\":\"%s\"}".formatted(bed))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.note", startsWith("In " + RenewalFlow.NEXT_NAME + " you move to Room ")));
        stay.postJson("/room-changes/" + id + "/decision", staff, "{\"decision\":\"Approved\",\"bedId\":\"%s\"}".formatted(bed))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ALREADY_DECIDED"));
        getAs("/students/me/allocation", auth)
                .andExpect(jsonPath("$.allocation.room").value("A-302"))
                .andExpect(jsonPath("$.nextTerm.room").value(bed.substring(0, bed.lastIndexOf('-'))))
                .andExpect(jsonPath("$.nextTerm.termPrice").value(renewal.nextPrice("4-bed", "Standard")));
        assertThat(jdbc.sql("SELECT count(*) FROM bil_refund WHERE student_id = :s").param("s", stay.userId(student(5)))
                .query(Long.class).single()).isZero();
        assertThat(jdbc.sql("SELECT count(*) FROM bil_invoice WHERE student_id = :s").param("s", stay.userId(student(5)))
                .query(Long.class).single()).isZero();
        getAs("/notifications", auth).andExpect(jsonPath("$.items[0].title").value("Room change decision"));
    }

    /** TC-REQ-003: a rejection needs a listed reason; the student sees it; students may not decide. */
    @Test
    void staffReject() throws Exception {
        renewal.resident(7, "A-401", "A", 2);
        renewals.openDue();
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
        getAs("/room-changes?termId=" + next + "&status=Rejected", staff)
                .andExpect(jsonPath("$.items[?(@.id == '%s')].decision.reason".formatted(id),
                        hasItem("No matching Bed available")));
    }
}

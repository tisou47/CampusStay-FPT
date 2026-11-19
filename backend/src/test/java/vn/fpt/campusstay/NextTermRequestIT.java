package vn.fpt.campusstay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.StayFlow.student;
import static vn.fpt.campusstay.TestAuth.MANAGER_A;
import static vn.fpt.campusstay.TestAuth.STAFF_A;
import static vn.fpt.campusstay.TestAuth.STAFF_B2;
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
 * Next-Term requests besides room changes and swaps (spec §6.10, §6.11, D-04, D-30): extensions (approved at once when
 * the student may extend, otherwise by Staff) and the end of the stay; Room Class change requests are gone; every open
 * request of the window in one list, decided in bulk (TC-REQ-019…021).
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class NextTermRequestIT {

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

    private String id(ResultActions result) throws Exception {
        return JsonPath.read(result.andReturn().getResponse().getContentAsString(), "$.id");
    }

    /**
     * TC-REQ-019: an extension in the Stay's last Term is approved at once (the Bed is kept, the Stay commits more
     * Terms); with an overdue Invoice it waits for Staff, who decide it with a note to reject; the length is checked;
     * the end of the stay releases the next-Term Bed at once; after the request deadline nothing can be filed.
     */
    @Test
    void extensionsAndEndOfStay() throws Exception {
        renewal.resident(15, "A-401", "A", 1);
        renewal.resident(16, "A-401", "B", 1);
        renewal.resident(17, "A-402", "A", 2);
        renewals.openDue();
        String fifteen = bearer(mvc, student(15));
        stay.postJson("/students/me/stay/extension", fifteen, "{\"terms\":0}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.terms").isString());
        stay.postJson("/students/me/stay/extension", fifteen, "{\"terms\":9}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.terms").value("You can add at most 8 Terms (a stay has at most 9)."));
        stay.postJson("/students/me/stay/extension", fifteen, "{\"terms\":2}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(org.hamcrest.Matchers.startsWith("ST-" + RenewalFlow.NEXT_CODE)))
                .andExpect(jsonPath("$.status").value("Approved"))
                .andExpect(jsonPath("$.automatic").value(true));
        getAs("/students/me/allocation", fifteen)
                .andExpect(jsonPath("$.nextTerm.state").value("Continuing"))
                .andExpect(jsonPath("$.stay.committedTerms").value(3));

        renewal.overdueUtility(16, 300_000);
        String sixteen = bearer(mvc, student(16));
        String pending = id(stay.postJson("/students/me/stay/extension", sixteen, "{\"terms\":1}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("Pending"))
                .andExpect(jsonPath("$.automatic").value(false)));
        stay.postJson("/students/me/stay/extension", sixteen, "{\"terms\":1}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("OPEN_REQUEST"));
        String staff = bearer(mvc, STAFF_A);
        getAs("/stay-requests?termId=" + next + "&status=Pending", staff)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].id").value(pending))
                .andExpect(jsonPath("$.items[0].kind").value("Extension"))
                .andExpect(jsonPath("$.items[0].studentCode").value("SE190016"));
        getAs("/stay-requests?termId=" + next, sixteen).andExpect(status().isForbidden());
        getAs("/stay-requests?termId=" + next + "&status=Pending", bearer(mvc, STAFF_B2))
                .andExpect(jsonPath("$.total").value(0));
        stay.postJson("/stay-requests/" + pending + "/decision", staff, "{\"decision\":\"Rejected\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.note").isString());
        stay.postJson("/stay-requests/" + pending + "/decision", staff, "{\"decision\":\"Approved\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("Approved"));
        getAs("/students/me/allocation", sixteen).andExpect(jsonPath("$.nextTerm.state").value("Continuing"));
        getAs("/notifications", sixteen).andExpect(jsonPath("$.items[*].title", hasItem("Extension: approved")));

        String seventeen = bearer(mvc, student(17));
        stay.postJson("/students/me/stay/end", seventeen, "{\"reason\":\"Moving home.\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("Approved"));
        getAs("/students/me/allocation", seventeen)
                .andExpect(jsonPath("$.nextTerm.state").value("Not continuing"))
                .andExpect(jsonPath("$.nextTerm.endReason").value("End of stay"));
        assertThat(jdbc.sql("""
                SELECT count(*) FROM asg_allocation WHERE term_id = :t AND status = 'ACTIVE' AND student_id = :s
                """).param("t", next).param("s", stay.userId(student(17))).query(Long.class).single()).isZero();
        getAs("/students/me/requests?kind=room-changes", seventeen)
                .andExpect(jsonPath("$.items[0].typeLabel").value("End of stay"));
        // The Term the student lives in lists the requests made for the next one.
        getAs("/students/me/requests?kind=room-changes&termId=" + stay.termId(), seventeen)
                .andExpect(jsonPath("$.items[0].typeLabel").value("End of stay"));

        renewal.milestone("requests_close_at", "-1 minute");
        stay.postJson("/students/me/stay/extension", fifteen, "{\"terms\":1}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("REQUESTS_CLOSED"));
    }

    /**
     * TC-REQ-020: Room Class change requests are gone (user decision 19/11/2026): students cannot ask for one and Staff
     * cannot list or decide one; a Room's class per Term is set by Managers only.
     */
    @Test
    void noRoomClassChangeRequests() throws Exception {
        renewal.resident(18, "A-306", "A", 2);
        renewals.openDue();
        String student = bearer(mvc, student(18));
        String manager = bearer(mvc, MANAGER_A);
        getAs("/room-class-changes/options", student).andExpect(status().is4xxClientError());
        stay.postJson("/room-class-changes", student, "{\"roomClassId\":\"%s\"}".formatted(flow.roomClassId("Premium")))
                .andExpect(status().is4xxClientError());
        getAs("/room-class-changes?termId=" + next, manager).andExpect(status().is4xxClientError());
        getAs("/next-term-requests?termId=" + next + "&kind=room-class-change", manager)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.kind").value("Choose room-change, swap or extension."));
        getAs("/students/me/requests?kind=room-changes", student)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.counts.consents").doesNotExist());
    }

    /**
     * TC-REQ-021: the requests window in one list (room changes, swaps, extensions), oldest first; a bulk decision
     * decides each one in its own transaction and reports those it could not (a kind that does not exist); a bulk
     * rejection needs a reason; Staff of another Block see nothing.
     */
    @Test
    void windowListAndBulk() throws Exception {
        renewal.resident(1, "A-403", "A", 1);
        renewal.resident(2, "A-404", "A", 2);
        renewals.openDue();
        renewal.overdueUtility(1, 100_000);
        String extension = id(stay.postJson("/students/me/stay/extension", bearer(mvc, student(1)), "{\"terms\":1}")
                .andExpect(status().isOk()));
        String roomChange = id(stay.postJson("/room-changes", bearer(mvc, student(2)),
                "{\"kind\":\"type\",\"roomTypeId\":\"%s\",\"roomClassId\":\"%s\",\"reason\":\"Price\"}".formatted(
                        flow.roomTypeId("6-bed"), flow.roomClassId("Standard"))).andExpect(status().isOk()));

        String manager = bearer(mvc, MANAGER_A);
        getAs("/next-term-requests?termId=" + next, manager)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(2))
                .andExpect(jsonPath("$.items[*].kind", hasItem("extension")))
                .andExpect(jsonPath("$.items[*].kind", hasItem("room-change")))
                .andExpect(jsonPath("$.window.termName").value(RenewalFlow.NEXT_NAME));
        getAs("/next-term-requests?termId=" + next, bearer(mvc, STAFF_B2)).andExpect(jsonPath("$.total").value(0));
        getAs("/renewals/overview?termId=" + next, manager)
                .andExpect(jsonPath("$.requests.extensions").value(1))
                .andExpect(jsonPath("$.requests.roomChanges").value(1));

        String items = "[{\"kind\":\"room-class-change\",\"id\":\"CC-1\"},{\"kind\":\"extension\",\"id\":\"%s\"},"
                .formatted(extension) + "{\"kind\":\"room-change\",\"id\":\"%s\"}]".formatted(roomChange);
        stay.postJson("/next-term-requests/decision", manager, "{\"items\":%s,\"decision\":\"Rejected\"}".formatted(items))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.reason").isString());
        stay.postJson("/next-term-requests/decision", manager, "{\"items\":%s,\"decision\":\"Approved\"}".formatted(items))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.decided").value(2))
                .andExpect(jsonPath("$.failed[0].kind").value("room-class-change"))
                .andExpect(jsonPath("$.failed[0].message").value("Choose room-change, swap or extension."));
        getAs("/students/me/allocation", bearer(mvc, student(1))).andExpect(jsonPath("$.nextTerm.state").value("Continuing"));
        getAs("/students/me/allocation", bearer(mvc, student(2))).andExpect(jsonPath("$.nextTerm.roomTypeName").value("6-bed"));
        getAs("/renewals/overview?termId=" + next, manager).andExpect(jsonPath("$.requests").isEmpty());
    }
}

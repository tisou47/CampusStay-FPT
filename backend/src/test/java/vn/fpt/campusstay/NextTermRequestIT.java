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
 * the student may extend, otherwise by Staff) and the end of the stay; the Room Class change of a Room with the
 * consent of every continuing resident and the furniture check; every open request of the window in one list,
 * decided in bulk (TC-REQ-019…021).
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
     * TC-REQ-020: a Room Class change of a Room for the next Term: every other continuing resident must agree (one
     * in the Stay's last Term is not asked); Staff cannot approve before; the furniture check reserves the missing items
     * of the Block store; the Room's class changes for the next Term only, and the next-Term price follows it; a
     * refusal cancels a change; Staff of another Block see nothing.
     */
    @Test
    void roomClassChange() throws Exception {
        renewal.resident(18, "A-306", "A", 2);
        renewal.resident(19, "A-306", "B", 2);
        renewal.resident(20, "A-306", "C", 1);
        renewal.resident(21, "A-307", "A", 2);
        renewal.resident(22, "A-307", "B", 2);
        renewals.openDue();
        String eighteen = bearer(mvc, student(18));
        String nineteen = bearer(mvc, student(19));
        getAs("/room-class-changes/options", eighteen)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.room").value("A-306"))
                .andExpect(jsonPath("$.current.name").value("Standard"))
                .andExpect(jsonPath("$.classes[?(@.name == 'Premium')].termPrice",
                        hasItem((int) renewal.nextPrice("4-bed", "Premium"))))
                .andExpect(jsonPath("$.residents").value(2))
                .andExpect(jsonPath("$.canAsk").value(true));
        String id = id(stay.postJson("/room-class-changes", eighteen, "{\"roomClassId\":\"%s\",\"reason\":\"We want a fridge.\"}"
                .formatted(flow.roomClassId("Premium")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("Awaiting consent")));
        assertThat(id).startsWith("CC-" + RenewalFlow.NEXT_CODE + "-");
        stay.postJson("/room-class-changes", nineteen, "{\"roomClassId\":\"%s\"}".formatted(flow.roomClassId("Basic")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("OPEN_REQUEST"));
        getAs("/notifications", nineteen).andExpect(jsonPath("$.items[*].title", hasItem("Do you agree to change Room A-306?")));
        String consent = JsonPath.read(getAs("/students/me/requests?kind=room-changes", nineteen)
                .andExpect(jsonPath("$.counts.consents").value(1))
                .andReturn().getResponse().getContentAsString(), "$.items[0].consentId");
        assertThat(consent).isEqualTo(id);
        stay.postJson("/room-class-changes/" + id + "/consent", bearer(mvc, student(20)), "{\"agree\":true}")
                .andExpect(status().isNotFound());

        String staff = bearer(mvc, STAFF_A);
        stay.postJson("/room-class-changes/" + id + "/decision", staff, "{\"decision\":\"Approved\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CONSENT_MISSING"));
        stay.postJson("/room-class-changes/" + id + "/consent", nineteen, "{\"agree\":true}")
                .andExpect(status().isNoContent());
        getAs("/room-class-changes/" + id, staff)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.item.status").value("Waiting for Staff"))
                .andExpect(jsonPath("$.item.agreed").value(2))
                .andExpect(jsonPath("$.toPrice").value(renewal.nextPrice("4-bed", "Premium")))
                .andExpect(jsonPath("$.furniture.enough").value(true))
                .andExpect(jsonPath("$.furniture.missing[0].type").value("Fridge"));
        getAs("/room-class-changes/" + id, bearer(mvc, STAFF_B2)).andExpect(status().isForbidden());
        stay.postJson("/room-class-changes/" + id + "/decision", staff, "{\"decision\":\"Approved\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.item.status").value("Approved"))
                .andExpect(jsonPath("$.furniture.reserved", hasSize(1)));
        getAs("/students/me/allocation", eighteen)
                .andExpect(jsonPath("$.allocation.roomClassName").value("Standard"))
                .andExpect(jsonPath("$.nextTerm.roomClassName").value("Premium"))
                .andExpect(jsonPath("$.nextTerm.termPrice").value(renewal.nextPrice("4-bed", "Premium")));
        assertThat(jdbc.sql("""
                SELECT count(*) FROM inv_furniture_move WHERE status = 'PLANNED' AND reason LIKE :r
                """).param("r", id + ":%").query(Long.class).single()).isEqualTo(1);
        // The turnover lists the Room (its furniture moves), not matching its next-Term class until then.
        getAs("/turnover?termId=" + next, staff)
                .andExpect(jsonPath("$.rooms[?(@.room == 'A-306')].roomClass", hasItem("Premium")))
                .andExpect(jsonPath("$.rooms[?(@.room == 'A-306')].matches", hasItem(false)));
        getAs("/notifications", nineteen).andExpect(jsonPath("$.items[*].title",
                hasItem("Room Class change: approved")));

        String declined = id(stay.postJson("/room-class-changes", bearer(mvc, student(21)), "{\"roomClassId\":\"%s\"}"
                .formatted(flow.roomClassId("Basic"))).andExpect(status().isOk()));
        stay.postJson("/room-class-changes/" + declined + "/consent", bearer(mvc, student(22)), "{\"agree\":false}")
                .andExpect(status().isNoContent());
        getAs("/room-class-changes/" + declined, staff).andExpect(jsonPath("$.item.status").value("Cancelled"));

        // A Manager sets an approved class back, and asks for a change of a Room: its residents are asked to agree.
        String manager = bearer(mvc, MANAGER_A);
        stay.postJson("/room-class-changes/" + id + "/set-back", staff, "{\"note\":\"No fridge.\"}")
                .andExpect(status().isForbidden());
        stay.postJson("/room-class-changes/" + id + "/set-back", manager, "{\"note\":\"The fridge did not arrive.\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.item.status").value("Set back"));
        getAs("/students/me/allocation", eighteen).andExpect(jsonPath("$.nextTerm.roomClassName").value("Standard"));
        String forRoom = id(stay.postJson("/room-class-changes", manager,
                "{\"termId\":\"%d\",\"room\":\"A-307\",\"roomClassId\":\"%s\",\"reason\":\"New Premium supply.\"}"
                        .formatted(next, flow.roomClassId("Premium")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("Awaiting consent")));
        getAs("/room-class-changes?termId=" + next, staff).andExpect(jsonPath("$.items[*].id", hasItem(forRoom)));
    }

    /**
     * TC-REQ-021: the requests window in one list (room changes, swaps, Room Class changes, extensions), oldest first;
     * a bulk decision decides each one in its own transaction and reports those it could not (a change still waiting
     * for consent); a bulk rejection needs a reason; Staff of another Block see nothing.
     */
    @Test
    void windowListAndBulk() throws Exception {
        renewal.resident(23, "A-308", "A", 2);
        renewal.resident(24, "A-308", "B", 2);
        renewal.resident(1, "A-403", "A", 1);
        renewal.resident(2, "A-404", "A", 2);
        renewals.openDue();
        renewal.overdueUtility(1, 100_000);
        String change = id(stay.postJson("/room-class-changes", bearer(mvc, student(23)), "{\"roomClassId\":\"%s\"}"
                .formatted(flow.roomClassId("Premium"))).andExpect(status().isOk()));
        String extension = id(stay.postJson("/students/me/stay/extension", bearer(mvc, student(1)), "{\"terms\":1}")
                .andExpect(status().isOk()));
        String roomChange = id(stay.postJson("/room-changes", bearer(mvc, student(2)),
                "{\"kind\":\"type\",\"roomTypeId\":\"%s\",\"roomClassId\":\"%s\",\"reason\":\"Price\"}".formatted(
                        flow.roomTypeId("6-bed"), flow.roomClassId("Standard"))).andExpect(status().isOk()));

        String manager = bearer(mvc, MANAGER_A);
        getAs("/next-term-requests?termId=" + next, manager)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(3))
                .andExpect(jsonPath("$.items[*].kind", hasItem("room-class-change")))
                .andExpect(jsonPath("$.items[*].kind", hasItem("extension")))
                .andExpect(jsonPath("$.items[*].kind", hasItem("room-change")))
                .andExpect(jsonPath("$.window.termName").value(RenewalFlow.NEXT_NAME));
        getAs("/next-term-requests?termId=" + next, bearer(mvc, STAFF_B2)).andExpect(jsonPath("$.total").value(0));
        getAs("/renewals/overview?termId=" + next, manager)
                .andExpect(jsonPath("$.requests.roomClassChanges").value(1))
                .andExpect(jsonPath("$.requests.extensions").value(1))
                .andExpect(jsonPath("$.requests.roomChanges").value(1));

        String items = "[{\"kind\":\"room-class-change\",\"id\":\"%s\"},{\"kind\":\"extension\",\"id\":\"%s\"},"
                .formatted(change, extension) + "{\"kind\":\"room-change\",\"id\":\"%s\"}]".formatted(roomChange);
        stay.postJson("/next-term-requests/decision", manager, "{\"items\":%s,\"decision\":\"Rejected\"}".formatted(items))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.reason").isString());
        stay.postJson("/next-term-requests/decision", manager, "{\"items\":%s,\"decision\":\"Approved\"}".formatted(items))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.decided").value(2))
                .andExpect(jsonPath("$.failed[0].kind").value("room-class-change"))
                .andExpect(jsonPath("$.failed[0].message").value(
                        "Every continuing resident of Room A-308 must agree first."));
        getAs("/students/me/allocation", bearer(mvc, student(1))).andExpect(jsonPath("$.nextTerm.state").value("Continuing"));
        getAs("/students/me/allocation", bearer(mvc, student(2))).andExpect(jsonPath("$.nextTerm.roomTypeName").value("6-bed"));
        stay.postJson("/next-term-requests/decision", manager,
                "{\"items\":[{\"kind\":\"room-class-change\",\"id\":\"%s\"}],\"decision\":\"Rejected\",\"reason\":\"Not this Term.\"}"
                        .formatted(change))
                .andExpect(jsonPath("$.decided").value(1));
        getAs("/renewals/overview?termId=" + next, manager).andExpect(jsonPath("$.requests").isEmpty());
    }
}

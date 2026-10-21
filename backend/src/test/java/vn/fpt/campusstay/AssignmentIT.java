package vn.fpt.campusstay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.MANAGER_A;
import static vn.fpt.campusstay.TestAuth.MANAGER_B;
import static vn.fpt.campusstay.TestAuth.STAFF_A;
import static vn.fpt.campusstay.TestAuth.bearer;

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
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/**
 * Staff review, the assignment run, conflicts, the Manager's approval and the
 * student's Room (TC-APP-010…011, TC-ASG-010…012). Each test uses its own students.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class AssignmentIT {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    ApplyFlow flow;
    long termId;

    @BeforeEach
    void openTerm() {
        flow = new ApplyFlow(mvc, jdbc);
        termId = flow.openTerm();
    }

    private static String student(int n) {
        return "se19%04d@student.campusstay.test".formatted(n);
    }

    /** Applies for a 2-bed Standard Room and pays the Deposit: the Application is Submitted. */
    private String submitted(String auth) throws Exception {
        ApplyFlow.Applied app = flow.apply(auth, "2-bed", "Standard", "{\"mode\":\"auto\"}");
        flow.pay(auth, app.depositInvoiceId());
        return app.id();
    }

    private ResultActions postJson(String path, String auth, String body) throws Exception {
        return mvc.perform(post(path).header(HttpHeaders.AUTHORIZATION, auth).contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private ResultActions getAs(String path, String auth) throws Exception {
        return mvc.perform(get(path).header(HttpHeaders.AUTHORIZATION, auth));
    }

    /** TC-APP-010: the queue, the review view (opening it starts the review), rejection needs a note, once only. */
    @Test
    void reviewQueueAndRejection() throws Exception {
        String auth = bearer(mvc, student(4));
        String id = submitted(auth);
        String staff = bearer(mvc, STAFF_A);

        getAs("/applications?status=Submitted", staff)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[*].id", hasItem(id)))
                .andExpect(jsonPath("$.counts.Submitted").isNumber());
        getAs("/applications/" + id, staff)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("Under Review"))
                .andExpect(jsonPath("$.termName").value(ApplyFlow.TERM_NAME))
                .andExpect(jsonPath("$.student.studentCode").value("SE190004"))
                .andExpect(jsonPath("$.roomTypeName").value("2-bed"))
                .andExpect(jsonPath("$.deposit.status").value("Paid"))
                .andExpect(jsonPath("$.eligibility[0].passed").value(true));

        postJson("/applications/" + id + "/review", staff, "{\"decision\":\"Rejected\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.details.fields.note").isString());
        postJson("/applications/" + id + "/review", staff,
                "{\"decision\":\"Rejected\",\"note\":\"Documents do not match the student records.\"}")
                .andExpect(status().isNoContent());
        postJson("/applications/" + id + "/review", staff, "{\"decision\":\"Approved\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ALREADY_DECIDED"));

        assertThat(flow.statuses(auth)).containsExactly("Rejected");
        getAs("/notifications", auth)
                .andExpect(jsonPath("$.items[0].title").value("Application not approved"))
                .andExpect(jsonPath("$.items[0].link").value("/student/applications/" + id));
    }

    /** TC-APP-011 (scope): a Block B Manager never sees Block A students; students cannot use the queue. */
    @Test
    void reviewIsScopedByBlock() throws Exception {
        String auth = bearer(mvc, student(8));
        String id = submitted(auth);
        String managerB = bearer(mvc, MANAGER_B);

        getAs("/applications/" + id, managerB)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("BLOCK_OUT_OF_SCOPE"));
        getAs("/applications", managerB)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[*].id", not(hasItem(id))));
        getAs("/applications?block=B", bearer(mvc, STAFF_A))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("BLOCK_OUT_OF_SCOPE"));
        getAs("/applications", auth).andExpect(status().isForbidden());
        postJson("/applications/" + id + "/review", managerB, "{\"decision\":\"Approved\"}")
                .andExpect(status().isForbidden());
    }

    /**
     * TC-ASG-010: approve in bulk, run, resolve the conflict to the waitlist, submit the Block, the Manager
     * returns it once and then approves: Allocations, Balance Invoices, notifications and My Room.
     */
    @Test
    void assignmentRunToAllocation() throws Exception {
        String first = bearer(mvc, student(5));
        String second = bearer(mvc, student(6));
        String third = bearer(mvc, student(7));
        String a1 = submitted(first);
        String a2 = submitted(second);
        String a3 = submitted(third);
        String staff = bearer(mvc, STAFF_A);
        String manager = bearer(mvc, MANAGER_A);

        postJson("/applications/bulk-review", staff,
                "{\"ids\":[\"%s\",\"%s\",\"%s\"],\"decision\":\"Approved\"}".formatted(a1, a2, a3))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.approved").value(3))
                .andExpect(jsonPath("$.skipped").value(0));
        // The student leaves the university after approval: the run must flag it, not place them.
        jdbc.sql("""
                UPDATE auth_student SET enrollment_status = 'WITHDRAWN'
                WHERE student_code = 'SE190007'
                """).update();

        String run = JsonPath.read(postJson("/assignment-runs", staff,
                "{\"termId\":\"%d\",\"dryRun\":false}".formatted(termId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id", startsWith("RUN-")))
                .andReturn().getResponse().getContentAsString(), "$.id");
        getAs("/assignment-runs?termId=" + termId, staff)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.current.id").value(run))
                .andExpect(jsonPath("$.current.kind").value("Final run"))
                .andExpect(jsonPath("$.current.status").value("Proposed"))
                .andExpect(jsonPath("$.current.input").value(3))
                .andExpect(jsonPath("$.current.proposed").value(2))
                .andExpect(jsonPath("$.current.conflicts").value(1))
                .andExpect(jsonPath("$.rules.groups[0].title").value("Hard constraints"));
        getAs("/assignment-runs/" + run + "/proposal?block=A", staff)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.run.id").value(run))
                .andExpect(jsonPath("$.blocks[0].block").value("A"))
                .andExpect(jsonPath("$.blocks[0].total").value(3))
                .andExpect(jsonPath("$.blocks[0].conflicts").value(1))
                .andExpect(jsonPath("$.blocks[0].status").value("review"))
                .andExpect(jsonPath("$.total").value(3))
                .andExpect(jsonPath("$.commitSummary.students").value(2));
        getAs("/assignment-runs/" + run + "/proposal?block=A&view=conflicts", staff)
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].applicationId").value(a3))
                .andExpect(jsonPath("$.items[0].bed").value((Object) null))
                .andExpect(jsonPath("$.items[0].issue.label").value("Not eligible"))
                .andExpect(jsonPath("$.items[0].issue.tone").value("error"));
        getAs("/assignment-runs/" + run + "/conflicts/" + a3, staff)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.issue.title").value("No longer eligible"))
                .andExpect(jsonPath("$.preference").value("2-bed · Standard"));

        postJson("/assignment-runs/" + run + "/commit", staff, "{\"block\":\"A\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CONFLICTS_LEFT"));
        postJson("/assignment-runs/" + run + "/conflicts/" + a3 + "/resolve", staff, "{\"waitlist\":true}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.resolved").value(true))
                .andExpect(jsonPath("$.waitlisted").value(true));
        getAs("/assignment-runs/" + run + "/proposal?block=waitlisted", staff)
                .andExpect(jsonPath("$.waitlistedCount").value(1))
                .andExpect(jsonPath("$.items[0].applicationId").value(a3));
        postJson("/assignment-runs/" + run + "/commit", staff, "{\"block\":\"A\"}").andExpect(status().isNoContent());
        postJson("/assignment-runs/" + run + "/conflicts/" + a3 + "/resolve", staff, "{\"waitlist\":true}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("BLOCK_SUBMITTED"));

        // Only the Manager approves; first they send it back once.
        postJson("/assignment-runs/" + run + "/approve", staff, "{\"block\":\"A\"}").andExpect(status().isForbidden());
        getAs("/approvals/assignment?termId=" + termId, manager)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.item.runId").value(run))
                .andExpect(jsonPath("$.item.blockLabel").value("Block A"))
                .andExpect(jsonPath("$.item.status").value("Waiting"))
                // Block A: 5 Floors × 36 Beds, minus Room A-305 (4 Beds) out of service.
                .andExpect(jsonPath("$.item.bedsOffered").value(176))
                .andExpect(jsonPath("$.item.applications").value(3))
                .andExpect(jsonPath("$.item.allocated").value(2))
                .andExpect(jsonPath("$.item.toRound2").value(1))
                .andExpect(jsonPath("$.item.conflictsTotal").value(1))
                .andExpect(jsonPath("$.item.conflictsResolved").value(1));
        getAs("/assignment-runs/" + run + "/rooms?block=A", manager)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].room", startsWith("A-")))
                .andExpect(jsonPath("$.items[0].roomTypeName").value("2-bed"));
        postJson("/assignment-runs/" + run + "/return", manager, "{\"block\":\"A\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.comment").isString());
        postJson("/assignment-runs/" + run + "/return", manager,
                "{\"block\":\"A\",\"comment\":\"Check the pairing on floor 3.\"}").andExpect(status().isNoContent());
        getAs("/approvals/assignment?termId=" + termId, manager)
                .andExpect(jsonPath("$.item.status").value("Returned"))
                .andExpect(jsonPath("$.item.comment").value("Check the pairing on floor 3."));
        postJson("/assignment-runs/" + run + "/commit", staff, "{\"block\":\"A\"}").andExpect(status().isNoContent());
        postJson("/assignment-runs/" + run + "/approve", manager, "{\"block\":\"A\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.allocated").value(2))
                .andExpect(jsonPath("$.waitlisted").value(1));
        postJson("/assignment-runs/" + run + "/approve", manager, "{\"block\":\"A\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("NOT_SUBMITTED"));
        getAs("/assignment-runs?termId=" + termId, staff)
                .andExpect(jsonPath("$.current.status").value("Committed"))
                .andExpect(jsonPath("$.current.stage").value(5));

        // The students see the outcome.
        assertThat(flow.statuses(first)).containsExactly("Allocated");
        assertThat(flow.statuses(third)).containsExactly("Waitlisted");
        String room = getAs("/students/me/allocation", first)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.term.name").value(ApplyFlow.TERM_NAME))
                .andExpect(jsonPath("$.allocation.room", startsWith("A-")))
                .andExpect(jsonPath("$.allocation.blockLabel").value("Block A"))
                .andExpect(jsonPath("$.allocation.roomTypeName").value("2-bed"))
                .andExpect(jsonPath("$.allocation.roomClassName").value("Standard"))
                .andExpect(jsonPath("$.allocation.status").value("Allocated"))
                .andExpect(jsonPath("$.roommateCapacity").value(1))
                .andExpect(jsonPath("$.checkIn.start").value("2031-01-02"))
                .andExpect(jsonPath("$.checkIn.deskHours").value("07:30–21:00"))
                .andExpect(jsonPath("$.balance.amount").value(8_280_000))
                .andExpect(jsonPath("$.balance.status").value("Unpaid"))
                .andExpect(jsonPath("$.balance.invoiceId", startsWith("INV-" + ApplyFlow.TERM_CODE + "-")))
                .andExpect(jsonPath("$.application.id").value(a1))
                .andExpect(jsonPath("$.application.status").value("Allocated"))
                .andReturn().getResponse().getContentAsString();
        getAs("/students/me/home", first)
                .andExpect(jsonPath("$.allocation.room").value((String) JsonPath.read(room, "$.allocation.room")))
                .andExpect(jsonPath("$.checkedIn").value(false));
        getAs("/notifications", first)
                .andExpect(jsonPath("$.items[0].title").value("Your room is ready"))
                .andExpect(jsonPath("$.items[0].link").value("/student/room"));
        getAs("/students/me/allocation", third)
                .andExpect(jsonPath("$.allocation").value((Object) null))
                .andExpect(jsonPath("$.application.id").value(a3))
                .andExpect(jsonPath("$.application.status").value("Waitlisted"));
        getAs("/approvals/assignment?termId=" + termId, manager)
                .andExpect(jsonPath("$.item.status").value("Approved"));
        List<String> actions = jdbc.sql("SELECT action FROM shared_audit_log ORDER BY id")
                .query(String.class).list();
        assertThat(actions).contains("ASSIGNMENT_RUN_STARTED", "PROPOSAL_SUBMITTED", "PROPOSAL_RETURNED",
                "PROPOSAL_APPROVED", "APPLICATION_APPROVED");
    }

    /** TC-ASG-011: a dry run is a preview; students and other Blocks cannot use runs. */
    @Test
    void dryRunAndPermissions() throws Exception {
        String staff = bearer(mvc, STAFF_A);
        String run = JsonPath.read(postJson("/assignment-runs", staff,
                "{\"termId\":\"%d\",\"dryRun\":true}".formatted(termId))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(), "$.id");
        postJson("/assignment-runs/" + run + "/commit", staff, "{\"block\":\"A\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("DRY_RUN"));
        postJson("/assignment-runs", staff, "{\"dryRun\":true}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.termId").isString());

        String auth = bearer(mvc, student(9));
        getAs("/assignment-runs", auth).andExpect(status().isForbidden());
        postJson("/assignment-runs", auth, "{\"termId\":\"%d\",\"dryRun\":true}".formatted(termId))
                .andExpect(status().isForbidden());
        getAs("/approvals/assignment", staff).andExpect(status().isForbidden());
        getAs("/assignment-runs/" + run + "/rooms?block=B", bearer(mvc, MANAGER_A))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("BLOCK_OUT_OF_SCOPE"));
        getAs("/assignment-runs/RUN-999999/proposal", staff).andExpect(status().isNotFound());
        getAs("/students/me/allocation", auth)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.allocation").value((Object) null))
                .andExpect(jsonPath("$.application").value((Object) null));
    }
}

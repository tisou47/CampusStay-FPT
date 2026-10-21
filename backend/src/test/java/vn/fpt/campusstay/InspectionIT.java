package vn.fpt.campusstay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.ADMIN;
import static vn.fpt.campusstay.TestAuth.MANAGER_A;
import static vn.fpt.campusstay.TestAuth.MANAGER_B;
import static vn.fpt.campusstay.TestAuth.STAFF_A;
import static vn.fpt.campusstay.TestAuth.bearer;

import java.util.List;
import java.util.Map;

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

import vn.fpt.campusstay.mnt.internal.InspectionScheduleService;

/** Inspections: checklists (Admin), schedules (Block Manager) and runs (Staff) (TC-MNT-004…007). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class InspectionIT {

    private static final String STAFF_A2 = "staff.a2@campusstay.test";
    /** Only its id is used: AuthFlowIT locks this account. */
    private static final String STAFF_B1 = "staff.b1@campusstay.test";

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    InspectionScheduleService schedules;

    StayFlow stay;

    @BeforeEach
    void openTerm() {
        ApplyFlow flow = new ApplyFlow(mvc, jdbc);
        stay = new StayFlow(mvc, jdbc, flow, flow.openTerm());
    }

    private ResultActions getAs(String path, String auth) throws Exception {
        return mvc.perform(get(path).header(HttpHeaders.AUTHORIZATION, auth));
    }

    private ResultActions putAs(String path, String auth, String body) throws Exception {
        return mvc.perform(put(path).header(HttpHeaders.AUTHORIZATION, auth).contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private String read(ResultActions result, String path) throws Exception {
        return JsonPath.read(result.andReturn().getResponse().getContentAsString(), path);
    }

    /** TC-MNT-004: the seeded checklist; a Draft is published as v1; editing publishes v2 and keeps v1 as Replaced. */
    @Test
    void checklistsAreVersioned() throws Exception {
        String admin = bearer(mvc, ADMIN);
        getAs("/inspection-checklists", admin).andExpect(status().isOk())
                .andExpect(jsonPath("$.items[?(@.id == 'CL-ROOM')].status").value(hasItem("Active")))
                .andExpect(jsonPath("$.items[?(@.id == 'CL-ROOM')].items[0].severity").value(hasItem("Critical")))
                .andExpect(jsonPath("$.categories").value(hasItem("Electrical")))
                .andExpect(jsonPath("$.severities", contains("Critical", "Major", "Minor", "Trivial")));

        stay.postJson("/inspection-checklists", admin, "{\"name\":\"room safety check\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.details.fields.name").exists());
        String id = read(stay.postJson("/inspection-checklists", admin, "{\"name\":\"Kitchen check\"}")
                .andExpect(status().isOk()), "$.id");
        assertThat(id).startsWith("CL-");
        String item = "$.items[?(@.id == '" + id + "')]";
        getAs("/inspection-checklists", admin).andExpect(jsonPath(item + ".status").value(hasItem("Draft")));

        stay.postJson("/inspection-checklists/" + id + "/publish", admin, "{\"items\":[]}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.details.fields.items").exists());
        stay.postJson("/inspection-checklists/" + id + "/publish", admin,
                "{\"items\":[{\"label\":\"Stove works\",\"category\":\"Cooking\",\"severity\":\"Major\"}]}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.details.fields.items").exists());
        stay.postJson("/inspection-checklists/" + id + "/publish", admin,
                "{\"items\":[{\"label\":\"Stove works\",\"category\":\"Electrical\",\"severity\":\"Major\"}]}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(1));
        stay.postJson("/inspection-checklists/" + id + "/publish", admin, """
                {"items":[{"label":"Stove works","category":"Electrical","severity":"Major"},
                          {"label":"Sink drains","category":"Plumbing","severity":"Minor"}]}""")
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(2));
        getAs("/inspection-checklists", admin)
                .andExpect(jsonPath(item + ".status").value(hasItem("Active")))
                .andExpect(jsonPath(item + ".version").value(hasItem(2)))
                .andExpect(jsonPath(item + ".items[1].label").value(hasItem("Sink drains")))
                .andExpect(jsonPath(item + ".replaced[0].version").value(hasItem(1)))
                .andExpect(jsonPath(item + ".replaced[0].itemCount").value(hasItem(1)));

        getAs("/inspection-checklists", bearer(mvc, MANAGER_A)).andExpect(status().isForbidden());
        stay.postJson("/inspection-checklists/CL-NONE/archive", admin, "{}").andExpect(status().isNotFound());
    }

    /**
     * TC-MNT-005: a schedule starts its first run at once and notifies residents; Staff record the Rooms, a failed
     * item creates a Maintenance Request with the severity's priority; the run is submitted; the job starts the next.
     */
    @Test
    void scheduleAndRun() throws Exception {
        stay.livesIn(1, "A-401", "A", true);
        String manager = bearer(mvc, MANAGER_A);
        long a2 = stay.userId(STAFF_A2);
        getAs("/inspection-schedules?block=A", manager).andExpect(status().isOk())
                .andExpect(jsonPath("$.options.checklists[*].value").value(hasItem("CL-ROOM")))
                .andExpect(jsonPath("$.options.scopes[*].value").value(hasItem("FLOOR_4")))
                .andExpect(jsonPath("$.options.repeats[*].label").value(hasItem("Every week")))
                .andExpect(jsonPath("$.options.assignees[*].value").value(hasItem(String.valueOf(a2))));

        String body = """
                {"block":"A","name":"Floor 4 safety","checklistId":"CL-ROOM","scope":"%s","repeat":"WEEKLY",
                 "assignee":"%d","dueWithinDays":%d,"createRequests":true,"notifyResidents":true}""";
        stay.postJson("/inspection-schedules", manager, body.formatted("FLOOR_9", stay.userId(STAFF_B1), 0))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.scope").exists())
                .andExpect(jsonPath("$.details.fields.assignee").exists())
                .andExpect(jsonPath("$.details.fields.dueWithinDays").exists());
        String id = read(stay.postJson("/inspection-schedules", manager, body.formatted("FLOOR_4", a2, 3))
                .andExpect(status().isOk()), "$.id");
        String schedule = "$.items[?(@.id == '" + id + "')]";
        getAs("/inspection-schedules?block=A", manager)
                .andExpect(jsonPath(schedule + ".scopeLabel").value(hasItem("Floor 4")))
                .andExpect(jsonPath(schedule + ".repeatLabel").value(hasItem("Every week")))
                .andExpect(jsonPath(schedule + ".status").value(hasItem("Active")))
                .andExpect(jsonPath("$.runs[0].status").value("Planned"))
                .andExpect(jsonPath("$.runs[0].assigneeName").value("Vo Thanh Tung"));
        getAs("/notifications", bearer(mvc, StayFlow.student(1)))
                .andExpect(jsonPath("$.items[*].title").value(hasItem("Room inspection")));
        getAs("/inspection-runs/upcoming?block=A", bearer(mvc, STAFF_A2))
                .andExpect(jsonPath("$.items[*].scheduleName").value(hasItem("Floor 4 safety")));

        String staff = bearer(mvc, STAFF_A2);
        String current = getAs("/inspection-runs/current?block=A", staff).andExpect(status().isOk())
                .andExpect(jsonPath("$.run.scheduleName").value("Floor 4 safety"))
                .andExpect(jsonPath("$.run.scope").value("Floor 4"))
                .andExpect(jsonPath("$.run.checklist.version").value("v1"))
                .andExpect(jsonPath("$.run.checklist.items", hasSize(6)))
                .andExpect(jsonPath("$.run.inspectorName").value("Vo Thanh Tung"))
                .andReturn().getResponse().getContentAsString();
        String run = JsonPath.read(current, "$.run.id");
        assertThat(run).startsWith("INS-");
        List<String> itemIds = JsonPath.read(current, "$.run.checklist.items[*].id");
        getAs("/inspection-runs/" + run + "/rooms?pageSize=100", staff).andExpect(status().isOk())
                .andExpect(jsonPath("$.items[?(@.room == 'A-401')].status").value(hasItem("To do")));

        StringBuilder results = new StringBuilder();
        for (int i = 0; i < itemIds.size(); i++) {
            results.append(i == 0 ? "" : ",").append("{\"itemId\":\"").append(itemIds.get(i)).append("\",\"result\":\"")
                    .append(i == 0 ? "Fail\",\"note\":\"No beep when tested\"}" : "Pass\"}");
        }
        String saved = putAs("/inspection-runs/" + run + "/rooms/A-401", staff, "{\"results\":[" + results + "]}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.createdRequests", hasSize(1)))
                .andReturn().getResponse().getContentAsString();
        String request = JsonPath.read(saved, "$.createdRequests[0]");
        Map<String, Object> mr = jdbc.sql("SELECT priority, urgency, source, category, description FROM mnt_request WHERE code = :c")
                .param("c", request).query().singleRow();
        assertThat(mr).containsEntry("priority", "HIGH").containsEntry("urgency", "URGENT")
                .containsEntry("source", "INSPECTION").containsEntry("category", "ELECTRICAL")
                .containsEntry("description", "No beep when tested");
        putAs("/inspection-runs/" + run + "/rooms/A-401", staff, "{\"results\":[" + results + "]}")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ROOM_DONE"));

        putAs("/inspection-runs/" + run + "/rooms/A-402", staff,
                "{\"results\":[{\"itemId\":\"" + itemIds.get(1) + "\",\"result\":\"Pass\"}]}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.createdRequests", hasSize(0)));
        putAs("/inspection-runs/" + run + "/rooms/A-402", staff, "{\"results\":[{\"itemId\":\"999999\",\"result\":\"Pass\"}]}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.details.fields.results").exists());
        stay.postJson("/inspection-runs/" + run + "/rooms/A-403/unreachable", staff, "{}").andExpect(status().isNoContent());
        getAs("/inspection-runs/" + run + "/rooms?pageSize=100", staff)
                .andExpect(jsonPath("$.items[?(@.room == 'A-401')].status").value(hasItem("Done")))
                .andExpect(jsonPath("$.items[?(@.room == 'A-402')].status").value(hasItem("In progress")))
                .andExpect(jsonPath("$.items[?(@.room == 'A-403')].status").value(hasItem("Not reachable")));
        getAs("/inspection-runs/current?block=A", staff)
                .andExpect(jsonPath("$.run.inspected").value(1))
                .andExpect(jsonPath("$.run.failed").value(1))
                .andExpect(jsonPath("$.run.unreachable").value(1));

        getAs("/inspection-runs/" + run + "/rooms", bearer(mvc, MANAGER_B)).andExpect(status().isForbidden());
        stay.postJson("/inspection-runs/" + run + "/submit", staff, "{}").andExpect(status().isNoContent());
        stay.postJson("/inspection-runs/" + run + "/submit", staff, "{}").andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("RUN_SUBMITTED"));
        getAs("/inspection-schedules?block=A", manager).andExpect(jsonPath("$.runs[0].status").value("Done"));

        // The job starts the next run once its day comes.
        jdbc.sql("UPDATE mnt_inspection_schedule SET next_run_at = now() - interval '1 minute' WHERE id = :id")
                .param("id", Long.parseLong(id)).update();
        assertThat(schedules.startDue()).isEqualTo(1);
        getAs("/inspection-runs/current?block=A", staff).andExpect(jsonPath("$.run.id").value(startsWith("INS-")))
                .andExpect(jsonPath("$.run.inspected").value(0));
    }

    /** TC-MNT-006: archiving a checklist pauses its schedules, which cannot resume until another is published. */
    @Test
    void archivingPausesSchedules() throws Exception {
        String admin = bearer(mvc, ADMIN);
        String checklist = read(stay.postJson("/inspection-checklists", admin, "{\"name\":\"Balcony check\"}"), "$.id");
        stay.postJson("/inspection-checklists/" + checklist + "/publish", admin,
                "{\"items\":[{\"label\":\"Railing is firm\",\"category\":\"Furniture\",\"severity\":\"Critical\"}]}")
                .andExpect(status().isOk());
        String manager = bearer(mvc, MANAGER_B);
        String id = read(stay.postJson("/inspection-schedules", manager, """
                {"block":"B","name":"Balconies","checklistId":"%s","scope":"FLOOR_1","repeat":"MONTHLY",
                 "assignee":"%d","dueWithinDays":5}""".formatted(checklist, stay.userId(STAFF_B1)))
                .andExpect(status().isOk()), "$.id");

        stay.postJson("/inspection-checklists/" + checklist + "/archive", admin, "{}").andExpect(status().isNoContent());
        getAs("/inspection-schedules?block=B", manager)
                .andExpect(jsonPath("$.items[?(@.id == '" + id + "')].status").value(hasItem("Paused")))
                .andExpect(jsonPath("$.options.checklists[*].value").value(not(hasItem(checklist))));
        putAs("/inspection-schedules/" + id, manager, "{\"status\":\"Active\"}").andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CHECKLIST_NOT_PUBLISHED"));
        stay.postJson("/inspection-checklists/" + checklist + "/archive", admin, "{}").andExpect(status().isConflict());
    }

    /** TC-MNT-007 (permission): schedules are the Block Manager's, in their Block; runs need Staff. */
    @Test
    void permissions() throws Exception {
        getAs("/inspection-schedules?block=A", bearer(mvc, STAFF_A)).andExpect(status().isForbidden());
        getAs("/inspection-schedules?block=A", bearer(mvc, MANAGER_B)).andExpect(status().isForbidden());
        putAs("/inspection-schedules/999999", bearer(mvc, MANAGER_A), "{\"status\":\"Paused\"}")
                .andExpect(status().isNotFound());
        getAs("/inspection-runs/current", bearer(mvc, StayFlow.student(2))).andExpect(status().isForbidden());
    }
}

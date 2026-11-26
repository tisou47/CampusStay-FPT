package vn.fpt.campusstay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
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

import vn.fpt.campusstay.service.maintenance.InspectionScheduleService;

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

    private ResultActions patchAs(String path, String auth, String body) throws Exception {
        return mvc.perform(patch(path).header(HttpHeaders.AUTHORIZATION, auth).contentType(MediaType.APPLICATION_JSON)
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
     * TC-MNT-005: a schedule starts its first run at once and notifies residents; Staff record the Rooms with their own
     * checks (people, furniture), a failed item creates a Maintenance Request with the severity's priority (a failed
     * furniture item one that names it, which cannot change); each request goes to the Staff member who inspected the
     * Room, not to the routing rule; the run is submitted; the job starts the next.
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
        getAs("/notifications", staff)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].link").value("/staff/inspections"));
        String otherStaff = bearer(mvc, STAFF_A);
        getAs("/inspection-runs?block=A", otherStaff)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[?(@.id == '" + run + "')]", hasSize(0)));
        // Another Staff of the Block reads it (a Room's reports link to it), read only; changes stay the inspector's.
        getAs("/inspection-runs/" + run + "/rooms?pageSize=100", otherStaff)
                .andExpect(status().isOk());
        putAs("/inspection-runs/" + run + "/rooms/A-401", otherStaff, "{\"results\":[]}")
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("INSPECTION_NOT_ASSIGNED"));
        stay.postJson("/inspection-runs/" + run + "/submit", otherStaff, "{}")
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("INSPECTION_NOT_ASSIGNED"));
        List<String> itemIds = JsonPath.read(current, "$.run.checklist.items[*].id");
        String rooms = getAs("/inspection-runs/" + run + "/rooms?pageSize=100", staff).andExpect(status().isOk())
                .andExpect(jsonPath("$.items[?(@.room == 'A-401')].status").value(hasItem("To do")))
                .andExpect(jsonPath("$.items[?(@.room == 'A-401')].checks[0].kind").value(hasItem("people")))
                .andExpect(jsonPath("$.items[?(@.room == 'A-401')].checks[0].expected").value(hasItem(org.hamcrest.Matchers.greaterThanOrEqualTo(0))))
                .andReturn().getResponse().getContentAsString();
        List<String> checks401 = JsonPath.read(rooms, "$.items[?(@.room == 'A-401')].checks[*].id");
        assertThat(checks401).contains("people").anyMatch(c -> c.startsWith("furniture-"));

        StringBuilder results = new StringBuilder();
        for (int i = 0; i < itemIds.size(); i++) {
            results.append(i == 0 ? "" : ",").append("{\"itemId\":\"").append(itemIds.get(i)).append("\",\"result\":\"")
                    .append(i == 0 ? "Fail\",\"note\":\"No beep when tested\"}" : "Pass\"}");
        }
        for (String check : checks401) {
            results.append(",{\"itemId\":\"").append(check).append("\",\"result\":\"Pass\"}");
        }
        String saved = putAs("/inspection-runs/" + run + "/rooms/A-401", staff, "{\"results\":[" + results + "]}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.createdRequests", hasSize(1)))
                .andReturn().getResponse().getContentAsString();
        String request = JsonPath.read(saved, "$.createdRequests[0]");
        Map<String, Object> mr = jdbc.sql("SELECT priority, urgency, source, category, description, status, assignee_id FROM mnt_request WHERE code = :c")
                .param("c", request).query().singleRow();
        assertThat(mr).containsEntry("priority", "HIGH").containsEntry("urgency", "URGENT")
                .containsEntry("source", "INSPECTION").containsEntry("category", "ELECTRICAL")
                .containsEntry("description", "No beep when tested").containsEntry("status", "ASSIGNED")
                .containsEntry("assignee_id", stay.userId(STAFF_A2));
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

        roomChecks(run, staff, itemIds, rooms);

        getAs("/inspection-runs/" + run + "/rooms", bearer(mvc, TestAuth.STAFF_B2)).andExpect(status().isForbidden());
        // Rooms are left unfinished: sending needs the inspector's confirmation (BE-OPS-16).
        stay.postJson("/inspection-runs/" + run + "/submit", staff, "{}").andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("SUBMIT_NOT_CONFIRMED"));
        stay.postJson("/inspection-runs/" + run + "/submit", staff, "{\"confirmed\":true}").andExpect(status().isNoContent());
        stay.postJson("/inspection-runs/" + run + "/submit", staff, "{}").andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("RUN_SUBMITTED"));
        getAs("/inspection-schedules?block=A", manager)
                .andExpect(jsonPath("$.runs[0].status").value("Completed"))
                .andExpect(jsonPath("$.items[?(@.id == '" + id + "')].latestRunSubmitted").value(hasItem(true)));

        // The job starts the next run once its day comes.
        jdbc.sql("UPDATE mnt_inspection_schedule SET next_run_at = now() - interval '1 minute' WHERE id = :id")
                .param("id", Long.parseLong(id)).update();
        assertThat(schedules.startDue()).isEqualTo(1);
        getAs("/inspection-runs/current?block=A", staff).andExpect(jsonPath("$.run.id").value(startsWith("INS-")))
                .andExpect(jsonPath("$.run.inspected").value(0));

        // Manager marks the schedule Completed once finished.
        putAs("/inspection-schedules/" + id, manager, "{\"status\":\"Completed\"}")
                .andExpect(status().isNoContent());
        getAs("/inspection-schedules?block=A", manager)
                .andExpect(jsonPath("$.items[?(@.id == '" + id + "')].status").value(hasItem("Completed")));
    }

    /**
     * TC-MNT-010: Staff see every run assigned to them (not only the first), open one by its code, and add photos of a
     * furniture item and of the meters like a student's check-in inventory; Managers list every Block's schedules and
     * runs, each with its Block, without the editor options.
     */
    @Test
    void staffListTheirRunsWithPhotos() throws Exception {
        String manager = bearer(mvc, MANAGER_A);
        long a2 = stay.userId(STAFF_A2);
        String body = """
                {"block":"A","name":"%s","checklistId":"CL-ROOM","scope":"%s","repeat":"WEEKLY",
                 "assignee":"%d","dueWithinDays":3,"createRequests":true,"notifyResidents":false}""";
        stay.postJson("/inspection-schedules", manager, body.formatted("Floor 2 check", "FLOOR_2", a2)).andExpect(status().isOk());
        stay.postJson("/inspection-schedules", manager, body.formatted("Floor 3 check", "FLOOR_3", a2)).andExpect(status().isOk());

        String staff = bearer(mvc, STAFF_A2);
        String list = getAs("/inspection-runs?block=A", staff).andExpect(status().isOk())
                .andExpect(jsonPath("$.items[?(@.scheduleName == 'Floor 2 check')].status").value(hasItem("Open")))
                .andExpect(jsonPath("$.items[?(@.scheduleName == 'Floor 3 check')].mine").value(hasItem(true)))
                .andExpect(jsonPath("$.items[?(@.scheduleName == 'Floor 3 check')].block").value(hasItem("A")))
                .andReturn().getResponse().getContentAsString();
        List<String> floor3 = JsonPath.read(list, "$.items[?(@.scheduleName == 'Floor 3 check')].id");
        String run = floor3.getFirst();
        getAs("/inspection-runs/" + run, staff).andExpect(status().isOk())
                .andExpect(jsonPath("$.run.id").value(run)).andExpect(jsonPath("$.run.scope").value("Floor 3"));

        String rooms = getAs("/inspection-runs/" + run + "/rooms?pageSize=100", staff).andReturn().getResponse()
                .getContentAsString();
        String room = JsonPath.read(rooms, "$.items[0].room");
        List<String> furniture = JsonPath.read(rooms, "$.items[0].checks[?(@.kind == 'furniture')].id");
        org.springframework.mock.web.MockMultipartFile photo = new org.springframework.mock.web.MockMultipartFile("photo",
                "item.png", "image/png", new byte[] { (byte) 0x89, 'P', 'N', 'G', 13, 10, 26, 10, 0, 0, 0, 13 });
        String added = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .multipart("/inspection-runs/" + run + "/rooms/" + room + "/photos").file(photo)
                        .param("itemId", furniture.getFirst()).header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(status().isOk()).andExpect(jsonPath("$.itemId").value(furniture.getFirst()))
                .andReturn().getResponse().getContentAsString();
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .multipart("/inspection-runs/" + run + "/rooms/" + room + "/photos").file(photo)
                        .header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(status().isOk()).andExpect(jsonPath("$.itemId").value((Object) null));
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .multipart("/inspection-runs/" + run + "/rooms/" + room + "/photos").file(photo)
                        .param("itemId", "furniture-999999").header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.details.fields.itemId").exists());
        getAs("/inspection-runs/" + run + "/rooms?pageSize=100", staff)
                .andExpect(jsonPath("$.items[0].photos", hasSize(2)));
        String photoId = JsonPath.read(added, "$.id");
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .delete("/inspection-runs/" + run + "/rooms/" + room + "/photos/" + photoId)
                        .header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(status().isNoContent());
        getAs("/inspection-runs/" + run + "/rooms?pageSize=100", staff)
                .andExpect(jsonPath("$.items[0].photos", hasSize(1)));

        getAs("/inspection-schedules?block=all", manager).andExpect(status().isOk())
                .andExpect(jsonPath("$.options").value((Object) null))
                .andExpect(jsonPath("$.blocks").value(hasItem("A")))
                .andExpect(jsonPath("$.items[?(@.name == 'Floor 3 check')].block").value(hasItem("A")))
                .andExpect(jsonPath("$.runs[?(@.id == '" + run + "')].scheduleName").value(hasItem("Floor 3 check")));
        getAs("/inspection-runs?block=A", bearer(mvc, StayFlow.student(2))).andExpect(status().isForbidden());

        // The other tests of this class read the first open run of staff.a2: these runs go.
        String mine = "(SELECT id FROM mnt_inspection_schedule WHERE name IN ('Floor 2 check', 'Floor 3 check'))";
        jdbc.sql("DELETE FROM mnt_inspection_run WHERE schedule_id IN " + mine).update();
        jdbc.sql("DELETE FROM mnt_inspection_schedule WHERE id IN " + mine).update();
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

    /** TC-MNT-007 (permission): schedules are the Managers', for every Block (ADR-19); runs need Staff. */
    @Test
    void permissions() throws Exception {
        getAs("/inspection-schedules?block=A", bearer(mvc, STAFF_A)).andExpect(status().isForbidden());
        getAs("/inspection-schedules?block=A", bearer(mvc, MANAGER_B)).andExpect(status().isOk());
        putAs("/inspection-schedules/999999", bearer(mvc, MANAGER_A), "{\"status\":\"Paused\"}")
                .andExpect(status().isNotFound());
        getAs("/inspection-runs/current", bearer(mvc, StayFlow.student(2))).andExpect(status().isForbidden());
    }

    /**
     * Thematic runs (non-PRE_ARRIVAL) complete as soon as checklist items are answered (A-404), while explicit room
     * checks (people + furniture) can still be submitted (A-405): a failed furniture item creates a Furniture
     * Maintenance Request naming the item, and the item's history keeps the repair.
     */
    private void roomChecks(String run, String staff, List<String> itemIds, String rooms) throws Exception {
        StringBuilder items = new StringBuilder();
        for (int i = 0; i < itemIds.size(); i++) {
            items.append(i == 0 ? "" : ",").append("{\"itemId\":\"").append(itemIds.get(i)).append("\",\"result\":\"Pass\"}");
        }
        // A Worn ("partly damaged") item opens a repair too (user decision 27/11/2026); the item still passes.
        List<String> checks404 = JsonPath.read(rooms, "$.items[?(@.room == 'A-404')].checks[*].id");
        String worn = checks404.stream().filter(c -> c.startsWith("furniture-")).findFirst().orElseThrow();
        StringBuilder all404 = new StringBuilder(items);
        for (String check : checks404) {
            all404.append(",{\"itemId\":\"").append(check).append(check.equals(worn)
                    ? "\",\"condition\":\"Worn\",\"note\":\"Scratched\"}" : "\",\"result\":\"Pass\"}");
        }
        String wornSaved = putAs("/inspection-runs/" + run + "/rooms/A-404", staff, "{\"results\":[" + all404 + "]}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.createdRequests", hasSize(1)))
                .andReturn().getResponse().getContentAsString();
        String wornRequest = JsonPath.read(wornSaved, "$.createdRequests[0]");
        assertThat(jdbc.sql("SELECT furniture_item_id::text FROM mnt_request WHERE code = :c").param("c", wornRequest)
                .query(String.class).single()).isEqualTo(worn.substring("furniture-".length()));
        getAs("/inspection-runs/" + run + "/rooms?pageSize=100", staff)
                .andExpect(jsonPath("$.items[?(@.room == 'A-404')].status").value(hasItem("Done")));

        List<String> checks = JsonPath.read(rooms, "$.items[?(@.room == 'A-405')].checks[*].id");
        String furniture = checks.stream().filter(c -> c.startsWith("furniture-")).findFirst().orElseThrow();
        StringBuilder own = new StringBuilder();
        for (String check : checks) {
            own.append(own.isEmpty() ? "" : ",").append("{\"itemId\":\"").append(check).append("\",\"result\":\"")
                    .append(check.equals(furniture) ? "Fail\",\"note\":\"Door hinge broken\"}" : "Pass\"}");
        }
        String saved = putAs("/inspection-runs/" + run + "/rooms/A-405", staff, "{\"results\":[" + own + "]}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.createdRequests", hasSize(1)))
                .andReturn().getResponse().getContentAsString();
        String request = JsonPath.read(saved, "$.createdRequests[0]");
        Map<String, Object> mr = jdbc.sql("SELECT category, furniture_item_id::text AS item, description FROM mnt_request WHERE code = :c")
                .param("c", request).query().singleRow();
        assertThat(mr).containsEntry("category", "FURNITURE").containsEntry("item", furniture.substring("furniture-".length()))
                .containsEntry("description", "Door hinge broken");
        getAs("/maintenance-requests/" + request, bearer(mvc, MANAGER_A))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.inspectionFinding.condition").value("Damaged"))
                .andExpect(jsonPath("$.inspectionFinding.note").value("Door hinge broken"))
                .andExpect(jsonPath("$.inspectionFinding.runId").value(run))
                .andExpect(jsonPath("$.status").value("Assigned"))
                .andExpect(jsonPath("$.assignee.id").value(String.valueOf(stay.userId(STAFF_A2))))
                .andExpect(jsonPath("$.furnitureItemFixed").value(true))
                .andExpect(jsonPath("$.events[*].text", hasItem("Assigned to Vo Thanh Tung (inspector)")));
        patchAs("/maintenance-requests/" + request, bearer(mvc, MANAGER_A), "{\"furnitureItemId\":null}")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("FURNITURE_ITEM_FIXED"));
        getAs("/inspection-runs/" + run + "/rooms?pageSize=100", staff)
                .andExpect(jsonPath("$.items[?(@.room == 'A-405')].status").value(hasItem("In progress")));
        putAs("/inspection-runs/" + run + "/rooms/A-405", staff, "{\"results\":[" + items + "]}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.createdRequests", hasSize(0)));
        getAs("/inspection-runs/" + run + "/rooms?pageSize=100", staff)
                .andExpect(jsonPath("$.items[?(@.room == 'A-405')].status").value(hasItem("Done")));
        getAs("/furniture/" + furniture.substring("furniture-".length()), staff)
                .andExpect(jsonPath("$.history[?(@.kind == 'Repair')].from").value(hasItem(request)));
        getAs("/maintenance-requests?block=A", staff)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[?(@.id == '" + request + "')].room").value(hasItem("A-405")));
        getAs("/inspection-runs/" + run + "/rooms?pageSize=100", staff)
                .andExpect(jsonPath("$.items[?(@.room == 'A-405')].createdRequests[*]").value(hasItem(request)));
    }

    /**
     * TC-MNT-018: every finished Room of an inspection is a report kept with its Room (user decision 25/11/2026): the
     * report summary lists it as soon as Staff save it, with the inspection and the inspector, filtered by kind
     * (report 1 pre-arrival or other inspections) or by Room; pending Rooms are not reports, and
     * another Block's Staff cannot read them.
     */
    @Test
    void inspectionReportsAreKeptWithTheRoom() throws Exception {
        long run = jdbc.sql("""
                INSERT INTO mnt_inspection_run (building_id, checklist_id, run_date, due_at, inspector_id, status,
                                                submitted_at)
                SELECT b.id, (SELECT id FROM mnt_checklist WHERE status = 'PUBLISHED' ORDER BY id LIMIT 1), current_date,
                       now() + interval '1 day', u.id, 'SUBMITTED', now()
                FROM inv_building b, auth_user u WHERE b.code = 'A' AND u.email = :staff
                RETURNING id
                """).param("staff", STAFF_A).query(Long.class).single();
        jdbc.sql("""
                INSERT INTO mnt_inspection_room (run_id, room_id, status, inspected_at)
                SELECT :run, id, CASE code WHEN 'A-509' THEN 'INSPECTED' ELSE 'PENDING' END,
                       CASE code WHEN 'A-509' THEN now() END
                FROM inv_room WHERE code IN ('A-509', 'A-510')
                """).param("run", run).update();
        String staff = bearer(mvc, STAFF_A);
        String code = "INS-" + run;

        getAs("/inspection-reports?block=A&pageSize=100", staff).andExpect(status().isOk())
                .andExpect(jsonPath("$.items[?(@.runId == '" + code + "')].room").value(contains("A-509")))
                .andExpect(jsonPath("$.items[?(@.runId == '" + code + "')].submitted").value(hasItem(true)))
                .andExpect(jsonPath("$.items[?(@.runId == '" + code + "')].status").value(hasItem("Inspected")))
                .andExpect(jsonPath("$.items[?(@.runId == '" + code + "')].inspector").value(hasItem("Nguyen Van Binh")));
        getAs("/inspection-reports?room=A-509", staff)
                .andExpect(jsonPath("$.items[*].room").value(org.hamcrest.Matchers.everyItem(org.hamcrest.Matchers.is("A-509"))))
                .andExpect(jsonPath("$.items[*].runId").value(hasItem(code)));
        getAs("/inspection-reports?room=A-510", staff).andExpect(jsonPath("$.items[*].runId").value(not(hasItem(code))));
        getAs("/inspection-reports?q=" + code, bearer(mvc, MANAGER_A)).andExpect(jsonPath("$.total").value(1));
        getAs("/inspection-reports?kind=Periodic&q=" + code, staff).andExpect(jsonPath("$.total").value(1));
        String family = jdbc.sql("SELECT c.family_key FROM mnt_checklist c JOIN mnt_inspection_run r ON r.checklist_id = c.id WHERE r.id = :id")
                .param("id", run).query(String.class).single();
        getAs("/inspection-reports?checklist=" + family + "&q=" + code, staff).andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.checklists[?(@.key == '" + family + "')].reports").value(hasItem(1)));
        getAs("/inspection-reports?checklist=NO_SUCH&q=" + code, staff).andExpect(jsonPath("$.total").value(0));
        getAs("/inspection-reports?kind=Pre-arrival&q=" + code, staff).andExpect(jsonPath("$.total").value(0));
        // A Room is a report as soon as Staff save it, before the run is sent to the Managers.
        jdbc.sql("UPDATE mnt_inspection_run SET status = 'IN_PROGRESS', submitted_at = NULL WHERE id = :id").param("id", run)
                .update();
        getAs("/inspection-reports?room=A-509", staff)
                .andExpect(jsonPath("$.items[?(@.runId == '" + code + "')].submitted").value(hasItem(false)));
        getAs("/inspection-reports?block=A", bearer(mvc, TestAuth.STAFF_B2)).andExpect(status().isForbidden());
        getAs("/inspection-reports?room=A-509", bearer(mvc, TestAuth.STAFF_B2)).andExpect(status().isNotFound());
    }

    /**
     * TC-MNT-019: pausing a schedule holds its open run (user decision 26/11/2026): Staff read it as Paused but cannot
     * save a Room, and the inspector hears of the pause and of the resume; turning on "notify residents" while the
     * run is open tells the residents of its Rooms not inspected yet.
     */
    @Test
    void pausingHoldsTheOpenRun() throws Exception {
        stay.livesIn(3, "A-301", "A", true);
        String manager = bearer(mvc, MANAGER_A);
        long a2 = stay.userId(STAFF_A2);
        String id = read(stay.postJson("/inspection-schedules", manager, """
                {"block":"A","name":"Floor 3 hold","checklistId":"CL-ROOM","scope":"FLOOR_3","repeat":"WEEKLY",
                 "assignee":"%d","dueWithinDays":3,"createRequests":true,"notifyResidents":false}""".formatted(a2))
                .andExpect(status().isOk()), "$.id");
        String staff = bearer(mvc, STAFF_A2);
        String list = getAs("/inspection-runs?block=A", staff).andReturn().getResponse().getContentAsString();
        String run = ((List<String>) JsonPath.read(list, "$.items[?(@.scheduleName == 'Floor 3 hold')].id")).getFirst();
        String countSql = """
                SELECT count(*) FROM ntf_notification n JOIN auth_user u ON u.id = n.user_id
                WHERE u.email = :e AND n.event_key = :k""";
        java.util.function.BiFunction<String, String, Long> sent = (email, key) -> jdbc.sql(countSql)
                .param("e", email).param("k", key).query(Long.class).single();
        assertThat(sent.apply(StayFlow.student(3), "INSPECTION_SCHEDULED")).isZero();

        putAs("/inspection-schedules/" + id, manager, "{\"notifyResidents\":true}").andExpect(status().isNoContent());
        assertThat(sent.apply(StayFlow.student(3), "INSPECTION_SCHEDULED")).isEqualTo(1);

        putAs("/inspection-schedules/" + id, manager, "{\"status\":\"Paused\"}").andExpect(status().isNoContent());
        assertThat(sent.apply(STAFF_A2, "INSPECTION_PAUSED")).isEqualTo(1);
        getAs("/inspection-runs/" + run, staff).andExpect(jsonPath("$.run.status").value("Paused"));
        putAs("/inspection-runs/" + run + "/rooms/A-301", staff, "{\"results\":[]}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("INSPECTION_PAUSED"));
        stay.postJson("/inspection-runs/" + run + "/submit", staff, "{}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("INSPECTION_PAUSED"));

        putAs("/inspection-schedules/" + id, manager, "{\"status\":\"Active\"}").andExpect(status().isNoContent());
        assertThat(sent.apply(STAFF_A2, "INSPECTION_RESUMED")).isEqualTo(1);
        getAs("/inspection-runs/" + run, staff).andExpect(jsonPath("$.run.status").value("Open"));

        // The other tests of this class read the first open run of staff.a2: this run goes.
        long scheduleId = Long.parseLong(id.replaceAll("[^0-9]", ""));
        jdbc.sql("DELETE FROM mnt_inspection_run WHERE schedule_id = :id").param("id", scheduleId).update();
        jdbc.sql("DELETE FROM mnt_inspection_schedule WHERE id = :id").param("id", scheduleId).update();
    }

    /**
     * TC-MNT-020: a Manager starts a run of an active schedule now (user decision 26/11/2026): refused while one is
     * open or the schedule is paused, and for Staff; the schedule keeps its next run time.
     */
    @Test
    void managersStartARunNow() throws Exception {
        String manager = bearer(mvc, MANAGER_A);
        String id = read(stay.postJson("/inspection-schedules", manager, """
                {"block":"A","name":"Floor 3 now","checklistId":"CL-ROOM","scope":"FLOOR_3","repeat":"MONTHLY",
                 "assignee":"%d","dueWithinDays":3,"createRequests":true,"notifyResidents":false}"""
                .formatted(stay.userId(STAFF_A2))).andExpect(status().isOk()), "$.id");
        long scheduleId = Long.parseLong(id.replaceAll("[^0-9]", ""));
        String nextSql = "SELECT next_run_at::text FROM mnt_inspection_schedule WHERE id = :id";
        String next = jdbc.sql(nextSql).param("id", scheduleId).query(String.class).single();

        stay.postJson("/inspection-schedules/" + id + "/run", manager, "{}")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("RUN_IN_PROGRESS"));
        jdbc.sql("UPDATE mnt_inspection_run SET status = 'SUBMITTED' WHERE schedule_id = :id").param("id", scheduleId).update();
        stay.postJson("/inspection-schedules/" + id + "/run", bearer(mvc, STAFF_A), "{}").andExpect(status().isForbidden());
        String started = stay.postJson("/inspection-schedules/" + id + "/run", manager, "{}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.runId", startsWith("INS-")))
                .andReturn().getResponse().getContentAsString();
        assertThat((Integer) JsonPath.read(started, "$.rooms")).isPositive();
        assertThat(jdbc.sql(nextSql).param("id", scheduleId).query(String.class).single()).isEqualTo(next);
        assertThat(jdbc.sql("SELECT count(*) FROM mnt_inspection_run WHERE schedule_id = :id").param("id", scheduleId)
                .query(Long.class).single()).isEqualTo(2);

        jdbc.sql("UPDATE mnt_inspection_run SET status = 'SUBMITTED' WHERE schedule_id = :id").param("id", scheduleId).update();
        putAs("/inspection-schedules/" + id, manager, "{\"status\":\"Paused\"}").andExpect(status().isNoContent());
        stay.postJson("/inspection-schedules/" + id + "/run", manager, "{}")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("SCHEDULE_NOT_ACTIVE"));

        jdbc.sql("DELETE FROM mnt_inspection_run WHERE schedule_id = :id").param("id", scheduleId).update();
        jdbc.sql("DELETE FROM mnt_inspection_schedule WHERE id = :id").param("id", scheduleId).update();
    }
}

package vn.fpt.campusstay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.MANAGER_B;
import static vn.fpt.campusstay.TestAuth.STAFF_A;
import static vn.fpt.campusstay.TestAuth.bearer;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

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
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;

import vn.fpt.campusstay.config.TimeConfig;

/** Maintenance Requests from the student's report to the confirmed fix (TC-MNT-001…003). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class MaintenanceIT {

    private static final byte[] PNG = { (byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0x0D, 'I', 'H',
            'D', 'R' };
    private static final String STAFF_A2 = "staff.a2@campusstay.test";

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    long termId;

    @BeforeEach
    void openTerm() {
        termId = new ApplyFlow(mvc, jdbc).openTerm();
    }

    private static String student(int n) {
        return "se19%04d@student.campusstay.test".formatted(n);
    }

    /** The student holds the Bed and has checked in (the desk is tested in DeskIT). */
    private void livesIn(int n, String room, String bed) {
        jdbc.sql("""
                INSERT INTO asg_allocation (term_id, student_id, bed_id, source, allocated_at, checked_in_at, resident_at)
                SELECT :term, u.id, b.id, 'MANUAL', now(), now(), now()
                FROM auth_user u, inv_bed b JOIN inv_room r ON r.id = b.room_id
                WHERE u.email = :email AND r.code = :room AND b.label = :bed
                """).param("term", termId).param("email", student(n)).param("room", room).param("bed", bed).update();
    }

    private long userId(String email) {
        return jdbc.sql("SELECT id FROM auth_user WHERE email = :e").param("e", email).query(Long.class).single();
    }

    private MockMultipartHttpServletRequestBuilder report(String auth, String category, String urgency, int photos) {
        MockMultipartHttpServletRequestBuilder request = multipart("/maintenance-requests");
        request.header(HttpHeaders.AUTHORIZATION, auth);
        request.param("title", "Shower leaks").param("description", "Water runs under the door when I shower.")
                .param("location", "Bathroom").param("urgency", urgency).param("staffMayEnter", "true");
        if (category != null) {
            request.param("category", category);
        }
        for (int i = 0; i < photos; i++) {
            request.file(new MockMultipartFile("photos", "leak-" + i + ".png", "image/png", PNG));
        }
        return request;
    }

    private String reported(String auth, String urgency) throws Exception {
        return JsonPath.read(mvc.perform(report(auth, "Plumbing", urgency, 1)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(), "$.id");
    }

    private ResultActions getAs(String path, String auth) throws Exception {
        return mvc.perform(get(path).header(HttpHeaders.AUTHORIZATION, auth));
    }

    private ResultActions patchAs(String path, String auth, String body) throws Exception {
        return mvc.perform(patch(path).header(HttpHeaders.AUTHORIZATION, auth).contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private ResultActions postJson(String path, String auth, String body) throws Exception {
        return mvc.perform(post(path).header(HttpHeaders.AUTHORIZATION, auth).contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    /** TC-MNT-001: a checked-in student reports with photos and follows the request; the form is validated. */
    @Test
    void studentReportsAndFollows() throws Exception {
        String auth = bearer(mvc, student(16));
        mvc.perform(report(auth, "Plumbing", "Normal", 0))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("NOT_CHECKED_IN"));
        livesIn(16, "A-302", "A");

        getAs("/maintenance-requests/options?for=student", auth)
                .andExpect(jsonPath("$.categories", hasItem("Electrical")))
                .andExpect(jsonPath("$.locations", hasItem("Bathroom")))
                .andExpect(jsonPath("$.priorities").isEmpty())
                .andExpect(jsonPath("$.staff").isEmpty());
        mvc.perform(multipart("/maintenance-requests").header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.title").isString())
                .andExpect(jsonPath("$.details.fields.description").isString())
                .andExpect(jsonPath("$.details.fields.category").isString())
                .andExpect(jsonPath("$.details.fields.location").isString());
        mvc.perform(report(auth, "Plumbing", "Normal", 6))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.photos").value("Attach at most 5 photos."));
        MockMultipartHttpServletRequestBuilder text = report(auth, "Plumbing", "Normal", 0);
        text.file(new MockMultipartFile("photos", "note.txt", "image/png", "not a photo".getBytes(StandardCharsets.UTF_8)));
        mvc.perform(text).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("FILE_TYPE_NOT_ALLOWED"));

        String id = JsonPath.read(mvc.perform(report(auth, "plumbing", "Normal", 2)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(), "$.id");
        assertThat(id).startsWith("MR-");
        getAs("/maintenance-requests/" + id, auth)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("Submitted"))
                .andExpect(jsonPath("$.room").value("A-302"))
                .andExpect(jsonPath("$.category").value("Plumbing"))
                .andExpect(jsonPath("$.location").value("Bathroom"))
                .andExpect(jsonPath("$.assignee").value((Object) null))
                .andExpect(jsonPath("$.events[0].message").value("Request submitted"));
        getAs("/students/me/requests", auth)
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].id").value(id))
                .andExpect(jsonPath("$.items[0].status").value("Submitted"))
                .andExpect(jsonPath("$.counts.maintenance").value(1))
                .andExpect(jsonPath("$.counts.roomChanges").value(0))
                .andExpect(jsonPath("$.room").value("A-302"));
        getAs("/students/me/requests?kind=room-changes", auth).andExpect(jsonPath("$.total").value(0));
        getAs("/maintenance-requests/" + id, bearer(mvc, student(17))).andExpect(status().isNotFound());
        getAs("/maintenance-requests", auth).andExpect(status().isForbidden());
    }

    /**
     * TC-MNT-002: Staff of the Block assign, plan the visit, post updates and resolve; the student is notified,
     * reopens once and confirms the fix. Photos open through signed links.
     */
    @Test
    void staffWorkTheRequest() throws Exception {
        livesIn(18, "A-303", "A");
        String auth = bearer(mvc, student(18));
        String id = reported(auth, "Urgent");
        String staff = bearer(mvc, STAFF_A);
        long a2 = userId(STAFF_A2);

        getAs("/maintenance-requests?status=open&assigneeId=none&priority=High", staff)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[*].id", hasItem(id)))
                .andExpect(jsonPath("$.summary.urgentUnassigned").isNumber());
        getAs("/maintenance-requests/options?for=staff", staff)
                .andExpect(jsonPath("$.priorities[0]").value("High"))
                .andExpect(jsonPath("$.staff[0].id").value(String.valueOf(a2)))
                .andExpect(jsonPath("$.staff[0].skills[0]").value("Maintenance"));
        String detail = getAs("/maintenance-requests/" + id, staff)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reporter.role").value("Student"))
                .andExpect(jsonPath("$.urgency").value("Urgent"))
                .andExpect(jsonPath("$.priority").value("High"))
                .andExpect(jsonPath("$.staffMayEnter").value(true))
                .andExpect(jsonPath("$.bed").value("A"))
                .andExpect(jsonPath("$.suggestedAssigneeId").value(String.valueOf(a2)))
                .andExpect(jsonPath("$.roomSummary.capacity").value(2))
                .andExpect(jsonPath("$.roomSummary.residents").value(1))
                .andExpect(jsonPath("$.photos[0].name").value("leak-0.png"))
                .andExpect(jsonPath("$.photos[0].url", startsWith("http://localhost/files/")))
                .andReturn().getResponse().getContentAsString();
        String photo = ((String) JsonPath.read(detail, "$.photos[0].url")).substring("http://localhost".length());
        mvc.perform(get(photo)).andExpect(status().isOk()).andExpect(content().contentType("image/png"))
                .andExpect(content().bytes(PNG));
        mvc.perform(get(photo.replaceAll("sig=[^&]+", "sig=forged"))).andExpect(status().isNotFound());
        getAs("/maintenance-requests/" + id, bearer(mvc, TestAuth.STAFF_B2))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("BLOCK_OUT_OF_SCOPE"));

        String path = "/maintenance-requests/" + id;
        patchAs(path, staff, "{\"assigneeId\":\"%d\"}".formatted(userId(MANAGER_B)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.assigneeId").isString());
        patchAs(path, staff, "{\"visitWindow\":\"tomorrow afternoon\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.visitWindow").isString());
        String day = LocalDate.now(TimeConfig.CAMPUS_ZONE).plusDays(1).format(DateTimeFormatter.ofPattern("dd/MM/yyyy"));
        patchAs(path, staff, "{\"priority\":\"Medium\",\"assigneeId\":\"%d\",\"visitWindow\":\"%s 14:00 - 16:00\"}"
                .formatted(a2, day)).andExpect(status().isNoContent());
        getAs(path, staff)
                .andExpect(jsonPath("$.status").value("Assigned"))
                .andExpect(jsonPath("$.priority").value("Medium"))
                .andExpect(jsonPath("$.assignee.id").value(String.valueOf(a2)))
                .andExpect(jsonPath("$.assignee.name").value("Vo Thanh Tung"))
                .andExpect(jsonPath("$.visitWindow").value(day + " 14:00 – 16:00"))
                .andExpect(jsonPath("$.suggestedAssigneeId").value((Object) null));
        getAs("/notifications", auth).andExpect(jsonPath("$.items[0].title").value("Maintenance update"));

        postJson(path + "/updates", staff, "{\"message\":\"Order the valve first.\",\"internal\":true}")
                .andExpect(status().isNoContent());
        postJson(path + "/updates", staff, "{\"message\":\"We will replace the shower valve.\"}")
                .andExpect(status().isNoContent());
        getAs(path, auth)
                .andExpect(jsonPath("$.assignee").value("Vo Thanh Tung"))
                .andExpect(jsonPath("$.visitWindow").value(day + " 14:00 – 16:00"))
                .andExpect(jsonPath("$.events[*].message", hasItem("We will replace the shower valve.")))
                .andExpect(jsonPath("$.events[*].message", not(hasItem("Order the valve first."))));
        getAs(path, staff).andExpect(jsonPath("$.events[?(@.internal == true)].message",
                hasItem("Order the valve first.")));

        postJson(path + "/confirm", auth, "{\"fixed\":true}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("NOT_RESOLVED"));
        patchAs(path, staff, "{\"status\":\"In progress\"}").andExpect(status().isNoContent());
        patchAs(path, staff, "{\"status\":\"Resolved\"}").andExpect(status().isNoContent());
        postJson(path + "/confirm", auth, "{\"fixed\":false,\"comment\":\"Still leaking at night.\"}")
                .andExpect(status().isNoContent());
        getAs(path, auth).andExpect(jsonPath("$.status").value("Assigned"));
        patchAs(path, staff, "{\"status\":\"Resolved\"}").andExpect(status().isNoContent());
        postJson(path + "/confirm", auth, "{\"fixed\":true}").andExpect(status().isNoContent());
        getAs(path, auth).andExpect(jsonPath("$.status").value("Closed"));
        patchAs(path, staff, "{\"priority\":\"Low\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("REQUEST_CLOSED"));
        patchAs(path, auth, "{\"priority\":\"Low\"}").andExpect(status().isForbidden());
        assertThat(jdbc.sql("SELECT count(*) FROM shared_audit_log WHERE action = 'MAINTENANCE_UPDATED'")
                .query(Long.class).single()).isGreaterThanOrEqualTo(4);
    }

    /** TC-MNT-003: the queue is scoped: another Block's Staff neither see nor count the request; Managers do (ADR-19). */
    @Test
    void queueIsScoped() throws Exception {
        livesIn(19, "A-304", "A");
        String id = reported(bearer(mvc, student(19)), "Normal");
        String staffB = bearer(mvc, TestAuth.STAFF_B2);
        getAs("/maintenance-requests?status=open", staffB)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[*].id", not(hasItem(id))))
                .andExpect(jsonPath("$.items[*].room", everyItem(startsWith("B-"))));
        getAs("/maintenance-requests?status=open", bearer(mvc, MANAGER_B))
                .andExpect(jsonPath("$.items[*].id", hasItem(id)));
        getAs("/maintenance-requests?block=A", staffB)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("BLOCK_OUT_OF_SCOPE"));
        getAs("/maintenance-requests?q=" + id, bearer(mvc, STAFF_A))
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].room").value("A-304"))
                .andExpect(jsonPath("$.items[0].priority").value("Medium"))
                .andExpect(jsonPath("$.items[0].assignee").value((Object) null));
        getAs("/maintenance-requests?status=Waiting", bearer(mvc, STAFF_A))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.status").isString());
    }
}

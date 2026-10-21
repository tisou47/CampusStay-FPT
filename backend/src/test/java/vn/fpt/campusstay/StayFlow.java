package vn.fpt.campusstay;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.MANAGER_A;
import static vn.fpt.campusstay.TestAuth.STAFF_A;
import static vn.fpt.campusstay.TestAuth.bearer;

import java.util.ArrayList;
import java.util.List;

import com.jayway.jsonpath.JsonPath;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/** Helpers for tests during the stay: students who hold a Bed, through the real flow or a direct row. */
final class StayFlow {

    record Applied(String auth, String applicationId) {
    }

    private final MockMvc mvc;
    private final JdbcClient jdbc;
    private final ApplyFlow flow;
    private final long termId;

    StayFlow(MockMvc mvc, JdbcClient jdbc, ApplyFlow flow, long termId) {
        this.mvc = mvc;
        this.jdbc = jdbc;
        this.flow = flow;
        this.termId = termId;
    }

    long termId() {
        return termId;
    }

    static String student(int n) {
        return "se19%04d@student.campusstay.test".formatted(n);
    }

    /** A checked-in Bed without the assignment run (desk and assignment are tested elsewhere). */
    void livesIn(int n, String room, String bed, boolean checkedIn) {
        jdbc.sql("""
                INSERT INTO asg_allocation (term_id, student_id, bed_id, source, allocated_at, checked_in_at)
                SELECT :term, u.id, b.id, 'MANUAL', now(), CASE WHEN :in THEN now() END
                FROM auth_user u, inv_bed b JOIN inv_room r ON r.id = b.room_id
                WHERE u.email = :email AND r.code = :room AND b.label = :bed
                """).param("term", termId).param("in", checkedIn).param("email", student(n)).param("room", room)
                .param("bed", bed).update();
    }

    long userId(String email) {
        return jdbc.sql("SELECT id FROM auth_user WHERE email = :e").param("e", email).query(Long.class).single();
    }

    String roomOf(String auth) throws Exception {
        String json = mvc.perform(get("/students/me/allocation?termId=" + termId).header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(json, "$.allocation") == null ? null : JsonPath.read(json, "$.allocation.room");
    }

    ResultActions postJson(String path, String auth, String body) throws Exception {
        return mvc.perform(post(path).header(HttpHeaders.AUTHORIZATION, auth).contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    /**
     * Applies for the Room kind and pays the Deposit for each student, approves them, runs and commits Block A
     * after moving every conflict to the waitlist, and the Block Manager approves.
     */
    List<Applied> runRound1(String roomType, String roomClass, int... students) throws Exception {
        String staff = bearer(mvc, STAFF_A);
        List<Applied> applied = new ArrayList<>();
        List<String> ids = new ArrayList<>();
        for (int n : students) {
            String auth = bearer(mvc, student(n));
            ApplyFlow.Applied app = flow.apply(auth, roomType, roomClass, "{\"mode\":\"auto\"}");
            flow.pay(auth, app.depositInvoiceId());
            applied.add(new Applied(auth, app.id()));
            ids.add("\"" + app.id() + "\"");
        }
        postJson("/applications/bulk-review", staff, "{\"ids\":[" + String.join(",", ids) + "],\"decision\":\"Approved\"}")
                .andExpect(status().isOk());
        String run = JsonPath.read(postJson("/assignment-runs", staff, "{\"termId\":\"%d\"}".formatted(termId))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(), "$.id");
        String conflicts = mvc.perform(get("/assignment-runs/" + run + "/proposal?block=A&view=conflicts&pageSize=100")
                .header(HttpHeaders.AUTHORIZATION, staff)).andReturn().getResponse().getContentAsString();
        List<String> blocked = JsonPath.read(conflicts, "$.items[*].applicationId");
        for (String id : blocked) {
            postJson("/assignment-runs/" + run + "/conflicts/" + id + "/resolve", staff, "{\"waitlist\":true}")
                    .andExpect(status().isOk());
        }
        postJson("/assignment-runs/" + run + "/commit", staff, "{\"block\":\"A\"}").andExpect(status().isNoContent());
        postJson("/assignment-runs/" + run + "/approve", bearer(mvc, MANAGER_A), "{\"block\":\"A\"}")
                .andExpect(status().isOk());
        return applied;
    }
}

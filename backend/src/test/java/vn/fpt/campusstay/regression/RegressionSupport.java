package vn.fpt.campusstay.regression;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.List;

import com.jayway.jsonpath.JsonPath;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import vn.fpt.campusstay.TestAuth;

/**
 * Helpers for the review reproduction tests: the same steps as ApplyFlow / StayFlow (package-private in the parent
 * package), kept minimal.
 */
final class RegressionSupport {

    static final String TERM_CODE = "TT31";
    static final byte[] PNG = { (byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0x0D, 'I', 'H', 'D',
            'R' };

    record Applied(String auth, String id, String depositInvoiceId) {
    }

    final MockMvc mvc;
    final JdbcClient jdbc;
    final long termId;

    RegressionSupport(MockMvc mvc, JdbcClient jdbc) {
        this.mvc = mvc;
        this.jdbc = jdbc;
        jdbc.sql("""
                INSERT INTO cfg_term (code, name, status, stay_start, stay_end, registration_opens_at,
                                      registration_closes_at, results_published_at, roommate_hours, deposit_hours,
                                      balance_due_at, check_in_start, check_in_end, check_out_by, published_at)
                VALUES (:code, 'Test Term 2031', 'PUBLISHED', DATE '2031-01-06', DATE '2031-04-27',
                        now() - interval '1 day', now() + interval '30 days', now() + interval '40 days', 48, 48,
                        now() + interval '50 days', DATE '2031-01-02', DATE '2031-01-05', DATE '2031-04-28', now())
                ON CONFLICT (code) DO NOTHING
                """).param("code", TERM_CODE).update();
        termId = jdbc.sql("SELECT id FROM cfg_term WHERE code = :c").param("c", TERM_CODE).query(Long.class).single();
    }

    static String student(int n) {
        return "se19%04d@student.campusstay.test".formatted(n);
    }

    String bearer(String email) throws Exception {
        return TestAuth.bearer(mvc, email);
    }

    String manager() throws Exception {
        return bearer(TestAuth.MANAGER_A);
    }

    ResultActions postJson(String path, String auth, String body) throws Exception {
        return mvc.perform(post(path).header(HttpHeaders.AUTHORIZATION, auth).contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    ResultActions getAs(String path, String auth) throws Exception {
        return mvc.perform(get(path).header(HttpHeaders.AUTHORIZATION, auth));
    }

    static String body(ResultActions r) throws Exception {
        return r.andReturn().getResponse().getContentAsString();
    }

    long userId(String email) {
        return jdbc.sql("SELECT id FROM auth_user WHERE email = :e").param("e", email).query(Long.class).single();
    }

    /** A Bed held without the assignment run; {@code resident} = holding the door code (and desk check-in). */
    long livesIn(int n, String room, String bed, boolean resident) {
        return livesIn(n, room, bed, resident, resident);
    }

    long livesIn(int n, String room, String bed, boolean resident, boolean deskCheckIn) {
        return jdbc.sql("""
                INSERT INTO asg_allocation (term_id, student_id, bed_id, source, allocated_at, checked_in_at, resident_at,
                                            code_released_at)
                SELECT :term, u.id, b.id, 'MANUAL', now(), CASE WHEN :desk THEN now() END, CASE WHEN :in THEN now() END,
                       CASE WHEN :in THEN now() END
                FROM auth_user u, inv_bed b JOIN inv_room r ON r.id = b.room_id
                WHERE u.email = :email AND r.code = :room AND b.label = :bed
                RETURNING id
                """).param("term", termId).param("in", resident).param("desk", deskCheckIn).param("email", student(n))
                .param("room", room).param("bed", bed).query(Long.class).single();
    }

    String roomTypeId(String name) {
        return jdbc.sql("SELECT id::text FROM cfg_room_type WHERE name = :n").param("n", name).query(String.class)
                .single();
    }

    String roomClassId(String name) {
        return jdbc.sql("SELECT id::text FROM cfg_room_class WHERE name = :n").param("n", name).query(String.class)
                .single();
    }

    Applied apply(int n, String roomType, String roomClass) throws Exception {
        String auth = bearer(student(n));
        String json = body(postJson("/applications", auth, """
                {"roomTypeId":"%s","roomClassId":"%s","roommate":{"mode":"auto"},
                 "contact":{"phone":"0901234567","email":"me@example.com","emergencyName":"Nguyen Van A",
                            "relationship":"Mother","emergencyPhone":"0912345678"},
                 "consent":{"matching":true,"rules":true}}""".formatted(roomTypeId(roomType), roomClassId(roomClass)))
                .andExpect(status().isOk()));
        return new Applied(auth, JsonPath.read(json, "$.id"), JsonPath.read(json, "$.depositInvoiceId"));
    }

    ResultActions claim(String auth, String invoiceId) throws Exception {
        return postJson("/invoices/" + invoiceId + "/claim", auth, "{}");
    }

    ResultActions confirm(String invoiceId) throws Exception {
        mvc.perform(multipart("/payment-claims/" + invoiceId + "/receipt")
                .file(new MockMultipartFile("receipt", "transfer.png", "image/png", PNG))
                .header(HttpHeaders.AUTHORIZATION, manager()));
        return postJson("/payment-claims/confirm", manager(), "{\"invoiceIds\":[\"" + invoiceId + "\"]}");
    }

    void pay(String auth, String invoiceId) throws Exception {
        claim(auth, invoiceId).andExpect(status().isOk());
        confirm(invoiceId).andExpect(status().isOk());
    }

    /** Applies and pays the Deposit for each student, then a Manager approves them all. */
    List<Applied> approved(String roomType, String roomClass, int... students) throws Exception {
        List<Applied> out = new ArrayList<>();
        List<String> ids = new ArrayList<>();
        for (int n : students) {
            Applied a = apply(n, roomType, roomClass);
            pay(a.auth(), a.depositInvoiceId());
            out.add(a);
            ids.add("\"" + a.id() + "\"");
        }
        postJson("/applications/bulk-review", manager(),
                "{\"ids\":[" + String.join(",", ids) + "],\"decision\":\"Approved\"}").andExpect(status().isOk());
        return out;
    }

    String startRun() throws Exception {
        return JsonPath.read(body(postJson("/assignment-runs", manager(), "{\"termId\":\"%d\"}".formatted(termId))
                .andExpect(status().isOk())), "$.id");
    }

    String report(int n, String urgency) throws Exception {
        return JsonPath.read(body(mvc.perform(multipart("/maintenance-requests")
                .file(new MockMultipartFile("photos", "leak.png", "image/png", PNG))
                .param("title", "Sink is blocked").param("description", "The sink drains very slowly.")
                .param("location", "Bathroom").param("category", "Plumbing").param("urgency", urgency)
                .param("staffMayEnter", "true").header(HttpHeaders.AUTHORIZATION, bearer(student(n))))
                .andExpect(status().isOk())), "$.id");
    }

    long count(String sql, Object... params) {
        var spec = jdbc.sql(sql);
        for (int i = 0; i < params.length; i++) {
            spec = spec.param(i + 1, params[i]);
        }
        return spec.query(Long.class).single();
    }
}

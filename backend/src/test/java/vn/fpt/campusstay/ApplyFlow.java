package vn.fpt.campusstay;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;

import com.jayway.jsonpath.JsonPath;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/**
 * Helpers for the Application and payment integration tests: a published Term
 * whose registration is open now (so tests do not depend on the seed's dates),
 * submitting an Application and paying it: the student's "I have transferred"
 * confirmed by a Manager (ADR-22).
 */
final class ApplyFlow {

    static final String TERM_CODE = "TT31";
    static final String TERM_NAME = "Test Term 2031";
    /** The first bytes of a PNG file: enough for the upload checks (evidence, receipts). */
    static final byte[] PNG = { (byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0x0D, 'I', 'H',
            'D', 'R' };

    record Applied(String id, String depositInvoiceId) {
    }

    private final MockMvc mvc;
    private final JdbcClient jdbc;
    private String manager;

    ApplyFlow(MockMvc mvc, JdbcClient jdbc) {
        this.mvc = mvc;
        this.jdbc = jdbc;
    }

    /** Publishes the test Term once; registration opened yesterday and closes in 30 days. */
    long openTerm() {
        jdbc.sql("""
                INSERT INTO cfg_term (code, name, status, stay_start, stay_end, registration_opens_at,
                                      registration_closes_at, results_published_at, roommate_hours, deposit_hours,
                                      balance_due_at, check_in_start, check_in_end, check_out_by, published_at)
                VALUES (:code, :name, 'PUBLISHED', DATE '2031-01-06', DATE '2031-04-27', now() - interval '1 day',
                        now() + interval '30 days', now() + interval '40 days', 48, 48, now() + interval '50 days',
                        DATE '2031-01-02', DATE '2031-01-05', DATE '2031-04-28', now())
                ON CONFLICT (code) DO NOTHING
                """).param("code", TERM_CODE).param("name", TERM_NAME).update();
        return jdbc.sql("SELECT id FROM cfg_term WHERE code = :code").param("code", TERM_CODE).query(Long.class).single();
    }

    String roomTypeId(String name) {
        return jdbc.sql("SELECT id::text FROM cfg_room_type WHERE name = :name").param("name", name)
                .query(String.class).single();
    }

    String roomClassId(String name) {
        return jdbc.sql("SELECT id::text FROM cfg_room_class WHERE name = :name").param("name", name)
                .query(String.class).single();
    }

    /** Body of {@code POST /applications}; {@code roommate} is raw JSON or null. */
    String body(String roomType, String roomClass, String roommate) {
        return """
                {"roomTypeId":"%s","roomClassId":"%s",%s
                 "contact":{"phone":"0901234567","email":"me@example.com","emergencyName":"Nguyen Van A",
                            "relationship":"Mother","emergencyPhone":"0912345678"},
                 "consent":{"matching":true,"rules":true}}"""
                .formatted(roomTypeId(roomType), roomClassId(roomClass),
                        roommate == null ? "" : "\"roommate\":" + roommate + ",");
    }

    ResultActions submit(String auth, String body) throws Exception {
        return mvc.perform(post("/applications").header(HttpHeaders.AUTHORIZATION, auth)
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    Applied apply(String auth, String roomType, String roomClass, String roommate) throws Exception {
        String json = submit(auth, body(roomType, roomClass, roommate)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return new Applied(JsonPath.read(json, "$.id"), JsonPath.read(json, "$.depositInvoiceId"));
    }

    /** The student's "I have transferred". */
    ResultActions claim(String auth, String invoiceId) throws Exception {
        return mvc.perform(post("/invoices/" + invoiceId + "/claim").header(HttpHeaders.AUTHORIZATION, auth)
                .contentType(MediaType.APPLICATION_JSON).content("{}"));
    }

    /** A Manager attaches the transfer receipt to the Invoice's open claim (R-23). */
    ResultActions attachReceipt(String invoiceId) throws Exception {
        return mvc.perform(multipart("/payment-claims/" + invoiceId + "/receipt")
                .file(new MockMultipartFile("receipt", "transfer.png", "image/png", PNG))
                .header(HttpHeaders.AUTHORIZATION, manager()));
    }

    /** A Manager attaches each claim's receipt, then confirms the claims of the Invoices. */
    ResultActions confirm(String... invoiceIds) throws Exception {
        for (String id : invoiceIds) {
            attachReceipt(id);
        }
        return mvc.perform(post("/payment-claims/confirm").header(HttpHeaders.AUTHORIZATION, manager())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"invoiceIds\":[" + String.join(",", java.util.Arrays.stream(invoiceIds)
                        .map(i -> "\"" + i + "\"").toList()) + "]}"));
    }

    /** Pays the Invoice: the student claims the transfer and a Manager confirms it. */
    void pay(String auth, String invoiceId) throws Exception {
        claim(auth, invoiceId).andExpect(status().isOk());
        confirm(invoiceId).andExpect(status().isOk());
    }

    String manager() throws Exception {
        if (manager == null) {
            manager = TestAuth.bearer(mvc, TestAuth.MANAGER_A);
        }
        return manager;
    }

    List<String> statuses(String auth) throws Exception {
        return JsonPath.read(mvc.perform(get("/students/me/applications").header(HttpHeaders.AUTHORIZATION, auth))
                .andReturn().getResponse().getContentAsString(), "$.items[*].status");
    }
}

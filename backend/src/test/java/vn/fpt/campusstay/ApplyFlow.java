package vn.fpt.campusstay;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

import com.jayway.jsonpath.JsonPath;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/**
 * Helpers for the Application and payment integration tests: a published Term
 * whose registration is open now (so tests do not depend on the seed's dates),
 * submitting an Application and paying through the SePay webhook.
 */
final class ApplyFlow {

    static final String TERM_CODE = "TT31";
    static final String TERM_NAME = "Test Term 2031";
    static final String SEPAY_KEY = "Apikey test-sepay-key";
    private static final AtomicLong BANK_TXN = new AtomicLong(900_000);

    record Applied(String id, String depositInvoiceId) {
    }

    private final MockMvc mvc;
    private final JdbcClient jdbc;

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

    /** What SePay posts for a transfer to the receiving account. */
    static String sepay(long id, String code, String content, long amount) {
        return """
                {"id":%d,"gateway":"MBBank","transactionDate":"2026-10-21 10:15:00","accountNumber":"0000000000",
                 "code":%s,"content":"%s","transferType":"in","transferAmount":%d,"accumulated":50000000,
                 "subAccount":null,"referenceCode":"FT%d","description":"BankAPINotify"}"""
                .formatted(id, code == null ? "null" : "\"" + code + "\"", content, amount, id);
    }

    ResultActions webhook(String body) throws Exception {
        return mvc.perform(post("/webhooks/sepay").header(HttpHeaders.AUTHORIZATION, SEPAY_KEY)
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    /** Pays the Invoice exactly, as the bank feed would report it. */
    void pay(String auth, String invoiceId) throws Exception {
        String page = mvc.perform(get("/invoices/" + invoiceId + "/payment").header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String transfer = JsonPath.read(page, "$.transferContent");
        long amount = ((Number) JsonPath.read(page, "$.invoice.amount")).longValue();
        webhook(sepay(BANK_TXN.incrementAndGet(), transfer, "CK " + transfer, amount)).andExpect(status().isOk());
    }

    static long nextTxn() {
        return BANK_TXN.incrementAndGet();
    }

    List<String> statuses(String auth) throws Exception {
        return JsonPath.read(mvc.perform(get("/students/me/applications").header(HttpHeaders.AUTHORIZATION, auth))
                .andReturn().getResponse().getContentAsString(), "$.items[*].status");
    }
}

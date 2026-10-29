package vn.fpt.campusstay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.ADMIN;
import static vn.fpt.campusstay.TestAuth.MANAGER_A;
import static vn.fpt.campusstay.TestAuth.MANAGER_B;
import static vn.fpt.campusstay.TestAuth.STAFF_A;
import static vn.fpt.campusstay.TestAuth.bearer;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

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
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import vn.fpt.campusstay.common.file.SheetFile;
import vn.fpt.campusstay.common.file.XlsxFile;
import vn.fpt.campusstay.config.TimeConfig;

/** The Check-in and Check-out desk (TC-ASG-020…023, 045, 046). Each test allocates its own students. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class DeskIT {

    /** Term price 10,350,000 − Deposit 2,070,000 + Utility Deposit 600,000 (2 months × 300,000). */
    private static final long BALANCE = 8_880_000;

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    ApplyFlow flow;
    long termId;

    private record Placed(String auth, String name, String studentCode, String allocationId, String room,
            String balanceInvoiceId) {
    }

    @BeforeEach
    void openTerm() {
        flow = new ApplyFlow(mvc, jdbc);
        termId = flow.openTerm();
        // The desk opens today (campus date, whatever the JVM's zone) for the test Term.
        LocalDate today = LocalDate.now(TimeConfig.CAMPUS_ZONE);
        jdbc.sql("""
                UPDATE cfg_term SET check_in_start = :start, check_in_end = :end
                WHERE code = :code
                """).param("start", today.minusDays(1)).param("end", today.plusDays(5))
                .param("code", ApplyFlow.TERM_CODE).update();
    }

    private static String student(int n) {
        return "se19%04d@student.campusstay.test".formatted(n);
    }

    private ResultActions postJson(String path, String auth, String body) throws Exception {
        return mvc.perform(post(path).header(HttpHeaders.AUTHORIZATION, auth).contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private ResultActions getAs(String path, String auth) throws Exception {
        return mvc.perform(get(path).header(HttpHeaders.AUTHORIZATION, auth));
    }

    /** Applies, pays the Deposits, approves, runs and commits Block A: the students hold Beds, Balance unpaid. */
    private List<Placed> allocate(int... students) throws Exception {
        String manager = bearer(mvc, MANAGER_A); // Managers review and assign (ADR-19)
        List<String> auths = new ArrayList<>();
        List<String> ids = new ArrayList<>();
        for (int n : students) {
            String auth = bearer(mvc, student(n));
            ApplyFlow.Applied app = flow.apply(auth, "2-bed", "Standard", "{\"mode\":\"auto\"}");
            flow.pay(auth, app.depositInvoiceId());
            auths.add(auth);
            ids.add("\"" + app.id() + "\"");
        }
        postJson("/applications/bulk-review", manager, "{\"ids\":[" + String.join(",", ids) + "],\"decision\":\"Approved\"}")
                .andExpect(status().isOk());
        String run = JsonPath.read(postJson("/assignment-runs", manager, "{\"termId\":\"%d\"}".formatted(termId))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(), "$.id");
        postJson("/assignment-runs/" + run + "/commit", manager, "{\"block\":\"A\"}").andExpect(status().isNoContent());
        List<Placed> placed = new ArrayList<>();
        for (int i = 0; i < students.length; i++) {
            String room = getAs("/students/me/allocation", auths.get(i)).andExpect(status().isOk())
                    .andReturn().getResponse().getContentAsString();
            String code = "SE19%04d".formatted(students[i]);
            String name = jdbc.sql("SELECT display_name FROM auth_user WHERE email = :e").param("e", student(students[i]))
                    .query(String.class).single();
            placed.add(new Placed(auths.get(i), name, code,
                    ((String) JsonPath.read(room, "$.allocation.pass")).substring("CSTAY-PASS:".length()),
                    JsonPath.read(room, "$.allocation.room"), JsonPath.read(room, "$.balance.invoiceId")));
        }
        return placed;
    }

    /**
     * TC-ASG-020: the Balance includes the Utility Deposit; until it is paid the desk blocks check-in; then
     * the student checks in with the hand-over items, once only.
     */
    @Test
    void checkInNeedsBalanceAndUtilityDeposit() throws Exception {
        Placed p = allocate(11).getFirst();
        String staff = bearer(mvc, STAFF_A);
        getAs("/invoices/" + p.balanceInvoiceId(), p.auth())
                .andExpect(jsonPath("$.amount").value(BALANCE))
                .andExpect(jsonPath("$.utilityDeposit").value(600_000))
                .andExpect(jsonPath("$.lines[2].label").value("Utility Deposit (held until check-out)"));

        getAs("/check-in/lookup?termId=" + termId + "&q=" + p.studentCode(), staff)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.student.name").value(p.name()))
                .andExpect(jsonPath("$.student.room").value(p.room()))
                .andExpect(jsonPath("$.student.block").value("Block A"))
                .andExpect(jsonPath("$.student.status").value("blocked"))
                .andExpect(jsonPath("$.student.owes.balance").value(BALANCE - 600_000))
                .andExpect(jsonPath("$.student.owes.utilityDeposit").value(600_000))
                .andExpect(jsonPath("$.student.checks[1].label").value("Balance paid"))
                .andExpect(jsonPath("$.student.checks[1].passed").value(false))
                .andExpect(jsonPath("$.student.checks[3].passed").value(true))
                .andExpect(jsonPath("$.student.handOverItems", hasItem("Room key")));
        postJson("/check-in", staff, "{\"studentCode\":\"%s\",\"items\":[\"Room key\"]}".formatted(p.studentCode()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CHECK_IN_BLOCKED"));

        flow.pay(p.auth(), p.balanceInvoiceId());
        mvc.perform(get("/check-in/lookup").param("termId", String.valueOf(termId))
                .param("q", p.name().toLowerCase(Locale.ROOT)).header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(jsonPath("$.student.studentCode").value(p.studentCode()))
                .andExpect(jsonPath("$.student.status").value("ready"))
                .andExpect(jsonPath("$.student.owes").value((Object) null));
        postJson("/check-in", staff, "{\"studentCode\":\"%s\",\"items\":[\"Bed sheet\"]}".formatted(p.studentCode()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.items").isString());
        postJson("/check-in", staff,
                "{\"studentCode\":\"%s\",\"items\":[\"room key\",\"Access card\"],\"note\":\"Small scratch on the desk\"}"
                        .formatted(p.studentCode()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.checkedInAt").isString());
        postJson("/check-in", staff, "{\"studentCode\":\"%s\",\"items\":[]}".formatted(p.studentCode()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ALREADY_CHECKED_IN"));

        getAs("/check-in/lookup?termId=" + termId + "&q=CSTAY-PASS:" + p.allocationId(), staff)
                .andExpect(jsonPath("$.student.status").value("checked-in"))
                .andExpect(jsonPath("$.student.checkedInAt").isString())
                .andExpect(jsonPath("$.student.handOverItems[0]").value("Room key"))
                .andExpect(jsonPath("$.student.handOverItems[1]").value("Access card"));
        getAs("/check-in/today?termId=" + termId + "&block=A", staff)
                .andExpect(jsonPath("$.block").value("A"))
                .andExpect(jsonPath("$.checkedIn").value(1))
                .andExpect(jsonPath("$.recent[0].name").value(p.name()))
                .andExpect(jsonPath("$.recent[0].bed", startsWith(p.room() + "-")));
        getAs("/students/me/allocation", p.auth())
                .andExpect(jsonPath("$.allocation.status").value("Resident"))
                .andExpect(jsonPath("$.checkIn.checkedInAt").isString());
        getAs("/students/me/home", p.auth()).andExpect(jsonPath("$.checkedIn").value(true));
    }

    /**
     * TC-ASG-021 (scope): another Block's Staff do not find the student, every Manager does (ADR-19); students and
     * the Admin have no desk.
     */
    @Test
    void deskIsScoped() throws Exception {
        Placed p = allocate(12).getFirst();
        getAs("/check-in/lookup?termId=" + termId + "&q=" + p.studentCode(), bearer(mvc, TestAuth.STAFF_B2))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.student").value((Object) null));
        getAs("/check-in/lookup?termId=" + termId + "&q=" + p.studentCode(), bearer(mvc, MANAGER_B))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.student.name").value(p.name()));
        getAs("/check-in/lookup?termId=" + termId + "&q=SE190099", bearer(mvc, STAFF_A))
                .andExpect(jsonPath("$.student").value((Object) null));
        getAs("/check-in/lookup?termId=" + termId + "&q=SE190013", bearer(mvc, STAFF_A))
                .andExpect(jsonPath("$.student.status").value("not-allocated"));
        getAs("/check-in/lookup?termId=" + termId, bearer(mvc, STAFF_A))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.q").isString());
        getAs("/check-in/today?termId=" + termId, p.auth()).andExpect(status().isForbidden());
        getAs("/check-out?termId=" + termId, bearer(mvc, ADMIN)).andExpect(status().isForbidden());
        getAs("/check-out/" + p.allocationId(), bearer(mvc, TestAuth.STAFF_B2)).andExpect(status().isNotFound());
    }

    /**
     * TC-ASG-022: check-out settles the Utility Deposit: the share since the Room's last reading, the damage
     * charge, the refund to the Manager; the Bed is free again, the figures stay as settled and the Room's door
     * code must change.
     */
    @Test
    void checkOutSettlesTheDeposit() throws Exception {
        Placed p = allocate(14).getFirst();
        String staff = bearer(mvc, STAFF_A);
        flow.pay(p.auth(), p.balanceInvoiceId());
        postJson("/check-in", staff, "{\"studentCode\":\"%s\",\"items\":[\"Room key\"]}".formatted(p.studentCode()))
                .andExpect(status().isOk());
        // The Room's last reading, two days ago (campus date): 50 kWh and 5 m³.
        LocalDate cut = LocalDate.now(TimeConfig.CAMPUS_ZONE).minusDays(2);
        jdbc.sql("""
                INSERT INTO bil_meter_cut (room_id, cut_date, electricity, water, reason)
                SELECT id, :cut, 50, 5, 'CHECK_IN' FROM inv_room WHERE code = :room
                """).param("cut", cut).param("room", p.room()).update();
        String since = "since " + cut.format(DateTimeFormatter.ofPattern("dd/MM/yyyy"));

        getAs("/check-out?termId=" + termId + "&q=" + p.studentCode(), staff)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.pendingCount").isNumber())
                .andExpect(jsonPath("$.reasons", hasItem("End of Term")))
                .andExpect(jsonPath("$.items[0].allocationId").value(p.allocationId()))
                .andExpect(jsonPath("$.items[0].reason").value("End of Term"))
                .andExpect(jsonPath("$.items[0].status").value("Pending"));
        getAs("/check-out/" + p.allocationId(), staff)
                .andExpect(jsonPath("$.reading").value((Object) null))
                .andExpect(jsonPath("$.settlement.held").value(600_000))
                .andExpect(jsonPath("$.settlement.share").value(0))
                .andExpect(jsonPath("$.settlement.refund").value(600_000));

        String path = "/check-out/" + p.allocationId();
        postJson(path, staff, "{\"electricity\":10,\"water\":1,\"conditionGood\":true,\"keyReturned\":true,\"draft\":true}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.electricity").isString());
        // 50 kWh × 3,500 + 5 m³ × 15,000 = 250,000 for one resident.
        postJson(path, staff, "{\"electricity\":100,\"water\":10,\"conditionGood\":true,\"keyReturned\":true,"
                + "\"damageCharge\":50000,\"draft\":true}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.refund").value(300_000));
        getAs(path, staff)
                .andExpect(jsonPath("$.status").value("Draft"))
                .andExpect(jsonPath("$.reading.electricity").value(100))
                .andExpect(jsonPath("$.settlement.periodLabel").value(since))
                .andExpect(jsonPath("$.settlement.share").value(250_000))
                .andExpect(jsonPath("$.settlement.damage").value(50_000));
        postJson(path, staff, "{\"electricity\":100,\"water\":10,\"conditionGood\":true,\"keyReturned\":false}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.keyReturned").value("Collect the Room key before you confirm."));
        postJson(path, staff, "{\"electricity\":100,\"water\":10,\"conditionGood\":false,\"keyReturned\":true,"
                + "\"damageCharge\":50000}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.refund").value(300_000))
                .andExpect(jsonPath("$.refundStatus").value("Pending"));

        getAs(path, staff)
                .andExpect(jsonPath("$.status").value("Checked out"))
                .andExpect(jsonPath("$.checkedOutAt").isString())
                .andExpect(jsonPath("$.settlement.share").value(250_000))
                .andExpect(jsonPath("$.settlement.refund").value(300_000))
                .andExpect(jsonPath("$.refundStatus").value("Pending"));
        postJson(path, staff, "{\"electricity\":100,\"water\":10,\"conditionGood\":true,\"keyReturned\":true}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ALREADY_CHECKED_OUT"));
        getAs("/students/me/allocation?termId=" + termId, p.auth())
                .andExpect(jsonPath("$.allocation").value((Object) null));
        assertThat(jdbc.sql("""
                SELECT count(*) FROM bil_refund WHERE source_type = 'CHECK_OUT' AND source_id = :a AND amount = 300000
                  AND status = 'PENDING'
                """).param("a", Long.parseLong(p.allocationId())).query(Long.class).single()).isEqualTo(1);
        // The Room's door code must change now that a resident left (spec §6.8).
        assertThat(jdbc.sql("""
                SELECT count(*) FROM inv_door_code_task t JOIN inv_room r ON r.id = t.room_id
                WHERE r.code = :room AND t.reason = 'CHECK_OUT' AND t.done_at IS NULL
                """).param("room", p.room()).query(Long.class).single()).isEqualTo(1);
    }

    /**
     * TC-ASG-046: the desk enters the final meter readings Room by Room, typed or from the XLSX template, before the
     * leavers come: each Room's reading goes to the check-out drafts of its leavers; a Room without leavers in the
     * user's Blocks or a reading below the Room's last one is reported and not saved.
     */
    @Test
    void finalReadingsRoomByRoom() throws Exception {
        Placed p = allocate(17).getFirst();
        String staff = bearer(mvc, STAFF_A);
        flow.pay(p.auth(), p.balanceInvoiceId());
        // A resident (the door code was released): no desk check-in, so the desk's count of today stays as it is.
        jdbc.sql("UPDATE asg_allocation SET resident_at = now() WHERE id = :id")
                .param("id", Long.parseLong(p.allocationId())).update();
        jdbc.sql("""
                INSERT INTO bil_meter_cut (room_id, cut_date, electricity, water, reason)
                SELECT id, :cut, 50, 5, 'CHECK_IN' FROM inv_room WHERE code = :room
                """).param("cut", LocalDate.now(TimeConfig.CAMPUS_ZONE).minusDays(2)).param("room", p.room()).update();
        String readings = "/check-out/readings?termId=" + termId;
        getAs(readings, staff)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[?(@.room == '%s')].electricity".formatted(p.room()), hasItem((Object) null)));

        mvc.perform(put(readings).header(HttpHeaders.AUTHORIZATION, staff).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"readings\":[{\"room\":\"%s\",\"electricity\":10,\"water\":1},{\"room\":\"Z-999\",\"electricity\":1,\"water\":1}]}"
                                .formatted(p.room())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rooms").value(0))
                .andExpect(jsonPath("$.problems.length()").value(2))
                .andExpect(jsonPath("$.problems[1].message").value("No student is waiting to check out of this Room."));
        mvc.perform(put(readings).header(HttpHeaders.AUTHORIZATION, bearer(mvc, TestAuth.STAFF_B2))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"readings\":[{\"room\":\"%s\",\"electricity\":120,\"water\":12}]}".formatted(p.room())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rooms").value(0));
        mvc.perform(put(readings).header(HttpHeaders.AUTHORIZATION, staff).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"readings\":[{\"room\":\"%s\",\"electricity\":120,\"water\":12}]}".formatted(p.room())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rooms").value(1))
                .andExpect(jsonPath("$.problems.length()").value(0));
        getAs("/check-out/" + p.allocationId(), staff)
                .andExpect(jsonPath("$.status").value("Draft"))
                .andExpect(jsonPath("$.reading.electricity").value(120))
                .andExpect(jsonPath("$.reading.water").value(12));

        byte[] template = getAs(readings.replace("readings?", "readings/template?"), staff).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray();
        List<List<String>> rows = SheetFile.rows("template.xlsx", template);
        assertThat(rows.getFirst()).containsExactly("room", "electricity", "water");
        assertThat(rows).contains(List.of(p.room(), "120.0", "12.0"));
        byte[] filled = XlsxFile.of("Readings", List.of(List.of("Phòng", "Điện", "Nước"), List.of(p.room(), "130", "13")));
        mvc.perform(multipart(readings).file(new MockMultipartFile("file", "readings.xlsx",
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filled))
                        .header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rooms").value(1));
        getAs("/check-out/" + p.allocationId(), staff).andExpect(jsonPath("$.reading.electricity").value(130));
    }

    /** TC-ASG-023: when the charges exceed the Utility Deposit, the rest is invoiced to the student. */
    @Test
    void shortfallIsInvoiced() throws Exception {
        Placed p = allocate(15).getFirst();
        String staff = bearer(mvc, STAFF_A);
        flow.pay(p.auth(), p.balanceInvoiceId());
        postJson("/check-in", staff, "{\"studentCode\":\"%s\",\"items\":[\"Room key\"]}".formatted(p.studentCode()))
                .andExpect(status().isOk());
        String body = postJson("/check-out/" + p.allocationId(), staff, "{\"electricity\":5000,\"water\":500,"
                + "\"conditionGood\":false,\"keyReturned\":true,\"damageCharge\":1000000}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.refundStatus").value("None"))
                .andReturn().getResponse().getContentAsString();
        long owed = -((Number) JsonPath.read(body, "$.refund")).longValue();
        assertThat(owed).isGreaterThanOrEqualTo(400_000);
        getAs("/students/me/invoices", p.auth())
                .andExpect(jsonPath("$.items[?(@.type == 'damage')].amount", hasItem((int) owed)));
    }

    /**
     * TC-ASG-045: check-out records the damage of each furniture item of the Room (spec §6.16): the damage charge
     * is their sum, a damaged item becomes Broken with the reason in its history, an item of another Room is
     * refused; the list shows the Term's check-out date and whether a leaver is past it.
     */
    @Test
    void checkOutRecordsDamagePerItem() throws Exception {
        Placed p = allocate(16).getFirst();
        String staff = bearer(mvc, STAFF_A);
        flow.pay(p.auth(), p.balanceInvoiceId());
        postJson("/check-in", staff, "{\"studentCode\":\"%s\",\"items\":[\"Room key\"]}".formatted(p.studentCode()))
                .andExpect(status().isOk());
        getAs("/check-out?termId=" + termId + "&q=" + p.studentCode(), staff)
                .andExpect(jsonPath("$.checkOutBy").isString())
                .andExpect(jsonPath("$.overdueCount").value(0))
                .andExpect(jsonPath("$.items[0].overdue").value(false));
        String path = "/check-out/" + p.allocationId();
        String detail = getAs(path, staff).andExpect(status().isOk())
                .andExpect(jsonPath("$.furniture[0].amount").value(0))
                .andReturn().getResponse().getContentAsString();
        String item = JsonPath.read(detail, "$.furniture[0].itemId");
        String elsewhere = jdbc.sql("""
                SELECT i.id::text FROM inv_furniture_item i JOIN inv_room r ON r.id = i.room_id
                WHERE r.code <> :room ORDER BY i.id LIMIT 1
                """).param("room", p.room()).query(String.class).single();

        postJson(path, staff, ("{\"electricity\":10,\"water\":1,\"conditionGood\":false,\"keyReturned\":true,"
                + "\"damages\":[{\"itemId\":\"%s\",\"amount\":100000}]}").formatted(elsewhere))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.damages").value("List each damaged item of this Room once."));
        postJson(path, staff, ("{\"electricity\":10,\"water\":1,\"conditionGood\":false,\"keyReturned\":true,"
                + "\"damages\":[{\"itemId\":\"%s\",\"amount\":120000,\"note\":\"Cracked casing\"}]}").formatted(item))
                .andExpect(status().isOk());
        getAs(path, staff)
                .andExpect(jsonPath("$.status").value("Checked out"))
                .andExpect(jsonPath("$.settlement.damage").value(120_000))
                .andExpect(jsonPath("$.furniture[?(@.itemId == '%s')].amount".formatted(item)).value(hasItem(120_000)))
                .andExpect(jsonPath("$.furniture[?(@.itemId == '%s')].note".formatted(item)).value(hasItem("Cracked casing")));
        getAs("/furniture/" + item, staff).andExpect(status().isOk())
                .andExpect(jsonPath("$.item.status").value("Broken"))
                .andExpect(jsonPath("$.history[0].to").value("Broken"))
                .andExpect(jsonPath("$.history[0].reason", startsWith("Damaged at the check-out of Room " + p.room())));
    }
}

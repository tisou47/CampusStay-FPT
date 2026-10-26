package vn.fpt.campusstay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.StayFlow.student;
import static vn.fpt.campusstay.TestAuth.MANAGER_A;
import static vn.fpt.campusstay.TestAuth.STAFF_A;
import static vn.fpt.campusstay.TestAuth.STAFF_B2;
import static vn.fpt.campusstay.TestAuth.bearer;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import vn.fpt.campusstay.service.assignment.RenewalService;

/**
 * Operational moves (spec §6.13, D-14, D-31): Staff inside their Blocks or a Manager move a student for a recorded
 * reason at no charge; a resident's move cuts both Rooms' meters, rotates the old Room's code and takes the next-Term
 * Bed along; once the next-Term fees are issued only a Manager moves a next-Term Bed: an unpaid fee is issued again,
 * a paid one allows only a Bed of the same price (TC-ASG-043, 044).
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class OperationalMoveIT {

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

    private long count(String sql, Object student) {
        return jdbc.sql(sql).param("s", student).query(Long.class).single();
    }

    /**
     * TC-ASG-043: Staff move a resident to another Room of their Block for a reason: both meters are read, the old
     * Room's code must change, the next-Term Bed follows, nothing is charged; the student is told; the moves list
     * shows it; validation, other Blocks and students are refused.
     */
    @Test
    void staffMoveAResident() throws Exception {
        renewal.resident(3, "A-101", "A", 2);
        renewals.openDue();
        String staff = bearer(mvc, STAFF_A);
        String options = getAs("/operational-moves/options?q=SE190003", staff)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.from.room").value("A-101"))
                .andExpect(jsonPath("$.nextTermAllocation").value(false))
                .andExpect(jsonPath("$.nextTerm.state").value("Continuing"))
                .andExpect(jsonPath("$.beds[*].room", not(hasItem("A-101"))))
                .andExpect(jsonPath("$.reasons", hasItem("Room unusable")))
                .andReturn().getResponse().getContentAsString();
        String allocation = com.jayway.jsonpath.JsonPath.read(options, "$.allocationId");
        getAs("/operational-moves/options?allocationId=" + allocation, bearer(mvc, STAFF_B2))
                .andExpect(status().isForbidden());
        getAs("/operational-moves/options?q=SE190003", bearer(mvc, student(3))).andExpect(status().isForbidden());

        String body = "{\"allocationId\":\"%s\",\"bedId\":\"A-102-A\",\"reason\":\"%s\"%s}";
        stay.postJson("/operational-moves", staff, body.formatted(allocation, "Room unusable", ""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.fromElectricity").isString());
        stay.postJson("/operational-moves", staff, body.formatted(allocation, "Other", ""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.note").isString());
        String readings = ",\"fromElectricity\":120.5,\"fromWater\":10,\"toElectricity\":340,\"toWater\":22";
        stay.postJson("/operational-moves", staff, body.formatted(allocation, "Room unusable", readings))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.room").value("A-102"))
                .andExpect(jsonPath("$.nextTerm").value("Followed"));

        String auth = bearer(mvc, student(3));
        getAs("/students/me/allocation", auth)
                .andExpect(jsonPath("$.allocation.room").value("A-102"))
                .andExpect(jsonPath("$.allocation.status").value("Resident"))
                .andExpect(jsonPath("$.nextTerm.room").value("A-102"));
        getAs("/notifications", auth).andExpect(jsonPath("$.items[*].title", hasItem("You moved to Room A-102")));
        assertThat(jdbc.sql("SELECT count(*) FROM bil_meter_cut WHERE reason = 'MOVE'").query(Long.class).single())
                .isEqualTo(2);
        assertThat(jdbc.sql("""
                SELECT count(*) FROM inv_door_code_task t JOIN inv_room r ON r.id = t.room_id
                WHERE r.code = 'A-101' AND t.done_at IS NULL
                """).query(Long.class).single()).isEqualTo(1);
        long me = stay.userId(student(3));
        assertThat(count("SELECT count(*) FROM bil_invoice WHERE student_id = :s", me)).isZero();
        assertThat(count("SELECT count(*) FROM bil_refund WHERE student_id = :s", me)).isZero();
        getAs("/operational-moves", staff)
                .andExpect(jsonPath("$.items[0].student.studentCode").value("SE190003"))
                .andExpect(jsonPath("$.items[0].from").value("A-101-A"))
                .andExpect(jsonPath("$.items[0].to").value("A-102-A"))
                .andExpect(jsonPath("$.items[0].reason").value("Room unusable"))
                .andExpect(jsonPath("$.items[0].nextTerm").value("Followed"));
        getAs("/operational-moves", bearer(mvc, STAFF_B2)).andExpect(jsonPath("$.total").value(0));
    }

    /**
     * TC-ASG-044: after the next-Term fees are issued, Staff may no longer move a next-Term Bed; a Manager moves an
     * unpaid one and its fee is void and issued again for the new Bed; a paid fee allows only a Bed of the same price.
     */
    @Test
    void frozenAfterTheFees() throws Exception {
        renewal.resident(5, "A-103", "A", 2);
        renewal.resident(6, "A-103", "B", 2);
        renewals.openDue();
        renewal.milestone("requests_close_at", "-1 minute");
        renewals.closeDue();
        String manager = bearer(mvc, MANAGER_A);
        mvc.perform(multipart("/reconciliations").file(new MockMultipartFile("file", "enrolled.csv", "text/csv",
                RenewalFlow.enrolled("SE190005", "SE190006"))).param("termId", String.valueOf(next))
                .param("kind", "enrolled").header(HttpHeaders.AUTHORIZATION, manager)).andExpect(status().isOk());
        stay.postJson("/next-term-fees/issue", manager, "{\"termId\":\"%d\"}".formatted(next))
                .andExpect(jsonPath("$.issued").value(2));
        String first = renewal.allocationOf(5, next);
        String fee = renewal.feeOf(5);

        stay.postJson("/operational-moves", bearer(mvc, STAFF_A),
                "{\"allocationId\":\"%s\",\"bedId\":\"A-104-A\",\"reason\":\"Safety\"}".formatted(first))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("MANAGER_DECIDES"));
        stay.postJson("/operational-moves", manager,
                "{\"allocationId\":\"%s\",\"bedId\":\"A-104-A\",\"reason\":\"Safety\"}".formatted(first))
                .andExpect(status().isOk());
        long five = stay.userId(student(5));
        assertThat(jdbc.sql("SELECT status FROM bil_invoice WHERE code = :c").param("c", fee).query(String.class)
                .single()).isEqualTo("VOID");
        assertThat(renewal.feeOf(5)).isNotEqualTo(fee);
        assertThat(count("SELECT count(*) FROM bil_invoice WHERE type = 'TERM_FEE' AND status <> 'VOID' AND student_id = :s",
                five)).isEqualTo(1);
        getAs("/students/me/allocation", bearer(mvc, student(5)))
                .andExpect(jsonPath("$.nextTerm.room").value("A-104"))
                .andExpect(jsonPath("$.nextTerm.fee.invoiceId").value(renewal.feeOf(5)));

        flow.pay(bearer(mvc, student(6)), renewal.feeOf(6));
        String second = renewal.allocationOf(6, next);
        stay.postJson("/operational-moves", manager,
                "{\"allocationId\":\"%s\",\"bedId\":\"A-301-A\",\"reason\":\"Safety\"}".formatted(second))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PRICE_DIFFERS"));
        stay.postJson("/operational-moves", manager,
                "{\"allocationId\":\"%s\",\"bedId\":\"A-104-B\",\"reason\":\"Safety\"}".formatted(second))
                .andExpect(status().isOk());
        getAs("/students/me/allocation", bearer(mvc, student(6)))
                .andExpect(jsonPath("$.nextTerm.room").value("A-104"))
                .andExpect(jsonPath("$.nextTerm.fee.status").value("Paid"));
    }
}

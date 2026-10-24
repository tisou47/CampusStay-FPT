package vn.fpt.campusstay;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.StayFlow.student;
import static vn.fpt.campusstay.TestAuth.MANAGER_A;
import static vn.fpt.campusstay.TestAuth.MANAGER_B;
import static vn.fpt.campusstay.TestAuth.STAFF_A;
import static vn.fpt.campusstay.TestAuth.bearer;

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
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import vn.fpt.campusstay.config.TimeConfig;

/** Late check-ins: recorded at the desk, decided by the Block Manager (TC-ASG-030, 031). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class LateCheckInIT {

    private static final byte[] PNG = { (byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0x0D, 'I', 'H',
            'D', 'R' };

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    StayFlow stay;
    long termId;

    @BeforeEach
    void openTerm() {
        ApplyFlow flow = new ApplyFlow(mvc, jdbc);
        termId = flow.openTerm();
        stay = new StayFlow(mvc, jdbc, flow, termId);
    }

    private static String day(int plusDays) {
        return LocalDate.now(TimeConfig.CAMPUS_ZONE).plusDays(plusDays).toString();
    }

    private ResultActions record(String auth, String code, String requestedFor, boolean evidence) throws Exception {
        var request = multipart("/late-check-ins").param("studentCode", code).param("reason", "Flight delayed")
                .param("requestedFor", requestedFor);
        if (evidence) {
            request.file(new MockMultipartFile("evidence", "ticket.png", "image/png", PNG));
        }
        return mvc.perform(request.header(HttpHeaders.AUTHORIZATION, auth));
    }

    private ResultActions list(String auth) throws Exception {
        return mvc.perform(get("/late-check-ins?termId=" + termId).header(HttpHeaders.AUTHORIZATION, auth));
    }

    /**
     * TC-ASG-030: Staff record the request with evidence; the Block Manager approves a deadline, after which
     * the desk lets the student check in even though the Term's window is closed.
     */
    @Test
    void approvedLateCheckIn() throws Exception {
        stay.livesIn(18, "A-303", "B", false);
        String staff = bearer(mvc, STAFF_A);
        record(staff, "SE190018", day(-1), false)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.requestedFor").isString());
        String id = JsonPath.read(record(staff, "SE190018", day(2), true).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(), "$.id");
        record(staff, "SE190018", day(3), false)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("LATE_REQUEST_EXISTS"));

        String manager = bearer(mvc, MANAGER_A);
        list(manager)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].id").value(id))
                .andExpect(jsonPath("$.items[0].studentCode").value("SE190018"))
                .andExpect(jsonPath("$.items[0].allocation").value("Room A-303 · Bed B"))
                .andExpect(jsonPath("$.items[0].receivedBy").value("Nguyen Van Binh"))
                .andExpect(jsonPath("$.items[0].paid").value(true))
                .andExpect(jsonPath("$.items[0].requestedFor").value(day(2)))
                .andExpect(jsonPath("$.items[0].evidence.url", startsWith("http://localhost/files/")))
                .andExpect(jsonPath("$.items[0].decision").value((Object) null));
        stay.postJson("/late-check-ins/" + id + "/decision", staff, "{\"decision\":\"Approved\",\"deadline\":\"%s\"}"
                .formatted(day(3))).andExpect(status().isForbidden());
        stay.postJson("/late-check-ins/" + id + "/decision", manager, "{\"decision\":\"Approved\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.deadline").isString());
        stay.postJson("/late-check-ins/" + id + "/decision", manager, "{\"decision\":\"Approved\",\"deadline\":\"%s\"}"
                .formatted(day(3))).andExpect(status().isNoContent());
        stay.postJson("/late-check-ins/" + id + "/decision", manager, "{\"decision\":\"Rejected\",\"reason\":\"x\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ALREADY_DECIDED"));
        list(manager)
                .andExpect(jsonPath("$.items[0].decision.status").value("Approved"))
                .andExpect(jsonPath("$.items[0].decision.deadline").value(day(3)));

        String until = LocalDate.parse(day(3)).format(DateTimeFormatter.ofPattern("dd/MM/yyyy"));
        mvc.perform(get("/check-in/lookup?termId=" + termId + "&q=SE190018").header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(jsonPath("$.student.status").value("ready"))
                .andExpect(jsonPath("$.student.checks[3].label").value("Late check-in approved until " + until));
        mvc.perform(get("/notifications").header(HttpHeaders.AUTHORIZATION, bearer(mvc, student(18))))
                .andExpect(jsonPath("$.items[0].title").value("Late check-in decision"));
    }

    /** TC-ASG-031: a rejection needs a reason; every Manager sees the request (ADR-19). */
    @Test
    void rejectedLateCheckIn() throws Exception {
        stay.livesIn(19, "A-304", "B", false);
        String id = JsonPath.read(record(bearer(mvc, STAFF_A), "SE190019", day(1), false).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(), "$.id");
        list(bearer(mvc, MANAGER_B)).andExpect(jsonPath("$.items[*].id", hasItem(id)));
        String manager = bearer(mvc, MANAGER_A);
        stay.postJson("/late-check-ins/" + id + "/decision", manager, "{\"decision\":\"Rejected\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.reason").isString());
        stay.postJson("/late-check-ins/" + id + "/decision", manager,
                "{\"decision\":\"Rejected\",\"reason\":\"No evidence of the delay.\"}").andExpect(status().isNoContent());
        list(manager)
                .andExpect(jsonPath("$.items[?(@.id == '%s')].decision.status".formatted(id),
                        hasItem("Rejected")));
    }
}

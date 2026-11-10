package vn.fpt.campusstay;

import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.STAFF_A;
import static vn.fpt.campusstay.TestAuth.bearer;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/** The bank account a student's refunds are paid to (A-62; TC-AUTH-058). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
class RefundAccountIT {

    @Autowired
    MockMvc mvc;

    private ResultActions save(String auth, String body) throws Exception {
        return mvc.perform(put("/students/me/refund-account").header(HttpHeaders.AUTHORIZATION, auth)
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    /**
     * TC-AUTH-058: a student reads and saves their refund account; the number keeps its digits only, the bank is
     * chosen from the list by its BIN and the student accepts responsibility for the account (R-22), each field is
     * checked, and only students have one.
     */
    @Test
    void studentKeepsTheirRefundAccount() throws Exception {
        String student = bearer(mvc, StayFlow.student(47));
        mvc.perform(get("/students/me/refund-account").header(HttpHeaders.AUTHORIZATION, student))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.number").value((Object) null));

        mvc.perform(get("/banks").header(HttpHeaders.AUTHORIZATION, student))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.bin == '970407')].shortName", hasItem("Techcombank")));
        save(student, "{\"holder\":\"A\",\"number\":\"12ab\",\"bankCode\":\"999999\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.holder").isString())
                .andExpect(jsonPath("$.details.fields.number").isString())
                .andExpect(jsonPath("$.details.fields.bankCode").isString())
                .andExpect(jsonPath("$.details.fields.accepted").isString());
        save(student, "{\"holder\":\"  Tran   Thu Trang \",\"number\":\"1903-4567.8901\",\"bankCode\":\"970407\","
                + "\"accepted\":true}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.holder").value("Tran Thu Trang"))
                .andExpect(jsonPath("$.number").value("190345678901"))
                .andExpect(jsonPath("$.bank").value("Techcombank"))
                .andExpect(jsonPath("$.bankCode").value("970407"))
                .andExpect(jsonPath("$.acceptedAt").isString())
                .andExpect(jsonPath("$.updatedAt").isString());
        mvc.perform(get("/students/me/refund-account").header(HttpHeaders.AUTHORIZATION, student))
                .andExpect(jsonPath("$.number").value("190345678901"));

        save(bearer(mvc, STAFF_A), "{\"holder\":\"Nguyen Van Binh\",\"number\":\"123456\",\"bankCode\":\"970436\",\"accepted\":true}")
                .andExpect(status().isForbidden());
    }
}

package vn.fpt.campusstay;

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
     * TC-AUTH-058: a student reads and saves their refund account; the number keeps its digits only, each field is
     * checked, and only students have one.
     */
    @Test
    void studentKeepsTheirRefundAccount() throws Exception {
        String student = bearer(mvc, StayFlow.student(47));
        mvc.perform(get("/students/me/refund-account").header(HttpHeaders.AUTHORIZATION, student))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.number").value((Object) null));

        save(student, "{\"holder\":\"A\",\"number\":\"12ab\",\"bank\":\"\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.holder").isString())
                .andExpect(jsonPath("$.details.fields.number").isString())
                .andExpect(jsonPath("$.details.fields.bank").isString());
        save(student, "{\"holder\":\"  Tran   Thu Trang \",\"number\":\"1903-4567.8901\",\"bank\":\"Techcombank\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.holder").value("Tran Thu Trang"))
                .andExpect(jsonPath("$.number").value("190345678901"))
                .andExpect(jsonPath("$.bank").value("Techcombank"))
                .andExpect(jsonPath("$.updatedAt").isString());
        mvc.perform(get("/students/me/refund-account").header(HttpHeaders.AUTHORIZATION, student))
                .andExpect(jsonPath("$.number").value("190345678901"));

        save(bearer(mvc, STAFF_A), "{\"holder\":\"Nguyen Van Binh\",\"number\":\"123456\",\"bank\":\"VCB\"}")
                .andExpect(status().isForbidden());
    }
}

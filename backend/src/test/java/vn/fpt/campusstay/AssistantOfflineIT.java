package vn.fpt.campusstay;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
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

/** Without a model server ({@code ASSISTANT_BASE_URL} blank) the assistant says it is off (ADR-28, A-64). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
class AssistantOfflineIT {

    @Autowired
    MockMvc mvc;

    /** TC-AST-005: without a model server the status says off and a question answers 503 ASSISTANT_OFFLINE. */
    @Test
    void offlineWithoutModelServer() throws Exception {
        String student = bearer(mvc, StayFlow.student(48));
        mvc.perform(get("/students/me/assistant").header(HttpHeaders.AUTHORIZATION, student))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enabled").value(false));
        mvc.perform(post("/students/me/assistant/chat").header(HttpHeaders.AUTHORIZATION, student)
                .header(HttpHeaders.ACCEPT_LANGUAGE, "vi")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"messages\":[{\"role\":\"user\",\"content\":\"Xin chào\"}]}"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("ASSISTANT_OFFLINE"))
                .andExpect(jsonPath("$.message").value("Trợ lý đang offline. Hãy thử lại sau."));
    }
}

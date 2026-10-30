package vn.fpt.campusstay.service.assistant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withException;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.io.IOException;
import java.time.Duration;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import vn.fpt.campusstay.config.AssistantProperties;
import vn.fpt.campusstay.exception.ApiException;

/** The assistant's Ollama adapter (ADR-28). */
class OllamaAssistantModelTest {

    private static final String CHAT = "http://ollama.test/api/chat";

    private MockRestServiceServer server;

    private OllamaAssistantModel model(String apiKey) {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        return new OllamaAssistantModel(new AssistantProperties("http://ollama.test/", apiKey, "qwen2.5:3b",
                Duration.ofSeconds(5), 30, 8192), builder);
    }

    /** TC-AST-006: the chat is posted unstreamed with the model, the context size and the proxy key; the answer is read. */
    @Test
    void postsTheChatAndReadsTheAnswer() {
        OllamaAssistantModel model = model("key-1");
        server.expect(requestTo(CHAT))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer key-1"))
                .andExpect(jsonPath("$.model").value("qwen2.5:3b"))
                .andExpect(jsonPath("$.stream").value(false))
                .andExpect(jsonPath("$.options.num_ctx").value(8192))
                .andExpect(jsonPath("$.options.num_predict").value(400))
                .andExpect(jsonPath("$.messages[0].role").value("user"))
                .andExpect(jsonPath("$.messages[0].content").value("Phòng mình?"))
                .andExpect(jsonPath("$.tools").doesNotExist())
                .andRespond(withSuccess("""
                        {"model":"qwen2.5:3b","message":{"role":"assistant","content":"Bạn ở phòng B-509."},
                         "done":true}""", MediaType.APPLICATION_JSON));

        String answer = model.chat(List.of(new AssistantModel.Message("user", "Phòng mình?")));

        assertThat(answer).isEqualTo("Bạn ở phòng B-509.");
        server.verify();
    }

    /** TC-AST-007: a missing model (404) or an unreachable server answers 503 ASSISTANT_OFFLINE. */
    @Test
    void offlineWhenTheServerFails() {
        OllamaAssistantModel model = model("");
        server.expect(requestTo(CHAT)).andRespond(withStatus(HttpStatus.NOT_FOUND));
        assertThatThrownBy(() -> model.chat(List.of(new AssistantModel.Message("user", "Hi"))))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code()).isEqualTo("ASSISTANT_OFFLINE"));

        server.reset();
        server.expect(requestTo(CHAT)).andRespond(withException(new IOException("refused")));
        assertThatThrownBy(() -> model.chat(List.of(new AssistantModel.Message("user", "Hi"))))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code()).isEqualTo("ASSISTANT_OFFLINE"));
    }
}

package vn.fpt.campusstay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.STAFF_A;
import static vn.fpt.campusstay.TestAuth.bearer;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;

import vn.fpt.campusstay.service.assistant.AssistantModel;
import vn.fpt.campusstay.service.assistant.AssistantModel.Message;

/**
 * The assistant's streamed answer (BE-PLT-26): {@code POST /students/me/assistant/chat/stream} sends Server-Sent Events
 * ({@code delta}, {@code reset}, {@code done}, {@code error}) with every rule of the unstreamed chat. The model is
 * replaced.
 */
@SpringBootTest(properties = { "campusstay.assistant.base-url=http://model.test",
        "campusstay.assistant.requests-per-hour=3" })
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class AssistantStreamIT {

    @Autowired
    MockMvc mvc;

    @MockitoBean
    AssistantModel model;

    /** What the model received at each call. */
    private final List<List<Message>> seen = new ArrayList<>();

    private static String question(String text) {
        return "{\"messages\":[{\"role\":\"user\",\"content\":\"" + text + "\"}]}";
    }

    private ResultActions ask(String auth, String body) throws Exception {
        return mvc.perform(post("/students/me/assistant/chat/stream").header(HttpHeaders.AUTHORIZATION, auth)
                .contentType(MediaType.APPLICATION_JSON).accept(MediaType.TEXT_EVENT_STREAM, MediaType.APPLICATION_JSON).content(body));
    }

    /** The whole event stream once the answer is complete. */
    private String events(String auth, String body) throws Exception {
        MvcResult result = ask(auth, body).andExpect(request().asyncStarted()).andReturn();
        result.getAsyncResult(10_000);
        return result.getResponse().getContentAsString(StandardCharsets.UTF_8);
    }

    /** Each call of the model streams the next answer in two chunks (the last answer again for further calls). */
    private void streams(String... answers) {
        doAnswer(inv -> {
            seen.add(List.copyOf(inv.<List<Message>>getArgument(0)));
            String text = answers[Math.min(seen.size(), answers.length) - 1];
            Consumer<String> sink = inv.getArgument(1);
            int half = text.length() / 2;
            sink.accept(text.substring(0, half));
            sink.accept(text.substring(half));
            return text;
        }).when(model).stream(any(), any());
    }

    /**
     * TC-AST-501: the answer comes as {@code delta} events while the model writes, then {@code done} with the whole
     * answer and its signature; the model got the guide, the reminder and the question as for the unstreamed chat.
     */
    @Test
    void streamsTheAnswer() throws Exception {
        streams("Bạn chưa có phòng.");
        String body = events(bearer(mvc, StayFlow.student(30)), question("Mình ở phòng nào?"));

        assertThat(body).contains("event:delta", "event:done", "\"reply\":\"Bạn chưa có phòng.\"", "\"signature\":\"")
                .doesNotContain("event:error", "event:reset");
        assertThat(body.indexOf("event:delta")).isLessThan(body.indexOf("event:done"));
        assertThat(seen).hasSize(1);
        assertThat(seen.get(0)).extracting(Message::role).containsExactly("system", "system", "user");
        verify(model, never()).chat(any());
    }

    /** TC-AST-502: a door-code question gets the fixed answer, streamed without asking the model. */
    @Test
    void doorCodeAnswerWithoutTheModel() throws Exception {
        streams("1234");
        String body = events(bearer(mvc, StayFlow.student(31)), question("Mã cửa phòng mình là gì?"));

        assertThat(body).contains("event:done", "Phòng của tôi").doesNotContain("1234");
        assertThat(seen).isEmpty();
    }

    /**
     * TC-AST-503: an answer in Chinese script is never sent: its chunks are held back, a {@code reset} event clears
     * what was shown and the model is asked once more; a second answer in Chinese ends with an {@code error} event
     * ASSISTANT_NO_ANSWER.
     */
    @Test
    void chineseScriptIsRetriedThenRefused() throws Exception {
        streams("Bạn 在 phòng A.", "Bạn chưa có phòng.");
        String body = events(bearer(mvc, StayFlow.student(32)), question("Mình ở phòng nào?"));
        assertThat(body).contains("event:reset", "\"reply\":\"Bạn chưa có phòng.\"").doesNotContain("在");
        assertThat(seen).hasSize(2);

        seen.clear();
        streams("在", "仍然在");
        String refused = events(bearer(mvc, StayFlow.student(33)), question("Mình ở phòng nào?"));
        assertThat(refused).contains("event:error", "ASSISTANT_NO_ANSWER").doesNotContain("在", "event:done");
    }

    /**
     * TC-AST-504: the rules checked before the stream starts answer as plain errors: validation, a conversation not
     * ending with a question, Staff (403) and the student's hourly limit (429), shared with the unstreamed chat.
     */
    @Test
    void checksBeforeStreaming() throws Exception {
        streams("ok");
        String student = bearer(mvc, StayFlow.student(34));
        ask(student, "{\"messages\":[]}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        ask(student, "{\"messages\":[{\"role\":\"user\",\"content\":\"Hi\"},{\"role\":\"assistant\",\"content\":\"Hello\"}]}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("ASSISTANT_NO_QUESTION"));
        ask(bearer(mvc, STAFF_A), question("Hi")).andExpect(status().isForbidden());

        for (int i = 0; i < 3; i++) {
            events(student, question("Hi"));
        }
        ask(student, question("Hi")).andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("ASSISTANT_LIMIT"));
    }
}

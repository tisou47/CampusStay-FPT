package vn.fpt.campusstay.controller.assistant;

import java.io.IOException;
import java.time.Duration;
import java.util.List;
import java.util.Map;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import vn.fpt.campusstay.common.i18n.Messages;
import vn.fpt.campusstay.exception.ApiException;

import vn.fpt.campusstay.service.assistant.AssistantService;

/**
 * The students' AI assistant (ADR-28, A-68): whether it is on, and one answer to the conversation sent, whole or
 * streamed as Server-Sent Events (BE-PLT-26).
 */
@RestController
@RequestMapping("/students/me/assistant")
class AssistantController {

    record TurnRequest(
            @NotNull(message = "Choose who wrote this message.")
            @Pattern(regexp = "user|assistant", message = "Choose who wrote this message.") String role,
            @NotBlank(message = "Write your question.")
            @Size(max = 2000, message = "Use at most 2000 characters.") String content,
            @Size(max = 100, message = "This conversation is not valid. Start a new one.") String signature) {
    }

    record ChatRequest(
            @NotEmpty(message = "Write your question.")
            @Size(max = 40, message = "The conversation is too long. Start a new one.")
            List<@Valid TurnRequest> messages) {
    }

    /** Longer than the model's own timeout, asked twice (a retry after Chinese script). */
    private static final Duration STREAM_TIMEOUT = Duration.ofMinutes(5);

    private final AssistantService assistant;
    private final Messages messages;

    AssistantController(AssistantService assistant, Messages messages) {
        this.assistant = assistant;
        this.messages = messages;
    }

    @GetMapping
    AssistantService.Status status() {
        return assistant.status();
    }

    @PostMapping("/chat")
    AssistantService.Reply chat(@Valid @RequestBody ChatRequest body) {
        return assistant.chat(turns(body));
    }

    /**
     * Events: {@code delta} {text} to append, {@code reset} {} to clear what was shown, then {@code done}
     * {reply, signature} (the whole answer, to keep) or {@code error} {code, message}. Errors found before the stream
     * starts (validation, role, the hourly limit) are ordinary JSON errors.
     */
    @PostMapping("/chat/stream")
    SseEmitter stream(@Valid @RequestBody ChatRequest body) {
        // On the request thread: it reads the signed-in student, their data and the request's language.
        AssistantService.Prepared prepared = assistant.prepare(turns(body));
        SseEmitter emitter = new SseEmitter(STREAM_TIMEOUT.toMillis());
        Thread.ofVirtual().name("assistant-stream").start(() -> {
            try {
                AssistantService.Reply reply = assistant.stream(prepared, new AssistantService.Stream() {
                    @Override
                    public void delta(String text) {
                        send(emitter, "delta", Map.of("text", text));
                    }

                    @Override
                    public void reset() {
                        send(emitter, "reset", Map.of());
                    }
                });
                send(emitter, "done", reply);
                emitter.complete();
            } catch (ApiException e) {
                send(emitter, "error", Map.of("code", e.code(),
                        "message", messages.translate(e.getMessage(), prepared.locale())));
                emitter.complete();
            } catch (RuntimeException e) { // the student closed the page (ClientGone), or a fault: stop here
                emitter.completeWithError(e);
            }
        });
        return emitter;
    }

    /** The student closed the page: stop reading the model. */
    private static final class ClientGone extends RuntimeException {
        ClientGone(IOException cause) {
            super(cause);
        }
    }

    private static void send(SseEmitter emitter, String event, Object data) {
        try {
            emitter.send(SseEmitter.event().name(event).data(data, MediaType.APPLICATION_JSON));
        } catch (IOException e) {
            throw new ClientGone(e);
        }
    }

    private static List<AssistantService.Turn> turns(ChatRequest body) {
        return body.messages().stream()
                .map(t -> new AssistantService.Turn(t.role(), t.content(), t.signature())).toList();
    }
}

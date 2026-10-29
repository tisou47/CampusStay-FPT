package vn.fpt.campusstay.controller.assistant;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.service.assistant.AssistantService;

/** The students' AI assistant (ADR-28, A-63): whether it is on, and one answer to the conversation sent. */
@RestController
@RequestMapping("/students/me/assistant")
class AssistantController {

    record TurnRequest(
            @NotNull(message = "Choose who wrote this message.")
            @Pattern(regexp = "user|assistant", message = "Choose who wrote this message.") String role,
            @NotBlank(message = "Write your question.")
            @Size(max = 2000, message = "Use at most 2000 characters.") String content) {
    }

    record ChatRequest(
            @NotEmpty(message = "Write your question.")
            @Size(max = 40, message = "The conversation is too long. Start a new one.")
            List<@Valid TurnRequest> messages) {
    }

    private final AssistantService assistant;

    AssistantController(AssistantService assistant) {
        this.assistant = assistant;
    }

    @GetMapping
    AssistantService.Status status() {
        return assistant.status();
    }

    @PostMapping("/chat")
    AssistantService.Reply chat(@Valid @RequestBody ChatRequest body) {
        return assistant.chat(body.messages().stream()
                .map(t -> new AssistantService.Turn(t.role(), t.content())).toList());
    }
}

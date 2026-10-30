package vn.fpt.campusstay.service.assistant;

import java.util.List;

/**
 * The language model behind the students' assistant (ADR-28): one chat turn, no tools (the student's data is in the
 * instructions). The only implementation is {@link OllamaAssistantModel}; tests replace it.
 */
public interface AssistantModel {

    /** @param role {@code system}, {@code user} or {@code assistant} */
    record Message(String role, String content) {
    }

    /** @return the model's answer, possibly blank */
    String chat(List<Message> messages);
}

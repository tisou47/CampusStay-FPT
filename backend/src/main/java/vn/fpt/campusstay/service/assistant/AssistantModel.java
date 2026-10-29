package vn.fpt.campusstay.service.assistant;

import java.util.List;
import java.util.Map;

/**
 * The language model behind the students' assistant (ADR-28): one chat turn with tool calling. The only implementation
 * is {@link OllamaAssistantModel}; tests replace it.
 */
public interface AssistantModel {

    /**
     * @param role      {@code system}, {@code user}, {@code assistant} or {@code tool}
     * @param toolCalls the tools an assistant message asks for; empty otherwise
     * @param toolName  the tool a {@code tool} message answers; null otherwise
     */
    record Message(String role, String content, List<ToolCall> toolCalls, String toolName) {

        public static Message of(String role, String content) {
            return new Message(role, content, List.of(), null);
        }

        public static Message toolResult(String toolName, String content) {
            return new Message("tool", content, List.of(), toolName);
        }
    }

    record ToolCall(String name, Map<String, Object> arguments) {
    }

    /** @param parameters the JSON Schema of the tool's arguments */
    record Tool(String name, String description, Map<String, Object> parameters) {
    }

    /** @return the model's next message: an answer, or tool calls to run before asking again */
    Message chat(List<Message> messages, List<Tool> tools);
}

package vn.fpt.campusstay.service.assistant;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import vn.fpt.campusstay.config.AssistantProperties;
import vn.fpt.campusstay.exception.ApiException;

/**
 * {@link AssistantModel} on Ollama's chat API ({@code POST /api/chat}, not streamed). A remote Ollama sits behind a
 * proxy that checks {@code campusstay.assistant.api-key}. Questions and answers are never logged.
 */
@Component
class OllamaAssistantModel implements AssistantModel {

    private static final Logger log = LoggerFactory.getLogger(OllamaAssistantModel.class);
    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(5);

    @JsonInclude(JsonInclude.Include.NON_EMPTY)
    record OllamaMessage(String role, String content, @JsonProperty("tool_calls") List<OllamaToolCall> toolCalls,
            @JsonProperty("tool_name") String toolName) {
    }

    record OllamaToolCall(OllamaFunctionCall function) {
    }

    record OllamaFunctionCall(String name, Map<String, Object> arguments) {
    }

    record OllamaTool(String type, Map<String, Object> function) {
    }

    record ChatRequest(String model, List<OllamaMessage> messages, List<OllamaTool> tools, boolean stream,
            Map<String, Object> options) {
    }

    record ChatResponse(OllamaMessage message) {
    }

    private final AssistantProperties config;
    private final RestClient http;

    @Autowired
    OllamaAssistantModel(AssistantProperties config) {
        this(config, RestClient.builder().requestFactory(requestFactory(config.timeout())));
    }

    /** For tests: the builder may be bound to a mock server. */
    OllamaAssistantModel(AssistantProperties config, RestClient.Builder builder) {
        this.config = config;
        this.http = builder.build();
    }

    @Override
    public Message chat(List<Message> messages, List<Tool> tools) {
        if (!config.enabled()) {
            throw offline();
        }
        ChatRequest request = new ChatRequest(config.model(), messages.stream().map(OllamaAssistantModel::toOllama)
                .toList(), tools.stream().map(OllamaAssistantModel::toOllama).toList(), false,
                Map.of("num_ctx", config.contextTokens(), "temperature", 0.2));
        ChatResponse response;
        try {
            response = http.post().uri(config.baseUrl().replaceAll("/+$", "") + "/api/chat")
                    .contentType(MediaType.APPLICATION_JSON)
                    .headers(h -> {
                        if (config.apiKey() != null && !config.apiKey().isBlank()) {
                            h.set(HttpHeaders.AUTHORIZATION, "Bearer " + config.apiKey());
                        }
                    })
                    .body(request)
                    .retrieve()
                    .body(ChatResponse.class);
        } catch (RestClientResponseException e) {
            // 404 = the model is not pulled on that server; 401/403 = the proxy's key differs.
            log.error("Assistant model server answered HTTP {}; check ASSISTANT_MODEL and ASSISTANT_API_KEY",
                    e.getStatusCode().value());
            throw offline();
        } catch (ResourceAccessException e) {
            log.warn("Assistant model server not reachable: {}", e.getMostSpecificCause().getClass().getSimpleName());
            throw offline();
        }
        if (response == null || response.message() == null) {
            log.error("Assistant model server answered without a message");
            throw offline();
        }
        OllamaMessage m = response.message();
        List<ToolCall> calls = m.toolCalls() == null ? List.of() : m.toolCalls().stream()
                .filter(c -> c.function() != null && c.function().name() != null)
                .map(c -> new ToolCall(c.function().name(),
                        c.function().arguments() == null ? Map.of() : c.function().arguments()))
                .toList();
        return new Message("assistant", m.content() == null ? "" : m.content(), calls, null);
    }

    static ApiException offline() {
        return ApiException.unavailable("ASSISTANT_OFFLINE", "The assistant is offline right now. Try again later.");
    }

    private static OllamaMessage toOllama(Message m) {
        List<OllamaToolCall> calls = m.toolCalls().stream()
                .map(c -> new OllamaToolCall(new OllamaFunctionCall(c.name(), c.arguments()))).toList();
        return new OllamaMessage(m.role(), m.content(), calls, m.toolName());
    }

    private static OllamaTool toOllama(Tool t) {
        Map<String, Object> function = new LinkedHashMap<>();
        function.put("name", t.name());
        function.put("description", t.description());
        function.put("parameters", t.parameters());
        return new OllamaTool("function", function);
    }

    private static JdkClientHttpRequestFactory requestFactory(Duration readTimeout) {
        HttpClient client = HttpClient.newBuilder().connectTimeout(CONNECT_TIMEOUT).build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(client);
        factory.setReadTimeout(readTimeout);
        return factory;
    }
}

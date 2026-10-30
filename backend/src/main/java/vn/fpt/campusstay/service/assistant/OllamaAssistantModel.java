package vn.fpt.campusstay.service.assistant;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;
import java.util.Map;

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
    /** Longest answer: a request for an essay ran past the timeout instead of being declined. */
    private static final int MAX_ANSWER_TOKENS = 400;

    record ChatRequest(String model, List<Message> messages, boolean stream, Map<String, Object> options) {
    }

    record ChatResponse(Message message) {
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
    public String chat(List<Message> messages) {
        if (!config.enabled()) {
            throw offline();
        }
        ChatRequest request = new ChatRequest(config.model(), messages, false,
                Map.of("num_ctx", config.contextTokens(), "num_predict", MAX_ANSWER_TOKENS, "temperature", 0));
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
        return response.message().content() == null ? "" : response.message().content();
    }

    static ApiException offline() {
        return ApiException.unavailable("ASSISTANT_OFFLINE", "The assistant is offline right now. Try again later.");
    }

    private static JdkClientHttpRequestFactory requestFactory(Duration readTimeout) {
        HttpClient client = HttpClient.newBuilder().connectTimeout(CONNECT_TIMEOUT).build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(client);
        factory.setReadTimeout(readTimeout);
        return factory;
    }
}

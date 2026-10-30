package vn.fpt.campusstay.config;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * {@code campusstay.assistant.*} — the students' AI assistant (ADR-28): a self-hosted Ollama server, set by operations
 * through environment variables.
 *
 * @param baseUrl         Ollama's address, e.g. {@code http://localhost:11434}; blank turns the assistant off
 * @param apiKey          bearer token sent to the proxy in front of a remote Ollama; blank sends none
 * @param model           Ollama model name
 * @param timeout         longest wait for one answer of the model
 * @param requestsPerHour questions one student may ask per hour, so one person cannot hold the GPU
 * @param contextTokens   context window asked of the model ({@code num_ctx}): the guide, the student's data and the
 *                        recent turns must fit
 */
@ConfigurationProperties("campusstay.assistant")
public record AssistantProperties(String baseUrl, String apiKey, String model, Duration timeout,
        int requestsPerHour, int contextTokens) {

    public boolean enabled() {
        return baseUrl != null && !baseUrl.isBlank();
    }
}

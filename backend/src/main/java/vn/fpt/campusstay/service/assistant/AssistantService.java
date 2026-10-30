package vn.fpt.campusstay.service.assistant;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import vn.fpt.campusstay.common.i18n.Locales;
import vn.fpt.campusstay.config.AssistantProperties;
import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.security.AuthenticatedUser;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Role;

/**
 * The students' AI assistant (ADR-28): answers questions about using CampusStay from the user guide in
 * {@code assistant/guide_<locale>.md} and the student's own data, which the model reads through
 * {@link StudentDataTools}. The conversation lives in the client (each request sends the recent turns); nothing is
 * stored and questions are never logged. Not transactional: the model's answer can take tens of seconds.
 */
@Service
public class AssistantService {

    /** A turn of the conversation sent by the client: {@code user} or {@code assistant}. */
    public record Turn(String role, String content) {
    }

    public record Status(boolean enabled) {
    }

    public record Reply(String reply) {
    }

    private static final Duration WINDOW = Duration.ofHours(1);
    private static final int MAX_TURNS = 12;
    /** Put just before the student's latest question when the conversation has earlier turns. */
    private static final Map<String, String> REMINDERS = Map.of(
            Locales.VI, "Câu hỏi tiếp theo là câu hỏi mới. Nếu nó hỏi về dữ liệu của sinh viên, hãy gọi công cụ phù hợp "
                    + "trước và chỉ trả lời theo kết quả của công cụ, không dựa vào các câu trả lời trước.",
            Locales.EN, "The next question is a new one. If it asks about the student's data, call the matching tool "
                    + "first and answer only from its result, not from earlier answers.");

    private final AssistantModel model;
    private final StudentDataTools tools;
    private final AssistantProperties config;
    private final CurrentUser currentUser;
    private final Clock clock;
    private final Map<String, String> guides = new ConcurrentHashMap<>();
    private final Map<Long, Deque<Instant>> asked = new ConcurrentHashMap<>();

    AssistantService(AssistantModel model, StudentDataTools tools, AssistantProperties config,
            CurrentUser currentUser, Clock clock) {
        this.model = model;
        this.tools = tools;
        this.config = config;
        this.currentUser = currentUser;
        this.clock = clock;
    }

    public Status status() {
        currentUser.require(Role.STUDENT);
        return new Status(config.enabled());
    }

    /** @param turns the conversation so far, ending with the student's question */
    public Reply chat(List<Turn> turns) {
        AuthenticatedUser user = currentUser.require(Role.STUDENT);
        if (!config.enabled()) {
            throw OllamaAssistantModel.offline();
        }
        if (!"user".equals(turns.getLast().role())) {
            throw ApiException.badRequest("ASSISTANT_NO_QUESTION", "End the conversation with your question.");
        }
        take(user.userId());

        String locale = locale(user);
        List<AssistantModel.Message> messages = new ArrayList<>();
        messages.add(AssistantModel.Message.of("system", systemPrompt(user, locale)));
        turns.subList(Math.max(0, turns.size() - MAX_TURNS), turns.size())
                .forEach(t -> messages.add(AssistantModel.Message.of(t.role(), t.content().strip())));
        if (messages.size() > 2) {
            // Earlier answers hold no tool results, and a small model follows them instead of the guide's rules.
            messages.add(messages.size() - 1, AssistantModel.Message.of("system", REMINDERS.get(locale)));
        }

        for (int round = 0; ; round++) {
            boolean last = round >= config.maxToolRounds();
            AssistantModel.Message answer = model.chat(messages, last ? List.of() : tools.definitions());
            if (answer.toolCalls().isEmpty() || last) {
                String text = answer.content().strip();
                if (text.isEmpty()) {
                    throw ApiException.unavailable("ASSISTANT_NO_ANSWER",
                            "The assistant could not answer. Ask in other words.");
                }
                return new Reply(text);
            }
            messages.add(answer);
            for (AssistantModel.ToolCall call : answer.toolCalls()) {
                messages.add(AssistantModel.Message.toolResult(call.name(), tools.call(call.name())));
            }
        }
    }

    /** Counts a question against the student's hourly limit. */
    private void take(long userId) {
        Instant now = Instant.now(clock);
        Deque<Instant> times = asked.computeIfAbsent(userId, id -> new ArrayDeque<>());
        synchronized (times) {
            while (!times.isEmpty() && !times.peekFirst().isAfter(now.minus(WINDOW))) {
                times.pollFirst();
            }
            if (times.size() >= config.requestsPerHour()) {
                throw ApiException.tooManyRequests("ASSISTANT_LIMIT",
                        "You have asked many questions in the last hour. Try again later.");
            }
            times.addLast(now);
        }
    }

    /** The language on screen first (the web sends it with every request), else the account's. */
    private static String locale(AuthenticatedUser user) {
        String asked = Locales.requested();
        return Locales.VI.equals(asked != null ? asked : user.locale()) ? Locales.VI : Locales.EN;
    }

    private String systemPrompt(AuthenticatedUser user, String locale) {
        LocalDate today = LocalDate.ofInstant(Instant.now(clock), TimeConfig.CAMPUS_ZONE);
        return guide(locale).replace("{name}", user.name()).replace("{today}", today.toString());
    }

    private String guide(String locale) {
        return guides.computeIfAbsent(locale, l -> {
            try (InputStream in = new ClassPathResource("assistant/guide_" + l + ".md").getInputStream()) {
                return new String(in.readAllBytes(), StandardCharsets.UTF_8);
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        });
    }
}

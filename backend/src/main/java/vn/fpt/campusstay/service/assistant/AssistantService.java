package vn.fpt.campusstay.service.assistant;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

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
 * {@code assistant/guide_<locale>.md} and the student's own data ({@link StudentData}, read again for every question).
 * Questions about the door code get a fixed answer without the model, which could make one up. The conversation lives
 * in the client (each request sends the recent turns); nothing is stored and questions are never logged. Not
 * transactional: the model's answer can take tens of seconds.
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
    /**
     * Put just before the student's latest question: the language and the rules sit thousands of tokens of English data
     * earlier, and Qwen models drift into Chinese in long answers.
     */
    private static final Map<String, String> REMINDERS = Map.of(
            Locales.VI, "Trả lời câu hỏi tiếp theo hoàn toàn bằng tiếng Việt (không dùng tiếng Trung hay tiếng Anh, trừ "
                    + "tên riêng và trạng thái trong dữ liệu). Trả lời theo phần Dữ liệu của sinh viên trong hướng dẫn, "
                    + "không dựa vào các câu trả lời trước.",
            Locales.EN, "Answer the next question entirely in English (no Chinese). Answer from the student's data in your "
                    + "instructions, not from earlier answers.");
    /** Asked once more when an answer still holds Chinese, Japanese or Korean script. */
    private static final Map<String, String> RETRIES = Map.of(
            Locales.VI, "Câu trả lời trước có chữ tiếng Trung. Viết lại toàn bộ câu trả lời chỉ bằng tiếng Việt.",
            Locales.EN, "Your previous answer had Chinese characters. Write the whole answer again in English only.");
    private static final Pattern CJK = Pattern.compile("[\\p{IsHan}\\p{IsHiragana}\\p{IsKatakana}\\p{IsHangul}]");
    /** "door code" in Vietnamese (with or without accents) and English. */
    private static final Pattern DOOR_CODE = Pattern.compile(
            "(m[aã]|m[aậ]t\\s*kh[aẩ]u|pass)\\s*(m[oở]\\s*)?(kh[oó]a\\s*)?c[uử]a|door\\s*-?\\s*(code|pin|password)|passcode");
    private static final Map<String, String> DOOR_CODE_ANSWERS = Map.of(
            Locales.VI, "Mình không xem được mã cửa phòng nên không thể cho bạn mã. Mã cửa chỉ hiện ở trang **Phòng của "
                    + "tôi** (nút \"Xem mã cửa\"). Bạn nhận mã khi đã trả tiền phòng, đã đến ngày nhận phòng và mã của "
                    + "phòng đã được nhân viên xác nhận trên khóa. Mã đổi mỗi khi có người rời phòng; đừng chia sẻ mã.",
            Locales.EN, "I cannot see door codes, so I cannot give you one. Your door code is shown only on **My Room** "
                    + "(the \"Show door code\" button). You receive it once your Balance is paid, check-in has started "
                    + "and Staff have confirmed the code on the lock. It changes whenever someone leaves the Room; do not "
                    + "share it.");

    private final AssistantModel model;
    private final StudentData data;
    private final AssistantProperties config;
    private final CurrentUser currentUser;
    private final Clock clock;
    private final Map<String, String> guides = new ConcurrentHashMap<>();
    private final Map<Long, Deque<Instant>> asked = new ConcurrentHashMap<>();

    AssistantService(AssistantModel model, StudentData data, AssistantProperties config,
            CurrentUser currentUser, Clock clock) {
        this.model = model;
        this.data = data;
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
        String question = Normalizer.normalize(turns.getLast().content(), Normalizer.Form.NFC).toLowerCase(Locale.ROOT);
        if (DOOR_CODE.matcher(question).find()) {
            return new Reply(DOOR_CODE_ANSWERS.get(locale));
        }

        List<AssistantModel.Message> messages = new ArrayList<>();
        messages.add(new AssistantModel.Message("system", systemPrompt(user, locale)));
        turns.subList(Math.max(0, turns.size() - MAX_TURNS), turns.size())
                .forEach(t -> messages.add(new AssistantModel.Message(t.role(), t.content().strip())));
        messages.add(messages.size() - 1, new AssistantModel.Message("system", REMINDERS.get(locale)));

        String text = model.chat(messages).strip();
        if (CJK.matcher(text).find()) {
            messages.add(new AssistantModel.Message("assistant", text));
            messages.add(new AssistantModel.Message("system", RETRIES.get(locale)));
            text = model.chat(messages).strip();
        }
        // Never shown to the student: a blank answer, or one still in the wrong script.
        if (text.isEmpty() || CJK.matcher(text).find()) {
            throw ApiException.unavailable("ASSISTANT_NO_ANSWER", "The assistant could not answer. Ask in other words.");
        }
        return new Reply(text);
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
        return guide(locale).replace("{name}", user.name()).replace("{today}", today.toString())
                .replace("{data}", data.read(locale));
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

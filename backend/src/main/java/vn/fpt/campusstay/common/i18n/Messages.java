package vn.fpt.campusstay.common.i18n;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.stereotype.Component;

/**
 * Vietnamese texts for the English messages the API writes for people (ADR-25): error and field
 * messages, and the words put into notifications. The catalog {@code i18n/messages_vi.txt} holds one
 * {@code English ⟶ Vietnamese} pair per line; {@code {0}}, {@code {1}} … stand for the values of a
 * message ("Block {0} does not exist."), and a value that is itself in the catalog is translated too.
 * A text without a pair stays in English, so a missing translation never hides a message.
 */
@Component
public class Messages {

    private static final String CATALOG = "i18n/messages_vi.txt";
    private static final String ARROW = " ⟶ ";
    private static final Pattern PLACEHOLDER = Pattern.compile("\\{(\\d)}");

    private record Template(Pattern english, String vietnamese, int[] order) {
    }

    private final Map<String, String> exact = new HashMap<>();
    private final List<Template> templates = new ArrayList<>();

    public Messages() {
        try (InputStream in = Messages.class.getClassLoader().getResourceAsStream(CATALOG)) {
            if (in == null) {
                throw new IllegalStateException("Missing " + CATALOG);
            }
            BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isBlank() || line.startsWith("#")) {
                    continue;
                }
                int arrow = line.indexOf(ARROW);
                if (arrow < 1) {
                    throw new IllegalStateException(CATALOG + ": no arrow in \"" + line + "\"");
                }
                add(line.substring(0, arrow).strip(), line.substring(arrow + ARROW.length()).strip());
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private void add(String english, String vietnamese) {
        Matcher m = PLACEHOLDER.matcher(english);
        if (!m.find()) {
            exact.put(english, vietnamese);
            return;
        }
        StringBuilder regex = new StringBuilder("^");
        List<Integer> order = new ArrayList<>();
        int last = 0;
        m.reset();
        while (m.find()) {
            regex.append(Pattern.quote(english.substring(last, m.start()))).append("(.+?)");
            order.add(Integer.parseInt(m.group(1)));
            last = m.end();
        }
        regex.append(Pattern.quote(english.substring(last))).append('$');
        templates.add(new Template(Pattern.compile(regex.toString(), Pattern.DOTALL), vietnamese,
                order.stream().mapToInt(Integer::intValue).toArray()));
    }

    /** The text in {@code locale} ({@code vi} or {@code en}); English when there is no translation. */
    public String translate(String text, String locale) {
        if (text == null || !Locales.VI.equals(locale)) {
            return text;
        }
        String found = exact.get(text);
        if (found != null) {
            return found;
        }
        for (Template t : templates) {
            Matcher m = t.english().matcher(text);
            if (m.matches()) {
                String out = t.vietnamese();
                for (int g = 0; g < t.order().length; g++) {
                    String value = m.group(g + 1);
                    out = out.replace("{" + t.order()[g] + "}", exact.getOrDefault(value, value));
                }
                return out;
            }
        }
        return text;
    }

    /** The text in the language of the current request ({@link Locales#ofRequest()}). */
    public String forRequest(String text) {
        return translate(text, Locales.ofRequest());
    }
}

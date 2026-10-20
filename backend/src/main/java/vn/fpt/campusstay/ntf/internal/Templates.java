package vn.fpt.campusstay.ntf.internal;

import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.web.util.HtmlUtils;

/** Minimal {{variable}} rendering. Values are HTML-escaped; unknown variables render empty. */
final class Templates {

    private static final Pattern VAR = Pattern.compile("\\{\\{\\s*([a-zA-Z0-9_]+)\\s*}}");

    private Templates() {
    }

    static String render(String template, Map<String, String> values, boolean html) {
        Matcher m = VAR.matcher(template);
        StringBuilder out = new StringBuilder();
        while (m.find()) {
            String value = values.getOrDefault(m.group(1), "");
            m.appendReplacement(out, Matcher.quoteReplacement(html ? HtmlUtils.htmlEscape(value) : value));
        }
        m.appendTail(out);
        return out.toString();
    }
}

package vn.fpt.campusstay.common.demo;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Runs a demo script of {@code db/demo/}: plain SQL statements, each ending with {@code ;} at the end of a line,
 * full-line {@code --} comments. {@code {{stage}}}, {@code {{now}}} and {@code {{today}}} become SQL literals of the
 * stage being loaded (the values come from the server, never from the request).
 */
public final class DemoScripts {

    private DemoScripts() {
    }

    public static void run(JdbcTemplate jdbc, String script, DemoData.Stage stage) {
        String sql = read("db/demo/" + script)
                .replace("{{stage}}", "'" + stage.code() + "'")
                .replace("{{now}}", "TIMESTAMPTZ '" + DateTimeFormatter.ISO_INSTANT.format(stage.now()) + "'")
                .replace("{{today}}", "DATE '" + stage.today() + "'");
        for (String statement : statements(sql)) {
            jdbc.execute(statement);
        }
    }

    static List<String> statements(String sql) {
        List<String> statements = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        for (String line : sql.split("\\R")) {
            String trimmed = line.strip();
            if (trimmed.isEmpty() || trimmed.startsWith("--")) {
                continue;
            }
            current.append(line).append('\n');
            if (trimmed.endsWith(";")) {
                statements.add(current.toString().strip().replaceFirst(";$", ""));
                current.setLength(0);
            }
        }
        if (!current.toString().isBlank()) {
            throw new IllegalStateException("A demo script ends without ';': " + current.toString().strip());
        }
        return statements;
    }

    private static String read(String path) {
        try (InputStream in = new ClassPathResource(path).getInputStream()) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("Demo script " + path + " is missing", e);
        }
    }
}

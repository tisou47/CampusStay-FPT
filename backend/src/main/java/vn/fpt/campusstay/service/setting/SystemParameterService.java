package vn.fpt.campusstay.service.setting;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonInclude;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;
import vn.fpt.campusstay.common.audit.ActorResolver;
import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.exception.FieldErrors;

/**
 * Admin › System parameters: typed key/value settings grouped into sections. A
 * PUT sends the sections back; only {@code value} is read from it. Parameters of a settings group (deadlines,
 * refunds and terminations, stay and renewal) are edited on their own screens ({@link AdminSettingsService}).
 */
@Service
public class SystemParameterService {

    public record Option(String value, String label) {
    }

    /** {@code value} is a number for whole-number parameters, else text; {@code options} only for choices. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Field(String key, String label, Object value, String helper, List<Option> options) {
    }

    public record Section(String title, List<Field> fields) {
    }

    public record SystemParameters(List<Section> sections) {
    }

    private static final int MAX_INT = 1_000_000;

    private final JdbcClient jdbc;
    private final JsonMapper json;
    private final ActorResolver actors;
    private final AuditLog audit;
    private final Clock clock;

    public SystemParameterService(JdbcClient jdbc, JsonMapper json, ActorResolver actors, AuditLog audit, Clock clock) {
        this.jdbc = jdbc;
        this.json = json;
        this.actors = actors;
        this.audit = audit;
        this.clock = clock;
    }

    private record Row(String key, String section, String label, String type, String value, String helper,
            String options) {
    }

    @Transactional(readOnly = true)
    public SystemParameters get() {
        Map<String, List<Field>> sections = new LinkedHashMap<>();
        for (Row r : rows()) {
            List<Option> options = r.options() == null ? null
                    : json.readValue(r.options(), new TypeReference<List<Option>>() {
                    });
            sections.computeIfAbsent(r.section(), s -> new ArrayList<>())
                    .add(new Field(r.key(), r.label(), typed(r.type(), r.value()), r.helper(), options));
        }
        List<Section> result = new ArrayList<>();
        sections.forEach((title, fields) -> result.add(new Section(title, fields)));
        return new SystemParameters(result);
    }

    @Transactional
    public SystemParameters save(SystemParameters body) {
        Map<String, Row> known = new LinkedHashMap<>();
        rows().forEach(r -> known.put(r.key(), r));
        FieldErrors errors = new FieldErrors();
        Map<String, String> updates = new LinkedHashMap<>();
        for (Section section : body.sections() == null ? List.<Section>of() : body.sections()) {
            for (Field f : section.fields() == null ? List.<Field>of() : section.fields()) {
                Row row = f == null ? null : known.get(f.key());
                if (row == null) {
                    errors.add(f == null || f.key() == null ? "sections" : f.key(), "This setting does not exist.");
                    continue;
                }
                String value = normalize(row, f.value());
                if (value == null) {
                    errors.add(row.key(), message(row));
                } else if (!value.equals(row.value())) {
                    updates.put(row.key(), value);
                }
            }
        }
        errors.throwIfAny();
        Map<String, Object> change = new LinkedHashMap<>();
        Timestamp now = Timestamp.from(Instant.now(clock));
        updates.forEach((key, value) -> {
            jdbc.sql("UPDATE cfg_parameter SET value = :value, updated_at = :now, updated_by = :by WHERE key = :key")
                    .param("value", value).param("now", now).param("by", actors.currentActor().id()).param("key", key)
                    .update();
            change.put(key, List.of(known.get(key).value(), value));
        });
        if (!change.isEmpty()) {
            audit.record("SYSTEM_PARAMETERS_UPDATED", AuditLog.Tone.INFO, "System parameters", null,
                    "System Parameters", change);
        }
        return get();
    }

    private List<Row> rows() {
        return jdbc.sql("""
                SELECT key, section, label, value_type, value, helper, options::text AS options
                FROM cfg_parameter WHERE settings_group IS NULL ORDER BY sort_order, key
                """)
                .query((rs, i) -> new Row(rs.getString("key"), rs.getString("section"), rs.getString("label"),
                        rs.getString("value_type"), rs.getString("value"), rs.getString("helper"),
                        rs.getString("options")))
                .list();
    }

    private static Object typed(String type, String value) {
        return switch (type) {
            case "INT" -> Integer.valueOf(value.trim());
            case "DECIMAL" -> new BigDecimal(value.trim());
            case "BOOL" -> Boolean.valueOf(value.trim());
            default -> value;
        };
    }

    /** The stored text for a submitted value, or null when it is not valid for the parameter's type. */
    private String normalize(Row row, Object value) {
        String text = value == null ? "" : String.valueOf(value).trim();
        switch (row.type()) {
            case "INT" -> {
                if (!text.matches("\\d{1,7}")) {
                    return null;
                }
                int n = Integer.parseInt(text);
                return n >= 1 && n <= MAX_INT ? String.valueOf(n) : null;
            }
            case "DECIMAL" -> {
                try {
                    return new BigDecimal(text).toPlainString();
                } catch (NumberFormatException e) {
                    return null;
                }
            }
            case "BOOL" -> {
                return text.equalsIgnoreCase("true") || text.equalsIgnoreCase("false") ? text.toLowerCase(Locale.ROOT) : null;
            }
            case "CHOICE" -> {
                List<Option> options = json.readValue(row.options(), new TypeReference<List<Option>>() {
                });
                return options.stream().anyMatch(o -> o.value().equals(text)) ? text : null;
            }
            default -> {
                return text.length() <= 500 ? text : null;
            }
        }
    }

    private static String message(Row row) {
        return switch (row.type()) {
            case "INT" -> "Enter a whole number from 1 to 1,000,000.";
            case "DECIMAL" -> "Enter a number.";
            case "BOOL" -> "Choose yes or no.";
            case "CHOICE" -> "Choose one of the options.";
            default -> "Use at most 500 characters.";
        };
    }
}

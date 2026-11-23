package vn.fpt.campusstay.service.setting;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.function.Predicate;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.entity.TermEntity;
import vn.fpt.campusstay.repository.TermRepository;

/**
 * Admin › Terms: the list of Terms. Terms are built and published with the wizard ({@link TermWizardService}; the
 * one-form create and update were removed, BE-3RD-08). Students only see published Terms ({@code GET /terms}).
 */
@Service
public class AdminTermService {

    /** The editable fields of a Term; null means "not filled in" (the contract sends empty fields as null). */
    public record TermValues(String name, LocalDate stayStart, LocalDate stayEnd, Instant registrationOpensAt,
            Instant registrationClosesAt, Instant resultsPublishedAt, Integer roommateHours, Integer depositHours,
            Instant balanceDueAt, LocalDate checkInStart, LocalDate checkInEnd, LocalDate checkOutBy) {
    }

    /**
     * Contract item of {@code GET /admin/terms}; status is a label (Draft, Published, Registration open, In stay,
     * Closed). A Draft of the wizard may miss its windows; {@code wizardStep} is the last step saved (7 = complete) and
     * {@code requestCode} the Manager's request it was built from (A-27).
     */
    public record TermItem(String id, String name, String status, LocalDate stayStart, LocalDate stayEnd,
            Instant registrationOpensAt, Instant registrationClosesAt, Instant resultsPublishedAt, Integer roommateHours,
            Integer depositHours, Instant balanceDueAt, LocalDate checkInStart, LocalDate checkInEnd,
            LocalDate checkOutBy, int wizardStep, String requestCode) {
    }

    private static final Pattern YEAR = Pattern.compile("(\\d{4})");

    private final TermRepository terms;
    private final JdbcClient jdbc;
    private final Clock clock;

    public AdminTermService(TermRepository terms, JdbcClient jdbc, Clock clock) {
        this.terms = terms;
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<TermItem> list() {
        Instant now = Instant.now(clock);
        Map<Long, String> requests = new LinkedHashMap<>();
        jdbc.sql("SELECT term_id, code FROM cfg_term_request WHERE term_id IS NOT NULL AND status <> 'REJECTED'")
                .query((rs, i) -> Map.entry(rs.getLong("term_id"), rs.getString("code"))).list()
                .forEach(e -> requests.put(e.getKey(), e.getValue()));
        return terms.findAllByOrderByStayStartDesc().stream().map(t -> item(t, now, requests.get(t.getId()))).toList();
    }

    /** {@code Spring 2027} → {@code SP27}; a suffix keeps it unique. The code is internal, never shown. */
    static String uniqueCode(String name, LocalDate stayStart, Predicate<String> taken) {
        String letters = name.trim().split("\\s+")[0].replaceAll("[^A-Za-z]", "");
        if (letters.isEmpty()) {
            letters = name.replaceAll("[^A-Za-z]", "");
        }
        String prefix = (letters.toUpperCase(Locale.ROOT) + "TM").substring(0, 2);
        Matcher m = YEAR.matcher(name);
        int year = stayStart.getYear();
        while (m.find()) {
            year = Integer.parseInt(m.group(1));
        }
        String base = prefix + String.format("%02d", year % 100);
        String code = base;
        for (int n = 2; taken.test(code); n++) {
            code = base + "-" + n;
        }
        return code;
    }

    private TermItem item(TermEntity t, Instant now, String requestCode) {
        TermValues v = t.values();
        return new TermItem(String.valueOf(t.getId()), v.name(), statusLabel(t, now), v.stayStart(), v.stayEnd(),
                v.registrationOpensAt(), v.registrationClosesAt(), v.resultsPublishedAt(), v.roommateHours(),
                v.depositHours(), v.balanceDueAt(), v.checkInStart(), v.checkInEnd(), v.checkOutBy(),
                t.getWizardStep() == null ? 7 : t.getWizardStep(), requestCode);
    }

    static String statusLabel(TermEntity t, Instant now) {
        LocalDate today = today(now);
        return switch (t.getStatus()) {
            case DRAFT -> "Draft";
            case CLOSED -> "Closed";
            case PUBLISHED -> {
                if (!now.isBefore(t.getRegistrationOpensAt()) && now.isBefore(t.getRegistrationClosesAt())) {
                    yield "Registration open";
                }
                if (today.isAfter(t.getStayEnd())) {
                    yield "Closed";
                }
                yield today.isBefore(t.getStayStart()) ? "Published" : "In stay";
            }
        };
    }

    private static LocalDate today(Instant now) {
        return LocalDate.ofInstant(now, TimeConfig.CAMPUS_ZONE);
    }

    /** The Audit Log diff ({@code field → [before, after]}) as the change announcement lists it. */
    @SuppressWarnings("unchecked")
    private static void put(Map<String, Object> change, String field, Object before, Object after) {
        if (!Objects.equals(before, after)) {
            change.put(field, List.of(String.valueOf(before), String.valueOf(after)));
        }
    }
}

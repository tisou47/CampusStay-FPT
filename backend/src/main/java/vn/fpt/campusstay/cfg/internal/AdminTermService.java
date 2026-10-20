package vn.fpt.campusstay.cfg.internal;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.shared.audit.AuditLog;
import vn.fpt.campusstay.shared.error.ApiException;
import vn.fpt.campusstay.shared.error.FieldErrors;
import vn.fpt.campusstay.shared.time.TimeConfig;

/**
 * Admin › Terms and Windows. A Term is a Draft until published; published Terms
 * may not overlap (also enforced by {@code ex_term_no_overlap}). Students only
 * see published Terms ({@code GET /terms}).
 */
@Service
public class AdminTermService {

    /** The editable fields of a Term; null means "not filled in" (the contract sends empty fields as null). */
    public record TermValues(String name, LocalDate stayStart, LocalDate stayEnd, Instant registrationOpensAt,
            Instant registrationClosesAt, Instant resultsPublishedAt, Integer roommateHours, Integer depositHours,
            Instant balanceDueAt, LocalDate checkInStart, LocalDate checkInEnd, LocalDate checkOutBy) {
    }

    /** Contract item of {@code GET /admin/terms}; status is a label (Draft, Published, Registration open, In stay, Closed). */
    public record TermItem(String id, String name, String status, LocalDate stayStart, LocalDate stayEnd,
            Instant registrationOpensAt, Instant registrationClosesAt, Instant resultsPublishedAt, int roommateHours,
            int depositHours, Instant balanceDueAt, LocalDate checkInStart, LocalDate checkInEnd,
            LocalDate checkOutBy) {
    }

    private static final Pattern YEAR = Pattern.compile("(\\d{4})");

    private final TermRepository terms;
    private final JdbcClient jdbc;
    private final AuditLog audit;
    private final Clock clock;

    public AdminTermService(TermRepository terms, JdbcClient jdbc, AuditLog audit, Clock clock) {
        this.terms = terms;
        this.jdbc = jdbc;
        this.audit = audit;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<TermItem> list() {
        Instant now = Instant.now(clock);
        return terms.findAllByOrderByStayStartDesc().stream().map(t -> item(t, now)).toList();
    }

    @Transactional
    public long create(TermValues values) {
        int depositHours = values.depositHours() != null ? values.depositHours() : defaultDepositHours();
        validate(values, depositHours);
        TermEntity term = terms.saveAndFlush(new TermEntity(uniqueCode(values.name(), values.stayStart()), values,
                depositHours));
        audit.record("TERM_CREATED", AuditLog.Tone.INFO, "Term", term.getId(), term.getName(), null);
        return term.getId();
    }

    @Transactional
    public long update(long id, TermValues values) {
        TermEntity term = find(id);
        Instant now = Instant.now(clock);
        if (term.getStatus() == TermEntity.Status.CLOSED
                || term.getStatus() == TermEntity.Status.PUBLISHED && today(now).isAfter(term.getStayEnd())) {
            throw ApiException.conflict("TERM_CLOSED", "This Term has ended and can no longer be changed.");
        }
        int depositHours = values.depositHours() != null ? values.depositHours() : defaultDepositHours();
        validate(values, depositHours);
        if (term.getStatus() != TermEntity.Status.DRAFT) {
            checkNoOverlap(id, values.stayStart(), values.stayEnd());
        }
        TermValues before = term.values();
        term.apply(values, depositHours);
        terms.saveAndFlush(term);
        Map<String, Object> change = diff(before, term.values());
        if (!change.isEmpty()) {
            audit.record("TERM_UPDATED", AuditLog.Tone.INFO, "Term", id, term.getName(), change);
        }
        return id;
    }

    /** Draft → Published: students see the Term and its windows. */
    @Transactional
    public long publish(long id) {
        TermEntity term = find(id);
        if (term.getStatus() != TermEntity.Status.DRAFT) {
            throw ApiException.conflict("TERM_ALREADY_PUBLISHED", "This Term is already published.");
        }
        checkNoOverlap(id, term.getStayStart(), term.getStayEnd());
        term.publish(Instant.now(clock));
        terms.saveAndFlush(term);
        audit.record("TERM_PUBLISHED", AuditLog.Tone.SUCCESS, "Term", id, term.getName(), null);
        return id;
    }

    private TermEntity find(long id) {
        return terms.findById(id).orElseThrow(() -> ApiException.notFound("This Term does not exist."));
    }

    private void validate(TermValues v, int depositHours) {
        FieldErrors errors = new FieldErrors();
        errors.check(v.name() != null && !v.name().isBlank(), "name", "Enter the Term name.");
        errors.check(v.stayStart() != null, "stayStart", "Enter the first day of the stay.");
        errors.check(v.stayEnd() != null, "stayEnd", "Enter the last day of the stay.");
        errors.check(v.registrationOpensAt() != null, "registrationOpensAt", "Enter when registration opens.");
        errors.check(v.registrationClosesAt() != null, "registrationClosesAt", "Enter when registration closes.");
        errors.check(v.resultsPublishedAt() != null, "resultsPublishedAt", "Enter when assignment results come out.");
        errors.check(v.roommateHours() != null, "roommateHours", "Enter the roommate confirmation window in hours.");
        errors.check(v.balanceDueAt() != null, "balanceDueAt", "Enter when the Balance is due.");
        errors.check(v.checkInStart() != null, "checkInStart", "Enter the first Check-in day.");
        errors.check(v.checkInEnd() != null, "checkInEnd", "Enter the last Check-in day.");
        errors.check(v.checkOutBy() != null, "checkOutBy", "Enter the Check-out deadline.");
        errors.check(v.roommateHours() == null || v.roommateHours() > 0, "roommateHours", "Enter a number of hours above 0.");
        errors.check(depositHours > 0, "depositHours", "Enter a number of hours above 0.");
        if (v.stayStart() != null && v.stayEnd() != null) {
            errors.check(v.stayStart().isBefore(v.stayEnd()), "stayEnd", "The stay must end after it starts.");
        }
        if (v.registrationOpensAt() != null && v.registrationClosesAt() != null) {
            errors.check(v.registrationOpensAt().isBefore(v.registrationClosesAt()), "registrationClosesAt",
                    "Registration must close after it opens.");
        }
        if (v.registrationClosesAt() != null && v.resultsPublishedAt() != null) {
            errors.check(!v.resultsPublishedAt().isBefore(v.registrationClosesAt()), "resultsPublishedAt",
                    "Results come out after registration closes.");
        }
        if (v.checkInStart() != null && v.checkInEnd() != null) {
            errors.check(!v.checkInEnd().isBefore(v.checkInStart()), "checkInEnd",
                    "Check-in must end on or after its first day.");
        }
        if (v.checkInEnd() != null && v.stayEnd() != null) {
            errors.check(!v.checkInEnd().isAfter(v.stayEnd()), "checkInEnd", "Check-in must end before the stay ends.");
        }
        if (v.checkOutBy() != null && v.stayStart() != null) {
            errors.check(!v.checkOutBy().isBefore(v.stayStart()), "checkOutBy", "Check-out must be after the stay starts.");
        }
        errors.throwIfAny();
    }

    private void checkNoOverlap(long id, LocalDate stayStart, LocalDate stayEnd) {
        Optional<String> other = jdbc.sql("""
                SELECT name FROM cfg_term
                WHERE status <> 'DRAFT' AND id <> :id
                  AND daterange(stay_start, stay_end, '[]') && daterange(CAST(:start AS date), CAST(:end AS date), '[]')
                ORDER BY stay_start LIMIT 1
                """)
                .param("id", id).param("start", stayStart).param("end", stayEnd)
                .query(String.class).optional();
        if (other.isPresent()) {
            throw ApiException.conflict("TERM_OVERLAP", "The stay dates overlap " + other.get() + ". Published Terms cannot overlap.");
        }
    }

    private int defaultDepositHours() {
        return jdbc.sql("SELECT deposit_hours FROM cfg_fee_policy WHERE id = 1").query(Integer.class).single();
    }

    /** {@code Spring 2027} → {@code SP27}; a suffix keeps it unique. The code is internal, never shown. */
    private String uniqueCode(String name, LocalDate stayStart) {
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
        for (int n = 2; terms.existsByCode(code); n++) {
            code = base + "-" + n;
        }
        return code;
    }

    private TermItem item(TermEntity t, Instant now) {
        TermValues v = t.values();
        return new TermItem(String.valueOf(t.getId()), v.name(), statusLabel(t, now), v.stayStart(), v.stayEnd(),
                v.registrationOpensAt(), v.registrationClosesAt(), v.resultsPublishedAt(), v.roommateHours(),
                v.depositHours(), v.balanceDueAt(), v.checkInStart(), v.checkInEnd(), v.checkOutBy());
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

    private static Map<String, Object> diff(TermValues before, TermValues after) {
        Map<String, Object> change = new LinkedHashMap<>();
        put(change, "name", before.name(), after.name());
        put(change, "stayStart", before.stayStart(), after.stayStart());
        put(change, "stayEnd", before.stayEnd(), after.stayEnd());
        put(change, "registrationOpensAt", before.registrationOpensAt(), after.registrationOpensAt());
        put(change, "registrationClosesAt", before.registrationClosesAt(), after.registrationClosesAt());
        put(change, "resultsPublishedAt", before.resultsPublishedAt(), after.resultsPublishedAt());
        put(change, "roommateHours", before.roommateHours(), after.roommateHours());
        put(change, "depositHours", before.depositHours(), after.depositHours());
        put(change, "balanceDueAt", before.balanceDueAt(), after.balanceDueAt());
        put(change, "checkInStart", before.checkInStart(), after.checkInStart());
        put(change, "checkInEnd", before.checkInEnd(), after.checkInEnd());
        put(change, "checkOutBy", before.checkOutBy(), after.checkOutBy());
        return change;
    }

    private static void put(Map<String, Object> change, String field, Object before, Object after) {
        if (!Objects.equals(before, after)) {
            change.put(field, List.of(String.valueOf(before), String.valueOf(after)));
        }
    }
}

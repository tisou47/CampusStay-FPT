package vn.fpt.campusstay.service.auth;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

import org.springframework.stereotype.Component;

import vn.fpt.campusstay.common.i18n.Locales;
import vn.fpt.campusstay.common.i18n.Messages;
import vn.fpt.campusstay.service.setting.EligibilityRules;
import vn.fpt.campusstay.service.setting.Lookups;

/**
 * Reads the directory fields of a student (spec §6.1, §6.2) the way people type them on the sign-up form, the
 * Manager's edit form and the student list file: codes or labels, in English or Vietnamese where that is usual.
 */
@Component
class StudentFields {

    /** Enrollment statuses (code → label) in display order. */
    static final Map<String, String> ENROLLMENT = new LinkedHashMap<>();

    static {
        ENROLLMENT.put("ENROLLED", "Enrolled");
        ENROLLMENT.put("SUSPENDED", "Suspended");
        ENROLLMENT.put("GRADUATED", "Graduated");
        ENROLLMENT.put("WITHDRAWN", "Withdrawn");
        ENROLLMENT.put("NOT_ENROLLED", "Not enrolled");
    }

    private static final Pattern COHORT = Pattern.compile("K\\d{2}");
    /** Day 0 of spreadsheet dates (XLSX stores 14/03/2005 as 38425). */
    private static final LocalDate SPREADSHEET_EPOCH = LocalDate.of(1899, 12, 30);
    private static final DateTimeFormatter DMY = DateTimeFormatter.ofPattern("d/M/uuuu");

    private final Lookups lookups;
    private final EligibilityRules rules;
    private final Messages messages;

    StudentFields(Lookups lookups, EligibilityRules rules, Messages messages) {
        this.lookups = lookups;
        this.rules = rules;
        this.messages = messages;
    }

    /** {@code M} or {@code F} from M/F, Male/Female or Nam/Nữ. */
    static Optional<String> gender(String value) {
        if (value == null) {
            return Optional.empty();
        }
        return switch (value.strip().toLowerCase(Locale.ROOT)) {
            case "m", "male", "nam" -> Optional.of("M");
            case "f", "female", "nữ", "nu" -> Optional.of("F");
            default -> Optional.empty();
        };
    }

    static String genderLabel(String code) {
        return "M".equals(code) ? "Male" : "F".equals(code) ? "Female" : code;
    }

    /** {@code K19} from k19, K19 or 19. */
    static Optional<String> cohort(String value) {
        if (value == null || value.isBlank()) {
            return Optional.empty();
        }
        String v = value.strip().toUpperCase(Locale.ROOT);
        if (v.matches("\\d{2}")) {
            v = "K" + v;
        }
        return COHORT.matcher(v).matches() ? Optional.of(v) : Optional.empty();
    }

    /** The cohort written in a student code ({@code SE190421} → {@code K19}). */
    static String cohortOf(String studentCode) {
        return studentCode == null || studentCode.length() < 4 ? null : "K" + studentCode.substring(2, 4);
    }

    /** {@code YYYY-MM-DD}, {@code dd/MM/yyyy}, or the day number a spreadsheet stores for a date. */
    static Optional<LocalDate> date(String value) {
        if (value == null || value.isBlank()) {
            return Optional.empty();
        }
        String v = value.strip();
        if (v.matches("\\d{4,5}")) {
            return Optional.of(SPREADSHEET_EPOCH.plusDays(Long.parseLong(v)));
        }
        try {
            return Optional.of(v.contains("/") ? LocalDate.parse(v, DMY) : LocalDate.parse(v));
        } catch (DateTimeParseException e) {
            return Optional.empty();
        }
    }

    /** A date of birth that makes sense for a university student. */
    static boolean plausibleBirthDate(LocalDate date, LocalDate today) {
        return !date.isAfter(today.minusYears(14)) && !date.isBefore(today.minusYears(80));
    }

    /** 8 to 15 digits, as on the Application. */
    static boolean phone(String value) {
        if (value == null || value.isBlank() || value.length() > 20) {
            return false;
        }
        long digits = value.chars().filter(Character::isDigit).count();
        return digits >= 8 && digits <= 15;
    }

    /** The code of the {@code MAJOR} option list, from its code, its English label or its Vietnamese name. */
    Optional<String> major(String value) {
        if (value == null || value.isBlank()) {
            return Optional.empty();
        }
        String v = value.strip();
        return lookups.find("MAJOR", v)
                .or(() -> majors().stream().filter(l -> v.equalsIgnoreCase(messages.translate(l.label(), Locales.VI))).findFirst())
                .map(Lookups.Lookup::code);
    }

    List<Lookups.Lookup> majors() {
        return lookups.list("MAJOR");
    }

    /** The code of the {@code REGION} option list, from its code or label. */
    Optional<String> region(String value) {
        return value == null || value.isBlank() ? Optional.empty()
                : lookups.find("REGION", value.strip()).map(Lookups.Lookup::code);
    }

    List<Lookups.Lookup> regions() {
        return lookups.list("REGION");
    }

    /** An enrollment status from its code or label (spaces, hyphens and underscores alike). */
    static Optional<String> enrollment(String value) {
        if (value == null || value.isBlank()) {
            return Optional.empty();
        }
        String v = value.strip().replaceAll("[\\s_-]+", " ").toLowerCase(Locale.ROOT);
        return ENROLLMENT.entrySet().stream()
                .filter(e -> e.getKey().replace('_', ' ').toLowerCase(Locale.ROOT).equals(v)
                        || e.getValue().toLowerCase(Locale.ROOT).equals(v))
                .map(Map.Entry::getKey).findFirst();
    }

    /** Keys of the priority groups the Admin defined. */
    List<String> priorityGroups() {
        return rules.priorityGroupKeys();
    }
}

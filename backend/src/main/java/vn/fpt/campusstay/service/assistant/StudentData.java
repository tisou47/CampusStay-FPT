package vn.fpt.campusstay.service.assistant;

import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Supplier;
import java.util.regex.Pattern;

import org.springframework.stereotype.Component;

import tools.jackson.databind.json.JsonMapper;

import vn.fpt.campusstay.common.i18n.Locales;
import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.dto.PageQuery;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.service.application.StudentApplicationQueries;
import vn.fpt.campusstay.service.assignment.StudentAllocationService;
import vn.fpt.campusstay.service.billing.StudentInvoiceService;
import vn.fpt.campusstay.service.notification.AnnouncementService;
import vn.fpt.campusstay.service.request.StudentRequestsService;
import vn.fpt.campusstay.service.setting.RegistrationPeriodService;

/**
 * The signed-in student's data the assistant answers from (ADR-28), read again for every question and put in the
 * model's instructions. A small model does not reliably decide when to call tools, so it gets everything a student
 * screen shows at once. Each section is read through the same service as its screen, so the student's scope and the
 * services' own checks apply: the model never sees another student's records, door codes or anything the screens do
 * not show. JSON without null fields; an empty list stays, so the model sees "none" rather than nothing; times in campus
 * time and amounts written out in VND (a small model misreads raw numbers).
 */
@Component
class StudentData {

    private static final int MAX_SECTION_CHARS = 4000;
    private static final Pattern INSTANT = Pattern.compile("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?Z");
    private static final DateTimeFormatter CAMPUS_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")
            .withZone(TimeConfig.CAMPUS_ZONE);
    /** Fields the model must not see: the check-in QR pass, which a small model gave out as the door code. */
    private static final Set<String> HIDDEN = Set.of("pass");
    private static final Set<String> MONEY = Set.of("amount", "price", "deposit", "termPrice", "fromPrice", "toPrice",
            "outstanding", "paidTotal", "utilityDeposit", "refund");

    private final Map<String, Supplier<Object>> sections = new LinkedHashMap<>();
    private final JsonMapper json;

    StudentData(StudentApplicationQueries applications, StudentAllocationService allocations,
            StudentInvoiceService invoices, StudentRequestsService requests, AnnouncementService announcements,
            RegistrationPeriodService periods, JsonMapper json) {
        this.json = json;
        // Section titles name the screen each one comes from, so the model can point the student to it.
        sections.put("Home: current Term, Application and Room", () -> applications.home(null));
        sections.put("Registration: my Applications", () -> applications.mine(PageQuery.of(1, 10)));
        sections.put("My Room: Room, Bed, roommates, check-in, stay length, next Term",
                () -> allocations.mine(null));
        sections.put("Payments: my Invoices, amounts in VND, what is paid and owed",
                () -> invoices.mine(null, PageQuery.of(1, 20)));
        sections.put("Requests: my Maintenance Requests", () -> requests.mine("maintenance", null, PageQuery.of(1, 20)));
        sections.put("Requests: my next-Term requests (room changes, swaps, Room Class changes, extensions, end of "
                + "stay)", () -> requests.mine("room-changes", null, PageQuery.of(1, 20)));
        sections.put("Home: dormitory announcements", announcements::board);
        // A small model took the first row of this price list for the student's own Room Type: the title says it is not.
        sections.put("Registration period: status, timeline, prices of every Room Type and Class, house rules, FAQ "
                + "(general information, not the student's own Room)", () -> {
            RegistrationPeriodService.Current current = periods.current();
            return current.card() == null ? current : periods.details(Long.parseLong(current.card().termId()));
        });
    }

    /**
     * @param locale {@code vi} or {@code en}: how amounts are written
     * @return one Markdown heading and one line of JSON per section; a section that cannot be read says why
     */
    String read(String locale) {
        DecimalFormat vnd = new DecimalFormat("#,##0 ₫",
                DecimalFormatSymbols.getInstance(Locales.VI.equals(locale) ? Locale.GERMANY : Locale.US));
        StringBuilder out = new StringBuilder();
        sections.forEach((title, read) -> {
            String text;
            try {
                text = json.writeValueAsString(clean(json.convertValue(read.get(), Object.class), vnd));
            } catch (ApiException e) {
                text = json.writeValueAsString(Map.of("error", e.getMessage()));
            }
            if (text.length() > MAX_SECTION_CHARS) {
                text = text.substring(0, MAX_SECTION_CHARS) + " …(cut)";
            }
            out.append("## ").append(title).append('\n').append(text).append("\n\n");
        });
        return out.toString().strip();
    }

    /** Drops hidden and null fields, writes amounts in VND and UTC instants in campus time (the model does not convert). */
    private static Object clean(Object value, DecimalFormat vnd) {
        if (value instanceof Map<?, ?> map) {
            Map<String, Object> out = new LinkedHashMap<>();
            map.forEach((k, v) -> {
                String key = String.valueOf(k);
                Object c = HIDDEN.contains(key) ? null
                        : MONEY.contains(key) && v instanceof Number n ? vnd.format(n) : clean(v, vnd);
                if (c != null) {
                    out.put(key, c);
                }
            });
            return out;
        }
        if (value instanceof List<?> list) {
            return list.stream().map(v -> clean(v, vnd)).toList();
        }
        if (value instanceof String s && INSTANT.matcher(s).matches()) {
            try {
                return CAMPUS_TIME.format(Instant.parse(s));
            } catch (DateTimeParseException e) {
                return s;
            }
        }
        return value;
    }
}

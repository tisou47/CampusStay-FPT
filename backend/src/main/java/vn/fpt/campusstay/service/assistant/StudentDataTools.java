package vn.fpt.campusstay.service.assistant;

import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
import java.util.regex.Pattern;

import org.springframework.stereotype.Component;

import tools.jackson.databind.json.JsonMapper;

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
 * The tools the assistant's model may call (ADR-28). Each one reads exactly what a student screen shows, through the
 * same service, so the signed-in student's scope and the services' own checks apply: the model never sees another
 * student's records, door codes or anything the screens do not show. Results are JSON without null fields, times in
 * campus time.
 */
@Component
class StudentDataTools {

    private static final int MAX_RESULT_CHARS = 6000;
    private static final Pattern INSTANT = Pattern.compile("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?Z");
    private static final DateTimeFormatter CAMPUS_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")
            .withZone(TimeConfig.CAMPUS_ZONE);
    private static final Map<String, Object> NO_ARGUMENTS = Map.of("type", "object", "properties", Map.of());

    private record Entry(AssistantModel.Tool tool, Supplier<Object> read) {
    }

    private final Map<String, Entry> tools = new LinkedHashMap<>();
    private final JsonMapper json;

    StudentDataTools(StudentApplicationQueries applications, StudentAllocationService allocations,
            StudentInvoiceService invoices, StudentRequestsService requests, AnnouncementService announcements,
            RegistrationPeriodService periods, JsonMapper json) {
        this.json = json;
        add("my_overview", "The student's home page: current Term, their Application status and their Room, if any.",
                () -> applications.home(null));
        add("my_applications", "The student's Applications (registrations) with their status.",
                () -> applications.mine(PageQuery.of(1, 10)));
        add("my_room", "The student's Room, Bed, roommates, check-in window, stay length and next-Term status.",
                () -> allocations.mine(null));
        add("my_invoices", "The student's Invoices: Deposit, Balance, room fees and Utility, with amounts in VND, "
                + "due dates and status.", () -> invoices.mine(null, PageQuery.of(1, 20)));
        add("my_requests", "The student's Maintenance Requests, Room-Change Requests and swaps with their status.",
                () -> requests.mine(null, null, PageQuery.of(1, 20)));
        add("dormitory_board", "Announcements of the dormitory shown to the student now (registration, money, rules, "
                + "operations).", announcements::board);
        add("registration_period", "The current registration period: status, timeline, prices per Room Type and "
                + "Room Class, rooms, house rules and FAQ.", () -> {
                    RegistrationPeriodService.Current current = periods.current();
                    return current.card() == null ? current
                            : periods.details(Long.parseLong(current.card().termId()));
                });
    }

    List<AssistantModel.Tool> definitions() {
        return tools.values().stream().map(Entry::tool).toList();
    }

    /** @return the tool's result as JSON for the model, or an {@code error} the model can tell the student */
    String call(String name) {
        Entry entry = tools.get(name);
        if (entry == null) {
            return "{\"error\":\"Unknown tool. Use one of: " + String.join(", ", tools.keySet()) + "\"}";
        }
        Object value;
        try {
            value = entry.read().get();
        } catch (ApiException e) {
            return json.writeValueAsString(Map.of("error", e.getMessage()));
        }
        String text = json.writeValueAsString(clean(json.convertValue(value, Object.class)));
        return text.length() <= MAX_RESULT_CHARS ? text : text.substring(0, MAX_RESULT_CHARS) + " …(cut)";
    }

    private void add(String name, String description, Supplier<Object> read) {
        tools.put(name, new Entry(new AssistantModel.Tool(name, description, NO_ARGUMENTS), read));
    }

    /** Drops null fields and empty lists, and writes UTC instants in campus time (the model does not convert). */
    private static Object clean(Object value) {
        if (value instanceof Map<?, ?> map) {
            Map<String, Object> out = new LinkedHashMap<>();
            map.forEach((k, v) -> {
                Object c = clean(v);
                if (c != null && !(c instanceof List<?> l && l.isEmpty())) {
                    out.put(String.valueOf(k), c);
                }
            });
            return out;
        }
        if (value instanceof List<?> list) {
            return list.stream().map(StudentDataTools::clean).toList();
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

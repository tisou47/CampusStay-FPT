package vn.fpt.campusstay.service.notification;

import java.math.BigDecimal;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.text.NumberFormat;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.common.i18n.Locales;
import vn.fpt.campusstay.common.i18n.Messages;
import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.event.PolicyChanged;
import vn.fpt.campusstay.event.TermPublished;
import vn.fpt.campusstay.event.TermRequestCommented;
import vn.fpt.campusstay.event.TermRequestDecided;
import vn.fpt.campusstay.event.TermRequestSubmitted;
import vn.fpt.campusstay.event.ValueChange;

/**
 * Registration periods (spec §6.3–§6.5, §10). Admins and Managers hear about requests, comments and decisions in-app;
 * a published Term notifies every Manager (link: the Term dashboard) and becomes the Term announcement on the
 * students' board; every money or policy change becomes a change announcement listing old → new values. All run in
 * the publisher's transaction.
 */
@Component
class RegistrationPeriodListener {

    private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm")
            .withZone(TimeConfig.CAMPUS_ZONE);
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private static final Set<String> SYSTEM_SUBJECTS = Set.of("Room Types", "Room Classes", "Deposit and refunds",
            "Utility", "Deadlines and reminders", "Refunds, penalties and terminations", "Stay and renewal");
    private static final int VALUE_CHARS = 120;

    private final InAppNotifier notifier;
    private final AnnouncementService announcements;
    private final Messages messages;
    private final Clock clock;

    RegistrationPeriodListener(InAppNotifier notifier, AnnouncementService announcements, Messages messages,
            Clock clock) {
        this.notifier = notifier;
        this.announcements = announcements;
        this.messages = messages;
        this.clock = clock;
    }

    @EventListener
    void on(TermRequestSubmitted e) {
        Map<String, String> values = Map.of("name", e.requesterName(), "term", e.termName(), "code", e.code(),
                "dates", DAY.format(e.stayStart()) + " – " + DAY.format(e.stayEnd()));
        e.adminIds().forEach(u -> notifier.notify(u, "TERM_REQUEST_SUBMITTED", values,
                "/admin/term-requests?id=" + e.requestId()));
        e.managerIds().forEach(u -> notifier.notify(u, "TERM_REQUEST_SUBMITTED", values,
                "/manager/term-requests?id=" + e.requestId()));
    }

    @EventListener
    void on(TermRequestCommented e) {
        Map<String, String> values = Map.of("name", e.authorName(), "term", e.termName(), "code", e.code(),
                "comment", e.comment());
        e.adminIds().forEach(u -> notifier.notify(u, "TERM_REQUEST_COMMENTED", values,
                "/admin/term-requests?id=" + e.requestId()));
        e.managerIds().forEach(u -> notifier.notify(u, "TERM_REQUEST_COMMENTED", values,
                "/manager/term-requests?id=" + e.requestId()));
    }

    @EventListener
    void on(TermRequestDecided e) {
        notifier.notify(e.requesterId(), "TERM_REQUEST_" + e.status(), Map.of("name", e.adminName(), "term",
                e.termName(), "code", e.code(), "note", e.note() == null ? "" : e.note()),
                "/manager/term-requests?id=" + e.requestId());
    }

    @EventListener
    void on(TermPublished e) {
        for (long manager : e.managerIds()) {
            notifier.notify(manager, "TERM_PUBLISHED", Map.of("term", e.termName(), "opensAt",
                    WHEN.format(e.registrationOpensAt())), "/manager/terms/" + e.termId());
        }
        Instant now = Instant.now(clock);
        boolean upcoming = e.registrationClosesAt().isAfter(now);
        String stay = DAY.format(e.stayStart()) + " – " + DAY.format(e.stayEnd());
        String body = e.termName() + " (stay " + stay + "): registration opens on " + WHEN.format(e.registrationOpensAt())
                + " and closes on " + WHEN.format(e.registrationClosesAt()) + ". Prices start at "
                + money(e.fromPrice(), false) + " per Bed. Open the registration period for its timeline, prices, "
                + "rooms and house rules.";
        String bodyVi = e.termName() + " (ở từ " + stay.replace(" – ", " đến ") + "): đăng ký mở lúc "
                + WHEN.format(e.registrationOpensAt()) + " và đóng lúc " + WHEN.format(e.registrationClosesAt())
                + ". Giá từ " + money(e.fromPrice(), true) + " mỗi giường. Mở đợt đăng ký để xem lịch, giá, phòng và nội quy.";
        announcements.publish(new AnnouncementService.SystemAnnouncement("REGISTRATION", "ALL_STUDENTS", e.termId(),
                List.of(), "Registration period: " + e.termName(), "Đợt đăng ký: " + e.termName(), body, bodyVi, null,
                "/student/registration-periods/" + e.termId(), upcoming, upcoming ? e.registrationClosesAt() : null,
                "TERM_PUBLISHED"));
    }

    @EventListener
    void on(PolicyChanged e) {
        if (e.changes().isEmpty()) {
            return;
        }
        String subjectVi = SYSTEM_SUBJECTS.contains(e.subject()) || e.buildingId() != null
                ? messages.translate(e.subject(), Locales.VI) : e.subject();
        StringBuilder body = new StringBuilder(e.subject()).append(" changed:");
        StringBuilder bodyVi = new StringBuilder(subjectVi).append(" đã thay đổi:");
        for (ValueChange c : e.changes()) {
            body.append("\n• ").append(c.field()).append(": ").append(value(c.type(), c.before(), false)).append(" → ")
                    .append(value(c.type(), c.after(), false));
            bodyVi.append("\n• ").append(messages.translate(c.field(), Locales.VI)).append(": ")
                    .append(value(c.type(), c.before(), true)).append(" → ").append(value(c.type(), c.after(), true));
        }
        if (e.reason() != null) {
            body.append("\nReason: ").append(e.reason());
            bodyVi.append("\nLý do: ").append(e.reason());
        }
        String source = e.buildingId() != null ? "BLOCK_SETTINGS" : e.termId() != null ? "TERM_CHANGED" : "POLICY_CHANGED";
        announcements.publish(new AnnouncementService.SystemAnnouncement(e.category(),
                e.buildingId() != null ? "BLOCK_RESIDENTS" : "ALL_STUDENTS", e.termId(),
                e.buildingId() == null ? List.of() : List.of(e.buildingId()), "Changed: " + e.subject(),
                "Thay đổi: " + subjectVi, body.toString(), bodyVi.toString(), new ArrayList<>(e.changes()),
                e.termId() == null ? null : "/student/registration-periods/" + e.termId(), false, null, source));
    }

    /** A value as people read it in the announcement's language; a missing one is a dash. */
    private String value(String type, String raw, boolean vi) {
        if (raw == null || raw.isBlank()) {
            return "—";
        }
        try {
            return switch (type == null ? "TEXT" : type) {
                case "DATE" -> DAY.format(LocalDate.parse(raw));
                case "DATETIME" -> WHEN.format(Instant.parse(raw));
                case "MONEY" -> money(Long.parseLong(raw), vi);
                case "PERCENT" -> new BigDecimal(raw).stripTrailingZeros().toPlainString() + "%";
                case "BOOL" -> Boolean.parseBoolean(raw) ? (vi ? "bật" : "on") : (vi ? "tắt" : "off");
                case "NUMBER" -> raw;
                default -> {
                    String text = vi ? messages.translate(raw, Locales.VI) : raw;
                    yield text.length() <= VALUE_CHARS ? text : text.substring(0, VALUE_CHARS - 1) + "…";
                }
            };
        } catch (RuntimeException ex) {
            return raw;
        }
    }

    /** {@code 1,200,000 VND} (EN) or {@code 1.200.000 ₫} (VI), as the web shows amounts. */
    static String money(long amount, boolean vi) {
        if (!vi) {
            return NumberFormat.getIntegerInstance(Locale.US).format(amount) + " VND";
        }
        DecimalFormatSymbols symbols = DecimalFormatSymbols.getInstance(Locale.ROOT);
        symbols.setGroupingSeparator('.');
        return new DecimalFormat("#,##0", symbols).format(amount) + " ₫";
    }
}

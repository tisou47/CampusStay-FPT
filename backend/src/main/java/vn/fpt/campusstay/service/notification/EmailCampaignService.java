package vn.fpt.campusstay.service.notification;

import java.sql.Timestamp;
import java.text.NumberFormat;
import java.time.Clock;
import java.time.Instant;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.util.HtmlUtils;

import vn.fpt.campusstay.service.application.Applications;
import vn.fpt.campusstay.service.assignment.Residences;
import vn.fpt.campusstay.service.auth.BlockDirectory;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.service.auth.UserDirectory;
import vn.fpt.campusstay.service.billing.Billing;
import vn.fpt.campusstay.service.setting.TermCatalog;
import vn.fpt.campusstay.dto.setting.TermSummary;
import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.config.TimeConfig;

/**
 * Admin › Send email: one student by code, or a group of the Term filtered by
 * Block and gender. Each email is rendered from a campaign template with the
 * recipient's own values and goes through the outbox at the chosen time; with
 * push, the in-app notification is written at once.
 */
@Service
public class EmailCampaignService {

    public record TemplateOption(String key, String name, String subject) {
    }

    public record Group(String key, String label) {
    }

    public record Option(String value, String label) {
    }

    public record Options(List<TemplateOption> templates, List<Group> groups, List<String> blocks, List<String> genders,
            List<Option> channels, List<Option> sendTimes) {
    }

    /** {@code mode} one or bulk; for one, {@code studentCode}; for bulk, {@code termId}, {@code group} and filters. */
    public record Request(String mode, String studentCode, Long termId, String group, String block, String gender,
            String templateKey, String subject, String channel, String sendAt) {
    }

    public record Preview(String recipientName, String subject, List<String> lines) {
    }

    public record PreviewResult(long count, Preview preview) {
    }

    public record Queued(int queued) {
    }

    private record Recipient(long studentId, String name, String email) {
    }

    private record Audience(List<Recipient> recipients, TermSummary term, Map<Long, Long> buildingOf) {
    }

    private record EmailTemplate(String key, String name, String subject, String body) {
    }

    private static final Map<String, String> GROUPS = new LinkedHashMap<>();
    private static final Map<String, String> GENDERS = Map.of("MALE", "M", "FEMALE", "F", "M", "M", "F", "F");
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm")
            .withZone(TimeConfig.CAMPUS_ZONE);
    /** Scheduled sends: tonight and tomorrow morning, campus time. */
    private static final int TONIGHT_HOUR = 20;
    private static final int MORNING_HOUR = 8;
    /** The in-app notice shows the start of the email. */
    private static final int NOTICE_CHARS = 160;

    static {
        GROUPS.put("residents", "Residents who checked in");
        GROUPS.put("not-checked-in", "Allocated, not checked in yet");
        GROUPS.put("unpaid", "Students with an unpaid Invoice");
        GROUPS.put("waitlisted", "Waitlisted students");
        GROUPS.put("applicants", "All applicants of the Term");
    }

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final UserDirectory users;
    private final BlockDirectory blocks;
    private final TermCatalog terms;
    private final Residences residences;
    private final Applications applications;
    private final Billing billing;
    private final EmailOutbox outbox;
    private final InAppNotifier notifier;
    private final AuditLog audit;
    private final Clock clock;

    public EmailCampaignService(JdbcClient jdbc, CurrentUser currentUser, UserDirectory users, BlockDirectory blocks,
            TermCatalog terms, Residences residences, Applications applications, Billing billing, EmailOutbox outbox,
            InAppNotifier notifier, AuditLog audit, Clock clock) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.users = users;
        this.blocks = blocks;
        this.terms = terms;
        this.residences = residences;
        this.applications = applications;
        this.billing = billing;
        this.outbox = outbox;
        this.notifier = notifier;
        this.audit = audit;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public Options options() {
        currentUser.require(Permission.CONFIGURE);
        return new Options(templates().stream().map(t -> new TemplateOption(t.key(), t.name(), t.subject())).toList(),
                GROUPS.entrySet().stream().map(e -> new Group(e.getKey(), e.getValue())).toList(),
                List.copyOf(blocks.codesByIds(blocks.allActiveIds()).values()), List.of("Male", "Female"),
                List.of(new Option("email", "Email"), new Option("email-push", "Email and push")),
                List.of(new Option("now", "Now"), new Option("tonight", "Tonight at 20:00"),
                        new Option("tomorrow", "Tomorrow at 08:00")));
    }

    /** How many students match and the email the first of them would get. */
    @Transactional(readOnly = true)
    public PreviewResult preview(Request request) {
        currentUser.require(Permission.CONFIGURE);
        EmailTemplate template = template(request);
        String subject = subject(request);
        Audience audience = audience(request);
        if (audience.recipients().isEmpty()) {
            return new PreviewResult(0, null);
        }
        Recipient first = audience.recipients().getFirst();
        Map<String, String> values = values(first, audience, subject);
        return new PreviewResult(audience.recipients().size(), new Preview(first.name(),
                Templates.render(subject, values, false), lines(Templates.render(template.body(), values, true))));
    }

    @Transactional
    public Queued send(Request request) {
        currentUser.require(Permission.CONFIGURE);
        EmailTemplate template = template(request);
        String subject = subject(request);
        boolean withPush = channel(request);
        Instant sendAt = sendAt(request, withPush);
        Audience audience = audience(request);
        boolean one = "one".equalsIgnoreCase(text(request.mode()));
        if (audience.recipients().isEmpty()) {
            throw FieldErrors.single(one ? "studentCode" : "group", "No Student matches these filters.");
        }
        long campaign = jdbc.sql("""
                INSERT INTO ntf_email_campaign (mode, term_id, recipient_group, building_id, gender, student_id,
                                                template_key, subject, channel, send_at, created_by, created_at)
                VALUES (:mode, :term, :group, :building, :gender, :student, :template, :subject, :channel, :sendAt,
                        :by, :now)
                RETURNING id
                """)
                .param("mode", one ? "ONE" : "GROUP").param("term", audience.term() == null ? null : audience.term().id())
                .param("group", one ? null : text(request.group()).toLowerCase(Locale.ROOT))
                .param("building", one ? null : blockId(request.block()))
                .param("gender", one ? null : gender(request.gender()))
                .param("student", one ? audience.recipients().getFirst().studentId() : null)
                .param("template", template.key()).param("subject", subject)
                .param("channel", withPush ? "EMAIL_PUSH" : "EMAIL").param("sendAt", Timestamp.from(sendAt))
                .param("by", currentUser.id()).param("now", Timestamp.from(Instant.now(clock)))
                .query(Long.class).single();
        int queued = 0;
        for (Recipient r : audience.recipients()) {
            Map<String, String> values = values(r, audience, subject);
            String body = Templates.render(template.body(), values, true);
            String renderedSubject = Templates.render(subject, values, false);
            if (r.email() != null && !r.email().isBlank()) {
                outbox.enqueue(campaign, r.email(), renderedSubject, body, sendAt);
                queued++;
            }
            if (withPush) {
                String text = String.join(" ", lines(body));
                notifier.notify(r.studentId(), "CAMPAIGN", Map.of("subject", renderedSubject,
                        "message", text.length() <= NOTICE_CHARS ? text : text.substring(0, NOTICE_CHARS - 1) + "…"), null);
            }
        }
        jdbc.sql("UPDATE ntf_email_campaign SET queued_count = :n WHERE id = :id").param("n", queued)
                .param("id", campaign).update();
        audit.record("EMAIL_CAMPAIGN_QUEUED", AuditLog.Tone.INFO, "Email campaign", campaign, subject,
                Map.of("recipients", queued, "group", one ? "One student" : GROUPS.get(text(request.group())),
                        "sendAt", WHEN.format(sendAt)));
        return new Queued(queued);
    }

    // ---------------------------------------------------------------- recipients

    private Audience audience(Request request) {
        if ("one".equalsIgnoreCase(text(request.mode()))) {
            String code = text(request.studentCode());
            if (code.isEmpty()) {
                throw FieldErrors.single("studentCode", "Enter a student code.");
            }
            TermSummary term = request.termId() == null ? null : terms.findPublished(request.termId()).orElse(null);
            List<Recipient> one = users.studentByCode(code)
                    .map(p -> List.of(new Recipient(p.userId(), p.name(), p.email()))).orElse(List.of());
            return new Audience(one, term, term == null ? Map.of() : buildings(term.id()));
        }
        if (!"bulk".equalsIgnoreCase(text(request.mode()))) {
            throw FieldErrors.single("mode", "Choose one student or bulk.");
        }
        FieldErrors errors = new FieldErrors();
        TermSummary term = request.termId() == null ? null : terms.findPublished(request.termId()).orElse(null);
        errors.check(term != null, "termId", "Choose a Term.");
        String group = text(request.group()).toLowerCase(Locale.ROOT);
        errors.check(GROUPS.containsKey(group), "group", "Choose a group from the list.");
        Long block = blockId(request.block());
        errors.check(text(request.block()).isEmpty() || block != null, "block", "Choose a Block from the list.");
        String gender = gender(request.gender());
        errors.check(text(request.gender()).isEmpty() || gender != null, "gender", "Choose Male or Female.");
        errors.throwIfAny();
        Map<Long, Long> buildingOf = buildings(term.id());
        Set<Long> ids = switch (group) {
            case "residents", "not-checked-in" -> residences.ofTerm(term.id()).stream()
                    .filter(r -> r.resident() == group.equals("residents"))
                    .map(Residences.TermResident::studentId).collect(Collectors.toSet());
            case "unpaid" -> billing.withUnpaid(term.id());
            case "waitlisted" -> applications.applicants(term.id()).entrySet().stream()
                    .filter(e -> e.getValue().equals("WAITLISTED")).map(Map.Entry::getKey).collect(Collectors.toSet());
            default -> applications.applicants(term.id()).keySet();
        };
        List<Recipient> recipients = users.studentProfiles(ids).values().stream()
                .filter(p -> block == null || block.equals(buildingOf.get(p.userId())))
                .filter(p -> gender == null || gender.equals(p.gender()))
                .map(p -> new Recipient(p.userId(), p.name(), p.email()))
                .sorted(Comparator.comparing(Recipient::name).thenComparing(Recipient::studentId)).toList();
        return new Audience(recipients, term, buildingOf);
    }

    /** Student → Block of their Allocation in the Term. */
    private Map<Long, Long> buildings(long termId) {
        Map<Long, Long> result = new HashMap<>();
        residences.ofTerm(termId).forEach(r -> result.put(r.studentId(), r.buildingId()));
        return result;
    }

    /** What the templates may use: the recipient, the Term, the check-in window and the next Invoice to pay. */
    private Map<String, String> values(Recipient r, Audience audience, String subject) {
        Map<String, String> values = new HashMap<>();
        values.put("name", r.name());
        values.put("subject", subject);
        values.put("message", subject);
        TermSummary term = audience.term();
        if (term != null) {
            values.put("term", term.name());
            values.put("start", term.checkInStart() == null ? "" : DAY.format(term.checkInStart()));
            values.put("end", term.checkInEnd() == null ? "" : DAY.format(term.checkInEnd()));
            Long building = audience.buildingOf().get(r.studentId());
            values.put("location", building == null ? "the Block desk"
                    : "the Block " + blocks.codesByIds(List.of(building)).getOrDefault(building, "") + " desk");
            billing.dueSummary(r.studentId(), term.id()).next().ifPresent(i -> {
                values.put("title", i.title());
                values.put("amount", NumberFormat.getIntegerInstance(Locale.US).format(i.amount()) + " VND");
                values.put("dueAt", i.dueAt() == null ? "" : WHEN.format(i.dueAt()));
            });
        }
        return values;
    }

    // ---------------------------------------------------------------- validation

    private EmailTemplate template(Request request) {
        String key = text(request.templateKey()).toUpperCase(Locale.ROOT);
        return templates().stream().filter(t -> t.key().equals(key)).findFirst()
                .orElseThrow(() -> FieldErrors.single("templateKey", "Choose a template from the list."));
    }

    /** Campaign templates: system emails (invitations, password resets) are not offered. */
    private List<EmailTemplate> templates() {
        return jdbc.sql("SELECT key, name, subject, body_html FROM ntf_email_template WHERE NOT transactional ORDER BY name")
                .query((rs, i) -> new EmailTemplate(rs.getString("key"), rs.getString("name"), rs.getString("subject"),
                        rs.getString("body_html")))
                .list();
    }

    private static String subject(Request request) {
        String subject = text(request.subject());
        if (subject.isEmpty() || subject.length() > 200) {
            throw FieldErrors.single("subject", "Enter a subject of at most 200 characters.");
        }
        return subject;
    }

    private static boolean channel(Request request) {
        String channel = text(request.channel()).toLowerCase(Locale.ROOT);
        if (!channel.equals("email") && !channel.equals("email-push")) {
            throw FieldErrors.single("channel", "Choose Email or Email and push.");
        }
        return channel.equals("email-push");
    }

    /** Push goes out at once, so a scheduled send is email only. */
    private Instant sendAt(Request request, boolean withPush) {
        String when = text(request.sendAt()).toLowerCase(Locale.ROOT);
        ZonedDateTime now = ZonedDateTime.now(clock.withZone(TimeConfig.CAMPUS_ZONE));
        Instant at = switch (when) {
            case "now" -> now.toInstant();
            case "tonight" -> now.toLocalDate().atTime(TONIGHT_HOUR, 0).atZone(TimeConfig.CAMPUS_ZONE).toInstant();
            case "tomorrow" -> now.toLocalDate().plusDays(1).atTime(MORNING_HOUR, 0).atZone(TimeConfig.CAMPUS_ZONE)
                    .toInstant();
            default -> throw FieldErrors.single("sendAt", "Choose when to send.");
        };
        if (!when.equals("now") && at.isBefore(now.toInstant())) {
            throw FieldErrors.single("sendAt", "It is already past " + TONIGHT_HOUR + ":00. Choose another time.");
        }
        if (withPush && !when.equals("now")) {
            throw FieldErrors.single("sendAt", "Push goes out at once: send now, or choose Email only.");
        }
        return at;
    }

    private Long blockId(String code) {
        String text = text(code);
        return text.isEmpty() ? null : blocks.findIdByCode(text).orElse(null);
    }

    private static String gender(String value) {
        String text = text(value).toUpperCase(Locale.ROOT);
        return text.isEmpty() ? null : GENDERS.get(text);
    }

    /** The text of an HTML email, paragraph by paragraph. */
    private static List<String> lines(String html) {
        List<String> lines = new ArrayList<>();
        Arrays.stream(html.split("(?i)</p>|<br\\s*/?>")).map(s -> HtmlUtils.htmlUnescape(s.replaceAll("<[^>]+>", "")).trim())
                .filter(s -> !s.isEmpty()).forEach(lines::add);
        return lines;
    }

    private static String text(String value) {
        return value == null ? "" : value.trim();
    }
}

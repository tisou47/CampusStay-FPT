package vn.fpt.campusstay.service.setting;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.service.auth.UserDirectory;
import vn.fpt.campusstay.common.audit.ActorResolver;
import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.exception.FieldErrors;

/**
 * Admin › Fees and Refunds and Admin › Eligibility Rules. Both screens load the
 * whole configuration and save it back in the same shape ({@code GET|PUT}).
 */
@Service
public class AdminPolicyService {

    /** {@code id} of a rule added on screen is not a number (e.g. {@code new-1712…}); the server assigns one. */
    public record RefundRule(String id, String when, BigDecimal refundPercent, String approver, Boolean active) {
    }

    public record Fees(BigDecimal depositPercent, Integer depositHours, Integer balanceDays, Boolean blockCheckIn,
            Boolean manualConfirm, Boolean policyConfirmed, List<RefundRule> rules, List<String> approverOptions) {
    }

    public record Criterion(String key, String title, String note, Boolean on) {
    }

    /** {@code applied}: students of the directory in the group; {@code id} is left out for a new group. */
    public record Group(String id, String title, String note, Long applied) {
    }

    public record Eligibility(List<Criterion> criteria, List<Group> groups, String appliesFromTermName) {
    }

    private static final Map<String, String> APPROVERS = Map.of("SYSTEM", "System", "STAFF", "Staff", "MANAGER",
            "Manager", "ADMIN", "Admin");
    private static final List<String> APPROVER_ORDER = List.of("SYSTEM", "STAFF", "MANAGER", "ADMIN");
    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

    private final JdbcClient jdbc;
    private final UserDirectory userDirectory;
    private final ActorResolver actors;
    private final AuditLog audit;
    private final Clock clock;

    public AdminPolicyService(JdbcClient jdbc, UserDirectory userDirectory, ActorResolver actors, AuditLog audit,
            Clock clock) {
        this.jdbc = jdbc;
        this.userDirectory = userDirectory;
        this.actors = actors;
        this.audit = audit;
        this.clock = clock;
    }

    // ---------------------------------------------------------------- Fees and refunds

    @Transactional(readOnly = true)
    public Fees fees() {
        List<RefundRule> rules = jdbc.sql("""
                SELECT id, description, refund_percent, approver_role, active FROM cfg_refund_rule ORDER BY sort_order, id
                """)
                .query((rs, i) -> new RefundRule(String.valueOf(rs.getLong("id")), rs.getString("description"),
                        Decimals.plain(rs.getBigDecimal("refund_percent")), APPROVERS.get(rs.getString("approver_role")),
                        rs.getBoolean("active")))
                .list();
        return jdbc.sql("""
                SELECT deposit_percent, deposit_hours, balance_days, block_check_in_if_unpaid, allow_manual_confirm,
                       policy_confirmed
                FROM cfg_fee_policy WHERE id = 1
                """)
                .query((rs, i) -> new Fees(Decimals.plain(rs.getBigDecimal("deposit_percent")), rs.getInt("deposit_hours"),
                        rs.getInt("balance_days"), rs.getBoolean("block_check_in_if_unpaid"),
                        rs.getBoolean("allow_manual_confirm"), rs.getBoolean("policy_confirmed"), rules,
                        APPROVER_ORDER.stream().map(APPROVERS::get).toList()))
                .single();
    }

    @Transactional
    public Fees saveFees(Fees body) {
        Fees before = fees();
        FieldErrors errors = new FieldErrors();
        BigDecimal percent = body.depositPercent();
        errors.check(percent != null && percent.signum() > 0 && percent.compareTo(HUNDRED) <= 0, "depositPercent",
                "Enter a deposit rate above 0 and up to 100.");
        errors.check(body.depositHours() != null && body.depositHours() >= 1 && body.depositHours() <= 720,
                "depositHours", "Enter 1 to 720 hours.");
        errors.check(body.balanceDays() != null && body.balanceDays() >= 1 && body.balanceDays() <= 365,
                "balanceDays", "Enter 1 to 365 days.");
        Set<Long> existing = new HashSet<>(jdbc.sql("SELECT id FROM cfg_refund_rule").query(Long.class).list());
        List<RefundRule> rules = body.rules() == null ? List.of() : body.rules();
        for (int i = 0; i < rules.size(); i++) {
            RefundRule r = rules.get(i);
            String which = "Refund rule " + (i + 1) + ": ";
            errors.check(r.when() != null && !r.when().isBlank() && r.when().trim().length() <= 200, "rules",
                    which + "describe when it applies in at most 200 characters.");
            errors.check(r.refundPercent() != null && r.refundPercent().signum() >= 0
                    && r.refundPercent().compareTo(HUNDRED) <= 0, "rules", which + "enter a refund from 0 to 100%.");
            errors.check(approverCode(r.approver()) != null, "rules", which + "choose who approves it.");
            Long id = numericId(r.id());
            errors.check(id == null || existing.contains(id), "rules",
                    which + "it no longer exists. Reload the page and try again.");
        }
        errors.throwIfAny();

        jdbc.sql("""
                UPDATE cfg_fee_policy SET deposit_percent = :percent, deposit_hours = :hours, balance_days = :days,
                       block_check_in_if_unpaid = :blockCheckIn, allow_manual_confirm = :manualConfirm,
                       policy_confirmed = :confirmed, updated_at = :now, updated_by = :by, version = version + 1
                WHERE id = 1
                """)
                .param("percent", percent.setScale(2, RoundingMode.HALF_UP))
                .param("hours", body.depositHours())
                .param("days", body.balanceDays())
                .param("blockCheckIn", Boolean.TRUE.equals(body.blockCheckIn()))
                .param("manualConfirm", Boolean.TRUE.equals(body.manualConfirm()))
                .param("confirmed", Boolean.TRUE.equals(body.policyConfirmed()))
                .param("now", Timestamp.from(Instant.now(clock)))
                .param("by", actors.currentActor().id())
                .update();
        for (RefundRule r : rules) {
            Long id = numericId(r.id());
            var spec = jdbc.sql(id == null
                    ? """
                      INSERT INTO cfg_refund_rule (trigger_code, description, refund_percent, approver_role, active, sort_order)
                      VALUES ('CUSTOM', :when, :percent, :approver, :active,
                              (SELECT COALESCE(max(sort_order), 0) + 1 FROM cfg_refund_rule))
                      """
                    : """
                      UPDATE cfg_refund_rule SET description = :when, refund_percent = :percent,
                             approver_role = :approver, active = :active
                      WHERE id = :id
                      """);
            if (id != null) {
                spec = spec.param("id", id);
            }
            spec.param("when", r.when().trim())
                    .param("percent", r.refundPercent().setScale(2, RoundingMode.HALF_UP))
                    .param("approver", approverCode(r.approver()))
                    .param("active", !Boolean.FALSE.equals(r.active()))
                    .update();
        }
        Fees after = fees();
        Map<String, Object> change = feesDiff(before, after);
        if (!change.isEmpty()) {
            audit.record(after.policyConfirmed() && !before.policyConfirmed() ? "REFUND_POLICY_CONFIRMED" : "FEES_UPDATED",
                    AuditLog.Tone.INFO, "Fee policy", null, "Fees and Refunds", change);
        }
        return after;
    }

    private static Map<String, Object> feesDiff(Fees before, Fees after) {
        Map<String, Object> change = new LinkedHashMap<>();
        put(change, "depositPercent", before.depositPercent(), after.depositPercent());
        put(change, "depositHours", before.depositHours(), after.depositHours());
        put(change, "balanceDays", before.balanceDays(), after.balanceDays());
        put(change, "blockCheckIn", before.blockCheckIn(), after.blockCheckIn());
        put(change, "manualConfirm", before.manualConfirm(), after.manualConfirm());
        put(change, "policyConfirmed", before.policyConfirmed(), after.policyConfirmed());
        Map<String, RefundRule> old = new LinkedHashMap<>();
        before.rules().forEach(r -> old.put(r.id(), r));
        for (RefundRule r : after.rules()) {
            RefundRule o = old.get(r.id());
            put(change, "rule " + r.id(), o == null ? null : ruleText(o), ruleText(r));
        }
        return change;
    }

    private static String ruleText(RefundRule r) {
        return r.when() + " · " + r.refundPercent() + "% · " + r.approver() + (r.active() ? "" : " · off");
    }

    private static String approverCode(String label) {
        if (label == null) {
            return null;
        }
        String value = label.trim();
        return APPROVERS.entrySet().stream()
                .filter(e -> e.getKey().equalsIgnoreCase(value) || e.getValue().equalsIgnoreCase(value))
                .map(Map.Entry::getKey).findFirst().orElse(null);
    }

    // ---------------------------------------------------------------- Eligibility and priority groups

    @Transactional(readOnly = true)
    public Eligibility eligibility() {
        List<Criterion> criteria = jdbc.sql("""
                SELECT key, title, note, enabled FROM cfg_eligibility_criterion ORDER BY sort_order, key
                """)
                .query((rs, i) -> new Criterion(rs.getString("key"), rs.getString("title"), rs.getString("note"),
                        rs.getBoolean("enabled")))
                .list();
        Map<String, Long> members = userDirectory.studentsPerPriorityGroup();
        List<Group> groups = jdbc.sql("""
                SELECT id, key, title, note FROM cfg_priority_group WHERE applied ORDER BY sort_order, id
                """)
                .query((rs, i) -> new Group(String.valueOf(rs.getLong("id")), rs.getString("title"), rs.getString("note"),
                        members.getOrDefault(rs.getString("key"), 0L)))
                .list();
        String appliesFrom = jdbc.sql("""
                SELECT name FROM cfg_term WHERE status <> 'CLOSED' AND registration_opens_at > :now
                ORDER BY registration_opens_at LIMIT 1
                """)
                .param("now", Timestamp.from(Instant.now(clock)))
                .query(String.class).optional().orElse(null);
        return new Eligibility(criteria, groups, appliesFrom);
    }

    /**
     * Saves the criteria switches and the priority groups in the order given. A
     * group left out of the list stops being applied; its key stays, because the
     * student directory refers to it.
     */
    @Transactional
    public Eligibility saveEligibility(Eligibility body) {
        Eligibility before = eligibility();
        FieldErrors errors = new FieldErrors();
        Map<String, Criterion> known = new LinkedHashMap<>();
        before.criteria().forEach(c -> known.put(c.key(), c));
        List<Criterion> criteria = body.criteria() == null ? List.of() : body.criteria();
        for (Criterion c : criteria) {
            errors.check(c.key() != null && known.containsKey(c.key()), "criteria", "Unknown criterion " + c.key() + ".");
            errors.check(c.on() != null, "criteria", "Turn each criterion on or off.");
        }
        Set<Long> groupIds = new HashSet<>(jdbc.sql("SELECT id FROM cfg_priority_group").query(Long.class).list());
        List<Group> groups = body.groups() == null ? List.of() : body.groups();
        for (int i = 0; i < groups.size(); i++) {
            Group g = groups.get(i);
            String which = "Priority group " + (i + 1) + ": ";
            errors.check(g.title() != null && !g.title().isBlank() && g.title().trim().length() <= 150, "groups",
                    which + "enter a name of at most 150 characters.");
            errors.check(g.note() == null || g.note().trim().length() <= 300, "groups",
                    which + "keep the source under 300 characters.");
            Long id = numericId(g.id());
            errors.check(g.id() == null || g.id().isBlank() || id != null && groupIds.contains(id), "groups",
                    which + "it no longer exists. Reload the page and try again.");
        }
        errors.throwIfAny();

        for (Criterion c : criteria) {
            jdbc.sql("UPDATE cfg_eligibility_criterion SET enabled = :on WHERE key = :key")
                    .param("on", c.on()).param("key", c.key()).update();
        }
        jdbc.sql("UPDATE cfg_priority_group SET applied = FALSE").update();
        for (int i = 0; i < groups.size(); i++) {
            Group g = groups.get(i);
            Long id = numericId(g.id());
            String note = g.note() == null || g.note().isBlank() ? null : g.note().trim();
            if (id == null) {
                jdbc.sql("""
                        INSERT INTO cfg_priority_group (key, title, note, applied, sort_order)
                        VALUES (:key, :title, :note, TRUE, :sort)
                        """)
                        .param("key", newGroupKey(g.title())).param("title", g.title().trim()).param("note", note)
                        .param("sort", i + 1).update();
            } else {
                jdbc.sql("""
                        UPDATE cfg_priority_group SET title = :title, note = :note, applied = TRUE, sort_order = :sort
                        WHERE id = :id
                        """)
                        .param("title", g.title().trim()).param("note", note).param("sort", i + 1).param("id", id)
                        .update();
            }
        }
        Eligibility after = eligibility();
        Map<String, Object> change = new LinkedHashMap<>();
        for (Criterion c : after.criteria()) {
            put(change, c.key(), known.get(c.key()).on() ? "on" : "off", c.on() ? "on" : "off");
        }
        put(change, "priorityGroups", before.groups().stream().map(Group::title).toList(),
                after.groups().stream().map(Group::title).toList());
        if (!change.isEmpty()) {
            audit.record("ELIGIBILITY_UPDATED", AuditLog.Tone.INFO, "Eligibility rules", null, "Eligibility Rules", change);
        }
        return after;
    }

    /** {@code Students from remote provinces} → {@code STUDENTS_FROM_REMOTE_PROVINCES}, unique. */
    private String newGroupKey(String title) {
        String base = title.trim().toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]+", "_").replaceAll("^_+|_+$", "");
        if (base.isEmpty()) {
            base = "GROUP";
        }
        base = base.substring(0, Math.min(base.length(), 36));
        Set<String> taken = new HashSet<>(jdbc.sql("SELECT key FROM cfg_priority_group").query(String.class).list());
        String key = base;
        for (int n = 2; taken.contains(key); n++) {
            key = base + "_" + n;
        }
        return key;
    }

    static Long numericId(String id) {
        if (id == null || id.isBlank()) {
            return null;
        }
        try {
            return Long.valueOf(id.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static void put(Map<String, Object> change, String field, Object before, Object after) {
        if (!Objects.equals(before, after)) {
            List<String> pair = new ArrayList<>(2);
            pair.add(before == null ? null : String.valueOf(before));
            pair.add(after == null ? null : String.valueOf(after));
            change.put(field, pair);
        }
    }
}

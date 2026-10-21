package vn.fpt.campusstay.cfg.internal;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.auth.BlockScope;
import vn.fpt.campusstay.auth.BlockSelection;
import vn.fpt.campusstay.auth.CurrentUser;
import vn.fpt.campusstay.auth.Permission;
import vn.fpt.campusstay.auth.UserDirectory;
import vn.fpt.campusstay.cfg.Parameters;
import vn.fpt.campusstay.shared.audit.AuditLog;
import vn.fpt.campusstay.shared.error.FieldErrors;

/**
 * Block Manager › Block settings: desk hours, visitor hours, quiet hours and house
 * rules. Visitor and quiet hours stay inside the Admin limits (System parameters
 * {@code block.*}). Times are {@code HH:mm}, campus time.
 */
@Service
public class BlockSettingsService {

    public record Limits(String visitWindow, String quietStartsBy) {
    }

    /** Fields are null until the Block has settings. */
    public record View(String deskOpens, String deskCloses, String visitFrom, String visitUntil, String quiet,
            String houseRules, Instant editedAt, String editedBy, Limits limits, List<String> quietOptions) {
    }

    public record SaveCommand(String block, String deskOpens, String deskCloses, String visitFrom, String visitUntil,
            String quiet, String houseRules) {
    }

    private record Row(LocalTime deskOpens, LocalTime deskCloses, LocalTime visitFrom, LocalTime visitUntil,
            LocalTime quiet, String houseRules, Instant editedAt, Long editedBy) {
    }

    private static final DateTimeFormatter HH_MM = DateTimeFormatter.ofPattern("HH:mm");
    /** The earliest start the quiet-hours list offers. */
    private static final LocalTime QUIET_FIRST = LocalTime.of(21, 0);
    private static final int HOUSE_RULES_MAX = 4000;

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final BlockScope blockScope;
    private final UserDirectory users;
    private final Parameters parameters;
    private final AuditLog audit;
    private final Clock clock;

    public BlockSettingsService(JdbcClient jdbc, CurrentUser currentUser, BlockScope blockScope, UserDirectory users,
            Parameters parameters, AuditLog audit, Clock clock) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.blockScope = blockScope;
        this.users = users;
        this.parameters = parameters;
        this.audit = audit;
        this.clock = clock;
    }

    /** Any back-office user of the Block may read the settings; only the Manager changes them. */
    @Transactional(readOnly = true)
    public View get(String block) {
        long building = building(block);
        Optional<Row> row = row(building, false);
        LocalTime quietLatest = limit("block.quiet_from_latest");
        List<String> quietOptions = new ArrayList<>();
        for (int m = QUIET_FIRST.toSecondOfDay() / 60; m <= quietLatest.toSecondOfDay() / 60; m += 30) {
            quietOptions.add(HH_MM.format(LocalTime.ofSecondOfDay(m * 60L)));
        }
        Limits limits = new Limits(HH_MM.format(limit("block.visit_from_earliest")) + " – "
                + HH_MM.format(limit("block.visit_until_latest")), HH_MM.format(quietLatest));
        if (row.isEmpty()) {
            return new View(null, null, null, null, null, null, null, null, limits, quietOptions);
        }
        Row r = row.get();
        String editedBy = r.editedBy() == null ? null : users.displayNames(List.of(r.editedBy())).get(r.editedBy());
        return new View(HH_MM.format(r.deskOpens()), HH_MM.format(r.deskCloses()), HH_MM.format(r.visitFrom()),
                HH_MM.format(r.visitUntil()), HH_MM.format(r.quiet()), r.houseRules(), r.editedAt(), editedBy, limits,
                quietOptions);
    }

    @Transactional
    public View save(SaveCommand cmd) {
        currentUser.require(Permission.MANAGE_BLOCK);
        long building = building(cmd.block());
        FieldErrors errors = new FieldErrors();
        LocalTime deskOpens = time(errors, "deskOpens", cmd.deskOpens());
        LocalTime deskCloses = time(errors, "deskCloses", cmd.deskCloses());
        LocalTime visitFrom = time(errors, "visitFrom", cmd.visitFrom());
        LocalTime visitUntil = time(errors, "visitUntil", cmd.visitUntil());
        LocalTime quiet = time(errors, "quiet", cmd.quiet());
        String rules = cmd.houseRules() == null ? "" : cmd.houseRules().trim();
        errors.check(rules.length() <= HOUSE_RULES_MAX, "houseRules", "Keep the house rules under 4,000 characters.");
        LocalTime earliest = limit("block.visit_from_earliest");
        LocalTime latest = limit("block.visit_until_latest");
        LocalTime quietLatest = limit("block.quiet_from_latest");
        if (deskOpens != null && deskCloses != null) {
            errors.check(deskOpens.isBefore(deskCloses), "deskCloses", "The desk must close after it opens.");
        }
        if (visitFrom != null) {
            errors.check(!visitFrom.isBefore(earliest), "visitFrom", "Visitors may come from " + HH_MM.format(earliest)
                    + " at the earliest (Admin limit).");
        }
        if (visitUntil != null) {
            errors.check(!visitUntil.isAfter(latest), "visitUntil", "Visitors must leave by " + HH_MM.format(latest)
                    + " at the latest (Admin limit).");
        }
        if (visitFrom != null && visitUntil != null && !errors.has("visitFrom") && !errors.has("visitUntil")) {
            errors.check(visitFrom.isBefore(visitUntil), "visitUntil", "Visitor hours must end after they start.");
        }
        if (quiet != null) {
            errors.check(!quiet.isAfter(quietLatest), "quiet", "Quiet hours must start by " + HH_MM.format(quietLatest)
                    + " (Admin limit).");
        }
        errors.throwIfAny();

        Optional<Row> before = row(building, true);
        Instant now = Instant.now(clock);
        jdbc.sql("""
                INSERT INTO cfg_block_settings (building_id, desk_opens, desk_closes, visit_from, visit_until, quiet_from,
                                                house_rules, edited_at, edited_by)
                VALUES (:b, :deskOpens, :deskCloses, :visitFrom, :visitUntil, :quiet, :rules, :now, :by)
                ON CONFLICT (building_id) DO UPDATE SET desk_opens = EXCLUDED.desk_opens,
                       desk_closes = EXCLUDED.desk_closes, visit_from = EXCLUDED.visit_from,
                       visit_until = EXCLUDED.visit_until, quiet_from = EXCLUDED.quiet_from,
                       house_rules = EXCLUDED.house_rules, edited_at = EXCLUDED.edited_at,
                       edited_by = EXCLUDED.edited_by, version = cfg_block_settings.version + 1
                """)
                .param("b", building).param("deskOpens", deskOpens).param("deskCloses", deskCloses)
                .param("visitFrom", visitFrom).param("visitUntil", visitUntil).param("quiet", quiet)
                .param("rules", rules).param("now", Timestamp.from(now)).param("by", currentUser.id()).update();

        Map<String, Object> change = new LinkedHashMap<>();
        Row b = before.orElse(null);
        diff(change, "deskOpens", b == null ? null : b.deskOpens(), deskOpens);
        diff(change, "deskCloses", b == null ? null : b.deskCloses(), deskCloses);
        diff(change, "visitFrom", b == null ? null : b.visitFrom(), visitFrom);
        diff(change, "visitUntil", b == null ? null : b.visitUntil(), visitUntil);
        diff(change, "quiet", b == null ? null : b.quiet(), quiet);
        if (b == null || !Objects.equals(b.houseRules(), rules)) {
            change.put("houseRules", "changed");
        }
        if (!change.isEmpty()) {
            audit.record("BLOCK_SETTINGS_UPDATED", AuditLog.Tone.INFO, "Block", building, "Block settings", change);
        }
        return get(cmd.block());
    }

    private long building(String block) {
        BlockSelection selection = blockScope.resolve(block);
        if (!selection.single()) {
            throw FieldErrors.single("block", "Choose a Block.");
        }
        return selection.singleId();
    }

    private Optional<Row> row(long building, boolean lock) {
        return jdbc.sql("SELECT * FROM cfg_block_settings WHERE building_id = :b" + (lock ? " FOR UPDATE" : ""))
                .param("b", building)
                .query((rs, i) -> new Row(rs.getObject("desk_opens", LocalTime.class),
                        rs.getObject("desk_closes", LocalTime.class), rs.getObject("visit_from", LocalTime.class),
                        rs.getObject("visit_until", LocalTime.class), rs.getObject("quiet_from", LocalTime.class),
                        rs.getString("house_rules"), rs.getTimestamp("edited_at").toInstant(),
                        rs.getObject("edited_by", Long.class)))
                .optional();
    }

    private LocalTime limit(String key) {
        return LocalTime.parse(parameters.textValue(key), HH_MM);
    }

    private static LocalTime time(FieldErrors errors, String field, String value) {
        if (value == null || value.isBlank()) {
            errors.add(field, "Choose a time.");
            return null;
        }
        try {
            return LocalTime.parse(value.trim(), HH_MM);
        } catch (DateTimeParseException e) {
            errors.add(field, "Use the HH:mm format, e.g. 07:30.");
            return null;
        }
    }

    private static void diff(Map<String, Object> change, String field, LocalTime before, LocalTime after) {
        if (!Objects.equals(before, after)) {
            change.put(field, Arrays.asList(before == null ? null : HH_MM.format(before), HH_MM.format(after)));
        }
    }
}

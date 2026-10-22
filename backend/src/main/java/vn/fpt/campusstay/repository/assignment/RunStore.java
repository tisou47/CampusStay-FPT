package vn.fpt.campusstay.repository.assignment;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * Reads of assignment runs, their per-Block review and proposal items. Clients
 * address a run by {@code RUN-<id>}; a plain number is accepted too.
 */
@Component
public class RunStore {

    public record Run(long id, long termId, String kind, String status, int stage, long snapshotId, long startedBy,
            Instant startedAt, Instant finishedAt, int input, int proposed, int waitlisted, BigDecimal averageFit) {

        public String code() {
            return RunStore.code(id);
        }
    }

    /** {@code issue}: NO_BED, PARTNER_NOT_READY, NOT_ELIGIBLE or LOW_FIT; {@code tone}: INFO, WARNING, DANGER. */
    public record Item(long id, long runId, long applicationId, Long buildingId, Long bedId, BigDecimal fit, String issue,
            String tone, boolean resolved, String resolutionKey, boolean waitlisted, String reason) {

        /** A conflict that must be resolved before the Block is submitted (LOW_FIT is information only). */
        public boolean blocking() {
            return issue != null && !"INFO".equals(tone) && !resolved;
        }
    }

    public record Block(long runId, long buildingId, String status, Long submittedBy, Instant submittedAt, Long decidedBy,
            Instant decidedAt, String comment) {
    }

    private static final Map<String, String> KINDS = Map.of("DRY_RUN", "Dry run", "REAL", "Final run", "ROUND2",
            "Round 2");
    private static final Map<String, String> STATUSES = Map.of("RUNNING", "Running", "PROPOSED", "Proposed",
            "IN_REVIEW", "In review", "COMMITTED", "Committed", "FAILED", "Failed", "DISCARDED", "Discarded");
    private static final Map<String, String> ISSUES = Map.of("NO_BED", "No Bed", "PARTNER_NOT_READY",
            "Partner not ready", "NOT_ELIGIBLE", "Not eligible", "LOW_FIT", "Low fit");

    private final JdbcClient jdbc;

    public RunStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public static String code(long id) {
        return "RUN-" + id;
    }

    public static String kindLabel(String kind) {
        return KINDS.get(kind);
    }

    public static String statusLabel(String status) {
        return STATUSES.get(status);
    }

    public static String issueLabel(String issue) {
        return ISSUES.get(issue);
    }

    /** Contract tone for an issue: info, warning or error. */
    public static String tone(String tone) {
        return tone == null ? null : tone.equals("DANGER") ? "error" : tone.toLowerCase(Locale.ROOT);
    }

    /** 0.8234 → 82 (screens show fit out of 100). */
    public static Integer percent(BigDecimal fit) {
        return fit == null ? null : fit.movePointRight(2).setScale(0, RoundingMode.HALF_UP).intValue();
    }

    public Optional<Run> run(String idOrCode) {
        if (idOrCode == null) {
            return Optional.empty();
        }
        String value = idOrCode.trim().replaceFirst("(?i)^RUN-", "");
        if (value.isEmpty() || value.length() > 18 || !value.chars().allMatch(Character::isDigit)) {
            return Optional.empty();
        }
        return run(Long.parseLong(value), false);
    }

    public Optional<Run> run(long id, boolean lock) {
        return jdbc.sql("SELECT * FROM asg_run WHERE id = :id" + (lock ? " FOR UPDATE" : "")).param("id", id)
                .query(RunStore::run).optional();
    }

    /** Newest first. */
    public List<Run> runs(long termId) {
        return jdbc.sql("SELECT * FROM asg_run WHERE term_id = :term ORDER BY started_at DESC, id DESC")
                .param("term", termId).query(RunStore::run).list();
    }

    public List<Item> items(long runId) {
        return jdbc.sql("SELECT * FROM asg_proposal_item WHERE run_id = :run ORDER BY id").param("run", runId)
                .query(RunStore::item).list();
    }

    public Optional<Item> item(long runId, long applicationId, boolean lock) {
        return jdbc.sql("SELECT * FROM asg_proposal_item WHERE run_id = :run AND application_id = :app"
                + (lock ? " FOR UPDATE" : ""))
                .param("run", runId).param("app", applicationId).query(RunStore::item).optional();
    }

    public List<Block> blocks(long runId) {
        return jdbc.sql("SELECT * FROM asg_run_block WHERE run_id = :run ORDER BY building_id").param("run", runId)
                .query(RunStore::block).list();
    }

    public Optional<Block> block(long runId, long buildingId, boolean lock) {
        return jdbc.sql("SELECT * FROM asg_run_block WHERE run_id = :run AND building_id = :b"
                + (lock ? " FOR UPDATE" : ""))
                .param("run", runId).param("b", buildingId).query(RunStore::block).optional();
    }

    private static Run run(ResultSet rs, int i) throws SQLException {
        return new Run(rs.getLong("id"), rs.getLong("term_id"), rs.getString("kind"), rs.getString("status"),
                rs.getInt("stage"), rs.getLong("matching_snapshot_id"), rs.getLong("started_by"),
                instant(rs, "started_at"), instant(rs, "finished_at"), rs.getInt("input_count"),
                rs.getInt("proposed_count"), rs.getInt("waitlisted_count"), rs.getBigDecimal("average_fit"));
    }

    private static Item item(ResultSet rs, int i) throws SQLException {
        return new Item(rs.getLong("id"), rs.getLong("run_id"), rs.getLong("application_id"),
                rs.getObject("building_id", Long.class), rs.getObject("bed_id", Long.class), rs.getBigDecimal("fit"),
                rs.getString("issue_code"), rs.getString("issue_tone"), rs.getBoolean("resolved"),
                rs.getString("resolution_key"), rs.getBoolean("waitlisted"), rs.getString("reason"));
    }

    private static Block block(ResultSet rs, int i) throws SQLException {
        return new Block(rs.getLong("run_id"), rs.getLong("building_id"), rs.getString("status"),
                rs.getObject("submitted_by", Long.class), instant(rs, "submitted_at"),
                rs.getObject("decided_by", Long.class), instant(rs, "decided_at"), rs.getString("comment"));
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp t = rs.getTimestamp(column);
        return t == null ? null : t.toInstant();
    }
}

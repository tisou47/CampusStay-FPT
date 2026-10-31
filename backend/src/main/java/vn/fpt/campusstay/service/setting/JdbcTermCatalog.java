package vn.fpt.campusstay.service.setting;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.service.setting.TermCatalog;
import vn.fpt.campusstay.dto.setting.TermSummary;
import vn.fpt.campusstay.config.TimeConfig;

@Component
@Transactional(readOnly = true)
class JdbcTermCatalog implements TermCatalog {

    private final JdbcClient jdbc;
    private final Clock clock;

    JdbcTermCatalog(JdbcClient jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @Override
    public List<TermSummary> publishedTerms() {
        List<Row> rows = jdbc.sql("""
                SELECT id, code, name, stay_start, stay_end, registration_opens_at, registration_closes_at,
                       results_published_at, balance_due_at, check_in_start, check_in_end, deposit_hours, roommate_hours
                FROM cfg_term WHERE status = 'PUBLISHED' ORDER BY stay_start DESC
                """).query(JdbcTermCatalog::map).list();
        Instant now = Instant.now(clock);
        LocalDate today = LocalDate.ofInstant(now, TimeConfig.CAMPUS_ZONE);
        Long currentId = pickCurrent(rows, today);
        List<TermSummary> result = new ArrayList<>(rows.size());
        for (Row r : rows) {
            boolean open = !now.isBefore(r.registrationOpensAt) && now.isBefore(r.registrationClosesAt);
            result.add(new TermSummary(r.id, r.name, currentId != null && currentId == r.id, open, r.stayStart,
                    r.stayEnd, r.registrationOpensAt, r.registrationClosesAt, r.resultsPublishedAt, r.balanceDueAt,
                    r.checkInStart, r.checkInEnd, r.depositHours, r.code, r.roommateHours));
        }
        return result;
    }

    @Override
    public Optional<TermSummary> findPublished(long termId) {
        return publishedTerms().stream().filter(t -> t.id() == termId).findFirst();
    }

    @Override
    public Optional<TermSummary> openForRegistration() {
        return publishedTerms().stream().filter(TermSummary::registrationOpen).findFirst();
    }

    @Override
    public TermRooms rooms(long termId) {
        return new TermRooms(
                new HashSet<>(jdbc.sql("SELECT building_id FROM cfg_term_block WHERE term_id = :t").param("t", termId)
                        .query(Long.class).list()),
                new HashSet<>(jdbc.sql("SELECT room_id FROM cfg_term_room_excluded WHERE term_id = :t")
                        .param("t", termId).query(Long.class).list()),
                new HashSet<>(jdbc.sql("SELECT room_type_id FROM cfg_term_room_type WHERE term_id = :t")
                        .param("t", termId).query(Long.class).list()),
                new HashSet<>(jdbc.sql("SELECT room_class_id FROM cfg_term_room_class WHERE term_id = :t")
                        .param("t", termId).query(Long.class).list()));
    }

    @Override
    public Optional<Renewal> renewal(long termId) {
        return renewals(termId).stream().findFirst();
    }

    @Override
    public List<Renewal> renewals() {
        return renewals(null);
    }

    private List<Renewal> renewals(Long termId) {
        return jdbc.sql("""
                SELECT t.id, t.name, t.code, t.stay_start, t.check_in_start, p.id AS previous_id, p.name AS previous_name,
                       p.stay_end AS previous_end, p.check_out_by AS previous_check_out, t.publish_at, t.requests_open_at,
                       t.requests_close_at, t.decisions_due_at, t.reconciliation_due_at, t.fees_issue_at, t.fees_due_at,
                       t.reserved_new_percent
                FROM cfg_term t
                JOIN LATERAL (SELECT id, name, stay_end, check_out_by FROM cfg_term b
                              WHERE b.status = 'PUBLISHED' AND b.stay_start < t.stay_start
                              ORDER BY b.stay_start DESC LIMIT 1) p ON TRUE
                WHERE t.status = 'PUBLISHED' AND t.requests_open_at IS NOT NULL
                  AND (CAST(:term AS BIGINT) IS NULL OR t.id = :term)
                ORDER BY t.stay_start DESC
                """).param("term", termId)
                .query((rs, i) -> new Renewal(rs.getLong("id"), rs.getString("name"), rs.getString("code"),
                        rs.getObject("stay_start", LocalDate.class), rs.getObject("check_in_start", LocalDate.class),
                        rs.getLong("previous_id"), rs.getString("previous_name"),
                        rs.getObject("previous_end", LocalDate.class), rs.getObject("previous_check_out", LocalDate.class),
                        at(rs, "publish_at"), at(rs, "requests_open_at"), at(rs, "requests_close_at"),
                        at(rs, "decisions_due_at"), at(rs, "reconciliation_due_at"), at(rs, "fees_issue_at"),
                        at(rs, "fees_due_at"), rs.getBigDecimal("reserved_new_percent")))
                .list();
    }

    private static Instant at(ResultSet rs, String column) throws SQLException {
        java.sql.Timestamp t = rs.getTimestamp(column);
        return t == null ? null : t.toInstant();
    }

    /** Stay includes today; otherwise the next Term to start; otherwise the latest past one. */
    private static Long pickCurrent(List<Row> rows, LocalDate today) {
        Row next = null;
        for (Row r : rows) {
            if (!today.isBefore(r.stayStart) && !today.isAfter(r.stayEnd)) {
                return r.id;
            }
            if (r.stayStart.isAfter(today) && (next == null || r.stayStart.isBefore(next.stayStart))) {
                next = r;
            }
        }
        if (next != null) {
            return next.id;
        }
        return rows.isEmpty() ? null : rows.getFirst().id;
    }

    private static Row map(ResultSet rs, int i) throws SQLException {
        return new Row(rs.getLong("id"), rs.getString("name"), rs.getObject("stay_start", LocalDate.class),
                rs.getObject("stay_end", LocalDate.class), rs.getTimestamp("registration_opens_at").toInstant(),
                rs.getTimestamp("registration_closes_at").toInstant(),
                rs.getTimestamp("results_published_at").toInstant(), rs.getTimestamp("balance_due_at").toInstant(),
                rs.getObject("check_in_start", LocalDate.class), rs.getObject("check_in_end", LocalDate.class),
                rs.getInt("deposit_hours"), rs.getString("code"), rs.getInt("roommate_hours"));
    }

    private record Row(long id, String name, LocalDate stayStart, LocalDate stayEnd, Instant registrationOpensAt,
            Instant registrationClosesAt, Instant resultsPublishedAt, Instant balanceDueAt, LocalDate checkInStart,
            LocalDate checkInEnd, int depositHours, String code, int roommateHours) {
    }
}

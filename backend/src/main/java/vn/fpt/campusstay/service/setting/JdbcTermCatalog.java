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
                        .param("t", termId).query(Long.class).list()));
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

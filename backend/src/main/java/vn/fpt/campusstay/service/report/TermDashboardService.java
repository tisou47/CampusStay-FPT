package vn.fpt.campusstay.service.report;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.service.setting.Catalog;

/**
 * Manager › Registration › Term dashboard (spec §11.3, A-32): the milestones of a published Term with their progress,
 * Applications by status, places filled per Room Type × Room Class × gender with the Term's prices, and the Deposits
 * and Balances issued and paid. Read from the reporting views only; the renewal figures (next-Term requests, fees,
 * residents released) join with the phases that build them.
 */
@Service
public class TermDashboardService {

    public record TermOption(String id, String name, String status) {
    }

    /** {@code at} for a moment, {@code date} for a day; {@code done} once it has passed. */
    public record Milestone(String key, String label, Instant at, LocalDate date, boolean done) {
    }

    public record StatusCount(String status, long count) {
    }

    /** {@code price}: the Term's price per Bed, null when the Term has no price table (it reads the defaults). */
    public record PlaceRow(String roomTypeId, String roomType, String roomClassId, String roomClass, String gender,
            long beds, long allocated, Long price) {
    }

    public record Money(long depositsIssued, long depositsPaid, long balancesIssued, long balancesPaid, long paidAmount,
            long unpaidAmount) {
    }

    /**
     * The Term's requests window (spec §11.3), once it opened: next-Term requests still open, Continuing residents,
     * next-Term fees issued and paid, and next-Term Allocations released (not extended, not paid, ended).
     */
    public record Transition(long requestsOpen, long continuing, long feesIssued, long feesPaid, long released) {
    }

    /** {@code transition}: null until the Term's requests window opened. */
    public record TermDashboard(TermOption term, List<TermOption> terms, String requestCode, LocalDate stayStart,
            LocalDate stayEnd, List<Milestone> milestones, List<StatusCount> applications, long applicationsTotal,
            List<PlaceRow> places, Money money, long checkedIn, long residents, Transition transition) {
    }

    private static final List<String> PIPELINE = List.of("AWAITING_ROOMMATE", "AWAITING_DEPOSIT", "SUBMITTED",
            "UNDER_REVIEW", "APPROVED", "WAITLISTED", "ALLOCATED", "FORFEITED", "REJECTED", "CANCELLED", "EXPIRED");

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final Catalog catalog;
    private final Clock clock;

    public TermDashboardService(JdbcClient jdbc, CurrentUser currentUser, Catalog catalog, Clock clock) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.catalog = catalog;
        this.clock = clock;
    }

    private record TermRow(long id, String name, String status, LocalDate stayStart, LocalDate stayEnd,
            Map<String, Instant> moments, Map<String, LocalDate> days) {
    }

    @Transactional(readOnly = true)
    public TermDashboard dashboard(Long termId) {
        currentUser.require(Permission.VIEW_REGISTRATION_PERIODS);
        Instant now = Instant.now(clock);
        LocalDate today = LocalDate.ofInstant(now, TimeConfig.CAMPUS_ZONE);
        List<TermRow> published = jdbc.sql("SELECT * FROM rpt_v_term WHERE status <> 'DRAFT' ORDER BY stay_start DESC")
                .query((rs, i) -> term(rs)).list();
        if (published.isEmpty()) {
            throw ApiException.notFound("No Term is published yet.");
        }
        TermRow t = termId == null
                ? published.stream().filter(x -> !today.isAfter(x.stayEnd())).reduce((a, b) -> b).orElse(published.getFirst())
                : published.stream().filter(x -> x.id() == termId).findFirst()
                        .orElseThrow(() -> ApiException.notFound("This Term does not exist."));
        List<TermOption> terms = published.stream()
                .map(x -> new TermOption(String.valueOf(x.id()), x.name(), label(x, now, today))).toList();
        String request = jdbc.sql("SELECT code FROM rpt_v_term_request WHERE term_id = :t AND status = 'DONE' LIMIT 1")
                .param("t", t.id()).query(String.class).optional().orElse(null);

        List<Milestone> milestones = new ArrayList<>();
        moment(milestones, t, "publishAt", "Publish (M1)", now);
        moment(milestones, t, "requestsOpenAt", "Requests window opens (M2)", now);
        moment(milestones, t, "requestsCloseAt", "Request deadline (M3)", now);
        moment(milestones, t, "decisionsDueAt", "Decision deadline (M4)", now);
        moment(milestones, t, "reconciliationDueAt", "Reconciliation (M5)", now);
        moment(milestones, t, "feesIssueAt", "Next-Term fees issued (M6)", now);
        moment(milestones, t, "feesDueAt", "Next-Term fee deadline (M7)", now);
        moment(milestones, t, "registrationOpensAt", "Registration opens", now);
        moment(milestones, t, "registrationClosesAt", "Registration closes", now);
        moment(milestones, t, "resultsPublishedAt", "Assignment results", now);
        moment(milestones, t, "balanceDueAt", "Balance due", now);
        day(milestones, t, "checkInStart", "Check-in from", today);
        day(milestones, t, "checkInEnd", "Check-in until", today);
        day(milestones, t, "stayStart", "Stay starts", today);
        day(milestones, t, "stayEnd", "Stay ends", today);
        milestones.sort((a, b) -> instant(a).compareTo(instant(b)));

        Map<String, Long> byStatus = new HashMap<>();
        jdbc.sql("SELECT status, count(*) AS n FROM rpt_v_application WHERE term_id = :t GROUP BY status")
                .param("t", t.id())
                .query((rs, i) -> Map.entry(rs.getString("status"), rs.getLong("n"))).list()
                .forEach(e -> byStatus.put(e.getKey(), e.getValue()));
        List<StatusCount> applications = PIPELINE.stream().filter(byStatus::containsKey)
                .map(s -> new StatusCount(ReportScope.APPLICATION_STATUSES.get(s), byStatus.get(s))).toList();
        long total = byStatus.values().stream().mapToLong(Long::longValue).sum();

        Map<Long, String> types = new LinkedHashMap<>();
        catalog.roomTypes().forEach(x -> types.put(x.id(), x.name()));
        Map<Long, String> classes = new LinkedHashMap<>();
        catalog.roomClasses().forEach(x -> classes.put(x.id(), x.name()));
        Map<String, Long> prices = new HashMap<>();
        jdbc.sql("SELECT room_type_id, room_class_id, price FROM rpt_v_term_price WHERE term_id = :t")
                .param("t", t.id())
                .query((rs, i) -> Map.entry(rs.getLong("room_type_id") + ":" + rs.getLong("room_class_id"),
                        rs.getLong("price"))).list()
                .forEach(e -> prices.put(e.getKey(), e.getValue()));
        List<PlaceRow> places = jdbc.sql("""
                SELECT b.room_type_id, rc.room_class_id, trim(b.gender) AS gender, count(*) AS beds,
                       count(a.id) AS allocated
                FROM rpt_v_bed b
                JOIN rpt_v_room_class rc ON rc.room_id = b.room_id AND rc.term_id = :t
                JOIN rpt_v_term_room tr ON tr.room_id = b.room_id AND tr.term_id = :t AND tr.used
                LEFT JOIN rpt_v_allocation a ON a.bed_id = b.bed_id AND a.term_id = :t AND a.status = 'ACTIVE'
                WHERE""" + ReportScope.inService("b") + """
                GROUP BY b.room_type_id, rc.room_class_id, trim(b.gender)
                ORDER BY b.room_type_id, rc.room_class_id, trim(b.gender) DESC
                """)
                .param("t", t.id())
                .query((rs, i) -> {
                    long type = rs.getLong("room_type_id");
                    long roomClass = rs.getLong("room_class_id");
                    return new PlaceRow(String.valueOf(type), types.get(type), String.valueOf(roomClass),
                            classes.get(roomClass), rs.getString("gender"), rs.getLong("beds"), rs.getLong("allocated"),
                            prices.get(type + ":" + roomClass));
                })
                .list();
        Money money = jdbc.sql("""
                SELECT count(*) FILTER (WHERE type = 'DEPOSIT' AND status <> 'VOID') AS deposits,
                       count(*) FILTER (WHERE type = 'DEPOSIT' AND status IN ('PAID', 'REFUNDED')) AS deposits_paid,
                       count(*) FILTER (WHERE type = 'BALANCE' AND status <> 'VOID') AS balances,
                       count(*) FILTER (WHERE type = 'BALANCE' AND status IN ('PAID', 'REFUNDED')) AS balances_paid,
                       coalesce(sum(amount) FILTER (WHERE status IN ('PAID', 'REFUNDED')), 0) AS paid,
                       coalesce(sum(amount) FILTER (WHERE status IN ('UNPAID', 'OVERDUE', 'AWAITING_CONFIRMATION')), 0)
                           AS unpaid
                FROM rpt_v_invoice WHERE term_id = :t AND type IN ('DEPOSIT', 'BALANCE')
                """)
                .param("t", t.id())
                .query((rs, i) -> new Money(rs.getLong("deposits"), rs.getLong("deposits_paid"), rs.getLong("balances"),
                        rs.getLong("balances_paid"), rs.getLong("paid"), rs.getLong("unpaid")))
                .single();
        long checkedIn = jdbc.sql("""
                SELECT count(*) FROM rpt_v_allocation WHERE term_id = :t AND status = 'ACTIVE' AND checked_in_at IS NOT NULL
                """).param("t", t.id()).query(Long.class).single();
        long residents = jdbc.sql("""
                SELECT count(*) FROM rpt_v_allocation WHERE term_id = :t AND status = 'ACTIVE' AND code_released_at IS NOT NULL
                """).param("t", t.id()).query(Long.class).single();
        return new TermDashboard(new TermOption(String.valueOf(t.id()), t.name(), label(t, now, today)), terms, request,
                t.stayStart(), t.stayEnd(), milestones, applications, total, places, money, checkedIn, residents,
                transition(t.id()));
    }

    private Transition transition(long termId) {
        boolean opened = jdbc.sql("SELECT count(*) FROM rpt_v_renewal WHERE term_id = :t").param("t", termId)
                .query(Long.class).single() > 0;
        if (!opened) {
            return null;
        }
        return jdbc.sql("""
                SELECT (SELECT count(*) FROM rpt_v_room_change WHERE term_id = :t AND status IN ('SUBMITTED', 'PENDING'))
                     + (SELECT count(*) FROM rpt_v_swap WHERE term_id = :t AND status IN ('INVITED', 'PENDING', 'TO_MANAGER'))
                     + (SELECT count(*) FROM rpt_v_room_class_change
                        WHERE term_id = :t AND status IN ('AWAITING_CONSENT', 'SUBMITTED'))
                     + (SELECT count(*) FROM rpt_v_stay_request WHERE term_id = :t AND status = 'SUBMITTED') AS open,
                       (SELECT count(*) FROM rpt_v_allocation
                        WHERE term_id = :t AND status = 'ACTIVE' AND renewal = 'CONTINUING') AS continuing,
                       (SELECT count(*) FROM rpt_v_invoice WHERE term_id = :t AND type = 'TERM_FEE' AND status <> 'VOID')
                           AS issued,
                       (SELECT count(*) FROM rpt_v_invoice
                        WHERE term_id = :t AND type = 'TERM_FEE' AND status IN ('PAID', 'REFUNDED')) AS paid,
                       (SELECT count(*) FROM rpt_v_allocation
                        WHERE term_id = :t AND source = 'RENEWAL' AND status = 'CANCELLED') AS released
                """).param("t", termId)
                .query((rs, i) -> new Transition(rs.getLong("open"), rs.getLong("continuing"), rs.getLong("issued"),
                        rs.getLong("paid"), rs.getLong("released")))
                .single();
    }

    private static TermRow term(ResultSet rs) throws SQLException {
        Map<String, Instant> moments = new LinkedHashMap<>();
        for (String[] c : new String[][] { { "publishAt", "publish_at" }, { "requestsOpenAt", "requests_open_at" },
                { "requestsCloseAt", "requests_close_at" }, { "decisionsDueAt", "decisions_due_at" },
                { "reconciliationDueAt", "reconciliation_due_at" }, { "feesIssueAt", "fees_issue_at" },
                { "feesDueAt", "fees_due_at" }, { "registrationOpensAt", "registration_opens_at" },
                { "registrationClosesAt", "registration_closes_at" }, { "resultsPublishedAt", "results_published_at" },
                { "balanceDueAt", "balance_due_at" } }) {
            Timestamp ts = rs.getTimestamp(c[1]);
            moments.put(c[0], ts == null ? null : ts.toInstant());
        }
        Map<String, LocalDate> days = new LinkedHashMap<>();
        days.put("checkInStart", rs.getObject("check_in_start", LocalDate.class));
        days.put("checkInEnd", rs.getObject("check_in_end", LocalDate.class));
        days.put("stayStart", rs.getObject("stay_start", LocalDate.class));
        days.put("stayEnd", rs.getObject("stay_end", LocalDate.class));
        return new TermRow(rs.getLong("id"), rs.getString("name"), rs.getString("status"),
                rs.getObject("stay_start", LocalDate.class), rs.getObject("stay_end", LocalDate.class), moments, days);
    }

    private static void moment(List<Milestone> out, TermRow t, String key, String label, Instant now) {
        Instant at = t.moments().get(key);
        if (at != null) {
            out.add(new Milestone(key, label, at, null, !at.isAfter(now)));
        }
    }

    private static void day(List<Milestone> out, TermRow t, String key, String label, LocalDate today) {
        LocalDate date = t.days().get(key);
        if (date != null) {
            out.add(new Milestone(key, label, null, date, date.isBefore(today)));
        }
    }

    private static Instant instant(Milestone m) {
        return m.at() != null ? m.at() : m.date().atStartOfDay(TimeConfig.CAMPUS_ZONE).toInstant();
    }

    private static String label(TermRow t, Instant now, LocalDate today) {
        Instant opens = t.moments().get("registrationOpensAt");
        Instant closes = t.moments().get("registrationClosesAt");
        if (opens != null && closes != null && !now.isBefore(opens) && now.isBefore(closes)) {
            return "Registration open";
        }
        if (today.isAfter(t.stayEnd())) {
            return "Closed";
        }
        return today.isBefore(t.stayStart()) ? "Published" : "In stay";
    }
}

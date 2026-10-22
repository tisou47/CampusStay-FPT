package vn.fpt.campusstay.service.report;

import java.time.Clock;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.security.BlockScope;
import vn.fpt.campusstay.security.BlockSelection;
import vn.fpt.campusstay.service.setting.TermCatalog;
import vn.fpt.campusstay.dto.setting.TermSummary;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.config.TimeConfig;

/**
 * The Term and Blocks a dashboard or report covers. Blocks come from the user's
 * scope ({@link BlockScope}); Applications and Deposits without a Bed belong to the
 * Blocks of the student's gender, as on the work queues.
 */
@Component
class ReportScope {

    /** @param codes Block id → code, in code order; {@code genders} {@code M}/{@code F} of those Blocks */
    record Blocks(Set<Long> ids, boolean single, Map<Long, String> codes, Set<String> genders) {

        List<Long> idList() {
            return List.copyOf(ids);
        }
    }

    static final Map<String, String> APPLICATION_STATUSES = Map.ofEntries(Map.entry("DRAFT", "Draft"),
            Map.entry("AWAITING_ROOMMATE", "Awaiting Roommate"), Map.entry("AWAITING_DEPOSIT", "Awaiting Deposit"),
            Map.entry("SUBMITTED", "Submitted"), Map.entry("UNDER_REVIEW", "Under Review"),
            Map.entry("APPROVED", "Approved"), Map.entry("WAITLISTED", "Waitlisted"), Map.entry("ALLOCATED", "Allocated"),
            Map.entry("REJECTED", "Rejected"), Map.entry("CANCELLED", "Cancelled"), Map.entry("EXPIRED", "Expired"));

    /** Capacity counts Beds in service, in Rooms in service, in active Blocks; {@code alias} of {@code rpt_v_bed} or null. */
    static String inService(String alias) {
        String a = alias == null ? "" : alias + ".";
        // Spaces around: text blocks drop the trailing space before it.
        return " (" + a + "bed_status = 'IN_SERVICE' AND " + a + "room_status = 'IN_SERVICE' AND " + a
                + "block_status = 'ACTIVE') ";
    }

    private final JdbcClient jdbc;
    private final BlockScope blockScope;
    private final TermCatalog terms;
    private final Clock clock;

    ReportScope(JdbcClient jdbc, BlockScope blockScope, TermCatalog terms, Clock clock) {
        this.jdbc = jdbc;
        this.blockScope = blockScope;
        this.terms = terms;
        this.clock = clock;
    }

    /**
     * Allocations that count in the Term ({@code alias} of {@code rpt_v_allocation}): the ones holding a Bed; once the
     * stay is over, also the ones ended by check-out (or at the end of the Term), so a past Term still shows who lived
     * there. Room changes and swaps end an Allocation for another one, which is counted instead.
     */
    String held(TermSummary term, String alias) {
        String a = alias + ".";
        boolean over = term.stayEnd() != null
                && LocalDate.now(clock.withZone(TimeConfig.CAMPUS_ZONE)).isAfter(term.stayEnd());
        return over ? " (" + a + "status = 'ACTIVE' OR (" + a + "status = 'ENDED' AND " + a
                + "end_reason IN ('CHECK_OUT', 'TERM_END'))) " : " " + a + "status = 'ACTIVE' ";
    }

    /** Query parameters {@code term}, {@code b} (Block ids) and {@code genders} (never empty, so {@code IN} stays valid). */
    static Map<String, Object> params(TermSummary term, Blocks blocks) {
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("term", term.id());
        p.put("b", blocks.idList());
        p.put("genders", blocks.genders().isEmpty() ? List.of("-") : List.copyOf(blocks.genders()));
        return p;
    }

    /** The given published Term, else the current one, else the one open for registration. */
    TermSummary term(Long termId) {
        if (termId != null) {
            return terms.findPublished(termId).orElseThrow(() -> ApiException.notFound("This Term does not exist."));
        }
        return terms.publishedTerms().stream().filter(TermSummary::current).findFirst()
                .or(terms::openForRegistration)
                .orElseThrow(() -> ApiException.notFound("No Term is published yet."));
    }

    /** {@code block} blank = every Block the user may see. */
    Blocks blocks(String block) {
        BlockSelection selection = blockScope.resolve(block);
        record Row(long id, String code, String gender) {
        }
        List<Row> rows = jdbc.sql("SELECT DISTINCT building_id, block, gender FROM rpt_v_bed WHERE building_id IN (:b)")
                .param("b", List.copyOf(selection.ids()))
                .query((rs, i) -> new Row(rs.getLong("building_id"), rs.getString("block"), rs.getString("gender")))
                .list();
        Map<Long, String> codes = new LinkedHashMap<>();
        rows.stream().sorted(Comparator.comparing(Row::code)).forEach(r -> codes.put(r.id(), r.code()));
        return new Blocks(selection.ids(), selection.single(), codes,
                rows.stream().map(Row::gender).collect(Collectors.toCollection(TreeSet::new)));
    }
}

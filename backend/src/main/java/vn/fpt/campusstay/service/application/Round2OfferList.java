package vn.fpt.campusstay.service.application;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.dto.PageQuery;
import vn.fpt.campusstay.dto.setting.TermSummary;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.service.auth.BlockDirectory;
import vn.fpt.campusstay.service.setting.Catalog;
import vn.fpt.campusstay.service.setting.TermCatalog;

/**
 * Who Round 2 reached (A-58): every offer of a Term with its student, its held options and the answer, and the
 * Waitlisted students still without an offer. Managers read it next to the Round 2 button.
 */
@Service
public class Round2OfferList {

    /** One held option; {@code chosen} is the one the student accepted. */
    public record Option(String block, String roomTypeName, String roomClassName, long termPrice, long difference,
            boolean chosen) {
    }

    /**
     * @param status Pending, Accepted, Declined, Expired, Withdrawn, or No offer (Waitlisted, nothing offered yet)
     * @param id     the offer, null for a student without an offer
     */
    public record Item(String id, String applicationId, String studentName, String studentCode, String requested,
            String status, Instant offeredAt, Instant expiresAt, Instant respondedAt, List<Option> options) {
    }

    public record Counts(long pending, long accepted, long declined, long expired, long withdrawn, long noOffer) {
    }

    public record Page(List<Item> items, long total, Counts counts) {
    }

    private static final Map<String, String> STATUSES = Map.of("PENDING", "Pending", "ACCEPTED", "Accepted",
            "DECLINED", "Declined", "EXPIRED", "Expired", "WITHDRAWN", "Withdrawn");
    private static final String NO_OFFER = "No offer";

    private record OfferRow(long id, long applicationId, String status, Instant createdAt, Instant expiresAt,
            Instant respondedAt) {
    }

    private record OptionRow(long offerId, long roomTypeId, long roomClassId, long buildingId, long termPrice,
            long difference, boolean chosen) {
    }

    private final JdbcClient jdbc;
    private final Applications applications;
    private final CurrentUser currentUser;
    private final TermCatalog terms;
    private final Catalog catalog;
    private final BlockDirectory blocks;

    public Round2OfferList(JdbcClient jdbc, Applications applications, CurrentUser currentUser, TermCatalog terms,
            Catalog catalog, BlockDirectory blocks) {
        this.jdbc = jdbc;
        this.applications = applications;
        this.currentUser = currentUser;
        this.terms = terms;
        this.catalog = catalog;
        this.blocks = blocks;
    }

    /**
     * @param status a status label (Pending, Accepted, Declined, Expired, Withdrawn, No offer) or blank for every offer
     * @param q      part of the student's name or code, or the Application code
     */
    @Transactional(readOnly = true)
    public Page list(Long termId, String status, String q, PageQuery page) {
        currentUser.require(Permission.RUN_ASSIGNMENT);
        if (termId == null) {
            throw FieldErrors.single("termId", "Choose a Term.");
        }
        TermSummary term = terms.findPublished(termId).orElseThrow(() -> ApiException.notFound("This Term does not exist."));
        String wanted = status == null || status.isBlank() ? null : label(status.trim());

        List<OfferRow> offers = jdbc.sql("""
                SELECT f.id, f.application_id, f.status, f.created_at, f.expires_at, f.responded_at
                FROM app_round2_offer f JOIN app_application a ON a.id = f.application_id
                WHERE a.term_id = :term ORDER BY f.created_at DESC, f.id DESC
                """).param("term", term.id())
                .query((rs, i) -> new OfferRow(rs.getLong("id"), rs.getLong("application_id"), rs.getString("status"),
                        rs.getTimestamp("created_at").toInstant(), rs.getTimestamp("expires_at").toInstant(),
                        instant(rs.getTimestamp("responded_at"))))
                .list();
        List<Applications.Candidate> waiting = applications.waitlistedWithoutOffer(term.id());
        Map<String, Long> byStatus = offers.stream().collect(Collectors.groupingBy(o -> STATUSES.get(o.status()),
                Collectors.counting()));
        Counts counts = new Counts(byStatus.getOrDefault("Pending", 0L), byStatus.getOrDefault("Accepted", 0L),
                byStatus.getOrDefault("Declined", 0L), byStatus.getOrDefault("Expired", 0L),
                byStatus.getOrDefault("Withdrawn", 0L), waiting.size());

        Map<Long, Applications.Candidate> apps = new LinkedHashMap<>(offers.isEmpty() ? Map.of()
                : applications.find(offers.stream().map(OfferRow::applicationId).distinct().toList()));
        waiting.forEach(c -> apps.putIfAbsent(c.applicationId(), c));
        Map<Long, String> types = catalog.roomTypes().stream()
                .collect(Collectors.toMap(Catalog.RoomTypeInfo::id, Catalog.RoomTypeInfo::name));
        Map<Long, String> classes = catalog.roomClasses().stream()
                .collect(Collectors.toMap(Catalog.RoomClassInfo::id, Catalog.RoomClassInfo::name));

        record Row(OfferRow offer, Applications.Candidate app) {
        }
        List<Row> rows = new ArrayList<>();
        if (wanted == null || !wanted.equals(NO_OFFER)) {
            offers.stream().filter(o -> wanted == null || STATUSES.get(o.status()).equals(wanted))
                    .forEach(o -> rows.add(new Row(o, apps.get(o.applicationId()))));
        }
        if (wanted == null || wanted.equals(NO_OFFER)) {
            waiting.stream().sorted(Comparator.comparing(Applications.Candidate::studentName))
                    .forEach(c -> rows.add(new Row(null, c)));
        }
        List<Row> shown = rows.stream().filter(r -> r.app() != null && matches(r.app(), q)).toList();
        List<Row> pageRows = shown.stream().skip(page.offset()).limit(page.limit()).toList();

        Map<Long, List<OptionRow>> options = options(pageRows.stream().map(Row::offer)
                .filter(o -> o != null).map(OfferRow::id).toList());
        Map<Long, String> codes = blocks.codesByIds(options.values().stream().flatMap(List::stream)
                .map(OptionRow::buildingId).collect(Collectors.toSet()));
        List<Item> items = pageRows.stream().map(r -> {
            Applications.Candidate c = r.app();
            String requested = types.get(c.roomTypeId()) + " · " + classes.get(c.roomClassId());
            if (r.offer() == null) {
                return new Item(null, c.code(), c.studentName(), c.studentCode(), requested, NO_OFFER, null, null, null,
                        List.of());
            }
            OfferRow o = r.offer();
            return new Item(String.valueOf(o.id()), c.code(), c.studentName(), c.studentCode(), requested,
                    STATUSES.get(o.status()), o.createdAt(), o.expiresAt(), o.respondedAt(),
                    options.getOrDefault(o.id(), List.of()).stream().map(x -> new Option(codes.get(x.buildingId()),
                            types.get(x.roomTypeId()), classes.get(x.roomClassId()), x.termPrice(), x.difference(),
                            x.chosen())).toList());
        }).toList();
        return new Page(items, shown.size(), counts);
    }

    private Map<Long, List<OptionRow>> options(Collection<Long> offerIds) {
        if (offerIds.isEmpty()) {
            return Map.of();
        }
        return jdbc.sql("""
                SELECT offer_id, room_type_id, room_class_id, building_id, term_price, difference, chosen
                FROM app_round2_option WHERE offer_id IN (:ids) ORDER BY abs(difference), id
                """).param("ids", Set.copyOf(offerIds))
                .query((rs, i) -> new OptionRow(rs.getLong("offer_id"), rs.getLong("room_type_id"),
                        rs.getLong("room_class_id"), rs.getLong("building_id"), rs.getLong("term_price"),
                        rs.getLong("difference"), rs.getBoolean("chosen")))
                .list().stream().collect(Collectors.groupingBy(OptionRow::offerId, LinkedHashMap::new, Collectors.toList()));
    }

    private static String label(String status) {
        if (status.equalsIgnoreCase(NO_OFFER)) {
            return NO_OFFER;
        }
        return STATUSES.values().stream().filter(s -> s.equalsIgnoreCase(status)).findFirst()
                .orElseThrow(() -> FieldErrors.single("status",
                        "Choose Pending, Accepted, Declined, Expired, Withdrawn or No offer."));
    }

    private static boolean matches(Applications.Candidate c, String q) {
        if (q == null || q.isBlank()) {
            return true;
        }
        String needle = q.trim().toLowerCase(Locale.ROOT);
        return c.studentName().toLowerCase(Locale.ROOT).contains(needle)
                || c.studentCode().toLowerCase(Locale.ROOT).contains(needle)
                || c.code().toLowerCase(Locale.ROOT).contains(needle);
    }

    private static Instant instant(Timestamp t) {
        return t == null ? null : t.toInstant();
    }
}

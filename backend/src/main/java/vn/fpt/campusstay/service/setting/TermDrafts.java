package vn.fpt.campusstay.service.setting;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;
import vn.fpt.campusstay.exception.ApiException;

/**
 * Reads and writes the wizard's values of a Term ({@code cfg_term} and its price, Block and Room tables) for the
 * registration-period services. Labels of the fields, as screens and change announcements name them, are here too.
 */
@Component
class TermDrafts {

    /**
     * A Term as the wizard sees it.
     *
     * @param prices          {@code roomTypeId:roomClassId} → price per Bed
     * @param eligibilityKeys the criteria it opened with, null while it is a Draft (or published before V42)
     */
    record Term(long id, String code, String name, String status, LocalDate stayStart, LocalDate stayEnd,
            TermPlan.Timeline timeline, BigDecimal reservedNewPercent, BigDecimal depositPercent, Long utilityDeposit,
            Long matchingSnapshotId, List<String> eligibilityKeys, List<String> priorityGroupKeys, String houseRules,
            List<TermPlan.Faq> faq, List<TermPlan.Document> documents, int wizardStep,
            Map<String, String> changeReasons, Instant publishedAt, Set<Long> blocks, Set<Long> excludedRooms,
            Map<String, Long> prices) {

        boolean draft() {
            return "DRAFT".equals(status);
        }
    }

    /** English labels of the Term's fields (differences, change announcements, the Audit Log). */
    static final Map<String, String> LABELS = new LinkedHashMap<>();

    /** How each field's values are shown ({@code ValueChange.type}). */
    static final Map<String, String> TYPES = new LinkedHashMap<>();

    static {
        field("name", "Name", "TEXT");
        field("stayStart", "Stay starts", "DATE");
        field("stayEnd", "Stay ends", "DATE");
        field("publishAt", "Publish (M1)", "DATETIME");
        field("requestsOpenAt", "Requests window opens (M2)", "DATETIME");
        field("requestsCloseAt", "Request deadline (M3)", "DATETIME");
        field("decisionsDueAt", "Decision deadline (M4)", "DATETIME");
        field("reconciliationDueAt", "Reconciliation (M5)", "DATETIME");
        field("feesIssueAt", "Next-Term fees issued (M6)", "DATETIME");
        field("feesDueAt", "Next-Term fee deadline (M7)", "DATETIME");
        field("registrationOpensAt", "Registration opens", "DATETIME");
        field("registrationClosesAt", "Registration closes", "DATETIME");
        field("resultsPublishedAt", "Assignment results", "DATETIME");
        field("roommateHours", "Roommate confirmation (hours)", "NUMBER");
        field("depositHours", "Deposit payment (hours)", "NUMBER");
        field("balanceDueAt", "Balance due", "DATETIME");
        field("checkInStart", "Check-in from", "DATE");
        field("checkInEnd", "Check-in until", "DATE");
        field("checkOutBy", "Check-out by", "DATE");
        field("blocks", "Blocks used", "TEXT");
        field("excludedRooms", "Rooms left out", "TEXT");
        field("reservedNewPercent", "Beds kept for new students", "PERCENT");
        field("depositPercent", "Deposit", "PERCENT");
        field("utilityDeposit", "Utility Deposit", "MONEY");
        field("houseRules", "House rules", "TEXT");
        field("faq", "Questions and answers", "TEXT");
        field("documents", "Documents", "TEXT");
    }

    private static void field(String key, String label, String type) {
        LABELS.put(key, label);
        TYPES.put(key, type);
    }

    private static final String COLUMNS = """
            id, code, name, status, stay_start, stay_end, publish_at, requests_open_at, requests_close_at,
            decisions_due_at, reconciliation_due_at, fees_issue_at, fees_due_at, registration_opens_at,
            registration_closes_at, results_published_at, roommate_hours, deposit_hours, balance_due_at, check_in_start,
            check_in_end, check_out_by, reserved_new_percent, deposit_percent, utility_deposit, matching_snapshot_id,
            eligibility_keys::text AS eligibility_keys, priority_group_keys::text AS priority_group_keys, house_rules,
            faq::text AS faq, documents::text AS documents, wizard_step, change_reasons::text AS change_reasons,
            published_at
            """;

    private final JdbcClient jdbc;
    private final JsonMapper json;

    TermDrafts(JdbcClient jdbc, JsonMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    @Transactional(readOnly = true)
    Optional<Term> find(long id) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM cfg_term WHERE id = :id").param("id", id)
                .query((rs, i) -> map(rs)).optional()
                .map(this::withTables);
    }

    @Transactional(readOnly = true)
    Term get(long id) {
        return find(id).orElseThrow(() -> ApiException.notFound("This Term does not exist."));
    }

    /** Locks the Term row for a change (two Admins saving at once wait for each other). */
    @Transactional(propagation = Propagation.MANDATORY)
    Term lock(long id) {
        jdbc.sql("SELECT id FROM cfg_term WHERE id = :id FOR UPDATE").param("id", id).query(Long.class).optional()
                .orElseThrow(() -> ApiException.notFound("This Term does not exist."));
        return get(id);
    }

    /** The published Term with the latest stay start before {@code stayStart}, other than {@code exceptId}. */
    @Transactional(readOnly = true)
    Optional<TermTimelines.Previous> previous(LocalDate stayStart, Long exceptId) {
        if (stayStart == null) {
            return Optional.empty();
        }
        return jdbc.sql("""
                SELECT name, stay_end, check_out_by FROM cfg_term
                WHERE status <> 'DRAFT' AND stay_start < :start AND id <> :except
                ORDER BY stay_start DESC LIMIT 1
                """)
                .param("start", stayStart).param("except", exceptId == null ? -1L : exceptId)
                .query((rs, i) -> new TermTimelines.Previous(rs.getString("name"),
                        rs.getObject("stay_end", LocalDate.class), rs.getObject("check_out_by", LocalDate.class)))
                .optional();
    }

    /** The published Term the stay dates overlap, other than {@code exceptId}. */
    @Transactional(readOnly = true)
    Optional<String> overlapping(LocalDate stayStart, LocalDate stayEnd, Long exceptId) {
        if (stayStart == null || stayEnd == null) {
            return Optional.empty();
        }
        return jdbc.sql("""
                SELECT name FROM cfg_term
                WHERE status <> 'DRAFT' AND id <> :id
                  AND daterange(stay_start, stay_end, '[]') && daterange(CAST(:start AS date), CAST(:end AS date), '[]')
                ORDER BY stay_start LIMIT 1
                """)
                .param("id", exceptId == null ? -1L : exceptId).param("start", stayStart).param("end", stayEnd)
                .query(String.class).optional();
    }

    @Transactional(propagation = Propagation.MANDATORY)
    void writeTimeline(long id, TermPlan.Timeline t) {
        jdbc.sql("""
                UPDATE cfg_term SET publish_at = :m1, requests_open_at = :m2, requests_close_at = :m3,
                       decisions_due_at = :m4, reconciliation_due_at = :m5, fees_issue_at = :m6, fees_due_at = :m7,
                       registration_opens_at = :opens, registration_closes_at = :closes, results_published_at = :results,
                       roommate_hours = :roommate, deposit_hours = :deposit, balance_due_at = :balance,
                       check_in_start = :checkInStart, check_in_end = :checkInEnd, check_out_by = :checkOutBy,
                       updated_at = now(), version = version + 1
                WHERE id = :id
                """)
                .param("m1", ts(t.publishAt())).param("m2", ts(t.requestsOpenAt())).param("m3", ts(t.requestsCloseAt()))
                .param("m4", ts(t.decisionsDueAt())).param("m5", ts(t.reconciliationDueAt()))
                .param("m6", ts(t.feesIssueAt())).param("m7", ts(t.feesDueAt()))
                .param("opens", ts(t.registrationOpensAt())).param("closes", ts(t.registrationClosesAt()))
                .param("results", ts(t.resultsPublishedAt())).param("roommate", t.roommateHours())
                .param("deposit", t.depositHours()).param("balance", ts(t.balanceDueAt()))
                .param("checkInStart", t.checkInStart()).param("checkInEnd", t.checkInEnd())
                .param("checkOutBy", t.checkOutBy()).param("id", id)
                .update();
    }

    @Transactional(propagation = Propagation.MANDATORY)
    void writeRooms(long id, Set<Long> blocks, Set<Long> excludedRooms, BigDecimal reservedNewPercent) {
        jdbc.sql("DELETE FROM cfg_term_block WHERE term_id = :id").param("id", id).update();
        for (long b : blocks) {
            jdbc.sql("INSERT INTO cfg_term_block (term_id, building_id) VALUES (:id, :b)").param("id", id).param("b", b)
                    .update();
        }
        jdbc.sql("DELETE FROM cfg_term_room_excluded WHERE term_id = :id").param("id", id).update();
        for (long r : excludedRooms) {
            jdbc.sql("INSERT INTO cfg_term_room_excluded (term_id, room_id) VALUES (:id, :r)").param("id", id)
                    .param("r", r).update();
        }
        jdbc.sql("UPDATE cfg_term SET reserved_new_percent = :p, updated_at = now(), version = version + 1 WHERE id = :id")
                .param("p", reservedNewPercent).param("id", id).update();
    }

    /** Replaces the price table; {@code null} money keeps the default (read through {@link FeePolicy}). */
    @Transactional(propagation = Propagation.MANDATORY)
    void writePrices(long id, Map<String, Long> prices, BigDecimal depositPercent, Long utilityDeposit) {
        jdbc.sql("DELETE FROM cfg_term_price WHERE term_id = :id").param("id", id).update();
        prices.forEach((key, price) -> {
            String[] ids = key.split(":");
            jdbc.sql("""
                    INSERT INTO cfg_term_price (term_id, room_type_id, room_class_id, price) VALUES (:id, :type, :class, :price)
                    """)
                    .param("id", id).param("type", Long.parseLong(ids[0])).param("class", Long.parseLong(ids[1]))
                    .param("price", price).update();
        });
        jdbc.sql("""
                UPDATE cfg_term SET deposit_percent = :deposit, utility_deposit = :utility, updated_at = now(),
                       version = version + 1
                WHERE id = :id
                """)
                .param("deposit", depositPercent).param("utility", utilityDeposit).param("id", id).update();
    }

    @Transactional(propagation = Propagation.MANDATORY)
    void writeInformation(long id, String houseRules, List<TermPlan.Faq> faq, List<TermPlan.Document> documents) {
        jdbc.sql("""
                UPDATE cfg_term SET house_rules = :rules, faq = CAST(:faq AS jsonb), documents = CAST(:docs AS jsonb),
                       updated_at = now(), version = version + 1
                WHERE id = :id
                """)
                .param("rules", houseRules).param("faq", json.writeValueAsString(faq))
                .param("docs", json.writeValueAsString(documents)).param("id", id).update();
    }

    @Transactional(propagation = Propagation.MANDATORY)
    void writeStep(long id, int step) {
        jdbc.sql("UPDATE cfg_term SET wizard_step = GREATEST(wizard_step, :step) WHERE id = :id AND status = 'DRAFT'")
                .param("step", step).param("id", id).update();
    }

    @Transactional(propagation = Propagation.MANDATORY)
    void writeReasons(long id, Map<String, String> reasons) {
        jdbc.sql("UPDATE cfg_term SET change_reasons = CAST(:r AS jsonb) WHERE id = :id")
                .param("r", json.writeValueAsString(reasons)).param("id", id).update();
    }

    private Term withTables(Term t) {
        Set<Long> blocks = new LinkedHashSet<>(jdbc.sql("SELECT building_id FROM cfg_term_block WHERE term_id = :id ORDER BY 1")
                .param("id", t.id()).query(Long.class).list());
        Set<Long> excluded = new LinkedHashSet<>(jdbc.sql(
                "SELECT room_id FROM cfg_term_room_excluded WHERE term_id = :id ORDER BY 1")
                .param("id", t.id()).query(Long.class).list());
        Map<String, Long> prices = new LinkedHashMap<>();
        jdbc.sql("SELECT room_type_id, room_class_id, price FROM cfg_term_price WHERE term_id = :id")
                .param("id", t.id())
                .query((rs, i) -> Map.entry(rs.getLong("room_type_id") + ":" + rs.getLong("room_class_id"),
                        rs.getLong("price")))
                .list()
                .forEach(e -> prices.put(e.getKey(), e.getValue()));
        return new Term(t.id(), t.code(), t.name(), t.status(), t.stayStart(), t.stayEnd(), t.timeline(),
                t.reservedNewPercent(), t.depositPercent(), t.utilityDeposit(), t.matchingSnapshotId(),
                t.eligibilityKeys(), t.priorityGroupKeys(), t.houseRules(), t.faq(), t.documents(), t.wizardStep(),
                t.changeReasons(), t.publishedAt(), blocks, excluded, prices);
    }

    private Term map(ResultSet rs) throws SQLException {
        TermPlan.Timeline timeline = new TermPlan.Timeline(at(rs, "publish_at"), at(rs, "requests_open_at"),
                at(rs, "requests_close_at"), at(rs, "decisions_due_at"), at(rs, "reconciliation_due_at"),
                at(rs, "fees_issue_at"), at(rs, "fees_due_at"), at(rs, "registration_opens_at"),
                at(rs, "registration_closes_at"), at(rs, "results_published_at"), integer(rs, "roommate_hours"),
                integer(rs, "deposit_hours"), at(rs, "balance_due_at"), rs.getObject("check_in_start", LocalDate.class),
                rs.getObject("check_in_end", LocalDate.class), rs.getObject("check_out_by", LocalDate.class));
        long snapshot = rs.getLong("matching_snapshot_id");
        Long matching = rs.wasNull() ? null : snapshot;
        long utility = rs.getLong("utility_deposit");
        Long utilityDeposit = rs.wasNull() ? null : utility;
        return new Term(rs.getLong("id"), rs.getString("code"), rs.getString("name"), rs.getString("status"),
                rs.getObject("stay_start", LocalDate.class), rs.getObject("stay_end", LocalDate.class), timeline,
                rs.getBigDecimal("reserved_new_percent"), rs.getBigDecimal("deposit_percent"), utilityDeposit, matching,
                list(rs.getString("eligibility_keys")), list(rs.getString("priority_group_keys")),
                rs.getString("house_rules"),
                json.readValue(rs.getString("faq"), new TypeReference<List<TermPlan.Faq>>() {
                }),
                json.readValue(rs.getString("documents"), new TypeReference<List<TermPlan.Document>>() {
                }),
                rs.getInt("wizard_step"),
                json.readValue(rs.getString("change_reasons"), new TypeReference<Map<String, String>>() {
                }),
                at(rs, "published_at"), Set.of(), Set.of(), Map.of());
    }

    private List<String> list(String text) {
        return text == null ? null : json.readValue(text, new TypeReference<List<String>>() {
        });
    }

    private static Instant at(ResultSet rs, String column) throws SQLException {
        Timestamp t = rs.getTimestamp(column);
        return t == null ? null : t.toInstant();
    }

    private static Integer integer(ResultSet rs, String column) throws SQLException {
        int value = rs.getInt(column);
        return rs.wasNull() ? null : value;
    }

    static Timestamp ts(Instant instant) {
        return instant == null ? null : Timestamp.from(instant);
    }
}

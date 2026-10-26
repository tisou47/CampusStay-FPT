package vn.fpt.campusstay;

import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * Helpers for the Term transition tests: Term N is {@link ApplyFlow}'s test Term (stay January–April 2031), N+1 a
 * Term after it whose requests window opened an hour ago (renewal milestones relative to now, so the tests do not
 * depend on the date) with its own prices, 10 % above the defaults.
 */
final class RenewalFlow {

    static final String NEXT_CODE = "TT32";
    static final String NEXT_NAME = "Test Term 2031 Summer";

    private final JdbcClient jdbc;
    private final StayFlow stay;

    RenewalFlow(JdbcClient jdbc, StayFlow stay) {
        this.jdbc = jdbc;
        this.stay = stay;
    }

    /** Publishes N+1 once; its registration opens later, the requests window is open until M3 in two days. */
    long openNextTerm() {
        jdbc.sql("""
                INSERT INTO cfg_term (code, name, status, stay_start, stay_end, registration_opens_at,
                                      registration_closes_at, results_published_at, roommate_hours, deposit_hours,
                                      balance_due_at, check_in_start, check_in_end, check_out_by, published_at,
                                      publish_at, requests_open_at, requests_close_at, decisions_due_at,
                                      reconciliation_due_at, fees_issue_at, fees_due_at)
                VALUES (:code, :name, 'PUBLISHED', DATE '2031-05-11', DATE '2031-08-30', now() + interval '20 days',
                        now() + interval '25 days', now() + interval '26 days', 48, 48, now() + interval '40 days',
                        DATE '2031-05-07', DATE '2031-05-10', DATE '2031-08-31', now() - interval '2 days',
                        now() - interval '2 days', now() - interval '1 hour', now() + interval '2 days',
                        now() + interval '3 days', now() + interval '3 days', now() + interval '3 days',
                        now() + interval '10 days')
                ON CONFLICT (code) DO NOTHING
                """).param("code", NEXT_CODE).param("name", NEXT_NAME).update();
        long id = nextTermId();
        jdbc.sql("""
                INSERT INTO cfg_term_price (term_id, room_type_id, room_class_id, price)
                SELECT :t, rt.id, rc.id, round(rt.base_price * (1 + rc.surcharge_rate) * 1.1 / 1000) * 1000
                FROM cfg_room_type rt CROSS JOIN cfg_room_class rc
                ON CONFLICT DO NOTHING
                """).param("t", id).update();
        return id;
    }

    /**
     * A clean requests window for each test of a class (they share one database): the window is not opened yet,
     * the milestones are back to their defaults, and the Allocations, Stays and open requests of earlier tests are
     * closed (cancelled, so the turnover never counts them as leavers).
     */
    void reset() {
        long next = nextTermId();
        jdbc.sql("DELETE FROM asg_renewal WHERE term_id = :t").param("t", next).update();
        jdbc.sql("DELETE FROM auth_reconciliation WHERE term_id = :t").param("t", next).update();
        jdbc.sql("""
                UPDATE req_room_class_change SET status = 'CANCELLED', version = version + 1
                WHERE term_id = :t AND status IN ('AWAITING_CONSENT', 'SUBMITTED')
                """).param("t", next).update();
        jdbc.sql("UPDATE req_stay_request SET status = 'CANCELLED' WHERE term_id = :t AND status = 'SUBMITTED'")
                .param("t", next).update();
        jdbc.sql("""
                UPDATE asg_allocation SET status = 'CANCELLED', ended_at = now(), end_reason = 'CANCELLED',
                       version = version + 1
                WHERE status = 'ACTIVE' AND term_id IN (:terms)
                """).param("terms", java.util.List.of(stay.termId(), next)).update();
        jdbc.sql("UPDATE asg_stay SET status = 'ENDED', ended_at = now(), end_kind = 'ENDED_EARLY' WHERE status = 'ACTIVE'")
                .update();
        jdbc.sql("""
                UPDATE cfg_term SET requests_open_at = now() - interval '1 hour', requests_close_at = now() + interval '2 days',
                       decisions_due_at = now() + interval '3 days', reconciliation_due_at = now() + interval '3 days',
                       fees_issue_at = now() + interval '3 days', fees_due_at = now() + interval '10 days',
                       check_in_start = DATE '2031-05-07'
                WHERE code = :c
                """).param("c", NEXT_CODE).update();
    }

    long nextTermId() {
        return jdbc.sql("SELECT id FROM cfg_term WHERE code = :c").param("c", NEXT_CODE).query(Long.class).single();
    }

    /** The next Term's price per Bed of a Room Type × Room Class. */
    long nextPrice(String roomType, String roomClass) {
        return jdbc.sql("""
                SELECT p.price FROM cfg_term_price p JOIN cfg_room_type t ON t.id = p.room_type_id
                JOIN cfg_room_class c ON c.id = p.room_class_id
                WHERE p.term_id = :t AND t.name = :type AND c.name = :class
                """).param("t", nextTermId()).param("type", roomType).param("class", roomClass).query(Long.class)
                .single();
    }

    /** A resident of N (holding the door code) whose Stay commits {@code terms} Terms: 1 = N is its last Term. */
    void resident(int n, String room, String bed, int terms) {
        stay.livesIn(n, room, bed, true);
        jdbc.sql("""
                WITH s AS (
                    INSERT INTO asg_stay (student_id, first_term_id, last_term_id, committed_terms, terms_used, started_at)
                    SELECT u.id, :t, :t, :terms, 1, now() FROM auth_user u WHERE u.email = :email
                    RETURNING id, student_id)
                UPDATE asg_allocation a SET stay_id = s.id FROM s
                WHERE a.student_id = s.student_id AND a.term_id = :t AND a.status = 'ACTIVE'
                """).param("t", stay.termId()).param("terms", terms).param("email", StayFlow.student(n)).update();
    }

    /** Moves a milestone of N+1 to {@code interval} from now ({@code -1 minute}, {@code 2 days}). */
    void milestone(String column, String interval) {
        if (!column.matches("[a-z_]+")) {
            throw new IllegalArgumentException(column);
        }
        jdbc.sql("UPDATE cfg_term SET " + column + " = now() + CAST(:i AS interval) WHERE code = :c")
                .param("i", interval).param("c", NEXT_CODE).update();
    }

    /** The student's active Allocation of a Term, as a string id. */
    String allocationOf(int n, long termId) {
        return jdbc.sql("""
                SELECT a.id::text FROM asg_allocation a JOIN auth_user u ON u.id = a.student_id
                WHERE u.email = :e AND a.term_id = :t AND a.status = 'ACTIVE'
                """).param("e", StayFlow.student(n)).param("t", termId).query(String.class).single();
    }

    /** The code of the student's live next-Term fee. */
    String feeOf(int n) {
        return jdbc.sql("""
                SELECT i.code FROM bil_invoice i JOIN auth_user u ON u.id = i.student_id
                WHERE u.email = :e AND i.type = 'TERM_FEE' AND i.status <> 'VOID'
                """).param("e", StayFlow.student(n)).query(String.class).single();
    }

    /** An overdue Utility Invoice of the student in Term N. */
    void overdueUtility(int n, long amount) {
        jdbc.sql("""
                INSERT INTO bil_invoice (code, term_id, student_id, allocation_id, building_id, type, title, amount,
                                         utility_deposit, status, transfer_content, due_at, student_name, student_code,
                                         gender)
                SELECT 'INV-TU-' || a.id, a.term_id, a.student_id, a.id, r.building_id, 'UTILITY', 'Utility · 03/2031',
                       :amount, 0, 'OVERDUE', 'CSTAYTU' || a.id, now() - interval '2 days', u.display_name,
                       s.student_code, s.gender
                FROM asg_allocation a JOIN auth_user u ON u.id = a.student_id JOIN auth_student s ON s.user_id = u.id
                JOIN inv_bed b ON b.id = a.bed_id JOIN inv_room r ON r.id = b.room_id
                WHERE u.email = :email AND a.status = 'ACTIVE' AND a.term_id = :t
                """).param("amount", amount).param("email", StayFlow.student(n)).param("t", stay.termId()).update();
    }

    /** CSV of an enrolled list: every code given is Enrolled. */
    static byte[] enrolled(String... codes) {
        StringBuilder csv = new StringBuilder("student_code,full_name,enrollment_status\n");
        for (String code : codes) {
            csv.append(code).append(",,Enrolled\n");
        }
        return csv.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);
    }
}

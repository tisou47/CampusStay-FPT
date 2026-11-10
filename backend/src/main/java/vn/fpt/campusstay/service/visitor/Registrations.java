package vn.fpt.campusstay.service.visitor;

import java.time.Instant;

import org.springframework.jdbc.core.simple.JdbcClient;

import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.service.visitor.FamilyDays.Day;
import vn.fpt.campusstay.service.visitor.FamilyDays.Registration;

/** Cancelling one registration, by its student or a Manager: the same rules and the same writes. */
final class Registrations {

    private Registrations() {
    }

    /**
     * Cancels a live registration of an open Family Day none of whose guests came in: the guests' passes stop working
     * and their places in the time slot are freed. The caller holds the Family Day's lock.
     */
    static void cancel(JdbcClient jdbc, FamilyDays days, Day day, Registration r, long by, String reason, Instant now) {
        if (!r.status().equals("APPROVED")) {
            throw ApiException.conflict("REGISTRATION_CANCELLED", "This registration is already cancelled.");
        }
        if (!day.status().equals("PUBLISHED")) {
            throw ApiException.conflict("FAMILY_DAY_ENDED", "This Family Day is already cancelled or completed.");
        }
        int arrived = jdbc.sql("""
                SELECT count(*) FROM vis_visitor WHERE registration_id = :r AND status IN ('CHECKED_IN', 'CHECKED_OUT')
                """).param("r", r.id()).query(Integer.class).single();
        if (arrived > 0) {
            throw ApiException.conflict("REGISTRATION_IN_USE",
                    "A guest of this registration has already come in, so it cannot be cancelled.");
        }
        int guests = jdbc.sql("""
                UPDATE vis_visitor SET status = 'CANCELLED' WHERE registration_id = :r AND status = 'NOT_ARRIVED'
                """).param("r", r.id()).update();
        jdbc.sql("""
                UPDATE vis_registration SET status = 'CANCELLED', cancelled_at = :now, cancelled_by = :by,
                       cancel_reason = :why
                WHERE id = :r
                """).param("now", FamilyDayService.ts(now)).param("by", by).param("why", reason).param("r", r.id())
                .update();
        jdbc.sql("UPDATE vis_time_slot SET booked = booked - :n WHERE id = :s").param("n", guests)
                .param("s", r.slotId()).update();
    }
}

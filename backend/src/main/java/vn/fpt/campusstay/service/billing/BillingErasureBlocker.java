package vn.fpt.campusstay.service.billing;

import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.service.auth.ErasureBlockers;

/** Money still owed either way keeps the student's data: an open Invoice, or a refund not paid yet (W3-D3). */
@Component
class BillingErasureBlocker implements ErasureBlockers {

    private final JdbcClient jdbc;

    BillingErasureBlocker(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Optional<Blocker> blocker(long studentId) {
        boolean invoice = jdbc.sql("""
                SELECT EXISTS (SELECT 1 FROM bil_invoice WHERE student_id = :s
                               AND status IN ('UNPAID', 'OVERDUE', 'AWAITING_CONFIRMATION'))
                """).param("s", studentId).query(Boolean.class).single();
        if (invoice) {
            return Optional.of(new Blocker("ERASURE_OPEN_INVOICE",
                    "The student has an Invoice still open. Erase the data once it is paid or void."));
        }
        boolean refund = jdbc.sql("SELECT EXISTS (SELECT 1 FROM bil_refund WHERE student_id = :s AND status IN ('PENDING', 'APPROVED'))")
                .param("s", studentId).query(Boolean.class).single();
        return refund ? Optional.of(new Blocker("ERASURE_OPEN_REFUND",
                "The student has a refund not paid yet. Erase the data once it is paid.")) : Optional.empty();
    }
}

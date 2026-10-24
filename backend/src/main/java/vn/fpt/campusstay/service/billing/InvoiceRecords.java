package vn.fpt.campusstay.service.billing;

import java.util.List;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.service.auth.StudentRecords;

/** The student hub's Invoices (implements Auth's {@link StudentRecords}). */
@Component
@Transactional(readOnly = true)
class InvoiceRecords implements StudentRecords {

    private final JdbcClient jdbc;

    InvoiceRecords(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public String section() {
        return "invoices";
    }

    @Override
    public List<Item> of(long studentId, int limit) {
        return jdbc.sql("""
                SELECT code, title, type, amount, status, issued_at FROM bil_invoice
                WHERE student_id = :student ORDER BY issued_at DESC, id DESC LIMIT :limit
                """).param("student", studentId).param("limit", limit)
                .query((rs, i) -> new Item("invoice", rs.getString("code"), rs.getString("title"),
                        InvoiceLabels.typeLabel(rs.getString("type")), InvoiceLabels.status(rs.getString("status")),
                        rs.getLong("amount"), rs.getTimestamp("issued_at").toInstant()))
                .list();
    }
}

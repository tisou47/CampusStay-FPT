package vn.fpt.campusstay.repository.billing;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * Reads of {@code bil_invoice} shared by the Billing services. Clients address an
 * Invoice by its code ({@code INV-SP27-000123}); a numeric id is accepted too.
 */
@Component
public class InvoiceStore {

    public record Invoice(long id, String code, long termId, long studentId, Long applicationId, String type, String title,
            long amount, String status, String lines, long utilityDeposit, String transferContent, Instant qrExpiresAt,
            Instant issuedAt, Instant dueAt, Instant paidAt, String paymentMethod, String reference, String gender,
            Long buildingId, String breakdown) {

        public boolean payable() {
            return status.equals("UNPAID") || status.equals("OVERDUE") || status.equals("AWAITING_CONFIRMATION");
        }
    }

    public static final String COLUMNS = """
            id, code, term_id, student_id, application_id, type, title, amount, status, lines::text AS lines,
            utility_deposit, transfer_content, qr_expires_at, issued_at, due_at, paid_at, payment_method, reference,
            gender, building_id, breakdown::text AS breakdown
            """;

    private final JdbcClient jdbc;

    public InvoiceStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<Invoice> find(String idOrCode) {
        if (idOrCode == null || idOrCode.isBlank()) {
            return Optional.empty();
        }
        String value = idOrCode.trim();
        if (value.chars().allMatch(Character::isDigit) && value.length() < 19) {
            return find(Long.parseLong(value), false);
        }
        return jdbc.sql("SELECT " + COLUMNS + " FROM bil_invoice WHERE upper(code) = upper(:code)")
                .param("code", value).query(InvoiceStore::map).optional();
    }

    public Optional<Invoice> find(long id, boolean lock) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM bil_invoice WHERE id = :id" + (lock ? " FOR UPDATE" : ""))
                .param("id", id).query(InvoiceStore::map).optional();
    }

    public Optional<Invoice> findByTransferContent(String transferContent, boolean lock) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM bil_invoice WHERE upper(transfer_content) = upper(:content)"
                + (lock ? " FOR UPDATE" : ""))
                .param("content", transferContent).query(InvoiceStore::map).optional();
    }

    public List<Invoice> ofApplication(long applicationId) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM bil_invoice WHERE application_id = :app ORDER BY issued_at, id")
                .param("app", applicationId).query(InvoiceStore::map).list();
    }

    public static Invoice map(ResultSet rs, int i) throws SQLException {
        return new Invoice(rs.getLong("id"), rs.getString("code"), rs.getLong("term_id"), rs.getLong("student_id"),
                rs.getObject("application_id", Long.class), rs.getString("type"), rs.getString("title"),
                rs.getLong("amount"), rs.getString("status"), rs.getString("lines"), rs.getLong("utility_deposit"),
                rs.getString("transfer_content"), instant(rs, "qr_expires_at"), instant(rs, "issued_at"),
                instant(rs, "due_at"), instant(rs, "paid_at"), rs.getString("payment_method"), rs.getString("reference"),
                rs.getString("gender"), rs.getObject("building_id", Long.class), rs.getString("breakdown"));
    }

    public static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp t = rs.getTimestamp(column);
        return t == null ? null : t.toInstant();
    }
}

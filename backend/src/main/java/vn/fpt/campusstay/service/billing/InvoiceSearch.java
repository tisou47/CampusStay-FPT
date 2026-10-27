package vn.fpt.campusstay.service.billing;

import java.util.List;

import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.common.search.SearchSource;

/**
 * Invoices by code ({@code INV-…}) or transfer content. Invoices without a Block (Deposits before the assignment)
 * are found by Managers and the Admin only.
 */
@Component
@Order(3)
@Transactional(readOnly = true)
class InvoiceSearch implements SearchSource {

    private final JdbcClient jdbc;

    InvoiceSearch(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public List<Hit> search(String q, Scope scope, int limit) {
        return jdbc.sql("""
                SELECT code, title, student_name, student_code FROM bil_invoice
                WHERE (code ILIKE :start OR transfer_content ILIKE :start)
                  AND (building_id IN (:blocks) OR (building_id IS NULL AND :every))
                ORDER BY created_at DESC, id DESC LIMIT :limit
                """).param("start", SearchSource.like(q, false)).param("blocks", List.copyOf(scope.blockIds()))
                .param("every", scope.everyBlock()).param("limit", limit)
                .query((rs, i) -> new Hit("invoice", rs.getString("code"), rs.getString("code"),
                        rs.getString("title") + " · " + rs.getString("student_name") + " (" + rs.getString("student_code")
                                + ")"))
                .list();
    }
}

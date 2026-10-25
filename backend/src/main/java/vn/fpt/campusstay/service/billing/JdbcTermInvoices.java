package vn.fpt.campusstay.service.billing;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.service.setting.TermInvoices;

/** Implements Settings's {@link TermInvoices} port: any Invoice of the Term, whatever its status. */
@Component
@Transactional(readOnly = true)
class JdbcTermInvoices implements TermInvoices {

    private final JdbcClient jdbc;

    JdbcTermInvoices(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public boolean anyIssued(long termId) {
        return jdbc.sql("SELECT EXISTS (SELECT 1 FROM bil_invoice WHERE term_id = :term)").param("term", termId)
                .query(Boolean.class).single();
    }
}

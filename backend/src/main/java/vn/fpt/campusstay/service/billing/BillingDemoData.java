package vn.fpt.campusstay.service.billing;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.common.demo.DemoData;
import vn.fpt.campusstay.common.demo.DemoScripts;

/**
 * Billing's demo part: Invoices, claims, payments, refunds, Utility warnings and the meter periods.
 */
@Component
class BillingDemoData implements DemoData {

    private final JdbcTemplate jdbc;

    BillingDemoData(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public int order() {
        return 60;
    }

    @Override
    public void clear() {
        jdbc.execute("DELETE FROM bil_payment");
        jdbc.execute("DELETE FROM bil_payment_claim");
        jdbc.execute("DELETE FROM bil_refund");
        jdbc.execute("DELETE FROM bil_utility_warning");
        jdbc.execute("DELETE FROM bil_meter_cut");
        jdbc.execute("DELETE FROM bil_meter_reading");
        jdbc.execute("DELETE FROM bil_meter_period");
        jdbc.execute("DELETE FROM bil_bank_transaction_archive");
        jdbc.execute("DELETE FROM bil_invoice");
    }

    @Override
    public void load(Stage stage) {
        DemoScripts.run(jdbc, "bil.sql", stage);
    }
}

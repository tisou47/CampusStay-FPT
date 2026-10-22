package vn.fpt.campusstay.service.setting;

import java.math.BigDecimal;

/** NUMERIC columns come back with their scale ({@code 0.1500}, {@code 20.00}); the API shows {@code 0.15}, {@code 20}. */
final class Decimals {

    private Decimals() {
    }

    static BigDecimal plain(BigDecimal value) {
        // toPlainString avoids 2E+1; the new BigDecimal then prints as "20".
        return value == null ? null : new BigDecimal(value.stripTrailingZeros().toPlainString());
    }
}

package vn.fpt.campusstay.cfg;

/** CFG public API: utility prices and rounding (Admin › Utility), for BIL's check-out settlement and bills. */
public interface UtilityPolicy {

    /**
     * @param rounding       e.g. {@code ROUND_UP_1000}: shares are rounded up to whole thousands
     * @param paymentDueDays days a utility charge may stay unpaid
     */
    record Prices(long priceKwh, long priceM3, String rounding, int paymentDueDays) {

        /** Applies the rounding rule to an amount in VND. */
        public long round(long amount) {
            if (rounding != null && rounding.startsWith("ROUND_UP_")) {
                long step = Long.parseLong(rounding.substring("ROUND_UP_".length()));
                return step <= 0 ? amount : Math.ceilDiv(amount, step) * step;
            }
            return amount;
        }
    }

    Prices prices();
}

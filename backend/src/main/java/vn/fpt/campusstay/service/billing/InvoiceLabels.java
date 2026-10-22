package vn.fpt.campusstay.service.billing;

import java.util.Map;

/** Contract words for Invoice types, statuses and payment methods (DB keeps UPPER_SNAKE). */
final class InvoiceLabels {

    private static final Map<String, String> TYPES = Map.of("DEPOSIT", "deposit", "BALANCE", "balance", "UTILITY",
            "utility", "ROOM_CHANGE", "roomChange", "DAMAGE", "damage");
    private static final Map<String, String> TYPE_LABELS = Map.of("DEPOSIT", "Deposit", "BALANCE", "Balance",
            "UTILITY", "Utility", "ROOM_CHANGE", "Room change", "DAMAGE", "Damage");
    private static final Map<String, String> STATUSES = Map.of("UPCOMING", "Upcoming", "UNPAID", "Unpaid",
            "AWAITING_CONFIRMATION", "Awaiting confirmation", "PAID", "Paid", "OVERDUE", "Overdue", "REFUNDED",
            "Refunded", "VOID", "Void");
    private static final Map<String, String> METHODS = Map.of("VIETQR", "VietQR", "MANUAL", "Manual transfer");

    private InvoiceLabels() {
    }

    static String type(String code) {
        return TYPES.get(code);
    }

    static String typeLabel(String code) {
        return TYPE_LABELS.get(code);
    }

    static String status(String code) {
        return STATUSES.get(code);
    }

    static String method(String code) {
        return code == null ? null : METHODS.get(code);
    }
}

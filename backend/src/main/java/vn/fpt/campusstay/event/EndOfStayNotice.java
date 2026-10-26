package vn.fpt.campusstay.event;

import java.time.LocalDate;

/**
 * The next-Term fees were issued (M6) and the student does not continue (spec §5.1): Notifications sends the
 * end-of-stay notice with the check-out date, the desk hours and the Utility Deposit held (in-app, push, email).
 *
 * @param deskHours {@code 07:30–21:00}, null when the Block has no settings
 * @param held      the Utility Deposit held for the student (VND)
 */
public record EndOfStayNotice(long studentId, String termName, String room, String block, LocalDate checkOutBy,
        String deskHours, long held) {
}

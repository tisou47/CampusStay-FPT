package vn.fpt.campusstay.event;

import java.util.List;

/**
 * Money or policy changed (spec §10): a published Term's fields, the default prices, the Deposit, the Utility prices,
 * refund or termination rules, deadlines, the stay rules, or a Block's settings. NTF writes the change announcement
 * (old → new values) in the same transaction.
 *
 * @param category   {@code REGISTRATION}, {@code FINANCE}, {@code RULES} or {@code OPERATIONS}
 * @param subject    English name of what changed ("Spring 2027", "Deposit and refunds", "Block A settings")
 * @param termId     the published Term that changed, else null
 * @param buildingId the Block whose settings changed (its residents are told), else null (all students)
 * @param reason     why, as typed by the Admin; null when the screen asks for none
 */
public record PolicyChanged(String category, String subject, Long termId, Long buildingId, List<ValueChange> changes,
        String reason) {
}

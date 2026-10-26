package vn.fpt.campusstay.event;

import java.util.List;

/**
 * A Room Class change of a Room for the next Term needs the consent of its other continuing residents (D-04,
 * spec §6.11): Notifications asks each of them.
 */
public record RoomClassConsentAsked(long changeId, String code, List<Long> studentIds, String requesterName,
        String room, String fromClass, String toClass, String termName) {
}

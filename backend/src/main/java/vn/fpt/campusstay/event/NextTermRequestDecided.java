package vn.fpt.campusstay.event;

import java.util.List;

/**
 * A next-Term request other than a room change or swap was decided (spec §6.10, §6.11): a Room Class change
 * (every continuing resident of the Room hears), an extension or an end of stay. Notifications tells them.
 *
 * @param kind     {@code Room Class change}, {@code Extension} or {@code End of stay}
 * @param decision {@code approved}, {@code rejected} or {@code cancelled}
 */
public record NextTermRequestDecided(List<Long> studentIds, String kind, String decision, String note) {
}

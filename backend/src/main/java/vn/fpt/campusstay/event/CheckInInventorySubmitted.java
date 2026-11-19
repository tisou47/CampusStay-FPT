package vn.fpt.campusstay.event;

import java.util.List;

/**
 * A student filed a check-in inventory that differs from the Room's record (ASG); the Block's Staff look at it.
 *
 * @param comparison Minor or Major difference
 */
public record CheckInInventorySubmitted(String name, String room, String comparison, List<Long> staffIds) {
}

package vn.fpt.campusstay.event;

import java.time.Instant;

/** Staff attributed damage to a shared item to a student, who confirms it or not (ASG). */
public record DamageToAcknowledge(long studentId, String item, String room, String condition, Instant dueAt,
        long amount) {
}

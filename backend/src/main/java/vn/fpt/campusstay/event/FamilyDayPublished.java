package vn.fpt.campusstay.event;

import java.time.Instant;
import java.util.List;

/** A Manager published a Family Day (VIS): the Block's residents are told. */
public record FamilyDayPublished(long familyDayId, String title, String block, String area, Instant startsAt,
        Instant registrationClosesAt, List<Long> studentIds) {
}

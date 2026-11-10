package vn.fpt.campusstay.event;

import java.time.Instant;
import java.util.List;

/** A Manager cancelled a Family Day (VIS): the students who had registered guests are told. */
public record FamilyDayCancelled(long familyDayId, String title, Instant startsAt, String reason,
        List<Long> studentIds) {
}

package vn.fpt.campusstay.event;

import java.util.List;

/** The Room's door code was released to these students: they are residents now (ASG; spec §6.8, never the code). */
public record DoorCodeReleased(String room, List<Long> studentIds) {
}

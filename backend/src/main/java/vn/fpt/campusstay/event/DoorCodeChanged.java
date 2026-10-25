package vn.fpt.campusstay.event;

import java.util.List;

/** A Room's new door code was confirmed (INV): its residents are told, without the code (spec §6.8). */
public record DoorCodeChanged(String room, List<Long> residentIds) {
}

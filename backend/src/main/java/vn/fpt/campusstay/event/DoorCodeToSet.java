package vn.fpt.campusstay.event;

import java.util.List;

/** A Room needs a new door code (INV): its Block's Staff are told to set it on the lock and confirm it. */
public record DoorCodeToSet(String room, List<Long> staffIds) {
}

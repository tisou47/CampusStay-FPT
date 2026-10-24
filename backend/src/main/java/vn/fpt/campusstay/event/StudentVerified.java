package vn.fpt.campusstay.event;

/** A student account became Verified, by a Manager or by an imported student list (spec §6.1, §10). */
public record StudentVerified(long userId) {
}

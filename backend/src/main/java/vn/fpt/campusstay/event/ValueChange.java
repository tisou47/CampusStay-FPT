package vn.fpt.campusstay.event;

/**
 * One value of a money or policy change, as a change announcement lists it (spec §6.4, §10: old → new).
 *
 * @param field  English label of the setting ("Deposit", "4-bed · Standard"); screens translate it
 * @param type   how to show the values: {@code TEXT}, {@code DATE} (YYYY-MM-DD), {@code DATETIME} (ISO instant),
 *               {@code MONEY} (VND), {@code PERCENT}, {@code NUMBER}, {@code BOOL}
 * @param before the old value, null when there was none
 * @param after  the new value, null when it was removed
 */
public record ValueChange(String field, String type, String before, String after) {
}

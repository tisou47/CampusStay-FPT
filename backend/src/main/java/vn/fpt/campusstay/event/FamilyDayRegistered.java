package vn.fpt.campusstay.event;

/** A student registered guests for a Family Day (VIS); {@code slot} is the time slot as shown ({@code 08/11/2026 08:00–11:00}). */
public record FamilyDayRegistered(long familyDayId, String title, long studentId, int guests, String slot) {
}

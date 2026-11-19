package vn.fpt.campusstay.event;

/**
 * A Manager sent next week's schedule to a Staff member (Notifications: "Your schedule for the week of …").
 *
 * @param week the week's days ({@code 23/11–29/11}); {@code shifts} the person's shifts in their language
 */
public record WeekScheduleSent(long userId, String week, String shifts, String by) {
}

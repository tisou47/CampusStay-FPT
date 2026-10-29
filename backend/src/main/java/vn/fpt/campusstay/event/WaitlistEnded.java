package vn.fpt.campusstay.event;

/**
 * Check-in started before a Bed was found for a waitlisted student: the Application is cancelled and {@code refund}
 * (the Deposit paid, VND) waits for a Manager (Notifications: "Your Application is cancelled").
 */
public record WaitlistEnded(long applicationId, String applicationCode, long studentId, String termName, long refund) {
}

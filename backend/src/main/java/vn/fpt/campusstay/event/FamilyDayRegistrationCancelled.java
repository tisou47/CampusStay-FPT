package vn.fpt.campusstay.event;

/** A Manager cancelled a student's Family Day registration (VIS): the student is told why. */
public record FamilyDayRegistrationCancelled(long familyDayId, String title, long studentId, String reason) {
}

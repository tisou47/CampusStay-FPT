package vn.fpt.campusstay.service.auth;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Auth public API for other modules that show people they only know by id
 * (occupants of a Bed, who set a Room out of service) or count students of the
 * directory. Results are keyed by user id; unknown ids are left out.
 */
public interface UserDirectory {

    record Student(long userId, String name, String studentCode) {
    }

    /**
     * A student of the directory (mock SIS) with the contact details they keep.
     *
     * @param gender                {@code M} or {@code F}
     * @param major                 code of the {@code MAJOR} option list, e.g. {@code SE}
     * @param region                code of the {@code REGION} option list
     * @param enrollmentStatus      {@code ENROLLED}, {@code SUSPENDED}, {@code GRADUATED} or {@code WITHDRAWN}
     * @param emergencyRelationship code of the {@code RELATIONSHIP} option list
     * @param verification          {@code VERIFIED}, {@code PENDING} or {@code REJECTED} (ADR-26); only a Verified
     *                              student may apply
     */
    record StudentProfile(long userId, String name, String email, String studentCode, String gender, String major,
            String cohort, Integer semesterNo, String hometown, String region, String enrollmentStatus,
            List<String> priorityGroups, String phone, String emergencyName, String emergencyRelationship,
            String emergencyPhone, Instant syncedAt, String verification) {

        public boolean verified() {
            return "VERIFIED".equals(verification);
        }
    }

    /**
     * A Staff member or Manager of a Block.
     *
     * @param handles codes of the {@code STAFF_HANDLE} option list, e.g. {@code MAINTENANCE}, {@code DESK}
     */
    record StaffMember(long userId, String name, String role, List<String> handles, boolean onDuty) {
    }

    Map<Long, String> displayNames(Collection<Long> userIds);

    /** The account's language for notifications, push and emails: {@code vi} or {@code en} (ADR-25); {@code vi} if unknown. */
    String locale(long userId);

    /** Active Staff assigned to any of the Blocks, by name (Managers have no Block, ADR-19). */
    List<StaffMember> staffOf(Collection<Long> buildingIds);

    Map<Long, Student> students(Collection<Long> userIds);

    /** Number of students in the directory flagged with each priority group key. */
    Map<String, Long> studentsPerPriorityGroup();

    /**
     * Students of the directory (active accounts) and how many fail each check the directory answers, for
     * Admin › Who may apply (spec §6.17).
     *
     * @param byGender {@code M} / {@code F} → students
     */
    record StudentCounts(long students, long notEnrolled, long notVerified, long contactIncomplete,
            Map<String, Long> byGender) {
    }

    StudentCounts studentCounts();

    /** Active accounts of a role ({@code ADMIN}, {@code MANAGER} …), by id: who is told about registration periods. */
    List<Long> activeUserIds(String role);

    Optional<StudentProfile> studentProfile(long userId);

    /** Profiles by user id; unknown ids are left out. */
    Map<Long, StudentProfile> studentProfiles(Collection<Long> userIds);

    /** Exact student code, case-insensitive. Callers must not reveal whether a code exists (privacy). */
    Optional<StudentProfile> studentByCode(String studentCode);

    /**
     * The given addresses (any case) that belong to fictional accounts of the base data or the demo scenarios, in
     * lower case. Only their emails go to the demo mailbox (spec O-3).
     */
    Set<String> demoEmails(Collection<String> emails);

    /** Keeps the contact details a student confirmed in an Application for next time. */
    void saveStudentContact(long userId, String phone, String emergencyName, String emergencyRelationship,
            String emergencyPhone);
}

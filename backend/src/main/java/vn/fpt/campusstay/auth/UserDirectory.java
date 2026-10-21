package vn.fpt.campusstay.auth;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * AUTH public API for other modules that show people they only know by id
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
     */
    record StudentProfile(long userId, String name, String email, String studentCode, String gender, String major,
            String cohort, Integer semesterNo, String hometown, String region, String enrollmentStatus,
            List<String> priorityGroups, String phone, String emergencyName, String emergencyRelationship,
            String emergencyPhone, Instant syncedAt) {
    }

    Map<Long, String> displayNames(Collection<Long> userIds);

    Map<Long, Student> students(Collection<Long> userIds);

    /** Number of students in the directory flagged with each priority group key. */
    Map<String, Long> studentsPerPriorityGroup();

    Optional<StudentProfile> studentProfile(long userId);

    /** Profiles by user id; unknown ids are left out. */
    Map<Long, StudentProfile> studentProfiles(Collection<Long> userIds);

    /** Exact student code, case-insensitive. Callers must not reveal whether a code exists (privacy). */
    Optional<StudentProfile> studentByCode(String studentCode);

    /** Keeps the contact details a student confirmed in an Application for next time. */
    void saveStudentContact(long userId, String phone, String emergencyName, String emergencyRelationship,
            String emergencyPhone);
}

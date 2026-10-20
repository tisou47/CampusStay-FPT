package vn.fpt.campusstay.auth;

import java.util.Collection;
import java.util.Map;

/**
 * AUTH public API for other modules that show people they only know by id
 * (occupants of a Bed, who set a Room out of service) or count students of the
 * directory. Results are keyed by user id; unknown ids are left out.
 */
public interface UserDirectory {

    record Student(long userId, String name, String studentCode) {
    }

    Map<Long, String> displayNames(Collection<Long> userIds);

    Map<Long, Student> students(Collection<Long> userIds);

    /** Number of students in the directory flagged with each priority group key. */
    Map<String, Long> studentsPerPriorityGroup();
}

package vn.fpt.campusstay.service.application;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.service.auth.GenderLocks;

/** A student with a live Application (not yet allocated or closed) keeps their gender. */
@Component
class ApplicationGenderLock implements GenderLocks {

    private final JdbcClient jdbc;

    ApplicationGenderLock(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public boolean locked(long studentId) {
        return jdbc.sql("""
                SELECT EXISTS (SELECT 1 FROM app_application WHERE student_id = :s
                               AND status IN ('DRAFT', 'AWAITING_ROOMMATE', 'AWAITING_DEPOSIT', 'SUBMITTED',
                                              'UNDER_REVIEW', 'APPROVED', 'WAITLISTED'))
                """).param("s", studentId).query(Boolean.class).single();
    }
}

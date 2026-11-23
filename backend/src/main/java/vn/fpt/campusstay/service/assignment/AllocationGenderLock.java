package vn.fpt.campusstay.service.assignment;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.service.auth.GenderLocks;

/** A student holding a Bed (an active Allocation, this Term or the next) keeps their gender. */
@Component
class AllocationGenderLock implements GenderLocks {

    private final JdbcClient jdbc;

    AllocationGenderLock(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public boolean locked(long studentId) {
        return jdbc.sql("SELECT EXISTS (SELECT 1 FROM asg_allocation WHERE student_id = :s AND status = 'ACTIVE')")
                .param("s", studentId).query(Boolean.class).single();
    }
}

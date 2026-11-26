package vn.fpt.campusstay.service.assignment;

import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.service.auth.ErasureBlockers;

/** A student with an active Allocation (this Term or the next) still lives here: their data is needed (W3-D3). */
@Component
class AllocationErasureBlocker implements ErasureBlockers {

    private final JdbcClient jdbc;

    AllocationErasureBlocker(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Optional<Blocker> blocker(long studentId) {
        boolean active = jdbc.sql("SELECT EXISTS (SELECT 1 FROM asg_allocation WHERE student_id = :s AND status = 'ACTIVE')")
                .param("s", studentId).query(Boolean.class).single();
        return active ? Optional.of(new Blocker("ERASURE_HAS_ALLOCATION",
                "The student still holds a Bed. Erase the data after the stay ends.")) : Optional.empty();
    }
}

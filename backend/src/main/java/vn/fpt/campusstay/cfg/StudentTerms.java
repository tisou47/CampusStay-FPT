package vn.fpt.campusstay.cfg;

import java.util.List;

/**
 * Port implemented by APP: the Terms in which a student has a live Application,
 * so {@code GET /terms} can mark the student's own Term as {@code current}
 * (their Allocation's Term during the stay, else the Term they applied for, else
 * the Term open for registration). CFG must not read APP tables.
 */
public interface StudentTerms {

    record LiveApplication(long termId, boolean allocated) {
    }

    List<LiveApplication> liveApplications(long studentId);
}

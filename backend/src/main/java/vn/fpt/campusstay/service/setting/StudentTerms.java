package vn.fpt.campusstay.service.setting;

import java.util.List;

/**
 * Port implemented by Applications: the Terms in which a student has a live Application,
 * so {@code GET /terms} can mark the student's own Term as {@code current}
 * (their Allocation's Term during the stay, else the Term they applied for, else
 * the Term open for registration). Settings must not read Applications tables.
 */
public interface StudentTerms {

    record LiveApplication(long termId, boolean allocated) {
    }

    List<LiveApplication> liveApplications(long studentId);
}

package vn.fpt.campusstay.service.setting;

import java.util.List;
import java.util.Map;

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

    /**
     * Live Applications of a Term per choice, keyed {@code roomTypeId:roomClassId:gender} (the demand column of the
     * registration-period wizard, spec §6.4 step 3).
     */
    Map<String, Long> liveApplicationsByChoice(long termId);
}

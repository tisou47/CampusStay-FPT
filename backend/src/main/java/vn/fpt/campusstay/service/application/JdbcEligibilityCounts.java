package vn.fpt.campusstay.service.application;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.service.auth.UserDirectory;
import vn.fpt.campusstay.service.billing.Billing;
import vn.fpt.campusstay.service.inventory.Buildings;
import vn.fpt.campusstay.service.setting.EligibilityCounts;

/**
 * Implements Settings's {@link EligibilityCounts} with the same checks {@link EligibilityService} runs for one
 * student, counted over the directory: enrollment, verification and contact details (AUTH), overdue Invoices
 * (BIL), a Block for the gender (INV) and live Applications of the Term (APP).
 */
@Component
@Transactional(readOnly = true)
class JdbcEligibilityCounts implements EligibilityCounts {

    private final JdbcClient jdbc;
    private final UserDirectory users;
    private final Billing billing;
    private final Buildings buildings;

    JdbcEligibilityCounts(JdbcClient jdbc, UserDirectory users, Billing billing, Buildings buildings) {
        this.jdbc = jdbc;
        this.users = users;
        this.billing = billing;
        this.buildings = buildings;
    }

    @Override
    public Counts now(Long termId) {
        UserDirectory.StudentCounts students = users.studentCounts();
        Map<String, Long> failing = new LinkedHashMap<>();
        failing.put(VERIFIED, students.notVerified());
        failing.put("ENROLLED", students.notEnrolled());
        failing.put("ONE_APPLICATION", termId == null ? 0 : jdbc.sql("""
                SELECT count(DISTINCT student_id) FROM app_application
                WHERE term_id = :term AND status NOT IN ('REJECTED', 'CANCELLED', 'EXPIRED')
                """).param("term", termId).query(Long.class).single());
        failing.put("NO_OVERDUE_INVOICE", billing.studentsWithOverdueInvoice());
        long noBlock = 0;
        for (Map.Entry<String, Long> e : students.byGender().entrySet()) {
            if (!buildings.anyActiveBlockFor(e.getKey())) {
                noBlock += e.getValue();
            }
        }
        failing.put("GENDER_CAPACITY", noBlock);
        failing.put(EligibilityService.CONTACT_COMPLETE, students.contactIncomplete());
        return new Counts(students.students(), failing);
    }
}

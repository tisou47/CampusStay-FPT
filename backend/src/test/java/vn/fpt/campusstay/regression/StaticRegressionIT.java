package vn.fpt.campusstay.regression;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

import vn.fpt.campusstay.service.auth.StaffActivityService;

/** Review findings checked without a Spring context (named *IT so the reproduction run picks it up). */
class StaticRegressionIT {

    /** TC-AUTH-087 (Wave 1 regression): BE-AUTH-05: the Room endpoints live under /inventory/rooms/…; the shift gate must map them to ROOMS. */
    @Test
    void beAuth05_inventoryRoomPathsMapToRoomsHandle() {
        assertThat(StaffActivityService.handleOf("/inventory/rooms/A-101/out-of-service")).isEqualTo("ROOMS");
    }

    /** TC-ASG-073 (Wave 1 regression):
     * BE-ASG-08: one failing step of the 15-minute residence job must not stop the others (terminations still become
     * overdue when the door-code release throws).
     */
    @Test
    void beAsg08_failingJobStepDoesNotStopTheOthers() throws Exception {
        String pkg = "vn.fpt.campusstay.service.assignment.";
        Class<?> jobs = Class.forName(pkg + "ResidenceJobs");
        java.lang.reflect.Constructor<?> ctor = jobs.getDeclaredConstructors()[0];
        Object[] deps = new Object[ctor.getParameterCount()];
        Object release = null;
        Object terminations = null;
        for (int i = 0; i < deps.length; i++) {
            Class<?> type = ctor.getParameterTypes()[i];
            deps[i] = org.mockito.Mockito.mock(type);
            if (type.getSimpleName().equals("DoorCodeRelease")) {
                release = deps[i];
            } else if (type.getSimpleName().equals("TerminationService")) {
                terminations = deps[i];
            }
        }
        java.lang.reflect.Method releaseDue = Class.forName(pkg + "DoorCodeRelease").getDeclaredMethod("releaseDue");
        releaseDue.setAccessible(true);
        org.mockito.Mockito.doThrow(new IllegalStateException("door code lookup failed")).when(release);
        releaseDue.invoke(release);
        ctor.setAccessible(true);
        Object job = ctor.newInstance(deps);
        java.lang.reflect.Method run = jobs.getDeclaredMethod("release");
        run.setAccessible(true);
        try {
            run.invoke(job);
        } catch (java.lang.reflect.InvocationTargetException expectedForNow) {
            // the step's exception escaping is part of what the finding describes
        }
        java.lang.reflect.Method markOverdue = Class.forName(pkg + "TerminationService").getDeclaredMethod("markOverdue");
        markOverdue.setAccessible(true);
        try {
            markOverdue.invoke(org.mockito.Mockito.verify(terminations));
        } catch (java.lang.reflect.InvocationTargetException e) {
            throw new AssertionError("terminations.markOverdue() never ran after releaseDue() threw: "
                    + e.getCause().getMessage().strip().lines().findFirst().orElse(""), e.getCause());
        }
    }

    /** TC-NTF-047 (Wave 1 regression): BE-PLT-05: JavaMail waits forever by default; the SMTP timeouts must be set. */
    @Test
    void bePlt05_smtpTimeoutsAreConfigured() throws Exception {
        String yml = new ClassPathResource("application.yml").getContentAsString(StandardCharsets.UTF_8);
        assertThat(yml).contains("connectiontimeout").contains("writetimeout");
    }
}

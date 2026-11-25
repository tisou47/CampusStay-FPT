package vn.fpt.campusstay.service.maintenance;

import vn.fpt.campusstay.common.job.ScheduledJobs;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Every day at 06:00 campus time: the inspection runs of active schedules that are due start, and Resolved
 * Maintenance Requests the students never confirmed close (BE-OPS-15).
 */
@Component
class InspectionJob {

    private static final Logger log = LoggerFactory.getLogger(InspectionJob.class);

    private final InspectionScheduleService schedules;
    private final MaintenanceService maintenance;

    private final ScheduledJobs jobs;

    InspectionJob(ScheduledJobs jobs, InspectionScheduleService schedules, MaintenanceService maintenance) {
        this.jobs = jobs;
        this.schedules = schedules;
        this.maintenance = maintenance;
    }

    @Scheduled(cron = "${campusstay.mnt.inspection-cron:0 0 6 * * *}", zone = "Asia/Ho_Chi_Minh")
    void run() {
        jobs.run("mnt.inspection", () -> {
            int started = schedules.startDue();
            if (started > 0) {
                log.info("{} inspection runs started", started);
            }
            int closed = maintenance.closeResolved();
            if (closed > 0) {
                log.info("{} resolved Maintenance Requests closed automatically", closed);
            }
        });
    }
}

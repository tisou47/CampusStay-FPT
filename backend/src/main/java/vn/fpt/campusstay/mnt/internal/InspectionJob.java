package vn.fpt.campusstay.mnt.internal;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Every day at 06:00 campus time: the inspection runs of active schedules that are due start. */
@Component
class InspectionJob {

    private static final Logger log = LoggerFactory.getLogger(InspectionJob.class);

    private final InspectionScheduleService schedules;

    InspectionJob(InspectionScheduleService schedules) {
        this.schedules = schedules;
    }

    @Scheduled(cron = "${campusstay.mnt.inspection-cron:0 0 6 * * *}", zone = "Asia/Ho_Chi_Minh")
    void run() {
        int started = schedules.startDue();
        if (started > 0) {
            log.info("{} inspection runs started", started);
        }
    }
}

package vn.fpt.campusstay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.MANAGER_A;
import static vn.fpt.campusstay.TestAuth.STAFF_A;
import static vn.fpt.campusstay.TestAuth.bearer;

import java.time.LocalDateTime;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.service.auth.StaffActivityService;
import vn.fpt.campusstay.service.auth.WeekScheduleService;

/**
 * The weekly schedule handover (a Manager sends next week's schedule, Managers are reminded on Sunday) and the Staff
 * handle list that follows the Staff portal, and the reminder day Admin chooses (TC-AUTH-076…079).
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class WeekScheduleIT {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    WeekScheduleService schedule;

    private long notices(String email, String key) {
        return jdbc.sql("""
                SELECT count(*) FROM ntf_notification n JOIN auth_user u ON u.id = n.user_id
                WHERE u.email = :e AND n.event_key = :k
                """).param("e", email).param("k", key).query(Long.class).single();
    }

    /** TC-AUTH-076: a Manager sends next week's schedule: every Staff member of the Block is told; the week shows sent. */
    @Test
    void managerSendsNextWeeksSchedule() throws Exception {
        String manager = bearer(mvc, MANAGER_A);
        mvc.perform(get("/week-schedule").param("block", "A").header(HttpHeaders.AUTHORIZATION, manager))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pendingBlocks", hasItem("A")))
                .andExpect(jsonPath("$.start").isString());
        long before = notices(STAFF_A, "WEEK_SCHEDULE_SENT");
        mvc.perform(post("/week-schedule/send").header(HttpHeaders.AUTHORIZATION, manager)
                .contentType(MediaType.APPLICATION_JSON).content("{\"block\":\"A\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.notified").value(3))
                .andExpect(jsonPath("$.blocks", hasItem("A")));
        assertThat(notices(STAFF_A, "WEEK_SCHEDULE_SENT")).isEqualTo(before + 1);
        assertThat(notices("staff.b2@campusstay.test", "WEEK_SCHEDULE_SENT")).isZero();
        mvc.perform(get("/week-schedule").param("block", "A").header(HttpHeaders.AUTHORIZATION, manager))
                .andExpect(jsonPath("$.sentBlocks", hasItem("A")))
                .andExpect(jsonPath("$.pendingBlocks", not(hasItem("A"))))
                .andExpect(jsonPath("$.sentBy").isString());
        mvc.perform(post("/week-schedule/send").header(HttpHeaders.AUTHORIZATION, bearer(mvc, STAFF_A))
                .contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isForbidden());
    }

    /** TC-AUTH-077: on Sunday from the reminder hour the Managers are reminded once; never on other days or earlier. */
    @Test
    void managersAreRemindedOnSunday() {
        var sunday = LocalDateTime.of(2030, 1, 6, 10, 0).atZone(TimeConfig.CAMPUS_ZONE); // a Sunday
        long before = notices(MANAGER_A, "WEEK_SCHEDULE_REMINDER");
        assertThat(schedule.remind(sunday.minusDays(1))).isFalse();
        assertThat(schedule.remind(sunday.withHour(8))).isFalse();
        assertThat(schedule.remind(sunday)).isTrue();
        assertThat(schedule.remind(sunday.plusHours(1))).isFalse();
        assertThat(notices(MANAGER_A, "WEEK_SCHEDULE_REMINDER")).isEqualTo(before + 1);
    }

    /**
     * TC-AUTH-079: Admin chooses the reminder's day and hour in System parameters (or turns it off); the reminder
     * follows them, and a day outside the list is refused.
     */
    @Test
    void adminChoosesTheReminderDay() throws Exception {
        String admin = bearer(mvc, TestAuth.ADMIN);
        String body = "{\"sections\":[{\"title\":\"Staff\",\"fields\":[{\"key\":\"workload.schedule_reminder_day\",\"value\":\"%s\"},"
                + "{\"key\":\"workload.schedule_reminder_hour\",\"value\":\"%s\"}]}]}";
        var wednesday = LocalDateTime.of(2030, 2, 6, 7, 30).atZone(TimeConfig.CAMPUS_ZONE); // a Wednesday
        try {
            mvc.perform(put("/admin/system-parameters").header(HttpHeaders.AUTHORIZATION, admin)
                    .contentType(MediaType.APPLICATION_JSON).content(body.formatted("8", "7")))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.details.fields['workload.schedule_reminder_day']").exists());
            mvc.perform(put("/admin/system-parameters").header(HttpHeaders.AUTHORIZATION, admin)
                    .contentType(MediaType.APPLICATION_JSON).content(body.formatted("3", "7")))
                    .andExpect(status().isOk());
            mvc.perform(get("/week-schedule").header(HttpHeaders.AUTHORIZATION, bearer(mvc, MANAGER_A)))
                    .andExpect(jsonPath("$.reminderDay").value(3)).andExpect(jsonPath("$.reminderHour").value(7));
            assertThat(schedule.remind(wednesday.plusDays(4))).isFalse(); // the Sunday after: no longer the day
            assertThat(schedule.remind(wednesday.withHour(6))).isFalse();
            assertThat(schedule.remind(wednesday)).isTrue();
            mvc.perform(put("/admin/system-parameters").header(HttpHeaders.AUTHORIZATION, admin)
                    .contentType(MediaType.APPLICATION_JSON).content(body.formatted("0", "7")))
                    .andExpect(status().isOk());
            assertThat(schedule.remind(wednesday.plusWeeks(1))).isFalse(); // turned off
        } finally {
            jdbc.sql("UPDATE cfg_parameter SET value = '7' WHERE key = 'workload.schedule_reminder_day'").update();
            jdbc.sql("UPDATE cfg_parameter SET value = '9' WHERE key = 'workload.schedule_reminder_hour'").update();
        }
    }

    /** TC-AUTH-078: what Staff handle follows the Staff portal; each Staff screen's changes belong to one kind. */
    @Test
    void handlesFollowTheStaffPortal() throws Exception {
        mvc.perform(get("/block-staff").header(HttpHeaders.AUTHORIZATION, bearer(mvc, MANAGER_A)))
                .andExpect(jsonPath("$.handleOptions", hasItem("Family Day guests")))
                .andExpect(jsonPath("$.handleOptions", hasItem("Rooms, door codes and furniture")))
                .andExpect(jsonPath("$.handleOptions", not(hasItem("Payments"))))
                .andExpect(jsonPath("$.handleOptions", not(hasItem("Applications"))));
        assertThat(StaffActivityService.handleOf("/check-in")).isEqualTo("DESK");
        assertThat(StaffActivityService.handleOf("/family-day-visitors/7/check-in")).isEqualTo("FAMILY_DAY");
        assertThat(StaffActivityService.handleOf("/door-codes/A-201/confirm")).isEqualTo("ROOMS");
        assertThat(StaffActivityService.handleOf("/operational-moves")).isEqualTo("ROOM_CHANGES");
        assertThat(StaffActivityService.handleOf("/next-term-requests/decision")).isEqualTo("NEXT_TERM");
        assertThat(StaffActivityService.handleOf("/meter-periods/3/close")).isEqualTo("METER_READINGS");
        assertThat(StaffActivityService.handleOf("/announcements")).isNull();
    }
}

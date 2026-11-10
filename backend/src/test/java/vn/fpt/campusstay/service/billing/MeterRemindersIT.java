package vn.fpt.campusstay.service.billing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import vn.fpt.campusstay.PostgresTestcontainer;
import vn.fpt.campusstay.TestAuth;
import vn.fpt.campusstay.config.TimeConfig;

/** Months whose meter period is not closed: Overviews and reminders to Staff (TC-BIL-040). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class MeterRemindersIT {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    MeterReminders reminders;

    /**
     * TC-BIL-040: every Block gets this month's period; a month ended more than {@code utility.close_days} ago and
     * still open is shown on the Staff and Manager Overviews, and its Block's Staff are reminded once a day.
     */
    @Test
    void lateMonthIsFlaggedAndRemindedOnce() throws Exception {
        LocalDate today = LocalDate.now(TimeConfig.CAMPUS_ZONE);
        LocalDate start = today.withDayOfMonth(1).minusMonths(2);
        String label = "%02d/%d".formatted(start.getMonthValue(), start.getYear());
        jdbc.sql("""
                INSERT INTO bil_meter_period (building_id, label, period_start, period_end, due_at)
                SELECT id, :label, :start, :end, now() FROM inv_building WHERE code = 'B'
                """).param("label", label).param("start", start).param("end", start.withDayOfMonth(start.lengthOfMonth()))
                .update();

        assertThat(reminders.run()).isEqualTo(1);
        assertThat(jdbc.sql("""
                SELECT count(*) FROM bil_meter_period p JOIN inv_building b ON b.id = p.building_id
                WHERE b.code IN ('A', 'B') AND p.period_start = :start
                """).param("start", today.withDayOfMonth(1)).query(Long.class).single()).isEqualTo(2);
        assertThat(jdbc.sql("""
                SELECT count(*) FROM ntf_notification n JOIN auth_user u ON u.id = n.user_id
                WHERE n.event_key = 'METER_PERIOD_LATE' AND u.email = :email AND n.title LIKE :title
                """).param("email", TestAuth.STAFF_B2).param("title", "%" + label + " · Block B")
                .query(Long.class).single()).isEqualTo(1);
        // Once a day: running again the same day sends nothing.
        assertThat(reminders.run()).isZero();

        mvc.perform(get("/dashboards/staff").header(HttpHeaders.AUTHORIZATION, TestAuth.bearer(mvc, TestAuth.STAFF_B2)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.attention[?(@.kind == 'meter-period')].values.period").value(hasItem(label)))
                .andExpect(jsonPath("$.attention[?(@.kind == 'meter-period')].link").value(hasItem("/staff/meter-readings")));
        mvc.perform(get("/dashboards/manager").header(HttpHeaders.AUTHORIZATION, TestAuth.bearer(mvc, TestAuth.MANAGER_B)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.waiting[?(@.kind == 'meter-period')].values.block").value(hasItem("B")));
        // Block A's Staff do not see Block B's month.
        mvc.perform(get("/dashboards/staff").header(HttpHeaders.AUTHORIZATION, TestAuth.bearer(mvc, "staff.a2@campusstay.test")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.attention[?(@.kind == 'meter-period')]").isEmpty());
    }
}

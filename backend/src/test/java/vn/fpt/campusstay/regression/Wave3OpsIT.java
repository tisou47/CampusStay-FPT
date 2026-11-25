package vn.fpt.campusstay.regression;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Clock;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.BeforeEach;
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
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import vn.fpt.campusstay.PostgresTestcontainer;
import vn.fpt.campusstay.TestAuth;
import vn.fpt.campusstay.common.job.ScheduledJobs;
import vn.fpt.campusstay.service.assistant.AssistantModel;
import vn.fpt.campusstay.service.auth.AuthRateLimiter;

/** Wave 4 D1 and D2 on the security branch: jobs on one server at a time, limits in the database, system health. */
@SpringBootTest(properties = "campusstay.assistant.base-url=http://model.test")
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class Wave3OpsIT {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    ScheduledJobs jobs;

    @Autowired
    org.springframework.transaction.PlatformTransactionManager tm;

    @MockitoBean
    AssistantModel model;

    RegressionSupport r;

    @BeforeEach
    void setUp() {
        r = new RegressionSupport(mvc, jdbc);
    }

    /** TC-CFG-300: D1: two concurrent runs of one job: only one acts, the other skips; the run is recorded. */
    @Test
    void concurrentRunsOfOneJobActOnce() throws Exception {
        CountDownLatch inside = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        AtomicInteger acted = new AtomicInteger();
        CompletableFuture<Boolean> first = CompletableFuture.supplyAsync(() -> jobs.run("test.job", () -> {
            acted.incrementAndGet();
            inside.countDown();
            try {
                release.await(10, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }));
        assertThat(inside.await(10, TimeUnit.SECONDS)).isTrue();
        boolean second = jobs.run("test.job", acted::incrementAndGet);
        release.countDown();
        assertThat(first.get(10, TimeUnit.SECONDS)).isTrue();
        assertThat(second).isFalse();
        assertThat(acted).hasValue(1);
        assertThat(jobs.run("test.job", acted::incrementAndGet)).isTrue(); // the lock was released
        assertThat(r.count("SELECT count(*) FROM sys_job_run WHERE job = 'test.job' AND ok")).isEqualTo(2);
    }

    /** TC-CFG-301: D2: a failing run is recorded with its error class only, and shown on the health page. */
    @Test
    void failedRunIsRecordedWithoutMessage() throws Exception {
        try {
            jobs.run("test.failing", () -> {
                throw new IllegalStateException("se190001 Nguyen Van A");
            });
        } catch (IllegalStateException expected) {
            // thrown again for the scheduler's log
        }
        assertThat(r.count("SELECT count(*) FROM sys_job_run WHERE job = 'test.failing' AND NOT ok "
                + "AND error_class = 'java.lang.IllegalStateException' AND error_code IS NULL")).isEqualTo(1);
        r.getAs("/admin/system/health", r.bearer(TestAuth.ADMIN)).andExpect(status().isOk())
                .andExpect(jsonPath("$.jobs[?(@.job == 'test.failing')].ok").value(false))
                .andExpect(jsonPath("$.uploads.bytes").isNumber())
                .andExpect(jsonPath("$.emailOutbox.pending").isNumber())
                .andExpect(jsonPath("$.serverErrorsLastHour").isNumber());
    }

    /** TC-CFG-302: D2: system health and metrics are for the Admin only. */
    @Test
    void healthIsAdminOnly() throws Exception {
        for (String who : new String[] { TestAuth.STAFF_A, TestAuth.MANAGER_A, RegressionSupport.student(20) }) {
            String auth = r.bearer(who);
            r.getAs("/admin/system/health", auth).andExpect(status().isForbidden());
            r.getAs("/actuator/metrics", auth).andExpect(status().isForbidden());
        }
        r.getAs("/actuator/metrics", r.bearer(TestAuth.ADMIN)).andExpect(status().isOk());
    }

    /** TC-AUTH-303: D1: failed attempts are kept in the database, so a restarted server still counts them. */
    @Test
    void rateLimitSurvivesRestart() {
        AuthRateLimiter before = new AuthRateLimiter(jdbc, Clock.systemUTC());
        for (int i = 0; i < 3; i++) {
            before.record(AuthRateLimiter.Bucket.PASSWORD_FORGOT, "10.9.9.9");
        }
        AuthRateLimiter restarted = new AuthRateLimiter(jdbc, Clock.systemUTC());
        assertThat(restarted.count(AuthRateLimiter.Bucket.PASSWORD_FORGOT, "10.9.9.9")).isEqualTo(3);
        restarted.clear(AuthRateLimiter.Bucket.PASSWORD_FORGOT, "10.9.9.9");
        assertThat(before.count(AuthRateLimiter.Bucket.PASSWORD_FORGOT, "10.9.9.9")).isZero();
    }

    /** TC-AST-300: D1: the assistant's hourly limit is counted in the database (a restart keeps it). */
    @Test
    void assistantLimitIsKeptInDatabase() throws Exception {
        when(model.chat(any())).thenReturn("OK");
        String email = RegressionSupport.student(21);
        String auth = r.bearer(email);
        String ask = "{\"messages\":[{\"role\":\"user\",\"content\":\"When is my Balance due?\"}]}";
        mvc.perform(post("/students/me/assistant/chat").header(HttpHeaders.AUTHORIZATION, auth)
                .contentType(MediaType.APPLICATION_JSON).content(ask)).andExpect(status().isOk());
        assertThat(r.count("SELECT count(*) FROM ast_question WHERE user_id = ?", r.userId(email))).isEqualTo(1);
        jdbc.sql("INSERT INTO ast_question (user_id, asked_at) SELECT :u, now() FROM generate_series(1, 29)")
                .param("u", r.userId(email)).update();
        mvc.perform(post("/students/me/assistant/chat").header(HttpHeaders.AUTHORIZATION, auth)
                .contentType(MediaType.APPLICATION_JSON).content(ask)).andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("ASSISTANT_LIMIT"));
    }
}

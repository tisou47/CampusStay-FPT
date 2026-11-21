package vn.fpt.campusstay.regression;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.List;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionTemplate;

import vn.fpt.campusstay.PostgresTestcontainer;
import vn.fpt.campusstay.TestAuth;
import vn.fpt.campusstay.event.RenewalWorkUndecided;

/** Review findings WEB-ADM-01/02 (backend half), BE-PLT-01, BE-PLT-11: regression tests (each reproduced the finding before Wave 1 fixed it). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class DashboardRegressionIT {

    /** Links the web router does not have (web/src/app/router.jsx: these exist only under /manager or not at all). */
    private static final List<String> MISSING_ROUTES = List.of("/staff/applications", "/staff/assignment/",
            "/manager/renewals");

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    ApplicationEventPublisher events;

    @Autowired
    TransactionTemplate tx;

    RegressionSupport r;

    @BeforeEach
    void setUp() {
        r = new RegressionSupport(mvc, jdbc);
    }

    /** TC-NTF-044 (Wave 1 regression): WEB-ADM-02: the RENEWAL_UNDECIDED notification links to an existing Manager route. */
    @Test
    void webAdm02_renewalUndecidedLinksToExistingRoute() {
        tx.executeWithoutResult(s -> events.publishEvent(
                new RenewalWorkUndecided(r.termId, "Test Term 2031", 3, 1, Instant.now().plusSeconds(86400))));
        List<String> links = jdbc.sql("""
                SELECT DISTINCT n.link FROM ntf_notification n JOIN auth_user u ON u.id = n.user_id
                WHERE u.role = 'MANAGER' AND n.link IS NOT NULL
                """).query(String.class).list();
        assertThat(links).isNotEmpty();
        assertThat(links).as("Manager notification links").noneMatch(l -> MISSING_ROUTES.stream().anyMatch(l::startsWith));
    }

    /** TC-RPT-016 (Wave 1 regression):
     * BE-PLT-01: a request whose stored deadline (sla_due_at, e.g. the urgent 4-hour timer) passed before it was
     * resolved is late, even if it was resolved within the Block's normal 48-hour timer.
     */
    @Test
    void bePlt01_slaRateUsesStoredDeadline() throws Exception {
        r.livesIn(12, "A-202", "A", true);
        String code = r.report(12, "Normal");
        jdbc.sql("""
                UPDATE mnt_request SET status = 'RESOLVED', assignee_id = (SELECT id FROM auth_user WHERE email = :a),
                       reported_at = now() - interval '10 hours', sla_due_at = now() - interval '6 hours',
                       resolved_at = now()
                WHERE code = :c
                """).param("a", TestAuth.STAFF_A).param("c", code).update();
        String json = RegressionSupport.body(r.getAs("/dashboards/manager?block=A&termId=" + r.termId, r.manager())
                .andExpect(status().isOk()));
        Number rate = JsonPath.read(json, "$.kpis.slaRate");
        assertThat(rate.doubleValue()).as("on-time rate of 1 request resolved 4 h after its deadline").isEqualTo(0.0);
    }

    /** TC-RPT-017 (Wave 1 regression): BE-PLT-11: with no Block chosen the floor chart must not sum floor N of every Block into one bar. */
    @Test
    void bePlt11_floorChartDoesNotMixBlocks() throws Exception {
        String json = RegressionSupport.body(r.getAs("/dashboards/manager?termId=" + r.termId, r.manager()).andExpect(status().isOk()));
        List<Integer> floors = JsonPath.read(json, "$.floors[*].floor");
        long distinct = floors.stream().distinct().count();
        assertThat(floors.isEmpty() || distinct < floors.size())
                .as("floors for all Blocks (A and B both have floors 1-5): %s", floors).isTrue();
    }
}

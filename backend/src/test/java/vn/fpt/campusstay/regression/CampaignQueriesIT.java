package vn.fpt.campusstay.regression;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.mockingDetails;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;

import vn.fpt.campusstay.PostgresTestcontainer;
import vn.fpt.campusstay.TestAuth;

/** BE-PLT-06: an Admin campaign reads its data once, not once per recipient. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class CampaignQueriesIT {

    @Autowired
    MockMvc mvc;

    @MockitoSpyBean
    JdbcClient jdbc;

    RegressionSupport r;

    @BeforeEach
    void setUp() {
        r = new RegressionSupport(mvc, jdbc);
    }

    /** SQL statements one campaign to Block B's residents runs. */
    private long campaign(String admin) throws Exception {
        clearInvocations(jdbc);
        var res = r.postJson("/admin/emails", admin, """
                {"mode":"bulk","termId":"%d","templateKey":"ANNOUNCEMENT","subject":"Water off on Saturday",
                 "group":"residents","block":"B","channel":"email-push","sendAt":"now"}""".formatted(r.termId))
                .andReturn().getResponse();
        assertThat(res.getStatus()).as(res.getContentAsString()).isEqualTo(200);
        return mockingDetails(jdbc).getInvocations().stream().filter(i -> i.getMethod().getName().equals("sql"))
                .count();
    }

    /**
     * TC-NTF-049 (BE-PLT-06): six more recipients add only their own writes (the email and the notification), not a
     * read of the Block, the Invoices, the template, the language and the demo flag each.
     */
    @Test
    void aCampaignReadsItsDataOnce() throws Exception {
        String admin = r.bearer(TestAuth.ADMIN);
        r.livesIn(33, "B-101", "A", true);
        r.livesIn(34, "B-101", "B", true);
        long two = campaign(admin);
        String[] beds = { "A", "B", "C", "D" };
        for (int i = 0; i < 6; i++) {
            r.livesIn(35 + i, i < 4 ? "B-105" : "B-106", beds[i % 4], true);
        }
        long eight = campaign(admin);
        assertThat(eight - two).as("statements for 6 more recipients (2 = %d, 8 = %d)", two, eight)
                .isLessThanOrEqualTo(3 * 6);
    }
}

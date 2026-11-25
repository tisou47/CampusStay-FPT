package vn.fpt.campusstay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.MANAGER_A;
import static vn.fpt.campusstay.TestAuth.MANAGER_B;
import static vn.fpt.campusstay.TestAuth.bearer;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

import javax.sql.DataSource;

import com.jayway.jsonpath.JsonPath;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Wave 3 QA load tests (plan §8 Q6), on Testcontainers with fictional generated data only: the assignment engine over
 * a campus-sized intake (~6,200 Applications, the expected number of students) and 37 payment confirmations at once.
 * Durations and statement counts are printed ({@code [LOAD]} lines) and held under generous ceilings, so CI notices a
 * slowdown of an order of magnitude without failing on a slow runner.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import({ PostgresTestcontainer.class, Wave3QaLoadIT.CountingDataSource.class })
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class Wave3QaLoadIT {

    static final int APPLICANTS = 6_200;
    static final String LOAD_TERM = "TLD1";
    /** The seed's password hash (CampusStay@2026), so generated students can sign in. */
    static final String HASH = "$2a$10$zoI/Bzs2QVn2P5.PI7WCr.Pjmvj33otA/k4qD9T5jCyU9EhR2ox/S";

    /** Counts JDBC statements prepared through the application's DataSource (one per SQL statement run). */
    @TestConfiguration(proxyBeanMethods = false)
    static class CountingDataSource {

        static final AtomicLong STATEMENTS = new AtomicLong();

        @Bean
        static BeanPostProcessor countStatements() {
            return new BeanPostProcessor() {
                @Override
                public Object postProcessAfterInitialization(Object bean, String name) {
                    if (!(bean instanceof DataSource target) || bean instanceof Proxy) {
                        return bean;
                    }
                    return Proxy.newProxyInstance(DataSource.class.getClassLoader(), new Class<?>[] { DataSource.class },
                            (p, m, args) -> {
                                Object out = invoke(target, m, args);
                                return out instanceof Connection c ? connection(c) : out;
                            });
                }
            };
        }

        private static Connection connection(Connection target) {
            return (Connection) Proxy.newProxyInstance(Connection.class.getClassLoader(),
                    new Class<?>[] { Connection.class }, (p, m, args) -> {
                        if (m.getName().equals("prepareStatement") || m.getName().equals("createStatement")
                                || m.getName().equals("prepareCall")) {
                            STATEMENTS.incrementAndGet();
                        }
                        return invoke(target, m, args);
                    });
        }

        private static Object invoke(Object target, java.lang.reflect.Method m, Object[] args) throws Throwable {
            try {
                return m.invoke(target, args);
            } catch (InvocationTargetException e) {
                throw e.getCause();
            }
        }
    }

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    private static String email(int n) {
        return "load%05d@student.campusstay.test".formatted(n);
    }

    /** 6,200 fictional students (odd numbers male), once per context. */
    private void students() {
        jdbc.sql("""
                INSERT INTO auth_user (email, display_name, password_hash, role, demo, locale)
                SELECT 'load' || lpad(n::text, 5, '0') || '@student.campusstay.test', 'Load Student ' || n, :hash,
                       'STUDENT', TRUE, 'en'
                FROM generate_series(1, :count) AS g(n)
                ON CONFLICT DO NOTHING
                """).param("hash", HASH).param("count", APPLICANTS).update();
        jdbc.sql("""
                INSERT INTO auth_student (user_id, student_code, gender, date_of_birth, major, cohort, semester_no,
                                          hometown, region, priority_groups, phone, emergency_name,
                                          emergency_relationship, emergency_phone)
                SELECT u.id, 'LD' || lpad(g.n::text, 5, '0'), CASE WHEN g.n % 2 = 1 THEN 'M' ELSE 'F' END,
                       DATE '2005-01-15' + g.n % 700, (ARRAY['SE','AI','IA','GD','BA','MC'])[1 + g.n % 6],
                       (ARRAY['K19','K20','K21'])[1 + g.n % 3], (ARRAY[1,3,5])[1 + g.n % 3], 'Binh Duong',
                       (ARRAY['NORTH','CENTRAL','HIGHLANDS','SOUTHEAST','MEKONG'])[1 + g.n % 5],
                       CASE WHEN g.n % 3 = 0 THEN '{FIRST_YEAR}'::text[] ELSE '{}'::text[] END,
                       '07' || lpad(g.n::text, 8, '0'), 'Parent of LD' || g.n, 'MOTHER', '06' || lpad(g.n::text, 8, '0')
                FROM generate_series(1, :count) AS g(n)
                JOIN auth_user u ON u.email = 'load' || lpad(g.n::text, 5, '0') || '@student.campusstay.test'
                ON CONFLICT (user_id) DO NOTHING
                """).param("count", APPLICANTS).update();
    }

    /**
     * TC-ASG-606: one assignment run over 6,200 approved Applications (half male, half female) and 6,400 free Beds of
     * 4-bed Basic Rooms in 8 Blocks (4 per gender): everyone is proposed a Bed of a Block of their gender, in less than
     * the ceiling time and statement count.
     */
    @Test
    void assignmentRunOverACampusSizedIntake() throws Exception {
        students();
        // 8 Blocks × 10 Floors × 20 Rooms × 4 Beds = 6,400 Beds; L1-L4 male, L5-L8 female.
        jdbc.sql("""
                INSERT INTO inv_building (code, name, gender)
                SELECT 'L' || g, 'Load Block ' || g, CASE WHEN g <= 4 THEN 'M' ELSE 'F' END FROM generate_series(1, 8) g
                ON CONFLICT (code) DO NOTHING
                """).update();
        jdbc.sql("""
                INSERT INTO inv_floor (building_id, floor_no, room_class_id)
                SELECT b.id, f, (SELECT id FROM cfg_room_class WHERE name = 'Basic')
                FROM inv_building b CROSS JOIN generate_series(1, 10) f WHERE b.code LIKE 'L%'
                ON CONFLICT (building_id, floor_no) DO NOTHING
                """).update();
        jdbc.sql("""
                INSERT INTO inv_room (code, building_id, floor_id, room_type_id, room_class_id)
                SELECT b.code || '-' || fl.floor_no || lpad(r::text, 2, '0'), b.id, fl.id,
                       (SELECT id FROM cfg_room_type WHERE name = '4-bed'), fl.room_class_id
                FROM inv_floor fl JOIN inv_building b ON b.id = fl.building_id CROSS JOIN generate_series(1, 20) r
                WHERE b.code LIKE 'L%'
                ON CONFLICT (code) DO NOTHING
                """).update();
        jdbc.sql("""
                INSERT INTO inv_bed (room_id, label)
                SELECT ro.id, chr(64 + s) FROM inv_room ro JOIN inv_building b ON b.id = ro.building_id
                CROSS JOIN generate_series(1, 4) s WHERE b.code LIKE 'L%'
                ON CONFLICT (room_id, label) DO NOTHING
                """).update();
        // Registration closed yesterday: the run comes after it.
        jdbc.sql("""
                INSERT INTO cfg_term (code, name, status, stay_start, stay_end, registration_opens_at,
                                      registration_closes_at, results_published_at, roommate_hours, deposit_hours,
                                      balance_due_at, check_in_start, check_in_end, check_out_by, published_at)
                VALUES (:code, 'Load Test Term 2032', 'PUBLISHED', DATE '2032-01-05', DATE '2032-04-25',
                        now() - interval '30 days', now() - interval '1 day', now() + interval '5 days', 48, 48,
                        now() + interval '20 days', DATE '2032-01-01', DATE '2032-01-04', DATE '2032-04-26', now())
                ON CONFLICT (code) DO NOTHING
                """).param("code", LOAD_TERM).update();
        long term = jdbc.sql("SELECT id FROM cfg_term WHERE code = :c").param("c", LOAD_TERM).query(Long.class).single();
        jdbc.sql("""
                INSERT INTO cfg_term_price (term_id, room_type_id, room_class_id, price)
                SELECT :t, rt.id, rc.id, round(rt.base_price * (1 + rc.surcharge_rate) / 1000) * 1000
                FROM cfg_room_type rt CROSS JOIN cfg_room_class rc
                ON CONFLICT DO NOTHING
                """).param("t", term).update();
        jdbc.sql("""
                INSERT INTO app_application (code, term_id, student_id, room_type_id, room_class_id, term_price,
                                             surcharge_rate, deposit_amount, status, roommate_mode, contact,
                                             consent_matching, consent_rules, consented_at, deposit_due_at, submitted_at,
                                             reviewed_at, student_name, student_code, gender, stay_terms)
                SELECT 'APP-LD-' || lpad(g.n::text, 6, '0'), :t, u.id, p.room_type_id, p.room_class_id, p.price,
                       0, 1200000, 'APPROVED', 'NONE',
                       jsonb_build_object('phone', s.phone, 'email', NULL, 'emergencyName', s.emergency_name,
                                          'relationship', s.emergency_relationship, 'emergencyPhone', s.emergency_phone),
                       TRUE, TRUE, now() - interval '20 days', now() - interval '18 days',
                       now() - interval '20 days' + g.n * interval '1 minute', now() - interval '2 days',
                       u.display_name, s.student_code, s.gender, 1
                FROM generate_series(1, :count) AS g(n)
                JOIN auth_user u ON u.email = 'load' || lpad(g.n::text, 5, '0') || '@student.campusstay.test'
                JOIN auth_student s ON s.user_id = u.id
                JOIN cfg_term_price p ON p.term_id = :t
                     AND p.room_type_id = (SELECT id FROM cfg_room_type WHERE name = '4-bed')
                     AND p.room_class_id = (SELECT id FROM cfg_room_class WHERE name = 'Basic')
                ON CONFLICT DO NOTHING
                """).param("t", term).param("count", APPLICANTS).update();
        assertThat(jdbc.sql("SELECT count(*) FROM app_application WHERE term_id = :t AND status = 'APPROVED'")
                .param("t", term).query(Long.class).single()).isEqualTo(APPLICANTS);

        String manager = bearer(mvc, MANAGER_A);
        long statements = CountingDataSource.STATEMENTS.get();
        long started = System.nanoTime();
        MvcResult res = mvc.perform(post("/assignment-runs").header(HttpHeaders.AUTHORIZATION, manager)
                .contentType(MediaType.APPLICATION_JSON).content("{\"termId\":\"%d\"}".formatted(term)))
                .andExpect(status().isOk()).andReturn();
        long millis = (System.nanoTime() - started) / 1_000_000;
        long used = CountingDataSource.STATEMENTS.get() - statements;
        long run = Long.parseLong(JsonPath.<String>read(res.getResponse().getContentAsString(), "$.id").substring(4));
        System.out.printf("[LOAD] assignment run: %d applications, %d ms, %d SQL statements%n", APPLICANTS, millis, used);

        assertThat(jdbc.sql("SELECT proposed_count FROM asg_run WHERE id = :r").param("r", run).query(Integer.class)
                .single()).isEqualTo(APPLICANTS);
        assertThat(jdbc.sql("""
                SELECT count(*) FROM asg_proposal_item p JOIN app_application a ON a.id = p.application_id
                JOIN inv_bed b ON b.id = p.bed_id JOIN inv_room r ON r.id = b.room_id
                JOIN inv_building bl ON bl.id = r.building_id
                WHERE p.run_id = :r AND bl.gender <> a.gender
                """).param("r", run).query(Long.class).single()).as("Beds proposed in a Block of the other gender")
                .isZero();
        assertThat(jdbc.sql("SELECT count(DISTINCT bed_id) FROM asg_proposal_item WHERE run_id = :r").param("r", run)
                .query(Long.class).single()).as("distinct Beds").isEqualTo(APPLICANTS);
        // Ceilings: measured locally on 25/11/2026 at 10.5-20 s and 18,638 statements (about 3 per Application: the
        // engine input is read one Application at a time); the limits leave ~10x room for a slow CI runner.
        assertThat(millis).as("run duration (ms)").isLessThan(120_000);
        assertThat(used).as("SQL statements of one run").isLessThan(150_000);
    }

    /**
     * TC-BIL-605: 37 claims (a typical morning of Deposits) confirmed in one bulk request: every Invoice is paid
     * exactly once and the confirmed count and amount add up to the Invoices' total.
     */
    @Test
    void thirtySevenPaymentConfirmationsAtOnce() throws Exception {
        students();
        ApplyFlow flow = new ApplyFlow(mvc, jdbc);
        flow.openTerm();
        List<String> first = claimed(flow, 1);

        long total = total(first);
        long t0 = System.nanoTime();
        String one = mvc.perform(post("/payment-claims/confirm").header(HttpHeaders.AUTHORIZATION, flow.manager())
                .contentType(MediaType.APPLICATION_JSON).content(ids(first))).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        long millis = (System.nanoTime() - t0) / 1_000_000;
        System.out.printf("[LOAD] bulk confirm: 37 claims, %d ms%n", millis);
        assertThat((Integer) JsonPath.read(one, "$.confirmed")).isEqualTo(37);
        assertThat(((Number) JsonPath.read(one, "$.amount")).longValue()).isEqualTo(total);
        assertPaidOnce(first);
        assertThat(millis).as("bulk confirm of 37 (ms)").isLessThan(30_000);
    }

    /**
     * TC-BIL-606: the same 37 claims confirmed by two Managers at the same moment in opposite orders: no deadlock, both
     * answers are 200, every Invoice is paid exactly once and the two answers add up to the total.
     */
    @Test
    void twoManagersConfirmTheSameClaimsAtOnce() throws Exception {
        students();
        ApplyFlow flow = new ApplyFlow(mvc, jdbc);
        flow.openTerm();
        List<String> second = claimed(flow, 101);
        // Two Managers, the same 37 claims, opposite orders, released together.
        List<String> reversed = new ArrayList<>(second);
        Collections.reverse(reversed);
        String a = bearer(mvc, MANAGER_A);
        String b = bearer(mvc, MANAGER_B);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        java.util.concurrent.CountDownLatch go = new java.util.concurrent.CountDownLatch(1);
        try {
            List<Future<MvcResult>> calls = List.of(
                    pool.submit(() -> {
                        go.await();
                        return mvc.perform(post("/payment-claims/confirm").header(HttpHeaders.AUTHORIZATION, a)
                                .contentType(MediaType.APPLICATION_JSON).content(ids(second))).andReturn();
                    }),
                    pool.submit(() -> {
                        go.await();
                        return mvc.perform(post("/payment-claims/confirm").header(HttpHeaders.AUTHORIZATION, b)
                                .contentType(MediaType.APPLICATION_JSON).content(ids(reversed))).andReturn();
                    }));
            go.countDown();
            int confirmed = 0;
            long amount = 0;
            List<String> answers = new ArrayList<>();
            for (Future<MvcResult> call : calls) {
                var r = call.get(60, TimeUnit.SECONDS).getResponse();
                answers.add(r.getStatus() + " " + r.getContentAsString());
                if (r.getStatus() == 200) {
                    confirmed += (Integer) JsonPath.read(r.getContentAsString(), "$.confirmed");
                    amount += ((Number) JsonPath.read(r.getContentAsString(), "$.amount")).longValue();
                }
            }
            assertPaidOnce(second);
            assertThat(answers).as("both Managers' answers").allMatch(s -> s.startsWith("200 "));
            assertThat(confirmed).as("claims confirmed by the two Managers together").isEqualTo(37);
            assertThat(amount).isEqualTo(total(second));
        } finally {
            pool.shutdownNow();
        }
    }

    /** 37 students from {@code from} apply in the test Term and claim their Deposit; the receipts are attached. */
    private List<String> claimed(ApplyFlow flow, int from) throws Exception {
        List<String> invoices = new ArrayList<>();
        for (int n = from; n < from + 37; n++) {
            String auth = bearer(mvc, email(n));
            ApplyFlow.Applied app = flow.apply(auth, "4-bed", "Basic", null);
            flow.claim(auth, app.depositInvoiceId()).andExpect(status().isOk());
            flow.attachReceipt(app.depositInvoiceId()).andExpect(status().isOk());
            invoices.add(app.depositInvoiceId());
        }
        return invoices;
    }

    private static String ids(List<String> invoices) {
        return "{\"invoiceIds\":[" + String.join(",", invoices.stream().map(i -> "\"" + i + "\"").toList()) + "]}";
    }

    private long total(List<String> invoices) {
        return jdbc.sql("SELECT sum(amount) FROM bil_invoice WHERE code IN (:c)").param("c", invoices)
                .query(Long.class).single();
    }

    private void assertPaidOnce(List<String> invoices) {
        assertThat(jdbc.sql("SELECT DISTINCT status FROM bil_invoice WHERE code IN (:c)").param("c", invoices)
                .query(String.class).list()).containsExactly("PAID");
        assertThat(jdbc.sql("""
                SELECT count(*) FROM bil_payment p JOIN bil_invoice i ON i.id = p.invoice_id WHERE i.code IN (:c)
                """).param("c", invoices).query(Long.class).single()).isEqualTo(37);
        assertThat(Set.copyOf(jdbc.sql("""
                SELECT count(*) FROM bil_payment p JOIN bil_invoice i ON i.id = p.invoice_id WHERE i.code IN (:c)
                GROUP BY i.id
                """).param("c", invoices).query(Long.class).list())).containsExactly(1L);
    }
}

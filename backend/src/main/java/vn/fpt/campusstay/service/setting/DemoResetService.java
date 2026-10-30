package vn.fpt.campusstay.service.setting;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.common.demo.DemoData;
import vn.fpt.campusstay.common.demo.DemoScripts;
import vn.fpt.campusstay.config.DemoProperties;
import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;

/**
 * Admin › System › Reset demo data (spec §15, D-23), only when {@code DEMO_TOOLS=true}: the business data (Terms,
 * Applications, Allocations, Invoices, requests, announcements …) is replaced by a stage whose dates are relative to
 * now; accounts, Buildings, furniture and configuration stay. Each feature clears and loads its own part
 * ({@link DemoData}); the reset is one transaction and one Audit Log entry. Stage 0 only clears. The scenarios and
 * their accounts come from {@code db/demo/scenarios.csv}; the sample files to upload during the demo are made from
 * the data loaded now. The plan reads every feature's tables (a test fixture, like the base data).
 */
@Service
public class DemoResetService {

    public record StageInfo(String code, String title, String description) {
    }

    /** A demo situation and the account that shows it ({@code stages} e.g. {@code ABC}). */
    public record Scenario(String id, String stages, String account, String role, String scenario, String where,
            String scenarioVi, String whereVi) {
    }

    public record LastReset(String stage, Instant at, String by) {
    }

    /** A sample file to upload during the demo ({@code use}: where), built from the data loaded now. */
    public record FileInfo(String kind, String name, String title, String use) {
    }

    public record Status(boolean enabled, List<StageInfo> stages, List<Scenario> scenarios, List<FileInfo> files,
            LastReset lastReset) {
    }

    /** A CSV file (UTF-8 with a byte-order mark, so spreadsheets read the accents). */
    public record DemoFile(String name, byte[] bytes) {
    }

    /** {@code counts}: rows loaded per kind of record, for the confirmation message. */
    public record Result(String stage, Instant at, Map<String, Long> counts) {
    }

    static final String CONFIRMATION = "RESET";

    private static final List<FileInfo> FILES = List.of(
            new FileInfo("student-list", "demo-student-list.csv", "Student list to import",
                    "Manager › Students › Import student list: 5 new students and 2 lines with an error."),
            new FileInfo("enrolled-list", "demo-enrolled-list.csv", "Enrolled list of the next Term",
                    "Manager › Reconciliation, stage A: shows groups 1–4 (one suspended, two missing, an unknown code, "
                            + "a graduate)."),
            new FileInfo("meter-readings", "demo-meter-readings-block-a.csv", "Meter readings of Block A, this month",
                    "Staff (staff.a1) › Utility › Meter readings › Import CSV."),
            new FileInfo("door-codes", "demo-door-codes-block-a.csv", "New door codes of Block A",
                    "Staff (staff.a1) › Door codes › Import: the Rooms whose code must change."),
            new FileInfo("rooms-left-out", "demo-rooms-left-out.csv", "Rooms a Term leaves out",
                    "Manager › Registration-period request, or Admin › Term wizard › Rooms: Import Excel or CSV."));

    /** Students of the scenarios: kept out of the special lines of the enrolled list. */
    private static final List<String> SCENARIO_CODES = List.of("SE210001", "SE210002", "SE210003", "SE210004", "SE210006",
            "SE210007", "SE210012", "SE210013", "SE210014", "SE210019", "SE210024", "SE210026", "SE200001", "SE200003",
            "SE200004", "SE200005", "SE200007", "SE200009", "SE200010", "SE220001", "SE220002", "SE220003", "SE220004",
            "SE220005", "SE220006", "SE220007", "SE220008", "SE220009", "SE220011", "SE220012", "SE220013");

    // Fictional new students (codes the base data does not use); the last two lines show the import's checks.
    private static final String STUDENT_LIST = """
            student_code,full_name,email,gender,date_of_birth,major,cohort,semester,hometown,region,enrollment_status,priority_groups
            SE229901,Pham Gia Bao,se229901@fpt.edu.vn,Male,2008-02-11,SE,K22,1,Quang Ngai,CENTRAL,Enrolled,FIRST_YEAR;FAR_FROM_CAMPUS
            SE229902,Le Thi Thu Ha,se229902@fpt.edu.vn,Female,2008-06-23,AI,K22,1,Can Tho,MEKONG,Enrolled,FIRST_YEAR;FAR_FROM_CAMPUS
            SE229903,Nguyen Minh Khoa,se229903@fpt.edu.vn,Male,2008-09-02,SE,K22,1,Ho Chi Minh City,SOUTHEAST,Enrolled,FIRST_YEAR
            SA229904,Tran Ngoc Anh,sa229904@fpt.edu.vn,Female,2008-01-17,GD,K22,1,Da Lat,HIGHLANDS,Enrolled,FIRST_YEAR;SCHOLARSHIP
            SS229905,Vo Quoc Huy,ss229905@fpt.edu.vn,Male,2007-11-30,BA,K22,1,Ha Noi,NORTH,Enrolled,FIRST_YEAR;FAR_FROM_CAMPUS
            SE229906,Dang Thi My,se229906@fpt.edu.vn,Unknown,2008-04-05,SE,K22,1,Binh Duong,SOUTHEAST,Enrolled,FIRST_YEAR
            SE229907,Bui Van Tai,se229901@fpt.edu.vn,Male,2008-07-14,SE,K22,1,Hue,CENTRAL,Enrolled,FIRST_YEAR
            """;

    // A-509 does not match its Room Class; Z-999 is no Room (the import lists it apart).
    private static final String ROOMS_LEFT_OUT = """
            Mã phòng
            A-509
            A-1012
            E-1012
            Z-999
            """;
    private static final String ACTION = "DEMO_DATA_RESET";

    private static final List<StageInfo> STAGES = List.of(
            new StageInfo("0", "Fresh system",
                    "No Term and no history: accounts, Buildings, furniture and settings only. The Admin starts by "
                            + "publishing a Term (or a Manager asks for a registration period)."),
            new StageInfo("A", "Requests window and registration open",
                    "Term N is in stay; Term N+1 is published: continuing residents file room changes, swaps, Room Class "
                            + "changes, extensions and end of stay, and new students register and pay their Deposit."),
            new StageInfo("B", "Next-Term fees issued",
                    "Requests are decided and the enrolled list reconciled; next-Term fees are issued and partly paid, "
                            + "before their deadline (M7). New students are assigned and pay their Balance."),
            new StageInfo("C", "Turnover week",
                    "Term N ends in three days: leavers check out, movers change Rooms, door codes are rotated, unpaid "
                            + "fees released their Beds and Round 2 can fill the free Beds."));

    private final JdbcClient jdbc;
    private final JdbcTemplate template;
    private final CurrentUser currentUser;
    private final DemoProperties properties;
    private final List<DemoData> parts;
    private final AuditLog audit;
    private final Clock clock;

    public DemoResetService(JdbcClient jdbc, JdbcTemplate template, CurrentUser currentUser, DemoProperties properties,
            List<DemoData> parts, AuditLog audit, Clock clock) {
        this.jdbc = jdbc;
        this.template = template;
        this.currentUser = currentUser;
        this.properties = properties;
        this.parts = parts.stream().sorted(Comparator.comparingInt(DemoData::order)).toList();
        this.audit = audit;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public Status status() {
        currentUser.require(Permission.CONFIGURE);
        if (!properties.tools()) {
            return new Status(false, STAGES, List.of(), List.of(), null);
        }
        LastReset last = jdbc.sql("""
                SELECT change ->> 'stage' AS stage, at, actor_label FROM shared_audit_log
                WHERE action = :action ORDER BY at DESC, id DESC LIMIT 1
                """).param("action", ACTION)
                .query((rs, i) -> new LastReset(rs.getString("stage"), rs.getTimestamp("at").toInstant(),
                        rs.getString("actor_label")))
                .optional().orElse(null);
        return new Status(true, STAGES, scenarios(), FILES, last);
    }

    @Transactional
    public Result reset(String stage, String confirm) {
        currentUser.require(Permission.CONFIGURE);
        if (!properties.tools()) {
            throw ApiException.conflict("DEMO_TOOLS_OFF", "The demo tools are off on this server.");
        }
        FieldErrors errors = new FieldErrors();
        String code = stage == null ? "" : stage.trim().toUpperCase(Locale.ROOT);
        errors.check(STAGES.stream().anyMatch(s -> s.code().equals(code)), "stage", "Choose stage 0, A, B or C.");
        errors.check(CONFIRMATION.equals(confirm == null ? null : confirm.trim()), "confirm",
                "Type RESET to confirm.");
        errors.throwIfAny();
        boolean baseData = jdbc.sql("""
                SELECT count(*) FROM auth_user WHERE demo AND email IN ('manager.a@fpt.edu.vn', 'staff.a1@fpt.edu.vn',
                                                                        'se210001@fpt.edu.vn', 'se220006@fpt.edu.vn')
                """).query(Long.class).single() == 4;
        if (!baseData) {
            throw ApiException.conflict("DEMO_BASE_DATA_MISSING",
                    "The demo accounts of the base data are missing. Load the base data (db/seed) first.");
        }
        jdbc.sql("SELECT pg_advisory_xact_lock(hashtext('campusstay.demo-reset'))").query(Object.class).list();

        Instant now = Instant.now(clock);
        DemoData.Stage loaded = new DemoData.Stage(code, now, LocalDate.ofInstant(now, TimeConfig.CAMPUS_ZONE));
        for (DemoData part : parts.reversed()) {
            part.clear();
        }
        if (!code.equals("0")) {
            DemoScripts.run(template, "plan.sql", loaded);
            for (DemoData part : parts) {
                part.load(loaded);
            }
        }
        Map<String, Long> counts = new LinkedHashMap<>();
        counts.put("terms", count("cfg_term"));
        counts.put("applications", count("app_application"));
        counts.put("allocations", count("asg_allocation"));
        counts.put("invoices", count("bil_invoice"));
        counts.put("requests", count("req_room_change") + count("req_swap") + count("req_room_class_change")
                + count("req_stay_request"));
        counts.put("maintenance", count("mnt_request"));
        audit.record(ACTION, AuditLog.Tone.WARNING, "Demo data", code, "Stage " + code,
                Map.of("stage", code, "counts", counts));
        return new Result(code, now, counts);
    }

    /** A sample file, made from the stage loaded now. */
    @Transactional(readOnly = true)
    public DemoFile file(String kind) {
        currentUser.require(Permission.CONFIGURE);
        if (!properties.tools()) {
            throw ApiException.conflict("DEMO_TOOLS_OFF", "The demo tools are off on this server.");
        }
        FileInfo info = FILES.stream().filter(f -> f.kind().equals(kind)).findFirst()
                .orElseThrow(() -> ApiException.notFound("This demo file does not exist."));
        String csv = switch (kind) {
            case "student-list" -> STUDENT_LIST;
            case "rooms-left-out" -> ROOMS_LEFT_OUT;
            case "enrolled-list" -> enrolledList();
            case "meter-readings" -> meterReadings();
            default -> doorCodes();
        };
        return new DemoFile(info.name(), ("\uFEFF" + csv.replace("\n", "\r\n")).getBytes(StandardCharsets.UTF_8));
    }

    /**
     * Everyone of the next Term (Allocations and Applications) as Enrolled, except two students left out (group 2)
     * and one Suspended (group 1); then a code no student has (group 3) and a graduate of the directory (group 4).
     */
    private String enrolledList() {
        Long term = jdbc.sql("SELECT id FROM cfg_term WHERE requests_open_at IS NOT NULL ORDER BY stay_start DESC LIMIT 1")
                .query(Long.class).optional().orElseThrow(() -> ApiException.conflict("DEMO_STAGE_NEEDED",
                        "Load stage A, B or C first: this file lists the people of the next Term."));
        StringBuilder csv = new StringBuilder("student_code,full_name,enrollment_status\n");
        jdbc.sql("""
                WITH people AS (
                    SELECT student_id FROM asg_allocation WHERE term_id = :term AND status = 'ACTIVE'
                    UNION
                    SELECT student_id FROM app_application
                    WHERE term_id = :term AND status IN ('AWAITING_DEPOSIT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED',
                                                         'WAITLISTED', 'ALLOCATED')),
                picked AS (
                    SELECT p.student_id, row_number() OVER (ORDER BY md5('enrolled' || s.student_code)) AS n
                    FROM people p JOIN auth_student s ON s.user_id = p.student_id
                    WHERE s.student_code NOT IN (:scenarios))
                SELECT s.student_code, u.display_name, CASE WHEN k.n = 3 THEN 'Suspended' ELSE 'Enrolled' END AS status
                FROM people p JOIN auth_student s ON s.user_id = p.student_id JOIN auth_user u ON u.id = p.student_id
                LEFT JOIN picked k ON k.student_id = p.student_id
                WHERE k.n IS NULL OR k.n > 2
                ORDER BY s.student_code
                """).param("term", term).param("scenarios", SCENARIO_CODES)
                .query((rs, i) -> rs.getString(1) + "," + rs.getString(2) + "," + rs.getString(3))
                .list().forEach(line -> csv.append(line).append('\n'));
        csv.append("SE229999,Tran Van Moi,Enrolled\n");
        jdbc.sql("""
                SELECT s.student_code || ',' || u.display_name || ',Graduated'
                FROM auth_student s JOIN auth_user u ON u.id = s.user_id
                WHERE u.demo AND s.cohort = 'K18' AND s.enrollment_status = 'ENROLLED'
                  AND NOT EXISTS (SELECT 1 FROM asg_allocation a WHERE a.student_id = s.user_id AND a.term_id = :term)
                  AND NOT EXISTS (SELECT 1 FROM app_application a WHERE a.student_id = s.user_id AND a.term_id = :term)
                ORDER BY s.student_code LIMIT 1
                """).param("term", term).query(String.class).optional().ifPresent(line -> csv.append(line).append('\n'));
        return csv.toString();
    }

    /** This month's readings of Block A (the open period): about last month's use again, so none needs a check. */
    private String meterReadings() {
        List<String> lines = jdbc.sql("""
                SELECT r.code || ',' || (m.electricity_prev + coalesce(l.kwh, 60) + r.id % 7)::bigint || ','
                       || (m.water_prev + coalesce(l.m3, 3) + r.id % 2)::bigint
                FROM bil_meter_reading m JOIN bil_meter_period p ON p.id = m.period_id
                JOIN inv_room r ON r.id = m.room_id JOIN inv_building b ON b.id = p.building_id
                LEFT JOIN LATERAL (SELECT x.electricity_curr - x.electricity_prev AS kwh, x.water_curr - x.water_prev AS m3
                                   FROM bil_meter_reading x JOIN bil_meter_period xp ON xp.id = x.period_id
                                   WHERE x.room_id = m.room_id AND xp.closed_at IS NOT NULL
                                   ORDER BY xp.period_start DESC LIMIT 1) l ON TRUE
                WHERE b.code = 'A' AND p.closed_at IS NULL AND m.status = 'MISSING'
                ORDER BY r.code
                """).query(String.class).list();
        if (lines.isEmpty()) {
            throw ApiException.conflict("DEMO_STAGE_NEEDED", "Load stage A, B or C first: Block A has no open meter period.");
        }
        return "room,electricity,water\n" + String.join("\n", lines) + "\n";
    }

    /** A new code for every Room of Block A whose code must change (someone left). */
    private String doorCodes() {
        List<String> rooms = jdbc.sql("""
                SELECT r.code FROM inv_door_code_task t JOIN inv_room r ON r.id = t.room_id
                JOIN inv_building b ON b.id = r.building_id
                WHERE b.code = 'A' AND t.done_at IS NULL ORDER BY r.code
                """).query(String.class).list();
        if (rooms.isEmpty()) {
            throw ApiException.conflict("DEMO_STAGE_NEEDED", "Load stage A, B or C first: no door code of Block A must change.");
        }
        StringBuilder csv = new StringBuilder("room,code\n");
        for (String room : rooms) {
            csv.append(room).append(',').append(String.format("%06d", Math.floorMod(("door" + room).hashCode(), 900_000) + 100_000))
                    .append('\n');
        }
        return csv.toString();
    }

    private long count(String table) {
        return jdbc.sql("SELECT count(*) FROM " + table).query(Long.class).single();
    }

    /** {@code db/demo/scenarios.csv}: {@code id;stages;account;role;scenario;where;scenario_vi;where_vi}, a header line first. */
    static List<Scenario> scenarios() {
        List<Scenario> scenarios = new ArrayList<>();
        try (InputStream in = new ClassPathResource("db/demo/scenarios.csv").getInputStream()) {
            String[] lines = new String(in.readAllBytes(), StandardCharsets.UTF_8).split("\\R");
            for (int i = 1; i < lines.length; i++) {
                if (lines[i].isBlank()) {
                    continue;
                }
                String[] f = lines[i].split(";", -1);
                scenarios.add(new Scenario(f[0], f[1], f[2], f[3], f[4], f[5], f[6], f[7]));
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return scenarios;
    }
}

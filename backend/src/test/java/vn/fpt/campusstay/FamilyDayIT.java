package vn.fpt.campusstay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.MANAGER_A;
import static vn.fpt.campusstay.TestAuth.STAFF_A;
import static vn.fpt.campusstay.TestAuth.STAFF_B2;
import static vn.fpt.campusstay.TestAuth.bearer;

import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import com.jayway.jsonpath.JsonPath;

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
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/**
 * Family Day (ADR-29, contract A-69): Managers organise it for a Block, its residents register guests who each get a
 * pass, the Block's Staff check guests in once and out, the Manager closes it (TC-VIS-001…008).
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class FamilyDayIT {

    /** Residents of Block A, a resident of Block B and a student who lives nowhere. */
    private static final int A1 = 21, A2 = 22, A3 = 23, B1 = 24, NOWHERE = 25;

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    long termId;

    @BeforeEach
    void setUp() {
        termId = new ApplyFlow(mvc, jdbc).openTerm();
        livesIn(A1, "A");
        livesIn(A2, "A");
        livesIn(A3, "A");
        livesIn(B1, "B");
    }

    /** A resident (door code released) on a free Bed of the Block, once per class. */
    private void livesIn(int n, String block) {
        jdbc.sql("""
                INSERT INTO asg_allocation (term_id, student_id, bed_id, source, allocated_at, checked_in_at, resident_at,
                                            code_released_at)
                SELECT :term, u.id, b.id, 'MANUAL', now(), now(), now(), now()
                FROM auth_user u, inv_bed b JOIN inv_room r ON r.id = b.room_id JOIN inv_building g ON g.id = r.building_id
                WHERE u.email = :email AND g.code = :block
                  AND NOT EXISTS (SELECT 1 FROM asg_allocation a WHERE a.bed_id = b.id AND a.status = 'ACTIVE')
                  AND NOT EXISTS (SELECT 1 FROM asg_allocation a WHERE a.student_id = u.id AND a.status = 'ACTIVE')
                ORDER BY r.code DESC, b.label
                LIMIT 1
                """).param("term", termId).param("email", StayFlow.student(n)).param("block", block).update();
    }

    private ResultActions postJson(String path, String auth, String body) throws Exception {
        return mvc.perform(post(path).header(HttpHeaders.AUTHORIZATION, auth).contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private ResultActions getAs(String path, String auth) throws Exception {
        return mvc.perform(get(path).header(HttpHeaders.AUTHORIZATION, auth));
    }

    private static String body(ResultActions result) throws Exception {
        return result.andReturn().getResponse().getContentAsString();
    }

    private static String at(Duration fromNow) {
        return Instant.now().plus(fromNow).truncatedTo(ChronoUnit.SECONDS).toString();
    }

    /** A Draft for Block A: registration open now, two time slots later today (3 and 10 places). */
    private static String draft(String title) {
        return """
                {"block":"A","title":"%s","area":"Lobby of Block A","maxGuests":4,
                 "registrationOpensAt":"%s","registrationClosesAt":"%s",
                 "slots":[{"startsAt":"%s","endsAt":"%s","capacity":3},{"startsAt":"%s","endsAt":"%s","capacity":10}]}
                """.formatted(title, at(Duration.ofHours(-1)), at(Duration.ofHours(1)), at(Duration.ofHours(2)),
                at(Duration.ofHours(4)), at(Duration.ofHours(5)), at(Duration.ofHours(7)));
    }

    /** Creates and publishes a Family Day; returns its id. */
    private String published(String title) throws Exception {
        String manager = bearer(mvc, MANAGER_A);
        String id = JsonPath.read(body(postJson("/family-days", manager, draft(title)).andExpect(status().isCreated())),
                "$.id");
        postJson("/family-days/" + id + "/publish", manager, "{}").andExpect(status().isOk());
        return id;
    }

    private String slot(String familyDayId, int index) throws Exception {
        return JsonPath.read(body(getAs("/family-days/" + familyDayId, bearer(mvc, MANAGER_A))),
                "$.slots[" + index + "].id");
    }

    private static String guests(String... names) {
        List<String> items = new ArrayList<>();
        for (String name : names) {
            items.add("{\"fullName\":\"%s\",\"relationship\":\"Parent\",\"birthYear\":1975}".formatted(name));
        }
        return String.join(",", items);
    }

    private ResultActions register(int student, String familyDayId, String slotId, String guestsJson) throws Exception {
        return postJson("/students/me/family-days/" + familyDayId + "/registration", bearer(mvc, StayFlow.student(student)),
                "{\"slotId\":\"%s\",\"guests\":[%s]}".formatted(slotId, guestsJson));
    }

    /** Moves the time slot to now (it started 10 minutes ago, ends in an hour): the day of the Family Day. */
    private void slotIsNow(String slotId) {
        jdbc.sql("""
                UPDATE vis_time_slot SET starts_at = now() - interval '10 minutes', ends_at = now() + interval '1 hour'
                WHERE id = :id
                """).param("id", Long.parseLong(slotId)).update();
    }

    /** Moves every time slot of the Family Day into the past. */
    private void slotsAreOver(String familyDayId) {
        jdbc.sql("""
                UPDATE vis_time_slot SET starts_at = now() - interval '3 hours', ends_at = now() - interval '1 hour'
                WHERE family_day_id = :id
                """).param("id", Long.parseLong(familyDayId)).update();
    }

    private long notifications(int student, String key) {
        return jdbc.sql("""
                SELECT count(*) FROM ntf_notification n JOIN auth_user u ON u.id = n.user_id
                WHERE u.email = :e AND n.event_key = :k
                """).param("e", StayFlow.student(student)).param("k", key).query(Long.class).single();
    }

    /**
     * TC-VIS-001: a Manager creates a Draft (fields checked; Staff may not), publishes it and the Block's residents are
     * told; a published Family Day cannot be edited; Staff of another Block cannot read it.
     */
    @Test
    void managerCreatesAndPublishes() throws Exception {
        String manager = bearer(mvc, MANAGER_A);
        postJson("/family-days", manager, """
                {"block":"A","title":"x","area":"","maxGuests":0,"registrationOpensAt":"%s","registrationClosesAt":"%s",
                 "slots":[{"startsAt":"%s","endsAt":"%s","capacity":5},{"startsAt":"%s","endsAt":"%s","capacity":5}]}
                """.formatted(at(Duration.ofHours(2)), at(Duration.ofHours(1)), at(Duration.ofHours(3)),
                at(Duration.ofHours(5)), at(Duration.ofHours(4)), at(Duration.ofHours(6))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.title").isString())
                .andExpect(jsonPath("$.details.fields.area").isString())
                .andExpect(jsonPath("$.details.fields.maxGuests").isString())
                .andExpect(jsonPath("$.details.fields.registrationClosesAt").isString())
                .andExpect(jsonPath("$['details']['fields']['slots[1].startsAt']").isString());
        postJson("/family-days", bearer(mvc, STAFF_A), draft("Staff try")).andExpect(status().isForbidden());

        long told = notifications(A1, "FAMILY_DAY_PUBLISHED");
        String id = JsonPath.read(body(postJson("/family-days", manager, draft("Spring Family Day"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("Draft"))
                .andExpect(jsonPath("$.actions.publish").value(true))), "$.id");
        assertThat(notifications(A1, "FAMILY_DAY_PUBLISHED")).isEqualTo(told);
        getAs("/students/me/family-days/" + id, bearer(mvc, StayFlow.student(A1))).andExpect(status().isNotFound());

        postJson("/family-days/" + id + "/publish", manager, "{}").andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("Registration open"))
                .andExpect(jsonPath("$.slots.length()").value(2));
        assertThat(notifications(A1, "FAMILY_DAY_PUBLISHED")).isEqualTo(told + 1);
        assertThat(notifications(B1, "FAMILY_DAY_PUBLISHED")).isZero();
        mvc.perform(put("/family-days/" + id).header(HttpHeaders.AUTHORIZATION, manager)
                .contentType(MediaType.APPLICATION_JSON).content(draft("Changed")))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("FAMILY_DAY_NOT_DRAFT"));
        getAs("/family-days/" + id, bearer(mvc, STAFF_A)).andExpect(status().isOk())
                .andExpect(jsonPath("$.actions.cancel").value(false));
        getAs("/family-days/" + id, bearer(mvc, STAFF_B2)).andExpect(status().isForbidden());
        getAs("/family-days?block=A&status=Registration open", manager).andExpect(status().isOk())
                .andExpect(jsonPath("$.items[?(@.id == '" + id + "')]").isNotEmpty());
    }

    /**
     * TC-VIS-002: a resident registers guests for one time slot and each guest gets their own pass; guests are checked
     * (a child comes with an adult, at most the Family Day's number); one registration per student; students of other
     * Blocks and students who live nowhere cannot see or register.
     */
    @Test
    void residentRegistersGuestsWithTheirOwnPasses() throws Exception {
        String id = published("Guests and passes");
        String slot = slot(id, 1);
        register(A1, id, slot, "{\"fullName\":\"Little One\",\"relationship\":\"Brother\",\"birthYear\":%d}"
                .formatted(Instant.now().atZone(java.time.ZoneOffset.UTC).getYear() - 8))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.details.fields.guests").isString());
        register(A1, id, slot, guests("A a", "B b", "C c", "D d", "E e"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.details.fields.guests").isString());
        register(A1, id, slot, guests("Nguyen Van Bo", "Nguyen Van Bo"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$['details']['fields']['guests[1].fullName']").isString());

        String child = "{\"fullName\":\"Nguyen Van Em\",\"relationship\":\"Brother\",\"birthYear\":%d}"
                .formatted(Instant.now().atZone(java.time.ZoneOffset.UTC).getYear() - 10);
        String json = body(register(A1, id, slot, guests("Nguyen Van Bo", "Tran Thi Me") + "," + child)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.registration.status").value("Approved"))
                .andExpect(jsonPath("$.registration.guests.length()").value(3))
                .andExpect(jsonPath("$.registration.canCancel").value(true))
                .andExpect(jsonPath("$.canRegister").value(false)));
        List<String> passes = JsonPath.read(json, "$.registration.guests[*].passToken");
        assertThat(passes).hasSize(3).doesNotContainNull().doesNotHaveDuplicates();
        assertThat(notifications(A1, "FAMILY_DAY_REGISTERED")).isPositive();
        register(A1, id, slot, guests("Someone Else")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("FAMILY_DAY_ALREADY_REGISTERED"));

        getAs("/students/me/family-days", bearer(mvc, StayFlow.student(A1))).andExpect(status().isOk())
                .andExpect(jsonPath("$.resident").value(true))
                .andExpect(jsonPath("$.items[?(@.id == '" + id + "')].registration.guests").value(3));
        getAs("/students/me/family-days/" + id, bearer(mvc, StayFlow.student(B1))).andExpect(status().isNotFound());
        getAs("/students/me/family-days", bearer(mvc, StayFlow.student(NOWHERE))).andExpect(status().isOk())
                .andExpect(jsonPath("$.resident").value(false)).andExpect(jsonPath("$.items.length()").value(0));
        register(NOWHERE, id, slot, guests("Someone")).andExpect(status().isNotFound());
        getAs("/family-days/" + id + "/registrations?q=van em", bearer(mvc, STAFF_A)).andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1)).andExpect(jsonPath("$.items[0].guests.length()").value(3));
    }

    /**
     * TC-VIS-003: a time slot never takes more guests than its places: a registration larger than what is left is
     * refused, and two students racing for the last place get it once.
     */
    @Test
    void timeSlotCapacityIsNeverExceeded() throws Exception {
        String id = published("Capacity");
        String small = slot(id, 0);
        register(A1, id, small, guests("Guest One", "Guest Two")).andExpect(status().isCreated());
        register(A2, id, small, guests("Guest Three", "Guest Four")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("FAMILY_DAY_SLOT_FULL"))
                .andExpect(jsonPath("$.details.remaining").value(1));

        String a2 = bearer(mvc, StayFlow.student(A2));
        String a3 = bearer(mvc, StayFlow.student(A3));
        Callable<Integer> first = () -> postJson("/students/me/family-days/" + id + "/registration", a2,
                "{\"slotId\":\"%s\",\"guests\":[%s]}".formatted(small, guests("Racer One"))).andReturn().getResponse()
                .getStatus();
        Callable<Integer> second = () -> postJson("/students/me/family-days/" + id + "/registration", a3,
                "{\"slotId\":\"%s\",\"guests\":[%s]}".formatted(small, guests("Racer Two"))).andReturn().getResponse()
                .getStatus();
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Future<Integer>> results = pool.invokeAll(List.of(first, second));
            List<Integer> codes = new ArrayList<>();
            for (Future<Integer> f : results) {
                codes.add(f.get());
            }
            assertThat(codes).containsExactlyInAnyOrder(201, 409);
        } finally {
            pool.shutdown();
        }
        getAs("/family-days/" + id, bearer(mvc, MANAGER_A)).andExpect(jsonPath("$.slots[0].booked").value(3))
                .andExpect(jsonPath("$.slots[0].remaining").value(0));
    }

    /**
     * TC-VIS-004: at the desk, Staff of the Block scan a pass, check the identity paper and let the guest in once;
     * the guest leaves and the pass no longer works; Staff of another Block cannot use it; an unknown pass is refused
     * and written to the Audit Log.
     */
    @Test
    void deskChecksAGuestInOnceAndOut() throws Exception {
        String id = published("Desk");
        String slot = slot(id, 1);
        String json = body(register(A1, id, slot, guests("Pham Van Bo", "Le Thi Me")).andExpect(status().isCreated()));
        String pass = JsonPath.read(json, "$.registration.guests[0].passToken");
        String guest = JsonPath.read(json, "$.registration.guests[0].id");
        String other = JsonPath.read(json, "$.registration.guests[1].id");
        String staff = bearer(mvc, STAFF_A);

        postJson("/family-day-visitors/verify", staff, "{\"token\":\"%s\"}".formatted(pass)).andExpect(status().isOk())
                .andExpect(jsonPath("$.canCheckIn").value(false))
                .andExpect(jsonPath("$.visitor.studentCode").value("SE19%04d".formatted(A1)));
        postJson("/family-day-visitors/" + guest + "/check-in", staff, "{\"identityChecked\":true}")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("VISITOR_TOO_EARLY"));

        slotIsNow(slot);
        postJson("/family-day-visitors/verify", staff, "{\"token\":\"%s\"}".formatted(pass))
                .andExpect(jsonPath("$.canCheckIn").value(true)).andExpect(jsonPath("$.problem").isEmpty());
        postJson("/family-day-visitors/verify", bearer(mvc, STAFF_B2), "{\"token\":\"%s\"}".formatted(pass))
                .andExpect(status().isForbidden());
        postJson("/family-day-visitors/" + guest + "/check-in", staff, "{}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.identityChecked").isString());
        postJson("/family-day-visitors/" + guest + "/check-in", staff, "{\"identityChecked\":true}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("Checked in"))
                .andExpect(jsonPath("$.checkedInBy").isString());
        postJson("/family-day-visitors/" + guest + "/check-in", staff, "{\"identityChecked\":true}")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("VISITOR_ALREADY_IN"));
        postJson("/family-day-visitors/" + other + "/check-out", staff, "{}").andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("VISITOR_NOT_INSIDE"));
        getAs("/family-days/" + id + "/visitors?status=Checked in", staff).andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1)).andExpect(jsonPath("$.counts.inside").value(1));

        postJson("/family-day-visitors/" + guest + "/check-out", staff, "{}").andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("Checked out"));
        postJson("/family-day-visitors/verify", staff, "{\"token\":\"%s\"}".formatted(pass))
                .andExpect(jsonPath("$.canCheckIn").value(false)).andExpect(jsonPath("$.problem").isString());
        postJson("/family-day-visitors/" + guest + "/check-in", staff, "{\"identityChecked\":true}")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("VISITOR_PASS_USED"));
        String mine = body(getAs("/students/me/family-days/" + id, bearer(mvc, StayFlow.student(A1))));
        assertThat((Object) JsonPath.read(mine, "$.registration.guests[0].passToken")).isNull();
        assertThat((String) JsonPath.read(mine, "$.registration.guests[0].status")).isEqualTo("Checked out");

        long refused = jdbc.sql("SELECT count(*) FROM shared_audit_log WHERE action = 'FAMILY_DAY_PASS_REFUSED'")
                .query(Long.class).single();
        postJson("/family-day-visitors/verify", staff, "{\"token\":\"not-a-real-pass\"}").andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("VISITOR_PASS_UNKNOWN"));
        assertThat(jdbc.sql("SELECT count(*) FROM shared_audit_log WHERE action = 'FAMILY_DAY_PASS_REFUSED'")
                .query(Long.class).single()).isEqualTo(refused + 1);
    }

    /** TC-VIS-005: two desks scanning the same pass at the same moment let the guest in once. */
    @Test
    void samePassScannedTwiceAtOnceChecksInOnce() throws Exception {
        String id = published("Double scan");
        String slot = slot(id, 1);
        String guest = JsonPath.read(body(register(A2, id, slot, guests("Hoang Van Bo")).andExpect(status().isCreated())),
                "$.registration.guests[0].id");
        slotIsNow(slot);
        String staff = bearer(mvc, STAFF_A);
        String manager = bearer(mvc, MANAGER_A);
        Callable<Integer> desk1 = () -> postJson("/family-day-visitors/" + guest + "/check-in", staff,
                "{\"identityChecked\":true}").andReturn().getResponse().getStatus();
        Callable<Integer> desk2 = () -> postJson("/family-day-visitors/" + guest + "/check-in", manager,
                "{\"identityChecked\":true}").andReturn().getResponse().getStatus();
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Integer> codes = new ArrayList<>();
            for (Future<Integer> f : pool.invokeAll(List.of(desk1, desk2))) {
                codes.add(f.get());
            }
            assertThat(codes).containsExactlyInAnyOrder(200, 409);
        } finally {
            pool.shutdown();
        }
        assertThat(jdbc.sql("SELECT count(*) FROM shared_audit_log WHERE action = 'FAMILY_DAY_GUEST_CHECKED_IN' AND object_id = :g")
                .param("g", guest).query(Long.class).single()).isEqualTo(1);
        // Admin › Audit Log: the action filter offers the Family Day actions and finds them.
        String admin = bearer(mvc, TestAuth.ADMIN);
        getAs("/admin/audit-log?pageSize=100", admin).andExpect(status().isOk())
                .andExpect(jsonPath("$.actions[?(@ == 'Family day guest checked in')]").exists());
        getAs("/admin/audit-log?pageSize=100&action=Family day guest checked in", admin).andExpect(status().isOk())
                .andExpect(jsonPath("$.items[?(@.action == 'Family day guest checked in')]").isNotEmpty())
                .andExpect(jsonPath("$.items[?(@.action != 'Family day guest checked in')]").isEmpty());
    }

    /**
     * TC-VIS-006: after the time slots a guest still inside is Overdue and a guest who never came is a No-show; the
     * Manager cannot close the day while someone is inside; Staff close the visit with a note; closing records the
     * No-shows and the counts.
     */
    @Test
    void overdueGuestsNoShowsAndClosing() throws Exception {
        String id = published("Closing");
        String slot = slot(id, 1);
        String json = body(register(A3, id, slot, guests("Vu Van Bo", "Vu Thi Me")).andExpect(status().isCreated()));
        String inside = JsonPath.read(json, "$.registration.guests[0].id");
        String staff = bearer(mvc, STAFF_A);
        String manager = bearer(mvc, MANAGER_A);
        slotIsNow(slot);
        postJson("/family-day-visitors/" + inside + "/check-in", staff, "{\"identityChecked\":true}")
                .andExpect(status().isOk());
        postJson("/family-days/" + id + "/close", manager, "{}").andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("FAMILY_DAY_NOT_OVER"));
        postJson("/family-days/" + id + "/cancel", manager, "{\"reason\":\"Rain\"}").andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("FAMILY_DAY_STARTED"));

        slotsAreOver(id);
        getAs("/family-days/" + id + "/visitors?status=Overdue", staff).andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1)).andExpect(jsonPath("$.items[0].overdue").value(true))
                .andExpect(jsonPath("$.counts.noShow").value(1));
        postJson("/family-days/" + id + "/close", manager, "{}").andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("FAMILY_DAY_GUESTS_INSIDE"))
                .andExpect(jsonPath("$.details.inside").value(1));
        // Overdue and not confirmed safe by the student: Staff wait; a Manager may close it, saying why.
        postJson("/family-day-visitors/" + inside + "/check-out", staff,
                "{\"note\":\"Left through the main gate without passing the desk\"}")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("VISITOR_SAFETY_NOT_CONFIRMED"));
        postJson("/family-day-visitors/" + inside + "/check-out", manager, "{}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.note").isString());
        postJson("/family-day-visitors/" + inside + "/check-out", manager,
                "{\"note\":\"Left through the main gate without passing the desk; confirmed by phone\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.checkOutNote").isString());
        postJson("/family-days/" + id + "/close", staff, "{}").andExpect(status().isForbidden());
        postJson("/family-days/" + id + "/close", manager, "{\"note\":\"All good\"}").andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("Completed"))
                .andExpect(jsonPath("$.counts.checkedOut").value(1)).andExpect(jsonPath("$.counts.noShow").value(1));
        assertThat(jdbc.sql("""
                SELECT count(*) FROM vis_visitor v JOIN vis_registration r ON r.id = v.registration_id
                WHERE r.family_day_id = :d AND v.status = 'NO_SHOW'
                """).param("d", Long.parseLong(id)).query(Long.class).single()).isEqualTo(1);
    }

    /**
     * TC-VIS-007: a student cancels before their time slot and the places come back; a Manager cancels a registration
     * with a reason and the student is told; cancelling the Family Day cancels every registration, the passes stop
     * working and the students are told.
     */
    @Test
    void cancellationsFreePlacesAndRevokePasses() throws Exception {
        String id = published("Cancellations");
        String slot = slot(id, 0);
        String manager = bearer(mvc, MANAGER_A);
        register(A1, id, slot, guests("Do Van Bo", "Do Thi Me")).andExpect(status().isCreated());
        postJson("/students/me/family-days/" + id + "/registration/cancel", bearer(mvc, StayFlow.student(A1)), "{}")
                .andExpect(status().isNoContent());
        getAs("/family-days/" + id, manager).andExpect(jsonPath("$.slots[0].booked").value(0));
        register(A1, id, slot, guests("Do Van Bo")).andExpect(status().isCreated());

        String regId = JsonPath.<List<String>>read(body(getAs("/family-days/" + id + "/registrations", manager)),
                "$.items[?(@.status == 'Approved')].id").get(0);
        postJson("/family-day-registrations/" + regId + "/cancel", manager, "{}").andExpect(status().isBadRequest());
        postJson("/family-day-registrations/" + regId + "/cancel", manager, "{\"reason\":\"Guest list not confirmed\"}")
                .andExpect(status().isNoContent());
        assertThat(notifications(A1, "FAMILY_DAY_REGISTRATION_CANCELLED")).isPositive();
        // The list tells who cancelled and when: the student themself (no reason), then a Manager (with the reason).
        String cancelled = body(getAs("/family-days/" + id + "/registrations", manager));
        assertThat(JsonPath.<List<Boolean>>read(cancelled, "$.items[?(@.status == 'Cancelled')].cancelledByStudent"))
                .containsExactlyInAnyOrder(true, false);
        assertThat(JsonPath.<List<String>>read(cancelled,
                "$.items[?(@.cancelledByStudent == false && @.status == 'Cancelled')].cancelReason"))
                .containsExactly("Guest list not confirmed");
        assertThat(JsonPath.<List<String>>read(cancelled, "$.items[?(@.status == 'Cancelled')].cancelledBy"))
                .hasSize(2).doesNotContainNull();
        assertThat(JsonPath.<List<String>>read(cancelled, "$.items[?(@.status == 'Cancelled')].cancelledAt"))
                .hasSize(2).doesNotContainNull();

        String pass = JsonPath.read(body(register(A2, id, slot, guests("Ly Van Bo")).andExpect(status().isCreated())),
                "$.registration.guests[0].passToken");
        postJson("/family-days/" + id + "/cancel", manager, "{\"reason\":\"Storm warning\"}").andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("Cancelled"));
        assertThat(notifications(A2, "FAMILY_DAY_CANCELLED")).isPositive();
        slotIsNow(slot);
        postJson("/family-day-visitors/verify", bearer(mvc, STAFF_A), "{\"token\":\"%s\"}".formatted(pass))
                .andExpect(status().isOk()).andExpect(jsonPath("$.canCheckIn").value(false))
                .andExpect(jsonPath("$.visitor.status").value("Cancelled"))
                .andExpect(jsonPath("$.problem").value("This pass was cancelled and no longer works."));
        // The desk reads why in its language, like an error message.
        mvc.perform(post("/family-day-visitors/verify").header(HttpHeaders.AUTHORIZATION, bearer(mvc, STAFF_A))
                .header(HttpHeaders.ACCEPT_LANGUAGE, "vi").contentType(MediaType.APPLICATION_JSON)
                .content("{\"token\":\"%s\"}".formatted(pass))).andExpect(status().isOk())
                .andExpect(jsonPath("$.problem").value("Mã vào này đã bị hủy và không còn hiệu lực."));
        getAs("/students/me/family-days/" + id, bearer(mvc, StayFlow.student(A2))).andExpect(status().isOk())
                .andExpect(jsonPath("$.registration.status").value("Cancelled"))
                .andExpect(jsonPath("$.registration.guests[0].passToken").isEmpty());
    }

    /** TC-VIS-008: registration closes at its time: a published Family Day whose registration is over takes nobody. */
    @Test
    void registrationClosesOnTime() throws Exception {
        String id = published("Closed registration");
        String slot = slot(id, 1);
        jdbc.sql("UPDATE vis_family_day SET registration_closes_at = now() - interval '1 minute' WHERE id = :id")
                .param("id", Long.parseLong(id)).update();
        register(A1, id, slot, guests("Late Guest")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("FAMILY_DAY_REGISTRATION_CLOSED"));
        getAs("/students/me/family-days/" + id, bearer(mvc, StayFlow.student(A1))).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("Registration closed"))
                .andExpect(jsonPath("$.canRegister").value(false)).andExpect(jsonPath("$.registerBlockedBy").isString());
    }

    /**
     * TC-VIS-009 (contract A-70): guests still inside after their time slot. The desk reminds every student concerned in
     * one batch (one notification each, sent again while guests stay); a student confirms their guests are safe; Staff
     * check out a confirmed guest and must wait for the others; nothing to remind or confirm before the slot ends.
     */
    @Test
    void overdueGuestsAreRemindedAndConfirmedBeforeCheckOut() throws Exception {
        String id = published("Overdue reminders");
        String slot = slot(id, 1);
        String first = body(register(A1, id, slot, guests("Ngo Van Bo", "Ngo Thi Me")).andExpect(status().isCreated()));
        String second = body(register(A2, id, slot, guests("Ly Van Ong")).andExpect(status().isCreated()));
        String bo = JsonPath.read(first, "$.registration.guests[0].id");
        String me = JsonPath.read(first, "$.registration.guests[1].id");
        String ong = JsonPath.read(second, "$.registration.guests[0].id");
        String staff = bearer(mvc, STAFF_A);
        String a1 = bearer(mvc, StayFlow.student(A1));
        slotIsNow(slot);
        for (String guest : List.of(bo, me, ong)) {
            postJson("/family-day-visitors/" + guest + "/check-in", staff, "{\"identityChecked\":true}")
                    .andExpect(status().isOk());
        }
        postJson("/family-days/" + id + "/overdue-reminders", staff, "{}").andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("FAMILY_DAY_NO_OVERDUE_GUESTS"));
        postJson("/students/me/family-days/" + id + "/registration/safety-confirmation", a1, "{}")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("FAMILY_DAY_NOTHING_TO_CONFIRM"));
        // Inside the time slot a guest leaves at the desk as usual.
        postJson("/family-day-visitors/" + me + "/check-out", staff, "{}").andExpect(status().isOk());

        slotsAreOver(id);
        getAs("/family-days/" + id + "/visitors", staff).andExpect(status().isOk())
                .andExpect(jsonPath("$.counts.overdue").value(2)).andExpect(jsonPath("$.counts.awaitingSafety").value(2));
        postJson("/family-days/" + id + "/overdue-reminders", bearer(mvc, STAFF_B2), "{}").andExpect(status().isForbidden());
        long toldA1 = notifications(A1, "FAMILY_DAY_GUESTS_OVERDUE");
        long toldA2 = notifications(A2, "FAMILY_DAY_GUESTS_OVERDUE");
        postJson("/family-days/" + id + "/overdue-reminders", staff, "{}").andExpect(status().isOk())
                .andExpect(jsonPath("$.students").value(2)).andExpect(jsonPath("$.guests").value(2));
        assertThat(notifications(A1, "FAMILY_DAY_GUESTS_OVERDUE")).isEqualTo(toldA1 + 1);
        assertThat(notifications(A2, "FAMILY_DAY_GUESTS_OVERDUE")).isEqualTo(toldA2 + 1);
        assertThat(notifications(A3, "FAMILY_DAY_GUESTS_OVERDUE")).isZero();
        postJson("/family-days/" + id + "/overdue-reminders", staff, "{}").andExpect(status().isOk());
        getAs("/family-days/" + id + "/visitors?status=Overdue&q=Ngo Van Bo", staff)
                .andExpect(jsonPath("$.items[0].reminders").value(2)).andExpect(jsonPath("$.items[0].remindedAt").isString());

        getAs("/students/me/family-days/" + id, a1).andExpect(status().isOk())
                .andExpect(jsonPath("$.registration.canConfirmSafety").value(true))
                .andExpect(jsonPath("$.registration.guests[0].overdue").value(true))
                .andExpect(jsonPath("$.registration.guests[0].remindedAt").isString());
        postJson("/family-day-visitors/" + bo + "/check-out", staff, "{}").andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("VISITOR_SAFETY_NOT_CONFIRMED"));
        postJson("/students/me/family-days/" + id + "/registration/safety-confirmation", a1,
                "{\"note\":\"My father is at the gate, leaving now\"}").andExpect(status().isOk())
                .andExpect(jsonPath("$.registration.canConfirmSafety").value(false))
                .andExpect(jsonPath("$.registration.guests[0].safetyConfirmedAt").isString())
                .andExpect(jsonPath("$.registration.guests[0].safetyNote").value("My father is at the gate, leaving now"));
        getAs("/family-days/" + id + "/visitors", staff).andExpect(jsonPath("$.counts.awaitingSafety").value(1))
                .andExpect(jsonPath("$.counts.safetyConfirmed").value(1));

        // Only the student who has not confirmed is reminded again.
        postJson("/family-days/" + id + "/overdue-reminders", staff, "{}").andExpect(status().isOk())
                .andExpect(jsonPath("$.students").value(1)).andExpect(jsonPath("$.guests").value(1));
        postJson("/family-day-visitors/" + bo + "/check-out", staff, "{}").andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("Checked out"));
        postJson("/family-day-visitors/" + ong + "/check-out", staff, "{}").andExpect(status().isConflict());
        assertThat(jdbc.sql("SELECT count(*) FROM shared_audit_log WHERE action = 'FAMILY_DAY_SAFETY_CONFIRMED'")
                .query(Long.class).single()).isPositive();
        assertThat(jdbc.sql("SELECT count(*) FROM shared_audit_log WHERE action = 'FAMILY_DAY_OVERDUE_REMINDED'")
                .query(Long.class).single()).isGreaterThanOrEqualTo(3);
    }

    /**
     * TC-VIS-010 (contract A-70): Family Day statistics. The Block's Staff, Managers and the Admin read the figures of a
     * Family Day (registrations, guests registered and arrived, time slots, the overdue procedure) and the overview of
     * the Family Days that are over; Staff of another Block and students cannot; a Draft has none.
     */
    @Test
    void statisticsAfterTheFamilyDay() throws Exception {
        String id = published("Statistics");
        String small = slot(id, 0);
        String big = slot(id, 1);
        String manager = bearer(mvc, MANAGER_A);
        String staff = bearer(mvc, STAFF_A);
        String json = body(register(A1, id, big, guests("Dang Van Bo", "Dang Thi Me")).andExpect(status().isCreated()));
        String came = JsonPath.read(json, "$.registration.guests[0].id");
        register(A2, id, big, guests("Cao Van Chu")).andExpect(status().isCreated());
        postJson("/students/me/family-days/" + id + "/registration/cancel", bearer(mvc, StayFlow.student(A2)), "{}")
                .andExpect(status().isNoContent());
        register(A3, id, small, guests("Mai Van Ong")).andExpect(status().isCreated());
        long a3Registration = jdbc.sql("""
                SELECT r.id FROM vis_registration r JOIN auth_user u ON u.id = r.student_id
                WHERE r.family_day_id = :d AND u.email = :e AND r.status = 'APPROVED'
                """).param("d", Long.parseLong(id)).param("e", StayFlow.student(A3)).query(Long.class).single();
        postJson("/family-day-registrations/" + a3Registration + "/cancel", manager, "{\"reason\":\"Duplicate\"}")
                .andExpect(status().isNoContent());

        slotIsNow(big);
        postJson("/family-day-visitors/" + came + "/check-in", staff, "{\"identityChecked\":true}").andExpect(status().isOk());
        getAs("/family-days/" + id + "/stats", staff).andExpect(status().isOk())
                .andExpect(jsonPath("$.complete").value(false)).andExpect(jsonPath("$.guests.inside").value(1));
        slotsAreOver(id);
        postJson("/family-day-visitors/" + came + "/check-out", manager, "{\"note\":\"Left with the student, seen on camera\"}")
                .andExpect(status().isOk());
        postJson("/family-days/" + id + "/close", manager, "{}").andExpect(status().isOk());

        getAs("/family-days/" + id + "/stats", staff).andExpect(status().isOk())
                .andExpect(jsonPath("$.complete").value(true))
                .andExpect(jsonPath("$.registrations.total").value(3))
                .andExpect(jsonPath("$.registrations.approved").value(1))
                .andExpect(jsonPath("$.registrations.cancelledByStudent").value(1))
                .andExpect(jsonPath("$.registrations.cancelledByManager").value(1))
                .andExpect(jsonPath("$.guests.registered").value(2))
                .andExpect(jsonPath("$.guests.arrived").value(1))
                .andExpect(jsonPath("$.guests.noShow").value(1))
                .andExpect(jsonPath("$.guests.cancelled").value(2))
                .andExpect(jsonPath("$.attendanceRate").value(50))
                .andExpect(jsonPath("$.overdue.overstayed").value(1))
                .andExpect(jsonPath("$.overdue.closedWithoutConfirmation").value(1))
                .andExpect(jsonPath("$.slots.length()").value(2))
                .andExpect(jsonPath("$.slots[1].registrations").value(1))
                .andExpect(jsonPath("$.slots[1].guests.arrived").value(1))
                .andExpect(jsonPath("$.arrivalsByHour.length()").value(1));
        String admin = bearer(mvc, TestAuth.ADMIN);
        getAs("/family-days/" + id + "/stats", admin).andExpect(status().isOk());
        getAs("/family-days/" + id + "/stats", bearer(mvc, STAFF_B2)).andExpect(status().isForbidden());
        getAs("/family-days/" + id + "/stats", bearer(mvc, StayFlow.student(A1))).andExpect(status().isForbidden());
        getAs("/family-day-stats", admin).andExpect(status().isOk())
                .andExpect(jsonPath("$.items[?(@.id == '" + id + "')].guestsArrived").value(1))
                .andExpect(jsonPath("$.totals.familyDays").isNumber());
        getAs("/family-day-stats?block=A", staff).andExpect(status().isOk())
                .andExpect(jsonPath("$.items[?(@.id == '" + id + "')]").isNotEmpty());
        getAs("/family-day-stats", bearer(mvc, STAFF_B2)).andExpect(status().isOk())
                .andExpect(jsonPath("$.items[?(@.id == '" + id + "')]").isEmpty());

        String draft = JsonPath.read(body(postJson("/family-days", manager, draft("Not yet")).andExpect(status().isCreated())),
                "$.id");
        getAs("/family-days/" + draft + "/stats", staff).andExpect(status().isNotFound());
    }
}

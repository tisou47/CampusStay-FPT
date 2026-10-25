package vn.fpt.campusstay;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.ADMIN;
import static vn.fpt.campusstay.TestAuth.MANAGER_B;
import static vn.fpt.campusstay.TestAuth.STAFF_A;
import static vn.fpt.campusstay.TestAuth.STUDENT;
import static vn.fpt.campusstay.TestAuth.bearer;

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
 * Manager › Room Classes: the Room Class of each Room per Term (ADR-24; TC-INV-008…011). The test seed's Fall 2026
 * is running and Spring 2027 has not started; Block A has the furniture its classes require, Block B none.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class RoomClassIT {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    private long term(String code) {
        return jdbc.sql("SELECT id FROM cfg_term WHERE code = :c").param("c", code).query(Long.class).single();
    }

    private long roomClass(String name) {
        return jdbc.sql("SELECT id FROM cfg_room_class WHERE name = :n").param("n", name).query(Long.class).single();
    }

    private ResultActions set(String auth, long term, String rooms, long roomClass) throws Exception {
        return mvc.perform(put("/inventory/room-classes").header(HttpHeaders.AUTHORIZATION, auth)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"termId\":\"%d\",\"rooms\":[%s],\"roomClassId\":\"%d\"}".formatted(term, rooms, roomClass)));
    }

    /**
     * TC-INV-008: without a Term the list shows the next Term to start, editable, with each Room's class and its
     * furniture conformance; the running Term is shown as fixed. Staff see their Blocks only.
     */
    @Test
    void listsClassesOfTheNextTerm() throws Exception {
        String manager = bearer(mvc, MANAGER_B);
        mvc.perform(get("/inventory/room-classes").header(HttpHeaders.AUTHORIZATION, manager)
                        .param("block", "A").param("floor", "1").param("pageSize", "100"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.term.name").value("Spring 2027"))
                .andExpect(jsonPath("$.term.editable").value(true))
                .andExpect(jsonPath("$.terms[*].name", contains("Fall 2026", "Spring 2027")))
                .andExpect(jsonPath("$.total").value(10))
                .andExpect(jsonPath("$.items[0].room").value("A-101"))
                .andExpect(jsonPath("$.items[0].roomClass").value("Basic"))
                .andExpect(jsonPath("$.items[0].previousClass").value("Basic"))
                .andExpect(jsonPath("$.items[0].setForTerm").value(false))
                .andExpect(jsonPath("$.items[0].locked").value(false))
                .andExpect(jsonPath("$.items[0].conformance.status").value("Matches"))
                .andExpect(jsonPath("$.summary[*].roomClass", contains("Basic")))
                .andExpect(jsonPath("$.roomClasses[*].name", hasItem("Premium")))
                .andExpect(jsonPath("$.note").value((Object) null));
        mvc.perform(get("/inventory/room-classes").header(HttpHeaders.AUTHORIZATION, manager)
                        .param("block", "B").param("floor", "3").param("match", "Does not match"))
                .andExpect(jsonPath("$.total").value(10))
                .andExpect(jsonPath("$.items[0].roomClass").value("Standard"))
                .andExpect(jsonPath("$.items[0].conformance.missing[*].type", contains("Air conditioner", "Water heater")))
                .andExpect(jsonPath("$.items[0].conformance.missing[0].typeVi").value("Máy lạnh"));
        mvc.perform(get("/inventory/room-classes").header(HttpHeaders.AUTHORIZATION, manager)
                        .param("termId", String.valueOf(term("FA26"))).param("block", "A").param("floor", "5"))
                .andExpect(jsonPath("$.term.editable").value(false))
                .andExpect(jsonPath("$.note").value("The stay of Fall 2026 has started, so its Room Classes are fixed."))
                .andExpect(jsonPath("$.items[0].roomClass").value("Premium"));
        String staff = bearer(mvc, STAFF_A);
        mvc.perform(get("/inventory/room-classes").header(HttpHeaders.AUTHORIZATION, staff).param("q", "A-1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.blocks", contains("A")))
                .andExpect(jsonPath("$.items[*].block", hasItem("A")))
                .andExpect(jsonPath("$.total").value(10));
        mvc.perform(get("/inventory/room-classes").header(HttpHeaders.AUTHORIZATION, staff).param("block", "B"))
                .andExpect(status().isForbidden());
    }

    /**
     * TC-INV-009: a Manager sets Rooms' class for Spring 2027; Fall 2026 keeps the old class, the Rooms and Beds
     * screen and the assignment inputs of Spring 2027 use the new one, conformance shows what the class lacks,
     * and every Room's change is in the Audit Log.
     */
    @Test
    void setsClassForTheNextTerm() throws Exception {
        String manager = bearer(mvc, MANAGER_B);
        long spring = term("SP27");
        set(manager, spring, "\"A-201\",\"a-202\",\"A-203\"", roomClass("Premium"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.changed").value(3))
                .andExpect(jsonPath("$.unchanged").value(0));
        set(manager, spring, "\"A-201\",\"A-204\"", roomClass("Premium"))
                .andExpect(jsonPath("$.changed").value(1))
                .andExpect(jsonPath("$.unchanged").value(1));
        mvc.perform(get("/inventory/room-classes").header(HttpHeaders.AUTHORIZATION, manager)
                        .param("block", "A").param("q", "A-201"))
                .andExpect(jsonPath("$.items[0].roomClass").value("Premium"))
                .andExpect(jsonPath("$.items[0].previousClass").value("Basic"))
                .andExpect(jsonPath("$.items[0].setForTerm").value(true))
                .andExpect(jsonPath("$.items[0].conformance.status").value("Does not match"))
                .andExpect(jsonPath("$.items[0].conformance.missing[*].type",
                        contains("Air conditioner", "Water heater", "Fridge")))
                .andExpect(jsonPath("$.items[0].conformance.extra[*].type", contains("Ceiling fan")));
        mvc.perform(get("/inventory/room-classes").header(HttpHeaders.AUTHORIZATION, manager)
                        .param("block", "A").param("floor", "2").param("roomClassId", String.valueOf(roomClass("Premium"))))
                .andExpect(jsonPath("$.total").value(4))
                .andExpect(jsonPath("$.summary[*].rooms", contains(4)));

        String staff = bearer(mvc, STAFF_A);
        mvc.perform(get("/inventory/rooms").header(HttpHeaders.AUTHORIZATION, staff)
                        .param("termId", String.valueOf(spring)).param("floor", "2"))
                .andExpect(jsonPath("$.roomClassName").value((Object) null))
                .andExpect(jsonPath("$.rooms[?(@.code == 'A-201')].roomClassName", contains("Premium")))
                .andExpect(jsonPath("$.rooms[?(@.code == 'A-205')].roomClassName", contains("Basic")));
        mvc.perform(get("/inventory/rooms").header(HttpHeaders.AUTHORIZATION, staff)
                        .param("termId", String.valueOf(term("FA26"))).param("floor", "2"))
                .andExpect(jsonPath("$.roomClassName").value("Basic"));
        mvc.perform(get("/inventory/rooms/A-201/details").header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.term").value("Fall 2026"))
                .andExpect(jsonPath("$.roomClass").value("Basic"))
                .andExpect(jsonPath("$.next.term").value("Spring 2027"))
                .andExpect(jsonPath("$.next.roomClass").value("Premium"))
                .andExpect(jsonPath("$.conformance.status").value("Matches"))
                .andExpect(jsonPath("$.furniture[*].assetCode", contains("FAN-A201-1")))
                .andExpect(jsonPath("$.doorCode.status").value("Not set"));
        // The Room Classes screen counts the classes of the current Term.
        mvc.perform(get("/admin/room-classes").header(HttpHeaders.AUTHORIZATION, bearer(mvc, ADMIN)))
                .andExpect(jsonPath("$.items[?(@.name == 'Basic')].usedIn", contains("A 20 · B 20")));
        // The class of a Bed in the Term is what the engine and the prices read (Inventory.BedSlot).
        Long premiumInSpring = jdbc.sql("""
                SELECT count(*) FROM inv_room r WHERE r.code LIKE 'A-2%' AND inv_room_class_in(r.id, :t) = :c
                """).param("t", spring).param("c", roomClass("Premium")).query(Long.class).single();
        org.assertj.core.api.Assertions.assertThat(premiumInSpring).isEqualTo(4);
        mvc.perform(get("/admin/audit-log").header(HttpHeaders.AUTHORIZATION, bearer(mvc, ADMIN))
                        .param("q", "A-203"))
                .andExpect(jsonPath("$.items[?(@.action == 'Room class set')].object", hasItem("Room A-203")));
    }

    /**
     * TC-INV-010 (business rule): a running Term keeps its classes, and a Room whose Beds are already given for
     * the Term (an Allocation) keeps its class there, so no price already charged changes.
     */
    @Test
    void keepsClassesWhosePriceIsFixed() throws Exception {
        String manager = bearer(mvc, MANAGER_B);
        set(manager, term("FA26"), "\"A-301\"", roomClass("Premium"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("TERM_STARTED"));
        long spring = term("SP27");
        jdbc.sql("""
                INSERT INTO asg_allocation (term_id, student_id, bed_id, source, allocated_at)
                SELECT :term, u.id, b.id, 'MANUAL', now()
                FROM auth_user u, inv_bed b JOIN inv_room r ON r.id = b.room_id
                WHERE u.email = 'se190003@student.campusstay.test' AND r.code = 'A-401' AND b.label = 'A'
                """).param("term", spring).update();
        set(manager, spring, "\"A-402\",\"A-401\"", roomClass("Premium"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ROOM_CLASS_LOCKED"))
                .andExpect(jsonPath("$.message").value("Beds of Room A-401 are already given for Spring 2027 or later, "
                        + "so its Room Class can change only from a later Term."));
        mvc.perform(get("/inventory/room-classes").header(HttpHeaders.AUTHORIZATION, manager)
                        .param("block", "A").param("q", "A-40").param("pageSize", "100"))
                .andExpect(jsonPath("$.items[?(@.room == 'A-401')].locked", contains(true)))
                .andExpect(jsonPath("$.items[?(@.room == 'A-402')].locked", contains(false)))
                .andExpect(jsonPath("$.items[?(@.room == 'A-402')].roomClass", contains("Standard")));
        // The Room in use keeps its class; the free Room alone can change.
        set(manager, spring, "\"A-402\"", roomClass("Premium")).andExpect(status().isOk());
    }

    /** TC-INV-011 (permission, validation): only Managers set classes; students cannot read; bad input is named. */
    @Test
    void refusesWrongRequests() throws Exception {
        long spring = term("SP27");
        set(bearer(mvc, STAFF_A), spring, "\"A-101\"", roomClass("Standard")).andExpect(status().isForbidden());
        mvc.perform(get("/inventory/room-classes").header(HttpHeaders.AUTHORIZATION, bearer(mvc, STUDENT)))
                .andExpect(status().isForbidden());
        String manager = bearer(mvc, MANAGER_B);
        mvc.perform(put("/inventory/room-classes").header(HttpHeaders.AUTHORIZATION, manager)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"termId\":\"%d\",\"rooms\":[]}".formatted(spring)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.rooms").value("Choose at least one Room."))
                .andExpect(jsonPath("$.details.fields.roomClassId").value("Choose an active Room Class."));
        set(manager, spring, "\"A-999\"", roomClass("Standard"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Room A-999 does not exist."));
        mvc.perform(put("/inventory/room-classes").header(HttpHeaders.AUTHORIZATION, manager)
                        .header(HttpHeaders.ACCEPT_LANGUAGE, "vi").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"termId\":\"%d\",\"rooms\":[\"A-101\"],\"roomClassId\":\"%d\"}"
                                .formatted(term("FA26"), roomClass("Standard"))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Kỳ Fall 2026 đã bắt đầu, nên hạng phòng của kỳ này không thể thay đổi."));
        mvc.perform(get("/inventory/room-classes").header(HttpHeaders.AUTHORIZATION, manager).param("termId", "99999"))
                .andExpect(status().isNotFound());
        mvc.perform(get("/inventory/room-classes").header(HttpHeaders.AUTHORIZATION, manager).param("block", "A")
                        .param("pageSize", "5"))
                .andExpect(jsonPath("$.items", hasSize(5)))
                .andExpect(jsonPath("$.total").value(50));
    }
}

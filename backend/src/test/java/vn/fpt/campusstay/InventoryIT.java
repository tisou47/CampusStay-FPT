package vn.fpt.campusstay;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.ADMIN;
import static vn.fpt.campusstay.TestAuth.MANAGER_B;
import static vn.fpt.campusstay.TestAuth.STAFF_A;
import static vn.fpt.campusstay.TestAuth.STUDENT;
import static vn.fpt.campusstay.TestAuth.bearer;

import java.util.List;

import com.jayway.jsonpath.JsonPath;
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

/** Admin › Buildings and Staff/Manager › Inventory (TC-INV-NNN). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class InventoryIT {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    /** TC-INV-001: Blocks with their Floors, Room counts per Room Type and closed Rooms. */
    @Test
    void listsBuildingsAndFloors() throws Exception {
        mvc.perform(get("/admin/buildings").header(HttpHeaders.AUTHORIZATION, bearer(mvc, ADMIN)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[?(@.name == 'A')].id", hasSize(1)))
                .andExpect(jsonPath("$.items[?(@.name == 'A')].gender", contains("Male")))
                .andExpect(jsonPath("$.items[?(@.name == 'B')].gender", contains("Female")))
                .andExpect(jsonPath("$.items[?(@.name == 'A')].floors[0].roomClassName", contains("Basic")))
                .andExpect(jsonPath("$.items[?(@.name == 'A')].floors[0].twoBed", contains(4)))
                .andExpect(jsonPath("$.items[?(@.name == 'A')].floors[0].fourBed", contains(4)))
                .andExpect(jsonPath("$.items[?(@.name == 'A')].floors[0].sixBed", contains(2)))
                .andExpect(jsonPath("$.items[?(@.name == 'A')].floors[0].rooms", contains(10)))
                .andExpect(jsonPath("$.items[?(@.name == 'A')].floors[0].beds", contains(36)))
                .andExpect(jsonPath("$.items[?(@.name == 'A')].floors[2].closedRooms", contains(1)))
                .andExpect(jsonPath("$.genders", contains("Male", "Female")))
                .andExpect(jsonPath("$.floorOptions", hasSize(10)))
                .andExpect(jsonPath("$.layoutNote").isString());
    }

    /** TC-INV-002: a new Block gets the standard layout; generating again adds nothing; bad ranges are refused. */
    @Test
    void createsBlockAndGeneratesRooms() throws Exception {
        String admin = bearer(mvc, ADMIN);
        String id = JsonPath.read(mvc.perform(post("/admin/buildings").header(HttpHeaders.AUTHORIZATION, admin)
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"c\",\"gender\":\"Female\",\"status\":\"Active\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(), "$.id");
        mvc.perform(post("/admin/buildings").header(HttpHeaders.AUTHORIZATION, admin)
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"C\",\"gender\":\"Other\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.name").value("A Block with this name already exists."))
                .andExpect(jsonPath("$.details.fields.gender").exists());

        String bulk = "{\"fromFloor\":%d,\"toFloor\":%d}";
        mvc.perform(post("/admin/buildings/" + id + "/rooms/bulk").header(HttpHeaders.AUTHORIZATION, admin)
                .contentType(MediaType.APPLICATION_JSON).content(bulk.formatted(1, 2)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.created").value(20))
                .andExpect(jsonPath("$.skipped").value(0));
        mvc.perform(post("/admin/buildings/" + id + "/rooms/bulk").header(HttpHeaders.AUTHORIZATION, admin)
                .contentType(MediaType.APPLICATION_JSON).content(bulk.formatted(1, 2)))
                .andExpect(jsonPath("$.created").value(0));
        mvc.perform(post("/admin/buildings/" + id + "/rooms/bulk").header(HttpHeaders.AUTHORIZATION, admin)
                .contentType(MediaType.APPLICATION_JSON).content(bulk.formatted(3, 11)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.toFloor").exists());

        mvc.perform(get("/admin/buildings/" + id + "/floors/1/rooms").header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(10)))
                .andExpect(jsonPath("$.items[0].code").value("C-101"))
                .andExpect(jsonPath("$.items[0].roomTypeName").value("2-bed"))
                .andExpect(jsonPath("$.items[0].roomClassName").value("Basic"))
                .andExpect(jsonPath("$.items[9].code").value("C-110"))
                .andExpect(jsonPath("$.items[9].roomTypeName").value("6-bed"))
                .andExpect(jsonPath("$.items[9].outOfService").value(false));
        mvc.perform(get("/admin/buildings").header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(jsonPath("$.items[?(@.name == 'C')].floors[1].beds", contains(36)));
        mvc.perform(put("/admin/buildings/" + id).header(HttpHeaders.AUTHORIZATION, admin)
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"D\",\"gender\":\"Male\",\"status\":\"Inactive\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.name").value("The Block name cannot be changed."));
        mvc.perform(put("/admin/buildings/" + id).header(HttpHeaders.AUTHORIZATION, admin)
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"C\",\"gender\":\"Male\",\"status\":\"Inactive\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id));
        mvc.perform(get("/admin/buildings").header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(jsonPath("$.items[?(@.name == 'C')].gender", contains("Male")))
                .andExpect(jsonPath("$.items[?(@.name == 'C')].status", contains("Inactive")));
        mvc.perform(get("/admin/buildings/" + id + "/floors/9/rooms").header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(status().isNotFound());
    }

    /** TC-INV-003 (scope): Staff see only their Blocks; a Block outside the scope is refused. */
    @Test
    void structureFollowsBlockScope() throws Exception {
        String staff = bearer(mvc, STAFF_A);
        mvc.perform(get("/inventory/structure").header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.blocks", hasSize(1)))
                .andExpect(jsonPath("$.blocks[0].block").value("A"))
                .andExpect(jsonPath("$.blocks[0].floors", contains(1, 2, 3, 4, 5)))
                .andExpect(jsonPath("$.outOfServiceReasons", hasItem("Maintenance")));
        mvc.perform(get("/inventory/structure").header(HttpHeaders.AUTHORIZATION, staff).param("block", "B"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("BLOCK_OUT_OF_SCOPE"));
        mvc.perform(get("/inventory/rooms").header(HttpHeaders.AUTHORIZATION, bearer(mvc, TestAuth.STAFF_B2))
                .param("block", "A").param("floor", "1"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("BLOCK_OUT_OF_SCOPE"));
        mvc.perform(get("/inventory/rooms").header(HttpHeaders.AUTHORIZATION, bearer(mvc, MANAGER_B))
                .param("block", "A").param("floor", "1"))
                .andExpect(status().isOk()); // Managers see every Block (ADR-19)
        mvc.perform(get("/inventory/rooms").header(HttpHeaders.AUTHORIZATION, bearer(mvc, "staff.ab@campusstay.test"))
                .param("floor", "1"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Choose a Block."));
    }

    /** TC-INV-004: a Floor's Rooms and Beds with the out-of-service details. */
    @Test
    void showsFloorWithOutOfServiceRoom() throws Exception {
        mvc.perform(get("/inventory/rooms").header(HttpHeaders.AUTHORIZATION, bearer(mvc, STAFF_A))
                .param("floor", "3"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.roomClassName").value("Standard"))
                .andExpect(jsonPath("$.rooms", hasSize(10)))
                .andExpect(jsonPath("$.rooms[?(@.code == 'A-305')].outOfService.reason", contains("Maintenance")))
                .andExpect(jsonPath("$.rooms[?(@.code == 'A-305')].outOfService.note",
                        contains("Water leak under the bathroom sink")))
                .andExpect(jsonPath("$.rooms[?(@.code == 'A-305')].beds[0].id", contains("A-305-A")))
                .andExpect(jsonPath("$.rooms[?(@.code == 'A-305')].beds[*].state", contains("oos", "oos", "oos", "oos")))
                .andExpect(jsonPath("$.rooms[?(@.code == 'A-301')].outOfService", contains((Object) null)))
                .andExpect(jsonPath("$.summary.beds").value(36))
                .andExpect(jsonPath("$.summary.outOfService").value(4))
                .andExpect(jsonPath("$.summary.available").value(32));
        mvc.perform(get("/inventory/rooms/a-305").header(HttpHeaders.AUTHORIZATION, bearer(mvc, STAFF_A)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("A-305"))
                .andExpect(jsonPath("$.block").value("A"))
                .andExpect(jsonPath("$.floor").value(3));
        mvc.perform(get("/inventory/rooms/A-305").header(HttpHeaders.AUTHORIZATION, bearer(mvc, TestAuth.STAFF_B2)))
                .andExpect(status().isForbidden());
    }

    /**
     * TC-INV-005 (business rule): an occupied Room cannot go out of service, its Block cannot change gender and
     * its Room Type cannot change Beds; the occupant shows on the Bed.
     */
    @Test
    void occupiedRoomIsProtected() throws Exception {
        long termId = jdbc.sql("SELECT id FROM cfg_term WHERE code = 'FA26'").query(Long.class).single();
        jdbc.sql("""
                INSERT INTO asg_allocation (term_id, student_id, bed_id, source)
                SELECT :term, u.id, b.id, 'MANUAL'
                FROM auth_user u, inv_bed b JOIN inv_room r ON r.id = b.room_id
                WHERE u.email = 'se190002@student.campusstay.test' AND r.code = 'A-101' AND b.label = 'A'
                """).param("term", termId).update();
        try {
            String staff = bearer(mvc, STAFF_A);
            mvc.perform(get("/inventory/rooms").header(HttpHeaders.AUTHORIZATION, staff)
                    .param("termId", String.valueOf(termId)).param("block", "A").param("floor", "1"))
                    .andExpect(jsonPath("$.rooms[?(@.code == 'A-101')].beds[0].state", contains("allocated")))
                    .andExpect(jsonPath("$.rooms[?(@.code == 'A-101')].beds[0].occupant.studentCode", contains("SE190002")))
                    .andExpect(jsonPath("$.summary.allocated").value(1));
            mvc.perform(post("/inventory/rooms/A-101/out-of-service").header(HttpHeaders.AUTHORIZATION, staff)
                    .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Maintenance\"}"))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("ROOM_OCCUPIED"))
                    .andExpect(jsonPath("$.message").value("Move the 1 resident of Room A-101 before you set it out of service."));

            String admin = bearer(mvc, ADMIN);
            String blockA = this.<List<String>>read(admin, "/admin/buildings", "$.items[?(@.name == 'A')].id").getFirst();
            mvc.perform(put("/admin/buildings/" + blockA).header(HttpHeaders.AUTHORIZATION, admin)
                    .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"A\",\"gender\":\"Female\",\"status\":\"Active\"}"))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("BLOCK_IN_USE"));
            String twoBed = this.<List<String>>read(admin, "/admin/room-types", "$.items[?(@.name == '2-bed')].id").getFirst();
            mvc.perform(get("/admin/room-types").header(HttpHeaders.AUTHORIZATION, admin))
                    .andExpect(jsonPath("$.items[?(@.name == '2-bed')].hasAllocations", contains(true)));
            mvc.perform(put("/admin/room-types/" + twoBed).header(HttpHeaders.AUTHORIZATION, admin)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"name\":\"2-bed\",\"beds\":3,\"basePrice\":9000000,\"roommateSelection\":\"auto\",\"status\":\"Active\"}"))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("ROOM_TYPE_IN_USE"));
        } finally {
            jdbc.sql("DELETE FROM asg_allocation WHERE source = 'MANUAL'").update();
        }
    }

    /** TC-INV-006: out of service and back, with the reason label, who set it, and the Audit Log. */
    @Test
    void outOfServiceAndBack() throws Exception {
        String staff = bearer(mvc, STAFF_A);
        mvc.perform(post("/inventory/rooms/A-102/out-of-service").header(HttpHeaders.AUTHORIZATION, staff)
                .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Flood\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.reason").value("Choose a reason from the list."));
        mvc.perform(post("/inventory/rooms/A-102/out-of-service").header(HttpHeaders.AUTHORIZATION, staff)
                .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Renovation\",\"note\":\" Repainting \"}"))
                .andExpect(status().isNoContent());
        mvc.perform(post("/inventory/rooms/A-102/out-of-service").header(HttpHeaders.AUTHORIZATION, staff)
                .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Renovation\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ROOM_ALREADY_OUT_OF_SERVICE"));
        mvc.perform(get("/inventory/rooms").header(HttpHeaders.AUTHORIZATION, staff).param("block", "A").param("floor", "1"))
                .andExpect(jsonPath("$.rooms[?(@.code == 'A-102')].outOfService.reason", contains("Renovation")))
                .andExpect(jsonPath("$.rooms[?(@.code == 'A-102')].outOfService.by", contains("Nguyen Van Binh")))
                .andExpect(jsonPath("$.rooms[?(@.code == 'A-102')].outOfService.note", contains("Repainting")));
        mvc.perform(post("/inventory/rooms/A-102/back-in-service").header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(status().isNoContent());
        mvc.perform(post("/inventory/rooms/A-102/back-in-service").header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ROOM_IN_SERVICE"));
        mvc.perform(get("/admin/audit-log").header(HttpHeaders.AUTHORIZATION, bearer(mvc, ADMIN))
                .param("action", "Room out of service"))
                .andExpect(jsonPath("$.items[0].object").value("Room A-102"))
                .andExpect(jsonPath("$.items[0].actor").value("Nguyen Van Binh"))
                // jsonb keeps object keys in its own order (shorter keys first)
                .andExpect(jsonPath("$.items[0].change").value("note: Repainting; reason: Renovation"));
    }

    /** TC-INV-007 (permission): students cannot see the inventory; unknown Rooms are 404. */
    @Test
    void studentsCannotSeeInventory() throws Exception {
        mvc.perform(get("/inventory/structure").header(HttpHeaders.AUTHORIZATION, bearer(mvc, STUDENT)))
                .andExpect(status().isForbidden());
        mvc.perform(get("/inventory/rooms/Z-999").header(HttpHeaders.AUTHORIZATION, bearer(mvc, STAFF_A)))
                .andExpect(status().isNotFound());
    }

    /**
     * TC-INV-012: bulk generation gives the new Rooms the Room Class chosen for them (the Floor keeps it as the class
     * of its later Rooms); each Floor lists the classes its Rooms have, which are set per Room from then on.
     */
    @Test
    void generatesRoomsOfAChosenClass() throws Exception {
        String admin = bearer(mvc, ADMIN);
        String id = JsonPath.read(mvc.perform(post("/admin/buildings").header(HttpHeaders.AUTHORIZATION, admin)
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"D\",\"gender\":\"Male\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(), "$.id");
        String premium = jdbc.sql("SELECT id FROM cfg_room_class WHERE name = 'Premium'").query(Long.class).single().toString();
        mvc.perform(post("/admin/buildings/" + id + "/rooms/bulk").header(HttpHeaders.AUTHORIZATION, admin)
                .contentType(MediaType.APPLICATION_JSON).content("{\"fromFloor\":1,\"toFloor\":1,\"roomClassId\":\"99999\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.roomClassId").value("Choose an active Room Class."));
        mvc.perform(post("/admin/buildings/" + id + "/rooms/bulk").header(HttpHeaders.AUTHORIZATION, admin)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"fromFloor\":1,\"toFloor\":1,\"roomClassId\":\"" + premium + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.created").value(10));
        mvc.perform(get("/admin/buildings").header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(jsonPath("$.items[?(@.name == 'D')].floors[0].roomClassName", contains("Premium")))
                .andExpect(jsonPath("$.items[?(@.name == 'D')].floors[0].roomClasses[0].name", contains("Premium")))
                .andExpect(jsonPath("$.items[?(@.name == 'D')].floors[0].roomClasses[0].rooms", contains(10)))
                .andExpect(jsonPath("$.items[?(@.name == 'A')].floors[0].roomClasses[*].name", contains("Basic")))
                .andExpect(jsonPath("$.roomClasses[*].name", contains("Basic", "Standard", "Premium")));
        mvc.perform(get("/admin/buildings/" + id + "/floors/1/rooms").header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(jsonPath("$.items[*].roomClassName", everyItem(is("Premium"))));
    }

    private <T> T read(String auth, String url, String path) throws Exception {
        return JsonPath.read(mvc.perform(get(url).header(HttpHeaders.AUTHORIZATION, auth)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(), path);
    }
}

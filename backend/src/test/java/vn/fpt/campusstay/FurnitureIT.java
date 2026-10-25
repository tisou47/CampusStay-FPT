package vn.fpt.campusstay;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.MANAGER_B;
import static vn.fpt.campusstay.TestAuth.STAFF_A;
import static vn.fpt.campusstay.TestAuth.STAFF_B2;
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
import org.springframework.test.web.servlet.ResultActions;

/**
 * Staff and Manager › Furniture: items, Block stores, moves and transfers (spec §6.19; TC-INV-015…018). Block A's
 * Rooms have the items their classes require and its store holds two fridges and an air conditioner.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class FurnitureIT {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    private ResultActions send(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request,
            String auth, String body) throws Exception {
        return mvc.perform(request.header(HttpHeaders.AUTHORIZATION, auth).contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private long item(String assetCode) {
        return jdbc.sql("SELECT id FROM inv_furniture_item WHERE asset_code = :c").param("c", assetCode)
                .query(Long.class).single();
    }

    private long typeId(String code) {
        return jdbc.sql("SELECT id FROM inv_furniture_type WHERE code = :c").param("c", code).query(Long.class).single();
    }

    /** TC-INV-015 (scope): items of the Blocks in scope, with counts per status and filters; other Blocks are refused. */
    @Test
    void listsItemsInScope() throws Exception {
        String staff = bearer(mvc, STAFF_A);
        // FRG-ASTORE-2 stays in the store in every test of this class (the others move items).
        mvc.perform(get("/furniture").header(HttpHeaders.AUTHORIZATION, staff).param("location", "store")
                        .param("typeId", String.valueOf(typeId("FRG"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[*].assetCode", hasItem("FRG-ASTORE-2")))
                .andExpect(jsonPath("$.items[?(@.assetCode == 'FRG-ASTORE-2')].status", contains("In store")))
                .andExpect(jsonPath("$.items[?(@.assetCode == 'FRG-ASTORE-2')].location.kind", contains("Store")))
                .andExpect(jsonPath("$.items[?(@.assetCode == 'FRG-ASTORE-2')].location.block", contains("A")))
                .andExpect(jsonPath("$.counts['In store']").isNumber())
                .andExpect(jsonPath("$.options.blocks", contains("A")))
                .andExpect(jsonPath("$.options.statuses", hasItem("In repair")));
        mvc.perform(get("/furniture").header(HttpHeaders.AUTHORIZATION, staff).param("room", "a-501"))
                .andExpect(jsonPath("$.items[*].type", contains("Air conditioner", "Water heater", "Fridge")))
                .andExpect(jsonPath("$.items[0].typeVi").value("Máy lạnh"));
        mvc.perform(get("/furniture").header(HttpHeaders.AUTHORIZATION, staff).param("typeId", String.valueOf(typeId("FAN")))
                        .param("pageSize", "5"))
                .andExpect(jsonPath("$.total").value(20))
                .andExpect(jsonPath("$.items", hasSize(5)));
        mvc.perform(get("/furniture").header(HttpHeaders.AUTHORIZATION, bearer(mvc, STAFF_B2)))
                .andExpect(jsonPath("$.items[?(@.location.block == 'A')]", hasSize(0)));
        mvc.perform(get("/furniture").header(HttpHeaders.AUTHORIZATION, bearer(mvc, STAFF_B2)).param("block", "A"))
                .andExpect(status().isForbidden());
        mvc.perform(get("/furniture/" + item("AC-A301-1")).header(HttpHeaders.AUTHORIZATION, bearer(mvc, STAFF_B2)))
                .andExpect(status().isForbidden());
        mvc.perform(get("/furniture").header(HttpHeaders.AUTHORIZATION, bearer(mvc, STUDENT)))
                .andExpect(status().isForbidden());
    }

    /** TC-INV-016 (permission): Managers register items with new asset codes; Staff cannot; the input is checked. */
    @Test
    void registersItems() throws Exception {
        String manager = bearer(mvc, MANAGER_B);
        String body = send(post("/furniture"), manager,
                "{\"typeId\":\"%d\",\"block\":\"B\",\"room\":\"B-301\",\"quantity\":2,\"note\":\"Delivered\"}"
                        .formatted(typeId("AC")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assetCodes", hasSize(2)))
                .andExpect(jsonPath("$.assetCodes[0]", startsWith("AC-")))
                .andReturn().getResponse().getContentAsString();
        String code = JsonPath.read(body, "$.assetCodes[0]");
        mvc.perform(get("/furniture").header(HttpHeaders.AUTHORIZATION, manager).param("q", code))
                .andExpect(jsonPath("$.items[0].status").value("In use"))
                .andExpect(jsonPath("$.items[0].location.room").value("B-301"))
                .andExpect(jsonPath("$.items[0].note").value("Delivered"));
        mvc.perform(get("/furniture/" + item(code)).header(HttpHeaders.AUTHORIZATION, manager))
                .andExpect(jsonPath("$.history[0].kind").value("Registered"))
                .andExpect(jsonPath("$.history[0].to").value("Room B-301"))
                .andExpect(jsonPath("$.history[0].by").value("Pham Thu Ha"));
        send(post("/furniture"), bearer(mvc, STAFF_A), "{\"typeId\":\"%d\",\"block\":\"A\",\"quantity\":1}"
                .formatted(typeId("AC")))
                .andExpect(status().isForbidden());
        send(post("/furniture"), manager, "{\"block\":\"A\",\"room\":\"B-301\",\"quantity\":500}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.typeId").value("Choose an active furniture type."))
                .andExpect(jsonPath("$.details.fields.quantity").value("Enter a quantity from 1 to 100."));
        send(post("/furniture"), manager, "{\"typeId\":\"%d\",\"block\":\"A\",\"room\":\"B-301\",\"quantity\":1}"
                .formatted(typeId("AC")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.room").value("Room B-301 is not in Block A."));
    }

    /**
     * TC-INV-017 (business rule): Staff move items inside their Block now (status follows the place, the Room's
     * conformance changes); moving to another Block is a Manager's transfer, planned and then done by Staff; a planned
     * move can also be cancelled.
     */
    @Test
    void movesAndTransfersItems() throws Exception {
        String staff = bearer(mvc, STAFF_A);
        long fridge = item("FRG-ASTORE-1");
        send(post("/furniture/moves"), staff, "{\"items\":[\"%d\"],\"toRoom\":\"A-301\",\"reason\":\"Student request\"}"
                .formatted(fridge))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.moved").value(1));
        mvc.perform(get("/furniture/" + fridge).header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(jsonPath("$.item.status").value("In use"))
                .andExpect(jsonPath("$.item.location.room").value("A-301"))
                .andExpect(jsonPath("$.history[0].kind").value("Moved"))
                .andExpect(jsonPath("$.history[0].from").value("Block A store"))
                .andExpect(jsonPath("$.history[0].to").value("Room A-301"))
                .andExpect(jsonPath("$.history[0].reason").value("Student request"));
        // A Standard Room with a fridge has an item its class does not include.
        mvc.perform(get("/inventory/rooms/A-301/details").header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(jsonPath("$.conformance.status").value("Does not match"))
                .andExpect(jsonPath("$.conformance.extra[*].type", contains("Fridge")));
        send(post("/furniture/moves"), staff, "{\"items\":[\"%d\"],\"toRoom\":\"A-301\",\"reason\":\"Again\"}"
                .formatted(fridge))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("SAME_LOCATION"));

        long ac = item("AC-ASTORE-1");
        send(post("/furniture/moves"), staff, "{\"items\":[\"%d\"],\"toStore\":\"B\",\"reason\":\"Block B needs one\"}"
                .formatted(ac))
                .andExpect(status().isForbidden());
        String manager = bearer(mvc, MANAGER_B);
        send(post("/furniture/moves"), manager, ("{\"items\":[\"%d\"],\"toStore\":\"B\",\"reason\":\"Block B needs one\","
                + "\"planned\":true}").formatted(ac))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.planned").value(1));
        send(post("/furniture/moves"), manager, "{\"items\":[\"%d\"],\"toRoom\":\"A-302\",\"reason\":\"Other\"}"
                .formatted(ac))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("MOVE_PLANNED"));
        String moves = mvc.perform(get("/furniture/moves").header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].assetCode").value("AC-ASTORE-1"))
                .andExpect(jsonPath("$.items[0].to.block").value("B"))
                .andExpect(jsonPath("$.items[0].status").value("Planned"))
                .andExpect(jsonPath("$.items[0].createdBy").value("Pham Thu Ha"))
                .andReturn().getResponse().getContentAsString();
        String moveId = JsonPath.read(moves, "$.items[0].id");
        mvc.perform(get("/furniture").header(HttpHeaders.AUTHORIZATION, staff).param("q", "AC-ASTORE-1"))
                .andExpect(jsonPath("$.items[0].plannedMove.to.block").value("B"));
        mvc.perform(post("/furniture/moves/" + moveId + "/done").header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(status().isNoContent());
        mvc.perform(post("/furniture/moves/" + moveId + "/done").header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("MOVE_CLOSED"));
        mvc.perform(get("/furniture").header(HttpHeaders.AUTHORIZATION, bearer(mvc, STAFF_B2)).param("location", "store"))
                .andExpect(jsonPath("$.items[*].assetCode", contains("AC-ASTORE-1")))
                .andExpect(jsonPath("$.items[0].status").value("In store"));

        // A planned move can be dropped: the item stays where it is.
        long fan = item("FAN-A101-1");
        send(post("/furniture/moves"), staff, ("{\"items\":[\"%d\"],\"toStore\":\"A\",\"reason\":\"Class change\","
                + "\"planned\":true}").formatted(fan))
                .andExpect(jsonPath("$.planned").value(1));
        String planned = JsonPath.read(mvc.perform(get("/furniture/moves").header(HttpHeaders.AUTHORIZATION, staff))
                .andReturn().getResponse().getContentAsString(), "$.items[0].id");
        mvc.perform(post("/furniture/moves/" + planned + "/cancel").header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(status().isNoContent());
        mvc.perform(post("/furniture/moves/" + planned + "/cancel").header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("MOVE_CLOSED"));
        mvc.perform(get("/furniture/moves").header(HttpHeaders.AUTHORIZATION, staff).param("status", "Cancelled"))
                .andExpect(jsonPath("$.items[*].assetCode", contains("FAN-A101-1")));
        mvc.perform(get("/furniture/" + fan).header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(jsonPath("$.item.location.room").value("A-101"))
                .andExpect(jsonPath("$.item.plannedMove").value((Object) null));
    }

    /** TC-INV-018 (validation): status changes follow the place, Disposed is final, and every change is recorded. */
    @Test
    void changesStatus() throws Exception {
        String staff = bearer(mvc, STAFF_A);
        long heater = item("WH-A302-1");
        send(put("/furniture/" + heater), staff, "{\"status\":\"Broken\",\"reason\":\"Does not heat\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("Broken"));
        send(put("/furniture/" + heater), staff, "{\"status\":\"In store\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.status").value("Move the item to a store to mark it In store."));
        // A broken item still counts for its Room: it is there, waiting for repair.
        mvc.perform(get("/inventory/rooms/A-302/details").header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(jsonPath("$.conformance.status").value("Matches"));
        send(put("/furniture/" + heater), staff, "{\"status\":\"Disposed\",\"reason\":\"Beyond repair\"}")
                .andExpect(status().isOk());
        mvc.perform(get("/inventory/rooms/A-302/details").header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(jsonPath("$.conformance.missing[*].type", contains("Water heater")));
        send(put("/furniture/" + heater), staff, "{\"status\":\"In use\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ITEM_DISPOSED"));
        mvc.perform(get("/furniture/" + heater).header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(jsonPath("$.history[*].to", contains("Disposed", "Broken")))
                .andExpect(jsonPath("$.history[1].reason").value("Does not heat"));
        mvc.perform(get("/furniture").header(HttpHeaders.AUTHORIZATION, staff).param("room", "A-302"))
                .andExpect(jsonPath("$.items[*].assetCode", contains("AC-A302-1")));
        mvc.perform(get("/furniture").header(HttpHeaders.AUTHORIZATION, staff).param("status", "Disposed"))
                .andExpect(jsonPath("$.items[*].assetCode", contains("WH-A302-1")));
        List<String> actions = JsonPath.read(mvc.perform(get("/admin/audit-log")
                        .header(HttpHeaders.AUTHORIZATION, bearer(mvc, TestAuth.ADMIN)).param("q", "WH-A302-1"))
                .andReturn().getResponse().getContentAsString(), "$.items[*].action");
        org.assertj.core.api.Assertions.assertThat(actions).contains("Furniture status changed");
    }
}

package vn.fpt.campusstay;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.ADMIN;
import static vn.fpt.campusstay.TestAuth.MANAGER_A;
import static vn.fpt.campusstay.TestAuth.bearer;

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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** Admin › Furniture: furniture types and Room Class requirements (spec §6.19; TC-INV-013, 014). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class AdminFurnitureIT {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    private MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder request, String auth, String body) {
        return request.header(HttpHeaders.AUTHORIZATION, auth).contentType(MediaType.APPLICATION_JSON).content(body);
    }

    private long typeId(String code) {
        return jdbc.sql("SELECT id FROM inv_furniture_type WHERE code = :c").param("c", code).query(Long.class).single();
    }

    private long classId(String name) {
        return jdbc.sql("SELECT id FROM cfg_room_class WHERE name = :n").param("n", name).query(Long.class).single();
    }

    /**
     * TC-INV-013: the Admin lists the furniture types with their items, adds one (code and names checked, the code
     * fixed afterwards) and cannot make a type a Room Class requires standard; other roles are refused.
     */
    @Test
    void managesFurnitureTypes() throws Exception {
        String admin = bearer(mvc, ADMIN);
        mvc.perform(get("/admin/furniture-types").header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(7)))
                .andExpect(jsonPath("$.items[?(@.code == 'AC')].name", contains("Air conditioner")))
                .andExpect(jsonPath("$.items[?(@.code == 'AC')].nameVi", contains("Máy lạnh")))
                .andExpect(jsonPath("$.items[?(@.code == 'AC')].definesClass", contains(true)))
                .andExpect(jsonPath("$.items[?(@.code == 'BED')].definesClass", contains(false)))
                .andExpect(jsonPath("$.items[?(@.code == 'FRG')].items", contains(12)))
                .andExpect(jsonPath("$.categories", contains("Appliance", "Furniture", "Fixture", "Other")));
        String body = mvc.perform(json(post("/admin/furniture-types"), admin, """
                        {"code":"tv","name":"Television","nameVi":"Ti vi","category":"Appliance","definesClass":true}"""))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String id = JsonPath.read(body, "$.id");
        mvc.perform(json(post("/admin/furniture-types"), admin, """
                        {"code":"TV","name":"television","nameVi":"","category":"Toys"}"""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.code").value("A furniture type with this code already exists."))
                .andExpect(jsonPath("$.details.fields.name").value("A furniture type with this name already exists."))
                .andExpect(jsonPath("$.details.fields.nameVi").isString())
                .andExpect(jsonPath("$.details.fields.category").value("Choose a category."));
        mvc.perform(json(put("/admin/furniture-types/" + id), admin, """
                        {"code":"TVX","name":"Television","nameVi":"Ti vi","category":"Appliance","definesClass":true}"""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.code").value("The code cannot be changed."));
        mvc.perform(json(put("/admin/furniture-types/" + id), admin, """
                        {"name":"Smart TV","nameVi":"Ti vi thông minh","category":"Appliance","definesClass":false,
                         "status":"Inactive"}"""))
                .andExpect(status().isOk());
        mvc.perform(get("/admin/furniture-types").header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(jsonPath("$.items[?(@.code == 'TV')].name", contains("Smart TV")))
                .andExpect(jsonPath("$.items[?(@.code == 'TV')].status", contains("Inactive")));
        mvc.perform(json(put("/admin/furniture-types/" + typeId("AC")), admin, """
                        {"name":"Air conditioner","nameVi":"Máy lạnh","category":"Appliance","definesClass":false}"""))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("TYPE_REQUIRED"));
        mvc.perform(get("/admin/furniture-types").header(HttpHeaders.AUTHORIZATION, bearer(mvc, MANAGER_A)))
                .andExpect(status().isForbidden());
        mvc.perform(get("/admin/audit-log").header(HttpHeaders.AUTHORIZATION, admin).param("q", "Television"))
                .andExpect(jsonPath("$.items[*].action", hasItem("Furniture type created")));
    }

    /**
     * TC-INV-014: each Room Class lists the furniture it requires; the Admin replaces a class's requirements, only
     * with active class-defining types and sensible quantities, and conformance follows at once.
     */
    @Test
    void setsRoomClassRequirements() throws Exception {
        String admin = bearer(mvc, ADMIN);
        mvc.perform(get("/admin/room-class-requirements").header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[?(@.roomClass == 'Standard')].requirements[*].type",
                        contains("Air conditioner", "Water heater")))
                .andExpect(jsonPath("$.items[?(@.roomClass == 'Basic')].requirements[0].quantity", contains(1)))
                .andExpect(jsonPath("$.types[*].name", contains("Ceiling fan", "Air conditioner", "Water heater", "Fridge")));
        long basic = classId("Basic");
        mvc.perform(json(put("/admin/room-class-requirements/" + basic), admin,
                        "{\"items\":[{\"typeId\":\"%d\",\"quantity\":2}]}".formatted(typeId("BED"))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.items")
                        .value("Only active furniture types that define a Room Class can be required."));
        mvc.perform(json(put("/admin/room-class-requirements/" + basic), admin,
                        "{\"items\":[{\"typeId\":\"%d\",\"quantity\":30}]}".formatted(typeId("FAN"))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.items").value("Enter a quantity from 1 to 20."));
        mvc.perform(json(put("/admin/room-class-requirements/" + basic), admin,
                        "{\"items\":[{\"typeId\":\"%d\",\"quantity\":2}]}".formatted(typeId("FAN"))))
                .andExpect(status().isNoContent());
        mvc.perform(get("/admin/room-class-requirements").header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(jsonPath("$.items[?(@.roomClass == 'Basic')].requirements[0].quantity", contains(2)));
        // Block A's Basic Rooms have one fan: one is missing now.
        mvc.perform(get("/inventory/rooms/A-101/details").header(HttpHeaders.AUTHORIZATION, bearer(mvc, MANAGER_A)))
                .andExpect(jsonPath("$.conformance.status").value("Does not match"))
                .andExpect(jsonPath("$.conformance.missing[0].type").value("Ceiling fan"))
                .andExpect(jsonPath("$.conformance.missing[0].quantity").value(1));
        mvc.perform(json(put("/admin/room-class-requirements/99999"), admin, "{\"items\":[]}"))
                .andExpect(status().isNotFound());
    }
}

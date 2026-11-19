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

/** Admin › Furniture: furniture types, their value and Room Class requirements (spec §6.19; TC-INV-013, 014, 026). */
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

    /**
     * TC-INV-026: each furniture type is personal (furniture, one per Bed) or shared by the Room (appliances and
     * fixtures) and has a real price (0–1,000,000,000 VND, empty while not set); four condition levels give the
     * share of that price an item is still worth (100, 75, 50, 0 %). The Admin sets the price and adds, renames,
     * revalues or removes levels (a Vietnamese name, the English one optional, 0–100 %, listed best first); Managers
     * may not.
     */
    @Test
    void setsFurnitureValue() throws Exception {
        String admin = bearer(mvc, ADMIN);
        mvc.perform(get("/admin/furniture-types").header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[?(@.code == 'BED')].use", contains("Personal")))
                .andExpect(jsonPath("$.items[?(@.code == 'AC')].use", contains("Shared")))
                .andExpect(jsonPath("$.uses", contains("Personal", "Shared")))
                .andExpect(jsonPath("$.conditions[*].code",
                        contains("INTACT", "PARTLY_DAMAGED", "MOSTLY_DAMAGED", "DESTROYED")))
                .andExpect(jsonPath("$.conditions[*].nameVi",
                        contains("Nguyên vẹn", "Hư một phần", "Hư hơn một nửa", "Hư hoàn toàn")))
                .andExpect(jsonPath("$.conditions[*].percent", contains(100, 75, 50, 0)));
        long wardrobe = typeId("WRD");
        mvc.perform(json(put("/admin/furniture-types/" + wardrobe), admin, """
                        {"name":"Wardrobe","nameVi":"Tủ quần áo","category":"Furniture","status":"Active","price":-1,"use":"Both"}"""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.price").value("Enter a price from 0 to 1,000,000,000 VND."))
                .andExpect(jsonPath("$.details.fields.use").value("Choose Personal or Shared."));
        mvc.perform(json(put("/admin/furniture-types/" + wardrobe), admin, """
                        {"name":"Wardrobe","nameVi":"Tủ quần áo","category":"Furniture","status":"Active","price":2500000}"""))
                .andExpect(status().isOk());
        mvc.perform(get("/admin/furniture-types").header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(jsonPath("$.items[?(@.code == 'WRD')].price", contains(2500000)))
                .andExpect(jsonPath("$.items[?(@.code == 'WRD')].use", contains("Personal")));
        String four = "{\"code\":\"INTACT\",\"name\":\"Intact\",\"nameVi\":\"Nguyên vẹn\",\"percent\":100},"
                + "{\"code\":\"PARTLY_DAMAGED\",\"name\":\"Partly damaged\",\"nameVi\":\"Hư một phần\",\"percent\":75},"
                + "{\"code\":\"MOSTLY_DAMAGED\",\"name\":\"More than half damaged\",\"nameVi\":\"Hư hơn một nửa\",\"percent\":50},"
                + "{\"code\":\"DESTROYED\",\"name\":\"Completely damaged\",\"nameVi\":\"Hư hoàn toàn\",\"percent\":0}";
        mvc.perform(json(put("/admin/furniture-conditions"), admin, "{\"items\":[]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.items").value("Keep at least one condition level."));
        mvc.perform(json(put("/admin/furniture-conditions"), admin,
                        "{\"items\":[" + four + ",{\"name\":\"Intact\",\"nameVi\":\"Còn tốt\",\"percent\":90}]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.items").value("Give each condition level its own name."));
        mvc.perform(json(put("/admin/furniture-conditions"), admin,
                        "{\"items\":[" + four + ",{\"name\":\"Scratched\",\"nameVi\":\"Trầy xước\",\"percent\":120}]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.items").value("Enter a value from 0 to 100 %."));
        mvc.perform(json(put("/admin/furniture-conditions"), bearer(mvc, MANAGER_A), "{\"items\":[" + four + "]}"))
                .andExpect(status().isForbidden());
        // A new level is added and placed by its value; with no English name it takes the Vietnamese one.
        mvc.perform(json(put("/admin/furniture-conditions"), admin,
                        "{\"items\":[" + four + ",{\"nameVi\":\"Trầy xước\",\"percent\":90}]}"))
                .andExpect(status().isNoContent());
        String levels = mvc.perform(get("/admin/furniture-types").header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(jsonPath("$.conditions[*].nameVi",
                        contains("Nguyên vẹn", "Trầy xước", "Hư một phần", "Hư hơn một nửa", "Hư hoàn toàn")))
                .andExpect(jsonPath("$.conditions[*].percent", contains(100, 90, 75, 50, 0)))
                .andReturn().getResponse().getContentAsString();
        org.assertj.core.api.Assertions.assertThat((String) JsonPath.read(levels, "$.conditions[1].code")).startsWith("LEVEL_");
        org.assertj.core.api.Assertions.assertThat((String) JsonPath.read(levels, "$.conditions[1].name")).isEqualTo("Trầy xước");
        // Left out, it is removed: back to the four levels of V75.
        mvc.perform(json(put("/admin/furniture-conditions"), admin, "{\"items\":[" + four + "]}"))
                .andExpect(status().isNoContent());
        mvc.perform(get("/admin/furniture-types").header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(jsonPath("$.conditions[*].percent", contains(100, 75, 50, 0)));
    }

    /**
     * TC-INV-027: the four condition levels the room handover records its conditions on (Intact, Partly damaged, More
     * than half damaged, Completely damaged) cannot be removed; renaming them or changing their value is allowed.
     */
    @Test
    void handoverLevelsStay() throws Exception {
        String admin = bearer(mvc, ADMIN);
        String three = "{\"code\":\"INTACT\",\"name\":\"Intact\",\"nameVi\":\"Nguyên vẹn\",\"percent\":100},"
                + "{\"code\":\"PARTLY_DAMAGED\",\"name\":\"Partly damaged\",\"nameVi\":\"Hư một phần\",\"percent\":75},"
                + "{\"code\":\"MOSTLY_DAMAGED\",\"name\":\"More than half damaged\",\"nameVi\":\"Hư hơn một nửa\",\"percent\":50}";
        mvc.perform(json(put("/admin/furniture-conditions"), admin, "{\"items\":[" + three + "]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.items")
                        .value("Keep the first four levels: inspections, check-in inventories and check-outs use them."));
        mvc.perform(json(put("/admin/furniture-conditions"), admin, "{\"items\":[" + three
                        + ",{\"code\":\"DESTROYED\",\"name\":\"Lost or destroyed\",\"nameVi\":\"Mất hoặc hư hoàn toàn\",\"percent\":0}]}"))
                .andExpect(status().isNoContent());
        mvc.perform(json(put("/admin/furniture-conditions"), admin, "{\"items\":[" + three
                        + ",{\"code\":\"DESTROYED\",\"name\":\"Completely damaged\",\"nameVi\":\"Hư hoàn toàn\",\"percent\":0}]}"))
                .andExpect(status().isNoContent());
    }
}

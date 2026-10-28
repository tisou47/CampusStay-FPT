package vn.fpt.campusstay;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.ADMIN;
import static vn.fpt.campusstay.TestAuth.MANAGER_A;
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
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Admin › System › Demo data on a demo server ({@code DEMO_TOOLS=true}). The test seed is not the base data, so the
 * reset itself stops at its base-data check; the stages are loaded and checked against the base data locally.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@TestPropertySource(properties = "campusstay.demo.tools=true")
class DemoResetIT {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    /** TC-CFG-026: the Admin sees the stages, the scenario accounts and the sample files; nobody else does. */
    @Test
    void showsStagesScenariosAndFiles() throws Exception {
        mvc.perform(get("/admin/demo").header(HttpHeaders.AUTHORIZATION, bearer(mvc, ADMIN)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enabled").value(true))
                .andExpect(jsonPath("$.stages[*].code", contains("0", "A", "B", "C")))
                .andExpect(jsonPath("$.scenarios[?(@.id == 'D05')].account", contains("manager.a@fpt.edu.vn")))
                .andExpect(jsonPath("$.scenarios[?(@.id == 'D12')].scenarioVi").isNotEmpty())
                .andExpect(jsonPath("$.files", hasSize(5)))
                .andExpect(jsonPath("$.lastReset").isEmpty());
        mvc.perform(get("/admin/demo").header(HttpHeaders.AUTHORIZATION, bearer(mvc, MANAGER_A)))
                .andExpect(status().isForbidden());
        mvc.perform(post("/admin/demo/reset").header(HttpHeaders.AUTHORIZATION, bearer(mvc, STUDENT))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"stage\":\"A\",\"confirm\":\"RESET\"}"))
                .andExpect(status().isForbidden());
    }

    /** TC-CFG-027: a reset needs a known stage and RESET typed, and refuses a database without the base data. */
    @Test
    void resetChecksStageConfirmationAndBaseData() throws Exception {
        String admin = bearer(mvc, ADMIN);
        long terms = jdbc.sql("SELECT count(*) FROM cfg_term").query(Long.class).single();
        mvc.perform(post("/admin/demo/reset").header(HttpHeaders.AUTHORIZATION, admin)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"stage\":\"D\",\"confirm\":\"reset\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.stage").value("Choose stage 0, A, B or C."))
                .andExpect(jsonPath("$.details.fields.confirm").value("Type RESET to confirm."));
        mvc.perform(post("/admin/demo/reset").header(HttpHeaders.AUTHORIZATION, admin)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"stage\":\"0\",\"confirm\":\"RESET\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("DEMO_BASE_DATA_MISSING"));
        org.junit.jupiter.api.Assertions.assertEquals(terms,
                jdbc.sql("SELECT count(*) FROM cfg_term").query(Long.class).single());
    }

    /** TC-CFG-028: the sample files download as CSV with a byte-order mark; an unknown one is 404. */
    @Test
    void downloadsSampleFiles() throws Exception {
        String admin = bearer(mvc, ADMIN);
        mvc.perform(get("/admin/demo/files/student-list").header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, startsWith("attachment; filename=\"demo-student-list.csv\"")))
                .andExpect(content().string(startsWith("﻿student_code,full_name,email")));
        mvc.perform(get("/admin/demo/files/rooms-left-out").header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(status().isOk())
                .andExpect(content().string(startsWith("﻿Mã phòng\r\nA-509")));
        mvc.perform(get("/admin/demo/files/payroll").header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(status().isNotFound());
    }
}

package vn.fpt.campusstay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.MANAGER_A;
import static vn.fpt.campusstay.TestAuth.STAFF_A;
import static vn.fpt.campusstay.TestAuth.bearer;

import vn.fpt.campusstay.common.file.SheetFile;
import vn.fpt.campusstay.common.file.XlsxFile;
import java.io.ByteArrayOutputStream;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import com.jayway.jsonpath.JsonPath;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/** Manager › Import student list: template, preview, confirm, files (D-07, spec §6.2). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class) // the preview runs before the same file is applied
class StudentImportIT {

    private static final String HEADER = "student_code,full_name,email,gender,date_of_birth,major,cohort,semester,hometown,"
            + "region,enrollment_status,priority_groups";

    /** One line per outcome: New, Update, Unchanged, verification, errors, a fictional student's code. */
    private static final String CSV = HEADER + "\n"
            + "SE209001,Nguyen Van Moi,ittest.new1@fpt.edu.vn,Male,2005-01-02,SE,K20,3,Hue,CENTRAL,Enrolled,FIRST_YEAR\n"
            + "SE209002,Tran Van Cu,ittest.old2@fpt.edu.vn,M,2004-05-06,SE,K20,5,Hue,CENTRAL,Enrolled,\n"
            + "SE209003,Le Thi Giu,ittest.old3@fpt.edu.vn,F,2004-05-06,SE,K19,5,Hue,CENTRAL,Enrolled,\n"
            + "SE209004,Pham Thi Cho,ittest.pending4@fpt.edu.vn,Female,2005-01-02,AI,K20,3,Hue,CENTRAL,Enrolled,\n"
            + "SE209010,Bad Row,not-an-email,Robot,2005-01-02,SE,K20,3,Hue,CENTRAL,Enrolled,\n"
            + "SE209001,\"Duplicate, Line\",ittest.dup@fpt.edu.vn,Male,2005-01-02,SE,K20,3,Hue,CENTRAL,Enrolled,\n"
            + "SE190020,Real Owner,ittest.new8@fpt.edu.vn,Female,2005-01-02,SE,K19,5,Hue,CENTRAL,Enrolled,\n"
            + "SE209011,Email Taken,ittest.pending4@fpt.edu.vn,Male,2005-01-02,SE,K20,3,Hue,CENTRAL,Enrolled,\n"
            + "SE209005,Other Address,ittest.someone.else@fpt.edu.vn,Male,2005-01-02,SE,K20,3,Hue,CENTRAL,Enrolled,\n";

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    /** Real students already known: two imported, two who signed up and wait, one the files never list. */
    @BeforeEach
    void accounts() {
        account("ittest.old2@fpt.edu.vn", "Tran Van Cu", "SE209002", "M", "K19", "VERIFIED", "IMPORT");
        account("ittest.old3@fpt.edu.vn", "Le Thi Giu", "SE209003", "F", "K19", "VERIFIED", "IMPORT");
        account("ittest.pending4@fpt.edu.vn", "Pham Thi Cho", "SE209004", "F", "K20", "PENDING", "SIGN_UP");
        account("ittest.p5@fpt.edu.vn", "Typed Code", "SE209005", "M", "K20", "PENDING", "SIGN_UP");
        account("ittest.left6@fpt.edu.vn", "Da Nghi", "SE209006", "M", "K19", "VERIFIED", "IMPORT");
    }

    private void account(String email, String name, String code, String gender, String cohort, String verification,
            String source) {
        jdbc.sql("INSERT INTO auth_user (email, display_name, role, status) VALUES (:e, :n, 'STUDENT', 'INVITED') ON CONFLICT DO NOTHING")
                .param("e", email).param("n", name).update();
        jdbc.sql("""
                INSERT INTO auth_student (user_id, student_code, gender, date_of_birth, major, cohort, semester_no, hometown,
                                          region, verification, source)
                SELECT id, :code, :gender, DATE '2004-05-06', 'SE', :cohort, 5, 'Hue', 'CENTRAL', :v, :s FROM auth_user WHERE email = :e
                ON CONFLICT (user_id) DO NOTHING
                """).param("code", code).param("gender", gender).param("cohort", cohort).param("v", verification)
                .param("s", source).param("e", email).update();
    }

    private ResultActions upload(String auth, String name, byte[] bytes) throws Exception {
        return mvc.perform(multipart("/student-imports").file(new MockMultipartFile("file", name, "text/csv", bytes))
                .header(HttpHeaders.AUTHORIZATION, auth));
    }

    private String row(int line) {
        return "$.rows.items[?(@.line == " + line + ")]";
    }

    private String enrollment(String code) {
        return jdbc.sql("SELECT enrollment_status FROM auth_student WHERE student_code = :c").param("c", code)
                .query(String.class).single();
    }

    /**
     * TC-AUTH-046: the template names the columns; an upload is previewed line by line (New, Update, Unchanged, Error
     * with the reason) and counts the students the file leaves out; nothing changes before the confirmation.
     */
    @Test
    @Order(1)
    void previewsTheFile() throws Exception {
        String manager = bearer(mvc, MANAGER_A);
        byte[] template = mvc.perform(get("/student-imports/template").header(HttpHeaders.AUTHORIZATION, manager))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, containsString("student-list-template.xlsx")))
                .andReturn().getResponse().getContentAsByteArray();
        assertThat(String.join(",", SheetFile.rows("template.xlsx", template).getFirst())).isEqualTo(HEADER);
        upload(manager, "list.csv", CSV.getBytes(StandardCharsets.UTF_8))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("Preview"))
                .andExpect(jsonPath("$.counts.created").value(2))
                .andExpect(jsonPath("$.counts.updated").value(2))
                .andExpect(jsonPath("$.counts.unchanged").value(1))
                .andExpect(jsonPath("$.counts.errors").value(4))
                .andExpect(jsonPath("$.missing").value(greaterThanOrEqualTo(1)))
                .andExpect(jsonPath(row(2) + ".outcome").value(hasItem("New")))
                .andExpect(jsonPath(row(3) + ".outcome").value(hasItem("Update")))
                .andExpect(jsonPath(row(3) + ".changes[*]").value(hasItem("cohort")))
                .andExpect(jsonPath(row(4) + ".outcome").value(hasItem("Unchanged")))
                .andExpect(jsonPath(row(5) + ".changes[*]").value(hasItem("verification")))
                .andExpect(jsonPath(row(6) + ".message").value(hasItem(containsString("The email is missing or not valid."))))
                .andExpect(jsonPath(row(6) + ".message").value(hasItem(containsString("The gender must be Male or Female."))))
                .andExpect(jsonPath(row(7) + ".message").value(hasItem("Student code SE209001 is already on line 2.")))
                .andExpect(jsonPath(row(7) + ".name").value(hasItem("Duplicate, Line")))
                .andExpect(jsonPath(row(8) + ".outcome").value(hasItem("New")))
                .andExpect(jsonPath(row(9) + ".message").value(hasItem("This email belongs to another account.")))
                .andExpect(jsonPath(row(10) + ".message").value(hasItem(containsString("waiting for verification with another email"))));
        assertThat(jdbc.sql("SELECT count(*) FROM auth_student WHERE student_code = 'SE209001'").query(Long.class).single())
                .isZero();
    }

    /**
     * TC-AUTH-047: confirming creates and updates the accounts, verifies the waiting one that matches, gives a
     * fictional student's code to the real student, marks real students missing from the file Not enrolled (never
     * fictional ones), is written to the Audit Log and cannot run twice.
     */
    @Test
    @Order(2)
    void confirmAppliesTheFile() throws Exception {
        String manager = bearer(mvc, MANAGER_A);
        String id = JsonPath.read(upload(manager, "list.csv", CSV.getBytes(StandardCharsets.UTF_8))
                .andReturn().getResponse().getContentAsString(), "$.id");
        mvc.perform(post("/student-imports/" + id + "/confirm").header(HttpHeaders.AUTHORIZATION, manager)
                .contentType(MediaType.APPLICATION_JSON).content("{\"markMissingNotEnrolled\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("Applied"))
                .andExpect(jsonPath("$.result.created").value(2))
                .andExpect(jsonPath("$.result.updated").value(2))
                .andExpect(jsonPath("$.result.verified").value(1))
                .andExpect(jsonPath("$.result.errors").value(4))
                .andExpect(jsonPath("$.result.markedNotEnrolled").value(greaterThanOrEqualTo(1)));
        assertThat(jdbc.sql("""
                SELECT u.status || ' ' || s.verification || ' ' || s.source || ' ' || u.demo || ' ' || s.cohort
                FROM auth_student s JOIN auth_user u ON u.id = s.user_id WHERE s.student_code = 'SE209001'
                """).query(String.class).single()).isEqualTo("INVITED VERIFIED IMPORT false K20");
        assertThat(jdbc.sql("SELECT cohort FROM auth_student WHERE student_code = 'SE209002'").query(String.class).single())
                .isEqualTo("K20");
        assertThat(jdbc.sql("""
                SELECT count(*) FROM auth_student s JOIN ntf_notification n ON n.user_id = s.user_id
                WHERE s.student_code = 'SE209004' AND s.verification = 'VERIFIED' AND n.event_key = 'STUDENT_VERIFIED'
                """).query(Long.class).single()).isEqualTo(1);
        assertThat(jdbc.sql("""
                SELECT s.student_code FROM auth_student s JOIN auth_user u ON u.id = s.user_id
                WHERE u.email = 'se190020@student.campusstay.test'
                """).query(String.class).single()).isEqualTo("DEMO-SE190020");
        assertThat(jdbc.sql("""
                SELECT u.email FROM auth_student s JOIN auth_user u ON u.id = s.user_id WHERE s.student_code = 'SE190020'
                """).query(String.class).single()).isEqualTo("ittest.new8@fpt.edu.vn");
        assertThat(enrollment("SE209006")).isEqualTo("NOT_ENROLLED");
        assertThat(enrollment("SE209005")).isEqualTo("ENROLLED"); // listed, with an error: not missing
        assertThat(enrollment("SE190030")).isEqualTo("ENROLLED"); // fictional students are never marked
        assertThat(jdbc.sql("SELECT count(*) FROM shared_audit_log WHERE action = 'STUDENT_LIST_IMPORTED' AND object_id = :id")
                .param("id", id).query(Long.class).single()).isEqualTo(1);

        mvc.perform(post("/student-imports/" + id + "/confirm").header(HttpHeaders.AUTHORIZATION, manager))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("IMPORT_APPLIED"));
        mvc.perform(get("/student-imports").header(HttpHeaders.AUTHORIZATION, manager))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[?(@.id == '" + id + "')].status").value(hasItem("Applied")));
    }

    /**
     * TC-AUTH-048: an XLSX workbook is read like a CSV (shared strings, dates as day numbers, Vietnamese headers); a
     * file without a required column or not in UTF-8 is refused; lines can be filtered; Staff may not import.
     */
    @Test
    @Order(3)
    void readsWorkbooksAndRefusesBadFiles() throws Exception {
        String manager = bearer(mvc, MANAGER_A);
        String id = JsonPath.read(upload(manager, "list.xlsx", workbook()).andExpect(status().isOk())
                .andExpect(jsonPath("$.counts.created").value(1))
                .andExpect(jsonPath("$.rows.items[0].studentCode").value("SA219050"))
                .andExpect(jsonPath("$.rows.items[0].name").value("Đặng Thị Bảng"))
                .andExpect(jsonPath("$.rows.items[0].outcome").value("New"))
                .andExpect(jsonPath("$.fields[*]", hasItem("dateOfBirth")))
                .andReturn().getResponse().getContentAsString(), "$.id");
        assertThat(jdbc.sql("SELECT data->>'dateOfBirth' FROM auth_student_import_row WHERE import_id = :id")
                .param("id", Long.parseLong(id)).query(String.class).single()).isEqualTo("38427");
        mvc.perform(get("/student-imports/" + id).param("outcome", "Error").header(HttpHeaders.AUTHORIZATION, manager))
                .andExpect(status().isOk()).andExpect(jsonPath("$.rows.total").value(0));
        mvc.perform(get("/student-imports/" + id).param("outcome", "Maybe").header(HttpHeaders.AUTHORIZATION, manager))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/student-imports/999999").header(HttpHeaders.AUTHORIZATION, manager))
                .andExpect(status().isNotFound());

        upload(manager, "list.csv", "student_code,full_name\nSE209020,Thieu Cot\n".getBytes(StandardCharsets.UTF_8))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.file").value(containsString("has no column email")));
        upload(manager, "list.csv", (HEADER + "\nSE209021,Đặng Văn Mã,ittest.ansi@fpt.edu.vn,Nam,,SE,K21,,,,,\n")
                .getBytes(Charset.forName("windows-1258")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.file").value("Save the file as XLSX or CSV UTF-8 and upload it again."));
        upload(bearer(mvc, STAFF_A), "list.csv", CSV.getBytes(StandardCharsets.UTF_8)).andExpect(status().isForbidden());
    }

    /**
     * TC-AUTH-056: a major is read from its code, its English label or its Vietnamese name, the other FPT majors are in
     * the list (V61), and a student-code prefix such as SS put in the major column gets an error that says so; the file
     * is the XLSX the template writer makes.
     */
    @Test
    @Order(4)
    void readsMajorsByCodeOrNameAndExplainsCodePrefixes() throws Exception {
        String manager = bearer(mvc, MANAGER_A);
        byte[] file = XlsxFile.of("Students", List.of(
                List.of(HEADER.split(",")),
                List.of("SS219061", "Ngo Thi Kinh", "ittest.major1@fpt.edu.vn", "Female", "", "Quản trị kinh doanh", "K21", "", "", "", "", ""),
                List.of("SA219062", "Ho Van Han", "ittest.major2@fpt.edu.vn", "Male", "", "KR", "K21", "", "", "", "", ""),
                List.of("SS219063", "Vu Thi Ma", "ittest.major3@fpt.edu.vn", "Female", "", "SS", "K21", "", "", "", "", "")));
        upload(manager, "majors.xlsx", file)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.counts.created").value(2))
                .andExpect(jsonPath("$.counts.errors").value(1))
                .andExpect(jsonPath("$.rows.items[?(@.studentCode == 'SS219063')].message",
                        hasItem(containsString("SS is the start of the student code, not a major"))));
    }

    /** A one-sheet workbook with Vietnamese headers, a shared string, an inline string and a date as a day number. */
    private static byte[] workbook() throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(out)) {
            put(zip, "xl/workbook.xml", """
                    <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
                      xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
                      <sheets><sheet name="SV" sheetId="1" r:id="rId1"/></sheets></workbook>""");
            put(zip, "xl/_rels/workbook.xml.rels", """
                    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
                      <Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>""");
            put(zip, "xl/sharedStrings.xml", """
                    <sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
                      <si><t>Mã sinh viên</t></si><si><t>Họ và tên</t></si><si><r><t>Đặng Thị </t></r><r><t>Bảng</t></r></si></sst>""");
            put(zip, "xl/worksheets/sheet1.xml", """
                    <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
                      <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c>
                        <c r="C1" t="inlineStr"><is><t>Email</t></is></c><c r="D1" t="inlineStr"><is><t>Giới tính</t></is></c>
                        <c r="E1" t="inlineStr"><is><t>Ngày sinh</t></is></c><c r="F1" t="inlineStr"><is><t>Ngành</t></is></c>
                        <c r="G1" t="inlineStr"><is><t>Khóa</t></is></c></row>
                      <row r="2"><c r="A2" t="inlineStr"><is><t>SA219050</t></is></c><c r="B2" t="s"><v>2</v></c>
                        <c r="C2" t="inlineStr"><is><t>ittest.bang@fpt.edu.vn</t></is></c>
                        <c r="D2" t="inlineStr"><is><t>Nữ</t></is></c><c r="E2"><v>38427</v></c>
                        <c r="F2" t="inlineStr"><is><t>Graphic Design</t></is></c><c r="G2"><v>21</v></c></row>
                    </sheetData></worksheet>""");
        }
        return out.toByteArray();
    }

    private static void put(ZipOutputStream zip, String name, String xml) throws Exception {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(xml.getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
    }
}

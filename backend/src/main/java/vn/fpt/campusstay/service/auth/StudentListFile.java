package vn.fpt.campusstay.service.auth;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import vn.fpt.campusstay.common.file.SheetFile;
import vn.fpt.campusstay.exception.FieldErrors;

/**
 * Reads a student list file (spec §6.2): CSV (UTF-8, comma, semicolon or tab) or the first sheet of an XLSX
 * workbook. The first line names the columns, in English as in the template or in Vietnamese; each column is
 * mapped to a directory field. Only the JDK is used: an XLSX file is a zip of XML parts.
 */
final class StudentListFile {

    /** The fields of the template, in its order. */
    static final List<String> FIELDS = List.of("studentCode", "name", "email", "gender", "dateOfBirth", "major",
            "cohort", "semester", "hometown", "region", "enrollment", "priorityGroups");

    /** Fields a file must have. */
    static final List<String> REQUIRED = List.of("studentCode", "name", "email", "gender", "major", "cohort");

    /** Template column names (the CSV header), by field. */
    static final Map<String, String> HEADERS = new LinkedHashMap<>();

    private static final Map<String, String> ALIASES = new HashMap<>();
    static final int MAX_ROWS = 10_000;

    static {
        String[][] columns = {
                { "studentCode", "student_code", "studentcode", "code", "mssv", "masinhvien", "masv" },
                { "name", "full_name", "fullname", "name", "hoten", "hovaten" },
                { "email", "email", "mail" },
                { "gender", "gender", "sex", "gioitinh" },
                { "dateOfBirth", "date_of_birth", "dateofbirth", "dob", "birthday", "ngaysinh" },
                { "major", "major", "nganh", "chuyennganh", "nganhhoc" },
                { "cohort", "cohort", "khoa", "khoahoc" },
                { "semester", "semester", "ky", "hocky", "kyhoc" },
                { "hometown", "hometown", "quequan", "que" },
                { "region", "region", "vung", "vungmien", "mien" },
                { "enrollment", "enrollment_status", "enrollmentstatus", "enrollment", "status", "tinhtrang",
                        "trangthai", "tinhtranghoc", "reason", "lydo" },
                { "priorityGroups", "priority_groups", "prioritygroups", "priority", "nhomuutien", "uutien" } };
        for (String[] c : columns) {
            HEADERS.put(c[0], c[1]);
            for (int i = 1; i < c.length; i++) {
                ALIASES.put(c[i].replace("_", ""), c[0]);
            }
        }
    }

    /** One line of the file: its number (the header is line 1) and its values by field. */
    record Line(int number, Map<String, String> values) {
    }

    /** The fields the file has and its lines (blank lines left out). */
    record Table(List<String> fields, List<Line> lines) {
    }

    private StudentListFile() {
    }

    static Table read(String fileName, byte[] bytes) {
        return read(fileName, bytes, REQUIRED);
    }

    /** @param required the fields the file must have (an enrolled list needs only the student code) */
    static Table read(String fileName, byte[] bytes, List<String> required) {
        List<List<String>> rows = SheetFile.rows(fileName, bytes);
        if (rows.isEmpty()) {
            throw FieldErrors.single("file", "The file is empty.");
        }
        List<String> header = rows.getFirst();
        Map<Integer, String> columns = new LinkedHashMap<>();
        for (int i = 0; i < header.size(); i++) {
            String field = ALIASES.get(key(header.get(i)));
            if (field != null && !columns.containsValue(field)) {
                columns.put(i, field);
            }
        }
        List<String> missing = required.stream().filter(f -> !columns.containsValue(f)).map(HEADERS::get).toList();
        if (!missing.isEmpty()) {
            throw FieldErrors.single("file", "The file has no column " + String.join(", ", missing)
                    + ". Download the template to see the columns.");
        }
        List<Line> lines = new ArrayList<>();
        for (int r = 1; r < rows.size(); r++) {
            List<String> row = rows.get(r);
            if (row.stream().allMatch(v -> v == null || v.isBlank())) {
                continue;
            }
            Map<String, String> values = new LinkedHashMap<>();
            columns.forEach((index, field) -> {
                String v = index < row.size() ? row.get(index) : null;
                values.put(field, v == null ? "" : v.strip());
            });
            lines.add(new Line(r + 1, values));
            if (lines.size() > MAX_ROWS) {
                throw FieldErrors.single("file", "The file has more than 10,000 students. Split it into smaller files.");
            }
        }
        if (lines.isEmpty()) {
            throw FieldErrors.single("file", "The file has no students below its header line.");
        }
        List<String> fields = FIELDS.stream().filter(columns::containsValue).toList();
        return new Table(fields, lines);
    }

    /** A header for matching: see {@link SheetFile#key}. */
    static String key(String header) {
        return SheetFile.key(header);
    }
}

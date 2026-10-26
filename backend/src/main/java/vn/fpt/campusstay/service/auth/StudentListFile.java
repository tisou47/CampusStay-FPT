package vn.fpt.campusstay.service.auth;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import javax.xml.stream.XMLInputFactory;
import javax.xml.stream.XMLStreamConstants;
import javax.xml.stream.XMLStreamException;
import javax.xml.stream.XMLStreamReader;

import vn.fpt.campusstay.exception.ApiException;
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
    private static final long MAX_PART_BYTES = 50L * 1024 * 1024;

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
        boolean xlsx = bytes.length > 4 && bytes[0] == 'P' && bytes[1] == 'K' && bytes[2] == 3 && bytes[3] == 4;
        List<List<String>> rows;
        if (xlsx) {
            rows = xlsx(bytes);
        } else if (fileName != null && fileName.toLowerCase(Locale.ROOT).endsWith(".xls")) {
            throw FieldErrors.single("file", "Save the file as XLSX or CSV UTF-8 and upload it again.");
        } else {
            rows = csv(bytes);
        }
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

    /** A header for matching: lower case, without accents, spaces or punctuation ("Họ và tên" → "hovaten"). */
    static String key(String header) {
        if (header == null) {
            return "";
        }
        String plain = Normalizer.normalize(header.replace('đ', 'd').replace('Đ', 'D'), Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "");
        return plain.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
    }

    // ---------- CSV ----------

    private static List<List<String>> csv(byte[] bytes) {
        String text;
        try {
            text = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();
        } catch (CharacterCodingException e) {
            throw FieldErrors.single("file", "Save the file as XLSX or CSV UTF-8 and upload it again.");
        }
        if (text.startsWith("﻿")) {
            text = text.substring(1);
        }
        int lineEnd = text.indexOf('\n');
        String first = lineEnd < 0 ? text : text.substring(0, lineEnd);
        char separator = count(first, ';') > count(first, ',') ? ';' : count(first, '\t') > count(first, ',') ? '\t' : ',';
        List<List<String>> rows = new ArrayList<>();
        List<String> row = new ArrayList<>();
        StringBuilder cell = new StringBuilder();
        boolean quoted = false;
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (quoted) {
                if (c == '"') {
                    if (i + 1 < text.length() && text.charAt(i + 1) == '"') {
                        cell.append('"');
                        i++;
                    } else {
                        quoted = false;
                    }
                } else {
                    cell.append(c);
                }
            } else if (c == '"' && cell.isEmpty()) {
                quoted = true;
            } else if (c == separator) {
                row.add(cell.toString());
                cell.setLength(0);
            } else if (c == '\n' || c == '\r') {
                if (c == '\r' && i + 1 < text.length() && text.charAt(i + 1) == '\n') {
                    i++;
                }
                row.add(cell.toString());
                cell.setLength(0);
                rows.add(row);
                row = new ArrayList<>();
            } else {
                cell.append(c);
            }
        }
        if (!cell.isEmpty() || !row.isEmpty()) {
            row.add(cell.toString());
            rows.add(row);
        }
        return rows;
    }

    private static int count(String s, char c) {
        return (int) s.chars().filter(x -> x == c).count();
    }

    // ---------- XLSX ----------

    private static List<List<String>> xlsx(byte[] bytes) {
        Map<String, byte[]> parts = new HashMap<>();
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(bytes))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                String name = entry.getName();
                if (name.equals("xl/workbook.xml") || name.equals("xl/_rels/workbook.xml.rels")
                        || name.equals("xl/sharedStrings.xml") || name.startsWith("xl/worksheets/sheet")) {
                    parts.put(name, readLimited(zip));
                }
            }
        } catch (IOException e) {
            throw FieldErrors.single("file", "The file could not be read. Save it as XLSX or CSV UTF-8 and try again.");
        }
        try {
            String sheet = firstSheet(parts);
            if (sheet == null || !parts.containsKey(sheet)) {
                throw FieldErrors.single("file", "The workbook has no sheet.");
            }
            List<String> shared = parts.containsKey("xl/sharedStrings.xml") ? sharedStrings(parts.get("xl/sharedStrings.xml"))
                    : List.of();
            return sheetRows(parts.get(sheet), shared);
        } catch (XMLStreamException | RuntimeException e) {
            if (e instanceof ApiException api) {
                throw api;
            }
            throw FieldErrors.single("file", "The file could not be read. Save it as XLSX or CSV UTF-8 and try again.");
        }
    }

    private static byte[] readLimited(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        long total = 0;
        int n;
        while ((n = in.read(buffer)) > 0) {
            total += n;
            if (total > MAX_PART_BYTES) {
                throw new IOException("Part too large");
            }
            out.write(buffer, 0, n);
        }
        return out.toByteArray();
    }

    private static XMLStreamReader xml(byte[] bytes) throws XMLStreamException {
        XMLInputFactory factory = XMLInputFactory.newFactory();
        factory.setProperty(XMLInputFactory.SUPPORT_DTD, false);
        factory.setProperty(XMLInputFactory.IS_SUPPORTING_EXTERNAL_ENTITIES, false);
        return factory.createXMLStreamReader(new ByteArrayInputStream(bytes));
    }

    /** The part of the workbook's first sheet, through the workbook relations. */
    private static String firstSheet(Map<String, byte[]> parts) throws XMLStreamException {
        String relId = null;
        if (parts.containsKey("xl/workbook.xml")) {
            XMLStreamReader r = xml(parts.get("xl/workbook.xml"));
            while (r.hasNext() && relId == null) {
                if (r.next() == XMLStreamConstants.START_ELEMENT && r.getLocalName().equals("sheet")) {
                    for (int i = 0; i < r.getAttributeCount(); i++) {
                        if (r.getAttributeLocalName(i).equals("id")) {
                            relId = r.getAttributeValue(i);
                        }
                    }
                }
            }
        }
        if (relId != null && parts.containsKey("xl/_rels/workbook.xml.rels")) {
            XMLStreamReader r = xml(parts.get("xl/_rels/workbook.xml.rels"));
            while (r.hasNext()) {
                if (r.next() == XMLStreamConstants.START_ELEMENT && r.getLocalName().equals("Relationship")
                        && relId.equals(r.getAttributeValue(null, "Id"))) {
                    String target = r.getAttributeValue(null, "Target");
                    return target.startsWith("/") ? target.substring(1) : "xl/" + target;
                }
            }
        }
        return parts.keySet().stream().filter(k -> k.startsWith("xl/worksheets/sheet")).sorted().findFirst().orElse(null);
    }

    private static List<String> sharedStrings(byte[] bytes) throws XMLStreamException {
        List<String> strings = new ArrayList<>();
        XMLStreamReader r = xml(bytes);
        StringBuilder current = null;
        boolean inText = false;
        boolean inPhonetic = false;
        while (r.hasNext()) {
            int event = r.next();
            if (event == XMLStreamConstants.START_ELEMENT) {
                switch (r.getLocalName()) {
                    case "si" -> current = new StringBuilder();
                    case "rPh" -> inPhonetic = true;
                    case "t" -> inText = !inPhonetic;
                    default -> {
                    }
                }
            } else if (event == XMLStreamConstants.CHARACTERS && inText && current != null) {
                current.append(r.getText());
            } else if (event == XMLStreamConstants.END_ELEMENT) {
                switch (r.getLocalName()) {
                    case "si" -> strings.add(current == null ? "" : current.toString());
                    case "rPh" -> inPhonetic = false;
                    case "t" -> inText = false;
                    default -> {
                    }
                }
            }
        }
        return strings;
    }

    private static List<List<String>> sheetRows(byte[] bytes, List<String> shared) throws XMLStreamException {
        List<List<String>> rows = new ArrayList<>();
        XMLStreamReader r = xml(bytes);
        List<String> row = null;
        String type = null;
        int column = -1;
        StringBuilder value = null;
        boolean inValue = false;
        while (r.hasNext()) {
            int event = r.next();
            if (event == XMLStreamConstants.START_ELEMENT) {
                switch (r.getLocalName()) {
                    case "row" -> {
                        String ref = r.getAttributeValue(null, "r");
                        int number = ref == null ? rows.size() + 1 : Integer.parseInt(ref);
                        while (rows.size() < number - 1) {
                            rows.add(new ArrayList<>());
                        }
                        row = new ArrayList<>();
                        column = -1;
                    }
                    case "c" -> {
                        type = r.getAttributeValue(null, "t");
                        String ref = r.getAttributeValue(null, "r");
                        column = ref == null ? column + 1 : columnIndex(ref);
                        value = new StringBuilder();
                    }
                    case "v", "t" -> inValue = value != null;
                    default -> {
                    }
                }
            } else if (event == XMLStreamConstants.CHARACTERS && inValue) {
                value.append(r.getText());
            } else if (event == XMLStreamConstants.END_ELEMENT) {
                switch (r.getLocalName()) {
                    case "v", "t" -> inValue = false;
                    case "c" -> {
                        if (row != null && value != null) {
                            while (row.size() < column) {
                                row.add("");
                            }
                            row.add(cell(type, value.toString(), shared));
                        }
                        value = null;
                    }
                    case "row" -> {
                        if (row != null) {
                            rows.add(row);
                        }
                        row = null;
                    }
                    default -> {
                    }
                }
            }
        }
        return rows;
    }

    private static String cell(String type, String raw, List<String> shared) {
        if ("s".equals(type)) {
            int index = Integer.parseInt(raw.trim());
            return index >= 0 && index < shared.size() ? shared.get(index) : "";
        }
        if ("b".equals(type)) {
            return "1".equals(raw.trim()) ? "TRUE" : "FALSE";
        }
        if (type == null || "n".equals(type)) {
            String v = raw.trim();
            // Whole numbers come as "4" or "4.0"; Excel dates come as day numbers ("38427").
            return v.endsWith(".0") ? v.substring(0, v.length() - 2) : v;
        }
        return raw;
    }

    /** {@code C7} → 2. */
    private static int columnIndex(String ref) {
        int index = 0;
        for (char c : ref.toCharArray()) {
            if (c < 'A' || c > 'Z') {
                break;
            }
            index = index * 26 + (c - 'A' + 1);
        }
        return index - 1;
    }
}

package vn.fpt.campusstay.common.file;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.junit.jupiter.api.Test;

import vn.fpt.campusstay.exception.ApiException;

/** BE-2ND-07: an uploaded workbook is read by its first sheet only, within 50 MB unpacked (TC-AUTH-099). */
class SheetFileTest {

    private static final String WORKBOOK = """
            <workbook xmlns:r="r"><sheets><sheet name="List" sheetId="1" r:id="rId1"/></sheets></workbook>""";
    private static final String RELS = """
            <Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>""";
    private static final String SHEET = """
            <worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>student_code</t></is></c></row>
            <row r="2"><c r="A2" t="inlineStr"><is><t>SE190001</t></is></c></row></sheetData></worksheet>""";

    private static byte[] zip(Map<String, byte[]> parts) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(out)) {
            for (Map.Entry<String, byte[]> p : parts.entrySet()) {
                zip.putNextEntry(new ZipEntry(p.getKey()));
                zip.write(p.getValue());
                zip.closeEntry();
            }
        }
        return out.toByteArray();
    }

    private static Map<String, byte[]> workbook() {
        Map<String, byte[]> parts = new LinkedHashMap<>();
        parts.put("xl/workbook.xml", WORKBOOK.getBytes(StandardCharsets.UTF_8));
        parts.put("xl/_rels/workbook.xml.rels", RELS.getBytes(StandardCharsets.UTF_8));
        parts.put("xl/worksheets/sheet1.xml", SHEET.getBytes(StandardCharsets.UTF_8));
        return parts;
    }

    /** Padding that compresses to almost nothing: a "zip bomb" part of {@code mb} MB. */
    private static byte[] padded(String start, int mb, String end) {
        byte[] spaces = new byte[mb * 1024 * 1024];
        java.util.Arrays.fill(spaces, (byte) ' ');
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.writeBytes(start.getBytes(StandardCharsets.UTF_8));
        out.writeBytes(spaces);
        out.writeBytes(end.getBytes(StandardCharsets.UTF_8));
        return out.toByteArray();
    }

    @Test
    void readsOnlyTheSheetTheWorkbookNames() throws IOException {
        Map<String, byte[]> parts = workbook();
        parts.put("xl/worksheets/sheet9.xml", padded("<worksheet>", 60, "</worksheet>"));
        assertThat(SheetFile.rows("list.xlsx", zip(parts))).containsExactly(java.util.List.of("student_code"),
                java.util.List.of("SE190001"));
    }

    @Test
    void refusesAWorkbookAbove50MbUnpacked() throws IOException {
        Map<String, byte[]> parts = workbook();
        parts.put("xl/sharedStrings.xml", padded("<sst>", 30, "</sst>"));
        parts.put("xl/worksheets/sheet1.xml", padded("<worksheet><sheetData>", 30, "</sheetData></worksheet>"));
        byte[] file = zip(parts);
        assertThatThrownBy(() -> SheetFile.rows("list.xlsx", file))
                .satisfies(e -> assertThat(((ApiException) e).code()).isEqualTo("FILE_TOO_LARGE"));
    }
}

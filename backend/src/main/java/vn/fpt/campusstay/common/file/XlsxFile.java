package vn.fpt.campusstay.common.file;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/**
 * Writes rows of text as a one-sheet XLSX workbook (the counterpart of {@link SheetFile}). A template for people to
 * fill in is given as XLSX rather than CSV: Excel set to Vietnamese reads a CSV with ";" between columns, so a comma
 * CSV opens as one column. Only the JDK is used: a zip of XML parts, every cell an inline string, a bold first row.
 */
public final class XlsxFile {

    private XlsxFile() {
    }

    /** The first row is the header. */
    public static byte[] of(String sheetName, List<List<String>> rows) {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(bytes)) {
            part(zip, "[Content_Types].xml", """
                    <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\
                    <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\
                    <Default Extension="xml" ContentType="application/xml"/>\
                    <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>\
                    <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>\
                    <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>\
                    </Types>""");
            part(zip, "_rels/.rels", """
                    <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\
                    <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>\
                    </Relationships>""");
            part(zip, "xl/workbook.xml", """
                    <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                    <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" \
                    xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">\
                    <sheets><sheet name="%s" sheetId="1" r:id="rId1"/></sheets></workbook>""".formatted(escape(sheetName)));
            part(zip, "xl/_rels/workbook.xml.rels", """
                    <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\
                    <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>\
                    <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>\
                    </Relationships>""");
            part(zip, "xl/styles.xml", """
                    <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                    <styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">\
                    <fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>\
                    <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>\
                    <borders count="1"><border/></borders>\
                    <cellStyleXfs count="1"><xf/></cellStyleXfs>\
                    <cellXfs count="2"><xf/><xf fontId="1" applyFont="1"/></cellXfs>\
                    </styleSheet>""");
            part(zip, "xl/worksheets/sheet1.xml", sheet(rows));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return bytes.toByteArray();
    }

    private static String sheet(List<List<String>> rows) {
        StringBuilder xml = new StringBuilder("""
                <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">""");
        int width = rows.isEmpty() ? 0 : rows.getFirst().size();
        if (width > 0) {
            xml.append("<cols><col min=\"1\" max=\"").append(width).append("\" width=\"20\" customWidth=\"1\"/></cols>");
        }
        xml.append("<sheetData>");
        for (int r = 0; r < rows.size(); r++) {
            xml.append("<row r=\"").append(r + 1).append("\">");
            List<String> row = rows.get(r);
            for (int c = 0; c < row.size(); c++) {
                xml.append("<c r=\"").append(column(c)).append(r + 1).append("\" t=\"inlineStr\"")
                        .append(r == 0 ? " s=\"1\"" : "").append("><is><t xml:space=\"preserve\">")
                        .append(escape(row.get(c) == null ? "" : row.get(c))).append("</t></is></c>");
            }
            xml.append("</row>");
        }
        return xml.append("</sheetData></worksheet>").toString();
    }

    /** 0 → A, 26 → AA. */
    private static String column(int index) {
        StringBuilder name = new StringBuilder();
        for (int i = index + 1; i > 0; i = (i - 1) / 26) {
            name.insert(0, (char) ('A' + (i - 1) % 26));
        }
        return name.toString();
    }

    private static String escape(String text) {
        return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }

    private static void part(ZipOutputStream zip, String name, String content) throws IOException {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(content.getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
    }
}

package vn.fpt.campusstay.service.billing;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;

/**
 * A one-page PDF receipt written without a PDF library. It uses the standard
 * Helvetica fonts, which have no Vietnamese glyphs, so text is printed without
 * diacritics ("Nguyễn" → "Nguyen").
 */
final class ReceiptPdf {

    record Row(String label, String value) {
    }

    private ReceiptPdf() {
    }

    static byte[] render(String title, List<Row> rows, String footer) {
        StringBuilder content = new StringBuilder();
        content.append("BT /F2 20 Tf 56 770 Td (").append(text("CampusStay FPT")).append(") Tj ET\n");
        content.append("BT /F1 12 Tf 56 748 Td (").append(text(title)).append(") Tj ET\n");
        content.append("0.8 G 56 732 m 539 732 l S 0 G\n");
        int y = 704;
        for (Row row : rows) {
            content.append("BT /F1 11 Tf 56 ").append(y).append(" Td (").append(text(row.label())).append(") Tj ET\n");
            content.append("BT /F2 11 Tf 220 ").append(y).append(" Td (").append(text(row.value())).append(") Tj ET\n");
            y -= 22;
        }
        content.append("BT /F1 9 Tf 56 ").append(y - 20).append(" Td (").append(text(footer)).append(") Tj ET\n");
        byte[] stream = content.toString().getBytes(StandardCharsets.ISO_8859_1);

        List<byte[]> objects = new ArrayList<>();
        objects.add(ascii("<< /Type /Catalog /Pages 2 0 R >>"));
        objects.add(ascii("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"));
        objects.add(ascii("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R "
                + "/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>"));
        ByteArrayOutputStream contents = new ByteArrayOutputStream();
        contents.writeBytes(ascii("<< /Length " + stream.length + " >>\nstream\n"));
        contents.writeBytes(stream);
        contents.writeBytes(ascii("endstream"));
        objects.add(contents.toByteArray());
        objects.add(ascii("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"));
        objects.add(ascii("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"));

        ByteArrayOutputStream pdf = new ByteArrayOutputStream();
        pdf.writeBytes(ascii("%PDF-1.4\n"));
        List<Integer> offsets = new ArrayList<>();
        for (int i = 0; i < objects.size(); i++) {
            offsets.add(pdf.size());
            pdf.writeBytes(ascii((i + 1) + " 0 obj\n"));
            pdf.writeBytes(objects.get(i));
            pdf.writeBytes(ascii("\nendobj\n"));
        }
        int xref = pdf.size();
        StringBuilder table = new StringBuilder("xref\n0 " + (objects.size() + 1) + "\n0000000000 65535 f \n");
        offsets.forEach(offset -> table.append(String.format("%010d 00000 n \n", offset)));
        table.append("trailer\n<< /Size ").append(objects.size() + 1).append(" /Root 1 0 R >>\nstartxref\n")
                .append(xref).append("\n%%EOF\n");
        pdf.writeBytes(ascii(table.toString()));
        return pdf.toByteArray();
    }

    /** Removes diacritics, keeps printable ASCII and escapes PDF string delimiters. */
    static String text(String value) {
        String plain = Normalizer.normalize(value == null ? "" : value, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "").replace('đ', 'd').replace('Đ', 'D');
        StringBuilder out = new StringBuilder();
        for (char c : plain.toCharArray()) {
            if (c == '(' || c == ')' || c == '\\') {
                out.append('\\').append(c);
            } else if (c >= 32 && c < 127) {
                out.append(c);
            } else if (c == '·' || c == '–') {
                out.append('-');
            }
        }
        return out.toString();
    }

    private static byte[] ascii(String s) {
        return s.getBytes(StandardCharsets.US_ASCII);
    }
}

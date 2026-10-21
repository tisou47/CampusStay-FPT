package vn.fpt.campusstay.rpt.internal;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStreamWriter;
import java.io.UncheckedIOException;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;
import java.util.function.Function;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.shared.audit.AuditLog;
import vn.fpt.campusstay.shared.error.ApiException;
import vn.fpt.campusstay.shared.export.ReportExport;
import vn.fpt.campusstay.shared.time.TimeConfig;

/**
 * {@code GET /exports/{report}}: the screens' exports (each module's {@link ReportExport})
 * and RPT's reports, written as CSV (UTF-8 with a byte-order mark, so Excel opens it
 * with Vietnamese names intact). Every export is written to the Audit Log.
 */
@Service
public class ExportService {

    public record File(String fileName, byte[] content) {
    }

    private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")
            .withZone(TimeConfig.CAMPUS_ZONE);

    private final Map<String, Function<Map<String, String>, ReportExport.Table>> reports = new HashMap<>();
    private final AuditLog audit;

    public ExportService(List<ReportExport> exports, ReportService reportService, AuditLog audit) {
        this.audit = audit;
        exports.forEach(e -> reports.put(e.report(), e::export));
        reports.put("occupancy", f -> reportService.occupancyTable(ReportExport.longFilter(f, "termId"), f.get("block")));
        reports.put("financial", f -> reportService.financialTable(ReportExport.longFilter(f, "termId"), f.get("block")));
        reports.put("block-occupancy", f -> reportService.blockOccupancy(ReportExport.longFilter(f, "termId"), f.get("block")));
        reports.put("block-collections",
                f -> reportService.blockCollections(ReportExport.longFilter(f, "termId"), f.get("block")));
        reports.put("block-maintenance",
                f -> reportService.blockMaintenance(ReportExport.longFilter(f, "termId"), f.get("block")));
        reports.put("block-residents", f -> reportService.blockResidents(ReportExport.longFilter(f, "termId"), f.get("block")));
    }

    /** The audit entry names the filters used, not their values: a search may hold a student code. */
    @Transactional
    public File export(String report, Map<String, String> filters) {
        Function<Map<String, String>, ReportExport.Table> source = reports.get(report);
        if (source == null) {
            throw ApiException.notFound("There is no export called " + report + ".");
        }
        ReportExport.Table table = source.apply(filters);
        audit.record("EXPORTED", AuditLog.Tone.INFO, "Export", null, report,
                Map.of("rows", table.rows().size(), "filters", String.join(", ", new TreeSet<>(filters.keySet()))));
        return new File(table.fileName() + ".csv", csv(table));
    }

    static byte[] csv(ReportExport.Table table) {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (Writer out = new OutputStreamWriter(bytes, StandardCharsets.UTF_8)) {
            out.write('﻿');
            line(out, table.header());
            for (List<Object> row : table.rows()) {
                line(out, row);
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return bytes.toByteArray();
    }

    private static void line(Writer out, List<?> cells) throws IOException {
        for (int i = 0; i < cells.size(); i++) {
            if (i > 0) {
                out.write(',');
            }
            out.write(cell(cells.get(i)));
        }
        out.write("\r\n");
    }

    /** RFC 4180 quoting; text that a spreadsheet would run as a formula is prefixed with an apostrophe. */
    static String cell(Object value) {
        if (value == null) {
            return "";
        }
        if (value instanceof Number || value instanceof Boolean) {
            return value.toString();
        }
        String text = value instanceof Instant at ? WHEN.format(at)
                : value instanceof LocalDate day ? day.toString() : value.toString();
        if (!text.isEmpty() && "=+-@\t\r".indexOf(text.charAt(0)) >= 0) {
            text = "'" + text;
        }
        if (text.contains(",") || text.contains("\"") || text.contains("\n") || text.contains("\r")) {
            text = "\"" + text.replace("\"", "\"\"") + "\"";
        }
        return text;
    }
}

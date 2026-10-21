package vn.fpt.campusstay.rpt.internal;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.Test;

import vn.fpt.campusstay.shared.export.ReportExport;

/** How exports write CSV cells (TC-RPT-009). */
class ExportServiceTest {

    /** TC-RPT-009: quoting, empty cells, campus times, and text a spreadsheet would run as a formula. */
    @Test
    void writesSafeCells() {
        assertThat(ExportService.cell(null)).isEmpty();
        assertThat(ExportService.cell(1_500_000L)).isEqualTo("1500000");
        assertThat(ExportService.cell(-5)).isEqualTo("-5");
        assertThat(ExportService.cell("Nguyen, Van \"An\"")).isEqualTo("\"Nguyen, Van \"\"An\"\"\"");
        assertThat(ExportService.cell("=HYPERLINK(\"x\")")).isEqualTo("\"'=HYPERLINK(\"\"x\"\")\"");
        assertThat(ExportService.cell("+84 90")).isEqualTo("'+84 90");
        assertThat(ExportService.cell(Instant.parse("2026-10-21T17:30:00Z"))).isEqualTo("2026-10-22 00:30");
        assertThat(ExportService.cell(LocalDate.of(2027, 1, 5))).isEqualTo("2027-01-05");

        byte[] file = ExportService.csv(new ReportExport.Table("x", List.of("Room", "Note"),
                List.of(Arrays.asList("A-101", null), Arrays.asList("A-102", "Line 1\nLine 2"))));
        assertThat(new String(file, StandardCharsets.UTF_8))
                .isEqualTo("﻿Room,Note\r\nA-101,\r\nA-102,\"Line 1\nLine 2\"\r\n");
    }
}

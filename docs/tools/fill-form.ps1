# Fills one of the Review 2 Word forms (BM01, BM03 ...) from a JSON config written by docs/reports/src/brief.mjs:
# deletes the grey guidance paragraphs, fills tables (key/value column or data rows below the header, adding or
# deleting rows), writes paragraphs after a heading, replaces texts, then saves .docx and .pdf. ASCII only (PS 5.1).
param([Parameter(Mandatory = $true)][string]$Config)

$ErrorActionPreference = 'Stop'
$cfg = Get-Content -Raw -Encoding UTF8 $Config | ConvertFrom-Json
$root = (Get-Location).Path
$out = Join-Path $root $cfg.out
$auto = -16777216   # wdColorAutomatic

$word = New-Object -ComObject Word.Application
$word.Visible = $false
try {
    $doc = $word.Documents.Open($cfg.template, $false, $true)
    $doc.SaveAs2("$out.docx", 16)

    # Tables first (their indexes do not change when paragraphs are deleted).
    foreach ($spec in $cfg.tables) {
        $t = $doc.Tables.Item([int]$spec.index)
        if ($spec.column) {
            for ($i = 0; $i -lt $spec.values.Count; $i++) {
                $cell = $t.Cell($i + 1, [int]$spec.column).Range
                $cell.Text = [string]$spec.values[$i]
                $cell.Font.Color = $auto
                $cell.Font.Italic = $false
            }
            continue
        }
        $need = $spec.rows.Count
        while ($t.Rows.Count - 1 -lt $need) { $t.Rows.Add() | Out-Null }
        while ($t.Rows.Count - 1 -gt $need) { $t.Rows.Item($t.Rows.Count).Delete() }
        for ($r = 0; $r -lt $need; $r++) {
            $row = $spec.rows[$r]
            for ($c = 0; $c -lt $row.Count; $c++) {
                $cell = $t.Cell($r + 2, $c + 1).Range
                $cell.Text = [string]$row[$c]
                $cell.Font.Color = $auto
                $cell.Font.Italic = $false
            }
        }
        # Optional: smaller font and column widths (cm) for dense tables.
        if ($spec.fontSize) {
            $t.Range.Font.Size = [double]$spec.fontSize
            $t.Range.ParagraphFormat.SpaceBefore = 0
            $t.Range.ParagraphFormat.SpaceAfter = 0
            $t.TopPadding = 1; $t.BottomPadding = 1
        }
        if ($spec.widths) {
            $t.AllowAutoFit = $false
            for ($c = 0; $c -lt $spec.widths.Count; $c++) {
                $width = [double]$spec.widths[$c] * 28.3465
                foreach ($cellObj in $t.Columns.Item($c + 1).Cells) { $cellObj.Width = $width }
            }
        }
    }

    # Grey guidance paragraphs outside the tables.
    if ($cfg.deleteColor) {
        for ($i = $doc.Paragraphs.Count; $i -ge 1; $i--) {
            $p = $doc.Paragraphs.Item($i)
            if ($p.Range.Information(12)) { continue }
            if ($p.Range.Font.Color -eq [int]$cfg.deleteColor -and $p.Range.Text.Trim().Length -gt 0) { $p.Range.Delete() | Out-Null }
        }
    }

    foreach ($para in $cfg.paragraphs) {
        foreach ($p in $doc.Paragraphs) {
            if ($p.Range.Text.Trim() -ne $para.after) { continue }
            $next = $p.Next()
            $r = $next.Range
            if ($r.Text.Trim().Length -gt 0 -or $r.Information(12)) {
                $p.Range.InsertParagraphAfter()
                $r = $p.Next().Range
            }
            $r.MoveEnd(1, -1) | Out-Null
            $r.Text = $para.text
            $r.Style = -1
            $r.Font.Color = $auto
            break
        }
    }

    foreach ($pair in $cfg.replaceText) {
        $r = $doc.Content
        $null = $r.Find.Execute($pair[0], $false, $false, $false, $false, $false, $true, 0, $false, $pair[1], 2)
    }

    $doc.Fields.Update() | Out-Null
    $doc.Save()
    # Page where Appendix A starts (sections 0-8 must fit in 4 pages).
    foreach ($p in $doc.Paragraphs) {
        if ($p.Range.Text.Trim().StartsWith('Appendix A')) { Write-Output "Appendix A starts on page $($p.Range.Information(3))"; break }
    }
    $doc.ExportAsFixedFormat("$out.pdf", 17)
    Write-Output "$($cfg.out): $($doc.ComputeStatistics(2)) pages"
    $doc.Close($true)
} finally {
    $word.Quit()
}

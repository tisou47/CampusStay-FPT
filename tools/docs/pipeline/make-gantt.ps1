# Builds a Gantt-style table document with Word (a table made cell by cell, no HTML) and saves it as a landscape PDF.
# Config (JSON, tools/docs/src/schedule.mjs): title, intro, footnote, headers (week labels), rows [{label, bold, section,
# cells: [color or empty]}], out. Needs Word. ASCII only.
param([Parameter(Mandatory = $true)][string]$Config)

$ErrorActionPreference = 'Stop'
$cfg = Get-Content -Raw -Encoding UTF8 $Config | ConvertFrom-Json
$root = (Get-Location).Path
function Rgb([string]$hex) { $h = $hex.TrimStart('#'); [Convert]::ToInt32($h.Substring(4, 2), 16) * 65536 + [Convert]::ToInt32($h.Substring(2, 2), 16) * 256 + [Convert]::ToInt32($h.Substring(0, 2), 16) }
$w = New-Object -ComObject Word.Application
$w.Visible = $false
$w.DisplayAlerts = 0
try {
    $doc = $w.Documents.Add()
    $doc.PageSetup.PaperSize = 7
    $doc.PageSetup.Orientation = 1
    $doc.PageSetup.LeftMargin = 36; $doc.PageSetup.RightMargin = 36; $doc.PageSetup.TopMargin = 36; $doc.PageSetup.BottomMargin = 36
    $sel = $w.Selection
    $sel.Font.Name = 'Calibri'
    $sel.Font.Size = 14; $sel.Font.Bold = 1; $sel.TypeText([string]$cfg.title); $sel.TypeParagraph()
    $sel.Font.Size = 9; $sel.Font.Bold = 0; $sel.TypeText([string]$cfg.intro); $sel.TypeParagraph()
    $nRows = @($cfg.rows).Count + 1
    $nCols = @($cfg.headers).Count + 1
    $t = $doc.Tables.Add($sel.Range, $nRows, $nCols)
    $t.Borders.Enable = 1
    $t.AllowAutoFit = $false
    $t.Range.Font.Size = 8
    $t.Range.ParagraphFormat.SpaceAfter = 0
    $t.Columns.Item(1).Width = 250
    for ($c = 2; $c -le $nCols; $c++) { $t.Columns.Item($c).Width = 34 }
    $t.Cell(1, 1).Range.Text = 'Milestones and phases / features'
    for ($c = 2; $c -le $nCols; $c++) { $t.Cell(1, $c).Range.Text = [string]@($cfg.headers)[$c - 2] }
    $t.Rows.Item(1).Range.Font.Bold = 1
    $t.Rows.Item(1).Shading.BackgroundPatternColor = (Rgb 'e6e6e6')
    for ($c = 2; $c -le $nCols; $c++) { $t.Cell(1, $c).Range.ParagraphFormat.Alignment = 1; $t.Cell(1, $c).Range.Font.Size = 6.5 }
    $r = 2
    foreach ($row in @($cfg.rows)) {
        $t.Cell($r, 1).Range.Text = [string]$row.label
        if ($row.bold) { $t.Cell($r, 1).Range.Font.Bold = 1 }
        if ($row.section) { $t.Rows.Item($r).Shading.BackgroundPatternColor = (Rgb 'e6e6e6') }
        for ($c = 0; $c -lt @($row.cells).Count; $c++) {
            $v = [string]@($row.cells)[$c]
            if ($v -ne '') {
                $cell = $t.Cell($r, $c + 2)
                $cell.Shading.BackgroundPatternColor = (Rgb ($v.Substring(0, 7)))
                if ($v.Length -gt 7) { $cell.Range.Text = $v.Substring(7); $cell.Range.ParagraphFormat.Alignment = 1 }
            }
        }
        $r++
    }
    $sel.EndKey(6) | Out-Null
    $sel.TypeParagraph()
    $sel.Font.Size = 8; $sel.TypeText([string]$cfg.footnote)
    $out = Join-Path $root $cfg.out
    # Word's file-name parameters are Variants by reference: a string made by Join-Path hangs PowerShell (spinning at
    # 100 % CPU), so every path is passed as a plain interpolated string, as in build-report.ps1.
    $doc.SaveAs2("$root\tools\docs\build\gantt.docx", 16)
    $doc.ExportAsFixedFormat("$out", 17)
    $doc.Close(0)
    Write-Output "gantt: $out"
} finally {
    $w.Quit()
}

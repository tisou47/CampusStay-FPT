# Builds the proposed registration form: the approved form (templates/Phieu_FA26SE260.docx) with the members filled
# in, section 3.2 replaced by the new version (HTML from docs/reports/src/Registration.md), the comment and the date
# updated, followed by the Record of Changes (BM03, filled by fill-form.ps1). Saves .docx and .pdf. ASCII only.
param([Parameter(Mandatory = $true)][string]$Config)

$ErrorActionPreference = 'Stop'
$cfg = Get-Content -Raw -Encoding UTF8 $Config | ConvertFrom-Json
$root = (Get-Location).Path
$out = Join-Path $root $cfg.out
$auto = -16777216

function Find-Paragraph($doc, $prefix) {
    foreach ($p in $doc.Paragraphs) { if ($p.Range.Text.Trim().StartsWith($prefix)) { return $p } }
    throw "Paragraph not found: $prefix"
}

$word = New-Object -ComObject Word.Application
$word.Visible = $false
try {
    $doc = $word.Documents.Open((Join-Path $root $cfg.template), $false, $true)
    $doc.SaveAs2("$out.docx", 16)

    # Members.
    $t = $doc.Tables.Item([int]$cfg.studentsTable)
    for ($r = 0; $r -lt $cfg.students.Count; $r++) {
        $row = $cfg.students[$r]
        for ($c = 0; $c -lt $row.Count; $c++) { $t.Cell($r + 2, $c + 1).Range.Text = [string]$row[$c] }
    }

    # Section 3.2 a) ... g): replaced by the new version.
    $start = Find-Paragraph $doc $cfg.startText
    $font = $start.Range.Font.Name
    $end = Find-Paragraph $doc $cfg.endText
    $from = $start.Range.Start
    $doc.Range($from, $end.Range.Start).Delete() | Out-Null
    $doc.Range($from, $from).InsertParagraphBefore()
    $doc.Range($from, $from).InsertFile((Join-Path $root $cfg.html))
    $end = Find-Paragraph $doc $cfg.endText
    $inserted = $doc.Range($from, $end.Range.Start)
    foreach ($p in $inserted.Paragraphs) {
        $name = $p.Style.NameLocal
        if ($name -eq 'Normal (Web)' -or $name -like 'HTML*') { $align = $p.Alignment; $p.Style = -1; $p.Alignment = $align }
    }
    $inserted.Font.Name = $font
    $inserted.Font.Size = 11
    $inserted.ParagraphFormat.SpaceAfter = 3

    # Other comments: the first dotted line holds the comment, the others go.
    $end = Find-Paragraph $doc $cfg.endText
    $p = $end.Next()
    $first = $true
    while ($p -and $p.Range.Text.Trim().StartsWith('....')) {
        $next = $p.Next()
        if ($first) {
            $r = $p.Range
            $r.MoveEnd(1, -1) | Out-Null
            $r.Text = $cfg.comment
            $first = $false
        } else {
            $p.Range.Delete() | Out-Null
        }
        $p = $next
    }

    foreach ($pair in $cfg.replaceText) {
        $r = $doc.Content
        $null = $r.Find.Execute($pair[0], $false, $false, $false, $false, $false, $true, 0, $false, $pair[1], 2)
    }

    # Record of Changes after a page break.
    $endRange = $doc.Content
    $endRange.Collapse(0)
    $endRange.InsertBreak(7)
    $endRange = $doc.Content
    $endRange.Collapse(0)
    $endRange.InsertFile((Join-Path $root $cfg.recordOfChanges))

    $doc.Save()
    $doc.ExportAsFixedFormat("$out.pdf", 17)
    Write-Output "$($cfg.out): $($doc.ComputeStatistics(2)) pages"
    $doc.Close($true)
} finally {
    $word.Quit()
}

# Builds one document from a school Word template and the HTML made by md2html.mjs: keeps the cover, the table of
# contents and "I. Record of Changes", replaces everything from the first Heading 1 starting with the config's
# bodyStart ("II.", or "Acknowledgement" for Report 7) with the content, embeds the diagrams, fills the Record of
# Changes, updates the table of contents and saves <Out>.docx and <Out>.pdf. Needs Microsoft Word (COM).
# Run through tools/docs/build.mjs, which writes the config:
#   powershell -File tools/docs/pipeline/build-report.ps1 -Config tools/docs/build/Report1.json
param([Parameter(Mandatory)] [string]$Config)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$cfg = Get-Content -Raw -Encoding UTF8 $Config | ConvertFrom-Json
$template = Join-Path $root $cfg.template
$html = Join-Path $root $cfg.html
$out = Join-Path $root $cfg.out
New-Item -ItemType Directory -Force (Split-Path $out) | Out-Null
Copy-Item $template "$out.docx" -Force

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
    $doc = $word.Documents.Open("$out.docx")

    # Every story: the cover's place and date sit in a text box.
    function Replace-All($text, $with) {
        foreach ($story in $doc.StoryRanges) {
            $r = $story
            while ($null -ne $r) {
                $null = $r.Find.Execute($text, $false, $false, $false, $false, $false, $true, 0, $false, $with, 2)
                $r = $r.NextStoryRange
            }
        }
        foreach ($shape in $doc.Shapes) {
            if ($shape.TextFrame.HasText) { $null = $shape.TextFrame.TextRange.Find.Execute($text, $false, $false, $false, $false, $false, $true, 0, $false, $with, 2) }
        }
    }
    # Cover: title line and place/date
    if ($cfg.coverDate) { Replace-All 'Hanoi, August 2019' $cfg.coverDate }
    foreach ($pair in $cfg.replace) { Replace-All $pair[0] $pair[1] }

    # Remove the template's guidance body: from the first Heading 1 that starts with "II." to the end.
    $start = $null
    foreach ($p in $doc.Paragraphs) {
        if ($p.Style.NameLocal -eq 'Heading 1' -and $p.Range.Text.Trim().StartsWith($cfg.bodyStart)) { $start = $p.Range.Start; break }
    }
    if ($null -eq $start) { throw "No Heading 1 starting with $($cfg.bodyStart)" }
    $doc.Range($start, $doc.Content.End).Delete() | Out-Null

    # Insert the report body.
    $end = $doc.Content.End - 1
    $doc.Range($end, $end).InsertFile($html)

    $textWidth = $doc.PageSetup.PageWidth - $doc.PageSetup.LeftMargin - $doc.PageSetup.RightMargin
    $maxHeight = $doc.PageSetup.PageHeight - $doc.PageSetup.TopMargin - $doc.PageSetup.BottomMargin - 60

    # Body paragraphs imported from HTML take the template's Normal style; headings keep Heading n.
    $bodyStart = $start
    foreach ($p in $doc.Range($bodyStart, $doc.Content.End).Paragraphs) {
        $name = $p.Style.NameLocal
        if ($name -eq 'Normal (Web)' -or $name -like 'HTML*') {
            $align = $p.Alignment
            $p.Style = -1
            $p.Alignment = $align
        }
    }

    # IDs such as UC-01, FR-AUTH-01 or TC-BIL-033 never break at their hyphens: Word's non-breaking hyphen is
    # character 30. Twice, because a match consumes the letter after the hyphen (A-B-C).
    for ($pass = 0; $pass -lt 2; $pass++) {
        $r = $doc.Range($bodyStart, $doc.Content.End)
        $null = $r.Find.Execute('([A-Z])-([A-Z0-9])', $true, $false, $true, $false, $false, $true, 0, $false, ('\1' + [char]30 + '\2'), 2)
    }

    # Tables: borders, shaded header row repeated on each page, 10 pt, fit to the page width.
    foreach ($t in $doc.Tables) {
        if ($t.Range.Start -lt $bodyStart) { continue }
        $t.Borders.Enable = $true
        $t.Range.Font.Size = 10
        $t.Range.ParagraphFormat.SpaceAfter = 0
        $t.Range.ParagraphFormat.SpaceBefore = 0
        $t.TopPadding = 2; $t.BottomPadding = 2; $t.LeftPadding = 4; $t.RightPadding = 4
        $t.Rows.Item(1).HeadingFormat = -1
        $t.Rows.Item(1).Range.Font.Bold = $true
        $t.Rows.Item(1).Shading.BackgroundPatternColor = 15853276  # light blue (BGR 0xF1E6DC)
        $t.AutoFitBehavior(1)   # fit contents first, then the window
        $t.AutoFitBehavior(2)
    }

    # Images: [[IMG:<path>|<width cm>]]
    while ($true) {
        $r = $doc.Content
        $found = $r.Find.Execute('\[\[IMG:*\]\]', $false, $false, $true)
        if (-not $found) { break }
        $spec = $r.Text.Substring(6, $r.Text.Length - 8)
        $parts = $spec.Split('|')
        $r.Text = ''
        $shape = $doc.InlineShapes.AddPicture($parts[0], $false, $true, $r)
        $w = $shape.Width; $h = $shape.Height
        $scale = 1.0
        if ($parts.Count -gt 1 -and $parts[1]) { $scale = ([double]$parts[1] * 28.3465) / $w }
        if ($w * $scale -gt $textWidth) { $scale = $textWidth / $w }
        if ($h * $scale -gt $maxHeight) { $scale = $maxHeight / $h }
        $shape.LockAspectRatio = -1
        $shape.Width = $w * $scale
        $shape.Height = $h * $scale
        $shape.Range.ParagraphFormat.Alignment = 1
    }
    while ($true) {
        $r = $doc.Content
        if (-not $r.Find.Execute('[[PAGEBREAK]]')) { break }
        $r.Text = ''
        $r.InsertBreak(7)
    }

    # Record of Changes: the first table whose first cell is "Date".
    if ($cfg.changes) {
        foreach ($t in $doc.Tables) {
            if ($t.Range.Start -ge $bodyStart) { break }
            if ($t.Cell(1, 1).Range.Text.Trim([char]13, [char]7, ' ') -ne 'Date') { continue }
            $row = 2
            foreach ($c in $cfg.changes) {
                if ($row -gt $t.Rows.Count) { $t.Rows.Add() | Out-Null }
                for ($k = 0; $k -lt $c.Count; $k++) { $t.Cell($row, $k + 1).Range.Text = $c[$k] }
                $row++
            }
            while ($t.Rows.Count -ge $row) { $t.Rows.Item($t.Rows.Count).Delete() }
            $avail = $textWidth
            $t.Columns.Item(1).Width = 68; $t.Columns.Item(2).Width = 38; $t.Columns.Item(3).Width = 100
            $t.Columns.Item(4).Width = $avail - 206
            break
        }
    }

    # Captions: [[FIGCAP:text]] / [[TABCAP:text]] become "Figure n: text" / "Table n: text" in the Caption style, n being
    # a SEQ field, so the lists of figures and tables and the numbers stay right when Word updates the fields.
    $captions = @{ Figure = 0; Table = 0 }
    foreach ($kind in @(@('FIGCAP', 'Figure'), @('TABCAP', 'Table'))) {
        while ($true) {
            $r = $doc.Content
            if (-not $r.Find.Execute("\[\[$($kind[0]):*\]\]", $false, $false, $true)) { break }
            $text = $r.Text.Substring($kind[0].Length + 3, $r.Text.Length - $kind[0].Length - 5)
            $r.Text = "$($kind[1]) #: $text"
            $p = $r.Paragraphs.Item(1)
            $p.Style = -35   # wdStyleCaption
            $p.Alignment = 1
            if ($kind[1] -eq 'Table') { $p.KeepWithNext = -1 }
            $h = $p.Range.Duplicate
            $null = $h.Find.Execute('#')
            $null = $doc.Fields.Add($h, 12, "$($kind[1]) \* ARABIC", $false)
            $captions[$kind[1]]++
        }
    }

    # Every Heading 1 (Record of Changes, Acknowledgement, II., III., …) starts a page.
    foreach ($p in $doc.Paragraphs) {
        if ($p.Style.NameLocal -eq 'Heading 1') { $p.Format.PageBreakBefore = -1 }
    }

    # List of Figures and List of Tables, each on its own page before the first Heading 1, titled like the TOC.
    $toc = $doc.TablesOfContents.Item(1)
    $tocTitle = $doc.Range([Math]::Max(0, $toc.Range.Start - 1), [Math]::Max(0, $toc.Range.Start - 1)).Paragraphs.Item(1).Style
    foreach ($kind in @(@('Figure', 'List of Figures'), @('Table', 'List of Tables'))) {
        if ($captions[$kind[0]] -eq 0) { continue }
        $h1 = $null
        foreach ($p in $doc.Paragraphs) { if ($p.Style.NameLocal -eq 'Heading 1') { $h1 = $p; break } }
        $pos = $h1.Range.Start
        $doc.Range($pos, $pos).InsertParagraphBefore()
        $doc.Range($pos, $pos).InsertParagraphBefore()
        $doc.Range($pos, $pos).InsertAfter($kind[1])   # into the first new paragraph, before its paragraph mark
        $title = $doc.Range($pos, $pos).Paragraphs.Item(1)
        $title.Style = $tocTitle
        $title.Format.PageBreakBefore = -1
        $list = $title.Next(1)
        $list.Style = -1
        $list.Format.PageBreakBefore = 0
        $null = $doc.TablesOfFigures.Add($doc.Range($list.Range.Start, $list.Range.Start), $kind[0])
    }

    foreach ($toc in $doc.TablesOfContents) { $toc.Update() }
    foreach ($tof in $doc.TablesOfFigures) { $tof.Update() }
    $doc.Fields.Update() | Out-Null
    $doc.SaveAs2("$out.docx", 16)
    $doc.ExportAsFixedFormat("$out.pdf", 17)
    "{0}: {1} pages, {2} tables, {3} pictures" -f (Split-Path $out -Leaf), $doc.ComputeStatistics(2), $doc.Tables.Count, $doc.InlineShapes.Count
    $doc.Close($false)
} finally {
    $word.Quit()
}

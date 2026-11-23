# Checks a filled document against its template outline (outline.ps1). Exit 0 when:
#  - every non-placeholder heading of the template is present, in order, at the same Heading level;
#  - a table of contents field exists;
#  - the Record of Changes table (first table whose first cell is "Date") has a filled data row;
#  - no template placeholder text is left anywhere.
# Otherwise exit 1 with one line per failure.
#   powershell -File tools/docs/check-docx.ps1 -Path <docx> -Outline tools/docs/outlines/<doc>.json [-NoRecordOfChanges]
param([Parameter(Mandatory)] [string]$Path, [Parameter(Mandatory)] [string]$Outline, [switch]$NoRecordOfChanges)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\docx-xml.ps1"
$x = Read-DocxXml $Path
$paras = @(Get-DocxParagraphs $x)
$fail = New-Object System.Collections.Generic.List[string]

# 1. Headings of the template, in order.
# PowerShell 5.1 returns a JSON array as one item: unroll it before filtering.
$expected = @(Get-Content -Raw -Encoding UTF8 $Outline | ConvertFrom-Json | ForEach-Object { $_ } | Where-Object { -not $_.placeholder })
$actual = @($paras | Where-Object { $_.Style -match '^Heading[1-4]$' -and $_.Text })
$i = 0
foreach ($h in $expected) {
    $found = $false
    while ($i -lt $actual.Count) {
        $a = $actual[$i]; $i++
        if ($a.Text -eq $h.text -and [int]$a.Style.Substring(7) -eq $h.level) { $found = $true; break }
    }
    if (-not $found) { $fail.Add("missing heading (Heading$($h.level)): $($h.text)"); $i = 0 }
}

# 2. Table of contents.
$instr = ($x.Doc.SelectNodes('//w:instrText', $x.Ns) | ForEach-Object { $_.InnerText }) -join ' '
$sdtToc = $x.Doc.SelectNodes('//w:sdt//w:docPartGallery[@w:val="Table of Contents"]', $x.Ns).Count
if ($instr -notmatch '\bTOC\b' -and $sdtToc -eq 0) { $fail.Add('no table of contents field') }

# 3. Record of Changes.
if (-not $NoRecordOfChanges) {
    $filled = $false
    foreach ($t in $x.Doc.SelectNodes('//w:tbl', $x.Ns)) {
        $rows = $t.SelectNodes('w:tr', $x.Ns)
        if ($rows.Count -lt 2) { continue }
        $first = (($rows[0].SelectNodes('.//w:t', $x.Ns) | ForEach-Object { $_.InnerText }) -join '').Trim()
        if (-not $first.StartsWith('Date')) { continue }
        $second = (($rows[1].SelectNodes('.//w:t', $x.Ns) | ForEach-Object { $_.InnerText }) -join '').Trim()
        $filled = $second.Length -gt 0
        break
    }
    if (-not $filled) { $fail.Add('Record of Changes has no filled row') }
}

# 4. Placeholders anywhere in the text.
foreach ($p in $paras) {
    if ($p.Text -match $script:Placeholders) { $fail.Add("placeholder left: $($p.Text.Substring(0, [Math]::Min(80, $p.Text.Length)))") }
}

if ($fail.Count) { $fail | ForEach-Object { "FAIL $_" }; exit 1 }
"OK {0}: {1} headings, TOC, Record of Changes" -f (Split-Path $Path -Leaf), $expected.Count
exit 0

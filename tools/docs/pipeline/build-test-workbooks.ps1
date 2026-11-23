# Fills the school's Test Report (.xlsx) and Unit Test (.xls) workbooks in place from tools/docs/build/testcases.json
# (written by tools/docs/src/report5.mjs). Each starts from the untouched template given by -TestReportTpl/-UnitTestTpl
# (git show <base>:<path>, so rebuilding is idempotent). Needs Excel. ASCII only. Run from the repository root.
param(
    [Parameter(Mandatory = $true)][string]$TestReportTpl,
    [Parameter(Mandatory = $true)][string]$UnitTestTpl,
    [string]$Data = 'tools/docs/build/testcases.json',
    [string]$OutDir = 'docs/SEP490_Report'
)
$ErrorActionPreference = 'Stop'
$root = (Get-Location).Path
$d = Get-Content -Raw -Encoding UTF8 (Join-Path $root $Data) | ConvertFrom-Json
$project = 'CampusStay FPT - Dormitory Registration and Room-Scheduling Management System'
$code = 'FA26SE260'
$leader = [regex]::Unescape('Lê Thành Minh Trung')
$day = ([datetime]$d.runDate).ToString('dd/MM/yyyy')
$tester = @{ unit = 'CI (mvn verify)'; integration = 'CI (mvn verify)'; web = 'CI (npm test)'; mobile = 'flutter test' }

function Set-Cover($wb, $docName, $text) {
    $c = $wb.Worksheets.Item('Cover')
    $c.Range('B4').Value2 = $project
    $c.Range('B5').Value2 = $code
    $c.Range('B6').Value2 = "${code}_${docName}_v1.0"
    $c.Range('F4').Value2 = $leader
    $c.Range('F5').Value2 = $day
    $c.Range('F6').Value2 = '1.0'
    $c.Range('A11').Value2 = $day
    $c.Range('B11').Value2 = '1.0'
    $c.Range('C11').Value2 = 'Whole document'
    $c.Range('D11').Value2 = 'A'
    $c.Range('E11').Value2 = $text
    $c.Range('F11').Value2 = 'Report 5 (Test Documentation); the test code in backend/src/test, web/src/lib, mobile/test'
}

$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false
$xl.DisplayAlerts = $false
try {
    # ------------------------------------------------------------------ Test Report: one sheet per feature
    $wb = $xl.Workbooks.Open((Resolve-Path $TestReportTpl).Path)
    Set-Cover $wb 'TestReport' 'Defense version: every automated test case of the backend (by feature), the web and the mobile app, with the result of one run'
    $groups = @($d.groups)
    $template = $wb.Worksheets.Item('Feature 1')
    $last = $wb.Worksheets.Item($wb.Worksheets.Count)
    foreach ($g in $groups) {
        $template.Copy([Type]::Missing, $last)
        $ws = $wb.Worksheets.Item($last.Index + 1)
        $ws.Name = $g.sheet
        $last = $ws
        $ws.Range('B2').Value2 = $g.name
        $ws.Range('B3').Value2 = $g.req
        $ws.Range('A11:R200').ClearContents() | Out-Null
        $ws.Range('A11').Value2 = $g.name
        $rows = @($g.rows)
        $n = $rows.Count
        if ($n -gt 1) { $ws.Rows(12).Copy() | Out-Null; $ws.Range("A13:R$(11 + $n)").PasteSpecial(-4122) | Out-Null }
        for ($i = 0; $i -lt $n; $i++) {
            $r = $rows[$i]
            $vals = @([string]$r.id, [string]$r.description, [string]$r.procedure, [string]$r.expected, [string]$r.pre, [string]$r.result,
                $(if ($r.result -eq 'Pending') { '' } else { $day }), [string]$tester[[string]$r.level])
            for ($c = 0; $c -lt 8; $c++) { $ws.Cells.Item(12 + $i, $c + 1).Value2 = $vals[$c] }
        }
        $ws.Range("I12:I$(11 + $n)").Value2 = ''
        $ws.Range("L12:L$(11 + $n)").Value2 = ''
        $ws.Range("A12:H$(11 + $n)").WrapText = $true
        # One round was run: rounds 2 and 3 count nothing.
        $ws.Range('B7:E8').Value2 = 0
    }
    $wb.Worksheets.Item('Feature 1').Delete()
    $wb.Worksheets.Item('Feature 2').Delete()

    $tc = $wb.Worksheets.Item('Test Cases')
    $tc.Range('D3').Value2 = $project
    $tc.Range('D4').Value2 = $code
    $tc.Range('D5').Value2 = "1. Backend: JDK 21, Maven, Docker; PostgreSQL 17 in a Testcontainers container with the Flyway schema and the test seed; GitHub Actions (ubuntu-latest) on pull requests and pushes to main that touch backend/.`n2. Web: Node.js 22, npm test.`n3. Mobile: Flutter SDK, flutter test."
    $tc.Range('B9:F60').ClearContents() | Out-Null
    if ($groups.Count -gt 1) { $tc.Rows(9).Copy() | Out-Null; $tc.Range("A10:F$(8 + $groups.Count)").PasteSpecial(-4122) | Out-Null }
    for ($i = 0; $i -lt $groups.Count; $i++) {
        $g = $groups[$i]
        $tc.Cells.Item(9 + $i, 2).Value2 = [string]($i + 1)
        $tc.Cells.Item(9 + $i, 3).Value2 = $g.name
        $tc.Cells.Item(9 + $i, 4).Value2 = $g.sheet
        $tc.Cells.Item(9 + $i, 5).Value2 = $g.req
        $tc.Cells.Item(9 + $i, 6).Value2 = @($g.rows)[0].pre
    }

    $ts = $wb.Worksheets.Item('Test Statistics')
    $ts.Range('C3').Value2 = $project
    $ts.Range('C4').Value2 = $code
    $ts.Range('F3').Value2 = $leader
    $ts.Range('F4').Value2 = $leader
    $ts.Range('H5').Value2 = $day
    $ts.Range('C6').Value2 = "Defense release: $($groups.Count) groups (the features of the backend, the web, the mobile app). Round 1 = one run of every automated suite on $day."
    $ts.Range("A13:A$(10 + $groups.Count)").EntireRow.Insert() | Out-Null
    for ($i = 0; $i -lt $groups.Count; $i++) {
        $r = 11 + $i
        $s = "'" + $groups[$i].sheet + "'"
        $ts.Cells.Item($r, 2).Value2 = [string]($i + 1)
        $ts.Cells.Item($r, 3).Formula = "=$s!B2"
        $ts.Cells.Item($r, 4).Formula = "=$s!B6"
        $ts.Cells.Item($r, 5).Formula = "=$s!C6"
        $ts.Cells.Item($r, 6).Formula = "=$s!D6"
        $ts.Cells.Item($r, 7).Formula = "=$s!E6"
        $ts.Cells.Item($r, 8).Formula = "=$s!B4"
    }
    $ts.Rows(11).Copy() | Out-Null
    $ts.Range("A12:H$(10 + $groups.Count)").PasteSpecial(-4122) | Out-Null
    $wb.Worksheets.Item('Cover').Activate()
    $out = Join-Path $root "$OutDir/Report5_Test Report.xlsx"
    $wb.SaveAs("$out", 51)
    $wb.Close($false)
    Write-Output "Test Report: $($groups.Count) sheets -> $out"

    # ------------------------------------------------------------------ Unit Test: one sheet per test class
    $wb = $xl.Workbooks.Open((Resolve-Path $UnitTestTpl).Path)
    Set-Cover $wb 'UnitTest' 'Defense version: the unit tests of the backend (JUnit 5), one sheet per class under test, with the result of one run'
    $units = @($d.units)
    $template = $wb.Worksheets.Item('Function 1')
    $last = $wb.Worksheets.Item($wb.Worksheets.Count)
    foreach ($u in $units) {
        $template.Copy([Type]::Missing, $last)
        $ws = $wb.Worksheets.Item($last.Index + 1)
        $ws.Name = $u.code
        $last = $ws
        $cases = @($u.cases)
        $n = $cases.Count
        $ws.Range('C2').Value2 = $u.code
        $ws.Range('L2').Value2 = "$($u.cls) ($($u.testClass))"
        $ws.Range('C3').Value2 = $u.owner
        $ws.Range('L3').Value2 = 'CI (mvn verify)'
        $ws.Range('C4').Value2 = [double]$u.loc
        $ws.Range('C5').Value2 = $u.requirement
        $ws.Range('B11:W30').ClearContents() | Out-Null
        $ws.Range('D32:W38').ClearContents() | Out-Null
        $ws.Range('F39:W42').ClearContents() | Out-Null
        $ws.Range('E9:HT9').ClearContents() | Out-Null
        # Inputs: rows 14..30 hold 17 cases; more cases get more rows above the Return block.
        $off = [Math]::Max(0, $n - 17)
        if ($off -gt 0) { $ws.Range("A30:A$(29 + $off)").EntireRow.Insert() | Out-Null }
        if ($n -gt 18) { $ws.Range('W:W').Copy() | Out-Null; $ws.Range($ws.Cells.Item(1, 24), $ws.Cells.Item(1, 5 + $n)).EntireColumn.PasteSpecial(-4122) | Out-Null }
        $ws.Range('D11').Value2 = 'Objects built in the test; no database, outbound HTTP stubbed'
        $ws.Range('B13').Value2 = 'Input'
        $ws.Range("D$(32 + $off)").Value2 = 'The assertions of the test hold'
        $ws.Range("D$(35 + $off)").Value2 = 'The expected exception is thrown'
        for ($i = 0; $i -lt $n; $i++) {
            $c = $cases[$i]
            $col = 6 + $i
            $ws.Cells.Item(9, $col).Value2 = 'UTCID{0:D2}' -f ($i + 1)
            $ws.Cells.Item(14 + $i, 4).Value2 = [string]$c.what
            $ws.Cells.Item(14 + $i, $col).Value2 = 'O'
            $ws.Cells.Item(32 + $off, $col).Value2 = 'O'
            if ($c.throws) { $ws.Cells.Item(35 + $off, $col).Value2 = 'O' }
            $ws.Cells.Item(39 + $off, $col).Value2 = [string]$c.type
            $ws.Cells.Item(40 + $off, $col).Value2 = $(if ($c.result -eq 'Passed') { 'P' } elseif ($c.result -eq 'Failed') { 'F' } else { '' })
            $ws.Cells.Item(41 + $off, $col).Value2 = $day
        }
    }

    $fl = $wb.Worksheets.Item('Functions')
    $fl.Range('E4').Value2 = $project
    $fl.Range('E5').Value2 = $code
    # Business rules are tested through the API by the integration tests (Test Report), so no unit-test norm per KLOC.
    $fl.Range('E6').Value2 = 'N/A'
    $fl.Range('E7').Value2 = '1. JDK 21, Maven (mvn verify runs the unit tests first). 2. No database: each class is tested alone with fakes and stub HTTP servers.'
    $fl.Range('A11:H40').ClearContents() | Out-Null
    if ($units.Count -gt 1) { $fl.Rows(11).Copy() | Out-Null; $fl.Range("A12:H$(10 + $units.Count)").PasteSpecial(-4122) | Out-Null }
    for ($i = 0; $i -lt $units.Count; $i++) {
        $u = $units[$i]
        $r = 11 + $i
        $fl.Cells.Item($r, 1).Value2 = [string]($i + 1)
        $fl.Cells.Item($r, 2).Value2 = $u.requirement
        $fl.Cells.Item($r, 3).Value2 = $u.cls
        $fl.Cells.Item($r, 4).Value2 = $u.testClass
        $fl.Cells.Item($r, 5).Value2 = $u.code
        $fl.Cells.Item($r, 6).Value2 = $u.code
        $fl.Cells.Item($r, 7).Value2 = "$(@($u.cases).Count) test cases"
        $fl.Cells.Item($r, 8).Value2 = 'Objects built in the test'
    }

    $st = $wb.Worksheets.Item('Statistics')
    $st.Range('F4').Value2 = $leader
    $st.Range('F5').Value2 = $leader
    $st.Range('F6').Value2 = $day
    $st.Range('B7').Value2 = "Unit tests of the backend: $($units.Count) test classes."
    $proto = @()
    for ($c = 1; $c -le 9; $c++) { $proto += $st.Cells.Item(12, $c).Formula }
    if ($units.Count -gt 3) { $st.Range("A15:A$(11 + $units.Count)").EntireRow.Insert() | Out-Null }
    for ($i = 0; $i -lt $units.Count; $i++) {
        $r = 12 + $i
        for ($c = 1; $c -le 9; $c++) {
            $f = [string]$proto[$c - 1]
            if ($f.StartsWith('=')) { $f = $f.Replace("'Function 1'", "'" + $units[$i].code + "'") } elseif ($c -eq 1) { $f = [string]($i + 1) } elseif ($c -eq 2) { $f = $units[$i].code }
            $st.Cells.Item($r, $c).Formula = [string]$f
        }
    }
    $st.Rows(12).Copy() | Out-Null
    $st.Range("A13:I$(11 + $units.Count)").PasteSpecial(-4122) | Out-Null
    foreach ($name in @('Function 1', 'Function 2', 'Function3', 'Example')) { $wb.Worksheets.Item($name).Delete() }
    $wb.Worksheets.Item('Cover').Activate()
    $out = Join-Path $root "$OutDir/Report5_Unit Test.xls"
    $wb.SaveAs("$out", 56)
    $wb.Close($false)
    Write-Output "Unit Test: $($units.Count) sheets -> $out"
} finally {
    $xl.Quit()
}

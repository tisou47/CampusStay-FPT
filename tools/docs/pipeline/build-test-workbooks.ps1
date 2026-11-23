# Fills the school's Test Report and Unit Test workbooks (templates/SEP490_docs) from docs/reports/data/testcases.json
# (written by docs/tools/gen-test-docs.mjs). Needs Excel. Run from the repository root:
#   powershell -NoProfile -File docs/tools/build-test-workbooks.ps1
param([string]$Root = (Get-Location).Path)

$ErrorActionPreference = 'Stop'
$data = Get-Content -Raw -Encoding UTF8 (Join-Path $Root 'docs/reports/data/testcases.json') | ConvertFrom-Json
$outDir = Join-Path $Root 'docs/reports/out'
$project = 'CampusStay FPT - Dormitory Registration and Room-Scheduling Management System'
$code = 'FA26SE260'
$day = if ($data.counts.runDate) { ([datetime]$data.counts.runDate).ToLocalTime().ToString('dd/MM/yyyy') } else { (Get-Date).ToString('dd/MM/yyyy') }
$status = @{ 'Passed' = 'Passed'; 'Failed' = 'Failed'; 'Not run' = 'Pending'; 'Untested' = 'Pending' }

$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false
$xl.DisplayAlerts = $false
try {
    # ------------------------------------------------------------------ Test Report
    $wb = $xl.Workbooks.Open((Join-Path $Root 'templates/SEP490_docs/Report5_Test Report.xlsx'))
    $cover = $wb.Worksheets.Item('Cover')
    $cover.Range('B4').Value2 = $project
    $cover.Range('B5').Value2 = $code
    $cover.Range('B6').Value2 = "${code}_TestReport_v1.0"
    $cover.Range('F4').Value2 = $data.people.tester
    $cover.Range('F5').Value2 = $day
    $cover.Range('F6').Value2 = '1.0'
    $cover.Range('A11').Value2 = $day
    $cover.Range('B11').Value2 = '1.0'
    $cover.Range('C11').Value2 = 'Whole document'
    $cover.Range('D11').Value2 = 'A'
    $cover.Range('E11').Value2 = 'First version for Review 2: test cases of the mandatory features, main workflows, state transitions and NFRs; round 1 = automated run'
    $cover.Range('F11').Value2 = 'Report 3 (SRS), Report 4 (SDD), Report 5, docs/backend/04_Test_Catalog.md'

    # Groups: one sheet each.
    $groups = @()
    foreach ($f in $data.features) {
        $cases = @($data.featureCases | Where-Object { $_.group -eq $f.id })
        $groups += [pscustomobject]@{ sheet = $f.id; name = "$($f.id) $($f.name)"; req = "$($f.name) ($($f.frs)); actors: $($f.actors)"; head = $f.frs; pre = $cases[0].pre
            rows = @($cases | ForEach-Object { ,@($_.id, "[$($_.type)] $($_.description)", $_.steps, $_.expected, $_.pre, $status[$_.result], $(if ($_.result -eq 'Not run') { '' } else { $day }), 'CI (mvn verify)') }) }
    }
    $groups += [pscustomobject]@{ sheet = 'Workflows'; name = 'Main workflows (end to end)'; req = 'Each main workflow from the first actor action to the business result, on staging with the demo stages'; head = 'WF-01 ... WF-05'; pre = 'Staging with demo data'
        rows = @($data.workflowCases | ForEach-Object { ,@($_.id, "$($_.workflow) $($_.name) (owner $($_.owner))", $_.steps, $_.expected, $_.pre, 'Pending', '', '') }) }
    $groups += [pscustomobject]@{ sheet = 'State transitions'; name = 'State transitions of the main entities'; req = 'Every transition of Application, Allocation, next-Term Allocation, Invoice, payment claim and Maintenance Request, and refused transitions'; head = 'Report 4 section 3.1'; pre = 'Test seed or staging'
        rows = @($data.stateCases | ForEach-Object {
            $how = if ($_.auto) { "Automated ($($_.test)): $($_.trigger)" } else { "Manual on staging: $($_.trigger)" }
            ,@($_.id, "$($_.entity): $($_.from) -> $($_.to) ($($_.fr))", $how, $_.expected, "Entity in state $($_.from)", $status[$_.result], $(if ($_.result -eq 'Not run') { '' } else { $day }), $(if ($_.auto) { 'CI (mvn verify)' } else { '' })) }) }
    $groups += [pscustomobject]@{ sheet = 'NFRs'; name = 'Non-functional requirements'; req = 'NFR-01 ... NFR-06: metric, threshold and measurement method'; head = 'Report 3 section 4.2'; pre = 'See each case'
        rows = @($data.nfrCases | ForEach-Object { ,@($_.id, "$($_.nfr): $($_.metric)", $_.method, "Threshold: $($_.threshold)", $_.run, $status[$_.result], $(if ($_.result -eq 'Not run') { '' } else { $day }), $(if ($_.result -eq 'Not run') { '' } else { 'CI (mvn verify)' })) }) }

    $template = $wb.Worksheets.Item('Feature 1')
    $last = $wb.Worksheets.Item($wb.Worksheets.Count)
    foreach ($g in $groups) {
        $template.Copy([Type]::Missing, $last)
        $ws = $wb.Worksheets.Item($last.Index + 1)
        $ws.Name = $g.sheet
        $last = $ws
        $ws.Range('B2').Value2 = $g.name
        $ws.Range('B3').Value2 = $g.req
        $ws.Range('A12:R200').ClearContents() | Out-Null
        $ws.Range('A11').Value2 = $g.head
        $n = $g.rows.Count
        if ($n -gt 8) { $ws.Rows(12).Copy() | Out-Null; $ws.Range("A13:R$(11 + $n)").PasteSpecial(-4122) | Out-Null }
        for ($i = 0; $i -lt $n; $i++) {
            $r = 12 + $i
            for ($c = 0; $c -lt 8; $c++) { $ws.Cells.Item($r, $c + 1).Value2 = [string]$g.rows[$i][$c] }
        }
        $ws.Range("A12:H$(11 + $n)").WrapText = $true
        # Only round 1 has been run: rounds 2 and 3 stay empty.
        $ws.Range('B7:E8').Value2 = 0
    }
    $wb.Worksheets.Item('Feature 1').Delete()
    $wb.Worksheets.Item('Feature 2').Delete()

    # Test Cases: one row per sheet.
    $tc = $wb.Worksheets.Item('Test Cases')
    $tc.Range('C3').Value2 = $project
    $tc.Range('C4').Value2 = $code
    $tc.Range('C5').Value2 = "1. Automated: JDK 21, Maven, Docker; PostgreSQL 17 (Testcontainers) with the Flyway schema and the test seed; GitHub Actions on every push.`n2. Staging: https://campusstay-fpt-ten.vercel.app and https://campusstay-api.eastasia.cloudapp.azure.com/api with the demo stages.`n3. Browsers: Chrome, Edge. Android 8.0 or later."
    $tc.Range('A9:E60').ClearContents() | Out-Null
    $tc.Rows(9).Copy() | Out-Null
    $tc.Range("A10:E$(8 + $groups.Count)").PasteSpecial(-4122) | Out-Null
    for ($i = 0; $i -lt $groups.Count; $i++) {
        $g = $groups[$i]
        $tc.Cells.Item(9 + $i, 1).Value2 = [string]($i + 1)
        $tc.Cells.Item(9 + $i, 2).Value2 = $g.name
        $tc.Cells.Item(9 + $i, 3).Value2 = $g.sheet
        $tc.Cells.Item(9 + $i, 4).Value2 = $g.req
        $tc.Cells.Item(9 + $i, 5).Value2 = $g.pre
    }

    # Test Statistics: one row per sheet, formulas on the sheets' counters.
    $ts = $wb.Worksheets.Item('Test Statistics')
    $ts.Range('C3').Value2 = $project
    $ts.Range('C4').Value2 = $code
    $ts.Range('C5').Value2 = "${code}_Test Report_v1.0"
    $ts.Range('F3').Value2 = $data.people.tester
    $ts.Range('F4').Value2 = $data.people.leader
    $ts.Range('H5').Value2 = $day
    $ts.Range('C6').Value2 = 'Review 2 (Iteration 1): 18 mandatory features, 5 main workflows, state transitions of the main entities, 6 NFRs. Round 1 = automated run of mvn verify; manual cases pending.'
    $ts.Range("A13:A$(10 + $groups.Count)").EntireRow.Insert() | Out-Null
    for ($i = 0; $i -lt $groups.Count; $i++) {
        $r = 11 + $i
        $s = "'" + $groups[$i].sheet + "'"
        $ts.Cells.Item($r, 2).Value2 = [string]($i + 1)
        $ts.Cells.Item($r, 3).Value2 = $groups[$i].name
        $ts.Cells.Item($r, 4).Formula = "=$s!B6"
        $ts.Cells.Item($r, 5).Formula = "=$s!C6"
        $ts.Cells.Item($r, 6).Formula = "=$s!D6"
        $ts.Cells.Item($r, 7).Formula = "=$s!E6"
        $ts.Cells.Item($r, 8).Formula = "=$s!B4"
    }
    $ts.Rows(11).Copy() | Out-Null
    $ts.Range("A12:H$(10 + $groups.Count)").PasteSpecial(-4122) | Out-Null
    $out = Join-Path $outDir "SWP490_${code}_R2_Report5_TestReport.xlsx"
    $wb.Worksheets.Item('Cover').Activate()
    $wb.SaveAs($out, 51)
    $wb.Close($true)
    Write-Output "Test Report: $($groups.Count) sheets -> $out"

    # ------------------------------------------------------------------ Unit Test
    $wb = $xl.Workbooks.Open((Join-Path $Root 'templates/SEP490_docs/Report5_Unit Test.xls'))
    $cover = $wb.Worksheets.Item('Cover')
    $cover.Range('B4').Value2 = $project
    $cover.Range('B5').Value2 = $code
    $cover.Range('B6').Value2 = "${code}_UnitTest_v1.0"
    $cover.Range('F4').Value2 = $data.people.leader
    $cover.Range('F5').Value2 = $day
    $cover.Range('F6').Value2 = '1.0'
    $cover.Range('A11').Value2 = $day
    $cover.Range('B11').Value2 = '1.0'
    $cover.Range('C11').Value2 = 'Whole document'
    $cover.Range('D11').Value2 = 'A'
    $cover.Range('E11').Value2 = 'First version for Review 2: the unit tests of the backend (JUnit 5, mvn test)'
    $cover.Range('F11').Value2 = 'docs/backend/04_Test_Catalog.md'
    $units = @($data.unitTests)
    $template = $wb.Worksheets.Item('Function 1')
    $last = $wb.Worksheets.Item($wb.Worksheets.Count)
    foreach ($u in $units) {
        $template.Copy([Type]::Missing, $last)
        $ws = $wb.Worksheets.Item($last.Index + 1)
        $ws.Name = $u.code
        $last = $ws
        $ws.Range('C2').Value2 = $u.code
        $ws.Range('L2').Value2 = "$($u.cls) ($($u.testClass))"
        $ws.Range('C3').Value2 = $u.owner
        $ws.Range('L3').Value2 = 'mvn test (CI)'
        $ws.Range('C4').Value2 = [double]$u.loc
        $ws.Range('C5').Value2 = $u.requirement
        $ws.Range('B11:W38').ClearContents() | Out-Null
        $ws.Range('F39:W42').ClearContents() | Out-Null
        $ws.Range('E9:HT9').ClearContents() | Out-Null
        $ws.Range('B11').Value2 = 'Precondition'
        $ws.Range('D12').Value2 = 'Objects built in the test (no database); outbound HTTP stubbed'
        $ws.Range('B14').Value2 = 'Input'
        $ws.Range('B31').Value2 = 'Return'
        $cases = @($u.cases)
        for ($i = 0; $i -lt $cases.Count; $i++) {
            $c = $cases[$i]
            $col = 6 + $i
            $ws.Cells.Item(9, $col).Value2 = 'UTCID{0:D2}' -f ($i + 1)
            $ws.Cells.Item(14 + $i, 4).Value2 = ($c.test -split '\.')[1]
            $ws.Cells.Item(14 + $i, $col).Value2 = 'O'
            $ws.Cells.Item(32 + $i, 4).Value2 = $c.what
            $ws.Cells.Item(32 + $i, $col).Value2 = 'O'
            $ws.Cells.Item(39, $col).Value2 = $c.type
            $ws.Cells.Item(40, $col).Value2 = $(if ($c.result -eq 'Passed') { 'P' } elseif ($c.result -eq 'Failed') { 'F' } else { '' })
            $ws.Cells.Item(41, $col).Value2 = $day
        }
    }

    $fl = $wb.Worksheets.Item('Functions')
    $fl.Range('E4').Value2 = $project
    $fl.Range('E5').Value2 = $code
    $fl.Range('E7').Value2 = '1. JDK 21, Maven (mvn test). 2. No database: the classes are tested alone with fakes and stub HTTP servers.'
    # Business rules are tested through the API by 206 integration tests (Test Report), so no unit-test norm per KLOC.
    $fl.Range('E6').Value2 = 'N/A'
    $fl.Range('A11:H40').ClearContents() | Out-Null
    $fl.Rows(11).Copy() | Out-Null
    $fl.Range("A12:H$(10 + $units.Count)").PasteSpecial(-4122) | Out-Null
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
        $fl.Cells.Item($r, 8).Value2 = 'mvn test'
    }

    $st = $wb.Worksheets.Item('Statistics')
    $st.Range('B4').Value2 = $project
    $st.Range('B5').Value2 = $code
    $st.Range('B6').Value2 = "${code}_UnitTest_v1.0"
    $st.Range('F6').Value2 = $day
    $st.Range('B7').Value2 = 'Unit tests of the backend (8 classes under test).'
    $st.Range('A15:A19').EntireRow.Insert() | Out-Null
    $proto = @()
    for ($c = 1; $c -le 9; $c++) { $proto += $st.Cells.Item(12, $c).Formula }
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
    $out = Join-Path $outDir "SWP490_${code}_R2_Report5_UnitTest.xls"
    $wb.Worksheets.Item('Cover').Activate()
    $wb.SaveAs($out, 56)
    $wb.Close($true)
    Write-Output "Unit Test: $($units.Count) sheets -> $out"
} finally {
    $xl.Quit()
}

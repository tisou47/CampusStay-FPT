# Fills the Project Weekly Report workbook: copies the template sheet "Wx" once per week (W1, W2, ...) and fills its four
# sections from a JSON config (tools/docs/src/weekly.mjs). Needs Excel. ASCII only.
param([Parameter(Mandatory = $true)][string]$Config)

$ErrorActionPreference = 'Stop'
$cfg = Get-Content -Raw -Encoding UTF8 $Config | ConvertFrom-Json
$root = (Get-Location).Path
$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false
$xl.DisplayAlerts = $false
# Sections of the template sheet: first data row and the number of data rows it has.
$sections = @(
    @{ key = 'status'; row = 6; tmpl = 4; cols = 5; status = 4 },
    @{ key = 'issues'; row = 12; tmpl = 4; cols = 5; status = 4 },
    @{ key = 'plan'; row = 18; tmpl = 4; cols = 5; status = 0 },
    @{ key = 'other'; row = 24; tmpl = 5; cols = 5; status = 0 }
)
try {
    $wb = $xl.Workbooks.Open((Join-Path $root $cfg.template))
    $tpl = $wb.Worksheets.Item('Wx')
    foreach ($w in $cfg.weeks) {
        $tpl.Copy([Type]::Missing, $wb.Worksheets.Item($wb.Worksheets.Count)) | Out-Null
        $ws = $wb.Worksheets.Item($wb.Worksheets.Count)
        $ws.Name = $w.name
        $ws.Cells.Item(2, 2).Value2 = [string]$w.group
        $ws.Cells.Item(3, 2).Value2 = [string]$w.week
        # Bottom-up, so the row numbers of the sections above do not move.
        foreach ($s in ($sections | Sort-Object { $_.row } -Descending)) {
            $rows = @($w.($s.key))
            $n = $rows.Count
            $extra = $n - $s.tmpl
            if ($extra -gt 0) { $ws.Rows.Item($s.row + $s.tmpl).Resize($extra).Insert() | Out-Null }
            $span = [Math]::Max($n, $s.tmpl)
            $ws.Range($ws.Cells.Item($s.row, 1), $ws.Cells.Item($s.row + $span - 1, $s.cols)).ClearContents() | Out-Null
            for ($i = 0; $i -lt $n; $i++) {
                if ([string]$rows[$i][0] -ne '') { $ws.Cells.Item($s.row + $i, 1).Value2 = [string]($i + 1) }
                for ($c = 0; $c -lt $rows[$i].Count; $c++) { $ws.Cells.Item($s.row + $i, 2 + $c).Value2 = [string]$rows[$i][$c] }
            }
            $ws.Range($ws.Cells.Item($s.row, 2), $ws.Cells.Item($s.row + $span - 1, $s.cols)).WrapText = $true
        }
        $ws.UsedRange.Rows.AutoFit() | Out-Null
    }
    $tpl.Delete()
    $wb.Worksheets.Item(1).Activate()
    $wb.SaveAs((Join-Path $root $cfg.out), 51)
    $wb.Close($true)
    Write-Output "weeks: $(@($cfg.weeks).Count)"
} finally {
    $xl.Quit()
}

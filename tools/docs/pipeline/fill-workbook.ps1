# Fills sheets of a school workbook template with rows from a JSON config (docs/reports/src/tracking.mjs): each
# sheet's rows start at startRow/startCol; the first data row's format is copied down; extra template rows are
# cleared. Needs Excel. ASCII only.
param([Parameter(Mandatory = $true)][string]$Config)

$ErrorActionPreference = 'Stop'
$cfg = Get-Content -Raw -Encoding UTF8 $Config | ConvertFrom-Json
$root = (Get-Location).Path
$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false
$xl.DisplayAlerts = $false
try {
    $wb = $xl.Workbooks.Open((Join-Path $root $cfg.template))
    foreach ($s in $cfg.sheets) {
        $ws = $wb.Worksheets.Item($s.name)
        $r0 = [int]$s.startRow
        $c0 = [int]$s.startCol
        $n = $s.rows.Count
        $width = ($s.rows | ForEach-Object { $_.Count } | Measure-Object -Maximum).Maximum
        $last = $ws.UsedRange.Row + $ws.UsedRange.Rows.Count - 1
        $ws.Range($ws.Cells.Item($r0, $c0), $ws.Cells.Item([Math]::Max($last, $r0 + $n), $c0 + $width - 1)).ClearContents() | Out-Null
        if ($n -gt 1) {
            $ws.Range($ws.Cells.Item($r0, $c0), $ws.Cells.Item($r0, $c0 + $width - 1)).Copy() | Out-Null
            $ws.Range($ws.Cells.Item($r0 + 1, $c0), $ws.Cells.Item($r0 + $n - 1, $c0 + $width - 1)).PasteSpecial(-4122) | Out-Null
        }
        for ($i = 0; $i -lt $n; $i++) {
            for ($c = 0; $c -lt $s.rows[$i].Count; $c++) { $ws.Cells.Item($r0 + $i, $c0 + $c).Value2 = [string]$s.rows[$i][$c] }
        }
        $ws.Range($ws.Cells.Item($r0, $c0), $ws.Cells.Item($r0 + $n - 1, $c0 + $width - 1)).WrapText = $true
        Write-Output "$($s.name): $n rows"
    }
    $wb.Worksheets.Item(1).Activate()
    $wb.SaveAs((Join-Path $root $cfg.out), 51)
    $wb.Close($true)
} finally {
    $xl.Quit()
}

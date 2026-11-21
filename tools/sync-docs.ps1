<#
.SYNOPSIS
  Mirrors the SEP490 documents between the team Google Drive (Google Drive for Desktop) and docs/ in this repository.

.DESCRIPTION
  Google Drive is the source. Only the four document folders are mirrored, one by one:
  Topic, SEP490_Report, SEP490_R2_BM04_Review2-Document and Diagrams. Everything else under docs/ (CHANGELOG.md)
  is never touched. Office lock and temp files are skipped.

  Without -Apply the script only previews (robocopy /L). With -Apply it copies; if the copy would delete files that
  exist only on the destination side, it stops with exit code 2 unless -Force is given.

.EXAMPLE
  powershell -File tools/sync-docs.ps1                 # preview Drive -> repo
  powershell -File tools/sync-docs.ps1 -Apply          # pull Drive -> repo
  powershell -File tools/sync-docs.ps1 -Push -Apply    # push repo -> Drive (files edited in the repo)
#>
[CmdletBinding()]
param(
  [switch]$Push,
  [switch]$Apply,
  [switch]$Force,
  [string]$DriveDir = $(if ($env:CAMPUSSTAY_DRIVE_DIR) { $env:CAMPUSSTAY_DRIVE_DIR } else { 'G:\My Drive\DATN-FA26SE260-GFA26SE104 CampusStay' })
)
$ErrorActionPreference = 'Stop'

$Folders = @('Topic', 'SEP490_Report', 'SEP490_R2_BM04_Review2-Document', 'Diagrams')
$Exclude = @('~$*', '.~lock*', '*.tmp', 'desktop.ini', '.gitkeep')
$RepoDocs = Join-Path (Split-Path -Parent $PSScriptRoot) 'docs'

if (-not (Test-Path -LiteralPath $DriveDir -PathType Container)) {
  Write-Host "Google Drive for Desktop is not running or not signed in, or the folder is missing: $DriveDir" -ForegroundColor Red
  Write-Host 'Start Google Drive, sign in to the account that holds the folder, or pass -DriveDir / set CAMPUSSTAY_DRIVE_DIR.'
  exit 1
}

$Source, $Target, $Direction = if ($Push) { $RepoDocs, $DriveDir, 'repo -> Drive' } else { $DriveDir, $RepoDocs, 'Drive -> repo' }

# Runs robocopy for one folder; returns the copy and delete lists. Exit codes 0-7 are success, 8+ is failure.
function Invoke-Mirror([string]$Folder, [bool]$ListOnly) {
  $src = Join-Path $Source $Folder
  $dst = Join-Path $Target $Folder
  if (-not (Test-Path -LiteralPath $src -PathType Container)) {
    Write-Host "  skipped: '$Folder' does not exist on the source side ($src)" -ForegroundColor Yellow
    return [pscustomobject]@{ Copy = @(); Delete = @() }
  }
  $rcArgs = @($src, $dst, '/MIR', '/FFT', '/R:1', '/W:1', '/NP', '/NJH', '/NJS', '/FP', '/XF') + $Exclude
  if ($ListOnly) { $rcArgs += '/L' }
  $out = & robocopy @rcArgs
  if ($LASTEXITCODE -ge 8) {
    $out | Write-Host
    throw "robocopy failed for '$Folder' (exit code $LASTEXITCODE)"
  }
  $lines = $out | Where-Object { $_ -match '\S' }
  [pscustomobject]@{
    Copy   = @($lines | Where-Object { $_ -match '^\s*(New File|Newer|Older|Changed)\s' } | ForEach-Object { ($_ -replace '^\s*\S+( File)?\s+[\d.]+\s*[kmg]?\s+', '').Trim() })
    Delete = @($lines | Where-Object { $_ -match '\*EXTRA (File|Dir)' } | ForEach-Object { ($_ -replace '^\s*\*EXTRA (File|Dir)\s+-?[\d.]+\s*[kmg]?\s+', '').Trim() })
  }
}

Write-Host "Sync documents ($Direction)"
Write-Host "  from $Source"
Write-Host "  to   $Target"

$preview = @{}
foreach ($f in $Folders) { $preview[$f] = Invoke-Mirror $f $true }
$toCopy = @($Folders | ForEach-Object { $preview[$_].Copy }) | Where-Object { $_ }
$toDelete = @($Folders | ForEach-Object { $preview[$_].Delete }) | Where-Object { $_ }

Write-Host ''
Write-Host "Would copy: $($toCopy.Count)"
$toCopy | ForEach-Object { Write-Host "  + $_" }
Write-Host "Would delete (exist only on the destination side): $($toDelete.Count)"
$toDelete | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }

if (-not $Apply) {
  Write-Host ''
  Write-Host 'Preview only. Run again with -Apply to copy.'
  exit 0
}
if ($toDelete.Count -gt 0 -and -not $Force) {
  Write-Host ''
  Write-Host 'Stopped: the files above would be deleted. Copy them to the other side first, or run with -Force to delete them.' -ForegroundColor Red
  exit 2
}
if ($toCopy.Count -eq 0 -and $toDelete.Count -eq 0) {
  Write-Host 'Already in sync.'
  exit 0
}
foreach ($f in $Folders) {
  if (-not (Test-Path -LiteralPath (Join-Path $Target $f))) { New-Item -ItemType Directory -Path (Join-Path $Target $f) | Out-Null }
  [void](Invoke-Mirror $f $false)
}
Write-Host "Done: $($toCopy.Count) copied, $($toDelete.Count) deleted."
exit 0

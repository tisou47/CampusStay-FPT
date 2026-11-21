# Self-check for tools/sync-docs.ps1 on throwaway folders: run with `powershell -File tools/tests/sync-docs.test.ps1`.
# Pushes repo docs/ into a temp "Drive" so the real Drive and the repo's documents are never touched.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$script = Join-Path $repo 'tools/sync-docs.ps1'
$drive = Join-Path ([IO.Path]::GetTempPath()) ("sync-docs-test-" + [guid]::NewGuid())
$local = Join-Path $repo 'docs/Diagrams/zz-sync-test.txt'
$fail = 0
function Check($name, $ok) { if ($ok) { "PASS $name" } else { "FAIL $name"; $script:fail++ } }
try {
  New-Item -ItemType Directory -Path (Join-Path $drive 'Diagrams') | Out-Null
  Set-Content -LiteralPath $local -Value 'old' ; (Get-Item -LiteralPath $local).LastWriteTime = (Get-Date).AddDays(-2)
  $remote = Join-Path $drive 'Diagrams/zz-sync-test.txt'
  Set-Content -LiteralPath $remote -Value 'newer edit on Drive'
  & powershell -NoProfile -File $script -Push -Apply -DriveDir $drive | Out-Null
  Check 'newer destination file blocks -Apply (exit 2)' ($LASTEXITCODE -eq 2)
  Check 'newer destination file is kept' ((Get-Content -LiteralPath $remote) -eq 'newer edit on Drive')
  & powershell -NoProfile -File $script -Push -Apply -Force -DriveDir $drive | Out-Null
  Check '-Force overwrites it (exit 0)' ($LASTEXITCODE -eq 0 -and (Get-Content -LiteralPath $remote) -eq 'old')
} finally {
  Remove-Item -LiteralPath $local -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $drive -Recurse -Force -ErrorAction SilentlyContinue
}
exit $fail

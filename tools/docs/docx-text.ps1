# Writes every paragraph of a .docx (body and tables) to a UTF-8 text file, one per line. Reads the XML, no Word.
#   powershell -File tools/docs/docx-text.ps1 -Path <docx> -Out <txt>
param([Parameter(Mandatory)] [string]$Path, [Parameter(Mandatory)] [string]$Out)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\docx-xml.ps1"
$x = Read-DocxXml $Path
$lines = @(Get-DocxParagraphs $x | ForEach-Object { $_.Text })
$full = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Out)
[System.IO.File]::WriteAllLines($full, [string[]]$lines, (New-Object System.Text.UTF8Encoding $false))

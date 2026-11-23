# Captures the heading outline of a school template (Heading1-4, in order) as JSON, before the template is filled
# in place. check-docx.ps1 later checks a filled document against it.
#   powershell -File tools/docs/outline.ps1 -Path "docs/SEP490_Report/Report1_Project Introduction.docx" -Out tools/docs/outlines/Report1.json
param([Parameter(Mandatory)] [string]$Path, [Parameter(Mandatory)] [string]$Out)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\docx-xml.ps1"
$Out = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Out)
$x = Read-DocxXml $Path
$headings = @(Get-DocxParagraphs $x | Where-Object { $_.Style -match '^Heading[1-4]$' -and $_.Text } |
    ForEach-Object { [ordered]@{ level = [int]$_.Style.Substring(7); text = $_.Text; placeholder = [bool]($_.Text -match $script:Placeholders -or $_.Text.EndsWith([string][char]0x2026) -or $_.Text.EndsWith('...')) } })
New-Item -ItemType Directory -Force (Split-Path $Out) | Out-Null
[System.IO.File]::WriteAllText($Out, (ConvertTo-Json @($headings) -Depth 3), (New-Object System.Text.UTF8Encoding($false)))
"{0}: {1} headings ({2} placeholders)" -f (Split-Path $Path -Leaf), $headings.Count, @($headings | Where-Object { $_.placeholder }).Count

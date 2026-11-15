# Production's AI assistant on this machine's Ollama (ADR-28): Ollama -> key-checking proxy -> ngrok tunnel.
# See infra/assistant/README.md. Run from the repository root:
#
#   powershell -ExecutionPolicy Bypass -File infra/assistant/start-assistant.ps1 -Domain <name>.ngrok-free.app   (first time)
#   powershell -ExecutionPolicy Bypass -File infra/assistant/start-assistant.ps1           (then: remembers the domain)
#   powershell -ExecutionPolicy Bypass -File infra/assistant/start-assistant.ps1 -Stop     (stops the proxy and the tunnel)
#   powershell -ExecutionPolicy Bypass -File infra/assistant/start-assistant.ps1 -ShowSettings
#
# The key and the domain live in %USERPROFILE%\.campusstay\assistant.env, never in the repository.
param(
    [string]$Domain,
    [string]$Model = 'qwen2.5:7b',
    [int]$Port = 8081,
    [switch]$Stop,
    [switch]$ShowSettings
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$settingsDir = Join-Path $env:USERPROFILE '.campusstay'
$settingsFile = Join-Path $settingsDir 'assistant.env'
$ollama = 'http://127.0.0.1:11434'

function Read-Settings {
    $s = @{}
    if (Test-Path $settingsFile) {
        Get-Content $settingsFile | Where-Object { $_ -match '^\s*([A-Z_]+)=(.*)$' } | ForEach-Object { $s[$Matches[1]] = $Matches[2].Trim() }
    }
    $s
}

function Write-Settings($s) {
    New-Item -ItemType Directory -Force $settingsDir | Out-Null
    $s.GetEnumerator() | Sort-Object Name | ForEach-Object { "$($_.Name)=$($_.Value)" } | Set-Content -Encoding ascii $settingsFile
}

function Stop-Ours {
    $ours = Get-CimInstance Win32_Process | Where-Object {
        ($_.Name -eq 'node.exe' -and $_.CommandLine -like '*ollama-proxy.mjs*') -or
        ($_.Name -eq 'ngrok.exe' -and $_.CommandLine -like "*http*$Port*")
    }
    foreach ($p in $ours) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue; Write-Host "stopped $($p.Name) ($($p.ProcessId))" }
    if (-not $ours) { Write-Host 'Nothing to stop.' }
}

function Show-ServerSettings($s) {
    Write-Host ''
    Write-Host 'Settings for the production server (/opt/campusstay/.env, then restart the api container):' -ForegroundColor Cyan
    Write-Host "  ASSISTANT_BASE_URL=https://$($s.NGROK_DOMAIN)"
    Write-Host "  ASSISTANT_API_KEY=$($s.OLLAMA_PROXY_KEY)"
    Write-Host "  ASSISTANT_MODEL=$Model"
    Write-Host 'Keep the key secret: never commit it.' -ForegroundColor Yellow
}

if ($Stop) { Stop-Ours; exit 0 }

# ---------------------------------------------------------------- settings
$s = Read-Settings
if (-not $s.OLLAMA_PROXY_KEY) {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $s.OLLAMA_PROXY_KEY = -join ($bytes | ForEach-Object { $_.ToString('x2') })
    Write-Host "Created a new key in $settingsFile"
}
if ($Domain) { $s.NGROK_DOMAIN = $Domain -replace '^https?://', '' -replace '/+$', '' }
if (-not $s.NGROK_DOMAIN) {
    throw 'Give your ngrok static domain once: -Domain <name>.ngrok-free.app (ngrok dashboard > Domains).'
}
Write-Settings $s
if ($ShowSettings) { Show-ServerSettings $s; exit 0 }

foreach ($tool in 'ollama', 'ngrok', 'node') {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "$tool is not installed (see infra/assistant/README.md)." }
}

# ---------------------------------------------------------------- Ollama
function Test-Ollama { try { Invoke-RestMethod "$ollama/api/tags" -TimeoutSec 3 } catch { $null } }
$tags = Test-Ollama
if (-not $tags) {
    Write-Host 'Starting Ollama...'
    Start-Process ollama -ArgumentList 'serve' -WindowStyle Minimized
    for ($i = 0; $i -lt 30 -and -not $tags; $i++) { Start-Sleep 1; $tags = Test-Ollama }
    if (-not $tags) { throw 'Ollama did not start: open the Ollama app, then run this again.' }
}
if (-not ($tags.models.name -contains $Model)) { throw "The model $Model is missing: run  ollama pull $Model" }

Write-Host "Loading $Model (the first answer of the day is the slow one)..."
$warm = @{ model = $Model; stream = $false; keep_alive = '2h'; messages = @(@{ role = 'user'; content = 'Xin chào' }) } | ConvertTo-Json -Depth 4
$t = Measure-Command { Invoke-RestMethod "$ollama/api/chat" -Method Post -Body ([Text.Encoding]::UTF8.GetBytes($warm)) -ContentType 'application/json' -TimeoutSec 300 | Out-Null }
Write-Host ("Model ready ({0:N0} s)." -f $t.TotalSeconds)

# ---------------------------------------------------------------- proxy and tunnel
Stop-Ours | Out-Null
$env:OLLAMA_PROXY_KEY = $s.OLLAMA_PROXY_KEY
$env:PROXY_PORT = "$Port"
Start-Process node -ArgumentList "`"$(Join-Path $here 'ollama-proxy.mjs')`"" -WindowStyle Normal
Start-Sleep 2
Start-Process ngrok -ArgumentList "http $Port --url=https://$($s.NGROK_DOMAIN)" -WindowStyle Normal
Remove-Item Env:OLLAMA_PROXY_KEY

# ---------------------------------------------------------------- self-test through the tunnel
# ngrok's free plan puts a warning page in front of browser-like clients, and Windows PowerShell calls itself
# "Mozilla/…"; the header skips it. The backend's Java client is not browser-like and is not stopped.
$public = "https://$($s.NGROK_DOMAIN)"
$skip = @{ 'ngrok-skip-browser-warning' = 'true' }
$ok = $false
for ($i = 0; $i -lt 15 -and -not $ok; $i++) {
    Start-Sleep 2
    try {
        $r = Invoke-RestMethod "$public/api/tags" -Headers ($skip + @{ Authorization = "Bearer $($s.OLLAMA_PROXY_KEY)" }) -TimeoutSec 10
        $ok = $r.models.name -contains $Model
    } catch { }
}
if (-not $ok) {
    throw "The tunnel does not answer at $public. Check the ngrok window (authtoken set? domain yours?)."
}
try {
    Invoke-RestMethod "$public/api/tags" -Headers $skip -TimeoutSec 10 | Out-Null
    throw 'The tunnel answered WITHOUT the key: stop and check the proxy.'
} catch [System.Net.WebException] {
    if ([int]$_.Exception.Response.StatusCode -ne 401) { throw }
}
Write-Host "Assistant reachable at $public with the key, and refused without it." -ForegroundColor Green
Show-ServerSettings $s
Write-Host ''
Write-Host 'Keep this machine awake and online while people use the assistant. Stop: -Stop' -ForegroundColor Cyan

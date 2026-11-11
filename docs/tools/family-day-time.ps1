# Family Day manual tests on a LOCAL database only (docs/tests/Family_Day_Manual_Test.md).
# Moves the time of the newest Family Day so testers need not wait for the clock, and prints the guests' passes
# (what the QR holds) so a desk without a camera can paste them like a handheld scanner.
#
#   powershell -ExecutionPolicy Bypass -File docs/tools/family-day-time.ps1 show       # times of the newest Family Day
#   powershell -ExecutionPolicy Bypass -File docs/tools/family-day-time.ps1 slot-now   # its slots started 10 min ago, end in 1 h
#   powershell -ExecutionPolicy Bypass -File docs/tools/family-day-time.ps1 slot-over  # its slots ended 1 h ago
#   powershell -ExecutionPolicy Bypass -File docs/tools/family-day-time.ps1 passes     # each guest's pass
#
# The database: the Docker container of infra/docker-compose.yml (campusstay-db-1) when it runs, otherwise a
# PostgreSQL installed on Windows (psql on the PATH or under C:\Program Files\PostgreSQL). User and password:
# DB_USER / DB_PASSWORD, default campusstay / campusstay as in application.yml.
param([Parameter(Mandatory = $true)][ValidateSet('show', 'slot-now', 'slot-over', 'passes')][string]$Action)

$ErrorActionPreference = 'Stop'
$user = if ($env:DB_USER) { $env:DB_USER } else { 'campusstay' }
$password = if ($env:DB_PASSWORD) { $env:DB_PASSWORD } else { 'campusstay' }
$latest = '(SELECT max(id) FROM vis_family_day)'
$local = "AT TIME ZONE 'Asia/Ho_Chi_Minh'"

$times = "SELECT d.id, d.title, d.status, to_char(d.registration_closes_at $local, 'DD/MM HH24:MI') AS registration_closes, " +
    "to_char(s.starts_at $local, 'DD/MM HH24:MI') AS slot_starts, to_char(s.ends_at $local, 'DD/MM HH24:MI') AS slot_ends, " +
    "s.capacity, s.booked FROM vis_family_day d JOIN vis_time_slot s ON s.family_day_id = d.id WHERE d.id = $latest ORDER BY s.starts_at;"

$sql = switch ($Action) {
    'show' { $times }
    'slot-now' {
        # Registration closes before the first slot (the API's rule), so it closes a minute ago.
        "UPDATE vis_time_slot SET starts_at = now() - interval '10 minutes', ends_at = now() + interval '1 hour' WHERE family_day_id = $latest; " +
        "UPDATE vis_family_day SET registration_opens_at = LEAST(registration_opens_at, now() - interval '1 hour'), " +
        "registration_closes_at = now() - interval '1 minute' WHERE id = $latest; " + $times
    }
    'slot-over' {
        "UPDATE vis_time_slot SET starts_at = now() - interval '3 hours', ends_at = now() - interval '1 hour' WHERE family_day_id = $latest; " +
        "UPDATE vis_family_day SET registration_opens_at = LEAST(registration_opens_at, now() - interval '4 hours'), " +
        "registration_closes_at = LEAST(registration_closes_at, now() - interval '3 hours') WHERE id = $latest; " + $times
    }
    'passes' {
        "SELECT u.email AS student, v.full_name AS guest, v.status, v.pass_token AS pass FROM vis_visitor v " +
        "JOIN vis_registration r ON r.id = v.registration_id JOIN auth_user u ON u.id = r.student_id " +
        "WHERE r.family_day_id = $latest ORDER BY r.id, v.id;"
    }
}

# Both may run at once (a PostgreSQL service on Windows and the Docker container): use the one whose schema has
# Family Day, i.e. the one the backend migrated.
$probe = "SELECT to_regclass('vis_family_day') IS NOT NULL;"
$ErrorActionPreference = 'Continue'

$psql = (Get-Command psql -ErrorAction SilentlyContinue).Source
if (-not $psql) {
    $psql = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\psql.exe' -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
}
if ($psql) {
    $env:PGPASSWORD = $password
    $found = & $psql -h localhost -U $user -d campusstay -tAc $probe 2>$null
    if ("$found".Trim() -eq 't') {
        & $psql -h localhost -U $user -d campusstay -c $sql
        exit $LASTEXITCODE
    }
}

$container = docker ps --filter 'name=campusstay-db-1' --format '{{.Names}}' 2>$null
if ($container) {
    $found = docker exec -e "PGPASSWORD=$password" $container psql -U $user -d campusstay -tAc $probe 2>$null
    if ("$found".Trim() -eq 't') {
        docker exec -e "PGPASSWORD=$password" $container psql -U $user -d campusstay -c $sql
        exit $LASTEXITCODE
    }
}

Write-Error 'No database with Family Day found: start the backend once (it creates the tables), on Docker (docker compose -f infra/docker-compose.yml --profile app up -d) or on a local PostgreSQL.'
exit 1

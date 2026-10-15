<#
.SYNOPSIS
    Start PITWALL for a race. One command, production bundle, live timing on.

.DESCRIPTION
    Race day should not mean two terminals, a venv activate and remembering
    which port is which. This does the lot from a cold start:

      1. creates the backend venv and installs runtime deps if they are missing
      2. installs frontend deps if they are missing
      3. builds the frontend and serves it from the backend, single origin
      4. starts the backend with live timing enabled
      5. prints the URL and when the next session starts

    It serves the PRODUCTION BUNDLE, not the dev server, and that is the point:
    two phases running of bugs appeared only in the built bundle served
    single-origin — stale state leaking under a replay, a store handle that
    does not exist outside dev. Watching a race on the dev server means
    watching something subtly different from what was tested.

    Live timing works from here and only from here. F1 returns 403 to
    datacenter IP ranges, so the deployed site cannot stream a session; it
    serves the replay instead.

.PARAMETER Port
    Port to serve on. Default 8000.

.PARAMETER SkipBuild
    Reuse the existing bundle. Only for restarting within a session — a stale
    bundle is exactly the problem this script exists to avoid.

.PARAMETER NoBrowser
    Do not open a browser window.

.EXAMPLE
    .\race-day.ps1
#>
[CmdletBinding()]
param(
    [int]$Port = 8000,
    [switch]$SkipBuild,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$root     = $PSScriptRoot
$backend  = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'
$venvPy   = Join-Path $backend '.venv\Scripts\python.exe'

function Say([string]$msg, [string]$colour = 'Gray') { Write-Host $msg -ForegroundColor $colour }
function Step([string]$msg) { Write-Host "`n[ $msg ]" -ForegroundColor Cyan }

Write-Host ''
Write-Host '  PITWALL  ' -ForegroundColor White -BackgroundColor DarkRed -NoNewline
Write-Host '  race day' -ForegroundColor DarkGray
Write-Host ''

# ── 0. Is the port already ours? ──────────────────────────────────────────
$busy = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($busy) {
    $owner = (Get-Process -Id $busy[0].OwningProcess -ErrorAction SilentlyContinue).ProcessName
    Say "Port $Port is already in use by '$owner' (PID $($busy[0].OwningProcess))." 'Yellow'
    $answer = Read-Host 'Stop it and continue? [y/N]'
    if ($answer -match '^(y|yes)$') {
        Stop-Process -Id $busy[0].OwningProcess -Force
        Start-Sleep -Seconds 2
        Say 'Stopped.' 'DarkGray'
    } else {
        Say 'Leaving it alone. Pass -Port to use a different one.' 'Yellow'
        exit 1
    }
}

# ── 1. Backend environment ────────────────────────────────────────────────
Step 'Backend'
if (-not (Test-Path $venvPy)) {
    Say 'Creating virtual environment (first run only)...' 'DarkGray'
    $py = (Get-Command python -ErrorAction SilentlyContinue)
    if (-not $py) { throw 'python not found on PATH. Install Python 3.11+ and try again.' }
    & python -m venv (Join-Path $backend '.venv')
}

# requirements.txt is runtime only; FastF1 lives in requirements-build.txt and
# is not needed to watch a race.
$marker = Join-Path $backend '.venv\.deps-installed'
$reqs   = Join-Path $backend 'requirements.txt'
$stale  = (-not (Test-Path $marker)) -or
          ((Get-Item $reqs).LastWriteTime -gt (Get-Item $marker -ErrorAction SilentlyContinue).LastWriteTime)
if ($stale) {
    Say 'Installing backend dependencies...' 'DarkGray'
    & $venvPy -m pip install --quiet --upgrade pip
    & $venvPy -m pip install --quiet -r $reqs
    if ($LASTEXITCODE -ne 0) { throw 'pip install failed.' }
    New-Item -ItemType File -Path $marker -Force | Out-Null
}
Say 'Backend ready.' 'Green'

# ── 2. Frontend bundle ────────────────────────────────────────────────────
Step 'Frontend'
$dist   = Join-Path $frontend 'dist'
$static = Join-Path $backend 'static_frontend'

if ($SkipBuild) {
    if (-not (Test-Path (Join-Path $static 'index.html'))) {
        throw '-SkipBuild was passed but there is no bundle to serve. Run without it once.'
    }
    Say 'Reusing the existing bundle (-SkipBuild).' 'Yellow'
} else {
    if (-not (Test-Path (Join-Path $frontend 'node_modules'))) {
        Say 'Installing frontend dependencies (first run only, a few minutes)...' 'DarkGray'
        Push-Location $frontend
        try { & npm install --silent; if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' } }
        finally { Pop-Location }
    }

    Say 'Building the production bundle...' 'DarkGray'
    Push-Location $frontend
    try {
        # Same origin as the backend, so no CORS and no second port. The URL is
        # relative at runtime, so this works whichever port was chosen.
        $env:VITE_API_URL = "http://localhost:$Port"
        $env:VITE_WS_URL  = "ws://localhost:$Port/ws"
        & npm run build --silent
        if ($LASTEXITCODE -ne 0) { throw 'vite build failed.' }
    } finally {
        Pop-Location
        Remove-Item Env:VITE_API_URL, Env:VITE_WS_URL -ErrorAction SilentlyContinue
    }

    if (Test-Path $static) { Remove-Item $static -Recurse -Force }
    Copy-Item $dist $static -Recurse
    Say 'Bundle built and staged.' 'Green'
}

# ── 3. Next session ───────────────────────────────────────────────────────
Step 'Schedule'
$nextLine = 'Could not reach the calendar — the app will still show it.'
try {
    $cal = Invoke-RestMethod -Uri 'https://api.jolpi.ca/ergast/f1/2026.json?limit=30' -TimeoutSec 8
    $now = (Get-Date).ToUniversalTime()
    $soonest = $null
    foreach ($race in $cal.MRData.RaceTable.Races) {
        $slots = @(
            @{ n = 'FP1';        d = $race.FirstPractice.date;    t = $race.FirstPractice.time },
            @{ n = 'FP2';        d = $race.SecondPractice.date;   t = $race.SecondPractice.time },
            @{ n = 'FP3';        d = $race.ThirdPractice.date;    t = $race.ThirdPractice.time },
            @{ n = 'SPRINT QUALI'; d = $race.SprintQualifying.date; t = $race.SprintQualifying.time },
            @{ n = 'SPRINT';     d = $race.Sprint.date;           t = $race.Sprint.time },
            @{ n = 'QUALIFYING'; d = $race.Qualifying.date;       t = $race.Qualifying.time },
            @{ n = 'RACE';       d = $race.date;                  t = $race.time }
        )
        foreach ($s in $slots) {
            if (-not $s.d -or -not $s.t) { continue }
            $when = [datetime]::Parse("$($s.d)T$($s.t)", $null, 'AdjustToUniversal,AssumeUniversal')
            if ($when -gt $now -and (-not $soonest -or $when -lt $soonest.when)) {
                $soonest = @{ when = $when; name = $s.n; race = $race.raceName }
            }
        }
    }
    if ($soonest) {
        $local = $soonest.when.ToLocalTime()
        $delta = $soonest.when - $now
        $away  = if ($delta.TotalHours -lt 1) { '{0}m' -f [int]$delta.TotalMinutes }
                 elseif ($delta.TotalDays -lt 1) { '{0}h {1}m' -f [int]$delta.TotalHours, $delta.Minutes }
                 else { '{0}d {1}h' -f [int]$delta.TotalDays, $delta.Hours }
        $nextLine = '{0} - {1}   {2}   (in {3})' -f `
            $soonest.race.Replace(' Grand Prix', ' GP'), $soonest.name,
            $local.ToString('ddd dd MMM HH:mm'), $away
    }
} catch {
    # Offline, or Jolpica is down. Not a reason to refuse to start.
}
Say $nextLine 'White'

# ── 4. Go ─────────────────────────────────────────────────────────────────
Step 'Starting'
$url = "http://localhost:$Port"
Write-Host ''
Write-Host "  Open:  " -NoNewline -ForegroundColor DarkGray
Write-Host $url -ForegroundColor White
Write-Host '  Live timing is enabled. This machine can reach F1 feed;' -ForegroundColor DarkGray
Write-Host '  the deployed site cannot, and offers the replay instead.' -ForegroundColor DarkGray
Write-Host '  Ctrl+C to stop.' -ForegroundColor DarkGray
Write-Host ''

if (-not $NoBrowser) {
    # Opened on a delay so the first request lands after uvicorn is listening.
    Start-Job -ScriptBlock {
        param($u)
        Start-Sleep -Seconds 3
        Start-Process $u
    } -ArgumentList $url | Out-Null
}

Push-Location $backend
try {
    # One worker on purpose: the SignalR client and its broadcast queue are
    # per-process, so a second worker opens a second upstream connection and
    # serves a different view of the same session.
    & $venvPy -m uvicorn main:app --host 0.0.0.0 --port $Port --workers 1
} finally {
    Pop-Location
    Get-Job -ErrorAction SilentlyContinue | Remove-Job -Force -ErrorAction SilentlyContinue
}

<#
.SYNOPSIS
    Captures all 5 store screenshots on Windows at 1280x800.

.DESCRIPTION
    Orchestrates the full screenshot capture pipeline:
      1. Seeds the database with consistent demo data
      2. Starts the server and web client
      3. Runs the Playwright capture script
      4. Verifies all 5 screenshots exist

    Run from the project root after building the web client.

.PARAMETER SkipSeed
    Skip the database seeding step (use if data is already seeded).

.PARAMETER BaseUrl
    Override the base URL (default: http://localhost:5173).

.EXAMPLE
    .\scripts\screenshots\capture-windows.ps1
    .\scripts\screenshots\capture-windows.ps1 -SkipSeed
#>

param(
    [switch]$SkipSeed,
    [string]$BaseUrl = 'http://localhost:5173'
)

$ErrorActionPreference = 'Continue'
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$PROJECT_ROOT = Resolve-Path (Join-Path $SCRIPT_DIR '..\..')
$OUTPUT_DIR = Join-Path $SCRIPT_DIR 'output\windows'

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host " ThreadVerse — Windows Screenshot Capture" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# ── 1. Seed database ─────────────────────────────────────────────────────────
if (-not $SkipSeed) {
    Write-Host "--- Step 1: Seeding database ---" -ForegroundColor Yellow
    Push-Location (Join-Path $PROJECT_ROOT 'packages\server')
    node src\scripts\seedScreenshots.js
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[FAIL] Seed script failed" -ForegroundColor Red
        Pop-Location
        exit 1
    }
    Pop-Location
    Write-Host "[PASS] Database seeded`n" -ForegroundColor Green
} else {
    Write-Host "[SKIP] Seed step skipped`n" -ForegroundColor Yellow
}

# ── 2. Start server (background) ─────────────────────────────────────────────
Write-Host "--- Step 2: Starting server ---" -ForegroundColor Yellow
$serverProc = Start-Process -FilePath 'node' -ArgumentList 'src\main.mjs' `
    -WorkingDirectory (Join-Path $PROJECT_ROOT 'packages\server') `
    -PassThru -NoNewWindow
Write-Host "  Server PID: $($serverProc.Id)"

# Wait for server to be ready
$maxWait = 15
for ($i = 0; $i -lt $maxWait; $i++) {
    Start-Sleep -Seconds 1
    try {
        $response = Invoke-WebRequest -Uri "$BaseUrl/api/health" -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            Write-Host "[PASS] Server is ready" -ForegroundColor Green
            break
        }
    } catch {}
    if ($i -eq ($maxWait - 1)) {
        Write-Host "[WARN] Server may not be fully ready, proceeding anyway" -ForegroundColor Yellow
    }
}

# ── 3. Start web client (background) ─────────────────────────────────────────
Write-Host "`n--- Step 3: Starting web client ---" -ForegroundColor Yellow
$webProc = Start-Process -FilePath 'pnpm' -ArgumentList '--filter web dev' `
    -WorkingDirectory $PROJECT_ROOT `
    -PassThru -NoNewWindow
Write-Host "  Web PID: $($webProc.Id)"

# Wait for Vite to be ready
$maxWait = 30
for ($i = 0; $i -lt $maxWait; $i++) {
    Start-Sleep -Seconds 1
    try {
        $response = Invoke-WebRequest -Uri $BaseUrl -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            Write-Host "[PASS] Web client is ready" -ForegroundColor Green
            break
        }
    } catch {}
    if ($i -eq ($maxWait - 1)) {
        Write-Host "[WARN] Web client may not be fully ready, proceeding anyway" -ForegroundColor Yellow
    }
}

# ── 4. Run capture script ────────────────────────────────────────────────────
Write-Host "`n--- Step 4: Capturing screenshots ---" -ForegroundColor Yellow

# Ensure Playwright is installed
Push-Location $PROJECT_ROOT
npx playwright install chromium 2>&1 | Out-Null
Pop-Location

# Run the capture
Push-Location $PROJECT_ROOT
node scripts\screenshots\captureScreenshots.js --platform windows --base-url $BaseUrl
$captureExit = $LASTEXITCODE
Pop-Location

# ── 5. Verify output ─────────────────────────────────────────────────────────
Write-Host "`n--- Step 5: Verifying output ---" -ForegroundColor Yellow
$required = @(
    '01-home-feed.png',
    '02-community-page.png',
    '03-ai-chat.png',
    '04-admin-dashboard.png',
    '05-settings.png'
)

$allPresent = $true
foreach ($f in $required) {
    $path = Join-Path $OUTPUT_DIR $f
    if (Test-Path $path) {
        $size = (Get-Item $path).Length
        Write-Host "  [OK] $f  ($([math]::Round($size / 1024)) KB)" -ForegroundColor Green
    } else {
        Write-Host "  [MISSING] $f" -ForegroundColor Red
        $allPresent = $false
    }
}

# ── Cleanup ──────────────────────────────────────────────────────────────────
Write-Host "`n--- Cleaning up background processes ---" -ForegroundColor Yellow
if ($serverProc -and !$serverProc.HasExited) {
    Stop-Process -Id $serverProc.Id -Force -ErrorAction SilentlyContinue
    Write-Host "  Stopped server (PID $($serverProc.Id))"
}
if ($webProc -and !$webProc.HasExited) {
    Stop-Process -Id $webProc.Id -Force -ErrorAction SilentlyContinue
    Write-Host "  Stopped web client (PID $($webProc.Id))"
}

# ── Summary ──────────────────────────────────────────────────────────────────
Write-Host "`n========================================" -ForegroundColor Cyan
if ($allPresent -and $captureExit -eq 0) {
    Write-Host " ALL 5 WINDOWS SCREENSHOTS CAPTURED" -ForegroundColor Green
    Write-Host " Output: $OUTPUT_DIR" -ForegroundColor Green
} else {
    Write-Host " CAPTURE INCOMPLETE — check errors above" -ForegroundColor Red
    exit 1
}
Write-Host "========================================`n" -ForegroundColor Cyan

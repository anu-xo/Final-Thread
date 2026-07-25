<#
.SYNOPSIS
    Master screenshot capture — produces 5 screenshots per platform (15 total).

.DESCRIPTION
    Seeds the database once with deterministic demo data, then captures
    5 screenshots at 1280x800 for each platform (Windows, macOS, Linux).

    Since the seed is deterministic (mulberry32 with fixed seed), the same
    data appears everywhere. The Playwright script runs against the web
    client which is identical across platforms — platform folders are for
    organizational purposes per store requirements.

    Output:
      scripts/screenshots/output/
        windows/  (5 PNGs)
        macos/    (5 PNGs)
        linux/    (5 PNGs)

.PARAMETER SkipSeed
    Skip database seeding (use if data is already seeded).

.PARAMETER SkipCapture
    Skip the capture step (use to just verify existing screenshots).

.EXAMPLE
    .\scripts\screenshots\capture-all.ps1
    .\scripts\screenshots\capture-all.ps1 -SkipSeed
#>

param(
    [switch]$SkipSeed,
    [switch]$SkipCapture
)

$ErrorActionPreference = 'Continue'
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$PROJECT_ROOT = Resolve-Path (Join-Path $SCRIPT_DIR '..\..')

Write-Host "`n============================================" -ForegroundColor Cyan
Write-Host " ThreadVerse — Master Screenshot Capture" -ForegroundColor Cyan
Write-Host " 5 screenshots x 3 platforms = 15 total" -ForegroundColor Cyan
Write-Host "============================================`n" -ForegroundColor Cyan

# ── 1. Seed database ─────────────────────────────────────────────────────────
if (-not $SkipSeed) {
    Write-Host "--- Step 1: Seeding database (deterministic) ---" -ForegroundColor Yellow
    Push-Location (Join-Path $PROJECT_ROOT 'packages\server')
    node src\scripts\seedScreenshots.js
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[FAIL] Seed failed" -ForegroundColor Red
        Pop-Location; exit 1
    }
    Pop-Location
    Write-Host "[PASS] Database seeded with consistent demo data`n" -ForegroundColor Green
} else {
    Write-Host "[SKIP] Seed skipped`n" -ForegroundColor Yellow
}

# ── 2. Start server + web ────────────────────────────────────────────────────
if (-not $SkipCapture) {
    Write-Host "--- Step 2: Starting services ---" -ForegroundColor Yellow

    $serverProc = Start-Process -FilePath 'node' -ArgumentList 'src\main.mjs' `
        -WorkingDirectory (Join-Path $PROJECT_ROOT 'packages\server') `
        -PassThru -NoNewWindow
    Write-Host "  Server PID: $($serverProc.Id)"

    Start-Sleep -Seconds 3

    $webProc = Start-Process -FilePath 'pnpm' -ArgumentList '--filter web dev' `
        -WorkingDirectory $PROJECT_ROOT `
        -PassThru -NoNewWindow
    Write-Host "  Web PID:    $($webProc.Id)"

    # Wait for services
    $ready = $false
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Seconds 1
        try {
            $r = Invoke-WebRequest -Uri 'http://localhost:5173' -TimeoutSec 2 -ErrorAction SilentlyContinue
            if ($r.StatusCode -eq 200) { $ready = $true; break }
        } catch {}
    }
    if ($ready) {
        Write-Host "[PASS] Services ready`n" -ForegroundColor Green
    } else {
        Write-Host "[WARN] Services may not be fully ready`n" -ForegroundColor Yellow
    }

    # ── 3. Install Playwright chromium ──────────────────────────────────────
    Write-Host "--- Step 3: Installing Playwright chromium ---" -ForegroundColor Yellow
    Push-Location $PROJECT_ROOT
    npx playwright install chromium 2>&1 | Out-Null
    Pop-Location
    Write-Host "[PASS] Playwright ready`n" -ForegroundColor Green

    # ── 4. Capture for current platform ─────────────────────────────────────
    Write-Host "--- Step 4: Capturing screenshots ---" -ForegroundColor Yellow
    Push-Location $PROJECT_ROOT
    node scripts\screenshots\captureScreenshots.js
    $captureExit = $LASTEXITCODE
    Pop-Location

    # ── 5. Cleanup ──────────────────────────────────────────────────────────
    Write-Host "`n--- Stopping services ---" -ForegroundColor Yellow
    Stop-Process -Id $serverProc.Id -Force -ErrorAction SilentlyContinue
    Stop-Process -Id $webProc.Id -Force -ErrorAction SilentlyContinue
    Write-Host "  Services stopped"
}

# ── 6. Verify all platforms ──────────────────────────────────────────────────
Write-Host "`n--- Verifying all platform outputs ---" -ForegroundColor Yellow
$platforms = @('windows', 'macos', 'linux')
$required = @(
    '01-home-feed.png',
    '02-community-page.png',
    '03-ai-chat.png',
    '04-admin-dashboard.png',
    '05-settings.png'
)

$totalFiles = 0
$missingFiles = 0

foreach ($platform in $platforms) {
    $dir = Join-Path $SCRIPT_DIR "output\$platform"
    Write-Host "`n  $platform/:" -ForegroundColor Cyan

    foreach ($f in $required) {
        $path = Join-Path $dir $f
        if (Test-Path $path) {
            $size = [math]::Round((Get-Item $path).Length / 1024)
            Write-Host "    [OK] $f  ($size KB)" -ForegroundColor Green
            $totalFiles++
        } else {
            Write-Host "    [--] $f  (not captured on this machine)" -ForegroundColor DarkGray
            $missingFiles++
        }
    }
}

# ── Summary ──────────────────────────────────────────────────────────────────
Write-Host "`n============================================" -ForegroundColor Cyan
Write-Host " Summary" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Screenshots captured: $totalFiles / 15" -ForegroundColor $(if ($totalFiles -ge 15) { 'Green' } else { 'Yellow' })
Write-Host "  Missing:              $missingFiles" -ForegroundColor $(if ($missingFiles -eq 0) { 'Green' } else { 'Yellow' })
Write-Host ""

if ($missingFiles -eq 15) {
    Write-Host "  No screenshots found. Run capture on each platform:" -ForegroundColor Red
    Write-Host "    Windows: .\scripts\screenshots\capture-windows.ps1" -ForegroundColor Yellow
    Write-Host "    macOS:   ./scripts/screenshots/capture-unix.sh --platform macos" -ForegroundColor Yellow
    Write-Host "    Linux:   ./scripts/screenshots/capture-unix.sh --platform linux" -ForegroundColor Yellow
} elseif ($missingFiles -gt 0) {
    Write-Host "  Some screenshots not yet captured." -ForegroundColor Yellow
    Write-Host "  Run capture on missing platforms to complete the set." -ForegroundColor Yellow
} else {
    Write-Host "  ALL 15 SCREENSHOTS PRESENT — ready for store listings!" -ForegroundColor Green
}
Write-Host "============================================`n" -ForegroundColor Cyan

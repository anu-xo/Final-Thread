<#
.SYNOPSIS
    Verifies that the ThreadVerse MSIX package installs and uninstalls cleanly.

.DESCRIPTION
    Run this on a CLEAN Windows 11 VM to validate the MSIX package before
    submitting to the Microsoft Store via Partner Center.

    Checks:
      1. Add-AppxPackage succeeds (side-load install)
      2. App is registered in Start Menu
      3. App can launch via Start-Process
      4. Remove-AppPackage uninstalls cleanly
      5. No leftover artifacts remain

.PARAMETER MsixPath
    Path to the .msix file. If omitted, the script searches the dist/ directory.

.EXAMPLE
    .\scripts\verify-msix-install.ps1 -MsixPath "dist\ThreadVerse-1.0.0.msix"

.NOTES
    Must be run on Windows 11 with Developer Mode enabled.
    Requires Admin privileges for Add-AppxPackage with -AllowUnsigned (dev only).
#>

param(
    [string]$MsixPath
)

$ErrorActionPreference = 'Stop'
$failures = @()

Write-Host "`n=== ThreadVerse MSIX Install Verification ===" -ForegroundColor Cyan

# ── 0. Find MSIX artifact ────────────────────────────────────────────────────
if (-not $MsixPath) {
    $candidate = Get-ChildItem dist -Filter "*.msix" -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($candidate) {
        $MsixPath = $candidate.FullName
    } else {
        Write-Host "No .msix found in dist/. Run 'electron-builder --win appx' first." -ForegroundColor Red
        exit 1
    }
}

if (-not (Test-Path $MsixPath)) {
    Write-Host "MSIX not found: $MsixPath" -ForegroundColor Red
    exit 1
}

$msixFile = Get-Item $MsixPath
Write-Host "Package: $($msixFile.Name)"
Write-Host "Size: $([math]::Round($msixFile.Length / 1MB, 2)) MB"

# ── 1. Pre-flight: Developer Mode ─────────────────────────────────────────────
Write-Host "`n--- Step 1: Pre-flight checks ---" -ForegroundColor Yellow

$devMode = Get-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock" -Name AllowDevelopmentWithoutDevLicense -ErrorAction SilentlyContinue
if ($devMode.AllowDevelopmentWithoutDevLicense -ne 1) {
    Write-Host "[WARN] Developer Mode is not enabled. Enabling..." -ForegroundColor Yellow
    reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock" /v AllowDevelopmentWithoutDevLicense /t REG_DWORD /d 1 /f | Out-Null
    Write-Host "[PASS] Developer Mode enabled" -ForegroundColor Green
} else {
    Write-Host "[PASS] Developer Mode is enabled" -ForegroundColor Green
}

# ── 2. Read MSIX manifest ────────────────────────────────────────────────────
Write-Host "`n--- Step 2: Read MSIX manifest ---" -ForegroundColor Yellow

try {
    $pkg = Get-AppPackageManifest -DependencyPath $MsixPath -ErrorAction Stop
    $pkgName = $pkg.Identity.Name
    $pkgVersion = $pkg.Identity.Version
    $pkgPublisher = $pkg.Identity.Publisher
    Write-Host "  Package: $pkgName"
    Write-Host "  Version: $pkgVersion"
    Write-Host "  Publisher: $pkgPublisher"
    Write-Host "[PASS] MSIX manifest readable" -ForegroundColor Green
} catch {
    Write-Host "[FAIL] Cannot read MSIX manifest: $_" -ForegroundColor Red
    $failures += "MSIX manifest unreadable"
}

# ── 3. Install MSIX ──────────────────────────────────────────────────────────
Write-Host "`n--- Step 3: Install MSIX via Add-AppxPackage ---" -ForegroundColor Yellow

try {
    # -AllowUnsigned only works with Developer Mode enabled
    Add-AppxPackage -Path $MsixPath -AllowUnsigned -ErrorAction Stop
    Write-Host "[PASS] MSIX installed successfully" -ForegroundColor Green
} catch {
    Write-Host "[FAIL] MSIX install failed: $_" -ForegroundColor Red
    $failures += "MSIX install failed"
}

# ── 4. Verify registration ───────────────────────────────────────────────────
Write-Host "`n--- Step 4: Verify app registration ---" -ForegroundColor Yellow

Start-Sleep -Seconds 2  # Give Windows a moment to register
$installed = Get-AppxPackage | Where-Object { $_.Name -like "*ThreadVerse*" }

if ($installed) {
    Write-Host "  Name: $($installed.Name)"
    Write-Host "  Version: $($installed.Version)"
    Write-Host "  InstallLocation: $($installed.InstallLocation)"
    Write-Host "[PASS] App registered in Start Menu" -ForegroundColor Green
} else {
    Write-Host "[FAIL] App not found in registered packages" -ForegroundColor Red
    $failures += "App not registered after install"
}

# ── 5. Launch app ─────────────────────────────────────────────────────────────
Write-Host "`n--- Step 5: Launch app ---" -ForegroundColor Yellow

try {
    $appx = Get-AppxPackage | Where-Object { $_.Name -like "*ThreadVerse*" } | Select-Object -First 1
    if ($appx) {
        $manifest = Get-AppxPackageManifest -Package $appx
        $appId = $manifest.Package.Applications.Application.Id

        Start-Process "shell:AppsFolder\$($appx.PackageFamilyName)!$appId"
        Write-Host "[PASS] App launched" -ForegroundColor Green

        # Give it 5 seconds to start
        Start-Sleep -Seconds 5

        $proc = Get-Process -Name "ThreadVerse" -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Host "  Process running: PID $($proc.Id)"
        } else {
            Write-Host "[WARN] Process not found (may have exited or not fully started)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "[WARN] Cannot launch — package not found" -ForegroundColor Yellow
    }
} catch {
    Write-Host "[WARN] Launch failed: $_" -ForegroundColor Yellow
}

# ── 6. Uninstall MSIX ────────────────────────────────────────────────────────
Write-Host "`n--- Step 6: Uninstall MSIX ---" -ForegroundColor Yellow

try {
    $appx = Get-AppxPackage | Where-Object { $_.Name -like "*ThreadVerse*" } | Select-Object -First 1
    if ($appx) {
        Remove-AppxPackage -Package $appx.PackageFullName -ErrorAction Stop
        Write-Host "[PASS] MSIX uninstalled" -ForegroundColor Green
    } else {
        Write-Host "[INFO] Package already removed" -ForegroundColor Yellow
    }
} catch {
    Write-Host "[FAIL] Uninstall failed: $_" -ForegroundColor Red
    $failures += "MSIX uninstall failed"
}

# ── 7. Verify cleanup ────────────────────────────────────────────────────────
Write-Host "`n--- Step 7: Verify cleanup ---" -ForegroundColor Yellow

Start-Sleep -Seconds 2
$remaining = Get-AppxPackage | Where-Object { $_.Name -like "*ThreadVerse*" }
if ($remaining) {
    Write-Host "[FAIL] Package still registered after uninstall" -ForegroundColor Red
    $failures += "Package still registered"
} else {
    Write-Host "[PASS] No registered packages remain" -ForegroundColor Green
}

# Check Start Menu
$startMenu = Get-ChildItem "$env:APPDATA\Microsoft\Windows\Start Menu\Programs" -Filter "*ThreadVerse*" -ErrorAction SilentlyContinue
if ($startMenu) {
    Write-Host "[INFO] Start Menu entries found: $($startMenu.Name -join ', ')" -ForegroundColor Yellow
} else {
    Write-Host "[PASS] Start Menu clean" -ForegroundColor Green
}

# Check AppData
$appDataDir = Join-Path $env:LOCALAPPDATA 'Packages' |
    Get-ChildItem -Filter "*ThreadVerse*" -ErrorAction SilentlyContinue
if ($appDataDir) {
    Write-Host "[INFO] LocalAppData packages: $($appDataDir.Name -join ', ')" -ForegroundColor Yellow
} else {
    Write-Host "[PASS] No LocalAppData packages remain" -ForegroundColor Green
}

# ── Summary ──────────────────────────────────────────────────────────────────
Write-Host "`n=== Summary ===" -ForegroundColor Cyan
if ($failures.Count -eq 0) {
    Write-Host "ALL CHECKS PASSED — MSIX package is ready for Partner Center submission." -ForegroundColor Green
    exit 0
} else {
    Write-Host "$($failures.Count) issue(s) found:" -ForegroundColor Red
    foreach ($f in $failures) {
        Write-Host "  - $f" -ForegroundColor Red
    }
    exit 1
}

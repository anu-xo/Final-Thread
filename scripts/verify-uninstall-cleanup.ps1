<#
.SYNOPSIS
    Verifies that ThreadVerse uninstall cleanup is complete on Windows.

.DESCRIPTION
    Checks that the threadverse:// protocol handler registry key was removed
    by the NSIS uninstaller's customUnInstall macro (installer.nsh).
    Run this AFTER uninstalling ThreadVerse to confirm no leftover registry entries.

.EXAMPLE
    .\scripts\verify-uninstall-cleanup.ps1

.NOTES
    Must be run on Windows after uninstalling ThreadVerse.
    Exit code 0 = all clean, 1 = leftover artifacts found.
#>

$ErrorActionPreference = 'Continue'
$failures = @()

Write-Host "`n=== ThreadVerse Uninstall Cleanup Verification ===" -ForegroundColor Cyan

# ── 1. Check protocol handler registry key ──────────────────────────────────
$protocolKey = 'HKCU:\Software\Classes\threadverse'
if (Test-Path $protocolKey) {
    $failures += "Protocol handler key still exists: $protocolKey"
    Write-Host "[FAIL] Protocol handler key present: $protocolKey" -ForegroundColor Red
} else {
    Write-Host "[PASS] Protocol handler key removed: $protocolKey" -ForegroundColor Green
}

# ── 2. Check HKCR protocol handler (per-machine fallback) ────────────────────
$hkcrKey = 'HKCR:\threadverse'
if (Test-Path $hkcrKey) {
    $failures += "HKCR protocol handler key still exists: $hkcrKey"
    Write-Host "[FAIL] HKCR protocol handler present: $hkcrKey" -ForegroundColor Red
} else {
    Write-Host "[PASS] HKCR protocol handler removed: $hkcrKey" -ForegroundColor Green
}

# ── 3. Check app data directory ──────────────────────────────────────────────
$appDataDir = Join-Path $env:APPDATA 'ThreadVerse'
if (Test-Path $appDataDir) {
    Write-Host "[INFO] App data directory still exists: $appDataDir" -ForegroundColor Yellow
    Write-Host "       (Expected if deleteAppDataOnUninstall was not triggered)" -ForegroundColor Yellow
} else {
    Write-Host "[PASS] App data directory removed: $appDataDir" -ForegroundColor Green
}

# ── 4. Check Start Menu shortcut ─────────────────────────────────────────────
$startMenuDir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\ThreadVerse'
if (Test-Path $startMenuDir) {
    $failures += "Start Menu shortcut still exists: $startMenuDir"
    Write-Host "[FAIL] Start Menu shortcut present: $startMenuDir" -ForegroundColor Red
} else {
    Write-Host "[PASS] Start Menu shortcut removed" -ForegroundColor Green
}

# ── 5. Check desktop shortcut ────────────────────────────────────────────────
$desktopShortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) 'ThreadVerse.lnk'
if (Test-Path $desktopShortcut) {
    $failures += "Desktop shortcut still exists: $desktopShortcut"
    Write-Host "[FAIL] Desktop shortcut present: $desktopShortcut" -ForegroundColor Red
} else {
    Write-Host "[PASS] Desktop shortcut removed" -ForegroundColor Green
}

# ── 6. Check install directory ───────────────────────────────────────────────
$installDir = Get-ChildItem "$env:LOCALAPPDATA\Programs" -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -eq 'ThreadVerse' }
if ($installDir) {
    $failures += "Install directory still exists: $($installDir.FullName)"
    Write-Host "[FAIL] Install directory present: $($installDir.FullName)" -ForegroundColor Red
} else {
    Write-Host "[PASS] Install directory removed" -ForegroundColor Green
}

# ── Summary ──────────────────────────────────────────────────────────────────
Write-Host "`n=== Summary ===" -ForegroundColor Cyan
if ($failures.Count -eq 0) {
    Write-Host "All checks passed. No leftover artifacts found." -ForegroundColor Green
    exit 0
} else {
    Write-Host "$($failures.Count) issue(s) found:" -ForegroundColor Red
    foreach ($f in $failures) {
        Write-Host "  - $f" -ForegroundColor Red
    }
    exit 1
}

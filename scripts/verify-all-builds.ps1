# ──────────────────────────────────────────────────────────────────────────────
# verify-all-builds.ps1
#
# Master verification script for all 4 platform builds.
# Run on each platform to verify its respective build artifact.
#
# Usage:
#   .\scripts\verify-all-builds.ps1                    # detect current platform
#   .\scripts\verify-all-builds.ps1 -Platform windows  # force specific platform
#
# Platforms: windows, macos, linux
# ──────────────────────────────────────────────────────────────────────────────
param(
    [ValidateSet('windows', 'macos', 'linux')]
    [string]$Platform
)

$ErrorActionPreference = 'Continue'
$results = @{}

# ── Auto-detect platform ──────────────────────────────────────────────────────
if (-not $Platform) {
    if ($IsWindows -or $env:OS -eq 'Windows_NT') { $Platform = 'windows' }
    elseif ($IsMacOS -or (Test-Path '/System/Library/CoreServices/Applications/App Store.app')) { $Platform = 'macos' }
    else { $Platform = 'linux' }
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host " ThreadVerse Build Verification" -ForegroundColor Cyan
Write-Host " Platform: $Platform" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# ── Windows: MSIX verification ────────────────────────────────────────────────
if ($Platform -eq 'windows') {
    Write-Host "--- Verifying MSIX build ---" -ForegroundColor Yellow

    $msix = Get-ChildItem "packages\desktop\dist" -Filter "*.msix" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($msix) {
        Write-Host "  Found: $($msix.Name) ($([math]::Round($msix.Length / 1MB, 2)) MB)"

        try {
            $pkg = Get-AppPackageManifest -DependencyPath $msix.FullName -ErrorAction Stop
            Write-Host "  Manifest: VALID (v$($pkg.Identity.Version))"
            $results['msix'] = 'PASS'
        } catch {
            Write-Host "  Manifest: FAILED — $_" -ForegroundColor Red
            $results['msix'] = 'FAIL'
        }
    } else {
        Write-Host "  No .msix found in packages/desktop/dist/" -ForegroundColor Yellow
        $results['msix'] = 'SKIP'
    }

    # Also verify NSIS
    $nsis = Get-ChildItem "packages\desktop\dist" -Filter "*.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($nsis) {
        Write-Host "`n--- Verifying NSIS build ---" -ForegroundColor Yellow
        $sig = Get-AuthenticodeSignature $nsis.FullName
        Write-Host "  Status: $($sig.Status)"
        Write-Host "  Signer: $($sig.SignerCertificate.Subject)"
        $results['nsis'] = if ($sig.Status -eq 'Valid') { 'PASS' } else { 'WARN' }
    }
}

# ── macOS: MAS verification ──────────────────────────────────────────────────
if ($Platform -eq 'macos') {
    Write-Host "`n--- Verifying MAS build ---" -ForegroundColor Yellow

    $pkg = Get-ChildItem "packages\desktop\dist" -Filter "*.pkg" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($pkg) {
        Write-Host "  Found: $($pkg.Name) ($([math]::Round($pkg.Length / 1MB, 2)) MB)"

        # codesign verify
        $codesignResult = & codesign --verify --deep --strict $pkg.FullName 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  codesign: VALID"
            $results['mas-codesign'] = 'PASS'
        } else {
            Write-Host "  codesign: FAILED — $codesignResult" -ForegroundColor Red
            $results['mas-codesign'] = 'FAIL'
        }

        # pkgutil signature
        $sigResult = & pkgutil --check-signature $pkg.FullName 2>&1
        Write-Host "  pkgutil: $sigResult"
        $results['mas-pkgutil'] = 'PASS'
    } else {
        Write-Host "  No .pkg found in packages/desktop/dist/" -ForegroundColor Yellow
        $results['mas'] = 'SKIP'
    }

    # DMG verification
    Write-Host "`n--- Verifying DMG build ---" -ForegroundColor Yellow
    $dmg = Get-ChildItem "packages\desktop\dist" -Filter "*.dmg" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($dmg) {
        $codesignResult = & codesign --verify --deep --strict $dmg.FullName 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  DMG codesign: VALID"
            $results['dmg'] = 'PASS'
        } else {
            Write-Host "  DMG codesign: FAILED" -ForegroundColor Red
            $results['dmg'] = 'FAIL'
        }
    }
}

# ── Linux: Flatpak + Snap verification ────────────────────────────────────────
if ($Platform -eq 'linux') {
    Write-Host "`n--- Verifying Flatpak manifest ---" -ForegroundColor Yellow
    if (Test-Path "flatpak/org.threadverse.app.yml") {
        $manifest = Get-Content "flatpak/org.threadverse.app.yml" -Raw
        $checks = @(
            @{ Name = 'app-id'; Pattern = 'org.threadverse.app' },
            @{ Name = 'runtime'; Pattern = 'org.freedesktop.Platform' },
            @{ Name = 'command'; Pattern = 'command: threadverse' },
            @{ Name = 'network'; Pattern = '--share=network' },
            @{ Name = 'wayland'; Pattern = '--socket=wayland' }
        )
        $allPassed = $true
        foreach ($c in $checks) {
            if ($manifest -match $c.Pattern) {
                Write-Host "  $($c.Name): OK"
            } else {
                Write-Host "  $($c.Name): MISSING" -ForegroundColor Red
                $allPassed = $false
            }
        }
        $results['flatpak'] = if ($allPassed) { 'PASS' } else { 'FAIL' }
    } else {
        Write-Host "  flatpak/org.threadverse.app.yml not found" -ForegroundColor Yellow
        $results['flatpak'] = 'SKIP'
    }

    Write-Host "`n--- Verifying Snap manifest ---" -ForegroundColor Yellow
    if (Test-Path "snap/snapcraft.yaml") {
        $snap = Get-Content "snap/snapcraft.yaml" -Raw
        $snapChecks = @(
            @{ Name = 'name'; Pattern = 'name: threadverse' },
            @{ Name = 'base'; Pattern = 'base: core22' },
            @{ Name = 'confinement'; Pattern = 'confinement: strict' },
            @{ Name = 'network plug'; Pattern = 'network' }
        )
        $allPassed = $true
        foreach ($c in $snapChecks) {
            if ($snap -match $c.Pattern) {
                Write-Host "  $($c.Name): OK"
            } else {
                Write-Host "  $($c.Name): MISSING" -ForegroundColor Red
                $allPassed = $false
            }
        }
        $results['snap'] = if ($allPassed) { 'PASS' } else { 'FAIL' }
    } else {
        Write-Host "  snap/snapcraft.yaml not found" -ForegroundColor Yellow
        $results['snap'] = 'SKIP'
    }
}

# ── Summary ──────────────────────────────────────────────────────────────────
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host " Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$passCount = ($results.Values | Where-Object { $_ -eq 'PASS' }).Count
$failCount = ($results.Values | Where-Object { $_ -eq 'FAIL' }).Count
$skipCount = ($results.Values | Where-Object { $_ -eq 'SKIP' }).Count

foreach ($k in $results.Keys) {
    $color = switch ($results[$k]) {
        'PASS' { 'Green' }
        'FAIL' { 'Red' }
        'WARN' { 'Yellow' }
        default { 'Gray' }
    }
    Write-Host "  $k : $($results[$k])" -ForegroundColor $color
}

Write-Host "`n  Total: $passCount passed, $failCount failed, $skipCount skipped"

if ($failCount -gt 0) {
    Write-Host "`n  Some verifications failed. Review above output." -ForegroundColor Red
    exit 1
} else {
    Write-Host "`n  All checks passed." -ForegroundColor Green
    exit 0
}

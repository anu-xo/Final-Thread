# ── Build Staging Desktop Installer ──────────────────────────────────────
# Run from the repo root on Windows after the Render staging URL is known.
#
# Usage:
#   1. Set the staging API URL below
#   2. Run: powershell -File scripts/build-staging-desktop.ps1
#   3. Install the generated .exe from packages/desktop/dist/

param(
  [string]$ApiUrl = "https://threadverse-server-staging.onrender.com/api"
)

Write-Host "=== Building staging desktop installer ===" -ForegroundColor Cyan
Write-Host "API URL: $ApiUrl" -ForegroundColor Yellow

# Set env var for web build
$env:VITE_API_URL = $ApiUrl

# Build web with staging API URL
Write-Host "`n[1/3] Building web..." -ForegroundColor Cyan
pnpm --filter web build
if ($LASTEXITCODE -ne 0) { Write-Host "Web build failed!" -ForegroundColor Red; exit 1 }

# Build electron NSIS installer
Write-Host "`n[2/3] Building Electron NSIS installer..." -ForegroundColor Cyan
pnpm --filter desktop exec electron-builder --publish never --win nsis
if ($LASTEXITCODE -ne 0) { Write-Host "Electron build failed!" -ForegroundColor Red; exit 1 }

# Locate installer
$installer = Get-ChildItem "packages/desktop/dist" -Filter "*.exe" | Select-Object -First 1
if ($installer) {
  Write-Host "`n[3/3] Done!" -ForegroundColor Green
  Write-Host "Installer: $($installer.FullName)" -ForegroundColor Green
  Write-Host "Size: $([math]::Round($installer.Length / 1MB, 1)) MB" -ForegroundColor Green
} else {
  Write-Host "`nBuild completed but no .exe found in packages/desktop/dist/" -ForegroundColor Red
}

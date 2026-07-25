#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# capture-unix.sh — Captures store screenshots on macOS or Linux at 1280x800.
#
# Usage:
#   ./scripts/screenshots/capture-unix.sh [--skip-seed] [--platform macos|linux]
#
# Prerequisites:
#   - Node.js 20+, pnpm, Playwright (npx playwright install chromium)
#   - MongoDB running and seeded
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

SKIP_SEED=false
PLATFORM_OVERRIDE=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --skip-seed) SKIP_SEED=true; shift ;;
    --platform)  PLATFORM_OVERRIDE="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Detect platform
if [ -n "$PLATFORM_OVERRIDE" ]; then
  PLATFORM="$PLATFORM_OVERRIDE"
elif [ "$(uname)" = "Darwin" ]; then
  PLATFORM="macos"
else
  PLATFORM="linux"
fi

OUTPUT_DIR="$SCRIPT_DIR/output/$PLATFORM"
BASE_URL="${BASE_URL:-http://localhost:5173}"

echo ""
echo "========================================"
echo " ThreadVerse — $PLATFORM Screenshot Capture"
echo "========================================"
echo ""

# ── 1. Seed database ─────────────────────────────────────────────────────────
if [ "$SKIP_SEED" = false ]; then
  echo "--- Step 1: Seeding database ---"
  cd "$PROJECT_ROOT/packages/server"
  node src/scripts/seedScreenshots.js
  echo "[PASS] Database seeded"
  echo ""
fi

# ── 2. Start server (background) ─────────────────────────────────────────────
echo "--- Step 2: Starting server ---"
cd "$PROJECT_ROOT/packages/server"
node src/main.mjs &
SERVER_PID=$!
echo "  Server PID: $SERVER_PID"

# Wait for server
for i in $(seq 1 15); do
  sleep 1
  if curl -sf "$BASE_URL/api/health" > /dev/null 2>&1; then
    echo "[PASS] Server is ready"
    break
  fi
  if [ "$i" -eq 15 ]; then
    echo "[WARN] Server may not be fully ready"
  fi
done

# ── 3. Start web client (background) ─────────────────────────────────────────
echo ""
echo "--- Step 3: Starting web client ---"
cd "$PROJECT_ROOT"
pnpm --filter web dev &
WEB_PID=$!
echo "  Web PID: $WEB_PID"

# Wait for Vite
for i in $(seq 1 30); do
  sleep 1
  if curl -sf "$BASE_URL" > /dev/null 2>&1; then
    echo "[PASS] Web client is ready"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "[WARN] Web client may not be fully ready"
  fi
done

# ── 4. Ensure Playwright chromium is installed ───────────────────────────────
echo ""
echo "--- Step 4: Installing Playwright chromium ---"
cd "$PROJECT_ROOT"
npx playwright install chromium 2>/dev/null || true

# ── 5. Run capture script ────────────────────────────────────────────────────
echo ""
echo "--- Step 5: Capturing screenshots ---"
node scripts/screenshots/captureScreenshots.js --platform "$PLATFORM" --base-url "$BASE_URL"
CAPTURE_EXIT=$?

# ── 6. Verify output ─────────────────────────────────────────────────────────
echo ""
echo "--- Step 6: Verifying output ---"
REQUIRED=(
  "01-home-feed.png"
  "02-community-page.png"
  "03-ai-chat.png"
  "04-admin-dashboard.png"
  "05-settings.png"
)

ALL_PRESENT=true
for f in "${REQUIRED[@]}"; do
  FILE="$OUTPUT_DIR/$f"
  if [ -f "$FILE" ]; then
    SIZE=$(du -k "$FILE" | cut -f1)
    echo "  [OK] $f  (${SIZE} KB)"
  else
    echo "  [MISSING] $f"
    ALL_PRESENT=false
  fi
done

# ── Cleanup ──────────────────────────────────────────────────────────────────
echo ""
echo "--- Cleaning up background processes ---"
kill $SERVER_PID 2>/dev/null && echo "  Stopped server (PID $SERVER_PID)" || true
kill $WEB_PID 2>/dev/null && echo "  Stopped web client (PID $WEB_PID)" || true

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "========================================"
if [ "$ALL_PRESENT" = true ] && [ "$CAPTURE_EXIT" -eq 0 ]; then
  echo " ALL 5 $PLATFORM SCREENSHOTS CAPTURED"
  echo " Output: $OUTPUT_DIR"
else
  echo " CAPTURE INCOMPLETE — check errors above"
  exit 1
fi
echo "========================================"
echo ""

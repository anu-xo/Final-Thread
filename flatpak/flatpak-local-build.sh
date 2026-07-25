#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# flatpak-local-build.sh
#
# Builds and tests the ThreadVerse Flatpak locally before submitting to Flathub.
#
# Prerequisites:
#   - flatpak and flatpak-builder installed
#   - Flathub remote configured
#   - AppImage downloaded or available
#
# Usage:
#   ./flatpak/flatpak-local-build.sh [--install] [--run]
#
# Flags:
#   --install   Install the Flatpak after building
#   --run       Run the Flatpak after building
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
MANIFEST="$SCRIPT_DIR/org.threadverse.app.yml"

DO_INSTALL=false
DO_RUN=false

for arg in "$@"; do
  case "$arg" in
    --install) DO_INSTALL=true ;;
    --run) DO_RUN=true ;;
    *) echo "Unknown flag: $arg"; exit 1 ;;
  esac
done

echo "=== ThreadVerse Flatpak Local Build ==="

# ── 1. Check prerequisites ───────────────────────────────────────────────────
echo ""
echo "--- Step 1: Check prerequisites ---"

if ! command -v flatpak &>/dev/null; then
  echo "ERROR: flatpak not found."
  echo "Install: https://flatpak.org/setup/"
  exit 1
fi

if ! command -v flatpak-builder &>/dev/null; then
  echo "ERROR: flatpak-builder not found."
  echo "Install: sudo apt install flatpak-builder (Debian/Ubuntu)"
  echo "         sudo dnf install flatpak-builder (Fedora)"
  exit 1
fi

echo "[PASS] flatpak and flatpak-builder installed"

# ── 2. Ensure Flathub remote is configured ───────────────────────────────────
echo ""
echo "--- Step 2: Check Flathub remote ---"

if ! flatpak remote-list 2>/dev/null | grep -q flathub; then
  echo "Adding Flathub remote..."
  flatpak remote-add --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo
fi
echo "[PASS] Flathub remote configured"

# ── 3. Install runtime and SDK ────────────────────────────────────────────────
echo ""
echo "--- Step 3: Install Freedesktop runtime and SDK ---"

flatpak install -y --noninteractive flathub org.freedesktop.Platform//23.08 org.freedesktop.Sdk//23.08 2>/dev/null || \
  echo "[INFO] Runtime/SDK may already be installed"

echo "[PASS] Runtime and SDK ready"

# ── 4. Download AppImage if not present ───────────────────────────────────────
echo ""
echo "--- Step 4: Check AppImage ---"

APPIMAGE="$SCRIPT_DIR/ThreadVerse.AppImage"
if [ ! -f "$APPIMAGE" ]; then
  echo "AppImage not found at $APPIMAGE"
  echo ""
  echo "Options:"
  echo "  1. Build locally: cd packages/desktop && npx electron-builder --linux AppImage"
  echo "  2. Download from GitHub Releases"
  echo ""

  # Try to find it in dist
  DIST_APPIMAGE=$(find "$PROJECT_ROOT/packages/desktop/dist" -name "*.AppImage" -maxdepth 1 2>/dev/null | head -1)
  if [ -n "$DIST_APPIMAGE" ]; then
    echo "Found in dist: $DIST_APPIMAGE"
    APPIMAGE="$DIST_APPIMAGE"
  else
    echo "No AppImage found. Please build or download one first."
    exit 1
  fi
fi

echo "[PASS] AppImage: $APPIMAGE"

# ── 5. Build Flatpak ─────────────────────────────────────────────────────────
echo ""
echo "--- Step 5: Build Flatpak ---"

flatpak-builder --force-clean --install-deps-from=flathub \
  "$SCRIPT_DIR/.flatpak-build" "$MANIFEST"

echo "[PASS] Flatpak built successfully"

# ── 6. Install (optional) ────────────────────────────────────────────────────
if [ "$DO_INSTALL" = true ]; then
  echo ""
  echo "--- Step 6: Install Flatpak ---"
  flatpak-builder --install --user "$SCRIPT_DIR/.flatpak-build" "$MANIFEST"
  echo "[PASS] Flatpak installed"
fi

# ── 7. Run (optional) ────────────────────────────────────────────────────────
if [ "$DO_RUN" = true ]; then
  echo ""
  echo "--- Step 7: Run Flatpak ---"
  flatpak run org.threadverse.app
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "=== Build Complete ==="
echo ""
echo "To install locally:"
echo "  flatpak-builder --install --user $SCRIPT_DIR/.flatpak-build $MANIFEST"
echo ""
echo "To run:"
echo "  flatpak run org.threadverse.app"
echo ""
echo "To test with the run flag:"
echo "  $0 --install --run"
echo ""
echo "Next steps for Flathub submission:"
echo "  1. Update the AppImage URL and SHA256 in org.threadverse.app.yml"
echo "  2. Create a PR at https://github.com/flathub/flathub"
echo "  3. Include all files in the flatpak/ directory"

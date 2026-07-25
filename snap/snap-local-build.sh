#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# snap-local-build.sh
#
# Builds and tests the ThreadVerse snap locally before publishing to Snap Store.
#
# Prerequisites:
#   - snapcraft installed (sudo snap install snapcraft --classic)
#   - AppImage downloaded or available
#
# Usage:
#   ./snap/snap-local-build.sh [--install] [--run] [--upload]
#
# Flags:
#   --install   Install the snap locally (--dangerous)
#   --run       Run the snap after building
#   --upload    Upload to Snap Store after building
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

DO_INSTALL=false
DO_RUN=false
DO_UPLOAD=false

for arg in "$@"; do
  case "$arg" in
    --install) DO_INSTALL=true ;;
    --run) DO_RUN=true ;;
    --upload) DO_UPLOAD=true ;;
    *) echo "Unknown flag: $arg"; exit 1 ;;
  esac
done

echo "=== ThreadVerse Snap Local Build ==="

# ── 1. Check prerequisites ───────────────────────────────────────────────────
echo ""
echo "--- Step 1: Check prerequisites ---"

if ! command -v snapcraft &>/dev/null; then
  echo "ERROR: snapcraft not found."
  echo "Install: sudo snap install snapcraft --classic"
  exit 1
fi

echo "[PASS] snapcraft installed: $(snapcraft --version)"

# ── 2. Find or copy AppImage ──────────────────────────────────────────────────
echo ""
echo "--- Step 2: Locate AppImage ---"

SNAP_APPIMAGE="$SCRIPT_DIR/ThreadVerse.AppImage"

if [ ! -f "$SNAP_APPIMAGE" ]; then
  # Try to find in desktop dist
  DIST_APPIMAGE=$(find "$PROJECT_ROOT/packages/desktop/dist" -name "*.AppImage" -maxdepth 1 2>/dev/null | head -1)
  if [ -n "$DIST_APPIMAGE" ]; then
    echo "Found in dist: $DIST_APPIMAGE"
    cp "$DIST_APPIMAGE" "$SNAP_APPIMAGE"
  else
    echo "No AppImage found."
    echo ""
    echo "Build one first:"
    echo "  cd packages/desktop && npx electron-builder --linux AppImage"
    echo ""
    echo "Or download from GitHub Releases:"
    echo "  wget https://github.com/anu-xo/Final-Thread/releases/download/v1.0.0/ThreadVerse-1.0.0.AppImage"
    echo "  mv ThreadVerse-1.0.0.AppImage $SNAP_APPIMAGE"
    exit 1
  fi
fi

echo "[PASS] AppImage: $SNAP_APPIMAGE"

# ── 3. Build snap ────────────────────────────────────────────────────────────
echo ""
echo "--- Step 3: Build snap ---"

cd "$SCRIPT_DIR"
snapcraft --destructive-mode 2>&1 || snapcraft

# Find the built snap
BUILT_SNAP=$(find "$SCRIPT_DIR" -name "threadverse_*.snap" -maxdepth 1 2>/dev/null | head -1)
if [ -z "$BUILT_SNAP" ]; then
  echo "ERROR: Snap build failed — no .snap file found"
  exit 1
fi

echo "[PASS] Snap built: $BUILT_SNAP"
echo "Size: $(du -h "$BUILT_SNAP" | cut -f1)"

# ── 4. Install locally (optional) ────────────────────────────────────────────
if [ "$DO_INSTALL" = true ]; then
  echo ""
  echo "--- Step 4: Install snap locally ---"
  sudo snap install --dangerous "$BUILT_SNAP"
  echo "[PASS] Snap installed"

  if [ "$DO_RUN" = true ]; then
    echo ""
    echo "--- Step 5: Run snap ---"
    threadverse &
    echo "[PASS] Snap launched (PID: $!)"
  fi
fi

# ── 6. Upload to Snap Store (optional) ───────────────────────────────────────
if [ "$DO_UPLOAD" = true ]; then
  echo ""
  echo "--- Step 6: Upload to Snap Store ---"
  snapcraft upload "$BUILT_SNAP"
  echo "[PASS] Snap uploaded"
  echo ""
  echo "Next steps:"
  echo "  1. Visit https://snapcraft.io/threadverse"
  echo "  2. Review the listing"
  echo "  3. Request stable channel release"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "=== Build Complete ==="
echo ""
echo "Snap: $BUILT_SNAP"
echo ""
echo "To install locally:"
echo "  sudo snap install --dangerous $BUILT_SNAP"
echo ""
echo "To run:"
echo "  threadverse"
echo ""
echo "To remove:"
echo "  sudo snap remove threadverse"
echo ""
echo "To upload to Snap Store:"
echo "  snapcraft upload $BUILT_SNAP"
echo ""
echo "Channel progression:"
echo "  1. --dangerous (local install)"
echo "  2. --candidate (testing)"
echo "  3. stable (public)"

#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# upload-mas-to-appstore.sh
#
# Uploads the ThreadVerse MAS .pkg to App Store Connect via Transporter
# (xcrun altool). Run this manually or from CI when ready to submit.
#
# Prerequisites:
#   - App Store Connect record already created for ThreadVerse
#   - App Store Connect API key (P8) with Developer role
#   - JAVA_HOME set (Transporter requires Java)
#
# Usage:
#   ./scripts/upload-mas-to-appstore.sh [path/to/pkg]
#
# Environment variables (or pass via .env):
#   APPSTORE_API_KEY_ID     — App Store Connect API key ID
#   APPSTORE_API_ISSUER     — App Store Connect API issuer UUID
#   APPSTORE_API_KEY_P8     — Contents of the .p8 private key file
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Find .pkg ─────────────────────────────────────────────────────────────────
PKG_PATH="${1:-}"
if [ -z "$PKG_PATH" ]; then
  PKG_PATH=$(find packages/desktop/dist -name "*.pkg" -maxdepth 1 2>/dev/null | head -1)
fi

if [ -z "$PKG_PATH" ] || [ ! -f "$PKG_PATH" ]; then
  echo "ERROR: No .pkg file found."
  echo "Usage: $0 [path/to/ThreadVerse-1.0.0.pkg]"
  echo ""
  echo "Build first with:"
  echo "  cd packages/desktop && npx electron-builder --mac mas"
  exit 1
fi

echo "=== ThreadVerse MAS Upload ==="
echo "Package: $PKG_PATH"
echo "Size: $(du -h "$PKG_PATH" | cut -f1)"
echo ""

# ── Validate env vars ─────────────────────────────────────────────────────────
MISSING=()
[ -z "${APPSTORE_API_KEY_ID:-}" ]  && MISSING+=("APPSTORE_API_KEY_ID")
[ -z "${APPSTORE_API_ISSUER:-}" ]  && MISSING+=("APPSTORE_API_ISSUER")
[ -z "${APPSTORE_API_KEY_P8:-}" ]  && MISSING+=("APPSTORE_API_KEY_P8")

if [ ${#MISSING[@]} -gt 0 ]; then
  echo "ERROR: Missing required environment variables:"
  for v in "${MISSING[@]}"; do
    echo "  - $v"
  done
  echo ""
  echo "Set them in your shell or in packages/server/.env:"
  echo "  export APPSTORE_API_KEY_ID=XXXXXXXXXX"
  echo "  export APPSTORE_API_ISSUER=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
  echo "  export APPSTORE_API_KEY_P8='-----BEGIN PRIVATE KEY-----\n...'"
  exit 1
fi

# ── Check Java (Transporter requires it) ──────────────────────────────────────
if ! command -v java &>/dev/null; then
  echo "ERROR: Java not found. Transporter requires Java 11+."
  echo "Install with: brew install openjdk@17"
  exit 1
fi

JAVA_VER=$(java -version 2>&1 | head -1)
echo "Java: $JAVA_VER"

# ── Check Transporter ─────────────────────────────────────────────────────────
if ! xcrun altool --help &>/dev/null 2>&1; then
  echo "ERROR: xcrun altool not found. Install Xcode or Transporter from Mac App Store."
  exit 1
fi

# ── Write API key to temp file ────────────────────────────────────────────────
KEY_DIR=$(mktemp -d)
KEY_FILE="$KEY_DIR/AuthKey_${APPSTORE_API_KEY_ID}.p8"
echo "$APPSTORE_API_KEY_P8" > "$KEY_FILE"
trap "rm -rf $KEY_DIR" EXIT

echo ""
echo "=== Uploading to App Store Connect ==="

xcrun altool --upload-app \
  --type macos \
  --file "$PKG_PATH" \
  --apiKey "$APPSTORE_API_KEY_ID" \
  --apiIssuer "$APPSTORE_API_ISSUER"

UPLOAD_EXIT=$?

if [ $UPLOAD_EXIT -eq 0 ]; then
  echo ""
  echo "=== Upload succeeded ==="
  echo "The build is now processing in App Store Connect."
  echo "https://appstoreconnect.apple.com/apps"
  echo ""
  echo "Next steps:"
  echo "  1. Wait for processing to complete (5-15 minutes)"
  echo "  2. Add screenshots and metadata in App Store Connect"
  echo "  3. Submit for App Review"
else
  echo ""
  echo "=== Upload failed (exit code: $UPLOAD_EXIT) ==="
  echo "Common causes:"
  echo "  - Invalid API key or insufficient permissions"
  echo "  - Package already uploaded (duplicate build)"
  echo "  - Package not signed with correct certificate"
  echo "  - App Store Connect record doesn't match bundle ID"
  exit $UPLOAD_EXIT
fi

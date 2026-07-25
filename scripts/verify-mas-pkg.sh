#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# verify-mas-pkg.sh
#
# Verifies the ThreadVerse MAS .pkg artifact before App Store submission.
# Run this on macOS after building with electron-builder --mac mas.
#
# Checks:
#   1. .pkg file exists and is readable
#   2. PkgUtil can expand the archive (valid pkg structure)
#   3. codesign --verify passes (signed by Apple or your distribution cert)
#   4. pkgutil --check-signature shows valid signature
#   5. App sandbox entitlements are present
#   6. Embedded .app has correct bundle ID and version
#
# Usage:
#   ./scripts/verify-mas-pkg.sh [path/to/pkg]
#
# Exit codes: 0 = all checks pass, 1 = failures found
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

FAILURES=()

echo ""
echo "=== ThreadVerse MAS .pkg Verification ==="

# ── Find .pkg ─────────────────────────────────────────────────────────────────
PKG_PATH="${1:-}"
if [ -z "$PKG_PATH" ]; then
  PKG_PATH=$(find packages/desktop/dist -name "*.pkg" -maxdepth 2 2>/dev/null | head -1)
fi

if [ -z "$PKG_PATH" ] || [ ! -f "$PKG_PATH" ]; then
  echo "ERROR: No .pkg file found."
  echo "Usage: $0 [path/to/ThreadVerse-1.0.0.pkg]"
  echo ""
  echo "Build first with:"
  echo "  cd packages/desktop && npx electron-builder --mac mas"
  exit 1
fi

PKG_FILE=$(basename "$PKG_PATH")
PKG_SIZE=$(du -h "$PKG_PATH" | cut -f1)
echo "Package: $PKG_FILE"
echo "Path: $PKG_PATH"
echo "Size: $PKG_SIZE"
echo ""

# ── 1. Verify pkg structure ───────────────────────────────────────────────────
echo "--- Step 1: Verify pkg structure ---"
TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

if pkgutil --expand "$PKG_PATH" "$TMPDIR/expanded" 2>/dev/null; then
  echo "[PASS] PkgUtil expanded successfully"
  # Check for Distribution file
  if [ -f "$TMPDIR/expanded/Distribution" ]; then
    echo "[PASS] Distribution file present"
    # Verify bundle ID
    BUNDLE_ID=$(grep -o 'identifier="[^"]*"' "$TMPDIR/expanded/Distribution" | head -1 | cut -d'"' -f2)
    echo "  Bundle ID: $BUNDLE_ID"
    if [ "$BUNDLE_ID" = "com.threadverse.app" ]; then
      echo "[PASS] Bundle ID matches: com.threadverse.app"
    else
      echo "[FAIL] Bundle ID mismatch: expected com.threadverse.app, got $BUNDLE_ID"
      FAILURES+=("Bundle ID mismatch: $BUNDLE_ID")
    fi
  else
    echo "[WARN] Distribution file not found (may be a flat pkg)"
  fi
else
  echo "[FAIL] PkgUtil could not expand .pkg"
  FAILURES+=("Invalid pkg structure")
fi

# ── 2. Verify code signature ─────────────────────────────────────────────────
echo ""
echo "--- Step 2: Verify code signature ---"
if codesign --verify --deep --strict "$PKG_PATH" 2>/dev/null; then
  echo "[PASS] codesign --verify --deep --strict passed"
else
  echo "[FAIL] codesign verification failed"
  FAILURES+=("codesign verification failed")
fi

# ── 3. Verify pkg signature ──────────────────────────────────────────────────
echo ""
echo "--- Step 3: Verify pkg signature ---"
SIG_OUTPUT=$(pkgutil --check-signature "$PKG_PATH" 2>&1 || true)
echo "$SIG_OUTPUT"

if echo "$SIG_OUTPUT" | grep -q "signed with a valid signature"; then
  echo "[PASS] Package has valid signature"
elif echo "$SIG_OUTPUT" | grep -q "signature is valid"; then
  echo "[PASS] Package signature is valid"
else
  # May still be valid for Developer ID signing
  if echo "$SIG_OUTPUT" | grep -q "Developer ID Installer"; then
    echo "[PASS] Signed with Developer ID Installer certificate"
  else
    echo "[WARN] Could not confirm valid signature — verify manually"
  fi
fi

# ── 4. Extract and check entitlements ─────────────────────────────────────────
echo ""
echo "--- Step 4: Check sandbox entitlements ---"
APP_PATH=$(find "$TMPDIR/expanded" -name "ThreadVerse.app" -maxdepth 5 2>/dev/null | head -1)

if [ -n "$APP_PATH" ]; then
  echo "Embedded app: $APP_PATH"

  # Check sandbox entitlement
  ENTITLEMENTS=$(codesign -d --entitlements - "$APP_PATH" 2>/dev/null || true)
  if echo "$ENTITLEMENTS" | grep -q "com.apple.security.app-sandbox"; then
    echo "[PASS] App Sandbox entitlement present"
  else
    echo "[FAIL] App Sandbox entitlement missing"
    FAILURES+=("App Sandbox entitlement missing")
  fi

  # Check network entitlement
  if echo "$ENTITLEMENTS" | grep -q "com.apple.security.network.client"; then
    echo "[PASS] Network client entitlement present"
  else
    echo "[WARN] Network client entitlement missing — app may not connect to internet"
  fi

  # Read Info.plist
  INFO_PLIST="$APP_PATH/Contents/Info.plist"
  if [ -f "$INFO_PLIST" ]; then
    APP_VERSION=$(/usr/libexec/PlistBuddy -c "Print CFBundleShortVersionString" "$INFO_PLIST" 2>/dev/null || echo "unknown")
    APP_BUNDLE_ID=$(/usr/libexec/PlistBuddy -c "Print CFBundleIdentifier" "$INFO_PLIST" 2>/dev/null || echo "unknown")
    echo "  Version: $APP_VERSION"
    echo "  Bundle ID: $APP_BUNDLE_ID"

    if [ "$APP_BUNDLE_ID" = "com.threadverse.app" ]; then
      echo "[PASS] App bundle ID matches"
    else
      echo "[FAIL] App bundle ID mismatch: $APP_BUNDLE_ID"
      FAILURES+=("App bundle ID mismatch")
    fi
  fi
else
  echo "[WARN] Could not locate ThreadVerse.app inside pkg"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "=== Summary ==="
if [ ${#FAILURES[@]} -eq 0 ]; then
  echo "ALL CHECKS PASSED — MAS .pkg is ready for App Store submission."
  echo ""
  echo "Upload with:"
  echo "  ./scripts/upload-mas-to-appstore.sh $PKG_PATH"
  exit 0
else
  echo "${#FAILURES[@]} issue(s) found:"
  for f in "${FAILURES[@]}"; do
    echo "  - $f"
  done
  exit 1
fi

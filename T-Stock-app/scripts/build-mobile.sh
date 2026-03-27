#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# T-Stock-app  —  sync web bundle
#
# Builds the parent Vite project in single-bundle mode (all JS/CSS inlined)
# and copies the result to T-Stock-app/assets/web/index.html.
#
# Must be run from inside T-Stock-app/ or from the repo root.
#
# Usage:
#   npm run sync-web             # build only
#   npm run sync-and-ios         # build + expo run:ios
#   npm run sync-and-android     # build + expo run:android
#   bash scripts/build-mobile.sh --ios
#   bash scripts/build-mobile.sh --android
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"          # …/Stock_Transfer_V4.2/T-Stock-app
WEB_DIR="$(cd "$EXPO_DIR/.." && pwd)"             # …/Stock_Transfer_V4.2
ASSETS_WEB="$EXPO_DIR/assets/web"

echo "━━━ T-Stock-app : sync web bundle ━━━"
echo "  Web project : $WEB_DIR"
echo "  Expo dir    : $EXPO_DIR"
echo ""

# ── 1. Build Vite single-bundle ──────────────────────────────────────────────
echo "▶ Building Vite (single-bundle, all JS+CSS inlined)…"
cd "$WEB_DIR"
npx vite build --config vite.config.mobile.ts

# ── 2. Copy to assets/web/ ───────────────────────────────────────────────────
mkdir -p "$ASSETS_WEB"
cp "$WEB_DIR/dist-mobile/index.html" "$ASSETS_WEB/index.html"
SIZE=$(du -sh "$ASSETS_WEB/index.html" | cut -f1)
echo "  ✓ assets/web/index.html  ($SIZE)"
echo ""

# ── 3. Optional: run native build ───────────────────────────────────────────
cd "$EXPO_DIR"
case "${1:-}" in
  --ios)
    echo "▶ Launching iOS simulator…"
    npx expo run:ios
    ;;
  --android)
    echo "▶ Launching Android emulator…"
    npx expo run:android
    ;;
  *)
    echo "━━━ Next steps ━━━"
    echo ""
    echo "  # Start Expo dev server (Expo Go / scan QR):"
    echo "  cd $EXPO_DIR && npx expo start"
    echo ""
    echo "  # Generate native Xcode + Android Studio projects:"
    echo "  cd $EXPO_DIR && npx expo prebuild"
    echo ""
    echo "  # Run on iOS simulator (requires macOS + Xcode):"
    echo "  cd $EXPO_DIR && npx expo run:ios"
    echo ""
    echo "  # Run on Android emulator (requires Android Studio):"
    echo "  cd $EXPO_DIR && npx expo run:android"
    echo ""
    echo "  # After prebuild, open native projects directly:"
    echo "  Xcode:           open $EXPO_DIR/ios/TStock.xcworkspace"
    echo "  Android Studio:  open $EXPO_DIR/android/"
    ;;
esac

#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# T-Stock-app  —  sync web bundle
#
# Builds the web/ sub-project (Vite, single-bundle) and outputs directly to
# T-Stock-app/assets/web/index.html for WebView loading.
#
# Usage (from T-Stock-app/):
#   npm run sync-web             # build only
#   npm run sync-and-ios         # build + expo run:ios
#   npm run sync-and-android     # build + expo run:android
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"       # T-Stock-app/
WEB_DIR="$EXPO_DIR/web"                        # T-Stock-app/web/
ASSETS_WEB="$EXPO_DIR/assets/web"

echo "━━━ T-Stock-app : sync web bundle ━━━"
echo "  Web source : $WEB_DIR"
echo "  Output     : $ASSETS_WEB/index.html"
echo ""

# ── 1. Install web deps ───────────────────────────────────────────────────────
# Use npm ci when a lockfile exists (reproducible CI/CD); fall back to
# npm install when it's missing (e.g. fresh clone before lockfile is committed).
echo "▶ Installing web dependencies…"
if [ -f "$WEB_DIR/package-lock.json" ]; then
  echo "  Using npm ci (lockfile found)"
  (cd "$WEB_DIR" && npm ci)
else
  echo "  ⚠ package-lock.json not found — falling back to npm install"
  (cd "$WEB_DIR" && npm install)
fi

# ── 2. Build Vite single-bundle ──────────────────────────────────────────────
# Clean stale hashed asset chunks first so they don't accumulate across builds
# and inflate the IPA / APK via assetBundlePatterns: ["assets/**"].
echo "▶ Cleaning stale web asset chunks…"
rm -rf "$ASSETS_WEB/assets"

echo "▶ Building Vite (single-bundle, all JS+CSS inlined)…"
mkdir -p "$ASSETS_WEB"

echo "▶ Building Vite (single-bundle, all JS+CSS inlined)…"
cd "$WEB_DIR"
npm run build:mobile

# 確認 index.html 是否成功生成
if [ ! -f "$ASSETS_WEB/index.html" ]; then
  echo "❌ Error: index.html was not generated in $ASSETS_WEB"
  exit 1
fi

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
    echo "  # Live dev (Vite hot-reload, set DEV_SERVER_URL in app/index.tsx):"
    echo "  cd $WEB_DIR && npm run dev"
    echo ""
    echo "  # Generate Xcode + Android Studio native projects:"
    echo "  cd $EXPO_DIR && npx expo prebuild"
    echo ""
    echo "  # iOS (macOS + Xcode required):"
    echo "  cd $EXPO_DIR && npx expo run:ios"
    echo "  open $EXPO_DIR/ios/TStock.xcworkspace"
    echo ""
    echo "  # Android (Android Studio required):"
    echo "  cd $EXPO_DIR && npx expo run:android"
    echo "  # File > Open > $EXPO_DIR/android/"
    ;;
esac

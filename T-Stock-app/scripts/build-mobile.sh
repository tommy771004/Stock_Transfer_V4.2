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
EXPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"      # T-Stock-app/
WEB_DIR="$EXPO_DIR/web"                        # T-Stock-app/web/
ASSETS_WEB="$EXPO_DIR/assets/web"

echo "━━━ T-Stock-app : sync web bundle ━━━"
echo "  Web source : $WEB_DIR"
echo "  Output     : $ASSETS_WEB/index.html"
echo ""

# ── 1. Ensure web deps installed ─────────────────────────────────────────────
if [ ! -d "$WEB_DIR/node_modules" ]; then
  echo "▶ Installing web dependencies…"
  (cd "$WEB_DIR" && npm install)
fi

# ── 2. Build Vite single-bundle ──────────────────────────────────────────────
echo "▶ Building Vite (single-bundle, all JS+CSS inlined)…"
mkdir -p "$ASSETS_WEB"
cd "$WEB_DIR"
npm run build:mobile

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

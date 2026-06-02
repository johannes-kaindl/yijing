#!/usr/bin/env bash
#
# build-ios-app.sh — stages the web app, generates the Xcode project, and builds
# the Yijing iOS app. Mirrors build-macos-app.sh in spirit (embed the committed
# repo state via `git archive`; opt-in signing via env vars).
#
# Requirements (on your Mac): Xcode + command line tools, and XcodeGen
#   brew install xcodegen
#
# Usage:
#   scripts/ios-app/build-ios-app.sh                 # stage + generate + build for SIMULATOR (no signing)
#   YIJING_TEAM_ID=ABCDE12345 \
#     scripts/ios-app/build-ios-app.sh archive       # stage + generate + ARCHIVE for device (App Store)
#
# NOTE: This script has NOT been executed in the authoring environment. Inference
# cannot run in the Simulator (no Metal GPU) — the app falls back to MockEngine
# there. Real on-device AI requires the llama.cpp package + a physical iPhone.
set -euo pipefail

REPO="$(git rev-parse --show-toplevel)"
APPDIR="$REPO/scripts/ios-app"
STAGE="$APPDIR/WebContent"
MODE="${1:-simulator}"

command -v xcodegen >/dev/null 2>&1 || {
  echo "FEHLT: xcodegen — installiere mit 'brew install xcodegen'." >&2; exit 1; }

echo "→ Web-Assets stagen (git archive HEAD: web/ data/ sw.js)…"
rm -rf "$STAGE"
mkdir -p "$STAGE"
# Embed the COMMITTED state (no uncommitted edits, no .DS_Store) — commit first.
git -C "$REPO" archive HEAD web data sw.js | tar -x -C "$STAGE"
[ -f "$STAGE/web/index.html" ] || { echo "FEHLER: web/index.html nicht gestaged." >&2; exit 1; }
[ -d "$STAGE/data" ] || { echo "FEHLER: data/ nicht gestaged." >&2; exit 1; }

echo "→ Xcode-Projekt generieren (xcodegen)…"
( cd "$APPDIR" && xcodegen generate )

case "$MODE" in
  simulator)
    echo "→ Build für iOS-Simulator (kein Signing; AI = MockEngine)…"
    xcodebuild -project "$APPDIR/Yijing.xcodeproj" -scheme Yijing \
      -configuration Release -sdk iphonesimulator \
      -destination 'generic/platform=iOS Simulator' \
      CODE_SIGNING_ALLOWED=NO build
    echo "✓ Simulator-Build fertig. In Xcode öffnen + auf einem Simulator starten:"
    echo "    open $APPDIR/Yijing.xcodeproj"
    ;;
  archive)
    : "${YIJING_TEAM_ID:?YIJING_TEAM_ID muss gesetzt sein (Apple Developer Team ID)}"
    echo "→ Archive für Gerät (Team $YIJING_TEAM_ID)…"
    xcodebuild -project "$APPDIR/Yijing.xcodeproj" -scheme Yijing \
      -configuration Release -sdk iphoneos \
      -destination 'generic/platform=iOS' \
      DEVELOPMENT_TEAM="$YIJING_TEAM_ID" \
      -archivePath "$APPDIR/build/Yijing.xcarchive" archive
    echo "✓ Archive erstellt: $APPDIR/build/Yijing.xcarchive"
    echo "  Export/Upload für den App Store via Xcode Organizer oder:"
    echo "    xcodebuild -exportArchive -archivePath … -exportOptionsPlist … -exportPath …"
    ;;
  *)
    echo "Unbekannter Modus: $MODE (erlaubt: simulator | archive)" >&2; exit 1 ;;
esac

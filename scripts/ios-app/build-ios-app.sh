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
#   scripts/ios-app/build-ios-app.sh catalyst        # stage + generate + build for Mac Catalyst (no signing)
#   YIJING_TEAM_ID=ABCDE12345 \
#     scripts/ios-app/build-ios-app.sh archive       # stage + generate + ARCHIVE for device (App Store)
#   YIJING_TEAM_ID=ABCDE12345 [YIJING_DEVICE_ID=<UDID>] \
#     scripts/ios-app/build-ios-app.sh device        # Development build, sign + (with DEVICE_ID) install + launch on a connected iPhone
#
# The `device` mode is for on-device verification (real Apple Foundation Models
# / llama.cpp inference, which the Simulator can't run). It uses automatic
# signing with -allowProvisioningUpdates, so the FIRST run creates the iOS
# "Apple Development" certificate + provisioning profile (needs Internet + an
# Apple ID signed into Xcode). With YIJING_DEVICE_ID set it also installs the
# signed .app and launches it via `xcrun devicectl`.
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

# Build-Kennung (Commit + Zeit) in die gestagte app.js einsetzen, damit die App
# sichtbar zeigt, welche Web-Version läuft (Diagnose gegen WKWebView-Cache-Hänger).
BUILD_TAG="$(git -C "$REPO" rev-parse --short HEAD)·$(git -C "$REPO" log -1 --format=%cd --date=format:%d.%m.\ %H:%M)"
sed -i '' "s|__BUILD__|$BUILD_TAG|" "$STAGE/web/app.js"
echo "→ Build-Kennung gesetzt: $BUILD_TAG"

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
  catalyst)
    echo "→ Build für Mac Catalyst (macOS; kein Signing)…"
    # On macOS 26 + Apple-Intelligence hardware this build can use Apple
    # Foundation Models natively (FoundationModels.framework is in the macOS
    # SDK); otherwise it degrades to BYO endpoint, same as ineligible iPhones.
    xcodebuild -project "$APPDIR/Yijing.xcodeproj" -scheme Yijing \
      -configuration Release \
      -destination 'platform=macOS,variant=Mac Catalyst' \
      CODE_SIGNING_ALLOWED=NO build
    echo "✓ Mac-Catalyst-Build fertig. In Xcode öffnen + als „My Mac (Mac Catalyst)“ starten:"
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
  device)
    : "${YIJING_TEAM_ID:?YIJING_TEAM_ID muss gesetzt sein (Apple Developer Team ID)}"
    DD="$APPDIR/build/DerivedData"
    DEST="generic/platform=iOS"
    [ -n "${YIJING_DEVICE_ID:-}" ] && DEST="platform=iOS,id=$YIJING_DEVICE_ID"
    echo "→ Development-Build für Gerät (Team $YIJING_TEAM_ID; Ziel: $DEST)…"
    # Automatic signing + provisioning updates: the first run mints the iOS
    # "Apple Development" cert + profile. -allowProvisioningDeviceRegistration
    # lets xcodebuild register a brand-new device in the developer account
    # itself (plain -allowProvisioningUpdates does NOT — it errors out with
    # "Device isn't registered"). Debug config — this is for on-device
    # functional verification (Apple FM / llama.cpp), not a release build.
    xcodebuild -project "$APPDIR/Yijing.xcodeproj" -scheme Yijing \
      -configuration Debug -sdk iphoneos \
      -destination "$DEST" \
      -derivedDataPath "$DD" \
      DEVELOPMENT_TEAM="$YIJING_TEAM_ID" \
      -allowProvisioningUpdates \
      -allowProvisioningDeviceRegistration build
    APP="$DD/Build/Products/Debug-iphoneos/Yijing.app"
    [ -d "$APP" ] || { echo "FEHLER: gebaute App nicht gefunden: $APP" >&2; exit 1; }
    echo "✓ Signierter Development-Build: $APP"
    if [ -n "${YIJING_DEVICE_ID:-}" ]; then
      echo "→ Installiere auf Gerät ${YIJING_DEVICE_ID}…"
      xcrun devicectl device install app --device "$YIJING_DEVICE_ID" "$APP"
      echo "→ Starte App auf dem Gerät…"
      xcrun devicectl device process launch --device "$YIJING_DEVICE_ID" \
        page.codeberg.jkaindl.Yijing || true
      echo "✓ Installiert + gestartet auf ${YIJING_DEVICE_ID}."
    else
      echo "  Kein YIJING_DEVICE_ID gesetzt — nur gebaut. Zum Installieren:"
      echo "    xcrun devicectl device install app --device <UDID> \"$APP\""
    fi
    ;;
  *)
    echo "Unbekannter Modus: $MODE (erlaubt: simulator | catalyst | archive | device)" >&2; exit 1 ;;
esac

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

# Build-Kennung (Commit + Zeit) NUR in Dev-Builds in die gestagte app.js setzen —
# sie aktiviert das Dev-Tooling (Build-Badge, Bild-Signatur, Test-Verlauf). Im
# archive-Build (App Store) bleibt der __BUILD__-Platzhalter → DEV_MODE = false,
# das Dev-Tooling ist aus.
if [ "$MODE" != "archive" ]; then
  BUILD_TAG="$(git -C "$REPO" rev-parse --short HEAD)·$(git -C "$REPO" log -1 --format=%cd --date=format:%d.%m.\ %H:%M)"
  sed -i '' "s|__BUILD__|$BUILD_TAG|" "$STAGE/web/app.js"
  echo "→ Build-Kennung gesetzt (Dev): $BUILD_TAG"
else
  echo "→ archive-Build: keine Build-Kennung (Dev-Tooling aus)"
fi

echo "→ Xcode-Projekt generieren (xcodegen)…"
( cd "$APPDIR" && xcodegen generate )

case "$MODE" in
  simulator)
    echo "→ Build für iOS-Simulator (kein Signing; AI = MockEngine)…"
    # No -sdk: -destination drives per-target platforms so the embedded watchOS
    # app builds for watchsimulator (not iphonesimulator).
    xcodebuild -project "$APPDIR/Yijing.xcodeproj" -scheme Yijing \
      -configuration Release \
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
    # No -sdk: -destination drives per-target platforms so the embedded watchOS
    # app archives for watchOS (not iphoneos) — required for a valid App Store archive.
    xcodebuild -project "$APPDIR/Yijing.xcodeproj" -scheme Yijing \
      -configuration Release \
      -destination 'generic/platform=iOS' \
      DEVELOPMENT_TEAM="$YIJING_TEAM_ID" \
      -archivePath "$APPDIR/build/Yijing.xcarchive" archive
    echo "✓ Archive erstellt: $APPDIR/build/Yijing.xcarchive"
    # Export (App Store) + Upload — only when an App Store Connect Issuer-ID is
    # supplied (the one missing credential; the API key 9NPJZ2DPG6 already lives
    # in ~/.appstoreconnect/private_keys/AuthKey_9NPJZ2DPG6.p8). Without it we
    # stop at the .xcarchive — safe, no account side effects.
    ASC_KEY_ID="${YIJING_ASC_KEY_ID:-9NPJZ2DPG6}"
    if [ -n "${YIJING_ASC_ISSUER_ID:-}" ]; then
      EXPORT_DIR="$APPDIR/build/export"
      rm -rf "$EXPORT_DIR"
      echo "→ Export für den App Store (-exportArchive, app-store-connect)…"
      # Pass the same App Store Connect API key to the export so automatic
      # DISTRIBUTION signing can create the „Apple Distribution" cert + App Store
      # provisioning profiles headlessly (no Xcode GUI account needed) — the same
      # credential altool uses for the upload below.
      ASC_KEY_PATH="$HOME/.appstoreconnect/private_keys/AuthKey_$ASC_KEY_ID.p8"
      xcodebuild -exportArchive \
        -archivePath "$APPDIR/build/Yijing.xcarchive" \
        -exportOptionsPlist "$APPDIR/exportOptions.plist" \
        -exportPath "$EXPORT_DIR" \
        -allowProvisioningUpdates \
        -authenticationKeyPath "$ASC_KEY_PATH" \
        -authenticationKeyID "$ASC_KEY_ID" \
        -authenticationKeyIssuerID "$YIJING_ASC_ISSUER_ID"
      IPA="$(find "$EXPORT_DIR" -name '*.ipa' | head -1)"
      [ -f "$IPA" ] || { echo "FEHLER: keine .ipa exportiert ($EXPORT_DIR)." >&2; exit 1; }
      echo "✓ Exportiert: $IPA"
      echo "→ Upload zu App Store Connect (altool; Key $ASC_KEY_ID, Issuer $YIJING_ASC_ISSUER_ID)…"
      # altool, NICHT notarytool — letzteres ist Developer-ID-Direktvertrieb (macOS-DMG).
      xcrun altool --upload-app -f "$IPA" --type ios \
        --apiKey "$ASC_KEY_ID" --apiIssuer "$YIJING_ASC_ISSUER_ID"
      echo "✓ Hochgeladen zu App Store Connect."
    else
      echo "  (kein YIJING_ASC_ISSUER_ID → Export/Upload übersprungen; nur .xcarchive.)"
      echo "  App-Store-Upload: YIJING_ASC_ISSUER_ID=<issuer-id> erneut ausführen"
      echo "  (Key $ASC_KEY_ID muss in ~/.appstoreconnect/private_keys/AuthKey_$ASC_KEY_ID.p8 liegen)."
    fi
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
    # No -sdk here: the embedded watchOS app must build for watchOS, not iphoneos.
    # -destination drives per-target platforms; forcing -sdk iphoneos would build
    # the watch app for iOS (wrong CFBundleSupportedPlatforms / UIDeviceFamily).
    xcodebuild -project "$APPDIR/Yijing.xcodeproj" -scheme Yijing \
      -configuration Debug \
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
  watch)
    echo "→ Build für watchOS-Simulator (kein Signing)…"
    # No -sdk: let -destination drive the platform. Forcing -sdk watchsimulator
    # makes the iOS-only YijingWidgets target (which can't build for watchOS, so
    # it stays iphonesimulator) link the watchOS-built OracleKit → ld error
    # "building for iOS-simulator, but linking object built for watchOS-simulator".
    # Same -sdk hazard the simulator/archive/device modes deliberately avoid.
    xcodebuild -project "$APPDIR/Yijing.xcodeproj" -scheme YijingWatch \
      -configuration Release \
      -destination 'generic/platform=watchOS Simulator' \
      CODE_SIGNING_ALLOWED=NO build
    echo "✓ watchOS-Build fertig (Schema YijingWatch)."
    ;;
  *)
    echo "Unbekannter Modus: $MODE (erlaubt: simulator | catalyst | watch | archive | device)" >&2; exit 1 ;;
esac

#!/usr/bin/env bash
#
# capture-screenshots.sh — boots iOS Simulators, installs the built app,
# deep-links to representative screens, and captures App Store screenshots at
# the required device sizes. The selection/curation of which shots to ship and
# the upload to App Store Connect stay manual (editorial) — this just produces
# the raw captures in the right resolutions.
#
# Prereq: build the app for the iOS Simulator first (it reuses that .app):
#   scripts/ios-app/build-ios-app.sh simulator
#
# Usage:
#   scripts/ios-app/capture-screenshots.sh            # all device classes
#   scripts/ios-app/capture-screenshots.sh iphone-6.9 # one class (by label)
#
# Output: scripts/ios-app/build/screenshots/<label>/<screen>.png
# NOTE: verify the captured pixel sizes against the current App Store Connect
# spec on the upload day — Apple's required sizes drift between releases.
#
# KNOWN LIMITATIONS (found 2026-06-13 on a real run — NOT yet submission-ready):
#   1. A `simulator` build is a DEV build (build tag set), so the "Prompt-Sweep
#      (Dev)" panel + build badge show in every shot. For shipping screenshots,
#      capture from a RELEASE-appearance build (no __BUILD__ substitution →
#      DEV_MODE=false). TODO: add a clean-build flag to build-ios-app.sh, or
#      strip the build tag before capture.
#   2. `simctl openurl yijing://h/<n>` triggers iOS's "Open in Yijing?" system
#      confirmation, which blocks navigation and overlays the shot — so the
#      deep-link reader screens are NOT captured as intended. Reliable reader
#      navigation needs a different path (XCUITest taps, or in-app hash nav),
#      or manual capture + curation.
# The boot / install / device-matrix / correct-sizing scaffolding below is
# sound and reusable; the two gaps above are what a screenshot session must fix.
# TODO(watch): the watchOS app needs its own watchsimulator + watch build;
# add a watch pass once the phone/iPad matrix is curated.
set -euo pipefail

REPO="$(git rev-parse --show-toplevel)"
APPDIR="$REPO/scripts/ios-app"
OUT="${YIJING_SHOT_DIR:-$APPDIR/build/screenshots}"
BUNDLE="page.codeberg.jkaindl.Yijing"
RUNTIME="${YIJING_IOS_RUNTIME:-com.apple.CoreSimulator.SimRuntime.iOS-26-5}"
FILTER="${1:-}"

APP="$(find "$HOME/Library/Developer/Xcode/DerivedData/Yijing-"*/Build/Products/Release-iphonesimulator/Yijing.app -maxdepth 0 2>/dev/null | head -1 || true)"
[ -d "$APP" ] || { echo "Kein Simulator-Build gefunden. Erst: scripts/ios-app/build-ios-app.sh simulator" >&2; exit 1; }
echo "→ App: $APP"

# device matrix — "label|devicetype". Labels map to App Store size classes.
DEVICES=(
  "iphone-6.9|iPhone 16 Pro Max"
  "iphone-6.5|iPhone 11 Pro Max"
  "ipad-13|iPad Pro 13-inch (M4)"
)

# Screens to capture. "home" = just launch; "h/<n>" = deep-link to the reader
# on hexagram n (yijing://h/<n>). Hex 1 (Qian), 22 (Anmut/Grace), 29 (Abgrund).
SCREENS=("home" "h/1" "h/22" "h/29")

shot_device() {
  local label="$1" dtype="$2"
  local name="yijing-shot-$label"
  local udid
  udid="$(xcrun simctl list devices | grep -F "$name (" | grep -oE '[0-9A-Fa-f-]{36}' | head -1 || true)"
  if [ -z "$udid" ]; then
    udid="$(xcrun simctl create "$name" "$dtype" "$RUNTIME")"
    echo "  Simulator erstellt: $name ($udid)"
  fi
  xcrun simctl boot "$udid" 2>/dev/null || true
  xcrun simctl bootstatus "$udid" -b >/dev/null
  xcrun simctl install "$udid" "$APP"
  mkdir -p "$OUT/$label"
  for s in "${SCREENS[@]}"; do
    xcrun simctl launch "$udid" "$BUNDLE" >/dev/null 2>&1 || true
    [ "$s" != "home" ] && xcrun simctl openurl "$udid" "yijing://$s"
    sleep 4   # let the WKWebView + web app render the screen
    xcrun simctl io "$udid" screenshot "$OUT/$label/${s//\//-}.png" >/dev/null
    echo "  ✓ $label/${s//\//-}.png"
  done
  xcrun simctl shutdown "$udid" 2>/dev/null || true
}

mkdir -p "$OUT"
for d in "${DEVICES[@]}"; do
  IFS='|' read -r label dtype <<<"$d"
  [ -n "$FILTER" ] && [ "$FILTER" != "$label" ] && continue
  echo "→ $label ($dtype)…"
  shot_device "$label" "$dtype"
done
echo "✓ Captures in $OUT — kuratieren + in App Store Connect hochladen."
echo "  (Pixelgrößen am Upload-Tag gegen die aktuelle ASC-Spec prüfen.)"

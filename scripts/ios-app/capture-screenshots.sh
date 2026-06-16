#!/usr/bin/env bash
#
# capture-screenshots.sh — boots iOS Simulators, installs the built app,
# deep-links to representative screens, and captures App Store screenshots at
# the required device sizes. The selection/curation of which shots to ship and
# the upload to App Store Connect stay manual (editorial) — this just produces
# the raw captures in the right resolutions.
#
# Prereq: build the app for the iOS Simulator with STORE APPEARANCE first (no Dev
# panel / build badge — see gap 1 below). It reuses that .app:
#   YIJING_RELEASE_APPEARANCE=1 scripts/ios-app/build-ios-app.sh simulator
#
# Usage:
#   scripts/ios-app/capture-screenshots.sh            # all device classes
#   scripts/ios-app/capture-screenshots.sh iphone-6.9 # one class (by label)
#
# Output: scripts/ios-app/build/screenshots/<label>/<screen>.png
# NOTE: verify the captured pixel sizes against the current App Store Connect
# spec on the upload day — Apple's required sizes drift between releases.
#
# The two gaps found on the 2026-06-13 run are now CLOSED:
#   1. Dev panel / build badge — fixed by building with YIJING_RELEASE_APPEARANCE=1
#      (keeps the __BUILD__ placeholder → DEV_MODE=false, App-Store optics). If you
#      forget the flag, the shots show the "Prompt-Sweep (Dev)" panel + badge.
#   2. The "Open in Yijing?" openurl dialog — fixed by navigating via the app's
#      `-yijingScreen <n>` launch argument (WebViewController reads it on cold
#      launch and deep-links the reader), instead of `simctl openurl yijing://`.
#      No system dialog, no overlay.
# NOTE: the Simulator has no Apple-Intelligence / Image Playground, so AI
# interpretation (MockEngine) and the meditation image do NOT render here — the
# "hero" AI/image shots must be captured on a real device. Everything captured
# below (cast UI, the Wilhelm reader) is faithful to the device.
# TODO(watch): the watchOS app needs its own watchsimulator + watch build; capture
# it separately (YijingWatch scheme) — the watch app is offline/AI-free, so
# simulator captures are faithful to the device.
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

# Screens to capture. "home" = just launch (the cast entry); "h/<n>" = the reader
# on hexagram n, reached via the -yijingScreen launch arg (no openurl dialog).
# Picked for variety: 1 Qian (The Creative), 2 Kun (The Receptive),
# 22 Bi (Grace), 52 Gen (Keeping Still).
SCREENS=("home" "h/1" "h/2" "h/22" "h/52")

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
    # Cold-launch each screen: terminate first so the -yijingScreen launch arg is
    # read fresh (WebViewController applies it via pendingHexagram on page load).
    xcrun simctl terminate "$udid" "$BUNDLE" >/dev/null 2>&1 || true
    if [ "$s" = "home" ]; then
      xcrun simctl launch "$udid" "$BUNDLE" >/dev/null 2>&1 || true
    else
      xcrun simctl launch "$udid" "$BUNDLE" -yijingScreen "${s#h/}" >/dev/null 2>&1 || true
    fi
    sleep 6   # let the loopback server + WKWebView + web app render the screen
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

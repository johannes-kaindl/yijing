#!/usr/bin/env bash
#
# build-macos-app.sh — baut Yijing.app als macOS-App-Bundle nach dist/.
#
# Bettet den committeten Repo-Stand (git archive HEAD) ein, kompiliert die
# native Swift-App (universal arm64 + x86_64) und erzeugt ein verteilbares
# Disk-Image (Yijing.dmg). Details: docs/MACOS-APP.md.
#
# Voraussetzung: Xcode Command Line Tools (swiftc, sips, iconutil, hdiutil).
#
set -euo pipefail

REPO="$(git rev-parse --show-toplevel)"
cd "$REPO"

ASSETS="scripts/macos-app"
DIST="dist"
APP="$DIST/Yijing.app"

echo "==> Voraussetzungen pruefen"
for tool in swiftc lipo sips iconutil hdiutil git tar; do
  command -v "$tool" >/dev/null 2>&1 \
    || { echo "FEHLT: $tool — bitte Xcode Command Line Tools installieren (xcode-select --install)"; exit 1; }
done

echo "==> Bundle-Grundgeruest (dist/Yijing.app)"
rm -rf "$APP" "$DIST/Yijing.dmg" "$DIST/Yijing.app.zip"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/yijing"

echo "==> Repo-Inhalt einbetten (committeter Stand via git archive HEAD)"
git archive HEAD | tar -x -C "$APP/Contents/Resources/yijing"

echo "==> Native App kompilieren (Swift, universal arm64 + x86_64)"
swiftc -O -target arm64-apple-macosx12.0 \
  -o "$DIST/Yijing-arm64" "$ASSETS/Yijing.swift"
if swiftc -O -target x86_64-apple-macosx12.0 \
  -o "$DIST/Yijing-x86_64" "$ASSETS/Yijing.swift" 2>/dev/null; then
  lipo -create "$DIST/Yijing-arm64" "$DIST/Yijing-x86_64" \
    -output "$APP/Contents/MacOS/Yijing"
  rm -f "$DIST/Yijing-arm64" "$DIST/Yijing-x86_64"
else
  echo "   (x86_64-Build nicht moeglich — arm64-only)"
  mv "$DIST/Yijing-arm64" "$APP/Contents/MacOS/Yijing"
fi
chmod +x "$APP/Contents/MacOS/Yijing"

echo "==> Info.plist einbetten"
cp "$ASSETS/Info.plist" "$APP/Contents/Info.plist"

echo "==> App-Icon erzeugen (.icns aus icon-1024.png)"
ICONSET="$DIST/AppIcon.iconset"
rm -rf "$ICONSET"; mkdir -p "$ICONSET"
SRC="$ASSETS/icon-1024.png"
sips -z 16 16     "$SRC" --out "$ICONSET/icon_16x16.png"      >/dev/null
sips -z 32 32     "$SRC" --out "$ICONSET/icon_16x16@2x.png"   >/dev/null
sips -z 32 32     "$SRC" --out "$ICONSET/icon_32x32.png"      >/dev/null
sips -z 64 64     "$SRC" --out "$ICONSET/icon_32x32@2x.png"   >/dev/null
sips -z 128 128   "$SRC" --out "$ICONSET/icon_128x128.png"    >/dev/null
sips -z 256 256   "$SRC" --out "$ICONSET/icon_128x128@2x.png" >/dev/null
sips -z 256 256   "$SRC" --out "$ICONSET/icon_256x256.png"    >/dev/null
sips -z 512 512   "$SRC" --out "$ICONSET/icon_256x256@2x.png" >/dev/null
sips -z 512 512   "$SRC" --out "$ICONSET/icon_512x512.png"    >/dev/null
cp "$SRC" "$ICONSET/icon_512x512@2x.png"
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"
rm -rf "$ICONSET"

echo "==> LICENSE einbetten"
cp LICENSE "$APP/Contents/Resources/LICENSE"

echo "==> Aufraeumen und Disk-Image erzeugen"
find "$APP" -name '.DS_Store' -delete 2>/dev/null || true
STAGING="$DIST/dmg-staging"
rm -rf "$STAGING"; mkdir -p "$STAGING"
cp -R "$APP" "$STAGING/Yijing.app"
cp "$ASSETS/INSTALL.txt" "$STAGING/INSTALL.txt"
ln -s /Applications "$STAGING/Applications"
hdiutil create -volname "Yijing Orakel" -srcfolder "$STAGING" \
  -ov -format UDZO "$DIST/Yijing.dmg" >/dev/null
rm -rf "$STAGING"
cp "$ASSETS/INSTALL.txt" "$DIST/INSTALL.txt"

echo
echo "Fertig:"
echo "  App :  $REPO/$APP"
echo "  DMG :  $REPO/$DIST/Yijing.dmg"
echo "  Doku:  $REPO/$DIST/INSTALL.txt"
echo
echo "Zum Weitergeben: Yijing.dmg verschicken."

#!/usr/bin/env bash
#
# build-macos-app.sh — baut Yijing.app als macOS-App-Bundle nach dist/.
#
# Bettet den committeten Repo-Stand (git archive HEAD) ein, kompiliert den
# nativen Launcher (universal arm64 + x86_64) und erzeugt ein verteilbares
# Zip. Der native Launcher ist nötig, weil macOS .app-Bundles mit einem
# Shell-Skript als CFBundleExecutable auf Apple Silicon faelschlich als
# Intel-App einstuft und Rosetta verlangt. Details: docs/MACOS-APP.md.
#
# Voraussetzung: Xcode Command Line Tools (clang, sips, iconutil, ditto).
#
set -euo pipefail

REPO="$(git rev-parse --show-toplevel)"
cd "$REPO"

ASSETS="scripts/macos-app"
DIST="dist"
APP="$DIST/Yijing.app"

echo "==> Voraussetzungen pruefen"
for tool in clang sips iconutil ditto git tar; do
  command -v "$tool" >/dev/null 2>&1 \
    || { echo "FEHLT: $tool — bitte Xcode Command Line Tools installieren (xcode-select --install)"; exit 1; }
done

echo "==> Bundle-Grundgeruest (dist/Yijing.app)"
rm -rf "$APP" "$DIST/Yijing.app.zip"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/yijing"

echo "==> Repo-Inhalt einbetten (committeter Stand via git archive HEAD)"
git archive HEAD | tar -x -C "$APP/Contents/Resources/yijing"

echo "==> Nativen Launcher kompilieren (arm64 + x86_64)"
clang -arch arm64 -arch x86_64 -O2 \
  -o "$APP/Contents/MacOS/Yijing" "$ASSETS/launcher.c"

echo "==> Server-Skript und Info.plist einbetten"
cp "$ASSETS/launch.sh" "$APP/Contents/Resources/launch.sh"
chmod +x "$APP/Contents/Resources/launch.sh"
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

echo "==> Aufraeumen und zippen"
find "$APP" -name '.DS_Store' -delete 2>/dev/null || true
ditto -c -k --sequesterRsrc --keepParent "$APP" "$DIST/Yijing.app.zip"
cp "$ASSETS/INSTALL.txt" "$DIST/INSTALL.txt"

echo
echo "Fertig:"
echo "  App :  $REPO/$APP"
echo "  Zip :  $REPO/$DIST/Yijing.app.zip"
echo "  Doku:  $REPO/$DIST/INSTALL.txt"
echo
echo "Zum Weitergeben: Yijing.app.zip + INSTALL.txt verschicken."

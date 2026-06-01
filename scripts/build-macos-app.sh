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
# Optionales Code-Signing + Notarisierung (Opt-in ueber Umgebungsvariablen):
#
#   YIJING_SIGN_IDENTITY  "Developer ID Application: NAME (TEAMID)"  oder  "auto"
#   YIJING_NOTARY_PROFILE notarytool-Keychain-Profil (siehe docs/MACOS-APP.md)
#
#   - beide ungesetzt -> unsignierter Build wie bisher (Default fuer Mitwirkende
#     ohne Apple-Developer-Account).
#   - nur YIJING_SIGN_IDENTITY -> App + DMG werden Developer-ID-signiert
#     (Hardened Runtime), aber NICHT notarisiert (lokaler Signatur-Test).
#   - beide gesetzt -> volle Pipeline: signieren -> notarisieren -> staplen
#     fuer App und DMG, danach Gatekeeper-Pruefung. Mac muss online sein.
#
# Reihenfolge ist zwingend: App signieren -> notarisieren -> staplen, ERST DANN
# die DMG aus der gestaplten App bauen, dann DMG signieren -> notarisieren ->
# staplen. Sonst landet eine unsignierte App in der DMG.
#
set -euo pipefail

REPO="$(git rev-parse --show-toplevel)"
cd "$REPO"

ASSETS="scripts/macos-app"
DIST="dist"
APP="$DIST/Yijing.app"
DMG="$DIST/Yijing.dmg"

# --- Signing-Konfiguration aufloesen (Opt-in) ---------------------------------
SIGN_IDENTITY="${YIJING_SIGN_IDENTITY:-}"
NOTARY_PROFILE="${YIJING_NOTARY_PROFILE:-}"
SIGN_MODE="none"   # none | sign | notarize

if [[ -n "$SIGN_IDENTITY" || -n "$NOTARY_PROFILE" ]]; then
  if [[ -z "$SIGN_IDENTITY" ]]; then
    echo "FEHLER: YIJING_NOTARY_PROFILE gesetzt, aber YIJING_SIGN_IDENTITY fehlt" >&2
    echo "        — ohne Developer-ID-Signatur ist keine Notarisierung moeglich." >&2
    exit 1
  fi
  for tool in codesign xcrun ditto spctl; do
    command -v "$tool" >/dev/null 2>&1 \
      || { echo "FEHLT: $tool — fuer Signing/Notarisierung benoetigt"; exit 1; }
  done
  if [[ "$SIGN_IDENTITY" == "auto" ]]; then
    # erste "Developer ID Application"-Identitaet aus dem Keychain ziehen
    SIGN_IDENTITY="$(security find-identity -v -p codesigning \
      | sed -n 's/.*"\(Developer ID Application: [^"]*\)".*/\1/p' | head -1)"
    [[ -n "$SIGN_IDENTITY" ]] || {
      echo "FEHLER: keine 'Developer ID Application'-Identitaet im Keychain (auto)." >&2
      echo "        Pruefe: security find-identity -v -p codesigning" >&2
      exit 1
    }
    echo "==> Signing-Identitaet (auto): $SIGN_IDENTITY"
  fi
  if [[ -n "$NOTARY_PROFILE" ]]; then
    SIGN_MODE="notarize"
  else
    SIGN_MODE="sign"
  fi
fi

echo "==> Voraussetzungen pruefen"
for tool in swiftc lipo sips iconutil hdiutil git tar; do
  command -v "$tool" >/dev/null 2>&1 \
    || { echo "FEHLT: $tool — bitte Xcode Command Line Tools installieren (xcode-select --install)"; exit 1; }
done

echo "==> Bundle-Grundgeruest (dist/Yijing.app)"
rm -rf "$APP" "$DMG" "$DIST/Yijing.app.zip"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

echo "==> Web-Assets einbetten (committeter Stand — nur web/, data/, sw.js)"
git archive HEAD web/ data/ sw.js | tar -x -C "$APP/Contents/Resources" \
  || { echo "FEHLER: git archive HEAD fehlgeschlagen — gibt es einen committeten HEAD?"; exit 1; }

echo "==> Native App kompilieren (Swift, universal arm64 + x86_64)"
SOURCES=("$ASSETS/Yijing.swift" "$ASSETS/StaticServer.swift")
swiftc -O -target arm64-apple-macosx12.0 \
  -o "$DIST/Yijing-arm64" "${SOURCES[@]}"
if swiftc -O -target x86_64-apple-macosx12.0 \
  -o "$DIST/Yijing-x86_64" "${SOURCES[@]}" 2>/dev/null; then
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

# .DS_Store VOR dem Signieren entfernen — sonst wuerde es in die Signatur
# eingesiegelt und kaeme bei der Verifikation als Fremdkoerper hoch.
find "$APP" -name '.DS_Store' -delete 2>/dev/null || true

# --- App signieren + notarisieren + staplen (optional) ------------------------
if [[ "$SIGN_MODE" != "none" ]]; then
  echo "==> App signieren (Developer ID, Hardened Runtime, sicherer Timestamp)"
  # EINE codesign-Aufrufung auf das Bundle: Yijing.app hat genau ein Mach-O
  # (Contents/MacOS/Yijing) und keinen verschachtelten Code — das Signieren des
  # Bundles signiert und versiegelt das Main-Executable mit. Daher KEIN --deep
  # (nur read-only beim Verify gueltig) und KEIN separates Signieren des Binaers.
  # Keine --entitlements-Datei: Hardened Runtime ist ein Signing-Flag, nicht
  # Entitlement. Die App ist nicht sandboxed; NWListener (127.0.0.1) und die
  # Outbound-localhost-Calls (Ollama/MLX) brauchen unter Hardened Runtime keine
  # Entitlement-Keys, und WKWebViews JIT laeuft im separaten WebContent-Prozess.
  codesign --force --options runtime --timestamp --sign "$SIGN_IDENTITY" "$APP"
  codesign --verify --deep --strict --verbose=2 "$APP"
  if codesign -dvvv "$APP" 2>&1 | grep -q "Timestamp=none"; then
    echo "FEHLER: Signatur ohne sicheren Timestamp (Mac offline?)." >&2
    echo "        Notarisierung wuerde scheitern — Build abgebrochen." >&2
    exit 1
  fi

  if [[ "$SIGN_MODE" == "notarize" ]]; then
    echo "==> App notarisieren (notarytool, wartet auf Apple) + staplen"
    # Ein .app-Bundle laesst sich nicht direkt hochladen -> als .zip einreichen
    # (das .zip kann notarisiert, aber NIE gestaplet werden). Das Ticket wird
    # ins .app-Bundle gestaplet, damit es auch offline durch Gatekeeper kommt.
    APPZIP="$DIST/Yijing.app.zip"
    ditto -c -k --keepParent "$APP" "$APPZIP"
    xcrun notarytool submit "$APPZIP" -p "$NOTARY_PROFILE" --wait
    xcrun stapler staple "$APP"
    rm -f "$APPZIP"
  else
    echo "   (nur signiert, nicht notarisiert — Gatekeeper lehnt heruntergeladene"
    echo "    Kopien weiterhin ab; YIJING_NOTARY_PROFILE setzen fuer den Vollbuild)"
  fi
fi

echo "==> Disk-Image erzeugen"
STAGING="$DIST/dmg-staging"
rm -rf "$STAGING"; mkdir -p "$STAGING"
cp -R "$APP" "$STAGING/Yijing.app"
cp "$ASSETS/INSTALL.txt" "$STAGING/INSTALL.txt"
ln -s /Applications "$STAGING/Applications"
hdiutil create -volname "Yijing Orakel" -srcfolder "$STAGING" \
  -ov -format UDZO "$DMG" >/dev/null
rm -rf "$STAGING"
cp "$ASSETS/INSTALL.txt" "$DIST/INSTALL.txt"

# --- DMG signieren + notarisieren + staplen (optional) ------------------------
if [[ "$SIGN_MODE" != "none" ]]; then
  echo "==> DMG signieren (Developer ID, sicherer Timestamp)"
  codesign --force --timestamp --sign "$SIGN_IDENTITY" "$DMG"
  if [[ "$SIGN_MODE" == "notarize" ]]; then
    echo "==> DMG notarisieren + staplen"
    xcrun notarytool submit "$DMG" -p "$NOTARY_PROFILE" --wait
    xcrun stapler staple "$DMG"
    echo "==> Gatekeeper-Pruefung (Versand nur wenn alles 'accepted')"
    xcrun stapler validate "$DMG"
    spctl -a -vvv -t open --context context:primary-signature "$DMG" || true
    spctl -a -vvv -t exec "$APP" || true
  fi
fi

echo
echo "Fertig:"
echo "  App :  $REPO/$APP"
echo "  DMG :  $REPO/$DMG"
echo "  Doku:  $REPO/$DIST/INSTALL.txt"
case "$SIGN_MODE" in
  notarize) echo "  Sig :  Developer-ID-signiert + notarisiert + gestaplet" ;;
  sign)     echo "  Sig :  Developer-ID-signiert (NICHT notarisiert)" ;;
  none)     echo "  Sig :  unsigniert — fuer Notarisierung YIJING_SIGN_IDENTITY + YIJING_NOTARY_PROFILE setzen (docs/MACOS-APP.md)" ;;
esac
echo
echo "Zum Weitergeben: Yijing.dmg verschicken."

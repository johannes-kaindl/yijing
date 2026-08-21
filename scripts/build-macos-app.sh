#!/usr/bin/env bash
#
# build-macos-app.sh — baut Yijing.app als macOS-App-Bundle nach dist/.
#
# Bettet den committeten Repo-Stand (git archive HEAD) ein und kompiliert die
# native Swift-App (universal arm64 + x86_64). Das verteilbare Disk-Image baut
# scripts/package-macos-app.sh — es ruft dieses Skript auf. Details:
# docs/MACOS-APP.md.
#
# Voraussetzung: Xcode Command Line Tools (swiftc, sips, iconutil).
#
# Optionales Code-Signing (Opt-in ueber Umgebungsvariable):
#
#   YIJING_SIGN_IDENTITY  "Developer ID Application: NAME (TEAMID)"  oder  "auto"
#
#   - ungesetzt -> unsignierter Build (Default fuer Mitwirkende ohne
#     Apple-Developer-Account).
#   - gesetzt -> App wird Developer-ID-signiert (Hardened Runtime, sicherer
#     Timestamp). Die Notarisierung setzt darauf auf und passiert im
#     Package-Skript, weil sie vor dem DMG-Bau liegen muss.
#
set -euo pipefail

REPO="$(git rev-parse --show-toplevel)"
cd "$REPO"

ASSETS="scripts/macos-app"
DIST="dist"
APP="$DIST/Yijing.app"

# --- Signing-Konfiguration aufloesen (Opt-in) ---------------------------------
SIGN_IDENTITY="${YIJING_SIGN_IDENTITY:-}"

if [[ -n "$SIGN_IDENTITY" ]]; then
  command -v codesign >/dev/null 2>&1 \
    || { echo "FEHLT: codesign — fuer Signing benoetigt"; exit 1; }
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
fi

echo "==> Voraussetzungen pruefen (Build)"
for tool in swiftc lipo sips iconutil git tar; do
  command -v "$tool" >/dev/null 2>&1 \
    || { echo "FEHLT: $tool — bitte Xcode Command Line Tools installieren (xcode-select --install)"; exit 1; }
done

echo "==> Bundle-Grundgeruest (dist/Yijing.app)"
# Die DMG aus einem frueheren Lauf faellt mit: sie zeigte den alten Stand und
# stuende sonst neben einer frisch gebauten App, ohne zu ihr zu gehoeren.
rm -rf "$APP" "$DIST/Yijing.dmg" "$DIST/Yijing.app.zip"
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

# --- App signieren (optional) -------------------------------------------------
if [[ -n "$SIGN_IDENTITY" ]]; then
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
  # Ausgabe erst einsammeln, dann pruefen: `codesign ... | grep -q` beendet grep
  # beim ersten Treffer, codesign stirbt an SIGPIPE (141), und `pipefail` reicht
  # genau das durch — die Bedingung waere ausgerechnet im Trefferfall falsch.
  SIGN_INFO="$(codesign -dvvv "$APP" 2>&1 || true)"
  if [[ "$SIGN_INFO" == *"Timestamp=none"* ]]; then
    echo "FEHLER: Signatur ohne sicheren Timestamp (Mac offline?)." >&2
    echo "        Notarisierung wuerde scheitern — Build abgebrochen." >&2
    exit 1
  fi
fi

# Beim Aufruf aus package-macos-app.sh entfaellt die Zusammenfassung: sie stuende
# mitten im Packaging-Lauf und riete dort zu genau dem Skript, das gerade laeuft.
if [[ -n "${YIJING_PACKAGING:-}" ]]; then
  if [[ -n "$SIGN_IDENTITY" ]]; then
    echo "   (App gebaut + Developer-ID-signiert)"
  else
    echo "   (App gebaut, unsigniert)"
  fi
  exit 0
fi

echo
echo "Fertig:"
echo "  App :  $REPO/$APP"
if [[ -n "$SIGN_IDENTITY" ]]; then
  echo "  Sig :  Developer-ID-signiert (Notarisierung macht das Package-Skript)"
else
  echo "  Sig :  unsigniert — fuer eine signierte App YIJING_SIGN_IDENTITY setzen (docs/MACOS-APP.md)"
fi
echo
echo "Zum Weitergeben: ./scripts/package-macos-app.sh — baut daraus die DMG."

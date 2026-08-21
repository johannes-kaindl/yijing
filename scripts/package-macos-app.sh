#!/usr/bin/env bash
#
# package-macos-app.sh — verpackt Yijing.app zur verteilbaren dist/Yijing.dmg.
#
# Ruft zuerst build-macos-app.sh (baut + signiert die App), notarisiert und
# stapelt sie, baut daraus das Disk-Image und notarisiert + stapelt auch das.
# Details: docs/MACOS-APP.md.
#
# Voraussetzung: Xcode Command Line Tools (hdiutil; fuer den signierten Weg
# zusaetzlich codesign, xcrun, ditto, spctl).
#
# Signieren + Notarisieren sind Opt-in ueber dieselben Umgebungsvariablen, die
# build-macos-app.sh kennt — sie werden unveraendert durchgereicht:
#
#   YIJING_SIGN_IDENTITY  "Developer ID Application: NAME (TEAMID)"  oder  "auto"
#   YIJING_NOTARY_PROFILE notarytool-Keychain-Profil (siehe docs/MACOS-APP.md)
#
#   - beide ungesetzt -> unsignierte DMG (Default fuer Mitwirkende ohne
#     Apple-Developer-Account). Anders als bei manchen Schwester-Repos ist das
#     KEIN Abbruch: eine unsignierte DMG bleibt ein gueltiges Bauergebnis.
#   - nur YIJING_SIGN_IDENTITY -> App + DMG Developer-ID-signiert, aber NICHT
#     notarisiert (lokaler Signatur-Test).
#   - beide gesetzt -> volle Pipeline inkl. Gatekeeper-Pruefung. Mac online.
#
# Reihenfolge ist zwingend: App notarisieren -> staplen, ERST DANN die DMG aus
# der gestaplten App bauen, dann DMG signieren -> notarisieren -> staplen.
# Sonst landet eine App ohne Ticket in der DMG. Genau diese Verkettung ist der
# Grund, dass der DMG-Bau hier liegt und nicht im Build-Skript.
#
set -euo pipefail

REPO="$(git rev-parse --show-toplevel)"
cd "$REPO"

ASSETS="scripts/macos-app"
DIST="dist"
APP="$DIST/Yijing.app"
DMG="$DIST/Yijing.dmg"

SIGN_IDENTITY="${YIJING_SIGN_IDENTITY:-}"
NOTARY_PROFILE="${YIJING_NOTARY_PROFILE:-}"

if [[ -n "$NOTARY_PROFILE" && -z "$SIGN_IDENTITY" ]]; then
  echo "FEHLER: YIJING_NOTARY_PROFILE gesetzt, aber YIJING_SIGN_IDENTITY fehlt" >&2
  echo "        — ohne Developer-ID-Signatur ist keine Notarisierung moeglich." >&2
  exit 1
fi

echo "==> Voraussetzungen pruefen (Packaging)"
for tool in hdiutil git; do
  command -v "$tool" >/dev/null 2>&1 \
    || { echo "FEHLT: $tool — bitte Xcode Command Line Tools installieren (xcode-select --install)"; exit 1; }
done
if [[ -n "$SIGN_IDENTITY" ]]; then
  for tool in codesign xcrun ditto spctl; do
    command -v "$tool" >/dev/null 2>&1 \
      || { echo "FEHLT: $tool — fuer Signing/Notarisierung benoetigt"; exit 1; }
  done
fi

# --- App bauen (+ signieren, wenn YIJING_SIGN_IDENTITY gesetzt ist) -----------
echo "==> App bauen: scripts/build-macos-app.sh"
# YIJING_PACKAGING unterdrueckt dort nur die Schluss-Zusammenfassung.
YIJING_PACKAGING=1 bash "$REPO/scripts/build-macos-app.sh"
[[ -d "$APP" ]] || { echo "FEHLER: $APP fehlt nach dem Build." >&2; exit 1; }

# Signatur am Artefakt messen statt der Umgebungsvariable zu glauben: build
# koennte trotz gesetzter Identitaet ungesigniert durchgelaufen sein, und eine
# Notarisierung ohne Developer-ID-Signatur scheitert erst nach dem Upload.
SIGN_MODE="none"   # none | sign | notarize
# Ausgabe einsammeln statt durch `grep -q` zu pipen: der Fruehabbruch von grep
# schickt codesign SIGPIPE (141), was `pipefail` durchreicht — die Pruefung
# schluege ausgerechnet bei der signierten App fehl.
APP_SIGN_INFO="$(codesign -dvvv "$APP" 2>&1 || true)"
if [[ "$APP_SIGN_INFO" == *"Authority=Developer ID Application"* ]]; then
  SIGN_MODE="sign"
  [[ -n "$NOTARY_PROFILE" ]] && SIGN_MODE="notarize"
  # Die DMG mit genau der Identitaet signieren, die auch die App traegt. Das
  # loest zugleich "auto" auf: aufgeloest wird es im Build-Skript, und zwar in
  # dessen Subprozess — hier laege sonst weiter das Wort "auto" vor, mit dem
  # codesign nichts anfangen kann ("auto: no identity found").
  SIGN_IDENTITY="$(awk '/^Authority=Developer ID Application/ { sub(/^Authority=/, ""); print; exit }' <<<"$APP_SIGN_INFO")"
  [[ -n "$SIGN_IDENTITY" ]] || {
    echo "FEHLER: Signatur-Identitaet nicht aus $APP lesbar." >&2
    exit 1
  }
elif [[ -n "$SIGN_IDENTITY" ]]; then
  echo "FEHLER: YIJING_SIGN_IDENTITY war gesetzt, aber $APP traegt keine" >&2
  echo "        Developer-ID-Signatur — Build pruefen, nicht weiterverpacken." >&2
  exit 1
fi

# --- App notarisieren + staplen (optional) ------------------------------------
if [[ "$SIGN_MODE" == "notarize" ]]; then
  echo "==> App notarisieren (notarytool, wartet auf Apple) + staplen"
  # Ein .app-Bundle laesst sich nicht direkt hochladen -> als .zip einreichen
  # (das .zip kann notarisiert, aber NIE gestaplet werden). Das Ticket wird
  # ins .app-Bundle gestaplet, damit es auch offline durch Gatekeeper kommt.
  APPZIP="$DIST/Yijing.app.zip"
  rm -f "$APPZIP"
  ditto -c -k --keepParent "$APP" "$APPZIP"
  xcrun notarytool submit "$APPZIP" -p "$NOTARY_PROFILE" --wait
  xcrun stapler staple "$APP"
  rm -f "$APPZIP"
elif [[ "$SIGN_MODE" == "sign" ]]; then
  echo "   (App nur signiert, nicht notarisiert — Gatekeeper lehnt heruntergeladene"
  echo "    Kopien weiterhin ab; YIJING_NOTARY_PROFILE setzen fuer den Vollbuild)"
fi

echo "==> Disk-Image erzeugen"
STAGING="$DIST/dmg-staging"
rm -rf "$STAGING" "$DMG"; mkdir -p "$STAGING"
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

#!/bin/bash
# Yijing Orakel — Server-Start (aufgerufen vom nativen Launcher MacOS/Yijing).
#
# Findet python3, sucht einen freien Port und startet den lokalen Server
# (scripts/serve.py, no-cache). Der Server wird per `exec` zum Hauptprozess
# der App: Beendet die Nutzerin die App — egal wie — stirbt der Server
# zwangsläufig mit, es kann kein verwaister Prozess zurückbleiben.
# Polling und das Öffnen von Safari laufen in einer Hintergrund-Subshell.

set -u

APP_TITLE="Yijing Orakel"

# --- Bundle-Verzeichnis auflösen -------------------------------------------
# launch.sh liegt in Contents/Resources/, der Repo-Inhalt daneben in yijing/.
YIJING_DIR="$(cd "$(dirname "$0")/yijing" && pwd)"

# --- python3 finden --------------------------------------------------------
# Reihenfolge: Homebrew (Apple Silicon), Homebrew (Intel), System-Python.
PYTHON=""
for candidate in /opt/homebrew/bin/python3 /usr/local/bin/python3 /usr/bin/python3; do
  if [ -x "$candidate" ] && "$candidate" --version >/dev/null 2>&1; then
    PYTHON="$candidate"
    break
  fi
done

if [ -z "$PYTHON" ]; then
  # Kein funktionierendes python3 — meist fehlen die Command Line Tools.
  osascript -e 'display dialog "Für das Yijing Orakel müssen einmalig die macOS Command Line Tools installiert werden. Folge bitte dem Apple-Dialog, der gleich erscheint, und starte die App danach erneut." buttons {"OK"} default button "OK" with title "'"$APP_TITLE"'" with icon caution' >/dev/null 2>&1
  xcode-select --install >/dev/null 2>&1
  exit 1
fi

# --- freien Port finden (8765–8775) ----------------------------------------
PORT="$("$PYTHON" - <<'PYEOF'
import socket
for port in range(8765, 8776):
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.bind(("", port))
    except OSError:
        continue
    finally:
        sock.close()
    print(port)
    break
PYEOF
)"

if [ -z "$PORT" ]; then
  osascript -e 'display dialog "Alle Netzwerk-Ports (8765 bis 8775) sind derzeit belegt. Bitte schließe andere Programme und starte das Yijing Orakel erneut." buttons {"OK"} default button "OK" with title "'"$APP_TITLE"'" with icon stop' >/dev/null 2>&1
  exit 1
fi

URL="http://localhost:${PORT}/web/index.html"

# --- Polling + Safari (Hintergrund) ----------------------------------------
# Wartet bis zu 5 s, ob der gleich gestartete Server antwortet, und öffnet
# dann Safari explizit (nicht den Default-Browser). Kommt der Server nicht
# hoch, erscheint ein Hinweisdialog.
(
  for _ in $(seq 1 25); do
    if curl -s -o /dev/null "$URL"; then
      open -a Safari "$URL"
      exit 0
    fi
    sleep 0.2
  done
  osascript -e 'display dialog "Der lokale Server konnte nicht gestartet werden. Bitte beende das Yijing Orakel und öffne es erneut." buttons {"OK"} default button "OK" with title "'"$APP_TITLE"'" with icon stop' >/dev/null 2>&1
) &

# --- Server als Hauptprozess starten ---------------------------------------
# `exec` ersetzt diesen Launcher durch den Server. Damit ist der Server der
# Prozess der App — sein Ende ist das Ende der App und umgekehrt.
exec env PORT="$PORT" "$PYTHON" "$YIJING_DIR/scripts/serve.py"

#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Johannes Kaindl
#
# Deployt main → pages.jkaindl.de/yijing/ (flaches Layout, per rsync).
#
# Ersetzt sync-pages.sh (Codeberg-Pages via pages-Branch — tot seit dem
# Umzug auf git.jkaindl.de). Die Layout-Transformation bleibt identisch:
# web/*-Inhalt direkt im Root, daneben data/ und sw.js; Pfad-Anpassungen
# in app.js (../data → data, ../sw.js → sw.js) werden eingespielt.
#
# Ziel ist /srv/pages/yijing/ auf dem Pages-Server, erreichbar über den
# SSH-Host-Alias `pages-deploy` (~/.ssh/config) — serverseitig per rrsync
# auf /srv/pages beschränkt.
#
# Braucht echtes rsync 3.x — macOS' openrsync ist mit dem serverseitigen
# rrsync-Wrapper inkompatibel: brew install rsync
#
# Nutzung (aus dem Repo-Root):  ./scripts/deploy-page.sh
set -euo pipefail

RSYNC="${RSYNC:-/opt/homebrew/bin/rsync}"
# Keine Pipe: grep -q + pipefail macht aus rsyncs SIGPIPE einen Fehlschlag.
case "$("$RSYNC" --version 2>/dev/null || true)" in
  *"version 3."*) ;;
  *)
    echo "Fehler: $RSYNC ist kein rsync 3.x (openrsync genügt nicht): brew install rsync" >&2
    exit 1
    ;;
esac

DEST="pages-deploy:yijing/"

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

[[ -d web && -d data && -f sw.js ]] \
    || { echo "Fehler: Repo-Root erwartet (web/, data/, sw.js fehlen)." >&2; exit 1; }

[[ "$(git rev-parse --abbrev-ref HEAD)" == "main" ]] \
    || { echo "Fehler: bitte aus dem main-Branch starten." >&2; exit 1; }

if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "Fehler: uncommitted changes in main — erst committen oder stashen." >&2
    exit 1
fi

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
SNAP="$STAGE/snap"
OUT="$STAGE/out"
mkdir -p "$SNAP" "$OUT"

echo "→ Snapshot von HEAD…"
git archive HEAD web data sw.js LICENSE LICENSE-DOCS | tar -x -C "$SNAP"

echo "→ Flaches Layout bauen (web/* → Root, + data/ + sw.js + Lizenzen)…"
cp -R "$SNAP"/web/. "$OUT"/
rm -f "$OUT"/LICENSE "$OUT"/LICENSE-DOCS
cp -R "$SNAP"/data "$OUT"/data
cp "$SNAP"/sw.js "$OUT"/sw.js
cp "$SNAP"/LICENSE "$OUT"/LICENSE
cp "$SNAP"/LICENSE-DOCS "$OUT"/LICENSE-DOCS

echo "→ Pfade in app.js auf flaches Layout patchen…"
# Sowohl Code-Pfade als auch JSDoc-Erwähnungen — im Deploy liegt app.js
# direkt im Root, also stimmt überall der eine-Ebene-höher-Verweis nicht.
sed -i.bak \
    -e 's|\.\./data/|data/|g' \
    -e 's|\.\./sw\.js|sw.js|g' \
    "$OUT"/app.js
rm -f "$OUT"/app.js.bak

# Plausibilitäts-Check: keine ../ -Pfade mehr in app.js
if grep -q '\.\./' "$OUT"/app.js; then
    echo "Warnung: app.js enthält noch '../'-Pfade nach dem Patchen:" >&2
    grep -n '\.\./' "$OUT"/app.js >&2
    echo "Prüfe sed-Patterns und korrigiere manuell." >&2
    exit 1
fi

echo "→ rsync nach ${DEST} …"
"$RSYNC" -az --delete --chmod=D755,F644 \
    --exclude='.DS_Store' --exclude='Thumbs.db' --exclude='*.swp' \
    "$OUT"/ "$DEST"

echo "✓ Deployed. Live: https://pages.jkaindl.de/yijing/"

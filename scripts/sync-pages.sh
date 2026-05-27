#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Johannes Kaindl
#
# Synchronisiert main → pages-Branch (Codeberg Pages, flaches Layout).
#
# pages erwartet web/*-Inhalt direkt im Root, daneben data/ und sw.js.
# Pfad-Anpassungen in app.js (../data → data, ../sw.js → sw.js) werden
# automatisch eingespielt. Wenn nichts neu ist: no-op.
#
# Nutzung (aus dem Repo-Root):  ./scripts/sync-pages.sh
set -euo pipefail

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

WT="$(mktemp -d)/yijing-pages"
TAG="$(git rev-parse --short HEAD)"
MSG_HEAD="$(git log -1 --pretty=%s)"

cleanup() { git worktree remove --force "$WT" 2>/dev/null || true; }
trap cleanup EXIT

echo "→ Worktree für pages anlegen…"
git worktree add "$WT" pages >/dev/null

echo "→ web/ → pages-Root spiegeln…"
rsync -a --delete \
    --exclude='.git' \
    --exclude='.DS_Store' \
    --exclude='Thumbs.db' \
    --exclude='*.swp' \
    --exclude='LICENSE' \
    --exclude='LICENSE-DOCS' \
    web/ "$WT"/

echo "→ data/ + sw.js + Lizenzen kopieren…"
rsync -a --exclude='.DS_Store' data/ "$WT"/data/
cp sw.js "$WT"/sw.js
cp LICENSE "$WT"/LICENSE
cp LICENSE-DOCS "$WT"/LICENSE-DOCS

echo "→ Pfade in app.js auf flaches Layout patchen…"
# Sowohl Code-Pfade als auch JSDoc-Erwähnungen — in pages liegt app.js
# direkt im Root, also stimmt überall der eine-Ebene-höher-Verweis nicht.
sed -i.bak \
    -e 's|\.\./data/|data/|g' \
    -e 's|\.\./sw\.js|sw.js|g' \
    "$WT"/app.js
rm -f "$WT"/app.js.bak

# Plausibilitäts-Check: keine ../ -Pfade mehr in app.js
if grep -q '\.\./' "$WT"/app.js; then
    echo "Warnung: app.js enthält noch '../'-Pfade nach dem Patchen:" >&2
    grep -n '\.\./' "$WT"/app.js >&2
    echo "Prüfe sed-Patterns und korrigiere manuell." >&2
    exit 1
fi

(
    cd "$WT"
    if git diff --quiet && git diff --cached --quiet; then
        echo "✓ pages ist bereits aktuell (nichts zu syncen)."
        exit 0
    fi

    echo "→ Commit + Push…"
    git add -A
    git commit -m "Pages: Sync mit main (${TAG})

main: ${MSG_HEAD}"

    # Codeberg-SSH wackelt manchmal — bis zu 3 Versuche.
    for attempt in 1 2 3; do
        if git push origin pages; then
            echo "✓ pages-Sync abgeschlossen."
            exit 0
        fi
        echo "  Push-Fehler (Versuch ${attempt}/3) — retry in 3s…" >&2
        sleep 3
    done
    echo "Fehler: pages-Push nach 3 Versuchen aufgegeben." >&2
    exit 1
)

<!--
SPDX-FileCopyrightText: 2026 Johannes Kaindl
SPDX-License-Identifier: CC-BY-SA-4.0
-->

# Beitragen

Schön, dass du mitmachen möchtest. Yijing-Orakel ist ein Hobbyprojekt mit
klaren Architekturentscheidungen — die wichtigsten stehen in
[`AGENTS.md`](AGENTS.md) und [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
Bitte vor größeren Änderungen lesen.

## Was gut ankommt

- **Bugfixes** mit kleinem, klar abgegrenztem Diff
- **Daten-Verbesserungen** (saubere Wilhelm-Quellen, bessere Pīnyīn-
  Transliterationen, Trigramm-Stammdaten)
- **Übersetzungen der UI** (aktuell nur Deutsch)
- **Sauberere Print-Styles** für PDF-Export
- **Mehr LLM-Backend-Adapter** (vLLM, llama.cpp HTTP-Server, etc.)
- **A11y-Verbesserungen** (ARIA-Labels, Keyboard-Navigation, Screenreader)
- **Doku-Patches** — Tippfehler, präzisere Erklärungen, neue Diagramme

## Was nicht gut passt

- **Frameworks** (React/Vue/Svelte/…) — wir bleiben bewusst Vanilla
- **Build-Steps** (Webpack/Vite/…) — kein npm im Repo
- **TypeScript** — JSDoc reicht
- **Backend-Services** — die App ist Static-Site
- **Cloud-LLM-Anbindungen ohne klaren Opt-in** — Default sind lokale Modelle

## Branches

Das Repo hat zwei Branches:

- **`main`** — die Entwicklung. PRs gehen immer hier rein.
- **`pages`** — das Deployment für [Codeberg Pages](https://jkaindl.codeberg.page/Yijing/).
  Hat ein flaches Layout (Inhalt von `web/` direkt im Root) und wird vom
  Maintainer manuell aus `main` nachgezogen. **Als Contributor musst du
  `pages` nicht selbst anfassen** — fokussiere dich auf `main`.

Details zur Sync-Konvention stehen in [`AGENTS.md`](AGENTS.md).

## Issue oder PR?

- **Issue zuerst** bei größeren Änderungen, neuen Features, Architektur-
  fragen — verwende die Vorlagen unter
  [Neue Issue → Vorlage wählen](https://codeberg.org/jkaindl/Yijing/issues/new/choose).
- **Direkt PR** bei Tippfehlern, kleinen Daten-Korrekturen, offensichtlichen
  Bugfixes.
- **Sicherheitsthemen** → niemals öffentliches Issue, sondern siehe
  [`SECURITY.md`](SECURITY.md).

## Lokales Setup

```bash
git clone https://codeberg.org/jkaindl/Yijing.git yijing
cd yijing
./serve.sh                   # öffnet http://localhost:8765/web/index.html
```

Voraussetzung: Python 3.9+. Für die KI-Deutung zusätzlich Ollama oder
ein OpenAI-kompatibler lokaler Server (siehe [`docs/LLM.md`](docs/LLM.md)).
Zum Bauen der macOS-App: Xcode Command Line Tools (siehe
[`docs/MACOS-APP.md`](docs/MACOS-APP.md)).

## PR-Checkliste

- [ ] `node --check web/*.js` ist sauber
- [ ] Im Browser getestet (hard-reload, Wurf, ggf. KI-Interpretation)
- [ ] CSS-Änderungen in Desktop + Mobile + Print-Vorschau und in
      beiden Themes (Dark/Light) geprüft
- [ ] Bei Daten-Änderungen: `python3 scripts/build_data.py` läuft ohne
      Fehler, Zähler im Output stimmig (64/64 Hexagramme, 64/64
      Schriftzeichen)
- [ ] Bei macOS-App-Änderungen: `./scripts/build-macos-app.sh` baut
      durch, App startet, zeigt Inhalt, beendet sauber
- [ ] `CHANGELOG.md` ergänzt (Sektion `[Unreleased]`)
- [ ] Bei Änderungen an `web/`, `sw.js` oder `data/`: im PR-Kommentar
      kurz vermerken, damit der `pages`-Sync nach Merge nicht
      vergessen wird (macht der Maintainer)
- [ ] Commit-Messages aussagekräftig (warum, nicht was)

## Commit-Stil

- Erste Zeile: Imperativ, ~70 Zeichen
- Leerzeile
- Body: warum, Kontext, ggf. Caveats
- Co-Autoren-Trailer erlaubt (z.B. für KI-Assistenz)

Beispiel:

```
Fix CORS-Setup-Hinweis für Ollama auf macOS

OLLAMA_ORIGINS muss vor `ollama serve` exportiert sein — die README hatte
das in der falschen Reihenfolge dokumentiert.
```

## Lizenz von Beiträgen

Mit dem Öffnen eines PRs erklärst du dich einverstanden, dass dein
Beitrag unter denselben Lizenzen veröffentlicht wird wie das
Gesamtprojekt:

- **Code-Änderungen** unter [AGPL-3.0-or-later](LICENSE)
- **Doku-Änderungen** unter [CC BY-SA 4.0](LICENSE-DOCS)

Neue Code-Dateien bitte mit SPDX-Header anlegen:

```js
// SPDX-FileCopyrightText: 2026 <Dein Name>
// SPDX-License-Identifier: AGPL-3.0-or-later
```

## Code of Conduct

Sei nett, sei präzise, sei verbindlich. Bei Konflikten: erst das Problem
verstehen, dann reagieren. Wir sind hier in einem Hobby-Kontext — ein
guter Ton ist wichtiger als jedes Feature.

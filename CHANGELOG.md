# Changelog

Format orientiert an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/).
Versionierung nach [SemVer](https://semver.org/lang/de/).

## [Unreleased]

### Hinzugefügt

- [`SECURITY.md`](SECURITY.md): Sicherheits-Meldewege, Threat-Model,
  Scope, was rein gehört und was nicht.
- [`.gitea/issue_template/`](.gitea/issue_template/): YAML-Vorlagen für
  Bug-Report und Feature-Vorschlag plus `config.yaml` mit Kontaktlinks
  auf SECURITY und README. Greift automatisch beim Anlegen neuer Issues
  über Codeberg.
- [`scripts/test-kingwen.mjs`](scripts/test-kingwen.mjs): Sanity-Test
  für die King-Wen-Lookup-Tabellen — prüft `BINARY_TO_KING_WEN` (JS),
  `KING_WEN_BINARY` (Python) und `data/hexagrams.json` auf Konsistenz
  und gegenseitige Inversion. Reines Node, keine Test-Framework-
  Dependency. Aufruf: `node scripts/test-kingwen.mjs`.
- [`scripts/sync-pages.sh`](scripts/sync-pages.sh): Automatisierter
  Sync von `main` nach `pages` (Worktree-Anlage, web→Root-Spiegelung,
  Pfad-Patches `../data/` → `data/` und `../sw.js` → `sw.js`,
  Commit + Push mit SSH-Retry). Ersetzt die manuelle Worktree-Sed-
  Choreografie.
- [`.editorconfig`](.editorconfig): IDE-konsistente Indentation,
  UTF-8, LF, Trim-Trailing-Whitespace (Markdown ausgenommen).
- `web/index.html`: Open-Graph + Twitter-Card Meta-Tags für Social-
  Preview. `og:image` ist absichtlich noch nicht gesetzt — sobald ein
  Hero-Bild existiert dort als absolute URL ergänzen.

### Geändert

- README komplett überarbeitet — erweiterte Badge-Reihe (Platform,
  PWA, Build), Inhaltsverzeichnis, Mermaid-Wurf-Ablauf, Release-
  Historie-Tabelle mit Tag-Links, eigene „Sicherheit melden"- und
  „Warum keine Build-Pipeline?"-Sektionen, Repo-Footer.
- `CONTRIBUTING.md` erweitert um lokales Setup, Issue-Template-Hinweis,
  Lizenz-Klausel für Beiträge, Verweis auf `SECURITY.md`, erweiterte
  PR-Checkliste (macOS-App-Build, Pages-Sync-Vermerk).
- Codeberg-Repo-Metadaten via API: Description präzisiert, Website auf
  Pages-URL, Topics (20 Stück: yijing, iching, i-ging, oracle,
  divination, hexagram, wilhelm, static-site, pwa, offline-first,
  vanilla-js, zero-dependency, ollama, mlx, local-llm, macos-app,
  swift, service-worker, german, agpl).

## [1.1.1] — 2026-05-25

### Behoben

- `web/llm.js`: Stream-Reader wird jetzt in einem `finally`-Block
  freigegeben. Beim schnellen „Abbrechen"-und-sofort-Wiederstarten der
  Interpretation konnte sonst `ReadableStream is locked` auftreten
  (Ollama- und OpenAI-kompatibler Pfad).
- `scripts/macos-app/StaticServer.swift`: wartet beim Start explizit
  auf den `NWListener`-State `.ready`. Vorher konnte der WebView in
  seltenen Fällen gegen einen noch nicht aufgeschlagenen Port laden.
- `scripts/build_data.py`: deterministische Auswahl unter gleich langen
  Bild-Assoziations-Prompts (vorher abhängig von der Set-Iteration).

### Geändert

- Diverse Härtungen ohne sichtbare Verhaltensänderung: vollständiges
  HTML-Escape an allen `innerHTML`-Stellen in `app.js`, Quota-Schutz
  für `localStorage`-Schreibvorgänge, Focus-Management im `<dialog>`-
  Fallback-Pfad, WKWebView-Scheme-Allowlist, klarerer Pfad-Traversal-
  Guard im Swift-Server, atomarer Schreibvorgang und bessere Fehler-
  meldungen in `build_data.py`.
- `scripts/serve.py` bindet jetzt explizit auf `127.0.0.1` statt auf
  allen Interfaces, und nutzt `directory=` statt `os.chdir()`.
- SPDX-Header (AGPL-3.0-or-later) auf `web/app.js` und `web/llm.js`
  ergänzt; `LICENSE-DOCS`-Geltungsbereich explizit um `CHANGELOG.md`,
  `CONTRIBUTING.md` und `AGENTS.md` erweitert.

## [1.1] — 2026-05-24

### Geändert

- macOS-App: Python-Backend (`serve.py`) durch einen Swift-internen
  Static-Server (Network.framework / `NWListener`) ersetzt. Die App
  braucht jetzt **kein System-Python und keine Command-Line-Tools**
  mehr — Nutzer:innen ohne Python können sie installieren und starten,
  ohne Apples 700 MB–3 GB CLT-Download zu triggern. Bundle-Layout
  vereinfacht: `Resources/web/`, `Resources/data/`, `Resources/sw.js`
  direkt statt Subordner `Resources/yijing/…`. DMG kleiner geworden
  (3,0 MB statt 3,7 MB).
- Web-UI: macOS-App-Hinweis aus dem prominenten Header-Block in eine
  dezente Footer-Zeile verlegt; die ausführliche Gatekeeper-Anleitung
  steht weiter in der README und `INSTALL.txt` im DMG.
- README: shields.io-Badges (`for-the-badge`) für Download und
  Live-Demo statt einfachem Markdown-Link.

## [1.0] — 2026-05-22

### Hinzugefügt

- Initialer Static-Site-Build mit Drei-Münzen-Methode
- Wilhelm-Übersetzung aller 64 Hexagramme inkl. Urteil, Bild, Bedeutung,
  wandelnden Linien (übernommen aus `_archiv/Yijing_6`)
- Chinesische Schriftzeichen + Pīnyīn pro Hexagramm
  (aus `_archiv/yijing_5`)
- Trigramme als Stammdaten mit Familie, Natur, Jahreszeit, Himmelsrichtung
  (aus `_archiv/yijing_5`)
- Bild-Assoziationen für 19 Hexagramme (aus `_archiv/yijing_3`)
- LLM-Adapter für Ollama (native API) und OpenAI-kompatibel (MLX, LM
  Studio, vLLM, OpenClaw)
- Streaming-Antwort mit getrennter Reasoning-/Thinking-Anzeige
- Auto-Discovery typischer lokaler LLM-Endpunkte beim ersten Start
- Reasoning-Toggle (an/aus/auto) pro Endpunkt + Override pro Wurf
- „Reasoning testen"-Knopf im Settings-Modal
- Markdown-Rendering der LLM-Antwort (eigener kleiner Parser)
- Verlauf in localStorage, einzelne Würfe via URL-Hash verlinkbar
- Markdown-Export der Reading
- Druckfreundliches PDF-Layout via `@media print`
- Dev-Server mit `Cache-Control: no-store`
- Dokumentation: `docs/ARCHITECTURE.md`, `docs/DATA.md`, `docs/LLM.md`,
  `docs/DEVELOPMENT.md`, `AGENTS.md`, `CONTRIBUTING.md`,
  `LICENSE` (AGPL-3.0-or-later), `LICENSE-DOCS` (CC BY-SA 4.0)
- PWA-Unterstützung: Web-App-Manifest, Icon-Set (favicon, Apple-Touch-
  Icon, maskable Icons), Theme-Color — die Seite ist installierbar und
  bekommt ein Homescreen-/Dock-Icon
- Offline-Betrieb über Service Worker (network-first) — die App lädt
  und läuft nach dem ersten Besuch ohne Internet
- Theme-Umschalter (Dark / Light / System) im Header, Auswahl bleibt
  in localStorage erhalten
- macOS-App (`scripts/build-macos-app.sh`): bündelt das Orakel als
  doppelklickbare `Yijing.app` — native Swift-App mit eigenem Fenster
  (WKWebView), öffnet sich eigenständig statt als Browser-Tab

### Bekannte Fragen

- Auto-Discovery probiert nur drei feste URLs. Eigene lokale Endpunkte
  (z.B. abweichende Ports) müssen manuell angelegt werden.
- Bild-Assoziationen sind nur für 19/64 Hexagramme vorhanden.
- Verlauf-Einträge vor Version mit UUID lassen sich nicht via Link
  abrufen (alte Einträge im Verlauf ohne `id`).

# Changelog

Format orientiert an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/).
Versionierung nach [SemVer](https://semver.org/lang/de/).

## [Unreleased]

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

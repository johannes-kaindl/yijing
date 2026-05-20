# Changelog

Format orientiert an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/).
Versionierung nach [SemVer](https://semver.org/lang/de/).

## [Unreleased]

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
  `docs/DEVELOPMENT.md`, `AGENTS.md`, `CONTRIBUTING.md`, `LICENSE` (AGPL-3.0)

### Bekannte Fragen

- Auto-Discovery probiert nur drei feste URLs. Eigene lokale Endpunkte
  (z.B. abweichende Ports) müssen manuell angelegt werden.
- Bild-Assoziationen sind nur für 19/64 Hexagramme vorhanden.
- Verlauf-Einträge vor Version mit UUID lassen sich nicht via Link
  abrufen (alte Einträge im Verlauf ohne `id`).

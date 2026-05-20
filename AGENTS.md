# AGENTS.md

Konventionen für KI-Agents (Claude Code, Codex, Cursor, …), die an diesem
Repository arbeiten. Menschen profitieren auch — aber primär gerichtet an
automatisierte Sessions.

## Charakter des Projekts

Yijing-Orakel ist ein **Hobbyprojekt** mit bewusst flacher Architektur.
Wir sind hier auf dem siebten Anlauf nach sechs verworfenen Vorgängern
(siehe `_archiv/yijing_1` bis `Yijing_6`). Alle früheren Anläufe sind in
strukturellem Over-Engineering versandet (Notebook-Workflows, Pydantic-
Schichten, FastAPI-Wrapper). Dieser Anlauf ist absichtlich anders.

> **Wichtig:** Bevor du eine Architekturentscheidung treffst, prüfe ob
> einer der archivierten Anläufe dasselbe schon versucht hat. Wir bauen
> hier nicht nochmal den gleichen Turm.

## Architektur-Prinzipien

| Prinzip | Konsequenz |
|---|---|
| **Static Site** | Kein Application-Server, kein Backend. Reine HTML/CSS/JS, ausgeliefert per `python3 -m http.server`. |
| **Zero Dependencies** | Kein npm, kein Webpack, kein TypeScript-Build. Vanilla ES-Module mit nativem `<script type="module">`. |
| **Daten als Quelle** | Hexagramm-Texte und Trigramm-Stammdaten leben als statisches JSON in `data/`. Build-Skript (`scripts/build_data.py`) liest aus `_archiv/` und produziert die JSONs. |
| **Lokale LLMs only** | Default-Endpunkte sind Ollama (11434) und MLX/LM-Studio (8080/v1, 1234/v1). Keine Cloud-API-Keys im Code. |
| **Persistenz im Browser** | Verlauf, Endpunkte, System-Prompt in `localStorage`. Keine Datenbank, keine Server-Side-State. |

## Was du NICHT tun sollst

- **Kein Framework einführen** (React/Vue/Svelte). Vanilla bleibt vanilla.
- **Keinen Build-Step einführen** (Webpack/Vite/esbuild). Wenn ES-Module
  nicht reichen, ist das ein Hinweis zum Vereinfachen, nicht zum Aufrüsten.
- **Kein TypeScript**. JSDoc reicht für Typ-Hints.
- **Kein Backend** für LLM-Routing. Browser ruft die lokalen Server direkt.
- **`_archiv/`** wird **nur gelesen**, nie zurückgeschrieben. Auch nicht
  „aufgeräumt". Ist absichtlich roh.
- **Keine neuen Test-Frameworks** für triviale Funktionen. Wenn Tests
  nötig werden, `node --check` und gezielte ad-hoc-Smoke-Tests bevorzugen.
- **`_archiv/yijing_1/.env`** enthält einen Klartext-Google-API-Key. Niemals
  ins git übernehmen, niemals den `_archiv/`-`.gitignore`-Eintrag entfernen.

## Code-Stilrichtlinien

- **Sprache der UI: Deutsch.** Code-Identifier: Englisch. Kommentare: Englisch
  oder Deutsch, beides okay — aber konsistent innerhalb einer Datei.
- **In deutschen String-Literalen niemals gerade `"…"` für innere
  Anführungszeichen.** Typografisch setzen: `„…"`. Sonst schließt
  JavaScript den String vorzeitig — siehe Commit `a164aba` ff.
- **Nach jedem JS-Edit:** `node --check <file>` laufen lassen.
- **Bei Edits an `app.js`:** Browser-Tab hard-reload (Cmd+Shift+R) testen.
  Der Dev-Server setzt zwar `Cache-Control: no-store`, manche Browser
  cachen ES-Modul-Imports trotzdem.
- **Kommentare** erklären *warum*, nicht *was*. Identifier-Namen erklären
  das Was.

## Daten neu bauen

```bash
python3 scripts/build_data.py
```

Quellen: `_archiv/Yijing_6/yijing/resources/hexagram_json/` (Wilhelm-Texte
für 64 Hexagramme, zwei Schema-Varianten — siehe Build-Skript),
`_archiv/yijing_5/data/processed/` (chinesische Bezeichnungen, Trigramm-
Stammdaten), `_archiv/yijing_3/` (Bild-Assoziationen aus Dateinamen, nur
19/64 vorhanden).

Output: `data/hexagrams.json` (~580 KB, alle 64 Hexagramme normalisiert),
`data/trigrams.json` (8 Trigramme mit Stammdaten).

Beide Files **gehören zum Commit** (sind keine Build-Artefakte im strengen
Sinn, sondern primäre Daten-Assets der App).

## CORS — wichtiger Setup-Hinweis

Der Browser ruft die LLM-Server direkt. Beide müssen CORS für die Origin
des Dev-Servers erlauben:

**Ollama:**
```bash
export OLLAMA_ORIGINS="*"   # oder spezifisch: "http://localhost:8765"
ollama serve
```

**MLX/LM Studio:** ist standardmäßig offen. Bei eigenem `mlx_lm.server`
keinen restriktiven `--allowed-origins`-Flag setzen.

## Reasoning-Modi

LLM-Adapter (`web/llm.js`) übersetzt `thinking: true|false|null` in:

| Backend | Parameter |
|---|---|
| Ollama `/api/chat` | `think: bool` + `options.num_predict` (32k an, 4k aus) |
| OpenAI-kompatibel `/v1/chat/completions` | `reasoning_effort: "low"|"none"` + `chat_template_kwargs.enable_thinking: bool` + `max_tokens` |

Reasoning-Output kommt je nach Server in unterschiedlichen Feldern an:
- Ollama-native: `message.thinking`
- Ollama-OpenAI: `choices[0].delta.reasoning_content`
- MLX (`mlx_lm.server`): `choices[0].delta.reasoning`
- DeepSeek-Stil: `reasoning_content`

`llm.js` parst alle drei, ruft `onThinking(text)` separat von `onToken(text)`
auf — UI zeigt Reasoning in einem eigenen, gedimmten `<details>`-Block.

## Verlauf, Tiefe Links

Würfe werden mit UUID gespeichert (`localStorage["yijing-history-v1"]`).
URL-Hash `#r=<uuid>` ruft einen Wurf wieder auf. Beim Reset wird der Hash
geräumt.

Beim Verändern des Schemas: `loadHistory()` muss alte Einträge tolerieren
oder eine Migration anbieten.

## Wenn du den Code splittest

`app.js` ist mit ~1000 Zeilen am oberen Ende dessen, was in eine Datei
gehört. Beim weiteren Wachstum erst splitten, wenn ein konkretes Feature
sich klar isolieren lässt — nicht prophylaktisch. Sinnvolle Schnitte
wären:

- `history.js` (loadHistory, saveHistory, renderHistory, applyHashIfAny)
- `settings.js` (renderEndpointList, openSettings, closeSettings)
- `export.js` (buildMarkdownExport, downloadFile, Print-Handler)

Aber: das geht nur, wenn jeder Schnitt eine klare öffentliche API hat.
Sonst lieber lassen.

## Tests / Verifikation

Es gibt keine Unit-Test-Suite. Akzeptiert. Wenn du etwas änderst:

1. `node --check web/<file>.js` für Syntax
2. Im Browser hard-reload, Wurf machen, „Interpretieren" mit beiden
   Endpunkten (Ollama + MLX) testen
3. Für Daten-Änderungen: `python3 scripts/build_data.py` muss durchlaufen
   ohne Fehler, Zähler im Output stimmig

Bei größeren Änderungen ergänze einen kurzen Hinweis im `CHANGELOG.md`.

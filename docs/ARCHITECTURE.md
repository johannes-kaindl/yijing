# Architektur

Eine Übersicht über Aufbau und Datenfluss des Yijing-Orakels.

## Übersicht

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                              │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐    │
│  │   app.js     │   │   llm.js     │   │ markdown.js  │    │
│  │  (UI, Cast,  │◀──│   (Ollama,   │   │  (Markdown→  │    │
│  │   Verlauf)   │   │   OpenAI)    │   │    HTML)     │    │
│  └──────┬───────┘   └──────┬───────┘   └──────────────┘    │
│         │                  │                                │
│         ▼                  ▼                                │
│  ┌──────────────┐   ┌──────────────┐                       │
│  │ localStorage │   │  fetch() →   │                       │
│  │  (Verlauf,   │   │  Streaming   │                       │
│  │  Endpoints)  │   └──────┬───────┘                       │
│  └──────────────┘          │                                │
└────────────────────────────┼────────────────────────────────┘
                             │                  ▲
                             ▼                  │
       ┌─────────────────────────┐    ┌────────────────────┐
       │  Ollama  :11434         │    │  MLX/LM Studio     │
       │  /api/chat (ND-JSON)    │    │  :8080/v1          │
       │  /api/tags              │    │  /chat/completions │
       │                         │    │  (SSE)             │
       └─────────────────────────┘    └────────────────────┘

                  ┌──────────────────────────────────┐
                  │   Static Server                  │
                  │   • Dev: python3 (scripts/       │
                  │     serve.py)                    │
                  │   • macOS-App: Swift NWListener  │
                  │     (StaticServer.swift)         │
                  │   serves: web/, data/, sw.js     │
                  │   Cache-Control: no-store        │
                  └──────────────────────────────────┘
```

## Module

### `web/app.js` (~1000 Zeilen)

Frontend-Hauptmodul. Enthält:

- **Cast-Mechanik:** `tossLine()` (Drei-Münzen-Wurf), `castHypergram()`,
  `lineState()`, `hexagramFromLines()`, `kingWenFromBinary()`
- **King-Wen-Lookup:** `BINARY_TO_KING_WEN` (bottom-to-top Binärstring →
  King-Wen-Nummer 1–64)
- **Rendering:** `showReading()`, `renderHexCard()`, `renderHexFigure()`,
  `renderChangingLines()`, `renderTrigramDetails()`
- **Verlauf:** `loadHistory()`, `saveHistory()`, `renderHistory()`,
  `applyHashIfAny()` (URL-Hash-Routing)
- **Settings:** `renderEndpointList()`, `openSettings()`, `closeSettings()`
- **LLM-Interpretation:** `runInterpretation()` mit Streaming + Reasoning-
  Anzeige
- **Export:** `buildMarkdownExport()`, `downloadFile()`, Print-Handler
- **Theme:** `applyTheme()` / `initTheme()` — Dark/Light/System-Umschaltung
  über `data-theme`; außerdem die Service-Worker-Registrierung

### `web/llm.js`

LLM-Adapter mit zwei Backend-Klassen:

- `OllamaClient` — nutzt Ollamas native API. Streaming via ND-JSON
  (eine JSON-Zeile pro Token).
- `OpenAIClient` — OpenAI-kompatibles `/v1/chat/completions`-Schema.
  Streaming via Server-Sent Events (SSE).

Beide implementieren dieselbe `chatStream({ model, messages, thinking,
onToken, onThinking, signal })`-Schnittstelle. Thinking-/Reasoning-Tokens
werden separat an `onThinking()` geroutet, sodass das UI sie in einem
eigenen Block anzeigen kann.

Außerdem im Modul:

- `Endpoints` — Verwaltung der Endpoint-Liste in `localStorage`
- `SystemPrompt` — System-Prompt für die Interpretation (Default mit
  Wilhelm-Tradition)
- `testThinkingMode()` — sendet zwei Mini-Anfragen (on/off) und prüft,
  ob das Modell tatsächlich Reasoning-Tokens emittiert
- `buildUserPrompt()` — komponiert den Nutzer-Prompt aus Frage,
  Hexagramm-Daten und wandelnden Linien

### `web/markdown.js`

Minimaler streaming-tauglicher Markdown→HTML-Renderer. Unterstützt
ATX-Headings (`#…######`), `**bold**`, `*italic*`, ``inline code``, fenced
code blocks, Listen, Blockquotes, Absätze, horizontale Linien, einfache
Links.

Sicherheit: HTML wird zuerst escaped, dann markdown-formatiert. Links nur
mit `http(s):` und `mailto:` zugelassen.

### `web/style.css`

Farben sind durchgängig CSS-Variablen (`:root`). Dark ist der Default;
`:root[data-theme="light"]` überschreibt das Variablen-Set für den
Light-Modus. Drei Layout-Modi:

- **Bildschirm** (Default) — serifenbetonte Typografie, Dark oder Light
  je nach Theme-Auswahl
- **Mobile** (≤ 540 px) — Hexagramme stapeln vertikal
- **Print** (`@media print`) — heller Hintergrund, keine Rahmen, alle
  `<details>` aufgeklappt (JS-seitig zusätzlich erzwungen)

### `sw.js`

Service Worker im Repo-Root. Cacht same-origin-GET-Requests
network-first: online wird stets frisch geladen, der Cache dient als
Offline-Reserve — die App lädt und läuft nach dem ersten Besuch ohne
Internet. Liegt im Root, damit sein Scope `web/` und `data/` umfasst.

### `web/manifest.webmanifest` + `web/icons/`

Web-App-Manifest und Icon-Set — machen die Seite als PWA installierbar
(Homescreen-/Dock-Icon, Standalone-Anzeige, Theme-Color).

### `scripts/build_data.py`

Konsolidiert die Hexagramm-Daten aus drei `_archiv/`-Quellen in zwei
JSONs. Normalisiert zwei Schema-Varianten der Wilhelm-JSONs (Hexagramm 16
hat ein abweichendes Schema), mergt chinesische Schriftzeichen und Pīnyīn,
extrahiert Bild-Assoziationen aus Dateinamen.

Siehe [`docs/DATA.md`](DATA.md) für Detail.

### `scripts/serve.py`

Python-basierter Dev-HTTP-Server. Sendet `Cache-Control: no-store` —
verhindert das Caching alter JS-Modul-Versionen während der Entwicklung.
**Nur fürs Dev-Setup (`./serve.sh`); die macOS-App bringt einen eigenen
Swift-Server mit (siehe `scripts/macos-app/StaticServer.swift`).**

### `scripts/macos-app/StaticServer.swift`

Minimaler HTTP/1.1-Server in Swift (Network.framework / `NWListener`).
GET/HEAD only, MIME-Map, Pfad-Traversal-Schutz, `Cache-Control: no-store`
analog zu `serve.py`. Wird von der gebündelten `Yijing.app` benutzt, um
die Bundle-Resources (`web/`, `data/`, `sw.js`) lokal an die WKWebView
auszuliefern — keine Python-Abhängigkeit auf der Nutzerseite.

## Datenfluss eines Wurfs

```
  Klick "Münzen werfen"
         │
         ▼
  castHypergram()           → 6 Linien mit Werten 6/7/8/9
         │
         ▼
  tossAnimated()            → animiert die 6 Linien nacheinander ins DOM
         │
         ▼
  showReading()
    │
    ├── hexagramFromLines(lines, false) → "111010" (Binär, bottom-up)
    ├── hexagramFromLines(lines, true)  → "111000" (Zielbild)
    ├── kingWenFromBinary("111010")     → 5  (Hex Sü/Warten)
    ├── kingWenFromBinary("111000")     → 11 (Hex Tai/Friede)
    │
    ├── HEXAGRAMS[5]  → primaryHex
    ├── HEXAGRAMS[11] → resultingHex
    │
    ├── renderHexCard(primary)
    ├── renderHexCard(resulting)
    ├── renderChangingLines()
    ├── renderTrigramDetails()
    │
    ├── saveHistory({ id: uuid, ts, question, primary, resulting, lines })
    ├── window.location.hash = "#r=<uuid>"
    │
    └── CURRENT_READING = { primaryHex, resultingHex, changingIndices, question }
         │
         ▼
  User klickt "Interpretieren"
         │
         ▼
  runInterpretation()
    │
    ├── buildUserPrompt(CURRENT_READING)
    │
    ├── client = makeClient(endpoint)
    └── client.chatStream({ model, messages, thinking, onToken, onThinking })
         │
         ├── onThinking(text) → fügt zu Reasoning-<details> hinzu
         └── onToken(text) → renderMarkdown(buffer) → innerHTML
```

## Persistenz

Alle Daten leben im `localStorage` unter den Keys:

| Key | Inhalt |
|---|---|
| `yijing-history-v1` | Array der letzten 20 Würfe (mit UUID, Frage, Hexagrammen, Linien-Werten) |
| `yijing-endpoints-v1` | Array konfigurierter LLM-Endpunkte |
| `yijing-endpoint-selected-v1` | Aktuell gewählter Endpunkt (UUID) |
| `yijing-system-prompt-v1` | Anpasster System-Prompt (nur wenn vom Default abweichend) |
| `yijing-default-thinking` | Globaler Reasoning-Default (`"default" | "on" | "off"`) |
| `yijing-theme` | Theme-Auswahl (`"dark" | "light" | "system"`) |

Keine Migration vorhanden — Schemaänderungen brauchen eine neue Version
im Key-Namen (`v2`, `v3`, …) und Fallback-Logik.

## URL-Schema

Es gibt nur einen URL-Hash:

```
#r=<uuid>
```

Beim Laden: passender Eintrag aus `localStorage` wird wiederhergestellt
(`applyHashIfAny()`). Beim Wurf wird der Hash neu gesetzt
(`history.replaceState`, kein Scroll-Sprung). Beim Reset wird der Hash
entfernt.

`hashchange`-Event triggert `applyHashIfAny()` für Browser-Back-Button.

## Sicherheitsannahmen

- Die App ist **single-tenant, single-user** — kein Auth, keine Sessions,
  keine Cross-User-Daten.
- LLM-Server laufen **lokal** auf vertrauenswürdigen Ports — der Code
  vertraut den Server-Antworten.
- Markdown wird **escaped + sanitized** vor dem Rendern. Links nur mit
  erlaubtem Schema (`http(s):`, `mailto:`).
- API-Keys (für nicht-lokale OpenAI-kompatible Endpunkte) liegen im
  `localStorage` — also auf dem Gerät. Nicht synchronisiert.

# Architecture

An overview of the structure and data flow of the Yijing oracle.

## Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                              │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐    │
│  │   app.js     │   │   llm.js     │   │ markdown.js  │    │
│  │  (UI, Cast,  │◀──│   (Ollama,   │   │  (Markdown→  │    │
│  │   History)   │   │   OpenAI)    │   │    HTML)     │    │
│  └──────┬───────┘   └──────┬───────┘   └──────────────┘    │
│         │                  │                                │
│         ▼                  ▼                                │
│  ┌──────────────┐   ┌──────────────┐                       │
│  │ localStorage │   │  fetch() →   │                       │
│  │  (History,   │   │  Streaming   │                       │
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
                  │   • macOS app: Swift NWListener  │
                  │     (StaticServer.swift)         │
                  │   serves: web/, data/, sw.js     │
                  │   Cache-Control: no-store        │
                  └──────────────────────────────────┘
```

## Modules

### `web/app.js` (~2100 lines)

Main frontend module. Contains:

- **Cast mechanics:** `tossLine()` (three-coin cast), `castHypergram()`,
  `lineState()`, `hexagramFromLines()`, `kingWenFromBinary()`
- **King Wen lookup:** `BINARY_TO_KING_WEN` (bottom-to-top binary string →
  King Wen number 1–64)
- **Rendering:** `showReading()`, `renderHexCard()`, `renderHexFigure()`,
  `renderChangingLines()`, `renderTrigramDetails()`
- **History:** `loadHistory()`, `saveHistory()`, `renderHistory()`,
  `applyHashIfAny()` (URL hash routing)
- **Settings:** `renderEndpointList()`, `openSettings()`, `closeSettings()`
- **LLM interpretation:** `runInterpretation()` with streaming + reasoning
  display
- **Export:** `buildMarkdownExport()`, `downloadFile()`, print handler
- **Theme:** `applyTheme()` / `initTheme()` — dark/light/system switching
  via `data-theme`; also the service-worker registration

### `web/llm.js`

LLM adapter with two backend classes:

- `OllamaClient` — uses Ollama's native API. Streaming via ND-JSON
  (one JSON line per token).
- `OpenAIClient` — OpenAI-compatible `/v1/chat/completions` schema.
  Streaming via Server-Sent Events (SSE).

Both implement the same `chatStream({ model, messages, thinking,
onToken, onThinking, signal })` interface. Thinking/reasoning tokens
are routed separately to `onThinking()`, so the UI can show them in a
dedicated block.

Also in the module:

- `Endpoints` — manages the endpoint list in `localStorage`
- `SystemPrompt` — system prompt for the interpretation (default rooted in
  the Wilhelm tradition)
- `testThinkingMode()` — sends two mini-requests (on/off) and checks
  whether the model actually emits reasoning tokens
- `buildUserPrompt()` — composes the user prompt from the question,
  hexagram data, and changing lines

### `web/markdown.js`

Minimal streaming-capable Markdown→HTML renderer. Supports
ATX headings (`#…######`), `**bold**`, `*italic*`, ``inline code``, fenced
code blocks, lists, blockquotes, paragraphs, horizontal rules, simple
links.

Security: HTML is escaped first, then Markdown-formatted. Links allowed
only with `http(s):` and `mailto:`.

### `web/style.css`

Colors are CSS variables throughout (`:root`). Dark is the default;
`:root[data-theme="light"]` overrides the variable set for the
light mode. Three layout modes:

- **Screen** (default) — serif-forward typography, dark or light
  depending on the theme selection
- **Mobile** (≤ 540 px) — hexagrams stack vertically
- **Print** (`@media print`) — light background, no borders, all
  `<details>` expanded (additionally enforced on the JS side)

### `sw.js`

Service worker at the repo root. Caches same-origin GET requests
network-first: online it always loads fresh, the cache serving as an
offline fallback — the app loads and runs without internet after the
first visit. It lives at the root so that its scope covers `web/` and
`data/`.

### `web/manifest.webmanifest` + `web/icons/`

Web app manifest and icon set — make the site installable as a PWA
(home-screen/dock icon, standalone display, theme color).

### `scripts/build_data.py`

Consolidates the hexagram data from three `_archiv/` sources into two
JSONs. Normalizes two schema variants of the Wilhelm JSONs (hexagram 16
has a deviating schema), merges Chinese characters and Pīnyīn,
extracts image associations from filenames.

See [`docs/DATA.md`](DATA.md) for detail.

### `scripts/serve.py`

Python-based dev HTTP server. Sends `Cache-Control: no-store` —
prevents caching of stale JS module versions during development.
**For the dev setup only (`./serve.sh`); the macOS app ships its own
Swift server (see `scripts/macos-app/StaticServer.swift`).**

### `scripts/macos-app/StaticServer.swift`

Minimal HTTP/1.1 server in Swift (Network.framework / `NWListener`).
GET/HEAD only, MIME map, path-traversal protection, `Cache-Control: no-store`
analogous to `serve.py`. Used by the bundled `Yijing.app` to
serve the bundle resources (`web/`, `data/`, `sw.js`) locally to the
WKWebView — no Python dependency on the user side.

### `scripts/ios-app/OracleKit/` (Swift package)

The shared logic core of the native iOS/iPadOS/Catalyst/watchOS family
(under `scripts/ios-app/`, XcodeGen project `project.yml`). A single local
Swift package consumed by all four native targets — the App, the
WidgetKit extension (`YijingWidgets`), the watchOS app (`YijingWatch`), and
the watch complication (`YijingWatchWidgets`). Platforms: iOS 17 /
macCatalyst 17 / watchOS 10 / macOS 14.

| File | Role |
|---|---|
| `Casting.swift` | Three-coin cast + the 64-entry King-Wen binary→number table |
| `Daily.swift` | Deterministic daily hexagram (stable hash of the local `yyyy-MM-dd`, `%64+1`), identical across app/widget/watch by construction, midnight reload |
| `Models.swift` | `Codable` types mirroring the JSON schema |
| `DataStore.swift` | JSON loader |
| `Settings.swift` | App-Group settings (`OracleSettings`) |
| `Texts.swift` | Language/register text accessors incl. Judgment "Kernsatz"/lead trimming via `judgmentLead` |
| `SlimData.swift` | Widget slice loader (`data/widget-hexagrams.json`) |

`Casting.swift` is the **second canonical King-Wen copy in Swift**; together
with `web/app.js` (`BINARY_TO_KING_WEN`) and `scripts/build_data.py`
(`KING_WEN_BINARY`) there are now **three King-Wen tables that must stay in
sync**. `Tests/OracleKitTests/` (`swift test`) is the gate proving the Swift
port is bit-identical — King-Wen completeness, line-state/target logic,
binary round-trip, cast value range, daily-hexagram determinism + cross-day
variance. `Texts.judgmentLead` mirrors the `lead()`/Kernsatz trimming in
`scripts/build_widget_slice.py` and the two must stay in sync.

See [`docs/DEVELOPMENT.md`](DEVELOPMENT.md) for the native build modes.

## Data Flow of a Reading

```
  Click "Cast Coins"
         │
         ▼
  castHypergram()           → 6 lines with values 6/7/8/9
         │
         ▼
  tossAnimated()            → animates the 6 lines one after another into the DOM
         │
         ▼
  showReading()
    │
    ├── hexagramFromLines(lines, false) → "111010" (binary, bottom-up)
    ├── hexagramFromLines(lines, true)  → "111000" (resulting hexagram)
    ├── kingWenFromBinary("111010")     → 5  (Hex Hsü/Waiting)
    ├── kingWenFromBinary("111000")     → 11 (Hex Tai/Peace)
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
  User clicks "Interpret"
         │
         ▼
  runInterpretation()
    │
    ├── buildUserPrompt(CURRENT_READING)
    │
    ├── client = makeClient(endpoint)
    └── client.chatStream({ model, messages, thinking, onToken, onThinking })
         │
         ├── onThinking(text) → appends to reasoning <details>
         └── onToken(text) → renderMarkdown(buffer) → innerHTML
```

## Persistence

All data lives in `localStorage` under the keys:

| Key | Content |
|---|---|
| `yijing-history-v1` | Array of the last 20 readings (with UUID, question, hexagrams, line values) |
| `yijing-endpoints-v1` | Array of configured LLM endpoints |
| `yijing-endpoint-selected-v1` | Currently selected endpoint (UUID) |
| `yijing-system-prompt-v1` | Customized system prompt (only when it differs from the default) |
| `yijing-default-thinking` | Global reasoning default (`"default" | "on" | "off"`) |
| `yijing-theme` | Theme selection (`"dark" | "light" | "system"`) |

No migration in place — schema changes need a new version in the key
name (`v2`, `v3`, …) and fallback logic.

## URL Scheme

Two URL hashes, both routed by `applyHashIfAny()`:

```
#r=<uuid>   → restore a saved reading from localStorage
#h=<n>      → open the Nachschlagewerk/reader on hexagram n (1–64)
```

On load the matching `#r=` entry from `localStorage` is restored. On a
reading the hash is set anew (`history.replaceState`, no scroll jump). On
reset the hash is removed. `#h=<n>` jumps the reader to a single hexagram,
independent of any saved reading.

The `hashchange` event triggers `applyHashIfAny()` for the browser back button.

### Native deep link

The native app registers a custom URL scheme (`CFBundleURLTypes` in
`Resources/Info.plist`):

```
yijing://h/<n>
```

`AppDelegate.application(open:)` → `WebViewController.openHexagram(n)` sets
the WebView's `location.hash = "#h=<n>"`, i.e. it maps onto the web-only
`#h=` target above. Cold-launch safe via a deferred `pendingHexagram` until
the page's `didFinish`. Distinct from the `#r=<uuid>` history links, which
stay web-only.

## Native Bridge

When the web app runs inside a native WKWebView, `app.js` posts messages to
`window.webkit.messageHandlers.yijing` (a no-op in a plain browser, where
`window.webkit` is absent). The native side handles three actions:

| Action | Message | Effect |
|---|---|---|
| `saveMarkdown` | `{action,filename,content}` | macOS AppKit app: save the Markdown export to a file |
| `savePdf` | `{action,mode,filename}` | macOS AppKit app: render and save a PDF export |
| `settings` | `{action,language,register}` | iOS family: persist the app's language/register for widgets/watch |

The `settings` message is posted by `publishSettings()` on `i18n:changed`,
on register change, and at load. In the iOS family `WebViewController` writes
both fields into the **App-Group** `UserDefaults`
(`group.page.codeberg.jkaindl.Yijing`) and calls
`WidgetCenter.reloadAllTimelines()`. OracleKit's `OracleSettings.current()`
reads them back, with a device-locale + neutral fallback, so the widget,
watch app, and complication follow the app's language/register. `app.js` must
keep posting this for the widgets/watch to stay in sync.

## Security Assumptions

- The app is **single-tenant, single-user** — no auth, no sessions,
  no cross-user data.
- LLM servers run **locally** on trusted ports — the code
  trusts the server responses.
- The dev server (`scripts/serve.py`) and the Swift static server of the
  macOS app explicitly bind to `127.0.0.1` / loopback.
- Markdown is **escaped + sanitized** before rendering. Links only with
  an allowed scheme (`http(s):`, `mailto:`).
- The WKWebView in the macOS app has a scheme allowlist (`http`,
  `https`, `about`) — external links open in the default browser, not
  in the app window.
- API keys (for non-local OpenAI-compatible endpoints) live in
  `localStorage` — i.e. on the device. Not synced.

Please do not report security-relevant issues publicly — see
[`../SECURITY.md`](../SECURITY.md).

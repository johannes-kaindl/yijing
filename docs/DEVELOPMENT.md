# Development Setup

## Prerequisites

- Python 3.9+ (for the dev server)
- Optional: Node.js (only for `node --check` as a syntax linter)
- Optional: Ollama or MLX for the AI interpretation
- Optional: Xcode Command Line Tools — only for building the macOS app
  (`scripts/build-macos-app.sh`), see [`MACOS-APP.md`](MACOS-APP.md)
- Optional: full Xcode + iOS SDK and `brew install xcodegen` — only for
  building the iOS/iPadOS/Catalyst/watchOS family
  (`scripts/ios-app/build-ios-app.sh`)

No npm dependencies, no build tools.

## Starting

```bash
./serve.sh
```

opens `http://localhost:8765/web/index.html` automatically. The server
sends `Cache-Control: no-store` — browsers reload modules fresh on every
reload.

Alternatively without auto-open:

```bash
python3 scripts/serve.py
# or simpler:
python3 -m http.server 8765
```

`python3 -m http.server` sets **no no-cache headers** — browsers then
cache JS modules aggressively. When developing, prefer `scripts/serve.py`.

## Directory Structure

```
yijing/
├── AGENTS.md              # Conventions for AI sessions
├── CHANGELOG.md           # Version history
├── CONTRIBUTING.md        # Contribution notes
├── LICENSE                # AGPL-3.0-or-later (code)
├── LICENSE-DOCS           # CC BY-SA 4.0 (docs)
├── README.md              # Getting started
├── sw.js                  # Service worker (offline caching)
├── docs/                  # This documentation
│   ├── ARCHITECTURE.md
│   ├── DATA.md
│   ├── DEVELOPMENT.md
│   ├── LLM.md
│   ├── MACOS-APP.md
│   ├── screenshots/       # Store/README screenshots
│   └── superpowers/       # Skill/workflow notes
├── data/
│   ├── hexagrams.json     # 64 hexagrams normalized (DE)
│   ├── hexagrams.en.json  # 64 hexagrams normalized (EN)
│   ├── trigrams.json      # 8 trigrams as master data
│   └── widget-hexagrams.json # slim slice for widget/complication
├── scripts/
│   ├── build_data.py      # Consolidate data from _archiv/
│   ├── build-macos-app.sh # builds the macOS app into dist/
│   ├── macos-app/         # Building blocks for the app build
│   ├── ios-app/           # Native iOS/iPadOS/Catalyst/watchOS family
│   │   ├── project.yml    # XcodeGen project (no committed .xcodeproj)
│   │   ├── build-ios-app.sh # builds simulator/catalyst/watch/archive/device
│   │   ├── OracleKit/     # Shared Swift logic core + XCTest
│   │   ├── Widgets/       # WidgetKit app-extension
│   │   ├── Watch/         # watchOS app
│   │   └── WatchWidgets/  # watchOS complication
│   └── serve.py           # Dev server with no-cache
├── serve.sh               # Wrapper for serve.py + auto-open
├── web/
│   ├── app.js             # UI, cast, history, settings, theme
│   ├── llm.js             # Ollama/OpenAI adapter
│   ├── markdown.js        # Streaming MD→HTML
│   ├── index.html         # Single-page app
│   ├── style.css          # Theme (dark/light) + print layout
│   ├── manifest.webmanifest  # PWA manifest
│   └── icons/             # PWA icons
└── _archiv/               # old attempts (excluded via .gitignore)
```

## Workflow

### Changing Code

1. Edit in `web/*.js`
2. `node --check web/<file>.js` for a quick syntax check
3. Hard-reload the browser tab (Cmd+Shift+R)
4. In the browser: make a reading, click through the reading
5. If LLM code changed: test the interpretation with Ollama and MLX
6. On changes to `web/app.js` (King Wen lookup), `scripts/build_data.py`
   or `data/hexagrams.json`: `node scripts/test-kingwen.mjs` — checks
   the two lookup tables and the JSON for mutual consistency.

### Rebuilding the Data

When Wilhelm texts or trigram master data change:

```bash
python3 scripts/build_data.py
```

Output:

```
OK: 64 Hexagramme → data/hexagrams.json
OK: 8 Trigramme → data/trigrams.json
   Schriftzeichen: 64/64, Bild-Assoziationen: 2/64
```

`Schriftzeichen: 64/64` and `Hexagramme: 64` must be exactly right. On
discrepancies, debug the build script, do not patch the JSON by hand.

### iOS / Widget / Watch (native family)

The native family lives under `scripts/ios-app/` (XcodeGen project, no
committed `.xcodeproj`). It builds via:

```bash
scripts/ios-app/build-ios-app.sh   # simulator (default)
#                                  | catalyst | watch | archive | device
```

`catalyst` is the long-term Mac path (meant to supersede the legacy
AppKit app). `archive`/`device` need `YIJING_TEAM_ID`; `device` takes an
optional `YIJING_DEVICE_ID` to install+launch. The build embeds the
*committed* `web/` + `data/` (`git archive HEAD`) — so **commit before
building**.

The family ships at **1.0.0 / build 1** and versions **independently of
the macOS 1.5.x app** (two deliberate, separate version tracks). On a
version bump, keep these in sync:

- `scripts/ios-app/project.yml` — `MARKETING_VERSION` **and**
  `CURRENT_PROJECT_VERSION`
- all four `Info.plist` files (`Resources/`, `Widgets/`, `Watch/`,
  `WatchWidgets/`) — `CFBundleShortVersionString` **and**
  `CFBundleVersion`

After native work: log it in `CHANGELOG.md` and run the OracleKit tests:

```bash
cd scripts/ios-app/OracleKit && swift test
```

This is the gate proving the Swift King-Wen port stays bit-identical to
`web/app.js` and `scripts/build_data.py` (three canonical King-Wen copies
must stay in sync).

### CSS

Check layout modes:

- **Desktop**: browser window ≥ 760 px wide
- **Mobile**: browser tools → device emulation, width ≤ 540 px
- **Print**: Cmd+P → "Save as PDF" — check the preview

Also the theme: click the toggle in the header (◐) through dark / light /
system. Colors come from the `:root` variables, light from
`:root[data-theme="light"]`.

### Testing the LLM Connection

In the settings modal:

- "Connection" — lists models, quick sanity check
- "Reasoning" — sends `thinking=on`/`thinking=off` mini requests,
  checks whether the control takes effect

## Debugging

### Browser Console

Cmd+Opt+I → Console. Errors during init block the event listeners — when
buttons show no action, there is usually an exception here.

### Server Logs

```bash
tail -f /tmp/yijing-server.log
```

(When the server runs in the background via `serve.sh`.)

### LLM Stream in Plain Text

```bash
# Ollama
curl -s http://localhost:11434/api/chat -d '{
  "model": "llama3.2:latest",
  "messages": [{"role":"user","content":"Test"}],
  "stream": true
}' | head -10

# MLX
curl -s http://localhost:8080/v1/chat/completions -d '{
  "model": "mlx-community/Qwen3.6-35B-A3B-4bit",
  "messages": [{"role":"user","content":"Test"}],
  "stream": true,
  "max_tokens": 30
}' | head -10
```

With MLX, `: keepalive` comment lines come before the actual
SSE `data:` lines — that is normal.

### Caching Problems

Symptom: changes appear only after several reloads. The browser caches
ES modules despite `Cache-Control: no-store`.

Fix: in DevTools → Network → check "Disable cache" as long as DevTools
are open. Or append `?t=$(date +%s)` to the URL.

If the service worker (`sw.js`) takes effect, it can additionally serve
old states. When developing: DevTools → Application → Service Workers →
enable "Update on reload" or unregister the worker there.

## Code Style

- **Indentation:** 2 spaces for JS, 4 for Python
- **Strings:** double quotes in JS, single in Python where
  practical
- **German string literals** with inner quotes: use typographic
  ones (`„…"`), not straight (`"…"`). Otherwise syntax errors.
- **Comments:** only where the *why* is not readable from the code
- **JSDoc** for public functions — parameters, return value, notes

## Release Process

Versioning follows [SemVer](https://semver.org/), the changelog
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Steps
for a release (using `v1.1.1` as an example):

> **Version-bump locations** — keep all of these in sync; it is easy to
> miss one (e.g. `Info.plist` was stuck at `1.0` until v1.3.0):
>
> - `scripts/macos-app/Info.plist` — `CFBundleVersion` **and** `CFBundleShortVersionString`
> - `CHANGELOG.md` — `[Unreleased]` → `[x.y.z] — YYYY-MM-DD`
> - `README.md` **and** `README.de.md` — the download badge URL (`releases/download/<tag>/Yijing.dmg`)
> - `README.md` **and** `README.de.md` — a new top row in the release-history table
> - `web/index.html` — the footer download link `href`
>
> The shields.io release badge (`gitea/v/release`) updates itself — no manual edit.

1. **Pull the CHANGELOG.** Rename the `[Unreleased]` section to
   `[1.1.1] — YYYY-MM-DD`. Create a fresh `[Unreleased]` section
   above it.
2. **Adjust the version strings.** Footer in `web/index.html`
   (e.g. "Yijing v1.1.1"). Otherwise users are left wondering
   which version they have.
3. **Commit + tag.**
   ```bash
   git commit -am "Release v1.1.1: <Headline>"
   git tag -a v1.1.1 -m "v1.1.1 — <short headline>"
   git push origin main
   git push origin v1.1.1
   ```
4. **Build the DMG.**
   ```bash
   ./scripts/build-macos-app.sh
   # → dist/Yijing.dmg
   ```
   The script pulls the committed state (`git archive HEAD`), not
   the working directory — so push the tag first, otherwise an
   untagged state ends up in the app.
5. **Create a Codeberg release** (UI or API):
   ```bash
   TOKEN=…
   curl -X POST "https://codeberg.org/api/v1/repos/jkaindl/Yijing/releases" \
     -H "Authorization: token $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"tag_name":"v1.1.1","name":"v1.1.1 — <Headline>",
          "body":"<Markdown notes from CHANGELOG>"}'
   ```
   Quirk: in rare cases the API reports right after a tag push
   "HTTP 409 Release has no Tag" — retry seconds later,
   then verify with `GET /releases` instead of blindly trusting
   the first POST.
6. **Upload the DMG as an asset** (UI or API with
   `POST .../releases/<id>/assets`). Briefly verify the download URL
   with `curl -I` (HTTP 200).
7. **Update the download links to the new tag.** The button in
   `README.md` and the `href` of the `#macDownload` button in
   `web/index.html` point to a versioned URL
   (`releases/download/<tag>/Yijing.dmg`) — Codeberg has no
   `latest` alias for direct asset links. The README status badge
   for the release version updates automatically via
   `shields.io/gitea/v/release`.
8. **Pages sync.** When `web/`, `sw.js` or `data/` were affected:
   ```bash
   ./scripts/sync-pages.sh
   ```
   The script automatically creates a worktree, mirrors `web/` into
   the pages root, copies `data/` and `sw.js`, patches the paths in
   `app.js` (`../data/` → `data/`, `../sw.js` → `sw.js`), commits
   and pushes with SSH retry. No-op when pages is already up to date.

# AGENTS.md

Conventions for AI agents (Claude Code, Codex, Cursor, …) working on this
repository. Humans benefit too — but this is primarily aimed at
automated sessions.

## Project character

Yijing-Orakel is a **hobby project** with a deliberately flat architecture.
We are on the seventh attempt here, after six discarded predecessors
(see `_archiv/yijing_1` through `Yijing_6`). All earlier attempts got
bogged down in structural over-engineering (notebook workflows, Pydantic
layers, FastAPI wrappers). This attempt is intentionally different.

> **Important:** Before you make an architectural decision, check whether
> one of the archived attempts already tried the same thing. We are not
> building the same tower again here.

## Architecture principles

| Principle | Consequence |
|---|---|
| **Static site** | No application server, no backend. Pure HTML/CSS/JS, served via `python3 -m http.server`. |
| **Zero Dependencies** | No npm, no Webpack, no TypeScript build. Vanilla ES modules with native `<script type="module">`. |
| **Data as the source** | Hexagram texts and trigram reference data live as static JSON in `data/`. The build script (`scripts/build_data.py`) reads from `_archiv/` and produces the JSONs. |
| **Local LLMs only** | The default endpoints are Ollama (11434) and MLX/LM-Studio (8080/v1, 1234/v1). No cloud API keys in the code. |
| **Persistence in the browser** | History, endpoints, system prompt in `localStorage`. No database, no server-side state. |

## What you should NOT do

- **Do not introduce a framework** (React/Vue/Svelte). Vanilla stays vanilla.
- **Do not introduce a build step** (Webpack/Vite/esbuild). If ES modules
  are not enough, that is a hint to simplify, not to upgrade.
- **No TypeScript**. JSDoc is enough for type hints.
- **No backend** for LLM routing. The browser calls the local servers directly.
- **`_archiv/`** is **read-only**, never written back to. Not even
  "cleaned up". It is intentionally raw.
- **No new test frameworks** for trivial functions. If tests become
  necessary, prefer `node --check` and targeted ad-hoc smoke tests.
  Existing sanity test: `node scripts/test-kingwen.mjs` (King-Wen
  lookups + `data/hexagrams.json` consistency, no dependencies).
- **`_archiv/yijing_1/.env`** contains a plaintext Google API key. Never
  commit it to git, never remove the `_archiv/` `.gitignore` entry.

## Code style guidelines

- **UI language: bilingual DE + EN** — see the section
  "[Languages (DE / EN)](#languages-de--en)". Code identifiers: English.
  Comments: English or German, both fine — but consistent
  within a file.
- **In German string literals, never use straight `"…"` for inner
  quotation marks.** Set them typographically: `„…"`. Otherwise
  JavaScript closes the string prematurely — see commit `a164aba` ff.
- **After every JS edit:** run `node --check <file>`.
- **When editing `app.js`:** test with a browser tab hard-reload (Cmd+Shift+R).
  The dev server does set `Cache-Control: no-store`, but some browsers
  still cache ES module imports.
- **Comments** explain *why*, not *what*. Identifier names explain
  the what.

## Languages (DE / EN)

The repo is deliberately bilingual — but **selectively**, not everywhere, to
keep duplicate maintenance low (fits the lean hobby-project character).

| Area | Language policy |
|---|---|
| **App** — UI strings (`web/i18n.js`), hexagram texts (`data/`) | **Bilingual DE + EN.** Every new UI string needs both dict entries; every new user-visible data field needs its `*_en` counterpart. |
| **README** | **Bilingual:** `README.md` (English, **canonical**) + `README.de.md` (German). Carry content changes into both files; preserve the language-toggle line at the top (`🇬🇧 English · 🇩🇪 Deutsch`). |
| **Everything else** — `docs/`, `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`, `AGENTS.md`, release notes | **Single-language, English as the canonical target language.** Do not create `*.de.md` duplicates. |

Existing deep documentation (`docs/`, some meta files) is historically
still in German. The migration to English proceeds **opportunistically** — when
a file is being touched anyway, translate it at the same time; **no
big bang**. This keeps the lean character intact and avoids a
translation treadmill.

## Rebuild the data

```bash
python3 scripts/build_data.py
```

Sources: `_archiv/Yijing_6/yijing/resources/hexagram_json/` (Wilhelm texts
for the 64 hexagrams, two schema variants — see the build script),
`_archiv/yijing_5/data/processed/` (Chinese names, trigram
reference data), `_archiv/yijing_3/` (image associations from file names, only
19/64 present).

Output: `data/hexagrams.json` (~580 KB, all 64 hexagrams normalized),
`data/trigrams.json` (8 trigrams with reference data).

Both files **belong to the commit** (they are not build artifacts in the
strict sense, but primary data assets of the app).

## Branches: `main` and `pages`

The repo has two branches:

- **`main`** — the development branch. `index.html` lives in the subfolder
  `web/`, the data in `data/` (from `web/`: `../data/`).
- **`pages`** — the deployment for Codeberg Pages
  (`https://jkaindl.codeberg.page/Yijing/`). **Flat layout:** the
  contents of `web/` live directly in the branch root, `data/` next to it.

Every change to `web/`, `sw.js` or the data must be carried over to
`pages` — there is `./scripts/sync-pages.sh` for that. The
script automatically creates a worktree, mirrors `web/` into the
pages root, copies `data/` and `sw.js`, patches the paths in `app.js`
(`../data/` → `data/`, `../sw.js` → `sw.js`), commits and pushes with
an SSH retry. No-op if `pages` is already up to date.

`index.html`, `style.css`, `manifest.webmanifest` and `sw.js` are
identical in both branches; `app.js` differs only in the
paths (`data/`, `sw.js` instead of `../data/`, `../sw.js`).

## PWA, Service Worker, Theme

- **`sw.js`** (repo root) is a service worker — network-first caching
  for offline operation. It lives in the root so that its scope covers `web/`
  and `data/`. When changing `web/`, keep in mind that the SW
  can cache in the browser.
- **`web/manifest.webmanifest` + `web/icons/`** make the site installable
  as a PWA.
- **Theme:** Dark/Light/System. Colors are `:root` CSS variables,
  Light via `:root[data-theme="light"]`. The selection is in `localStorage`
  (`yijing-theme`). An inline script in the `<head>` sets the theme before
  the first paint.

## macOS app

`scripts/build-macos-app.sh` bundles the oracle as `Yijing.app` — a
native Swift app (`scripts/macos-app/Yijing.swift` +
`StaticServer.swift`) that starts an internal HTTP server (Network.framework
/ `NWListener`) and shows the oracle in a WKWebView window.
No Python and no command-line tools on the user's side — the app
brings everything itself. The `CFBundleExecutable` **must** be a
compiled binary — a shell script triggers a Rosetta prompt on Apple
Silicon. Details: `docs/MACOS-APP.md`.

## CORS — important setup note

The browser calls the LLM servers directly. Both must allow CORS for the origin
of the dev server:

**Ollama:**
```bash
export OLLAMA_ORIGINS="*"   # or specific: "http://localhost:8765"
ollama serve
```

**MLX/LM Studio:** open by default. With your own `mlx_lm.server`,
do not set a restrictive `--allowed-origins` flag.

## Reasoning modes

The LLM adapter (`web/llm.js`) translates `thinking: true|false|null` into:

| Backend | Parameter |
|---|---|
| Ollama `/api/chat` | `think: bool` + `options.num_predict` (32k on, 4k off) |
| OpenAI-compatible `/v1/chat/completions` | `reasoning_effort: "low"|"none"` + `chat_template_kwargs.enable_thinking: bool` + `max_tokens` |

Reasoning output arrives in different fields depending on the server:
- Ollama native: `message.thinking`
- Ollama-OpenAI: `choices[0].delta.reasoning_content`
- MLX (`mlx_lm.server`): `choices[0].delta.reasoning`
- DeepSeek style: `reasoning_content`

`llm.js` parses all three, calls `onThinking(text)` separately from `onToken(text)`
— the UI shows reasoning in its own, dimmed `<details>` block.

## History, deep links

Readings are stored with a UUID (`localStorage["yijing-history-v1"]`).
The URL hash `#r=<uuid>` recalls a reading. On reset the hash
is cleared.

When changing the schema: `loadHistory()` must tolerate old entries
or offer a migration.

## When you split the code

`app.js` is, at ~2100 lines, well past the comfortable upper end of what
belongs in a single file. As it grows further, only split when a concrete feature
can be cleanly isolated — not prophylactically. Sensible cuts
would be:

- `history.js` (loadHistory, saveHistory, renderHistory, applyHashIfAny)
- `settings.js` (renderEndpointList, openSettings, closeSettings)
- `export.js` (buildMarkdownExport, downloadFile, print handler)
- `theme.js` (applyTheme, initTheme, service worker registration)

But: this only works if each cut has a clear public API.
Otherwise, better leave it.

## Tests / verification

There is no unit test suite. Accepted. If you change something:

1. `node --check web/<file>.js` for syntax
2. In the browser hard-reload, make a reading, test "Interpret" with both
   endpoints (Ollama + MLX)
3. For data changes: `python3 scripts/build_data.py` must run through
   without errors, the counters in the output consistent

For larger changes, add a short note to `CHANGELOG.md`.

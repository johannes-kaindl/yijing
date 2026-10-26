# AGENTS.md

> **Workspace-Standards (maintainer-lokal):** Die verbindliche Leitkonvention steht in `_docs/CONVENTIONS.md` im Multi-Projekt-Workspace des Maintainers, `../_docs` relativ zu diesem Repo — nicht Teil dieses Repos, ignorieren falls im Klon nicht vorhanden. Modell comply-or-explain.

Conventions for AI agents (Claude Code, Codex, Cursor, …) working on this repository. Humans benefit too — but this is primarily aimed at automated sessions.

## Project character

Yijing-Orakel is a **hobby project** with a deliberately flat architecture. We are on the seventh attempt here, after six discarded predecessors (see `_archiv/yijing_1` through `Yijing_6`). All earlier attempts got bogged down in structural over-engineering (notebook workflows, Pydantic layers, FastAPI wrappers). This attempt is intentionally different. Before you make an architectural decision, check whether one of the archived attempts already tried the same thing. We are not building the same tower again here.

The web app is the core. A universal native Apple family (iOS / iPadOS / watchOS, Mac Catalyst deferred) wraps it and has been **live on the App Store** since 2026-06-20: <https://apps.apple.com/app/yijing-i-ching/id6780668644>. There are two version tracks on purpose: the macOS AppKit DMG is on **1.5.x**, the native family under `scripts/ios-app/` on **1.0.x**.

## Architecture principles

| Principle | Consequence |
|---|---|
| **Static site** | No application server, no backend. Pure HTML/CSS/JS, served via `python3 scripts/serve.py`. |
| **Zero Dependencies** | No npm, no bundler, no framework — nothing to install in order to run, serve or deploy the app. Vanilla ES modules with native `<script type="module">`. The one qualification is the vendored code-kit copy (`web/vendor/`), transpiled by `scripts/build-vendor.mjs` with Node's own type stripping. |
| **Data as the source** | Hexagram texts and trigram reference data live as static JSON in `data/`. The build script (`scripts/build_data.py`) reads from `_archiv/` and produces the JSONs. |
| **Local LLMs only** | The default endpoints are Ollama (11434) and MLX/LM-Studio (8080/v1, 1234/v1). No cloud API keys in the code. |
| **Persistence in the browser** | History, endpoints, system prompt in `localStorage`. No database, no server-side state. |

## Commands

```bash
PORT=8765 python3 scripts/serve.py        # dev server, http://localhost:8765/web/index.html
node scripts/check-syntax.mjs             # syntax gate: sw.js, web/*.js, inline <script> of web/*.html
node scripts/test-kingwen.mjs             # King-Wen lookups + data/hexagrams.json consistency
node scripts/build-vendor.mjs --check     # fails if a generated vendor .js is stale
node scripts/capture-web-shots.mjs        # re-shoot the README images (needs Google Chrome only)
./scripts/deploy-page.sh                  # live demo; on main, clean tree, after committing
(cd scripts/ios-app/OracleKit && swift test)   # King-Wen / daily parity gate
```

The data pipeline runs in this order, each step depends on the previous:

```bash
python3 scripts/build_data.py             # 1. DE+EN corpus + trigrams (drops *_neutral fields)
python3 scripts/apply_neutral.py          # 2. re-merge gender-neutral overrides — MUST follow step 1
python3 scripts/sync_image_seeds_to_en.py # 3. mirror image seeds DE->EN
python3 scripts/build_widget_slice.py     # 4. slim widget/complication slice
```

Tracked outputs belong to the commit: `data/hexagrams.json`, `data/hexagrams.en.json`, `data/trigrams.json`, `data/widget-hexagrams.json`. Sources and details: `docs/DATA.md`.

## What you should NOT do

- **Do not introduce a framework** (React/Vue/Svelte). Vanilla stays vanilla.
- **Do not introduce a build step** (Webpack/Vite/esbuild) **for this repo's own code**. If ES modules are not enough, that is a hint to simplify, not to upgrade. `scripts/build-vendor.mjs` is not a counter-example and not a precedent: it exists solely because the vendored code-kit modules arrive as TypeScript, it uses nothing but Node itself, and its output is tracked.
- **No TypeScript** for code written here. JSDoc is enough for type hints. The `.ts` files under `web/vendor/code-kit/` are the exception and are not ours to rewrite.
- **Never edit anything under `web/vendor/`.** A fix belongs upstream in code-kit, followed by a re-vendor.
- **No backend** for LLM routing. The browser calls the local servers directly.
- **`_archiv/`** is **read-only**, never written back to. Not even "cleaned up". It is intentionally raw.
- **`_archiv/yijing_1/.env`** contains a plaintext Google API key. Never commit it to git, never remove the `_archiv/` `.gitignore` entry.
- **No new test frameworks** for trivial functions. If tests become necessary, prefer `node --check` and targeted ad-hoc smoke tests. OracleKit's XCTest suite (`Tests/OracleKitTests/`) is the one sanctioned exception.

## Conventions

- **UI language: bilingual DE + EN.** Every new UI string needs both dict entries in `web/i18n.js`; every new user-visible data field needs its `*_en` counterpart. Code identifiers: English. Comments: English or German, but consistent within a file.
- **README: bilingual.** `README.md` (English, canonical) + `README.de.md`. Carry content changes into both and keep the language-toggle line at the top (`🇬🇧 English · 🇩🇪 Deutsch`).
- **Everything else is single-language, English as canonical** (`docs/`, `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`, this file, release notes). Do not create `*.de.md` duplicates. Older German docs migrate opportunistically, when a file is touched anyway.
- **In German string literals, never use straight `"…"` for inner quotation marks.** Set them typographically: `„…"`. Otherwise JavaScript closes the string prematurely. After every JS edit run `node scripts/check-syntax.mjs` (or `node --check <file>` for one file); the first also covers the inline `<script>` blocks.
- **After editing `app.js`, hard-reload the tab** (Cmd+Shift+R). The dev server sets `Cache-Control: no-store`, but some browsers still cache ES module imports.
- **Comments explain *why*, not *what*.** Identifier names explain the what.
- **For UI-visible changes:** re-run `node scripts/capture-web-shots.mjs` and look at the result. Each shot asserts what it must show, but the run cannot judge composition. The capture contract is `docs/images/README.md`.
- **For larger changes,** add a short note to `CHANGELOG.md`.
- **Verification has no web unit-test suite, and that is accepted.** After a change: the syntax gate, a hard-reload reading, "Interpret" against both endpoints (Ollama + MLX), and for data changes a clean `python3 scripts/build_data.py` run with consistent counters.

## Gotchas

- **Three canonical King-Wen copies must stay in sync:** `web/app.js` `BINARY_TO_KING_WEN`, `scripts/build_data.py` `KING_WEN_BINARY` and OracleKit `Casting.swift`. The parity gate is `swift test` in OracleKit plus `node scripts/test-kingwen.mjs`.
- **`scripts/build_widget_slice.py` `lead()` mirrors OracleKit `Texts.judgmentLead`.** The Kernsatz trimming in the two must stay identical.
- **`web/app.js` `publishSettings()` must keep posting** `{action:'settings', language, register}` over `window.webkit.messageHandlers.yijing` (on `i18n:changed`, on register change, at load). Widgets and watch follow the app's language/register through it.
- **Readings are stored with a UUID** in `localStorage["yijing-history-v1"]`, recalled by `#r=<uuid>`. When the schema changes, `loadHistory()` must tolerate old entries or migrate them.
- **`sw.js` (repo root) is network-first and can cache in the browser.** It sits in the root so its scope covers `web/` and `data/`; keep that in mind when changing `web/`.
- **Colors are `:root` CSS variables** (Light via `:root[data-theme="light"]`, choice in `localStorage` `yijing-theme`); an inline script in the `<head>` sets the theme before first paint.
- **Never write `<command> | grep -q …` as a condition under `set -o pipefail`** (CORE-OPS-03). `grep -q` exits at the first match, the producer dies of SIGPIPE, and the condition is false exactly when it matches.
- **Deploy, iOS build and macOS build all read the committed state** (`git archive HEAD`). Commit before running them.

## Branch and deployment

There is a single branch, `main`; `index.html` lives in `web/`, the data in `data/` (from `web/`: `../data/`). `origin` (git.jkaindl.de) is the only remote.

The live demo <https://pages.jkaindl.de/yijing/> is deployed with `./scripts/deploy-page.sh` — from the repo root, on `main`, with a clean working tree. It snapshots the committed state, builds the flat layout in a temp dir (contents of `web/` at the root, `data/` and `sw.js` next to it), patches the paths in `app.js` (`../data/` → `data/`, `../sw.js` → `sw.js`), verifies no `../` path survived and rsyncs to the pages host. It refuses to deploy unless `node scripts/check-syntax.mjs` passes. Every change to `web/`, `sw.js` or the data needs a deploy run to become visible. The two macOS traps (Homebrew `rsync`, `--chmod=D755,F644`) are explained in the script header.

## Context index

- Before editing anything under `scripts/ios-app/` (build, signing, widgets, watch): `.claude/rules/ios-app.md`, then `docs/IOS-APP.md` and `scripts/ios-app/README.md`.
- Before editing `scripts/macos-app/` or the two macOS build scripts: `.claude/rules/macos-app.md`, then `docs/MACOS-APP.md`.
- Before touching `web/vendor/`, `web/llm.js` or `scripts/build-vendor.mjs`: `.claude/rules/vendor.md`; endpoint and reasoning setup in `docs/LLM.md`.
- Before a structural change to the web app (modules, data flow, persistence, URL scheme, native bridge): `docs/ARCHITECTURE.md`.
- Before rebuilding or changing the data: `docs/DATA.md`; setup and workflow: `docs/DEVELOPMENT.md`.
- Before you adopt a "decided on purpose" at face value, or when you wonder why the hosting looks the way it does: `docs/internal/decisions.md`.
- Before changing README images: `docs/images/README.md`.

## Memory

- **SDD artifacts live in the maintainer's coding cockpit, not in this repo** (maintainer-local). The repo keeps the design essence in this file, `docs/internal/decisions.md` and `CHANGELOG.md`.
- **Legacy stock:** `docs/superpowers/{specs,plans}/` is frozen — do not add anything new there.
- **Never in the repo:** absolute paths outside the repo (`/Users/…`, vault paths) — use placeholders (`$VAULT/…`, `~/…`, repo-relative). Provenance references as repo name + `file:line` are welcome.

## Abweichungen von der Leitkonvention

Keine. (CORE-META-03, CORE-GIT-01, PROF-WEB-03, PROF-NAT-01 and PROF-NAT-02 are closed; the record is in `docs/internal/decisions.md`.)

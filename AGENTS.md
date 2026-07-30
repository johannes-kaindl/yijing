# AGENTS.md

> **Workspace-Standards (maintainer-lokal):** Die verbindliche Leitkonvention steht in `_docs/CONVENTIONS.md`
> im Multi-Projekt-Workspace des Maintainers, `../_docs` relativ zu diesem Repo — nicht Teil dieses Repos,
> ignorieren falls im Klon nicht vorhanden. Modell comply-or-explain. Offene Punkte fuer dieses Repo
> siehe Abschnitt "Offene Konventions-Punkte".

Conventions for AI agents (Claude Code, Codex, Cursor, …) working on this
repository. Humans benefit too — but this is primarily aimed at
automated sessions.

## Offene Konventions-Punkte

- [ ] CORE-META-03 — Hero-Bild in `docs/images/` ergaenzen + Screenshots reproduzierbar per Skript erzeugen (App-Store-Screenshots + Preview-Video existieren bereits als archivierte Launch-Assets, commit `69a34b5`; offen bleibt nur das reproduzierbare Skript + ein `docs/images/`-Hero-Bild).
- [ ] CORE-GIT-01 — GitHub-Mirror-Remote `github` einrichten (derzeit nur `origin` = `git.jkaindl.de`).
- [ ] PROF-WEB-03 — `node --check`-Gate-Skript anlegen, das `<script>` aus HTML extrahiert und syntaktisch prueft.
- [ ] PROF-NAT-01 — Add a separate `scripts/package-native-app.sh` (sign + notarize) for the **macOS AppKit DMG**. *(The iOS App Store path needs NO notarization: `build-ios-app.sh archive` now does an `app-store-connect` export + `altool` upload via `exportOptions.plist`, gated on `YIJING_ASC_ISSUER_ID` — done 2026-06-13.)*
- [x] PROF-NAT-02 — All four target `Info.plist`s now derive `CFBundleShortVersionString` / `CFBundleVersion` from `project.yml`'s `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` (build-setting expansion). A version bump is two lines in `project.yml`, in lockstep by construction — no script needed (done 2026-06-13).

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
  (OracleKit's XCTest suite is the one sanctioned exception — see
  "[Tests / verification](#tests--verification)".)
- **`_archiv/yijing_1/.env`** contains a plaintext Google API key. Never
  commit it to git, never remove the `_archiv/` `.gitignore` entry.
- **Do not add an explicit `-sdk`** to the `build-ios-app.sh`
  simulator/archive/device `xcodebuild` invocations. The embedded
  watchOS app must build for watchOS via `-destination`; forcing
  `-sdk iphoneos` breaks it (`WatchKitAppInvalidUIDeviceFamily`).
- **Do not add a meditation/image widget.** Apple Image Playground
  (`ImageCreator`) is foreground-only (`backgroundCreationForbidden`),
  so it cannot run in a WidgetKit timeline.
- **Do not attempt a custom watch face.** watchOS forbids third-party
  faces; the daily hexagram ships as a complication, not a face.
- **Never commit `scripts/ios-app/OracleKit/.build` or
  `OracleKit/.swiftpm`** — they are build caches (gitignored).

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

The canonical pipeline runs in order — each step depends on the previous:

```bash
python3 scripts/build_data.py             # 1. DE+EN corpus + trigrams
python3 scripts/apply_neutral.py          # 2. re-merge gender-neutral overrides
python3 scripts/sync_image_seeds_to_en.py # 3. mirror image seeds DE->EN
python3 scripts/build_widget_slice.py     # 4. slim widget/complication slice
```

1. `build_data.py` produces `data/hexagrams.json` + `data/hexagrams.en.json`
   + `data/trigrams.json` (drops `*_neutral` fields).
2. `apply_neutral.py` re-merges the committed `*_neutral` / `*_en_neutral`
   overrides from `scripts/sources/neutral_overrides.json` — a DE rebuild
   discards them, so this **must** follow `build_data.py`.
3. `sync_image_seeds_to_en.py` mirrors the language-independent
   `image_association` seeds DE→EN and drops the obsolete
   `image_association_en`.
4. `build_widget_slice.py` produces `data/widget-hexagrams.json` (~26 KB:
   per-hexagram number/binary/both names + the Judgment Kernsatz, both
   languages × both registers; slim enough for the widget memory budget).
   Its `lead()`/Kernsatz trimming mirrors OracleKit `Texts.judgmentLead` —
   the two must stay in sync.

Sources: `_archiv/Yijing_6/yijing/resources/hexagram_json/` (Wilhelm texts
for the 64 hexagrams, two schema variants — see the build script),
`_archiv/yijing_5/data/processed/` (Chinese names, trigram
reference data), the curated `IMAGE_SEEDS` table in `build_data.py` (one short English
meditation-image motif per hexagram, 64/64 — superseding the old
`_archiv/yijing_3/` filename extraction).

Tracked outputs (all **belong to the commit** — primary data assets, not
strict build artifacts): `data/hexagrams.json`, `data/hexagrams.en.json`,
`data/trigrams.json`, `data/widget-hexagrams.json`.

## Branch and deployment

There is a **single branch, `main`**. `index.html` lives in the subfolder
`web/`, the data in `data/` (from `web/`: `../data/`).

The live demo <https://pages.jkaindl.de/yijing/> is deployed with
`./scripts/deploy-page.sh` — from the repo root, on `main`, with a clean
working tree. The script snapshots the **committed** state
(`git archive HEAD` — so commit before deploying), builds the **flat layout**
in a temp dir (contents of `web/` at the root, `data/` and `sw.js` next to it),
patches the paths in `app.js` (`../data/` → `data/`, `../sw.js` → `sw.js`),
verifies no `../` path survived, and rsyncs to the pages host.

Every change to `web/`, `sw.js` or the data needs a deploy run to become
visible on the live demo.

> Two things the script is deliberate about, both load-bearing on macOS:
> it calls **`/opt/homebrew/bin/rsync`** explicitly (Apple's `openrsync` is
> incompatible with the server-side `rrsync` wrapper and may come first on
> `PATH`), and it passes **`--chmod=D755,F644`** (a `mktemp` staging dir is
> `0700`, and `rsync -a` would propagate that to the target — the web server
> then answers 403).

**Historical note:** until 2026-07-30 the deployment was a second branch,
`pages`, synced by `scripts/sync-pages.sh` to Codeberg Pages. Both are gone —
the branch is not maintained any more, and the repo now lives on
`git.jkaindl.de`. Older entries in `CHANGELOG.md` still mention the old path;
that is history, not current convention.

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
Silicon. Details: `docs/MACOS-APP.md`. The newer iOS app also builds as a
native Mac app via Mac Catalyst (`build-ios-app.sh catalyst`) and is the
long-term Mac path; this legacy AppKit `Yijing.app` still exists but is
slated to be superseded.

## iOS / iPadOS / Mac / watchOS app (native family)

A universal native family under `scripts/ios-app/` (iOS 17 / iPadOS /
Mac Catalyst + watchOS 10), on its own **1.0.x** version line — deliberately
separate from the macOS AppKit DMG's **1.5.x** line (two version tracks).
As of 2026-06-20 this family is **live on the App Store** as v1.0.0 (build 5):
<https://apps.apple.com/app/yijing-i-ching/id6780668644> (iPhone / iPad / Apple
Watch; Mac Catalyst is the deferred long-term Mac path, not part of the shipped
build).
The project is generated with **XcodeGen** from `scripts/ios-app/project.yml`;
there is **no committed `.xcodeproj`**. Details: `scripts/ios-app/README.md`
and `docs/IOS-APP.md`.

Five targets:

| Target | Bundle suffix | Role |
|---|---|---|
| **App** (iOS + macCatalyst) | `page.codeberg.jkaindl.Yijing` | WKWebView hosting the same web app via a loopback `LocalServer` + an OpenAI-compatible shim, so `web/llm.js` is consumed **unchanged**. |
| **YijingWidgets** | `.widgets` | WidgetKit daily-hexagram widget (systemSmall/Medium + the three Lock-Screen accessory families); timeline reloads at local midnight. |
| **YijingWatch** | `.watchkitapp` | watchOS app: "Heute" (deterministic daily hexagram) + "Werfen" (full three-coin cast). Offline, no network, no AI. Embedded in the iOS app (`embed:true`) so it installs to the paired watch. |
| **YijingWatchWidgets** | `.watchkitapp.widgets` | daily-hexagram complication. |
| **OracleKit** | (local Swift package) | The single shared logic core consumed by all four targets. |

**OracleKit** (`scripts/ios-app/OracleKit/`) holds the shared Swift logic:
`Casting.swift` (three-coin cast + the 64-entry King-Wen binary→number
table), `Daily.swift` (deterministic daily hexagram), `Models.swift`
(Codable, mirrors the JSON schema), `DataStore.swift` (JSON loader),
`Settings.swift` (App-Group settings), `Texts.swift` (language/register
accessors incl. `judgmentLead` Kernsatz trimming), `SlimData.swift` (widget
slice loader).

> There are now **three canonical King-Wen copies** that MUST stay in sync:
> `web/app.js` `BINARY_TO_KING_WEN`, `scripts/build_data.py`
> `KING_WEN_BINARY`, and OracleKit `Casting.swift`.

**Build** — `scripts/ios-app/build-ios-app.sh` modes:
`simulator` (default) | `catalyst` | `watch` | `archive` | `device`.
Signing is configured by env vars: `YIJING_TEAM_ID` (required for
`archive`/`device`) and optional `YIJING_DEVICE_ID` (install + launch on a
device). The build embeds the **committed** `web/` + `data/` via
`git archive HEAD` — so **commit before building**. `archive` mode leaves the
`__BUILD__` placeholder so the build badge / dev tooling stays disabled. With
`YIJING_ASC_ISSUER_ID` set, `archive` also exports (`app-store-connect`) and
uploads to App Store Connect via `altool` (API key `9NPJZ2DPG6`) using
`exportOptions.plist`; without it it stops at the `.xcarchive`.
Prereqs: full Xcode + iOS SDK, `brew install xcodegen`.

**App Group:** `group.page.codeberg.jkaindl.Yijing`, shared by all four
entitlements files. Each App ID must be **assigned the group individually**
in the Apple Developer Portal — auto-signing creates the App IDs but does
**not** assign the group.

**Settings bridge:** `web/app.js` `publishSettings()` posts
`{action:'settings', language, register}` over
`window.webkit.messageHandlers.yijing` (on `i18n:changed`, on register
change, at load). `WebViewController` writes both into the App-Group
`UserDefaults` and calls `WidgetCenter.reloadAllTimelines()`. `app.js` MUST
keep posting this so widgets/watch follow the app's language/register.

**Deep link:** `yijing://h/<n>` (custom URL scheme, `CFBundleURLTypes` in
`Resources/Info.plist`) → `AppDelegate.application(open:)` →
`WebViewController.openHexagram(n)` → WebView hash `#h=<n>` (the reader on
hexagram *n*). Cold-launch safe via a deferred `pendingHexagram`. Distinct
from the web-only `#r=<uuid>` history links.

**Native architecture principles** (decisions recorded so they aren't
re-attempted):

- **Daily hexagram = one hexagram with NO changing lines** (questionless
  contemplation). The watch's "Werfen" flow is the full mechanics.
- **No LLM/AI on widget or watch** — offline only. AI lives in the app
  foreground (on-device Apple Foundation Models by default, BYO/remote
  local LLMs as fallback).
- **Widget/complication bundle only `data/widget-hexagrams.json`** (memory
  budget); the **watch** bundles the full `hexagrams.json` + `.en.json`.

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

There is no unit test suite **for the web app**. Accepted. If you change
something:

1. `node --check web/<file>.js` for syntax
2. In the browser hard-reload, make a reading, test "Interpret" with both
   endpoints (Ollama + MLX)
3. For data changes: `python3 scripts/build_data.py` must run through
   without errors, the counters in the output consistent

**OracleKit is the one sanctioned exception to the
"[no new test frameworks](#what-you-should-not-do)" rule.** It ships an
XCTest suite (9 tests in `Tests/OracleKitTests/` — `CastingTests.swift`,
`DailyTests.swift`). Run `swift test` from `scripts/ios-app/OracleKit/`.
It is the King-Wen / daily-determinism **parity gate**: it proves the Swift
port is bit-identical to `web/app.js` `BINARY_TO_KING_WEN` and
`build_data.py` `KING_WEN_BINARY` (mirrors `scripts/test-kingwen.mjs`).

For larger changes, add a short note to `CHANGELOG.md`.

## Memory

- **SDD artifacts (since 2026-07-16): cockpit, not repo** — specs/plans/task reports live in the
  maintainer's coding cockpit (`$VAULT/25_Coding/yijing/_SDD/`, CORE-META-14, maintainer-local).
  They carry working context (vault paths, sister-repo internals) that is useless to anyone in a
  public repo. The repo keeps the design essence in this file + `CHANGELOG.md`.
- **Legacy stock:** `docs/superpowers/{specs,plans}/` is frozen — do not add anything new there.
- **Never in the repo:** absolute paths outside the repo (`/Users/…`, vault paths) — use
  placeholders (`$VAULT/…`, `~/…`, repo-relative). Provenance references as repo name +
  `file:line` are welcome, though.

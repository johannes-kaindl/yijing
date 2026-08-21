**🇬🇧 English** · [🇩🇪 Deutsch](README.de.md)

# Yijing Oracle

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue?style=flat-square)](LICENSE)
[![Docs: CC BY-SA 4.0](https://img.shields.io/badge/Docs-CC_BY--SA_4.0-lightgrey?style=flat-square)](LICENSE-DOCS)
[![Release](https://img.shields.io/gitea/v/release/jkaindl/Yijing?gitea_url=https%3A%2F%2Fgit.jkaindl.de&label=release&color=green&style=flat-square)](https://git.jkaindl.de/jkaindl/Yijing/releases)
[![Status: active](https://img.shields.io/badge/status-active-success?style=flat-square)](https://git.jkaindl.de/jkaindl/Yijing/commits/branch/main)
[![Platform: macOS](https://img.shields.io/badge/macOS-11%2B%20·%20Universal-lightgrey?style=flat-square&logo=apple&logoColor=white)](docs/MACOS-APP.md)
[![Platform: iOS](https://img.shields.io/badge/iOS%20·%20iPadOS-17%2B-lightgrey?style=flat-square&logo=apple&logoColor=white)](docs/IOS-APP.md)
[![Platform: watchOS](https://img.shields.io/badge/watchOS-10%2B-lightgrey?style=flat-square&logo=apple&logoColor=white)](docs/IOS-APP.md)
[![App Store](https://img.shields.io/badge/App_Store-live-success?style=flat-square&logo=apple&logoColor=white)](https://apps.apple.com/app/yijing-i-ching/id6780668644)
[![PWA](https://img.shields.io/badge/PWA-installable-5a3e7a?style=flat-square&logo=pwa&logoColor=white)](https://pages.jkaindl.de/yijing/)
[![Build: zero deps](https://img.shields.io/badge/build-zero%20deps-blue?style=flat-square)](#no-build-step)

<p align="center">
  <img src="docs/images/hero-en.png" width="820"
       alt="A cast reading: the question, the primary hexagram with two changing lines marked, the resulting hexagram, and the AI interpretation panel" />
  <br><em>A reading in the browser — primary and resulting hexagram, changing lines marked.</em>
</p>

A lean I Ching oracle as a static site with the Wilhelm translation and
optional AI interpretation via local LLM servers (Ollama, MLX, LM Studio,
vLLM, OpenClaw). Three-coin method, complete Wilhelm texts including all
changing lines, Chinese character with Pīnyīn, trigrams with reference
data. **Bilingual German / English** — UI and hexagram texts switchable
(the English is an independent translation of the Wilhelm original, kept
in Wilhelm's style, with classic I Ching vocabulary). Vanilla JavaScript,
no build step, no backend, offline-capable as a PWA.

Beyond the static site and the legacy macOS app, there is now a **universal
native app for iPhone, iPad and Apple Watch**, [live on the App
Store](https://apps.apple.com/app/yijing-i-ching/id6780668644). It hosts the
same web app in a WebView and adds Apple-platform extras: **on-device AI
interpretation** (Apple Foundation Models), **on-device meditation-image
generation** (Apple Image Playground), a **daily-hexagram Home- and
Lock-Screen widget**, and a **standalone Apple Watch app with complication**.
The same project also builds for Mac via Mac Catalyst — the long-term Mac
path, not yet part of the published listing.

<p align="center">
  <a href="https://pages.jkaindl.de/yijing/">
    <img src="web/assets/og-image.png" alt="Yijing Oracle — stylized hexagram 1 (The Creative) with the Chinese characters 易經" width="720" />
  </a>
</p>

[![Download on the App Store](https://img.shields.io/badge/Download_on_the_App_Store-c79a4a?style=for-the-badge&logo=apple&logoColor=1a1814)](https://apps.apple.com/app/yijing-i-ching/id6780668644)
[![Download for macOS](https://img.shields.io/badge/Download_for_macOS-c79a4a?style=for-the-badge&logo=apple&logoColor=1a1814)](https://git.jkaindl.de/jkaindl/Yijing/releases/download/v1.5.0/Yijing.dmg)
[![Open live demo](https://img.shields.io/badge/Open_live_demo-8a6a30?style=for-the-badge&logo=pwa&logoColor=ece4d3)](https://pages.jkaindl.de/yijing/)

Open the disk image, drag “Yijing” into your Applications folder — done.
The app is **Developer ID-signed and Apple-notarized**, so it launches
right away, with no Gatekeeper warning. Background and the signing
pipeline: [`docs/MACOS-APP.md`](docs/MACOS-APP.md).

---

## Contents

- [Live demo](#live-demo)
- [Usage](#usage)
- [As a macOS app](#as-a-macos-app)
- [As an iOS / iPadOS / Mac (Catalyst) app](#as-an-ios--ipados--mac-catalyst-app)
- [Features](#features)
- [Language (German / English)](#language-german--english)
- [Local LLM connection](#local-llm-connection)
- [How a reading works](#how-a-reading-works)
- [Three-coin method](#three-coin-method)
- [Directory structure](#directory-structure)
- [Documentation](#documentation)
- [Release history](#release-history)
- [Contributing](#contributing)
- [Reporting security issues](#reporting-security-issues)
- [License](#license)
- [Sources](#sources)
- [Status](#status)

---

## Live demo

<https://pages.jkaindl.de/yijing/> — works without any local setup
for casting a hexagram and reading the Wilhelm text. The AI interpretation
requires a locally running LLM server (Ollama or MLX), see
[Usage](#usage).

On the first visit a service worker installs itself in the background —
after that the site runs fully offline. Via the browser’s “Install app”
button it lands as a PWA in the Dock or on the home screen.

## Usage

```bash
git clone https://git.jkaindl.de/jkaindl/Yijing.git yijing
cd yijing
./serve.sh
```

Opens `http://localhost:8765/web/index.html` automatically.

> Requirement: Python 3.9+. No npm dependencies, no build step, no
> backend.

## As a macOS app

For handing it to users without terminal experience, the oracle can be
bundled as a double-clickable macOS app:

```bash
./scripts/package-macos-app.sh
```

This produces `dist/Yijing.dmg` — a disk image in which `Yijing.app` is
dragged into the Applications folder. The app shows the oracle in its own
window, with no terminal and no browser. Build requirement: Xcode Command
Line Tools (`xcode-select --install`). Details:
[`docs/MACOS-APP.md`](docs/MACOS-APP.md).

## As an iOS / iPadOS / Mac (Catalyst) app

The iPhone / iPad / Apple Watch app is **live on the App Store**:
<https://apps.apple.com/app/yijing-i-ching/id6780668644>. To build it
yourself: the universal native family (iOS 17 / iPadOS / Mac Catalyst +
watchOS 10) lives under `scripts/ios-app/`. It is an [XcodeGen](https://github.com/yonaskolb/XcodeGen)
project — the `.xcodeproj` is generated, not committed. Prerequisites: the
full **Xcode** (not just the Command Line Tools) and `brew install xcodegen`.
Build with:

```bash
scripts/ios-app/build-ios-app.sh [simulator|catalyst|archive|device|watch]
```

`simulator` (default) runs it in the iOS Simulator, `catalyst` builds the
Mac app (the long-term Mac path, meant to supersede the legacy AppKit app),
`archive` produces an App Store archive, `device` builds and installs on a
connected iPhone, and `watch` targets the watchOS app. The build embeds the
**committed** `web/` + `data/`, so commit before building. Per-target detail
and the build script reference: [`scripts/ios-app/README.md`](scripts/ios-app/README.md)
and [`docs/IOS-APP.md`](docs/IOS-APP.md).

Version tracks are deliberately separate: the macOS AppKit DMG is on the
**1.5.x** line, the iOS/watch family on its own **1.0.x** line — now live on
the App Store as v1.0 (build 5).

## Features

- **Three-coin method** with the correct distribution (1/8 : 3/8 : 3/8 : 1/8)
- **Primary and resulting hexagram** for changing lines, with visual
  marking
- **Wilhelm translation** (1924, public domain): judgment, image, meaning,
  all six line texts with Confucius commentary
- **Read-through reference** ("Nachschlagewerk") — browse all 64 hexagrams in
  King-Wen order with their full text and notes, independent of casting (8×8
  index, prev/next, deep links)
- **Gender-neutral wording by default**, with a one-click switch to Wilhelm's
  historical 1924 phrasing — in both languages
- **Chinese character + Pīnyīn** per hexagram
- **Trigrams** with family, nature, season, cardinal direction,
  associations
- **Image meditation** — atmospheric keywords on the web; in the native
  app, an optional per-reading meditation image generated fully on-device
  via Apple Image Playground
- **Daily-hexagram widget** (native) — Home and Lock Screen, on
  iOS / iPadOS / Mac, reloading at local midnight
- **Apple Watch app + complication** (native) — the daily hexagram and a
  full three-coin cast on the wrist; offline, no AI
- **AI interpretation** with streaming, reasoning control and Markdown
  rendering — on-device via Apple Foundation Models in the native app
  (private, offline, no server needed), with a local LLM server (Ollama,
  MLX, LM Studio, vLLM, OpenClaw) as the cross-platform path and the
  fallback for ineligible devices
- **`yijing://` deep link** (native) — open the reader directly on a
  given hexagram from the widget
- **History** of the last 20 readings in localStorage, individual
  readings shareable and restorable via URL hash
- **Export** as Markdown or print-friendly PDF
- **Offline-capable** — service worker; after the first visit the app
  loads and runs without internet. Installable as a PWA.
- **Theme switcher** — dark, light or automatic following the system
  setting
- **Keyboard operation** for casting, reset and settings

<p align="center">
  <img src="docs/images/reader-en.png" width="720"
       alt="The read-through reference: an 8×8 index grid of all 64 hexagrams above the selected hexagram with its figure, Chinese name and full Wilhelm text" />
  <br><em>Read-through reference — browse all 64 hexagrams with their full text, independent of casting.</em>
</p>

## Language (German / English)

The app starts in your browser’s language (`navigator.language`):
`en*` → English, everything else → German. Switchable in the settings
modal (⚙ → Language). The choice takes effect immediately on all UI
elements, the date format in the history, the Markdown export headers and
the default system prompt for the AI interpretation.

The English hexagram texts are an independent translation of the German
Wilhelm original (1924, public domain) in Wilhelm’s style: dignified,
contemplative, with the classic I Ching vocabulary from the English
standard literature (the superior man, the great man, the noble, the
abyss, the well, the receptive, the creative …) — comparable to Cary F.
Baynes’ 1950s translation, but in its own words. Translated with Claude
Opus 4.7, in parallel across eight subagents. Schema and generation
details: [`docs/DATA.md`](docs/DATA.md#english-variant-datahexagramsenjson).

## Local LLM connection

Clicking the ⚙ icon in the top left opens the settings modal. On first
launch the app automatically probes the typical local endpoints:

| Server | Example URL |
|---|---|
| Ollama | `http://localhost:11434` |
| MLX (`mlx_lm.server`) | `http://localhost:8080/v1` |
| LM Studio | `http://localhost:1234/v1` |

Additional endpoints can be added manually.

### CORS

The web app calls the LLM servers directly from the browser — both sides
must allow CORS. For Ollama on macOS:

```bash
launchctl setenv OLLAMA_ORIGINS "*"
# restart Ollama
```

MLX and LM Studio are open by default. Details and troubleshooting:
[`docs/LLM.md`](docs/LLM.md#cors-troubleshooting).

## How a reading works

<p align="center">
  <img src="docs/images/reading-en.png" width="720"
       alt="A cast reading: the question, the primary hexagram and the resulting hexagram with changing-line markers" />
  <br><em>A cast reading — the primary and the resulting hexagram, with the changing lines marked.</em>
</p>

```mermaid
flowchart TD
    A["Type question<br/>+ cast coins"] --> B["castHexagram<br/>6 lines × 3 coins"]
    B --> C["Primary hexagram<br/>+ any changing lines"]
    C --> D{"Changing lines?"}
    D -->|no| E["Render<br/>Wilhelm text"]
    D -->|yes| F["Derive resulting hexagram<br/>+ line texts"]
    F --> E
    E --> G["Reading in localStorage<br/>URL hash r=uuid"]
    G --> H{"Interpret clicked?"}
    H -->|no| Z["Done"]
    H -->|yes| I["Build prompt from hexagram<br/>+ lines"]
    I --> J["Streaming request<br/>to local LLM server"]
    J --> K["Reasoning + answer<br/>live into the UI"]
```

Technical details: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Three-coin method

Three coins per line (yin = 0, yang = 1); the sum + 6 yields the line
value:

| Value | Meaning | Probability |
|---|---|---|
| 6 | changing yin (○) | 1/8 (12.5 %) |
| 7 | stable yang | 3/8 (37.5 %) |
| 8 | stable yin | 3/8 (37.5 %) |
| 9 | changing yang (○) | 1/8 (12.5 %) |

Resolving the changing lines into a resulting hexagram and the King Wen
mapping happens in the browser via a complete lookup table.

## Directory structure

```
yijing/
├── web/                       # frontend (HTML/CSS/JS, vanilla)
├── data/                      # 64 hexagrams + 8 trigrams as JSON
│   └── widget-hexagrams.json  # slim per-hexagram slice for widget/watch
├── scripts/                   # build and dev-server scripts
│   ├── build-macos-app.sh     # legacy AppKit macOS app (1.5.x): build + sign
│   ├── package-macos-app.sh   #   … notarize + wrap it in the DMG
│   └── ios-app/               # universal iOS/iPadOS/Mac-Catalyst app (1.0.x)
│       ├── OracleKit/         #   shared Swift core (casting, daily, data)
│       ├── Widgets/           #   daily-hexagram widget
│       └── Watch/             #   Apple Watch app + complication
├── docs/                      # architecture, data, LLM, development, macOS + iOS apps
├── .gitea/                    # issue templates for the forge
├── _archiv/                   # earlier attempts — excluded via .gitignore
├── sw.js                      # service worker (offline caching)
├── AGENTS.md                  # conventions for AI coding sessions
├── CONTRIBUTING.md            # contribution notes
├── CHANGELOG.md               # version history
├── SECURITY.md                # security reports
├── LICENSE                    # AGPL-3.0-or-later (code)
├── LICENSE-DOCS               # CC BY-SA 4.0 (docs)
├── README.md                  # this file (English, canonical)
└── README.de.md               # German README
```

## Documentation

| File | Contents |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Module layout, data flow, persistence |
| [`docs/DATA.md`](docs/DATA.md) | Schema of `hexagrams.json` and `trigrams.json` |
| [`docs/LLM.md`](docs/LLM.md) | LLM backends, reasoning modes, CORS troubleshooting |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | Development setup, tests, debugging, release process |
| [`docs/MACOS-APP.md`](docs/MACOS-APP.md) | Building the macOS app, bundle layout, distribution |
| [`docs/IOS-APP.md`](docs/IOS-APP.md) | iOS / iPadOS / Mac-Catalyst app, widgets, watch app, on-device AI |
| [`AGENTS.md`](AGENTS.md) | Conventions for AI-driven sessions |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Contribution notes, PR checklist, commit style |
| [`SECURITY.md`](SECURITY.md) | Security reports, threat model, scope |
| [`CHANGELOG.md`](CHANGELOG.md) | Version history (Keep a Changelog, SemVer) |

## Release history

Full notes per release: [`CHANGELOG.md`](CHANGELOG.md).

| Version | Date | Headline |
|---|---|---|
| [v1.0.0 (App Store)](https://apps.apple.com/app/yijing-i-ching/id6780668644) | 2026-06-20 | **Live on the App Store** — the universal native family (iPhone / iPad / Apple Watch) shipped as v1.0 (build 5): on-device AI interpretation (Apple Foundation Models), on-device meditation images (Apple Image Playground), a daily-hexagram Home-/Lock-Screen widget, and a standalone Apple Watch app with complication. macOS Catalyst deferred. *(iOS 1.0.x line)* |
| [v1.5.0](https://git.jkaindl.de/jkaindl/Yijing/releases/tag/v1.5.0) | 2026-06-01 | **Read-through reference + complete gender-neutral edition** — browse all 64 hexagrams (8×8 index, prev/next, deep links) with their full Wilhelm text, independent of casting; bilingual and register-aware. Every generic gendered person-reference is de-gendered across all dimensions in both DE and EN, verified leak-free; OCR scan artifacts in the source text fixed |
| [v1.4.1](https://git.jkaindl.de/jkaindl/Yijing/releases/tag/v1.4.1) | 2026-06-01 | **Notarized macOS app** — the release DMG is now Developer ID-signed and Apple-notarized, so it launches with no Gatekeeper warning (the old “Open Anyway” / `xattr` workaround is gone). Opt-in signing pipeline in `build-macos-app.sh` (`YIJING_SIGN_IDENTITY` / `YIJING_NOTARY_PROFILE`); README, INSTALL and `docs/MACOS-APP.md` updated for macOS 15/26 Gatekeeper |
| [v1.4.0](https://git.jkaindl.de/jkaindl/Yijing/releases/tag/v1.4.0) | 2026-06-01 | **Data correctness + gender-neutral edition + export repair** — Wilhelm texts re-sourced from Projekt-Gutenberg (filled the empty meanings, restored hexagram 2’s image, added footnotes and the all-lines-moving oracle for hexagrams 1 & 2, removed line-contamination from the image fields, fixed OCR glitches), a gender-neutral text variant on by default with a settings toggle to the verbatim 1924 wording (DE + EN), and a working Markdown/PDF export in the macOS app via a native WKWebView bridge with two PDF modes (print B/W and full-bleed app design) |
| [v1.3.0](https://git.jkaindl.de/jkaindl/Yijing/releases/tag/v1.3.0) | 2026-05-28 | **UI polish + bilingual README** — visible language switcher in the footer, minimalist inline-SVG header icons (Lucide) instead of Unicode glyphs, two-state theme toggle with a state icon. README split into EN (canonical) + DE, app bundle version brought up to 1.3.0 |
| [v1.2.1](https://git.jkaindl.de/jkaindl/Yijing/releases/tag/v1.2.1) | 2026-05-27 | **Patch release** — hero image + `og:image` for social previews, StaticServer connection limit, `serve.py` dead code removed, EN translation spot-check QA (君子 vocabulary consistent as “noble one”, hex 11 + 49 polish) |
| [v1.2.0](https://git.jkaindl.de/jkaindl/Yijing/releases/tag/v1.2.0) | 2026-05-27 | **Bilingual DE/EN** — i18n layer for the entire UI (settings toggle, browser language as default), an independent Wilhelm→EN translation of all 64 hexagrams in Wilhelm’s style. Plus pages-sync script, King Wen sanity test, Open Graph tags, `.editorconfig` |
| [v1.1.1](https://git.jkaindl.de/jkaindl/Yijing/releases/tag/v1.1.1) | 2026-05-25 | **Audit sweep patch** — stream-reader lock fix, HTML-escape hardening, NWListener race removed, path-traversal guard, deterministic data build |
| [v1.1](https://git.jkaindl.de/jkaindl/Yijing/releases/tag/v1.1) | 2026-05-24 | **macOS app without Python** — Swift-internal static server, no more CLT dependency, smaller DMG |
| [v1.0](https://git.jkaindl.de/jkaindl/Yijing/releases/tag/v1.0) | 2026-05-22 | **Initial release** — three-coin method, Wilhelm texts, LLM adapter (Ollama/OpenAI-compatible), PWA, service worker, macOS app build |

## Contributing

Issues, PRs and translations are welcome. Please read
[`CONTRIBUTING.md`](CONTRIBUTING.md) first — there are clear architectural
guardrails (no framework, no build step, no TypeScript). For bug reports
and feature requests there are templates under
[New issue](https://git.jkaindl.de/jkaindl/Yijing/issues/new/choose).

### No build step

Yijing is the seventh attempt after six discarded predecessors (see
`_archiv/`). All earlier attempts foundered in structural over-engineering
— notebook workflows, Pydantic layers, FastAPI wrappers. This attempt is
deliberately different: **vanilla ES modules + native
`<script type="module">` import + static JSON**. When the app grows we
split code; we do not introduce a toolchain.

## Reporting security issues

Please do **not** post security-relevant problems publicly as an issue.
Instead see [`SECURITY.md`](SECURITY.md) — a short path via a DM on the forge or
email.

## License

- **Code:** GNU Affero General Public License v3.0 or later —
  [AGPL-3.0-or-later](LICENSE).
- **Documentation** (`README.md`, `README.de.md`, `CHANGELOG.md`,
  `CONTRIBUTING.md`, `SECURITY.md`, `AGENTS.md`, `docs/`): Creative
  Commons Attribution-ShareAlike 4.0 International —
  [CC BY-SA 4.0](LICENSE-DOCS).
- **Wilhelm translation** in `data/hexagrams.json`: public domain
  (Wilhelm † 1930; public domain in Germany since 2001). When reusing,
  please credit Richard Wilhelm as the source.
- **Commercial license:** the AGPL's copyleft does not fit every use (e.g. a
  closed-source product, or an Apple App Store build, which is incompatible
  with the AGPL). A separate commercial license is available — see
  [`LICENSING.md`](LICENSING.md). *(The maintainer's own official App Store
  builds are distributed under such a separate license; the full source stays
  AGPL here.)* Contributions are covered by the
  [Contributor License Agreement](CLA.md), which keeps this dual-licensing
  option open.

### Why AGPL?

This license choice is not incidental. The AGPL is the legal mechanism
that protects a particular logic: contributions to the commons stay in
the commons — even if someone tries to commercialize them via a network
service.

Unlike permissive licenses (MIT, Apache) or file-level copyleft (MPL),
the AGPL’s network clause (§13) prevents this code from becoming the
foundation of closed, commercially controlled infrastructure. Whoever
runs a modified variant as a network service must make the source code
available to the users of that service.

This is a deliberate decision against maximum distribution and in favor
of theoretical coherence: what was published as a contribution to the
commons should stay in the commons — even if that limits adoption by
actors whose business model rests on re-privatizing those contributions.

yijing has no external code dependencies — no npm, no build step, no
third-party JS libraries. The AGPL obligations apply fully to the shipped
JavaScript code, which is directly inspectable in the browser anyway.
External LLM servers (Ollama, MLX) are called via HTTP API — no code
linking; their licenses apply separately.

## Sources

- Wilhelm, Richard: *I Ging — Das Buch der Wandlungen*, Diederichs, 1924
- Trigram reference data and Chinese designations from standard
  literature and Chinese original sources

## Status

A hobby project after six discarded attempts — see `_archiv/`. This
attempt is deliberately different: lean, dependency-free, local. Works
fully in the browser; the AI connection is optional and intended
exclusively for local servers.

---

<sub>Repository: <https://git.jkaindl.de/jkaindl/Yijing> · Live:
<https://pages.jkaindl.de/yijing/> · Issues:
<https://git.jkaindl.de/jkaindl/Yijing/issues> · Releases:
<https://git.jkaindl.de/jkaindl/Yijing/releases></sub>

# Changelog

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [SemVer](https://semver.org/).

## [Unreleased]

> **Two version tracks.** The legacy macOS AppKit DMG continues on the **1.5.x**
> line; the new universal native family (iOS / iPadOS / Mac Catalyst / watchOS)
> starts independently at **1.0.x**. The skew is deliberate — two separate
> products with separate histories.

### Added

- **Privacy policy** — a standalone, self-contained bilingual `web/privacy.html`
  (DE/EN toggle; both render with JS off), linked from the in-app About section.
  States the actual data behaviour: everything stays on-device, no collection /
  tracking / analytics, on-device AI sends nothing, and the only egress is a
  user-configured BYO endpoint (under that server's own policy). Serves on
  Codeberg Pages, the dev server, and the native WKWebView (no allow-list).
- **Visible "Reflexion, keine Vorhersage" / "Reflection, not prediction"
  disclaimer** (DE/EN) under the AI interpretation and in About — surfaces the
  reflection/study-tool framing that previously lived only in the never-shown
  prompt (App Store 4.3 positioning).
- **iOS App Store export + upload pipeline** — `build-ios-app.sh archive` now
  exports (`app-store-connect`) and uploads to App Store Connect via `altool`,
  driven by a committed `exportOptions.plist`, gated on `YIJING_ASC_ISSUER_ID`
  (the API key `9NPJZ2DPG6` already lives in `~/.appstoreconnect/private_keys/`).
  Without the Issuer-ID it stops at the `.xcarchive` — no account side effects.
  This is the App Store distribution channel, **not** notarization (that
  toolchain is for the macOS AppKit DMG).
- **Compositional on-device interpretation** (`web/ruling.js` + a revised
  `buildCompactPrompt` + the Apple-FM guardrail-safe prompt): the on-device reading
  now applies the classical **Zhu-Xi changing-line rules** (Wilhelm/Baynes scheme)
  to feed only the *governing* source text (e.g. six moving lines → the resulting
  hexagram's judgment, not six line texts; Qian/Kun → the "use the nine/six"
  special), **always names the resulting hexagram (Zielbild)**, and adopts a
  **middle-way tone** that may name shadow or danger as long as it is paired with a
  constructive way forward (no longer flattening everything into the purely
  positive). A new reader line surfaces which rule governs ("Decisive by tradition:
  …", DE/EN). The rule function is pure and node-tested (`scripts/test-ruling.mjs`,
  all cases 0–6 incl. the Qian/Kun special); the sweep corpus gains a 3- and a
  5-moving-line case. BYO/remote endpoints already feed full per-line depth and are
  unchanged.
- **Dev-only prompt test-harness** (`web/sweep.js` + a `DEV_MODE`-gated panel):
  a curated 10-case sweep through the live text/image pipeline (paced against
  the Apple-FM throttle), exporting `{prompt, output, image}` per case to
  `Documents/yijing-test/<run>/` via two new bridge actions
  (`sweepImage`/`sweepFinish`) with one share sheet at the end. The corpus is
  node-verified (`scripts/test-sweep-cases.mjs`); the Documents container is now
  visible in the Files app (`UIFileSharingEnabled`). Never ships in archive
  builds (the `__BUILD__` placeholder keeps `DEV_MODE` off).
- **OracleKit — shared Swift logic core** (`scripts/ios-app/OracleKit/`, a local
  Swift package) consumed by all four native targets: three-coin casting, the
  64-entry King-Wen table, the deterministic daily hexagram, Codable models, the
  JSON loader, App-Group settings, and the language/register text accessors. This
  makes a **third** canonical King-Wen copy (alongside `web/app.js` and
  `scripts/build_data.py`) that must stay in sync. Guarded by a **9-test XCTest
  parity gate** (`swift test` from `OracleKit/`) — King-Wen 64-binary
  completeness (mirrors `scripts/test-kingwen.mjs`), line-state/target logic,
  binary round-trip, cast range, and daily-hexagram determinism + cross-day
  variance.
- **Daily-hexagram widget** (WidgetKit extension) in `systemSmall`, `systemMedium`
  and the three Lock-Screen accessory families (Rectangular / Circular / Inline):
  a six-line SwiftUI figure + name + Judgment Kernsatz, in the app's
  language/register, reloading at local midnight.
- **Standalone watchOS app** — two flows, **Heute** (the deterministic daily
  hexagram + its Judgment) and **Werfen** (a full three-coin cast with changing
  lines, resulting hexagram, Judgment and changing-line texts) — plus a
  **daily-hexagram complication**. Offline, no network, no AI; bundles the full
  DE+EN hexagrams JSON. Embedded in the iOS app so it installs to the paired
  Apple Watch.
- **`yijing://h/<n>` deep link** — a custom URL scheme that opens the reader on
  hexagram `n` (sets the WebView `#h=<n>`), cold-launch safe.
- **App-Group settings bridge** — `app.js` `publishSettings()` posts the active
  language/register to the native shell, which writes them into the App-Group
  defaults and reloads widget timelines, so widgets and watch follow the app's
  language/register.
- **`scripts/build_widget_slice.py` → `data/widget-hexagrams.json`** — a slim
  per-hexagram data slice (number/binary/both names + Judgment Kernsatz, both
  languages × both registers) for the widget/complication memory budget. Its
  Kernsatz trimming mirrors OracleKit `Texts.judgmentLead`.
- **On-device AI in the native app** — interpretation via Apple Foundation
  Models (served through the loopback OpenAI shim, so `web/llm.js` is unchanged)
  on eligible hardware, falling back to BYO/remote endpoints otherwise; and an
  optional per-reading **meditation image** generated fully on-device via Apple
  Image Playground (foreground-only, eligible hardware only).
- **iOS app scaffold** (`scripts/ios-app/`) — the start of the native iOS/iPadOS
  App Store build (roadmap #6). A UIKit WKWebView shell that bundles the web app
  over a loopback server (ported from the macOS app) plus an on-device LLM exposed
  as a loopback OpenAI endpoint, so `web/llm.js` is consumed unchanged. Ships a
  runnable web-shell + mock-AI path; the real llama.cpp engine + model integration
  is a documented skeleton for on-device wiring. Not yet built/shipped — see the
  scaffold README and the design spec. Engine = llama.cpp (not Apple Foundation
  Models: 4096-token window + divination guardrails); model = Qwen3-4B (Apache-2.0).
- **Discoverable AI-interpretation setup on devices without a local LLM.** When
  no endpoint is configured (a phone, the hosted https site), the interpretation
  section now shows a subtle, purely informational setup card — a short
  explainer plus "Set up in settings" and a "Guide" link — instead of vanishing
  entirely. No active interpret button, so it stays cleanly degraded (the casting
  oracle and reference reader remain fully functional offline). This is the
  keystone for app-store readiness: stores require the LLM feature to degrade
  gracefully rather than ship visibly broken on an LLM-less machine.
- **Remote-endpoint guidance** (`docs/LLM.md`): how to reach a model server from
  mobile / the hosted site over https (`tailscale serve` example); any
  OpenAI-compatible https endpoint plugs in unchanged.

### Changed

- **Mood-aware meditation image scene.** The atmosphere modifier is now drawn
  from a mood-consistent pool per hexagram (dark hexagrams avoid warm/sunny
  modifiers, bright ones avoid cold/wintry), the resulting (change) motif is
  phrased as a background element rather than a fused transition, and the native
  last-resort fallback is mood-aware so a refused dark scene can no longer cascade
  into a sunny meadow. Hex 29's motif was reworded to a renderable "deep gorge"
  (Image Playground refused "a dark river between steep cliffs"). *Honest scope:
  on-device device sweeps confirmed the gross error is gone — Hex 29 now renders
  its gorge, not a meadow — but Image Playground's sketch style renders brightly
  regardless, so the modifier only nudges mood; truly dark imagery is a renderer
  ceiling, not a prompt-assembly fix. Background phrasing keeps both motifs in
  roughly half the change readings; small/hard background motifs still drop.*
- **On-device refusal retry reframes; sharper key message** (Apple FM). The
  `FoundationModelsEngine` retry now reinforces the literary-commentary framing
  on its *second* attempt, giving a deterministic content refusal (e.g. the
  benign Hexagram 22 "Anmut" case) a chance to clear — the prior retry only ever
  helped transient throttles, since it re-sent an identical input. It runs only
  after the first attempt already refused before emitting a token, so it cannot
  regress a working request. The guardrail-safe prompt (+ the `literary` web
  preset mirror) sharpens the "Kernbotschaft / Key message" into a distinct
  maxim — *not* a summary of the other sections — to reduce the Impuls↔Kernbotschaft
  overlap. Both are prompt/engine bets that **must be validated on a device**.
- **Target versions derive from `project.yml`.** All four iOS-family
  `Info.plist`s now read `CFBundleShortVersionString` / `CFBundleVersion` from
  the `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` build settings, so a
  version bump is a single edit in `project.yml` and the targets stay in
  lockstep by construction (verified: a simulator build resolves all four
  bundles to 1.0.0 / 1).
- **Auto-discovery is now https-aware.** The localhost endpoint probes only run
  on `http` origins (the macOS app's loopback server, the dev server — and, later,
  an on-device loopback LLM in a native mobile shell). On `https` origins they are
  skipped, avoiding pointless mixed-content requests and console errors.
- **Interpretation visibility is now reactive** — it updates after auto-discovery
  and after adding/removing an endpoint in settings, instead of only on the next
  cast.

### Security

- **`markdown.js` `escapeHTML()` now also escapes `"` and `'`** — a stored-XSS
  hardening so an untrusted LLM Markdown link URL can no longer break out of an
  `href` attribute into a live event handler.
- **`app.js` `escapeHTML()` now also escapes `"` and `'`** — the same
  defense-in-depth on the app's own escaper (BYO-LLM output is user-controlled).
  Harmless in text nodes; correct if escaped output ever lands in an attribute.

### Fixed

- **JS dialogs in the native app** — the WKWebView had no `WKUIDelegate`, so
  `window.confirm/alert/prompt` were silently suppressed: "Verlauf löschen" /
  "Clear history" (and endpoint/preset removal) did nothing, and presets could not
  be named. `WebViewController` now provides native `UIAlertController` panels and
  sets `webView.uiDelegate`, so all five dialog call sites work on device/Catalyst.
- **watchOS app icon** — `YijingWatch` shipped without an asset catalog, so an
  App Store build validation would reject it ("Missing App Icon"). Added
  `Watch/Assets.xcassets` (single 1024px source, no alpha — the same brand mark
  as the phone app) and wired it into the target (`ASSETCATALOG_COMPILER_APPICON_NAME`).
  The embedded `YijingWatch.app` now carries `Assets.car` (AppIcon) and a
  `CFBundleIcons` Info.plist key.
- **`build-ios-app.sh watch` mode** — dropped the explicit `-sdk watchsimulator`,
  which made the iOS-only `YijingWidgets` extension link the watchOS build of
  OracleKit (`ld: building for iOS-simulator, but linking object built for
  watchOS-simulator`). `-destination` now resolves each target's platform, the
  same way the simulator/archive/device modes already do.
- **Web a11y/WCAG pass** — `aria-live` status region, focus management, AA
  contrast bumps, `prefers-reduced-motion`, a shared `:focus-visible` ring,
  aria-labels and `lang` attributes.
- **Streaming-markdown render coalesced** O(n²) → O(n) via `requestAnimationFrame`.
- **Cast/re-cast generation-token race guard** — a stale cast can no longer
  overwrite a newer one.
- **Native robustness** — an inline error label instead of a `UIAlertController`
  from `viewDidLoad`, a bounded LocalServer wait (soft-fail instead of a watchdog
  kill), and `LLMService` errors logged via `os_log` instead of streamed as raw
  Swift errors into the SSE content.

- **AI-interpretation placeholder localized** — the empty-state hint ("Pick an
  endpoint + model and click Interpret") was hardcoded in German in `style.css`
  and showed in English mode too. It now follows the UI language via an
  i18n-driven `data-placeholder` attribute read by CSS `content: attr(...)`.
- **Mixed-content warning when adding an endpoint** — entering a plain `http://`
  endpoint (other than localhost) on an https page now shows a non-blocking
  warning that a secure page cannot reach it.

## [1.5.0] — 2026-06-01

### Added

- **Nachschlagewerk / read-through reader** — a new in-app mode to browse all 64
  hexagrams in King-Wen order, independent of casting. An 8×8 index grid,
  previous/next navigation, deep links (`#h=<n>`), and the full Wilhelm text per
  hexagram: judgment, image, meaning, trigrams, **all** line texts +
  interpretations, and footnotes. Bilingual (DE/EN) and register-aware
  (neutral/historical) through the existing toggles, rendered with the same
  components as a reading. Reached via a segmented "Oracle / Reference" control
  at the top of the page (`review.html` was its seed; see Sub-project C).
- **Gender-neutral edition completed to full coverage.** Every generic,
  gender-implying reference to a *person* (the everyman / the querent) is now
  de-gendered across all dimensions — judgment, image, meaning, all 386 line
  texts + interpretations, and notes — in both DE and EN. This extends beyond the
  role nouns the regex pass caught to the generic pronouns that follow them
  (DE pronouns agree with the neutral noun, generic everyman "er" recast to
  "man"/plural; EN singular *they*). Generated and pronoun-polished per hexagram,
  then verified by an adversarial leak/fidelity audit — zero residual generic
  gendered person-references in the neutral register, content otherwise
  unchanged. Content-specific gendered figures (the marrying maiden, the
  Father/Mother/Son/Daughter trigram roles, kings, dragons) are preserved
  verbatim. Coverage is per language (German and English gender differently), and
  stored as overrides only where they differ from the historical base.

### Fixed

- **OCR scan artifacts in the public-domain Wilhelm source** surfaced by the
  read-through audit (digit-for-letter glitches): `a1s`→`als`, `al1er`→`aller`,
  `al1mählich(en)`→`allmählich(en)`, `gänz1ich`→`gänzlich`, `p9egen`→`pflegen`,
  `tei1s`→`teils` across hexagrams 5/7/16/22/32/37/48/50/52/54/56/58/59/60/64.
  Added to the `scrape_gutenberg.py` OCR fix-map so re-scrapes stay clean, and
  carried into `gutenberg_iging.json` and the built data.

### Changed

- **`test-kingwen.mjs` register check** — replaced the DE⟺EN neutral-parity
  assertion (linguistically wrong: German's impersonal "man" is neutral, English
  "he" is not, so coverage is legitimately asymmetric) with a per-language
  integrity check: every stored `*_neutral` must be non-empty and actually differ
  from its base, catching redundant identical overrides.

## [1.4.1] — 2026-06-01

### Added

- **Developer ID signing + Apple notarization pipeline** for the macOS app,
  opt-in via the `YIJING_SIGN_IDENTITY` / `YIJING_NOTARY_PROFILE` environment
  variables on `scripts/build-macos-app.sh`. It runs the whole chain in the one
  correct order (sign → notarize → staple the `.app`, rebuild the `.dmg` from the
  stapled app, sign → notarize → staple the `.dmg`, then `stapler`/`spctl`
  verification). Without the variables the build stays unsigned, unchanged. The
  app is signed **without an entitlements file** — Hardened Runtime is a signing
  flag, the app is not sandboxed, and its loopback `NWListener` + WKWebView need
  no entitlement keys. See `docs/MACOS-APP.md`.

### Changed

- **`INSTALL.txt` now leads with the notarized happy path** (drag, double-click,
  done); the Gatekeeper "Open Anyway" steps are demoted to an "un-notarized
  builds only" fallback. `docs/MACOS-APP.md` updated for macOS 15/26 Gatekeeper
  (the Control-click → Open bypass for un-notarized apps is gone).
- **README (EN + DE) and `SECURITY.md` no longer document the Gatekeeper
  "Open Anyway" / `xattr` workaround** — release DMGs are now notarized and
  open without a warning.

## [1.4.0] — 2026-06-01

### Added

- **Gender-neutral text variant, on by default**, with a *register* toggle in
  the settings (DE + EN). Generic role nouns are de-gendered ("der Edle" → "die
  edle Person", with matching pronouns); content-specific imagery (the marrying
  maiden, the Father/Mother trigrams, the dragons) is preserved. The verbatim
  Wilhelm 1924 wording stays one click away ("Historisch"). Stored as
  `*_neutral` / `*_en_neutral` overrides; produced by `scripts/neutralize.py`
  (deterministic regex) + an LLM polish, applied by `scripts/apply_neutral.py`.
- **Working Markdown / PDF export in the macOS app** via a native WKWebView
  bridge (`WKScriptMessageHandler`): Markdown through `NSSavePanel`, PDF through
  `WKWebView.createPDF`. Previously both buttons were dead — WKWebView supports
  neither `window.print()` nor `<a download>` blobs.
- **Two PDF modes** (one button + a small menu): **Print (B/W)** and
  **App design** (full-bleed, mirrors the active theme).
- **Footnotes** ("Anmerkungen") per hexagram, and the all-lines-moving oracle
  ("use the nine / use the six") for hexagrams 1 & 2.

### Changed

- **Wilhelm texts re-sourced from Projekt-Gutenberg** as the canonical 1924
  edition (`scripts/scrape_gutenberg.py` → committed source asset). Texts now
  render as real paragraphs instead of one pre-wrapped string.

### Fixed

- Empty `meaning` for hexagrams 17/25/47/48/53/56 and the missing hexagram 2
  image are restored; OCR glitches corrected; the changing-lines section that
  had leaked into several `image` fields is removed (now only in `lines`).
- The reading question was silently dropped from the printed PDF.
- History list: the question column collapsed to one word per line.

## [1.3.0] — 2026-05-28

### Added

- **Language switcher in the footer** — adaptive link that switches to the
  respective other language and is labeled *in* that language
  (German UI → "English version", English UI → "Deutsche Version").
  Makes the language switch discoverable without first having to go into
  the settings modal. Uses the existing `applyI18n` mechanism for the text
  swap.

### Changed

- **Header icons as inline SVG** (Lucide, ISC — embedded as markup,
  no npm dependency): gear for settings, sun/moon for the theme,
  `stroke=currentColor` inherits theme and hover color. Replaces the
  previous Unicode glyphs (`⚙`/`◐`), which render inconsistently depending
  on font/platform.
- **Theme toggle is now 2-stage** (Light↔Dark instead of a 3-stage cycle).
  The icon shows the currently visible state (moon = dark,
  sun = light), the tooltip describes the click action. "Follow system"
  remains the initial default on the first visit, but is no longer actively
  selectable afterwards.
- **Settings: language section moved to the first position** in the modal.
- **README split bilingually** — `README.md` is now the
  canonical English version (OSS convention; Codeberg renders
  `README.md` by default), the German version lives in `README.de.md`.
  Language-switch line at the top of both files.

### Fixed

- **App bundle version** (`scripts/macos-app/Info.plist`):
  `CFBundleVersion` + `CFBundleShortVersionString` had been at `1.0` since
  v1.0 and were never updated for the releases. Now set to `1.3.0` —
  the DMG app finally reports its real version.

## [1.2.1] — 2026-05-27

### Added

- **Hero image for social preview** (`web/assets/og-image.png`, 1200×630):
  stylized hexagram 1 + 易經 on a dark background with the app theme
  accent color. `og:image` + `twitter:image` linked as absolute URLs,
  Twitter card set to `summary_large_image`. SVG source versioned in
  `web/assets/og-image.svg`. Also embedded centered as the README hero.

### Changed

- `scripts/macos-app/StaticServer.swift`: **connection limit (max 32
  parallel)** plus a central `finishConnection()` for cleanup —
  closes a theoretical local-process flood vector (low real-world
  risk; loopback-only + single-user, but a cleaner hygiene state).
  A comment on `receiveRequest` explains why the callback-based
  "recursion" is not real stack growth.
- `scripts/serve.py`: **dead code removed** — `_watch_parent()` plus
  the `threading`/`time` imports gone. The function was for the old
  Python-backend variant of the macOS app (before v1.1). Since v1.1 the
  app is fully Swift-internal (`StaticServer.swift`), no more Python
  subprocess → `YIJING_PARENT_PID` is no longer set anywhere.
  SPDX header and a more precise module docstring added.

### Fixed

- **EN translation — spot-check QA patches** in `data/hexagrams.en.json`:
  - **Vocabulary consistency for 君子 (the noble one):** 41 occurrences
    "superior man" → "noble one". Subagent batches 25–32, 33–40 and
    49–56 had translated inconsistently; the file looked patched
    together. Now uniformly "noble one" everywhere.
  - **Hex 11 image_en — meaning miss:** "Himmelsrichtungen"
    had been translated to "regions of heaven" (cosmological spheres)
    instead of "cardinal directions" (compass directions).
  - **Hex 11 image_en — redundancy/tone:** "Heaven and earth
    stand in intercourse" to "come together and unite their effects"
    (the word intercourse today is almost only sexually connotated; right
    after "Heaven and earth unite" it came across as unintentionally comic).
  - **Hex 11 judgment_en:** "hold the rule in hand" → "hold the reins
    of power" (English idiom).
  - **Hex 49 judgment_en:** "On your own day, then you are believed"
    → "On your own day you are believed" (unmotivated "then" removed).
  - **Hex 49 line 3 text_en:** "talk of revolution has gone round
    three times" → "talk of the revolution has been heard three times"
    (colloquial-modern → dignified-archaic).
  - **Hex 49 line 5 interp_en — Germanism:** "the people fall to
    him quite of their own accord" → "give him their allegiance of
    their own accord" (literal "fall" → idiomatic giving of allegiance).

## [1.2.0] — 2026-05-27

### Added

- **English hexagram texts** — `data/hexagrams.en.json` with parallel
  `*_en` fields (`name_en`, `meaning_en`, `judgment_en`, `image_en`,
  `image_association_en`, per line `position_en`/`text_en`/
  `interpretation_en`). Complete: 64/64 hexagrams, 384/384 lines.
  Translated with Claude Opus 4.7 from the German Wilhelm original
  in parallel across eight subagents — Wilhelm style preserved, classical
  I Ching vocabulary in standard English form (the superior man, the
  great man, the noble, the abyss, etc.), paragraph structure 1:1. Source
  is public domain (Wilhelm 1924), translation under AGPL-3.0-or-later.
- `scripts/test-kingwen.mjs` extended with EN JSON structure checks —
  verifies `number`/`binary` consistency with the DE source and field
  symmetry (for every non-empty DE field, `*_en` must exist).
- `docs/DATA.md` section "English variant" with schema description
  and a generation note.

- **English UI** — full i18n layer with a DE/EN language toggle
  (`web/i18n.js`). Language selection in the settings modal, persisted in
  `localStorage["yijing-language-v1"]`, default = browser language (en → EN,
  everything else → DE). Takes effect immediately on all UI strings, date
  formats, Markdown export headers and the LLM system prompt default
  (two variants in `web/llm.js`). Hexagram texts are lazily loaded from
  `data/hexagrams.en.json`, with a transparent fallback to
  `data/hexagrams.json` as long as the English translation does not yet
  exist (Phase B). HTML annotated with `data-i18n*` attributes,
  an inline boot script sets `<html lang>` before the first paint.

- [`SECURITY.md`](SECURITY.md): security reporting channels, threat model,
  scope, what belongs in it and what does not.
- [`.gitea/issue_template/`](.gitea/issue_template/): YAML templates for
  bug report and feature proposal plus `config.yaml` with contact links
  to SECURITY and README. Takes effect automatically when creating new
  issues via Codeberg.
- [`scripts/test-kingwen.mjs`](scripts/test-kingwen.mjs): sanity test
  for the King Wen lookup tables — verifies `BINARY_TO_KING_WEN` (JS),
  `KING_WEN_BINARY` (Python) and `data/hexagrams.json` for consistency
  and mutual inversion. Pure Node, no test-framework
  dependency. Invocation: `node scripts/test-kingwen.mjs`.
- [`scripts/sync-pages.sh`](scripts/sync-pages.sh): automated
  sync from `main` to `pages` (worktree creation, web→root mirroring,
  path patches `../data/` → `data/` and `../sw.js` → `sw.js`,
  commit + push with SSH retry). Replaces the manual worktree sed
  choreography.
- [`.editorconfig`](.editorconfig): IDE-consistent indentation,
  UTF-8, LF, trim trailing whitespace (Markdown excepted).
- `web/index.html`: Open Graph + Twitter card meta tags for social
  preview. `og:image` is intentionally not yet set — as soon as a
  hero image exists, add it there as an absolute URL.

### Changed

- README completely reworked — extended badge row (Platform,
  PWA, Build), table of contents, Mermaid reading flow, release
  history table with tag links, dedicated "Report security" and
  "Why no build pipeline?" sections, repo footer.
- `CONTRIBUTING.md` extended with local setup, issue-template note,
  license clause for contributions, reference to `SECURITY.md`, extended
  PR checklist (macOS app build, Pages sync note).
- Codeberg repo metadata via API: description made more precise, website set
  to the Pages URL, topics (20 of them: yijing, iching, i-ging, oracle,
  divination, hexagram, wilhelm, static-site, pwa, offline-first,
  vanilla-js, zero-dependency, ollama, mlx, local-llm, macos-app,
  swift, service-worker, german, agpl).

## [1.1.1] — 2026-05-25

### Fixed

- `web/llm.js`: the stream reader is now released in a `finally` block.
  When quickly "canceling" and immediately restarting the
  interpretation, `ReadableStream is locked` could otherwise occur
  (Ollama- and OpenAI-compatible path).
- `scripts/macos-app/StaticServer.swift`: explicitly waits at startup
  for the `NWListener` state `.ready`. Previously the WebView could in
  rare cases load against a port that had not yet come up.
- `scripts/build_data.py`: deterministic selection among equally long
  image-association prompts (previously dependent on set iteration).

### Changed

- Various hardenings without visible behavior change: full
  HTML escaping at all `innerHTML` sites in `app.js`, quota protection
  for `localStorage` writes, focus management in the `<dialog>`
  fallback path, WKWebView scheme allowlist, clearer path-traversal
  guard in the Swift server, atomic write and better error
  messages in `build_data.py`.
- `scripts/serve.py` now binds explicitly to `127.0.0.1` instead of on
  all interfaces, and uses `directory=` instead of `os.chdir()`.
- SPDX header (AGPL-3.0-or-later) added to `web/app.js` and `web/llm.js`;
  `LICENSE-DOCS` scope explicitly extended with `CHANGELOG.md`,
  `CONTRIBUTING.md` and `AGENTS.md`.

## [1.1] — 2026-05-24

### Changed

- macOS app: Python backend (`serve.py`) replaced by a Swift-internal
  static server (Network.framework / `NWListener`). The app
  now needs **no system Python and no Command Line Tools**
  anymore — users without Python can install and start it,
  without triggering Apple's 700 MB–3 GB CLT download. Bundle layout
  simplified: `Resources/web/`, `Resources/data/`, `Resources/sw.js`
  directly instead of the subfolder `Resources/yijing/…`. DMG has become
  smaller (3.0 MB instead of 3.7 MB).
- Web UI: macOS app note moved out of the prominent header block into a
  subtle footer line; the detailed Gatekeeper instructions
  remain in the README and `INSTALL.txt` in the DMG.
- README: shields.io badges (`for-the-badge`) for download and
  live demo instead of a simple Markdown link.

## [1.0] — 2026-05-22

### Added

- Initial static-site build with the three-coin method
- Wilhelm translation of all 64 hexagrams incl. the Judgment, the Image,
  meaning, changing lines (taken from `_archiv/Yijing_6`)
- Chinese characters + Pīnyīn per hexagram
  (from `_archiv/yijing_5`)
- Trigrams as master data with family, nature, season, cardinal direction
  (from `_archiv/yijing_5`)
- Image associations for 19 hexagrams (from `_archiv/yijing_3`)
- LLM adapter for Ollama (native API) and OpenAI-compatible (MLX, LM
  Studio, vLLM, OpenClaw)
- Streaming response with separate reasoning/thinking display
- Auto-discovery of typical local LLM endpoints on first start
- Reasoning toggle (on/off/auto) per endpoint + override per reading
- "Test reasoning" button in the settings modal
- Markdown rendering of the LLM response (own small parser)
- History in localStorage, individual readings linkable via URL hash
- Markdown export of the reading
- Print-friendly PDF layout via `@media print`
- Dev server with `Cache-Control: no-store`
- Documentation: `docs/ARCHITECTURE.md`, `docs/DATA.md`, `docs/LLM.md`,
  `docs/DEVELOPMENT.md`, `AGENTS.md`, `CONTRIBUTING.md`,
  `LICENSE` (AGPL-3.0-or-later), `LICENSE-DOCS` (CC BY-SA 4.0)
- PWA support: web app manifest, icon set (favicon, Apple touch
  icon, maskable icons), theme color — the site is installable and
  gets a home-screen/dock icon
- Offline operation via service worker (network-first) — the app loads
  and runs after the first visit without internet
- Theme switcher (Dark / Light / System) in the header, the selection is
  kept in localStorage
- macOS app (`scripts/build-macos-app.sh`): bundles the oracle as a
  double-clickable `Yijing.app` — native Swift app with its own window
  (WKWebView), opens independently instead of as a browser tab

### Known issues

- Auto-discovery only tries three fixed URLs. Custom local endpoints
  (e.g. differing ports) must be created manually.
- Image associations are only available for 19/64 hexagrams.
- History entries from before the version with UUID cannot be retrieved
  via link (old entries in the history without `id`).

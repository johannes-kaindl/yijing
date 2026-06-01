# Changelog

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [SemVer](https://semver.org/).

## [Unreleased]

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

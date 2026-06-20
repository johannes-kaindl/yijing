# iOS / iPadOS / Mac Catalyst app (+ watchOS)

The Yijing oracle also ships as a **universal native app** for the App
Store — one project that builds for iPhone, iPad and Mac (via Mac
Catalyst), plus a companion **watchOS** app and widgets. It hosts the
same web app in a `WKWebView` served by a **Swift-internal loopback
server**, and adds **on-device AI interpretation** through an in-process
engine exposed as an OpenAI-compatible endpoint — so `web/llm.js` is
consumed **unchanged**. No browser, no Python, no command-line tools on
the user's side.

> **Live on the App Store** (iPhone / iPad / Apple Watch):
> <https://apps.apple.com/app/yijing-i-ching/id6780668644>. macOS Catalyst is
> the deferred long-term Mac path, not part of the published listing.

This is a separate track from the legacy AppKit macOS app (see [macOS
app](MACOS-APP.md)). The two carry **independent version lines** — the
AppKit DMG is `1.5.x`, this universal family **shipped to the App Store at
`1.0.x`**. The skew is a decision, not drift. Long-term the **Mac Catalyst**
build here (`build-ios-app.sh catalyst`) is **still slated to** supersede the
AppKit app (deferred, not yet shipped).

The build components live versioned under `scripts/ios-app/`. There is
**no committed `.xcodeproj`** — it is generated from `project.yml` by
XcodeGen.

## Positioning

- **Web app / PWA** — the served origin; the shared truth.
- **Legacy macOS AppKit app** — `Yijing.app` / `Yijing.dmg`, self-distributed.
- **Universal native family** (this doc) — iOS 17 / iPadOS / Mac Catalyst 14
  + watchOS 10. **Live on the App Store** (iPhone / iPad / Apple Watch; Mac
  Catalyst deferred).

The Mac Catalyst build is verified to run natively (arm64), serve the web
UI on the loopback port, and reach Apple Foundation Models on macOS 26
hardware — the same single product record as iOS, one bundle id.

## Architecture

```
WKWebView  ──http──►  LocalServer (NWListener, loopback)
(web/llm.js)            ├── GET  /web/… , /data/…        → bundled web app + data
                        ├── GET  /v1/models             → model list
                        └── POST /v1/chat/completions   → SSE token stream
                                                              │
                                                  LLMService → EngineSelector
                                                       ├── FoundationModelsEngine (default, eligible)
                                                       ├── BYO/remote endpoint   (ineligible fallback)
                                                       └── LlamaCppEngine        (GGUF skeleton)
```

- The shell mirrors `scripts/macos-app/` — `LocalServer` is the macOS
  `StaticServer` extended with POST-body reading + the `/v1` SSE routes.
- Same port → same-origin fetches, so ATS is satisfied by
  `http://localhost` and the web layer needs no change.
- On eligible devices the on-device endpoint is injected so the web app
  auto-selects it; on ineligible devices nothing is injected → the web
  app's "set up AI" card + BYO-endpoint path take over.

Build/test status, the on-device verification checklist, and the
engine/model and App-Review rationale live in
`scripts/ios-app/README.md`.

## The XcodeGen project (`project.yml`) — five targets

Five targets, generated into `Yijing.xcodeproj` at build time:

| Target | Type | Bundle id | Notes |
|---|---|---|---|
| **Yijing** | application (iOS + macCatalyst) | `page.codeberg.jkaindl.Yijing` | the WKWebView shell + loopback shim |
| **YijingWidgets** | WidgetKit app-extension | `…Yijing.widgets` | daily-hexagram widget |
| **YijingWatch** | watchOS application | `…Yijing.watchkitapp` | Heute / Werfen; embedded (`embed: true`) |
| **YijingWatchWidgets** | watchOS app-extension | `…Yijing.watchkitapp.widgets` | daily-hexagram complication |
| **OracleKit** | local Swift package | — | the single shared logic core |

`supportedDestinations: [iOS, macCatalyst]` on the app means the same
target builds the Catalyst Mac app. `MARKETING_VERSION 1.0.0` /
`CURRENT_PROJECT_VERSION 1` are set in `project.yml` `settings.base`.
`DERIVE_MACCATALYST_PRODUCT_BUNDLE_IDENTIFIER: NO` keeps one bundle id
across iOS and Mac.

## OracleKit — the shared Swift core

`scripts/ios-app/OracleKit/` is a **local Swift package**, the single
logic core consumed by all four other targets (platforms iOS 17 /
macCatalyst 17 / watchOS 10 / macOS 14). Files under
`Sources/OracleKit/`:

| File | Responsibility |
|---|---|
| `Casting.swift` | three-coin cast + the 64-entry King-Wen binary→number table |
| `Daily.swift` | deterministic daily hexagram = stable hash of the LOCAL `yyyy-MM-dd`, `%64+1` (identical across app/widget/watch by construction); `nextMidnight()` for reloads |
| `Models.swift` | `Codable` models mirroring the JSON schema |
| `DataStore.swift` | JSON loader |
| `Settings.swift` | App-Group settings (`OracleSettings.current()`) |
| `Texts.swift` | language/register text accessors incl. the Judgment "Kernsatz"/lead trimming via `judgmentLead` |
| `SlimData.swift` | widget-slice loader |

### Parity gate (tests)

`Tests/OracleKitTests/` holds **9 XCTest** across `CastingTests.swift`
and `DailyTests.swift`: King-Wen 64-binary completeness (mirrors
`scripts/test-kingwen.mjs`), line-state/target logic, binary round-trip,
cast value range, and daily-hexagram determinism + cross-day variance.
Run from `scripts/ios-app/OracleKit/`:

```bash
swift test
```

This is the **gate** proving the Swift King-Wen port is bit-identical to
the web `app.js` `BINARY_TO_KING_WEN` and `scripts/build_data.py`
`KING_WEN_BINARY`.

### THREE King-Wen copies must stay in sync

There are now three canonical King-Wen tables that **must not diverge**:

1. `web/app.js` — `BINARY_TO_KING_WEN`
2. `scripts/build_data.py` — `KING_WEN_BINARY`
3. `OracleKit/Sources/OracleKit/Casting.swift`

The `swift test` gate is what keeps copy #3 honest against #1/#2.
Separately, `Texts.judgmentLead` mirrors the Kernsatz trimming in
`scripts/build_widget_slice.py` — those two must also stay in sync.

## Building (`build-ios-app.sh`)

```bash
scripts/ios-app/build-ios-app.sh            # SIMULATOR (default; no signing; AI = MockEngine)
scripts/ios-app/build-ios-app.sh catalyst   # native Mac (Mac Catalyst; no signing)
scripts/ios-app/build-ios-app.sh watch      # watchOS Simulator (scheme YijingWatch)
scripts/ios-app/build-ios-app.sh archive    # App-Store archive (Release)
scripts/ios-app/build-ios-app.sh device     # Development build → sign → install/launch on a device
```

Prerequisites: **full Xcode + iOS SDK** (the Command Line Tools alone do
not build iOS) and `brew install xcodegen`.

The build embeds the **committed** repo state — it stages `web/`,
`data/`, `sw.js` via `git archive HEAD`, so **commit before building**;
uncommitted edits deliberately do not end up in the app.

Signing is opt-in via environment variables, mirroring the macOS build:

- `YIJING_TEAM_ID` — **required** for `archive` and `device` (Apple
  Developer Team ID).
- `YIJING_DEVICE_ID` — optional UDID; with it, `device` also installs and
  launches on the connected device via `xcrun devicectl`.

The first `device` run mints the iOS "Apple Development" cert + profile
and registers the device (`-allowProvisioningUpdates`
+ `-allowProvisioningDeviceRegistration`). The `archive` mode leaves the
`__BUILD__` placeholder untouched, so the dev tooling / build badge stay
disabled in App-Store builds.

### Critical: do NOT pass an explicit `-sdk`

The `simulator`, `archive` and `device` `xcodebuild` invocations rely on
`-destination` to drive each target's platform, so the **embedded
watchOS app builds for watchOS**. Forcing `-sdk iphoneos` builds the
watch app for iOS and breaks it (`WatchKitAppInvalidUIDeviceFamily` /
wrong `CFBundleSupportedPlatforms`). Only the standalone `watch` mode
uses `-sdk watchsimulator`.

## App Group, settings bridge, deep link

**App Group** `group.page.codeberg.jkaindl.Yijing` is shared by all four
entitlements files (`Resources/`, `Widgets/`, `Watch/`,
`WatchWidgets/`). Each App ID must be assigned the group **individually**
in the Apple Developer Portal — auto-signing creates the App IDs but does
not assign the group.

**Settings bridge.** `web/app.js` `publishSettings()` posts
`{action:'settings', language, register}` over
`window.webkit.messageHandlers.yijing` on `i18n:changed`, on register
change, and at load. `WebViewController` writes both into the App-Group
`UserDefaults` and calls `WidgetCenter.reloadAllTimelines()`. OracleKit's
`OracleSettings.current()` reads them with a device-locale + neutral
fallback. `app.js` must keep posting this so the widgets/watch follow the
app's language/register.

**Deep link.** `yijing://h/<n>` (a `CFBundleURLTypes` scheme in
`Resources/Info.plist`) → `AppDelegate.application(open:)` →
`WebViewController.openHexagram(n)` → WebView `location.hash = '#h=<n>'`
(the reference reader on hexagram n). Cold-launch safe via a deferred
`pendingHexagram` until the page's `didFinish`. This is distinct from the
web-only `#r=<uuid>` history links.

## On-device AI engine

`Sources/FoundationModelsEngine.swift` is the **default** engine — Apple
Foundation Models ("Apple Intelligence"), the on-device ~3B model on
eligible hardware (iOS 26+, A17 Pro+ class). It is served through the
loopback OpenAI shim (`GET /v1/models`, `POST /v1/chat/completions` SSE),
so `web/llm.js` works unchanged.

An `EngineSelector` picks FM when the device is eligible; ineligible
devices fall back to the existing **BYO/remote** local-LLM endpoints
(Ollama / MLX / LM Studio).

Constraints, surfaced honestly:

- **4096-token context window** — worst-case prompts (e.g. all six
  changing lines + resulting hexagram) can approach it; overflow is
  caught and surfaced.
- **Non-disableable content guardrails** that can refuse the darker
  I-Ching themes. A built-in literary-commentary reframing (DE/EN) cuts
  refusals sharply, but a small residual of the heaviest texts refuses
  consistently. Refusals are handled **gracefully** — a clean error, with
  the option to switch to a remote endpoint, not a crash or a hung
  spinner.

A `llama.cpp` + GGUF path (`Sources/LlamaCppEngine.swift`) exists as a
**documented fallback skeleton** (throws until wired) for users who want
100% on-device coverage / no guardrails, at the cost of the model
download. Wiring steps are in `scripts/ios-app/README.md`.

## On-device meditation image

`Sources/ImageGenerator.swift` generates an optional per-reading
**meditation image** fully on-device via Apple **Image Playground**
(`ImageCreator`), iOS / Catalyst 18.4+, eligible hardware only. It is
**foreground-only** (`backgroundCreationForbidden`) with a retry-once.
The web layer shows the button only when `isAvailable`. This
foreground-only constraint is exactly **why a meditation-image widget is
out of scope** (see below).

## Widgets (YijingWidgets)

Daily-hexagram widget for iPhone / iPad / Mac in five families:
`systemSmall`, `systemMedium`, and the three Lock-Screen accessory
families `accessoryRectangular` / `accessoryCircular` / `accessoryInline`.
It renders a six-line SwiftUI hexagram figure + name + the Judgment
Kernsatz, in the app's language/register. The timeline reloads at **local
midnight** (`Daily.nextMidnight()`).

The widget bundles **only** the slim `data/widget-hexagrams.json` slice
(~26 KB) — the memory budget forbids the full corpus. Tapping it opens
the app on that hexagram via the `yijing://h/<n>` deep link. No AI: it is
offline by design.

## watchOS app (YijingWatch) + complication

Two flows, no network:

- **Heute** — the deterministic daily hexagram + its Judgment.
- **Werfen** — a full three-coin cast with changing lines, the resulting
  hexagram name, Judgment, and changing-line texts.

No AI, no Image / Meaning / Trigram sections — these live in the app
foreground. The watch app bundles the **full** DE+EN hexagrams JSON
(`hexagrams.json` + `hexagrams.en.json`) for offline on-wrist readings.
It is embedded in the iOS app (`embed: true`), so it installs to the
paired Apple Watch.

**YijingWatchWidgets** is the daily-hexagram **complication** (accessory
`Inline` / `Rectangular` / `Circular`, plus `accessoryCorner` guarded
behind `#if os(watchOS)`). It bundles only the slim slice.

## App-Store compliance (shipped in v1.0)

v1.0 (build 5) passed App Review and is live. The configuration that got it
accepted:

- **Entitlements** — App Sandbox on all four targets; the app adds
  `network.server` + `network.client` (for the loopback shim and outbound
  BYO endpoints) and the **increased-memory-limit** entitlement (for
  WebKit + a resident model).
- **Privacy** — a `PrivacyInfo.xcprivacy` on all four native targets: no
  tracking, no collected data, no required-reason APIs.
- **Info.plist** — `ITSAppUsesNonExemptEncryption=false`, an ATS loopback
  exception, `CFBundleDisplayName` "Yijing Orakel". `LSRequiresIPhoneOS`
  is deliberately absent (Catalyst forbids it; one universal plist).
- **No Content-Security-Policy** — there deliberately is none; do not
  claim one. (Stored-XSS is handled at the source in `markdown.js`
  `escapeHTML()`.)

App-Review positioning (4.2 web-wrapper, 4.3(b) "fortune telling") is in
`scripts/ios-app/README.md`.

## Updating (version bump)

This family versions **independently** of the macOS `1.5.x` AppKit app.
To cut a new version:

1. Commit changes (the build embeds the committed state).
2. Bump `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` in
   `project.yml` (`settings.base`).
3. Bump `CFBundleShortVersionString` / `CFBundleVersion` in **all four**
   Info.plists — `Resources/`, `Widgets/`, `Watch/`, `WatchWidgets/`
   (keep them in lockstep; current `1.0.0` / `1`).
4. Re-run `build-ios-app.sh archive` with `YIJING_TEAM_ID` set, then
   export/upload via the Xcode Organizer.

## Out of scope (recorded so they aren't re-attempted)

- **No meditation-image widget** — Image Playground is foreground-only
  (`backgroundCreationForbidden`), so a widget cannot generate one.
- **No custom watch face** — watchOS forbids third-party faces; the
  daily hexagram lives in a complication on Apple's faces.
- **No LLM/AI on the widget or watch** — offline only; AI lives in the
  app foreground. The daily hexagram is one hexagram with **no changing
  lines** (questionless contemplation); the watch's Werfen carries the
  full mechanics.

## Repo hygiene

`OracleKit/.build` and `OracleKit/.swiftpm` are build caches
(gitignored) — never commit them. `Yijing.xcodeproj` is regenerated by
XcodeGen and is not the source of truth; `project.yml` is.

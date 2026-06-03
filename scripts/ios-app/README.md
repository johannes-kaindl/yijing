<!--
SPDX-FileCopyrightText: 2026 Johannes Kaindl
SPDX-License-Identifier: CC-BY-SA-4.0
-->

# Yijing Orakel — iOS app (scaffold)

Native iOS/iPadOS **and Mac (via Mac Catalyst)** shell for the App Store — one
universal target. Bundles the existing web app and adds **on-device AI
interpretation** via an in-process engine (Apple Foundation Models by default)
exposed as a loopback OpenAI endpoint — so `web/llm.js` is consumed **unchanged**.

> **Status: builds + runs + real on-device AI verified in the iOS 26.5 Simulator
> AND on a physical iPhone 16 Plus (iOS 26.5).**
> Verified on 2026-06-02: the whole scaffold type-checks against the iOS 26.5 SDK,
> `build-ios-app.sh` produces a valid `Yijing.app`, it installs + launches, the
> bundled web app renders (full oracle UI via `LocalServer`→`WKWebView`), and the
> loopback OpenAI shim (`GET /v1/models`, `POST /v1/chat/completions` SSE) works
> end to end.
>
> **Default engine = Apple Foundation Models ("Apple Intelligence"), and it runs
> in the iOS 26.5 Simulator** — real on-device inference produced good structured
> German hexagram interpretations, no ~2.4 GB download, no bundled model.
>
> **Guardrails (measured on-device):** an "oracle / fortune-telling" framing
> refused ~17% of a 12-hexagram risky set; reframing as literary commentary on a
> historical wisdom text (now built into `FoundationModelsEngine`, DE/EN) dropped
> that to 0/12 in a controlled run and rescued e.g. Hex 6 (Streit). BUT the
> guardrail is finicky/content-sensitive, not a guarantee: a few of the heaviest
> texts (e.g. Hex 49 Umwälzung/Revolution — overthrow, weapons) refuse *consistently*
> (3/3) even reframed. Refusals are handled gracefully (clean error → switch to a
> remote endpoint). So Apple FM covers most readings incl. most dark hexagrams; a
> small residual of the heaviest ones needs the fallback.
>
> `llama.cpp` + a bundled GGUF (`LlamaCppEngine`, the gated skeleton) remains the
> documented FALLBACK for users who want 100% on-device coverage / no guardrails
> (at the cost of the ~2.4 GB download).
>
> Four real bugs were found + fixed via this testing: nested-struct-in-protocol,
> missing `CFBundleExecutable`, an SSE `done()` race, and an ARC `[weak self]` drop
> in `SSEResponder` (trailing `[DONE]` + close were dropped → web spinner hung).
>
> **Physical-device confirmation (2026-06-03, iPhone 16 Plus, iOS 26.5, A18).**
> `build-ios-app.sh device` ran end to end on real hardware: Development build,
> the **first** iOS signing (minting the "Apple Development" cert + profile and
> auto-registering the device), install + launch — all via CLI. The loopback
> `/v1/models` reports **`apple-on-device`** (Apple Foundation Models, i.e. Apple
> Intelligence is enabled and the model is resident), and `/v1/chat/completions`
> streamed fluent, structured **German** interpretations. Guardrails on real
> hardware matched the Simulator finding: across 7 runs over dark hexagrams
> (36 Verfinsterung, 23 Zersplitterung, 29 Abgründiges, 47 Bedrängnis ×4) **6/7
> were interpreted constructively**; one Hex-47 run refused mid-stream (then 3/3
> clean on retry) — a small, *sporadic* residual, surfaced cleanly. Two real
> build-script bugs were found + fixed here: a missing
> `-allowProvisioningDeviceRegistration` (plain `-allowProvisioningUpdates` won't
> register a brand-new device) and an unbraced `${YIJING_DEVICE_ID}` before a
> multibyte `…` (tripped `set -u`).
>
> **Still needs a physical iPhone** only for: the `llama.cpp` fallback path, an
> in-app UI round-trip judged by eye (Cast→Interpret tap inside the WKWebView, vs.
> the loopback path proven above), and the deeper on-device checks (worst-case
> context, cancel-mid-stream, jetsam, background/foreground) — see the checklist.

> **Mac Catalyst verified (2026-06-02, macOS 26.5).** The single target now lists
> `supportedDestinations: [iOS, macCatalyst]`, so the same app builds as a native
> Mac app. Verified end to end: `build-ios-app.sh catalyst` builds clean against
> the macOS 26.5 SDK (and the iOS Simulator build still passes — no regression);
> the launched `.app` runs natively (arm64), its `LocalServer` serves the web UI on
> the loopback port, **`/v1/models` reports `apple-on-device`** (Apple Foundation
> Models is available under Catalyst on macOS 26 — the open question answered), and
> a real `/v1/chat/completions` inference streamed a fluent German Hexagram-1
> reading. The same finicky guardrail behaviour as on iOS shows here too (some
> readings refuse; refusals are surfaced cleanly). `LSRequiresIPhoneOS` was removed
> from `Info.plist` (Catalyst forbids it; one universal plist). Long-term this Mac
> build supersedes the legacy AppKit app in `scripts/macos-app/`.

Design rationale (engine/model choice, App-Review strategy, device gating) lives
in `.claude/specs/2026-06-02-ios-app-ondevice-llm-design.md`.

## Architecture

```
WKWebView  ──http──►  LocalServer (NWListener, loopback)
(web/llm.js)            ├── GET /web/… , /data/…        → bundled web app + data
                        ├── GET  /v1/models             → model list
                        └── POST /v1/chat/completions   → SSE token stream
                                                              │
                                                       LLMService → LLMEngine
                                                              ├── MockEngine (Simulator / default)
                                                              └── LlamaCppEngine (real, on device)
```

- The shell mirrors `scripts/macos-app/` (`Yijing.swift` + `StaticServer.swift`).
- `LocalServer` is `StaticServer` extended with POST-body reading + the `/v1`
  SSE routes (same port → same-origin fetches, ATS satisfied by `http://localhost`).
- The shell injects the on-device endpoint into `localStorage` so the web layer
  auto-selects it (no change to `web/`). On ineligible devices nothing is
  injected → the web app's #1 "set up AI" card + BYO-endpoint path take over.

## Files

| File | Role | Confidence |
|---|---|---|
| `Sources/YijingApp.swift` | `@main` UIKit app delegate | high (tiny) |
| `Sources/WebViewController.swift` | WKWebView, export→share-sheet, links, endpoint injection | high (ported from macOS) |
| `Sources/LocalServer.swift` | loopback HTTP + `/v1` router + SSE | medium (new body/SSE paths) |
| `Sources/SSEResponder.swift` | serialized SSE writes + disconnect→cancel | medium |
| `Sources/LLMService.swift` | OpenAI request parse + SSE chunk format | medium |
| `Sources/LLMEngine.swift` | engine protocol + `MockEngine` | high |
| `Sources/LlamaCppEngine.swift` | **documented skeleton** (throws until wired) | guide only |
| `Sources/ModelLocator.swift` | memory-gated model selection | medium (tune thresholds) |
| `Resources/Info.plist`, `Yijing.entitlements` | ATS, increased-memory | verify on device |
| `project.yml`, `build-ios-app.sh` | XcodeGen + build (simulator/catalyst/archive/device) | verified (sim + Catalyst + physical device) |

## Prerequisites

- **Full Xcode** (from the App Store) — the Command Line Tools alone (which build
  the macOS app via `swiftc`) do **not** include the iOS SDK and cannot build or
  archive an iOS app. After installing: `sudo xcode-select -s /Applications/Xcode.app`.
- **XcodeGen**: `brew install xcodegen`.
- An Apple Developer Program membership (you have one) for device builds + submission.

## Quick start (web shell + mock AI, no engine yet)

```bash
brew install xcodegen
git commit -am "…"                      # build embeds the COMMITTED web/ + data/
scripts/ios-app/build-ios-app.sh          # stage + xcodegen + Simulator build
scripts/ios-app/build-ios-app.sh catalyst # …or a native Mac (Catalyst) build
open scripts/ios-app/Yijing.xcodeproj     # run on a Simulator / as "My Mac (Mac Catalyst)"
```

In the Simulator you get the full offline oracle + reference reader, and the AI
panel streams a **mock** interpretation (real inference needs Metal → a device).

## Wiring the real on-device engine (the device path)

1. **Add llama.cpp** — uncomment the `packages:`/`dependencies:` blocks in
   `project.yml` and pin a tag you validate; or add a prebuilt `libllama`
   XCFramework as an SPM `binaryTarget`. `#if canImport(llama)` then compiles
   `LlamaCppEngine` instead of the mock (on device, not Simulator).
2. **Implement `LlamaCppEngine.generate`** following the in-file step-by-step
   guide (load → tokenize via the model's chat template → decode/sample/detokenize
   loop → poll `isCancelled` → clear KV cache). Match the C API to your pinned
   llama.cpp version.
3. **Add the model** — ship `qwen3-4b-q4_k_m.gguf` (Apache-2.0; **verify the exact
   repo LICENSE**) and optionally `qwen3-1.7b-q4_k_m.gguf`. Bundle them as
   resources, or (recommended) deliver via an **Apple-Hosted Background Asset**
   (iOS 26+) and resolve the path in `ModelLocator.resolve`. Fill in
   `Resources/Acknowledgements.md` and surface it in-app.
4. **Build to a physical iPhone** (A17 Pro+ / 8 GB). For a Development build that
   signs, installs and launches on a connected device in one shot (the first run
   mints the iOS "Apple Development" cert + profile and registers the device):
   ```bash
   # UDID from: xcrun devicectl list devices
   YIJING_TEAM_ID=<your-team-id> YIJING_DEVICE_ID=<UDID> \
     scripts/ios-app/build-ios-app.sh device
   ```
   …or build an App Store archive (Release, no install):
   ```bash
   YIJING_TEAM_ID=<your-team-id> scripts/ios-app/build-ios-app.sh archive
   ```

## On-device verification checklist

- [x] Simulator: app builds, installs, launches; web shell loads (full oracle UI).
- [x] **Physical device: app builds (first iOS signing + auto device registration),
      installs + launches** on an iPhone 16 Plus (iOS 26.5) via `… device`.
- [x] `/v1/models` + `/v1/chat/completions` SSE serve correctly (verified by probing
      the running app's loopback port over an `iproxy` USB tunnel — in the Simulator
      against `MockEngine`, on device against the real `apple-on-device` engine).
- [x] **Real Apple-FM inference on device:** full **German** readings complete with
      fluent, structured prose (multiple hexagrams incl. dark ones, streamed).
- [x] **Guardrails on device:** 6/7 dark-hexagram runs interpreted constructively;
      1 sporadic mid-stream refusal (Hex 47, then 3/3 clean) — surfaced cleanly.
- [ ] In-app UI round-trip: tap Cast → Interpret → streamed text **in the WKWebView**
      (the loopback path above is proven; this just confirms the UI wiring/ATS).
- [ ] English reading prose quality judged on device (only DE exercised so far).
- [ ] Worst-case prompt (Hex 1, all 6 changing lines + resulting) vs. Apple FM's
      ~4096-token window (overflow is caught + surfaced; confirm the boundary).
- [ ] Cancel mid-stream (reset/new reading) actually stops inference.
- [ ] Memory: no jetsam kill under WebKit + resident model; background/foreground
      transitions don't wedge the listener socket.
- [ ] `llama.cpp` fallback path (Qwen3-4B GGUF) — still unwired; the above is all
      the Apple-FM path.

## App Review (don't treat as pre-cleared)

- **4.2** (web-wrapper): lean on native share/export, native nav, and substantive
  on-device AI as the "beyond a repackaged website" argument.
- **4.3(b)** (Spam — names "fortune telling"): position as an **I-Ching
  reference / study tool** (the Nachschlagewerk, the scholarly Wilhelm corpus,
  offline privacy, on-device AI as the unique/high-quality differentiator). Set a
  defensible **age rating** (not 4+) for unpredictable AI output.

## Licensing

Open-source build: AGPL-3.0-or-later (see repo `LICENSE`). Official App Store
builds are self-distributed under a separate license (`LICENSING.md` §3), source
stays AGPL in the repo. Bundled model + engine attributions:
`Resources/Acknowledgements.md`.

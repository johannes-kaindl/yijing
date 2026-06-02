<!--
SPDX-FileCopyrightText: 2026 Johannes Kaindl
SPDX-License-Identifier: CC-BY-SA-4.0
-->

# Yijing Orakel — iOS app (scaffold)

Native iOS/iPadOS shell for the App Store. Bundles the existing web app and adds
**on-device AI interpretation** via an in-process `llama.cpp` engine exposed as a
loopback OpenAI endpoint — so `web/llm.js` is consumed **unchanged**.

> **Status: builds + runs in the iOS Simulator; on-device AI plumbing verified.**
> Verified on 2026-06-02 against the iOS 26.5 SDK / iPhone 17 Pro simulator:
> the whole scaffold type-checks, `build-ios-app.sh` produces a valid `Yijing.app`,
> it installs + launches, the bundled web app renders (full oracle UI served by
> `LocalServer`→`WKWebView`), and the loopback OpenAI shim streams correctly —
> `GET /v1/models` and a `POST /v1/chat/completions` SSE round-trip both work end
> to end with the `MockEngine`. (Two real bugs were found+fixed this way: a
> nested-struct-in-protocol type error and a missing `CFBundleExecutable`.)
>
> **Still needs a physical iPhone:** the real `llama.cpp` engine (the gated
> skeleton throws until wired), the bundled GGUF model, and actual on-device
> inference + prose quality. The Simulator has no Metal GPU, so it always runs the
> `MockEngine`.

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
| `project.yml`, `build-ios-app.sh` | XcodeGen + build | unrun |

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
scripts/ios-app/build-ios-app.sh        # stage + xcodegen + Simulator build
open scripts/ios-app/Yijing.xcodeproj   # run on a Simulator
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
4. **Build to a physical iPhone** (A17 Pro+ / 8 GB):
   ```bash
   YIJING_TEAM_ID=<your-team-id> scripts/ios-app/build-ios-app.sh archive
   ```

## On-device verification checklist

- [x] Simulator: app builds, installs, launches; web shell loads (full oracle UI).
- [x] `/v1/models` + `/v1/chat/completions` SSE serve correctly (verified by probing
      the running app's loopback port; `MockEngine` streams OpenAI-shaped chunks).
- [ ] In-app UI round-trip: tap Cast → Interpret → streamed text in the WKWebView
      (needs a UI tap; the server side above is proven).
- [ ] Real inference on device: a full DE + EN reading completes; **judge prose
      quality** (Qwen3-4B vs Gemma 4 E4B) — the key open question.
- [ ] Worst-case prompt (Hex 1, all 6 changing lines + resulting) fits `n_ctx=8192`.
- [ ] Cancel mid-stream (reset/new reading) actually stops inference.
- [ ] Memory: no jetsam kill under WebKit + resident model; 1.7B fallback path.
- [ ] Background/foreground transitions don't wedge the listener socket.
- [ ] ATS: the WKWebView reaches `http://localhost:<port>` on the target iOS.

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

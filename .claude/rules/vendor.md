---
paths:
  - "web/vendor/**"
  - "web/llm.js"
  - "scripts/build-vendor.mjs"
---

# Vendored code-kit (LLM transport) — Gotchas

`web/vendor/code-kit/` holds the LLM **transport**: the two backend dialects, the streaming loop, the SSE/ND-JSON parsers and `LlmHttpError`. It came out of this repo's own `web/llm.js` and now lives in `code-kit`, the maintainer's cross-project source library, because a second repo needed the same code. code-kit is **not published** as of 2026-08-22 — it exists only in the maintainer's workspace, so a clone of this repo cannot fetch it. That is fine: the vendored copies here are complete and self-contained, and nothing in the build reaches for the upstream. It does mean a contributor cannot verify the pin, and that upstream fixes arrive only when the maintainer re-vendors them. yijing is a registered consumer in code-kit's `consumers.json`; a gate there hashes these copies against the pin.

- **Never edit anything under `web/vendor/`.** A fix belongs upstream in code-kit, followed by a re-vendor here — otherwise the next re-vendor silently throws the fix away, and every other consumer keeps the bug.
- **Every module is present twice, and that is deliberate.** `*.ts` is the **byte-identical** copy code-kit's gate compares against and is never loaded by a browser; `*.js` is **generated** from the `.ts` next to it and is what `web/llm.js` imports. "Byte-identical" and "loadable in a browser" cannot both hold in one file, because code-kit is TypeScript and this repo ships native ES modules.
- **Generate the `.js` with `node scripts/build-vendor.mjs`, never by hand.** It uses Node's **own** `module.stripTypeScriptTypes` with `mode: "transform"`, which is required: the kit uses TypeScript parameter properties, and those are code generation, not annotations. No npm, no network, nothing to install. It also rewrites the kit's extensionless relative imports to explicit `.js` specifiers. `--check` fails if a generated file is out of date.
- **To re-vendor, copy from a code-kit checkout and commit everything the run touched.** Copy the module(s), update `sha`/`vendored` in `VENDOR.json`, run `node scripts/build-vendor.mjs`, then read `git status --short` — a vendor script tends to move more than the file you asked for. Then read code-kit's `CHANGELOG` for what the new copy does differently, and carry anything a user would notice into `CHANGELOG.md` here: a kit adoption brings exactly the behaviour that was never tested locally.
- **What stayed in `web/llm.js` belongs to this app:** endpoint and prompt persistence (`localStorage`), the built-in prompt presets, `buildUserPrompt`, `testThinkingMode`, the i18n binding, `makeClient()` (the thin adapter that maps this app's endpoint schema onto the kit and filters empty deltas) and `describeLlmError()` for the display text.
- **`makeClient()` must keep dropping empty deltas.** `parseSSE` passes an empty reasoning delta through where the old truthy cascade discarded it, so without the filter the thinking `<details>` block opens on nothing.
- **Reasoning output is read in a fixed order.** `pure/sse.js` reads the OpenAI-shaped variants as `reasoning_content` → `reasoning` → `thinking` (one per delta) and falls back to `choices[0].message` when a server sends whole messages despite `stream: true`; the ND-JSON sibling reads `message.thinking`. The field table per backend is in `docs/LLM.md`.

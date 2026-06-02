# Acknowledgements

The Yijing Orakel iOS app bundles third-party open-source components. Their
licenses require attribution; this file ships inside the app and must be
surfaced to the user (e.g. a link from the app's footer / an in-app
acknowledgements screen).

## On-device language model

> ⚠️ Fill in the EXACT model + license of the GGUF you actually ship, and verify
> its repository LICENSE permits redistribution in a closed-source App Store app.
> Qwen licensing is variant-specific — Qwen3-4B (text) is Apache-2.0 and
> bundleable; Qwen2.5-3B is a NON-COMMERCIAL license and must NOT be bundled.

**Qwen3-4B** — © Alibaba Cloud. Licensed under the Apache License, Version 2.0.
Quantized to GGUF (Q4_K_M) for on-device inference.

Apache-2.0 is redistribution-safe but **not attribution-free**: retain the
copyright notice, include the full Apache-2.0 license text, and reproduce any
NOTICE-file contents from the model repository here.

## Inference engine

**llama.cpp** (libllama) — © the ggml authors. MIT License. <https://github.com/ggml-org/llama.cpp>

---

*The Yijing Orakel app itself is © 2026 Johannes Kaindl. The open-source build is
licensed AGPL-3.0-or-later; see the project repository. Official App Store builds
are distributed under a separate license (see `LICENSING.md`), with the complete
corresponding source available under the AGPL in the repository.*

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Johannes Kaindl
//
// EngineSelector — picks the on-device engine by priority, or returns nil so the
// web layer degrades gracefully (#1 setup card / BYO endpoint):
//
//   1. Apple Foundation Models ("Apple Intelligence") — built-in, 0 GB, free,
//      private. Preferred when available (eligible device + AI enabled).
//   2. llama.cpp + bundled GGUF — broader device reach, but ~2.4 GB. Only when
//      the `llama` module is linked — so NOT in the Simulator, and NOT in current
//      Mac Catalyst builds either (no llama package is linked there yet).
//   3. MockEngine — Simulator / pre-integration, so the full path is exercisable.
//
// All three conform to LLMEngine, so the loopback OpenAI shim + web/llm.js are
// unchanged regardless of which one runs.

import Foundation

enum EngineSelector {
    static func select() -> (engine: LLMEngine, name: String)? {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, macCatalyst 26.0, *), FoundationModelsEngine.isAvailable {
            return (FoundationModelsEngine(), "apple-on-device")
        }
        #endif

        #if canImport(llama) && !targetEnvironment(simulator)
        if let model = ModelLocator.selectModel() {
            return (LlamaCppEngine(modelURL: model.url, contextLength: 8192), model.name)
        }
        #endif

        #if targetEnvironment(simulator)
        return (MockEngine(), "mock-on-device")
        #endif

        return nil   // ineligible device → graceful degradation (web #1 card / BYO)
    }
}

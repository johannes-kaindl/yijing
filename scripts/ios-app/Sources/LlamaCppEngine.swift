// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Johannes Kaindl
//
// LlamaCppEngine — the real on-device engine, backed by llama.cpp (libllama).
//
// Compiled ONLY when the `llama` module is linked (see scripts/ios-app/README.md
// for adding the official llama.cpp XCFramework / SPM package). Until then,
// WebViewController.makeEngine falls back to MockEngine and the project builds
// and runs (web shell + mock AI) without any native engine.
//
// This file is a DOCUMENTED SKELETON, not a verified implementation. The exact
// libllama C API surface evolves between releases, and none of it can be
// compiled or run in this authoring environment. generate() therefore throws
// `.notIntegrated`; follow the step-by-step guide below to wire it against your
// PINNED llama.cpp version, then test on a physical iPhone (the Simulator has no
// Metal GPU for real inference).

#if canImport(llama)
import Foundation
import llama

enum LlamaError: Error {
    case notIntegrated
    case modelLoadFailed
    case contextOverflow
}

final class LlamaCppEngine: LLMEngine {
    private let modelURL: URL
    private let contextLength: Int32

    init(modelURL: URL, contextLength: Int32 = 8192) {
        self.modelURL = modelURL
        self.contextLength = contextLength
        // Implementation guide — do in init (once, at app launch; keep resident):
        //   1. llama_backend_init()
        //   2. var mp = llama_model_default_params()
        //      // Metal is default-on for iOS; n_gpu_layers = high to offload.
        //      let model = llama_model_load_from_file(modelURL.path, mp)   // OpaquePointer?
        //      guard model != nil else { throw LlamaError.modelLoadFailed }
        //   3. var cp = llama_context_default_params(); cp.n_ctx = UInt32(contextLength)
        //      let ctx = llama_init_from_model(model, cp)
        //   4. vocab = llama_model_get_vocab(model)
        //   5. Build a sampler chain (kept resident):
        //      let sp = llama_sampler_chain_default_params()
        //      let smpl = llama_sampler_chain_init(sp)
        //      llama_sampler_chain_add(smpl, llama_sampler_init_top_p(0.95, 1))
        //      llama_sampler_chain_add(smpl, llama_sampler_init_temp(0.7))
        //      llama_sampler_chain_add(smpl, llama_sampler_init_dist(LLAMA_DEFAULT_SEED))
        // Store model/ctx/vocab/smpl as stored properties; free them in deinit
        //   (llama_sampler_free, llama_free, llama_model_free, llama_backend_free).
    }

    func generate(messages: [LLMMessage],
                  isCancelled: @escaping () -> Bool,
                  onToken: @escaping (String) -> Void) throws {
        // ---- Implementation guide (per request) -------------------------------
        // a) PROMPT: format `messages` with the model's chat template. Qwen3 and
        //    Gemma both use ChatML-style turns; the robust path is
        //    llama_chat_apply_template(model, nil, cMessages, n, addAssistant=true,
        //    buf, len). A simpler, verifiable fallback that works for Qwen3
        //    (ChatML) is to build the string manually:
        //        <|im_start|>system\n{system}<|im_end|>\n
        //        <|im_start|>user\n{user}<|im_end|>\n
        //        <|im_start|>assistant\n
        //    NOTE: match the template to the chosen model; Gemma uses <start_of_turn>.
        let prompt = Self.chatMLPrompt(messages)
        _ = prompt

        // b) TOKENIZE the prompt:
        //    llama_tokenize(vocab, prompt, len, &tokens, max, add_special=true,
        //                   parse_special=true). If token count >= n_ctx, throw
        //    .contextOverflow (n_ctx is 8192 here; the measured worst-case I-Ching
        //    prompt ~5,800 tokens fits with output headroom).
        //
        // c) PREFILL: llama_decode(ctx, llama_batch_get_one(tokens, n_tokens)).
        //    Optionally emit an early heartbeat so the WebView fetch is not seen as
        //    stalled during multi-second prefill (the SSE role chunk already does
        //    some of this).
        //
        // d) DECODE LOOP — until EOS, an output-token cap (~700, to bound thermal
        //    throttling on long generations), or cancellation:
        //        while !isCancelled() && nGenerated < maxOutput {
        //          let id = llama_sampler_sample(smpl, ctx, -1)
        //          if llama_vocab_is_eog(vocab, id) { break }
        //          let piece = tokenToString(id)          // llama_token_to_piece
        //          onToken(piece)
        //          // feed the new token back: llama_decode(ctx, batch_get_one(&id, 1))
        //        }
        //    Poll isCancelled() every iteration so the web AbortSignal halts
        //    inference promptly (SSEResponder flips isCancelled on client TCP close).
        //
        // e) After the loop: reset/clear the KV cache for the next request
        //    (llama_kv_self_clear / llama_memory_clear, per your version) so a new
        //    reading starts clean. Do NOT free the model/context here — keep
        //    resident; free only in deinit.
        // -----------------------------------------------------------------------

        throw LlamaError.notIntegrated
    }

    /// Minimal ChatML prompt builder (Qwen3). Replace/extend per chosen model.
    private static func chatMLPrompt(_ messages: [LLMMessage]) -> String {
        var s = ""
        for m in messages {
            s += "<|im_start|>\(m.role)\n\(m.content)<|im_end|>\n"
        }
        s += "<|im_start|>assistant\n"
        return s
    }
}
#endif

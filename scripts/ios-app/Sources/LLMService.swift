// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Johannes Kaindl
//
// LLMService — the loopback OpenAI-compatible surface. Parses an incoming
// /v1/chat/completions request, runs the on-device engine on a background queue,
// and emits OpenAI-spec SSE chunks that web/llm.js's OpenAIClient parses
// unchanged (it reads choices[0].delta.content and terminates on [DONE]).
//
// UNVERIFIED scaffold — not compiled here.

import Foundation

final class LLMService {
    private let engine: LLMEngine
    private let modelName: String
    // Single serial inference queue — the resident model serves one generation
    // at a time; never run on the server's connection queue.
    private let inferenceQueue = DispatchQueue(label: "de.kaindl.yijing.inference")

    init(engine: LLMEngine, modelName: String) {
        self.engine = engine
        self.modelName = modelName
    }

    func modelsJSON() -> String {
        let obj: [String: Any] = [
            "object": "list",
            "data": [["id": modelName, "object": "model", "owned_by": "on-device"]],
        ]
        return jsonString(obj) ?? #"{"object":"list","data":[]}"#
    }

    /// Parses the OpenAI request, then streams tokens as SSE chunks via `responder`.
    func streamChatCompletion(requestBody: Data, responder: SSEResponder) {
        guard let root = try? JSONSerialization.jsonObject(with: requestBody) as? [String: Any],
              let rawMessages = root["messages"] as? [[String: Any]] else {
            responder.send(errorChunk("invalid request"))
            responder.done()
            return
        }
        let messages: [LLMMessage] = rawMessages.compactMap {
            guard let role = $0["role"] as? String, let content = $0["content"] as? String else { return nil }
            return LLMMessage(role: role, content: content)
        }

        inferenceQueue.async { [weak self] in
            guard let self = self else { return }
            // OpenAI convention: an initial role delta, then content deltas.
            responder.send(self.chunk(delta: ["role": "assistant"]))
            do {
                try self.engine.generate(
                    messages: messages,
                    isCancelled: { responder.isCancelled },
                    onToken: { token in
                        responder.send(self.chunk(delta: ["content": token]))
                    })
                responder.send(self.chunk(delta: [:], finishReason: "stop"))
            } catch {
                // Surface engine failures (e.g. context overflow, OOM/jetsam, load
                // error) as a clean finish so web/llm.js shows an error and the
                // user can fall back to a BYO endpoint.
                responder.send(self.errorChunk("on-device generation failed: \(error)"))
                responder.send(self.chunk(delta: [:], finishReason: "stop"))
            }
            responder.done()
        }
    }

    // MARK: - OpenAI chunk formatting

    private func chunk(delta: [String: Any], finishReason: String? = nil) -> String {
        let choice: [String: Any] = [
            "index": 0,
            "delta": delta,
            "finish_reason": finishReason as Any,
        ]
        let obj: [String: Any] = [
            "id": "chatcmpl-ondevice",
            "object": "chat.completion.chunk",
            "model": modelName,
            "choices": [choice],
        ]
        return jsonString(obj) ?? "{}"
    }

    private func errorChunk(_ message: String) -> String {
        chunk(delta: ["content": "\n\n⚠️ \(message)"])
    }

    private func jsonString(_ obj: [String: Any]) -> String? {
        guard let data = try? JSONSerialization.data(withJSONObject: obj) else { return nil }
        return String(data: data, encoding: .utf8)
    }
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Johannes Kaindl
//
// FoundationModelsEngine — uses Apple's built-in on-device model ("Apple
// Intelligence", the iOS 26 Foundation Models ~3B model). Zero app-size cost, no
// bundled weights, no model license, private, offline, free.
//
// Trade-offs (vs a bundled llama.cpp model):
//   + no ~2.4 GB download, no engine integration, no memory/thermal management
//   - iOS 26+ AND Apple-Intelligence hardware (A17 Pro+: iPhone 15 Pro, 16/17
//     lines, 16e/17e/Air) only → ineligible devices fall back (BYO / non-AI)
//   - 4096-token context window (input+output) → ~97% of real readings fit with
//     an ~800-token answer; the rare overflow throws and is surfaced cleanly
//   - non-disableable content guardrails can refuse dark themes (death/conflict/
//     misfortune) pervasive in I-Ching → caught and surfaced so the user can fall
//     back to a remote endpoint. THIS is the one thing to validate on a device.
//
// Conforms to the same LLMEngine protocol as MockEngine/LlamaCppEngine, so the
// loopback OpenAI shim + web/llm.js are unchanged. streamResponse yields
// CUMULATIVE snapshots, so we forward only the newly-appended suffix as a token.

#if canImport(FoundationModels)
import Foundation
import FoundationModels

@available(iOS 26.0, *)
final class FoundationModelsEngine: LLMEngine {
    /// True when the built-in model is usable right now (eligible device, Apple
    /// Intelligence enabled, model downloaded). Checked before selecting this engine.
    static var isAvailable: Bool {
        switch SystemLanguageModel.default.availability {
        case .available: return true
        default: return false
        }
    }

    func generate(messages: [LLMMessage],
                  isCancelled: @escaping () -> Bool,
                  onToken: @escaping (String) -> Void) throws {
        let system = messages.first(where: { $0.role == "system" })?.content ?? ""
        let user = messages.filter { $0.role != "system" }
            .map { $0.content }.joined(separator: "\n\n")

        let session = LanguageModelSession(instructions: system)

        // Bridge the async response stream onto this synchronous (background-queue)
        // call. streamResponse emits cumulative snapshots → emit only the suffix.
        let sem = DispatchSemaphore(value: 0)
        var thrown: Error?
        var lastCount = 0

        let task = Task {
            do {
                for try await snapshot in session.streamResponse(to: user) {
                    if isCancelled() { break }
                    let full = snapshot.content
                    if full.count > lastCount {
                        let start = full.index(full.startIndex, offsetBy: lastCount)
                        onToken(String(full[start...]))
                        lastCount = full.count
                    }
                }
            } catch {
                thrown = error
            }
            sem.signal()
        }

        // Wait for completion; cancel the generation if the web client disconnects.
        while sem.wait(timeout: .now() + 0.1) == .timedOut {
            if isCancelled() { task.cancel() }
        }

        if let error = thrown { throw mapError(error) }
    }

    /// Turn Foundation Models' internal errors into clean, user-facing messages so
    /// web/llm.js shows something helpful (and the user can switch to a remote
    /// endpoint) instead of a raw crash.
    private func mapError(_ error: Error) -> Error {
        let text = String(describing: error).lowercased()
        if text.contains("guardrail") {
            return EngineError.message(
                "Das eingebaute Apple-Modell hat diese Deutung abgelehnt (Inhaltsfilter). "
                + "Du kannst stattdessen einen Remote-Endpoint in den Einstellungen nutzen.")
        }
        if text.contains("context") || text.contains("exceededcontext") {
            return EngineError.message(
                "Diese Lesung ist für das eingebaute Modell zu lang (Kontextfenster). "
                + "Nutze ggf. einen Remote-Endpoint mit größerem Fenster.")
        }
        return error
    }
}

enum EngineError: Error { case message(String) }
#endif

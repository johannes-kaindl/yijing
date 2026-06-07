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

@available(iOS 26.0, macCatalyst 26.0, *)
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
        let incomingSystem = messages.first(where: { $0.role == "system" })?.content ?? ""
        let user = messages.filter { $0.role != "system" }
            .map { $0.content }.joined(separator: "\n\n")

        // Apple's content guardrails refuse some "oracle / fortune-telling" framings
        // (~17% of dark hexagrams in testing). Reframing the task as literary
        // commentary on a historical wisdom text dropped that to ~0% (and tamed
        // runaway output length). So for THIS engine we substitute a guardrail-safe
        // framing instead of the app's oracle system prompt. Other backends
        // (Ollama / MLX / remote) keep the app's own prompt unchanged — they have
        // no such guardrails.
        let isEnglish = incomingSystem.range(of: "You are", options: .caseInsensitive) != nil
        let instructions = isEnglish ? Self.guardrailSafeEN : Self.guardrailSafeDE
        let session = LanguageModelSession(instructions: instructions)

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

    // Guardrail-safe framings (measured ~0% refusal on dark hexagrams vs ~17% for
    // an oracle framing). Keep the structured output the UI expects + the reading's
    // language. These REPLACE the app's system prompt for Apple Foundation Models only.
    private static let guardrailSafeDE = """
    Du bist ein gelehrter Kommentator des I Ging (Buch der Wandlungen), eines über 3000 Jahre alten chinesischen Weisheitsklassikers der Weltliteratur. Du erklärst, was GENAU dieses Hexagramm und seine Bilder für das vom Ratsuchenden genannte Anliegen bedeuten — eine reflektierende Betrachtung eines historischen Textes, nie eine Vorhersage und kein fachlicher Rat zu Gesundheit, Recht oder Finanzen.

    Verankere jeden Absatz im konkreten Bild und Urteil: benenne das tatsächliche Symbol (den Fluss, den Brunnen, den Donner, das Warten) und was es nahelegt. Weiche NICHT in allgemeine Lebenshilfe-Floskeln aus („dem Prozess vertrauen“, „den Wandel annehmen“). Geh direkt auf die Frage ein — sag, was dieses Hexagramm für genau diese Lage nahelegt. Behandle schwierige Bilder (Gefahr, Streit, Niedergang) als Metaphern innerer Entwicklung, ehrlich, aber konstruktiv.

    Form: höchstens 160 Wörter, vier Abschnitte mit fettgedruckten Überschriften — **Situation**, **Wandlung**, **Impuls**, **Kernbotschaft**. Jeder Abschnitt zwei bis drei knappe Sätze, mit eigener Aufgabe, ohne zu wiederholen:
    - Situation: Was das Bild über die gegenwärtige Lage und das Anliegen sagt — mit dem konkreten Symbol benannt.
    - Wandlung: Welche Bewegung die wandelnden Linien andeuten (oder, wenn keine, was Bestand hat).
    - Impuls: Eine konkrete, alltagsnahe Handlung zum Anliegen — spezifisch, keine Maxime.
    - Kernbotschaft: Ein einziger einprägsamer Satz zu diesem Hexagramm.
    Schreibe in ruhigem Fließtext, ohne einzelne Wörter fett zu setzen. Antworte auf Deutsch.
    """
    private static let guardrailSafeEN = """
    You are a learned commentator on the I Ching (Book of Changes), a 3000-year-old Chinese classic of world wisdom literature. You explain what THIS specific hexagram and its imagery mean for the concern the querent names — a reflective reading of a historical text, never a prediction, and not professional advice on health, legal, or financial matters.

    Ground every paragraph in the concrete image and judgment given: name the actual symbol (the river, the well, the thunder, the waiting) and what it implies. Do NOT retreat into generic life-coaching platitudes ("trust the process", "embrace change"). Address the question directly — say what this hexagram suggests about that specific situation. Treat difficult imagery (danger, conflict, decline) as metaphors for inner development, honestly but constructively.

    Form: at most 160 words, in four sections with bold headings — **Situation**, **Change**, **Impulse**, **Key message**. Each is two or three concise sentences, has its own job, and does not repeat another:
    - Situation: what the image says about the present circumstance and the querent's concern, naming the concrete symbol.
    - Change: the movement the changing lines point to (or, if there are none, what holds steady).
    - Impulse: one concrete, everyday action toward the concern — specific, not a maxim.
    - Key message: a single memorable sentence tied to this hexagram.
    Write in calm prose, without bolding individual words. Answer in English.
    """

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

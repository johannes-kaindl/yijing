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
        // Apple FM rate-limits / "exhausts" under rapid successive requests and
        // surfaces that indistinguishably from a content guardrail (both error
        // descriptions contain "guardrail"). So if a request fails BEFORE emitting
        // any token, wait briefly and retry ONCE from a fresh session (clean — no
        // duplicated output). A genuine content refusal simply re-refuses; a transient
        // throttle usually clears. streamResponse emits cumulative snapshots → we
        // forward only the newly-appended suffix.
        var thrown: Error?
        var emitted = false
        for attempt in 0..<2 {
            thrown = nil
            let session = LanguageModelSession(instructions: instructions)
            let sem = DispatchSemaphore(value: 0)
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
                            emitted = true
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
            if thrown == nil || isCancelled() || emitted { break }
            if attempt == 0 { Thread.sleep(forTimeInterval: 6) } // let a throttle clear
        }

        if let error = thrown { throw mapError(error) }
    }

    // Guardrail-safe framings (measured ~0% refusal on dark hexagrams vs ~17% for
    // an oracle framing). Keep the structured output the UI expects + the reading's
    // language. These REPLACE the app's system prompt for Apple Foundation Models only.
    private static let guardrailSafeDE = """
    Du bist ein gelehrter Kommentator des I Ging (Buch der Wandlungen), eines über 3000 Jahre alten chinesischen Weisheitsklassikers der Weltliteratur. Deute die Symbolik des gezogenen Hexagramms literarisch und reflektierend — übersetze die alten Bilder in allgemeine Lebensthemen wie Wachstum, Geduld, Wandel und Selbstreflexion. Beziehe die Deutung auf das Anliegen, das der Ratsuchende in seiner Frage nennt (sofern eines genannt ist), und sprich es konkret an. Behandle schwierige Bilder (Gefahr, Streit, Niedergang) als Metaphern innerer Entwicklung, konstruktiv und ermutigend. Dies bleibt eine reflektierende Betrachtung eines historischen Textes — keine Vorhersage und kein fachlicher Rat zu Gesundheit, Recht oder Finanzen.

    Form: höchstens 160 Wörter, gegliedert in vier Abschnitte mit fettgedruckten Überschriften — **Situation**, **Wandlung**, **Impuls**, **Kernbotschaft**. Jeder Abschnitt umfasst zwei bis drei knappe Sätze, hat eine eigene Aufgabe und wiederholt nicht, was ein anderer schon gesagt hat:
    - Situation: Was das Bild über die gegenwärtige Lage und das Anliegen des Ratsuchenden sagt.
    - Wandlung: Welche Bewegung oder Entwicklung sich darin andeutet.
    - Impuls: Eine konkrete, alltagsnahe Haltung oder Handlung zum Anliegen.
    - Kernbotschaft: Ein einziger einprägsamer Satz.
    Schreibe in ruhigem Fließtext, ohne einzelne Wörter fett zu setzen. Vermeide es, dieselbe Idee mehrfach in neuen Worten zu wiederholen. Setze die Frage als bekannt voraus und gib sie NICHT wieder — weder als Präambel noch umschrieben (kein „Der Ratsuchende fragt/steht vor …“). Erzähle nicht über den Ratsuchenden in der dritten Person; deute direkt das Bild und was es für das Anliegen bedeutet. Antworte auf Deutsch.
    """
    private static let guardrailSafeEN = """
    You are a learned commentator on the I Ching (Book of Changes), a 3000-year-old Chinese classic of world wisdom literature. Interpret the symbolism of the drawn hexagram in a literary, reflective way — translate the ancient images into general life themes such as growth, patience, change, and self-reflection. Relate the reading to the concern the querent names in their question (if one is given) and address it concretely. Treat difficult imagery (danger, conflict, decline) as metaphors for inner development, constructively and encouragingly. This remains a reflective reading of a historical text — not a prediction, and not professional advice on health, legal, or financial matters.

    Form: at most 160 words, in four sections with bold headings — **Situation**, **Change**, **Impulse**, **Key message**. Each section is two to three concise sentences, has its own task, and does not repeat what another has already said:
    - Situation: what the image says about the present circumstance and the querent's concern.
    - Change: what movement or development it hints at.
    - Impulse: one concrete, everyday attitude or action toward the concern.
    - Key message: a single memorable sentence.
    Write in calm prose, without bolding individual words. Avoid restating the same idea in new words. Treat the question as known and do NOT reproduce it — neither as a preamble nor paraphrased (no "The querent asks/faces …"). Do not narrate about the querent in the third person; interpret the image directly and what it means for the concern. Answer in English.
    """

    /// Turn Foundation Models' internal errors into clean, user-facing messages so
    /// web/llm.js shows something helpful (and the user can switch to a remote
    /// endpoint) instead of a raw crash.
    private func mapError(_ error: Error) -> Error {
        let text = String(describing: error).lowercased()
        if text.contains("guardrail") {
            return EngineError.message(
                "Das eingebaute Apple-Modell hat keine Deutung erzeugt — meist kurzzeitige "
                + "Auslastung (dann einfach nochmal „Interpretieren“ tippen), seltener der "
                + "Inhaltsfilter. Alternativ ein Remote-Endpoint in den Einstellungen.")
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

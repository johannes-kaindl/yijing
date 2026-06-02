// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Johannes Kaindl
//
// LLMEngine — the on-device generation interface, plus a MockEngine so the app
// runs in the Simulator and before the llama.cpp framework is integrated. The
// real implementation lives in LlamaCppEngine.swift (compiled only when the
// `llama` module is linked).
//
// UNVERIFIED scaffold — not compiled here.

import Foundation

/// One chat turn handed to the engine (role + content), mirroring an OpenAI
/// message. Top-level because Swift protocols cannot nest types.
struct LLMMessage { let role: String; let content: String }

protocol LLMEngine {
    /// Blocking generation (run on a background queue). Calls `onToken` for each
    /// decoded token and stops promptly when `isCancelled()` becomes true (the
    /// web client aborted). Throws on load/context/overflow failure.
    func generate(messages: [LLMMessage],
                  isCancelled: @escaping () -> Bool,
                  onToken: @escaping (String) -> Void) throws
}

/// Deterministic stand-in: streams a short canned interpretation word-by-word so
/// the full web→shim→SSE→UI path is exercisable in the Simulator (which has no
/// Metal GPU for real inference). Echoes the detected language of the prompt.
final class MockEngine: LLMEngine {
    func generate(messages: [LLMMessage],
                  isCancelled: @escaping () -> Bool,
                  onToken: @escaping (String) -> Void) throws {
        let isEnglish = messages.last?.content.range(of: "Question:", options: .caseInsensitive) != nil
        let text = isEnglish ? Self.mockEN : Self.mockDE
        for word in text.split(separator: " ", omittingEmptySubsequences: false) {
            if isCancelled() { return }
            onToken(String(word) + " ")
            Thread.sleep(forTimeInterval: 0.02)   // simulate token cadence
        }
    }

    private static let mockDE = """
    [Mock-Engine — Simulator] Diese Lesung spricht von einem Moment des Übergangs. \
    Das Ursprungsbild lädt dich ein, innezuhalten und die Bewegung unter der \
    Oberfläche wahrzunehmen. Die wandelnde Linie deutet auf eine Schwelle: Was \
    bisher Last war, kann zur Klärung werden. Kernbotschaft: Vertraue dem \
    langsamen, stetigen Fluss. (Echte Deutung folgt auf dem Gerät mit dem \
    On-Device-Modell.)
    """

    private static let mockEN = """
    [Mock engine — Simulator] This reading speaks of a moment of transition. \
    The primary image invites you to pause and notice the movement beneath the \
    surface. The changing line points to a threshold: what was a burden can \
    become clarity. Key message: trust the slow, steady flow. (The real \
    interpretation runs on-device with the bundled model.)
    """
}

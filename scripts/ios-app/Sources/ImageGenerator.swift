// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Johannes Kaindl
//
// ImageGenerator — an optional "meditation image" for a reading, generated fully
// on-device with Apple's Image Playground (ImageCreator). Zero cost, private,
// offline; no bundled model. Sketch style (delicate ink-wash look) fits the
// reflective I-Ching mood best.
//
// Availability: iOS/iPadOS 18.4+ and Mac Catalyst 18.4+, Apple-Intelligence
// hardware only. Everything is gated — on ineligible devices `isAvailable`
// returns false and the web layer simply never shows the button.
//
// Constraints learned on-device: ImageCreator refuses generation unless the app
// is the active foreground app (backgroundCreationForbidden) — fine here, the user
// taps a button — and very elaborate prompts occasionally throw `creationFailed`,
// so the web side keeps the prompt simple and we retry once.

#if canImport(ImagePlayground)
import Foundation
import ImagePlayground
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
#if canImport(FoundationModels)
import FoundationModels
#endif

enum ImageGenError: Error { case unavailable, noImage, encodeFailed }

@available(iOS 18.4, macCatalyst 18.4, *)
enum ImageGenerator {
    /// True when ImageCreator can be instantiated on this device (eligible
    /// hardware + Image Playground set up). Checked once at launch.
    static func available() async -> Bool {
        do { _ = try await ImageCreator(); return true }
        catch { return false }
    }

    /// Distill ONE concrete ink-wash motif from the hexagram's image essence and the
    /// querent's question via a dedicated FoundationModels session. NOT the loopback
    /// /v1 engine — that one forces the interpretation framing and would return a
    /// reading, not a motif. Returns nil on any failure (caller falls back).
    static func distill(seed: String, question: String?) async -> String? {
        #if canImport(FoundationModels)
        // LanguageModelSession needs iOS/Catalyst 26 (Apple Intelligence) — a higher
        // bar than ImageCreator's 18.4. On 18.4–25 distillation is skipped and the
        // pipeline falls back to the raw seed.
        guard #available(iOS 26.0, macCatalyst 26.0, *) else { return nil }
        let instructions = """
        You distill a single concrete nature scene for an ink-wash painting. Given a \
        hexagram's image essence and the querent's question, name ONE quiet, concrete \
        natural scene (6 to 12 words) that weaves the essence together with the \
        question's theme and shows the tension of opposites (stillness and motion, \
        light and shadow). Only concrete natural subjects — no abstract mood words, \
        no people, no text, nothing violent or stormy. Reply with the scene only, no \
        preamble, no punctuation at the end.
        """
        var input = "Essence: \(seed)"
        if let q = question?.trimmingCharacters(in: .whitespacesAndNewlines), !q.isEmpty {
            input += "\nQuestion: \(q)"
        }
        do {
            let session = LanguageModelSession(instructions: instructions)
            let motif = try await session.respond(to: input)
                .content.trimmingCharacters(in: .whitespacesAndNewlines)
            return motif.isEmpty ? nil : motif
        } catch {
            return nil
        }
        #else
        return nil
        #endif
    }

    /// Full meditation-image pipeline: distill a motif (with the question, then
    /// without), fall back to the raw seed, then a guaranteed standard motif. Each
    /// stage runs ImageCreator once; the first JPEG wins. Concrete nature motifs only
    /// — abstract mood words ("calm") get rendered as literal TEXT, concrete subjects
    /// yield clean ink-wash.
    static func generateMeditationImage(seed: String, question: String?) async throws -> Data {
        // 1. distilled with the question
        if let m = await distill(seed: seed, question: question),
           let img = try? await once(prompt: "\(m), ink-wash painting") { return img }
        // 2. distilled without the question
        if let m = await distill(seed: seed, question: nil),
           let img = try? await once(prompt: "\(m), ink-wash painting") { return img }
        // 3. the raw curated seed
        if let img = try? await once(prompt: "\(seed), ink-wash painting") { return img }
        // 4. guaranteed-ish standard motif
        return try await once(prompt: "a mountain in mist, ink-wash painting")
    }

    private static func once(prompt: String) async throws -> Data {
        let creator = try await ImageCreator()
        let style = creator.availableStyles.first { String(describing: $0).contains("sketch") }
            ?? creator.availableStyles.first
        guard let style else { throw ImageGenError.unavailable }
        let images = creator.images(for: [.text(prompt)], style: style, limit: 1)
        for try await image in images {
            return try encodeJPEG(image.cgImage)
        }
        throw ImageGenError.noImage
    }

    private static func encodeJPEG(_ cg: CGImage) throws -> Data {
        let data = NSMutableData()
        guard let dest = CGImageDestinationCreateWithData(
            data, UTType.jpeg.identifier as CFString, 1, nil) else {
            throw ImageGenError.encodeFailed
        }
        CGImageDestinationAddImage(dest, cg, [kCGImageDestinationLossyCompressionQuality: 0.85] as CFDictionary)
        guard CGImageDestinationFinalize(dest) else { throw ImageGenError.encodeFailed }
        return data as Data
    }
}
#endif

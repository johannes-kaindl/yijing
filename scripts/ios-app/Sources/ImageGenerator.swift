// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Johannes Kaindl
//
// ImageGenerator — an optional "meditation image" for a reading, generated fully
// on-device with Apple's Image Playground (ImageCreator). Zero cost, private,
// offline; no bundled model. Sketch style (a soft colored-pencil look — Image
// Playground has no true ink-wash style) fits the reflective I-Ching mood best.
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

enum ImageGenError: Error { case unavailable, noImage, encodeFailed }

@available(iOS 18.4, macCatalyst 18.4, *)
enum ImageGenerator {
    /// True when ImageCreator can be instantiated on this device (eligible
    /// hardware + Image Playground set up). Checked once at launch.
    static func available() async -> Bool {
        do { _ = try await ImageCreator(); return true }
        catch { return false }
    }

    /// Build "<motif>, <modifier>" and render it; on failure fall back to the bare
    /// motif, then a neutral standard scene. NO Apple FM (on-device distillation was
    /// unreliable — frequent guardrail refusals — and ignored the question anyway) and
    /// NO "ink-wash" suffix (it only pulled every image toward generic mountain-water).
    /// The hexagram supplies the motif; the query-derived `modifier` (day-time / season,
    /// chosen web-side) is what makes the same hexagram look different per question.
    static func generateMeditationImage(motif: String, modifier: String) async throws -> Data {
        let mod = modifier.trimmingCharacters(in: .whitespacesAndNewlines)
        // 1. motif + modifier
        if !mod.isEmpty, let img = try? await once(prompt: "\(motif), \(mod)") { return img }
        // 2. bare motif
        if let img = try? await once(prompt: motif) { return img }
        // 3. guaranteed-ish neutral scene
        return try await once(prompt: "a quiet meadow under a wide sky")
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

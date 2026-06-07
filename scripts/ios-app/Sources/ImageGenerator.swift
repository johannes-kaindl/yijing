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

    /// Render the reading's meditation image. Model A: `scene` is one composed
    /// sentence (both motifs + atmosphere, built web-side in image-scene.js) rendered
    /// as a SINGLE Image Playground concept. On failure we shed detail: the bare
    /// primary `motif` (+ `modifier`), then the primary alone, then a neutral scene.
    /// `motif2` is retained for a possible future diptych fallback.
    ///
    /// NO Apple FM for the prompt (on-device distillation refused most requests +
    /// ignored the question) and NO "ink-wash" suffix (it only pulled images toward
    /// generic mountain-water). All deterministic.
    static func generateMeditationImage(scene: String, motif: String, motif2: String, modifier: String) async throws -> Data {
        let scene = scene.trimmingCharacters(in: .whitespacesAndNewlines)
        let motif = motif.trimmingCharacters(in: .whitespacesAndNewlines)
        let mod = modifier.trimmingCharacters(in: .whitespacesAndNewlines)
        let attempts: [(String, [ImagePlaygroundConcept])] = [
            ("scene",       scene.isEmpty ? [] : [.text(scene)]),
            ("primary+mod", motif.isEmpty ? [] : (mod.isEmpty ? [.text(motif)] : [.text("\(motif), \(mod)")])),
            ("primary",     motif.isEmpty ? [] : [.text(motif)]),
        ]
        for (label, concepts) in attempts where !concepts.isEmpty {
            if let data = try? await render(concepts) {
                logRender(label)
                return data
            }
        }
        // Last resort, surfaced rather than swallowed.
        return try await render([.text("a quiet meadow under a wide sky")])
    }

    private static func logRender(_ label: String) {
        #if DEBUG
        print("[img] rendered via: \(label)")
        #endif
    }

    private static func render(_ concepts: [ImagePlaygroundConcept]) async throws -> Data {
        let creator = try await ImageCreator()
        let style = creator.availableStyles.first { String(describing: $0).contains("sketch") }
            ?? creator.availableStyles.first
        guard let style else { throw ImageGenError.unavailable }
        let images = creator.images(for: concepts, style: style, limit: 1)
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

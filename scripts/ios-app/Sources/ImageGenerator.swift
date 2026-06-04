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

    /// Render the reading's image. `motif` is the primary hexagram's motif; `motif2`
    /// (empty when no line changes) is the resulting hexagram's motif — when present
    /// we render "<motif> and <motif2>" so the image shows the TENSION of both states,
    /// i.e. the change. `modifier` (day-time / season, chosen web-side from the
    /// question) varies the same reading per question. On failure: drop the modifier,
    /// then the change, then a neutral scene.
    ///
    /// NO Apple FM (on-device distillation refused most requests + ignored the
    /// question) and NO "ink-wash" suffix (it only pulled images toward generic
    /// mountain-water). All deterministic.
    static func generateMeditationImage(motif: String, motif2: String, modifier: String) async throws -> Data {
        let mod = modifier.trimmingCharacters(in: .whitespacesAndNewlines)
        let m2 = motif2.trimmingCharacters(in: .whitespacesAndNewlines)
        // On a changing line: a SPATIAL composition — the resulting motif (where the
        // change leads, and often the one that gets swallowed) in the foreground, the
        // primary behind it. Giving each its own depth plane keeps a visually weaker
        // motif present instead of being eaten by a dominant one. The modifier
        // (day-time / season from the question) sets the mood.
        func prompt(change: Bool, useMod: Bool) -> String {
            var p = change && !m2.isEmpty
                ? "\(m2) in the foreground, with \(motif) in the background"
                : motif
            if useMod, !mod.isEmpty { p += ", \(mod)" }
            return p
        }
        // 1. spatial composition + modifier
        if let img = try? await render([.text(prompt(change: true, useMod: true))]) { return img }
        // 2. spatial composition, no modifier
        if !m2.isEmpty, let img = try? await render([.text(prompt(change: true, useMod: false))]) { return img }
        // 3. primary motif + modifier (drop the change)
        if let img = try? await render([.text(prompt(change: false, useMod: true))]) { return img }
        // 4. primary motif only
        if let img = try? await render([.text(prompt(change: false, useMod: false))]) { return img }
        // 5. guaranteed-ish neutral scene
        return try await render([.text("a quiet meadow under a wide sky")])
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

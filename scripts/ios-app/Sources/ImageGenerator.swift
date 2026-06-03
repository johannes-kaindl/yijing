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

enum ImageGenError: Error { case unavailable, noImage, encodeFailed }

@available(iOS 18.4, macCatalyst 18.4, *)
enum ImageGenerator {
    /// True when ImageCreator can be instantiated on this device (eligible
    /// hardware + Image Playground set up). Checked once at launch.
    static func available() async -> Bool {
        do { _ = try await ImageCreator(); return true }
        catch { return false }
    }

    /// Generate one sketch-style image from `prompt`, returned as JPEG data (small
    /// enough to hand to the web layer as a data: URL; a 1536px PNG would be ~4 MB).
    /// ImageCreator is finicky: some imagery trips its content filter
    /// (creationFailed). Try the hexagram prompt, then progressively safer,
    /// well-tested fallbacks, so a tap reliably yields an image.
    static func generateJPEG(prompt: String) async throws -> Data {
        // Concrete nature motifs only — abstract mood words ("calm", "serene") get
        // rendered as literal TEXT on signs; concrete subjects yield clean ink-wash.
        let attempts = [
            prompt,
            "a mountain in mist, ink-wash painting",
            "misty hills and a stream, ink-wash painting",
        ]
        var lastError: Error = ImageGenError.noImage
        for p in attempts {
            do { return try await once(prompt: p) }
            catch { lastError = error }
        }
        throw lastError
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

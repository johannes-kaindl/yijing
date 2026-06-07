// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Johannes Kaindl
//
// ImageDiagnostics — DEV-ONLY. Renders a matrix of ImagePlaygroundConcept forms
// over a fixed sample so we can learn ON-DEVICE (or on Mac Catalyst) which concept
// form ImageCreator renders reliably and whether it fuses two motifs (model A) —
// before committing the rendering change. Triggered by a DEV_MODE-only web button
// ({action:"runImageDiagnostics"}); never shipped. Output: the rendered JPEGs + a
// text report, handed to the share sheet so the user can "Save to Files" / AirDrop
// them back for review.
//
// NB: the iOS Simulator cannot render Image Playground (no on-device model) — run
// this via Mac Catalyst on an Apple-Intelligence Mac, or on a physical device.

#if canImport(ImagePlayground)
import Foundation
import ImagePlayground
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
import UIKit

@available(iOS 18.4, macCatalyst 18.4, *)
enum ImageDiagnostics {
    struct Probe { let id: String; let motif: String; let motif2: String; let modifier: String; let scene: String }

    // Small representative sample (kept short so the run stays responsive):
    // change / light, change / dark, and no-change.
    static let probes: [Probe] = [
        .init(id: "01_change_eagle_grain", motif: "a soaring eagle", motif2: "a wide field of golden grain", modifier: "at dawn",
              scene: "a soaring eagle, and beyond it a wide field of golden grain, at dawn"),
        .init(id: "02_change_dark", motif: "a dark river between steep cliffs", motif2: "a glowing lantern in darkness", modifier: "at dusk",
              scene: "a dark river between steep cliffs, with a glowing lantern in darkness rising in the distance, at dusk"),
        .init(id: "03_nochange_well", motif: "an old stone well", motif2: "", modifier: "in warm golden light",
              scene: "an old stone well, in warm golden light"),
    ]

    /// Manual entry (dev "img-diag" button): render + share sheet, with progress.
    static func run(progress: @escaping (String) -> Void,
                    present: @escaping (UIActivityViewController) -> Void) async {
        await MainActor.run { progress("Bilddiagnose startet…") }
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("img-diag", isDirectory: true)
        try? FileManager.default.removeItem(at: dir)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let report = await generate(into: dir, jobs: defaultJobs(), progress: progress)
        try? report.data(using: .utf8)?.write(to: dir.appendingPathComponent("report.txt"))
        let items = ((try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? [])
        await MainActor.run {
            progress("Bilddiagnose fertig — Share-Sheet öffnet sich.")
            present(UIActivityViewController(activityItems: items, applicationActivities: nil))
        }
    }


    private static func defaultJobs() -> [(String, [ImagePlaygroundConcept])] {
        var jobs: [(String, [ImagePlaygroundConcept])] = []
        for p in probes {
            jobs.append(("\(p.id)__multi", multiConcepts(p)))
            jobs.append(("\(p.id)__scene_text", [.text(p.scene)]))
            jobs.append(("\(p.id)__scene_extracted", [.extracted(from: p.scene, title: nil)]))
            jobs.append(("\(p.id)__primary_only", [.text(p.motif)]))
        }
        return jobs
    }


    private static func generate(into dir: URL,
                                 jobs: [(String, [ImagePlaygroundConcept])],
                                 progress: ((String) -> Void)?) async -> String {
        var report = "Image Playground diagnostics\n\n"
        if let creator = try? await ImageCreator() {
            report += "availableStyles: " + creator.availableStyles.map { String(describing: $0) }.joined(separator: ", ") + "\n\n"
        } else {
            report += "ImageCreator() could NOT be instantiated (Image Playground unavailable here).\n\n"
            if let progress { await MainActor.run { progress("Image Playground nicht verfügbar (siehe report.txt).") } }
        }
        let total = jobs.count
        var done = 0
        for (label, concepts) in jobs {
            done += 1
            let n = done
            if let progress { await MainActor.run { progress("Bilddiagnose \(n)/\(total): \(label)…") } }
            do {
                let data = try await render(concepts)
                try data.write(to: dir.appendingPathComponent("\(label).jpg"))
                report += "OK   \(label)\n"
            } catch {
                report += "FAIL \(label): \(error)\n"
            }
        }
        return report
    }

    private static func multiConcepts(_ p: Probe) -> [ImagePlaygroundConcept] {
        var x: [ImagePlaygroundConcept] = [.text(p.motif)]
        if !p.motif2.isEmpty { x.append(.text(p.motif2)) }
        if !p.modifier.isEmpty { x.append(.text(p.modifier)) }
        return x
    }

    private static func render(_ concepts: [ImagePlaygroundConcept]) async throws -> Data {
        let creator = try await ImageCreator()
        let style = creator.availableStyles.first { String(describing: $0).contains("sketch") } ?? creator.availableStyles.first
        guard let style else { throw ImageGenError.unavailable }
        for try await image in creator.images(for: concepts, style: style, limit: 1) {
            return try encodeJPEG(image.cgImage)
        }
        throw ImageGenError.noImage
    }

    private static func encodeJPEG(_ cg: CGImage) throws -> Data {
        let data = NSMutableData()
        guard let dest = CGImageDestinationCreateWithData(data, UTType.jpeg.identifier as CFString, 1, nil) else { throw ImageGenError.encodeFailed }
        CGImageDestinationAddImage(dest, cg, [kCGImageDestinationLossyCompressionQuality: 0.85] as CFDictionary)
        guard CGImageDestinationFinalize(dest) else { throw ImageGenError.encodeFailed }
        return data as Data
    }
}
#endif

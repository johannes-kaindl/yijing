// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Johannes Kaindl
//
// ModelLocator — picks the on-device model by measured memory headroom and
// resolves its file URL, or returns nil on ineligible / memory-tight devices
// (→ no /v1 endpoint injected → web layer degrades to BYO/non-AI gracefully).
//
// The binding constraint is the per-app jetsam limit, surfaced by
// os_proc_available_memory() — NOT total device RAM (verification-corrected).
// Request com.apple.developer.kernel.increased-memory-limit for headroom.
//
// UNVERIFIED scaffold — thresholds are heuristics to tune on a physical device.

import Foundation
import os

enum ModelLocator {
    struct Model { let name: String; let url: URL }

    // GGUF resources (bundled or delivered via a Background Asset pack). Replace
    // names with the exact files you ship. Qwen3-4B is Apache-2.0 and bundleable;
    // verify the EXACT repo LICENSE before shipping (Qwen licensing is variant-
    // specific — Qwen2.5-3B is NON-COMMERCIAL and must NOT be bundled).
    private static let primary = (name: "qwen3-4b", file: "qwen3-4b-q4_k_m", minAvail: 4.0)
    private static let small   = (name: "qwen3-1.7b", file: "qwen3-1.7b-q4_k_m", minAvail: 2.0)

    static func selectModel() -> Model? {
        let availableGB = Double(os_proc_available_memory()) / 1_073_741_824.0

        if availableGB >= primary.minAvail, let url = resolve(primary.file) {
            return Model(name: primary.name, url: url)
        }
        if availableGB >= small.minAvail, let url = resolve(small.file) {
            return Model(name: small.name, url: url)
        }
        return nil   // ineligible → graceful degradation (web #1 setup card / BYO)
    }

    /// Resolves a GGUF by basename. Checks the main bundle first, then the
    /// Background Asset location. For Background Assets (iOS 26+), replace this
    /// with the AssetPack content URL resolved from the BAManager download.
    private static func resolve(_ basename: String) -> URL? {
        if let url = Bundle.main.url(forResource: basename, withExtension: "gguf") {
            return url
        }
        // TODO (Background Assets): resolve from the downloaded asset pack, e.g.
        //   try await BAManager.shared.contentURL(forAssetPack: "models")
        //     .appendingPathComponent("\(basename).gguf")
        // Gate the WebView's endpoint injection until the pack is downloaded.
        return nil
    }
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Johannes Kaindl
//
// Loads the bundled hexagram JSON for a language. The DE file (hexagrams.json)
// and EN file (hexagrams.en.json) each carry their own register variants; the
// language picks the file, Texts.swift picks the field.

import Foundation

public final class DataStore {
    private static var cache: [String: [Hexagram]] = [:]

    public static func loadAll(lang: Lang, bundle: Bundle = .main) -> [Hexagram] {
        let name = lang == .en ? "hexagrams.en" : "hexagrams"
        if let cached = cache[name] { return cached }
        guard let url = bundle.url(forResource: name, withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let hex = try? JSONDecoder().decode([Hexagram].self, from: data) else { return [] }
        let sorted = hex.sorted { $0.number < $1.number }
        cache[name] = sorted
        return sorted
    }

    public static func hexagram(_ number: Int, lang: Lang, bundle: Bundle = .main) -> Hexagram? {
        loadAll(lang: lang, bundle: bundle).first { $0.number == number }
    }
}

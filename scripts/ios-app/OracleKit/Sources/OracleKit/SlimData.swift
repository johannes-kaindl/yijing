// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Johannes Kaindl
//
// The slim widget slice (data/widget-hexagrams.json, ~25 KB) shared by the iOS
// widget and the watch complication — each bundles the file, Bundle.main resolves
// to the loading extension's bundle. Only what a glanceable surface needs.

import Foundation

public struct SlimHex: Codable {
    public let number: Int
    public let binary: String
    public let name_de: String?
    public let name_en: String?
    public let lead_de_neutral: String?
    public let lead_de_historical: String?
    public let lead_en_neutral: String?
    public let lead_en_historical: String?

    public func name(_ s: OracleSettings) -> String {
        (s.lang == .en ? name_en : name_de) ?? name_de ?? name_en ?? "#\(number)"
    }

    public func lead(_ s: OracleSettings) -> String {
        switch (s.lang, s.register) {
        case (.de, .neutral):    return lead_de_neutral ?? lead_de_historical ?? ""
        case (.de, .historical): return lead_de_historical ?? ""
        case (.en, .neutral):    return lead_en_neutral ?? lead_en_historical ?? ""
        case (.en, .historical): return lead_en_historical ?? ""
        }
    }
}

public enum SlimData {
    public static let all: [SlimHex] = {
        guard let url = Bundle.main.url(forResource: "widget-hexagrams", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let arr = try? JSONDecoder().decode([SlimHex].self, from: data) else { return [] }
        return arr
    }()

    public static func forNumber(_ n: Int) -> SlimHex? { all.first { $0.number == n } }
}

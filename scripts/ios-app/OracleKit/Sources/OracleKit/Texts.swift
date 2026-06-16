// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Johannes Kaindl
//
// Language + register aware accessors. This is the ONLY place that knows the
// field-name asymmetry between the DE and EN JSON files.

import Foundation

public enum Texts {
    public static func name(_ h: Hexagram, _ s: OracleSettings) -> String {
        (s.lang == .en ? h.name_en : h.name_de) ?? h.name_de ?? h.name_en ?? "#\(h.number)"
    }

    public static func judgment(_ h: Hexagram, _ s: OracleSettings) -> String {
        switch (s.lang, s.register) {
        case (.de, .neutral):     return h.judgment_neutral ?? h.judgment ?? ""
        case (.de, .historical):  return h.judgment ?? ""
        case (.en, .neutral):     return h.judgment_en_neutral ?? h.judgment_en ?? ""
        case (.en, .historical):  return h.judgment_en ?? ""
        }
    }

    public static func image(_ h: Hexagram, _ s: OracleSettings) -> String {
        switch (s.lang, s.register) {
        case (.de, .neutral):     return h.image_neutral ?? h.image ?? ""
        case (.de, .historical):  return h.image ?? ""
        case (.en, .neutral):     return h.image_en_neutral ?? h.image_en ?? ""
        case (.en, .historical):  return h.image_en ?? ""
        }
    }

    /// The "Kernsatz" — the FIRST paragraph of the judgment (the oracular Judgment
    /// line itself; Wilhelm's commentary follows after a blank line). Verse newlines
    /// collapsed; an unusually long single paragraph falls back to its first sentence.
    /// Mirrors scripts/build_widget_slice.py `lead()`.
    public static func judgmentLead(_ h: Hexagram, _ s: OracleSettings) -> String {
        let firstPara = judgment(h, s).components(separatedBy: "\n\n").first ?? ""
        let collapsed = firstPara.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
        if collapsed.count > 140, let r = collapsed.range(of: ". ") {
            return String(collapsed[..<r.lowerBound]) + "."
        }
        return collapsed
    }

    public static func lineText(_ l: HexLine, _ s: OracleSettings) -> (pos: String, text: String, interp: String) {
        switch (s.lang, s.register) {
        case (.de, .neutral):     return (l.position ?? "", l.text ?? "", l.interpretation_neutral ?? l.interpretation ?? "")
        case (.de, .historical):  return (l.position ?? "", l.text ?? "", l.interpretation ?? "")
        case (.en, .neutral):     return (l.position_en ?? "", l.text_en ?? "", l.interpretation_en_neutral ?? l.interpretation_en ?? "")
        case (.en, .historical):  return (l.position_en ?? "", l.text_en ?? "", l.interpretation_en ?? "")
        }
    }
}

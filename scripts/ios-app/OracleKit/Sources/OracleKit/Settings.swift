// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Johannes Kaindl
//
// Language + register, read from the shared App Group container (the iOS app
// mirrors its localStorage settings there). Falls back to the device locale and
// the neutral register when nothing has been written yet.

import Foundation

public enum Lang: String { case de, en }
public enum Register: String { case neutral, historical }

public struct OracleSettings {
    public let lang: Lang
    public let register: Register

    public static let appGroup = "group.page.codeberg.jkaindl.Yijing"

    public init(lang: Lang, register: Register) {
        self.lang = lang
        self.register = register
    }

    public static func current() -> OracleSettings {
        let d = UserDefaults(suiteName: appGroup)
        let isEN = (Locale.preferredLanguages.first ?? "de").lowercased().hasPrefix("en")
        let lang = Lang(rawValue: d?.string(forKey: "language") ?? "") ?? (isEN ? .en : .de)
        let register = Register(rawValue: d?.string(forKey: "register") ?? "") ?? .neutral
        return OracleSettings(lang: lang, register: register)
    }
}

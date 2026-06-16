// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Johannes Kaindl
//
// Brand palette for the watch app + widgets (mirrors web/style.css :root, dark).
// Standalone (keeps OracleKit free of a SwiftUI dependency). Listed in every UI
// target that needs it; each target compiles its own copy — no symbol clash.

import SwiftUI

enum Brand {
    static let gold     = Color(red: 0.780, green: 0.604, blue: 0.290) // #c79a4a
    static let ink      = Color(red: 0.925, green: 0.894, blue: 0.827) // #ece4d3
    static let inkSoft  = Color(red: 0.722, green: 0.678, blue: 0.588) // #b8ad96
    static let line     = Color(red: 0.267, green: 0.247, blue: 0.208) // #443f35
    static let widgetBg = Color(red: 0.102, green: 0.094, blue: 0.078) // #1a1814
}

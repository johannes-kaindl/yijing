// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Johannes Kaindl
//
// "Heute" — the deterministic daily hexagram (no changing lines), Judgment only.

import SwiftUI
import OracleKit

struct TodayView: View {
    private let s = OracleSettings.current()

    var body: some View {
        let n = Daily.hexagramNumber()
        let hex = DataStore.hexagram(n, lang: s.lang)
        ScrollView {
            HexReadingView(binary: hex?.binary ?? "000000", hex: hex, settings: s, fallbackNumber: n)
        }
        .navigationTitle(WatchStrings(lang: s.lang).today)
    }
}

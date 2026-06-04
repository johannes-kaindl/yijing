// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Johannes Kaindl
//
// "Heute" — the deterministic daily hexagram (single hexagram, no changing
// lines), with its Judgment text.

import SwiftUI
import OracleKit

struct TodayView: View {
    private let s = OracleSettings.current()

    var body: some View {
        let n = Daily.hexagramNumber()
        let hex = DataStore.hexagram(n, lang: s.lang)
        ScrollView {
            VStack(spacing: 10) {
                WatchHexFigure(binary: hex?.binary ?? "000000")
                    .frame(width: 84, height: 64)
                Text(hex.map { Texts.name($0, s) } ?? "#\(n)")
                    .font(.headline)
                    .multilineTextAlignment(.center)
                if let hex {
                    Text(Texts.judgment(hex, s))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(.horizontal, 4)
        }
        .navigationTitle(WatchStrings(lang: s.lang).today)
    }
}

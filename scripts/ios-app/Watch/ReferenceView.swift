// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Johannes Kaindl
//
// "Nachschlagen" — browse all 64 hexagrams (crown-scrollable list) → full detail
// reader (Judgment + Image + line texts). Offline, from the bundled JSON.

import SwiftUI
import OracleKit

struct ReferenceListView: View {
    private let s = OracleSettings.current()
    private let all: [Hexagram] = DataStore.loadAll(lang: OracleSettings.current().lang)
        .sorted { $0.number < $1.number }

    var body: some View {
        List(all, id: \.number) { hex in
            NavigationLink {
                ReferenceDetailView(hex: hex, settings: s)
            } label: {
                HStack(spacing: 10) {
                    WatchHexFigure(binary: hex.binary, lineHeight: 3, spacing: 2)
                        .frame(width: 26, height: 22)
                    Text("\(hex.number)")
                        .font(.caption).foregroundStyle(Brand.gold)
                        .frame(width: 26, alignment: .trailing)
                    Text(Texts.name(hex, s)).font(.body).foregroundStyle(Brand.ink).lineLimit(1)
                }
            }
        }
        .navigationTitle(WatchStrings(lang: s.lang).reference)
    }
}

struct ReferenceDetailView: View {
    let hex: Hexagram
    let settings: OracleSettings

    var body: some View {
        ScrollView {
            HexReadingView(binary: hex.binary, hex: hex, settings: settings,
                           showImage: true, showLines: true, fallbackNumber: hex.number)
        }
        .navigationTitle("\(hex.number)")
    }
}

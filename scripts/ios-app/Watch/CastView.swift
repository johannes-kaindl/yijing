// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Johannes Kaindl
//
// "Orakel befragen" — full three-coin cast with changing lines + the resulting
// (future) hexagram. The cast figure reveals bottom→top (mirrors the iPhone),
// then the text + resulting hexagram fade in; Reduce Motion renders instantly.

import SwiftUI
import OracleKit

struct CastView: View {
    @State private var lines: [Casting.Line]?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private let s = OracleSettings.current()
    @ScaledMetric private var glyph: CGFloat = 40

    var body: some View {
        Group {
            if let lines {
                ReadingView(lines: lines, settings: s, reduceMotion: reduceMotion) {
                    self.lines = Casting.cast()
                }
                .id(lines.map { String($0.value) }.joined())  // restart animation on recast
            } else {
                VStack(spacing: 14) {
                    Text("易經").font(.system(size: glyph)).foregroundStyle(Brand.ink)
                    Button(WatchStrings(lang: s.lang).cast) { lines = Casting.cast() }
                        .buttonStyle(.borderedProminent)
                        .tint(Brand.gold)
                }
            }
        }
        .navigationTitle(WatchStrings(lang: s.lang).cast)
    }
}

struct ReadingView: View {
    let lines: [Casting.Line]
    let settings: OracleSettings
    let reduceMotion: Bool
    let recast: () -> Void
    @State private var textShown = false

    var body: some View {
        let primaryBin = Casting.binary(lines)
        let n = Casting.kingWen(primaryBin) ?? 1
        let hex = DataStore.hexagram(n, lang: settings.lang)
        let changing = Set(lines.indices.filter { Casting.lineState(lines[$0].value).changing })
        let targetHex: Hexagram? = changing.isEmpty ? nil
            : Casting.kingWen(Casting.binary(lines, useTarget: true)).flatMap { DataStore.hexagram($0, lang: settings.lang) }
        let str = WatchStrings(lang: settings.lang)
        let stagger: Double? = reduceMotion ? nil : 0.28

        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                // Primary (cast) hexagram — figure animates, then text + changing lines fade in.
                HexReadingView(binary: primaryBin, changing: changing, hex: hex, settings: settings,
                               showLines: true, revealStagger: stagger,
                               textOpacity: textShown ? 1 : 0, fallbackNumber: n)

                // Resulting (future) hexagram — full figure + name + Judgment, like the app.
                if let targetHex {
                    VStack(alignment: .leading, spacing: 8) {
                        Label(str.becomes, systemImage: "arrow.down")
                            .font(.caption).foregroundStyle(Brand.gold)
                            .frame(maxWidth: .infinity)
                        HexReadingView(binary: targetHex.binary, hex: targetHex, settings: settings,
                                       fallbackNumber: targetHex.number)
                    }
                    .opacity(textShown ? 1 : 0)
                }

                Button(str.again, action: recast)
                    .buttonStyle(.bordered)
                    .tint(Brand.gold)
                    .padding(.top, 4)
                    .frame(maxWidth: .infinity)
                    .opacity(textShown ? 1 : 0)
            }
            .padding(.horizontal, 4)
        }
        .task {
            if reduceMotion { textShown = true; return }
            try? await Task.sleep(nanoseconds: UInt64(Double(lines.count) * 0.28 * 1_000_000_000))
            withAnimation(.easeIn(duration: 0.3)) { textShown = true }
        }
    }
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Johannes Kaindl
//
// "Werfen" — a real consultation: full three-coin cast with changing lines and
// the resulting hexagram. Abgespeckt = Judgment + changing-line texts only, no
// AI, no Image/Meaning/Trigram sections.

import SwiftUI
import OracleKit

struct CastView: View {
    @State private var lines: [Casting.Line]?
    private let s = OracleSettings.current()

    var body: some View {
        Group {
            if let lines {
                ReadingView(lines: lines, settings: s) { self.lines = Casting.cast() }
            } else {
                VStack(spacing: 14) {
                    Text("易經").font(.system(size: 44))
                    Button(WatchStrings(lang: s.lang).cast) { lines = Casting.cast() }
                        .buttonStyle(.borderedProminent)
                }
            }
        }
        .navigationTitle(WatchStrings(lang: s.lang).cast)
    }
}

struct ReadingView: View {
    let lines: [Casting.Line]
    let settings: OracleSettings
    let recast: () -> Void

    var body: some View {
        let primaryBin = Casting.binary(lines)
        let n = Casting.kingWen(primaryBin) ?? 1
        let hex = DataStore.hexagram(n, lang: settings.lang)
        let changing = Set(lines.indices.filter { Casting.lineState(lines[$0].value).changing })
        let targetHex: Hexagram? = changing.isEmpty ? nil
            : Casting.kingWen(Casting.binary(lines, useTarget: true)).flatMap { DataStore.hexagram($0, lang: settings.lang) }
        let str = WatchStrings(lang: settings.lang)

        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                WatchHexFigure(binary: primaryBin, changing: changing)
                    .frame(width: 84, height: 64)
                    .frame(maxWidth: .infinity)
                Text(hex.map { Texts.name($0, settings) } ?? "#\(n)").font(.headline)
                if let hex {
                    Text(Texts.judgment(hex, settings)).font(.footnote).foregroundStyle(.secondary)
                }
                if !changing.isEmpty, let hex {
                    Text(str.changingLines).font(.caption).foregroundStyle(.tint).padding(.top, 4)
                    ForEach(changing.sorted(), id: \.self) { i in
                        if let allLines = hex.lines, allLines.indices.contains(i) {
                            let lt = Texts.lineText(allLines[i], settings)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(lt.pos).font(.caption2).foregroundStyle(.tint)
                                Text(lt.text).font(.caption)
                            }
                            .padding(.bottom, 2)
                        }
                    }
                    if let targetHex {
                        Text("\(str.becomes) \(Texts.name(targetHex, settings))")
                            .font(.caption).foregroundStyle(.secondary).padding(.top, 4)
                    }
                }
                Button(str.again, action: recast)
                    .buttonStyle(.bordered)
                    .padding(.top, 8)
                    .frame(maxWidth: .infinity)
            }
            .padding(.horizontal, 4)
        }
    }
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Johannes Kaindl
//
// One reading view shared by TodayView, the cast ReadingView and the reference
// detail. Figure scales with Dynamic Type (@ScaledMetric). `showImage`/`showLines`
// add the Wilhelm Image + line texts. `revealStagger` animates the figure (cast);
// `textOpacity` lets the caller fade the text in after the figure.

import SwiftUI
import OracleKit

struct HexReadingView: View {
    let binary: String
    var changing: Set<Int> = []
    let hex: Hexagram?
    let settings: OracleSettings
    var showImage: Bool = false
    var showLines: Bool = false
    var showAllLines: Bool = false   // reference: show all 6; cast: only `changing`
    var revealStagger: Double? = nil
    var textOpacity: Double = 1
    var fallbackNumber: Int = 0

    @ScaledMetric private var figW: CGFloat = 96
    @ScaledMetric private var figH: CGFloat = 72
    @ScaledMetric private var lineH: CGFloat = 5

    var body: some View {
        let str = WatchStrings(lang: settings.lang)
        VStack(alignment: .leading, spacing: 10) {
            WatchHexFigure(binary: binary, changing: changing,
                           lineHeight: lineH, spacing: lineH * 0.75,
                           revealStagger: revealStagger)
                .frame(width: figW, height: figH)
                .frame(maxWidth: .infinity)

            VStack(alignment: .leading, spacing: 8) {
                Text(hex.map { Texts.name($0, settings) } ?? "#\(fallbackNumber)")
                    .font(.headline).foregroundStyle(Brand.ink)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .multilineTextAlignment(.center)

                if let hex {
                    Text(Texts.judgment(hex, settings))
                        .font(.body).foregroundStyle(Brand.ink)

                    if showImage {
                        let img = Texts.image(hex, settings)
                        if !img.isEmpty {
                            Text(str.image).font(.caption).foregroundStyle(Brand.gold).padding(.top, 4)
                            Text(img).font(.body).foregroundStyle(Brand.inkSoft)
                        }
                    }

                    if showLines, let lines = hex.lines {
                        let idxs = showAllLines ? Array(lines.indices) : changing.sorted()
                        if !idxs.isEmpty {
                            Text(showAllLines ? str.lines : str.changingLines)
                                .font(.caption).foregroundStyle(Brand.gold).padding(.top, 4)
                            ForEach(idxs, id: \.self) { i in
                                if lines.indices.contains(i) {
                                    let lt = Texts.lineText(lines[i], settings)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(lt.pos).font(.caption).foregroundStyle(Brand.gold)
                                        Text(lt.text).font(.footnote).foregroundStyle(Brand.ink)
                                    }
                                    .padding(.bottom, 2)
                                }
                            }
                        }
                    }
                }
            }
            .opacity(textOpacity)
        }
        .padding(.horizontal, 4)
    }
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Johannes Kaindl
//
// Six-line hexagram figure for watchOS. Shared by the watch app and the
// complication (both list this file). binary[0] is the bottom line. Solid lines
// use the warm brand ink; changing lines use gold. When `revealStagger` is set,
// the lines fade/scale in bottom→top (the cast animation); nil = render at once.

import SwiftUI

struct WatchHexFigure: View {
    let binary: String
    var changing: Set<Int> = []
    var lineHeight: CGFloat = 4
    var spacing: CGFloat = 3
    /// Per-line reveal delay in seconds (bottom→top). nil = no animation.
    var revealStagger: Double? = nil

    @State private var shown = false

    var body: some View {
        let chars = Array(binary)
        VStack(spacing: spacing) {
            ForEach(chars.indices.reversed(), id: \.self) { i in
                line(at: i, isYang: chars[i] == "1")
                    .opacity(visible ? 1 : 0)
                    .scaleEffect(visible ? 1 : 0.7)
                    .animation(revealStagger.map { .easeOut(duration: 0.22).delay(Double(i) * $0) }, value: shown)
            }
        }
        .onAppear { if revealStagger != nil { shown = true } }
    }

    private var visible: Bool { revealStagger == nil || shown }

    @ViewBuilder
    private func line(at i: Int, isYang: Bool) -> some View {
        let style: AnyShapeStyle = changing.contains(i) ? AnyShapeStyle(Brand.gold) : AnyShapeStyle(Brand.ink)
        if isYang {
            Capsule().foregroundStyle(style).frame(height: lineHeight)
        } else {
            HStack(spacing: lineHeight * 1.6) {
                Capsule().foregroundStyle(style)
                Capsule().foregroundStyle(style)
            }
            .frame(height: lineHeight)
        }
    }
}

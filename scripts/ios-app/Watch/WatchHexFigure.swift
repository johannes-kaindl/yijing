// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Johannes Kaindl
//
// Six-line hexagram figure for watchOS. Shared by the watch app and the
// complication target (both list this file). binary[0] is the bottom line;
// changing lines (a Set of indices) render in the accent/tint colour.

import SwiftUI

struct WatchHexFigure: View {
    let binary: String
    var changing: Set<Int> = []
    var lineHeight: CGFloat = 4
    var spacing: CGFloat = 3

    var body: some View {
        let chars = Array(binary)
        VStack(spacing: spacing) {
            ForEach(chars.indices.reversed(), id: \.self) { i in
                let style: AnyShapeStyle = changing.contains(i) ? AnyShapeStyle(.tint) : AnyShapeStyle(.primary)
                if chars[i] == "1" {
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
    }
}

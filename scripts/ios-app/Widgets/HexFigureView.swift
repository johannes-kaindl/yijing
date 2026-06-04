// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Johannes Kaindl
//
// The six-line hexagram figure as SwiftUI. binary[0] is the BOTTOM line (as in
// web/app.js); the VStack renders top line first, so we iterate top→bottom.
// Yang = one solid bar, yin = two bars with a gap (mirrors web .hex-figure).

import SwiftUI

struct HexFigureView: View {
    let binary: String
    var lineHeight: CGFloat = 4
    var spacing: CGFloat = 3

    var body: some View {
        let chars = Array(binary)
        VStack(spacing: spacing) {
            ForEach(chars.indices.reversed(), id: \.self) { i in
                if chars[i] == "1" {
                    Capsule().frame(height: lineHeight)
                } else {
                    HStack(spacing: lineHeight * 1.6) {
                        Capsule()
                        Capsule()
                    }
                    .frame(height: lineHeight)
                }
            }
        }
    }
}

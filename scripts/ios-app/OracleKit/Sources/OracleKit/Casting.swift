// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Johannes Kaindl
//
// Three-coin cast + King-Wen lookup. 1:1 port of web/app.js:46-121,935 — the
// canonical mapping is shared with scripts/build_data.py and validated by
// scripts/test-kingwen.mjs (the Swift unit tests mirror that check).

import Foundation

public enum Casting {
    public struct Line: Equatable {
        public let value: Int
        public init(value: Int) { self.value = value }
    }

    public struct LineState {
        public let yang: Bool
        public let changing: Bool
        public let target: Int
    }

    /// value 7|9 = yang; 6|9 = changing; target bit (changing flips, stable keeps).
    public static func lineState(_ value: Int) -> LineState {
        let yang = value == 7 || value == 9
        let changing = value == 6 || value == 9
        let target = changing ? (yang ? 0 : 1) : (yang ? 1 : 0)
        return LineState(yang: yang, changing: changing, target: target)
    }

    /// Three-coin toss → value 6...9 (distribution 1:3:3:1).
    public static func tossLine<R: RandomNumberGenerator>(using rng: inout R) -> Line {
        var sum = 0
        for _ in 0..<3 { sum += Bool.random(using: &rng) ? 1 : 0 }
        return Line(value: 6 + sum)
    }

    /// Six lines; index 0 is the bottom line (built first, as in the web app).
    public static func cast() -> [Line] {
        var rng = SystemRandomNumberGenerator()
        return (0..<6).map { _ in tossLine(using: &rng) }
    }

    /// Bottom line is index 0; yang → "1". `useTarget` builds the resulting hexagram.
    public static func binary(_ lines: [Line], useTarget: Bool = false) -> String {
        lines.map { l in
            let st = lineState(l.value)
            return String(useTarget ? st.target : (st.yang ? 1 : 0))
        }.joined()
    }

    /// Reference figure for a known hexagram: "1" → value 7, "0" → value 8.
    public static func linesFromBinary(_ binary: String) -> [Line] {
        binary.map { Line(value: $0 == "1" ? 7 : 8) }
    }

    public static func kingWen(_ binary: String) -> Int? { binaryToKingWen[binary] }

    public static let binaryToKingWen: [String: Int] = [
        "111111": 1, "000000": 2, "100010": 3, "010001": 4, "111010": 5, "010111": 6, "010000": 7, "000010": 8,
        "111011": 9, "110111": 10, "111000": 11, "000111": 12, "101111": 13, "111101": 14, "001000": 15, "000100": 16,
        "100110": 17, "011001": 18, "110000": 19, "000011": 20, "100101": 21, "101001": 22, "000001": 23, "100000": 24,
        "100111": 25, "111001": 26, "100001": 27, "011110": 28, "010010": 29, "101101": 30, "001110": 31, "011100": 32,
        "001111": 33, "111100": 34, "000101": 35, "101000": 36, "101011": 37, "110101": 38, "010100": 39, "001010": 40,
        "110001": 41, "100011": 42, "111110": 43, "011111": 44, "000110": 45, "011000": 46, "010110": 47, "011010": 48,
        "101110": 49, "011101": 50, "100100": 51, "001001": 52, "001011": 53, "110100": 54, "101100": 55, "001101": 56,
        "011011": 57, "110110": 58, "010011": 59, "110010": 60, "110011": 61, "001100": 62, "101010": 63, "010101": 64,
    ]
}

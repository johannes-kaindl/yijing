// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Johannes Kaindl
//
// Deterministic "hexagram of the day". Computed purely from the local calendar
// day, so app, widget and watch agree by construction — no shared state.

import Foundation

public enum Daily {
    /// 1...64 from the LOCAL calendar day (yyyy-MM-dd, djb2 hash). Stable all day,
    /// changes at local midnight.
    public static func hexagramNumber(for date: Date = Date(), calendar: Calendar = .current) -> Int {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        let key = String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
        var hash: UInt32 = 5381
        for b in key.utf8 { hash = (hash &* 33) &+ UInt32(b) }
        return Int(hash % 64) + 1
    }

    /// Next local midnight — used as the widget timeline reload point.
    public static func nextMidnight(after date: Date = Date(), calendar: Calendar = .current) -> Date {
        calendar.nextDate(after: date, matching: DateComponents(hour: 0, minute: 0, second: 0),
                          matchingPolicy: .nextTime) ?? date.addingTimeInterval(86400)
    }
}

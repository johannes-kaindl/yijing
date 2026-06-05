// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Johannes Kaindl
//
// Watch complication: the daily hexagram (figure / name) on Apple's faces.
// Uses the slim slice (OracleKit.SlimData) bundled into this extension.

import WidgetKit
import SwiftUI
import OracleKit

struct ComplicationEntry: TimelineEntry {
    let date: Date
    let number: Int
    let binary: String
    let name: String
}

struct ComplicationProvider: TimelineProvider {
    func placeholder(in context: Context) -> ComplicationEntry { entry() }
    func getSnapshot(in context: Context, completion: @escaping (ComplicationEntry) -> Void) { completion(entry()) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<ComplicationEntry>) -> Void) {
        completion(Timeline(entries: [entry()], policy: .after(Daily.nextMidnight())))
    }
    private func entry() -> ComplicationEntry {
        let s = OracleSettings.current()
        let n = Daily.hexagramNumber()
        let hex = SlimData.forNumber(n)
        return ComplicationEntry(date: Date(), number: n,
                                 binary: hex?.binary ?? "000000",
                                 name: hex?.name(s) ?? "#\(n)")
    }
}

struct ComplicationView: View {
    @Environment(\.widgetFamily) private var family
    let entry: ComplicationEntry

    var body: some View {
        switch family {
        case .accessoryInline:
            Text(entry.name)
        case .accessoryRectangular:
            HStack(spacing: 6) {
                WatchHexFigure(binary: entry.binary, lineHeight: 3, spacing: 2).frame(width: 18)
                Text(entry.name).font(.headline).lineLimit(2)
            }
        default: // accessoryCircular, accessoryCorner
            WatchHexFigure(binary: entry.binary, lineHeight: 3, spacing: 2).padding(4)
        }
    }
}

struct ComplicationWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "YijingComplication", provider: ComplicationProvider()) { entry in
            ComplicationView(entry: entry)
                .containerBackground(.clear, for: .widget)
        }
        .configurationDisplayName("Tages-Hexagramm")
        .description("Das Hexagramm des Tages.")
        .supportedFamilies(Self.families)
    }

    // .accessoryCorner is watchOS-only; guard it so the file also type-checks when
    // the iOS SDK sees it during the embedded cross-platform build.
    static var families: [WidgetFamily] {
        var f: [WidgetFamily] = [.accessoryCircular, .accessoryRectangular, .accessoryInline]
        #if os(watchOS)
        f.append(.accessoryCorner)
        #endif
        return f
    }
}

@main
struct YijingWatchWidgets: WidgetBundle {
    var body: some Widget {
        ComplicationWidget()
    }
}

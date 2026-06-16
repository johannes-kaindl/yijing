// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Johannes Kaindl
//
// "Tages-Hexagramm" widget — a variable bookmark. Shows the deterministic daily
// hexagram (OracleKit.Daily); tapping opens the app's Nachschlagewerk on that
// hexagram via the yijing://h/<n> deep link. Reloads at local midnight.

import WidgetKit
import SwiftUI
import OracleKit

struct DailyEntry: TimelineEntry {
    let date: Date
    let number: Int
    let binary: String
    let name: String
    let lead: String
}

struct DailyProvider: TimelineProvider {
    func placeholder(in context: Context) -> DailyEntry { entry(for: Date()) }

    func getSnapshot(in context: Context, completion: @escaping (DailyEntry) -> Void) {
        completion(entry(for: Date()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<DailyEntry>) -> Void) {
        completion(Timeline(entries: [entry(for: Date())], policy: .after(Daily.nextMidnight())))
    }

    private func entry(for date: Date) -> DailyEntry {
        let s = OracleSettings.current()
        let n = Daily.hexagramNumber(for: date)
        let hex = SlimData.forNumber(n)
        return DailyEntry(date: date, number: n,
                          binary: hex?.binary ?? "000000",
                          name: hex?.name(s) ?? "#\(n)",
                          lead: hex?.lead(s) ?? "")
    }
}

struct DailyHexWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: DailyEntry

    var body: some View {
        Group {
            switch family {
            case .accessoryInline:
                Text(entry.name)
            case .accessoryCircular:
                HexFigureView(binary: entry.binary, lineHeight: 3, spacing: 2).padding(6)
            case .accessoryRectangular:
                HStack(spacing: 8) {
                    HexFigureView(binary: entry.binary, lineHeight: 3, spacing: 2).frame(width: 20)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(entry.name).font(.headline).lineLimit(1)
                        Text(entry.lead).font(.caption2).lineLimit(2)
                    }
                }
            case .systemSmall:
                VStack(spacing: 8) {
                    HexFigureView(binary: entry.binary, tint: Brand.ink).frame(maxWidth: 56)
                    Text(entry.name).font(.caption).fontWeight(.semibold)
                        .foregroundStyle(Brand.ink)
                        .multilineTextAlignment(.center).lineLimit(2)
                }
                .padding()
            default: // systemMedium and any future families
                HStack(spacing: 16) {
                    HexFigureView(binary: entry.binary, tint: Brand.ink).frame(width: 60)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(entry.name).font(.headline).foregroundStyle(Brand.ink).lineLimit(2)
                        Text(entry.lead).font(.caption).foregroundStyle(Brand.inkSoft).lineLimit(4)
                    }
                    Spacer(minLength: 0)
                }
                .padding()
            }
        }
        .containerBackground(for: .widget) {
            switch family {
            case .systemSmall, .systemMedium: Brand.widgetBg
            default: Color.clear
            }
        }
    }
}

struct DailyHexWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "DailyHexWidget", provider: DailyProvider()) { entry in
            DailyHexWidgetView(entry: entry)
                .widgetURL(URL(string: "yijing://h/\(entry.number)"))
        }
        .configurationDisplayName("Tages-Hexagramm")
        .description("Das Hexagramm des Tages — tippen öffnet das Nachschlagewerk.")
        .supportedFamilies([.systemSmall, .systemMedium,
                            .accessoryRectangular, .accessoryCircular, .accessoryInline])
    }
}

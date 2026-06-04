// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Johannes Kaindl
//
// Standalone watchOS app. Two actions: "Heute" (the deterministic daily
// hexagram) and "Werfen" (a full three-coin cast with changing lines + resulting
// hexagram). Pure OracleKit + bundled hexagrams JSON — no network, no LLM.

import SwiftUI
import OracleKit

@main
struct YijingWatchApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}

/// Tiny chrome strings, language picked from the shared settings.
struct WatchStrings {
    let lang: Lang
    var today: String { lang == .en ? "Today" : "Heute" }
    var cast: String { lang == .en ? "Cast" : "Werfen" }
    var changingLines: String { lang == .en ? "Changing lines" : "Wandelnde Linien" }
    var becomes: String { lang == .en ? "becomes" : "wird zu" }
    var again: String { lang == .en ? "Cast again" : "Neu werfen" }
}

struct RootView: View {
    private let s = OracleSettings.current()
    var body: some View {
        NavigationStack {
            List {
                NavigationLink { TodayView() } label: {
                    Label(WatchStrings(lang: s.lang).today, systemImage: "sun.max")
                }
                NavigationLink { CastView() } label: {
                    Label(WatchStrings(lang: s.lang).cast, systemImage: "circle.hexagonpath")
                }
            }
            .navigationTitle("易經")
        }
    }
}

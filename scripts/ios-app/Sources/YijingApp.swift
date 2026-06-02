// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Johannes Kaindl
//
// Yijing Orakel — native iOS/iPadOS app.
//
// Mirrors the macOS app (scripts/macos-app/Yijing.swift): serves the bundled
// web app from an in-process loopback HTTP server (LocalServer, Network.framework)
// and shows it in a full-screen WKWebView. The SAME server additionally exposes
// a loopback OpenAI-compatible /v1 endpoint backed by an on-device LLM, so the
// existing web layer (web/llm.js) talks to it UNCHANGED.
//
// UIKit, no storyboard, no scene manifest (AppDelegate-owned window).
//
// NOTE: This file is part of an UNVERIFIED scaffold — it has not been compiled
// against the iOS SDK in this environment. See scripts/ios-app/README.md for the
// build + on-device verification checklist.

import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions:
                        [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = WebViewController()
        window.makeKeyAndVisible()
        self.window = window
        return true
    }
}

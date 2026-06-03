// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Johannes Kaindl
//
// Root view controller: hosts the WKWebView, starts the loopback server, wires
// the native export bridge (share sheet) and external-link handling. Ported from
// the macOS AppDelegate (scripts/macos-app/Yijing.swift).
//
// UNVERIFIED scaffold — not compiled here. See scripts/ios-app/README.md.

import UIKit
import WebKit

final class WebViewController: UIViewController, WKNavigationDelegate, WKScriptMessageHandler {
    private var server: LocalServer!
    private var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.10, green: 0.094, blue: 0.078, alpha: 1) // --bg dark

        // 1. Pick the on-device engine (Apple Foundation Models → llama.cpp → mock)
        //    and build the OpenAI shim service. On ineligible devices this is nil →
        //    no /v1 endpoint is injected → the web layer's #1 setup card shows and
        //    BYO-endpoint / plain oracle still work.
        let selection = EngineSelector.select()             // nil when no on-device engine
        let llmService = selection.map { LLMService(engine: $0.engine, modelName: $0.name) }

        // 2. Start the loopback server (file serving + optional /v1 shim).
        guard let resourceRoot = Bundle.main.resourceURL else {
            fail("Bundle resources not found."); return
        }
        server = LocalServer(resourceRoot: resourceRoot, llmService: llmService)
        guard server.start() else {
            fail("No free loopback port (8765–8775)."); return
        }

        // 3. Configure the web view + inject the on-device endpoint (if available)
        //    into localStorage BEFORE app.js runs, so it is auto-selected.
        let config = WKWebViewConfiguration()
        config.userContentController.add(self, name: "yijing")
        if let selection = selection {
            config.userContentController.addUserScript(
                endpointInjectionScript(port: server.port, modelName: selection.name))
        }
        let wv = WKWebView(frame: view.bounds, configuration: config)
        wv.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        wv.navigationDelegate = self
        wv.scrollView.contentInsetAdjustmentBehavior = .never
        // Edge-swipe back/forward: lets the user wipe back out of a hexagram the
        // reading linked into the reference reader (web-side Punkt 7 navigation).
        wv.allowsBackForwardNavigationGestures = true
        self.webView = wv
        view.addSubview(wv)

        let url = URL(string: "http://localhost:\(server.port)/web/index.html")!
        wv.load(URLRequest(url: url))

        // Re-bind the loopback server on every return to the foreground: iOS tears
        // its sockets down while suspended, which left the web layer stuck on
        // „nicht erreichbar". (Skip the very first activation — the server was just
        // started above in this same method.)
        NotificationCenter.default.addObserver(
            self, selector: #selector(appDidBecomeActive),
            name: UIApplication.didBecomeActiveNotification, object: nil)
    }

    private var didInitialActivation = false

    @objc private func appDidBecomeActive() {
        guard didInitialActivation else { didInitialActivation = true; return }
        guard let port = server?.restart() else { return }
        // Tell the web layer the server is live again (and on which port) so it
        // re-probes /v1/models and clears any stale „nicht erreichbar".
        webView?.evaluateJavaScript(
            "window.__yijingOnServerResume && window.__yijingOnServerResume('http://localhost:\(port)/v1')",
            completionHandler: nil)
    }

    // MARK: - On-device endpoint injection

    /// Writes the on-device OpenAI-compatible endpoint into the web app's
    /// localStorage at document start, so web/llm.js auto-selects it without
    /// relying on the localhost auto-discovery probes. Same port as the page
    /// origin → same-origin fetches, no CORS, ATS satisfied by http://localhost.
    private func endpointInjectionScript(port: Int, modelName: String) -> WKUserScript {
        // Keep the schema in sync with web/llm.js Endpoints (yijing-endpoints-v1).
        let endpoint: [String: Any] = [
            "id": "on-device",
            "name": "On-Device (\(modelName))",
            "type": "openai",
            "baseUrl": "http://localhost:\(port)/v1",
            "apiKey": "",
            "defaultModel": modelName,
        ]
        let json = (try? JSONSerialization.data(withJSONObject: [endpoint]))
            .flatMap { String(data: $0, encoding: .utf8) } ?? "[]"
        // Only seed if the user has not configured their own endpoints yet, so we
        // never clobber a BYO endpoint the user added on a previous launch.
        let js = """
        (function () {
          try {
            var KEY = 'yijing-endpoints-v1', SEL = 'yijing-endpoint-selected-v1';
            var existing = JSON.parse(localStorage.getItem(KEY) || '[]');
            if (!existing.length) {
              localStorage.setItem(KEY, '\(json.escapedForJSStringLiteral)');
              localStorage.setItem(SEL, 'on-device');
            }
          } catch (e) {}
        })();
        """
        return WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: true)
    }

    // MARK: - Export bridge (web -> native), via the iOS share sheet

    func userContentController(_ ucc: WKUserContentController,
                              didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any],
              let action = body["action"] as? String else { return }
        switch action {
        case "saveMarkdown":
            shareMarkdown(content: body["content"] as? String ?? "",
                          filename: body["filename"] as? String ?? "yijing.md")
        case "savePdf":
            sharePdf(filename: body["filename"] as? String ?? "yijing.pdf")
        default:
            break
        }
    }

    private func shareMarkdown(content: String, filename: String) {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
        do {
            try content.data(using: .utf8)?.write(to: url)
            presentShare(for: url)
        } catch { /* ignore — non-critical export */ }
    }

    private func sharePdf(filename: String) {
        // The web side has already applied the print look (html.exporting + the
        // pdf-bw/pdf-glossy class) before posting; createPDF captures the rendered
        // page incl. CSS backgrounds. Reset the look afterwards.
        let cleanup = { self.webView.evaluateJavaScript(
            "window.__yijingAfterPrint && window.__yijingAfterPrint()", completionHandler: nil) }
        DispatchQueue.main.async {
            self.webView.createPDF(configuration: WKPDFConfiguration()) { result in
                defer { cleanup() }
                guard case .success(let data) = result else { return }
                let url = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
                try? data.write(to: url)
                self.presentShare(for: url)
            }
        }
    }

    private func presentShare(for url: URL) {
        let vc = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        vc.popoverPresentationController?.sourceView = view          // iPad anchor
        vc.popoverPresentationController?.sourceRect =
            CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 0, height: 0)
        present(vc, animated: true)
    }

    // MARK: - Navigation: open external links in the system browser

    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if let host = url.host, host != "localhost", host != "127.0.0.1",
           url.scheme == "http" || url.scheme == "https" {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        let allowed: Set<String> = ["http", "https", "about"]
        decisionHandler(allowed.contains(url.scheme ?? "") ? .allow : .cancel)
    }

    // MARK: - Helpers

    private func fail(_ message: String) {
        let alert = UIAlertController(title: "Yijing Orakel", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
    }
}

private extension String {
    /// Escapes a JSON string so it can be embedded inside a single-quoted JS
    /// string literal in the injection script.
    var escapedForJSStringLiteral: String {
        replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
            .replacingOccurrences(of: "\n", with: "\\n")
    }
}

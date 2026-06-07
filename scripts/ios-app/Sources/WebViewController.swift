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
import WidgetKit

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

        // Probe on-device image generation (Image Playground) once. If available,
        // tell the web layer so it can offer the optional „Meditationsbild" button.
        // NOTE: the Image Playground probe runs in appDidBecomeActive, NOT here —
        // ImageCreator() throws backgroundCreationForbidden if the app isn't active
        // yet, which it isn't during viewDidLoad on iOS.
    }

    private var didInitialActivation = false
    private var imageGenAvailable = false
    private var pageLoaded = false
    private var pendingHexagram: Int?

    @objc private func appDidBecomeActive() {
        // The app is now guaranteed active → safe to probe Image Playground
        // (ImageCreator throws backgroundCreationForbidden when inactive). Retries
        // on each activation until it reports available.
        probeImageGen()

        guard didInitialActivation else { didInitialActivation = true; return }
        guard let port = server?.restart() else { return }
        // Tell the web layer the server is live again (and on which port) so it
        // re-probes /v1/models and clears any stale „nicht erreichbar".
        webView?.evaluateJavaScript(
            "window.__yijingOnServerResume && window.__yijingOnServerResume('http://localhost:\(port)/v1')",
            completionHandler: nil)
    }

    private func probeImageGen() {
        guard !imageGenAvailable else { return } // already available — done
        if #available(iOS 18.4, macCatalyst 18.4, *) {
            #if canImport(ImagePlayground)
            Task {
                let ok = await ImageGenerator.available()
                await MainActor.run {
                    if ok { self.imageGenAvailable = true; self.injectImageGenFlag() }
                }
            }
            #endif
        }
    }

    // MARK: - On-device image generation (Image Playground) bridge

    /// Set window.__yijingImageGen + fire the event. Called from both the probe and
    /// didFinish (page load), in any order — idempotent, so re-firing is harmless.
    private func injectImageGenFlag() {
        guard imageGenAvailable, webView != nil else { return }
        webView?.evaluateJavaScript(
            "window.__yijingImageGen = true; window.dispatchEvent(new Event('yijing:imagegen'))",
            completionHandler: nil)
    }

    private func handleGenerateImage(scene: String, motif: String, motif2: String, modifier: String, requestId: String) {
        guard #available(iOS 18.4, macCatalyst 18.4, *) else {
            sendImageError(requestId, "Bildgenerierung wird auf diesem Gerät nicht unterstützt."); return
        }
        #if canImport(ImagePlayground)
        Task {
            do {
                let jpeg = try await ImageGenerator.generateMeditationImage(scene: scene, motif: motif, motif2: motif2, modifier: modifier)
                let url = "data:image/jpeg;base64," + jpeg.base64EncodedString()
                await MainActor.run { self.sendImageResult(requestId, url) }
            } catch {
                await MainActor.run {
                    self.sendImageError(requestId, "Das Bild konnte nicht erzeugt werden. Versuch es noch einmal.")
                }
            }
        }
        #else
        sendImageError(requestId, "Bildgenerierung nicht verfügbar.")
        #endif
    }

    private func sendImageResult(_ requestId: String, _ dataURL: String) {
        webView?.evaluateJavaScript(
            "window.__yijingImageResult && window.__yijingImageResult(\(jsLiteral(requestId)), \(jsLiteral(dataURL)))",
            completionHandler: nil)
    }
    private func sendImageError(_ requestId: String, _ message: String) {
        webView?.evaluateJavaScript(
            "window.__yijingImageError && window.__yijingImageError(\(jsLiteral(requestId)), \(jsLiteral(message)))",
            completionHandler: nil)
    }
    /// JSON-encode a string as a safe JS string literal (handles quotes/newlines).
    private func jsLiteral(_ s: String) -> String {
        guard let d = try? JSONSerialization.data(withJSONObject: [s]),
              let j = String(data: d, encoding: .utf8) else { return "\"\"" }
        return String(j.dropFirst().dropLast()) // strip the surrounding [ ]
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
        let epJson = (try? JSONSerialization.data(withJSONObject: endpoint))
            .flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
        // Always ensure the on-device endpoint is present and points at the CURRENT
        // loopback port (it can change between launches) — WITHOUT clobbering the
        // user's BYO endpoints. Select it only when there is no valid selection yet,
        // so we never override a backend the user deliberately picked.
        let js = """
        (function () {
          try {
            var KEY = 'yijing-endpoints-v1', SEL = 'yijing-endpoint-selected-v1';
            var ep = JSON.parse('\(epJson.escapedForJSStringLiteral)');
            var list = JSON.parse(localStorage.getItem(KEY) || '[]');
            if (!Array.isArray(list)) list = [];
            var found = -1;
            for (var i = 0; i < list.length; i++) { if (list[i] && list[i].id === ep.id) { found = i; break; } }
            if (found >= 0) { list[found] = ep; } else { list.push(ep); }
            localStorage.setItem(KEY, JSON.stringify(list));
            var sel = localStorage.getItem(SEL), valid = false;
            for (var k = 0; k < list.length; k++) { if (list[k] && list[k].id === sel) { valid = true; break; } }
            if (!valid) localStorage.setItem(SEL, ep.id);
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
        case "generateImage":
            handleGenerateImage(scene: body["scene"] as? String ?? "",
                                motif: body["motif"] as? String ?? "",
                                motif2: body["motif2"] as? String ?? "",
                                modifier: body["modifier"] as? String ?? "",
                                requestId: body["requestId"] as? String ?? "")
        case "runImageDiagnostics":
            // DEV-only (the web button is gated by DEV_MODE). Renders a matrix of
            // ImagePlaygroundConcept forms with live progress + shares the results.
            if #available(iOS 18.4, macCatalyst 18.4, *) {
                #if canImport(ImagePlayground)
                Task { await ImageDiagnostics.run(progress: { [weak self] msg in
                    guard let self else { return }
                    self.webView?.evaluateJavaScript(
                        "window.__yijingDiagStatus && window.__yijingDiagStatus(\(self.jsLiteral(msg)))",
                        completionHandler: nil)
                }, present: { [weak self] vc in
                    guard let self else { return }
                    // Popover anchor required on Mac Catalyst / iPad or present() crashes.
                    vc.popoverPresentationController?.sourceView = self.view
                    vc.popoverPresentationController?.sourceRect =
                        CGRect(x: self.view.bounds.midX, y: self.view.bounds.midY, width: 1, height: 1)
                    self.present(vc, animated: true)
                }) }
                #endif
            }
        case "settings":
            // Mirror language/register into the App Group so the widget + watch
            // reflect the user's choice; refresh widgets immediately.
            let store = UserDefaults(suiteName: "group.page.codeberg.jkaindl.Yijing")
            if let lang = body["language"] as? String { store?.set(lang, forKey: "language") }
            if let reg = body["register"] as? String { store?.set(reg, forKey: "register") }
            WidgetCenter.shared.reloadAllTimelines()
        default:
            break
        }
    }

    // The page may finish loading before the image-gen probe completes (or after);
    // inject the flag from whichever is last.
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        pageLoaded = true
        injectImageGenFlag()
        if let n = pendingHexagram { pendingHexagram = nil; navigateToHexagram(n) }
    }

    // MARK: - Widget deep link → Nachschlagewerk

    /// Open hexagram n in the reader. Deferred until the page has loaded (cold
    /// launch from a widget tap), applied immediately otherwise.
    func openHexagram(_ n: Int) {
        guard (1...64).contains(n) else { return }
        if pageLoaded { navigateToHexagram(n) } else { pendingHexagram = n }
    }

    private func navigateToHexagram(_ n: Int) {
        webView?.evaluateJavaScript("location.hash = '#h=\(n)'", completionHandler: nil)
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
        // fail() is called from viewDidLoad, before the view is in a window — a
        // present() there is a silent no-op and the user sees only the dark
        // background. Show the message inline instead, robust to lifecycle timing.
        let label = UILabel()
        label.text = message
        label.textColor = UIColor(white: 0.85, alpha: 1)
        label.font = .preferredFont(forTextStyle: .body)
        label.numberOfLines = 0
        label.textAlignment = .center
        label.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            label.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 32),
            label.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -32),
        ])
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

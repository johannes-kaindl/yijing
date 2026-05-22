// Yijing Orakel — native macOS-App.
// Startet den lokalen Server (serve.py) und zeigt das Orakel in einem
// eigenen Fenster mit WKWebView. Ersetzt den frueheren bash-Launcher.
import Cocoa
import WebKit

// MARK: - Server-Subprozess

final class Server {
    enum Result { case running, noPython, noPort, startFailed }

    private var process: Process?
    private(set) var port = 0

    func start(yijingDir: String) -> Result {
        guard let python = Server.findPython() else { return .noPython }
        guard let freePort = Server.findFreePort() else { return .noPort }

        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: python)
        proc.arguments = [yijingDir + "/scripts/serve.py"]
        var env = ProcessInfo.processInfo.environment
        env["PORT"] = String(freePort)
        env["YIJING_PARENT_PID"] = String(ProcessInfo.processInfo.processIdentifier)
        proc.environment = env
        do { try proc.run() } catch { return .startFailed }
        process = proc
        port = freePort

        let url = URL(string: "http://localhost:\(freePort)/web/index.html")!
        for _ in 0..<50 {
            if Server.httpOK(url) { return .running }
            Thread.sleep(forTimeInterval: 0.1)
        }
        return .startFailed
    }

    func stop() {
        process?.terminate()
        process = nil
    }

    private static func findPython() -> String? {
        for path in ["/opt/homebrew/bin/python3",
                     "/usr/local/bin/python3",
                     "/usr/bin/python3"] {
            guard FileManager.default.isExecutableFile(atPath: path) else { continue }
            let p = Process()
            p.executableURL = URL(fileURLWithPath: path)
            p.arguments = ["--version"]
            p.standardOutput = FileHandle.nullDevice
            p.standardError = FileHandle.nullDevice
            do {
                try p.run()
                p.waitUntilExit()
                if p.terminationStatus == 0 { return path }
            } catch { continue }
        }
        return nil
    }

    private static func findFreePort() -> Int? {
        for candidate in 8765...8775 {
            let fd = socket(AF_INET, SOCK_STREAM, 0)
            guard fd >= 0 else { continue }
            var addr = sockaddr_in()
            addr.sin_family = sa_family_t(AF_INET)
            addr.sin_port = UInt16(candidate).bigEndian
            addr.sin_addr.s_addr = 0  // INADDR_ANY
            let rc = withUnsafePointer(to: &addr) { ptr in
                ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sa in
                    bind(fd, sa, socklen_t(MemoryLayout<sockaddr_in>.size))
                }
            }
            close(fd)
            if rc == 0 { return candidate }
        }
        return nil
    }

    private static func httpOK(_ url: URL) -> Bool {
        var ok = false
        let sem = DispatchSemaphore(value: 0)
        var req = URLRequest(url: url)
        req.timeoutInterval = 1.0
        URLSession.shared.dataTask(with: req) { _, response, _ in
            if let http = response as? HTTPURLResponse, http.statusCode == 200 {
                ok = true
            }
            sem.signal()
        }.resume()
        _ = sem.wait(timeout: .now() + 1.5)
        return ok
    }
}

// MARK: - App-Delegate

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate {
    private let server = Server()
    private var window: NSWindow!

    func applicationDidFinishLaunching(_ notification: Notification) {
        guard let resourcePath = Bundle.main.resourcePath else {
            fail("Bundle-Ressourcen wurden nicht gefunden.")
            return
        }
        let yijingDir = resourcePath + "/yijing"

        switch server.start(yijingDir: yijingDir) {
        case .running:
            openWindow()
        case .noPython:
            promptInstallTools()
        case .noPort:
            fail("Kein freier Netzwerk-Port (8765 bis 8775) verfügbar. "
               + "Bitte andere Programme schließen und erneut starten.")
        case .startFailed:
            fail("Der lokale Server konnte nicht gestartet werden.")
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        server.stop()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }

    private func openWindow() {
        let webView = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
        webView.navigationDelegate = self

        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 900, height: 820),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered, defer: false)
        window.title = "Yijing Orakel"
        window.contentView = webView
        window.contentMinSize = NSSize(width: 480, height: 600)
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        let url = URL(string: "http://localhost:\(server.port)/web/index.html")!
        webView.load(URLRequest(url: url))
    }

    // Externe Links (Footer: Codeberg, Lizenzen) im Standard-Browser öffnen.
    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = navigationAction.request.url,
           let host = url.host,
           host != "localhost", host != "127.0.0.1",
           url.scheme == "http" || url.scheme == "https" {
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    private func fail(_ message: String) {
        let alert = NSAlert()
        alert.messageText = "Yijing Orakel"
        alert.informativeText = message
        alert.alertStyle = .critical
        alert.runModal()
        NSApp.terminate(nil)
    }

    private func promptInstallTools() {
        let alert = NSAlert()
        alert.messageText = "Yijing Orakel"
        alert.informativeText = "Für das Yijing Orakel müssen einmalig die "
            + "macOS Command Line Tools installiert werden. Folge bitte dem "
            + "Apple-Dialog, der gleich erscheint, und starte die App danach erneut."
        alert.alertStyle = .informational
        alert.runModal()
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/usr/bin/xcode-select")
        p.arguments = ["--install"]
        try? p.run()
        NSApp.terminate(nil)
    }
}

// MARK: - Menü

func buildMainMenu() -> NSMenu {
    let mainMenu = NSMenu()

    let appItem = NSMenuItem()
    mainMenu.addItem(appItem)
    let appMenu = NSMenu()
    appItem.submenu = appMenu
    appMenu.addItem(withTitle: "Yijing Orakel beenden",
                    action: #selector(NSApplication.terminate(_:)),
                    keyEquivalent: "q")

    let editItem = NSMenuItem()
    mainMenu.addItem(editItem)
    let editMenu = NSMenu(title: "Bearbeiten")
    editItem.submenu = editMenu
    editMenu.addItem(withTitle: "Widerrufen",
                     action: Selector(("undo:")), keyEquivalent: "z")
    editMenu.addItem(withTitle: "Wiederholen",
                     action: Selector(("redo:")), keyEquivalent: "Z")
    editMenu.addItem(.separator())
    editMenu.addItem(withTitle: "Ausschneiden",
                     action: #selector(NSText.cut(_:)), keyEquivalent: "x")
    editMenu.addItem(withTitle: "Kopieren",
                     action: #selector(NSText.copy(_:)), keyEquivalent: "c")
    editMenu.addItem(withTitle: "Einsetzen",
                     action: #selector(NSText.paste(_:)), keyEquivalent: "v")
    editMenu.addItem(withTitle: "Alles auswählen",
                     action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")

    return mainMenu
}

// MARK: - Einstieg

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.mainMenu = buildMainMenu()
app.run()

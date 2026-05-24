// Yijing Orakel — native macOS-App.
// Bedient die Orakel-Webseite aus dem eigenen Bundle über einen internen
// HTTP-Server (StaticServer, Network.framework) und zeigt sie in einem
// WKWebView-Fenster. Keine externen Abhängigkeiten — kein Python, keine
// Command-Line-Tools.
import Cocoa
import WebKit

// MARK: - App-Delegate

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate {
    private var server: StaticServer!
    private var window: NSWindow!

    func applicationDidFinishLaunching(_ notification: Notification) {
        guard let resourceURL = Bundle.main.resourceURL else {
            fail("Bundle-Ressourcen wurden nicht gefunden.")
            return
        }
        server = StaticServer(resourceRoot: resourceURL)
        guard server.start() else {
            fail("Kein freier Netzwerk-Port (8765 bis 8775) verfügbar. "
               + "Bitte andere Programme schließen und erneut starten.")
            return
        }
        openWindow()
    }

    func applicationWillTerminate(_ notification: Notification) {
        server?.stop()
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
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        if let host = url.host,
           host != "localhost", host != "127.0.0.1",
           url.scheme == "http" || url.scheme == "https" {
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        // Allowlist — javascript:, data:, file: usw. werden bewusst geblockt.
        let allowed: Set<String> = ["http", "https", "about"]
        decisionHandler(allowed.contains(url.scheme ?? "") ? .allow : .cancel)
    }

    private func fail(_ message: String) {
        let alert = NSAlert()
        alert.messageText = "Yijing Orakel"
        alert.informativeText = message
        alert.alertStyle = .critical
        alert.runModal()
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

@main
struct YijingApp {
    static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        app.setActivationPolicy(.regular)
        app.mainMenu = buildMainMenu()
        // Delegate als statische Property halten, damit ARC ihn nicht
        // freigibt — NSApplication.delegate ist eine weak reference.
        Self.retainedDelegate = delegate
        app.run()
    }

    private static var retainedDelegate: AppDelegate?
}

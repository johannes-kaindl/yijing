// StaticServer — minimaler HTTP/1.1-Server für lokale Bundle-Ressourcen.
//
// Ersetzt das frühere Python-Backend (serve.py). Nutzt Network.framework
// (NWListener), keine Dependencies. GET/HEAD only, mit `Cache-Control:
// no-store` analog zum Python-Pendant.
//
// Threading: alle Verbindungen laufen auf einer eigenen seriellen Queue;
// Datei-I/O blockt diese Queue, ist aber für lokale Static-Files und ein
// einzelnes WebView-Tab unkritisch (~580 KB hexagrams.json einmalig).

import Foundation
import Network

final class StaticServer {
    private var listener: NWListener?
    private let resourceRoot: URL
    private let queue = DispatchQueue(label: "de.kaindl.yijing.server")
    private(set) var port: Int = 0

    init(resourceRoot: URL) {
        self.resourceRoot = resourceRoot.standardizedFileURL
    }

    func start() -> Bool {
        for candidate in 8765...8775 {
            guard let nwPort = NWEndpoint.Port(rawValue: UInt16(candidate)) else { continue }
            let params = NWParameters.tcp
            params.allowLocalEndpointReuse = true
            params.requiredInterfaceType = .loopback
            do {
                let l = try NWListener(using: params, on: nwPort)
                l.newConnectionHandler = { [weak self] conn in
                    self?.handle(conn)
                }
                l.start(queue: queue)
                listener = l
                port = candidate
                return true
            } catch {
                continue
            }
        }
        return false
    }

    func stop() {
        listener?.cancel()
        listener = nil
    }

    // MARK: - Connection-Handling

    private func handle(_ connection: NWConnection) {
        connection.start(queue: queue)
        receiveRequest(connection, buffer: Data())
    }

    private func receiveRequest(_ connection: NWConnection, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 16 * 1024) {
            [weak self] data, _, isComplete, error in
            guard let self = self else { return }
            var buffer = buffer
            if let data = data { buffer.append(data) }

            // Headers enden mit CRLF CRLF.
            let terminator = Data([0x0d, 0x0a, 0x0d, 0x0a])
            if let range = buffer.range(of: terminator) {
                let headers = buffer.subdata(in: 0..<range.lowerBound)
                self.respond(rawHeaders: headers, on: connection)
                return
            }

            // Schutz vor übergroßen Headern.
            if buffer.count > 64 * 1024 {
                self.send(.badRequest, body: Data(), mime: "text/plain", on: connection)
                return
            }

            if isComplete || error != nil {
                connection.cancel()
            } else {
                self.receiveRequest(connection, buffer: buffer)
            }
        }
    }

    private func respond(rawHeaders: Data, on connection: NWConnection) {
        guard let headerString = String(data: rawHeaders, encoding: .utf8),
              let (method, path) = parseRequestLine(headerString) else {
            send(.badRequest, body: Data(), mime: "text/plain", on: connection)
            return
        }
        guard method == "GET" || method == "HEAD" else {
            send(.methodNotAllowed, body: Data(), mime: "text/plain", on: connection)
            return
        }
        serve(path: path, method: method, on: connection)
    }

    private func parseRequestLine(_ headers: String) -> (method: String, path: String)? {
        guard let firstLine = headers.split(separator: "\r\n").first else { return nil }
        let parts = firstLine.split(separator: " ")
        guard parts.count >= 2 else { return nil }
        let method = String(parts[0])
        let rawPath = String(parts[1])
        let path = rawPath.split(separator: "?").first.map(String.init) ?? rawPath
        return (method, path)
    }

    // MARK: - File-Resolution

    private func resolveResource(_ requestPath: String) -> URL? {
        guard let decoded = requestPath.removingPercentEncoding else { return nil }
        var path = decoded
        if path == "/" || path.isEmpty { path = "/web/index.html" }
        guard path.hasPrefix("/") else { return nil }

        // Pfad-Traversal verhindern: keine ..-Segmente, keine Backslashes.
        let segments = path.split(separator: "/").map(String.init)
        if segments.contains("..") || segments.contains("") { return nil }
        if path.contains("\\") { return nil }

        let candidate = resourceRoot.appendingPathComponent(segments.joined(separator: "/"))
        let resolved = candidate.standardizedFileURL
        guard resolved.path.hasPrefix(resourceRoot.path) else { return nil }

        var isDir: ObjCBool = false
        guard FileManager.default.fileExists(atPath: resolved.path, isDirectory: &isDir),
              !isDir.boolValue else { return nil }
        return resolved
    }

    private func serve(path: String, method: String, on connection: NWConnection) {
        guard let fileURL = resolveResource(path) else {
            send(.notFound, body: Data("404 Not Found".utf8), mime: "text/plain; charset=utf-8", on: connection)
            return
        }
        guard let body = try? Data(contentsOf: fileURL) else {
            send(.internalServerError, body: Data("500 Read error".utf8), mime: "text/plain; charset=utf-8", on: connection)
            return
        }
        let mime = mimeType(for: fileURL.pathExtension.lowercased())
        send(.ok, body: method == "HEAD" ? Data() : body, contentLength: body.count, mime: mime, on: connection)
    }

    // MARK: - Response-Writer

    private enum Status: String {
        case ok = "200 OK"
        case badRequest = "400 Bad Request"
        case notFound = "404 Not Found"
        case methodNotAllowed = "405 Method Not Allowed"
        case internalServerError = "500 Internal Server Error"
    }

    private func send(_ status: Status, body: Data, contentLength: Int? = nil,
                      mime: String, on connection: NWConnection) {
        let length = contentLength ?? body.count
        var header = "HTTP/1.1 \(status.rawValue)\r\n"
        header += "Content-Type: \(mime)\r\n"
        header += "Content-Length: \(length)\r\n"
        header += "Cache-Control: no-store, must-revalidate\r\n"
        header += "Connection: close\r\n"
        header += "\r\n"
        var response = Data(header.utf8)
        response.append(body)
        connection.send(content: response, completion: .contentProcessed { _ in
            connection.cancel()
        })
    }

    private func mimeType(for ext: String) -> String {
        switch ext {
        case "html", "htm":   return "text/html; charset=utf-8"
        case "js", "mjs":     return "application/javascript; charset=utf-8"
        case "css":           return "text/css; charset=utf-8"
        case "json":          return "application/json; charset=utf-8"
        case "webmanifest":   return "application/manifest+json"
        case "png":           return "image/png"
        case "jpg", "jpeg":   return "image/jpeg"
        case "svg":           return "image/svg+xml"
        case "ico":           return "image/x-icon"
        case "txt", "md":     return "text/plain; charset=utf-8"
        default:              return "application/octet-stream"
        }
    }
}

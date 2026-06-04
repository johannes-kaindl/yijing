// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Johannes Kaindl
//
// LocalServer — loopback HTTP/1.1 server for the bundled web app PLUS a
// loopback OpenAI-compatible /v1 endpoint backed by an on-device LLM.
//
// Extends the macOS StaticServer (scripts/macos-app/StaticServer.swift):
//   - same NWListener / loopback / port-range / path-traversal hardening
//   - GET/HEAD  → serve bundled files (web/, data/, sw.js …)
//   - GET  /v1/models             → JSON model list (for web/llm.js listModels)
//   - POST /v1/chat/completions   → Server-Sent-Events token stream
//   - OPTIONS                     → 204 (harmless; fetches are same-origin anyway)
//
// The /v1 routes are only active when an LLMService is supplied (i.e. the device
// is AI-eligible). Otherwise the server is a pure static file server and the web
// layer degrades gracefully (#1 setup card / BYO endpoint).
//
// UNVERIFIED scaffold — not compiled here. The SSE/body-reading paths in
// particular need on-device validation (backgrounding, socket suspension,
// cancellation). See scripts/ios-app/README.md.

import Foundation
import Network

final class LocalServer {
    private var listener: NWListener?
    private let resourceRoot: URL
    private let llm: LLMService?
    private let queue = DispatchQueue(label: "de.kaindl.yijing.server")
    private(set) var port: Int = 0

    private let maxConnections = 32
    private var activeConnections = 0

    init(resourceRoot: URL, llmService: LLMService?) {
        self.resourceRoot = resourceRoot.standardizedFileURL
        self.llm = llmService
    }

    // MARK: - Lifecycle (verbatim from StaticServer)

    func start() -> Bool {
        // Prefer the previously-bound port so the endpoint URL injected into the
        // web layer stays valid across a background→foreground re-bind; then the
        // rest of the range. allowLocalEndpointReuse lets us re-grab it even if a
        // just-cancelled listener hasn't fully released the socket yet.
        let preferred = port
        let ports = (8765...8775).contains(preferred)
            ? [preferred] + (8765...8775).filter { $0 != preferred }
            : Array(8765...8775)
        for candidate in ports {
            guard let nwPort = NWEndpoint.Port(rawValue: UInt16(candidate)) else { continue }
            let params = NWParameters.tcp
            params.allowLocalEndpointReuse = true
            params.requiredInterfaceType = .loopback
            do {
                let l = try NWListener(using: params, on: nwPort)
                l.newConnectionHandler = { [weak self] conn in self?.handle(conn) }
                let sem = DispatchSemaphore(value: 0)
                var ready = false
                l.stateUpdateHandler = { state in
                    switch state {
                    case .ready: ready = true; sem.signal()
                    // .waiting (e.g. transient bind failure) is treated as a soft
                    // fail so the loop advances to the next port instead of parking.
                    case .failed, .cancelled, .waiting: sem.signal()
                    default: break
                    }
                }
                l.start(queue: queue)
                // Bounded wait: an NWListener can park without ever signalling.
                // start() runs on the main thread (from viewDidLoad), so an untimed
                // wait is the classic 0x8badf00d watchdog hang — time it out instead.
                if sem.wait(timeout: .now() + 2) == .timedOut { l.cancel(); continue }
                if ready { listener = l; port = candidate; return true }
                l.cancel()
            } catch { continue }
        }
        return false
    }

    func stop() { listener?.cancel(); listener = nil }

    /// Re-bind after the app returns from suspension (iOS tears down the loopback
    /// sockets while backgrounded, leaving the web layer with a dead endpoint →
    /// „nicht erreichbar"). Reuses the same port when possible. Returns the bound
    /// port, or nil if no port in the range was free.
    @discardableResult
    func restart() -> Int? {
        stop()
        return start() ? port : nil
    }

    // MARK: - Connection handling

    private func handle(_ connection: NWConnection) {
        if activeConnections >= maxConnections { connection.cancel(); return }
        activeConnections += 1
        connection.start(queue: queue)
        readRequest(connection, buffer: Data())
    }

    private func finishConnection(_ connection: NWConnection) {
        activeConnections = max(0, activeConnections - 1)
        connection.cancel()
    }

    /// Reads headers, then (for requests with a body) the Content-Length body,
    /// then dispatches. Header cap 64 KB; body cap guards oversized POSTs.
    private func readRequest(_ connection: NWConnection, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) {
            [weak self] data, _, isComplete, error in
            guard let self = self else { return }
            var buffer = buffer
            if let data = data { buffer.append(data) }

            let terminator = Data([0x0d, 0x0a, 0x0d, 0x0a])
            if let range = buffer.range(of: terminator) {
                let headerData = buffer.subdata(in: 0..<range.lowerBound)
                guard let headerString = String(data: headerData, encoding: .utf8),
                      let req = self.parseRequest(headerString) else {
                    self.send(.badRequest, body: Data(), mime: "text/plain", on: connection); return
                }
                let bodySoFar = buffer.subdata(in: range.upperBound..<buffer.count)
                let contentLength = Int(req.headers["content-length"] ?? "") ?? 0
                if contentLength > 0 && bodySoFar.count < contentLength {
                    self.readBody(connection, req: req, body: bodySoFar, expected: contentLength)
                } else {
                    self.dispatch(req: req, body: bodySoFar, on: connection)
                }
                return
            }

            if buffer.count > 64 * 1024 {
                self.send(.badRequest, body: Data(), mime: "text/plain", on: connection); return
            }
            if isComplete || error != nil { self.finishConnection(connection) }
            else { self.readRequest(connection, buffer: buffer) }
        }
    }

    private func readBody(_ connection: NWConnection, req: Request, body: Data, expected: Int) {
        if expected > 4 * 1024 * 1024 {           // 4 MB cap — prompts are small
            send(.badRequest, body: Data(), mime: "text/plain", on: connection); return
        }
        connection.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) {
            [weak self] data, _, isComplete, error in
            guard let self = self else { return }
            var body = body
            if let data = data { body.append(data) }
            if body.count >= expected {
                self.dispatch(req: req, body: body.subdata(in: 0..<expected), on: connection)
            } else if isComplete || error != nil {
                self.finishConnection(connection)
            } else {
                self.readBody(connection, req: req, body: body, expected: expected)
            }
        }
    }

    // MARK: - Routing

    private func dispatch(req: Request, body: Data, on connection: NWConnection) {
        switch (req.method, req.path) {
        case ("OPTIONS", _):
            send(.noContent, body: Data(), mime: "text/plain", on: connection)
        case ("GET", "/v1/models"), ("GET", "/v1/models/"):
            if let llm = llm {
                send(.ok, body: Data(llm.modelsJSON().utf8), mime: "application/json", on: connection)
            } else {
                send(.notFound, body: Data("no on-device model".utf8), mime: "text/plain", on: connection)
            }
        case ("POST", "/v1/chat/completions"):
            guard let llm = llm else {
                send(.notFound, body: Data("no on-device model".utf8), mime: "text/plain", on: connection)
                return
            }
            streamChatCompletion(llm: llm, body: body, on: connection)
        case ("GET", _), ("HEAD", _):
            serveFile(path: req.path, method: req.method, on: connection)
        default:
            send(.methodNotAllowed, body: Data(), mime: "text/plain", on: connection)
        }
    }

    // MARK: - /v1/chat/completions (SSE)

    private func streamChatCompletion(llm: LLMService, body: Data, on connection: NWConnection) {
        // Open the SSE stream, then drive token generation on a background queue
        // (never this serial NWListener queue). The responder serializes writes
        // and closes the connection on completion.
        let responder = SSEResponder(connection: connection, queue: queue) { [weak self] in
            self?.finishConnection(connection)
        }
        // If the client disconnects (web AbortSignal → fetch abort → TCP close),
        // NWConnection reports a failure on the next send → responder cancels the
        // engine via the stop token.
        llm.streamChatCompletion(requestBody: body, responder: responder)
    }

    // MARK: - File serving (from StaticServer)

    private func serveFile(path: String, method: String, on connection: NWConnection) {
        guard let fileURL = resolveResource(path) else {
            send(.notFound, body: Data("404 Not Found".utf8), mime: "text/plain; charset=utf-8", on: connection)
            return
        }
        guard let fileBody = try? Data(contentsOf: fileURL) else {
            send(.internalServerError, body: Data("500 Read error".utf8), mime: "text/plain; charset=utf-8", on: connection)
            return
        }
        let mime = mimeType(for: fileURL.pathExtension.lowercased())
        send(.ok, body: method == "HEAD" ? Data() : fileBody, contentLength: fileBody.count, mime: mime, on: connection)
    }

    private func resolveResource(_ requestPath: String) -> URL? {
        guard let decoded = requestPath.removingPercentEncoding else { return nil }
        var path = decoded
        if path == "/" || path.isEmpty { path = "/web/index.html" }
        guard path.hasPrefix("/") else { return nil }
        let segments = path.split(separator: "/").map(String.init)
        if segments.contains("..") { return nil }
        if path.contains("\\") || path.contains("//") { return nil }
        let candidate = resourceRoot.appendingPathComponent(segments.joined(separator: "/"))
        let resolved = candidate.standardizedFileURL
        guard resolved.path.hasPrefix(resourceRoot.path) else { return nil }
        var isDir: ObjCBool = false
        guard FileManager.default.fileExists(atPath: resolved.path, isDirectory: &isDir),
              !isDir.boolValue else { return nil }
        return resolved
    }

    // MARK: - Request parsing

    struct Request { let method: String; let path: String; let headers: [String: String] }

    private func parseRequest(_ headers: String) -> Request? {
        let lines = headers.split(separator: "\r\n", omittingEmptySubsequences: false)
        guard let first = lines.first else { return nil }
        let parts = first.split(separator: " ")
        guard parts.count >= 2 else { return nil }
        let method = String(parts[0])
        let rawPath = String(parts[1])
        let path = rawPath.split(separator: "?").first.map(String.init) ?? rawPath
        var dict: [String: String] = [:]
        for line in lines.dropFirst() {
            guard let colon = line.firstIndex(of: ":") else { continue }
            let key = line[line.startIndex..<colon].trimmingCharacters(in: .whitespaces).lowercased()
            let value = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
            dict[key] = value
        }
        return Request(method: method, path: path, headers: dict)
    }

    // MARK: - Plain response writer

    private enum Status: String {
        case ok = "200 OK"
        case noContent = "204 No Content"
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
        header += "Connection: close\r\n\r\n"
        var response = Data(header.utf8)
        response.append(body)
        connection.send(content: response, completion: .contentProcessed { [weak self] _ in
            self?.queue.async { self?.finishConnection(connection) }
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

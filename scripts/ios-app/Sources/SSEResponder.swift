// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Johannes Kaindl
//
// SSEResponder — serializes Server-Sent-Events writes over a single NWConnection
// and surfaces client disconnects (web AbortSignal → fetch abort → TCP close) as
// `isCancelled`, which the engine loop polls to stop generation promptly.
//
// UNVERIFIED scaffold — not compiled here. Backgrounding / socket-suspension
// behaviour needs on-device validation.

import Foundation
import Network

final class SSEResponder {
    private let connection: NWConnection
    private let queue: DispatchQueue
    private let onFinish: () -> Void
    private var headerSent = false
    private var finished = false

    /// Set when a send fails (the client went away). The engine polls this
    /// between tokens and aborts. Read/written only on `queue`.
    private var cancelled = false
    var isCancelled: Bool { queue.sync { cancelled } }

    init(connection: NWConnection, queue: DispatchQueue, onFinish: @escaping () -> Void) {
        self.connection = connection
        self.queue = queue
        self.onFinish = onFinish
    }

    /// Emits one OpenAI-style SSE chunk: `data: <json>\n\n`. Sends the HTTP
    /// header on first call. Safe to call from any queue.
    func send(_ jsonLine: String) {
        queue.async { [weak self] in
            guard let self = self, !self.finished else { return }
            var out = Data()
            if !self.headerSent {
                self.headerSent = true
                let header = "HTTP/1.1 200 OK\r\n"
                    + "Content-Type: text/event-stream; charset=utf-8\r\n"
                    + "Cache-Control: no-store\r\n"
                    + "Connection: close\r\n\r\n"
                out.append(Data(header.utf8))
            }
            out.append(Data("data: \(jsonLine)\n\n".utf8))
            self.rawSend(out)
        }
    }

    /// Writes the terminal `data: [DONE]` and closes the connection.
    func done() {
        queue.async { [weak self] in
            guard let self = self, !self.finished else { return }
            if !self.headerSent {
                self.headerSent = true
                let header = "HTTP/1.1 200 OK\r\n"
                    + "Content-Type: text/event-stream; charset=utf-8\r\n"
                    + "Cache-Control: no-store\r\nConnection: close\r\n\r\n"
                self.rawSend(Data(header.utf8))
            }
            self.rawSend(Data("data: [DONE]\n\n".utf8))
            self.finished = true
            self.connection.send(content: nil, isComplete: true, completion: .contentProcessed { _ in })
            self.onFinish()
        }
    }

    // Must be called on `queue`.
    private func rawSend(_ data: Data) {
        connection.send(content: data, completion: .contentProcessed { [weak self] error in
            guard let self = self else { return }
            if error != nil {
                self.queue.async { self.cancelled = true }   // client disconnected
            }
        })
    }
}

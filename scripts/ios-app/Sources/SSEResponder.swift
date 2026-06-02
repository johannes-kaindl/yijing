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
    ///
    /// NOTE: captures `self` STRONGLY on purpose. Nothing else retains the
    /// responder once LLMService's inference closure returns, so a `[weak self]`
    /// here lets the responder deallocate before its queued writes run — dropping
    /// the trailing finish chunk + [DONE] and leaving the connection open (the web
    /// client's spinner then hangs). There is no retain cycle (the queued blocks
    /// are one-shot and release self after running).
    func send(_ jsonLine: String) {
        queue.async {
            guard !self.finished else { return }
            var out = Data()
            if !self.headerSent {
                self.headerSent = true
                out.append(Data(Self.sseHeader.utf8))
            }
            out.append(Data("data: \(jsonLine)\n\n".utf8))
            self.rawSend(out)
        }
    }

    private static let sseHeader =
        "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream; charset=utf-8\r\n"
        + "Cache-Control: no-store\r\nConnection: close\r\n\r\n"

    /// Writes the terminal `data: [DONE]` and closes the connection — but only
    /// AFTER that final write has flushed. (Cancelling the connection synchronously
    /// after queuing the write races the flush and drops [DONE], leaving the web
    /// client's spinner hanging even though all content arrived.)
    func done() {
        queue.async {
            guard !self.finished else { return }
            self.finished = true
            var out = Data()
            if !self.headerSent {
                self.headerSent = true
                out.append(Data(Self.sseHeader.utf8))
            }
            out.append(Data("data: [DONE]\n\n".utf8))
            // isComplete: true marks the end of the stream; close only once it flushed.
            self.connection.send(content: out, isComplete: true, completion: .contentProcessed { _ in
                self.queue.async { self.onFinish() }
            })
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

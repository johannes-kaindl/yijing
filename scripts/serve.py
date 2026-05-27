#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Johannes Kaindl
"""Statischer Dev-Server ohne Caching — vermeidet veraltete JS-Module im Browser.

Nur fürs lokale Entwickeln gedacht: bindet auf 127.0.0.1 (nie auf 0.0.0.0),
sendet auf jeder Response `Cache-Control: no-store`. Die macOS-App nutzt
diesen Server nicht — sie bringt einen eigenen Swift-internen Static-Server
mit (siehe scripts/macos-app/StaticServer.swift). Daher braucht es hier
keinerlei Parent-Process-Lifecycle-Logik.
"""

from __future__ import annotations

import functools
import http.server
import os
import sys
from pathlib import Path

PORT = int(os.environ.get("PORT", "8765"))
ROOT = Path(__file__).resolve().parent.parent


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def main() -> None:
    handler = functools.partial(NoCacheHandler, directory=str(ROOT))
    # An 127.0.0.1 binden statt "" (= 0.0.0.0). Dev-Server soll nicht
    # versehentlich für andere Geräte im LAN erreichbar werden.
    server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler)
    print(f"Yijing Orakel:  http://localhost:{PORT}/web/index.html")
    print("(Strg-C zum Beenden)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print()


if __name__ == "__main__":
    sys.exit(main() or 0)

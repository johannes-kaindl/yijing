#!/usr/bin/env python3
"""Statischer Dev-Server ohne Caching — vermeidet veraltete JS-Module im Browser."""

from __future__ import annotations

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
    os.chdir(ROOT)
    server = http.server.ThreadingHTTPServer(("", PORT), NoCacheHandler)
    print(f"Yijing Orakel:  http://localhost:{PORT}/web/index.html")
    print("(Strg-C zum Beenden)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print()


if __name__ == "__main__":
    sys.exit(main() or 0)

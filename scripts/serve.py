#!/usr/bin/env python3
"""Statischer Dev-Server ohne Caching — vermeidet veraltete JS-Module im Browser."""

from __future__ import annotations

import functools
import http.server
import os
import sys
import threading
import time
from pathlib import Path

PORT = int(os.environ.get("PORT", "8765"))
ROOT = Path(__file__).resolve().parent.parent


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def _watch_parent() -> None:
    """Beendet den Server, wenn der Parent-Prozess (die native App)
    verschwindet — verhindert verwaiste Server nach einem Force Quit.
    Nur aktiv, wenn YIJING_PARENT_PID gesetzt ist (von der nativen App).

    Erkennung über os.getppid(): Stirbt der Parent, wird dieser Prozess
    re-parented (zu launchd) — die Parent-PID ändert sich dann. Das ist
    zuverlässiger als os.kill(pid, 0), das einen Zombie-Parent fälsch-
    licherweise als lebendig meldet."""
    if not os.environ.get("YIJING_PARENT_PID"):
        return
    original_parent = os.getppid()

    def loop() -> None:
        while True:
            time.sleep(1)
            if os.getppid() != original_parent:
                os._exit(0)  # Parent weg — Prozess wurde re-parented

    threading.Thread(target=loop, daemon=True).start()


def main() -> None:
    _watch_parent()
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

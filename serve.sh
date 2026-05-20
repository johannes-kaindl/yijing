#!/usr/bin/env bash
# Startet das Yijing-Orakel mit no-cache-Headern und öffnet den Browser.
set -euo pipefail

PORT="${PORT:-8765}"
DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

URL="http://localhost:${PORT}/web/index.html"
echo "Yijing Orakel:  ${URL}"
echo "(Strg-C zum Beenden)"

( sleep 0.5; command -v open >/dev/null && open "${URL}" || true ) &

exec env PORT="${PORT}" python3 "${DIR}/scripts/serve.py"

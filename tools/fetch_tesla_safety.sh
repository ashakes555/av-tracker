#!/usr/bin/env bash
# Refresh Tesla Robotaxi Safety Report data. tesla.com returns Akamai 403 to curl; headless Chrome works.
# Usage: tools/fetch_tesla_safety.sh   (then rerun tools/build_data.py)
set -euo pipefail
cd "$(dirname "$0")/.."
google-chrome --headless=new --no-sandbox --disable-gpu --virtual-time-budget=15000 \
  --user-agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36" \
  --dump-dom https://www.tesla.com/robotaxi/safety > ext/tesla_safety_chrome.html
.venv/bin/python tools/extract_tesla_safety.py ext/tesla_safety_chrome.html

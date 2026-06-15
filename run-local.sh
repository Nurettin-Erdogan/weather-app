#!/usr/bin/env bash
# Start a simple local HTTP server on port 8000 (Linux / macOS)
cd "$(dirname "$0")"
python3 -m http.server 8000 --bind 127.0.0.1

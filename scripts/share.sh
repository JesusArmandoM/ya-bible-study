#!/usr/bin/env bash
set -euo pipefail

TARGET_PORT="${PORT:-3000}"
TARGET_URL="http://localhost:${TARGET_PORT}"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "Error: 'cloudflared' is not installed." >&2
  echo "Install Cloudflare Quick Tunnels to share '${TARGET_URL}' over public HTTPS/WSS:" >&2
  echo "  macOS (Homebrew): brew install cloudflared" >&2
  echo "  Docs: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" >&2
  exit 1
fi

echo "Opening public HTTPS/WSS tunnel to ${TARGET_URL}..."
exec cloudflared tunnel --url "${TARGET_URL}"

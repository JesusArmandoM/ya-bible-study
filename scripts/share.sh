#!/usr/bin/env bash
set -euo pipefail

TARGET_PORT="${PORT:-3000}"
TARGET_URL="http://localhost:${TARGET_PORT}"

if [ -x "./bin/cloudflared" ]; then
  CLOUDFLARED_BIN="./bin/cloudflared"
elif command -v cloudflared >/dev/null 2>&1; then
  CLOUDFLARED_BIN="cloudflared"
else
  echo "Error: 'cloudflared' is not installed." >&2
  echo "Install Cloudflare Quick Tunnels to share '${TARGET_URL}' over public HTTPS/WSS:" >&2
  echo "  macOS (Homebrew): brew install cloudflared" >&2
  echo "  Docs: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" >&2
  exit 1
fi

echo "Opening public HTTPS/WSS tunnel to ${TARGET_URL}..."
echo "Tip: once the public https://<subdomain>.trycloudflare.com URL appears, restart"
echo "the server with PUBLIC_URL=https://<subdomain>.trycloudflare.com so Title Lobby"
echo "QR codes and join links use the public URL instead of localhost."
exec "${CLOUDFLARED_BIN}" tunnel --url "${TARGET_URL}"

#!/usr/bin/env bash
set -euo pipefail

echo "Repository: $(pwd)"
echo "Harness status: bootstrapped"

if [ ! -d "node_modules" ]; then
  echo "==> Installing npm dependencies..."
  npm install
fi

echo "==> Running TypeScript typecheck..."
npm run typecheck

echo "==> Running Vitest unit and integration suites..."
npm test

echo "==> Building production client and server bundles..."
npm run build

echo ""
echo "Baseline verification passed."
echo "Available commands:"
echo "  - E2E tests: npm run test:e2e"
echo "  - Dev mode:  npm run dev"
echo "  - Prod mode: npm start"
echo "  - Share URL: npm run share  (HTTPS/WSS tunnel via cloudflared)"

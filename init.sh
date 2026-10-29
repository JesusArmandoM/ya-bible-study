#!/usr/bin/env bash
set -euo pipefail

echo "Repository: $(pwd)"
echo "Harness status: pre-bootstrap"
echo "Application stack is not initialized yet."
echo "Next step: implement 'app-shell-single-port-bootstrap' from feature_list.json and update init.sh with real install, test, build, and start commands."
echo "Expected post-bootstrap commands:"
echo "  - Install: npm install"
echo "  - Verify:  npm run typecheck && npm test && npm run build"
echo "  - Dev:     npm run dev"
echo "  - Start:   npm start"
echo "  - Share:   npm run share  (HTTPS/WSS public tunnel for external mobile networks)"

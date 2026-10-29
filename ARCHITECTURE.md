# Architecture

## Overview

**YA Bible Study** is a single-package TypeScript web application serving a mobile-first React SPA, REST endpoints (`/api/*`), and real-time WebSocket synchronization (`/ws`) over **one unified port/origin**. This single-origin topology eliminates CORS/port mismatches across desktop browsers, mobile devices on local Wi-Fi, single-instance cloud containers, and public HTTPS tunnels (`cloudflared` / `ngrok`).

## Module Boundaries & Dependency Direction

```
src/client/  ──imports──▶  src/shared/  ◀──imports──  src/server/
```

- `src/shared/`
  - Pure TypeScript types, constants, and validation contracts shared between browser and server (`src/shared/health.ts`, `src/shared/study.ts`, `src/shared/session.ts`).
  - **Allowed imports**: `src/shared/*` only (no DOM globals, no Node built-ins, no `src/client/*` or `src/server/*`).
- `src/server/`
  - Express + Node `http.Server` + `ws` (`WebSocketServer` in `noServer` mode with `maxPayload: 64 * 1024`, handling HTTP `upgrade` exclusively for `/ws`).
  - `src/server/studies/` holds server-side study curriculum providers (`src/server/studies/greatIsYourFaithSeed.ts` exposing immutable preloaded `StudyDocument` clones via `getDefaultStudyDocument()`) and upcoming deterministic `.md`/`.pdf` parsers.
  - `src/server/sessionStore.ts` implements the in-memory `LiveSessionStore` (`create_session`, `join_session`, `claim_leader`, `reconnect_session`, leader lifecycle commands, secret stripping on public snapshots, and 4-hour inactivity TTL sweep).
  - `src/server/app.ts` exports `createAppServer(options)` wiring `LiveSessionStore` to `/ws` and `GET /api/health` (`activeSessionCount`), with deterministic `start(port, host)` and `close()` lifecycle helpers (including TTL timer disposal) so integration tests bind ephemeral port `0` cleanly.
  - `src/server/index.ts` is the production/dev CLI entrypoint binding `PORT` (default `3000`, or `API_PORT=3001` behind Vite in dev).
  - Routing order on the unified port:
    1. Explicit `/api/*` handlers (`GET /api/health`, `GET /api/studies/default`, and upcoming study upload endpoints).
    2. `/api` JSON `404` fallback (`{ "error": "Not found" }`) so mistyped API calls never receive HTML.
    3. Built `dist/client` static assets + SPA `index.html` fallback for non-`/api`, non-`/ws` `GET`/`HEAD` requests.
    4. HTTP `upgrade` listener routing `/ws` to `WebSocketServer` and rejecting other upgrade paths with `404`.
  - **Allowed imports**: Node built-ins, server packages (`express`, `ws`), `src/server/*`, and `src/shared/*`. Never `src/client/*`.
- `src/client/`
  - React 19 SPA compiled by Vite into `dist/client`.
  - `src/client/styles/tokens.css` & `src/client/styles/global.css`: Sacred Midnight Sanctuary design tokens (`DESIGN.md`), `440px` mobile-first safe-area column (`100dvh`), ambient radial glows, and `>= 16px` form control baseline.
  - `src/client/lib/runtimeUrl.ts`: Dynamic same-origin `/api/*` and `ws://` / `wss://` URL resolution derived from `window.location`.
  - `src/client/lib/sessionSocket.ts`: Typed `/ws` session client and role-scoped `sessionStorage` reconnect credential helpers built on `resolveWebSocketUrl`.
  - `src/client/App.tsx`: Root Midnight Sanctuary application shell.
  - **Allowed imports**: Browser/React packages, `src/client/*`, and `src/shared/*`. Never `src/server/*`.

## Runtime Surfaces

| Mode | Command | Browser Entry | Routing & WebSocket Path |
| :--- | :--- | :--- | :--- |
| **Development** | `npm run dev` | `http://localhost:5173` | Vite (`allowedHosts: true`) serves HMR client and proxies `/api` + `/ws` (`ws: true`) to `tsx watch` backend on `API_PORT=3001`. |
| **Production** | `npm run build && npm start` | `http://localhost:3000` (`PORT`) | Single Node process (`dist/server/index.js`) serves `dist/client`, `/api/*`, and `/ws` on one port. |
| **Public Tunnel** | `npm run share` | `https://<subdomain>.trycloudflare.com` | `cloudflared` forwards HTTPS + WSS traffic directly to the unified local port. |

## Verification Layers

- **Static (`npm run typecheck`)**: Runs `tsc --noEmit` across `tsconfig.client.json`, `tsconfig.server.json`, and root `tsconfig.json` (including `tests/**`).
- **Unit & Integration (`npm test`)**: Vitest suites under `tests/unit/` (`node` + `jsdom`) and `tests/integration/` (ephemeral single-port HTTP + `/ws` server tests).
- **End-to-End (`npm run test:e2e`)**: Playwright (`playwright.config.ts`) builds the production bundle, starts `npm start` on an isolated single port, and runs mobile-viewport (`390x844`) Chromium verification under `tests/e2e/`.
- **Startup Gate (`./init.sh`)**: Non-blocking executable baseline running dependency check, `npm run typecheck`, `npm test`, and `npm run build`.

# Feature Implementation Spec: Single-port TypeScript React server shell serves health check

## Source Feature

- `id`: `app-shell-single-port-bootstrap`
- `area`: `foundation`
- `depends_on`: `[]`
- `status`: `not_started`
- `source`: `feature_list.json`

## Goal

Bootstrap the **YA Bible Study** TypeScript monorepo/single-package application so a single unified HTTP port serves both the **Sacred Midnight Sanctuary** React application shell (implementing `DESIGN.md` color, typography, spacing, and mobile safe-area tokens) and backend endpoints (`GET /api/health` plus `/ws` WebSocket upgrade plumbing), with `allowedHosts: true` enabled for public HTTPS tunnels (`cloudflared` / `ngrok`).

This feature also transitions the repository from `pre-bootstrap` mode to an executable verification baseline: `npm run typecheck`, `npm test` (Vitest), `npm run build`, `npm run test:e2e` (Playwright), and an updated non-blocking `./init.sh`.

## Non-Goals

- Implementing the `"Great Is Your Faith"` seed curriculum or `GET /api/studies/default` (deferred to `preloaded-great-is-your-faith-seed`).
- Implementing `.md` or `.pdf` study upload/parsing endpoints (deferred to `markdown-study-deterministic-parser` and `pdf-study-deterministic-parser`).
- Implementing `LiveSession` room creation, `leaderPin` lock, or `Participant` join `/ws` message handlers (deferred to `ws-live-session-room-lifecycle`).
- Implementing interactive `Study Leader` / `Participant` role-selection cards, PIN sheets, or join forms (deferred to `welcome-role-selection-flow`).
- Mounting Three.js / `@react-three/fiber` `Sacred3DScene` WebGL canvases (deferred to `sacred-3d-persistent-stage`).
- Implementing QR code generation or `PUBLIC_URL` lobby warnings (deferred to `title-lobby-qr-join-start`).

## Job Story

When starting **YA Bible Study** locally, behind a public HTTPS tunnel, or in a single-instance cloud container,
I want one unified port to serve the Midnight Sanctuary React shell, `GET /api/health`, and `/ws` upgrades with repeatable automated checks,
so I can build and verify live study features without cross-origin/port mismatches or blocked external mobile hosts.

## Users And Permissions

- **Unauthenticated Visitor / Hosting Health Probe**: May request `GET /` (receives Midnight Sanctuary React HTML shell) and `GET /api/health` (receives `{ status: "ok", ... }` JSON) over localhost or an external tunnel `Host` header.
- **Role Terminology Invariant**: Any placeholder or status copy in the shell and shared types must use `Study Leader` and `Participant`—never `Assistant`.

## Acceptance Scenarios

### Scenario 1: Single-port production server serves health check and React shell

Given dependencies are installed and `npm run build` has succeeded
When the server starts (`npm start` or test server instance) on a single port `P`
Then `GET http://127.0.0.1:P/api/health` returns HTTP `200` with `Content-Type: application/json` containing `{ "status": "ok", "uptimeSeconds": <number>, "activeSessionCount": 0, "wsReady": true }`
And `GET http://127.0.0.1:P/` returns HTTP `200` with `Content-Type: text/html` mounting the Midnight Sanctuary React shell (`#0B0D17` canvas, `Playfair Display` + `Plus Jakarta Sans` typography, and live server readiness status).

### Scenario 2: Public HTTPS tunnel Host headers and WebSocket upgrades are accepted

Given Vite dev/preview config and the Node HTTP server are configured for tunnel compatibility
When a client sends requests with an external tunnel `Host` header (e.g., `demo-room.trycloudflare.com`) or opens a WebSocket upgrade to `/ws` on the same port
Then Vite `server.allowedHosts` and `preview.allowedHosts` are `true` (not blocking external hosts), `/api` and `/ws` (`ws: true`) proxy cleanly in dev, and the Node server accepts `/ws` upgrades on the unified port.

### Scenario 3: Unknown API routes return JSON 404 while client paths serve SPA shell

Given the unified Node HTTP server is running with built client assets
When a client requests `GET /api/nonexistent`
Then the server responds with HTTP `404` JSON (`{ "error": "Not found" }`) rather than HTML
And when a client requests a non-API client path such as `GET /` (or `/join/ABC123`), the server responds with HTTP `200` `index.html`.

### Scenario 4: Standard non-blocking startup gate (`./init.sh`) passes cleanly

Given a clean checkout of the repository
When an engineer or agent runs `./init.sh`
Then it ensures dependencies are installed, runs `npm run typecheck`, `npm test`, and `npm run build` synchronously without starting long-running dev/prod servers, and exits `0`.

## Repository Research

### Files Inspected

- `AGENTS.md` — startup workflow, terminology rules (`Participant`, never `Assistant`), and definition of done.
- `PROGRESS.md` — confirms repository is in `pre-bootstrap` state with `app-shell-single-port-bootstrap` next.
- `feature_list.json` — defines scope, verification expectations, and downstream dependents (`preloaded-great-is-your-faith-seed`, `ws-live-session-room-lifecycle`, `sacred-3d-persistent-stage`).
- `init.sh` — current `pre-bootstrap` script listing expected `npm` commands (`npm install`, `npm run typecheck && npm test && npm run build`, `npm run dev`, `npm start`, `npm run share`).
- `CONTEXT.md` — canonical domain glossary and rejected term `Assistant`.
- `DESIGN.md` & `ux/1. Welcome.png` — Sacred Midnight Sanctuary palette (`#0B0D17`, `#171B2E`, `#E2A83E`, `#B855C8`, `#6E75F5`), `Playfair Display` + `Plus Jakarta Sans` typography, `440px` mobile column, `100dvh` safe-area layout, and `>= 16px` input font-size rule.
- `docs/technical-discovery.md` & `docs/risks-and-open-questions.md` — single-port `/api` + `/ws` architecture, `allowedHosts: true`, dynamic `ws://` / `wss://` URL resolution, Vitest + Playwright verification stack.
- `.gitignore` — already ignores `node_modules/`, `dist/`, `test-results/`, `playwright-report/`.

### Existing Patterns To Follow

- Node `v24.x` and `npm` `11.x` are available in the workspace; standardize on `npm` + `package-lock.json` as established in `init.sh` and `PROGRESS.md`.
- Keep shared TypeScript contracts in `src/shared/` so client and server share exact API/WS payload types without cross-importing runtime internals.

### Current Gaps

- No `package.json`, `tsconfig*.json`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `src/`, or `tests/` exist yet.
- `ARCHITECTURE.md` and `CONSTRAINTS.md` do not exist yet.
- Playwright Chromium browser binaries are not cached yet (`npx playwright install chromium` required during bootstrap).

## Technical Approach

1. **Single-Package TypeScript Layout (`src/shared`, `src/server`, `src/client`)**:
   - Configure ESM TypeScript (`"type": "module"`) with strict compiler settings (`tsconfig.json`, `tsconfig.client.json`, `tsconfig.server.json`) so `npm run typecheck` checks client, server, and test files with `tsc --noEmit`.
   - `src/shared/health.ts` exports `HealthResponse` (`status: 'ok'`, `uptimeSeconds: number`, `activeSessionCount: number`, `wsReady: boolean`, `timestamp: string`).
2. **Unified Node HTTP + WebSocket Server (`src/server/`)**:
   - Build `createAppServer(options)` in `src/server/app.ts` using `express` + Node `http.createServer` + `ws` (`WebSocketServer({ noServer: true })` handling HTTP `upgrade` exclusively for pathname `/ws`).
   - Expose `GET /api/health` returning `200` JSON matching `HealthResponse`, plus `/api/*` JSON `404` fallback.
   - When `dist/client` exists (or `staticDir` is passed), serve static client assets and SPA `index.html` fallback for non-`/api`, non-`/ws` GET requests on the **same port** (`PORT`, default `3000`). Do not restrict `Host` headers so public tunnels work out of the box.
   - Export clean `start()` / `close()` lifecycle helpers from `createAppServer` so integration tests bind ephemeral port `0` deterministically.
3. **Vite Config & Single-Port Dev/Prod Parity**:
   - Configure `vite.config.ts` with `@vitejs/plugin-react`, `server.allowedHosts: true`, `preview.allowedHosts: true`, and `server.proxy` forwarding `/api` -> `http://127.0.0.1:${API_PORT}` (`3001`) and `/ws` -> `ws://127.0.0.1:${API_PORT}` with `ws: true`.
   - Configure `npm run dev` to run the `tsx watch` backend on `API_PORT=3001` alongside Vite on port `5173` (single browser-facing port), `npm run build` to build client (`dist/client`) and server (`dist/server`), `npm start` to run `node dist/server/index.js` on `PORT` (`3000`), and `npm run share` to invoke `cloudflared tunnel --url http://localhost:${PORT:-3000}` (printing a clear install hint if `cloudflared` is absent).
   - Provide `src/client/lib/runtimeUrl.ts` resolving relative `/api/*` paths and `(protocol === 'https:' ? 'wss:' : 'ws:') + '//' + host + '/ws'` from `window.location` without ever hardcoding `localhost`.
4. **Midnight Sanctuary React Shell (`src/client/`)**:
   - `index.html` loads `Playfair Display` (600, 700, italic) and `Plus Jakarta Sans` (400, 500, 600, 700) from Google Fonts with `Georgia, serif` and `system-ui, sans-serif` fallbacks, sets `viewport-fit=cover`, and mounts `src/client/main.tsx`.
   - `src/client/styles/tokens.css` & `src/client/styles/global.css` define all `DESIGN.md` custom properties (`#0B0D17` background, `#121526` elevated, `#171B2E` surface, `#1F2442` highlight, `#E2A83E` primary gold with `#11131F` foreground, `#B855C8` secondary violet, `#6E75F5` indigo, `#10B981` emerald, `#9A4A38` terracotta, `#F8FAFC` / `#94A3B8` / `#64748B` text, radii, spacing, `100dvh` safe-area sanctuary container up to `440px`, ambient candle-gold/violet radial glow, and `font-size: max(16px, 1rem)` on `input, textarea, select`).
   - `src/client/App.tsx` renders the contemplative Midnight Sanctuary header (`YA` / `BIBLE STUDY` gold emblem + eyebrow, `"Bible Study for Young Adults"` `Playfair Display` `h1`, `"Live interactive sessions for young adults."` subtitle, and a subtle footer status pill polling `GET /api/health` once on mount to display `"v1.0 · Connected in community"` when `status === 'ok'`).

## Expected File Changes

- `package.json` & `package-lock.json` — create; scripts (`dev`, `build`, `start`, `typecheck`, `test`, `test:e2e`, `share`) and dependencies (`react`, `react-dom`, `express`, `ws`, `lucide-react`, `typescript`, `vite`, `@vitejs/plugin-react`, `tsx`, `concurrently`, `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`, `@playwright/test`).
- `tsconfig.json`, `tsconfig.client.json`, `tsconfig.server.json` — create; strict TypeScript configs for client, server, shared, and tests.
- `vite.config.ts` — create; React plugin, `build.outDir: 'dist/client'`, `server.allowedHosts: true`, `preview.allowedHosts: true`, `/api` + `/ws` (`ws: true`) proxy.
- `vitest.config.ts` & `playwright.config.ts` — create; unit/integration test runner and mobile-viewport (`390x844`) E2E config targeting single-port server.
- `index.html` — create; HTML document title `"YA Bible Study"`, mobile safe-area viewport, and webfont links.
- `src/shared/health.ts` — create; shared `HealthResponse` type contract.
- `src/server/app.ts` & `src/server/index.ts` — create; unified Express + `http.Server` + `ws` `/ws` upgrade handler, `GET /api/health`, `/api/*` 404 guard, and static SPA serving.
- `src/client/main.tsx`, `src/client/App.tsx`, `src/client/lib/runtimeUrl.ts`, `src/client/styles/tokens.css`, `src/client/styles/global.css` — create; Midnight Sanctuary React shell, `DESIGN.md` tokens, and dynamic URL helper.
- `scripts/share.sh` (or inline script) — create; helper for `npm run share` (`cloudflared` check + launch).
- `tests/unit/runtime-url.test.ts`, `tests/unit/app-shell.test.tsx`, `tests/integration/server-health.test.ts`, `tests/e2e/app-shell-bootstrap.spec.ts` — create; automated unit, server integration, and Playwright smoke tests.
- `init.sh` — modify; replace `pre-bootstrap` stub with non-blocking install check + `npm run typecheck && npm test && npm run build` + printed follow-up guidance.
- `ARCHITECTURE.md`, `CONSTRAINTS.md`, `AGENTS.md` — create/update durable repo docs (see below).

## Visual Design Impact

- UI involved: yes
- Design source: `DESIGN.md` and `ux/1. Welcome.png` (top brand/hero sanctuary shell only; role selection cards belong to `welcome-role-selection-flow`)
- Screens or states affected: Root Midnight Sanctuary application shell (`loading` health state, `ok` connected community footer pill, `degraded` offline badge if `/api/health` fails)
- New design artifact required: no — `DESIGN.md` and `ux/1. Welcome.png` already specify all tokens and layout rules:
  - Canvas `#0B0D17` with soft candle-gold (`rgba(226, 168, 62, 0.18)`) and liturgical violet (`rgba(184, 85, 200, 0.20)`) radial ambient glows.
  - Centered `440px` max-width sanctuary column (`20px–24px` horizontal padding, `min-height: 100dvh`, safe-area insets).
  - Gold rounded-square sanctuary badge (`#E2A83E` gradient with `#11131F` 4-point star icon) beside `YA` serif mark and `BIBLE STUDY` tracked gold eyebrow (`0.75rem`, uppercase, `0.14em` letter-spacing).
  - Editorial serif heading `"Bible Study for Young Adults"` (`Playfair Display`, `700`) and muted body copy `"Live interactive sessions for young adults."` (`#94A3B8`).

## Durable Documentation Impact

- `ARCHITECTURE.md`: create — Document the `src/client`, `src/server`, and `src/shared` module boundaries, single-port HTTP + `/api` + `/ws` topology (Vite dev proxy vs production Node static+API+WS server), and allowed dependency directions.
- `CONSTRAINTS.md`: create — Codify durable repo-wide invariants: single-origin/dynamic `ws(s)://` resolution (no hardcoded `localhost`), `allowedHosts: true`, `Participant` (never `Assistant`) terminology, Gospel-only Section 3 main reading, server-enforced leader/volunteer gating, `>= 16px` mobile inputs, GPU canvas limits, and zero external AI APIs.
- `AGENTS.md`: update — Reference `ARCHITECTURE.md` and `CONSTRAINTS.md` under `Read First` and note the active verification commands (`./init.sh`, `npm run test:e2e`).
- Other docs: `PROGRESS.md` and `feature_list.json` updated with verification evidence; discovery docs under `docs/` require no changes.

## Implementation Plan

1. Initialize `package.json`, TypeScript configs, Vite (`allowedHosts: true` + `/api` & `/ws` proxy), Vitest, and Playwright configs, then install dependencies and Playwright Chromium.
2. Implement `src/shared/health.ts` and the unified Node HTTP + `/ws` server (`src/server/app.ts`, `src/server/index.ts`) serving `GET /api/health`, `/api/*` JSON 404s, `/ws` upgrades, and built `dist/client` SPA assets on one port.
3. Implement `DESIGN.md` CSS custom properties (`tokens.css`, `global.css`), dynamic origin/WebSocket URL helper (`runtimeUrl.ts`), `index.html`, and the Midnight Sanctuary `App.tsx` shell.
4. Add Vitest unit/integration tests and Playwright single-port mobile smoke test; update `init.sh`, `ARCHITECTURE.md`, `CONSTRAINTS.md`, and `AGENTS.md`; run full verification gates.

## Implementation Tasks

- [ ] Create `package.json`, `tsconfig*.json`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, and `scripts/share.sh`; run `npm install` and `npx playwright install chromium`.
- [ ] Implement `src/shared/health.ts`, `src/server/app.ts`, and `src/server/index.ts` with `GET /api/health`, `/ws` `WebSocketServer` upgrade binding, `/api/*` JSON 404 handling, and static `dist/client` SPA fallback on a single port.
- [ ] Implement `index.html`, `src/client/styles/tokens.css`, `src/client/styles/global.css`, `src/client/lib/runtimeUrl.ts`, `src/client/main.tsx`, and `src/client/App.tsx` matching `DESIGN.md` tokens and terminology rules.
- [ ] Write Vitest unit tests (`runtime-url.test.ts`, `app-shell.test.tsx`, vite config check) and server integration tests (`server-health.test.ts` covering `GET /api/health`, `GET /`, tunnel `Host` header, `/api/unknown` 404, and `/ws` upgrade on the same ephemeral port).
- [ ] Write Playwright E2E test (`tests/e2e/app-shell-bootstrap.spec.ts`) verifying single-port `GET /api/health` (`status: 'ok'`) and mobile (`390x844`) React shell rendering (`#0B0D17` canvas, brand copy, zero `"Assistant"` text).
- [ ] Update `init.sh` to execute non-blocking checks (`npm install` if needed, `npm run typecheck`, `npm test`, `npm run build`) without starting long-running servers, and create/update `ARCHITECTURE.md`, `CONSTRAINTS.md`, and `AGENTS.md`.

## Verification Plan

- Run `./init.sh` and confirm it completes non-blockingly with exit code `0` after running `npm run typecheck`, `npm test`, and `npm run build` (must **not** leave `npm run dev` or `npm start` running).
- Run `npm run test:e2e` (Playwright) against the built single-port production server (`npm start` via Playwright `webServer`) to verify `GET /api/health` returns HTTP `200` `{ status: "ok", ... }` and `GET /` renders the Midnight Sanctuary React shell on the exact same port in a `390x844` mobile viewport.
- Run a direct single-port CLI smoke check (start server on an ephemeral/test port, `curl -fsS http://127.0.0.1:<port>/api/health` and `curl -fsSI http://127.0.0.1:<port>/`, then terminate cleanly).

## Evidence To Capture

- Exit code and summary output of `./init.sh` (`npm run typecheck`, `npm test` count, `npm run build` output sizes).
- Passing Vitest suite names (`runtime-url`, `app-shell`, `server-health`) and Playwright E2E result (`npm run test:e2e`).
- Sample `GET /api/health` HTTP `200` JSON payload and `GET /` `200 text/html` confirmation served from the same port, recorded in `feature_list.json` and `PROGRESS.md`.

## Validator Checklist

- [ ] Implementation stays within `app-shell-single-port-bootstrap` scope (no seed study API, room lifecycle commands, role-selection forms, or Three.js scene added prematurely).
- [ ] `GET /api/health` and `GET /` (Midnight Sanctuary React shell with `DESIGN.md` tokens) are served from one unified port, and `vite.config.ts` sets `allowedHosts: true` plus `/api` and `/ws` (`ws: true`) proxies.
- [ ] Zero occurrences of `"Assistant"` in UI copy or domain types; input baseline enforces `font-size >= 16px`.
- [ ] `./init.sh` runs non-blocking checks (`typecheck`, `test`, `build`) and does not start long-running servers.
- [ ] Focused Playwright E2E test (`npm run test:e2e`) and Vitest unit/integration tests pass with concrete evidence recorded in `feature_list.json` and `PROGRESS.md`.
- [ ] `ARCHITECTURE.md`, `CONSTRAINTS.md`, and `AGENTS.md` are created/updated accurately, and the worktree is clean of stray background processes.

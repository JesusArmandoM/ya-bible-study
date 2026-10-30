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
  - `src/server/studies/` holds server-side study curriculum providers (`src/server/studies/greatIsYourFaithSeed.ts` exposing immutable preloaded `StudyDocument` clones via `getDefaultStudyDocument()`) and deterministic parsers: `src/server/studies/markdownParser.ts` extracting 5-section `StudyDocument` structures from standard numbered Markdown outlines with Section 8 Gospel reconstruction fallback and zero external AI, and `src/server/studies/pdfParser.ts` extracting and normalizing in-memory text from text-based `.pdf` uploads (`unpdf`) with header/footer/page-number stripping, ligature expansion, smart quote normalization, and heading formatting.
  - `src/server/sessionStore.ts` implements the in-memory `LiveSessionStore` (`create_session`, `join_session`, `claim_leader`, `reconnect_session`, leader lifecycle commands, secret stripping on public snapshots, and 4-hour inactivity TTL sweep).
  - `src/server/app.ts` exports `createAppServer(options)` wiring `LiveSessionStore` to `/ws`, `GET /api/health` (`activeSessionCount`), `GET /api/studies/default`, and `POST /api/studies/parse` (supporting `.pdf` and `.md` `multipart/form-data` file uploads, raw binary `application/pdf`, raw `text/markdown`, and JSON payloads up to 10MB with HTTP 413/400 validation error handling and non-PDF/non-MD rejection), with deterministic `start(port, host)` and `close()` lifecycle helpers (including TTL timer disposal) so integration tests bind ephemeral port `0` cleanly.
  - `src/server/index.ts` is the production/dev CLI entrypoint binding `PORT` (default `3000`, or `API_PORT=3001` behind Vite in dev).
  - Routing order on the unified port:
    1. Early `Content-Length` ceiling middleware on `POST /api/studies/parse` rejecting requests > 10MB with HTTP 413.
    2. Body parsers (`express.json({ limit: '10mb' })`, `express.text({ limit: '10mb' })`, `express.raw({ type: 'application/pdf', limit: '10mb' })`, and multer memory upload).
    3. Explicit `/api/*` handlers (`GET /api/health`, `GET /api/studies/default`, `POST /api/studies/parse`).
    4. `/api` JSON `404` fallback (`{ "error": "Not found" }`) so mistyped API calls never receive HTML.
    5. Payload error-handling middleware formatting HTTP 413 `{ "error": "File size exceeds 10MB limit" }`.
    6. Built `dist/client` static assets + SPA `index.html` fallback for non-`/api`, non-`/ws` `GET`/`HEAD` requests.
    7. HTTP `upgrade` listener routing `/ws` to `WebSocketServer` and rejecting other upgrade paths with `404`.
  - **Allowed imports**: Node built-ins, server packages (`express`, `ws`), `src/server/*`, and `src/shared/*`. Never `src/client/*`.
- `src/client/`
  - React 19 SPA compiled by Vite into `dist/client`.
  - `src/client/styles/tokens.css` & `src/client/styles/global.css`: Sacred Midnight Sanctuary design tokens (`DESIGN.md`), `440px` mobile-first safe-area column (`100dvh`), ambient radial glows, and `>= 16px` form control baseline.
  - `src/client/lib/runtimeUrl.ts`: Dynamic same-origin `/api/*` and `ws://` / `wss://` URL resolution derived from `window.location`.
  - `src/client/lib/urlHelpers.ts`: Pure URL join code extractor parsing `/join/:code` pathnames and `?code=` / `?join=` query parameters into validated uppercase session codes.
  - `src/client/lib/sessionSocket.ts`: Typed `/ws` session client and role-scoped `sessionStorage` reconnect credential helpers built on `resolveWebSocketUrl`.
  - `src/client/lib/useLiveSession.ts`: Reactive React hook bridging `createSessionSocketClient` with state management, automatic credential re-hydration, and room actions (`createRoom`, `joinRoom`, `claimLeadership`, `leaveRoom`).
  - `src/client/lib/usePrefersReducedMotion.ts`: Media-query hook synchronizing `(prefers-reduced-motion: reduce)` across 3D and UI motion layers.
  - `src/client/state/sacredStageStore.ts`: Scoped + default `zustand` stage store (`createSacredStageStore`, `useSacredStageStore`, `resolveSacredStage`) with a zero-React-rerender 60fps transient `impulse` channel read directly inside `useFrame`.
  - `src/client/components/stage/`: Persistent single-canvas Three.js PBR hero stage (`Sacred3DScene`, `SacredStageRig`, `sacredStageMath`, `webglSupport`) with offline `RoomEnvironment` studio lighting, 6 procedural stage geometries, pointer tilt spring inertia, background-tab frame pausing, and automatic `SacredFallbackEmblem` SVG/CSS fallback on unavailable or lost WebGL contexts.
  - `src/client/components/welcome/`: Welcome & Role Selection flow components (`WelcomeRoleCards`, `LeaderAccessSheet`, `ParticipantJoinSheet`, `ActiveSessionBanner`) matching `ux/1. Welcome.png` with tactile `motion/react` spring feedback, `>= 16px` inputs, 4-digit PIN claim, and zero "Assistant" copy.
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

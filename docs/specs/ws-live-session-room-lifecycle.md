# Feature Implementation Spec: WebSocket room creation issues leader lock with joinable session code

## Source Feature

- `id`: `ws-live-session-room-lifecycle`
- `area`: `realtime-session`
- `depends_on`: `["app-shell-single-port-bootstrap"]`
- `status`: `not_started`
- `source`: `feature_list.json`

## Goal

Implement the stateful `/ws` room-lifecycle protocol, in-memory `LiveSession` store with 4-hour inactivity TTL cleanup, server-enforced `Study Leader` / `Participant` authorization, and dynamic `ws://` / `wss://` client WebSocket session helper so a `Study Leader` can create a PIN-protected ephemeral room and `Participant`s can join by 6-character `sessionCode` and `displayName` over the unified single-port server.

This slice also wires `getActiveSessionCount` in `createAppServer` to the live session store so `GET /api/health` reports accurate active room counts, enforces an explicit `maxPayload` cap (`64 * 1024` bytes) on `WebSocketServer` (resolving Session 003's recorded risk), and preserves `{ type: 'ping' } -> { type: 'pong' }` heartbeat compatibility without regressing bootstrap checks.

## Non-Goals

- Building the interactive Welcome role-selection cards, Leader PIN claim sheet, or Participant join form UI (deferred to `welcome-role-selection-flow`).
- Preloading `"Great Is Your Faith"` (`GET /api/studies/default`) or parsing `.md` / `.pdf` study uploads (deferred to `preloaded-great-is-your-faith-seed`, `markdown-study-deterministic-parser`, and `pdf-study-deterministic-parser`).
- Building the `Load Your Study` screen, QR code / `PUBLIC_URL` Title Lobby UI, or `Sacred3DScene` WebGL stage (deferred to `leader-load-study-setup-screen`, `title-lobby-qr-join-start`, and `sacred-3d-persistent-stage`).
- Implementing Section 1–5 volunteer hand-raise queues, 30-second `Random Selection` timers, live discussion reflections, or `Screen Wake Lock` foreground hooks (deferred to their respective downstream features).

## Job Story

When starting or joining a live Catholic Young Adult Bible study over mobile or desktop browsers,
I want the `/ws` server to create a single-leader room with a joinable 6-character code, 4-digit recovery PIN, and live `Participant` roster sync,
so only the authenticated `Study Leader` controls room progression while `Participant`s join frictionlessly without accounts or secret leakage.

## Users And Permissions

- **`Study Leader` (exactly `1` active controller per `LiveSession`)**: Created via `create_session` or transferred via valid 4-digit `leaderPin` (`claim_leader`). Holds a private cryptographic `leaderToken` required on every leader-exclusive `/ws` command (`open_lobby`, `start_study`, `next_section`, `close_session`, and future section controls). Receives `leaderPin` and `leaderToken` only on private leader ack frames.
- **`Participant` (`0..N` per `LiveSession`)**: Joins an active room via `join_session` (`sessionCode` + `displayName`), receives a unique `memberId`, private `reconnectToken`, and sanitized public `session` snapshot. Must never receive `leaderPin`, `leaderToken`, or other members' `reconnectToken`s, and must be rejected server-side if attempting any leader-only command.
- **Terminology Invariant**: All shared wire types, server responses, client helpers, and tests must use `'Study Leader'` and `'Participant'`—never `'Assistant'`.

## Acceptance Scenarios

### Scenario 1: Study Leader creates an ephemeral LiveSession and updates `/api/health`

Given the unified server is running with `0` active sessions
When a client connects to `/ws` and sends `{ "type": "create_session", "displayName": " Claire " }`
Then the server replies with `session_created` containing a 6-character uppercase alphanumeric `sessionCode`, a 4-digit numeric `leaderPin`, a non-empty cryptographic `leaderToken`, a private `reconnectToken`, and a `session` snapshot in `'setup'` status with `1` `'Study Leader'` member (`displayName: "Claire"`)
And `GET /api/health` returns `activeSessionCount: 1`.

### Scenario 2: Participants join with duplicate displayName disambiguation and zero secret leakage

Given an active `LiveSession` created by a `Study Leader`
When two `Participant` clients join `/ws` with the same `sessionCode` (even lowercase/padded) and `displayName: "Daniel"`
Then each receives `session_joined` with a distinct `memberId`, `role: "Participant"`, disambiguated `displayName`s (`"Daniel"` and `"Daniel (2)"`), and distinct `avatarPalette` values
And all connected sockets in the room receive `roster_updated` with `3` connected members while neither `session_joined` nor `roster_updated` contains `leaderPin`, `leaderToken`, or any `reconnectToken`.

### Scenario 3: Unauthorized second leaders and Participant leader commands are rejected server-side

Given an active `LiveSession` with an authenticated `Study Leader` and a joined `Participant`
When another client sends `claim_leader` with a missing or wrong `leaderPin`, or the `Participant` (or an unjoined socket) sends a leader command (`open_lobby`, `start_study`, `next_section`, `close_session`) with no token or a bogus `leaderToken`
Then the server responds with `{ "type": "session_error", "code": "INVALID_LEADER_PIN" | "FORBIDDEN_LEADER_ONLY" | "UNAUTHORIZED_LEADER", ... }`, leaves session state unchanged, and preserves the active leader's authority.

### Scenario 4: Valid `leaderPin` handoff rotates `leaderToken` and revokes stale leader authority

Given an active `LiveSession` with an open `Study Leader` socket holding `leaderToken` `T1`
When a new client sends `{ "type": "claim_leader", "sessionCode": "<code>", "leaderPin": "<validPin>", "displayName": "Fr. Marco" }`
Then the server issues a new `leaderToken` `T2` (`T2 !== T1`) in `leader_claimed`, notifies the previous leader socket with `leader_replaced` while revoking its leader binding, keeps exactly `1` `'Study Leader'` entry in `session.members`, and rejects any subsequent leader command using stale token `T1` with `UNAUTHORIZED_LEADER`.

### Scenario 5: Safe member reconnect and 4-hour inactivity TTL cleanup

Given a connected `Participant` (or `Study Leader`) disconnects and reconnects with valid `reconnect_session` credentials (`sessionCode`, `memberId`, and matching `reconnectToken` or `leaderToken`)
When the reconnect frame is processed, the member's existing `memberId` and `displayName` return to `connectionStatus: "connected"` without creating a duplicate `(2)` entry (while mismatched tokens are rejected with `UNAUTHORIZED_RECONNECT`)
And when a `LiveSession` exceeds `4` hours (`14_400_000` ms) without session activity (or `close_session` is invoked by the leader), open room sockets receive `session_closed`, the room is purged from memory, and `GET /api/health` decrements `activeSessionCount` back to `0`.

### Scenario 6: Dynamic `ws://` / `wss://` client resolution and `/ws` heartbeat preservation

Given the client session helper (`src/client/lib/sessionSocket.ts`) is initialized in a browser environment
When `window.location` uses `http:` (LAN/local) vs `https:` (Cloudflare/ngrok tunnel)
Then the helper connects via `ws://<host>/ws` or `wss://<host>/ws` dynamically without hardcoding `localhost`, and sending `{ "type": "ping" }` on `/ws` still returns `{ "type": "pong", "timestamp": "<iso>" }` without unsolicited greeting frames on initial socket open.

## Repository Research

### Files Inspected

- `AGENTS.md`, `CONTEXT.md`, `ARCHITECTURE.md`, `CONSTRAINTS.md` — module dependency rules (`client -> shared <- server`), `Study Leader` / `Participant` terminology, dynamic `ws(s)://` invariant, server-side `leaderToken` gating, and non-blocking `./init.sh`.
- `PROGRESS.md` & `feature_list.json` — `app-shell-single-port-bootstrap` is `accepted`; Session 003 explicitly flagged setting `maxPayload` on `WebSocketServer` in `ws-live-session-room-lifecycle`.
- `docs/user-and-access-model.md`, `docs/domain-model.md`, `docs/technical-discovery.md`, `docs/risks-and-open-questions.md` — single active `Study Leader` lock, auto-generated 6-char `sessionCode` + 4-digit `leaderPin`, duplicate name disambiguation, `sessionStorage` reconnect credentials, and 4-hour inactivity TTL purge.
- `docs/specs/app-shell-single-port-bootstrap.md` — accepted spec format and scope-calibration reference.
- `src/server/app.ts` & `src/server/index.ts` — `createAppServer(options)` currently defaults `getActiveSessionCount` to `() => 0`, mounts `WebSocketServer({ noServer: true })` without `maxPayload`, and handles `{ type: 'ping' } -> { type: 'pong' }`.
- `src/shared/health.ts` & `src/client/lib/runtimeUrl.ts` — already export `SanctuaryRole = 'Study Leader' | 'Participant'` and `resolveWebSocketUrl(pathname, locationOverride)`.
- `src/client/App.tsx`, `playwright.config.ts`, `tests/integration/server-health.test.ts`, `tests/e2e/app-shell-bootstrap.spec.ts` — existing tests attach `ws.once('message')` after sending `ping` and assert bootstrap DOM copy on `/`.

### Existing Patterns To Follow

- `tsconfig.server.json` uses `"moduleResolution": "NodeNext"`, so all relative imports inside `src/shared/**/*.ts` and `src/server/**/*.ts` must include `.js` extensions (e.g., `import type { SanctuaryRole } from './health.js'`).
- Never emit an unsolicited WebSocket frame immediately on `wss.on('connection')`; only reply to client messages or broadcast to sockets already joined to a room so existing `ping -> pong` tests remain 100% compatible.
- `playwright.config.ts` honors `PLAYWRIGHT_PORT` (`PLAYWRIGHT_PORT=3302 npm run test:e2e` in this worktree).

### Current Gaps

- No shared session/WebSocket protocol module (`src/shared/session.ts`) exists yet.
- No server-side `LiveSessionStore` or `/ws` command dispatcher (`src/server/sessionStore.ts`) exists yet, `WebSocketServer` lacks `maxPayload`, and `GET /api/health` always reports `activeSessionCount: 0`.
- No typed client `/ws` session client or `sessionStorage` credential helper (`src/client/lib/sessionSocket.ts`) exists yet.

## Technical Approach

1. **Shared Session & Wire Protocol Contracts (`src/shared/session.ts`)**:
   - Define constants (`SESSION_CODE_LENGTH = 6`, `LEADER_PIN_LENGTH = 4`, `DEFAULT_SESSION_TTL_MS = 4 * 60 * 60 * 1000`, `DEFAULT_WS_MAX_PAYLOAD_BYTES = 64 * 1024`) and types (`LiveSessionStatus`, `AvatarPalette`, `PublicSessionMember`, `PublicLiveSessionSnapshot`, `SessionErrorCode`, `ClientWsMessage`, `ServerWsMessage`) using `role: SanctuaryRole` (`'Study Leader' | 'Participant'`).
   - Include pure validation/normalization helpers (`normalizeSessionCode`, `isValidLeaderPin`, `deriveInitials`) shared by client and server.
2. **In-Memory `LiveSessionStore` & 4-Hour TTL (`src/server/sessionStore.ts`)**:
   - Store internal room records in `Map<string, InternalLiveSession>` holding secret fields (`leaderPin`, `leaderToken`, per-member `reconnectToken`, socket bindings) that are stripped whenever projecting `toPublicSnapshot(session)`.
   - Generate 6-char uppercase unambiguous codes (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789` via `crypto.randomInt`, retrying on collision), zero-padded 4-digit `leaderPin` (`0000`–`9999`), and `base64url` 24-byte `leaderToken` / `reconnectToken` secrets; compare secrets with `crypto.timingSafeEqual`.
   - Disambiguate colliding `displayName`s case-insensitively within a room (`"Daniel"` -> `"Daniel (2)"`, `"Daniel (3)"`), cycling distinct participant `AvatarPalette` tokens (`'indigo'`, `'violet'`, `'emerald'`, `'terracotta'`, `'gold'`) and centered 2-letter uppercase `initials`.
   - Guard socket `close` events by checking that the closing socket is still the active socket for that `memberId` before marking `connectionStatus: 'disconnected'` and broadcasting `roster_updated`.
   - Enforce `DEFAULT_SESSION_TTL_MS` (`4` hours) based on `lastActivityAt` (updated on room creation, join, reconnect, PIN claim, and leader commands—not raw transport `ping`), with injectable `now?: () => number`, `sessionTtlMs?: number`, `sweepIntervalMs?: number`, and deterministic `sweepExpiredSessions()` + `dispose()` timer cleanup.
3. **Server Integration (`src/server/app.ts`)**:
   - Configure `new WebSocketServer({ noServer: true, maxPayload: options.wsMaxPayloadBytes ?? DEFAULT_WS_MAX_PAYLOAD_BYTES })`.
   - Instantiate a `LiveSessionStore` inside `createAppServer` (unless overridden via `options`), default `getActiveSessionCount` to `() => sessionStore.getActiveSessionCount()`, route `/ws` JSON frames through the session handler while preserving `{ type: 'ping' } -> { type: 'pong', timestamp }`, return structured `session_error` (`INVALID_MESSAGE`) on malformed JSON, and call `sessionStore.dispose()` inside `server.close()`.
4. **Client WebSocket Session Helper (`src/client/lib/sessionSocket.ts`)**:
   - Build `createSessionSocketClient(options)` on top of `resolveWebSocketUrl('/ws', options.location)` (`src/client/lib/runtimeUrl.ts`) so `http:` uses `ws://` and `https:` uses `wss://` automatically from `window.location`.
   - Provide Promise-based helpers (`connect`, `ping`, `createSession`, `joinSession`, `claimLeader`, `reconnectSession`, `sendLeaderCommand`, `disconnect`) correlated by `requestId` or message type, plus scoped `sessionStorage` helpers (`saveStoredSessionCredentials`, `loadStoredSessionCredentials`, `clearStoredSessionCredentials`) storing only `{ sessionCode, memberId, role, reconnectToken, leaderToken? }` (never storing `leaderPin` or leader secrets on `Participant` clients).

## Expected File Changes

- `src/shared/session.ts` — create; shared `LiveSession` snapshots, `PublicSessionMember`, `/ws` client/server message unions, error codes, and code/PIN/initials helpers.
- `src/server/sessionStore.ts` — create; in-memory `LiveSessionStore`, collision-safe `sessionCode` + `leaderPin` + token generation, duplicate `displayName` disambiguation, leader authorization & PIN handoff, reconnect handling, and 4-hour inactivity TTL sweeper.
- `src/server/app.ts` — modify; set `maxPayload` (`64 * 1024`) on `WebSocketServer`, wire `LiveSessionStore` into `/ws` message/close lifecycle and `GET /api/health` `activeSessionCount`, and clean up TTL timers in `close()`.
- `src/client/lib/sessionSocket.ts` — create; typed browser WebSocket session client using `resolveWebSocketUrl` and `sessionStorage` reconnect persistence.
- `tests/unit/session-socket.test.ts` — create; unit tests for dynamic `ws://` vs `wss://` URL resolution in `createSessionSocketClient`, `sessionStorage` credential scoping, code/PIN/initials helpers, and deterministic `LiveSessionStore` state/TTL unit cases.
- `tests/integration/ws-session-lifecycle.test.ts` — create; multi-socket `/ws` integration tests covering room creation, `GET /api/health` active count, Participant join + roster broadcast, duplicate `displayName` disambiguation, secret non-leakage, Participant/stale-token leader command rejection, `leaderPin` handoff, safe reconnect, `maxPayload` enforcement, and TTL expiry.
- `tests/e2e/ws-room-lifecycle.spec.ts` — create; Playwright multi-context mobile Chromium E2E test verifying single-port browser `/ws` room creation, Participant join sync, leader command rejection, and `leaderPin` handoff.
- `ARCHITECTURE.md` & `CONSTRAINTS.md` — modify; document the new session protocol/store modules and `/ws` secret-stripping + `maxPayload` invariants.

## Visual Design Impact

- UI involved: no (`src/client/App.tsx` remains unchanged; Welcome cards, PIN sheet, and join form belong to `welcome-role-selection-flow`).
- Design source: `DESIGN.md` (used strictly for semantic `AvatarPalette` values `'gold' | 'indigo' | 'violet' | 'emerald' | 'terracotta'`, centered 2-letter uppercase `initials`, and `'Study Leader'` / `'Participant'` role labels).
- Screens or states affected: None in this feature (`GET /` continues serving the accepted Midnight Sanctuary bootstrap shell).
- New design artifact required: no.

## Durable Documentation Impact

- `ARCHITECTURE.md`: update — Add `src/shared/session.ts`, `src/server/sessionStore.ts`, and `src/client/lib/sessionSocket.ts` to the module boundary summary and note `GET /api/health` active session count wiring.
- `CONSTRAINTS.md`: update — Under Server-Side Role & Turn Gating, record that `leaderPin`, `leaderToken`, and `reconnectToken` must never appear in public broadcasts and `WebSocketServer` must keep an explicit `maxPayload` limit.
- `AGENTS.md`: not needed — Workflow, startup gate (`./init.sh`), and role rules remain unchanged.
- Other docs: `docs/risks-and-open-questions.md` — optional minor update noting Implementation-Time Question #2 (auto-generated 4-digit `leaderPin` + 6-character `sessionCode`) is resolved.

## Implementation Plan

1. Create `src/shared/session.ts` with strict TypeScript wire contracts, `SanctuaryRole` (`'Study Leader' | 'Participant'`) member/session snapshots, error codes, and normalization/initials utilities.
2. Implement `src/server/sessionStore.ts` with cryptographic `sessionCode`/`leaderPin`/`leaderToken`/`reconnectToken` generation, duplicate `displayName` disambiguation, leader-only command authorization, `leaderPin` rotation handoff, safe reconnect, and 4-hour inactivity TTL cleanup.
3. Wire `LiveSessionStore` and `maxPayload: 64 * 1024` into `src/server/app.ts` (`GET /api/health` `activeSessionCount`, `/ws` frame routing preserving `ping -> pong`, and `close()` disposal).
4. Implement `src/client/lib/sessionSocket.ts` on top of `resolveWebSocketUrl`, add Vitest unit + `/ws` integration + Playwright multi-context E2E suites, update `ARCHITECTURE.md` and `CONSTRAINTS.md`, and run all verification gates.

## Implementation Tasks

- [ ] Create `src/shared/session.ts` defining `PublicSessionMember`, `PublicLiveSessionSnapshot`, `ClientWsMessage`, `ServerWsMessage`, `SessionErrorCode`, and pure code/PIN/initials helpers with `.js` `NodeNext`-compatible imports.
- [ ] Implement `src/server/sessionStore.ts` covering `create_session`, `join_session` (case-insensitive duplicate `displayName` disambiguation + palette rotation), `claim_leader` (constant-time `leaderPin` check, `leaderToken` rotation, `leader_replaced` notice), `reconnect_session`, leader lifecycle commands (`open_lobby`, `start_study`, `next_section`, `close_session`), secret stripping, and 4-hour TTL sweep/dispose.
- [ ] Update `src/server/app.ts` to set `maxPayload: 64 * 1024` on `WebSocketServer`, connect `getActiveSessionCount` to `LiveSessionStore`, preserve `{ type: 'ping' } -> { type: 'pong' }` without unsolicited open frames, and dispose timers on `close()`.
- [ ] Create `src/client/lib/sessionSocket.ts` building on `resolveWebSocketUrl` (`ws://` vs `wss://` from `window.location`) with typed request/event methods and scoped `sessionStorage` credential helpers.
- [ ] Add `tests/unit/session-socket.test.ts`, `tests/integration/ws-session-lifecycle.test.ts`, and `tests/e2e/ws-room-lifecycle.spec.ts` covering every acceptance scenario and negative security/payload check.
- [ ] Update `ARCHITECTURE.md` and `CONSTRAINTS.md`, then run `./init.sh` and `PLAYWRIGHT_PORT=3302 npm run test:e2e`.

## Verification Plan

- Run `./init.sh` (non-blocking standard gate: `npm run typecheck`, `npm test`, `npm run build`; must not start long-running servers `npm run dev` or `npm start`) and confirm exit code `0`.
- Confirm Vitest suites (`tests/unit/session-socket.test.ts` and `tests/integration/ws-session-lifecycle.test.ts`) verify:
  - dynamic `ws://` (on `http:`) vs `wss://` (on `https:`) resolution from `window.location`,
  - room creation issuing 6-char `sessionCode`, 4-digit `leaderPin`, and `leaderToken` + `GET /api/health` `activeSessionCount` updates,
  - `Participant` join roster broadcasts, duplicate `displayName` disambiguation (`"Daniel"` / `"Daniel (2)"`), and zero leakage of `leaderPin` / `leaderToken` / `reconnectToken`,
  - rejection of `Participant`, unauthenticated, and stale-token attempts to run leader commands or spoof `claim_leader` / `reconnect_session`,
  - valid `leaderPin` handoff rotating `leaderToken` and notifying the displaced leader socket,
  - `WebSocketServer` `maxPayload` (`64 KiB`) enforcement and deterministic 4-hour (`14_400_000` ms) inactivity TTL cleanup.
- Run persistent Playwright E2E verification on the dedicated worktree port: `PLAYWRIGHT_PORT=3302 npm run test:e2e`, confirming both `tests/e2e/app-shell-bootstrap.spec.ts` and multi-context `tests/e2e/ws-room-lifecycle.spec.ts` pass against the single-port production bundle.

## Evidence To Capture

- Exit code and summary of `./init.sh` (`npm run typecheck`, Vitest file/test counts, `npm run build` output).
- Passing test counts and scenario names from `tests/unit/session-socket.test.ts`, `tests/integration/ws-session-lifecycle.test.ts`, and `PLAYWRIGHT_PORT=3302 npm run test:e2e`, recorded in `feature_list.json` and `PROGRESS.md`.

## Validator Checklist

- [ ] Implementation stays strictly within `ws-live-session-room-lifecycle` scope (no Welcome UI screens, study parsers, QR lobby UI, or Three.js canvases added prematurely).
- [ ] All shared types, server handlers, and client helpers use `'Study Leader'` and `'Participant'`—zero occurrences of `'Assistant'`.
- [ ] `WebSocketServer` sets explicit `maxPayload` (`64 * 1024`), preserves `{ type: 'ping' } -> { type: 'pong' }`, and wires `GET /api/health` `activeSessionCount` + 4-hour TTL cleanup with clean `close()` teardown.
- [ ] `leaderPin`, `leaderToken`, and `reconnectToken` never leak in `Participant` responses or `roster_updated` broadcasts, and server-side checks reject unauthorized second leaders and `Participant`/stale-token leader commands.
- [ ] Client WebSocket helper dynamically resolves `ws://` vs `wss://` via `src/client/lib/runtimeUrl.ts` without hardcoded `localhost`.
- [ ] `./init.sh` and `PLAYWRIGHT_PORT=3302 npm run test:e2e` pass, durable docs (`ARCHITECTURE.md`, `CONSTRAINTS.md`) are updated, and `feature_list.json` + `PROGRESS.md` capture concrete evidence.

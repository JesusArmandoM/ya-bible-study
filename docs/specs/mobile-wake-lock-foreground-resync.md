# Feature Implementation Spec: Mobile clients hold screen wake lock with instant foreground state resync

## Source Feature

- `id`: `mobile-wake-lock-foreground-resync`
- `area`: `mobile-resilience`
- `depends_on`: `["ws-live-session-room-lifecycle", "section-1-chosen-volunteer-prayer-gate"]` (both `accepted`)
- `status`: `not_started`
- `source`: `feature_list.json`

## Goal

During a live session on mobile (iOS Safari / Android Chrome), the client holds the **Screen Wake Lock API** so the display never auto-locks mid-prayer or mid-reading, and — whenever the app returns to the foreground (`visibilitychange` / `focus` / `online`) — it **instantly re-hydrates a fresh full session snapshot** so the Study Leader and Participant never act on stale turn state (section, raised-hand queue, `YOU WERE CHOSEN` / `Done` state). Wake Lock must degrade silently where unsupported or denied. This implements `docs/technical-discovery.md` "iOS & Android 90-Minute Session Hardening" and mitigates the `docs/risks-and-open-questions.md` "iOS Safari background tab suspension" risk.

## Non-Goals

- Random Selection picker + 30s countdown (`random-volunteer-picker-countdown`, wave-mate) and Section 2 Icebreaker content (`section-2-icebreaker-flow`, wave-mate) — do not touch `pick_random` / `random_pending` / `candidate*` seams.
- Any change to `VolunteerTurn` / section-advancement / `Done` gating semantics (server or shared reducers) — this feature is transport/lifecycle only.
- Desktop Dual Side-by-Side Mode (own feature).
- Protocol changes: `SESSION_PROTOCOL_VERSION` stays `3`; no new `/ws` message types; no server behavior change.
- Offline command queueing, Background Sync API, push notifications, or any external API / telemetry.
- Changing `Sacred3DScene`'s existing `visibilitychange` frame-pause logic.

## Job Story

When I am leading or participating in a live study on my phone and I briefly switch apps, lock the phone, or lose signal for a moment,
I want the screen to stay awake during the session and the app to instantly catch up to the true session state when I return,
so I never raise a hand, tap `Done`, or advance a section based on stale data.

## Users And Permissions

- `Study Leader`: same wake-lock + resync behavior as Participants; leadership authority (`leaderToken`) is unchanged and re-authenticated through existing `reconnect_session` credentials.
- `Participant`: same behavior; resync restores the exact role-scoped view, including the chosen-volunteer `Done` screen (`volunteerTurn.selectedMemberId === memberId`).
- No new roles, permissions, or capabilities. Resync is read-only hydration — it never mutates server state beyond the existing `lastActivityAt` refresh.

## Acceptance Scenarios

### Scenario 1: Wake lock held while a live session is active

Given a Study Leader (or Participant) is in a live session and the document is visible
When the session becomes active (`session_created` / `session_joined` / `session_reconnected`)
Then `navigator.wakeLock.request('screen')` is called once and the returned sentinel is retained while the session stays active and visible
And no request is made before a session exists or after `Leave` / `session_closed` (the sentinel is released).

### Scenario 2: Wake lock re-acquired on foreground

Given the app was backgrounded (the platform auto-released the sentinel)
When the document returns to `visibilityState === 'visible'`
Then the wake lock is re-requested, and an unexpected sentinel `release` (system revocation) is retried on the next foreground event.

### Scenario 3: Graceful degradation when unsupported or denied

Given `navigator.wakeLock` is absent (e.g. iOS Safari < 16.4) or `request()` rejects (permission / power-saving denial)
When the session runs normally
Then nothing throws, no error dialog appears, the session UI is fully functional, and the denial is silently retried only on the next foreground event (no retry loop).

### Scenario 4: Foreground resync restores exact fresh turn state

Given a chosen Participant holds the `YOU WERE CHOSEN` screen, their page is backgrounded and their WebSocket is forcibly suspended (iOS-style)
When other clients mutate session state (e.g. the Study Leader reassigns or completes the turn) and the Participant returns to the foreground
Then the client issues `reconnect_session`, receives a fresh `session_reconnected` snapshot, and renders the exact current turn screen (still chosen with `Done`, or the completed/reassigned state) **within 2 seconds** — never the stale pre-background view.

### Scenario 5: Resync failure never leaves stale state or leaks sessions

Given a backgrounded client returns to the foreground
When resync fails
Then a definitive session-gone error (`SESSION_NOT_FOUND` / `UNAUTHORIZED_RECONNECT` / `INVALID_SESSION_CODE`) clears stored credentials and returns the app to the Welcome screen (no stale session UI), while a transient network error keeps the session, shows a `Reconnecting…` indicator, and recovers on `online` / next trigger — and every test path closes its sessions so `GET /api/health.activeSessionCount` returns to `0`.

## Repository Research

### Files Inspected

- `docs/technical-discovery.md` — mandates exactly this feature (wake lock + `visibilitychange`/`online` reconnect + snapshot re-hydration); Observability requires a visible `LIVE` / reconnecting badge.
- `docs/risks-and-open-questions.md` — "iOS Safari background tab suspension" risk row (mitigation = this feature).
- `src/client/lib/sessionSocket.ts` — `SessionSocketClient.reconnectSession()` sends `reconnect_session` and resolves `session_reconnected`; `sendRequest` auto-`connect()`s a dead socket first; `handleIncomingFrame` feeds `session_reconnected.session` to `onSessionSnapshot`/subscribers and refreshes `latestSession`; `SessionSocketError` carries `SessionErrorCode`; credentials persist in `sessionStorage`. Interface has optional-additive precedent (`sendTurnCommand?`).
- `src/client/lib/useLiveSession.ts` — `session_reconnected` subscription case already sets `session`/`role`/`credentials`; mount-only auto-reconnect; `leaveRoom()` clears credentials; `connectionStatus` state exists.
- `src/server/sessionStore.ts` `handleReconnectSession` — **idempotent**: rebinds `member.socket` even when already connected, sets `connectionStatus: 'connected'`, refreshes `lastActivityAt`, replies `session_reconnected` with full `toPublicSnapshot` (secret-stripped) and broadcasts `roster_updated`. Timing-safe token checks (`UNAUTHORIZED_RECONNECT` on mismatch).
- `src/shared/session.ts` — `reconnect_session` / `session_reconnected` wire shapes; `PublicLiveSessionSnapshot` carries `status`, `currentSectionId`/`currentSectionIndex`, `volunteerTurn` (deep copy), `study` (sanitized `SessionStudySummary`), `protocolVersion: 3`.
- `src/client/components/stage/Sacred3DScene.tsx` — internal `visibilitychange` handler flips `isDocumentHidden` → `frameloop` pause (`paused = isDocumentHidden || contextLost`); independent listeners only — must not be modified or collided with.
- `src/client/App.tsx` — renders `ActiveSessionBanner` inside the `liveSession.session ?` branch (the wake-lock enable seam); wires `liveSession.leaveRoom()` on `Leave`.
- `src/client/components/welcome/ActiveSessionBanner.tsx` — `● LIVE ROOM` badge (copy precedent for the chip).
- `playwright.config.ts` (`PLAYWRIGHT_PORT`, `workers: 1`, mobile-chromium `390x844`), `tests/e2e/section-1-chosen-volunteer-prayer-gate.spec.ts` (Session 021–022 hardening patterns: `test.describe.configure({ timeout: 60_000 })`, `baseExpect.configure({ timeout: 15_000 })`, never-throwing bounded `closeLiveSession` (2s WS waits + 5s outer race), `Promise.allSettled` context closes), `tests/unit/use-study-setup.test.ts` (`renderHook` pattern for hook tests).
- `docs/specs/ws-live-session-room-lifecycle.md` (accepted) — establishes `reconnect_session` snapshot resync semantics this feature leverages.

### Existing Patterns To Follow

- React hooks live in `src/client/lib/` and are tested with `renderHook` + `@testing-library/react`; browser APIs are feature-detected and injectable for tests (e.g. `usePrefersReducedMotion`, `createWebSocket` override).
- E2E tests are multi-context mobile-chromium with raw `/ws` helpers and hardened `finally` cleanup (Sessions 021–022 lesson).
- `DESIGN.md`: Live Emerald `#10B981` for `● LIVE` pills, terracotta `#9A4A38` for warnings; `prefers-reduced-motion` guards on any animation.

### Current Gaps

- No wake-lock code exists anywhere (`grep -rn "wakeLock" src/ tests/` → 0 matches).
- No foreground-triggered resync: the only rehydration today is the mount-time auto-reconnect in `useLiveSession`; a long-backgrounded tab that keeps its page alive acts on stale state until reload.
- `SessionSocketClient` exposes no socket-close subscription (only messages), and `getSharedSessionSocketClient()` is created without `onConnectionChange` — silent socket drops are unobservable without a lightweight watchdog.

## Technical Approach

**Resync mechanism choice: reuse `reconnect_session` → `session_reconnected` (zero protocol change).** Verified in `handleReconnectSession`: it is idempotent on an already-bound, already-connected socket, re-authenticates with existing `reconnectToken`/`leaderToken` (timing-safe), refreshes `lastActivityAt`, and returns a full secret-stripped `toPublicSnapshot`. Its reply flows through the existing `handleIncomingFrame` subscriber pipeline, so `useLiveSession`'s `case 'session_reconnected'` updates React state with **no edit to `useLiveSession.ts` / `sessionSocket.ts` / `src/shared/session.ts` / `src/server/sessionStore.ts`**. A new additive `/ws` message (e.g. `refresh_snapshot`) would require touching all four files — three of them shared with both wave-mates — for zero functional gain. Rejected. (Accepted side effect: each resync broadcasts an idempotent `roster_updated`; existing behavior, not modified.)

1. **`useScreenWakeLock` (new module)** — `useScreenWakeLock({ enabled, wakeLockApi? })` → `{ status: 'unsupported' | 'inactive' | 'requesting' | 'active' | 'denied' }`.
   - Request `navigator.wakeLock.request('screen')` only when `enabled && document.visibilityState === 'visible'`; retain the `WakeLockSentinel`.
   - Re-acquire on `document` `visibilitychange` → `visible` (the platform auto-releases on hide; treat sentinel `release` events as expected there and clear the ref). Re-acquire also after an unexpected `release` while visible, on the next foreground event.
   - Explicitly `release()` the sentinel when `enabled` flips false (Leave / `session_closed` / unmount) and on `pagehide`.
   - Failure handling: missing `navigator.wakeLock` → `unsupported` (silent); rejected `request` (e.g. `NotAllowedError` under power saving / iOS restrictions) → `denied` (silent), retry only on the next foreground event — never a retry loop, never a thrown rejection into React.
   - Battery/visibility edge cases: system revocation fires the sentinel `release` event (handled); requests while hidden are skipped; all calls idempotent (at most one live sentinel).
   - Injectable `wakeLockApi` (`{ request(type: 'screen'): Promise<WakeLockSentinelLike> }`) for unit tests; guard `typeof navigator === 'undefined'` for jsdom.
2. **`useForegroundResync` (new module)** — `useForegroundResync({ client, enabled, onSessionGone })` → `{ resyncState: 'idle' | 'syncing' | 'reconnecting' }`.
   - Triggers (coalesced into one single-flight `client.reconnectSession()`; at most one queued re-run): `visibilitychange` → `visible`; `window` `focus`; `window` `online`; and a ~5s watchdog interval (only while `enabled && visible`) calling `client.isConnected()` — this bounds silent socket-drop recovery without editing `sessionSocket.ts`. No immediate reconnect on mount (the existing mount auto-reconnect already covers it).
   - Outcomes: `session_reconnected` success → `idle` (state freshness guaranteed by the full snapshot). Definitive session-gone (`SessionSocketError` codes `SESSION_NOT_FOUND` / `UNAUTHORIZED_RECONNECT` / `INVALID_SESSION_CODE`) → `clearStoredSessionCredentials()` + `onSessionGone()` (App calls `liveSession.leaveRoom()` → Welcome screen; never stale session UI). Transient failure (socket closed / timeout / offline / generic `Error`) → `reconnecting`, keep credentials and state, retry on next trigger; never eject a participant over a blip.
   - All promise chains are catch-guarded (no unhandled rejections); no artificial delays — a foreground resync is one local `reconnect_session` round trip, well under the 2s budget.
   - While `reconnecting`, action buttons stay enabled: the server remains authoritative (stale actions are rejected with `INVALID_STATE_TRANSITION` and can never corrupt state); the chip signals freshness risk instead of blocking UI (blocking would require editing wave-mate-owned prayer/section components).
3. **`SessionResilienceChip` (new component)** — thin component that owns both hooks and renders the connection indicator; mounted in `App.tsx` inside the `liveSession.session ?` branch next to `ActiveSessionBanner` with props `{ sessionActive, onSessionGone }` (uses `getSharedSessionSocketClient()` internally). States: `● Connected` (emerald, `data-connection="live"`) / `● Reconnecting…` (terracotta, `role="status"` `aria-live="polite"`, `data-connection="reconnecting"`), plus `data-wake-lock="<status>"`. Static under reduced motion; hidden when no session.
4. **`Sacred3DScene` coordination** — do **not** touch `Sacred3DScene.tsx`; its internal `visibilitychange` frame-pause stays exactly as is. The new hooks register independent `document`/`window` listeners (removed on unmount). Existing `tests/unit/sacred-3d-scene.test.tsx` / `tests/e2e/sacred-3d-stage.spec.ts` must stay green without edits.

**Security & privacy.** Wake Lock is a local browser API — zero network calls. Resync reuses existing `sessionStorage` credentials only (no new persistence; hook state is in-memory). Snapshots keep stripping `leaderPin` / `leaderToken` / `reconnectToken` and pastoral fields (existing `toPublicSnapshot` / `toSessionStudySummary`); an integration test asserts this on `session_reconnected.session`. No telemetry, no external requests, no new server surface.

**Terminology.** `Study Leader` / `Participant` only (never the forbidden legacy role word); Section 3 stays Gospel-only wherever it appears (untouched by this feature).

## Expected File Changes

- `src/client/lib/useScreenWakeLock.ts` — **create**; wake-lock lifecycle hook + injectable API.
- `src/client/lib/useForegroundResync.ts` — **create**; single-flight foreground resync orchestration + error classification.
- `src/client/components/session/SessionResilienceChip.tsx` — **create**; chip rendering both resilience signals.
- `src/client/App.tsx` — **modify (minimal)**: one import + one `<SessionResilienceChip … />` element in the existing session branch (~6 lines).
- `src/client/styles/global.css` — **modify (append-only)**: one chip style block appended at end of file (uses existing emerald/terracotta tokens).
- `tests/unit/use-screen-wake-lock.test.ts` — **create**.
- `tests/unit/use-foreground-resync.test.ts` — **create**.
- `tests/unit/session-resilience-chip.test.tsx` — **create**.
- `tests/integration/ws-foreground-resync.test.ts` — **create** (raw `ws` against ephemeral-port server).
- `tests/e2e/mobile-wake-lock-foreground-resync.spec.ts` — **create**.
- `ARCHITECTURE.md` — **modify** (client module list + resync mechanism note).
- `docs/risks-and-open-questions.md` — **modify** (mark "iOS Safari background tab suspension" risk mitigated).
- `feature_list.json`, `PROGRESS.md` — **modify** at implementation/validation time (evidence).
- **Explicitly NOT modified**: `src/shared/session.ts`, `src/server/sessionStore.ts`, `src/server/app.ts`, `src/client/lib/useLiveSession.ts`, `src/client/lib/sessionSocket.ts`, `src/client/components/stage/*` — this is the parallel-wave conflict-avoidance contract.

## Visual Design Impact

- UI involved: yes (one status chip; no new screens).
- Design source: `DESIGN.md` (Live Emerald `#10B981` `● LIVE` pill precedent; terracotta `#9A4A38` warnings) and `docs/technical-discovery.md` Observability ("visible `LIVE` / reconnecting badge").
- Screens or states affected: the live-session header area (chip sits next to `ActiveSessionBanner` on setup/lobby/Section 1+ screens); Welcome screen unchanged.
- New design artifact required: no — chip reuses existing pill typography/tokens. Constraints: no layout shift at `390x844`, no horizontal overflow, chip is non-interactive (no 44px target requirement), reduced-motion renders it static, `>= 16px` input rule untouched. Single persistent `Sacred3DScene` canvas and its frame-pause keep working.

## Durable Documentation Impact

- `ARCHITECTURE.md`: update — add `useScreenWakeLock.ts`, `useForegroundResync.ts`, `src/client/components/session/SessionResilienceChip.tsx`; note foreground resync reuses `reconnect_session` snapshot hydration (protocol v3 unchanged).
- `CONSTRAINTS.md`: not needed — no new repo-invariant (existing gating/secret/ergonomics rules untouched; graceful wake-lock degradation is behavior, recorded in ARCHITECTURE.md).
- `AGENTS.md`: not needed — workflow/startup/role rules unchanged.
- Other docs: `docs/risks-and-open-questions.md` — update the "iOS Safari background tab suspension" risk row to mitigated-by-this-feature.

## Implementation Plan

1. Create `useScreenWakeLock.ts` (lifecycle + injectable API + status model) with its unit suite.
2. Create `useForegroundResync.ts` (triggers, single-flight coalescing, error classification, watchdog) with its unit suite.
3. Create `SessionResilienceChip.tsx`; wire the minimal `App.tsx` element and append chip CSS to `global.css`.
4. Add `tests/integration/ws-foreground-resync.test.ts` proving `reconnect_session` idempotent-freshness + secret stripping + no session leaks (validates the reuse decision against the real server).
5. Add `tests/e2e/mobile-wake-lock-foreground-resync.spec.ts` (mobile-chromium `390x844`) with Session 021–022 hardening from the start.
6. Update `ARCHITECTURE.md` + `docs/risks-and-open-questions.md`, run all gates, record evidence in `feature_list.json` + `PROGRESS.md`.

## Implementation Tasks

- [ ] `useScreenWakeLock`: request on `enabled && visible`, retain sentinel, release on `enabled=false`/`pagehide`/unmount, re-acquire on `visibilitychange`→visible and after unexpected `release`, `unsupported`/`denied` silent paths, injectable `wakeLockApi`, zero requests without a live session.
- [ ] `useForegroundResync`: `visibilitychange`/`focus`/`online` triggers + ~5s `isConnected()` watchdog, single-flight `client.reconnectSession()` with one queued re-run, `SessionSocketError` classification (session-gone → `clearStoredSessionCredentials` + `onSessionGone`; transient → `reconnecting` + retry), all rejections caught.
- [ ] `SessionResilienceChip`: `● Connected` / `● Reconnecting…` pill with `data-testid="session-resilience-chip"`, `data-connection`, `data-wake-lock` attributes, `aria-live="polite"` on the reconnecting state, reduced-motion static.
- [ ] Minimal `App.tsx` wiring (import + one element) and append-only `global.css` block.
- [ ] Unit tests: `tests/unit/use-screen-wake-lock.test.ts`, `tests/unit/use-foreground-resync.test.ts`, `tests/unit/session-resilience-chip.test.tsx` (incl. zero `"Assistant"` copy).
- [ ] Integration test `tests/integration/ws-foreground-resync.test.ts` (freshness, idempotent rebind, secret/pastoral stripping, `activeSessionCount` hygiene).
- [ ] E2E `tests/e2e/mobile-wake-lock-foreground-resync.spec.ts` covering Scenarios 1–5 (see Verification Plan).
- [ ] Docs updates (`ARCHITECTURE.md`, `docs/risks-and-open-questions.md`), then full gates + evidence.

## Verification Plan

Exact commands (this worktree's ports):

- `./init.sh` — non-blocking standard gate (`npm run typecheck`, `npm test`, `npm run build`); must not start long-running servers. Expect exit `0`.
- `PLAYWRIGHT_PORT=3303 npm run test:e2e` — full mobile-chromium `390x844` suite on the single-port production bundle. Expect exit `0` with all suites green **twice consecutively** (Session 021–022 reproducibility bar), `tests/e2e/ws-room-lifecycle.spec.ts` green in both runs (no leaked sessions).
- `grep -rn "Assistant" src/` — expect 0 matches.

Unit/integration expectations (`npm test`):

- `tests/unit/use-screen-wake-lock.test.ts`: request-while-active, release-on-leave/session-end, no-request-without-session, re-acquire on `visibilitychange`→visible (mocked sentinel auto-release), unexpected `release` retry, `unsupported` (no `navigator.wakeLock`) and `denied` (`request` rejects `NotAllowedError`) silent paths with a later successful re-acquire, no requests while hidden, listener cleanup on unmount.
- `tests/unit/use-foreground-resync.test.ts`: foreground trigger calls `reconnectSession` exactly once (single-flight across `visibilitychange`+`focus`+`online` in the same tick); a stub returning a **different** fresh snapshot (changed `currentSectionId`, changed `volunteerTurn.selectedMemberId`) updates state (Scenario 4 freshness at unit level); `SessionSocketError` session-gone codes → credentials cleared + `onSessionGone`, generic errors → `reconnecting`, credentials kept, no `onSessionGone`, retried on `online`; no-op without credentials; watchdog resync on `isConnected() === false` (fake timers); unmount removes all listeners/intervals.
- `tests/integration/ws-foreground-resync.test.ts`: against an ephemeral-port `createAppServer` — `reconnect_session` on an already-connected socket returns a full fresh `session_reconnected` snapshot including current `volunteerTurn` (raise → `choose_volunteer` → reconnect reflects `selectedMemberId`); mutations between two reconnects appear in the second snapshot; `session_reconnected.session` strips `leaderPin`/`leaderToken`/`reconnectToken` and pastoral fields; repeated resyncs leave `GET /api/health.activeSessionCount` unchanged; clean teardown.

E2E expectations (`tests/e2e/mobile-wake-lock-foreground-resync.spec.ts`, mobile-chromium `390x844`):

- Session 021–022 hardening **from the start**: `test.describe.configure({ timeout: 60_000 })`, `baseExpect.configure({ timeout: 15_000 })`, never-throwing bounded `closeLiveSession` (2s WS waits, internal try/catch, 5s outer race) run in every `finally`, contexts closed via `Promise.allSettled`, live sessions closed via raw `/ws` `close_session` so `activeSessionCount` returns to `0` for downstream suites.
- Scenario 1: mock `navigator.wakeLock` via `page.addInitScript` spy (`window.__wakeLockLog`): live session active → exactly one `request('screen')`; `Leave` → sentinel released; no session → zero requests.
- Scenario 2: simulate backgrounding by overriding `document.hidden`/`visibilityState` + dispatching `visibilitychange` (also fires the mock sentinel `release`), then foreground → a second `request('screen')` is logged.
- Scenario 3: `navigator.wakeLock` deleted (unsupported) and `request`-rejecting (denied) variants → session fully usable (raise hand / queue sync still work), no page errors, chip still `live`.
- Scenario 4: chosen Participant backgrounded + its WebSocket forcibly closed (page.evaluate), leader mutates state (e.g. `override_turn` or reassign), participant fires `visibilitychange`→`visible` → assert within **2s** the participant's DOM shows the exact fresh turn screen (e.g. `YOU WERE CHOSEN` + `Done` if still chosen, or the completed/reassigned view). Per `feature_list.json`: "automatic reconnect restores the exact 'Done' turn screen within 2 seconds". If the 2s window proves flaky under full-suite load, relax the assertion budget and record the deviation honestly (behavior requirement stays 2s).
- Scenario 5: session-leak hygiene — resync against a `close_session`-ed room → app returns to Welcome (zero stale session DOM), and post-suite `/api/health` shows `activeSessionCount: 0`; chip copy uses `Study Leader`/`Participant` wording only.

## Evidence To Capture

- `./init.sh` exit code + Vitest file/test counts (expect new suites listed) + build output.
- `PLAYWRIGHT_PORT=3303 npm run test:e2e` exit code and per-suite results, **two consecutive runs**, with `ws-room-lifecycle.spec.ts` green in both (no leaked sessions); record the observed foreground-restore latency for Scenario 4.
- `grep -rn "Assistant" src/` output (0 matches).
- Confirmation that `src/shared/session.ts`, `src/server/sessionStore.ts`, `src/client/lib/useLiveSession.ts`, `src/client/lib/sessionSocket.ts`, `src/client/components/stage/*` have zero diff (parallel-wave contract), recorded in `feature_list.json` evidence.
- Any compat edits to accepted tests (expected: none) documented explicitly per Sessions 018–023 practice.

## Validator Checklist

- [ ] Implementation stays within scope: wake lock + foreground resync + status chip only; no `pick_random`/`random_pending`/`candidate*` changes, no Section 2 content, no gating-semantics changes, no desktop dual-mode.
- [ ] `SESSION_PROTOCOL_VERSION` remains `3`; `src/shared/session.ts`, `src/server/sessionStore.ts`, `src/client/lib/useLiveSession.ts`, `src/client/lib/sessionSocket.ts` are unmodified (resync reuses `reconnect_session`).
- [ ] Acceptance Scenarios 1–5 pass; Scenario 4 restores the exact turn screen within 2s (or a documented, honestly recorded assertion-budget deviation).
- [ ] Wake Lock degrades silently (unsupported / denied / revoked) with zero unhandled rejections and zero requests outside a live, visible session.
- [ ] `Sacred3DScene` untouched: single persistent canvas, existing `visibilitychange` frame-pause, reduced-motion behavior all still green in existing suites.
- [ ] No `"Assistant"` occurrences; `Study Leader` / `Participant` terminology; Section 3 Gospel-only untouched.
- [ ] Security/privacy: no new persistence, no external API calls, no telemetry; `session_reconnected` snapshots strip secrets and pastoral fields (integration-verified).
- [ ] `./init.sh` and `PLAYWRIGHT_PORT=3303 npm run test:e2e` (twice) pass; `ARCHITECTURE.md` + `docs/risks-and-open-questions.md` updated; `feature_list.json` + `PROGRESS.md` carry concrete evidence.
- [ ] No unrelated feature work or accepted-test edits beyond documented forced compat changes.

## Open Questions / Unknowns (explicit)

- Headless Chromium cannot prove real screen wake; e2e verifies the API interaction via an instrumented mock. Real-device check (phone stays awake through a session) is a recommended manual validation item.
- The 2s resync window is a product requirement; the e2e assertion budget may need the documented relaxation under full-suite load (see Verification Plan).
- Each resync triggers an idempotent `roster_updated` broadcast (existing server behavior). Accepted; suppressing self-triggered roster churn would require touching `sessionStore.ts` and is explicitly out of scope.

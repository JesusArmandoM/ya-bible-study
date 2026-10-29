# Feature Implementation Spec: Welcome screen routes Study Leader or Participant into live session

## Source Feature

- `id`: `welcome-role-selection-flow`
- `area`: `onboarding-ui`
- `depends_on`: `["ws-live-session-room-lifecycle"]`
- `status`: `not_started`
- `source`: `feature_list.json`

## Goal

Deliver the interactive Sacred Midnight Welcome & Role Selection screen matching `ux/1. Welcome.png` and `DESIGN.md`. Users are greeted by the brand lockup (`YA BIBLE STUDY`), editorial serif headline (`Bible Study for Young Adults`), subtitle, and `CHOOSE YOUR ROLE` card container featuring tactile `Study Leader` and `Participant` cards (strictly `Participant`, never `Assistant`) with `motion/react` spring press feedback (`stiffness: 420, damping: 26, scale: 0.96`).

Selecting `Study Leader` provides both room creation (generating a joinable 6-character `sessionCode` and 4-digit `leaderPin` with `sessionStorage` credential persistence) and PIN-based leader handoff (`claimLeader`). Selecting `Participant` provides a frictionless join sheet accepting `sessionCode` (with uppercase auto-formatting and `/join/:code` URL prefill) plus `displayName`. All inputs strictly maintain computed `font-size >= 16px` (`1rem`) to prevent iOS Safari viewport auto-zoom, while keeping the persistent `Sacred3DScene` WebGL canvas mounted without interruption.

## Non-Goals

- Uploading, analyzing, or previewing `.pdf` / `.md` study files (deferred to `leader-load-study-setup-screen`, `markdown-study-deterministic-parser`, and `pdf-study-deterministic-parser`).
- Building the Title Lobby attendee list, QR share sheet, or study start gating (deferred to `title-lobby-qr-join-start`).
- Implementing Section 1–5 prayer orbs, volunteer queues, Scripture proclamation, or live discussion feeds (deferred to section features).
- Building the full Desktop Dual Side-by-Side simulation harness (deferred to `desktop-dual-side-by-side-mode`).

## Job Story

When opening YA Bible Study on a mobile or desktop browser,
I want to choose between leading a session or joining as a participant with tactile, clear controls,
so I can effortlessly create or enter a synchronized live study without account creation, while iOS Safari stays stably framed.

## Users And Permissions

- **Unauthenticated Visitor**: Opens the app, views the Sacred Midnight brand and persistent `Sacred3DScene` sanctuary emblem, and chooses a role (`Study Leader` or `Participant`).
- **`Study Leader`**: Taps `Study Leader` to create a new `LiveSession` (receiving `sessionCode`, `leaderPin`, `leaderToken`, and private `reconnectToken`) or claim leadership of an existing session using a valid 4-digit `leaderPin`.
- **`Participant`**: Taps `Participant` to join an existing session using a 6-character `sessionCode` and `displayName`, receiving a distinct `memberId`, `avatarPalette`, and `reconnectToken`. Never receives `leaderPin` or `leaderToken`.
- **Terminology Invariant**: All UI labels, accessible headings, buttons, and tests must use `Study Leader` and `Participant`—zero occurrences of `Assistant`.

## Acceptance Scenarios

### Scenario 1: Welcome screen renders role selection cards with zero "Assistant" copy and persistent 3D canvas

Given a visitor opens `/` on a mobile viewport (`390x844`)
When the Welcome screen loads
Then it renders the brand lockup (`YA`, `BIBLE STUDY`), `Bible Study for Young Adults` (`Playfair Display`), `CHOOSE YOUR ROLE` eyebrow, and two interactive role cards labeled `Study Leader` and `Participant`
And the DOM contains zero occurrences of `"Assistant"`
And the persistent `<Sacred3DScene />` remains mounted with `<canvas data-rendered-stage="sanctuary-emblem">`
And the status pill renders `v1.0 · Connected in community` when `/api/health` reports `ok`.

### Scenario 2: Study Leader creates a new LiveSession and receives join code + leader PIN

Given a visitor is on the Welcome screen
When the visitor taps the `Study Leader` card, chooses "Create New Room", optionally enters a display name (e.g., `"Claire"`), and taps "Create Room"
Then `sessionSocket.createSession` is invoked over `/ws`
And the server returns `session_created` containing a 6-character alphanumeric `sessionCode` and a 4-digit `leaderPin`
And the client displays the generated `sessionCode` and `leaderPin` with clear guidance on keeping the PIN for device recovery
And `sessionStorage` stores `{ sessionCode, memberId, role: "Study Leader", reconnectToken, leaderToken }`
And the persistent 3D canvas remains mounted throughout the transition.

### Scenario 3: Participant joins with session code and display name (including URL prefill)

Given an active `LiveSession` exists with session code `ABCXYZ`
When a participant navigates to `/join/ABCXYZ` (or taps `Participant` and enters `ABCXYZ` into the session code field)
Then the session code field automatically pre-fills with `ABCXYZ` in uppercase
And when the participant enters display name `"Daniel"` and taps "Join Study"
Then `sessionSocket.joinSession` is invoked over `/ws`
And the client receives `session_joined` with `role: "Participant"`, a unique `memberId`, and an assigned `avatarPalette`
And all text inputs (`<input>`) maintain computed `font-size >= 16px` (`1rem`)
And the UI transitions to the connected participant state displaying the active room code.

### Scenario 4: Study Leader claims leadership of an existing room via 4-digit leader PIN

Given an active `LiveSession` exists with session code `ABCXYZ` and valid leader PIN `4821`
When a user taps `Study Leader`, selects "Claim Existing Room", enters `ABCXYZ` with invalid PIN `0000`, and submits
Then the client displays an accessible error message (`role="alert"`) indicating the PIN is invalid
And when the user enters valid PIN `4821` and submits
Then `sessionSocket.claimLeader` succeeds with `leader_claimed`, rotating `leaderToken`
And the user transitions into active leader status while the previous leader connection receives `leader_replaced`.

### Scenario 5: Single-tap Back / Cancel navigation between sheets and role cards

Given a user has opened the `Study Leader` sheet or `Participant` join sheet
When the user taps "Back" (or "Cancel")
Then the view returns immediately to the two Welcome role selection cards without page reload or loss of WebSocket connection readiness.

### Scenario 6: Active session reconnect and persistence across reload

Given a user is in an active session as `Study Leader` or `Participant`
When the page is reloaded
Then `loadStoredSessionCredentials` detects the stored credentials and automatically issues `reconnectSession`
And the client re-hydrates the active session view with its assigned role and room code without requiring re-entry.

## Repository Research

### Files Inspected

- `feature_list.json` & `PROGRESS.md` — `ws-live-session-room-lifecycle` and `sacred-3d-persistent-stage` are `accepted`; `welcome-role-selection-flow` is dependency-ready.
- `DESIGN.md` & `ux/1. Welcome.png` — authoritative layout for Welcome: brand lockup, `Playfair Display` serif typography, `CHOOSE YOUR ROLE` eyebrow, gold crown icon for `Study Leader`, periwinkle people icon for `Participant` (override #1: replace `Assistant` with `Participant`), `motion/react` spring tap (`stiffness: 420, damping: 26, scale: 0.96`).
- `CONSTRAINTS.md` — Constraint #3 (`Participant` terminology), Constraint #5 (server-side role gating), Constraint #7 (`>= 16px` inputs on mobile), Constraint #8 (persistent single-canvas 3D budget).
- `docs/user-and-access-model.md` — single active leader lock, 4-digit `leaderPin` claim, frictionless participant join, accidental tap back-navigation in one tap.
- `src/client/App.tsx` — current root shell holding `Sacred3DScene`, stage preview pills, and status footer.
- `src/client/lib/sessionSocket.ts` — fully implemented and verified client WebSocket helper with `createSession`, `joinSession`, `claimLeader`, `reconnectSession`, and scoped `sessionStorage` persistence.
- `src/client/lib/runtimeUrl.ts` & `src/shared/session.ts` — shared validation helpers (`isValidSessionCode`, `normalizeSessionCode`, `isValidLeaderPin`, `isValidDisplayName`, `deriveInitials`).
- `tests/e2e/app-shell-bootstrap.spec.ts` & `tests/e2e/sacred-3d-stage.spec.ts` — verify that existing assertions (brand lockup, `Playfair Display`, `data-stage-pill-*` preview buttons, single `<canvas>`) must remain satisfied.

### Existing Patterns To Follow

- Use `motion/react` `whileTap={{ scale: 0.96 }}` with `transition={{ type: 'spring', stiffness: 420, damping: 26 }}` on all interactive cards and action buttons.
- Call `triggerTactileHaptic(reducedMotion)` on button presses for 0ms tactile feedback.
- Use `autoCapitalize="characters"`, `autoCorrect="off"`, `spellCheck={false}` on the 6-character room code input, enforcing uppercase normalization.
- Ensure all `<input>` elements have `font-size >= 16px` (`1rem`) via CSS tokens to prevent iOS Safari auto-zoom.
- Never unmount or remount `<Sacred3DScene />`; preserve the single persistent `<canvas>` element across view state switches.

### Current Gaps

- `src/client/App.tsx` renders static role tags (`sanctuary-role-pill`) but lacks interactive role selection cards, leader access forms, and participant join forms.
- No React hook or state container currently bridges `createSessionSocketClient` with React component lifecycle.
- No URL join code parser exists to prefill `sessionCode` from `/join/:code` or `?code=:code`.

## Technical Approach

1. **URL Join Code Parser (`src/client/lib/urlHelpers.ts`)**:
   - Extract optional `sessionCode` from `window.location.pathname` (matching `/join/:code`) or query parameter (`?code=` or `?join=`).
   - Normalize via `normalizeSessionCode` from `src/shared/session.js`.

2. **React Live Session Hook (`src/client/lib/useLiveSession.ts`)**:
   - Wrap `createSessionSocketClient` singleton with reactive React state (`connectionStatus`, `session`, `credentials`, `role`, `error`, `isSubmitting`).
   - Expose methods: `createRoom(displayName)`, `claimLeadership(sessionCode, leaderPin, displayName)`, `joinRoom(sessionCode, displayName)`, `leaveRoom()`, `clearError()`.
   - On initial mount, inspect `loadStoredSessionCredentials()`. If found, invoke `reconnectSession()` automatically.

3. **Welcome View Components (`src/client/components/welcome/`)**:
   - `WelcomeRoleCards.tsx`: Renders the `CHOOSE YOUR ROLE` section matching `ux/1. Welcome.png`:
     - Gold crown icon + `Study Leader` + `"Lead the session with full control"` + chevron.
     - Periwinkle group icon + `Participant` + `"Participate, pray, and raise your hand"` + chevron.
     - `motion.button` cards with spring press feedback and keyboard accessibility (`Enter` / `Space`).
   - `LeaderAccessSheet.tsx`:
     - Toggle between "Create Room" (display name input + "Create Room" CTA) and "Claim Room" (sessionCode + leaderPin + "Claim Leadership" CTA).
     - Inline accessible error alert (`role="alert"`).
     - "Back" button to return to role selection in one tap.
   - `ParticipantJoinSheet.tsx`:
     - Inputs for `sessionCode` (prefilled if URL matches, auto-uppercased) and `displayName`.
     - "Join Study" gold primary CTA (56px height, pill radius, spring tap).
     - Inline accessible error alert (`role="alert"`).
     - "Back" button to return to role selection in one tap.
   - `ActiveSessionBanner.tsx`:
     - Displays active session status (`● LIVE ROOM`, `sessionCode`, `leaderPin` for leaders, assigned role, connected count, and "Leave Session" action).

4. **Shell Integration (`src/client/App.tsx` & `src/client/styles/global.css`)**:
   - Replace static role tags with the dynamic Welcome flow:
     - When unjoined: render role cards or active sheet (Leader or Participant).
     - When joined: render active session status banner.
   - Keep persistent `<Sacred3DScene />` mounted at all times.
   - Preserve stage preview pills (`data-stage-pill-*`), heading, and status footer to maintain 100% backward compatibility with bootstrap and 3D E2E tests.

## Expected File Changes

- `src/client/lib/urlHelpers.ts` — create; pure utility to parse session codes from `/join/:code` and `?code=`.
- `src/client/lib/useLiveSession.ts` — create; React hook managing `createSessionSocketClient` lifecycle, auto-reconnect, and action dispatches.
- `src/client/components/welcome/WelcomeRoleCards.tsx` — create; role cards matching `ux/1. Welcome.png` with spring tap feedback.
- `src/client/components/welcome/LeaderAccessSheet.tsx` — create; Study Leader room creation and PIN claim sheet with >= 16px inputs.
- `src/client/components/welcome/ParticipantJoinSheet.tsx` — create; Participant join form with sessionCode, displayName, URL prefill, and >= 16px inputs.
- `src/client/components/welcome/ActiveSessionBanner.tsx` — create; active session state card with room code, leader PIN, and leave action.
- `src/client/App.tsx` — modify; integrate Welcome flow views and active session banner while preserving persistent 3D canvas and test hooks.
- `src/client/styles/global.css` — modify; add CSS rules for role cards, access sheets, form inputs (`font-size >= 16px`, `min-height: 48px`), and action buttons (`56px` height).
- `tests/unit/welcome-role-selection.test.tsx` — create; Vitest component suite verifying role cards, zero "Assistant" occurrences, >= 16px input font size, URL prefill, validations, and sheet navigation.
- `tests/e2e/welcome-role-selection.spec.ts` — create; Playwright multi-context E2E test verifying Leader creation, Participant join via `/join/<sessionCode>`, leaderPin handoff, and persistent 3D canvas on `mobile-chromium`.
- `ARCHITECTURE.md` — modify; document `src/client/components/welcome/`, `src/client/lib/useLiveSession.ts`, and `src/client/lib/urlHelpers.ts`.

## Visual Design Impact

- UI involved: yes
- Design source: `DESIGN.md` and `ux/1. Welcome.png`
- Screens or states affected:
  - Welcome Role Selection view (`ux/1. Welcome.png` palette: `#0B0D17` base, `#171B2E` surface, `#E2A83E` gold, `#6E75F5` indigo, `Playfair Display` serif headers, `Plus Jakarta Sans` body).
  - Study Leader Access Sheet (create room mode vs claim existing room mode).
  - Participant Join Sheet (session code + name inputs).
  - Active Session Banner (connected state with room code chip).
- New design artifact required: no — all layouts, colors, and motion constants are fully specified in `DESIGN.md` and `ux/1. Welcome.png`.

## Durable Documentation Impact

- `ARCHITECTURE.md`: update — Document `src/client/components/welcome/`, `src/client/lib/useLiveSession.ts`, and `src/client/lib/urlHelpers.ts` in the client module overview.
- `CONSTRAINTS.md`: not needed — Constraints #1, #3, #5, #7, and #8 already capture all required invariants.
- `AGENTS.md`: not needed — Workflow and startup gates remain unchanged.
- Other docs: Update `feature_list.json` and `PROGRESS.md` with verification evidence upon completion.

## Implementation Plan

1. Create `src/client/lib/urlHelpers.ts` with tests for extracting and normalizing session codes from pathname and query parameters.
2. Implement `src/client/lib/useLiveSession.ts` wrapping `createSessionSocketClient`, supporting initial `sessionStorage` reconnect, action methods, and connection state.
3. Build `WelcomeRoleCards.tsx`, `LeaderAccessSheet.tsx`, `ParticipantJoinSheet.tsx`, and `ActiveSessionBanner.tsx` in `src/client/components/welcome/` with `motion/react` spring physics and `>= 16px` inputs.
4. Integrate the components into `src/client/App.tsx` and style in `src/client/styles/global.css`, ensuring persistent `Sacred3DScene` stays mounted and bootstrap assertions remain green.
5. Add Vitest component tests (`tests/unit/welcome-role-selection.test.tsx`) and Playwright E2E tests (`tests/e2e/welcome-role-selection.spec.ts`), update `ARCHITECTURE.md`, and execute baseline `./init.sh` and `PLAYWRIGHT_PORT=3302 npm run test:e2e`.

## Implementation Tasks

- [ ] Create `src/client/lib/urlHelpers.ts` exporting `extractJoinCodeFromLocation(locationLike)` with unit tests.
- [ ] Create `src/client/lib/useLiveSession.ts` providing reactive WebSocket session state, auto-reconnect, and action methods (`createRoom`, `claimLeadership`, `joinRoom`, `leaveRoom`).
- [ ] Implement `src/client/components/welcome/WelcomeRoleCards.tsx` matching `ux/1. Welcome.png` with `Study Leader` and `Participant` cards, crown/group icons, and `scale: 0.96` spring feedback.
- [ ] Implement `src/client/components/welcome/LeaderAccessSheet.tsx` (Create Room and Claim Existing Room modes with 4-digit PIN support, `>= 16px` inputs, and Back navigation).
- [ ] Implement `src/client/components/welcome/ParticipantJoinSheet.tsx` (`sessionCode` with auto-uppercasing and URL prefill, `displayName`, `>= 16px` inputs, and Back navigation).
- [ ] Implement `src/client/components/welcome/ActiveSessionBanner.tsx` displaying connected room details, leader PIN, and leave action.
- [ ] Integrate welcome flow into `src/client/App.tsx` and update `src/client/styles/global.css`, preserving persistent `Sacred3DScene` and bootstrap test selectors.
- [ ] Add `tests/unit/welcome-role-selection.test.tsx` and `tests/e2e/welcome-role-selection.spec.ts`.
- [ ] Update `ARCHITECTURE.md`, verify zero `Assistant` occurrences across `src/`, and run `./init.sh` and `PLAYWRIGHT_PORT=3302 npm run test:e2e`.

## Verification Plan

- Run `./init.sh` (executing `npm run typecheck`, `npm test`, and `npm run build` synchronously without starting long-running dev servers).
- Confirm Vitest component suite `tests/unit/welcome-role-selection.test.tsx` passes, verifying:
  - `Study Leader` and `Participant` labels render cleanly with zero occurrences of `Assistant`,
  - All form inputs maintain computed `font-size >= 16px` (`1rem`),
  - Session code input auto-uppercases and prefills from `/join/ABCXYZ` or `?code=ABCXYZ`,
  - Tapping "Back" returns to role selection cards in one step,
  - Form validation blocks empty names or malformed PINs before dispatch.
- Run Playwright E2E suite on dedicated worktree port: `PLAYWRIGHT_PORT=3302 npm run test:e2e`, verifying:
  - `tests/e2e/app-shell-bootstrap.spec.ts` passes,
  - `tests/e2e/sacred-3d-stage.spec.ts` passes,
  - `tests/e2e/ws-room-lifecycle.spec.ts` passes,
  - `tests/e2e/welcome-role-selection.spec.ts` passes across multiple browser contexts (Leader creates room -> Participant joins via `/join/<sessionCode>` -> live attendee count syncs -> second leader claims via PIN -> persistent canvas stays mounted).
- Run static scan: `grep -rn "Assistant" src/` must return `0` results.

## Evidence To Capture

- Exit code `0` from `./init.sh` (`npm run typecheck`, Vitest suite/test counts, Vite/server bundle output).
- Exit code `0` from `PLAYWRIGHT_PORT=3302 npm run test:e2e` confirming all specs passed on `mobile-chromium` (`390x844`).
- Output of `grep -rn "Assistant" src/` showing `0` matches.

## Validator Checklist

- [ ] Implementation stays strictly within `welcome-role-selection-flow` scope (no PDF parser or Title Lobby QR generation added prematurely).
- [ ] All English UI copy, accessible labels, types, and tests use `Study Leader` and `Participant`—zero occurrences of `Assistant`.
- [ ] All form inputs (`<input>`) enforce computed `font-size >= 16px` (`1rem`) on mobile viewports.
- [ ] Study Leader can create a room (receiving 6-char `sessionCode` and 4-digit `leaderPin`) or claim an existing room with `leaderPin`.
- [ ] Participant can join with `sessionCode` and `displayName`, with automatic prefill when opening `/join/:code`.
- [ ] Tactile `motion/react` spring feedback (`stiffness: 420, damping: 26, scalePressed: 0.96`) is active on role cards and action buttons.
- [ ] Persistent `Sacred3DScene` WebGL `<canvas>` stays mounted throughout all sheet and role state transitions.
- [ ] `./init.sh` and `PLAYWRIGHT_PORT=3302 npm run test:e2e` pass, durable documentation (`ARCHITECTURE.md`) is updated, and evidence is recorded.

# Feature Implementation Spec: Joining a session isolates full-screen Participant waiting view from Leader lobby

## Source Feature

- `id`: `post-join-fullscreen-lobby-isolation`
- `area`: `session-lobby`
- `depends_on`: `["title-lobby-qr-join-start"]`
- `status`: `not_started`
- `source`: `feature_list.json`

## Goal

Enforce **Exclusive Full-Screen Isolation Post-Join** (`DESIGN.md` Override #2) across mobile/desktop standalone mode and Desktop Dual Side-by-Side Mode while preserving the single persistent WebGL `<Canvas>` budget (`CONSTRAINTS.md` #8). Once a user creates or joins a `LiveSession` (`Boolean(liveSession.session)` across `setup`, `lobby`, or `in_progress`), the Welcome hero header (`.sanctuary-hero`), the stage-pill switcher chrome (`.sanctuary-stage-header`, `.sacred-stage-pill-grid`, `[data-stage-pill]`, `.sanctuary-stage-copy`), and the Welcome footer (`.sanctuary-footer` / `sanctuary-health-pill`) unmount completely so the active post-join view occupies `100%` of the viewport (`min-height: 100dvh`) beneath an unobtrusive compact session top bar (`ActiveSessionBanner` compact strip + `SessionResilienceChip`).

Isolate the `lobby` (and early `setup`) experience by role: **Participants** (`!isLeader`) see **only** a contemplative full-screen waiting view (`ParticipantWaitingScreen`) centered on the glowing 3D `Sacred3DScene` (`sanctuary-emblem`) and the exact message **"The study leader will begin shortly"** (plus the unobtrusive connection/leave top bar in standalone mode, with zero study title, Gospel citation, `ATTENDEES`/`SECTIONS`/`DURATION` metrics card, `Room Code / QR`, or `Start Study` controls). The **Study Leader** (`isLeader && sessionStatus === 'lobby'`) sees a clean full-screen `TitleLobbyScreen` with the 3D `Sacred3DScene` emblem, study overview, live `ATTENDEES` / `SECTIONS` / `DURATION` metrics, `Room Code / QR` share trigger, `Start Study →`, and compact session top bar with Leader PIN and Leave.

## Non-Goals

- **Parallel Wave 1 Boundary (Non-Negotiable — ZERO diff)**: Do **not** read-for-edit or modify `src/shared/study.ts`, `src/server/studies/*`, or `src/client/components/setup/StudyStructureList.tsx` (owned concurrently by `six-section-study-model-parser`). Keep all section counts and IDs compatible with the current codebase.
- Implementing the 6-section study model/parser (`six-section-study-model-parser`) or Section 4 `Deep Analysis` screen (`section-4-deep-analysis-screen`).
- Persistent `Share QR` button inside active `in_progress` study sections (`leader-persistent-qr-code-reshare`).
- Multi-second full-screen 3D section-entry overlays (`fullscreen-3d-section-entry-animations`), First-Hand-Wins auto-assignment (`first-hand-wins-volunteer-assignment`), or automatic 3D random-picker reveal (`fullscreen-3d-random-picker-reveal`).
- Any `/ws` protocol or server changes (`SESSION_PROTOCOL_VERSION` remains `3`; `src/server/*` and `src/shared/*` require zero modifications).

## Job Story

When I join or lead a live Bible study session on my phone,
I want the Welcome landing page and stage-switcher clutter to disappear completely—showing me a calm full-screen waiting emblem as a Participant or a clean full-screen control lobby as the Study Leader—
so my attention stays anchored on our communal prayer and Scripture session without leftover onboarding chrome.

## Users And Permissions

- **`Participant`**: In `lobby` (or when joining early while the room is still in `setup`), sees **only** `ParticipantWaitingScreen` (*"The study leader will begin shortly"*) with the 3D `Sacred3DScene` `sanctuary-emblem` and compact session bar (`Participant` badge, room code, connected count, resilience chip, `Leave`); never sees `leaderPin`, `TitleLobbyScreen` study title/metrics, `Room Code / QR`, or `Start Study`.
- **`Study Leader`**: In `setup`, sees full-screen `LeaderStudySetupScreen` (with compact session bar including 4-digit `leaderPin` and `setupPanelOpen` collapse/resume support). In `lobby`, sees full-screen `TitleLobbyScreen` (`mode="leader"`) with `Sacred3DScene`, study overview, live `ATTENDEES` / `SECTIONS` / `DURATION`, `Room Code / QR` modal trigger, and server-gated `Start Study →`.
- **`Desktop Dual Mode Operator` (`>= 1024px`)**: Sees `TitleLobbyScreen` in the left `Study Leader` device frame and `ParticipantWaitingScreen` (*"The study leader will begin shortly"*) in the right `Participant` device frame during `lobby` status, with `<= 2` WebGL `<canvas>` elements total.
- **Terminology Invariant**: `Study Leader` and `Participant` only — zero occurrences of `"Assistant"` anywhere in `src/` or tests (`CONSTRAINTS.md` #3).

## Acceptance Scenarios

### Scenario 1: Exclusive full-screen isolation unmounts Welcome chrome post-join and restores it on Leave

Given a user is on the Welcome screen where `.sanctuary-hero`, `.sanctuary-stage-card` (`6` `[data-stage-pill]` buttons), and `.sanctuary-footer` (`sanctuary-health-pill`) are visible
When the user creates a room (`setup`), opens `lobby`, joins via `/join/:code`, or advances into an `in_progress` section
Then `.sanctuary-hero`, `.sanctuary-stage-card`, `.sanctuary-stage-header`, `.sacred-stage-pill-grid`, `[data-stage-pill]`, `.sanctuary-stage-copy`, and `.sanctuary-footer` (`sanctuary-health-pill`) have DOM count `0`
And the post-join shell occupies `100%` of the viewport (`min-height: 100dvh`, zero horizontal overflow on `390x844`) with the compact session bar (`active-session-banner` + `session-resilience-chip`) preserving `active-session-code`, leader-only `active-leader-pin`, `active-user-role`, `active-connected-count`, and `active-session-leave-btn` (`>= 44px`)
And when the user clicks `Leave` (or the session ends via `finish_study` / `onSessionGone`), the Welcome hero, 6 stage pills, role cards, and health footer cleanly remount.

### Scenario 2: Participant in `lobby` (or `setup`) sees ONLY the full-screen waiting view

Given a `Study Leader` has created a session (either still in `setup` or after `Continue` into `lobby` with `"Great Is Your Faith"` loaded)
When a `Participant` joins the room
Then the `Participant` sees `data-testid="participant-waiting-screen"` centered vertically with the glowing 3D `Sacred3DScene` (`data-stage="sanctuary-emblem"`) and `data-testid="participant-waiting-message"` reading exact text `"The study leader will begin shortly"`
And `title-lobby`, `title-lobby-title`, `title-lobby-citation`, `title-lobby-metrics`, `title-lobby-attendee-count`, `lobby-share-trigger`, `lobby-start-study`, `active-leader-pin-box`, `.sanctuary-hero`, and `[data-stage-pill]` all have DOM count `0` on the Participant's page.

### Scenario 3: Study Leader in `lobby` sees a clean full-screen Lobby view

Given the `Study Leader` clicks `Continue` on `LeaderStudySetupScreen` (`setup` → `lobby`)
When `TitleLobbyScreen` renders on the leader device
Then `.sanctuary-hero`, `[data-stage-pill]`, and `.sanctuary-footer` have DOM count `0`
And the leader sees the compact top session bar (`Study Leader` role, room code, 4-digit `active-leader-pin`, `active-connected-count`, `session-resilience-chip`, `Leave`), the 3D `Sacred3DScene` (`sanctuary-emblem`), `title-lobby` with liturgical eyebrow, study title, Gospel-only citation, live `ATTENDEES` / `SECTIONS` / `DURATION` metrics (updating live on `roster_updated`), `Room Code / QR` (`lobby-share-trigger`), and `Start Study →` (`lobby-start-study`).

### Scenario 4: Single persistent WebGL `<canvas>` survives pre-join ↔ post-join transitions without remounting

Given the user is on Welcome and clicks `stage-pill-star-of-faith` on the persistent `Sacred3DScene`
When the user creates or joins a session (`setup` → `lobby` → `section_1_prayer`) and later leaves back to Welcome
Then `document.querySelectorAll('canvas').length` remains `<= 1` at every step and the exact same `HTMLCanvasElement` instance stays mounted without WebGL context teardown/recreation
And entering `LeaderStudySetupScreen`, `TitleLobbyScreen`, or `ParticipantWaitingScreen` automatically synchronizes `Sacred3DScene` back to `'sanctuary-emblem'` (`accentMode: 'default'`), and leaving the session resets the stage to `'sanctuary-emblem'`.

### Scenario 5: Desktop Dual Side-by-Side Mode isolates Participant waiting view from Leader lobby

Given a desktop viewport (`>= 1024px`) running `?mode=dual` in `lobby` status
Then `leader-frame` renders `title-lobby` with study metrics and `lobby-start-study` alongside its scoped `Sacred3DScene`
And `participant-frame` renders `participant-waiting-screen` (*"The study leader will begin shortly"*) with its scoped `Sacred3DScene` (`sanctuary-emblem`) and zero `title-lobby` or `lobby-start-study` elements, while total `<canvas>` count across the document remains `<= 2`.

## Repository Research

### Files Inspected

- `DESIGN.md` (Override #2 lines 150–154, Layout line 202, Core Screen 3 line 221, Do's line 233), `CONSTRAINTS.md` (#1–#8), `ARCHITECTURE.md`, `CONTEXT.md`, `docs/domain-model.md`, `docs/user-and-access-model.md`.
- `src/client/App.tsx` — currently renders `<header className="sanctuary-hero">`, `<section className="sanctuary-stage-card">` (with 6 stage pills), and `<footer className="sanctuary-footer">` unconditionally above/around `{liveSession.session ? ...}` (lines 214–282, 564–575), and routes both roles in `lobby` to `<TitleLobbyScreen mode={isLeader ? 'leader' : 'participant'} />` (lines 356–369) while rendering `null` for `!isLeader && sessionStatus === 'setup'`.
- `src/client/components/lobby/TitleLobbyScreen.tsx` & `RoomCodeShareSheet.tsx` — leader + participant lobby implementation; does not currently sync `useSacredStageStore` on mount.
- `src/client/components/welcome/ActiveSessionBanner.tsx` — renders `active-session-banner`, `active-user-role`, `active-session-code`, leader-only `active-leader-pin-box` / `active-leader-pin`, `active-connected-count`, and `active-session-leave-btn`.
- `src/client/components/dual/DualDeviceFrame.tsx` — lines 99–108 currently render `<TitleLobbyScreen mode={isLeader ? 'leader' : 'participant'} />` for both frames in `lobby`.
- `src/client/components/stage/Sacred3DScene.tsx` & `src/client/state/sacredStageStore.ts` — `resolveSacredStage({ screen: 'title-lobby' | 'leader-setup' })` already maps both screens to `{ stage: 'sanctuary-emblem', accentMode: 'default' }`, and `useSacredStageStore` supports both the singleton store and Dual Mode's `SacredStageProvider`.
- `src/client/styles/global.css` — `.sanctuary-column` uses `min-height: 100dvh; justify-content: space-between` (lines 67–82); line 6805 begins `/* Session resilience chip (wake lock + foreground resync status) */`.
- Existing unit & Playwright suites (`tests/unit/*`, `tests/e2e/*`) — audited all references to `title-lobby`, `active-session-banner`, `sanctuary-health-pill`, `stage-pill-*`, and `global.css` regex scans.

### Existing Patterns To Follow

- Keep `<Sacred3DScene />` mounted inside a stable parent element tag + React `key` so React updates wrapper classes/attributes in place without unmounting the R3F `<Canvas>` (`tests/e2e/sacred-3d-stage.spec.ts` checks `allCanvases[0] === initial`).
- Sync section/lobby stages inside screen `useEffect` hooks via `resolveSacredStage` + `useSacredStageStore((s) => s.setStage)` (matching `OpeningPrayerScreen`, `IcebreakerScreen`, `GospelReadingScreen`, `DiscussionScreen`, and `ClosingPrayerScreen`), never calling `setStage` unconditionally during initial Welcome mount (`tests/unit/sacred-3d-scene.test.tsx` `AppProfiler` steady-state invariant).
- Guard `motion/react` animations with `usePrefersReducedMotion`, keep interactive targets `>= 44px` and inputs `>= 16px`, and close live rooms in Playwright `finally` blocks so `activeSessionCount` returns to `0`.

### Current Gaps

- `App.tsx` leaves Welcome hero, stage-switcher card/pills, and footer mounted throughout `setup`, `lobby`, and `in_progress`.
- No dedicated `ParticipantWaitingScreen` exists; Participants in `lobby` currently receive `TitleLobbyScreen` with study title, citation, and metrics, and Participants joining during `setup` see nothing below `ActiveSessionBanner`.
- `DualDeviceFrame.tsx` renders `TitleLobbyScreen` in `participant` mode instead of an isolated waiting screen.
- Neither `LeaderStudySetupScreen`, `TitleLobbyScreen`, nor session-leave resets `Sacred3DScene` to `'sanctuary-emblem'` if a different stage was active beforehand.
- `SessionResilienceChip`'s `onSessionGone` callback in `App.tsx` (lines 305–309) omits the `/join/` `window.history.replaceState({}, '', '/')` cleanup present in `onLeave` (Session 026 handoff note).

## Technical Approach

1. **Create `ParticipantWaitingScreen` (`src/client/components/lobby/ParticipantWaitingScreen.tsx`)**:
   - Render `<section className="participant-waiting-screen" data-testid="participant-waiting-screen" aria-label="Waiting for Study Leader" aria-live="polite">` containing only a calm `motion` fade-up wrapper (disabled when `usePrefersReducedMotion()` is true) and `<p className="participant-waiting-message" data-testid="participant-waiting-message">The study leader will begin shortly</p>`.
   - On mount (`useEffect`), resolve `const resolved = resolveSacredStage({ screen: 'title-lobby' })` and call `setStage(resolved.stage, { accentMode: resolved.accentMode })` via `useSacredStageStore` (which automatically targets the scoped `SacredStageProvider` store inside `DualDeviceFrame` or the singleton store in `App`).
   - Render **zero** study title, Gospel citation, metrics, share controls, or `Start Study` buttons.
2. **Stage sync on `TitleLobbyScreen` and `LeaderStudySetupScreen`**:
   - In `TitleLobbyScreen.tsx` and `LeaderStudySetupScreen.tsx`, add a `useEffect` syncing `useSacredStageStore((s) => s.setStage)` via `resolveSacredStage({ screen: 'title-lobby' })` and `resolveSacredStage({ screen: 'leader-setup' })` respectively so entering Setup or Lobby always shows `'sanctuary-emblem'` (`accentMode: 'default'`).
3. **Add `compact?: boolean` mode to `ActiveSessionBanner` (`src/client/components/welcome/ActiveSessionBanner.tsx`)**:
   - Keep `compact = false` as the default so standalone `ActiveSessionBanner` unit tests (`tests/unit/welcome-role-selection.test.tsx`) behave identically (`LIVE ROOM`, `Leave Session`, PIN hint).
   - When `compact` is `true`, render `data-compact="true"` on `data-testid="active-session-banner"` with a sleek single-strip/wrap-safe pill layout preserving every required hook used across existing E2E suites: `active-user-role` (`Study Leader` / `Participant`), `active-session-code` (`session.sessionCode`), `active-connected-count` (`"{N} member(s) connected"`), leader-only `active-leader-pin-box` + `active-leader-pin` (`PIN` + `{leaderPin}`, omitting the multi-line `.active-session-pin-hint` paragraph), and `active-session-leave-btn` (`aria-label="Leave Session"`, `min-height: 44px`, visible label `Leave`).
4. **Post-join full-screen isolation & persistent `<Sacred3DScene />` slot in `src/client/App.tsx`**:
   - Compute `const hasSession = Boolean(liveSession.session);` and `const stageLayout = !hasSession ? 'welcome' : !isLeader && (sessionStatus === 'lobby' || sessionStatus === 'setup') ? 'waiting' : sessionStatus === 'lobby' ? 'lobby' : sessionStatus === 'setup' ? 'setup' : 'section';`.
   - Render `<main className={hasSession ? 'sanctuary-column sanctuary-column--fullscreen' : 'sanctuary-column'}>`:
     - Slot 1: When `hasSession`, render `<div key="post-join-session-bar" className="post-join-session-bar">` containing `<ActiveSessionBanner compact ... />` and `<SessionResilienceChip ... />` (with `/join/` `history.replaceState` cleanup added to `onSessionGone` too). When `!hasSession`, render `<header key="welcome-hero" className="sanctuary-hero">...</header>`.
     - Slot 2 (Persistent Stage): Always render the **same `<div>` tag and `key="persistent-sacred-stage"`** at this exact child position:
       - When `!hasSession`: `className="sanctuary-stage-card" role="region" aria-label="Sanctuary readiness" data-health={healthState}`, rendering `.sanctuary-stage-header` (`key="stage-header"`), `<Sacred3DScene key="sacred-3d-scene" />`, `.sacred-stage-pill-grid` (`key="stage-pills"`), and `.sanctuary-stage-copy` (`key="stage-copy"`).
       - When `hasSession`: `className="post-join-stage-shell" data-stage-layout={stageLayout}` (`data-testid="post-join-stage-shell"`), rendering **only** `<Sacred3DScene key="sacred-3d-scene" />`. Because both `<div key="persistent-sacred-stage">` and `<Sacred3DScene key="sacred-3d-scene" />` retain identical element types and keys in the same parent `<main>`, React never unmounts the WebGL `<Canvas>`.
     - Slot 3 (Active Screen):
       - `hasSession`:
         - `isLeader && sessionStatus === 'setup'` → `setupPanelOpen ? <LeaderStudySetupScreen ... /> : <motion.button data-testid="study-setup-resume" ... />`
         - `!isLeader && (sessionStatus === 'lobby' || sessionStatus === 'setup')` → `<ParticipantWaitingScreen />`
         - `isLeader && sessionStatus === 'lobby'` → `<TitleLobbyScreen mode="leader" ... />`
         - `sessionStatus === 'in_progress'` → existing section switch (`OpeningPrayerScreen`, `IcebreakerScreen`, `GospelReadingScreen`, `DiscussionScreen`, `ClosingPrayerScreen`, `SectionPlaceholderScreen`).
       - `!hasSession`: existing `LeaderAccessSheet` / `ParticipantJoinSheet` / `WelcomeRoleCards`.
     - Slot 4: `{!hasSession && <footer key="welcome-footer" className="sanctuary-footer">...</footer>}`.
   - Track `const hadSessionRef = useRef(false)` in `App.tsx`: set `hadSessionRef.current = true` when `liveSession.session` is non-null, and only when transitioning from `true` back to `null` call `setStage('sanctuary-emblem', { accentMode: 'default' })` (preserving zero extra commits on initial Welcome mount for `tests/unit/sacred-3d-scene.test.tsx`).
5. **Dual Mode isolation (`src/client/components/dual/DualDeviceFrame.tsx`)**:
   - Compute `const isWaitingView = !isLeader && (session?.status === 'lobby' || session?.status === 'setup');` and set `data-stage-layout={isWaitingView ? 'waiting' : 'default'}` on `.dual-frame-stage-wrapper`.
   - When `session?.status === 'lobby' || session?.status === 'setup'`, render `<TitleLobbyScreen mode="leader" ... />` when `isLeader` and `<ParticipantWaitingScreen />` when `!isLeader`.
6. **Full-screen `100dvh` & centering styles (`src/client/styles/global.css`)**:
   - **CRITICAL INVARIANT**: `tests/unit/session-resilience-chip.test.tsx` (line 270) slices `global.css` from `/* Session resilience chip` (currently line 6805) to EOF and asserts `not.toContain('cursor: pointer')`. Insert **all** new CSS rules **strictly BEFORE** `/* Session resilience chip (wake lock + foreground resync status) */`, and keep all existing rules matched by regex in `tests/unit/leader-study-setup.test.tsx` and `tests/unit/title-lobby.test.tsx` (including `.title-lobby-waiting-pill { min-height: 44px }`) intact.
   - Style `.sanctuary-column--fullscreen` (`min-height: 100dvh; justify-content: flex-start; padding-top: calc(env(safe-area-inset-top, 0px) + 0.75rem)`), `.post-join-session-bar` (compact wrap-safe header row with zero horizontal overflow at `390px`), `.active-session-card[data-compact='true']` (slim pills + `min-height: 44px` on `.active-session-leave-btn`), `.post-join-stage-shell[data-stage-layout='waiting']` (`margin-top: auto` with `220px` luminous emblem container) + `.participant-waiting-screen` (`margin-bottom: auto`, centered editorial/sans typography `>= 1.25rem` on `#F8FAFC`), and `.dual-frame-stage-wrapper[data-stage-layout='waiting']` (`margin-top: auto`) so the 3D emblem and `"The study leader will begin shortly"` center vertically in both standalone (`100dvh`) and Dual Mode (`844px` chassis).
7. **Targeted compatibility updates to existing tests**:
   - `tests/e2e/title-lobby-qr-join.spec.ts`: Update `joinAsParticipant` (line 64) to wait for `participant-waiting-screen` instead of `title-lobby`; in Scenario 1/3 (lines 142–223) assert `title-lobby-attendee-count` (`'2'`, then `'1'`) and `title-lobby-title` on `pageLeader` while asserting `pageA`/`pageB` render `participant-waiting-screen` + `participant-waiting-message` (`"The study leader will begin shortly"`) and have count `0` for `title-lobby`, `title-lobby-metrics`, and `lobby-start-study`; in Scenario 2 metadata fallback (lines 277–342) assert `title-lobby-study-fallback` (`"Study not loaded yet"`) on `pageLeader` (before `load_study`) while `pageParticipant` sees only `participant-waiting-screen`.
   - `tests/e2e/mobile-wake-lock-foreground-resync.spec.ts`: Update Scenario 5 (line 536) on `pageMia` (`Participant` in `lobby`) from `getByTestId('title-lobby')` to `getByTestId('participant-waiting-screen')` (and line 564 cleanup check).
   - `tests/e2e/desktop-dual-side-by-side-mode.spec.ts`: In Scenarios 1 & 2 (`lobby`), assert `participantFrame.getByTestId('participant-waiting-screen')` is visible with `"The study leader will begin shortly"` and `participantFrame.getByTestId('title-lobby')` has count `0`.
   - `tests/unit/title-lobby.test.tsx`: Update the participant lobby unit describe block to test `ParticipantWaitingScreen` (exact message, stage sync to `'sanctuary-emblem'`, zero `Start Study` / `Room Code / QR` / study metrics / `"Assistant"`) while keeping leader `TitleLobbyScreen` and CSS baseline tests green.

## Expected File Changes

- `src/client/components/lobby/ParticipantWaitingScreen.tsx` — create; full-screen Participant waiting view (*"The study leader will begin shortly"*) with `Sacred3DScene` `'sanctuary-emblem'` stage sync.
- `src/client/components/welcome/ActiveSessionBanner.tsx` — modify; add `compact?: boolean` post-join header strip mode preserving all `active-*` testids, leader-only PIN gating, and `>= 44px` Leave target.
- `src/client/components/lobby/TitleLobbyScreen.tsx` — modify; sync `Sacred3DScene` to `'sanctuary-emblem'` on mount via `resolveSacredStage`.
- `src/client/components/setup/LeaderStudySetupScreen.tsx` — modify; sync `Sacred3DScene` to `'sanctuary-emblem'` on mount via `resolveSacredStage`.
- `src/client/App.tsx` — modify; unmount Welcome hero/stage-pills/footer when `Boolean(liveSession.session)`, keep `<div key="persistent-sacred-stage">` + `<Sacred3DScene key="sacred-3d-scene" />` mounted at a stable slot, render `.post-join-session-bar`, route `!isLeader && (sessionStatus === 'lobby' || sessionStatus === 'setup')` to `ParticipantWaitingScreen`, reset stage via `hadSessionRef` on session exit, and clean up `/join/` path in `onSessionGone`.
- `src/client/components/dual/DualDeviceFrame.tsx` — modify; route Participant frame in `lobby`/`setup` to `ParticipantWaitingScreen` with centered stage layout.
- `src/client/styles/global.css` — modify; add `.sanctuary-column--fullscreen`, `.post-join-session-bar`, compact `ActiveSessionBanner`, `.post-join-stage-shell`, and `.participant-waiting-screen` rules **before** `/* Session resilience chip`.
- `tests/unit/post-join-fullscreen-isolation.test.tsx` — create; test Welcome chrome unmounting across `setup`/`lobby`/`in_progress`, `ParticipantWaitingScreen` isolation, single-canvas DOM identity persistence across join/leave, stage reset to `'sanctuary-emblem'`, and Dual Mode `DualDeviceFrame` lobby isolation.
- `tests/unit/title-lobby.test.tsx` — modify; align Participant lobby tests with `ParticipantWaitingScreen` and verify `.participant-waiting-screen` CSS rules.
- `tests/e2e/post-join-fullscreen-lobby-isolation.spec.ts` — create; focused mobile `390x844` multi-context E2E suite verifying full-screen `100dvh` isolation, zero Welcome chrome post-join, Participant waiting screen vs Leader lobby, `HTMLCanvasElement` identity persistence across Welcome → Setup → Lobby → Section 1 → Leave, and zero horizontal overflow.
- `tests/e2e/title-lobby-qr-join.spec.ts`, `tests/e2e/mobile-wake-lock-foreground-resync.spec.ts`, `tests/e2e/desktop-dual-side-by-side-mode.spec.ts` — modify; documented Participant lobby selector updates (`title-lobby` → `participant-waiting-screen` on Participant contexts).
- `ARCHITECTURE.md` — modify; document `ParticipantWaitingScreen` and the post-join full-screen shell / persistent `<Sacred3DScene />` slot in `src/client`.

## Visual Design Impact

- UI involved: yes
- Design source: `DESIGN.md` (Override #2: Exclusive Full-Screen Isolation Post-Join, Layout `100dvh`, Core Screen 3) + `ux/3. Title - Leader.png`
- Screens or states affected: Post-join shell (`setup`, `lobby`, `in_progress`), Participant waiting screen (`lobby` / early `setup`), Study Leader Lobby (`lobby`), compact post-join session bar, Desktop Dual Side-by-Side Mode Participant frame in `lobby`.
- New design artifact required: no — Midnight Sanctuary tokens (`#0B0D17` canvas, `#171B2E` glass-slate pills, `#E2A83E` Sacred Gold, `#6E75F5` Participant accent, `#F8FAFC` / `#CBD5E1` copy, `Playfair Display` / `Plus Jakarta Sans`) and `Sacred3DScene` `sanctuary-emblem` are already established in `DESIGN.md`.

## Durable Documentation Impact

- `ARCHITECTURE.md`: update — record `ParticipantWaitingScreen.tsx` under `src/client/components/lobby/` and document how `App.tsx` unmounts Welcome chrome post-join while retaining a single persistent `<Sacred3DScene />` wrapper across Welcome and active session views.
- `CONSTRAINTS.md`: not needed — constraints #3, #5, #7, and #8 already govern terminology, gating, mobile tap/font sizes, and WebGL canvas budget.
- `AGENTS.md`: not needed — Working Rules already state the post-join full-screen unmount rule.
- Other docs: none (`DESIGN.md` Override #2 already defines the target UX; `feature_list.json` and `PROGRESS.md` are updated with verification evidence at completion).

## Implementation Plan

1. Create `ParticipantWaitingScreen.tsx` and add `'sanctuary-emblem'` mount synchronization to `ParticipantWaitingScreen`, `TitleLobbyScreen`, and `LeaderStudySetupScreen`.
2. Add `compact` mode to `ActiveSessionBanner.tsx` and refactor `App.tsx` + `DualDeviceFrame.tsx` so Welcome chrome unmounts whenever `Boolean(liveSession.session)` is true while `<div key="persistent-sacred-stage">` + `<Sacred3DScene key="sacred-3d-scene" />` remain mounted in place.
3. Add `100dvh` full-screen layout, compact top session bar, and centered waiting stage styles to `src/client/styles/global.css` strictly above `/* Session resilience chip`.
4. Add `tests/unit/post-join-fullscreen-isolation.test.tsx` and `tests/e2e/post-join-fullscreen-lobby-isolation.spec.ts`, and apply the documented Participant lobby updates to `tests/unit/title-lobby.test.tsx`, `tests/e2e/title-lobby-qr-join.spec.ts`, `tests/e2e/mobile-wake-lock-foreground-resync.spec.ts`, and `tests/e2e/desktop-dual-side-by-side-mode.spec.ts`.
5. Update `ARCHITECTURE.md`, run `./init.sh`, `PLAYWRIGHT_PORT=3302 npm run test:e2e`, terminology scan, and Parallel Wave 1 zero-diff check, then record evidence in `feature_list.json` and `PROGRESS.md`.

## Implementation Tasks

- [ ] Create `src/client/components/lobby/ParticipantWaitingScreen.tsx` rendering `"The study leader will begin shortly"` (`participant-waiting-screen` / `participant-waiting-message`) and syncing `Sacred3DScene` to `'sanctuary-emblem'`.
- [ ] Sync `Sacred3DScene` to `'sanctuary-emblem'` on mount in `TitleLobbyScreen.tsx` and `LeaderStudySetupScreen.tsx`.
- [ ] Add `compact?: boolean` mode to `ActiveSessionBanner.tsx` keeping all `active-*` testids, leader-only `leaderPin`, `aria-label="Leave Session"`, and `>= 44px` button height.
- [ ] Update `src/client/App.tsx` to unmount `.sanctuary-hero`, `.sanctuary-stage-card` header/pills/copy, and `.sanctuary-footer` post-join while preserving `<div key="persistent-sacred-stage">` + `<Sacred3DScene key="sacred-3d-scene" />`, routing `!isLeader` in `lobby`/`setup` to `ParticipantWaitingScreen`, resetting stage via `hadSessionRef` on leave, and cleaning `/join/` URLs in `onSessionGone`.
- [ ] Update `src/client/components/dual/DualDeviceFrame.tsx` to render `ParticipantWaitingScreen` for `!isLeader` in `lobby`/`setup` with `data-stage-layout="waiting"`.
- [ ] Add full-screen `100dvh`, compact session bar, and centered waiting-stage CSS in `src/client/styles/global.css` strictly **before** `/* Session resilience chip`.
- [ ] Add `tests/unit/post-join-fullscreen-isolation.test.tsx` and update `tests/unit/title-lobby.test.tsx`.
- [ ] Add `tests/e2e/post-join-fullscreen-lobby-isolation.spec.ts` and update `tests/e2e/title-lobby-qr-join.spec.ts`, `tests/e2e/mobile-wake-lock-foreground-resync.spec.ts`, and `tests/e2e/desktop-dual-side-by-side-mode.spec.ts`.
- [ ] Update `ARCHITECTURE.md` and run full verification gates (`./init.sh`, `PLAYWRIGHT_PORT=3302 npm run test:e2e`, `grep -rn "Assistant" src/`, and `git diff` guard on Wave 1 forbidden paths).

## Verification Plan

- `./init.sh` (run with `PORT=3102 API_PORT=3202 PLAYWRIGHT_PORT=3302 ./init.sh`):
  - Executes the non-blocking standard gate (`npm run typecheck`, `npm test`, `npm run build`) and exits `0`.
  - `./init.sh` must not start long-running processes such as `npm run dev`; it may only print manual follow-up commands after checks pass.
- `PORT=3102 API_PORT=3202 PLAYWRIGHT_PORT=3302 npm run test:e2e`:
  - Runs the full Playwright suite on dedicated port `3302` (`mobile-chromium` `390x844` + desktop Dual Mode `1440x900`), verifying:
    - Post-join DOM has `0` `.sanctuary-hero`, `0` `[data-stage-pill]`, and `0` `.sanctuary-footer` across `setup`, `lobby`, and `in_progress`, and remounts them cleanly after `Leave`.
    - Participant in `lobby` (and early `setup`) sees `participant-waiting-screen` (*"The study leader will begin shortly"*) + `Sacred3DScene` (`sanctuary-emblem`) and `0` `title-lobby` / metrics / `Start Study`.
    - Study Leader in `lobby` sees `title-lobby`, live `ATTENDEES` count, `Room Code / QR`, `Start Study →`, and compact header with `active-leader-pin`.
    - `document.querySelectorAll('canvas').length <= 1` (`<= 2` in Dual Mode) and the exact same `HTMLCanvasElement` reference persists across Welcome → Setup → Lobby → Section 1 → Leave.
    - Computed post-join shell height `>= window.innerHeight` (`100dvh`) and `scrollWidth <= clientWidth` on `390x844`.
- Domain & boundary checks:
  - `grep -rn "Assistant" src/` returns `0` matches.
  - `git diff --name-only -- src/shared/study.ts src/server/studies src/client/components/setup/StudyStructureList.tsx` returns empty output (`0` touched files).

## Evidence To Capture

- Exit `0` summary from `PORT=3102 API_PORT=3202 PLAYWRIGHT_PORT=3302 ./init.sh` (typecheck, Vitest file/test counts including `tests/unit/post-join-fullscreen-isolation.test.tsx`, production build).
- Exit `0` summary from `PORT=3102 API_PORT=3202 PLAYWRIGHT_PORT=3302 npm run test:e2e` across all Playwright specs including `tests/e2e/post-join-fullscreen-lobby-isolation.spec.ts`, `tests/e2e/title-lobby-qr-join.spec.ts`, and `tests/e2e/desktop-dual-side-by-side-mode.spec.ts`.
- `grep -rn "Assistant" src/` (`0` matches) and Wave 1 zero-diff check output recorded in `feature_list.json` and `PROGRESS.md`.

## Validator Checklist

- [ ] Implementation stays strictly within `post-join-fullscreen-lobby-isolation` scope with **zero diff** on `src/shared/study.ts`, `src/server/studies/*`, and `src/client/components/setup/StudyStructureList.tsx`.
- [ ] Acceptance Scenarios 1–5 pass in unit and Playwright E2E tests (`390x844` mobile and `1440x900` Dual Mode).
- [ ] Post-join views unmount `.sanctuary-hero`, `[data-stage-pill]`, and `.sanctuary-footer` completely while preserving compact `active-session-banner` controls (`leaderPin` leader-only, `Leave` `>= 44px`) and `session-resilience-chip`.
- [ ] Participants in `lobby` (and `setup`) see **only** `"The study leader will begin shortly"` with `Sacred3DScene` (`sanctuary-emblem`) and zero `TitleLobbyScreen` metrics/title/`Start Study` elements.
- [ ] Single persistent `<canvas>` (`<= 1` standalone, `<= 2` Dual Mode) survives pre-join ↔ post-join transitions without unmount/remount, and `global.css` changes preserve the `/* Session resilience chip` block invariant.
- [ ] `ARCHITECTURE.md`, `feature_list.json`, and `PROGRESS.md` are updated accurately with concrete verification evidence.

# Feature Implementation Spec: Desktop Dual Side-by-Side Mode synchronizes Leader frame with Participant switcher

## Source Feature

- `id`: `desktop-dual-side-by-side-mode`
- `area`: `dual-mode`
- `depends_on`: `["section-5-closing-prayer-completion", "mobile-wake-lock-foreground-resync"]`
- `status`: `not_started`
- `source`: `feature_list.json`

## Goal

Provide a desktop rehearsal and demonstration environment on viewports `>= 1024px` where a Study Leader mobile frame (`390px x 844px`) and a Participant mobile frame (`390px x 844px`) render side-by-side, connected to an isolated sandbox `LiveSession` over `/ws`. The operator can switch between sample participants ('Mary Lopez', 'Daniel Reyes', 'Sara Castillo', plus dynamically added participants) in the right frame to raise hands, get chosen, complete volunteer turns, submit reflections, and advance through all 5 sections in real-time synchronization, while maintaining the strict WebGL budget of `<= 2` active canvas contexts and zero room leaks.

## Non-Goals

- Multi-window or multi-tab orchestration (the rehearsal runs entirely in a single desktop browser tab).
- Modifying backend `/ws` protocol or adding new server commands (`SESSION_PROTOCOL_VERSION` remains 3; rehearsal leverages existing standard `/ws` commands).
- Allowing desktop dual mode on viewports `< 1024px` (smaller screens render an informative desktop-width notice).
- External database persistence or persistent accounts (all participants and rehearsal sessions remain ephemeral in memory).
- Modifying mobile-only views or breaking existing single-client flows in `App.tsx`.

## Job Story

When a Catholic Young Adult ministry facilitator or QA tester opens the application on a desktop computer,
I want to launch Dual Side-by-Side Mode with an automated rehearsal room and participant switcher,
so I can rehearse, demonstrate, or test the entire leader-guided 5-section Bible study session without needing multiple physical mobile phones or browser profiles.

## Users And Permissions

- **Study Leader (Left Frame)**: Controls session progression (`load_study`, `open_lobby`, `start_study`, `choose_volunteer`, `pick_random`, `retry_random`, `confirm_random`, `override_turn`, `next_section`, `switch_question`, `add_question`, `finish_study`). Rehearsal automatically binds the left frame to the leader's credentials.
- **Active Participant (Right Frame)**: Controls the currently selected participant from the switcher ('Mary Lopez', 'Daniel Reyes', 'Sara Castillo', or custom added participant). Can raise/lower hand, tap Read Aloud orb, complete assigned volunteer turns (`complete_turn`), submit reflections (with optional anonymous toggle), and select weekly challenges.
- **Participant Switcher Operator**: Desktop user who can select any connected participant to control the right frame or add a new participant via `+ Add Participant`.

## Acceptance Scenarios

### Scenario 1: Desktop Entry Point & Sandbox Rehearsal Initialization
Given a desktop browser viewport `>= 1024px` on the Welcome screen (or URL query `?mode=dual` / `?dual=true`),
When the user clicks the "Dual Side-by-Side Mode" trigger button (`data-testid="welcome-dual-mode-btn"`),
Then the client initializes an isolated `LiveSession` over `/ws`:
  1. Spawns the Study Leader socket client, creates a new session, and claims leadership.
  2. Loads the preloaded "Great Is Your Faith" study document (`GET /api/studies/default`) and opens the lobby.
  3. Joins 3 default participants ('Mary Lopez', 'Daniel Reyes', 'Sara Castillo') via individual in-memory `/ws` clients.
  4. Renders the top Simulation Toolbar with rehearsal badge, session code display (`data-testid="dual-session-code"`), copy button, participant switcher tabs, and `+ Add Participant` CTA.
  5. Renders two side-by-side `390px x 844px` mobile device frames: Left Frame labeled `STUDY LEADER` and Right Frame labeled `PARTICIPANT: Mary Lopez`.

### Scenario 2: Synchronized Title Lobby & Study Launch
Given the rehearsal session is initialized in `lobby` status,
When observing both frames,
Then the Left Frame renders the Leader Title Lobby with `Start Study →` CTA and attendee counter showing 3 attendees,
And the Right Frame renders the Participant Title Lobby waiting state with study title, Gospel citation, and live attendee counter,
When the Leader clicks `Start Study →` in the Left Frame,
Then both frames synchronize immediately over `/ws` and advance into Section 1 (Opening Prayer).

### Scenario 3: Section 1 Opening Prayer Hand Raise, Switcher & Chosen Gate
Given both frames are in Section 1 (`section_1_prayer`),
When the user in the Right Frame (active: Mary Lopez) taps the violet `Raise Hand` orb,
Then the Left Frame immediately displays "Mary Lopez" in the `RaisedHandsQueue` with a gold `Choose` pill,
When the user switches the Right Frame to "Daniel Reyes" via the participant switcher,
Then the Right Frame updates to show Daniel Reyes's unraised orb while the Left Frame continues showing Mary Lopez in the queue,
When the Leader clicks `Choose` on Mary Lopez in the Left Frame,
And the user switches the Right Frame back to "Mary Lopez",
Then Mary Lopez's frame renders `YOU WERE CHOSEN` with full prayer text and the exclusive `✓ Done` CTA,
When Mary clicks `✓ Done` in the Right Frame,
Then the turn completes over `/ws`, the Left Frame advance zone unlocks and morphs into `Continue to Section 2 →`,
And the Leader clicking `Continue to Section 2 →` advances both frames to Section 2.

### Scenario 4: Section 2 Icebreaker Flow
Given both frames are in Section 2 (`section_2_icebreaker`),
When the Participant in the Right Frame taps the bronze hand-raise orb,
Then the shared raised hands counter chip updates to `1 raised` on both frames,
And the Left Frame displays facilitator-only notes ("Examples to Listen For") while the Right Frame hides them,
When the Leader clicks `Begin Reading →` in the Left Frame,
Then both frames advance to Section 3.

### Scenario 5: Section 3 Gospel Reading Proclamation & Reader Gate
Given both frames are in Section 3 (`section_3_reading`),
When observing the Scripture presentation,
Then both frames present only the Gospel Reading (Matthew 15:21–28) with zero multi-reading Mass tabs,
When the Participant in the Right Frame taps the indigo `Read aloud` orb,
Then the Left Frame reader roster highlights the volunteer,
When the Leader selects the reader,
Then the Right Frame switches to `YOU WERE CHOSEN` with the `Done Reading` CTA,
When the reader clicks `Done Reading`,
Then the Left Frame advance zone unlocks `Begin Discussion →` and the Leader clicking it advances both frames to Section 4.

### Scenario 6: Section 4 Discussion Question Queue & Multi-Participant Reflections
Given both frames are in Section 4 (`section_4_discussion`),
When the Participant in the Right Frame (Mary Lopez) taps `I want to respond`, enters "Lord, grant us persistent faith.", and submits,
Then the reflection appears immediately in the live `Sharing` feed on both frames,
When the user switches the Right Frame to "Daniel Reyes", opens `I want to respond`, checks "Share anonymously", enters "Help me persevere in prayer.", and submits,
Then the reflection appears in both frames with author masked to "Anonymous" (`?`),
When the Leader in the Left Frame taps `q-5` in the question queue,
Then both frames switch the active question synchronously,
When the Leader clicks `Next: Closing Prayer →`,
Then both frames advance to Section 5.

### Scenario 7: Section 5 Closing Prayer & Completion Purge
Given both frames are in Section 5 (`section_5_closing`),
Then both frames render the persistent 3D Star of Faith, live session metrics (5 sections, duration, participant count), 4 weekly challenges, and the Closing Prayer text,
When the Leader in the Left Frame clicks `✓ Finish study`,
Then the session is gracefully completed, server reflections are purged from memory, and the rehearsal toolbar displays session completed with an option to return to Welcome.

### Scenario 8: Dynamic Participant Addition (`+ Add Participant`)
Given an active Dual Mode rehearsal session with 3 participants,
When the user clicks `+ Add Participant` in the Simulation Toolbar,
Then an input field appears allowing entry of a display name (e.g. "David Kim"),
When the user submits the valid name,
Then a new in-memory `SessionSocketClient` joins the session over `/ws`,
And "David Kim" is added to the participant switcher tabs, the Right Frame switches to David Kim, and the attendee counter increments to 4 across all clients.

### Scenario 9: Persistent WebGL Budget (`<= 2` Active Canvases)
Given Desktop Dual Side-by-Side Mode is active,
When inspecting the DOM across all 5 sections and during participant switches in the switcher,
Then the total count of active WebGL `<canvas>` elements is strictly `<= 2` (exactly 1 in the Left Frame, 1 in the Right Frame),
And switching participants in the switcher does not unmount or recreate the Right Frame canvas context.

### Scenario 10: Viewport Responsiveness & Clean Session Exit
Given a browser window resized below `1024px` while Dual Mode is active,
Then the frames are replaced with a `DesktopViewportNotice` explaining the `>= 1024px` requirement and offering a "Return to Welcome" button,
When the user clicks "Exit Rehearsal" (`data-testid="dual-mode-exit-btn"`),
Then the leader client sends `close_session` (or `finish_study`), all socket connections disconnect, credentials are cleared, and the browser cleanly returns to the Welcome screen with `activeSessionCount === 0`.

## Repository Research

### Files Inspected

- `src/client/App.tsx` — Main application shell managing health check, role sheets, and active session rendering.
- `src/client/components/welcome/WelcomeRoleCards.tsx` — Welcome role cards (`Study Leader` vs `Participant`); requires desktop dual mode entry button.
- `src/client/state/sacredStageStore.ts` — `zustand` stage store; already exports `createSacredStageStore()` with isolated instances and tests in `tests/unit/sacred-stage-store-and-math.test.ts:93-115`.
- `src/client/components/stage/Sacred3DScene.tsx` — Canvas scene component; already accepts optional `store?: SacredStageStore`.
- `src/client/lib/sessionSocket.ts` — Typed `/ws` client; supports `storage?: StorageLike | null` and `persistCredentials: false`.
- `src/client/lib/useLiveSession.ts` — Bridging hook; accepts `client?: SessionSocketClient`.
- `src/server/sessionStore.ts` — In-memory session store; enforces socket-binding member authentication.
- `src/shared/session.ts` — Shared session types and validation contracts (`SESSION_PROTOCOL_VERSION = 3`).
- `DESIGN.md` — Layout section specifies: "Desktop Dual Side-by-Side Mode (`>= 1024px`): Top simulation toolbar (Room Code, Dual Mode toggle, active `Participant` switcher dropdown + `+ Simulate Participant`) above two side-by-side `390px x 844px` device frames (`Study Leader` on left, `Participant` on right) synchronized live via `/ws`."
- `CONSTRAINTS.md` — Constraint #8 specifies: "`Sacred3DScene` MUST mount at most 1 persistent WebGL `<Canvas>` per active viewport (`<= 2` in Desktop Dual Side-by-Side Mode)".

### Existing Patterns To Follow

- **Scoped Zustand Stores**: `createSacredStageStore()` is instantiated once per frame (`leaderStageStore`, `participantStageStore`) so 3D stage variants and impulses remain isolated.
- **Scoped Socket Clients**: `createSessionSocketClient({ storage: inMemoryStorage, persistCredentials: false })` prevents cross-talk or `sessionStorage` pollution.
- **Strict Role Copy**: Exclusively `Study Leader` and `Participant` (zero occurrences of `Assistant`).
- **Standard Frame Sizing**: `390px` width, `844px` height with rounded phone frame chassis and scrollable content viewport.

### Current Gaps

- No dedicated `DesktopDualSideBySideScreen` or `DualDeviceFrame` component exists.
- `WelcomeRoleCards.tsx` currently only renders the two mobile role cards without the desktop rehearsal option.
- `useSacredStageStore` is currently imported directly as a global singleton across child screens; needs a `SacredStageProvider` context so children within a frame transparently read their frame's scoped stage store without altering their component props.

## Technical Approach

### 1. Scoped Stage Store Provider Pattern
In `src/client/state/sacredStageStore.ts`, introduce `SacredStageContext` and `SacredStageProvider`:
```tsx
const SacredStageStoreContext = createContext<SacredStageStore | null>(null);

export function SacredStageProvider({
  store,
  children,
}: {
  store: SacredStageStore;
  children: ReactNode;
}) {
  return (
    <SacredStageStoreContext.Provider value={store}>
      {children}
    </SacredStageStoreContext.Provider>
  );
}
```
Update `useSacredStageStore` so that inside a `SacredStageProvider` it selects from `useContext(SacredStageStoreContext)`, while outside it defaults to the singleton `defaultSacredStageStore`. Attach vanilla store methods (`getState`, `setState`, `subscribe`) to `useSacredStageStore` for full backward compatibility with non-hook callers. This allows all existing screens (`OpeningPrayerScreen`, `GospelReadingScreen`, `DiscussionScreen`, `ClosingPrayerScreen`, `HandRaiseOrb`, `ReadAloudOrb`) to automatically bind to the scoped store of their parent frame with zero changes to their implementations!

### 2. Rehearsal Session Orchestration (`useDualSessionSandbox`)
Create an orchestration hook or module `src/client/lib/useDualSessionSandbox.ts`:
1. Creates an in-memory `StorageLike` for each client so `window.sessionStorage` is never touched.
2. Initializes the Study Leader `SessionSocketClient` and creates a room with `displayName: 'Study Leader'`.
3. Fetches `GET /api/studies/default`, calls `loadStudy` with `toSessionStudySummary(study)`, and calls `openLobby`.
4. Spawns 3 default participant clients for 'Mary Lopez', 'Daniel Reyes', and 'Sara Castillo', joining them over `/ws`.
5. Exposes a pool of participants: `{ memberId, displayName, client, initials, avatarPalette }`.
6. Provides `addParticipant(displayName: string)` to dynamically connect a 4th+ participant.
7. Tracks `activeParticipantId` (defaulting to Mary Lopez).
8. Provides clean teardown (`exitRehearsal()`) sending `close_session` / `finish_study` and closing all sockets.

### 3. Dual Device Frame (`DualDeviceFrame.tsx`)
A frame container rendering:
- Header pill: `STUDY LEADER` (gold) or `PARTICIPANT: <Name>` (indigo) with connection dot.
- Phone chassis container: `width: 390px`, `height: 844px`, `border-radius: 40px`, inner shadow, scrollable content.
- Wraps contents in `<SacredStageProvider store={frameStore}>`.
- Mounts 1 persistent `Sacred3DScene store={frameStore}` at the top of the frame.
- Renders the active section screen corresponding to `liveSession.session.status` and `currentSectionId`, bound to the frame's `useLiveSession({ client: frameClient })` and `useRandomSelection({ client: frameClient })`.

### 4. Participant Switcher & Toolbar (`ParticipantSwitcher.tsx`, `SimulationToolbar.tsx`)
- Top simulation toolbar pinned above the dual frames:
  - "DESKTOP REHEARSAL MODE" badge.
  - Session code pill with copy button (`data-testid="dual-session-code"`, `data-testid="dual-copy-code-btn"`).
  - Participant switcher tabs (`data-testid="participant-switcher"`):
    - Tabs for each connected participant (`data-testid="participant-tab-mary-lopez"`, etc.). Clicking a tab switches the right frame's active participant instantly.
    - `+ Add Participant` button (`data-testid="add-participant-btn"`).
  - "Exit Rehearsal" button (`data-testid="dual-mode-exit-btn"`).

### 5. Desktop Viewport Fallback & App Routing
- `src/client/App.tsx` checks URL param `?mode=dual` / `?dual=true` on load or button click in `WelcomeRoleCards.tsx` (`data-testid="welcome-dual-mode-btn"`).
- On screens `< 1024px`, renders `DesktopViewportNotice` advising the user of the desktop resolution requirement with a button to return to Welcome.

## Expected File Changes

- `src/client/state/sacredStageStore.ts` — modify; add `SacredStageStoreContext`, `SacredStageProvider`, and context-aware `useSacredStageStore`.
- `src/client/components/stage/Sacred3DScene.tsx` — modify; resolve store from `storeProp ?? useContext(SacredStageStoreContext) ?? defaultStore`.
- `src/client/components/welcome/WelcomeRoleCards.tsx` — modify; add `onSelectDualMode?: () => void` prop and desktop "Dual Side-by-Side Mode" trigger button.
- `src/client/lib/dualSessionSandbox.ts` — create; manages rehearsal session lifecycle, in-memory participant clients, and preloaded study loading.
- `src/client/components/dual/DualDeviceFrame.tsx` — create; mobile device frame (`390x844`), scoped stage store, chassis styling, and section screen routing.
- `src/client/components/dual/SimulationToolbar.tsx` — create; top toolbar with session code, copy, participant switcher tabs, + Add Participant dialog, and exit CTA.
- `src/client/components/dual/DesktopViewportNotice.tsx` — create; responsive warning for screen widths `< 1024px`.
- `src/client/components/dual/DesktopDualSideBySideScreen.tsx` — create; top-level Dual Mode orchestration component integrating toolbar, frames, and sandbox hook.
- `src/client/App.tsx` — modify; wire `isDualMode` state, URL query handling, and `WelcomeRoleCards` integration.
- `src/client/styles/global.css` — modify; add phone chassis styles, toolbar styles, switcher pill styles, and desktop side-by-side flex container styles.
- `ARCHITECTURE.md` — update; document Dual Side-by-Side Mode runtime surface, scoped stage provider, and multi-socket rehearsal sandbox.
- `tests/unit/dual-stage-scoping.test.tsx` — create; unit test verifying `SacredStageProvider` scopes stage variants and impulses without affecting sibling or default stores.
- `tests/unit/dual-session-sandbox.test.ts` — create; unit test verifying rehearsal session creation, participant pool, switcher, and in-memory credential isolation.
- `tests/e2e/desktop-dual-side-by-side-mode.spec.ts` — create; full Playwright desktop (1440x900) E2E test walking all 5 sections inside Dual Mode with `<= 2` WebGL canvases.

## Visual Design Impact

- UI involved: yes
- Design source: `DESIGN.md` (Layout: Desktop Dual Side-by-Side Mode `>= 1024px`, tokens `#0B0D17`, `#171B2E`, `#E2A83E`, `#6E75F5`, `#10B981`)
- Screens affected: Welcome screen (adds desktop dual mode option); new Desktop Dual Side-by-Side view.
- Visual elements:
  - Phone chassis: `390px` width, `844px` height, `border-radius: 40px`, `border: 2px solid rgba(226, 168, 62, 0.25)`, `box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7)`.
  - Top header badges: `STUDY LEADER` (`#E2A83E` gold border & text), `PARTICIPANT: <Name>` (`#6E75F5` indigo border & text).
  - Simulation toolbar: dark midnight bar `#11131F`, gold rehearsal eyebrow, live session code pill with copy tooltip, participant switcher pills with active gold/emerald highlight, `+ Add Participant` pill, and terracotta exit pill.
  - Side-by-side layout: flex row with `24px`–`32px` gap, centered on desktop display, no horizontal page scrollbar.
- New design asset required: no (follows existing `DESIGN.md` tokens and chassis specs).

## Durable Documentation Impact

- `ARCHITECTURE.md`: update — document Desktop Dual Side-by-Side Mode, scoped `SacredStageStore` pattern, and in-memory participant client pool.
- `CONSTRAINTS.md`: not needed — constraint #8 already explicitly defines `(<= 2 in Desktop Dual Side-by-Side Mode)`.
- `AGENTS.md`: not needed.

## Implementation Plan

1. **Scoped Stage Store Context**: Update `src/client/state/sacredStageStore.ts` with `SacredStageStoreContext`, `SacredStageProvider`, and context-aware `useSacredStageStore`. Update `Sacred3DScene.tsx` to read the context store. Verify existing unit tests (`npm test`) pass with zero regressions.
2. **Rehearsal Sandbox Manager**: Implement `src/client/lib/dualSessionSandbox.ts` with in-memory `StorageLike` creation, leader setup, default study loading, 3 default participant joins ('Mary Lopez', 'Daniel Reyes', 'Sara Castillo'), active participant selection, and dynamic participant addition.
3. **Dual Device Frame Component**: Implement `src/client/components/dual/DualDeviceFrame.tsx` hosting a scoped `SacredStageProvider`, persistent `Sacred3DScene`, chassis container (`390px x 844px`), and dynamic section routing for the frame's role.
4. **Toolbar & Switcher**: Implement `src/client/components/dual/SimulationToolbar.tsx` with participant switcher tabs, `+ Add Participant` modal/dialog, session code display with copy, and clean exit action. Implement `src/client/components/dual/DesktopViewportNotice.tsx` for `< 1024px` screens.
5. **Desktop Dual Screen & App Integration**: Implement `src/client/components/dual/DesktopDualSideBySideScreen.tsx`. Update `src/client/components/welcome/WelcomeRoleCards.tsx` with desktop trigger button. Update `src/client/App.tsx` to mount Dual Mode on trigger or `?mode=dual`. Append CSS tokens and chassis rules in `src/client/styles/global.css`.
6. **Unit & Integration Verification**: Write `tests/unit/dual-stage-scoping.test.tsx` and `tests/unit/dual-session-sandbox.test.ts`. Run `./init.sh`.
7. **Playwright E2E Multi-Section Verification**: Create `tests/e2e/desktop-dual-side-by-side-mode.spec.ts` running at viewport `1440x900`. Walk all 5 sections, test switcher, hand raise, random pick, 'Done' turn, reflections, closing prayer, `Finish study`, and assert `<= 2` WebGL canvases throughout. Verify `tests/e2e/ws-room-lifecycle.spec.ts` remains green with zero session leaks.

## Implementation Tasks

- [ ] Add `SacredStageStoreContext`, `SacredStageProvider`, and context-aware resolution to `src/client/state/sacredStageStore.ts`.
- [ ] Update `src/client/components/stage/Sacred3DScene.tsx` to resolve store from context when props omit it.
- [ ] Add unit tests in `tests/unit/dual-stage-scoping.test.tsx` verifying store scoping, variant isolation, and impulse independence.
- [ ] Build `src/client/lib/dualSessionSandbox.ts` managing leader initialization, preloaded study loading, in-memory participant clients, active participant selection, and participant addition.
- [ ] Build `src/client/components/dual/DualDeviceFrame.tsx` with `390px x 844px` chassis, frame header tag, scoped stage provider, persistent 3D scene, and role-based screen routing.
- [ ] Build `src/client/components/dual/SimulationToolbar.tsx` with rehearsal mode badge, session code with copy, participant switcher tabs, `+ Add Participant` modal, and exit button.
- [ ] Build `src/client/components/dual/DesktopViewportNotice.tsx` providing responsive notice when viewport is `< 1024px`.
- [ ] Build `src/client/components/dual/DesktopDualSideBySideScreen.tsx` assembling toolbar, notice, and side-by-side frames.
- [ ] Update `src/client/components/welcome/WelcomeRoleCards.tsx` to render the "Dual Side-by-Side Mode" trigger button (`data-testid="welcome-dual-mode-btn"`).
- [ ] Wire `isDualMode` state, URL query handling (`?mode=dual` / `?dual=true`), and exit handler in `src/client/App.tsx`.
- [ ] Add CSS rules in `src/client/styles/global.css` for desktop toolbar, participant switcher pills, chassis frames (`390x844`), and side-by-side container.
- [ ] Write `tests/e2e/desktop-dual-side-by-side-mode.spec.ts` verifying the full 5-section study flow, participant switching, reflections, and `<= 2` WebGL canvases.
- [ ] Verify `./init.sh` passes cleanly (typecheck, unit tests, build).
- [ ] Verify `npm run test:e2e` passes including `tests/e2e/desktop-dual-side-by-side-mode.spec.ts` and `tests/e2e/ws-room-lifecycle.spec.ts`.
- [ ] Verify `grep -rn "Assistant" src/` returns 0 matches.
- [ ] Update `ARCHITECTURE.md` with Dual Side-by-Side Mode documentation.

## Verification Plan

- `./init.sh`: must exit with code 0 (`npm run typecheck`, `npm test` across all unit/integration tests, `npm run build`).
- `PLAYWRIGHT_PORT=3305 npx playwright test tests/e2e/desktop-dual-side-by-side-mode.spec.ts`: must pass all scenarios at 1440x900 viewport:
  - Dual Mode launches from Welcome screen or URL.
  - 2 side-by-side frames appear (Leader on left, Participant on right).
  - WebGL context count is `<= 2` across the entire session.
  - Section 1: Mary raises hand, Leader chooses Mary, Mary sees `YOU WERE CHOSEN` and clicks `Done`, Leader advances.
  - Section 2: Switch to Daniel Reyes, Daniel raises hand, Leader sees count, Leader advances.
  - Section 3: Read Aloud orb, Leader chooses reader, reader clicks `Done Reading`, Leader advances.
  - Section 4: Mary submits reflection, Daniel submits anonymous reflection, live feed shows both, Leader switches question, Leader advances.
  - Section 5: Both show Star of Faith & metrics, Leader clicks `Finish study`, session closes.
  - Session cleanup: `GET /api/health` reports `activeSessionCount === 0`.
- `PLAYWRIGHT_PORT=3305 npx playwright test tests/e2e/ws-room-lifecycle.spec.ts`: must pass cleanly with 0 leaked sessions.
- Invariant check: `grep -rn "Assistant" src/` must return 0 matches (exit code 1).

## Evidence To Capture

- Test execution log of `tests/e2e/desktop-dual-side-by-side-mode.spec.ts` showing all passing scenarios and WebGL canvas count `<= 2`.
- Test execution log of `tests/e2e/ws-room-lifecycle.spec.ts` showing 0 leaked sessions.
- Output of `./init.sh` showing 0 TypeScript errors and passing test suite.
- Output of `grep -rn "Assistant" src/` showing 0 matches.

## Validator Checklist

- [ ] Implementation stays within this feature's scope (desktop dual side-by-side rehearsal mode).
- [ ] All 10 acceptance scenarios pass.
- [ ] WebGL budget is strictly maintained (`<= 2` active WebGL canvases on screen at any time; no canvas churn when switching participants).
- [ ] Zero occurrences of `Assistant` in copy, code, and types (strictly `Study Leader` and `Participant`).
- [ ] Persistent E2E coverage added in `tests/e2e/desktop-dual-side-by-side-mode.spec.ts` and passes.
- [ ] Rehearsal sessions do not leak (`activeSessionCount === 0` after test run).
- [ ] `./init.sh` passes cleanly with exit code 0.
- [ ] `ARCHITECTURE.md`, `feature_list.json`, and `PROGRESS.md` updated accurately.

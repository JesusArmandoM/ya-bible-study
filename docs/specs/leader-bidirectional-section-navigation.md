# Feature Implementation Spec: Study Leader navigates backward to previous sections across six-section flow

## Source Feature

- `id`: `leader-bidirectional-section-navigation`
- `area`: `realtime-session`
- `depends_on`: `["six-section-study-model-parser", "section-5-closing-prayer-completion"]`
- `status`: `not_started`
- `source`: `feature_list.json`

## Goal

Promote the live WebSocket (`/ws`) session runtime from 5 sections to all **6 interactive sections** (`STUDY_SECTION_IDS`: `section_1_prayer`, `section_2_icebreaker`, `section_3_reading`, `section_4_deep_analysis`, `section_5_discussion`, `section_6_closing`) and provide the `Study Leader` with exclusive **bidirectional section navigation**:

1. **Leader-only `previous_section` command over `/ws`**: Allows the `Study Leader` to navigate backward from Sections 2–6 back to earlier sections (`currentSectionIndex - 1`), updating `currentSectionIndex`, `currentSectionId`, and `sectionEnteredAt` (ISO timestamp) across all connected clients.
2. **`completedSectionIds[]` tracking on `LiveSession`**: Server tracks completed gated sections (`section_1_prayer`, `section_3_reading`) so that revisiting a previously completed section does **not** re-lock forward section advancement (`next_section`).
3. **Leader-only `reset_turn` command over `/ws`**: Allows the `Study Leader` to reset or re-run the volunteer turn on a completed gated section, removing it from `completedSectionIds[]` and re-opening hand raises / volunteer selection.
4. **Section 4 Deep Analysis temporary placeholder**: Renders a dedicated full-screen placeholder screen (`SECTION 4 OF 6` · `67%`) with `Study Leader` navigation (`← Previous` to Section 3 and `Continue to Discussion →` to Section 5) and `Participant` waiting copy until the full interactive Deep Analysis screen is built in `section-4-deep-analysis-screen`.
5. **Client UI navigation controls**: Renders a paired `← Previous` button on Sections 2–6 exclusively for the `Study Leader` in the leader advance zone, an optional `Reset turn` control on completed gated sections, and updates `SectionProgressHeader` to display `SECTION X OF 6` with progress percents `[17, 33, 50, 67, 83, 100]%`.

## Non-Goals

- Building the complete interactive verse-by-verse commentary breakdown, Catholic doctrine tabs, and young adult application card UI for Section 4 Deep Analysis — owned by downstream feature `section-4-deep-analysis-screen`.
- Implementing multi-second full-screen 3D Sacred3DScene section-entry overlay animations — owned by downstream feature `fullscreen-3d-section-entry-animations`.
- Implementing First-Hand-Wins auto-assignment logic (`collecting_hands` -> immediate `assigned`) — owned by downstream feature `first-hand-wins-volunteer-assignment`.
- Adding persistent header QR code re-share button (`Share QR`) — owned by parallel/downstream feature `leader-persistent-qr-code-reshare`.
- Modifying `.md` or `.pdf` parser logic (already completed in `six-section-study-model-parser`).

## Job Story

When a `Study Leader` guides a live Catholic Young Adult Bible study across the 6 curriculum sections,
I want to navigate backward to previous sections (`previous_section`) to re-read or reference earlier prayers, icebreakers, or readings without getting blocked by completed volunteer turns, and have the option to reset a volunteer turn (`reset_turn`) if a new volunteer is desired,
so our study group can review Scripture and discussion points flexibly with server-enforced role gating and real-time synchronization.

## Users And Permissions

- **`Study Leader` (Exclusive Controller)**:
  - Can call `previous_section` over `/ws` on Sections 2–6 (`currentSectionIndex > 0`), transitioning all connected clients backward.
  - Calling `previous_section` on Section 1 (`currentSectionIndex === 0`) is rejected with `INVALID_STATE_TRANSITION`.
  - Can call `next_section` over `/ws` to advance forward. If returning to an already-completed gated section (`sectionId` in `completedSectionIds[]`), forward advancement is unlocked immediately without waiting for a new volunteer turn.
  - Can call `reset_turn` over `/ws` on a gated section (`section_1_prayer`, `section_2_icebreaker`, `section_3_reading`), clearing its completed status from `completedSectionIds[]` and re-initializing the volunteer turn.
  - Sees `← Previous` control alongside forward advance buttons on Sections 2–6.
  - Sees `Reset turn` / `Re-pick volunteer` control on completed gated sections.
- **`Participant` (Synchronized Viewer)**:
  - Denied access to `previous_section`, `next_section`, and `reset_turn`. Any attempt over `/ws` returns `FORBIDDEN_LEADER_ONLY`.
  - Never sees `← Previous`, forward advance CTAs, or `Reset turn` buttons in client UI.
  - Automatically synchronized to the active section (`0..5`) and sees truthful `SECTION X OF 6` progress headers and section content.
- **Terminology Invariant**: Use `Study Leader` and `Participant` exclusively across UI, types, and tests (`CONSTRAINTS.md` #3).

## Acceptance Scenarios

### Scenario 1: Study Leader navigates backward from Section 2 to Section 1 over `/ws`

Given a live study session in progress on Section 2 (`section_2_icebreaker`, index 1)
When the `Study Leader` clicks `← Previous` (or dispatches `previous_section` over `/ws` with a valid `leaderToken`)
Then the server updates `currentSectionIndex` to `0`, `currentSectionId` to `'section_1_prayer'`, and `sectionEnteredAt` to the current ISO timestamp
And broadcasts `session_updated` with `command: 'previous_section'` and full snapshot to all connected clients
And both `Study Leader` and `Participant` screens transition back to Section 1 (`OpeningPrayerScreen`, `SECTION 1 OF 6`, `17%`)
And because Section 1 was completed earlier (`'section_1_prayer'` in `completedSectionIds[]`), the `Study Leader`'s forward advance CTA (`Continue to Section 2 →`) is unlocked immediately.

### Scenario 2: Participant and unauthorized attempts to send `previous_section` or `reset_turn` are rejected

Given an active study session in progress
When a `Participant` sends `{ type: 'previous_section', sessionCode, memberId }` or `{ type: 'reset_turn', sessionCode, memberId }` over `/ws`
Then the server rejects the command with error code `FORBIDDEN_LEADER_ONLY` and message `'Only the Study Leader can perform this action.'`
And when an unauthenticated socket or invalid `leaderToken` attempts either command, the server rejects with `UNAUTHORIZED_LEADER`
And session state remains completely unchanged.

### Scenario 3: Previously completed gated section preserves unlocked forward advancement when revisited

Given a live session that has completed Section 1 (Opening Prayer) and Section 3 (Gospel Reading) turns, with `'section_1_prayer'` and `'section_3_reading'` stored in `session.completedSectionIds[]`
When the `Study Leader` navigates backward from Section 4 or 3 to Section 1
Then the server does NOT reject `next_section` with `The Opening Prayer turn must be completed before advancing`
And the `Study Leader` can advance forward to Section 2 without requiring a second prayer volunteer
And similarly when revisiting Section 3, `next_section` advances to Section 4 without requiring a second reader turn.

### Scenario 4: Study Leader resets volunteer turn on a completed gated section (`reset_turn`)

Given a live session currently on Section 1 (`section_1_prayer`) with Section 1 turn completed and in `completedSectionIds[]`
When the `Study Leader` clicks `Reset turn` (dispatching `reset_turn` over `/ws`)
Then the server removes `'section_1_prayer'` from `completedSectionIds[]`, re-initializes `volunteerTurn` via `createVolunteerTurnForSection('section_1_prayer')`, cancels any active random timers, and broadcasts `session_updated` (`command: 'reset_turn'`)
And Section 1 hand-raise queue is reopened for participants
And forward advancement (`next_section`) is once again blocked until a volunteer completes the turn or the leader triggers an override.

### Scenario 5: Six-section runtime progression and Section 4 Deep Analysis placeholder

Given an active study session advancing through all sections
When the `Study Leader` advances past Section 3 (`section_3_reading`, Gospel Reading)
Then the session advances to Section 4 (`section_4_deep_analysis`, index 3, `SECTION 4 OF 6`, `67%`)
And both `Study Leader` and `Participant` view the Section 4 placeholder screen (`SectionPlaceholderScreen`)
And the `Study Leader` view renders `← Previous` (navigating back to Section 3) and `Continue to Discussion →` (advancing to Section 5)
And advancing to Section 5 transitions into `DiscussionScreen` (`section_5_discussion`, index 4, `SECTION 5 OF 6`, `83%`), with discussion queue initialized from curated questions
And advancing to Section 6 transitions into `ClosingPrayerScreen` (`section_6_closing`, index 5, `SECTION 6 OF 6`, `100%`) with `LiveSessionStatsCard` displaying `6 SECTIONS`.

### Scenario 6: Calling `previous_section` on Section 1 or outside `in_progress` is rejected

Given a session in `setup` or `lobby` status, or an in-progress session on Section 1 (`currentSectionIndex === 0`)
When a `Study Leader` sends `{ type: 'previous_section', ... }` over `/ws`
Then the server rejects the command with `INVALID_STATE_TRANSITION`
And the session state remains unchanged.

## Repository Research

### Files Inspected

- `src/shared/session.ts` — `/ws` protocol contracts, `STUDY_SECTION_IDS`, `LeaderCommandType`, `ClientWsMessage`, `SessionUpdatedCommand`, `PublicLiveSessionSnapshot`, `VolunteerTurnState`, pure turn reducers.
- `src/shared/study.ts` — curriculum document schema already defining 6 sections (`section_1_prayer`, `section_2_icebreaker`, `section_3_reading`, `section_4_deep_analysis`, `section_5_discussion`, `section_6_closing`) and progress percents `[17, 33, 50, 67, 83, 100]`.
- `src/server/sessionStore.ts` — in-memory `LiveSessionStore`, `InternalLiveSession`, `toPublicSnapshot`, `handleLeaderCommand`, `handleTurnCommand`, `next_section` gating, `override_turn`, `complete_turn`, `start_study`.
- `src/client/App.tsx` — root application shell routing active section screens by `currentSectionId`.
- `src/client/lib/sessionSocket.ts` — typed `/ws` client and `sendLeaderCommand`.
- `src/client/lib/useLiveSession.ts` — reactive hook managing room actions (`nextSection`, `startStudy`, etc.).
- `src/client/components/sections/SectionProgressHeader.tsx` — shared section header component currently hardcoding `OF 5` and `percent = sectionNumber * 20`.
- `src/client/components/prayer/SectionPlaceholderScreen.tsx` — generic in-progress placeholder screen.
- `src/client/components/prayer/OpeningPrayerScreen.tsx` — Section 1 screen and `LeaderAdvanceZone`.
- `src/client/components/icebreaker/IcebreakerScreen.tsx` — Section 2 screen and `icebreaker-advance-zone`.
- `src/client/components/reading/GospelReadingScreen.tsx` — Section 3 screen and `reading-advance-zone`.
- `src/client/components/discussion/DiscussionScreen.tsx` — Section 5 discussion screen (previously routed as section 4).
- `src/client/components/closing/ClosingPrayerScreen.tsx` — Section 6 closing screen (previously routed as section 5).
- `src/client/components/closing/LiveSessionStatsCard.tsx` — stats card hardcoding `5 SECTIONS`.
- `src/client/components/dual/DualDeviceFrame.tsx` — Desktop Dual Side-by-Side Mode frame routing screens by `currentSectionId`.
- `src/client/styles/global.css` — styling tokens, layout classes, advance zones.
- Existing unit, integration, and E2E test suites in `tests/`.

### Existing Patterns To Follow

- **Single-port `/ws` wire protocol**: Additive commands at `SESSION_PROTOCOL_VERSION = 3`.
- **Leader command authentication**: All leader commands are routed through `handleLeaderCommand`, which verifies:
  1. `this.isParticipantCaller(socket, session, record.memberId)` -> `FORBIDDEN_LEADER_ONLY`
  2. `timingSafeEqualSecret(record.leaderToken, session.leaderToken)` -> `UNAUTHORIZED_LEADER`
  3. Leader member ID check -> `UNAUTHORIZED_LEADER`.
- **Server-authoritative state transitions**: `sessionStore.ts` enforces all state guards (`INVALID_STATE_TRANSITION`), not client UI alone.
- **Snapshot sanitization**: `toPublicSnapshot(session)` deep-clones arrays/objects and strips secrets (`leaderPin`, `leaderToken`, `reconnectToken`).
- **Mobile ergonomics (`CONSTRAINTS.md` #7)**: `>= 16px` inputs, `>= 44px` touch targets, `100dvh` column layouts.

### Current Gaps

- `src/shared/session.ts` line 45 has 5 runtime section IDs:
  `STUDY_SECTION_IDS = ['section_1_prayer', 'section_2_icebreaker', 'section_3_reading', 'section_4_discussion', 'section_5_closing']`.
- `LeaderCommandType`, `ClientWsMessage`, and `SessionUpdatedCommand` lack `'previous_section'` and `'reset_turn'`.
- `InternalLiveSession` and `PublicLiveSessionSnapshot` lack `completedSectionIds` and `sectionEnteredAt`.
- `sessionStore.ts` does not record turn completions in `completedSectionIds`, lacks `previous_section` and `reset_turn` command handlers, and does not preserve volunteer turn state when navigating back.
- `SectionProgressHeader.tsx` hardcodes `SECTION {n} OF 5` and `percent = sectionNumber * 20`.
- `LiveSessionStatsCard.tsx` hardcodes `<span className="closing-stat-value">5</span>`.
- Sections 2–6 lack `← Previous` navigation controls for the Study Leader.
- Completed gated sections lack a `Reset turn` control.

## Technical Approach

### 1. Shared Types & Protocol Updates (`src/shared/session.ts`)

- Update `STUDY_SECTION_IDS` to all 6 section IDs:
  ```ts
  export const STUDY_SECTION_IDS = [
    'section_1_prayer',
    'section_2_icebreaker',
    'section_3_reading',
    'section_4_deep_analysis',
    'section_5_discussion',
    'section_6_closing',
  ] as const satisfies readonly StudySectionId[];
  ```
- Widen `LeaderCommandType` with `'previous_section' | 'reset_turn'`.
- Add message shapes to `ClientWsMessage`:
  ```ts
  | {
      type: 'previous_section';
      sessionCode: string;
      leaderToken: string;
      memberId?: string;
      requestId?: string;
    }
  | {
      type: 'reset_turn';
      sessionCode: string;
      leaderToken: string;
      memberId?: string;
      requestId?: string;
    }
  ```
- Widen `PublicLiveSessionSnapshot`:
  ```ts
  sectionEnteredAt?: string | null;
  completedSectionIds?: StudySectionId[];
  ```
- Update `volunteerTurnModeForSection`:
  - `section_1_prayer` -> `'gated_prayer'`
  - `section_3_reading` -> `'gated_reading'`
  - `section_2_icebreaker` -> `'open_share'`
  - default -> `'open_share'`

### 2. Server Session Store Updates (`src/server/sessionStore.ts`)

- Extend `InternalLiveSession`:
  - `sectionEnteredAt: string | null;` (initialized to `null` on `create_session`)
  - `completedSectionIds: StudySectionId[];` (initialized to `[]` on `create_session`)
  - `sectionTurns: Map<StudySectionId, VolunteerTurnState>;` (in-memory map preserving each section's volunteer turn across navigation)
- Update `toPublicSnapshot(session)`:
  - `sectionEnteredAt: session.sectionEnteredAt,`
  - `completedSectionIds: [...session.completedSectionIds],`
- Update turn completion hooks (`override_turn` and `complete_turn`):
  - When `applyCompleteTurn` executes, if `session.currentSectionId` is not already in `session.completedSectionIds`, push it.
  - Save `session.sectionTurns.set(session.currentSectionId, session.volunteerTurn)`.
- Update `start_study`:
  - Sets `session.currentSectionIndex = 0;`
  - Sets `session.currentSectionId = STUDY_SECTION_IDS[0];`
  - Sets `session.sectionEnteredAt = isoNow;`
  - Initializes `session.volunteerTurn = createVolunteerTurnForSection('section_1_prayer');`
  - Saves `session.sectionTurns.set('section_1_prayer', session.volunteerTurn);`
- Update `next_section`:
  - Enforce gated section completion only if `!session.completedSectionIds.includes(session.currentSectionId)`:
    - If `session.currentSectionId === 'section_1_prayer'` and `!session.completedSectionIds.includes('section_1_prayer')` and `session.volunteerTurn?.completedAt == null`: reject with `INVALID_STATE_TRANSITION`.
    - If `session.currentSectionId === 'section_3_reading'` and `!session.completedSectionIds.includes('section_3_reading')` and `session.volunteerTurn?.completedAt == null`: reject with `INVALID_STATE_TRANSITION`.
  - Save current turn: `session.sectionTurns.set(session.currentSectionId, session.volunteerTurn)`.
  - Advance `session.currentSectionIndex = nextIndex;` and `session.currentSectionId = nextSectionId;`.
  - Set `session.sectionEnteredAt = isoNow;`.
  - Cancel any active random timers (`this.cancelRandomExpiryTimer(session)`).
  - Handle `session.volunteerTurn` for `nextSectionId`:
    - If `nextSectionId` is in `['section_1_prayer', 'section_2_icebreaker', 'section_3_reading']`:
      - If saved turn exists in `session.sectionTurns`: restore it.
      - Else if `session.completedSectionIds.includes(nextSectionId)`: restore completed turn `{ ...createVolunteerTurnForSection(nextSectionId), completedAt: isoNow }`.
      - Else: `createVolunteerTurnForSection(nextSectionId)`.
    - Else: `session.volunteerTurn = null;`.
  - If `nextSectionId === 'section_5_discussion'` and `!session.discussionState`: initialize discussion queue from `session.study?.discussion`.
  - Broadcast `session_updated` with `command: 'next_section'`.
- Implement `previous_section`:
  - State gate: require `session.status === 'in_progress'` and `session.currentSectionIndex !== null` (reject with `INVALID_STATE_TRANSITION` `'Study must be in progress before navigating sections.'`).
  - Boundary gate: require `session.currentSectionIndex > 0` (if index is 0, reject with `INVALID_STATE_TRANSITION` `'Session is already on the initial study section.'`).
  - Save current turn: `if (session.currentSectionId && session.volunteerTurn) session.sectionTurns.set(session.currentSectionId, session.volunteerTurn)`.
  - Decrement `const prevIndex = session.currentSectionIndex - 1;` and `const prevSectionId = STUDY_SECTION_IDS[prevIndex];`.
  - Update: `session.currentSectionIndex = prevIndex; session.currentSectionId = prevSectionId; session.sectionEnteredAt = isoNow;`.
  - Cancel any active random timers (`this.cancelRandomExpiryTimer(session)`).
  - Restore `session.volunteerTurn`:
    - If `prevSectionId` is in `['section_1_prayer', 'section_2_icebreaker', 'section_3_reading']`:
      - Restore from `session.sectionTurns.get(prevSectionId)` if present.
      - Else if `session.completedSectionIds.includes(prevSectionId)`: `{ ...createVolunteerTurnForSection(prevSectionId), completedAt: isoNow }`.
      - Else: `createVolunteerTurnForSection(prevSectionId)`.
    - Else: `session.volunteerTurn = null;`.
  - Broadcast `session_updated` with `command: 'previous_section'`.
- Implement `reset_turn`:
  - State gate: require `session.status === 'in_progress'` and `session.currentSectionId !== null`.
  - Gated section gate: require `session.currentSectionId` to be in `['section_1_prayer', 'section_2_icebreaker', 'section_3_reading']` (reject with `INVALID_STATE_TRANSITION` `'Volunteer turn can only be reset on interactive volunteer sections.'`).
  - Remove from `session.completedSectionIds`: `session.completedSectionIds = session.completedSectionIds.filter(id => id !== session.currentSectionId);`.
  - Reset turn: `this.cancelRandomExpiryTimer(session); session.volunteerTurn = createVolunteerTurnForSection(session.currentSectionId); session.sectionTurns.set(session.currentSectionId, session.volunteerTurn);`.
  - Broadcast `session_updated` with `command: 'reset_turn'`.

### 3. Client Transport & Hook (`src/client/lib/`)

- In `src/client/lib/sessionSocket.ts`:
  - `LeaderCommandInput` already accepts `LeaderCommandType`, so widening `LeaderCommandType` automatically allows `{ type: 'previous_section' }` and `{ type: 'reset_turn' }`.
- In `src/client/lib/useLiveSession.ts`:
  - Add `previousSection: () => Promise<void>` (dispatches `sendLeaderCommand({ type: 'previous_section', ... })`).
  - Add `resetTurn: () => Promise<void>` (dispatches `sendLeaderCommand({ type: 'reset_turn', ... })`).
  - Return `previousSection` and `resetTurn` in `useLiveSession` room actions.

### 4. Client UI & Components (`src/client/components/`)

- `SectionProgressHeader.tsx`:
  - Update percentage formula to 6 sections:
    ```ts
    const PROGRESS_PERCENTS = [17, 33, 50, 67, 83, 100] as const;
    const percent = PROGRESS_PERCENTS[Math.min(Math.max(sectionNumber - 1, 0), 5)];
    ```
  - Render: `SECTION {sectionNumber} OF 6` and `{percent}%`.
  - Keep `data-testid="section-one-label"` and `data-testid="section-one-percent"` for backwards compatibility.
- `LiveSessionStatsCard.tsx`:
  - Render `session.study?.sectionCount ?? 6` instead of hardcoded `5` (`stat-sections`).
- `SectionPlaceholderScreen.tsx`:
  - Add `role?: SanctuaryRole; onPreviousSection?: () => void; onNextSection?: () => void;` props.
  - When `sectionIndex === 3` (`section_4_deep_analysis`):
    - Renders `SectionProgressHeader` with `sectionNumber={4}` (`SECTION 4 OF 6`, `67%`).
    - Title: `"Deep Analysis"`, Eyebrow: `"DEEP ANALYSIS · 20 MIN"`.
    - Body: `"Gospel commentary breakdown, Catholic doctrine highlights, and young adult application points have been loaded. Interactive deep analysis view arrives in the next update."`
    - If `role === 'Study Leader'`: renders paired leader navigation zone:
      - `← Previous` (`data-testid="previous-section-btn"`, calls `onPreviousSection`)
      - `Continue to Discussion →` (`data-testid="deep-analysis-advance-cta"`, calls `onNextSection`)
    - If `role === 'Participant'`: renders waiting indicator (`"The study leader will begin discussion shortly."`).
- `OpeningPrayerScreen.tsx` (Section 1):
  - When completed, render optional `Reset turn` control (`data-testid="reset-turn-btn"`, calls `onResetTurn`).
- `IcebreakerScreen.tsx` (Section 2):
  - Accept `onPreviousSection?: () => void`.
  - In `icebreaker-advance-zone`, render `← Previous` button (`data-testid="previous-section-btn"`, calls `onPreviousSection`) alongside `Begin Reading →` for the Study Leader.
- `GospelReadingScreen.tsx` (Section 3):
  - Accept `onPreviousSection?: () => void` and `onResetTurn?: () => void`.
  - In `reading-advance-zone`, render `← Previous` button (`data-testid="previous-section-btn"`, calls `onPreviousSection`).
  - When `completedAt != null`, render optional `Reset turn` control (`data-testid="reset-turn-btn"`, calls `onResetTurn`).
  - Morph CTA to `Continue to Deep Analysis →` (`data-testid="reading-advance-cta"`).
- `DiscussionScreen.tsx` (Section 5):
  - Update `SectionProgressHeader` to `sectionNumber={5}` (`SECTION 5 OF 6`, `83%`).
  - Accept `onPreviousSection?: () => void`.
  - In leader header or pastoral action bar, provide `← Previous` (`data-testid="previous-section-btn"`, calls `onPreviousSection`).
- `ClosingPrayerScreen.tsx` (Section 6):
  - Update `SectionProgressHeader` to `sectionNumber={6}` (`SECTION 6 OF 6`, `100%`).
  - Accept `onPreviousSection?: () => void`.
  - Provide `← Previous` (`data-testid="previous-section-btn"`, calls `onPreviousSection`) alongside `✓ Finish study`.
- `App.tsx` & `DualDeviceFrame.tsx`:
  - Route all 6 sections:
    - `section_1_prayer` -> `OpeningPrayerScreen`
    - `section_2_icebreaker` -> `IcebreakerScreen`
    - `section_3_reading` -> `GospelReadingScreen`
    - `section_4_deep_analysis` -> `SectionPlaceholderScreen`
    - `section_5_discussion` -> `DiscussionScreen`
    - `section_6_closing` -> `ClosingPrayerScreen`
  - Wire `onPreviousSection` and `onResetTurn` to `liveSession.previousSection()` and `liveSession.resetTurn()`.

### 5. Styling Updates (`src/client/styles/global.css`)

- Add styling for `.section-previous-btn`:
  - Ghost/secondary pill button matching Sanctuary aesthetic:
    `background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(226, 168, 62, 0.28); color: var(--color-midnight-cream, #EAE6DF);`
    `min-height: 48px; min-width: 110px; font-size: 1rem; border-radius: 9999px;`
- Add styling for `.section-reset-turn-btn`:
  - Subtle secondary ghost text/pill button with reset icon.
- Flex layout for paired advance zones (e.g. `.leader-advance-nav-row` or alongside CTA).

## Expected File Changes

- `src/shared/session.ts` — modify; update `STUDY_SECTION_IDS` to 6 sections, add `'previous_section' | 'reset_turn'` to `LeaderCommandType` / `ClientWsMessage`, and add `completedSectionIds` and `sectionEnteredAt` to `PublicLiveSessionSnapshot`.
- `src/server/sessionStore.ts` — modify; track `completedSectionIds`, `sectionEnteredAt`, and `sectionTurns` on `InternalLiveSession`; implement `previous_section` and `reset_turn`; update `next_section` to skip completion gate when already completed; update `override_turn` and `complete_turn` to append to `completedSectionIds`; route commands in `handleIncomingMessage`.
- `src/client/lib/useLiveSession.ts` — modify; expose `previousSection()` and `resetTurn()` actions.
- `src/client/components/sections/SectionProgressHeader.tsx` — modify; update to `SECTION {n} OF 6` and `[17, 33, 50, 67, 83, 100]%`.
- `src/client/components/closing/LiveSessionStatsCard.tsx` — modify; display `6 SECTIONS`.
- `src/client/components/prayer/SectionPlaceholderScreen.tsx` — modify; render Section 4 Deep Analysis placeholder with leader navigation (`← Previous` and `Continue to Discussion →`) and participant waiting copy.
- `src/client/components/prayer/OpeningPrayerScreen.tsx` — modify; support optional `onResetTurn`.
- `src/client/components/icebreaker/IcebreakerScreen.tsx` — modify; add `onPreviousSection` and render `← Previous` for Study Leader.
- `src/client/components/reading/GospelReadingScreen.tsx` — modify; add `onPreviousSection` and `onResetTurn`, render `← Previous` for Study Leader.
- `src/client/components/discussion/DiscussionScreen.tsx` — modify; update to `sectionNumber={5}`, add `onPreviousSection` and render `← Previous` for Study Leader.
- `src/client/components/closing/ClosingPrayerScreen.tsx` — modify; update to `sectionNumber={6}`, add `onPreviousSection` and render `← Previous` for Study Leader.
- `src/client/App.tsx` — modify; route `section_4_deep_analysis`, `section_5_discussion`, `section_6_closing`, wire `onPreviousSection` and `onResetTurn`.
- `src/client/components/dual/DualDeviceFrame.tsx` — modify; route 6 sections and wire `onPreviousSection` and `onResetTurn`.
- `src/client/styles/global.css` — modify; add styles for `.section-previous-btn`, `.section-reset-turn-btn`, and paired leader navigation rows.
- `tests/unit/hand-raise-state.test.ts` — modify; update tests referencing section IDs and turn modes.
- `tests/unit/closing-prayer-screen.test.tsx` — modify; update `SECTION 5 OF 5` -> `SECTION 6 OF 6` (`100%`).
- `tests/unit/discussion-screen.test.tsx` — modify; update `SECTION 4 OF 5` (`80%`) -> `SECTION 5 OF 6` (`83%`).
- `tests/unit/gospel-reading-screen.test.tsx` — modify; update `SECTION 3 OF 5` (`60%`) -> `SECTION 3 OF 6` (`50%`).
- `tests/unit/icebreaker-screen.test.tsx` — modify; update `SECTION 2 OF 5` (`40%`) -> `SECTION 2 OF 6` (`33%`).
- `tests/unit/opening-prayer-screen.test.tsx` — modify; update `SECTION 1 OF 5` (`20%`) -> `SECTION 1 OF 6` (`17%`).
- `tests/unit/title-lobby.test.tsx` — modify; update `SECTION 1 OF 5` (`20%`) -> `SECTION 1 OF 6` (`17%`).
- `tests/integration/ws-bidirectional-navigation.test.ts` — create; new integration suite verifying `previous_section`, `reset_turn`, `completedSectionIds`, role gating, state guards, and turn preservation.
- `tests/integration/ws-gospel-reading-turn.test.ts`, `ws-closing-finish.test.ts`, `ws-discussion-question.test.ts`, `ws-discussion-reflection.test.ts` — modify; update section sequence assertions (Gospel reading advances to `section_4_deep_analysis`, Discussion is `section_5_discussion`, Closing is `section_6_closing`).
- `tests/e2e/leader-bidirectional-section-navigation.spec.ts` — create; focused Playwright E2E spec verifying bidirectional navigation, `completedSectionIds` unlocked return, `reset_turn` re-locking, and role visibility across all 6 sections.
- Existing E2E specs (`title-lobby-qr-join.spec.ts`, `section-1-opening-prayer.spec.ts`, `section-1-chosen-volunteer-prayer-gate.spec.ts`, `section-2-icebreaker.spec.ts`, `section-3-gospel-reading-turn.spec.ts`, `section-4-leader-question-queue-notes.spec.ts`, `section-4-live-participant-reflections.spec.ts`, `section-4-lord-help-me-prayer-card.spec.ts`, `section-5-closing-prayer-completion.spec.ts`, `desktop-dual-side-by-side-mode.spec.ts`) — modify; update label and percent assertions to `OF 6` and `[17, 33, 50, 67, 83, 100]%`, and update step advance helpers to walk through Section 4 Deep Analysis placeholder into Section 5 Discussion.
- `ARCHITECTURE.md` — modify; document 6-section runtime flow, `previous_section`, `reset_turn`, `completedSectionIds`, and `sectionEnteredAt`.

## Visual Design Impact

- UI involved: yes.
- Design source: `DESIGN.md` (Pacing & Navigation section, override #3, override #7).
- Screens affected:
  - `OpeningPrayerScreen`: Leader view gains optional `Reset turn` control when completed.
  - `IcebreakerScreen`: Leader view gains `← Previous` control paired with `Begin Reading →`.
  - `GospelReadingScreen`: Leader view gains `← Previous` control and optional `Reset turn` control when completed.
  - `SectionPlaceholderScreen`: Displays Section 4 Deep Analysis placeholder (`SECTION 4 OF 6`, `67%`) with `← Previous` and `Continue to Discussion →` for Study Leader; waiting copy for Participant.
  - `DiscussionScreen`: Header displays `SECTION 5 OF 6` (`83%`); leader view gains `← Previous` control.
  - `ClosingPrayerScreen`: Header displays `SECTION 6 OF 6` (`100%`); leader view gains `← Previous` control alongside `✓ Finish study`; stats card displays `6 SECTIONS`.
- Visual styling rules:
  - `← Previous` button: styled with Sanctuary midnight cream text, subtle border (`rgba(226, 168, 62, 0.28)`), >= 44px touch target, >= 16px font size.
  - `Reset turn` button: subtle secondary action pill with 🔄 icon.
  - Participants **never** see `← Previous` or `Reset turn` (enforced in JSX and verified in tests).
- New design artifact required: no.

## Durable Documentation Impact

- `ARCHITECTURE.md`: update — document `/ws` protocol additions (`previous_section`, `reset_turn`), `completedSectionIds`, `sectionEnteredAt`, and 6-section runtime lifecycle.
- `CONSTRAINTS.md`: update — add explicit constraint that `previous_section` and `reset_turn` MUST be leader-token authenticated on `/ws` (rejecting Participant callers with `FORBIDDEN_LEADER_ONLY`).
- `AGENTS.md`: not needed — operating rules already define bidirectional section navigation and role boundaries.
- Other docs: `docs/domain-model.md` and `docs/user-and-access-model.md` already describe bidirectional navigation; verify alignment.

## Implementation Plan

1. **Shared Types & Contracts**:
   - Update `STUDY_SECTION_IDS` in `src/shared/session.ts` to 6 sections.
   - Add `previous_section` and `reset_turn` to `LeaderCommandType`, `ClientWsMessage`, `SessionUpdatedCommand`.
   - Add `completedSectionIds` and `sectionEnteredAt` to `PublicLiveSessionSnapshot`.
2. **Server Lifecycle & Gating (`src/server/sessionStore.ts`)**:
   - Add `completedSectionIds`, `sectionEnteredAt`, and `sectionTurns` to `InternalLiveSession`.
   - Update `toPublicSnapshot` projection.
   - Update `complete_turn` and `override_turn` to record completion in `completedSectionIds`.
   - Update `start_study` and `next_section` to set `sectionEnteredAt` and handle 6-section progression.
   - Implement `previous_section` with leader authentication, index bounds checking, volunteer turn restoration, and `sectionEnteredAt` stamping.
   - Implement `reset_turn` with leader authentication, gated section check, `completedSectionIds` removal, and turn re-initialization.
3. **Client Transport & Hook**:
   - Expose `previousSection` and `resetTurn` in `src/client/lib/useLiveSession.ts`.
4. **Client UI & Navigation**:
   - Update `SectionProgressHeader.tsx` to `OF 6` and `[17, 33, 50, 67, 83, 100]%`.
   - Update `LiveSessionStatsCard.tsx` to `6 SECTIONS`.
   - Update `SectionPlaceholderScreen.tsx` for Section 4 Deep Analysis with leader navigation.
   - Add `← Previous` and `Reset turn` controls in Sections 1–6 leader views.
   - Update `App.tsx` and `DualDeviceFrame.tsx` to route all 6 sections.
   - Add CSS in `global.css`.
5. **Testing & Verification**:
   - Create integration test suite `tests/integration/ws-bidirectional-navigation.test.ts`.
   - Create Playwright E2E suite `tests/e2e/leader-bidirectional-section-navigation.spec.ts`.
   - Update existing unit, integration, and E2E test suites for 6 sections.
   - Run `./init.sh` and Playwright E2E verification on isolated ports `PORT=3103`, `API_PORT=3203`, `PLAYWRIGHT_PORT=3303`.

## Implementation Tasks

- [ ] Update `src/shared/session.ts`: `STUDY_SECTION_IDS` to 6 sections, `LeaderCommandType`, `ClientWsMessage`, `SessionUpdatedCommand`, `PublicLiveSessionSnapshot` (`completedSectionIds`, `sectionEnteredAt`).
- [ ] Update `src/server/sessionStore.ts`: `completedSectionIds`, `sectionEnteredAt`, and `sectionTurns` tracking on `InternalLiveSession`, implement `previous_section` and `reset_turn`, update `next_section` completion bypass.
- [ ] Update `src/client/lib/useLiveSession.ts`: add `previousSection()` and `resetTurn()` actions.
- [ ] Update `SectionProgressHeader.tsx` and `LiveSessionStatsCard.tsx` for 6-section metrics.
- [ ] Update `SectionPlaceholderScreen.tsx` for Section 4 Deep Analysis with leader `← Previous` and `Continue to Discussion →` navigation.
- [ ] Add `← Previous` button on Sections 2–6 leader views and `Reset turn` on completed gated sections in `OpeningPrayerScreen`, `IcebreakerScreen`, `GospelReadingScreen`, `DiscussionScreen`, `ClosingPrayerScreen`.
- [ ] Update `App.tsx` and `DualDeviceFrame.tsx` routing to handle all 6 sections.
- [ ] Add navigation button styles in `src/client/styles/global.css`.
- [ ] Add unit and integration tests in `tests/integration/ws-bidirectional-navigation.test.ts`.
- [ ] Add Playwright E2E test in `tests/e2e/leader-bidirectional-section-navigation.spec.ts`.
- [ ] Update existing unit, integration, and E2E test suites to match 6-section progression.
- [ ] Update `ARCHITECTURE.md` and `CONSTRAINTS.md`.
- [ ] Run baseline `./init.sh` and Playwright E2E gate on ports `PORT=3103`, `API_PORT=3203`, `PLAYWRIGHT_PORT=3303`.

## Verification Plan

### Automated Gates

1. **Non-blocking Startup Gate**:
   ```bash
   cd "/Users/armando/Documents/ya-bible-study-worktrees/leader-bidirectional-section-navigation" && PORT=3103 API_PORT=3203 PLAYWRIGHT_PORT=3303 ./init.sh
   ```
   - Must pass `npm run typecheck`, `npm test`, and `npm run build` with exit code `0`.

2. **Integration Test Suite**:
   ```bash
   cd "/Users/armando/Documents/ya-bible-study-worktrees/leader-bidirectional-section-navigation" && npx vitest run tests/integration/ws-bidirectional-navigation.test.ts
   ```
   - Verifies:
     - Study Leader sends `previous_section` -> moves backward, stamps `sectionEnteredAt`, preserves volunteer turn.
     - Participant sends `previous_section` -> rejected with `FORBIDDEN_LEADER_ONLY`.
     - Calling `previous_section` on Section 1 (`currentSectionIndex === 0`) -> rejected with `INVALID_STATE_TRANSITION`.
     - Calling `previous_section` in lobby -> rejected with `INVALID_STATE_TRANSITION`.
     - Completed gated section in `completedSectionIds[]` allows forward `next_section` without second volunteer.
     - Study Leader sends `reset_turn` on completed section -> removes from `completedSectionIds[]`, re-opens volunteer turn, and re-locks `next_section`.
     - Participant sends `reset_turn` -> rejected with `FORBIDDEN_LEADER_ONLY`.
     - `reset_turn` on non-gated section (Section 4/5/6) -> rejected with `INVALID_STATE_TRANSITION`.

3. **Playwright E2E Suite**:
   ```bash
   cd "/Users/armando/Documents/ya-bible-study-worktrees/leader-bidirectional-section-navigation" && PORT=3103 API_PORT=3203 PLAYWRIGHT_PORT=3303 npx playwright test tests/e2e/leader-bidirectional-section-navigation.spec.ts
   ```
   - Verifies:
     - Multi-context test with Study Leader and Participant.
     - Advance Section 1 -> Section 2. Study Leader clicks `← Previous` -> returns to Section 1. Both screens show Section 1 (`SECTION 1 OF 6`, `17%`).
     - Study Leader forward CTA is unlocked because Section 1 is already completed.
     - Advance through Section 2 -> Section 3 -> Section 4 (Deep Analysis placeholder) -> Section 5 (Discussion) -> Section 6 (Closing Prayer).
     - Study Leader clicks `← Previous` on Section 6 -> returns to Section 5.
     - Participant DOM never renders `← Previous` or `Reset turn` buttons.
     - Study Leader tests `Reset turn` on Section 1 -> turn re-opens and forward CTA re-locks.

4. **Regression E2E Suite**:
   ```bash
   cd "/Users/armando/Documents/ya-bible-study-worktrees/leader-bidirectional-section-navigation" && PORT=3103 API_PORT=3203 PLAYWRIGHT_PORT=3303 npx playwright test tests/e2e/title-lobby-qr-join.spec.ts tests/e2e/section-1-opening-prayer.spec.ts tests/e2e/section-3-gospel-reading-turn.spec.ts tests/e2e/section-5-closing-prayer-completion.spec.ts tests/e2e/ws-room-lifecycle.spec.ts
   ```
   - Verifies zero regressions and zero leaked rooms.

5. **Terminology Invariant**:
   ```bash
   cd "/Users/armando/Documents/ya-bible-study-worktrees/leader-bidirectional-section-navigation" && grep -rn "Assistant" src/
   ```
   - Must return 0 matches (exit code 1).

## Evidence To Capture

- Output of `./init.sh` showing clean typecheck, Vitest pass count, and build success.
- Output of `npx vitest run tests/integration/ws-bidirectional-navigation.test.ts`.
- Output of `PORT=3103 API_PORT=3203 PLAYWRIGHT_PORT=3303 npx playwright test tests/e2e/leader-bidirectional-section-navigation.spec.ts`.
- Output of regression Playwright E2E suites.
- `grep -rn "Assistant" src/` exit code 1.
- Updated `feature_list.json` and `PROGRESS.md`.

## Validator Checklist

- [ ] Implementation stays within this feature's scope (no full Section 4 deep analysis view, no 3D entry overlays, no First-Hand-Wins rewrites).
- [ ] Acceptance Scenarios 1–6 pass with concrete command evidence.
- [ ] Server enforces `FORBIDDEN_LEADER_ONLY` and `INVALID_STATE_TRANSITION` on `/ws` (not client-only button hiding).
- [ ] `completedSectionIds[]` prevents forward advancement deadlocks when revisiting completed sections.
- [ ] `reset_turn` re-opens volunteer turns and re-locks forward advancement.
- [ ] `sectionEnteredAt` ISO timestamp is broadcast on all section transitions (`start_study`, `next_section`, `previous_section`).
- [ ] SectionProgressHeader renders `SECTION X OF 6` and `[17, 33, 50, 67, 83, 100]%`.
- [ ] Section 4 placeholder renders for both roles, with leader navigation controls.
- [ ] Participants never see `← Previous` or `Reset turn` controls.
- [ ] Persistent E2E coverage is added in `tests/e2e/leader-bidirectional-section-navigation.spec.ts` and passes.
- [ ] `./init.sh` passes cleanly and repository remains restartable.
- [ ] Invariant check `grep -rn "Assistant" src/` returns 0 matches.

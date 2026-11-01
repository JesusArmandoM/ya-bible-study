# Feature Implementation Spec: Closing Prayer summarizes session metrics before Study Leader finishes study

## Source Feature

- `id`: `section-5-closing-prayer-completion`
- `area`: `section-5-closing`
- `depends_on`: `["section-4-lord-help-me-prayer-card"]` (accepted)
- `status`: `not_started`
- `source`: `feature_list.json`

## Goal

In Section 5 of 5 (100%, 'Closing Prayer', matching `ux/12. Closing Prayer.png`), all connected clients transition into the concluding liturgical moment of the study. The persistent `Sacred3DScene` smoothly morphs to the golden 5-point Star of Faith (`star-of-faith`), representing fulfilled faith and mission. All clients view live session stats (5 sections, duration in minutes, participant count), 4 practical weekly spiritual challenges (Persistent Prayer, Humble Prayer, Catholic Hospitality, Eucharistic Humility) with interactive personal selection, the "Next Week at Church" preview card ("Faith that Endures" — James 1:2–4), and the full Closing Prayer text ("Lord Jesus, Son of David, have mercy on us..."). 

Advancement is leader-controlled: the Study Leader exclusively sees the primary Sacred Gold `✓ Finish study` CTA pill, while Participants view a peaceful locked status bar (`Waiting for Study Leader to conclude study...`). Tapping `✓ Finish study` executes the study completion lifecycle: it dispatches `finish_study` over `/ws`, the server strictly enforces leader authorization, immediately purges all ephemeral reflections from memory (`session.discussionState = null`, ensuring zero privacy remnants per CONSTRAINTS.md #6), closes the room, removes the session from server state, and broadcasts `session_closed` with reason `'study_completed'`. Clients cleanly transition, clearing session credentials and leaving zero server-stored reflection data in memory.

## Non-Goals

- Desktop Dual Side-by-Side Mode simulation tools and dual viewports (deferred to downstream `desktop-dual-side-by-side-mode`).
- Server-side persistent database storage or synchronization of individual weekly challenge choices (personal challenge selection is kept local to the user's device).
- External calendar syncing, push notification subscriptions, or automated SMS/email reminders for next week's Bible study.
- Audio recording, automated voice synthesizer recitation, or background hymn playback.
- Section 6 or additional study stages beyond the canonical 5-section model.

## Job Story

When our Bible study group reaches the final liturgical moment in Section 5,
I want to see our session summary metrics, select a concrete weekly spiritual challenge, preview next week's Scripture passage, pray the Closing Prayer together, and have our Study Leader conclude the study,
so we can conclude in reverent communion, take home a tangible resolution for daily discipleship, and guarantee that all shared ephemeral reflections are permanently wiped from server memory.

## Users And Permissions

- **Study Leader**:
  - Advances into Section 5 from Section 4 via `next_section` ("Begin Closing Prayer →" or "Advance to Section 5 →").
  - Views the Section Progress Header (`SECTION 5 OF 5`, `100%`), `Sacred3DScene` Star of Faith stage, Live Session Stats card, Practical Weekly Challenges card, Next Week at Church announcement card, and the full Closing Prayer text card.
  - Exclusively holds the primary Sacred Gold `✓ Finish study` action pill (`data-testid="finish-study-btn"`).
  - Tapping `✓ Finish study` dispatches `finish_study` to the `/ws` server, which closes the session, purges reflections, and cleans up server memory.
- **Participant**:
  - Automatically transitions to Section 5 in real time when the Leader advances.
  - Views identical synchronized liturgical content: progress bar at 100%, `star-of-faith` 3D hero stage, session stats, weekly challenges, next week card, and closing prayer text.
  - Can interactively tap any of the 4 weekly challenges to mark their personal focus for the upcoming week (stored locally on client).
  - Views a calm locked status bar: `Waiting for Study Leader to conclude study...` (`data-testid="participant-waiting-bar"`).
  - Cannot finish or close the study over UI or `/ws`; any unauthorized attempt receives `FORBIDDEN_LEADER_ONLY`.
  - When the Study Leader finishes the study, receives `session_closed` with reason `'study_completed'`, clears credentials, and views a graceful study conclusion notice.

## Acceptance Scenarios

### Scenario 1: Initial Section 5 rendering with Star of Faith hero stage (Both Roles)

Given an active live session on Section 4
When the Study Leader advances to Section 5
Then all connected clients transition to Section 5 (`currentSectionIndex: 4`, `currentSectionId: 'section_5_closing'`)
And the Section Progress Header renders `SECTION 5 OF 5` on the left, `100%` on the right, and the 4px gold progress bar at full `100%` width
And the persistent `Sacred3DScene` displays the golden 5-point Star of Faith (`star-of-faith`) with active moment eyebrow `SECTION 5 · CLOSING`
And the page displays the eyebrow `WRAPPING UP` and display title `Closing Prayer` matching `ux/12. Closing Prayer.png`.

### Scenario 2: Live Session Stats card calculation and display

Given clients connected in Section 5 with an active session
When the Live Session Stats card renders (`data-testid="session-stats-card"`)
Then it displays 3 columns separated by subtle vertical dividers matching `ux/12. Closing Prayer.png`:
  1. Sections column (`data-testid="stat-sections"`): `5` with subcaption `SECTIONS`
  2. Duration column (`data-testid="stat-duration"`): elapsed minutes computed from `session.startedAt` (e.g., `42m` or `1m` minimum) with subcaption `DURATION`
  3. Participants column (`data-testid="stat-participants"`): total connected participant count (`session.connectedParticipantCount`) with subcaption `PARTICIPANTS`.

### Scenario 3: Practical Weekly Challenges card and interactive selection

Given a Participant or Study Leader viewing Section 5
When observing the Practical Weekly Challenges card (`data-testid="weekly-challenges-card"`)
Then all 4 canonical challenges from `greatIsYourFaithSeed.ts` render with option numbers and descriptions:
  1. *Persistent Prayer*: "Intercede daily by name all week for one suffering person without giving up."
  2. *Humble Prayer*: "Begin each day with the Canaanite woman's simple prayer: \"Lord, help me.\""
  3. *Catholic Hospitality*: "Intentionally reach out to someone feeling like an outsider at Mass, work, or young adult group."
  4. *Eucharistic Humility*: "Pray \"Lord, I am not worthy...\" slowly and attentively before Holy Communion."
And tapping any challenge option (1–4) highlights that card with a gold accent border and checkmark indicator
And the selected challenge option persists locally in `localStorage` keyed by session code and member ID without triggering network requests.

### Scenario 4: "Next Week at Church" preview card and Closing Prayer text

Given clients in Section 5
When reviewing the informational cards below the challenges
Then the "Next Week at Church" card (`data-testid="next-week-card"`) displays:
  - Eyebrow with announcement icon: `📣 NEXT WEEK AT CHURCH`
  - Announcement text: `“Faith that Endures” — James 1:2–4`
And the Closing Prayer card (`data-testid="closing-prayer-card"`) renders the full authoritative prayer in editorial scripture italic:
  > Lord Jesus, Son of David, have mercy on us. When we feel like outsiders, draw us closer. When You seem silent, teach us to persevere. When we are proud, make us humble. When we are discouraged, strengthen our faith. When we are tempted to send others away, give us Your heart of mercy. Make Your Church a house of prayer for all peoples. Let all nations praise You. Heal those we carry in our hearts. And say over us, by Your grace: "Great is your faith." Amen.

### Scenario 5: Role-gated bottom action zone (Leader vs Participant)

Given clients in Section 5
When observing the bottom anchored action zone
Then the Study Leader sees the primary Sacred Gold button `✓ Finish study` (`data-testid="finish-study-btn"`) with height `>= 54px` and dark ink `#11131F` text
And the Participant sees NO "Finish study" button; instead, the Participant sees a calm locked status bar with text `Waiting for Study Leader to conclude study...` (`data-testid="participant-waiting-bar"`).

### Scenario 6: Study Leader finishes study — session closed and ephemeral reflections purged

Given an active session in Section 5 where participants previously submitted reflections in Section 4
When the Study Leader taps `✓ Finish study` (`data-testid="finish-study-btn"`)
Then the client dispatches a `finish_study` (or `close_session` with `reason: 'study_completed'`) frame to `/ws`
And the server verifies the Study Leader's `leaderToken`
And the server purges all ephemeral reflections from memory (`session.discussionState.reflections = []; session.discussionState = null;`)
And the server purges the session from memory (`sessions.delete(sessionCode)`) and cancels any active sweep or selection timers
And all connected sockets (Leader and Participants) receive `{ type: 'session_closed', sessionCode, reason: 'study_completed' }`
And verifying `GET /api/health` confirms `activeSessionCount` is `0`
And querying server memory confirms zero reflection objects exist
And all client browsers clear session credentials from `sessionStorage` and display a clean study conclusion notice or return to the welcome screen.

### Scenario 7: Unauthorized or Participant attempt to finish study is rejected

Given a connected Participant in Section 5
When the Participant sends a raw `finish_study` or `close_session` frame over `/ws`
Then the server rejects the frame with `FORBIDDEN_LEADER_ONLY`
And the session remains active and unchanged on Section 5
And a client providing an invalid or mismatched `leaderToken` receives `UNAUTHORIZED_LEADER`.

### Scenario 8: Mobile ergonomics, single WebGL canvas, and zero legacy terminology

Given a mobile client on a 390x844 viewport
When interacting with Section 5
Then the single persistent `Sacred3DScene` WebGL canvas remains mounted without remounting or leaking context
And all touch targets meet or exceed `44px x 44px`
And all text elements enforce computed `font-size >= 16px` for interactive inputs
And a global repository audit confirms zero occurrences of `"Assistant"` across `src/` (strictly `Study Leader` and `Participant`).

## Repository Research

### Files Inspected

- `src/shared/study.ts`:
  - Contains authoritative types: `ClosingSection`, `WeeklyChallengeItem`, `NextWeekAnnouncement`.
  - In `GREAT_IS_YOUR_FAITH_STUDY.closing`: contains `summaryBullets`, `weeklyChallenges` (options 1–4), `nextWeekAnnouncement` (`"Faith that Endures" — James 1:2–4`), and full `closingPrayerText`.
- `src/shared/session.ts`:
  - Defines `SESSION_PROTOCOL_VERSION = 3`, `STUDY_SECTION_IDS` (including `'section_5_closing'`), `SessionStudySummary`, `SessionCloseReason` (`'closed_by_leader' | 'expired_inactivity'`), `LeaderCommandType`, `ClientWsMessage`, and `ServerWsMessage`.
  - Observation: `SessionStudySummary` currently holds `openingPrayer`, `icebreaker`, `gospelReading`, `discussion`, but does not yet project `closing`.
- `src/server/studies/greatIsYourFaithSeed.ts`:
  - Seed definition `GREAT_IS_YOUR_FAITH_STUDY.closing` has full data for Section 5:
    - `progressPercent: 100`, `title: 'Closing Prayer'`, `eyebrow: 'WRAPPING UP'`, `durationLabel: '3 min'`.
    - `weeklyChallenges`: 4 items with `optionNumber`, `title`, `description`.
    - `nextWeekAnnouncement`: `{ title: 'Faith that Endures', citation: 'James 1:2–4', displayLabel: '"Faith that Endures" — James 1:2–4' }`.
    - `closingPrayerText`: 105-word closing prayer ending in `"Great is your faith." Amen.`
- `src/server/sessionStore.ts`:
  - Handles leader commands (`handleLeaderCommand`) and session close (`closeAndPurgeSession`).
  - Lines 1308–1321: `next_section` advances to `nextIndex = 4`, `nextSectionId = 'section_5_closing'`, clears `volunteerTurn = null`.
  - Lines 930–933: `close_session` calls `closeAndPurgeSession(session, 'closed_by_leader', socket, requestId)`.
- `src/client/state/sacredStageStore.ts`:
  - `SACRED_STAGE_METADATA['star-of-faith']` already defines golden 5-point Star of Faith (`#E2A83E` primary, `#FDE68A` secondary, `completion-pulse` impulse).
  - `resolveSacredStage` already contains: `case 'section-5-closing': return { stage: 'star-of-faith', accentMode: 'default' };`.
- `src/client/components/stage/SacredStageRig.tsx`:
  - Line 657: Renders `<group ref={starOfFaithGroupRef} visible={stage === 'star-of-faith'}>` with `geometries.fivePointStar` and PBR gold material.
- `src/client/components/sections/SectionProgressHeader.tsx`:
  - Reusable header: `SectionProgressHeader({ sectionNumber: 5 })` renders `SECTION 5 OF 5`, `100%`, and 100% gold progress bar.
- `src/client/components/discussion/LeaderQuestionQueue.tsx`:
  - Advance button on last question has `data-testid="advance-section-5-btn"` ("Begin Closing Prayer →") or `data-testid="advance-section-5-direct"` ("Advance to Section 5 →") calling `onAdvanceSection`.
- `src/client/App.tsx`:
  - Currently renders `<SectionPlaceholderScreen sectionIndex={liveSession.session.currentSectionIndex ?? 0} />` for Section 5. Needs routing to `ClosingPrayerScreen`.
- `src/client/lib/sessionSocket.ts` & `src/client/lib/useLiveSession.ts`:
  - Provides WebSocket abstraction and room action hooks. Need `finishStudy` room action and graceful `session_closed` handling when `reason === 'study_completed'`.
- `DESIGN.md` & `ux/12. Closing Prayer.png`:
  - Authoritative visual layout: gold progress bar 100%, Star of Faith badge, `WRAPPING UP` eyebrow, `Closing Prayer` title, 3-column stats card (`5 SECTIONS`, `42m DURATION`, `12 PARTICIPANTS`), `📣 NEXT WEEK AT CHURCH` card, full prayer text card, and `✓ Finish study` gold button.
- `CONSTRAINTS.md`:
  - Rule 3 (Participant terminology), Rule 5 (server-side leader gating including `finish_study`/`close_session`), Rule 6 (ephemeral reflections purged on completion), Rule 7 (`font-size >= 16px`, `100dvh`, `>= 44px` touch targets), Rule 8 (single persistent WebGL canvas).

### Existing Patterns To Follow

- **Summary Projection & Normalization**: Mirror `toSessionDiscussionContent` and `normalizeSessionDiscussionContent` in `src/shared/session.ts` with `toSessionClosingContent` and `normalizeSessionClosingContent`.
- **Additive Protocol Evolution**: Keep `SESSION_PROTOCOL_VERSION = 3` with backwards-compatible additive fields.
- **Server Gating**: Enforce `leaderToken` validation via `handleLeaderCommand` in `src/server/sessionStore.ts` before executing `finish_study`.
- **Single Canvas WebGL**: Trigger stage transition via `useSacredStageStore.getState().setStage('star-of-faith')` without re-mounting the `<Canvas>`.
- **E2E Headroom & Cleanup Pattern**: Use `test.describe.configure({ timeout: 60_000 })` and `expect = baseExpect.configure({ timeout: 15_000 })` with never-throwing bounded cleanup in Playwright specs.

### Current Gaps

- `SessionStudySummary` lacks the `closing` section payload in `src/shared/session.ts`.
- `src/server/sessionStore.ts` does not accept `finish_study` or `reason: 'study_completed'` in `close_session`, nor does it explicitly clear `reflections` prior to session purging.
- `src/client/lib/useLiveSession.ts` does not expose a `finishStudy` method.
- No Section 5 screen exists under `src/client/components/closing/`; `App.tsx` renders a placeholder.
- No unit, integration, or E2E tests exist specifically for Section 5 and session completion.

## Technical Approach

### 1. Shared Types & Protocol (`src/shared/session.ts`)

- Define `SessionWeeklyChallengeItem`:
  ```ts
  export interface SessionWeeklyChallengeItem {
    optionNumber: 1 | 2 | 3 | 4;
    title: string;
    description: string;
  }
  ```
- Define `SessionNextWeekAnnouncement`:
  ```ts
  export interface SessionNextWeekAnnouncement {
    title: string;
    citation: string;
    displayLabel: string;
  }
  ```
- Define `SessionClosingContent`:
  ```ts
  export interface SessionClosingContent {
    title: string;
    eyebrow: string;
    durationLabel: string;
    summaryBullets: string[];
    weeklyChallenges: SessionWeeklyChallengeItem[];
    nextWeekAnnouncement: SessionNextWeekAnnouncement;
    closingPrayerText: string;
  }
  ```
- Add optional `closing?: SessionClosingContent | null;` to `SessionStudySummary`.
- Add `toSessionClosingContent(section: ClosingSection): SessionClosingContent` projecting `ClosingSection` onto `SessionClosingContent`.
- Update `toSessionStudySummary(doc: StudyDocument)` to include `closing: toSessionClosingContent(doc.closing)`.
- Implement `normalizeSessionClosingContent(raw: unknown): SessionClosingContent | null` with bounded string checks for title, eyebrow, weekly challenge options (1–4), next week announcement, and closing prayer text.
- Widen `SessionCloseReason`:
  ```ts
  export type SessionCloseReason =
    | 'closed_by_leader'
    | 'expired_inactivity'
    | 'study_completed';
  ```
- Widen `LeaderCommandType`:
  ```ts
  export type LeaderCommandType =
    | ...
    | 'close_session'
    | 'finish_study';
  ```
- Add `finish_study` message to `ClientWsMessage`:
  ```ts
  | {
      type: 'finish_study';
      sessionCode: string;
      leaderToken: string;
      memberId?: string;
      requestId?: string;
    }
  ```

### 2. Server Store & Memory Purge (`src/server/sessionStore.ts`)

- In `handleIncomingMessage`, route `case 'finish_study':` to `this.handleLeaderCommand(socket, record.type, record, requestId);`.
- In `handleLeaderCommand`:
  - Handle `finish_study` (or `close_session` with `record.reason === 'study_completed'`):
    - Verify `session.status === 'in_progress'` or `session.status === 'lobby'`.
    - Explicitly purge reflections:
      ```ts
      if (session.discussionState) {
        session.discussionState.reflections = [];
        session.discussionState = null;
      }
      ```
    - Call `this.closeAndPurgeSession(session, 'study_completed', socket, requestId)`.
- In `closeAndPurgeSession`:
  - Cancel any active timers.
  - Purge `discussionState` and reflections.
  - Broadcast `{ type: 'session_closed', sessionCode: session.sessionCode, reason }` to all member sockets.
  - Clear `session.members` and delete from `this.sessions`.
  - Guarantee zero reflections or participant data remain in memory.

### 3. Client Transport & Hooks (`src/client/lib/`)

- In `src/client/lib/sessionSocket.ts`:
  - In `sendLeaderCommand`, handle `input.type === 'finish_study'`:
    ```ts
    if (input.type === 'finish_study') {
      return await sendRequest(
        {
          type: 'finish_study',
          sessionCode,
          leaderToken,
          ...(memberId ? { memberId } : {}),
        },
        ['session_closed'],
      );
    }
    ```
- In `src/client/lib/useLiveSession.ts`:
  - Expose `finishStudy = useCallback(async () => { ... })`:
    - Dispatches `finish_study` via `client.sendLeaderCommand({ type: 'finish_study' })`.
  - In `session_closed` socket listener:
    - If `message.reason === 'study_completed'`, set `setError(null)` rather than showing an error string, clear session, credentials, and role cleanly.

### 4. Client UI: Section 5 Closing Prayer (`src/client/components/closing/`)

Create `src/client/components/closing/ClosingPrayerScreen.tsx`:
- Props:
  ```ts
  export interface ClosingPrayerScreenProps {
    role: SanctuaryRole;
    session: PublicLiveSessionSnapshot;
    localStudyDocument?: StudyDocument | null;
    memberId?: string | null;
    onFinishStudy: () => void | Promise<void>;
    isSubmitting?: boolean;
  }
  ```
- Sub-components / Sections:
  1. `SectionProgressHeader sectionNumber={5}`: renders `SECTION 5 OF 5`, `100%`, and 100% gold progress bar.
  2. Hero Stage sync: `useEffect` calls `resolveSacredStage({ screen: 'section-5-closing' })` setting stage to `'star-of-faith'`.
  3. Header Lockup:
     - Eyebrow: `WRAPPING UP` (`.closing-eyebrow`)
     - Title: `Closing Prayer` (`.closing-title`, Playfair Display serif)
  4. Live Session Stats Card (`.closing-stats-card`, `data-testid="session-stats-card"`):
     - Col 1: `5` / `SECTIONS` (`data-testid="stat-sections"`)
     - Col 2: Duration in minutes calculated as `Math.max(1, Math.round((Date.now() - Date.parse(session.startedAt ?? '')) / 60000)) + 'm'` or fallback to `${session.study?.estimatedMinutes ?? 42}m` / `DURATION` (`data-testid="stat-duration"`)
     - Col 3: `${session.connectedParticipantCount}` / `PARTICIPANTS` (`data-testid="stat-participants"`)
  5. Weekly Practical Challenges Card (`.closing-challenges-card`, `data-testid="weekly-challenges-card"`):
     - Eyebrow: `CHOOSE ONE CHALLENGE FOR THE WEEK`
     - 4 Challenge options (Persistent Prayer, Humble Prayer, Catholic Hospitality, Eucharistic Humility)
     - State `selectedOption: number | null` initialized from `localStorage` (`ya-bible-study.weekly-challenge.${session.sessionCode}.${memberId}`)
     - Tapping an option sets `selectedOption`, updates `localStorage`, and highlights card with `.is-selected` gold border + checkmark.
  6. "Next Week at Church" Announcement Card (`.closing-next-week-card`, `data-testid="next-week-card"`):
     - Eyebrow: `📣 NEXT WEEK AT CHURCH`
     - Bold announcement: `“Faith that Endures” — James 1:2–4`
  7. Full Closing Prayer Text Card (`.closing-prayer-card`, `data-testid="closing-prayer-card"`):
     - Eyebrow: `CLOSING PRAYER`
     - Scriptural italic text of full 105-word closing prayer.
  8. Anchored Bottom Action Zone:
     - Study Leader: Sacred Gold `✓ Finish study` button (`data-testid="finish-study-btn"`).
     - Participant: Calm locked bar `Waiting for Study Leader to conclude study...` (`data-testid="participant-waiting-bar"`).
- Wire into `src/client/App.tsx`:
  - When `sessionStatus === 'in_progress' && liveSession.session.currentSectionId === 'section_5_closing'`, render `<ClosingPrayerScreen>` instead of placeholder.
- Add styles to `src/client/styles/global.css` adhering to Sacred Midnight tokens.

## Expected File Changes

- `src/shared/session.ts` — modify; add `SessionWeeklyChallengeItem`, `SessionNextWeekAnnouncement`, `SessionClosingContent`, widen `SessionStudySummary`, add `finish_study` command, widen `SessionCloseReason` to include `'study_completed'`.
- `src/server/sessionStore.ts` — modify; handle `finish_study` command, reflection memory purging, and `'study_completed'` session close reason.
- `src/client/lib/sessionSocket.ts` — modify; support `finish_study` in `sendLeaderCommand`.
- `src/client/lib/useLiveSession.ts` — modify; expose `finishStudy` action and handle `study_completed` without error.
- `src/client/components/closing/ClosingPrayerScreen.tsx` — create; Section 5 Closing Prayer screen with stats, challenges, next week announcement, prayer text, and role-gated controls.
- `src/client/App.tsx` — modify; route `section_5_closing` to `ClosingPrayerScreen` passing `liveSession.finishStudy`.
- `src/client/styles/global.css` — modify; append Section 5 styles matching `ux/12. Closing Prayer.png`.
- `tests/unit/closing-content.test.ts` — create; Vitest unit tests for closing summary projection, normalization, and bounds validation.
- `tests/unit/closing-prayer-screen.test.tsx` — create; Vitest component tests for `ClosingPrayerScreen` rendering, stats, challenges, and role gating.
- `tests/integration/ws-closing-finish.test.ts` — create; integration tests for `/ws` `finish_study` command, role gating, reflection purge, and `study_completed` broadcast.
- `tests/e2e/section-5-closing-prayer-completion.spec.ts` — create; multi-client Playwright E2E suite verifying full advance into Section 5, stats, prayer, finish study, and server memory purge.
- `ARCHITECTURE.md` — modify; update documentation for Section 5 closing components, wire protocol additions, and reflection purging lifecycle.

## Visual Design Impact

- UI involved: yes
- Design source: `DESIGN.md` and `ux/12. Closing Prayer.png`
- Screens or states affected:
  - Section 5 Leader screen: full layout with `✓ Finish study` CTA pill.
  - Section 5 Participant screen: identical layout with calm locked status bar.
  - Challenge card selected state: gold border `#E2A83E` and checkmark indicator.
  - Study conclusion state: peaceful conclusion notification upon `study_completed`.
- New design artifact required: no — `ux/12. Closing Prayer.png` is the authoritative source of truth.

## Durable Documentation Impact

- `ARCHITECTURE.md`: update — document Section 5 `ClosingPrayerScreen`, protocol additions (`finish_study`, `SessionClosingContent`, `study_completed`), and reflection purge lifecycle.
- `CONSTRAINTS.md`: not needed — Section 5, `finish_study`, and ephemeral reflection purge are already documented in constraints 5 & 6.
- `AGENTS.md`: not needed — operating rules and workflow remain unchanged.
- Other docs: not needed.

## Implementation Plan

1. **Protocol & Data Modeling**:
   - Update `src/shared/session.ts` with `SessionClosingContent`, `SessionWeeklyChallengeItem`, `SessionNextWeekAnnouncement`, `toSessionClosingContent`, and `normalizeSessionClosingContent`.
   - Add `finish_study` to `LeaderCommandType` and `ClientWsMessage`.
   - Add `study_completed` to `SessionCloseReason`.
   - Add unit tests in `tests/unit/closing-content.test.ts`.
2. **Server Store & Reflection Memory Purge**:
   - Update `src/server/sessionStore.ts` to handle `finish_study` command with `leaderToken` authentication.
   - Implement explicit memory purging of `session.discussionState.reflections = []` and `session.discussionState = null` before closing the session.
   - Pass `'study_completed'` to `closeAndPurgeSession` and broadcast `session_closed` with `reason: 'study_completed'`.
   - Add integration tests in `tests/integration/ws-closing-finish.test.ts`.
3. **Client Transport & Actions**:
   - Update `src/client/lib/sessionSocket.ts` to handle `finish_study` in `sendLeaderCommand`.
   - Update `src/client/lib/useLiveSession.ts` to expose `finishStudy` room action and handle `study_completed` cleanly.
4. **Section 5 Client UI Components**:
   - Create `src/client/components/closing/ClosingPrayerScreen.tsx`.
   - Implement `SectionProgressHeader` (section 5, 100%), `star-of-faith` stage sync, Live Session Stats card (3 columns), Weekly Practical Challenges card (4 options with local selection), Next Week at Church card, Closing Prayer text card, and role-gated bottom zone (`✓ Finish study` for Leader, calm locked bar for Participant).
   - Add styling in `src/client/styles/global.css` matching `ux/12. Closing Prayer.png` with Sacred Midnight design tokens.
   - Wire `ClosingPrayerScreen` into `src/client/App.tsx`.
   - Add component tests in `tests/unit/closing-prayer-screen.test.tsx`.
5. **End-to-End Verification**:
   - Create `tests/e2e/section-5-closing-prayer-completion.spec.ts` using Playwright multi-client testing.
   - Walk from setup lobby through Section 4 (submitting reflections) into Section 5.
   - Assert `star-of-faith` stage, stats calculation, challenges, next week card, and closing prayer text.
   - Assert Study Leader sees `✓ Finish study` and Participant sees calm locked bar.
   - Tapping `✓ Finish study` closes room across all clients, clears credentials, and verifies `activeSessionCount === 0`.
   - Verify server-side reflections are purged from memory.
6. **Regression & Documentation**:
   - Run `./init.sh` to ensure all Vitest unit and integration suites pass and production builds succeed.
   - Run `npm run test:e2e` for Playwright validation.
   - Verify `grep -rn "Assistant" src/` returns 0 matches.
   - Update `ARCHITECTURE.md`.

## Implementation Tasks

- [ ] Add `SessionWeeklyChallengeItem`, `SessionNextWeekAnnouncement`, `SessionClosingContent`, `toSessionClosingContent`, `normalizeSessionClosingContent`, `finish_study` command, and `study_completed` reason in `src/shared/session.ts`.
- [ ] Create `tests/unit/closing-content.test.ts` verifying projection, normalization, and bounds validation.
- [ ] Implement `finish_study` leader command, ephemeral reflection memory purge, and `study_completed` close broadcast in `src/server/sessionStore.ts`.
- [ ] Create `tests/integration/ws-closing-finish.test.ts` verifying `finish_study` gating, reflection purge, socket broadcast, and memory cleanup.
- [ ] Support `finish_study` in `src/client/lib/sessionSocket.ts` and expose `finishStudy` in `src/client/lib/useLiveSession.ts`.
- [ ] Build `src/client/components/closing/ClosingPrayerScreen.tsx` with Section Progress Header, Star of Faith stage, Live Session Stats card, Weekly Challenges card, Next Week card, Closing Prayer card, and role-gated bottom zone.
- [ ] Add Section 5 styles in `src/client/styles/global.css` matching `ux/12. Closing Prayer.png`.
- [ ] Wire `ClosingPrayerScreen` into `src/client/App.tsx` for `section_5_closing`.
- [ ] Create `tests/unit/closing-prayer-screen.test.tsx` verifying component rendering, stats, challenge selection, and role gating.
- [ ] Create `tests/e2e/section-5-closing-prayer-completion.spec.ts` with Playwright multi-client test for Section 5 walkthrough, assertions, and finish study lifecycle.
- [ ] Run `./init.sh` and full Playwright E2E suite to confirm zero regressions and clean test passing.
- [ ] Run `grep -rn "Assistant" src/` to verify zero legacy terminology occurrences.
- [ ] Update `ARCHITECTURE.md` with Section 5 closing components and reflection purge lifecycle.

## Verification Plan

- **Non-blocking Standard Gate**:
  - Run `./init.sh` (`npm run typecheck && npm test && npm run build`).
  - Expected: clean exit 0 across all 3 TypeScript configs, all Vitest test files pass, Vite and tsc production builds succeed.
- **Unit & Integration Tests**:
  - `npx vitest run tests/unit/closing-content.test.ts`
  - `npx vitest run tests/unit/closing-prayer-screen.test.tsx`
  - `npx vitest run tests/integration/ws-closing-finish.test.ts`
  - Expected: all tests pass.
- **Persistent Playwright E2E Verification**:
  - `PLAYWRIGHT_PORT=3301 npm run test:e2e tests/e2e/section-5-closing-prayer-completion.spec.ts`
  - Expected: all scenarios pass on mobile-chromium (390x844), verifying:
    1. Advance into Section 5 with `star-of-faith` stage and 100% progress.
    2. Stats card rendering sections (5), elapsed duration, and participant count.
    3. Practical weekly challenge options (1–4) rendered and selectable.
    4. Next Week card ("Faith that Endures" — James 1:2–4) and Closing Prayer text rendered.
    5. Study Leader sees `✓ Finish study` CTA pill; Participant sees calm locked bar.
    6. Clicking `✓ Finish study` closes room for all clients and purges reflections from server memory.
    7. Participant attempt to send `finish_study` is rejected with `FORBIDDEN_LEADER_ONLY`.
  - `PLAYWRIGHT_PORT=3301 npm run test:e2e tests/e2e/ws-room-lifecycle.spec.ts`
  - Expected: passes with zero leaked sessions (`activeSessionCount: 0`).
- **Terminology Invariant Check**:
  - `grep -rn "Assistant" src/`
  - Expected: 0 matches (exit code 1).

## Evidence To Capture

- Output of `./init.sh` showing TypeScript clean, Vitest passing (including new closing tests), and production bundle built.
- Output of `PLAYWRIGHT_PORT=3301 npm run test:e2e tests/e2e/section-5-closing-prayer-completion.spec.ts` showing all scenarios passing.
- Output of `PLAYWRIGHT_PORT=3301 npm run test:e2e tests/e2e/ws-room-lifecycle.spec.ts` showing zero leaked sessions.
- Invariant check: `grep -rn "Assistant" src/` returning 0 matches.
- Server reflection purge confirmation: verification that `activeSessionCount` is `0` and `session.discussionState.reflections` has been wiped from memory.

## Validator Checklist

- [ ] Implementation stays within this feature's scope (Section 5 Closing Prayer, stats, challenges, next week card, prayer text, finish study, and reflection purge).
- [ ] All acceptance scenarios pass.
- [ ] Verification evidence is recorded in `feature_list.json` and `PROGRESS.md`.
- [ ] Persistent Playwright multi-client E2E coverage was added in `tests/e2e/section-5-closing-prayer-completion.spec.ts` and passes.
- [ ] All interactive text inputs and controls enforce computed `font-size >= 16px` and touch targets `>= 44px x 44px`.
- [ ] Only one persistent WebGL canvas remains mounted throughout the study.
- [ ] Server enforces `leaderToken` authorization on `finish_study` / `close_session` (not client-only).
- [ ] Server purges all ephemeral reflections from memory on session completion.
- [ ] Zero occurrences of `"Assistant"` exist across `src/` (strictly `Study Leader` and `Participant`).
- [ ] `./init.sh` exits 0 cleanly.

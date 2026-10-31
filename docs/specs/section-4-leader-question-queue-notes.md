# Feature Implementation Spec: Deep Analysis lets Study Leader switch active prompts with pastoral notes

## Source Feature

- `id`: section-4-leader-question-queue-notes
- `area`: section-4-discussion
- `depends_on`: ["section-3-gospel-reading-turn"] (accepted)
- `status`: not_started
- `source`: `feature_list.json`

## Goal

In Section 4 of 5 (80%, 'Lord, Help Me Pray'), the Study Leader and Participants transition from the Gospel Reading into Deep Analysis & Discussion. The Study Leader sees the 3 default curated questions (`ux/10. Discussion - Leader.png`), switches the active question via `Next question →` or direct card tap, opens `+ Add` to promote any question from the 12-question study bank or enter a custom prompt, and consults facilitator-only A–J Gospel commentary and Catholic doctrine notes (including the Romans 11:29 fidelity-to-Israel doctrinal guardrail and patristic notes from Augustine, Chrysostom, and Jerome) in an expandable pastoral drawer. Participants view only the active question card synchronized in real time (`ux/11. Discussion - Assistant.png`), with zero pastoral notes or sample answers leaked over `/ws` or DOM. When discussion concludes, the Study Leader advances all clients to Section 5 ("mercy, not pace, is the goal" — no volunteer turn gate required on Section 4 advance).

## Non-Goals

- Live participant reflection submissions, anonymous author masking, and the live Sharing feed (deferred to downstream `section-4-live-participant-reflections`).
- Private "Lord, Help Me" 3-part prayer card builder and PNG image export (deferred to downstream `section-4-lord-help-me-prayer-card`).
- Section 5 Closing Prayer completion or session summary metrics (deferred to downstream `section-5-closing-prayer-completion`).
- Volunteer turn gating in Section 4 (`turnMode: 'none'`; advancing out of Section 4 requires no volunteer completion precondition).

## Job Story

When the Gospel proclamation finishes and the group enters Deep Analysis,
I want the Study Leader to switch active discussion questions, add questions from the bank or custom prompts, and consult private pastoral commentary and doctrinal notes,
so the group explores Scripture with theological depth and pastoral care while facilitator guidance remains strictly confidential to the leader.

## Users And Permissions

- Study Leader: Views the discussion queue with active indicators, response counter placeholders, and estimated durations; taps cards or `Next question →` to switch the active question; taps `+ Add` to append questions from the 12-question bank or custom prompts; opens the Pastoral Notes drawer (A–J commentary, Catholic doctrine, Romans 11:29 guardrail, young adult application, and active question sample answers/notes sourced from `localStudyDocument`); exclusively advances to Section 5 when ready.
- Participant: Views the active question card (`SECTION 4 OF 5` / `80%` and `QUESTION X OF Y`, badge, prompt, and locked info pill) synchronized in real time over `/ws`; zero question-switching, queue-reordering, question-adding, or section-advancement controls; zero access to pastoral notes, commentary, doctrine, or sample answers in DOM or network payloads.

## Acceptance Scenarios

### Scenario 1: Initial Section 4 state and default curated queue (both roles)

Given a session advanced out of Section 3 into Section 4
When clients render `section_4_discussion`
Then both roles show `SECTION 4 OF 5` / `80%` (`SectionProgressHeader`), title `Lord, Help Me Pray`, and eyebrow `DEEP ANALYSIS · 25 MIN`; the Study Leader sees the 3 default curated questions (`q-6` "What makes the Canaanite woman's faith 'great'?", `q-5` "Have you ever felt God's silence...", and `q-8` "Who do you need to pray 'Lord, help me' for this week?") with `q-6` marked active; Participants see only the active question card with `QUESTION 1 OF 3`, prompt `What makes the Canaanite woman's faith 'great'?`, and sub-copy `Only the leader decides when to advance`; exactly one `<canvas>` remains mounted and `grep -rn "Assistant" src/` returns 0 matches.

### Scenario 2: Active question switching via 'Next question' and card tap

Given connected Participants and the Study Leader in Section 4 on question 1 (`q-6`)
When the Study Leader taps `Next question →` (or taps card 2 `q-5`)
Then the server updates `activeQuestionId` to `q-5` via `switch_question` and broadcasts `session_updated`; immediately on all connected screens, Card 2 is marked active with `QUESTION 2 OF 3` and prompt `Have you ever felt God's silence...`; tapping Card 3 updates all screens to `q-8` with `QUESTION 3 OF 3`.

### Scenario 3: Adding questions from the 12-question bank and custom prompt

Given the Study Leader in Section 4
When the Study Leader taps `+ Add`
Then a modal opens presenting (1) the unqueued questions from the 12-question study bank with categories and times, and (2) a custom question input (`<textarea>` with `font-size >= 16px`); promoting a bank question (e.g. `q-2` or `q-3`) or submitting a custom prompt dispatches `add_question`, appends the question to the queue, updates the total question count to 4 across all clients (`QUESTION X OF 4`), and allows the new card to be selected as active.

### Scenario 4: Facilitator pastoral drawer & Romans 11:29 doctrinal guardrail privacy

Given the Study Leader and Participants in Section 4
When the Study Leader opens the Pastoral Notes drawer
Then the Study Leader sees verse-by-verse commentary A–J (including St. Augustine & St. John Chrysostom on silence in 15:23a, and St. Jerome on 15:26), Catholic doctrine highlights A–D including the **Romans 11:29 fidelity-to-Israel doctrinal guardrail** (rejecting anti-Jewish contempt, CCC 839–840), and active question sample answers/leader notes; no `/ws` message contains commentary, doctrine, or sample answers, and Participant DOM contains zero instances of these pastoral texts.

### Scenario 5: Leader-only advancement to Section 5 without turn gate

Given Section 4 with any active question
When the Study Leader taps the section advance control (`Begin Closing Prayer →` or `Advance to Section 5 →`)
Then all clients immediately advance to `SECTION 5 OF 5` / `100%` (`SectionPlaceholderScreen` for `section_5_closing`); Participants have zero advance controls and cannot trigger `next_section`; server accepts the transition without requiring any volunteer turn completion.

### Scenario 6: Reconnection and late join hydration

Given a session in Section 4 with a customized question queue and switched active question
When a Participant reloads or a new Participant joins
Then the snapshot carries `discussionState` with the exact `activeQuestionId` and ordered `questions` list, immediately restoring the active question card and queue count on the client.

## Repository Research

### Files Inspected

- `src/shared/study.ts`: `DeepAnalysisSection` (`reflectionQuestions`, `verseCommentary` A–J, `catholicDoctrine` A–D, `youngAdultApplication` A–D, `defaultActiveQuestionIds`).
- `src/shared/session.ts`: `SESSION_PROTOCOL_VERSION = 3`; `SessionStudySummary` (`openingPrayer`, `icebreaker`, `gospelReading`); `PublicLiveSessionSnapshot`; `LeaderCommandType`.
- `src/server/sessionStore.ts`: `next_section` clears `volunteerTurn` when entering `section_4_discussion`; advancement out of Section 4 has no volunteer turn gate.
- `src/client/App.tsx`: routing branch fallback currently renders `SectionPlaceholderScreen` for Section 4; passes `localStudyDocument={studySetup.study}`.
- `src/client/state/sacredStageStore.ts`: `resolveSacredStage({ screen: 'section-4-discussion' })` already maps to `{ stage: 'sanctuary-emblem', accentMode: 'default' }`.
- `DESIGN.md`: Section 4 visual authority (`ux/10. Discussion - Leader.png`, `ux/11. Discussion - Assistant.png`); overrides #1 (Participant terminology) & #4 (avatar initials, status pill padding).

### Existing Patterns To Follow

- Participant-only wire projection + bounded allow-list normalization (`SessionDiscussionContent`).
- Facilitator-only pastoral data (`verseCommentary`, `catholicDoctrine`, `sampleAnswer`, `leaderNote`) sourced strictly from `localStudyDocument`, never transmitted over `/ws`.
- Leader commands dispatched with timing-safe `leaderToken` verification (`switch_question`, `add_question`).
- Server snapshot deep copies with secret/pastoral stripping and full-snapshot broadcasts with `requestId` echo.
- Responsive mobile layouts (`100dvh`, `>= 16px` inputs, `>= 44px` touch targets).

### Current Gaps

- No Section 4 component modules (`SectionPlaceholderScreen` renders).
- `SessionStudySummary` lacks `discussion` content.
- `PublicLiveSessionSnapshot` lacks `discussionState` (`activeQuestionId`, `questions`).
- `sessionStore.ts` lacks `switch_question` and `add_question` leader command handlers.

## Technical Approach

**Privacy Guarantee.** Pastoral leader notes (`verseCommentary`, `catholicDoctrine`, `youngAdultApplication`, `sampleAnswer`, `leaderNote`) stay in `localStudyDocument` on the Study Leader's device. `SessionDiscussionQuestion` exposes only participant-safe fields (`id`, `number`, `prompt`, `category`, `estimatedMinutes`). Neither snapshots nor WebSocket broadcast payloads carry pastoral data.

**State Model & Lifecycle.**
- When entering Section 4 (`next_section` into `section_4_discussion`), server initializes `session.discussionState = { activeQuestionId, questions }` using `defaultActiveQuestionIds` from `session.study.discussion` (or first 3 questions).
- Switching question: Leader sends `switch_question` with `questionId`. Server verifies question exists in `session.discussionState.questions`, updates `activeQuestionId`, and broadcasts `session_updated`.
- Adding question: Leader sends `add_question` with `question: SessionDiscussionQuestion`. Server validates length bounds, appends to `questions`, and broadcasts `session_updated`.
- Advancing out of Section 4: Leader sends `next_section`. Server advances to `section_5_closing` unconditionally ("mercy, not pace, is the goal").

**Protocol (strictly additive at `SESSION_PROTOCOL_VERSION = 3`).**
- `SessionDiscussionQuestion`: `{ id: string, number: number, prompt: string, category: string, estimatedMinutes?: number }`.
- `SessionDiscussionState`: `{ activeQuestionId: string, questions: SessionDiscussionQuestion[] }`.
- `SessionDiscussionContent`: `{ title: string, eyebrow: string, durationLabel: string, defaultActiveQuestionIds: string[], questions: SessionDiscussionQuestion[] }`.
- `SessionStudySummary.discussion?: SessionDiscussionContent | null`.
- `PublicLiveSessionSnapshot.discussionState?: SessionDiscussionState | null`.
- `LeaderCommandType` += `'switch_question' | 'add_question'`.
- `SessionUpdatedCommand` += `'switch_question' | 'add_question'`.

**UI Architecture (`src/client/components/discussion/`).**
- `DiscussionScreen.tsx`: Top-level Section 4 screen; wires `resolveSacredStage({ screen: 'section-4-discussion' })`, renders `SectionProgressHeader`, branches between leader queue and participant card.
- `LeaderQuestionQueue.tsx`: 3-card stack matching `ux/10` with gold active border, number badges, duration, response count placeholders, `+ Add` button, and `Next question →` (morphing to `Begin Closing Prayer →` on final question).
- `ActiveQuestionCard.tsx`: Participant card matching `ux/11` with `QUESTION X OF Y` progress, gold active badge, serif prompt, and locked advance note.
- `AddQuestionModal.tsx`: Bottom sheet allowing promotion from the 12-question bank or custom question entry (`<textarea>` font-size >= 16px).
- `PastoralNotesDrawer.tsx`: Leader-only slide-up sheet containing Commentary A–J (Augustine, Chrysostom, Jerome), Catholic Doctrine notes (including the Romans 11:29 guardrail), and active question sample answers/leader notes from `localStudyDocument`.

## Expected File Changes

- `src/shared/session.ts` — modify (additive: `SessionDiscussionQuestion`, `SessionDiscussionState`, `SessionDiscussionContent`, `toSessionDiscussionContent`, `normalizeSessionDiscussionContent`, `SessionStudySummary.discussion`, `PublicLiveSessionSnapshot.discussionState`, `LeaderCommandType`, `SessionUpdatedCommand`).
- `src/server/sessionStore.ts` — modify (initialize `discussionState` on entry to Section 4; add `switch_question` and `add_question` handlers in `handleLeaderCommand`).
- `src/client/lib/sessionSocket.ts` — modify (additive `sendLeaderCommand` support for `switch_question` and `add_question`).
- `src/client/lib/useLiveSession.ts` — modify (additive actions: `switchQuestion`, `addQuestion`).
- `src/client/App.tsx` — modify (route `section_4_discussion` to `DiscussionScreen`).
- `src/client/components/discussion/*` — create (`DiscussionScreen.tsx`, `LeaderQuestionQueue.tsx`, `ActiveQuestionCard.tsx`, `AddQuestionModal.tsx`, `PastoralNotesDrawer.tsx`).
- `src/client/styles/global.css` — modify (append-only `discussion-*` styles; `>= 16px` inputs, safe-area layout).
- `ARCHITECTURE.md` — update (document Section 4 discussion wire model, components, and privacy boundaries).
- Tests:
  - `tests/unit/discussion-content.test.ts` (new)
  - `tests/unit/discussion-screen.test.tsx` (new)
  - `tests/integration/ws-discussion-question.test.ts` (new)
  - `tests/e2e/section-4-leader-question-queue-notes.spec.ts` (new)

## Documented Compat Edits

1. `tests/e2e/section-3-gospel-reading-turn.spec.ts` (lines 422 and 486): replace `section-placeholder` assertion with `discussion-screen` when advancing into Section 4 (the placeholder was provisional until this feature).

## Visual Design Impact

- UI involved: yes. Follow `DESIGN.md`, `ux/10. Discussion - Leader.png`, and `ux/11. Discussion - Assistant.png`.
- Surface `#171B2E` / `#1F2442` cards with Sacred Gold (`#E2A83E`) border on active question.
- Active question badge: gold rounded square with dark number `#11131F`.
- Queue cards: speech bubble icon with response count placeholder (`0 responses`), clock icon with estimated minutes (`~8 min`).
- Sticky bottom action row on Leader screen: `+ Add` button (`#1F2442`) and Sacred Gold primary pill (`Next question →` / `Begin Closing Prayer →`).
- Footnote: *"Only you decide when to advance — mercy, not pace, is the goal."*
- Form inputs: `<textarea>` and `<input>` in `AddQuestionModal` maintain `font-size >= 16px` (`1rem`).

## Durable Documentation Impact

- `ARCHITECTURE.md`: update — protocol v3 summary gains `SessionDiscussionContent` / `SessionDiscussionState`, `src/client/components/discussion/` module surface, and pastoral privacy guarantees.
- `CONSTRAINTS.md`: not needed — server gating, terminology rules, and secret/pastoral stripping already documented and upheld.
- `AGENTS.md`: not needed — workflow and repo rules unchanged.

## Implementation Plan

1. Shared contract: Add discussion types, projection, and allow-list normalizer in `src/shared/session.ts` + unit tests in `tests/unit/discussion-content.test.ts`.
2. Server & WebSocket: Initialize `discussionState` on Section 4 entry; implement `switch_question` and `add_question` leader commands in `src/server/sessionStore.ts` + integration tests in `tests/integration/ws-discussion-question.test.ts`.
3. Client socket & actions: Add `switchQuestion` and `addQuestion` in `sessionSocket.ts` and `useLiveSession.ts`.
4. Client UI: Build `src/client/components/discussion/` components, wire into `App.tsx`, append styles in `global.css` + unit tests in `tests/unit/discussion-screen.test.tsx`.
5. E2E verification: Add `tests/e2e/section-4-leader-question-queue-notes.spec.ts`, apply Section 3 compat edit, run full verification suites, and update `ARCHITECTURE.md`, `feature_list.json`, and `PROGRESS.md`.

## Implementation Tasks

- [ ] Add `SessionDiscussionQuestion`, `SessionDiscussionState`, `SessionDiscussionContent`, projection, and normalizer in `src/shared/session.ts`.
- [ ] Add `tests/unit/discussion-content.test.ts` verifying projection, bounded normalization, and exclusion of pastoral fields.
- [ ] Implement Section 4 `discussionState` initialization and `switch_question` / `add_question` handlers in `src/server/sessionStore.ts`.
- [ ] Add `tests/integration/ws-discussion-question.test.ts` validating leader-gating, state transitions, question queue sync, and privacy stripping.
- [ ] Extend `sessionSocket.ts` and `useLiveSession.ts` with `switchQuestion` and `addQuestion` actions.
- [ ] Create `src/client/components/discussion/` (`DiscussionScreen.tsx`, `LeaderQuestionQueue.tsx`, `ActiveQuestionCard.tsx`, `AddQuestionModal.tsx`, `PastoralNotesDrawer.tsx`), wire into `App.tsx`, and append CSS in `global.css`.
- [ ] Add `tests/unit/discussion-screen.test.tsx` testing Leader queue, Participant active card, `+ Add` modal, Pastoral Notes drawer, Romans 11:29 note, and zero "Assistant" copy.
- [ ] Apply documented compat edit in `tests/e2e/section-3-gospel-reading-turn.spec.ts`.
- [ ] Add `tests/e2e/section-4-leader-question-queue-notes.spec.ts` with multi-context mobile testing covering Scenarios 1–6.
- [ ] Run `./init.sh` and Playwright E2E suites; update `ARCHITECTURE.md`, `feature_list.json`, and `PROGRESS.md`.

## Verification Plan

- `./init.sh` — non-blocking verification gate (`npm run typecheck`, `npm test`, `npm run build`); must exit 0.
- `PLAYWRIGHT_PORT=3302 npm run test:e2e` — full mobile-chromium 390x844 suite run TWICE consecutively; must exit 0 with zero leaked sessions.
- `grep -rn "Assistant" src/` — must return 0 matches (exit 1).
- Wire privacy verification: assert raw `/ws` frames in integration and E2E tests never contain `verseCommentary`, `catholicDoctrine`, `sampleAnswer`, or `leaderNote`.
- Pastoral content verification: assert Romans 11:29 doctrinal guardrail and patristic notes (Augustine, Chrysostom, Jerome) render in the Leader's PastoralNotesDrawer and are completely absent from Participant DOM.
- Mobile layout verification: assert `<textarea>` and `<input>` in `AddQuestionModal` maintain computed `font-size >= 16px`.

## Evidence To Capture

- Output of `./init.sh` (TypeScript clean across 3 tsconfigs, all Vitest test suites green, Vite production build).
- Output of two consecutive `PLAYWRIGHT_PORT=3302 npm run test:e2e` runs (including `section-4-leader-question-queue-notes.spec.ts` and `ws-room-lifecycle.spec.ts`).
- `grep -rn "Assistant" src/` 0-match exit code.
- Integration wire test assertions proving pastoral fields never cross `/ws`.

## Validator Checklist

- [ ] Implementation stays within this feature's scope (no participant reflection submissions, sharing feed, or prayer card builder).
- [ ] 3 default curated questions render on Study Leader screen matching `ux/10. Discussion - Leader.png`.
- [ ] Active question card renders on Participant screen matching `ux/11. Discussion - Assistant.png`.
- [ ] Tapping `Next question →` or queue cards switches the active question immediately on all connected screens.
- [ ] `+ Add` appends questions from the 12-question bank or custom prompt, updating queue length on all clients.
- [ ] Pastoral notes drawer renders commentary A–J (Augustine, Chrysostom, Jerome), Catholic doctrine notes with Romans 11:29 guardrail, and sample answers for the Study Leader only.
- [ ] Zero pastoral notes, commentary, or sample answers leak to Participants over `/ws` or DOM.
- [ ] Advance to Section 5 succeeds without requiring volunteer turn completion ("mercy, not pace, is the goal").
- [ ] Form inputs enforce `font-size >= 16px` on mobile.
- [ ] `grep -rn "Assistant" src/` returns 0 matches.
- [ ] `./init.sh` exits 0 and E2E passes twice consecutively with zero leaked sessions.

## Open Questions / Unknowns

- On the final question in the queue, `Next question →` morphs into `Begin Closing Prayer →` (triggering `next_section` into Section 5), and a discreet secondary advance action is available at any time to honor *"mercy, not pace, is the goal"*.
- Custom questions added via `+ Add` generate a client-generated UUID id (`custom-${uuid}`) and are assigned the next available sequence number.

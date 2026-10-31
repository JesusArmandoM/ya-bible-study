# Feature Implementation Spec: Participants submit named or anonymous reflections to live Sharing feed

## Source Feature

- `id`: section-4-live-participant-reflections
- `area`: section-4-discussion
- `depends_on`: ["section-4-leader-question-queue-notes"] (accepted)
- `status`: not_started
- `source`: `feature_list.json`

## Goal

In Section 4 of 5 (80%, 'Lord, Help Me Pray'), Participants actively contribute to the Deep Analysis discussion by submitting written reflections to the active prompt (`ux/11. Discussion - Assistant.png`). On the active question card, Participants tap 'I want to respond', opening a modal/sheet with a multi-line reflection textarea (enforcing computed `font-size >= 16px` to prevent iOS Safari auto-zoom), character bounds, and an optional 'Share anonymously' toggle. Submissions broadcast over `/ws` in real time (`command: 'submit_reflection'`), animating into the live 'Sharing' feed on Participant screens and updating per-question response counts on both Participant and Study Leader screens (`ux/10. Discussion - Leader.png`). When anonymous mode is toggled, the server strictly masks `authorDisplayName` as `'Anonymous'`, assigns neutral avatar styling, and completely omits the author's real identity and `memberId` from broadcasts and snapshots. All reflections remain strictly in-memory and are purged upon session conclusion or 4-hour inactivity TTL.

## Non-Goals

- Private 3-prompt "Lord, Help Me" prayer card builder (`For myself`, `For someone I love`, `For the Church/world`), PNG keepsake export, or localStorage saving (deferred to downstream `section-4-lord-help-me-prayer-card`).
- Voluntary single-line prayer card sharing to the live group feed (deferred to `section-4-lord-help-me-prayer-card`).
- Section 5 Closing Prayer completion, summary metrics, or session conclusion (deferred to `section-5-closing-prayer-completion`).
- Moderation, deletion, editing, or emoji reactions to submitted reflections (out of scope for this ephemeral MVP slice).

## Job Story

When the Study Leader opens discussion on a Gospel reflection prompt,
I want Participants to submit named or anonymous personal reflections to the active question,
so the young adult community shares spiritual insights and hears from everyone in real time while maintaining complete privacy when sharing anonymously.

## Users And Permissions

- Study Leader: Views the discussion queue with real-time response counters per question (`ux/10`); switches active questions and controls section advancement; optionally submits reflections.
- Participant: Views active question, live `Sharing` feed, and 'I want to respond' CTA (`ux/11`); submits named or anonymous reflections for the active question; zero question-switching or section-advance controls.
- Anonymous Submitter: Identity is masked server-side; wire broadcast carries `authorDisplayName: 'Anonymous'`, `authorInitials: '?'`, and zero `memberId` or real name leaks.

## Acceptance Scenarios

### Scenario 1: Active question view with empty Sharing feed & 'I want to respond' CTA (Participant)

Given a session in Section 4 on active question 1 (`q-6`)
When a Participant views `section_4_discussion`
Then the screen renders `QUESTION 1 OF 3` / `80%`, the prompt card, a `SHARING` section header with initial empty state ("No responses yet. Be the first to share your reflection."), the primary Sacred Gold `'I want to respond'` button, and the locked advance note (`Only the leader decides when to advance`).

### Scenario 2: Submitting a named reflection updates feed and response counts in real time

Given Participant "Mary Lopez" and the Study Leader connected in Section 4 on Question 1
When Mary taps `'I want to respond'`, enters "She humbled herself before Jesus and trusted His mercy was enough.", leaves anonymous untoggled, and submits
Then the server validates and stores the reflection, broadcasting `session_updated` (`command: 'submit_reflection'`); Mary's reflection immediately animates into the `Sharing` feed on all Participant screens showing avatar (`ML`), author name "Mary Lopez", timestamp ("Just now" / "20s ago"), and text; and the response counter updates to `1 response` on Question 1 on both Participant and Study Leader screens (`LeaderQuestionQueue`).

### Scenario 3: Submitting an anonymous reflection masks author identity across wire and DOM

Given Participant "Sara Castillo" in Section 4 on Question 1
When Sara taps `'I want to respond'`, enters "She kept praying, even when Jesus seemed silent.", checks "Share anonymously", and submits
Then the server sets `isAnonymous: true`, `authorDisplayName: 'Anonymous'`, `authorInitials: '?'`, and broadcasts `session_updated`; all clients see author "Anonymous" with avatar `?` in the feed; inspecting raw `/ws` frames confirms neither "Sara Castillo" nor Sara's `memberId` appears anywhere in the reflection object; Question 1 counter increments to `2 responses`.

### Scenario 4: Switching questions partitions reflections per question

Given Question 1 has 2 reflections and Question 2 has 0 reflections
When the Study Leader switches the active question to Question 2 (`q-5`)
Then Participant screens transition to Question 2; the `Sharing` feed displays Question 2's empty state; Question 2 counter shows 0 responses (or `Active`) while Question 1 card on the Leader queue retains `2 responses`; switching back to Question 1 immediately restores its 2 reflections.

### Scenario 5: Mobile ergonomics and reflection input bounds

Given a Participant opening the `'I want to respond'` modal
When interacting with the form
Then the `<textarea>` enforces computed `font-size >= 16px` (`1rem`) to prevent iOS Safari auto-zoom; submitting empty or whitespace-only text is disabled; character count is tracked up to 1000 characters; submitting resets the form and closes the sheet.

### Scenario 6: Reconnection and late-join hydration

Given a session with existing named and anonymous reflections
When a Participant reloads or a new Participant joins
Then the initial snapshot carries `discussionState.reflections` with identical masked anonymous fields, restoring the `Sharing` feed and accurate response counters immediately.

## Repository Research

### Files Inspected

- `src/shared/session.ts`: `SessionDiscussionState` (`activeQuestionId`, `questions`); `SessionUpdatedCommand`; `ClientWsMessage`; `PublicLiveSessionSnapshot`.
- `src/server/sessionStore.ts`: `handleMessage`, `handleLeaderCommand`, `handleTurnCommand`, `toPublicDiscussionState`, in-memory `sessions` Map.
- `src/client/lib/sessionSocket.ts` & `useLiveSession.ts`: WebSocket client dispatch and reactive session state hook.
- `src/client/components/discussion/DiscussionScreen.tsx`: top-level Section 4 screen routing leader queue vs participant view.
- `src/client/components/discussion/LeaderQuestionQueue.tsx`: 3-card stack with speech bubble meta indicators currently hardcoded to `'0 responses'`.
- `src/client/components/discussion/ActiveQuestionCard.tsx`: participant card with `QUESTION X OF Y` and locked note pill.
- `src/client/styles/global.css`: Section 4 discussion layout, cards, and modal styling.
- `DESIGN.md`: Section 4 visual authority (`ux/10. Discussion - Leader.png`, `ux/11. Discussion - Assistant.png`); override #1 (Participant terminology); Sacred Gold CTA `#E2A83E`.
- `CONSTRAINTS.md`: Rule 3 (Participant terminology), Rule 5 (server-side gating), Rule 6 (ephemeral in-memory reflections), Rule 7 (`font-size >= 16px`).

### Existing Patterns To Follow

- Additive wire schema at `SESSION_PROTOCOL_VERSION = 3` with zero wire breaks for existing commands.
- Server-side identity verification via socket binding (`this.socketBindings.get(socket)`).
- Strict author masking at the server layer: anonymous reflections never store or serialize `authorMemberId` or the real display name on public projections.
- Full snapshot broadcast with `requestId` echo on `session_updated`.
- Clean spring animation with `motion/react` and `usePrefersReducedMotion`.

### Current Gaps

- `SessionDiscussionState` lacks `reflections: SessionReflection[]`.
- `ClientWsMessage` lacks `submit_reflection` message type.
- `sessionStore.ts` lacks `handleSubmitReflection` handler.
- `src/client/components/discussion/` lacks `ReflectionFeed.tsx`, `ReflectionCard.tsx`, and `SubmitReflectionModal.tsx`.
- `ActiveQuestionCard.tsx` does not render reflection feed or `'I want to respond'` button.
- `LeaderQuestionQueue.tsx` shows static response placeholder rather than dynamic counts.

## Technical Approach

**Wire Protocol & Shared Models (Protocol v3 Additive).**
```ts
export interface SessionReflection {
  id: string;
  questionId: string;
  authorDisplayName: string;
  authorInitials: string;
  avatarPalette: AvatarPalette;
  content: string;
  createdAt: string;
  isAnonymous: boolean;
}
```
- Inbound: `{ type: 'submit_reflection', sessionCode: string, memberId: string, questionId: string, content: string, isAnonymous?: boolean, requestId?: string }`.
- Outbound: `session_updated` (`command: 'submit_reflection'`).
- `SessionDiscussionState`: `{ activeQuestionId: string, questions: SessionDiscussionQuestion[], reflections: SessionReflection[] }`.

**Server Privacy & Masking Invariants.**
- On `submit_reflection`: verify bound socket identity matches `memberId`.
- Validate `session.status === 'in_progress'`, `currentSectionId === 'section_4_discussion'`, and `questionId` exists in queue.
- Normalize `content`: trimmed string, 1 to 1000 characters.
- If `isAnonymous === true`: server sets `authorDisplayName = 'Anonymous'`, `authorInitials = '?'`, `avatarPalette = 'indigo'`, and `isAnonymous = true`. The participant's real `displayName` and `memberId` are **never** attached to the public reflection object.
- In-memory only: reflections are stored in `session.discussionState.reflections` and purged when the session ends or sweeps.

**Client UI Architecture (`src/client/components/discussion/`).**
- `ReflectionCard.tsx`: Individual reflection card matching `ux/11` with avatar circle (gradient or anonymous `?`), author name (`Mary Lopez` or `Anonymous`), relative time (`20s ago`), and italic reflection body.
- `ReflectionFeed.tsx`: Renders `SHARING` section label with count badge, list of `ReflectionCard`s ordered reverse-chronologically (newest first), and empty state.
- `SubmitReflectionModal.tsx`: Slide-up sheet / bottom modal; active prompt context; multi-line `<textarea>` with `font-size >= 16px` (`1rem`); character counter (`0 / 1000`); "Share anonymously" toggle with privacy note; Sacred Gold submit button (`Submit reflection`).
- `ActiveQuestionCard.tsx`: Integrated feed container, primary Sacred Gold `'I want to respond'` CTA pill with speech bubble icon above the locked advance pill.
- `LeaderQuestionQueue.tsx`: Calculates response count for each question (`reflections.filter(r => r.questionId === q.id).length`); displays `${count} ${count === 1 ? 'response' : 'responses'}` (or `'Active'` if active and 0 responses).

## Expected File Changes

- `src/shared/session.ts` — modify: add `SessionReflection`, update `SessionDiscussionState`, add `submit_reflection` to `ClientWsMessage` and `SessionUpdatedCommand`, add `normalizeReflectionContent`.
- `src/server/sessionStore.ts` — modify: initialize `reflections: []` in `discussionState`, implement `handleSubmitReflection`, deep-copy reflections in `toPublicDiscussionState`.
- `src/client/lib/sessionSocket.ts` — modify: add `submitReflection` client transport helper.
- `src/client/lib/useLiveSession.ts` — modify: expose `submitReflection` room action.
- `src/client/App.tsx` — modify: pass `onSubmitReflection` into `DiscussionScreen`.
- `src/client/components/discussion/ReflectionCard.tsx` — create: single reflection card with avatar, author, time, content.
- `src/client/components/discussion/ReflectionFeed.tsx` — create: live sharing feed with newest-first ordering and empty state.
- `src/client/components/discussion/SubmitReflectionModal.tsx` — create: modal with `>= 16px` textarea, char count, and anonymous toggle.
- `src/client/components/discussion/ActiveQuestionCard.tsx` — modify: embed feed and 'I want to respond' button.
- `src/client/components/discussion/LeaderQuestionQueue.tsx` — modify: dynamic per-question response counters.
- `src/client/components/discussion/DiscussionScreen.tsx` — modify: manage modal open state, wire submit handler, pass reflections.
- `src/client/styles/global.css` — modify: append-only reflection feed, card, modal, and anonymous toggle styles.
- `ARCHITECTURE.md` — update: document reflection wire protocol, privacy masking invariants, and component boundaries.
- Tests:
  - `tests/unit/discussion-reflection.test.ts` (new)
  - `tests/unit/reflection-components.test.tsx` (new)
  - `tests/integration/ws-discussion-reflection.test.ts` (new)
  - `tests/e2e/section-4-live-participant-reflections.spec.ts` (new)

## Visual Design Impact

- UI involved: yes. Follow `DESIGN.md`, `ux/11. Discussion - Assistant.png`, and `ux/10. Discussion - Leader.png`.
- Surface `#171B2E` cards with `1px solid rgba(255,255,255,0.09)`.
- Avatars: 38px circle with centered initials on gradient palette; anonymous avatar displays `?` on neutral indigo/slate background.
- Primary CTA: Sacred Gold (`#E2A83E`) pill button `'I want to respond'` with speech bubble icon.
- Form inputs: `<textarea>` inside modal strictly maintains `font-size >= 16px` (`1rem`) to prevent iOS Safari auto-zoom.
- Anonymous toggle: clean checkbox/toggle row with label and secondary reassurance ("Your name and avatar will be hidden").
- Transitions: reflections enter feed with `AnimatePresence` and `layout` spring motion; instant on `prefers-reduced-motion`.

## Durable Documentation Impact

- `ARCHITECTURE.md`: update — document `SessionReflection`, `submit_reflection` wire command, ephemeral memory lifecycle, and privacy masking guarantees.
- `CONSTRAINTS.md`: not needed — server gating, terminology rules, ephemeral memory, and `>= 16px` inputs already documented.
- `AGENTS.md`: not needed — workflow and repo operating rules unchanged.

## Implementation Plan

1. **Shared contract & validation**: Add `SessionReflection`, update `SessionDiscussionState`, add `submit_reflection` types and `normalizeReflectionContent` in `src/shared/session.ts` + unit tests in `tests/unit/discussion-reflection.test.ts`.
2. **Server & WebSocket privacy**: Implement `handleSubmitReflection` in `src/server/sessionStore.ts` with server-side author masking, socket identity verification, and deep-copy snapshot projection + integration tests in `tests/integration/ws-discussion-reflection.test.ts`.
3. **Client socket & action hook**: Add `submitReflection` in `src/client/lib/sessionSocket.ts` and `src/client/lib/useLiveSession.ts`.
4. **Client UI components**: Build `ReflectionCard.tsx`, `ReflectionFeed.tsx`, and `SubmitReflectionModal.tsx`; update `ActiveQuestionCard.tsx`, `LeaderQuestionQueue.tsx`, `DiscussionScreen.tsx`, and `global.css` + unit tests in `tests/unit/reflection-components.test.tsx`.
5. **E2E verification & documentation**: Add multi-client Playwright test `tests/e2e/section-4-live-participant-reflections.spec.ts` verifying Scenarios 1–6, wire privacy assertions, run `./init.sh` and Playwright suites, and update `ARCHITECTURE.md`, `feature_list.json`, and `PROGRESS.md`.

## Implementation Tasks

- [ ] Add `SessionReflection`, `SessionDiscussionState.reflections`, `ClientWsMessage.submit_reflection`, and `normalizeReflectionContent` in `src/shared/session.ts`.
- [ ] Add `tests/unit/discussion-reflection.test.ts` validating reflection normalization, length bounds, whitespace preservation, and author masking rules.
- [ ] Implement `handleSubmitReflection` and snapshot deep-copy in `src/server/sessionStore.ts` with author masking (`'Anonymous'`, `'?'`) and zero `memberId` leak.
- [ ] Add `tests/integration/ws-discussion-reflection.test.ts` validating socket-binding auth, state gating, real-time broadcasts, and raw wire privacy.
- [ ] Add `submitReflection` transport method to `sessionSocket.ts` and `useLiveSession.ts`.
- [ ] Create `ReflectionCard.tsx`, `ReflectionFeed.tsx`, and `SubmitReflectionModal.tsx` under `src/client/components/discussion/`.
- [ ] Update `ActiveQuestionCard.tsx` to render the `Sharing` feed and `'I want to respond'` button; update `LeaderQuestionQueue.tsx` with dynamic response counts; connect handlers in `DiscussionScreen.tsx` and `App.tsx`.
- [ ] Append reflection CSS styles in `src/client/styles/global.css` (enforcing textarea `font-size >= 16px`, safe-area layout, touch targets).
- [ ] Add `tests/unit/reflection-components.test.tsx` verifying card rendering, anonymous masking, modal validation, and zero "Assistant" copy.
- [ ] Add `tests/e2e/section-4-live-participant-reflections.spec.ts` covering multi-client named + anonymous reflection submissions, live feed updates, wire privacy assertions, per-question response counters, question switching, and reload hydration.
- [ ] Run `./init.sh` and Playwright test suite twice consecutively; record results in `feature_list.json` and `PROGRESS.md`.
- [ ] Update `ARCHITECTURE.md` with Section 4 reflection models, privacy boundaries, and component surfaces.

## Verification Plan

- `./init.sh` — non-blocking verification gate (`npm run typecheck`, `npm test`, `npm run build`); must exit 0.
- `PLAYWRIGHT_PORT=3302 npm run test:e2e` — full mobile-chromium 390x844 suite run TWICE consecutively; must exit 0 with zero leaked sessions.
- `grep -rn "Assistant" src/` — must return 0 matches (exit code 1).
- Wire privacy verification: assert raw `/ws` frames for anonymous reflections contain `authorDisplayName: 'Anonymous'`, `authorInitials: '?'`, and NEVER contain the participant's real display name or `memberId`.
- Mobile layout verification: assert `<textarea>` in `SubmitReflectionModal` maintains computed `font-size >= 16px`.

## Evidence To Capture

- Command output of `./init.sh` (clean typecheck, Vitest unit/integration suites, production build).
- Command output of two consecutive `PLAYWRIGHT_PORT=3302 npm run test:e2e` runs.
- Exit code 1 from `grep -rn "Assistant" src/`.
- Integration test assertion logs confirming raw wire anonymity.

## Validator Checklist

- [ ] Implementation stays within this feature's scope (no prayer card builder, PNG export, or Section 5 completion).
- [ ] Participants can tap 'I want to respond', type a reflection, and submit.
- [ ] Live 'Sharing' feed animates reflections with avatar, author, relative time, and text matching `ux/11. Discussion - Assistant.png`.
- [ ] 'Share anonymously' toggle masks author display name to 'Anonymous' and initials to '?' on all client screens.
- [ ] Server never leaks real displayName or memberId of anonymous submitters over `/ws` or snapshots.
- [ ] Response counters update accurately on both Participant screen and Study Leader queue cards (`ux/10. Discussion - Leader.png`).
- [ ] Textarea enforces computed `font-size >= 16px` (`1rem`) on mobile viewports.
- [ ] Reflections are partitioned per question when Study Leader switches questions.
- [ ] Reconnecting or late-joining clients hydrate reflections and response counts cleanly.
- [ ] `grep -rn "Assistant" src/` returns 0 matches.
- [ ] `./init.sh` exits 0 and Playwright E2E passes twice consecutively with zero leaked sessions.

## Open Questions / Unknowns

- Reflections are presented in reverse-chronological order (newest first) matching `ux/11` (where the more recent 20s reflection is stacked above the 35s reflection).
- When a question has 0 reflections, `LeaderQuestionQueue` displays `'Active'` for the currently active card and `'0 responses'` for inactive cards. When count > 0, it displays `${count} ${count === 1 ? 'response' : 'responses'}`.

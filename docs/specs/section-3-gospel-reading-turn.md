# Feature Implementation Spec: Gospel Reading presents sole Gospel passage with gated Done Reading turn

## Source Feature

- `id`: section-3-gospel-reading-turn
- `area`: section-3-reading
- `depends_on`: ["random-volunteer-picker-countdown", "section-2-icebreaker-flow"] (both accepted)
- `status`: not_started
- `source`: `feature_list.json`

## Goal

When the Study Leader advances out of Section 2, every client lands on Section 3 (Gospel Reading, `SECTION 3 OF 5` / `60%`). Both roles view ONLY the Gospel Reading (full Matthew 15:21–28 passage for the seed study) without multi-reading Mass tabs (no Old Testament, Psalm, or Epistle). The scrollable Scripture card stacks cleanly above the action orb with zero overlap on mobile viewports (≥ 375x812). Participants tap the indigo "Read aloud" orb to volunteer; the Study Leader selects a reader from raised hands, the avatar roster strip, or the 30-second "Random" picker. Only the chosen reader receives the "YOU WERE CHOSEN" view with exclusive "Done Reading" button, and tapping "Done Reading" (or leader override) unlocks the leader's locked advance bar into the active gold CTA to enter Section 4.

## Non-Goals

- Multi-reading Mass sequence tabs (Old Testament / Psalm / Epistle) in the Section 3 reading flow (strict Gospel-only invariant per `CONTEXT.md` and `CONSTRAINTS.md`).
- Section 4 Deep Analysis questions, reflection feeds, or commentary drawers (advancing past Section 3 lands on `SectionPlaceholderScreen` for `section_4_discussion`).
- Audio streaming, TTS, or speech recording; the reading is live oral proclamation in the room.
- External Bible API calls (Scripture is parsed deterministically into `StudyDocument`).

## Job Story

When the icebreaker discussion concludes and the Study Leader begins the Gospel Reading,
I want both roles to see only the Gospel passage with interactive volunteering ("Read aloud", roster pick, or "Random") and exclusive "Done Reading" completion,
so the chosen reader can proclaim the full Gospel aloud for the group while section advancement remains gated until the reading is done.

## Users And Permissions

- Study Leader: sees Gospel summary card, facilitator-only liturgical background note (`leaderLiturgicalContextNote` from `localStudyDocument`), reader selection controls (`Choose reader`, avatar roster strip, and violet "Random" picker), and locked advance bar (`Waiting for reader to finish to advance` with discreet leader override). Exclusively triggers Section 4 advance.
- Chosen Reader: receives exclusive `YOU WERE CHOSEN` view, full scrollable Gospel text, and exclusive gold `Done Reading` CTA (`complete_turn`).
- Bystander Participants: view full scrollable Gospel text, indigo `Read aloud` orb before selection, active reader note (`{Name} is reading aloud`) during reading, and locked info pill (`The leader advances when finished`). Zero advance or `Done Reading` controls.

## Acceptance Scenarios

### Scenario 1: Sole Gospel Reading presentation (both roles)

Given a session advanced from Section 2 into Section 3
When clients render `section_3_reading`
Then both roles display `SECTION 3 OF 5` / `60%` (`SectionProgressHeader`), citation `Matthew 15:21–28`, and title `Gospel Reading`; the main reading contains ONLY the Gospel text (zero tabs or headings for Isaiah, Psalm, or Romans); exactly one `<canvas>` remains mounted and `grep -rn "Assistant" src/` returns 0 matches.

### Scenario 2: Non-overlapping mobile layout on 375x812

Given a Participant on a mobile viewport (375x812) in Section 3
When the Scripture card and indigo "Read aloud" orb render
Then the Scripture card is cleanly scrollable with its own bounding box stacked above the "Read aloud" orb with positive vertical separation (bounding box bottoms do not intersect), obeying DESIGN.md override #4.

### Scenario 3: Volunteering via indigo "Read aloud" orb & avatar roster strip

Given connected Participants and the Study Leader in Section 3
When a Participant taps the indigo "Read aloud" orb
Then their hand is registered (`raise_hand`), the orb transitions with 0ms optimistic ripple feedback to the active volunteered state, the leader's reader card counter increments, and the Study Leader can tap either a raised queue row or an avatar in the roster strip to assign that Participant via `choose_volunteer`.

### Scenario 4: Random selection integration in Section 3

Given an open Gospel Reading turn in Section 3
When the Study Leader clicks "Random"
Then the 30-second countdown panel appears with spinning polyhedron on all screens, the leader can click "Retry" to re-roll or "Confirm selection" to assign the candidate, and confirming assigns the chosen reader to the Gospel Reading turn.

### Scenario 5: Exclusive "Done Reading" turn completion & gated Section 4 advance

Given a chosen reader assigned in Section 3
When clients render the active reading state
Then ONLY the chosen reader sees the "YOU WERE CHOSEN" view with the full scrollable Gospel text and gold `Done Reading` button; bystander Participants see who is reading with zero `Done` button; the Study Leader's bottom bar reads `Reading proceeds: Waiting for reader to finish to advance` with `next_section` rejected by the server; tapping `Done Reading` broadcasts `complete_turn`, and the Leader's locked bar morphs into `Begin Discussion →` which advances all clients to `SECTION 4 OF 5` / `80%`.

### Scenario 6: Facilitator liturgical context privacy, reconnect, & leader override

Given the default study or an uploaded study with `leaderLiturgicalContextNote`
When wire snapshots are broadcast and screens render
Then `leaderLiturgicalContextNote` is visible only on the Study Leader's screen (sourced from `localStudyDocument`) and never appears in `/ws` frames or Participant DOM; if the chosen reader disconnects or reloads, the chosen state rehydrates on reconnect, or the leader can use `Mark done (Leader override)` to unlock advancement.

## Repository Research

### Files Inspected

- `src/shared/study.ts`: `GospelReadingSection` (`citation`, `liturgicalLabel`, `fullText`, `verses: GospelVerse[]`, `keyLines`, `leaderLiturgicalContextNote` facilitator note).
- `src/shared/session.ts`: `SESSION_PROTOCOL_VERSION = 3`; `SessionOpeningPrayerContent` and `SessionIcebreakerContent` precedents; `VolunteerTurnState` with `volunteerTurnModeForSection('section_3_reading')` returning `'gated_reading'`; `eligibleRandomCandidateIds`; `handleTurnCommand` socket binding.
- `src/server/sessionStore.ts`: `next_section` advancing out of Section 1 gated on `volunteerTurn?.completedAt != null`; Section 2 open-share turn creation; `choose_volunteer` and `override_turn` currently gated to `section_1_prayer`; `complete_turn` in `handleTurnCommand` currently gated to `section_1_prayer`; `raise_hand`/`lower_hand` gated to Section 1 & 2; `handleRandomSelectionCommand` already section-neutral for non-open_share turns.
- `src/client/App.tsx`: routing branch between `IcebreakerScreen` and `SectionPlaceholderScreen`.
- `src/client/components/prayer/OpeningPrayerScreen.tsx` & `ChosenVolunteerView.tsx`: chosen volunteer UX pattern (`YOU WERE CHOSEN`, `completeTurn`, `overrideTurn`, `lastSessionCommand`).
- `src/client/components/random/RandomSelectionPanel.tsx`: section-neutral 30s countdown component.
- `src/client/state/sacredStageStore.ts`: `resolveSacredStage({ screen: 'section-3-gospel' })` already maps to `gospel-codex`, transitioning to `chosen-aura` on `isChosenVolunteer: true` and `random-polyhedron` on `isRandomizing: true`.
- `DESIGN.md`: overrides #2 (Gospel-only main reading; "Waiting for reader to finish to advance") and #4 (center initials in avatars; horizontal padding on status pills; non-overlapping Scripture card and Read aloud orb).
- `ux/7. Reading - Leader.png` and `ux/8. Reading - Assistant.png`: visual authorities.

### Existing Patterns To Follow

- Participant-only wire projection + bounded allow-list normalization (`SessionGospelReadingContent`).
- Facilitator-only note (`leaderLiturgicalContextNote`) sourced from `localStudyDocument`, never transmitted over `/ws`.
- Server-enforced gating on `next_section` out of Section 3 requiring `session.volunteerTurn?.completedAt != null`.
- 4-step `complete_turn` server validation (socket binding -> state gate -> selectedMemberId check -> idempotent applyCompleteTurn).
- Spring press feedback on buttons (`scale: 0.96`), `AnimatePresence` + `layout` morphing into gold CTA.
- E2E hardening: 60s test budget, 15s expect timeout, never-throwing bounded `closeLiveSession`, `Promise.allSettled` in `finally`.

### Current Gaps

- No Section 3 components (`SectionPlaceholderScreen` currently renders).
- `SessionStudySummary` lacks `gospelReading` wire content.
- Server turn commands (`choose_volunteer`, `override_turn`, `complete_turn`, `raise_hand`, `lower_hand`) and `next_section` gating are not yet widened to `section_3_reading`.
- Advancing into Section 3 currently sets `volunteerTurn = null` instead of creating the `gated_reading` turn.

## Technical Approach

**Privacy Decision.** Define `SessionGospelReadingContent` = `{ title, eyebrow, durationLabel, citation, liturgicalLabel, fullText, verses }` on `SessionStudySummary.gospelReading`. `leaderLiturgicalContextNote` NEVER crosses `/ws` (excluded from projection and allow-list normalizer). The Study Leader screen renders `localStudyDocument.gospelReading.leaderLiturgicalContextNote` locally.

**State Model & Turn Lifecycle.**
- Advancing from Section 2 into Section 3 (`next_section`): server assigns `session.volunteerTurn = createVolunteerTurnForSection('section_3_reading')` (`mode: 'gated_reading'`, empty `raisedHands`, all candidate/selected/completed fields `null`).
- Hand raises: participants tap the indigo orb (`raise_hand` / `lower_hand`). Server widens `isHandRaiseSection` to include `section_3_reading`.
- Reader selection: leader can choose via `choose_volunteer` (from raised hands or clicking an avatar in the roster strip) or trigger `pick_random` -> `confirm_random` (already section-neutral).
- Reading completion: chosen reader taps `Done Reading` (`complete_turn`). Server verifies socket binding matches `volunteerTurn.selectedMemberId` and sets `completedAt`.
- Leader override: `override_turn` widened to `section_3_reading` allowing leader to complete the turn if the reader disconnects.
- Section 4 advancement: `next_section` out of Section 3 requires `session.volunteerTurn?.completedAt != null`, rejecting premature advance with `INVALID_STATE_TRANSITION` (`'The Gospel Reading turn must be completed before advancing.'`). Advancing into Section 4 sets `session.volunteerTurn = null`.

**Protocol.** Additive at `SESSION_PROTOCOL_VERSION = 3`:
- `SessionGospelReadingContent`, `toSessionGospelReadingContent(section)`, `normalizeSessionGospelReadingContent(raw)`.
- `SESSION_STUDY_SUMMARY_MAX_GOSPEL_TEXT_LENGTH = 10_000`.
- `SessionStudySummary.gospelReading?: SessionGospelReadingContent | null`.
- No new commands or message types needed; all turn commands reuse existing protocol v3 framing.

**UI Architecture.** New `src/client/components/reading/`:
- `GospelReadingScreen.tsx`: Top-level Section 3 screen, wires `resolveSacredStage({ screen: 'section-3-gospel', isChosenVolunteer, isRandomizing })`.
- `ScriptureCard.tsx`: Displays Gospel citation, liturgical label, and full scrollable Gospel text with verse numbers. Stacks cleanly above the orb with scroll container so mobile viewport height (≥ 375x812) never overlaps the orb.
- `ReadAloudOrb.tsx`: Sanctuary indigo (`#6E75F5`) concentric ring orb with open-book SVG icon, optimistic toggle, and haptic feedback.
- `LeaderReaderCard.tsx`: Reader status, raised counter, `Choose reader`, and violet `Random` button.
- `ParticipantRosterStrip.tsx`: Avatar circles with centered 2-letter initials (override #4); clicking selects reader.
- `ReadingDoneView.tsx`: `YOU WERE CHOSEN` view (override #4 padding), embeds `ScriptureCard`, and gold `Done Reading` button.
- Leader advance zone: locked bar (`Reading proceeds: Waiting for reader to finish to advance` with override) morphing on completion into gold `Begin Discussion →`.

## Expected File Changes

- `src/shared/session.ts` — modify (additive: `SessionGospelReadingContent`, `SESSION_STUDY_SUMMARY_MAX_GOSPEL_TEXT_LENGTH`, `toSessionGospelReadingContent`, `normalizeSessionGospelReadingContent`, `SessionStudySummary.gospelReading` wiring).
- `src/server/sessionStore.ts` — modify (widen `choose_volunteer`, `override_turn`, `complete_turn`, `raise_hand`, `lower_hand` state gates to include `section_3_reading`; create `section_3_reading` turn on `next_section` entry; enforce Section 3 completion gate on `next_section` advance).
- `src/client/App.tsx` — modify (route `section_3_reading` to `GospelReadingScreen`).
- `src/client/components/reading/*` — create (`GospelReadingScreen.tsx`, `ScriptureCard.tsx`, `ReadAloudOrb.tsx`, `LeaderReaderCard.tsx`, `ParticipantRosterStrip.tsx`, `ReadingDoneView.tsx`).
- `src/client/styles/global.css` — modify (append-only `reading-*`, `scripture-card-*`, `read-aloud-orb-*` styles).
- `ARCHITECTURE.md` — update (document Section 3 Gospel Reading surface, protocol additions, and gate rules).
- Tests:
  - `tests/unit/gospel-reading-content.test.ts` (new)
  - `tests/unit/gospel-reading-screen.test.tsx` (new)
  - `tests/integration/ws-gospel-reading-turn.test.ts` (new)
  - `tests/e2e/section-3-gospel-reading-turn.spec.ts` (new)

### Documented Compat Edits

1. `tests/integration/ws-icebreaker-hand-raise.test.ts` (~lines 406–416): after `next_section` into `section_3_reading`, `volunteerTurn` is now the fresh `{ sectionId: 'section_3_reading', mode: 'gated_reading', raisedHands: [], ... }` turn (replace `toBeNull()`), and hand raises are accepted in Section 3; the `INVALID_STATE_TRANSITION` rejection moves to Section 4.
2. `tests/e2e/section-2-icebreaker.spec.ts` (~line 400): replace `section-placeholder` assertion with `gospel-reading-screen` when entering Section 3.
3. `tests/e2e/random-volunteer-picker-countdown.spec.ts` (~line 315): update Section 2 placeholder expectation to `icebreaker-screen` (wave merge alignment).

## Visual Design Impact

- UI involved: yes. Follow `DESIGN.md` (overrides #2 & #4), `ux/7. Reading - Leader.png`, and `ux/8. Reading - Assistant.png`.
- Color tokens: Sanctuary Indigo (`#6E75F5`) for Read aloud orb, Liturgical Violet (`#B855C8`) for Random button, Sacred Gold (`#E2A83E`) for primary CTAs (`Done Reading`, `Begin Discussion →`).
- Layout: Mobile single-column frame with scrollable ScriptureCard positioned strictly above the action orb on 375x812 viewports.
- Avatar initials centered without clipping per override #4.
- `YOU WERE CHOSEN` pill with sufficient horizontal padding per override #4.
- No new design concepts required; authoritative mockups in `ux/7` and `ux/8`.

## Durable Documentation Impact

- `ARCHITECTURE.md`: update — protocol v3 summary gains `SessionGospelReadingContent`/`SessionStudySummary.gospelReading`, Section 3 Gospel Reading component surface under `src/client/components/reading/`, and server gating rules.
- `CONSTRAINTS.md`: not needed — Section 3 Gospel-only invariant, server-side gating, and terminology rules already documented and upheld.
- `AGENTS.md`: not needed — workflow and repo rules unchanged.
- `docs/domain-model.md`: not needed — Gospel Reading turn lifecycle matches existing domain model.

## Implementation Plan

1. Shared contract: `src/shared/session.ts` additions + unit test suite `tests/unit/gospel-reading-content.test.ts`.
2. Server gating & lifecycle: widen turn commands and advancement gates in `src/server/sessionStore.ts` + integration suite `tests/integration/ws-gospel-reading-turn.test.ts` + compat edit in `ws-icebreaker-hand-raise.test.ts`.
3. Client components: build `src/client/components/reading/` modules, add `App.tsx` routing branch, append styles in `global.css` + unit test suite `tests/unit/gospel-reading-screen.test.tsx`.
4. E2E verification: add `tests/e2e/section-3-gospel-reading-turn.spec.ts` with multi-context mobile testing + compat edits; verify full suite; update `ARCHITECTURE.md`, `feature_list.json`, and `PROGRESS.md`.

## Implementation Tasks

- [ ] Add `SessionGospelReadingContent`, max length constant, `toSessionGospelReadingContent`, `normalizeSessionGospelReadingContent`, and `SessionStudySummary.gospelReading` wiring in `src/shared/session.ts`.
- [ ] Add `tests/unit/gospel-reading-content.test.ts` verifying projection, bounded normalization, and pastoral field exclusion.
- [ ] In `src/server/sessionStore.ts`, create the `section_3_reading` turn in `next_section`, enforce completion gate before advancing out of Section 3, and widen `choose_volunteer`, `override_turn`, `complete_turn`, `raise_hand`, and `lower_hand` gates to include `section_3_reading`.
- [ ] Add `tests/integration/ws-gospel-reading-turn.test.ts` testing the complete Section 3 turn lifecycle over `/ws` and apply the documented compat edit in `ws-icebreaker-hand-raise.test.ts`.
- [ ] Create `src/client/components/reading/` (`GospelReadingScreen.tsx`, `ScriptureCard.tsx`, `ReadAloudOrb.tsx`, `LeaderReaderCard.tsx`, `ParticipantRosterStrip.tsx`, `ReadingDoneView.tsx`), reusing `SectionProgressHeader` and `RandomSelectionPanel`.
- [ ] Wire `GospelReadingScreen` into `src/client/App.tsx` and append styles in `src/client/styles/global.css`.
- [ ] Add `tests/unit/gospel-reading-screen.test.tsx` verifying both roles, non-overlapping layout, responsive constraints, and zero "Assistant" copy.
- [ ] Add `tests/e2e/section-3-gospel-reading-turn.spec.ts` covering Scenarios 1–6 on mobile viewports with hardened cleanup, and apply the two e2e compat edits.
- [ ] Update `ARCHITECTURE.md`, run all verification gates (`./init.sh`, `test:e2e`), and record evidence in `feature_list.json` and `PROGRESS.md`.

## Verification Plan

- `./init.sh` — runs non-blocking verification (`npm run typecheck`, `npm test`, `npm run build`); must exit 0 with all unit and integration tests passing.
- `PLAYWRIGHT_PORT=3302 npm run test:e2e` — full mobile-chromium 390x844 / 375x812 suite, run TWICE consecutively; must exit 0 both runs with `ws-room-lifecycle.spec.ts` green (zero leaked sessions).
- `grep -rn "Assistant" src/` — must return 0 matches (exit 1).
- Gospel-only verification: assert Participant and Leader DOM in Section 3 contains only Matthew 15:21–28 with zero First Reading, Second Reading, Psalm, Isaiah, or Romans tabs.
- Layout verification: Playwright test asserts bounding boxes of Scripture card and "Read aloud" orb do not overlap on a 375x812 viewport.
- Wire privacy verification: assert raw `/ws` frames in integration tests never contain `leaderLiturgicalContextNote`, `leaderPin`, `leaderToken`, or `reconnectToken`.

## Evidence To Capture

- Output of `./init.sh` (Vitest test/file counts, TypeScript clean status, Vite production build).
- Output of two consecutive `PLAYWRIGHT_PORT=3302 npm run test:e2e` runs (including `section-3-gospel-reading-turn.spec.ts` and `ws-room-lifecycle.spec.ts`).
- `grep -rn "Assistant" src/` exit code and 0-match confirmation.
- Documented compat edits with justification.

## Validator Checklist

- [ ] Target behavior implemented strictly within Section 3 scope (no Section 4 discussion/reflections implementation).
- [ ] Only the Gospel Reading is presented as the main reading in Section 3 (no multi-reading Mass tabs).
- [ ] Scripture card and "Read aloud" orb stack without overlap on mobile viewport (375x812).
- [ ] Server enforces `Done Reading` completion before advancing out of Section 3.
- [ ] `leaderLiturgicalContextNote` stays strictly local to Study Leader and never crosses `/ws`.
- [ ] Only the chosen reader receives the `Done Reading` button; bystander participants cannot complete turn.
- [ ] Random selection works cleanly in Section 3 with 30s countdown.
- [ ] `grep -rn "Assistant" src/` returns 0 matches.
- [ ] `./init.sh` exits 0 and E2E passes twice consecutively with zero leaked sessions.

## Open Questions / Unknowns

- In `ux/7. Reading - Leader.png`, the reader card shows `0 / 12` counter: this represents `{raisedHandsCount} / {connectedParticipantsCount}`, indicating how many connected participants have raised their hand to read.
- If no participant volunteers, the Study Leader can either select an avatar directly from the roster strip or tap "Random" to initiate the 30-second random picker. Both paths are fully supported.

# Feature Implementation Spec: First Participant to Raise Hand Immediately Wins the Volunteer Turn

## Source Feature

- `id`: `first-hand-wins-volunteer-assignment`
- `area`: `volunteer-selection`
- `depends_on`: `["leader-bidirectional-section-navigation"]`
- `status`: `not_started`
- `source`: `feature_list.json`

## Goal

Implement the **First-Hand-Wins** volunteer selection model across Section 1 (`OpeningPrayerScreen`), Section 2 (`IcebreakerScreen`), and Section 3 (`GospelReadingScreen`) per `docs/domain-model.md` (Path A) and `DESIGN.md` Override #4. When a turn is open (`collecting_hands`), the first connected `Participant` to tap `Raise Hand` (or `Read aloud`) immediately wins the volunteer turn on the `/ws` server (`selectedMemberId` auto-assigned without waiting in a manual facilitator queue). The server broadcasts the assignment to all clients:
1. The room immediately sees who was chosen (`"<DisplayName> was chosen!"`).
2. The chosen `Participant` alone sees a prominent, high-visibility `"YOU WERE CHOSEN!"` view with their section's prayer/prompt/reading and the exclusive `Done` (`complete_turn`) action.
3. The `Study Leader` sees the active volunteer banner with `Mark done (Leader override)` (`override_turn`) and locked forward progression until the volunteer taps `Done` (or leader overrides).

## Non-Goals

- Implementing the multi-second 3D spinning random picker screen (`fullscreen-3d-random-picker-reveal`, Issue #48).
- Implementing full Section 4 Deep Analysis cards (`section-4-deep-analysis-screen`, Issue #47).
- Modifying 6-section progression or backward navigation (`leader-bidirectional-section-navigation` is already complete).
- Changing typography sizes across all sections (`animated-enlarged-section-typography`, Issue #49).

## Job Story

When I am participating in an active Bible study session and I feel called to volunteer,
I want tapping "Raise Hand" or "Read aloud" to immediately award me the turn,
so we avoid awkward pauses and queue management, and the whole room immediately knows who is sharing or reading while I get a clear "YOU WERE CHOSEN!" view with a "Done" button to complete my turn.

## Users And Permissions

- **First `Participant` to Volunteer**: Tapping `Raise Hand` or `Read aloud` immediately locks them in as `selectedMemberId`. Their screen transitions to the high-visibility `"YOU WERE CHOSEN!"` view with the exclusive `Done` button (`complete_turn`).
- **Subsequent `Participant` Hand Raises**: Once a turn has an assigned `selectedMemberId`, subsequent `raise_hand` commands do not overwrite `selectedMemberId`.
- **Other `Participants` in the Room**: Immediately see a clear announcement card indicating who was chosen (`"<DisplayName> was chosen to pray/share/read"`), and never see `Done` controls or leader controls in their DOM.
- **`Study Leader`**: Sees who is currently praying/sharing/reading, sees locked forward advancement until the turn is completed, and retains `Mark done (Leader override)` (`override_turn`).
- **Terminology Invariant**: Strictly `Study Leader` and `Participant` (zero occurrences of `"Assistant"` anywhere in code, tests, or UI copy).

## Acceptance Scenarios

### Scenario 1: First hand raised immediately auto-assigns selectedMemberId on the /ws server

Given a LiveSession is in progress on Section 1 (`section_1_prayer`), Section 2 (`section_2_icebreaker`), or Section 3 (`section_3_reading`) with an open turn (`selectedMemberId === null`, `candidateMemberId === null`, `completedAt === null`)
When a connected `Participant` sends `{ type: "raise_hand", sessionCode, memberId }`
Then the server immediately sets `selectedMemberId = memberId` on `session.volunteerTurn`
And broadcasts `session_updated` with `command: "raise_hand"` to all connected clients
And subsequent `raise_hand` commands from other participants do NOT change `selectedMemberId`.

### Scenario 2: Section 1 (Opening Prayer) high-visibility chosen view and room reveal

Given Section 1 is active with an open volunteer turn
When `Participant` "Maria" taps the violet `Raise Hand` orb
Then Maria's screen immediately renders `data-testid="prayer-chosen-view"` with:
  - `"YOU WERE CHOSEN"` pill (`data-testid="prayer-chosen-pill"`)
  - `"It's your turn to pray"` title (`data-testid="prayer-chosen-title"`)
  - Suggested opening prayer card
  - `"✓ Done"` button (`data-testid="prayer-done-button"`)
And other `Participants` see `data-testid="prayer-active-volunteer-note"` stating `"Maria is praying"`
And the `Study Leader` sees `data-testid="prayer-chosen-banner"` stating `"Maria is praying — waiting for Done"` without needing to click any manual Choose button.

### Scenario 3: Section 2 (Icebreaker) high-visibility chosen view and room reveal

Given Section 2 is active with an open volunteer turn
When `Participant` "Daniel" taps the bronze `Raise Hand` orb
Then Daniel's screen immediately renders `data-testid="icebreaker-chosen-view"` with:
  - `"YOU WERE CHOSEN"` pill (`data-testid="icebreaker-chosen-pill"`)
  - `"It's your turn to share"` title (`data-testid="icebreaker-chosen-title"`)
  - Icebreaker question and follow-up
  - `"When you finish, tap 'Done' so the Study Leader can continue."` instruction
  - `"✓ Done"` / `"Done Sharing"` button (`data-testid="icebreaker-done-button"`)
And other `Participants` see `data-testid="icebreaker-active-volunteer-note"` stating `"Daniel was chosen to share!"` (or `"Daniel is sharing"`)
And the `Study Leader` sees `data-testid="icebreaker-chosen-banner"` stating `"Daniel is sharing — waiting for Done"` and `data-testid="icebreaker-override-button"` for leader override.

### Scenario 4: Section 3 (Gospel Reading) high-visibility chosen view and room reveal

Given Section 3 is active with an open volunteer turn
When `Participant` "Elena" taps the indigo `Read aloud` orb
Then Elena's screen immediately renders `data-testid="reading-chosen-view"` with:
  - `"YOU WERE CHOSEN"` pill (`data-testid="reading-chosen-pill"`)
  - `"It's your turn to read"` title (`data-testid="reading-chosen-title"`)
  - Full Matthew 15:21–28 Gospel Reading card
  - `"When you finish, tap 'Done' so the Study Leader can continue."` instruction
  - `"✓ Done"` / `"Done Reading"` button (`data-testid="reading-done-button"`)
And other `Participants` see `data-testid="reading-active-volunteer-note"` stating `"Elena is reading aloud"`
And the `Study Leader` sees `data-testid="reading-chosen-banner"` stating `"Elena is reading aloud — waiting for Done"` and `data-testid="reading-override-button"`.

### Scenario 5: Volunteer completes turn with Done; unlocks Leader advancement

Given any volunteer turn in Section 1, 2, or 3 has an assigned volunteer (`selectedMemberId`)
When the chosen `Participant` taps the exclusive `Done` button
Then the client sends `{ type: "complete_turn", sessionCode, memberId }`
And the server validates socket binding and sets `turn.completedAt = isoNow`
And the `Study Leader`'s advance button immediately unlocks (`Continue to Section 2 →`, `Begin Reading →`, or `Continue to Deep Analysis →`)
And non-chosen participants or leader attempts to send `complete_turn` are rejected with `UNAUTHORIZED_MEMBER`.

## Repository Research

### Existing Files Inspected
- `src/server/sessionStore.ts`: `handleTurnCommand` processes `raise_hand`, `lower_hand`, `complete_turn`. Hand raising currently appends to `turn.raisedHands`. Auto-assignment of `selectedMemberId` on the first `raise_hand` occurs here.
- `src/shared/session.ts`: `applySetHandRaised` updates `raisedHands`. `applySelectVolunteer` sets `selectedMemberId`. `volunteerTurnPhase(turn)` returns `'assigned'` when `selectedMemberId != null`.
- `src/client/components/prayer/OpeningPrayerScreen.tsx`: Already renders `ChosenVolunteerView` when `isChosenVolunteer` is true. Leader view already handles `selectedMemberId` banner.
- `src/client/components/icebreaker/IcebreakerScreen.tsx`: Needs wiring for `isChosenVolunteer` view, non-chosen active volunteer note, leader banner with override, and `onCompleteTurn`/`onOverrideTurn` callbacks.
- `src/client/components/reading/GospelReadingScreen.tsx`: Needs high-visibility chosen view (`data-testid="reading-chosen-view"`, `data-testid="reading-chosen-pill"`, `data-testid="reading-done-button"`) when `isChosenReader` is true, delegating to `onCompleteTurn`.
- `src/client/App.tsx` and `src/client/components/dual/DualDeviceFrame.tsx`: Need to pass `onCompleteTurn` and `onOverrideTurn` to `IcebreakerScreen`.

## Technical Approach

1. **Server-Side Auto-Assignment (`src/server/sessionStore.ts`)**:
   - In `handleTurnCommand` for `command === 'raise_hand'`:
     - Check if `session.volunteerTurn` is currently in an open state (`selectedMemberId === null`, `candidateMemberId === null`, `completedAt === null`).
     - If so, this is the First-Hand-Wins event! Set `selectedMemberId = binding.memberId` via `applySelectVolunteer`.
     - Still append `{ memberId, raisedAt }` to `raisedHands` via `applySetHandRaised` for record and display.
     - If `selectedMemberId` is already non-null, subsequent `raise_hand` calls may append to `raisedHands` without modifying `selectedMemberId`.
   - Ensure `session.sectionTurns` is updated accordingly.
2. **Client Section 2 (`IcebreakerScreen.tsx`)**:
   - Compute `isChosenVolunteer = !isLeader && memberId != null && selectedMemberId === memberId`.
   - When `isChosenVolunteer`: render `IcebreakerChosenVolunteerView` (or dedicated container) showing `"YOU WERE CHOSEN"`, `"It's your turn to share"`, the prompt, and the `Done Sharing` button calling `onCompleteTurn`.
   - When not chosen and `selectedMember`: render note showing `"<DisplayName> was chosen to share!"` / `"<DisplayName> is sharing"`.
   - For Study Leader: render `data-testid="icebreaker-chosen-banner"` and `data-testid="icebreaker-override-button"`.
3. **Client Section 3 (`GospelReadingScreen.tsx`)**:
   - When `isChosenReader`: render `reading-chosen-view` with `YOU WERE CHOSEN` pill, Playfair `"It's your turn to read"`, scripture card, and `reading-done-button` calling `onCompleteTurn`.
   - When not chosen and `selectedMember`: render active reader note.
4. **App and Dual Device Frame Wiring**:
   - Wire `onCompleteTurn` and `onOverrideTurn` to `IcebreakerScreen` in `App.tsx` and `DualDeviceFrame.tsx`.

## Expected File Changes

| File | Change |
| :--- | :--- |
| `src/server/sessionStore.ts` | Auto-assign `selectedMemberId = binding.memberId` on first `raise_hand` during open turn |
| `src/client/components/icebreaker/IcebreakerScreen.tsx` | Wire chosen volunteer view, room announcement, leader banner + override button |
| `src/client/components/reading/GospelReadingScreen.tsx` | Add `reading-chosen-view` with `YOU WERE CHOSEN` pill and `Done Reading` CTA |
| `src/client/App.tsx` | Pass `onCompleteTurn` and `onOverrideTurn` to `IcebreakerScreen` |
| `src/client/components/dual/DualDeviceFrame.tsx` | Pass `onCompleteTurn` and `onOverrideTurn` to `IcebreakerScreen` |
| `src/client/styles/global.css` | Styling for icebreaker/reading chosen views and pills |
| `tests/integration/ws-first-hand-wins.test.ts` | New dedicated integration test for First-Hand-Wins across Sections 1, 2, and 3 |
| `tests/e2e/first-hand-wins-volunteer-assignment.spec.ts` | New multi-client Playwright E2E spec verifying instant win and high-visibility view |

## Verification Plan

1. **Vitest Integration Tests**:
   - `npx vitest run tests/integration/ws-first-hand-wins.test.ts` verifying:
     - Section 1 first `raise_hand` sets `selectedMemberId`.
     - Section 2 first `raise_hand` sets `selectedMemberId`.
     - Section 3 first `raise_hand` sets `selectedMemberId`.
     - Second `raise_hand` while assigned preserves original `selectedMemberId`.
     - Only chosen volunteer can execute `complete_turn`.
2. **Regression Check**:
   - `npm test` verifying existing suites adapt cleanly.
3. **Playwright E2E**:
   - `npx playwright test tests/e2e/first-hand-wins-volunteer-assignment.spec.ts` verifying:
     - First participant to tap `Raise Hand` in Section 1 immediately gets `YOU WERE CHOSEN` and `Done`.
     - First participant to tap `Raise Hand` in Section 2 immediately gets `YOU WERE CHOSEN` and `Done Sharing`.
     - First participant to tap `Read aloud` in Section 3 immediately gets `YOU WERE CHOSEN` and `Done Reading`.
     - Leader and non-chosen participants see who was chosen.
4. **Build & Quality Check**:
   - `./init.sh` exits 0 (typecheck, tests, build).
   - Terminology check: `grep -rn "Assistant" src/` returns 0 matches.

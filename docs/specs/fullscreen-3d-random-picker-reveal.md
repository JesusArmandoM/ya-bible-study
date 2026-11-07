# Feature Implementation Spec: Full-Screen 3D Random Picker Reveal

## Source Feature

- `id`: `fullscreen-3d-random-picker-reveal`
- `area`: `volunteer-selection`
- `depends_on`: `["first-hand-wins-volunteer-assignment"]` (accepted)
- `status`: `not_started`
- `source`: `feature_list.json`

## Goal

Provide a full-screen 3D procedural spinning animation (`Sacred3DScene`, `random-polyhedron`) to Participants when the Study Leader clicks `Pick Randomly` in Sections 1, 2, or 3, hiding all other section UI for ~3.5 seconds until the server automatically locks in the chosen volunteer (`assigned`). Once resolved, announce the chosen volunteer to everyone in the room (`"<Name> was chosen!"`) and display the high-visibility `"YOU WERE CHOSEN!"` screen with the exclusive `Done` button to the winner, while giving the Study Leader a `Pick Again` option to re-roll if needed.

## Non-Goals

- Changing First-Hand-Wins auto-selection semantics (first hand raise still auto-wins immediately).
- Modifying Section 4 Deep Analysis or Section 5 Discussion/Reflections flows (random picking is strictly for Sections 1, 2, and 3).
- Multiple WebGL contexts (canvas budget stays `<= 1` on mobile, `<= 2` in dual mode).
- Storing random picker history in database or across sessions (in-memory per-session only).

## Job Story

When nobody raises their hand to volunteer in Sections 1, 2, or 3,
I want the Study Leader to click `Pick Randomly` so Participants see an immersive full-screen 3D spinning random picker,
and after a brief spin, the server automatically assigns and reveals the winner to everyone without requiring manual leader confirmation, while allowing the leader to re-roll if the chosen participant declines.

## Users And Permissions

- **`Study Leader`**:
  - Can click `Pick Randomly` (`pick_random`) when no volunteer is assigned.
  - Can click `Pick Again` (`retry_random`) while spinning or after a volunteer is assigned (before turn completion) to re-roll.
  - Can click `Mark Done (Leader override)` (`override_turn`) to bypass the turn.
  - Forward navigation remains gated until the volunteer taps `Done` or leader overrides.
- **`Participant`**:
  - While spinning (`random_pending`), sees **only** the full-screen 3D `Sacred3DScene` random-picker animation (all other section UI unmounted/hidden).
  - When selected (`selectedMemberId === myMemberId`), sees the high-visibility `"YOU WERE CHOSEN!"` view with the exclusive `Done` button.
  - Non-selected Participants see `"<Name> was chosen!"` announcement.
  - Cannot trigger `pick_random` or `retry_random` (rejected with `FORBIDDEN_LEADER_ONLY`).

## Acceptance Scenarios

### Scenario 1: Participant sees only the full-screen 3D random picker during spin
Given an active session in Section 1, 2, or 3 with two connected Participants and no raised hands
When the Study Leader clicks `Pick Randomly`
Then the server transitions the turn to `random_pending` with a ~3.5s countdown
And connected Participants see `data-testid="random-picker-overlay"` covering 100% of the viewport with the 3D spinning polyhedron (`random-polyhedron`), badge `RANDOM SELECTION`, and title `Selecting a participant at random…`
And all other section UI (prayer cards, prompt lists, reading text, queue) is hidden from Participants during the spin.

### Scenario 2: Server automatically resolves to `assigned` without manual confirmation
Given `random_pending` is active with candidate Participant A
When the ~3.5s spin duration elapses on the server clock
Then the server automatically executes `applyConfirmRandomCandidate(turn)`, locking `selectedMemberId = candidateMemberId`
And the server broadcasts `session_updated` (`confirm_random`) transitioning turn phase to `assigned`
And without any manual leader confirmation click, Participant A immediately sees `"YOU WERE CHOSEN!"` with the `Done` CTA
And all other Participants and the Study Leader see `"<Participant A> was chosen!"`.

### Scenario 3: Study Leader has `Pick Again` re-roll capability in `assigned`
Given Participant A was selected via random picker in Section 1, 2, or 3
When Participant A declines verbally and the Study Leader clicks `Pick Again`
Then the server accepts `retry_random`, clears `selectedMemberId`, picks a different eligible Participant (e.g. Participant B), and restarts the ~3.5s spin
And all Participants see the full-screen 3D random picker overlay again until Participant B is automatically locked in.

### Scenario 4: Turn completion unlocks forward progression across Sections 1, 2, and 3
Given Participant A was selected via random picker and sees `"YOU WERE CHOSEN!"`
When Participant A clicks `Done` (or `Done Sharing` in Section 2, or `Done Reading` in Section 3)
Then the turn completes on the server (`turn_completed`), unlocking the Study Leader's `Continue to Section X →` CTA.

### Scenario 5: WebGL budget and domain terminology invariants preserved
Given any client state during random spin, winner reveal, or dual mode
Then active `<canvas>` elements stay `<= 1` in standalone mobile viewports and `<= 2` in Desktop Dual Side-by-Side Mode
And `grep -rn "Assistant" src/` returns 0 matches.

## Repository Research

### Files Inspected
- `src/server/sessionStore.ts`: `handleRandomSelectionCommand`, `handleRandomExpiry`, `scheduleRandomExpiry`. Currently `handleRandomExpiry` clears candidate on timeout; it must instead auto-confirm (`applyConfirmRandomCandidate`) and broadcast `confirm_random`.
- `src/shared/session.ts`: `RANDOM_SELECTION_COUNTDOWN_MS` (currently `30_000`), reducers `applyStageRandomCandidate`, `applyConfirmRandomCandidate`. Update spin default to ~3500ms.
- `src/client/state/sacredStageStore.ts`: `resolveSacredStage`, `random-polyhedron`, `chosen-aura`.
- `src/client/components/stage/RandomSelectionOverlay.tsx` (new) or `RandomSelectionPanel.tsx`: full-screen 3D overlay covering viewport during `random_pending`.
- `src/client/components/icebreaker/IcebreakerScreen.tsx`: wire `onPickRandomly`, `onRetryRandom`, `RandomSelectionPanel` / overlay.
- `src/client/components/prayer/OpeningPrayerScreen.tsx` & `src/client/components/reading/GospelReadingScreen.tsx`: wire full-screen random picker overlay and auto-reveal.
- `src/client/App.tsx` & `DualDeviceFrame.tsx`: handle random overlay and pass props.

## Technical Approach

1. **Server-Side (`src/server/sessionStore.ts` & `src/shared/session.ts`)**:
   - Set `RANDOM_SELECTION_COUNTDOWN_MS = 3500` (or 3200ms).
   - In `handleRandomExpiry(session)`: when the spin timer expires, auto-confirm candidate into `selectedMemberId`:
     ```ts
     session.volunteerTurn = applyConfirmRandomCandidate(turn);
     session.lastActivityAt = this.now();
     this.broadcastSessionUpdated(session, 'confirm_random');
     ```
   - In `handleRandomSelectionCommand`: allow `retry_random` / `pick_random` when `phase === 'random_pending' || phase === 'assigned'` (if `turn.completedAt === null`).
   - Wire Section 2 (`section_2_icebreaker`) in random selection command handler alongside Sections 1 and 3.

2. **Client-Side Full-Screen Random Overlay (`src/client/components/random/RandomSelectionOverlay.tsx`)**:
   - Create `RandomSelectionOverlay` with `data-testid="random-picker-overlay"`.
   - Mounts when `isRandomizing` is active, covering the screen (`position: fixed` or full-height overlay within `post-join-stage-shell`), displaying:
     - Badge: `RANDOM SELECTION` (`data-testid="random-picker-pill"`)
     - Headline: `Selecting a participant at random…` (`data-testid="random-picker-title"`)
     - Subtitle: `Spinning for a volunteer…` (`data-testid="random-picker-subtitle"`)
     - Ambient radiant glow (`#B855C8` / `#E2A83E`).
     - Persistent 3D canvas rendering `random-polyhedron`.
   - Participants see ONLY this overlay while spinning.
   - Once resolved (`assigned`), overlay unmounts and active section reveals `"YOU WERE CHOSEN!"` for winner and `"<Name> was chosen!"` for others.

3. **Study Leader Re-roll Control**:
   - In `OpeningPrayerScreen`, `IcebreakerScreen`, and `GospelReadingScreen`, when `volunteerTurnPhase === 'assigned'` and `isLeader`, provide `Pick Again` button (`data-testid="random-retry-button"` or `pick-again-button`) alongside `Mark Done (Leader override)`.

4. **Integration & E2E Verification**:
   - Add integration tests verifying server auto-resolve from `random_pending` to `assigned`.
   - Add Playwright E2E suite verifying full-screen 3D spin for Participants, automatic winner reveal, YOU WERE CHOSEN view, leader Pick Again, and Done gating across Sections 1, 2, and 3.

## Implementation Tasks

1. Update `sessionStore.ts` to auto-resolve candidate to `assigned` on countdown expiry, allow `retry_random` in `assigned`, and support Section 2.
2. Create `src/client/components/random/RandomSelectionOverlay.tsx` with full-screen 3D scene integration.
3. Wire full-screen random overlay in `OpeningPrayerScreen`, `IcebreakerScreen`, `GospelReadingScreen`, `App.tsx`, and `DualDeviceFrame.tsx`.
4. Add leader `Pick Again` button on active volunteer banner in Sections 1, 2, and 3.
5. Add unit and integration tests for random selection auto-resolve and re-roll.
6. Add Playwright E2E suite `tests/e2e/fullscreen-3d-random-picker-reveal.spec.ts`.
7. Verify with `./init.sh` and Playwright, then run independent validator.

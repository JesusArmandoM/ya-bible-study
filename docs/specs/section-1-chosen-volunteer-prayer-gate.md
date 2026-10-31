# Feature Implementation Spec: Chosen Opening Prayer volunteer unlocks leader advance via Done button

## Source Feature

- `id`: `section-1-chosen-volunteer-prayer-gate`
- `area`: `section-1-prayer`
- `depends_on`: `["section-1-opening-prayer-hand-raise"]` (accepted)
- `status`: `not_started`
- `source`: `feature_list.json`

## Goal

Complete the Section 1 gated `VolunteerTurn`: the Study Leader taps the gold `Choose` pill on a raised-hand queue row (`ux/4`), the chosen Participant alone receives the `YOU WERE CHOSEN — It's your turn to pray` screen (`ux/6`) with the suggested prayer and an exclusive `Done` button, and `Done` (or the discreet Leader override) fills `completedAt`, morphing the Leader's locked bar into the active gold `Continue to Section 2 →` CTA. A **server-enforced gate** blocks leader `next_section` out of `section_1_prayer` while `completedAt` is `null` (`CONSTRAINTS.md` #5 / AGENTS.md invariant: gating lives on the `/ws` server, not only in client UI). The Study Leader can never be deadlocked: `override_turn` completes the turn from any unfinished state.

## Non-Goals

- **`Pick Randomly` / candidate countdown** (`random-volunteer-picker-countdown`): `pick_random` / `confirm_random` / `retry_random` are NOT implemented; `candidateMemberId` / `candidateExpiresAt` stay `null` in every flow; no `random_pending` UI, no 30s timer, no `ux/9` surface. The violet `Pick Randomly` CTA stays unrendered.
- **Section 2 content** (`section-2-icebreaker-flow`): after the unlocked CTA advances, clients land on the existing `SectionPlaceholderScreen` (`SECTION 2 OF 5` / `40%`). No `next_section` semantic change beyond the Section 1 gate (no gates on later sections, no auto-advance, no new advancement command).
- SectionOneHandoff-style placeholders, Sections 3–5 turns (`Done Reading` reuses this machinery later), Wake Lock resync, Dual Side-by-Side Mode.
- Any persistence; any per-recipient snapshot forking (the full `volunteerTurn` keeps riding the shared snapshot — predecessor Resolution 5).
- Pastoral/facilitator fields crossing the wire (`leaderPrompt` etc.).

## Job Story

When the Opening Prayer queue holds volunteers,
I want to choose one person to pray and only give them the `Done` button,
so the group's turn-taking is calm and exclusive while I stay in control of when we advance — and can always move on even if a phone dies.

## Users And Permissions

- **`Study Leader`**: `Choose` / reassign a volunteer (`choose_volunteer`, `leaderToken`-gated), emergency `Mark done (Leader override)` (`override_turn`, `leaderToken`-gated), and advance via the gold CTA (`next_section`) **only after** `completedAt` is set (server-enforced). Never sees `Done`.
- **`Participant`**: raises/lowers own hand (unchanged); if and only if `volunteerTurn.selectedMemberId` equals their socket-bound `memberId`, sees `YOU WERE CHOSEN` + `Done` and may send `complete_turn`. Non-chosen Participants see who is praying; no `Choose` / `Done` / advance / override control anywhere in their DOM (the exact string `Choose` must not appear in participant DOM — accepted e2e assertion).
- **Terminology Invariant**: `Study Leader` / `Participant` only; zero occurrences of the forbidden legacy role word in `src/` (quoted static `ux/*.png` filenames and the scan command itself excepted).

## Acceptance Scenarios

### Scenario 1: Leader Choose assigns exactly one chosen Participant

Given the leader queue holds raised hands for Participants 1 and 2
When the leader taps `Choose` on Participant 1's row
Then every snapshot carries `volunteerTurn.selectedMemberId = P1`; only P1's screen becomes the `YOU WERE CHOSEN` view (`prayer-chosen-pill`, `It's your turn to pray`, `chosenVolunteerInstruction` subtitle, `Suggested prayer` card, gold `✓ Done`, `chosen-aura` stage, `aria-live` "You were chosen"); the leader sees a chosen banner + gold-highlighted row (Choose pills remain for reassign); P2 keeps the normal view plus `{name} is praying now`.

### Scenario 2: Done unlocks the leader advance (3 clients: leader + chosen + bystander)

Given Participant 1 is chosen (`assigned`)
When P1 taps `Done`
Then `completedAt` is set on the server clock and broadcast; the leader's locked bar (`🔒 Waiting for volunteer to advance`) morphs into the gold `Continue to Section 2 →` CTA (`prayer-advance-cta`) with a `completion-pulse` 3D impulse; P1 sees a completed state; P2 sees `The Opening Prayer is complete`
When the leader taps the CTA
Then all clients advance to `SECTION 2 OF 5` / `40%` (placeholder) and `volunteerTurn` is cleared (existing `next_section` behavior).

### Scenario 3: The gating negative matrix is enforced on the `/ws` server

Given any connected client
Then leader `next_section` while `completedAt` is `null` is rejected (`INVALID_STATE_TRANSITION`, state unchanged) — before Done and also when nobody was chosen
And participant `next_section` is rejected (`FORBIDDEN_LEADER_ONLY`); wrong-token `choose_volunteer` / `override_turn` → `UNAUTHORIZED_LEADER`; participant `choose_volunteer` / `override_turn` → `FORBIDDEN_LEADER_ONLY`
And `complete_turn` from an unbound socket, a spoofed `memberId`, the leader, or any non-selected member → `UNAUTHORIZED_MEMBER`; `complete_turn` outside `in_progress` + `section_1_prayer` → `INVALID_STATE_TRANSITION`
And `choose_volunteer` with an unknown or leader target → `INVALID_MESSAGE`; after `turn_completed` → `INVALID_STATE_TRANSITION`; choosing a different member revokes the prior selection (their `Done` now rejects) and same-target re-choose is an idempotent no-op broadcast.

### Scenario 4: Leader override never deadlocks

Given the chosen Participant closed their phone (or nobody raised a hand at all)
When the leader taps `Mark done (Leader override)` (`override_turn`)
Then `completedAt` is set (`selectedMemberId` preserved, possibly `null`) and the gold CTA unlocks exactly as with `Done`; override after completion is rejected (`INVALID_STATE_TRANSITION`).

### Scenario 5: Turn state survives reconnects; hand state never revokes selection

Given P1 is chosen and reloads / drops and reconnects
Then `session_reconnected` restores the chosen view (`selectedMemberId`/`completedAt` are session state, not socket state); late joiners hydrate the same phase on all screens
And `lower_hand` / `clear_hands` (any target, including the chosen member) changes `raisedHands` only — `selectedMemberId` / `completedAt` are untouched (revocation is leader-exclusive per `docs/user-and-access-model.md`)
And snapshots keep stripping `leaderPin` / `leaderToken` / `reconnectToken` and carry no pastoral fields; `candidateMemberId` / `candidateExpiresAt` are `null` in every flow.

## Repository Research

### Files Inspected

- `feature_list.json` / `PROGRESS.md` — predecessor accepted (Session 022); Sessions 021–022 e2e-reproducibility lessons (budget headroom + never-throwing bounded cleanup) apply to this spec's test plan.
- `docs/specs/section-1-opening-prayer-hand-raise.md` — Scope Boundary Resolution 1 (this feature owns the `next_section` gate + unlock) and Resolution 2 (reserved fields/command names; **no further protocol bump**). Its accepted assertions constrain the seams below.
- `docs/domain-model.md` — Gated VolunteerTurn Lifecycle (`collecting_hands` → `random_pending` → `assigned` → `turn_completed`), revocation/override edge cases ("Selected volunteer disconnects or locks phone … Reassign volunteer or Mark complete (Leader override)"), "zero Participants connected → leader self-preview/advance via leader override".
- `docs/user-and-access-model.md` — permissions table (choose/override/`Done` exclusivity), Ownership Boundaries (server-side pacing enforcement), Revocation/Expiry (leader reassign revokes prior `selectedMemberId`).
- `docs/technical-discovery.md` — reserved command names (`choose_volunteer`, `override_turn`, `complete_turn`), `memberId === volunteerTurn.selectedMemberId` check for `complete_turn`, `Done` golden pulse + locked-bar morph.
- `DESIGN.md` — `ux/6` layout (viewed: `YOU WERE CHOSEN` pill, gold mic aura, Playfair `It's your turn to pray`, `Suggested prayer` card, gold `✓ Done`), `ux/4` (viewed: per-row gold `Choose` pills), override #4 (padded pills, centered initials), motion (`springTap` 420/26, `springMorph` 280/28, `completion-pulse`), a11y (`aria-live` "You were chosen", `>= 44px`).
- `CONSTRAINTS.md` #5/#6/#7/#8 — this feature is the first to enforce the `Done` half of #5 as written.
- `src/shared/session.ts` — `VolunteerTurnState` (pre-reserved fields), `LeaderCommandType`, `SessionUpdatedCommand = Exclude<LeaderCommandType | 'raise_hand' | 'lower_hand', 'close_session'>` (auto-widens), pure reducer precedent.
- `src/server/sessionStore.ts` — `handleLeaderCommand` (order: participant-block → timing-safe `leaderToken` → memberId match → per-command state gates), `handleTurnCommand` (socket-binding auth → state gate), `next_section` (line ~981: clears `volunteerTurn`), `broadcastSessionUpdated`.
- `src/client/lib/sessionSocket.ts` (`sendLeaderCommand` + `targetMemberId`, `sendTurnCommand`), `src/client/lib/useLiveSession.ts` (action patterns; note `nextSection` is currently a documented phantom — this feature makes it real), `src/client/components/prayer/*`, `src/client/state/sacredStageStore.ts` (`chosen-aura` variant + `isChosenVolunteer` context + `completion-pulse` impulse already exist), `src/client/App.tsx`.
- Accepted test seams: `tests/unit/opening-prayer-screen.test.tsx` (locked bar must contain `0` buttons; text must not match `/advance now|continue|next/i`), `tests/e2e/section-1-opening-prayer.spec.ts` (`locked-advance-bar` contains `0` interactive controls; participant body `not.toContain('Choose')`), `tests/integration/ws-session-lifecycle.test.ts` Scenario 4 + `tests/integration/ws-hand-raise.test.ts` (both send leader `next_section` straight from Section 1 → forced compat edits below).

### Existing Patterns To Follow

- Full-snapshot broadcast per mutation with `requestId` echo; leader commands via `handleLeaderCommand`; participant self-service via socket-binding auth in `handleTurnCommand`; pure reducers in `src/shared/session.ts` shared by server + unit tests; idempotent re-sends broadcast unchanged state; `motion/react` springs + `AnimatePresence` + `usePrefersReducedMotion`; multi-context `/join/:code` e2e with raw `/ws` `close_session` cleanup.

### Current Gaps

- `choose_volunteer` / `complete_turn` / `override_turn` are unimplemented (names reserved only); `next_section` is ungated; no chosen-volunteer UI; queue rows have no `Choose` pill; no client `nextSection` action.

## Technical Approach

1. **Protocol: stay at `SESSION_PROTOCOL_VERSION = 3`, strictly additive.** The predecessor pre-reserved the fields and command names "without any further snapshot-shape change (and no further protocol bump)" — this feature adds only `ClientWsMessage` variants and a type-level widening of `LeaderCommandType` (+ `SessionUpdatedCommand`, automatically). Add to `src/shared/session.ts`:
   - `LeaderCommandType += 'choose_volunteer' | 'override_turn'` (both routed through `handleLeaderCommand`; envelope `{ type, sessionCode, leaderToken, memberId?, targetMemberId? /* choose_volunteer: required */, requestId? }`).
   - `ClientWsMessage += { type: 'complete_turn'; sessionCode; memberId; requestId? }` (participant self-service, like `raise_hand`).
   - Pure reducers + phase helper: `applySelectVolunteer(turn, memberId)` (sets `selectedMemberId`; never touches `candidate*` / `raisedHands`), `applyCompleteTurn(turn, isoNow)` (sets `completedAt` = server ISO clock; `override_turn` uses the same reducer), and `volunteerTurnPhase(turn): 'collecting_hands' | 'random_pending' | 'assigned' | 'turn_completed'` derived as `candidateMemberId != null && selectedMemberId == null && completedAt == null → 'random_pending'` (always unreachable here — seam for the picker), `selectedMemberId == null && completedAt == null → 'collecting_hands'`, `completedAt == null → 'assigned'`, else `'turn_completed'`.
   - NO snapshot-shape change; `VolunteerTurnState` fields stay as-is.

2. **Server (`src/server/sessionStore.ts`)**:
   - `choose_volunteer` (leader-gated): state gate `in_progress` + `section_1_prayer` + non-null turn + `completedAt == null` (else `INVALID_STATE_TRANSITION`); `targetMemberId` must be a known member with role `Participant` (else `INVALID_MESSAGE` — choosing the leader is invalid; raised-hand membership is **not** required server-side so the picker/roster-select follow-ups reuse the same command); same-target re-choose = idempotent no-op broadcast; different target = revoke-then-assign (per `docs/user-and-access-model.md` Revocation).
   - `override_turn` (leader-gated): valid whenever `completedAt == null` (collecting **or** assigned — this is the never-deadlock guarantee, covering zero volunteers / zero participants before the picker exists, per domain edge case); sets `completedAt` via `applyCompleteTurn` keeping `selectedMemberId` as-is (`null` allowed); after completion → `INVALID_STATE_TRANSITION`.
   - `complete_turn` (extend `handleTurnCommand`): error precedence mirrors the existing order — (1) socket-binding identity (`UNAUTHORIZED_MEMBER` for unbound / spoofed `memberId` / leader callers), (2) state gate `in_progress` + `section_1_prayer` + non-null turn (`INVALID_STATE_TRANSITION`), (3) `memberId === volunteerTurn.selectedMemberId` else `UNAUTHORIZED_MEMBER` (`docs/technical-discovery.md`), (4) already-completed by the selected member = idempotent no-op broadcast; else `applyCompleteTurn`.
   - `next_section` gate: when `currentSectionId === 'section_1_prayer'`, require `volunteerTurn?.completedAt != null` else `INVALID_STATE_TRANSITION` (`'The Opening Prayer turn must be completed before advancing.'`). No other `next_section` change (later sections ungated; `volunteerTurn = null` on advance unchanged).
   - `lower_hand` / `clear_hands` unchanged and **never** touch `selectedMemberId` / `completedAt`. Disconnects change only `connectionStatus` — selection persists (domain: reconnect "preserv[es] … assigned volunteer status"). Snapshots unchanged (`deep-copy`, secret-stripped).

3. **Client library**: `sessionSocket.ts` — `LeaderCommandInput.type` union gains `choose_volunteer` / `override_turn` (send `targetMemberId` on `choose_volunteer`; `sendTurnCommand` gains `complete_turn`). `useLiveSession.ts` — new actions `chooseVolunteer(targetMemberId)`, `completeTurn()`, `overrideTurn()`, `nextSection()` (the previously phantom action becomes real; used only by the Section 1 unlocked CTA).

4. **UI** (`src/client/components/prayer/`, `DESIGN.md` Sacred Midnight tokens):
   - `RaisedHandsQueue.tsx`: per-row gold `Choose` pill (`prayer-queue-choose`, `aria-label="Choose {name} to pray"`, `>= 44px`, `whileTap` spring) — completes `ux/4`. Selected row gets a gold highlight + `Chosen` chip (`prayer-queue-row` `is-chosen`); pills stay enabled for reassignment.
   - `OpeningPrayerScreen.tsx` (leader): assigned banner `prayer-chosen-banner` (`{name} is praying — waiting for Done`; add `· reconnecting` when the selected member's `connectionStatus` is `disconnected`); advance zone wrapper `prayer-advance-zone` = `locked-advance-bar` (testid + copy byte-identical in locked states — accepted assertions require **zero** interactive controls inside it) **plus a sibling** discreet tertiary control `prayer-override-button` (`Mark done (Leader override)`), rendered whenever `completedAt == null`. On `completedAt`, `AnimatePresence` morph (`springMorph` 280/28, instant under reduced motion) into gold `prayer-advance-cta` (`Continue to Section 2 →`, 56px `button-primary`, leader-only) dispatching `nextSection()`; fire `completion-pulse` impulse when `session_updated.command` is `complete_turn` / `override_turn`.
   - Chosen view (`ChosenVolunteerView.tsx`, new; shown instead of the orb when `volunteerTurn.selectedMemberId === my memberId`): `prayer-chosen-pill` `YOU WERE CHOSEN` (gold, generous horizontal padding — override #4), Playfair `It's your turn to pray` (`prayer-chosen-title`), subtitle from `study.openingPrayer.chosenVolunteerInstruction` (`prayer-chosen-instruction`), `Suggested prayer` card (reuse `OpeningPrayerCard`), gold `✓ Done` (`prayer-done-button`, 56px, `completion-pulse` on tap); after completion `prayer-done-completed` (`Amen — thank you for praying.`) + participant info bar. Stage switches to `chosen-aura` via `resolveSacredStage({ screen: 'section-1-prayer', isChosenVolunteer: true })` (already supported; single persistent canvas untouched).
   - Non-chosen participants keep their normal Section 1 view plus `prayer-active-volunteer-note` (`{name} is praying now`) while assigned and `prayer-completed-note` (`The Opening Prayer is complete`) after; no `Done`/`Choose`/advance/override node in the DOM. All new motion honors `usePrefersReducedMotion`; `>= 44px` targets, `>= 16px` control text, no horizontal overflow at `390x844`.

## Expected File Changes

- `src/shared/session.ts` — modify; `choose_volunteer` / `override_turn` leader commands, `complete_turn` message, `applySelectVolunteer` / `applyCompleteTurn` / `volunteerTurnPhase`. (No version bump.)
- `src/server/sessionStore.ts` — modify; the three commands, the `next_section` Section 1 gate.
- `src/client/lib/sessionSocket.ts`, `src/client/lib/useLiveSession.ts` — modify; new dispatch actions.
- `src/client/components/prayer/ChosenVolunteerView.tsx` — create; `OpeningPrayerScreen.tsx`, `RaisedHandsQueue.tsx`, `LockedAdvanceBar.tsx` (advance-zone split) — modify; `src/client/styles/global.css` — modify.
- `src/client/App.tsx` — modify only if the chosen state needs plumbing (routing unchanged).
- `tests/unit/volunteer-turn-gate.test.ts`, `tests/unit/chosen-volunteer-screen.test.tsx`, `tests/integration/ws-volunteer-gate.test.ts`, `tests/e2e/section-1-chosen-volunteer-gate.spec.ts` — create; `tests/unit/opening-prayer-screen.test.tsx`, `tests/unit/session-socket.test.ts` — extend (all accepted assertions unchanged).
- **Documented compat edits (only these two, forced by the spec-mandated gate — predecessor Resolution 1 anticipated them)**: `tests/integration/ws-session-lifecycle.test.ts` (Scenario 4, ~line 487) and `tests/integration/ws-hand-raise.test.ts` (~line 433) — insert an `override_turn` (or `complete_turn`) before each leader `next_section`; every existing assertion stays (scenario intents "advances … to section_2_icebreaker cleanly" / "after next_section leaves Section 1" unchanged).
- `ARCHITECTURE.md` — modify.

## Visual Design Impact

- UI involved: yes. Design source: `DESIGN.md` + `ux/4. Prayer - Leader waiting.png` + `ux/6. Prayer - Selected.png` (both viewed).
- Screens/states affected: Section 1 queue rows (Choose pill + chosen highlight), leader assigned banner + advance-zone morph (locked → gold CTA), chosen-participant `YOU WERE CHOSEN` view + post-Done state, non-chosen participant active/completed notes.
- New design artifact required: no — palette (gold `#E2A83E` CTA/`Done`, `#11131F` ink, `#171B2E` cards), typography, and motion constants are specified. Mockup adjustments: `Pick Randomly` stays out (follow-up); the discreet override is a small tertiary pill above the locked bar (not in the mockups — justified by `docs/user-and-access-model.md` + the risks table safeguard); `YOU WERE CHOSEN` pill padding per override #4.

## Durable Documentation Impact

- `ARCHITECTURE.md`: update — `choose_volunteer` / `complete_turn` / `override_turn`, the Section 1 `next_section` gate, `volunteerTurnPhase`, new `useLiveSession` actions (`chooseVolunteer`, `completeTurn`, `overrideTurn`, `nextSection` — the phantom becomes real), `ChosenVolunteerView`.
- `CONSTRAINTS.md`: not needed — #5 already mandates exactly this gating (leader-token on volunteer selection/override; `memberId === selectedMemberId` for `Done`) and #6/#7/#8 are unchanged; no new durable rule.
- `AGENTS.md`: not needed — workflow/startup unchanged.
- Other docs: `docs/domain-model.md` / `docs/technical-discovery.md` / `docs/user-and-access-model.md` already define this behavior (no change); `feature_list.json` / `PROGRESS.md` receive evidence at completion.

## Implementation Plan

1. Shared reducers + command types (`src/shared/session.ts`) + `tests/unit/volunteer-turn-gate.test.ts`.
2. Server commands + `next_section` gate (`src/server/sessionStore.ts`) + `tests/integration/ws-volunteer-gate.test.ts`; apply the two compat edits and run the accepted integration suites.
3. Client dispatch (`sessionSocket.ts`, `useLiveSession.ts`) + `tests/unit/session-socket.test.ts` extension.
4. UI: queue `Choose` pills, chosen view, advance-zone morph + override, notes, stage wiring, `global.css`; `tests/unit/chosen-volunteer-screen.test.tsx` + `opening-prayer-screen.test.tsx` extension.
5. E2E `tests/e2e/section-1-chosen-volunteer-gate.spec.ts` (3 clients) with Session 021–022 hardening baked in from the start.
6. `ARCHITECTURE.md`; run all gates; record evidence.

## Implementation Tasks

- [ ] `src/shared/session.ts`: `LeaderCommandType += 'choose_volunteer' | 'override_turn'`, `complete_turn` message, `applySelectVolunteer` / `applyCompleteTurn` / `volunteerTurnPhase`; unit `tests/unit/volunteer-turn-gate.test.ts` (phase derivation incl. unreachable `random_pending` seam; assign / reassign-revokes / same-target idempotent; `applyCompleteTurn` idempotent with server ISO clock; `candidate*` always `null`; immutability).
- [ ] `src/server/sessionStore.ts`: `choose_volunteer` (INVALID_MESSAGE unknown/leader target; INVALID_STATE_TRANSITION in lobby / after completion), `override_turn` (works from `collecting_hands` and `assigned`; INVALID_STATE_TRANSITION after completion), `complete_turn` in `handleTurnCommand` with the 4-step precedence, and the `next_section` Section 1 gate.
- [ ] `tests/integration/ws-volunteer-gate.test.ts`: happy path (raise → choose → Done → `next_section`) + the **full negative matrix** (Scenario 3) + override rules (Scenario 4: participant `FORBIDDEN_LEADER_ONLY`, wrong token `UNAUTHORIZED_LEADER`, unlocks from no-selection, INVALID_STATE_TRANSITION after completion) + lifecycle (Scenario 5: reconnect keeps `assigned`, late join hydrates, `lower_hand`/`clear_hands` never revoke, secrets stripped, `candidate*` null).
- [ ] Apply the two documented compat edits; verify `tests/integration/ws-load-study.test.ts` and the rest of the accepted suites pass unchanged.
- [ ] `sessionSocket.ts` / `useLiveSession.ts` dispatch + `tests/unit/session-socket.test.ts` (`complete_turn` framing; `choose_volunteer` `targetMemberId`; `override_turn`).
- [ ] UI per Technical Approach §4 with `motion/react` springs + `AnimatePresence` + reduced-motion guards, `>= 44px` / `>= 16px`, `completion-pulse` + `chosen-aura` wiring, no horizontal overflow at `390x844`.
- [ ] `tests/unit/chosen-volunteer-screen.test.tsx` (chosen-only `Done`; non-chosen zero `Done`/`Choose` string; leader banner + override **outside** `locked-advance-bar`; morph to `prayer-advance-cta`; post-Done states; reduced motion; static css assertions) + `tests/unit/opening-prayer-screen.test.tsx` extension (Choose pill leader-only; all accepted assertions unchanged).
- [ ] `tests/e2e/section-1-chosen-volunteer-gate.spec.ts` (mobile-chromium `390x844`; leader + chosen Participant + bystander via `/join/:code`): Scenario 1 (Choose sync, chosen-only `YOU WERE CHOSEN`/`Done`), Scenario 2 (Done → morph → advance to `SECTION 2 OF 5`), Scenario 3 UI slice (no advance control before completion; participant DOM has zero `Choose`/`Done`), Scenario 4 (bystander's raw `/ws` `complete_turn` rejects `UNAUTHORIZED_MEMBER`; chosen client closes → override → advance), Scenario 5 slice (chosen reload restores chosen view). **From the start**: `test.describe.configure({ timeout: 60_000 })`, `expect.configure({ timeout: 15_000 })`, a never-throwing bounded `closeLiveSession` (2s per-WS waits, 5s outer race ceiling, internal try/catch), and every `finally` closing contexts via `Promise.allSettled` (Sessions 021–022 lesson — the suite must be reproducible in full-suite runs and never leak sessions).
- [ ] Update `ARCHITECTURE.md`; run gates; record evidence.

## Verification Plan

- `./init.sh` — non-blocking gate (`npm run typecheck`, `npm test`, `npm run build`) exits `0`; must not start long-running servers.
- `PLAYWRIGHT_PORT=3301 npm run test:e2e` — all suites green on `mobile-chromium` `390x844` **in full-suite runs** (run at least twice consecutively; `ws-room-lifecycle.spec.ts` must stay green — no leaked sessions), including the new `section-1-chosen-volunteer-gate.spec.ts`.
- Vitest: `tests/unit/volunteer-turn-gate.test.ts`, `tests/unit/chosen-volunteer-screen.test.tsx`, `tests/integration/ws-volunteer-gate.test.ts` (the named negative matrix **is** the required server-gating evidence) + the extended `session-socket` / `opening-prayer-screen` suites.
- Static scans: `grep -rn "Assistant" src/` → `0`; participant DOM copy never contains the exact substring `Choose`.
- Live single-port smoke (recommended, `PORT=3101 node dist/server/index.js` + raw `/ws`): `protocolVersion: 3`; `next_section` rejected before `Done` (`INVALID_STATE_TRANSITION`) and accepted after; non-selected `complete_turn` → `UNAUTHORIZED_MEMBER`; `override_turn` unlocks; secret stripping unchanged; clean SIGTERM.
- Compatibility: all accepted suites pass with **only** the two documented compat edits.

## Evidence To Capture

- Exit `0` from `./init.sh` (typecheck ×3 tsconfigs; Vitest counts incl. the named suites; build output) and two consecutive `PLAYWRIGHT_PORT=3301 npm run test:e2e` runs (per-suite counts, 3-client scenarios named).
- Named integration tests proving the gate + negative matrix + override + reconnect resync; named unit tests for the reducers/phase helper and role surfaces.
- `grep -rn "Assistant" src/` → `0`; compat-edit record (exactly two files, assertions preserved).
- Evidence appended to `feature_list.json` and a `PROGRESS.md` session log entry.

## Validator Checklist

- [ ] Scope: no `pick_random` / `confirm_random` / `retry_random`, `candidate*` fields `null` everywhere, no `random_pending` UI, no Section 2 content (placeholder only), no `next_section` change beyond the Section 1 gate.
- [ ] Acceptance Scenarios 1–5 pass at `390x844` with the 3-client e2e covering chosen-only `Done`, unlock morph, and disconnect-override.
- [ ] Server-side gating is real: the full negative matrix passes at the `/ws` level (participant `next_section` → `FORBIDDEN_LEADER_ONLY`; `next_section` before Done → `INVALID_STATE_TRANSITION`; non-selected / spoofed / unbound `complete_turn` → `UNAUTHORIZED_MEMBER`; override rules); client-only hiding is never the enforcement point.
- [ ] Never-deadlock: `override_turn` unlocks from both `collecting_hands` and `assigned`; the leader always reaches `next_section` within one action.
- [ ] Snapshots: secrets and pastoral fields stripped; `selectedMemberId`/`completedAt` in-memory only, purged with the session; `volunteerTurn` survives reconnect/late-join; hand lowering never revokes selection.
- [ ] Strictly additive wire: `protocolVersion: 3` unchanged; pre-existing commands byte-compatible; only the two documented compat edits touch accepted tests.
- [ ] Zero legacy-role occurrences in `src/`; participant DOM free of the exact `Choose` string; Section 3 untouched (Gospel-only invariant preserved).
- [ ] DESIGN hygiene: `YOU WERE CHOSEN` pill padding (override #4), `>= 44px` targets / `>= 16px` control text, `springTap`/`springMorph` + `AnimatePresence` with reduced-motion guards, `chosen-aura` + `completion-pulse` on the single persistent `Sacred3DScene`, no overflow, prayer text untruncated.
- [ ] E2E hardening present from the first commit (60s suite / 15s expects / never-throwing bounded cleanup / `Promise.allSettled`) and the gate is green twice consecutively.
- [ ] `feature_list.json` / `PROGRESS.md` evidence recorded; `ARCHITECTURE.md` updated.

## Open Questions (non-blocking)

1. **Choose-from-queue strictness**: the server accepts `choose_volunteer` for any `Participant` member (not only raised hands) so `random-volunteer-picker-countdown` and Section 3 roster-select reuse the command unchanged; the Section 1 UI only offers `Choose` on raised rows. Revisit if validation wants the raised-hand precondition server-side.
2. **Post-completion re-choose** is rejected (`INVALID_STATE_TRANSITION`); if rehearsal wants a "pray again" loop, that is a follow-up decision, not a silent behavior change here.
3. **Selected member's lowered hand**: intentionally preserved semantics (selection is leader-owned); the chosen row may render without a raise entry after `clear_hands` — cosmetic only.

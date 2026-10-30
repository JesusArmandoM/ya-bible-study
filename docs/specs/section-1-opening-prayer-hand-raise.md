# Feature Implementation Spec: Opening Prayer synchronizes Participant hand raises to Study Leader queue

## Source Feature

- `id`: `section-1-opening-prayer-hand-raise`
- `area`: `section-1-prayer`
- `depends_on`: `["title-lobby-qr-join-start"]` (accepted)
- `status`: `not_started`
- `source`: `feature_list.json`

## Goal

Replace the provisional `SectionOneHandoff` with the real **Section 1 — Opening Prayer** experience. Both roles see the persistent `SECTION 1 OF 5 · 20%` header and the participant-visible Opening Prayer content (suggested prayer text, per `DESIGN.md` "prayers readable without truncation"). Participants tap the luminous violet `Raise Hand` orb (`ux/5. Prayer - Assistant.png` — static filename; all rendered copy says `Participant`) with 0ms ripple + `Sacred3DScene` `hand-raise` impulse to toggle their hand. The Study Leader sees a live prayer queue (`ux/4. Prayer - Leader waiting.png`) — count header, raised-hand rows with centered avatar initials, names, `Raised 4s ago` relative timestamps, animated via `motion/react` `AnimatePresence` + `layout` — and manages it (per-row lower, clear all). Hand raises sync to every client over `/ws` with idempotent, server-authoritative state that survives reconnects, and the leader's bottom advance bar stays locked (`Waiting for volunteer to advance`) with no active advance control.

## Non-Goals

- **Choosing a volunteer / `"YOU WERE CHOSEN"` / `Done` gate** (`section-1-chosen-volunteer-prayer-gate`): the per-row gold `Choose` pills from `ux/4` are **not rendered** in this feature; the gold-CTA unlock morph arrives with that feature.
- **`Pick Randomly` / Random Selection 30s countdown** (`random-volunteer-picker-countdown`): the violet `Pick Randomly` CTA from `ux/4` is **not rendered** in this feature (its informational hint copy may still appear to Participants).
- **Any change to `next_section` semantics** — no new advancement command, UI, or server precondition (see Scope Boundary Resolution 1).
- Sections 2–5 screens, `finish_study`, Wake Lock / foreground resync, Dual Side-by-Side Mode, Live Reflections, Prayer Card (their own features). A tiny generic placeholder covers `in_progress` when `currentSectionId !== 'section_1_prayer'` (raw `/ws` can reach it; no client UI advances sections yet).
- Any persistence: rooms, rosters, and raised-hand history stay ephemeral in memory and die with the session (`docs/user-and-access-model.md` Revocation/Expiry).
- Pastoral/facilitator fields (`leaderNote`, `examplesToListenFor`, `sampleAnswer`, `leaderLiturgicalContextNote`, `verseCommentary`, `catholicDoctrine`, `youngAdultApplication`, `openingPrayer.leaderPrompt`) crossing the wire.

## Job Story

When my young adult group opens the study in prayer,
I want to see who volunteers to pray in a live queue while Participants raise hands from their phones,
so I can invite each volunteer fairly and manage the queue without calling out names or losing track of who raised a hand.

## Users And Permissions

- **`Study Leader`**: views the prayer queue (count, order, relative timestamps); lowers one hand (`clear_hands` + `targetMemberId`) or all hands (`clear_hands`) — server-gated by `leaderToken` (`CONSTRAINTS.md` #5); cannot raise a hand (permissions table: `Raise Hand` — Study Leader: No); sees the locked advance bar (`🔒 Waiting for volunteer to advance`) and no advance control.
- **`Participant`**: raises/lowers **only their own** hand (identity from the socket binding — spoofed `memberId` is rejected); sees the prayer content, the `Raise Hand` toggle orb, and the live raised-hand count pill; sees the locked info bar (`ⓘ Only the leader decides when to advance`); no queue-management or advance controls anywhere in the DOM.
- **Terminology Invariant**: `Study Leader` / `Participant` only — zero occurrences of the forbidden legacy role word in `src/` (the only occurrences in this spec are quoted static `ux/*.png` filenames and the terminology scan command itself).

## Acceptance Scenarios

### Scenario 1: Section 1 shows the Opening Prayer content on both roles

Given the Study Leader tapped `Start Study` (`in_progress`, `section_1_prayer`) and clients land on Section 1
Then both roles show the persistent header (`SECTION 1 OF 5`, `20%`, 4px gold progress bar), the `MOMENT` eyebrow, the `Opening Prayer` title, and the full suggested prayer text (scripture-italic card, `opening-prayer-text`) sourced from the synced `study.openingPrayer`
And the leader subtitle reads `Waiting for someone to volunteer to pray` (from the locally held `StudyDocument.leaderPrompt` when available, else this fixed fallback) while the Participant subtitle uses `openingPrayer.participantPrompt`
And `<= 1` `<canvas>` is mounted (stage switched to the violet `prayer-orb` variant), zero legacy-role text, no horizontal overflow at `390x844`.

### Scenario 2: Participant raise syncs live into the leader queue (leader + 2 participants)

Given the leader and two Participants are on Section 1 (queue shows `0 hands raised`)
When Participant 1 taps the `Raise Hand` orb
Then the orb switches to its pulsing raised state instantly (0ms optimistic feedback, `hand-raise` 3D impulse), and within a round trip the leader queue shows one row (`prayer-queue-row`) with the avatar circle's 2-letter initials **centered** (DESIGN override #4), the display name, and `Raised … ago`
And the count reads `1 hands raised`-style header text (`1 hand raised`) on the leader and `1 person has raised their hand` on **both** Participant screens
When Participant 2 raises
Then the leader header reads `2 hands raised` with rows ordered by raise time (Participant 1 above Participant 2) and both Participant pills read `2 people have raised their hand`.

### Scenario 3: Toggle semantics are idempotent and ordering is by raise time

Given Participants 2 then 1 raised (queue order: 2, 1)
When Participant 2 taps the orb again (lower)
Then the row exits with `AnimatePresence` motion (instantly under `prefers-reduced-motion`) and counts update everywhere; repeated `raise_hand` frames while already raised never duplicate a row or move the member's position (protocol-level idempotency)
When Participant 2 re-raises
Then the row re-appends at the **end** of the queue (order: 1, 2) with a fresh server-clock `raisedAt`.

### Scenario 4: Leader queue management is exclusive and live

Given the leader queue holds rows for Participants 1 and 2
When the leader activates the per-row lower control for Participant 1 (`aria-label="Lower {name}'s hand"`)
Then only that row disappears on every client; `Lower all hands` (`prayer-queue-clear-all`) empties the queue everywhere
And neither control exists anywhere in the Participant DOM, and the server rejects `clear_hands` from a Participant socket (`FORBIDDEN_LEADER_ONLY`) or with a wrong `leaderToken` (`UNAUTHORIZED_LEADER`).

### Scenario 5: Hand state is self-only, state-gated, and locked against advance

Given any connected client
Then `raise_hand` / `lower_hand` carrying another member's `memberId`, sent from an unbound socket, or sent by the Study Leader is rejected (`UNAUTHORIZED_MEMBER`) — a Participant can only raise/lower their own hand
And raising before `start_study` or after `next_section` leaves Section 1 is rejected (`INVALID_STATE_TRANSITION`)
And throughout Section 1 the leader screen shows the locked bar `Waiting for volunteer to advance` with **no** active advance CTA (the `Done`-driven unlock is the follow-up feature), while Participants see `Only the leader decides when to advance`.

### Scenario 6: Reconnect / late-join resync, privacy, and additive protocol

Given Participant 1 raised a hand and then reloads the page (or drops and reconnects)
Then `session_reconnected` / `session_joined` snapshots restore the exact `volunteerTurn` state (their hand still raised, queue order intact) on all screens — raised hands are session state, not socket state (they also survive a temporary disconnect and are only removed by lower/clear)
And every snapshot keeps stripping `leaderPin` / `leaderToken` / `reconnectToken` and carries no pastoral fields; `volunteerTurn` reserved fields (`candidateMemberId`, `candidateExpiresAt`, `selectedMemberId`, `completedAt`) are `null` in every flow of this feature
And all pre-existing commands behave exactly as before (accepted suites pass with only the two documented compat edits) with `protocolVersion: 3` in snapshots.

## Repository Research

### Files Inspected

- `feature_list.json` / `PROGRESS.md` — `title-lobby-qr-join-start` accepted (Session 019); this feature is next-ready; feature notes: fix avatar initial clipping (DESIGN override #4), animate queue entries with `AnimatePresence` + `layout`.
- `ux/4. Prayer - Leader waiting.png`, `ux/5. Prayer - Assistant.png` — viewed: leader queue card (`N hands raised` header + icon slot, avatar rows, `Raised 4s ago`, per-row gold `Choose` — follow-up-owned), violet `Pick Randomly` (follow-up-owned), locked bar `🔒 Waiting for volunteer to advance`; participant view: `MOMENT` eyebrow, Playfair `Opening Prayer`, subtitle, 180–220px concentric violet `Raise Hand` orb, random-selection hint copy, bottom count pill `3 people have raised their hand / The leader will choose shortly`. `ux/6` confirms `SUGGESTED OPENING PRAYER` styling for the prayer text card.
- `DESIGN.md` — Sacred Midnight tokens, orb/queue/locked-bar layout, motion constants (`springTap` 420/26, `AnimatePresence` + `layout`), action-coupled `hand-raise` impulse, override #4 (centered initials, padded pills), accessibility baseline (`>= 44px`, `aria-live`, reduced motion), "prayers readable without truncation on 375px".
- `CONSTRAINTS.md` — #3 terminology, #5 server-gated leader commands + secret stripping + `maxPayload`, #6 ephemeral privacy, #7 `>= 16px` / `100dvh`, #8 single persistent canvas.
- `docs/domain-model.md` — `VolunteerTurn` entity (`mode`, `raisedHands[]` (`memberId`, `raisedAt`), `candidateMemberId`, `candidateExpiresAt`, `selectedMemberId`, `completedAt`), Gated VolunteerTurn Lifecycle (`collecting_hands` → `random_pending` → `assigned` → `turn_completed`), "zero Participants connected → leader self-preview" edge case.
- `docs/user-and-access-model.md` — `Raise Hand` permission (Participant only), leader-exclusive queue management/override, ephemeral purge incl. raised-hand history.
- `docs/technical-discovery.md` — reserved `/ws` command names (`choose_volunteer`, `pick_random`, `confirm_random`, `retry_random`, `override_turn`, `complete_turn`, `set_active_question`, `add_question`, `finish_study`), `memberId === volunteerTurn.selectedMemberId` check for `complete_turn`, `AnimatePresence` queue choreography, 60fps impulse budget.
- `src/shared/session.ts` — `SESSION_PROTOCOL_VERSION = 2`, `ClientWsMessage` / `ServerWsMessage` unions, `LeaderCommandType`, `SessionErrorCode`, `PublicLiveSessionSnapshot` (`study`, `protocolVersion` optional additive fields), `normalizeSessionStudySummary` (explicit allow-list normalizer — new fields must be added to it), `deriveInitials`.
- `src/shared/study.ts` — `OpeningPrayerSection` (`turnMode: 'gated_prayer'`, `suggestedPrayerText`, `leaderPrompt`, `participantPrompt`, `chosenVolunteerInstruction`).
- `src/server/studies/greatIsYourFaithSeed.ts` — openingPrayer copy: `eyebrow: 'MOMENT'`, `durationLabel: '5 min'`, `leaderPrompt: 'Waiting for someone to volunteer to pray'`, `participantPrompt: 'Tap Raise Hand if you would like to open our Bible study in prayer.'`, `chosenVolunteerInstruction`.
- `src/server/sessionStore.ts` — `InternalLiveSession`, `handleLeaderCommand` (`isParticipantCaller` → `FORBIDDEN_LEADER_ONLY`, timing-safe `leaderToken` → `UNAUTHORIZED_LEADER`, per-command state gating → `INVALID_STATE_TRANSITION`), `toPublicSnapshot` (secret stripping, deep copies), `broadcastSessionUpdated(session, command, requesterSocket, requestId)` (role-agnostic fan-out with `requestId` echo), `closeAndPurgeSession`.
- `src/client/lib/useLiveSession.ts` — snapshot-replacement reducer (`roster_updated`/`session_updated` → `setSession(message.session)`), `loadStudy`/`openLobby`/`startStudy` action patterns.
- `src/client/lib/sessionSocket.ts` — `sendLeaderCommand` (resolves on `session_updated`), `StoredSessionCredentials` re-hydration.
- `src/client/components/lobby/SectionOneHandoff.tsx`, `src/client/App.tsx` — provisional `in_progress` surface (`section-one-*` testids) replaced by this feature; App routes `in_progress` → `SectionOneHandoff`.
- `src/client/state/sacredStageStore.ts` — `prayer-orb` variant, `hand-raise` impulse kind, `resolveSacredStage('section-1-prayer')`, `triggerImpulse`.
- `tests/e2e/title-lobby-qr-join.spec.ts` (lines 231–247) + `tests/unit/title-lobby.test.tsx` (lines 173–189, 247) — the exact accepted assertions touching `section-one-*` (compat surface below).
- `tests/integration/ws-load-study.test.ts` — asserts `protocolVersion` **symbolically** (`SESSION_PROTOCOL_VERSION`), so a version bump breaks no assertion.

### Existing Patterns To Follow

- Full-snapshot broadcast per mutation (`roster_updated` / `session_updated`) with the client replacing `session` wholesale — hand raises should ride this path.
- Server-gated leader commands through `handleLeaderCommand`; client dispatch via `sendLeaderCommand` with `isSubmitting`/`error`; never trust button hiding (`CONSTRAINTS.md` #5).
- Pure shared reducers/normalizers in `src/shared/session.ts` unit-tested directly (`toSessionStudySummary` precedent).
- `motion/react` `whileTap` springs + `triggerTactileHaptic` + `usePrefersReducedMotion`; stable `data-testid` hooks; `aria-live="polite"`; e2e suites close rooms via raw `/ws` `close_session` in `finally`; multi-context `/join/:code` e2e helpers (title-lobby spec).

### Current Gaps

- No volunteer/hand-raise state anywhere (`InternalLiveSession` has no turn; protocol has no participant turn commands).
- Section 1 content is not synced: `SessionStudySummary` is title/meta-only, so Participants cannot see the Opening Prayer text.
- No Section 1 UI beyond `SectionOneHandoff`; no queue, orb, or locked-bar components.

## Technical Approach

1. **Protocol v3 (bump `SESSION_PROTOCOL_VERSION` to 3), strictly additive** (`src/shared/session.ts`). Decision: **bump** rather than keep 2 — v2 established `protocolVersion` as a snapshot-shape marker and this change grows the shape again (`volunteerTurn`, `study.openingPrayer`); the wire stays backward compatible (all fields optional, new message types are never sent by older clients, widened `command` union is a type-level widening), the constant is asserted symbolically in the accepted suite (zero breakage), and the pre-reserved turn fields below mean the follow-ups cause **no further shape change**. Additions:

   ```ts
   export interface RaisedHandEntry { memberId: string; raisedAt: string; } // ISO 8601, server clock
   export type VolunteerTurnMode = 'gated_prayer' | 'open_share' | 'gated_reading';
   export interface VolunteerTurnState {
     sectionId: StudySectionId;
     mode: VolunteerTurnMode;
     raisedHands: RaisedHandEntry[];      // raise order (append-only); <= 1 entry per memberId
     candidateMemberId: string | null;    // RESERVED: random-volunteer-picker-countdown (always null here)
     candidateExpiresAt: string | null;   // RESERVED: 30s countdown (always null here)
     selectedMemberId: string | null;     // RESERVED: section-1-chosen-volunteer-prayer-gate (always null here)
     completedAt: string | null;          // RESERVED: Done / turn completion (always null here)
   }
   export interface SessionOpeningPrayerContent {
     title: string; eyebrow: string; durationLabel: string;
     suggestedPrayerText: string;          // participant-visible
     participantPrompt: string;            // participant-visible
     chosenVolunteerInstruction: string;   // participant-visible; RESERVED for the Done-gate feature
   }
   // SessionStudySummary   += openingPrayer?: SessionOpeningPrayerContent | null
   // PublicLiveSessionSnapshot += volunteerTurn?: VolunteerTurnState | null
   // LeaderCommandType     += 'clear_hands'
   // ClientWsMessage       += { type: 'raise_hand' | 'lower_hand'; sessionCode; memberId; requestId? }  (participant self-service)
   //                        { type: 'clear_hands'; sessionCode; leaderToken; memberId?; targetMemberId?; requestId? }  (leader-gated)
   // SessionErrorCode      += 'UNAUTHORIZED_MEMBER'
   // session_updated.command widens to Exclude<LeaderCommandType | 'raise_hand' | 'lower_hand', 'close_session'>
   ```

   Bounded validation (same style as `normalizeSessionStudySummary`): `title` ≤ 120, `eyebrow`/`durationLabel`/`participantPrompt`/`chosenVolunteerInstruction` ≤ 200 non-empty, `suggestedPrayerText` ≤ 2000 non-empty; a present-but-invalid `openingPrayer` → `INVALID_MESSAGE`; a missing `openingPrayer` stays valid (backward compat). `toSessionStudySummary` fills it from `StudyDocument.openingPrayer` **without** `leaderPrompt` (see Resolution 4). Pure turn reducers live in `src/shared/session.ts` (`createVolunteerTurnForSection(sectionId)` mapping `section_1_prayer → 'gated_prayer'`, `applySetHandRaised(turn, memberId, raised, isoNow)`, `applyClearHands(turn, targetMemberId?)`) so server and unit tests share one implementation.

2. **Server** (`src/server/sessionStore.ts`, modify): `InternalLiveSession.volunteerTurn: VolunteerTurnState | null`; `start_study` creates the Section 1 turn (`gated_prayer`, empty `raisedHands`, reserved fields `null`); `next_section` **unchanged** except it sets `volunteerTurn = null` (turn state is per-section; follow-ups will instantiate their sections' turns here). New `handleTurnCommand` for `raise_hand`/`lower_hand`: authorize against `socketBindings` (bound `memberId` must equal `record.memberId`, role must be `Participant`, else `UNAUTHORIZED_MEMBER`), require `in_progress` + `section_1_prayer` + non-null turn (else `INVALID_STATE_TRANSITION`), apply the pure reducer, broadcast `session_updated` via the existing helper (requestId echoed to the requester). `clear_hands` routes through `handleLeaderCommand` (existing `FORBIDDEN_LEADER_ONLY` / `UNAUTHORIZED_LEADER` gating): `targetMemberId` must be a known member (else `INVALID_MESSAGE`), a non-raised target (or empty queue) is an idempotent no-op. Idempotency contract: `raise_hand` while raised keeps the original `raisedAt` and queue position; `lower_hand` while lowered is a no-op; re-raise appends with a fresh server-clock `raisedAt`; every accepted command still broadcasts (uniform ack + resync). Raised hands **persist across disconnects** (only `lower_hand`/`clear_hands`/session purge remove them) and appear in `toPublicSnapshot` (deep-copied) and therefore in `session_created`/`session_joined`/`session_reconnected`/`roster_updated`/`session_updated` automatically. `closeAndPurgeSession` unchanged — turn history dies with the in-memory session. Rejected alternative: a dedicated `hands_updated` frame — it would add a second sync path while `useLiveSession` already converges on full-snapshot replacement; at parish-room scale full snapshots are a few KiB.

3. **Client library**: `sessionSocket.ts` adds `sendTurnCommand({ type: 'raise_hand' | 'lower_hand', sessionCode, memberId })` and extends `LeaderCommandInput` with `targetMemberId?: string` (both resolve on `session_updated`, existing `PendingRequest` path). `useLiveSession.ts` adds `setHandRaised(raised: boolean)`, `lowerHand(targetMemberId: string)`, `clearRaisedHands()` following the `loadStudy`/`startStudy` pattern.

4. **UI** (`src/client/components/prayer/` + `src/client/components/sections/SectionProgressHeader.tsx`):
   - `OpeningPrayerScreen.tsx` (role-aware orchestrator; replaces `SectionOneHandoff`): keeps the legacy-stable testids `section-one-handoff` (root), `section-one-label`, `section-one-percent`, `section-one-title`, `section-one-copy` (role subtitle) so accepted assertions keep passing; new elements use `prayer-*` testids. Leader layout: prayer card → queue card → locked bar. Participant layout: eyebrow/title/subtitle → orb → random-hint copy → prayer card (scrollable middle region inside the `100dvh` column) → count pill → info bar.
   - `OpeningPrayerCard.tsx` — `opening-prayer-text` scripture-italic prayer card from `study.openingPrayer.suggestedPrayerText` (DESIGN: readable without truncation on 375px); graceful `Opening Prayer content unavailable` fallback when `study`/`openingPrayer` is absent.
   - `HandRaiseOrb.tsx` — 180–220px concentric violet (`#B855C8`) toggle `<button>` (`aria-pressed`), `Raise Hand` ↔ `Hand Raised` labels (`Tap again to lower` sub-label when raised), 0ms optimistic ripple + `whileTap` spring (`scale: 0.96`, 420/26) + `triggerTactileHaptic` + `triggerImpulse('hand-raise')`; pulsing raised aura disabled under `prefers-reduced-motion`.
   - `RaisedHandsQueue.tsx` — header (`prayer-queue-count` = `{n} hand(s) raised`, `prayer-queue-clear-all` icon button `aria-label="Lower all hands"` in the header icon slot — documented mockup adjustment), rows (`prayer-queue-row`) with centered-initials avatar (flex-center, fixes DESIGN override #4 clipping), display name, `Raised {relative} ago` (recomputed on snapshot + coarse interval; clamp clock-skew negatives to `just now`), per-row `aria-label="Lower {name}'s hand"` control (this feature's "clear/lower" management; **no** `Choose` pill). Rows enter/exit with `AnimatePresence` + `layout` springs (instant under reduced motion). Empty state: `No hands raised yet`.
   - `LockedAdvanceBar.tsx` — anchored bottom pill: leader `🔒 Waiting for volunteer to advance`, Participant `ⓘ Only the leader decides when to advance`; never renders an advance CTA.
   - `SectionPlaceholderScreen.tsx` — minimal `SECTION {n} OF 5` / `{percent}%` placeholder for `in_progress` outside Section 1 (future sections own their screens).
   - Stage wiring: on Section 1 mount `setStage('prayer-orb')` (guarded, via `resolveSacredStage('section-1-prayer')`), hand raise/lower triggers the `hand-raise` impulse — single persistent canvas untouched (`CONSTRAINTS.md` #8).
   - `App.tsx`: `in_progress` + `section_1_prayer` → `OpeningPrayerScreen`; other `in_progress` sections → `SectionPlaceholderScreen`; `SectionOneHandoff.tsx` deleted.

## Expected File Changes

- `src/shared/session.ts` — modify; protocol v3: turn types, `SessionOpeningPrayerContent`, snapshot fields, `clear_hands` / `raise_hand` / `lower_hand`, `UNAUTHORIZED_MEMBER`, widened `session_updated.command`, bounded `openingPrayer` normalization, pure turn reducers.
- `src/server/sessionStore.ts` — modify; `volunteerTurn` lifecycle, `handleTurnCommand`, `clear_hands`, turn in `toPublicSnapshot`.
- `src/client/lib/sessionSocket.ts` — modify; `sendTurnCommand`, `LeaderCommandInput.targetMemberId`.
- `src/client/lib/useLiveSession.ts` — modify; `setHandRaised` / `lowerHand` / `clearRaisedHands`.
- `src/client/components/prayer/OpeningPrayerScreen.tsx`, `OpeningPrayerCard.tsx`, `HandRaiseOrb.tsx`, `RaisedHandsQueue.tsx`, `LockedAdvanceBar.tsx`, `SectionPlaceholderScreen.tsx` — create; `src/client/components/sections/SectionProgressHeader.tsx` — create.
- `src/client/components/lobby/SectionOneHandoff.tsx` — delete (replaced).
- `src/client/App.tsx` — modify; `in_progress` routing.
- `src/client/styles/global.css` — modify; prayer screen, orb, queue rows, locked bar (≥ 44px targets, scrollable middle region, no horizontal overflow).
- `tests/unit/hand-raise-state.test.ts`, `tests/unit/opening-prayer-screen.test.tsx` — create; `tests/unit/session-socket.test.ts` — extend (turn command framing).
- `tests/integration/ws-hand-raise.test.ts` — create.
- `tests/e2e/section-1-opening-prayer.spec.ts` — create.
- **Documented compat edits (only these)**: `tests/unit/title-lobby.test.tsx` — migrate the `SectionOneHandoff` block (lines 173–189) to `OpeningPrayerScreen` with the same `section-one-*` testids and the two updated copy strings; `tests/e2e/title-lobby-qr-join.spec.ts` — update the two `section-one-copy` text assertions (lines 244–247) to the new role copy (testids unchanged; scenario intent — Start Study lands every client on Section 1 — unchanged).
- `ARCHITECTURE.md` — modify; protocol v3, turn state, `prayer/` + `sections/` modules, new hook actions.

## Visual Design Impact

- UI involved: yes
- Design source: `DESIGN.md` + `ux/4. Prayer - Leader waiting.png` + `ux/5. Prayer - Assistant.png` (+ `ux/6` for prayer-card styling)
- Screens or states affected: Section 1 Opening Prayer (leader queue / empty queue, participant orb idle / raised, count pill 0/1/N, locked bar both roles), Section 1 → future-section placeholder.
- New design artifact required: no — palette (violet `#B855C8` orb, gold `#E2A83E` accents, `#171B2E` cards), typography (Playfair title, `MOMENT` eyebrow, scripture-italic prayer), and motion constants are specified.
- Documented mockup adjustments: per-row gold `Choose` pills and the violet `Pick Randomly` CTA are **omitted** (follow-up features render them, completing `ux/4`); the queue header icon slot hosts the `Lower all hands` control (this feature's clear/lower management); the prayer text card is added per DESIGN's "prayers readable without truncation" Do; avatar initials are flex-centered (override #4); `3 hands raised` copy is dynamic (`{n} hand(s) raised`). Keep `Sacred3DScene` as the single persistent canvas (`prayer-orb` stage).

## Durable Documentation Impact

- `ARCHITECTURE.md`: update — `/ws` protocol v3 (`raise_hand`/`lower_hand`/`clear_hands`, `volunteerTurn`, `study.openingPrayer`, `UNAUTHORIZED_MEMBER`), `src/client/components/prayer/` + `sections/` modules, new `useLiveSession` actions.
- `CONSTRAINTS.md`: not needed — #5 already covers leader-gated commands + secret stripping, #3/#6/#7/#8 unchanged; no new durable rule is introduced (turn-gated advancement and `Done` gating remain the follow-up's to codify).
- `AGENTS.md`: not needed — workflow and startup path unchanged.
- Other docs: `docs/domain-model.md` and `docs/technical-discovery.md` already define the `VolunteerTurn` model and reserved command names this spec aligns to (no change); `feature_list.json` / `PROGRESS.md` receive evidence at completion.

## Implementation Plan

1. Shared protocol + reducers + version bump; unit `tests/unit/hand-raise-state.test.ts`.
2. Server turn lifecycle + commands; integration `tests/integration/ws-hand-raise.test.ts`.
3. Client library actions (`sessionSocket`, `useLiveSession`).
4. UI: `SectionProgressHeader`, prayer components, `App.tsx` routing, `global.css`, stage wiring; unit `tests/unit/opening-prayer-screen.test.tsx` + `session-socket` extension; delete `SectionOneHandoff`.
5. E2E `tests/e2e/section-1-opening-prayer.spec.ts`; apply the two documented compat edits.
6. `ARCHITECTURE.md`; run all gates; record evidence.

## Implementation Tasks

- [ ] Add `SESSION_PROTOCOL_VERSION = 3`, `RaisedHandEntry` / `VolunteerTurnState` / `VolunteerTurnMode`, `SessionOpeningPrayerContent` (+ bounded normalization inside `normalizeSessionStudySummary` / `toSessionStudySummary`), `raise_hand` / `lower_hand` / `clear_hands`, `UNAUTHORIZED_MEMBER`, widened `session_updated.command`, and pure turn reducers in `src/shared/session.ts`.
- [ ] Implement `volunteerTurn` in `src/server/sessionStore.ts` (created on `start_study`, cleared on `next_section`, deep-copied into snapshots): `handleTurnCommand` (socket-binding auth → `UNAUTHORIZED_MEMBER`; state gate → `INVALID_STATE_TRANSITION`) and leader-gated `clear_hands` (`INVALID_MESSAGE` for unknown target; idempotent no-ops).
- [ ] `tests/unit/hand-raise-state.test.ts`: turn creation (mode `gated_prayer`, reserved fields `null`), idempotent raise (position + `raisedAt` preserved), lower/no-op, re-raise appends at end, ≤ 1 entry per member, clear-all / clear-targeted, stable ordering.
- [ ] `tests/integration/ws-hand-raise.test.ts`: broadcast fan-out (`command: 'raise_hand'` etc. + `volunteerTurn` in snapshots), idempotency over the wire, the full auth matrix (foreign `memberId` / unbound socket / leader raise → `UNAUTHORIZED_MEMBER`; participant `clear_hands` → `FORBIDDEN_LEADER_ONLY`; wrong token → `UNAUTHORIZED_LEADER`; unknown target → `INVALID_MESSAGE`), state gating (raise in `lobby` and after `next_section` → `INVALID_STATE_TRANSITION`), reconnect + late-join resync, `load_study` `openingPrayer` validation (oversized → `INVALID_MESSAGE`; missing → valid), snapshots never contain `leaderPin`/`leaderToken`/`reconnectToken`, reserved turn fields always `null`.
- [ ] Extend `src/client/lib/sessionSocket.ts` (`sendTurnCommand`, `targetMemberId`) + `tests/unit/session-socket.test.ts`; add `setHandRaised` / `lowerHand` / `clearRaisedHands` to `useLiveSession.ts`.
- [ ] Build `SectionProgressHeader.tsx` and the `prayer/` components (screen, card, orb, queue + rows, locked bar, placeholder) with `motion/react` `AnimatePresence` + `layout`, `usePrefersReducedMotion`, `triggerTactileHaptic`, centered avatar initials (override #4), and `prayer-*` testids while keeping the `section-one-*` hooks.
- [ ] Wire `App.tsx` routing (`in_progress` → `OpeningPrayerScreen` / `SectionPlaceholderScreen`) and stage effects (`prayer-orb`, `hand-raise` impulse); delete `SectionOneHandoff.tsx`; style in `global.css` (≥ 44px targets, scrollable middle region, no overflow at 390×844).
- [ ] `tests/unit/opening-prayer-screen.test.tsx`: leader queue (count header, row initials centered + `Raised … ago`, per-row lower + clear-all leader-only), participant orb toggle (`aria-pressed`, `Raise Hand` ↔ `Hand Raised`, dispatches), count pill pluralization (`1 person has raised their hand` / `N people have raised their hand`), locked bars (role copy; zero advance CTA in the DOM), prayer text from `study.openingPrayer` + fallback, `participantPrompt` subtitle, zero legacy-role copy, static `>= 16px` / `>= 44px` css assertions, reduced-motion guards.
- [ ] `tests/e2e/section-1-opening-prayer.spec.ts` (mobile-chromium 390x844; leader + 2 Participant contexts via `/join/:code`; `close_session` in `finally`) covering Scenarios 1–6: content on both roles, live queue sync + counts, toggle/lower/re-raise ordering, leader management + participant DOM absence, locked bar with no advance control, reload resync.
- [ ] Apply the two documented compat edits (`tests/unit/title-lobby.test.tsx` block migration; `tests/e2e/title-lobby-qr-join.spec.ts` copy strings) and record them as compat deviations.
- [ ] Update `ARCHITECTURE.md`; run `./init.sh`, `PLAYWRIGHT_PORT=3301 npm run test:e2e`, `grep -rn "Assistant" src/` (the scan term is the forbidden-word check itself); record evidence in `feature_list.json` / `PROGRESS.md`.

## Verification Plan

- `./init.sh` — non-blocking gate (`npm run typecheck`, `npm test`, `npm run build`) exits `0`; must not start long-running servers.
- `PLAYWRIGHT_PORT=3301 npm run test:e2e` — all suites green on `mobile-chromium` `390x844`, including the new `tests/e2e/section-1-opening-prayer.spec.ts` (multi-context leader + 2 participants; per-suite assertions listed in the tasks above; each test closes its room via raw `/ws` `close_session` in `finally`).
- Unit/integration (Vitest): `tests/unit/hand-raise-state.test.ts`, `tests/unit/opening-prayer-screen.test.tsx`, `tests/integration/ws-hand-raise.test.ts` — assertions enumerated in the tasks; the auth/state negative tests (`UNAUTHORIZED_MEMBER`, `FORBIDDEN_LEADER_ONLY`, `UNAUTHORIZED_LEADER`, `INVALID_STATE_TRANSITION`, `INVALID_MESSAGE`) are the required server-side gating coverage.
- Static scans: `grep -rn "Assistant" src/` → `0` matches; no hardcoded hosts (`grep -rn "localhost" src/client/` shows only the sanctioned local-only detection set).
- Live single-port smoke (recommended, `PORT=3101 node dist/server/index.js` + raw `/ws` script, matching prior sessions): `protocolVersion: 3`; `raise_hand` accepted in `section_1_prayer` and rejected in `lobby` / after `next_section`; `clear_hands` with wrong token → `UNAUTHORIZED_LEADER`; serialized snapshots strip `leaderPin`/`leaderToken`/`reconnectToken`; clean SIGTERM shutdown.
- Compatibility: all accepted suites pass with **only** the two documented compat edits; `tests/integration/ws-session-lifecycle.test.ts` (incl. its `next_section` Scenario 4) and `tests/integration/ws-load-study.test.ts` pass **unchanged**.

## Evidence To Capture

- Exit code `0` from `./init.sh` (typecheck across 3 tsconfigs; Vitest suite/test counts including the three named suites; `dist/client` + `dist/server` build output).
- Exit code `0` from `PLAYWRIGHT_PORT=3301 npm run test:e2e` with per-suite pass counts on `mobile-chromium` `390x844`, explicitly noting the multi-client hand-raise sync (queue rows + counts on 3 screens) and reload resync.
- Named integration tests proving the auth/state gating matrix, idempotent toggles, reconnect resync, and secret stripping; named unit tests for the turn reducers and the role-specific Section 1 surfaces.
- `grep -rn "Assistant" src/` → `0`.
- Compat-deviation record for the two edited assertions; live smoke transcript if run.
- Evidence appended to `feature_list.json` and a `PROGRESS.md` session log entry.

## Validator Checklist

- [ ] Implementation stays within this feature's scope: no `Choose` behavior, no `YOU WERE CHOSEN` / `Done` gate, no `Pick Randomly` / countdown, no `next_section` semantic change, no Sections 2–5 screens.
- [ ] Acceptance Scenarios 1–6 pass on `390x844`, including leader + 2-Participant live sync and participant DOM containing neither queue-management nor advance controls.
- [ ] Hand state is self-only and server-authoritative: `UNAUTHORIZED_MEMBER` for spoofed/unbound/leader raises; idempotent toggles (no duplicate rows, stable order, re-raise appends); state-gated (`INVALID_STATE_TRANSITION` outside Section 1).
- [ ] Snapshots leak no secrets and no pastoral fields; `openingPrayer` carries only participant-visible copy (never `leaderPrompt`); `volunteerTurn` reserved fields (`candidateMemberId`, `candidateExpiresAt`, `selectedMemberId`, `completedAt`) are `null` everywhere in this feature; raised-hand data is in-memory only and purged with the session.
- [ ] `protocolVersion: 3` with strictly additive wire changes; all pre-existing commands byte-compatible; only the two documented compat edits touch accepted tests.
- [ ] Zero legacy-role occurrences in `src/`; `Study Leader` / `Participant` throughout; Section 3 surfaces untouched (Gospel-only invariant preserved where it exists).
- [ ] DESIGN hygiene: centered avatar initials (override #4), `>= 44px` targets, `>= 16px` where any control text renders, `motion/react` springs + `AnimatePresence` honoring `prefers-reduced-motion`, single persistent `Sacred3DScene` canvas (`prayer-orb` + `hand-raise` impulse), no horizontal overflow, prayer text readable without truncation.
- [ ] `./init.sh` and `PLAYWRIGHT_PORT=3301 npm run test:e2e` pass with evidence recorded in `feature_list.json` and `PROGRESS.md`; `ARCHITECTURE.md` updated.

## Scope Boundary Resolutions (seams for the follow-up Section 1 features)

1. **Server-side turn gate on `next_section` is deferred to `section-1-chosen-volunteer-prayer-gate`** together with its unlock path. This feature's "Leader cannot advance" behavior is the locked advance bar + absence of any advance control (Scenario 5). Rationale: a server lock with **no** unlock mechanism in scope (`Done`, leader override, and picker are all follow-ups) would deadlock every session at Section 1 and force a behavioral rewrite of the accepted `tests/integration/ws-session-lifecycle.test.ts` Scenario 4 (which advances `next_section` past `section_1_prayer`); "section advancement beyond what already exists" is explicitly out of scope. The seam is pre-reserved: the follow-up gates `next_section` on `volunteerTurn.completedAt` and unlocks via `complete_turn` (`memberId === volunteerTurn.selectedMemberId`, per `docs/technical-discovery.md`) — pure additions to a state model that already exists.
2. **`VolunteerTurnState` reserves the full `docs/domain-model.md` shape now** (`candidateMemberId`, `candidateExpiresAt`, `selectedMemberId`, `completedAt` — always `null` here) so `random-volunteer-picker-countdown` and `section-1-chosen-volunteer-prayer-gate` add commands (`choose_volunteer`, `pick_random`, `confirm_random`, `retry_random`, `override_turn`, `complete_turn` — names already reserved in `docs/technical-discovery.md`) **without any further snapshot-shape change** (and no further protocol bump).
3. **Queue rows carry `Lower` (this feature's clear/lower management), not `Choose` / `Pick Randomly`** — those controls and their behaviors are the follow-ups'; this feature completes `ux/4` only up to the queue + locked bar.
4. **`leaderPrompt` is not synced** (it is facilitator-facing; `SessionStudySummary` stays pastoral/facilitator-free by structure). The leader subtitle renders it from the locally held `StudyDocument` when available (default study re-fetches via `useStudySetup`) with the fixed fallback `Waiting for someone to volunteer to pray` (identical to the seed copy). `chosenVolunteerInstruction` **is** synced (participant-visible when chosen) but unused until the Done-gate feature. Rejected alternative: per-role snapshot projections — an architectural change out of scope.
5. **Full `volunteerTurn` rides the shared snapshot to every member** (participant UI shows the count per `ux/5`; the leader queue is a presentation choice, not a data boundary). Rationale: raised hands are public acts in an in-person gathering, the member roster (names/initials/palettes) is already in every snapshot, and the turn state carries no pastoral or secret data — so no per-recipient snapshot forking is introduced.

## Open Questions (non-blocking)

1. **Leader-scoped projections**: if validation prefers `leaderPrompt` (or future leader-only turn metadata) to never reach Participant sockets, the clean fix is viewer-scoped snapshots (`toPublicSnapshot(session, viewer)`) — tracked as a possible later refactor, not required here.
2. **Relative-timestamp skew**: `Raised … ago` derives from server-clock `raisedAt`; large client clock skew degrades labels only (state stays authoritative). A `serverNow` snapshot field could be added later if needed.
3. **Disconnected members' raised hands**: they persist (visible to the leader as "raised then left") until lowered/cleared; auto-expiry can be added if rehearsal shows it noisy.

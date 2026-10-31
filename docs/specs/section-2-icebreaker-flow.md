# Feature Implementation Spec: Icebreaker displays Outsiders Wanted prompt with live hand-raise count

## Source Feature

- `id`: section-2-icebreaker-flow
- `area`: section-2-icebreaker
- `depends_on`: section-1-chosen-volunteer-prayer-gate (accepted)
- `status`: not_started
- `source`: `feature_list.json`

Parallel-wave note (k=2/3): `random-volunteer-picker-countdown` and `mobile-wake-lock-foreground-resync` are being built concurrently from the same base commit. Keep edits to shared files (`src/shared/session.ts`, `src/server/sessionStore.ts`, `src/client/App.tsx`, `src/client/styles/global.css`) as small, self-contained hunks; put all new UI in a new `src/client/components/icebreaker/` module. Do not touch `src/client/lib/useLiveSession.ts`, `src/client/lib/sessionSocket.ts`, `src/shared/study.ts`, `src/server/studies/*`, or `src/client/components/prayer/*` (the wave-mates' and predecessors' territory) — reuse them via imports only.

## Goal

When the Study Leader advances out of Section 1, every client lands on the real Section 2 (Icebreaker, `SECTION 2 OF 5` / `40%`) "Outsiders Wanted" screen. The Study Leader sees the main outsider question, the italic follow-up, the facilitator-only "Examples to Listen For" card, a live hand-raise count, and the gold `Begin Reading →` control that advances to Section 3. Participants see the question, a warm bronze "Tap to raise your hand" orb, and the live count of raised hands, synchronized across all devices over the existing `/ws` machinery.

## Non-Goals

- Section 1 behavior, `random-volunteer-picker-countdown` (candidate/countdown/`pick_random` seams stay untouched), `mobile-wake-lock-foreground-resync`.
- Section 3 Gospel Reading content (after `Begin Reading`, clients land on the existing `SectionPlaceholderScreen` for `section_3_reading` — Gospel-only rule unchanged).
- A named raised-hands queue / volunteer selection in Section 2: hands mean "I want to share verbally" (docs/build-brief.md §5); the leader calls on people in the room. Count only.
- Any `next_section` semantic change beyond creating the Section 2 open-share turn (no new gate on Section 2 → 3; no auto-advance; no new commands).
- New Sacred3DScene stages or store changes (`resolveSacredStage` already maps `section-2-icebreaker`).

## Job Story

When the Opening Prayer turn is completed and the Study Leader begins the icebreaker,
I want both roles to see the "Outsiders Wanted" prompt with a live, synchronized count of raised hands,
so I can invite reflections from people who volunteer while facilitator guidance stays on the Study Leader's screen.

## Users And Permissions

- Study Leader: sees prompt + follow-up + facilitator-only examples/leader note (from the locally held `StudyDocument`), the live count, and `Begin Reading →` (`next_section`, server-gated as today).
- Participant: sees participant-visible prompt copy, toggles own hand via `raise_hand`/`lower_hand` (identity from socket binding), sees the live count. Never sees leader-only fields; has no advance control.

## Acceptance Scenarios

### Scenario 1: Both-role Section 2 content

Given a session advanced past the completed Opening Prayer turn
When clients render `section_2_icebreaker`
Then both roles show `SECTION 2 OF 5` / `40%` (`SectionProgressHeader`) and the "Outsiders Wanted" title with `ICEBREAKER · 10 MIN` eyebrow; the Study Leader sees the QUESTION card (main question + hairline divider + italic follow-up), the "EXAMPLES TO LISTEN FOR" card listing all `examplesToListenFor` plus the italic `leaderNote`, a live count pill, and `Begin Reading →`; the Participant sees the main question, italic follow-up, sub-copy "The leader will give you a moment to share your reflection.", the bronze orb, and the count pill; exactly one `<canvas>` is mounted and `grep -rn "Assistant" src/` stays empty.

### Scenario 2: Leader-only fields never reach Participants

Given the seed or any parsed study whose `IcebreakerSection` carries `leaderNote` and `examplesToListenFor`
When snapshots are broadcast and Participant screens render
Then no `/ws` snapshot and no Participant DOM contains `leaderNote`, `examplesToListenFor`, "Examples to Listen For", or any example string; the Study Leader screen still shows them (sourced from `localStudyDocument`).

### Scenario 3: Live hand-raise count sync

Given two Participants and the Study Leader in Section 2
When each Participant taps the orb (and one lowers, re-raises, and sends a duplicate `raise_hand` frame)
Then the count pill reads identically on all three screens at every step (0 → 1 → 2 → 1 → 2), the duplicate raise does not double-count, and the member order matches raise order.

### Scenario 4: Leader-only advance

Given Section 2 with any number of raised hands
When the Study Leader taps `Begin Reading →`
Then all clients advance to `SECTION 3 OF 5` / `60%` (Gospel Reading placeholder); Participants have no advance control; `next_section` requires no completion precondition in Section 2.

### Scenario 5: Reconnect and late join

Given raised hands in Section 2
When a Participant reloads or a new Participant joins
Then the snapshot restores the raised queue, the exact count, and the member's own raised state on all screens.

## Repository Research

### Files Inspected

- `src/shared/study.ts` — `IcebreakerSection`: `introText`, `mainQuestion`, `followUpQuestion`, `leaderNote` ("hidden from Participant views"), `examplesToListenFor` ("Study Leader listening cues; hidden from Participant views").
- `src/shared/session.ts` — protocol v3; `SessionOpeningPrayerContent` / `SessionStudySummary.openingPrayer` participant-only projection + bounded `normalizeSessionOpeningPrayerContent` (missing → `null` valid, present-invalid → `INVALID_MESSAGE`, smuggled keys dropped); `VolunteerTurnState` + reducers; `volunteerTurnModeForSection('section_2_icebreaker')` already returns `'open_share'`.
- `src/server/sessionStore.ts` — `next_section` (line ~1123) sets `volunteerTurn = null` on every advance; raise/lower gate (~1244) is `section_1_prayer`-only; `choose_volunteer` (~1017), `override_turn` (~1053), `complete_turn` (~1204) are already `section_1_prayer`-scoped (so they stay rejected in Section 2 — verify, do not change); `clear_hands` is leader-gated and turn-agnostic.
- `src/client/App.tsx` — `in_progress` renders `OpeningPrayerScreen` for `section_1_prayer`, else `SectionPlaceholderScreen`; already passes `localStudyDocument={studySetup.study}`.
- `src/client/components/prayer/OpeningPrayerScreen.tsx` — **established leader-only precedent**: `subtitle = isLeader ? localStudyDocument?.openingPrayer?.leaderPrompt ?? fallback : ...` (line ~138). Reuse this sourcing pattern for the examples card.
- `src/client/components/prayer/HandRaiseOrb.tsx` — `isRaised`/`disabled`/`onToggle`; optimistic toggle + `hand-raise` impulse + reduced-motion guards. Import unchanged (bronze via wrapper class + CSS overrides).
- `src/client/state/sacredStageStore.ts` — `resolveSacredStage({ screen: 'section-2-icebreaker' })` → `{ stage: 'sanctuary-emblem', accentMode: 'hospitality' }` already implemented (DESIGN.md override #3 "warm bronze/amber hospitality rings").
- `src/client/lib/useLiveSession.ts` — `setHandRaised`/`lowerHand`/`nextSection` already exist; no changes needed.
- `tests/integration/ws-hand-raise.test.ts` (~401), `tests/integration/ws-volunteer-gate.test.ts` (~286), `tests/e2e/section-1-chosen-volunteer-prayer-gate.spec.ts` (6 placeholder assertions) — the compat surfaces below.
- `DESIGN.md`, `ux/7. Ice Breaker - Leader.png`, `ux/8. Ice Breaker - Assistant.png`, `docs/domain-model.md`, `docs/build-brief.md` §5, `docs/user-and-access-model.md`, `docs/technical-discovery.md`, `docs/risks-and-open-questions.md`, `PROGRESS.md` (Sessions 020–024).

### Existing Patterns To Follow

- Participant-only wire projection + bounded allow-list normalization (openingPrayer precedent), leader-only copy from `localStudyDocument`, full-snapshot `session_updated` fan-out with `requestId` echo, deep-copied snapshots with secret/pastoral stripping, `SectionProgressHeader` reuse, Session 021–022 e2e hardening (60s suite / 15s expects / never-throwing bounded `closeLiveSession` / `Promise.allSettled` closes).

### Current Gaps

- No Section 2 screen (placeholder only); `SessionStudySummary` carries no icebreaker copy; `volunteerTurn` is cleared on `next_section` and raise/lower is Section-1-only.

## Technical Approach

**Privacy decision (participant-visible vs leader-only).** Wire field `SessionIcebreakerContent` = `{ title, eyebrow, durationLabel, introText, mainQuestion, followUpQuestion }` — the group-facing prompt (the seed labels only `leaderNote` and `examplesToListenFor` as "hidden from Participant views", and the follow-up is group discussion copy). `leaderNote` and `examplesToListenFor` NEVER cross `/ws`: excluded from the projection and normalization allow-lists so snapshots cannot carry them. The Study Leader's "Examples to Listen For" card renders `localStudyDocument.icebreaker.examplesToListenFor` + `leaderNote` via the accepted `localStudyDocument` pattern (same provenance and same reload limitations as `OpeningPrayerScreen`'s `leaderPrompt`; when unavailable, render a neutral "Facilitator examples unavailable on this device." note — never seed content from a different study). Scope of the guarantee is the wire and role-scoped DOM (the default seed remains publicly fetchable via `GET /api/studies/default` — accepted, unchanged).

**State model.** Reuse `VolunteerTurnState` as-is, section-scoped: on `next_section` the server replaces `volunteerTurn = null` with `createVolunteerTurnForSection('section_2_icebreaker')` (`mode: 'open_share'`, empty `raisedHands`, reserved `candidate*`/`selected*`/`completed*` all `null` and never touched in Section 2). The live count is derived client-side as `volunteerTurn.raisedHands.length` — no new wire field. Raising reuses `raise_hand`/`lower_hand` verbatim (idempotent re-raise keeps `raisedAt`; lower removes; one entry per member; first-come order); the only server change is widening the raise/lower state gate from `section_1_prayer`-only to accept `section_2_icebreaker` (require `in_progress`, non-null `volunteerTurn`, and `volunteerTurn.sectionId === currentSectionId`). `clear_hands` works unchanged. `open_share` never completes: Section 2 → 3 is the leader's unconditional `next_section` (the Section-1-scoped completion gate is untouched), which discards the Section 2 turn (`volunteerTurn` back to `null` for `section_3_reading`). Reconnect/late-join resync comes free from full-snapshot broadcasts (deep-copied `volunteerTurn` already flows). `choose_volunteer`/`override_turn`/`complete_turn` remain `INVALID_STATE_TRANSITION` in Section 2 (their gates are already `section_1_prayer`-scoped — lock in with tests, do not modify).

**Protocol (strictly additive, stays at `SESSION_PROTOCOL_VERSION = 3`** — same convention as `choose_volunteer`/`complete_turn` in Session 023): add `SessionIcebreakerContent`, `toSessionIcebreakerContent(section)`, `normalizeSessionIcebreakerContent(raw)`, and `SessionStudySummary.icebreaker?: SessionIcebreakerContent | null` wired into `toSessionStudySummary` / `normalizeSessionStudySummary` (missing → `null` valid; present-invalid → `INVALID_MESSAGE`; smuggled keys dropped). No new commands, messages, or error codes; `load_study` needs no server change. Bounds: `title` ≤ 120, `eyebrow`/`durationLabel` ≤ 200 (existing constants), `introText`/`mainQuestion`/`followUpQuestion` ≤ new `SESSION_STUDY_SUMMARY_MAX_QUESTION_LENGTH = 1000` (custom-study questions exceed the 200-char field bound; mirrors the 2000-char prayer-text precedent).

**UI (DESIGN.md + ux/7 / ux/8).** New `src/client/components/icebreaker/IcebreakerScreen.tsx` (role-aware via `role === 'Study Leader'`, `data-testid="icebreaker-screen"`, `data-role`), `IcebreakerPromptCard.tsx` (QUESTION card: `#1F2442` surface, gold `QUESTION` eyebrow, main question in editorial serif `#F8FAFC`, hairline divider, italic serif follow-up `#E2E8F0` 1rem–1.1rem), `ExamplesToListenForCard.tsx` (leader-only), `HandRaiseCountPill.tsx` (emerald dot + `N PEOPLE HAVE RAISED THEIR HAND`, singular `1 PERSON HAS…`). Participant: `SHARE WHEN READY` gold eyebrow (0.75rem/600/0.12–0.15em tracking), Playfair hero = full `mainQuestion`, italic `followUpQuestion`, fixed sub-copy, reused `HandRaiseOrb` (bronze treatment via wrapper class + appended `global.css` overrides — no edits to `prayer/HandRaiseOrb.tsx`; if descendant overrides prove impractical, the documented fallback is an optional additive `tone` prop), labels "Tap to raise your hand" / "Tap again to lower". Leader: eyebrow `ICEBREAKER · 10 MIN` (`{eyebrow} · {durationLabel}`), Playfair "Outsiders Wanted", `introText`, prompt card, examples card, count pill, sticky gold `Begin Reading →` CTA (56px, dark ink `#11131F`, spring press `scale 0.96 / stiffness 420 / damping 26`) wired to `nextSection`. Stage wiring mirrors `OpeningPrayerScreen`: `resolveSacredStage({ screen: 'section-2-icebreaker' })` → `sanctuary-emblem` + `hospitality` accent on mount. Count-pill number transitions use `motion/react` with `usePrefersReducedMotion` guards; layout scrolls above the sticky CTA; ≥ 44px tap targets; ≥ 16px font on any input; no horizontal overflow at 320px; `env(safe-area-inset-*)` respected. `App.tsx` gains one branch: `currentSectionId === 'section_2_icebreaker'` → `IcebreakerScreen` (props: `role`, `session`, `localStudyDocument`, `onToggleHandRaised`, `onNextSection`) between `OpeningPrayerScreen` and the `SectionPlaceholderScreen` fallback.

## Expected File Changes

- `src/shared/session.ts` — modify (additive: `SessionIcebreakerContent`, `SESSION_STUDY_SUMMARY_MAX_QUESTION_LENGTH`, `toSessionIcebreakerContent`, `normalizeSessionIcebreakerContent`, `SessionStudySummary.icebreaker`, two wiring lines).
- `src/server/sessionStore.ts` — modify (two localized hunks only: raise/lower gate widening in `handleTurnCommand`; `next_section` turn creation for `section_2_icebreaker` in place of `volunteerTurn = null`).
- `src/client/App.tsx` — modify (one routing branch + import).
- `src/client/components/icebreaker/*` — create (`IcebreakerScreen.tsx`, `IcebreakerPromptCard.tsx`, `ExamplesToListenForCard.tsx`, `HandRaiseCountPill.tsx`).
- `src/client/styles/global.css` — modify (append-only `icebreaker-*` block at end; no existing selector edited).
- `src/client/lib/useLiveSession.ts`, `src/client/lib/sessionSocket.ts`, `src/shared/study.ts`, `src/server/studies/*`, `src/client/components/prayer/*`, `src/client/state/sacredStageStore.ts` — NO CHANGES (import/reuse only; called out to minimize parallel-wave conflicts).
- Tests: `tests/unit/icebreaker-content.test.ts` (new), `tests/unit/icebreaker-screen.test.tsx` (new), `tests/integration/ws-icebreaker-hand-raise.test.ts` (new), `tests/e2e/section-2-icebreaker.spec.ts` (new).
- `ARCHITECTURE.md` — update (protocol v3 summary + `components/icebreaker/` surface). `feature_list.json`, `PROGRESS.md` — implementer/validator evidence.

**Documented compat edits (exactly these three files; each is forced by intentionally changed product behavior — record justification in `feature_list.json`):**

1. `tests/integration/ws-hand-raise.test.ts` (`gates hand raises…` ~line 401): after `next_section`, `volunteerTurn` is now the fresh `{ sectionId: 'section_2_icebreaker', mode: 'open_share', raisedHands: [], candidate*/selected*/completedAt: null }` turn (replace `toBeNull()`), raises are now accepted in Section 2 (assert fan-out/queue), and the `INVALID_STATE_TRANSITION` rejection moves to after a second `next_section` into `section_3_reading`.
2. `tests/integration/ws-volunteer-gate.test.ts` (~line 286): `expect(advanced.session.volunteerTurn).toBeNull()` → assert the fresh Section 2 open-share turn (reserved fields still `null`; the assigned prayer turn is gone). Scenario intent unchanged.
3. `tests/e2e/section-1-chosen-volunteer-prayer-gate.spec.ts` (6 spots: ~318/323/579/586/645/646): `section-placeholder` → `icebreaker-screen` testid; keep the `SECTION 2 OF 5` / `40%` assertions (shared `SectionProgressHeader` persists). The predecessor spec declared the placeholder provisional for this feature.

`tests/integration/ws-session-lifecycle.test.ts` Scenario 4 asserts section ids only — verify untouched. All other accepted suites must pass unchanged.

## Visual Design Impact

- UI involved: yes. Design source: `DESIGN.md` (overrides #1/#3/#4, Colors, Typography, Motion) + `ux/7. Ice Breaker - Leader.png`, `ux/8. Ice Breaker - Assistant.png`.
- Screens/states affected: new Section 2 leader view, new Section 2 participant view (0/1/N raised states; localStudyDocument-missing fallback), Section 2 → 3 transition.
- Deviations to document in evidence: ux/8's condensed hero renders as the full `mainQuestion` (content-complete for custom studies); the italic `followUpQuestion` renders on the participant view under the hero (prompt is group-facing per the privacy decision); the leader count pill is required by the feature text though ux/7 omits it (place it adjacent to `Begin Reading →`); both roles keep the shared `SECTION 2 OF 5` header instead of ux/8's compact eyebrow.
- New design artifact required: no.

## Durable Documentation Impact

- `ARCHITECTURE.md`: update — protocol v3 summary gains `SessionIcebreakerContent`/`SessionStudySummary.icebreaker` (participant-only, never `leaderNote`/`examplesToListenFor`), the Section 2 surface + `components/icebreaker/` module, the `next_section` Section 2 turn creation, and the widened raise/lower gate.
- `CONSTRAINTS.md`: not needed — no new invariants (server-gated advancement, secret/pastoral stripping, Gospel-only Section 3 all unchanged and re-verified).
- `AGENTS.md`: not needed — workflow and repo rules unchanged.
- Other docs: `docs/domain-model.md` / `docs/build-brief.md` not needed — implemented behavior matches them. `feature_list.json` + `PROGRESS.md` updated at implementation/validation time.

## Implementation Plan

1. Shared contract: `src/shared/session.ts` additions + unit tests (`icebreaker-content.test.ts`).
2. Server: widen raise/lower gate; create the Section 2 open-share turn in `next_section`; integration tests (`ws-icebreaker-hand-raise.test.ts`) + the two integration compat edits.
3. Client: `components/icebreaker/` screens + `App.tsx` branch + appended CSS; unit tests (`icebreaker-screen.test.tsx`).
4. E2E: `tests/e2e/section-2-icebreaker.spec.ts` + the chosen-gate spec compat edit; full verification; `ARCHITECTURE.md`, `feature_list.json`, `PROGRESS.md`.

## Implementation Tasks

- [ ] Add `SessionIcebreakerContent`, bounds constant, projection + allow-list normalizer, and `SessionStudySummary.icebreaker` wiring in `src/shared/session.ts`.
- [ ] Widen the `raise_hand`/`lower_hand` state gate to `section_2_icebreaker` and replace `next_section`'s `volunteerTurn = null` with `createVolunteerTurnForSection('section_2_icebreaker')` when entering Section 2 (else `null`) in `src/server/sessionStore.ts`.
- [ ] Create `src/client/components/icebreaker/` (four components above), reusing `HandRaiseOrb`, `SectionProgressHeader`, `useLiveSession` actions, and the `localStudyDocument` leader-only pattern; wire the `section-2-icebreaker` stage context.
- [ ] Add the `App.tsx` routing branch and the append-only `icebreaker-*` CSS (bronze orb recolor, `#1F2442` question card, count pill, sticky gold CTA, reduced-motion guards).
- [ ] Add `tests/unit/icebreaker-content.test.ts` and `tests/unit/icebreaker-screen.test.tsx` (scenarios 1–2, pluralization, fallbacks, ≥ 16px / ≥ 44px floors over `global.css`, ≤ 1 canvas, 320px overflow, zero `Assistant`).
- [ ] Add `tests/integration/ws-icebreaker-hand-raise.test.ts` (scenarios 2–5 at the wire: turn lifecycle, raise/lower/clear matrices, Section-1-scoped command rejections in Section 2, unconditional Section 2 → 3 advance, deep-copy/secret/pastoral stripping, reconnect/late-join).
- [ ] Apply the three documented compat edits exactly as listed above (no other accepted-test changes).
- [ ] Add `tests/e2e/section-2-icebreaker.spec.ts` with Session 021–022 hardening (see Verification Plan) covering scenarios 1–5 with leader + 2 Participant contexts on `390x844`.
- [ ] Update `ARCHITECTURE.md`; run the full verification; record evidence in `feature_list.json` and `PROGRESS.md`.

## Verification Plan

- `./init.sh` — executes the non-blocking standard gate (`npm run typecheck` ×3 configs, `npm test`, `npm run build`); must not start long-running servers. Expected: exit 0, new unit/integration suites included in the Vitest counts.
- `PLAYWRIGHT_PORT=3302 npm run test:e2e` — full mobile-chromium 390x844 suite, run TWICE consecutively; both runs exit 0 and `ws-room-lifecycle.spec.ts` is green in both (no leaked sessions). The new spec must carry `test.describe.configure({ timeout: 60_000 })`, `expect.configure({ timeout: 15_000 })`, a never-throwing bounded `closeLiveSession` (≤ 2s WebSocket waits, internal try/catch, 5s outer race), and `Promise.allSettled` context closes in every `finally` block.
- `grep -rn "Assistant" src/` — 0 matches (exit 1).
- Privacy assertions: participant DOM lacks "Examples to Listen For", all 8 seed example strings, and `leaderNote`/`examplesToListenFor` keys (e2e); raw `/ws` snapshot JSON scans assert the same for every broadcast frame (integration).
- Optional validator smoke: raw `/ws` against `PORT=3202 node dist/server/index.js` — `next_section` into `section_2_icebreaker` emits the open-share turn + `study.icebreaker` without leader-only keys; raise/lower/clear accepted; `choose_volunteer`/`complete_turn`/`override_turn` rejected `INVALID_STATE_TRANSITION`; second `next_section` advances to `section_3_reading` unconditionally and clears the turn.

## Evidence To Capture

- Exact command results (Vitest file/test counts incl. new suites; both e2e run totals; `grep` output) in `feature_list.json` evidence + `PROGRESS.md` session log.
- Named test coverage: `icebreaker-content`, `icebreaker-screen`, `ws-icebreaker-hand-raise`, `section-2-icebreaker.spec.ts` scenario mapping.
- The three compat edits with per-assertion justification (product behavior intentionally changed; scenario intents preserved).
- Privacy proof: participant DOM/wire scans; leader-only card provenance (`localStudyDocument`).
- Documented design deviations (see Visual Design Impact) and any honest notes (e.g., non-reproducible single runs must be labeled as such, per Sessions 020–022).

## Validator Checklist

- [ ] Implementation stays within this feature's scope (no picker/countdown, wake-lock, or Section 3 content work).
- [ ] Acceptance scenarios 1–5 pass; Section 1 suites pass with only the three documented compat edits.
- [ ] Leader-only fields never cross `/ws` or render in Participant DOM; server gating unchanged or strictly widened for Section 2 raises.
- [ ] Protocol additions are strictly additive at v3; no new commands; reserved `candidate*`/`selected*`/`completed*` seams untouched for the wave-mates.
- [ ] Persistent E2E coverage added (`PLAYWRIGHT_PORT=3302`, hardening patterns present) and the gate is reproducible (2 consecutive green full runs, `ws-room-lifecycle` green).
- [ ] `feature_list.json` and `PROGRESS.md` updated with evidence; `./init.sh` still exits 0; `grep -rn "Assistant" src/` is empty; single persistent `Sacred3DScene` canvas; DESIGN.md floors (≥ 16px / ≥ 44px, reduced-motion) hold.

## Open Questions / Unknowns

- Count-pill placement on the leader screen is design latitude (ux/7 omits it; the feature requires it) — default: adjacent to `Begin Reading →`.
- A custom study whose `mainQuestion`/`followUpQuestion`/`introText` exceeds 1000 chars would fail `load_study` with `INVALID_MESSAGE` (inherited bounded-normalization seam class, same as the openingPrayer bounds) — acceptable; parser bounds are unchanged.
- `localStudyDocument` provenance after a Study Leader mid-session reload mirrors the accepted `OpeningPrayerScreen` `leaderPrompt` limitation (default-study re-fetch); the neutral fallback note covers it.

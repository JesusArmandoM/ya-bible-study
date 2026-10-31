# Feature Implementation Spec: Random Selection picks eligible Participant with 30-second countdown

## Source Feature

- `id`: `random-volunteer-picker-countdown`
- `area`: `volunteer-selection`
- `depends_on`: `["section-1-chosen-volunteer-prayer-gate"]` (accepted)
- `status`: `not_started`
- `source`: `feature_list.json`

## Goal

Fill the seams the predecessor pre-reserved: the Study Leader taps the violet `Pick Randomly` pill in Section 1 (`ux/4`), the server fairly picks an eligible connected `Participant`, and every client shows the `ux/9` Random Selection state — candidate highlighted with a server-authoritative **30-second countdown** (`candidateExpiresAt`) and terracotta notification card — while the leader gets `Retry` (re-roll) and `Confirm selection`. Confirm hands the candidate into the **existing** chosen-volunteer Done gate unchanged (`selectedMemberId` → `YOU WERE CHOSEN` → `Done` / `override_turn` → `next_section` gate). Countdown authority lives on the server clock/timer; clients can only render it.

## Non-Goals

- **Section 2 content** (`section-2-icebreaker-flow`) and **wake lock / foreground resync** (`mobile-wake-lock-foreground-resync`) — parallel wave-mates; do not touch their surfaces.
- Any change to `choose_volunteer` / `complete_turn` / `override_turn` semantics or their error precedence (incl. target-validation-before-state-gate), or to `applySelectVolunteer` / `applyCompleteTurn` / `volunteerTurnPhase` behavior (frozen; accepted tests pin them).
- Section 3 usage (`section-3-gospel-reading-turn` wires this machinery later); `next_section` semantics beyond reusing the established gate; `Done Reading` copy.
- A participant "accept" command (none is reserved; leader `Confirm selection` is the sole `random_pending → assigned` transition — the countdown copy "has 30 seconds to accept" is UX, see Open Questions).
- New snapshot fields (candidate fields exist), protocol bump, persistence, external services/APIs, any RNG other than the injected `node:crypto` seam.

## Job Story

When nobody has raised a hand and the group is stuck on the Opening Prayer,
I want to tap `Pick Randomly` and see a fair candidate with a 30-second countdown I can `Retry` or `Confirm`,
so the study keeps moving without putting anyone on the spot — and the chosen person still gets the calm `YOU WERE CHOSEN` → `Done` flow.

## Users And Permissions

- **`Study Leader`**: `Pick Randomly` / `Retry` / `Confirm selection` (`pick_random` / `retry_random` / `confirm_random`, `leaderToken`-gated) and every established control (queue `Choose`, `Mark done (Leader override)`, advance CTA). Never sees `Done`.
- **`Participant`**: sees the shared countdown state and, if picked, the highlighted candidate card; NO `Pick Randomly` / `Retry` / `Confirm selection` node in participant DOM (exact strings asserted). No new participant command exists — identity stays socket-binding based.
- **Terminology Invariant**: `Study Leader` / `Participant` only; zero forbidden legacy-role word in `src/`; Section 3 stays Gospel-only (untouched).

## Acceptance Scenarios

### Scenario 1: Pick → countdown → Confirm → YOU WERE CHOSEN → Done → advance

Given the leader and two Participants are in Section 1 with no raised hands
When the leader taps `Pick Randomly`
Then all clients show the `random-selection-panel` (`RANDOM SELECTION` pill, candidate avatar/name, "has been randomly chosen to pray.", terracotta `Notification sent` card with a ticking `0:{ss}` countdown) and snapshots carry `volunteerTurn.candidateMemberId` / `candidateExpiresAt = now + 30s` (`volunteerTurnPhase` = `random_pending`)
When the leader taps `Confirm selection`
Then `selectedMemberId = candidateMemberId`, `candidate*` clear, and the candidate alone gets the existing `YOU WERE CHOSEN` view + `Done`; `Done` unlocks the gold `Continue to Section 2 →` CTA and `next_section` advances (existing gate).

### Scenario 2: `Retry` re-rolls to a different eligible Participant

Given `random_pending` with candidate A (two eligible Participants)
When the leader taps `Retry`
Then the server picks uniformly among eligible Participants **excluding A** (with exactly two eligible: the other Participant) and resets the 30s timer; with a single eligible Participant, `Retry` re-picks them with a reset timer (never deadlocks).

### Scenario 3: The gating negative matrix is enforced on the `/ws` server

Given any connected client
Then participant `pick_random` / `retry_random` / `confirm_random` → `FORBIDDEN_LEADER_ONLY`; wrong-token → `UNAUTHORIZED_LEADER`
And `pick_random` while `random_pending` (Retry is the re-roll), while `assigned`, after `turn_completed`, in `lobby`, or with no open turn → `INVALID_STATE_TRANSITION`; `retry_random` / `confirm_random` outside `random_pending` → `INVALID_STATE_TRANSITION`
And `confirm_random` after the window elapsed (even before the expiry timer fires) → `INVALID_STATE_TRANSITION` ('The random selection window has expired…')
And `pick_random` / `retry_random` with zero connected Participants → `INVALID_STATE_TRANSITION`.

### Scenario 4: Server-authoritative expiry and the empty-pool disabled state

Given `random_pending` and no `Confirm selection` within 30s
Then the server clears `candidate*` and broadcasts `session_updated` with `command: 'random_expired'`; every client drops the panel back to `collecting_hands` (aria-live expiry announcement) and the leader may pick again, choose manually, or override
Given zero connected Participants
Then `Pick Randomly` is disabled with a clear note (graceful disabled state) and the server still rejects if invoked.

### Scenario 5: Disconnects, reconnects, and hand churn never corrupt the countdown

Given the candidate disconnects mid-countdown
Then `candidate*` persist (selection is never revoked by disconnect), the panel shows `· reconnecting`, and the leader may still Confirm (the established assigned-state disconnect handling + override applies) or Retry
And reload / late join rehydrate the panel with the **remaining** seconds derived from the absolute `candidateExpiresAt`; `raise_hand` / `lower_hand` / `clear_hands` during `random_pending` never touch `candidate*`; snapshots keep stripping `leaderPin` / `leaderToken` / `reconnectToken` and carry no pastoral fields.

## Repository Research

### Files Inspected

- `feature_list.json` / `PROGRESS.md` (Sessions 020–024) — predecessor accepted; Sessions 021–022 e2e hardening (60s suite / 15s expects / never-throwing bounded cleanup) is mandatory here; Session 024 note: `candidate*`/`random_pending`/`pick_random` seams and the target-before-state-gate precedence are **established behavior**.
- `docs/specs/section-1-chosen-volunteer-prayer-gate.md` — pre-reserved seams (`candidate*`, `random_pending`, `pick_random`/`confirm_random`/`retry_random`, "no further protocol bump"), frozen commands/reducers, compat-edit precedent.
- `docs/domain-model.md` (VolunteerTurn lifecycle `random_pending`; "Zero volunteers raise hand" scenario — the pool is **connected Participants**), `docs/user-and-access-model.md` (leader exclusivity, revocation/override), `docs/technical-discovery.md` (reserved command names; leaderToken validation list), `docs/risks-and-open-questions.md`.
- `DESIGN.md` + `ux/4. Prayer - Leader waiting.png` + `ux/9. Randomizing.png` (both viewed: violet full-width `Pick Randomly` dice pill under the queue; `RANDOM SELECTION` pill, avatar, Playfair name, "has been randomly chosen to read", terracotta `Notification sent` card, `Retry` dark pill + `Confirm selection` gold pill).
- `src/shared/session.ts` — `VolunteerTurnState` (candidate fields reserved-null), `volunteerTurnPhase` (already derives `random_pending` when `candidateMemberId != null` — **no behavior change needed**), `LeaderCommandType` / `SessionUpdatedCommand` (auto-widening pattern), reducer precedents.
- `src/server/sessionStore.ts` — `handleLeaderCommand` order (participant-block → timing-safe `leaderToken` → memberId match → per-command gates), `handleTurnCommand`, `toPublicVolunteerTurn` deep copy, `LiveSessionStoreOptions` injectable seams (`now`, token/id generators), TTL sweep + `dispose`.
- `src/client/lib/sessionSocket.ts` (`sendLeaderCommand` default fall-through already frames no-payload leader commands), `src/client/lib/useLiveSession.ts`, `src/client/App.tsx` (OpeningPrayerScreen wiring), `src/client/components/prayer/*`, `src/client/state/sacredStageStore.ts` (`random-polyhedron`, `isRandomizing`, `random-spin` / `confirm-burst` impulses all **already exist**; `sacredStageMath` handles them), `src/client/styles/global.css` (structure known via ARCHITECTURE.md; append-only edits planned).
- Test seams: `tests/integration/ws-volunteer-gate.test.ts` (BufferedPeer harness, `LiveSessionStore` options injection), `tests/e2e/section-1-chosen-volunteer-prayer-gate.spec.ts` (hardened `closeLiveSession`, raw `/ws` probe pattern), `tests/unit/volunteer-turn-gate.test.ts` (pins reducer behavior incl. "candidate* untouched" — our new reducers must not alter those), `playwright.config.ts` (`PLAYWRIGHT_PORT`, 390x844 mobile-chromium), `init.sh`.

### Existing Patterns To Follow

Full-snapshot broadcast + `requestId` echo; leader commands via `handleLeaderCommand`; pure reducers in `src/shared/session.ts` shared by server + unit tests; injected `now`/generators in `LiveSessionStoreOptions`; `motion/react` springs + `AnimatePresence` + `usePrefersReducedMotion`; multi-context `/join/:code` e2e with raw `/ws` cleanup; new UI in new files with append-only `global.css`.

### Current Gaps

`pick_random` / `confirm_random` / `retry_random` untyped/unimplemented; `candidate*` never set; no countdown UI; `Pick Randomly` CTA unrendered; no RNG/countdown seams on `LiveSessionStore`.

## Technical Approach

1. **Protocol: stay at `SESSION_PROTOCOL_VERSION = 3`, strictly additive — no bump.** The v3 contract pre-reserved exactly these names and fields "without any further snapshot-shape change (and no further protocol bump)" (predecessor Resolution 2); this feature performs the same class of union widening the predecessor did at v3. Add to `src/shared/session.ts`:
   - `LeaderCommandType += 'pick_random' | 'confirm_random' | 'retry_random'` (leader envelope `{ type, sessionCode, leaderToken, memberId?, requestId? }` — no target fields). `SessionUpdatedCommand` auto-widens for the three commands, and gains the explicit server-initiated label `'random_expired'` (broadcast-only; never accepted from clients — additive union widening, no exhaustive consumers exist).
   - `RANDOM_SELECTION_COUNTDOWN_MS = 30_000`.
   - Pure reducers: `applyStageRandomCandidate(turn, candidateMemberId, isoExpiresAt)` (sets both candidate fields — `pick_random` + `retry_random`), `applyConfirmRandomCandidate(turn)` (**composes the frozen `applySelectVolunteer(turn, turn.candidateMemberId)`** then clears `candidate*`), `applyClearRandomCandidate(turn)` (expiry). Pure helpers: `eligibleRandomCandidateIds(members)` (role `Participant` **and** `connectionStatus === 'connected'`, in join order) and `remainingCountdownSeconds(candidateExpiresAt, nowMs)` (clamped `0..30`, display-only).
   - Comment-only updates where "RESERVED"/"unreachable" claims go stale. **No behavior change** to `volunteerTurnPhase` (it already yields `random_pending`), `applySelectVolunteer`, `applyCompleteTurn`. No snapshot-shape change.
2. **Countdown state machine (server-authoritative).** Phases come from the frozen `volunteerTurnPhase`; the countdown adds transitions on `random_pending` (sub-state "window open/expired" = `candidateExpiresAt` vs server clock):
   - `collecting_hands --pick_random--> random_pending`: uniform pick from `eligibleRandomCandidateIds` (empty pool → `INVALID_STATE_TRANSITION`); stage candidate + `candidateExpiresAt = now + 30s`; schedule one unref'd per-session `randomExpiryTimer` (`randomCountdownMs`); broadcast `pick_random`.
   - `random_pending --retry_random--> random_pending`: re-pick excluding the current candidate; if that pool is empty fall back to the full eligible pool (single-Person re-pick with reset timer); full pool empty → `INVALID_STATE_TRANSITION`. **Valid even after window expiry** (domain: expiry "prompts the leader to `Retry`"). Reschedules the timer; broadcast `retry_random`.
   - `random_pending --confirm_random (window open)--> assigned`: `applyConfirmRandomCandidate` → the existing `YOU WERE CHOSEN` / `Done` gate takes over untouched. After expiry (lazy `candidateExpiresAt > now` check, even pre-timer) → `INVALID_STATE_TRANSITION`.
   - `random_pending --timer elapses--> collecting_hands`: timer clears `candidate*` and broadcasts `command: 'random_expired'`; guard cancels silently when `selectedMemberId != null || completedAt != null` (e.g. manual `choose_volunteer` or `override_turn` superseded the pick — those established paths stay byte-identical; a stale staged candidate is inert because `assigned`/`turn_completed` win phase derivation and `retry/confirm/pick` gates reject).
   - `assigned` / `turn_completed --pick_random--> INVALID_STATE_TRANSITION` (reassignment remains `choose_volunteer`'s established revoke-then-assign job). Cancel the timer in `next_section`, `closeAndPurgeSession`, `dispose`.
   - **Eligibility (decision)**: eligible = **connected Participants** — NOT the raised-hand queue. `docs/domain-model.md`'s defining scenario is "Zero volunteers raise hand → Random Selection", and `feature_list.json` verification says "among connected Participants"; raised-hand membership is not required (matching `choose_volunteer`'s established server-side rule).
   - Reconnect/resync: candidate state is session state in the shared snapshot; reload/late-join rehydrate `candidate*` and clients derive remaining seconds from the absolute `candidateExpiresAt` (display-only clamp; no client input can set/extend it).
3. **Server (`src/server/sessionStore.ts`, localized additions; established blocks untouched):** `LiveSessionStoreOptions += randomCountdownMs?` (default 30_000 — integration tests use ~100ms) and `pickRandomIndex?: (maxExclusive: number) => number` (default `crypto.randomInt(0, max)` — the deterministic-testable RNG seam; no external services). Add the three names to the `handleLeaderCommand` case list; each command validates after the established participant-block → timing-safe `leaderToken` → memberId-match chain. Shared state gate for all three: `status === 'in_progress' && volunteerTurn != null && volunteerTurn.sectionId === currentSectionId && completedAt == null` (section-neutral message) — a deliberate forward-compat seam for `section-3-gospel-reading-turn` (which must then widen the three frozen commands' `section_1_prayer` predicates in its own scope); then the per-command phase gates above. Small `broadcastRandomExpiry(session)` fan-out (like `broadcastRosterUpdated`) sends `session_updated { command: 'random_expired' }`.
4. **Client:** `src/client/lib/sessionSocket.ts` needs **no change** (default `sendLeaderCommand` fall-through frames the three commands once `LeaderCommandType` widens — verify with unit assertions). `src/client/lib/useLiveSession.ts` needs **no change** — instead a NEW `src/client/lib/useRandomSelection.ts` hook exposes `pickRandom` / `retryRandom` / `confirmRandom` over `client.sendLeaderCommand` (same shared client → `session_error` surfaces through the existing error path). This keeps two shared wave files untouched.
5. **UI** (`DESIGN.md` Sacred Midnight tokens; NEW `src/client/components/random/RandomSelectionPanel.tsx` exporting both views):
   - `RandomPickButton`: full-width violet `button-random` pill (`#B855C8`, 54px, dice icon, `random-pick-button`, `whileTap` spring 420/26 + haptic) rendered under the leader queue per `ux/4`; **disabled** with `random-empty-note` when `connectedParticipantCount === 0`.
   - `RandomSelectionPanel` (per `ux/9`, Section-1 copy "has been randomly chosen to pray."): `RANDOM SELECTION` eyebrow pill (violet outline, generous padding — override #4), candidate avatar circle + Playfair name, terracotta `random-notification-card` (`#9A4A38` tint / `#E07A5F` bell, "Notification sent", "{name} has 30 seconds to accept.") with live `random-countdown` `0:{ss}` (1s tick from `candidateExpiresAt`, `role="timer"` + `aria-live="polite"`), `· reconnecting` suffix for a disconnected candidate, and leader-only `Retry` (dark secondary pill, refresh icon, ≥ 44px) + `Confirm selection` (gold `button-primary`, 56px). `AnimatePresence` enter/exit (`springMorph` 280/28, instant under reduced motion).
   - `OpeningPrayerScreen.tsx` (localized): props += `onPickRandomly` / `onRetryRandom` / `onConfirmRandom`; derive `phase = volunteerTurnPhase(turn)`; render the panel in **every** role branch while `random_pending` (leader: between heading and advance zone — `LeaderAdvanceZone` override stays reachable; participants: replacing the orb). Stage: `resolveSacredStage({ ..., isRandomizing: phase === 'random_pending' })` → pre-existing `random-polyhedron`; impulses `random-spin` on `pick_random`/`retry_random`, `confirm-burst` on `confirm_random` (mirror the existing `completion-pulse` effect). Single persistent `Sacred3DScene` untouched.
   - Participant DOM must not contain the exact strings `Pick Randomly`, `Retry`, `Confirm selection`. All controls ≥ 44px, text ≥ 16px, no horizontal overflow at `390x844`, reduced-motion honored, countdown announced via `aria-live`.

## Expected File Changes

- `src/shared/session.ts` — modify (additive union widening + new reducers/helpers/constants + comment fixes). No version bump.
- `src/server/sessionStore.ts` — modify (three command blocks, RNG/countdown seams, expiry timer + `random_expired` broadcast, timer cancellation).
- `src/client/lib/useRandomSelection.ts` — create; `src/client/components/random/RandomSelectionPanel.tsx` — create.
- `src/client/components/prayer/OpeningPrayerScreen.tsx` — modify (localized); `src/client/App.tsx` — modify (wire 3 callbacks); `src/client/styles/global.css` — modify (append `.random-*` block).
- `src/client/lib/sessionSocket.ts`, `src/client/lib/useLiveSession.ts`, `src/shared/session.ts` reducers of the predecessor — **no behavioral change** (wave-conflict minimization).
- Tests — create: `tests/unit/random-selection-state.test.ts`, `tests/unit/random-selection-screen.test.tsx`, `tests/integration/ws-random-selection.test.ts`, `tests/e2e/random-volunteer-picker-countdown.spec.ts`; extend `tests/unit/session-socket.test.ts` (pure additions). **No compat edits to accepted suites expected** (no new gates on established flows; `volunteer-turn-gate.test.ts` already expects `random_pending` derivation).
- `ARCHITECTURE.md` — modify. `feature_list.json` / `PROGRESS.md` — evidence at completion.

## Visual Design Impact

- UI involved: yes. Design source: `DESIGN.md` + `ux/4` + `ux/9` (both viewed). Screens affected: Section 1 leader (queue + `Pick Randomly`, countdown panel) and all-role `random_pending` panel.
- New design artifact required: no — palette (violet `#B855C8` random actions, gold `#E2A83E` `Confirm selection`, terracotta `#9A4A38`/`#E07A5F` notification card), motion constants, and layout are specified. Mockup adjustment: `ux/9` says "to read" (Section 3 mockup) → Section 1 renders "has been randomly chosen to pray." via a `chosenLine` prop.

## Durable Documentation Impact

- `ARCHITECTURE.md`: update — three commands + `random_expired`, `candidate*`/`random_pending` now live, `randomCountdownMs`/`pickRandomIndex` seams, `useRandomSelection`, `RandomSelectionPanel`.
- `CONSTRAINTS.md`: not needed — #5 already mandates leader-only randomization and server-side turn gating; no new durable rule.
- `AGENTS.md`: not needed — workflow/startup unchanged.
- `docs/domain-model.md`: update (one clarification) — `random_pending`'s "Candidate acceptance or leader `Confirm selection`" resolves to leader `Confirm selection` only (no reserved accept command); countdown copy retained.
- Other docs: `docs/user-and-access-model.md` / `docs/technical-discovery.md` already describe this behavior (no change); `feature_list.json` / `PROGRESS.md` receive evidence at completion.

## Implementation Plan

1. Shared: unions, constants, reducers/helpers + `tests/unit/random-selection-state.test.ts`.
2. Server: seams + three command blocks + expiry timer/broadcast + `tests/integration/ws-random-selection.test.ts` (full negative matrix).
3. Client dispatch: `useRandomSelection` + `sessionSocket` framing assertions.
4. UI: `RandomSelectionPanel`/`RandomPickButton`, `OpeningPrayerScreen` + `App.tsx` wiring, `global.css`; `tests/unit/random-selection-screen.test.tsx`.
5. E2E `tests/e2e/random-volunteer-picker-countdown.spec.ts` with Sessions 021–022 hardening baked in from the first commit.
6. `ARCHITECTURE.md` + `docs/domain-model.md` note; run all gates; record evidence.

## Implementation Tasks

- [ ] `src/shared/session.ts`: `LeaderCommandType += 'pick_random' | 'confirm_random' | 'retry_random'`, `SessionUpdatedCommand += 'random_expired'`, `RANDOM_SELECTION_COUNTDOWN_MS`, `applyStageRandomCandidate` / `applyConfirmRandomCandidate` (composes `applySelectVolunteer`) / `applyClearRandomCandidate`, `eligibleRandomCandidateIds`, `remainingCountdownSeconds`; comment fixes. Unit `tests/unit/random-selection-state.test.ts` (reducer immutability; confirm == assign + cleared candidates; eligibility filters + join order; `random_pending` enter/leave via `volunteerTurnPhase`; countdown clamp).
- [ ] `src/server/sessionStore.ts`: `randomCountdownMs` / `pickRandomIndex` options; three leader commands with the shared open-turn gate + per-command phase gates and the Scenario 3 error codes; per-session unref'd expiry timer + `random_expired` fan-out + silent self-cancel guard; timer cancellation in `next_section` / `closeAndPurgeSession` / `dispose`.
- [ ] `tests/integration/ws-random-selection.test.ts`: Scenario 1 happy path (pick → confirm → `complete_turn` → `next_section`); Scenario 3 full negative matrix; Scenario 2 retry rules (exclusion via scripted `pickRandomIndex`, single-Person fallback + timer reset, retry-after-expiry OK); Scenario 4 expiry (`random_expired` broadcast, cleared candidates, confirm-after-expiry reject, no stray broadcast after completion/override); Scenario 5 (candidate disconnect retained + confirmable, hand churn immunity, secrets stripped, late-join/reconnect hydration); empty-pool rejection; `pick_random` in lobby / after `turn_completed` / in `section_2_icebreaker`.
- [ ] `src/client/lib/useRandomSelection.ts` + `tests/unit/session-socket.test.ts` extension (framing of the three commands via the default branch; all accepted assertions unchanged).
- [ ] `src/client/components/random/RandomSelectionPanel.tsx` + `OpeningPrayerScreen.tsx` / `App.tsx` wiring + `global.css`: per Technical Approach §5 with `motion/react` springs + `AnimatePresence` + reduced-motion guards, `random-polyhedron` / `random-spin` / `confirm-burst` wiring, ≥ 44px / ≥ 16px, no overflow at `390x844`.
- [ ] `tests/unit/random-selection-screen.test.tsx`: leader-only `Pick Randomly`/`Retry`/`Confirm selection`; participant DOM contains none of those exact strings; disabled + note at 0 connected Participants; countdown tick + `0:{ss}` clamp (fake timers); `· reconnecting`; `aria-live`; reduced motion; static CSS floors; chosen/Done flow unchanged after confirm.
- [ ] `tests/e2e/random-volunteer-picker-countdown.spec.ts` (mobile-chromium `390x844`, leader + 2 Participants via `/join/:code`): Scenario 1 (pick sync across 3 clients + countdown tick + Confirm → chosen-only `YOU WERE CHOSEN` → Done → advance to `SECTION 2 OF 5`); Scenario 2 (Retry flips to the other Participant deterministically with exactly 2 eligible); Scenario 3 UI slice (raw `/ws` participant `pick_random` → `FORBIDDEN_LEADER_ONLY`; participant DOM strings); Scenario 4 slice (solo leader: `Pick Randomly` disabled + note). **From the first commit**: `test.describe.configure({ timeout: 60_000 })`, `expect.configure({ timeout: 15_000 })`, never-throwing bounded `closeLiveSession` (2s per-WS waits, 5s race ceiling, internal try/catch), every `finally` closing contexts via `Promise.allSettled`. Expiry behavior is covered in the fast-countdown integration suite (a real 30s wait would blow the 60s e2e budget) — server authority is fully asserted there.
- [ ] Update `ARCHITECTURE.md` + `docs/domain-model.md` clarification; run gates; record evidence in `feature_list.json` / `PROGRESS.md`.

## Verification Plan

- `./init.sh` — non-blocking gate (`npm run typecheck`, `npm test`, `npm run build`) exits `0`; must not start long-running servers.
- `PLAYWRIGHT_PORT=3301 npm run test:e2e` — full suite green on `mobile-chromium` `390x844` **twice consecutively in full-suite runs** (`ws-room-lifecycle.spec.ts` green both runs — no leaked sessions), including the new spec.
- Vitest: the named unit + integration suites above (the integration negative matrix **is** the required server-gating evidence; expiry uses `randomCountdownMs: ~100`).
- Static scans: `grep -rn "Assistant" src/` → `0`; participant DOM copy never contains `Pick Randomly` / `Retry` / `Confirm selection`.
- Live single-port smoke (recommended, `PORT=3101 node dist/server/index.js` + raw `/ws`): `protocolVersion: 3`; pick → candidate staged; confirm assigns; retry excludes prior candidate; expiry clears + `random_expired`; participant rejections `FORBIDDEN_LEADER_ONLY`; secret stripping unchanged; clean SIGTERM.
- Compatibility: all accepted suites pass unchanged (expected zero compat edits).

## Evidence To Capture

- Exit `0` from `./init.sh` (typecheck ×3; Vitest counts incl. the named suites; build output) and two consecutive `PLAYWRIGHT_PORT=3301 npm run test:e2e` runs (per-suite counts; the 3-client scenarios named).
- Named integration tests proving the negative matrix, retry rules, expiry authority, disconnect/reconnect; named unit tests for reducers/eligibility/countdown and role surfaces.
- `grep -rn "Assistant" src/` → `0`; compat-edit record ("none required" if so).
- Evidence appended to `feature_list.json` and a `PROGRESS.md` session log entry.

## Validator Checklist

- [ ] Scope: Section 1 only; no Section 2 content, no wake-lock/resync, no Section 3 turn copy; `choose_volunteer` / `complete_turn` / `override_turn` blocks and `applySelectVolunteer` / `applyCompleteTurn` / `volunteerTurnPhase` behavior byte-stable; `next_section` gate untouched.
- [ ] Acceptance Scenarios 1–5 pass at `390x844` (3-client e2e) and at the `/ws` level.
- [ ] Server-side authority is real: leader-only via `handleLeaderCommand` (participant-block → timing-safe `leaderToken` → memberId match); countdown expiry decided by the server clock/timer — clients render only; no new participant command; identity from socket bindings.
- [ ] Negative matrix green (`FORBIDDEN_LEADER_ONLY` / `UNAUTHORIZED_LEADER` / `INVALID_STATE_TRANSITION` rows incl. confirm-after-expiry and empty pool).
- [ ] Never-deadlock preserved: `Retry` valid after expiry, single-Person fallback re-pick, `override_turn` reachable during `random_pending`, stale candidates inert after manual choose/override.
- [ ] Snapshots: shape unchanged (`protocolVersion: 3`), secrets + pastoral fields stripped, `candidate*` in-memory only and purged with the session; reconnect/late-join hydrate the countdown from `candidateExpiresAt`.
- [ ] Fair pick: uniform over the declared eligible pool (connected Participants, join order) via the injected RNG seam; zero external API calls.
- [ ] Terminology/DESIGN hygiene: zero legacy-role occurrences; participant DOM free of leader-control strings; `RANDOM SELECTION` pill padding (override #4); ≥ 44px / ≥ 16px; springs + `AnimatePresence` + reduced-motion; `random-polyhedron` on the single persistent `Sacred3DScene` with `random-spin` / `confirm-burst` impulses; terracotta countdown card per `ux/9`; no overflow.
- [ ] E2E hardening present from the first commit (60s / 15s / bounded never-throwing cleanup / `Promise.allSettled`) and the full gate green twice consecutively with `ws-room-lifecycle.spec.ts` green both runs.
- [ ] `feature_list.json` / `PROGRESS.md` evidence recorded; `ARCHITECTURE.md` + `docs/domain-model.md` updated as specified.

## Open Questions (non-blocking)

1. **Candidate acceptance**: `docs/domain-model.md` says "Candidate acceptance **or** leader `Confirm selection` transitions to `assigned`", but the reserved command set has no participant accept command. This spec implements leader `Confirm selection` as the sole transition (countdown copy "has 30 seconds to accept." retained) and updates `docs/domain-model.md` accordingly; a participant `accept_random` would be a future, explicitly re-scoped addition.
2. **Eligibility vs. "live prayer queue" phrasing**: resolved to connected Participants (see Technical Approach §2) — raised-hand-only eligibility would make the feature's defining zero-volunteers scenario impossible.
3. **Stale candidate after manual `choose_volunteer` / `override_turn` during `random_pending`**: established blocks stay byte-identical, so `candidate*` may linger inert in a completed/assigned turn's snapshot until `next_section` clears the turn (phase derivation and all picker gates ignore it; the expiry timer self-cancels). Cosmetic-only, like the predecessor's vanished `Chosen` chip.
4. **Section 3 reuse**: the three new commands use the section-neutral open-turn gate, but the frozen commands still hardcode `section_1_prayer`; `section-3-gospel-reading-turn` must widen those predicates in its own scope.

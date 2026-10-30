# Feature Implementation Spec: Title lobby syncs live attendee count with localhost-safe QR sharing

## Source Feature

- `id`: `title-lobby-qr-join-start`
- `area`: `session-lobby`
- `depends_on`: `["leader-load-study-setup-screen", "sacred-3d-persistent-stage"]`
- `status`: `not_started`
- `source`: `feature_list.json`

## Goal

Replace the provisional `TitleLobbyPlaceholder` with the real **Title Lobby** (`ux/3. Title - Leader.png`) for session status `lobby`. Both `Study Leader` and `Participant` see the study title, the Gospel-only citation line, the liturgical eyebrow, the metrics card (live **ATTENDEES** count, 5 sections, estimated duration), and the persistent `Sacred3DScene` sanctuary emblem. The study info reaches Participants through a new additive `/ws` `load_study` leader command that stores a sanitized study summary in the session snapshot (resolving the `leader-load-study-setup-screen` deferral). The Study Leader can open a QR / Room Code share sheet with a client-side, offline-generated QR encoding a localhost-safe `/join/:code` URL (preferring `PUBLIC_URL` when the app is opened on `localhost`/`127.0.0.1`, with `npm run share` guidance), and exclusively taps the gold `Start Study` CTA (server-gated `start_study`) so every connected client enters Section 1 (`SECTION 1 OF 5`, Opening Prayer) together.

## Non-Goals

- Full Section 1 Opening Prayer experience (hand-raise orb, volunteer queue, `Done` gating) — deferred to `section-1-opening-prayer-hand-raise`. This feature lands only a minimal Section 1 handoff surface (persistent `SECTION 1 OF 5 · 20%` header + waiting copy), exactly as `leader-load-study-setup-screen` landed a lobby placeholder.
- Sections 2–5 flows, `Random Selection`, `finish_study`, Desktop Dual Side-by-Side Mode, Wake Lock / foreground resync (their own features).
- QR **scanning** (that is the phone camera/OS); this feature only encodes the join URL. No server-side QR rendering, no external QR/API calls, no analytics.
- Study editor, Gospel text editing, or any pastoral/facilitator field (`leaderNote`, `examplesToListenFor`, `sampleAnswer`, `leaderLiturgicalContextNote`, `verseCommentary`, `catholicDoctrine`, `youngAdultApplication`) crossing to Participants — the synced summary is title/meta only.
- Changing `start_study` server semantics (it currently accepts `setup|lobby`), `close_session`, TTL, `leaderPin` handoff, or any accepted `POST /api/studies/parse` / `GET /api/studies/default` behavior.
- Participant data persistence of any kind (rooms stay ephemeral in memory per `docs/user-and-access-model.md`).

## Job Story

When my young adult group is gathering and phones are still joining,
I want everyone to see the study title and how many attendees are connected while I share a scannable join link that works on real networks,
so I can start the study at the right moment knowing nobody is locked out by a `localhost` link.

## Users And Permissions

- **`Study Leader`**: sees the full Title Lobby, opens the QR / Room Code share sheet, dispatches `load_study` (on `Continue` from setup) and `start_study` (`CONSTRAINTS.md` #5 server-enforced `leaderToken`).
- **`Participant`**: sees the Title Lobby in waiting state (study title, Gospel citation, live attendee count) with **no** `Start Study` control; joins via `/join/:code` (QR) + `displayName` with no account (`docs/user-and-access-model.md` Access Rule 1); `leaderPin`/`leaderToken` never shown (`ActiveSessionBanner` already gates this).
- **Terminology Invariant**: `Study Leader` / `Participant` only — zero occurrences of the forbidden legacy role word `Assistant` (mockup `ux/3` filename is static and must not leak into copy).

## Acceptance Scenarios

### Scenario 1: Leader Title Lobby shows the synced study summary (Gospel-only)

Given the Study Leader tapped `Continue` on Load Your Study (`setup` → `lobby`)
When the Title Lobby renders on the leader device
Then it shows the liturgical eyebrow (`WEEK 32 · 20TH SUNDAY OT`), `Great Is Your Faith` (Playfair Display), the citation line `Matthew 15:21–28 · Canaanite Woman`, and the metrics card (`ATTENDEES`, `5` sections, `90m` duration) per `ux/3. Title - Leader.png`
And the citation region contains none of `Isaiah`, `Psalm`, `Romans`, `First Reading`, `Second Reading`, `Responsorial Psalm`
And `<= 1` `<canvas>` is mounted, zero `"Assistant"` text, and no horizontal overflow at `390x844`.

### Scenario 2: Study summary reaches Participants over `/ws` (handoff note 1)

Given a Participant joined before or after the leader pressed `Continue`
When the session snapshot arrives (`session_joined`, `roster_updated`, or `session_updated` with `command: 'load_study'`)
Then the Participant's Title Lobby shows the same title, eyebrow, and Gospel citation as the leader (from `PublicLiveSessionSnapshot.study`)
And a Participant who joins later receives the summary in `session_joined` / `session_reconnected` snapshots.

### Scenario 3: Live attendee count syncs across leader + N participants

Given the leader and zero participants are in the lobby (`ATTENDEES 0`)
When two Participants join via `/join/:code`
Then `ATTENDEES` reads `2` on the leader device **and** on both Participant devices in real time (`roster_updated`), and decrements when a Participant disconnects.

### Scenario 4: QR / Room Code share sheet is localhost-safe

Given the leader opens the share sheet (`lobby-share-trigger`)
Then it renders a client-side QR SVG whose payload is exactly `{origin}/join/{sessionCode}`, the large room code, a readonly `>= 16px` join-URL field with `Copy` (`aria-live` "Link copied"), and `navigator.share` where supported
And when the resolved origin is local-only (`localhost` / `127.0.0.1` / `[::1]`) and no `PUBLIC_URL` is configured, a terracotta warning pill states the link may not reach phones and names `npm run share` as the fix (the QR still renders for desktop testing)
And when `PUBLIC_URL` (e.g. `https://demo.trycloudflare.com`) is configured and the origin is local-only, the QR payload and join-URL field use `PUBLIC_URL` and no warning is shown
And on a LAN IP or HTTPS tunnel origin the sheet encodes `window.location.origin` untouched (never a hardcoded `localhost`).

### Scenario 5: Participant waiting state and exclusive Start Study

Given Participants are in the lobby
Then they see the study summary, `ATTENDEES`, and a waiting pill (`The Study Leader will begin shortly…`) and **no** `Start Study` button anywhere in the DOM
When the Study Leader taps `Start Study` (`lobby-start-study`)
Then `start_study` is dispatched with `leaderToken`; on `session_updated` (`in_progress`, `section_1_prayer`) **every** client renders the Section 1 handoff (`SECTION 1 OF 5`, `20%`, `Opening Prayer`)
And a `start_study` sent without a valid `leaderToken` returns `session_error` (`UNAUTHORIZED_LEADER`) and changes nothing (server-side, `CONSTRAINTS.md` #5).

### Scenario 6: Protocol additions are versioned and backward compatible

Given an older client that never sends `load_study` and ignores unknown snapshot fields
Then all existing commands (`create_session`, `join_session`, `claim_leader`, `reconnect_session`, `open_lobby`, `start_study`, `next_section`, `close_session`) behave exactly as before (all accepted suites pass), and snapshots carry `protocolVersion: 2` plus optional `study` without leaking `leaderPin` / `leaderToken` / `reconnectToken`.

## Repository Research

### Files Inspected

- `feature_list.json` / `PROGRESS.md` — both dependencies `accepted`; `title-lobby-qr-join-start` is the next-ready feature; prior Low note (custom Section 3 `section.title` leak) and "Participants cannot see the study title" deferral are this spec's handoff items.
- `ux/3. Title - Leader.png` + `DESIGN.md` — layout: `LEADER` badge + `LIVE` pill row, `YA BIBLE STUDY · LIVE SESSION` chip, gold eyebrow `WEEK 32 · 20TH SUNDAY OT`, Playfair title, italic citation line, metrics card (attendees / sections / duration), 56px gold `Start Study →` pill. `DESIGN.md` Core Screen 3 adds the "Room Code / QR share modal trigger".
- `CONSTRAINTS.md` — #1 dynamic origin + "QR share payloads MUST NOT hardcode `localhost`", #3 terminology, #4 Gospel-only, #5 `load_study` already listed among leader-gated commands, #7 `>= 16px` inputs / `>= 44px` targets, #8 single persistent canvas.
- `docs/user-and-access-model.md` — `Attendee (Participant)` naming, QR join access rule, ephemeral rooms, leader-only pacing.
- `docs/technical-discovery.md` — client-side `qrcode` rendering, `PUBLIC_URL` preference on localhost, `npm run share` (`cloudflared tunnel --url http://localhost:<port>`).
- `src/shared/session.ts` — `LeaderCommandType`, `PublicLiveSessionSnapshot` (`connectedMemberCount`, `connectedParticipantCount`, `status`, `currentSectionIndex/Id`), `session_updated.command` type; note real command name is `join_session` (not `join_room`).
- `src/shared/study.ts` / `src/server/studies/greatIsYourFaithSeed.ts` — `StudyDocument` meta already provides `title`, `subtitle`, `liturgicalEyebrow` (`WEEK 32 · 20TH SUNDAY OT`), `gospelCitation`, `gospelSummaryLabel` (`Matthew 15:21–28 · Canaanite Woman`), `sectionCount: 5`, `estimatedMinutes`.
- `src/server/sessionStore.ts` — `handleLeaderCommand` gates `leaderToken` + `memberId` per command; `toPublicSnapshot` strips secrets; `start_study` already transitions `setup|lobby → in_progress` + `section_1_prayer`; `broadcastSessionUpdated` fan-out exists.
- `src/server/app.ts` / `src/shared/health.ts` — `GET /api/health` JSON (additive field safe; e2e asserts only existing fields).
- `src/client/lib/runtimeUrl.ts` — `resolveApiUrl`, `resolveWebSocketUrl`, injectable `LocationLike`; no join-URL helper yet.
- `src/client/lib/urlHelpers.ts` — `extractJoinCodeFromLocation` already parses `/join/:code` (and `?code=`/`?join=`); `App.tsx` auto-opens `ParticipantJoinSheet` prefilled — the QR target page already works.
- `src/client/lib/useLiveSession.ts` / `sessionSocket.ts` — `sendLeaderCommand`, `openLobby()` pattern to extend with `loadStudy()` / `startStudy()`.
- `src/client/App.tsx` — routing: leader + `lobby` → `TitleLobbyPlaceholder`; **no Participant lobby and no `in_progress` view exist** (gap).
- `src/client/components/lobby/TitleLobbyPlaceholder.tsx` — explicitly provisional; replaced by this feature.
- `src/client/components/setup/StudyStructureList.tsx` — handoff note 2 confirmed: `showStudyTitle = section.title !== canonicalName` renders a custom Section 3 `section.title` line above the citation (lines 44, 68–70).
- `scripts/share.sh` — `cloudflared tunnel --url http://localhost:${PORT}` exists; no `PUBLIC_URL` guidance yet.
- `package.json` — no QR dependency yet; `motion`, `lucide-react` available.
- `docs/specs/leader-load-study-setup-screen.md` (accepted) — structure/tone baseline and compatibility contract (`tests/e2e/welcome-role-selection.spec.ts` assertions must stay green; its own tests reference `title-lobby-placeholder`).

### Existing Patterns To Follow

- `motion` springs (`whileTap={{ scale: 0.96 }}`, `stiffness: 420, damping: 26`) guarded by `usePrefersReducedMotion` + `triggerTactileHaptic`; `AnimatePresence`/`layout` for sheet entrance.
- Leader command dispatch via `sendLeaderCommand({ type, sessionCode, leaderToken, memberId })` with `isSubmitting`/`error` surfaced; server-side gating (never trust button hiding).
- Pure, `LocationLike`-injectable URL helpers unit-tested without a DOM; integration tests exercise real `/ws` on ephemeral port `0`; e2e suites close their room via raw `/ws` `close_session` in `finally` (keeps `activeSessionCount` at 0 for downstream suites).
- Stable `data-testid` hooks; `role="alert"` + `aria-live="polite"`; `>= 16px` controls; `>= 44px` targets; gold `56px` primary CTA.

### Current Gaps

- No study summary in snapshots → Participants cannot see the study (handoff note 1).
- No lobby UI for Participants; no `in_progress` handoff UI for either role.
- No QR generation dependency or join-URL builder; no `PUBLIC_URL` plumbing anywhere (client or `GET /api/health`).
- `StudyStructureList` may render custom Section 3 titles (handoff note 2).

## Technical Approach

1. **Protocol v2 (`src/shared/session.ts`, modify)**: add `export const SESSION_PROTOCOL_VERSION = 2`, `export interface SessionStudySummary { title; subtitle; liturgicalEyebrow; gospelCitation; gospelSummaryLabel; sectionCount: 5; estimatedMinutes: number }` (bounded strings), a pure `toSessionStudySummary(doc: StudyDocument): SessionStudySummary` (type-only import from `./study.js`), and a new `LeaderCommandType` member `load_study` with `ClientWsMessage` shape `{ type: 'load_study', sessionCode, leaderToken, memberId?, study: SessionStudySummary, requestId? }`. Extend `PublicLiveSessionSnapshot` with **optional** `study?: SessionStudySummary | null` and `protocolVersion?: number`. All changes are additive; existing messages/fields are untouched (v1 clients keep working, matching `session_updated.command: Exclude<LeaderCommandType, 'close_session'>` which picks up `load_study` automatically).
2. **Server (`src/server/sessionStore.ts`, modify)**: in `handleLeaderCommand`, handle `load_study` (allowed in `setup|lobby`, else `INVALID_STATE_TRANSITION`): validate/normalize the summary (non-empty trimmed strings with sane max lengths — title ≤ 120, others ≤ 200; `sectionCount === 5`; `estimatedMinutes` integer 1–180; invalid → `INVALID_MESSAGE`), store on the session record, broadcast `session_updated` (`command: 'load_study'`). `toPublicSnapshot` emits `study` (copy) and `protocolVersion: SESSION_PROTOCOL_VERSION`. Secret-stripping invariants unchanged. `start_study` handler unchanged.
3. **`PUBLIC_URL` plumbing**: `src/shared/health.ts` adds optional `publicUrl?: string | null`; `src/server/app.ts` fills it from `process.env.PUBLIC_URL` when it parses as `http(s)` URL (else `null`) — additive to `GET /api/health`. `scripts/share.sh` (modify) prints a hint after starting the tunnel: set `PUBLIC_URL=https://<subdomain>.trycloudflare.com` when starting the server so lobby QR codes use the public URL.
4. **Localhost-safe join URLs (`src/client/lib/runtimeUrl.ts`, modify)**: add pure helpers `isLocalOnlyHostname(host)` (`localhost`, `127.0.0.1`, `[::1]`, `::1`) and `resolveJoinUrl(sessionCode, { location?, publicUrl? })` returning `{ url, isLocalOnly, usedPublicUrl }`. Resolution order: if the current origin is local-only **and** `publicUrl` is a valid `http(s)` origin → `${publicUrlOrigin}/join/${code}`; else `${location.protocol}//${location.host}/join/${code}`. No hardcoded hosts anywhere (CONSTRAINTS #1).
5. **QR generation (client-side, offline)**: add dependency `qrcode` + dev `@types/qrcode` (the library `docs/technical-discovery.md` already names). Render via `QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 2 })` into an `aria-label`-annotated inline SVG — deterministic for a fixed URL, zero network. Rejected alternatives: external QR image API (network call + leaks room codes — forbidden), hand-rolled encoder (error-prone), `qrcode.react` (wrapper without benefit). If dependency install is blocked, fall back to a documented `Open share sheet shows URL + code without QR` + manual entry, but the default plan is `qrcode` (~50 kB, pure JS).
6. **Components (`src/client/components/lobby/`, replace placeholder)**:
   - `TitleLobbyScreen.tsx` — role-aware (`mode: 'leader' | 'participant'`): chip row (`YA BIBLE STUDY · LIVE SESSION`), eyebrow (`study.liturgicalEyebrow`), Playfair title, italic Gospel-only citation line (`gospelSummaryLabel` fallback `gospelCitation`), metrics card (`ATTENDEES` ← `session.connectedParticipantCount` — Attendee = Participant per `docs/user-and-access-model.md`; `study.sectionCount`; `{estimatedMinutes}m`), leader-only `Start Study →` 56px gold pill (`whileTap` spring + haptic, disabled while `isSubmitting`), leader `lobby-share-trigger` opening `RoomCodeShareSheet`, participant waiting pill (`The Study Leader will begin shortly…`). When `study` is `null` (leader never loaded), show `Study not loaded yet` fallback for participants. Root `data-testid="title-lobby"`; copy is `Study Leader`/`Participant` only.
   - `RoomCodeShareSheet.tsx` — bottom sheet (`AnimatePresence`, reduced-motion aware): QR SVG, room code (large), readonly join-URL field (`>= 16px`) + `Copy` (`navigator.clipboard`, `aria-live` "Link copied"), `Share` via `navigator.share` when supported, terracotta `localhost` warning pill + `npm run share` guidance when `isLocalOnly && !usedPublicUrl`.
   - `SectionOneHandoff.tsx` — minimal `in_progress` surface for both roles: persistent section header (`SECTION 1 OF 5` / `20%` + 4px gold progress bar per `DESIGN.md`), `Opening Prayer` title, role-appropriate waiting copy; explicitly provisional for `section-1-opening-prayer-hand-raise`.
7. **Client wiring**: `useLiveSession` adds `loadStudy(summary)` and `startStudy()` (`sendLeaderCommand`). `App.tsx` routing: leader + `lobby` → `TitleLobbyScreen` (leader) with `onStartStudy`; participant + `lobby` → `TitleLobbyScreen` (participant); any role + `in_progress` → `SectionOneHandoff`; leader `Continue` now dispatches `loadStudy(toSessionStudySummary(studySetup.study))` then `openLobby()`. Keep `ActiveSessionBanner` mounted (accepted e2e assertions). Replace `TitleLobbyPlaceholder` usages.
8. **Handoff note 2 (tighten now)**: in `StudyStructureList.tsx` suppress the custom `section.title` line for the Gospel row (`showStudyTitle = section.title !== canonicalName && !isGospelRow`) so Section 3 renders citation-only even for custom uploads; add a unit assertion. Small, in-scope (Gospel-only lobby/setup preview, `CONSTRAINTS` #4), and retires the validator's Low note.

## Expected File Changes

- `src/shared/session.ts` — modify; `SESSION_PROTOCOL_VERSION`, `SessionStudySummary`, `toSessionStudySummary`, `load_study` command, snapshot `study`/`protocolVersion` fields.
- `src/shared/health.ts` — modify; optional `publicUrl` field.
- `src/server/sessionStore.ts` — modify; `load_study` handling + summary validation + snapshot fields.
- `src/server/app.ts` — modify; `publicUrl` from `process.env.PUBLIC_URL`.
- `src/client/lib/runtimeUrl.ts` — modify; `isLocalOnlyHostname` + `resolveJoinUrl`.
- `src/client/lib/useLiveSession.ts` — modify; `loadStudy()`, `startStudy()`.
- `src/client/components/lobby/TitleLobbyScreen.tsx`, `RoomCodeShareSheet.tsx`, `SectionOneHandoff.tsx` — create; delete `TitleLobbyPlaceholder.tsx` after migration.
- `src/client/components/setup/StudyStructureList.tsx` — modify; Gospel-row title suppression (handoff note 2).
- `src/client/App.tsx` — modify; role/status routing (`lobby`, `in_progress`), `Continue` → `loadStudy` + `openLobby`.
- `src/client/styles/global.css` — modify; lobby, metrics card, share sheet, warning pill, handoff styles (`>= 16px` / `>= 44px` baseline).
- `package.json` / `package-lock.json` — modify; `qrcode`, `@types/qrcode`.
- `scripts/share.sh` — modify; print `PUBLIC_URL` guidance.
- `tests/unit/join-url.test.ts`, `tests/unit/qr-share.test.ts`, `tests/unit/title-lobby.test.tsx` — create; `tests/unit/session-socket.test.ts` — extend if snapshot types warrant.
- `tests/integration/ws-load-study.test.ts` — create (or extend `tests/integration/ws-session-lifecycle.test.ts`); `tests/integration/server-health.test.ts` — extend for `publicUrl`.
- `tests/e2e/title-lobby-qr-join.spec.ts` — create.
- `tests/unit/leader-study-setup.test.tsx`, `tests/e2e/leader-load-study-setup.spec.ts` — **minimal documented compatibility update**: the provisional `title-lobby-placeholder` selector → `title-lobby` (its scenario intent — study title + Gospel citation after `Continue` — stays identical). All other accepted-suite assertions unchanged.
- `ARCHITECTURE.md` — modify; protocol v2, lobby modules, `resolveJoinUrl`, `qrcode`, `publicUrl`.

## Visual Design Impact

- UI involved: yes
- Design source: `DESIGN.md` + `ux/3. Title - Leader.png`
- Screens or states affected: Title Lobby (leader active / participant waiting / study-not-loaded fallback), QR & Room Code share sheet (localhost warning state), minimal Section 1 handoff, setup `Continue` transition.
- New design artifact required: no — palette (`#0B0D17`, `#171B2E`, `#E2A83E`, `#10B981`, `#9A4A38` warning tint), typography (Playfair title/italic citation, Plus Jakarta eyebrows), and motion constants are specified. Documented mockup adjustments: the room-code share sheet is a bottom sheet (mockup shows only its trigger), and `ATTENDEES` counts connected Participants (domain "Attendee"), not the leader. Follow `DESIGN.md` override #4 hygiene (no clipped avatars/overflowing pills) and keep the persistent single `Sacred3DScene` canvas mounted (sanctuary emblem stage; no second canvas).

## Durable Documentation Impact

- `ARCHITECTURE.md`: update — `/ws` protocol v2 (`load_study`, snapshot `study`/`protocolVersion`), `src/client/components/lobby/` replacements, `resolveJoinUrl`/`isLocalOnlyHostname`, `qrcode` client QR rendering, `GET /api/health.publicUrl`.
- `CONSTRAINTS.md`: not needed — #1 already forbids hardcoded `localhost` in QR payloads, #5 already lists `load_study` among leader-gated commands, #3/#4/#7/#8 cover the rest.
- `AGENTS.md`: not needed — workflow, startup path, and operating rules unchanged.
- Other docs: `docs/technical-discovery.md` already specifies `qrcode` + `PUBLIC_URL` (no change); `docs/user-and-access-model.md` unchanged (rules already cover QR join + ephemeral privacy); `feature_list.json` and `PROGRESS.md` receive evidence on completion.

## Implementation Plan

1. Protocol: `src/shared/session.ts` + `src/shared/health.ts` additions; `load_study` in `src/server/sessionStore.ts`; `publicUrl` in `src/server/app.ts`; cover with `tests/integration/ws-load-study.test.ts` and health extension.
2. Client URL layer: `resolveJoinUrl` / `isLocalOnlyHostname` + `tests/unit/join-url.test.ts`; add `qrcode`; `RoomCodeShareSheet` QR rendering + `tests/unit/qr-share.test.ts`.
3. Lobby UI: `TitleLobbyScreen` (both modes) + `SectionOneHandoff`, `useLiveSession` `loadStudy`/`startStudy`, `App.tsx` routing (`Continue` → `loadStudy` + `openLobby`), styles; `tests/unit/title-lobby.test.tsx`; handoff note 2 fix in `StudyStructureList` + assertion.
4. E2E: `tests/e2e/title-lobby-qr-join.spec.ts` (multi-context leader + 2 participants, QR sheet, waiting state, `Start Study`); apply the two documented placeholder-selector updates; `scripts/share.sh` hint.
5. Update `ARCHITECTURE.md`; run `./init.sh` and `PLAYWRIGHT_PORT=3301 npm run test:e2e`; run `grep -rn "Assistant" src/`.

## Implementation Tasks

- [ ] Add `SESSION_PROTOCOL_VERSION = 2`, `SessionStudySummary`, `toSessionStudySummary`, and `load_study` to `src/shared/session.ts` (additive, optional snapshot fields).
- [ ] Handle `load_study` in `src/server/sessionStore.ts` with summary validation, `setup|lobby` state gating, and `session_updated` broadcast; keep all existing commands byte-compatible.
- [ ] Expose `publicUrl` (from `PUBLIC_URL` env, http(s)-validated) on `GET /api/health`; append `PUBLIC_URL` guidance to `scripts/share.sh`.
- [ ] Implement `isLocalOnlyHostname` + `resolveJoinUrl` in `src/client/lib/runtimeUrl.ts` (pure, `LocationLike`-injectable).
- [ ] Add `qrcode` + `@types/qrcode`; build `RoomCodeShareSheet.tsx` (QR SVG, code, copy/share, localhost warning + `npm run share` hint).
- [ ] Build `TitleLobbyScreen.tsx` (leader + participant modes, metrics card, `ATTENDEES` from `connectedParticipantCount`, Gospel-only citation) and `SectionOneHandoff.tsx`; delete `TitleLobbyPlaceholder.tsx`.
- [ ] Add `loadStudy()` / `startStudy()` to `useLiveSession.ts`; wire `App.tsx` (leader `Continue` → `loadStudy` then `openLobby`; `lobby`/`in_progress` routing for both roles).
- [ ] Tighten `StudyStructureList.tsx` Gospel row to citation-only (handoff note 2) + unit assertion.
- [ ] Tests: `tests/unit/join-url.test.ts`, `tests/unit/qr-share.test.ts`, `tests/unit/title-lobby.test.tsx`, `tests/integration/ws-load-study.test.ts`, `tests/e2e/title-lobby-qr-join.spec.ts`; extend `tests/integration/server-health.test.ts`; update the two placeholder selectors.
- [ ] Update `ARCHITECTURE.md`; run `./init.sh`, `PLAYWRIGHT_PORT=3301 npm run test:e2e`, `grep -rn "Assistant" src/`; record evidence.

## Verification Plan

- `./init.sh` — non-blocking gate (`npm run typecheck`, `npm test`, `npm run build`) exits `0`; must not start long-running servers.
- `PLAYWRIGHT_PORT=3301 npm run test:e2e` — all suites green on `mobile-chromium` `390x844`, including new `tests/e2e/title-lobby-qr-join.spec.ts`:
  - **Scenario 1**: leader room → setup `Continue` → `title-lobby` shows eyebrow, `Great Is Your Faith`, `Matthew 15:21–28 · Canaanite Woman`, metrics (`ATTENDEES`, `5`, `90m`); preview/lobby contain none of `Isaiah`/`Psalm`/`Romans`/`First Reading`/`Second Reading`/`Responsorial Psalm`; `<= 1` canvas; zero `Assistant`; `scrollWidth <= clientWidth`.
  - **Scenario 2/3**: second + third browser contexts navigate to `{baseURL}/join/{sessionCode}` (the QR target), join as Participants; `ATTENDEES` reads `2` on leader **and** both participant screens (`title-lobby-attendee-count`), proving cross-device sync.
  - **Scenario 4**: `lobby-share-trigger` → share sheet renders QR SVG (`lobby-qr-svg`), join URL text equals `{origin}/join/{code}`, room code visible, copy works (`aria-live`); on the `127.0.0.1` Playwright origin without `PUBLIC_URL`, the localhost warning pill is visible and names `npm run share`. (PUBLIC_URL precedence and tunnel/LAN origins are asserted in `tests/unit/join-url.test.ts` and `tests/integration/server-health.test.ts` — e2e cannot run a real tunnel.)
  - **Scenario 5**: participant DOM has zero `lobby-start-study`; waiting pill visible; leader clicks `lobby-start-study` → both contexts show `SECTION 1 OF 5` / `20%` / `Opening Prayer` handoff; each test closes its room via raw `/ws` `close_session` in `finally`.
- Unit assertions (`tests/unit/*`): `resolveJoinUrl` for `127.0.0.1`, `localhost`, `[::1]`, LAN IP, and `https://*.trycloudflare.com` origins (correct `/join/CODE` URLs, `isLocalOnly` flags, `PUBLIC_URL` override only when local + its origin sanitization); deterministic QR SVG for a fixed URL and payload = resolved join URL; lobby rendering per role; `>= 16px` control font-size and `>= 44px` tap targets over `global.css`; Gospel-only citation; `StudyStructureList` custom Section 3 title suppression.
- Integration assertions (`tests/integration/ws-load-study.test.ts`): `load_study` stores summary and broadcasts `session_updated` (`command: 'load_study'`, `study`, `protocolVersion: 2`); summary visible in `session_joined`/`session_reconnected`; participant `load_study` → `FORBIDDEN_LEADER_ONLY`; wrong `leaderToken` → `UNAUTHORIZED_LEADER`; malformed summary → `INVALID_MESSAGE`; `load_study` after `in_progress` → `INVALID_STATE_TRANSITION`; `start_study` leader-only (`section_1_prayer`, `in_progress`); snapshots never contain `leaderPin`/`leaderToken`/`reconnectToken`.
- Static scan: `grep -rn "Assistant" src/` returns `0` matches; `grep -rn "localhost" src/client/` shows no hardcoded hosts in QR/join payloads.
- Compatibility: all existing suites pass with **only** the two documented `title-lobby-placeholder` → `title-lobby` selector updates (`tests/unit/leader-study-setup.test.tsx`, `tests/e2e/leader-load-study-setup.spec.ts`); `tests/e2e/welcome-role-selection.spec.ts` and `tests/e2e/ws-room-lifecycle.spec.ts` assertions untouched.

## Evidence To Capture

- Exit code `0` from `./init.sh` (typecheck across 3 tsconfigs, Vitest suite/test counts incl. the new named suites, `dist/client` + `dist/server` build output).
- Exit code `0` from `PLAYWRIGHT_PORT=3301 npm run test:e2e` with per-suite pass counts on `mobile-chromium` `390x844`, explicitly noting multi-client attendee sync (`ATTENDEES 2` on 3 screens) and the untouched accepted suites.
- Integration test names proving `load_study` gating + secret stripping + `protocolVersion: 2`; unit test names for `resolveJoinUrl` localhost/tunnel cases and deterministic QR payload.
- `grep -rn "Assistant" src/` → `0`; `scripts/share.sh` `PUBLIC_URL` hint text.
- Named evidence appended to `feature_list.json` and a `PROGRESS.md` session log entry; resolution of both handoff notes recorded.

## Validator Checklist

- [ ] Implementation stays within `title-lobby-qr-join-start` scope (no Section 1 prayer flow, no Sections 2–5, no study editor, no parser changes, no `start_study` semantics change).
- [ ] Acceptance Scenarios 1–6 pass on `390x844`, including multi-client attendee-count sync and the participant waiting state with zero `Start Study` control in the DOM.
- [ ] QR payload is exactly the resolved `/join/{sessionCode}` URL; local-only origins warn and prefer `PUBLIC_URL`; no hardcoded `localhost`/`127.0.0.1` in `src/client` QR/join code (CONSTRAINTS #1).
- [ ] `load_study` and `start_study` are server-enforced with `leaderToken` (`CONSTRAINTS` #5); snapshots leak no secrets; protocol additions are additive (`protocolVersion: 2`) and all accepted suites pass (only the two documented placeholder-selector updates).
- [ ] Zero `Assistant` occurrences in `src/`; `Study Leader` / `Participant` terminology throughout; Section 3 surfaces (lobby citation + setup structure list, incl. custom `section.title`) are Gospel-only.
- [ ] `>= 16px` control font-size, `>= 44px` targets, 56px gold CTA; `motion/react` springs honor `prefers-reduced-motion`; persistent `Sacred3DScene` canvas count `<= 1` across lobby and handoff transitions.
- [ ] `./init.sh` and `PLAYWRIGHT_PORT=3301 npm run test:e2e` pass with evidence recorded in `feature_list.json` and `PROGRESS.md`; `ARCHITECTURE.md` updated.

## Handoff Resolutions

1. **Study sync to Participants**: resolved here via the additive `/ws` `load_study` leader command + `PublicLiveSessionSnapshot.study: SessionStudySummary | null` (title, subtitle, liturgical eyebrow, Gospel citation/summary label, `sectionCount`, `estimatedMinutes` — never pastoral fields), dispatched automatically when the leader taps `Continue` (then `open_lobby`). Chosen over embedding the summary in `open_lobby` alone because `CONSTRAINTS.md` #5 already reserves `load_study` as a leader-gated command and it lets a leader re-load a corrected study while still in `setup|lobby`.
2. **Custom Section 3 `section.title` leak (validator Low note)**: tightened in this feature — `StudyStructureList` suppresses the secondary `section.title` line for the Gospel row so it renders citation-only regardless of uploaded study wording (with a unit assertion); the lobby citation line itself is built only from `gospelSummaryLabel`/`gospelCitation`. Not deferred.

## Open Questions (non-blocking)

1. **Attendee metric semantics**: `ATTENDEES` = `connectedParticipantCount` (leader excluded, per "Attendee (Participant)"). If validation prefers total connected members, it is a one-line display change; the sync mechanism is identical.
2. **QR dependency**: `qrcode` is the planned dependency (per `docs/technical-discovery.md`); if install is blocked, ship the share sheet without the SVG QR (URL + code + copy still work) and record the deviation.

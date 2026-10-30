# Feature Implementation Spec: Load Your Study screen previews default or uploaded study structure

## Source Feature

- `id`: `leader-load-study-setup-screen`
- `area`: `onboarding-ui`
- `depends_on`: `["pdf-study-deterministic-parser", "welcome-role-selection-flow"]`
- `status`: `not_started`
- `source`: `feature_list.json`

## Goal

Deliver the **Load Your Study** setup screen (`ux/2. Leader Setup.png`, `Setup · STEP 1 OF 2`) for the `Study Leader`. After creating or claiming a room (session status `setup`), the leader sees a gold-glow drag-and-tap `.pdf` / `.md` dropzone, a preview of the pre-analyzed default *"Great Is Your Faith"* study (`✓ Analyzed`, `5 sections detected`), and the full 5-section structure so it can be confirmed before the session starts. Uploading a custom `.pdf` / `.md` via `POST /api/studies/parse` updates the preview live; tapping the gold `Continue` CTA transitions the session to the Title Lobby (`open_lobby`, session status `lobby`). Section 3 of the preview presents **only** the Gospel Reading. All copy uses `Study Leader` / `Participant` (zero `Assistant`), inputs stay `>= 16px`, tap targets `>= 44px`, and the persistent single `Sacred3DScene` canvas stays mounted throughout.

## Non-Goals

- Building the full Title Lobby (QR/room-code share sheet, `PUBLIC_URL`/localhost guard, attendee counter, `Start Study` gating) — deferred to `title-lobby-qr-join-start`. This feature lands only a minimal Title Lobby placeholder handoff.
- Adding a `load_study` `/ws` command or study data to `PublicLiveSessionSnapshot` (cross-client study sync) — deferred to `title-lobby-qr-join-start`. The analyzed `StudyDocument` stays in client state for this slice.
- Editing/pasting Gospel text or any in-place study editor (see `docs/risks-and-open-questions.md` fallback rule; preview is read-only confirmation).
- QR generation, `npm run share`, Sections 1–5 flows, Desktop Dual Mode.
- New server endpoints or parser changes — `GET /api/studies/default` and `POST /api/studies/parse` are complete and accepted; do not modify `src/server/studies/*` parsing behavior.

## Job Story

When I have just created my `Live Session` as `Study Leader`,
I want to confirm my study's 5-section structure (or swap in my own `.pdf` / `.md`) before anyone joins,
so I can start the session knowing the right content was detected, without reading raw files on my phone.

## Users And Permissions

- **`Study Leader`**: Views the Load Your Study screen while the session is in `setup` status; uploads `.pdf` / `.md`; confirms the preview; taps `Continue` to move the session to the Title Lobby (`open_lobby`, server-enforced `leaderToken` per `CONSTRAINTS.md` #5).
- **`Participant`**: Never sees this screen. Continues to see `ActiveSessionBanner` only (joining happens in the Title Lobby, `title-lobby-qr-join-start`).
- **Terminology Invariant**: UI copy, accessible labels, types, and tests use `Study Leader` and `Participant` only — zero occurrences of `Assistant`.

## Acceptance Scenarios

### Scenario 1: Default study previews with 5-section structure (Gospel-only Section 3)

Given a `Study Leader` has created a room on a `390x844` mobile viewport
When the Load Your Study screen mounts
Then `GET /api/studies/default` resolves and the preview card (`study-preview-card`) shows `Great Is Your Faith.pdf`, an emerald `✓ Analyzed` pill, and the detection summary `5 sections detected`
And a 5-row structure list renders `Opening Prayer`, `Icebreaker`, `Gospel Reading`, `Deep Analysis & Discussion`, `Closing Prayer` (from `getStudySections`)
And the `Gospel Reading` row shows only the Gospel citation (`Matthew 15:21–28`) — no Old Testament, Psalm, or Epistle content anywhere in the preview
And the persistent `<Sacred3DScene />` `<canvas>` remains mounted and the DOM contains zero `"Assistant"` occurrences.

### Scenario 2: Custom upload updates the preview live

Given the screen shows the default study preview
When the leader taps the dropzone and selects `tests/fixtures/peace-be-still-mark-4.md` (or a `.pdf`)
Then the client posts `multipart/form-data` (`file` field) to `POST /api/studies/parse`
And on HTTP 200 the preview card animates to the new study (`Peace! Be Still`, `✓ Analyzed`, `5 sections detected`, Section 3 showing `Mark 4:35–41`)
And `Continue` remains enabled.

### Scenario 3: Invalid upload keeps previous preview with actionable error

Given the screen shows a valid study preview
When the leader selects a malformed `.md` (HTTP 400 `{ error, errors[] }`) or an oversized file (HTTP 413)
Then an inline alert (`role="alert"`, `study-setup-alert`) renders the server's actionable error message(s)
And the previous valid preview and `Continue` remain intact.

### Scenario 4: Unsupported file type is rejected before upload

When the leader selects a non-`.pdf`/`.md` file (e.g., `.docx`, `.txt`)
Then the client shows the actionable message `Unsupported file type: only .pdf and .md study files are supported.` without issuing any network request.

### Scenario 5: Continue transitions the session to the Title Lobby

Given a valid study is previewed
When the leader taps `Continue` (`study-setup-continue`)
Then `sendLeaderCommand({ type: 'open_lobby', ... })` is dispatched over `/ws` with the stored `leaderToken`
And on `session_updated` (status `lobby`) the app renders the Title Lobby placeholder (`title-lobby-placeholder`) with the previewed study title and Gospel citation
And non-leader commands stay impossible (server rejects `open_lobby` without valid `leaderToken` — already covered by `ws-live-session-room-lifecycle`).

### Scenario 6: One-tap back and resume

Given the Load Your Study screen is visible
When the leader taps the back control (`study-setup-back`)
Then the setup panel collapses to the `ActiveSessionBanner` session view in one tap (room stays live, no reload), offering a `Set up your study` resume action (`study-setup-resume`) that restores the setup panel.

## Repository Research

### Files Inspected

- `feature_list.json` / `PROGRESS.md` — both dependencies `accepted`; this is the current next-ready feature.
- `DESIGN.md` & `ux/2. Leader Setup.png` — authoritative layout: `Setup · STEP 1 OF 2` + `1/2` pill header, `Load Your Study` Playfair Display hero, gold-glow dropzone (cloud-upload icon, `Drag PDF here`, `or tap to select`, format pill), `PREVIEW` eyebrow, analyzed file card (file badge, `✓ Analyzed` emerald pill, `5 sections · …` meta), `5 sections detected` summary card (`Prayer · Reading · 3 Questions`), gold `Continue →` pill CTA.
- `CONTEXT.md`, `CONSTRAINTS.md` — #3 terminology, #4 Gospel-only Section 3, #5 server-side leader gating, #7 `>= 16px` inputs / `>= 44px` targets, #8 persistent single canvas, #9 in-memory parsing.
- `docs/domain-model.md` — lifecycle: `setup` (Load Your Study) → `lobby` (Title Screen) → `in_progress` → `completed`.
- `docs/user-and-access-model.md` — only the `Study Leader` uploads/selects a `StudyDocument`; one-tap recovery from accidental taps.
- `docs/risks-and-open-questions.md` — preview-before-start mitigates PDF extraction misalignment; no Gospel editing in this slice.
- `src/shared/study.ts` — `StudyDocument`, `getStudySections`, `StudySourceMetadata` (`fileName`, `statusLabel: 'Analyzed'`), `StudyDetectionSummary` (`sectionsDetectedLabel: '5 sections detected'`, `detectedLabel`, question counts).
- `src/shared/session.ts` — `LeaderCommandType` includes `'open_lobby'`; `ServerWsMessage` `session_updated` carries `session.status`.
- `src/server/app.ts`, `src/server/sessionStore.ts`, `src/server/studies/*` (greps) — `GET /api/studies/default` returns `StudyDocument` JSON; `POST /api/studies/parse` returns `StudyDocument` (200) or `{ error, errors[] }` (400) / `{ error }` (413); `open_lobby` transitions `setup|lobby → 'lobby'` with `leaderToken` enforcement; `source.fileName` echoes the uploaded file name.
- `src/client/App.tsx` — view switch: `ActiveSessionBanner` whenever a session exists; `LeaderAccessSheet` / `ParticipantJoinSheet` / `WelcomeRoleCards` otherwise; persistent `<Sacred3DScene />` + stage pill test hooks.
- `src/client/lib/sessionSocket.ts` — `sendLeaderCommand({ type, sessionCode?, leaderToken?, memberId? })` already exists on `SessionSocketClient`.
- `src/client/lib/useLiveSession.ts` — exposes `createRoom`, `joinRoom`, `claimLeadership`, `leaveRoom`, `isSubmitting`, `error`; no `openLobby` yet.
- `src/client/components/welcome/LeaderAccessSheet.tsx` (partial) — component conventions: `motion/react` `whileTap`, `triggerTactileHaptic`, inline `role="alert"`, `data-testid` hooks.
- `tests/e2e/welcome-role-selection.spec.ts` — **compatibility constraint**: asserts `active-session-banner`, `active-session-code`, `active-leader-pin`, `active-user-role`, `active-connected-count` are visible right after Create Room / Join / Claim. These assertions must remain green unmodified.
- `tests/e2e/studies-parse.spec.ts` — API-level parse coverage (no UI upload yet); fixture names for upload tests.

### Existing Patterns To Follow

- `motion.button` with `whileTap={{ scale: 0.96 }}` + `transition={{ type: 'spring', stiffness: 420, damping: 26 }}`, guarded by `usePrefersReducedMotion`, plus `triggerTactileHaptic`.
- `resolveApiUrl('/api/...')` for same-origin fetches (never hardcode hosts).
- Inline `role="alert"` error regions and `aria-live="polite"` status text.
- All form controls `font-size >= 16px`; pills/orbs `>= 44px`; primary CTA `56px` gold pill with `#11131F` text.
- E2E suites run on `mobile-chromium` `390x844` against the production single-port server with stable `data-testid` hooks.

### Current Gaps

- No study upload/preview UI exists anywhere in `src/client/`.
- `useLiveSession` cannot dispatch `open_lobby`.
- No Title Lobby surface exists yet (this feature must leave a placeholder for `title-lobby-qr-join-start`).

## Technical Approach

1. **Study setup state hook (`src/client/lib/useStudySetup.ts`, create)**: encapsulates `study`, `status: 'loading' | 'ready' | 'uploading' | 'error'`, `errorMessages: string[]`, `analyzeFile(file: File)`, `resetError()`. On mount fetch `resolveApiUrl('/api/studies/default')`; `analyzeFile` validates extension client-side (`.pdf`/`.md`, else actionable error, no request), posts `FormData` with `file` to `resolveApiUrl('/api/studies/parse')`, replaces `study` only on 200 (previous preview retained on failure), surfaces `errors[]` / `error` from 400/413. No file bytes stored client-side beyond the in-flight request.
2. **Components (`src/client/components/setup/`, create)**:
   - `LeaderStudySetupScreen.tsx` — composes `Setup · STEP 1 OF 2` + `1/2` pill header, `Load Your Study` hero (`Playfair Display`), `StudyUploadDropzone`, `PREVIEW` panel (`StudyPreviewCard` + `StudyStructureList`), gold `Continue →` CTA (disabled until `status === 'ready'`), `study-setup-back` control, and the `role="alert"` / `aria-live` regions. Props: `study`, `status`, `errorMessages`, `onFileSelected`, `onContinue`, `onBack`.
   - `StudyUploadDropzone.tsx` — gold-glow (`borderGold`) dashed card with cloud-upload icon, `Drag study file here`, `or tap to select`, and pill `PDF or MD files` (deliberate mockup adjustment: mockup says "PDF files only" but the feature accepts `.pdf` and `.md` per `DESIGN.md` component #2). Hidden `<input type="file" accept=".pdf,.md,application/pdf,text/markdown">` (`>= 16px` label text) with click/keyboard (`Enter`/`Space`) activation and HTML5 drag-and-drop (`dragover` highlight) as enhancement; rejects unsupported extensions per Scenario 4.
   - `StudyPreviewCard.tsx` + `StudyStructureList.tsx` — analyzed file card (extension badge from `source.fileName` (`PDF`/`MD`, `preloaded` → `PDF`), `source.fileName`, `✓ Analyzed` (`source.statusLabel`), meta `5 sections · {totalQuestionCount} questions`, optional upload `File.size`), detection summary card (`detectionSummary.sectionsDetectedLabel` + `detectionSummary.detectedLabel`), and an `<ol>` of 5 rows: `Section N of 5 · {title} · {durationLabel}`; the Section 3 row additionally shows **only** `gospelReading.citation`. Never render `leaderNote`, `examplesToListenFor`, `sampleAnswer`, `leaderLiturgicalContextNote`, or any non-Gospel reading text in the preview.
3. **Leader command (`src/client/lib/useLiveSession.ts`, modify)**: add `openLobby(): Promise<void>` wrapping `client.sendLeaderCommand({ type: 'open_lobby', sessionCode, leaderToken, memberId })` from stored credentials; surface `isSubmitting` for the CTA.
4. **App routing (`src/client/App.tsx`, modify)**, derived from `PublicLiveSessionSnapshot.status` + role (no extra routing lib):
   - Leader + `status === 'setup'`: `ActiveSessionBanner` **and** `LeaderStudySetupScreen` (banner stays mounted above so `tests/e2e/welcome-role-selection.spec.ts` assertions remain green and the room code / `leaderPin` stay visible — this is the mockup's "room code preview"). `study-setup-back` collapses the setup panel (local boolean) revealing a `study-setup-resume` action; `study-setup-resume` restores it.
   - Leader + `status === 'lobby'`: `ActiveSessionBanner` + `TitleLobbyPlaceholder` (`src/client/components/lobby/TitleLobbyPlaceholder.tsx`, create; `title-lobby-placeholder`, study title `Playfair Display`, Gospel citation, `STEP 2 OF 2 · TITLE LOBBY` eyebrow, connected count from the session snapshot). Placeholder is explicitly provisional for `title-lobby-qr-join-start`.
   - Participant (any status) / no session: unchanged current behavior.
5. **Styles (`src/client/styles/global.css`, modify)**: dropzone gold-glow card, preview/detection cards (`surface` `#171B2E`, `borderGold` active state), emerald `Analyzed` pill, section list rows, 56px gold CTA; `>= 16px` control baseline; `100dvh` scroll region unchanged; zero horizontal overflow at `390px`.

## Expected File Changes

- `src/client/lib/useStudySetup.ts` — create; default-study fetch + upload/parse state machine.
- `src/client/lib/useLiveSession.ts` — modify; add `openLobby()` leader command dispatch.
- `src/client/components/setup/LeaderStudySetupScreen.tsx` — create; screen composition + a11y regions.
- `src/client/components/setup/StudyUploadDropzone.tsx` — create; tap + drag-and-tap file input.
- `src/client/components/setup/StudyPreviewCard.tsx` — create; analyzed file card + detection summary.
- `src/client/components/setup/StudyStructureList.tsx` — create; 5-section confirmation list (Gospel-only row 3).
- `src/client/components/lobby/TitleLobbyPlaceholder.tsx` — create; minimal Title Lobby handoff surface.
- `src/client/App.tsx` — modify; status/role-based view routing and setup panel collapse/resume.
- `src/client/styles/global.css` — modify; setup/preview/lobby styles.
- `tests/unit/use-study-setup.test.ts` — create; hook tests with mocked `fetch`.
- `tests/unit/leader-study-setup.test.tsx` — create; component tests (scenarios 1–6 surface behavior).
- `tests/e2e/leader-load-study-setup.spec.ts` — create; mobile E2E (scenarios 1, 2, 3, 5).
- `tests/fixtures/malformed-study.md` — create; invalid upload fixture (fixture files only; no parser changes).
- `ARCHITECTURE.md` — modify; document new client modules.

## Visual Design Impact

- UI involved: yes
- Design source: `DESIGN.md` and `ux/2. Leader Setup.png`
- Screens or states affected: Load Your Study (default-analyzed, uploading, upload-error, collapsed), minimal Title Lobby placeholder, `ActiveSessionBanner` composition for leader in `setup`/`lobby`.
- New design artifact required: no — palette (`#0B0D17`, `#171B2E`, `#E2A83E`, `#10B981`, `rgba(226,168,62,0.55)` gold border), typography (`Playfair Display` hero, `Plus Jakarta Sans` body, uppercase gold eyebrows), and motion constants are fully specified. Two documented mockup adjustments: dropzone accepts `.md` as well as `.pdf`, and the back chevron collapses/resumes setup instead of abandoning the live room.

## Durable Documentation Impact

- `ARCHITECTURE.md`: update — add `src/client/components/setup/`, `src/client/components/lobby/`, `src/client/lib/useStudySetup.ts`, and the `openLobby` action to the client module overview.
- `CONSTRAINTS.md`: not needed — #3, #4, #5, #7, #8, #9 already cover every invariant this feature touches.
- `AGENTS.md`: not needed — workflow, startup path, and operating rules unchanged.
- Other docs: `feature_list.json` and `PROGRESS.md` receive evidence on completion; `docs/domain-model.md` already documents the `setup → lobby` transition (no change).

## Implementation Plan

1. Implement `useStudySetup.ts` (fetch default study, upload/parse, error states) with `tests/unit/use-study-setup.test.ts`.
2. Build `StudyUploadDropzone`, `StudyPreviewCard`, `StudyStructureList`, and `LeaderStudySetupScreen` with `motion/react` springs, `>= 16px` controls, `>= 44px` targets, and a11y regions; cover with `tests/unit/leader-study-setup.test.tsx`.
3. Add `openLobby()` to `useLiveSession.ts`; create `TitleLobbyPlaceholder.tsx`; wire status/role routing and collapse/resume into `App.tsx`; style in `global.css`.
4. Add `tests/e2e/leader-load-study-setup.spec.ts` + `tests/fixtures/malformed-study.md`; update `ARCHITECTURE.md`.
5. Run `./init.sh` and `PLAYWRIGHT_PORT=3301 npm run test:e2e`; confirm `tests/e2e/welcome-role-selection.spec.ts` still passes **unmodified**; run `grep -rn "Assistant" src/`.

## Implementation Tasks

- [ ] Create `src/client/lib/useStudySetup.ts` (`status`, `study`, `errorMessages`, `analyzeFile`, `resetError`) using `resolveApiUrl`.
- [ ] Create `StudyUploadDropzone.tsx` (tap + drag-and-tap, `.pdf`/`.md` acceptance, client-side extension rejection, `>= 16px` label, keyboard operable).
- [ ] Create `StudyPreviewCard.tsx` (fileName, `✓ Analyzed`, `5 sections · N questions`, optional file size) and `StudyStructureList.tsx` (5 rows, Gospel-only Section 3 row).
- [ ] Create `LeaderStudySetupScreen.tsx` (hero, PREVIEW region, `role="alert"`, `aria-live` analysis status, 56px gold `Continue →`, back/resume controls) with spring tap + haptics.
- [ ] Add `openLobby()` to `useLiveSession.ts` via `sendLeaderCommand({ type: 'open_lobby', ... })`.
- [ ] Create `TitleLobbyPlaceholder.tsx` and wire `App.tsx` routing (leader+`setup` → banner + setup screen; leader+`lobby` → banner + placeholder; participants unchanged) with collapse/resume state.
- [ ] Add `tests/unit/use-study-setup.test.ts`, `tests/unit/leader-study-setup.test.tsx`, `tests/e2e/leader-load-study-setup.spec.ts`, `tests/fixtures/malformed-study.md`.
- [ ] Update `ARCHITECTURE.md`; run `./init.sh`, `PLAYWRIGHT_PORT=3301 npm run test:e2e`, `grep -rn "Assistant" src/`.

## Verification Plan

- `./init.sh` — non-blocking gate (`npm run typecheck`, `npm test`, `npm run build`) must exit `0`; it must not start long-running servers.
- `PLAYWRIGHT_PORT=3301 npm run test:e2e` — all suites green on `mobile-chromium` `390x844`, including the new `tests/e2e/leader-load-study-setup.spec.ts`:
  - **Scenario 1**: create room → banner + setup screen → default `Great Is Your Faith.pdf` preview, `✓ Analyzed`, `5 sections detected`, 5-row list, Section 3 row shows `Matthew 15:21–28` and the preview contains none of `Isaiah`, `Psalm`, `Romans`, `First Reading`, `Second Reading`, `Responsorial Psalm`; `Continue` enabled; `document.querySelectorAll('canvas').length <= 1`; zero `Assistant` text; no horizontal overflow (`scrollWidth <= clientWidth`).
  - **Scenario 2**: `setInputFiles` on `study-file-input` with `tests/fixtures/peace-be-still-mark-4.md` → preview shows `Peace! Be Still`, `✓ Analyzed`, `5 sections detected`, Section 3 shows `Mark 4:35–41`.
  - **Scenario 3**: `setInputFiles` with `tests/fixtures/malformed-study.md` → `study-setup-alert` visible with server error text; previous preview retained; `Continue` still enabled.
  - **Scenario 5**: click `study-setup-continue` → `title-lobby-placeholder` visible with the previewed study title and Gospel citation; single `<canvas>` still mounted after transition.
- Unit suites must assert: default-fetch rendering, `FormData` POST to `/api/studies/parse`, extension rejection without network, 400/413 error mapping with preview retention, `Continue` disabled until `ready`, `openLobby` dispatch, zero `Assistant`, `>= 16px` control font-size and `>= 44px` CTA min-height, and Gospel-only Section 3 preview content.
- Static scan: `grep -rn "Assistant" src/` returns `0` matches.
- `tests/e2e/welcome-role-selection.spec.ts` and all other existing suites pass **without any assertion changes** (backward compatibility with accepted features).

## Evidence To Capture

- Exit code `0` from `./init.sh` with typecheck result, Vitest suite/test counts, and build output.
- Exit code `0` from `PLAYWRIGHT_PORT=3301 npm run test:e2e` with the per-scenario pass counts on `mobile-chromium` (`390x844`), explicitly noting the untouched `welcome-role-selection.spec.ts` suite also passed.
- `grep -rn "Assistant" src/` output showing `0` matches.
- Named passing tests (`tests/unit/use-study-setup.test.ts`, `tests/unit/leader-study-setup.test.tsx`, `tests/e2e/leader-load-study-setup.spec.ts`) recorded in `feature_list.json` evidence plus a `PROGRESS.md` session log entry.

## Validator Checklist

- [ ] Implementation stays within `leader-load-study-setup-screen` scope (no QR share, no `Start Study`, no `load_study` `/ws` command, no parser changes).
- [ ] Acceptance Scenarios 1–6 pass on `390x844`, including Gospel-only Section 3 preview and preview retention on upload errors.
- [ ] `Continue` triggers server-gated `open_lobby` (`leaderToken`) and the session transitions `setup → lobby`.
- [ ] Zero `Assistant` occurrences in `src/`; `Study Leader` / `Participant` terminology throughout.
- [ ] Dropzone/CTA meet `>= 44px` targets and `>= 16px` control font-size; `motion/react` springs honor `prefers-reduced-motion`; persistent `Sacred3DScene` canvas count `<= 1` across all state transitions.
- [ ] `tests/e2e/welcome-role-selection.spec.ts` and other accepted suites pass unmodified.
- [ ] `./init.sh` and `PLAYWRIGHT_PORT=3301 npm run test:e2e` pass with evidence recorded in `feature_list.json` and `PROGRESS.md`; `ARCHITECTURE.md` updated.

## Open Questions (non-blocking)

1. **Study sync across clients**: Participants cannot see the study title until a `load_study`-style snapshot field exists; deferred to `title-lobby-qr-join-start` (tracked in Non-Goals). If that feature instead adds the command, the placeholder here becomes the receiving surface.
2. **File-size chip** (`2.4 MB` in the mockup): shown only for uploaded files (client-side `File.size`); omitted for the preloaded default since `StudyDocument` carries no size — confirm during validation that omission is acceptable.

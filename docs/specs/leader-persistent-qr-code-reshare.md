# Feature Implementation Spec: Study Leader Persistent QR Code Re-Share Across Active Sections

## Source Feature

- `id`: `leader-persistent-qr-code-reshare`
- `area`: `session-lobby`
- `depends_on`: `["post-join-fullscreen-lobby-isolation"]`
- `status`: `not_started`
- `source`: `feature_list.json`

## Goal

Provide the `Study Leader` with a persistent, accessible **"Share QR"** button (`data-testid="section-share-qr-trigger"`) inside the section header (`SectionProgressHeader`) across all active study sections (`OpeningPrayerScreen`, `IcebreakerScreen`, `GospelReadingScreen`, `DiscussionScreen`, `ClosingPrayerScreen`, and placeholder) per `DESIGN.md` Override #7 and `docs/user-and-access-model.md`. Clicking this button opens the existing localhost-safe, offline-SVG `RoomCodeShareSheet` modal at any point during an in-progress study so late-arriving `Participants` can scan the QR code or follow the join URL. Late-joining `Participants` hydrate directly into the current active section over `/ws` without interrupting the `Study Leader`'s view or closing the modal. `Participants` never see the "Share QR" button.

## Non-Goals

- Backward section navigation (`leader-bidirectional-section-navigation` is a separate feature).
- Modifying the underlying 6-section study document parser or data model (`six-section-study-model-parser`).
- Modifying `RoomCodeShareSheet.tsx` internal layout or QR generation logic.
- Adding new `/ws` protocol messages or bumping `SESSION_PROTOCOL_VERSION` (`join_session` and `session_joined` already support late-join hydration into `in_progress` sections).
- Altering the Welcome screen or pre-join onboarding flow.

## Job Story

When I am leading an active Bible study session and participants arrive late,
I want to re-display the session QR code and join link with a single tap from any active section,
so latecomers can scan and immediately join our current section without disrupting the group or interrupting my view.

## Users And Permissions

- **`Study Leader`**: Sees and can tap the persistent `Share QR` button (`data-testid="section-share-qr-trigger"`) in the section header across all active sections (`in_progress`). Opening the modal does not disrupt session state or background synchronization.
- **`Participant` (including chosen volunteers)**: Never sees the `Share QR` trigger in section headers or any active section UI.
- **Late-Arriving `Participant`**: Enters via `/join/:sessionCode` or QR scan, enters `displayName`, joins the active session, and hydrates immediately into the current active section (`section_1_prayer`..`section_5_closing`).
- **Terminology Invariant**: `Study Leader` and `Participant` only — zero occurrences of `"Assistant"` anywhere in UI copy, code, or tests (`CONSTRAINTS.md` #3).

## Acceptance Scenarios

### Scenario 1: Study Leader in active sections sees persistent "Share QR"; Participant never does

Given a `LiveSession` is `in_progress` (e.g. Section 1 Opening Prayer)
When the `Study Leader` views the active section
Then `SectionProgressHeader` renders `data-testid="section-share-qr-trigger"` with label `"Share QR"` and an accessible target (`>= 44px` touch area)
And when a connected `Participant` views the same active section
Then `data-testid="section-share-qr-trigger"` has DOM count `0`.

### Scenario 2: Clicking "Share QR" opens RoomCodeShareSheet from any active section

Given the `Study Leader` is on any active section (`OpeningPrayerScreen`, `IcebreakerScreen`, `GospelReadingScreen`, `DiscussionScreen`, or `ClosingPrayerScreen`)
When the `Study Leader` clicks `data-testid="section-share-qr-trigger"`
Then `RoomCodeShareSheet` opens (`data-testid="room-code-share-sheet"`) portaled to `document.body`
And displays the offline QR SVG (`data-testid="lobby-qr-svg"`), room code (`data-testid="lobby-room-code"`), readonly join URL (`data-testid="lobby-join-url"`), and `Copy` button (`data-testid="lobby-copy-link"`)
And clicking the close button (`data-testid="room-code-sheet-close"`) dismisses the modal and leaves the active section intact.

### Scenario 3: Late-arriving Participant joins and hydrates directly into the active section

Given the `Study Leader` has an active session in Section 1 (or later sections) with the `RoomCodeShareSheet` open
When a new `Participant` navigates to `/join/:sessionCode`, fills their display name, and clicks `"Join Study"`
Then the late `Participant` is placed directly into the full-screen active section (e.g. `data-testid="section-one-handoff"`)
And the late `Participant` does NOT see `data-testid="section-share-qr-trigger"` or lobby waiting screens.

### Scenario 4: Study Leader's view and open share modal are uninterrupted by late joins

Given the `Study Leader` has `data-testid="room-code-share-sheet"` open while in an active section
When a late-arriving `Participant` joins the session
Then the `Study Leader`'s active section view remains mounted, the share modal remains open and usable, and the live connected count updates in the background.

### Scenario 5: Persistent "Share QR" trigger survives section transitions

Given the `Study Leader` advances the study from Section 1 to Section 2 (Icebreaker), Section 3 (Gospel Reading), Section 4 (Discussion), or Section 5 (Closing)
When each new section screen renders
Then `data-testid="section-share-qr-trigger"` remains visible and operational in the section header for the `Study Leader`, and remains absent for `Participants`.

### Scenario 6: Desktop Dual Side-by-Side Mode isolates trigger to Study Leader frame

Given a desktop viewport (`>= 1024px`) in `?mode=dual` with an active study in Section 1
Then `data-testid="leader-frame"` renders `data-testid="section-share-qr-trigger"` within its active section header
And `data-testid="participant-frame"` has `0` occurrences of `data-testid="section-share-qr-trigger"`.

## Repository Research

### Files Inspected

- `src/client/components/sections/SectionProgressHeader.tsx` — Progress header component currently rendering only `section-one-label` and `section-one-percent`; requires role, sessionCode, and share trigger props.
- `src/client/components/lobby/RoomCodeShareSheet.tsx` — Self-contained modal portal rendering offline SVG QR, room code, join URL with copy, and localhost warning. Reusable as-is.
- `src/client/lib/runtimeUrl.ts` — `resolveJoinUrl(sessionCode, { publicUrl })` builds localhost-safe join URLs using origin or `PUBLIC_URL`.
- `src/client/components/prayer/OpeningPrayerScreen.tsx` — Section 1 root screen rendering `<SectionProgressHeader sectionNumber={1} />`. Receives `role` and `session`.
- `src/client/components/icebreaker/IcebreakerScreen.tsx` — Section 2 root screen rendering `<SectionProgressHeader sectionNumber={2} />`. Receives `role` and `session`.
- `src/client/components/reading/GospelReadingScreen.tsx` — Section 3 root screen rendering `<SectionProgressHeader sectionNumber={3} />`. Receives `role` and `session`.
- `src/client/components/discussion/DiscussionScreen.tsx` — Section 4 root screen rendering `<SectionProgressHeader sectionNumber={4} />`. Receives `role` and `session`.
- `src/client/components/closing/ClosingPrayerScreen.tsx` — Section 5 root screen rendering `<SectionProgressHeader sectionNumber={5} />`. Receives `role` and `session`.
- `src/client/components/prayer/SectionPlaceholderScreen.tsx` — Generic fallback screen for in-progress sections rendering `<SectionProgressHeader sectionNumber={sectionNumber} />`.
- `src/client/components/dual/DualDeviceFrame.tsx` — Renders section screens for both frames in Desktop Dual Mode; passes `role` and `session`.
- `src/client/App.tsx` — Routes `sessionStatus === 'in_progress'` to section screens; holds `publicUrl` state from `GET /api/health`.
- `src/client/styles/global.css` — Contains `.section-one-header` styling (line 1912) and `.room-code-sheet` styles.

### Existing Patterns To Follow

- Prop delegation: Section screens already receive `role: SanctuaryRole` (`isLeader = role === 'Study Leader'`) and `session: PublicLiveSessionSnapshot` (`session.sessionCode`).
- Modal portal: `RoomCodeShareSheet` renders via `createPortal(content, document.body)` with spring animations and `usePrefersReducedMotion`.
- Test ID convention: `data-testid="section-share-qr-trigger"` for the share trigger button.

### Current Gaps

- `SectionProgressHeader` only accepts `sectionNumber: number` and has no share trigger or modal capability.
- Once a study starts, there is no UI trigger for the Study Leader to retrieve or display the QR code again.
- Section screens do not forward `isLeader`, `sessionCode`, or `publicUrl` to `SectionProgressHeader`.

## Technical Approach

1. **Enhance `SectionProgressHeader` (`SectionProgressHeader.tsx`)**:
   - Extend `SectionProgressHeaderProps` with optional props:
     - `isLeader?: boolean;`
     - `sessionCode?: string;`
     - `publicUrl?: string | null;`
     - `onShareQr?: () => void;`
   - If `isLeader || onShareQr` is truthy, render `<button type="button" className="section-share-qr-trigger" data-testid="section-share-qr-trigger" onClick={handleShare}>Share QR</button>`.
   - Maintain internal `[shareOpen, setShareOpen] = useState(false)`. If `onShareQr` is provided, invoke it on click; otherwise set `shareOpen(true)`.
   - When `shareOpen` is true and `sessionCode` is present, resolve `joinUrl = resolveJoinUrl(sessionCode, { publicUrl })` and render `<RoomCodeShareSheet>` portaled to `document.body`.
   - Preserve existing `section-one-label` and `section-one-percent` elements and test IDs.

2. **Wire Section Screens**:
   - In `OpeningPrayerScreen`, `IcebreakerScreen`, `GospelReadingScreen`, `DiscussionScreen`, `ClosingPrayerScreen`, and `SectionPlaceholderScreen`:
   - Accept optional `publicUrl?: string | null;` and `onShareQr?: () => void;` in screen props.
   - Forward `isLeader={isLeader}`, `sessionCode={session.sessionCode}`, `publicUrl={publicUrl}`, `onShareQr={onShareQr}` to `<SectionProgressHeader>`.

3. **Pass `publicUrl` in `App.tsx`**:
   - Forward `publicUrl={publicUrl}` to the section screen components in the `sessionStatus === 'in_progress'` routing block.

4. **Style `.section-share-qr-trigger` (`global.css`)**:
   - Sacred gold outline button (`border: 1px solid rgba(226, 168, 62, 0.45)`, `color: var(--color-primary)`).
   - Glass slate background (`background: rgba(23, 27, 46, 0.85)`).
   - Eyebrow styling: `font-size: 0.75rem`, `font-weight: 600`, `text-transform: uppercase`, `letter-spacing: 0.08em`.
   - Accessible touch padding with `min-height: 36px` and target `>= 44px`.
   - Interactive feedback respecting `prefers-reduced-motion`.

## Expected File Changes

- `src/client/components/sections/SectionProgressHeader.tsx` — modify: add `isLeader`, `sessionCode`, `publicUrl`, `onShareQr` props, render `section-share-qr-trigger`, and conditionally portal `RoomCodeShareSheet`.
- `src/client/components/prayer/OpeningPrayerScreen.tsx` — modify: accept `publicUrl` / `onShareQr` and pass to `SectionProgressHeader`.
- `src/client/components/icebreaker/IcebreakerScreen.tsx` — modify: accept `publicUrl` / `onShareQr` and pass to `SectionProgressHeader`.
- `src/client/components/reading/GospelReadingScreen.tsx` — modify: accept `publicUrl` / `onShareQr` and pass to `SectionProgressHeader`.
- `src/client/components/discussion/DiscussionScreen.tsx` — modify: accept `publicUrl` / `onShareQr` and pass to `SectionProgressHeader`.
- `src/client/components/closing/ClosingPrayerScreen.tsx` — modify: accept `publicUrl` / `onShareQr` and pass to `SectionProgressHeader`.
- `src/client/components/prayer/SectionPlaceholderScreen.tsx` — modify: accept `isLeader`, `sessionCode`, `publicUrl`, `onShareQr` and pass to `SectionProgressHeader`.
- `src/client/App.tsx` — modify: pass `publicUrl` to active section screens.
- `src/client/components/dual/DualDeviceFrame.tsx` — modify: forward props so Study Leader frame has persistent share trigger.
- `src/client/styles/global.css` — modify: add `.section-share-qr-trigger` and `.section-header-actions` rules.
- `tests/unit/section-progress-header.test.tsx` — create: unit tests for `SectionProgressHeader` role gating, click handler, and `RoomCodeShareSheet` integration.
- `tests/e2e/leader-persistent-qr-code-reshare.spec.ts` — create: Playwright E2E multi-client verification across mobile and Desktop Dual Mode.

## Visual Design Impact

- UI involved: Yes.
- Design source: `DESIGN.md` Override #7 (lines 172–174) & Persistent Section Header (line 203).
- Screens affected: All active study section headers (Sections 1–5), placeholder screen, and Desktop Dual Side-by-Side Mode.
- Visual styling: Elegant Sacred Gold outline pill button placed alongside the section percent indicator in `.section-one-header`. Seamlessly integrates with the midnight canvas and glass card aesthetic.

## Durable Documentation Impact

- `ARCHITECTURE.md`: update to document the persistent section header QR share trigger and late-join hydration flow.
- `CONSTRAINTS.md`: not needed (already covers `Participant` naming and dynamic URL resolution).
- `AGENTS.md`: not needed.

## Implementation Plan

1. **Update `SectionProgressHeader`**: Add props, trigger button, and `RoomCodeShareSheet` portal with reduced motion support.
2. **Add CSS styles**: Add `.section-share-qr-trigger` styles in `src/client/styles/global.css`.
3. **Update Section Screens**: Thread `isLeader`, `sessionCode`, and optional `publicUrl` / `onShareQr` through all 5 section screens and `SectionPlaceholderScreen`.
4. **Update `App.tsx` and `DualDeviceFrame.tsx`**: Pass `publicUrl` to active section screens.
5. **Add Unit Tests**: Create `tests/unit/section-progress-header.test.tsx` covering leader visibility, participant exclusion, click action, and modal rendering.
6. **Add Playwright E2E Suite**: Create `tests/e2e/leader-persistent-qr-code-reshare.spec.ts` testing multi-client active section QR re-sharing, late-join hydration, section transitions, and dual mode isolation.

## Implementation Tasks

- [ ] Update `SectionProgressHeader.tsx` to support `isLeader`, `sessionCode`, `publicUrl`, `onShareQr`, `data-testid="section-share-qr-trigger"`, and `RoomCodeShareSheet`.
- [ ] Add `.section-share-qr-trigger` styles to `src/client/styles/global.css`.
- [ ] Update `OpeningPrayerScreen.tsx`, `IcebreakerScreen.tsx`, `GospelReadingScreen.tsx`, `DiscussionScreen.tsx`, `ClosingPrayerScreen.tsx`, and `SectionPlaceholderScreen.tsx` to pass props to `SectionProgressHeader`.
- [ ] Update `App.tsx` to pass `publicUrl` to in-progress section screens.
- [ ] Update `DualDeviceFrame.tsx` to ensure `SectionProgressHeader` is active for the Study Leader frame in Dual Mode.
- [ ] Create `tests/unit/section-progress-header.test.tsx` and verify passing with `npm test`.
- [ ] Create `tests/e2e/leader-persistent-qr-code-reshare.spec.ts` and verify with Playwright.
- [ ] Run full baseline `./init.sh` and verify 0 occurrences of `"Assistant"`.
- [ ] Update `ARCHITECTURE.md`, `feature_list.json`, and `PROGRESS.md`.

## Verification Plan

- `npm run typecheck`: clean compilation across all 3 tsconfigs.
- `npm test tests/unit/section-progress-header.test.tsx`: all unit tests pass.
- `npm test`: all unit and integration suites pass without regressions.
- `PORT=3104 API_PORT=3204 PLAYWRIGHT_PORT=3304 npx playwright test tests/e2e/leader-persistent-qr-code-reshare.spec.ts`: all E2E scenarios pass.
- `grep -rn "Assistant" src/`: returns zero matches.
- `./init.sh`: exits 0.

## Evidence To Capture

- Output from `npm run typecheck`, `npm test`, and `npx playwright test tests/e2e/leader-persistent-qr-code-reshare.spec.ts`.
- Zero match verification for `"Assistant"`.
- Health check confirmation of zero leaked sessions (`GET /api/health` `activeSessionCount: 0`).

## Validator Checklist

- [ ] Implementation stays within this feature's scope.
- [ ] Acceptance scenarios pass.
- [ ] Study Leader sees `data-testid="section-share-qr-trigger"` across all active sections.
- [ ] Participants NEVER see `data-testid="section-share-qr-trigger"`.
- [ ] Clicking the trigger opens `RoomCodeShareSheet` modal with SVG QR, room code, and copy link.
- [ ] Late-arriving Participant scanning/using join URL hydrates directly into active section.
- [ ] Study Leader view and open modal are uninterrupted by late joiners.
- [ ] Zero occurrences of forbidden term "Assistant".
- [ ] Persistent E2E coverage was added in `tests/e2e/leader-persistent-qr-code-reshare.spec.ts`.
- [ ] `feature_list.json` and `PROGRESS.md` updated correctly.

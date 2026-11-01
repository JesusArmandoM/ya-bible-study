# Feature Implementation Spec: Participant builds downloadable Lord Help Me prayer card privately

## Source Feature

- `id`: section-4-lord-help-me-prayer-card
- `area`: section-4-discussion
- `depends_on`: ["section-4-live-participant-reflections"] (accepted)
- `status`: not_started
- `source`: `feature_list.json`

## Goal

In Section 4 of 5 (80%, 'Lord, Help Me Pray'), Participants engage in personal, private prayer reflection by composing a three-part "Lord, Help Me" Prayer Card based on Matthew 15:21–28 (*For myself*, *For someone I love*, *For the Church/world*). Per repository privacy invariants (CONSTRAINTS.md #6), typing prayer drafts into these inputs MUST stay strictly local on the Participant's device (saved to client `localStorage`) and trigger ZERO network requests or WebSocket frames. When ready, Participants can export or share a beautifully styled keepsake prayer card rendered to a high-resolution PNG image via HTML5 Canvas using Sacred Midnight design tokens (`#0B0D17` midnight canvas, `#171B2E` surface cards, `#E2A83E` gold borders/accents, and Playfair Display serif typography), leveraging the Web Share API (`navigator.share({ files: [...] })`) on mobile devices with an automatic browser file download fallback. Additionally, Participants have the option to voluntarily share ONE chosen prayer line to the live Section 4 group feed (with optional anonymous masking) by reusing the established `submit_reflection` wire command.

## Non-Goals

- Section 5 Closing Prayer flow, session summary metrics, weekly challenge selections, and session finish/purge (deferred to downstream `section-5-closing-prayer-completion`).
- Desktop Dual Side-by-Side Mode simulation tools (deferred to downstream `desktop-dual-side-by-side-mode`).
- Server-side synchronization or persistent storage of unshared prayer card drafts (prohibited by CONSTRAINTS.md #6).
- Batch sharing of all three prayer lines simultaneously (voluntary sharing is single-line to maintain discussion feed focus).
- External cloud storage, backend image generation, or PDF document exports.

## Job Story

When participating in the Section 4 Deep Analysis discussion,
I want to privately compose my three personal prayers on a "Lord, Help Me" Prayer Card, download/share a styled keepsake image, and optionally share one prayer line with the group,
so I can reflect deeply in personal adoration without fear of accidental broadcast, preserve a tangible keepsake of our study on my phone, and encourage my community with a shared prayer intention.

## Users And Permissions

- Participant: Primary actor; opens the "Lord, Help Me" Prayer Card builder modal from Section 4; writes drafts locally; exports PNG keepsake image; optionally shares one prayer line to the live group feed.
- Study Leader: Can also open the Prayer Card modal to compose personal prayers or download a keepsake; receives voluntarily shared prayer lines in the live Section 4 `ReflectionFeed` with dynamic counter updates.
- Anonymous Sharing: When a participant voluntarily shares a prayer line with "Share anonymously" enabled, server-side masking guarantees zero leakage of author real name or `memberId` to wire broadcasts or snapshots.

## Acceptance Scenarios

### Scenario 1: Opening the Prayer Card builder in Section 4 (Participant)

Given a Participant in Section 4 Deep Analysis on the active question card
When the Participant taps the secondary `"Lord, Help Me" Prayer Card` action pill (`data-testid="open-prayer-card-btn"`)
Then the Prayer Card modal opens showing the title (`"Lord, Help Me" Prayer Card`), biblical instruction ("Write three short, honest prayers inspired by Matthew 15:21–28."), privacy badge ("🔒 Private on your device — never shared automatically"), and three prayer sections with prompts:
  1. For myself (`Lord, help me …`)
  2. For someone I love (`Lord, have mercy on …`)
  3. For the Church/world (`Lord, make Your house a house of prayer for …`)
with the Sacred Gold "Export Prayer Card (PNG)" CTA and individual "Share line to group" actions.

### Scenario 2: Strict draft privacy — zero network requests or /ws frames

Given a Participant typing into the three Prayer Card inputs
When the Participant enters prayer text into "For myself", "For someone I love", and "For the Church/world"
Then the draft text is stored synchronously in `localStorage` keyed by session and member (`ya-bible-study.prayer-card.${sessionCode}.${memberId}`)
And monitoring network activity confirms ZERO HTTP requests and ZERO WebSocket frames are transmitted
And reloading the browser or reopening the modal restores the drafted prayer text without network communication.

### Scenario 3: Keepsake PNG image export on mobile & desktop

Given a Participant with completed or partial prayer card text
When the Participant taps "Export Prayer Card (PNG)"
Then the HTML5 Canvas renderer creates a high-resolution PNG blob (using Sacred Midnight `#0B0D17` background, `#171B2E` cards, `#E2A83E` gold borders, and Playfair Display / serif headings) containing study title, Scripture citation ("Matthew 15:21–28"), and the 3 prayer intentions
And if `navigator.canShare({ files: [file] })` is supported, it invokes `navigator.share({ files, title })`; otherwise, it triggers a standard browser file download named `prayer-card.png`.

### Scenario 4: Voluntary single-prayer line sharing to live group feed

Given a Participant with text entered in the "For myself" prayer input ("trust Your timing when answers seem slow")
When the Participant taps "Share line to group" on that prayer line
Then the prayer line is submitted using `submit_reflection` formatted as `[For myself] Lord, help me trust Your timing when answers seem slow.`
And exactly ONE WebSocket frame is sent over `/ws`
And the shared prayer line appears in the live `ReflectionFeed` across all Participant and Study Leader screens, and the question response counter increments by 1.

### Scenario 5: Anonymous single-prayer line sharing maintains privacy

Given a Participant sharing the "For someone I love" prayer line with "Share anonymously" toggled
When the prayer line is submitted
Then the server sets `isAnonymous: true`, `authorDisplayName: 'Anonymous'`, `authorInitials: '?'`, broadcasting `session_updated` (`command: 'submit_reflection'`)
And inspecting raw `/ws` frames confirms the participant's real name and `memberId` do not appear anywhere in the payload
And all clients see the reflection from "Anonymous" in the live feed.

### Scenario 6: Mobile ergonomics and input validation

Given a Participant on a mobile viewport (390x844)
When interacting with the Prayer Card modal
Then all three prayer inputs enforce computed `font-size >= 16px` (`1rem`) to prevent iOS Safari auto-zoom
And the modal is fully scrollable within `100dvh` safe-area bounds with touch targets `>= 44px`
And the "Share line to group" button is disabled for empty or whitespace-only prayer inputs.

## Repository Research

### Files Inspected

- `src/shared/study.ts`: `PrayerCardPromptId`, `PrayerCardPromptItem`, `PrayerCardTemplate`, and `DeepAnalysisSection`.
- `src/shared/session.ts`: `SessionReflection`, `SessionDiscussionState`, `SessionStudySummary`, `normalizeReflectionContent`, `submit_reflection` command.
- `src/server/studies/greatIsYourFaithSeed.ts`: authoritative seed definition with `prayerCardTemplate` (prompts: `self`, `loved-one`, `church-world`).
- `src/server/sessionStore.ts`: `handleSubmitReflection` handles socket-bound reflection submissions with server-side anonymity masking.
- `src/client/components/discussion/DiscussionScreen.tsx`: Section 4 top-level screen routing Leader vs Participant views.
- `src/client/components/discussion/ActiveQuestionCard.tsx`: Participant view in Section 4, contains prompt, `ReflectionFeed`, respond button, locked advance note.
- `src/client/components/discussion/ReflectionFeed.tsx`: Renders live reflections reverse-chronologically.
- `src/client/styles/global.css`: Sacred Midnight tokens, responsive cards, modals, touch targets.
- `CONSTRAINTS.md`: Rule 3 (Participant terminology), Rule 6 (ephemeral privacy & local prayer cards), Rule 7 (`font-size >= 16px` & `100dvh`).
- `DESIGN.md`: Section 4 visual authority, Sacred Midnight palette (`#0B0D17`, `#171B2E`, `#E2A83E`), serif typography, pill CTAs.
- `docs/risks-and-open-questions.md`: Web Share API `navigator.share({ files })` with fallback to `<a download>`.

### Existing Patterns To Follow

- Protocol v3 additive wire schema: no breaking changes to WebSocket wire formats.
- Reusing existing `submitReflection` room action for voluntary single-prayer line sharing without new server endpoints.
- Pure client-side canvas rendering in `src/client/lib/prayerCardCanvas.ts`.
- Dedicated storage helper `src/client/lib/prayerCardStorage.ts` for safe `localStorage` access and serialization.
- Spring animations with `motion/react` and `usePrefersReducedMotion`.

### Current Gaps

- Missing `PrayerCardModal.tsx` and prayer card UI styles.
- Missing HTML5 Canvas PNG renderer `src/client/lib/prayerCardCanvas.ts`.
- Missing client-side storage module `src/client/lib/prayerCardStorage.ts` for local drafts.
- `ActiveQuestionCard.tsx` lacks a trigger to open the Prayer Card modal.

## Technical Approach

**1. Local Draft Storage & Privacy Boundary (`src/client/lib/prayerCardStorage.ts`)**
```ts
export interface PrayerCardDraft {
  self: string;
  lovedOne: string;
  churchWorld: string;
  updatedAt: number;
}
```
- Storage key: `ya-bible-study.prayer-card.${sessionCode}.${memberId || 'guest'}`.
- Functions: `loadPrayerCardDraft(key)`, `savePrayerCardDraft(key, draft)`, `clearPrayerCardDraft(key)`.
- Enforces strict privacy: typing into inputs updates `localStorage` synchronously/debounced locally with ZERO network traffic.

**2. Keepsake Canvas PNG Renderer (`src/client/lib/prayerCardCanvas.ts`)**
- Renders high-resolution image on off-screen `<canvas width={1080} height={1350}>`:
  - Deep Midnight background `#0B0D17` with subtle ambient radial glow (`rgba(226, 168, 62, 0.15)`).
  - Gold border (`rgba(226, 168, 62, 0.55)`), rounded card frame.
  - Header: `YA BIBLE STUDY · PRAYER CARD`, `"Lord, Help Me"`, and Scripture citation `Matthew 15:21–28`.
  - 3 intention cards (`#171B2E`): audience label in gold (`FOR MYSELF`, `FOR SOMEONE I LOVE`, `FOR THE CHURCH & WORLD`), prompt prefix italicized, and completed prayer text.
  - Footer: *"O woman, great is your faith!" — Matthew 15:28*.
- Export function `exportOrSharePrayerCard(blob, filename)`:
  - If `navigator.canShare?.({ files: [file] })` is supported, calls `navigator.share({ files: [file], title: 'Lord, Help Me Prayer Card' })`.
  - Otherwise, triggers browser download via temporary `<a download="prayer-card.png">` click and revokes object URL.

**3. Voluntary Single-Line Sharing**
- Formats prayer text:
  - For myself: `[For myself] Lord, help me ${text}`
  - For someone I love: `[For someone I love] Lord, have mercy on ${text}`
  - For the Church/world: `[For the Church/world] Lord, make Your house a house of prayer for ${text}`
- Tapping "Share line to group" calls `onSubmitReflection({ questionId: activeQuestionId, content, isAnonymous })`.
- Reuses existing server-side anonymous masking and updates Section 4 `ReflectionFeed` in real time.

**4. Client UI Architecture**
- `src/client/components/prayer-card/PrayerCardModal.tsx`:
  - Modal with slide-up sheet layout, close button, title, instructions, and privacy pill.
  - 3 input sections with computed `font-size >= 16px` (`1rem`), prompt prefix, and character limits (e.g. 280 chars).
  - Per-line "Share line to group" action with "Share anonymously" toggle.
  - Bottom Sacred Gold CTA: "Export Prayer Card (PNG)" with download/share icon.
- `src/client/components/discussion/ActiveQuestionCard.tsx`:
  - Adds secondary action pill `"Lord, Help Me" Prayer Card` (`data-testid="open-prayer-card-btn"`).
- `src/client/components/discussion/DiscussionScreen.tsx`:
  - Manages modal visibility state and passes `onSubmitReflection`.

## Expected File Changes

- `src/client/lib/prayerCardStorage.ts` — create: local draft storage helpers (`loadPrayerCardDraft`, `savePrayerCardDraft`, `formatPrayerLine`).
- `src/client/lib/prayerCardCanvas.ts` — create: HTML5 Canvas PNG renderer (`renderPrayerCardToPngBlob`) and export helper (`exportOrSharePrayerCard`).
- `src/client/components/prayer-card/PrayerCardModal.tsx` — create: 3-prompt prayer builder modal with export & single-line sharing.
- `src/client/components/discussion/ActiveQuestionCard.tsx` — modify: add Prayer Card trigger button.
- `src/client/components/discussion/DiscussionScreen.tsx` — modify: manage modal open state, wire submit handler.
- `src/client/styles/global.css` — modify: append Prayer Card modal, form inputs, export buttons, and mobile styles.
- `ARCHITECTURE.md` — update: document Prayer Card local client storage, zero-network draft privacy boundary, canvas keepsake generation, and voluntary reflection sharing.
- Tests:
  - `tests/unit/prayer-card-storage.test.ts` (new)
  - `tests/unit/prayer-card-canvas.test.ts` (new)
  - `tests/unit/prayer-card-modal.test.tsx` (new)
  - `tests/e2e/section-4-lord-help-me-prayer-card.spec.ts` (new)

## Visual Design Impact

- UI involved: yes. Follow `DESIGN.md` Section 4 visual authority and Sacred Midnight palette.
- Background: `#0B0D17` with `#171B2E` cards, subtle borders `rgba(255, 255, 255, 0.09)`.
- Primary CTA: Sacred Gold (`#E2A83E`) pill button "Export Prayer Card (PNG)" (`#11131F` dark ink, 56px height).
- Form inputs: `<textarea>` / `<input>` strictly maintain `font-size >= 16px` (`1rem`) to prevent iOS Safari auto-zoom.
- Privacy pill: Dark container with emerald lock icon reassuring private local storage.
- Keepsake PNG card: High-contrast 1080x1350 card with gold border and Playfair Display serif typography.

## Durable Documentation Impact

- `ARCHITECTURE.md`: update — document Prayer Card local client storage, zero-network draft privacy boundary, canvas keepsake generation, and voluntary reflection sharing.
- `CONSTRAINTS.md`: not needed — Rule 6 (Ephemeral Privacy & Local Prayer Cards) and Rule 7 (Mobile Ergonomics >= 16px) already define these invariants.
- `AGENTS.md`: not needed — workflow and repo operating rules unchanged.

## Implementation Plan

1. **Storage & formatting helpers**: Build `src/client/lib/prayerCardStorage.ts` with `loadPrayerCardDraft`, `savePrayerCardDraft`, `clearPrayerCardDraft`, and `formatPrayerLine` + unit tests in `tests/unit/prayer-card-storage.test.ts`.
2. **Canvas PNG renderer & export helper**: Build `src/client/lib/prayerCardCanvas.ts` with `renderPrayerCardToPngBlob` and `exportOrSharePrayerCard` + unit tests in `tests/unit/prayer-card-canvas.test.ts`.
3. **Client UI components & integration**: Build `PrayerCardModal.tsx`, integrate trigger into `ActiveQuestionCard.tsx` and `DiscussionScreen.tsx`, and add CSS styles in `src/client/styles/global.css` + unit tests in `tests/unit/prayer-card-modal.test.tsx`.
4. **E2E verification & documentation**: Add multi-client Playwright suite `tests/e2e/section-4-lord-help-me-prayer-card.spec.ts` covering Scenarios 1–6 (strict zero network frames during typing, PNG export blob, voluntary single-line sharing, anonymous masking, mobile ergonomics), run `./init.sh` and Playwright suites, and update `ARCHITECTURE.md`, `feature_list.json`, and `PROGRESS.md`.

## Implementation Tasks

- [ ] Create `src/client/lib/prayerCardStorage.ts` implementing `PrayerCardDraft`, `loadPrayerCardDraft`, `savePrayerCardDraft`, `clearPrayerCardDraft`, and `formatPrayerLine`.
- [ ] Add `tests/unit/prayer-card-storage.test.ts` validating serialization, storage key isolation, reload persistence, and prayer line formatting.
- [ ] Create `src/client/lib/prayerCardCanvas.ts` implementing `renderPrayerCardToPngBlob` and `exportOrSharePrayerCard` with Web Share API and download fallback.
- [ ] Add `tests/unit/prayer-card-canvas.test.ts` testing canvas rendering, blob output dimensions, and fallback handling.
- [ ] Create `src/client/components/prayer-card/PrayerCardModal.tsx` rendering the 3 prompts with `>= 16px` inputs, privacy pill, single-line sharing, and export CTA.
- [ ] Update `src/client/components/discussion/ActiveQuestionCard.tsx` with `"Lord, Help Me" Prayer Card` action trigger; update `DiscussionScreen.tsx` to manage modal state.
- [ ] Append Prayer Card modal, card inputs, and mobile styles in `src/client/styles/global.css`.
- [ ] Add `tests/unit/prayer-card-modal.test.tsx` verifying component rendering, local draft saving, zero "Assistant" copy, and single-line share dispatches.
- [ ] Create `tests/e2e/section-4-lord-help-me-prayer-card.spec.ts` verifying Scenarios 1–6 (zero /ws network frames while typing, valid PNG blob download, single-line sharing into live feed, anonymous masking, mobile >= 16px inputs).
- [ ] Run `./init.sh` and Playwright test suite twice consecutively; record results in `feature_list.json` and `PROGRESS.md`.
- [ ] Update `ARCHITECTURE.md` with Prayer Card local client storage, canvas export, and voluntary sharing pattern.

## Verification Plan

- `./init.sh` — non-blocking verification gate (`npm run typecheck`, `npm test`, `npm run build`); must exit 0.
- `PLAYWRIGHT_PORT=3302 npm run test:e2e` — full mobile-chromium 390x844 suite run TWICE consecutively; must exit 0 with zero leaked sessions.
- Zero network frame assertion: monitor `/ws` frames during typing into all 3 inputs, asserting 0 frames sent.
- Blob validation: assert PNG export creates non-empty `image/png` blob and triggers file download.
- Mobile font-size: assert computed `font-size >= 16px` on all 3 prayer inputs.
- Terminology scan: `grep -rn "Assistant" src/` returns 0 matches (exit code 1).

## Evidence To Capture

- Command output of `./init.sh` (clean typecheck, Vitest unit/integration suites, production build).
- Command output of two consecutive `PLAYWRIGHT_PORT=3302 npm run test:e2e` runs.
- Exit code 1 from `grep -rn "Assistant" src/`.
- Playwright assertion confirming 0 WebSocket frames during prayer card typing.

## Validator Checklist

- [ ] Implementation stays within this feature's scope (no Section 5 completion or dual mode work).
- [ ] Participant can open the "Lord, Help Me" Prayer Card builder modal in Section 4.
- [ ] Three prayer inputs are rendered: "For myself", "For someone I love", and "For the Church/world".
- [ ] Typing into all three prayer inputs triggers ZERO network requests and ZERO /ws frames.
- [ ] Drafts are saved to `localStorage` and persist across page reloads.
- [ ] Exporting generates a styled high-resolution PNG image blob using Sacred Midnight tokens.
- [ ] Web Share API `navigator.share({ files })` is called when supported, falling back to browser PNG download.
- [ ] Participants can voluntarily share ONE chosen prayer line to the live Section 4 feed.
- [ ] Shared prayer line appears in the live `ReflectionFeed` and updates question response counters.
- [ ] Voluntary sharing supports anonymous masking without leaking author real name or memberId.
- [ ] All prayer input elements enforce computed `font-size >= 16px` (`1rem`) on mobile viewports.
- [ ] `grep -rn "Assistant" src/` returns 0 matches.
- [ ] `./init.sh` exits 0 and Playwright E2E passes twice consecutively with zero leaked sessions.

## Open Questions / Unknowns

- Exported PNG filename defaults to `prayer-card.png` (or `lord-help-me-prayer-card.png`).
- Default prompt character limit is 280 characters per prayer line, leaving ample room for concise, heartfelt prayer intentions while fitting cleanly onto the keepsake card layout.

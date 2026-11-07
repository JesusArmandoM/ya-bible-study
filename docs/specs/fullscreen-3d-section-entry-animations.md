# Feature Implementation Spec: Full-Screen 3D Section Entry Animations Across Six Sections

## Source Feature

- `id`: `fullscreen-3d-section-entry-animations`
- `area`: `3d-motion`
- `depends_on`: `["post-join-fullscreen-lobby-isolation", "leader-bidirectional-section-navigation"]`
- `status`: `not_started`
- `source`: `feature_list.json`

## Goal

Display an immersive, multi-second (~3.2s) full-screen 3D `Sacred3DScene` overlay (`SectionEntryOverlay`) covering the entire viewport (`100dvh`) whenever starting the study or entering any of the 6 sections (forward or backward) per `DESIGN.md` Override #3 and `docs/domain-model.md`.
Each section entry displays:
1. The section's distinct 3D sacred emblem and radiant color aura rendered through the persistent WebGL `<Canvas>`.
2. The section count indicator: `"SECTION X OF 6"`.
3. The section title.
4. A poetic, liturgical description of the stage being entered:
   - **Section 1 — Opening Prayer**: Luminous liturgical violet 3D Prayer Orb (`#B855C8`) — *"Prepare our hearts in humility and mercy"*.
   - **Section 2 — Icebreaker**: Warm amber/bronze interlocking 3D Hospitality Rings (`#E2A83E`) — *"Outsiders Wanted"*.
   - **Section 3 — Gospel Reading**: Sanctuary indigo-periwinkle 3D Gospel Codex (`#6E75F5`) — *"Proclamation of Matthew 15:21–28"*.
   - **Section 4 — Deep Analysis**: Radiant emerald-and-gold 3D Lantern & Scroll Crystal (`#10B981` / `#E2A83E`) — *"Verse-by-Verse Gospel Breakdown & Catholic Doctrine"*.
   - **Section 5 — Discussion & Reflection**: Luminous rose-gold 3D Community Flame (`#E2A83E` / `#B855C8`) — *"Lord, Help Me Pray"*.
   - **Section 6 — Closing Prayer**: Golden 5-point 3D Star of Faith (`#E2A83E`) — *"Sending Forth in Faith"*.
5. Automatic smooth fade-out (~3.2s timer, or shortened for `prefers-reduced-motion`) revealing the section content.
6. Invariant: Maintain the strict WebGL budget (`<= 1` `<Canvas>` per device frame; `<= 2` in Desktop Dual Side-by-Side Mode).

## Non-Goals

- Modifying the random picker spin animation (that is `fullscreen-3d-random-picker-reveal`, Issue #48).
- Modifying section content or facilitator notes.
- Adding additional sections beyond the canonical 6.

## Job Story

When the study leader starts the study or moves between sections,
I want a brief, reverent full-screen 3D animation introducing each section and its spiritual focus,
so everyone in the room transitions their attention together into the sacred rhythm of the study.

## Users And Permissions

- **Both Roles (`Study Leader` & `Participant`)**: See the synchronized full-screen 3D overlay triggered by `sectionEnteredAt` timestamps or section transitions from `/ws`.
- **Reduced Motion Users**: Durations are shortened to <= 1s with smooth opacity fades without rapid 3D spins.
- **Desktop Dual Mode**: Both leader and participant frames independently render the synchronized entry animation within their respective frames while respecting the canvas budget (`<= 2` total).
- **Terminology Invariant**: Strictly `Study Leader` and `Participant` (zero occurrences of `"Assistant"`).

## Acceptance Scenarios

### Scenario 1: Starting the study triggers Section 1 3D entry overlay

Given a LiveSession is in `lobby`
When the `Study Leader` clicks `"Start Study"`
Then both `Study Leader` and `Participant` viewports render `data-testid="section-entry-overlay"`
And displays `"SECTION 1 OF 6"`, `"Opening Prayer"`, and `"Prepare our hearts in humility and mercy"`
And contains the active `Sacred3DScene` canvas (respecting `<Canvas>` count `<= 1`)
And after ~3.2s, the overlay smoothly fades out, revealing `data-testid="section-one-handoff"`.

### Scenario 2: Advancing to Section 2 displays Icebreaker 3D entry overlay

Given Section 1 is active
When the `Study Leader` advances to Section 2
Then `data-testid="section-entry-overlay"` covers the screen displaying `"SECTION 2 OF 6"`, `"Icebreaker"`, and `"Outsiders Wanted"` with amber/bronze rings emblem
And after duration expires, the overlay unmounts revealing `data-testid="icebreaker-screen"`.

### Scenario 3: Navigating backward to an earlier section displays that section's 3D entry overlay

Given the session is on Section 4
When the `Study Leader` clicks `data-testid="previous-section-btn"` to return to Section 3
Then `data-testid="section-entry-overlay"` covers the screen displaying `"SECTION 3 OF 6"`, `"Gospel Reading"`, and `"Proclamation of Matthew 15:21–28"`
And after duration expires, the overlay unmounts revealing `data-testid="gospel-reading-screen"`.

### Scenario 4: Single persistent WebGL Canvas budget is preserved

Given any section entry animation is displaying
When inspecting the DOM for `<canvas>` elements
Then the standalone viewport contains strictly `<= 1` `<canvas>`
And in Desktop Dual Side-by-Side Mode, the entire document contains strictly `<= 2` `<canvas>` elements (one per frame).

## Expected File Changes

| File | Change |
| :--- | :--- |
| `src/client/components/stage/SectionEntryOverlay.tsx` | New component rendering full-screen 3D entry animation for each of the 6 sections |
| `src/client/state/sacredStageStore.ts` | Add stage configurations and metadata mapping for all 6 section entry emblems |
| `src/client/components/stage/Sacred3DScene.tsx` | Support the 6 section sacred emblem models/variants (Prayer Orb, Hospitality Rings, Gospel Codex, Lantern & Scroll, Community Flame, Star of Faith) |
| `src/client/App.tsx` | Render `SectionEntryOverlay` triggered on `currentSectionId` / `sectionEnteredAt` change |
| `src/client/components/dual/DualDeviceFrame.tsx` | Wire `SectionEntryOverlay` per device frame in dual mode |
| `src/client/styles/global.css` | Styling for full-screen entry overlay (`z-index`, backdrop, typography, glow) |
| `tests/unit/section-entry-overlay.test.tsx` | Unit tests verifying emblem, titles, descriptions, and auto-dismiss timing |
| `tests/e2e/fullscreen-3d-section-entry-animations.spec.ts` | Playwright E2E spec verifying entry animations across sections and canvas budget |

## Verification Plan

1. **Vitest Unit Tests**:
   - `npx vitest run tests/unit/section-entry-overlay.test.tsx`
2. **Playwright E2E**:
   - `npx playwright test tests/e2e/fullscreen-3d-section-entry-animations.spec.ts`
3. **Build & Quality Check**:
   - `./init.sh` exits 0 (typecheck, tests, build).
   - Terminology check: `grep -rn "Assistant" src/` returns 0 matches.
   - Canvas count check: assert `<= 1` in mobile, `<= 2` in dual mode.

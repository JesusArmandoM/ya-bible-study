# Feature Implementation Spec: Section 4 Deep Analysis Screen

## Source Feature

- `id`: `section-4-deep-analysis-screen`
- `area`: `section-4-deep-analysis`
- `depends_on`: `["six-section-study-model-parser", "leader-bidirectional-section-navigation"]`
- `status`: `not_started`
- `source`: `feature_list.json`

## Goal

Replace the temporary `SectionPlaceholderScreen` for Section 4 with a rich, interactive, full-screen **`DeepAnalysisScreen`** (`data-testid="deep-analysis-screen"`) presenting the parsed Gospel breakdown to both the `Study Leader` and `Participants` per `docs/domain-model.md` and `DESIGN.md` Override #5.
The screen renders:
1. `SectionProgressHeader` showing `SECTION 4 OF 6` (`67%` progress) with the Study Leader `Share QR` button and `Leave` action.
2. The Deep Analysis heading (`eyebrow`: `"DEEP ANALYSIS · 15 MIN"`, `title`: `"Deep Analysis & Catholic Doctrine"`).
3. Three clear interactive subsections or tabs/pills for smooth reading on mobile:
   - **Verse-by-Verse Commentary** (`A–J`): Verse citation, quoted Gospel excerpt, patristic/expository commentary, and Catechism references (`CCC ...`). Facilitator view includes optional `patristicNote` from `localStudyDocument`.
   - **Key Catholic Doctrine** (`A–D`): Core theological dogmas / teachings (e.g. Universal Call to Salvation, The Role of Persistent Prayer, Grace & Merit, Faith Over Origin).
   - **Application for Young Adults** (`A–D`): Practical life application insights for navigating modern culture and perseverance.
4. **Navigation**:
   - `Study Leader`: Sticky advance zone with `← Previous` (`onPreviousSection`) returning to Section 3 (`section_3_reading`) and primary gold `Continue to Discussion →` (`onNextSection`) advancing to Section 5 (`section_5_discussion`).
   - `Participant`: Fixed status bar indicating *"The leader advances to Discussion & Reflection when finished"*.

## Non-Goals

- Modifying the parser or adding new fields to `SessionDeepAnalysisContent` (already done in `six-section-study-model-parser`).
- Modifying Section 3 or Section 5 UI/functionality.
- Full-screen 3D entry animation overlay (that is `fullscreen-3d-section-entry-animations`, Issue #45).
- Enlarged typography audit across all sections (that is `animated-enlarged-section-typography`, Issue #49).

## Job Story

When our group enters Section 4 of the Bible study,
I want both the leader and participants to explore the parsed verse-by-verse breakdown, Catholic doctrine, and young adult application on screen,
so we can unpack the theological depths and historical context of Matthew 15:21–28 together before opening our group discussion.

## Users And Permissions

- **`Study Leader`**: Views full Deep Analysis content (plus facilitator pastoral notes if present in `localStudyDocument`), has persistent `Share QR` trigger in header, and owns bidirectional navigation controls (`← Previous` and `Continue to Discussion →`).
- **`Participant`**: Views the shared Deep Analysis content (`verseCommentary`, `catholicDoctrine`, `youngAdultApplication`) without facilitator notes. Sees a non-interactive reading view with status note that the leader will advance.
- **Terminology Invariant**: Strictly `Study Leader` and `Participant` (zero occurrences of `"Assistant"` anywhere in code, tests, or UI copy).

## Acceptance Scenarios

### Scenario 1: Section 4 renders full Deep Analysis screen for both Leader and Participant

Given a LiveSession is in progress and advances to Section 4 (`section_4_deep_analysis`)
When the screen renders
Then both `Study Leader` and `Participant` see `data-testid="deep-analysis-screen"` with:
  - `SectionProgressHeader` displaying `SECTION 4 OF 6` and `67%`
  - Eyebrow and title (`data-testid="deep-analysis-title"`)
  - Commentary items (`data-testid="commentary-item"` count 10 for canonical seed: A through J)
  - Catholic doctrine cards (`data-testid="doctrine-item"` count 4 for canonical seed: A through D)
  - Application cards (`data-testid="application-item"` count 4 for canonical seed: A through D).

### Scenario 2: Study Leader sees bidirectional navigation controls

Given the `Study Leader` is viewing Section 4 (`DeepAnalysisScreen`)
When looking at the bottom advance zone
Then `data-testid="previous-section-btn"` is visible with label `"← Previous"` and clicking it returns to Section 3 (`section_3_reading`)
And `data-testid="deep-analysis-advance-cta"` is visible with label `"Continue to Discussion →"` and clicking it advances to Section 5 (`section_5_discussion`).

### Scenario 3: Participant sees read-only status and no leader navigation buttons

Given a connected `Participant` is viewing Section 4 (`DeepAnalysisScreen`)
When inspecting the DOM
Then `data-testid="previous-section-btn"` has count `0`
And `data-testid="deep-analysis-advance-cta"` has count `0`
And `data-testid="locked-advance-bar"` is visible with role `"participant"`.

### Scenario 4: Desktop Dual Side-by-Side Mode renders Deep Analysis in both frames

Given the viewport is desktop width (`>= 1024px`) and Section 4 is active
When `DualDeviceFrame` renders
Then the left frame (`Study Leader`) renders `DeepAnalysisScreen` with navigation controls and `Share QR`
And the right frame (`Participant`) renders `DeepAnalysisScreen` with synced content and participant locked bar.

## Expected File Changes

| File | Change |
| :--- | :--- |
| `src/client/components/analysis/DeepAnalysisScreen.tsx` | New component rendering parsed A–J commentary, A–D doctrine, and A–D application |
| `src/client/components/analysis/CommentaryCard.tsx` | Card displaying verse quotation, exposition, and CCC references |
| `src/client/components/analysis/DoctrineCard.tsx` | Card displaying doctrine point title and summary |
| `src/client/components/analysis/ApplicationCard.tsx` | Card displaying young adult application title and summary |
| `src/client/App.tsx` | Render `DeepAnalysisScreen` when `currentSectionId === 'section_4_deep_analysis'` |
| `src/client/components/dual/DualDeviceFrame.tsx` | Render `DeepAnalysisScreen` when `currentSectionId === 'section_4_deep_analysis'` |
| `src/client/styles/global.css` | Styling for Deep Analysis section, tabs, cards, and metadata badges |
| `tests/unit/deep-analysis-screen.test.tsx` | Unit tests for DeepAnalysisScreen rendering, roles, and callbacks |
| `tests/e2e/section-4-deep-analysis-screen.spec.ts` | Playwright E2E spec verifying Section 4 flow and content |

## Verification Plan

1. **Vitest Unit Tests**:
   - `npx vitest run tests/unit/deep-analysis-screen.test.tsx`
2. **Playwright E2E**:
   - `npx playwright test tests/e2e/section-4-deep-analysis-screen.spec.ts`
3. **Build & Quality Check**:
   - `./init.sh` exits 0 (typecheck, tests, build).
   - Terminology check: `grep -rn "Assistant" src/` returns 0 matches.

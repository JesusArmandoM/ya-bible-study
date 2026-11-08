# Feature Implementation Spec: Animated Enlarged Section Typography

## Source Feature

- `id`: `animated-enlarged-section-typography`
- `area`: `ui-polish`
- `depends_on`:
  - `fullscreen-3d-section-entry-animations` (accepted)
  - `fullscreen-3d-random-picker-reveal` (accepted)
  - `section-4-deep-analysis-screen` (accepted)
  - `leader-persistent-qr-code-reshare` (accepted)
- `status`: `not_started`
- `source`: `feature_list.json`

## Goal

Upgrade typography and text presentation across all 6 study sections (Opening Prayer, Icebreaker, Gospel Reading, Deep Analysis, Discussion & Reflection, Closing Prayer) and Desktop Dual Side-by-Side Mode:
1. Enlarge font sizes to match DESIGN.md override #6:
   - Scripture, prayers, and key prompts (`scriptureItalic`): `>= 1.3125rem` (`21px`), line-height `1.65`, Playfair Display / serif italic on crisp `#F8FAFC`.
   - Body copy, analysis, and explanations (`body`): `>= 1.125rem` (`18px`), line-height `1.6`, geometric sans on `#F8FAFC` (secondary `#CBD5E1`).
   - Section and card headings: `h2` at `>= 1.5rem` (`24px`), display titles at `2.625rem`, section headings at `2.25rem`.
   - Eyebrows and UI controls: `0.8125rem` (`13px`), uppercase, `0.14em` tracking.
2. Animate text elements into view with smooth staggered `motion/react` entrance choreography (`opacity: 0 -> 1`, `y: 12px -> 0`, staggered delay per verse/card/paragraph), while respecting `prefers-reduced-motion: reduce` (instant 0ms appearance).

## Non-Goals

- Changing study parsing, section structure, or /ws protocol messages.
- Changing volunteer turn gating or navigation flow (all existing First-Hand-Wins and Random Picker logic remains intact).
- Adding custom external font CDNs or webfont downloads beyond existing local fonts.

## Job Story

When young adults participate in or lead a Bible study on mobile devices in ambient evening lighting,
I want prayers, Scripture verses, commentary points, and discussion questions rendered in enlarged, legible typography that flows into view with a reverent, staggered entrance,
so everyone can easily read along and read aloud without straining or squinting.

## Users And Permissions

- **`Study Leader` & `Participant`**: Both roles experience the enlarged typography tokens and staggered animated text reveals across all 6 sections and in Desktop Dual Side-by-Side Mode.
- **Accessibility (`prefers-reduced-motion`)**: Users with reduced motion preferences bypass entrance delays and translations, receiving immediate rendering.
- **Terminology Invariant**: Strictly `Study Leader` and `Participant` (zero "Assistant").

## Acceptance Scenarios

### Scenario 1: Enlarged Typography Tokens Applied Across All 6 Sections
Given any active session in Sections 1–6
When the section content is rendered on mobile or desktop viewports
Then computed font sizes satisfy:
- Scripture verses, prayers, and prompts (`--text-scripture-size`, `.prayer-text`, `.gospel-reading-text`, `.closing-prayer-text`): `>= 21px` (`1.3125rem`).
- Body text, explanations, and commentary (`--text-body-size`, `.commentary-card-body`, `.doctrine-card-summary`, `.application-card-summary`, `.icebreaker-description`, `.discussion-question-body`): `>= 18px` (`1.125rem`).
- Card titles and section subheadings (`--text-h2-size`): `>= 24px` (`1.5rem`).

### Scenario 2: Staggered Animated Text Reveal on Section Entrance
Given a user enters any of the 6 sections (after section entry 3D overlay dismisses)
When the section content mounts
Then text containers reveal with staggered motion choreography (`opacity: 0 -> 1`, `y: 12px -> 0`) across title, scripture/prompt paragraphs, and card elements with staggered delay cadence (e.g. `0.06s`–`0.1s` intervals)
And `data-animated-text="true"` is present on animated text wrappers.

### Scenario 3: Respect `prefers-reduced-motion`
Given the client environment has `prefers-reduced-motion: reduce` enabled
When any section text mounts
Then animation duration is `0` or no transform delay is applied, rendering text immediately without motion nausea.

### Scenario 4: Desktop Dual Side-by-Side Mode Synchronization
Given Desktop Dual Side-by-Side Mode (`>= 1024px`)
When navigating through the 6 sections
Then both the Study Leader frame and the Participant frame render enlarged typography and synchronized animated text reveals
And active WebGL canvases stay `<= 2`.

### Scenario 5: Domain Invariant Check
Given the entire codebase
Then `grep -rn "Assistant" src/` returns 0 matches.

## Repository Research

### Files Inspected
- `src/client/styles/tokens.css`: Typography variables `--text-display-size`, `--text-h1-size`, `--text-h2-size`, `--text-scripture-size`, `--text-body-size`, `--text-eyebrow-size`. Update to match DESIGN.md override #6:
  - `--text-display-size: 2.625rem;`
  - `--text-h1-size: 2.25rem;`
  - `--text-h2-size: 1.5rem;` (24px)
  - `--text-scripture-size: 1.3125rem;` (21px)
  - `--text-scripture-lh: 1.65;`
  - `--text-body-size: 1.125rem;` (18px)
  - `--text-body-lh: 1.6;`
  - `--text-eyebrow-size: 0.8125rem;` (13px)
- `src/client/styles/global.css`: Update section typography rules (`.prayer-text`, `.icebreaker-prompt`, `.gospel-reading-text`, `.commentary-card-body`, `.doctrine-card-summary`, `.application-card-summary`, `.discussion-question-body`, `.closing-prayer-text`) to use the enlarged tokens and ensure minimum computed pixel sizes.
- `src/client/components/prayer/OpeningPrayerScreen.tsx`: Add staggered `motion.p` / `motion.div` text reveals (`data-animated-text="true"`).
- `src/client/components/icebreaker/IcebreakerScreen.tsx`: Add staggered `motion.p` / `motion.div` text reveals on icebreaker questions and descriptions.
- `src/client/components/reading/GospelReadingScreen.tsx`: Add staggered `motion.p` verse reveals on Matthew 15:21–28 text.
- `src/client/components/analysis/DeepAnalysisScreen.tsx`, `CommentaryCard.tsx`, `DoctrineCard.tsx`, `ApplicationCard.tsx`: Staggered card entrance and enlarged text.
- `src/client/components/discussion/DiscussionScreen.tsx`: Staggered active question and discussion copy reveals.
- `src/client/components/closing/ClosingPrayerScreen.tsx`: Staggered closing prayer text and challenge cards reveal.

## Implementation Tasks

1. **Tokens & Global Styles (`src/client/styles/tokens.css` & `global.css`)**:
   - Update `--text-scripture-size: 1.3125rem;` (21px), `--text-body-size: 1.125rem;` (18px), `--text-h2-size: 1.5rem;` (24px), `--text-display-size: 2.625rem;`, `--text-h1-size: 2.25rem;`, `--text-eyebrow-size: 0.8125rem;`.
   - Update typography class styles across all 6 sections to consume the enlarged tokens with appropriate line heights.

2. **Animated Text Reveal Helper / Component (`src/client/components/common/AnimatedTextReveal.tsx` or motion wrapper)**:
   - Provide clean reusable staggered motion variants (`containerVariants`, `itemVariants`) that respect `usePrefersReducedMotion`.
   - Add `data-animated-text="true"` attribute.

3. **Section Integrations (Sections 1–6)**:
   - Section 1: `OpeningPrayerScreen.tsx` — stagger prayer title, subtitle, prayer body paragraphs.
   - Section 2: `IcebreakerScreen.tsx` — stagger title, description, prompt card paragraphs.
   - Section 3: `GospelReadingScreen.tsx` — stagger citation, context note, Gospel scripture verses.
   - Section 4: `DeepAnalysisScreen.tsx` — stagger category header, commentary/doctrine/application cards.
   - Section 5: `DiscussionScreen.tsx` — stagger active question eyebrow, title, reflection prompt.
   - Section 6: `ClosingPrayerScreen.tsx` — stagger section stats, challenge cards, next week card, closing prayer text.

4. **Unit & Integration Verification**:
   - Create `tests/unit/animated-enlarged-typography.test.tsx` verifying computed typography sizes (>= 21px scripture, >= 18px body, >= 24px h2) and presence of animated text attributes across all sections.

5. **Playwright E2E Verification**:
   - Create `tests/e2e/animated-enlarged-section-typography.spec.ts` verifying typography computed sizes and animated entrance in both mobile (390x844) and Desktop Dual Side-by-Side Mode across all 6 sections.

6. **Full Suite & Baseline Gate**:
   - Run `./init.sh` (typecheck, all Vitest suites, production build).
   - Invariant check: `grep -rn "Assistant" src/` returns 0.
   - WebGL canvas budget check: `<= 1` on mobile, `<= 2` in dual mode.

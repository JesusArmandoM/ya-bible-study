# Feature Implementation Spec: Upgrade StudyDocument, preloaded seed, and deterministic .md/.pdf parsers to 6 interactive sections

## Source Feature

- `id`: `six-section-study-model-parser`
- `area`: `study-content`
- `depends_on`: `["pdf-study-deterministic-parser", "leader-load-study-setup-screen"]`
- `status`: `not_started`
- `source`: `feature_list.json`

## Goal

Upgrade the canonical `StudyDocument` contract (`src/shared/study.ts`), the preloaded *"Great Is Your Faith"* (Matthew 15:21–28) seed (`src/server/studies/greatIsYourFaithSeed.ts`), the deterministic `.md` and `.pdf` parsers (`src/server/studies/markdownParser.ts`, `src/server/studies/pdfParser.ts`), the `Study Leader` setup preview (`StudyPreviewCard.tsx`, `StudyStructureList.tsx`), and the `/ws` `SessionStudySummary` projection (`src/shared/session.ts`, `src/server/sessionStore.ts`) from 5 sections to **6 interactive sections**:

1. **Opening Prayer** (`section_1_prayer`)
2. **Icebreaker** (`section_2_icebreaker`)
3. **Gospel Reading** (`section_3_reading`, Gospel-only main reading)
4. **Deep Analysis** (`section_4_deep_analysis`: `A–J` verse-by-verse commentary, `A–D` Catholic doctrine highlights, `A–D` young adult application points — exposed on `SessionStudySummary.deepAnalysis` to **both** `Study Leader` and `Participant` snapshots)
5. **Discussion & Reflection** (`section_5_discussion`: 12 reflection questions, 3 curated active IDs, `"Lord, Help Me"` Prayer Card template — stripping facilitator `sampleAnswer`, `leaderNote`, and `prayerCardTemplate` from `SessionStudySummary.discussion`)
6. **Closing Prayer** (`section_6_closing`)

## Non-Goals

- Changing live `/ws` runtime section navigation (`STUDY_SECTION_IDS` in `src/shared/session.ts`, `next_section` / `previous_section`, `completedSectionIds`, or active `SectionProgressHeader` / `LiveSessionStatsCard` 5-step runtime labels) — owned by downstream feature `leader-bidirectional-section-navigation`.
- Building the `Section 4 — Deep Analysis` live interactive screen UI — owned by downstream feature `section-4-deep-analysis-screen`.
- Editing `src/client/App.tsx`, `src/client/components/lobby/*`, or `src/client/styles/global.css` (parallel Wave 1 ownership boundary for `post-join-fullscreen-lobby-isolation`).
- Calling external AI/LLM APIs or writing uploaded `.pdf`/`.md` files to disk (`CONSTRAINTS.md` #9).

## Job Story

When a `Study Leader` previews the preloaded study or uploads a weekly `.md` or `.pdf` study file during setup and syncs it to the room, I want the parser, setup structure preview, and `SessionStudySummary` payload to model all **6 interactive sections** — separating **Section 4 Deep Analysis** (shared `A–J` commentary, `A–D` Catholic doctrine, `A–D` young adult application) from **Section 5 Discussion & Reflection** — so both `Study Leader` and `Participants` receive structured Deep Analysis content over `/ws` without leaking facilitator-only `sampleAnswer`, `leaderNote`, or `patristicNote` fields.

## Users And Permissions

- **`Study Leader`**: Fetches `GET /api/studies/default` or uploads `.md`/`.pdf` to `POST /api/studies/parse`, views the 6-section setup preview (`6 sections detected`), and dispatches `load_study` over `/ws`. Retains full local `StudyDocument` (including `patristicNote`, `sampleAnswer`, `leaderNote`, `examplesToListenFor`, and `leaderLiturgicalContextNote`) for `PastoralNotesDrawer` and `AddQuestionModal`.
- **`Participant`**: Receives `PublicLiveSessionSnapshot.study` (`SessionStudySummary`) over `/ws` with `sectionCount: 6` and full `deepAnalysis` (`verseCommentary` `A–J` without `patristicNote`, `catholicDoctrine` `A–D`, `youngAdultApplication` `A–D`), while facilitator-only fields (`sampleAnswer`, `leaderNote`, `patristicNote`, `examplesToListenFor`, `leaderLiturgicalContextNote`, `prayerCardTemplate`) never cross `/ws`.
- **Terminology Invariant**: Use `Study Leader` and `Participant` exclusively across code, types, UI copy, and tests (`CONSTRAINTS.md` #3).

## Acceptance Scenarios

### Scenario 1: Preloaded default study and `.md`/`.pdf` parsers return validated 6-section `StudyDocument`

Given the preloaded *"Great Is Your Faith"* seed (`GET /api/studies/default`) or canonical `.md`/`.pdf` fixtures (`great-is-your-faith.md`, `great-is-your-faith.pdf`, `peace-be-still-mark-4.md`, `peace-be-still-mark-4.pdf`) posted to `POST /api/studies/parse`
When parsed and validated via `validateStudyDocument()`
Then HTTP `200 OK` returns a valid `StudyDocument` with `sectionCount === 6`, `detectionSummary.sectionCount === 6`, and `detectionSummary.sectionsDetectedLabel === "6 sections detected"`
And `getStudySections(doc)` returns 6 ordered sections with IDs `['section_1_prayer', 'section_2_icebreaker', 'section_3_reading', 'section_4_deep_analysis', 'section_5_discussion', 'section_6_closing']`, numbers `[1, 2, 3, 4, 5, 6]`, and progress percents `[17, 33, 50, 67, 83, 100]`
And `doc.deepAnalysis` (`section_4_deep_analysis`) contains `A–J` `verseCommentary` (10 items), `A–D` `catholicDoctrine` (4 items), and `A–D` `youngAdultApplication` (4 items)
And `doc.discussion` (`section_5_discussion`) contains 12 `reflectionQuestions`, `defaultActiveQuestionIds` (3 items), and `prayerCardTemplate` (3 prompts)
And `doc.gospelReading` (`section_3_reading`) contains only the Gospel passage (`CONSTRAINTS.md` #4).

### Scenario 2: `SessionStudySummary` syncs shared `deepAnalysis` to both roles while stripping facilitator-only notes

Given a `StudyDocument` converted via `toSessionStudySummary(doc)` and loaded into `LiveSessionStore` via `load_study`
When `session_updated` or `session_joined` snapshots are broadcast to `Study Leader` and `Participant` peers over `/ws`
Then `snapshot.study.sectionCount === 6` and `snapshot.study.deepAnalysis` is present on **both** `Study Leader` and `Participant` snapshots with all 10 `verseCommentary` items (`A–J`), 4 `catholicDoctrine` items (`A–D`), and 4 `youngAdultApplication` items (`A–D`)
And `snapshot.study.discussion` contains only `{ title, eyebrow, durationLabel, defaultActiveQuestionIds, questions }` (without `verseCommentary`, `catholicDoctrine`, `youngAdultApplication`, or question-level `'Romans 11:29'` / `'anti-Jewish framing'` facilitator notes)
And serialized `/ws` messages never contain `sampleAnswer`, `leaderNote`, `patristicNote`, `examplesToListenFor`, `leaderLiturgicalContextNote`, `prayerCardTemplate`, `'Chrysostom'`, `'Augustine'`, `'Jerome'`, or `'anti-Jewish framing'`.

### Scenario 3: Setup screen renders `'6 sections detected'` and all 6 canonical section rows

Given a `Study Leader` on the `Load Your Study` setup screen (`LeaderStudySetupScreen`)
When the default study loads or a valid `.md`/`.pdf` file is analyzed
Then `StudyPreviewCard` displays `6 sections · 12 questions` and `6 sections detected`
And `StudyStructureList` renders 6 ordered rows (`study-structure-row-1` through `study-structure-row-6`) titled `'Opening Prayer'`, `'Icebreaker'`, `'Gospel Reading'`, `'Deep Analysis'`, `'Discussion & Reflection'`, and `'Closing Prayer'` (`Section 1 of 6` … `Section 6 of 6`)
And Row 3 (`Gospel Reading`) displays only the Gospel citation (`Matthew 15:21–28`) with zero Old Testament, Psalm, or Epistle text anywhere in the preview.

### Scenario 4: Existing 5-step runtime `/ws` navigation and Discussion pastoral tools remain intact

Given an active room advancing through `in_progress` sections before `leader-bidirectional-section-navigation` lands
When the `Study Leader` advances from `section_3_reading` into `section_4_discussion` and opens `PastoralNotesDrawer` or `AddQuestionModal`
Then `sessionStore.ts` continues using runtime `session.STUDY_SECTION_IDS` (`section_1_prayer` → `section_2_icebreaker` → `section_3_reading` → `section_4_discussion` → `section_5_closing`) without breaking any existing runtime test
And `AddQuestionModal` and `PastoralNotesDrawer` read the 12-question bank and `sampleAnswer`/`leaderNote` from `studyDocument.discussion.reflectionQuestions` while `PastoralNotesDrawer` reads `verseCommentary` (including `patristicNote`), `catholicDoctrine`, and `youngAdultApplication` from `studyDocument.deepAnalysis`.

## Repository Research

### Files Inspected

- `CONTEXT.md`, `ARCHITECTURE.md`, `CONSTRAINTS.md`, `DESIGN.md`, `docs/build-brief.md`, `docs/domain-model.md`, `docs/technical-discovery.md`, `feature_list.json`
- `src/shared/study.ts`, `src/shared/session.ts`
- `src/server/studies/greatIsYourFaithSeed.ts`, `src/server/studies/markdownParser.ts`, `src/server/studies/pdfParser.ts`, `src/server/sessionStore.ts`
- `src/client/App.tsx`, `src/client/components/lobby/TitleLobbyScreen.tsx`, `src/client/components/setup/StudyPreviewCard.tsx`, `src/client/components/setup/StudyStructureList.tsx`, `src/client/components/discussion/AddQuestionModal.tsx`, `src/client/components/discussion/PastoralNotesDrawer.tsx`
- Existing unit, integration, and Playwright E2E test suites under `tests/unit/`, `tests/integration/`, and `tests/e2e/`

### Existing Patterns To Follow

- Keep `src/shared/*` pure TypeScript with explicit `.js` relative imports for `NodeNext` server compilation.
- Use bounded allow-list normalizers (`normalizeSession*`) in `src/shared/session.ts` so untrusted `load_study` payloads cannot smuggle facilitator fields or unbounded strings.
- Separate **curriculum document section IDs** (`STUDY_SECTION_IDS` in `src/shared/study.ts`, 6 sections) from **live `/ws` runtime section IDs** (`STUDY_SECTION_IDS` in `src/shared/session.ts`, kept at 5 runtime IDs until `leader-bidirectional-section-navigation`).
- **Parallel Wave 1 Zero-Diff Rule**: `TitleLobbyScreen.tsx` already renders `{study.sectionCount}` dynamically (`line 117`), and `App.tsx` passes `toSessionStudySummary(studySetup.study)` untouched. Maintain **zero diff** on `src/client/App.tsx`, `src/client/components/lobby/*`, and `src/client/styles/global.css`.

### Current Gaps

- `src/shared/study.ts`, `greatIsYourFaithSeed.ts`, and `markdownParser.ts` merge Deep Analysis (`Sections 8–10`) and Discussion (`Sections 11–12`) into one 5-section `DeepAnalysisSection` (`sectionCount: 5`, `sectionsDetectedLabel: '5 sections detected'`).
- `src/shared/session.ts` hardcodes `SessionStudySummary.sectionCount: 5` and omits `deepAnalysis` from `SessionStudySummary`.
- `StudyPreviewCard.tsx` hardcodes `5 sections` (`line 113`) and `StudyStructureList.tsx` hardcodes 5 `CANONICAL_SECTION_NAMES` and `Section {rowNumber} of 5` (`line 67`).
- `pdfParser.ts` heading regexes omit unhashed `Key Catholic Doctrine`, `Application for Young Adults`, `Discussion`, and `Practical Weekly Challenges` variants.

## Technical Approach

1. **6-Section `StudyDocument` Contract & Validator (`src/shared/study.ts`)**:
   - Update `STUDY_SECTION_IDS` in `src/shared/study.ts` to `['section_1_prayer', 'section_2_icebreaker', 'section_3_reading', 'section_4_deep_analysis', 'section_5_discussion', 'section_6_closing'] as const`.
   - Update section progress percents to `[17, 33, 50, 67, 83, 100]` (`OpeningPrayerSection`: `17`, `IcebreakerSection`: `33`, `GospelReadingSection`: `50`).
   - Narrow `DeepAnalysisSection` (`sectionId: 'section_4_deep_analysis'`, `sectionNumber: 4`, `progressPercent: 67`, `turnMode: 'none'`) to `{ verseCommentary: VerseCommentaryItem[]; catholicDoctrine: DoctrineHighlightItem[]; youngAdultApplication: ApplicationPointItem[] }`.
   - Add `DiscussionSection` (`sectionId: 'section_5_discussion'`, `sectionNumber: 5`, `progressPercent: 83`, `turnMode: 'none'`) holding `{ defaultActiveQuestionIds: string[]; reflectionQuestions: ReflectionQuestionItem[]; prayerCardTemplate: PrayerCardTemplate }`.
   - Update `ClosingSection` to `sectionId: 'section_6_closing'`, `sectionNumber: 6`, `progressPercent: 100`, `turnMode: 'none'`.
   - Update `StudySection`, `OrderedStudySections` (6-tuple), `getStudySections(doc)`, `StudyDetectionSummary` (`sectionCount: 6`), `StudyDocument` (`sectionCount: 6`, adding `discussion: DiscussionSection`), and `validateStudyDocument()` (`sectionCount === 6`, validating both `deepAnalysis` and `discussion` plus `closing` at section 6).

2. **Seed & Deterministic `.md` / `.pdf` Parsers (`src/server/studies/`)**:
   - `greatIsYourFaithSeed.ts`: Set `sectionCount: 6`, `detectionSummary.sectionCount: 6`, `detectionSummary.sectionsDetectedLabel: '6 sections detected'`, split `deepAnalysis` (`title: 'Deep Analysis'`, `eyebrow: 'DEEP ANALYSIS · 20 MIN'`, `durationMinutes: 20`, `durationLabel: '20 min'`, `progressPercent: 67`) and `discussion` (`sectionId: 'section_5_discussion'`, `sectionNumber: 5`, `title: 'Lord, Help Me Pray'`, `eyebrow: 'DISCUSSION · 25 MIN'`, `durationMinutes: 25`, `durationLabel: '25–50 min'`, `progressPercent: 83`), and set `closing` to `section_6_closing` / `sectionNumber: 6`.
   - `markdownParser.ts`: Emit separate `deepAnalysis` (from Sections 8, 9, 10) and `discussion` (from Sections 11, 12), update `openingPrayer`/`icebreaker`/`gospelReading` `progressPercent` to `17`/`33`/`50`, `closing` to `section_6_closing` (`sectionNumber: 6`), `detectionSummary` (`sectionCount: 6`, `sectionsDetectedLabel: '6 sections detected'`), and `candidateDoc.sectionCount: 6`. Existing 17-section `.md` and `.pdf` fixtures parse into 6 sections without regenerating binary PDFs.
   - `pdfParser.ts`: Widen `SECTION_HEADING_REGEX` and `UNNUMBERED_SECTION_HEADING_REGEX` to also match unhashed `Key Catholic Doctrine`, `Application for Young Adults`, `Discussion`, and `Practical Weekly Challenges` headings.

3. **Shared `SessionDeepAnalysisContent` & `/ws` Snapshot Projection (`src/shared/session.ts`, `src/server/sessionStore.ts`)**:
   - Keep `STUDY_SECTION_IDS` in `src/shared/session.ts` unchanged (`5` runtime IDs) so `LiveSessionStore` live section transitions stay compatible until `leader-bidirectional-section-navigation`.
   - Add `SessionVerseCommentaryItem` (`{ id, verseCitation, quotedText, commentary, catechismReferences }` — **excluding** `patristicNote`), `SessionDoctrineHighlightItem` (`{ id, title, summary, references }`), `SessionApplicationPointItem` (`{ id, title, summary }`), and `SessionDeepAnalysisContent` (`{ title, eyebrow, durationLabel, verseCommentary, catholicDoctrine, youngAdultApplication }`).
   - Add `toSessionDeepAnalysisContent(section: DeepAnalysisSection)` and bounded allow-list `normalizeSessionDeepAnalysisContent(raw)` (enforcing max lengths and array bounds: 1–20 commentary items, 1–12 doctrine/application items, 0–16 references per item).
   - Update `toSessionDiscussionContent(section: DiscussionSection)` to read `doc.discussion`.
   - Update `SessionStudySummary`: change `sectionCount` to `6`, add `deepAnalysis?: SessionDeepAnalysisContent | null`, populate `deepAnalysis: toSessionDeepAnalysisContent(doc.deepAnalysis)` and `discussion: toSessionDiscussionContent(doc.discussion)` in `toSessionStudySummary(doc)`, and validate `record.sectionCount === 6` + optional `deepAnalysis` in `normalizeSessionStudySummary(raw)`.
   - In `src/server/sessionStore.ts`: update the `handleLoadStudy` error string (`line 1050`) from `sectionCount 5` to `sectionCount 6`, and ensure `toPublicSnapshot()` clones `session.study` (including `deepAnalysis`) identically for `Study Leader` and `Participant` snapshots without stripping `deepAnalysis`.

4. **Client Setup Preview & Discussion Facilitators (`src/client/components/`)**:
   - `StudyPreviewCard.tsx`: Render `{study.sectionCount} sections · {detectionSummary.totalQuestionCount} questions`.
   - `StudyStructureList.tsx`: Update `CANONICAL_SECTION_NAMES` to `{ section_1_prayer: 'Opening Prayer', section_2_icebreaker: 'Icebreaker', section_3_reading: 'Gospel Reading', section_4_deep_analysis: 'Deep Analysis', section_5_discussion: 'Discussion & Reflection', section_6_closing: 'Closing Prayer' }` and render `Section {rowNumber} of {sections.length} · {section.durationLabel}`.
   - `AddQuestionModal.tsx` & `PastoralNotesDrawer.tsx`: Read `reflectionQuestions` from `studyDocument?.discussion?.reflectionQuestions` while `PastoralNotesDrawer.tsx` continues reading `verseCommentary` (with `patristicNote`), `catholicDoctrine`, and `youngAdultApplication` from `studyDocument?.deepAnalysis`.

## Expected File Changes

- `src/shared/study.ts` — modify; 6-section `STUDY_SECTION_IDS`, `DeepAnalysisSection` (`section_4_deep_analysis`), `DiscussionSection` (`section_5_discussion`), `ClosingSection` (`section_6_closing`), `StudyDocument` (`sectionCount: 6`), `getStudySections`, and `validateStudyDocument`.
- `src/shared/session.ts` — modify; `SessionDeepAnalysisContent` types, `toSessionDeepAnalysisContent`, `normalizeSessionDeepAnalysisContent`, `toSessionDiscussionContent(DiscussionSection)`, and `SessionStudySummary` (`sectionCount: 6`, `deepAnalysis`).
- `src/server/studies/greatIsYourFaithSeed.ts` — modify; split `deepAnalysis` and `discussion`, update metadata and `detectionSummary` to 6 sections.
- `src/server/studies/markdownParser.ts` — modify; emit 6-section `StudyDocument` (`deepAnalysis` + `discussion` + `section_6_closing`, `sectionCount: 6`, `'6 sections detected'`).
- `src/server/studies/pdfParser.ts` — modify; widen heading normalization regexes for unhashed Sections 9, 10, 11/Discussion, and 13.
- `src/server/sessionStore.ts` — modify; update `load_study` validation message (`sectionCount 6`) and deep-clone `study.deepAnalysis` in `toPublicSnapshot`.
- `src/client/components/setup/StudyPreviewCard.tsx` — modify; render `{study.sectionCount} sections`.
- `src/client/components/setup/StudyStructureList.tsx` — modify; 6 canonical section names and `Section {rowNumber} of {sections.length}`.
- `src/client/components/discussion/AddQuestionModal.tsx` — modify; read `studyDocument?.discussion.reflectionQuestions`.
- `src/client/components/discussion/PastoralNotesDrawer.tsx` — modify; read `studyDocument?.discussion?.reflectionQuestions`.
- `tests/unit/study-seed.test.ts`, `tests/unit/markdown-parser.test.ts`, `tests/unit/pdf-parser.test.ts`, `tests/unit/leader-study-setup.test.tsx`, `tests/unit/discussion-content.test.ts` — modify; update 5→6 assertions, `doc.discussion` vs `doc.deepAnalysis` split, and `SessionDeepAnalysisContent` projection/normalization tests.
- `tests/unit/icebreaker-content.test.ts`, `tests/unit/gospel-reading-content.test.ts`, `tests/unit/closing-content.test.ts`, `tests/unit/hand-raise-state.test.ts`, `tests/unit/title-lobby.test.tsx` — modify; update `sectionCount: 5` → `6` (and surgical `'5'` → `'6'` on `title-lobby-section-count` in `title-lobby.test.tsx`).
- `tests/integration/studies-default.test.ts`, `tests/integration/studies-parse.test.ts`, `tests/integration/ws-load-study.test.ts`, `tests/integration/ws-hand-raise.test.ts`, `tests/integration/ws-icebreaker-hand-raise.test.ts`, `tests/integration/ws-discussion-question.test.ts` — modify; update `sectionCount: 6` and verify `deepAnalysis` is broadcast to both roles while `sampleAnswer`/`leaderNote`/`patristicNote` remain stripped.
- `tests/e2e/studies-default.spec.ts`, `tests/e2e/studies-parse.spec.ts`, `tests/e2e/leader-load-study-setup.spec.ts`, `tests/e2e/title-lobby-qr-join.spec.ts`, `tests/e2e/section-4-leader-question-queue-notes.spec.ts` — modify; update 5→6 setup/API/lobby count assertions and `SEED.discussion.reflectionQuestions[0]!.sampleAnswer`.
- `ARCHITECTURE.md` — modify; document 6-section `StudyDocument` parser output and shared `SessionDeepAnalysisContent` on `SessionStudySummary`.

## Visual Design Impact

- UI involved: yes (setup preview text/rows in `StudyPreviewCard` and `StudyStructureList`).
- Design source: `DESIGN.md` and `ux/2. Leader Setup.png` (preserving existing Midnight Sanctuary card tokens, typography, `>= 16px` inputs, `>= 44px` targets, single `Sacred3DScene` canvas, and zero horizontal overflow on `390x844`).
- Screens or states affected: `LeaderStudySetupScreen` (`StudyPreviewCard` meta/detection summary and `StudyStructureList` 6-row ordered list); `TitleLobbyScreen` automatically displays `6` via `{study.sectionCount}` without editing `lobby/*`.
- New design artifact required: no.

## Durable Documentation Impact

- `ARCHITECTURE.md`: update — reflect 6-section `StudyDocument` seed/parsers, 6-row `StudyStructureList`, and shared `SessionDeepAnalysisContent` (`patristicNote`/`sampleAnswer`/`leaderNote` still stripped) in `src/shared/`, `src/server/studies/`, and `src/client/components/setup/`.
- `CONSTRAINTS.md`: not needed — existing constraints already match this behavior.
- `AGENTS.md`: not needed — workflow and invariants already match.
- Other docs: `docs/domain-model.md` already specifies `sectionCount === 6`; update `PROGRESS.md` and `feature_list.json` during implementation/validation.

## Implementation Plan

1. Refactor `src/shared/study.ts` to the 6-section `StudyDocument` schema (`DeepAnalysisSection` + `DiscussionSection` + `ClosingSection` as section 6) and update `validateStudyDocument()`.
2. Update `greatIsYourFaithSeed.ts`, `markdownParser.ts`, and `pdfParser.ts` to produce validated 6-section `StudyDocument` instances (`sectionCount: 6`, `'6 sections detected'`).
3. Extend `src/shared/session.ts` and `src/server/sessionStore.ts` with `SessionDeepAnalysisContent` (`toSessionDeepAnalysisContent`, `normalizeSessionDeepAnalysisContent`, `SessionStudySummary.sectionCount: 6`) while keeping runtime `session.STUDY_SECTION_IDS` at 5 sections.
4. Update `StudyPreviewCard.tsx`, `StudyStructureList.tsx`, `AddQuestionModal.tsx`, and `PastoralNotesDrawer.tsx` (leaving `App.tsx`, `lobby/*`, and `global.css` untouched).
5. Update unit, integration, and Playwright E2E suites plus `ARCHITECTURE.md`, then run `./init.sh` and dedicated-port Playwright E2E verification.

## Implementation Tasks

- [ ] Update `src/shared/study.ts` types, `STUDY_SECTION_IDS`, `getStudySections()`, and `validateStudyDocument()` for the 6-section model.
- [ ] Update `src/server/studies/greatIsYourFaithSeed.ts`, `markdownParser.ts`, and `pdfParser.ts` to emit 6 sections (`deepAnalysis` + `discussion` + `closing`).
- [ ] Add `SessionDeepAnalysisContent` projection and bounded normalizer in `src/shared/session.ts` (`sectionCount: 6`, `patristicNote` excluded) and update `src/server/sessionStore.ts`.
- [ ] Update `StudyPreviewCard.tsx`, `StudyStructureList.tsx`, `AddQuestionModal.tsx`, and `PastoralNotesDrawer.tsx` with zero edits to `App.tsx`, `lobby/*`, or `global.css`.
- [ ] Update unit and integration tests for `sectionCount === 6`, `deepAnalysis` `/ws` broadcast to Participants, and facilitator-note stripping.
- [ ] Update Playwright E2E specs (`studies-default.spec.ts`, `studies-parse.spec.ts`, `leader-load-study-setup.spec.ts`, `title-lobby-qr-join.spec.ts`, `section-4-leader-question-queue-notes.spec.ts`) and `ARCHITECTURE.md`.

## Verification Plan

- Run baseline gate: `cd "/Users/armando/Documents/ya-bible-study-worktrees/six-section-study-model-parser" && PORT=3101 API_PORT=3201 PLAYWRIGHT_PORT=3301 ./init.sh`
- Run Vitest unit & integration suites verifying `GET /api/studies/default` and `POST /api/studies/parse` (`.md` and `.pdf`) return `sectionCount === 6` and `SessionStudySummary` carries `deepAnalysis` (`A–J` commentary, `A–D` doctrine, `A–D` application) on Participant `/ws` snapshots while stripping `sampleAnswer`, `leaderNote`, and `patristicNote`.
- Run Playwright E2E suite on isolated ports: `cd "/Users/armando/Documents/ya-bible-study-worktrees/six-section-study-model-parser" && PORT=3101 API_PORT=3201 PLAYWRIGHT_PORT=3301 npm run test:e2e` verifying `'6 sections detected'`, all 6 ordered section titles (`'Opening Prayer'`, `'Icebreaker'`, `'Gospel Reading'`, `'Deep Analysis'`, `'Discussion & Reflection'`, `'Closing Prayer'`), and Gospel-only Section 3.
- Confirm `git diff --name-only` shows zero changes to `src/client/App.tsx`, `src/client/components/lobby/*`, and `src/client/styles/global.css`.

## Evidence To Capture

- Exit 0 output from `./init.sh` (`npm run typecheck`, `npm test`, `npm run build`).
- Exit 0 output from `PORT=3101 API_PORT=3201 PLAYWRIGHT_PORT=3301 npm run test:e2e` (including `studies-default.spec.ts`, `studies-parse.spec.ts`, and `leader-load-study-setup.spec.ts`).
- `git status --short` / `git diff --stat` confirming zero touches to parallel Wave 1 lobby/App/CSS files.

## Open Questions And Risks

- **Parallel Wave 1 Merge Hygiene**: `TitleLobbyScreen.tsx` dynamically renders `{study.sectionCount}` (`6`), requiring a 1-line `'5'` → `'6'` assertion update on `title-lobby-section-count` in `tests/unit/title-lobby.test.tsx` and `tests/e2e/title-lobby-qr-join.spec.ts`. Keep edits in those two test files strictly limited to that single assertion line to prevent merge conflicts with `post-join-fullscreen-lobby-isolation`.
- **Downstream Handoff**: `src/shared/session.ts` intentionally retains the 5 runtime `STUDY_SECTION_IDS` until `leader-bidirectional-section-navigation` promotes `section_4_deep_analysis`, `section_5_discussion`, and `section_6_closing` into live `/ws` runtime state.

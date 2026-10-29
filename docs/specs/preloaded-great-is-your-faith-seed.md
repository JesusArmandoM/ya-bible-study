# Feature Implementation Spec: Preloaded Great Is Your Faith study exposes complete structured payload

## Source Feature

- `id`: `preloaded-great-is-your-faith-seed`
- `area`: `study-content`
- `depends_on`: `["app-shell-single-port-bootstrap"]`
- `status`: `not_started`
- `source`: `feature_list.json`

## Goal

Define the canonical shared `StudyDocument` TypeScript domain contract (`src/shared/study.ts`), bundle the complete preloaded **"Great Is Your Faith"** (*Matthew 15:21–28*, Twentieth Sunday in Ordinary Time, Year A) Catholic Young Adult Bible Study curriculum (`src/server/studies/greatIsYourFaithSeed.ts`), and expose it at `GET /api/studies/default` on the unified single-port server.

This slice establishes the single structured data shape consumed by downstream deterministic `.md`/`.pdf` parsers (`markdown-study-deterministic-parser`, `pdf-study-deterministic-parser`), `/ws` `LiveSession` state snapshots, and all five interactive session stages (`Opening Prayer`, `Icebreaker`, `Gospel Reading`, `Deep Analysis & Discussion`, and `Closing Prayer`).

## Non-Goals

- Implementing `.md` or `.pdf` upload/parsing endpoints (`POST /api/studies/parse` belongs to `markdown-study-deterministic-parser` and `pdf-study-deterministic-parser`).
- Implementing WebSocket `/ws` `LiveSession` room lifecycle, `leaderPin` locks, or session state synchronization (`ws-live-session-room-lifecycle`).
- Adding new React screens, role-selection UI, or `Load Your Study` preview cards (`welcome-role-selection-flow`, `leader-load-study-setup-screen`).
- Rendering or structuring Old Testament (Isaiah 56), Responsorial Psalm (Psalm 67), or Epistle (Romans 11) passages as separate reading turns or tabs in Section 3 (`CONSTRAINTS.md` #4).
- Calling external Bible lookup APIs or external AI/LLM services (`CONSTRAINTS.md` #9).

## Job Story

When starting or previewing a **YA Bible Study** session without uploading a custom file,
I want `GET /api/studies/default` to return the complete, pre-analyzed *"Great Is Your Faith"* (`Matthew 15:21–28`) `StudyDocument` with all five interactive sections, Gospel Scripture text, curated and full 12-question prompts, pastoral commentary, and prayers,
so the `Study Leader` and `Participants` can run a complete 90-minute Catholic Bible study out of the box and future file parsers target one exact schema.

## Users And Permissions

- **Unauthenticated Client / `Study Leader` Setup Preview**: May call `GET /api/studies/default` over same-origin HTTP(S) (including through Cloudflare/ngrok tunnel `Host` headers) and receive HTTP `200` JSON containing the complete default `StudyDocument`.
- **Role-Scoped Field Semantics & Terminology Invariant**:
  - All shared types, field names, comments, and copy MUST use `Study Leader` and `Participant`—never `Assistant` (`CONSTRAINTS.md` #3).
  - Facilitator-only pastoral guidance fields (`leaderNote`, `examplesToListenFor`, `leaderLiturgicalContextNote`, `verseCommentary`, `catholicDoctrine`, `youngAdultApplication`, and per-question `sampleAnswer` / `leaderNote`) must be cleanly structured and identifiable so downstream `/ws` and UI views keep them exclusive to the `Study Leader` while `Participants` view shared Scripture, prayer, question, and `PrayerCard` prompts.

## Acceptance Scenarios

### Scenario 1: `GET /api/studies/default` returns the complete 5-section `StudyDocument`

Given the unified server is running on a single port
When a client sends `GET /api/studies/default` (directly or with an external tunnel `Host` header)
Then the server responds with HTTP `200` and `Content-Type: application/json`
And the JSON body validates as a complete `StudyDocument` with `id: "great-is-your-faith"`, `title: "Great Is Your Faith"`, `subtitle: "Mercy, Humility, and the House of Prayer for All Peoples"`, `liturgicalDate` for Sunday, August 16, 2026 (Twentieth Sunday in Ordinary Time, Year A), `gospelCitation: "Matthew 15:21–28"`, `estimatedMinutes: 90`, `sectionCount: 5`, 4 central themes, session goals, `oneSentenceMainPoint`, `detectionSummary` (`5 sections detected`, `"Prayer · Reading · 3 Questions"`), and all 5 populated section payloads (`openingPrayer`, `icebreaker`, `gospelReading`, `deepAnalysis`, `closing`).

### Scenario 2: Section 3 enforces the Gospel-only main reading invariant

Given the `StudyDocument` returned by `GET /api/studies/default`
When inspecting Section 3 (`gospelReading`)
Then `citation` is `"Matthew 15:21–28"`, `fullText` contains the complete verbatim proclamation of **Matthew 15:21–28** (`verses` `21` through `28` covering Tyre and Sidon, *"Have pity on me, Lord, Son of David!"*, Jesus' initial silence, *"Send her away"*, *"lost sheep of the house of Israel"*, *"Lord, help me"*, *"scraps that fall from the table of their masters"*, and *"O woman, great is your faith!"* through her daughter's healing), and `keyLines` lists the 4 canonical highlight lines
And Isaiah 56:1, 6–7, Psalm 67:2–3, 5, 6, 8, Romans 11:13–15, 29–32, and Alleluia cf. Matthew 4:23 appear **only** inside `leaderLiturgicalContextNote`—never as main reading turns or multi-reading tabs.

### Scenario 3: Sections 1, 2, 4, and 5 expose complete prayers, icebreaker, 12 questions, A–J notes, doctrine guardrails, Prayer Card, and closing items

Given the `StudyDocument` returned by `GET /api/studies/default`
When inspecting Sections 1, 2, 4, and 5
Then `openingPrayer` (`5 min`) and `closing` (`3 min`) contain the exact canonical Opening and Closing Prayer texts from `docs/domain-model.md`
And `icebreaker` (`"Outsiders Wanted"`, `10 min`) includes the main outsider question, italic follow-up question, facilitator `leaderNote`, and all 8 young adult `examplesToListenFor`
And `deepAnalysis` (`"Lord, Help Me Pray"`, `25–50 min`) includes `defaultActiveQuestionIds: ["q-6", "q-5", "q-8"]` (mapping to Q6, Q5, and Q8 as default curated queue `#1`, `#2`, `#3`), all `12` `reflectionQuestions` (`1..12` with category, sample answer, and pastoral `leaderNote`), all `10` `verseCommentary` entries (`A`–`J` with patristic references to St. Augustine, St. John Chrysostom, and St. Jerome via Aquinas' *Catena Aurea*), all `4` `catholicDoctrine` highlights (`A`–`D`, including the Romans 11:29 irrevocable covenant / anti-Jewish contempt guardrail), all `4` `youngAdultApplication` points (`A`–`D`), and the 3-prompt `"Lord, Help Me"` `prayerCardTemplate` (*For myself*, *For someone I love*, *For the Church/world*)
And `closing` includes session `summaryBullets`, all `4` `weeklyChallenges` (*Persistent Prayer*, *Humble Prayer*, *Catholic Hospitality*, *Eucharistic Humility*), and `nextWeekAnnouncement` (`"Faith that Endures" — James 1:2–4`).

### Scenario 4: Seed immutability, unknown API route safety, and terminology hygiene

Given `getDefaultStudyDocument()` is called multiple times or `GET /api/studies/default` is requested repeatedly
When a caller mutates nested arrays or fields on one returned `StudyDocument` instance
Then subsequent calls to `getDefaultStudyDocument()` and `GET /api/studies/default` return an unmodified pristine payload
And requesting an unknown study route such as `GET /api/studies/unknown` returns HTTP `404` JSON `{ "error": "Not found" }`
And serialized payload strings and shared TypeScript definitions contain zero occurrences of `"Assistant"`.

## Repository Research

### Files Inspected

- `AGENTS.md`, `ARCHITECTURE.md`, `CONSTRAINTS.md`, `CONTEXT.md`, `DESIGN.md` — module boundaries, single-port topology, `Participant` terminology rule, Gospel-only Section 3 rule, and `ux/*.png` screen copy conventions (`ux/2. Leader Setup.png`, `ux/3. Title - Leader.png`, `ux/6. Prayer - Selected.png`, `ux/7. Ice Breaker - Leader.png`, `ux/7. Reading - Leader.png`, `ux/10. Discussion - Leader.png`, `ux/12. Closing Prayer.png`).
- `PROGRESS.md` & `feature_list.json` — confirm `app-shell-single-port-bootstrap` is `accepted` and `preloaded-great-is-your-faith-seed` is next ready.
- `docs/domain-model.md`, `docs/technical-discovery.md`, `docs/risks-and-open-questions.md`, `docs/user-and-access-model.md` — authoritative Seed Content Reference (lines 67–79, 93–143) and `StudyDocument` / `StudySection` lifecycle rules.
- `src/shared/health.ts`, `src/server/app.ts`, `src/server/index.ts` — Express 5 + `http.Server` + `ws` server factory where `/api/*` handlers precede `app.use('/api', 404)` and static SPA serving.
- `tsconfig.json`, `tsconfig.client.json`, `tsconfig.server.json`, `vitest.config.ts`, `playwright.config.ts`, `init.sh`, `.env` — confirm `tsconfig.server.json` uses `"moduleResolution": "NodeNext"` (requiring explicit `.js` extensions on relative imports inside `src/server/` and `src/shared/`) and isolated worktree ports `PORT=3101`, `API_PORT=3201`, `PLAYWRIGHT_PORT=3301`.
- `tests/integration/server-health.test.ts` & `tests/e2e/app-shell-bootstrap.spec.ts` — ephemeral port `0` integration test pattern and Playwright single-port E2E pattern.

### Existing Patterns To Follow

- Keep `src/shared/*` pure TypeScript with zero Node built-ins or DOM globals so both `tsconfig.client.json` and `tsconfig.server.json` compile it cleanly.
- Use explicit `.js` file extensions on all relative imports inside `src/shared/**/*.ts` and `src/server/**/*.ts` to satisfy `tsconfig.server.json` (`NodeNext`).
- Register `GET /api/studies/default` inside `createAppServer` (`src/server/app.ts`) **before** `app.use('/api', ...)` so valid requests return `200` JSON and invalid `/api/studies/*` paths fall through to the existing JSON `404` guard.

### Current Gaps

- `src/shared/study.ts` does not exist yet.
- `src/server/studies/greatIsYourFaithSeed.ts` does not exist yet.
- `src/server/app.ts` currently exposes only `GET /api/health`.

## Technical Approach

1. **Shared Study Domain Contract & Validator (`src/shared/study.ts`)**:
   - Define `StudySectionId` (`'section_1_prayer' | 'section_2_icebreaker' | 'section_3_reading' | 'section_4_discussion' | 'section_5_closing'`), `STUDY_SECTION_IDS`, and `StudySectionTurnMode` (`'gated_prayer' | 'open_share' | 'gated_reading' | 'none'`).
   - Define strongly typed interfaces for all 5 stages discriminated by `sectionId` and `sectionNumber` (`1..5`, `progressPercent`: `20 | 40 | 60 | 80 | 100`, `turnMode`, `title`, `eyebrow`, `durationMinutes`, `durationLabel`):
     - `OpeningPrayerSection`: `suggestedPrayerText` + volunteer turn guidance.
     - `IcebreakerSection`: `introText`, `mainQuestion`, `followUpQuestion`, `leaderNote`, `examplesToListenFor: string[]`.
     - `GospelReadingSection`: `citation`, `liturgicalLabel`, `fullText` (sole Gospel reading), `verses: GospelVerse[]` (`verseNumber: number`, `text: string`), `keyLines: string[]`, `leaderLiturgicalContextNote` (holding Isaiah 56, Psalm 67, Romans 11, and Alleluia context notes for the `Study Leader` only).
     - `DeepAnalysisSection`: `defaultActiveQuestionIds: string[]` (`['q-6', 'q-5', 'q-8']`), `reflectionQuestions: ReflectionQuestionItem[]` (`id`, `number` `1..12`, `prompt`, `category`, `isDefaultCurated`, `curatedOrder: 1 | 2 | 3 | null`, `estimatedMinutes`, `sampleAnswer`, `leaderNote`), `verseCommentary: VerseCommentaryItem[]` (`id: 'A'..'J'`, `verseCitation`, `quotedText`, `commentary`, `catechismReferences`, `patristicNote`), `catholicDoctrine: DoctrineHighlightItem[]` (`id: 'A'..'D'`, `title`, `summary`, `references`), `youngAdultApplication: ApplicationPointItem[]` (`id: 'A'..'D'`, `title`, `summary`), and `prayerCardTemplate: PrayerCardTemplate` (`title`, `instructions`, `prompts` tuple of 3 items: `self`, `loved-one`, `church-world`).
     - `ClosingSection`: `summaryBullets: string[]`, `weeklyChallenges: WeeklyChallengeItem[]` (`optionNumber: 1..4`, `title`, `description`), `nextWeekAnnouncement` (`title`, `citation`, `displayLabel`), and `closingPrayerText`.
   - Define `StudySection` discriminated union (`OpeningPrayerSection | IcebreakerSection | GospelReadingSection | DeepAnalysisSection | ClosingSection`), `StudyDetectionSummary` (`sectionCount: 5`, `detectedLabel`, `curatedQuestionCount`, `totalQuestionCount`, `hasOpeningPrayer`, `hasGospelReading`, `hasClosingPrayer`), `StudySourceMetadata` (`type: 'preloaded' | 'markdown' | 'pdf'`, `fileName`, `statusLabel: 'Analyzed'`), and `StudyDocument` combining top-level metadata (`id`, `title`, `subtitle`, `liturgicalDate`, `liturgicalEyebrow`, `gospelCitation`, `gospelSummaryLabel`, `estimatedMinutes`, `sectionCount: 5`, `centralThemes`, `sessionGoals`, `oneSentenceMainPoint`, `source`, `detectionSummary`) with named payloads (`openingPrayer`, `icebreaker`, `gospelReading`, `deepAnalysis`, `closing`).
   - Export pure helpers `getStudySections(doc: StudyDocument)` returning the ordered 5-section tuple `[doc.openingPrayer, doc.icebreaker, doc.gospelReading, doc.deepAnalysis, doc.closing]` and `validateStudyDocument(input: unknown)` returning `{ valid: true, value: StudyDocument } | { valid: false, errors: string[] }` enforcing non-empty Gospel-only Section 3, 5 ordered sections, `>= 1` curated discussion questions, and non-empty prayers (reusable by upcoming `.md`/`.pdf` parsers).

2. **Canonical Seed Module (`src/server/studies/greatIsYourFaithSeed.ts`)**:
   - Encode `DEFAULT_STUDY_ID = 'great-is-your-faith'` and the complete *"Great Is Your Faith"* (`Matthew 15:21–28`) curriculum faithfully from `docs/domain-model.md`, including complete verbatim Catholic Lectionary Gospel verses `15:21–28`, exact Opening and Closing Prayers, `"Outsiders Wanted"` prompts + 8 YA examples, `A–J` verse commentary with Augustine/Chrysostom/Jerome patristic notes, `A–D` Catholic doctrine notes (explicitly encoding the Romans 11:29 irrevocable covenant / reject anti-Jewish contempt guardrail), `A–D` young adult applications, all `1..12` reflection questions with concise pastoral `sampleAnswer` and `leaderNote` guidance (`q-6`, `q-5`, `q-8` ordered as default curated prompts `#1`, `#2`, `#3`), the 3 `"Lord, Help Me"` Prayer Card prompts, and the 4 weekly challenges + `"Faith that Endures" — James 1:2–4` Next Week card.
   - Export `getDefaultStudyDocument(): StudyDocument` returning `structuredClone(GREAT_IS_YOUR_FAITH_STUDY)` so callers cannot mutate shared server memory.

3. **REST Endpoint Wiring (`src/server/app.ts`)**:
   - Mount `GET /api/studies/default` returning `res.status(200).json(getDefaultStudyDocument())` ahead of `app.use('/api', ...)` `404` fallback.

## Expected File Changes

- `src/shared/study.ts` — create; shared `StudyDocument`, 5 discriminated `StudySection` interfaces, supporting item types, `getStudySections`, and `validateStudyDocument`.
- `src/server/studies/greatIsYourFaithSeed.ts` — create; immutable `"Great Is Your Faith"` (`Matthew 15:21–28`) seed payload and `getDefaultStudyDocument()` clone accessor.
- `src/server/app.ts` — modify; wire `GET /api/studies/default` before the `/api` JSON `404` fallback.
- `tests/unit/study-seed.test.ts` — create; unit tests verifying schema validation, Gospel-only Section 3 (`15:21–28` full text + liturgical context separation), 12 reflection questions + 3 curated defaults, `A–J` commentary + `A–D` doctrine/application notes, Prayer Card prompts, challenges, prayers, immutability, and zero `"Assistant"` strings.
- `tests/integration/studies-default.test.ts` — create; single-port HTTP integration tests verifying `GET /api/studies/default` (`200` JSON with all 5 sections), tunnel `Host` header compatibility, and `/api/studies/unknown` JSON `404`.
- `tests/e2e/studies-default.spec.ts` — create; focused Playwright single-port E2E check verifying production build serves `GET /api/studies/default` alongside `/` on the unified port.
- `ARCHITECTURE.md` — modify; document `src/shared/study.ts`, `src/server/studies/`, and `GET /api/studies/default` in the module/routing summary.

## Visual Design Impact

- UI involved: no
- Design source: `DESIGN.md` and `ux/2. Leader Setup.png`, `ux/3. Title - Leader.png`, `ux/7. Ice Breaker - Leader.png`, `ux/7. Reading - Leader.png`, `ux/10. Discussion - Leader.png`, `ux/12. Closing Prayer.png` (referenced only to align display labels, durations, and detection summary strings inside `StudyDocument`; no React UI components change in this slice).
- Screens or states affected: none in this feature (consumed later by `leader-load-study-setup-screen` through `section-5-closing-prayer-completion`).
- New design artifact required: no — pure API and shared domain contract slice.

## Durable Documentation Impact

- `ARCHITECTURE.md`: update — Add `src/shared/study.ts`, `src/server/studies/`, and `GET /api/studies/default` to the `src/shared/` and `src/server/` routing overview.
- `CONSTRAINTS.md`: not needed — Existing constraints (`Participant` terminology, Gospel-only Section 3, deterministic non-AI study handling, unified single port) already cover all invariants for this slice.
- `AGENTS.md`: not needed — Agent startup workflow and repo operating rules do not change.
- Other docs: `PROGRESS.md` and `feature_list.json` updated with verification evidence upon implementation/validation; `docs/domain-model.md` remains unchanged as the canonical source of truth.

## Implementation Plan

1. Create `src/shared/study.ts` with complete `StudyDocument` / `StudySection` TypeScript interfaces, `getStudySections`, and `validateStudyDocument`.
2. Create `src/server/studies/greatIsYourFaithSeed.ts` containing the complete, frozen *"Great Is Your Faith"* (`Matthew 15:21–28`) seed curriculum sourced from `docs/domain-model.md` and exporting `getDefaultStudyDocument()`.
3. Register `GET /api/studies/default` in `src/server/app.ts` and update `ARCHITECTURE.md`.
4. Add unit (`tests/unit/study-seed.test.ts`), integration (`tests/integration/studies-default.test.ts`), and Playwright single-port E2E (`tests/e2e/studies-default.spec.ts`) tests, then run all verification gates.

## Implementation Tasks

- [ ] Implement `src/shared/study.ts` with `StudyDocument`, 5 discriminated `StudySection` payloads (`OpeningPrayerSection`, `IcebreakerSection`, `GospelReadingSection`, `DeepAnalysisSection`, `ClosingSection`), `getStudySections`, and `validateStudyDocument` using `Participant` terminology exclusively.
- [ ] Implement `src/server/studies/greatIsYourFaithSeed.ts` with full verbatim Matthew 15:21–28 Gospel text in Section 3 (keeping Isaiah 56, Psalm 67, and Romans 11 strictly in `leaderLiturgicalContextNote`), Opening/Closing Prayers, `"Outsiders Wanted"` prompts + 8 examples, `A–J` commentary (with Augustine, Chrysostom, Jerome notes), `A–D` Catholic doctrine notes (including Romans 11:29 guardrail), `A–D` young adult applications, all 12 reflection questions (`q-6`, `q-5`, `q-8` default active queue), 3 `"Lord, Help Me"` Prayer Card prompts, 4 weekly challenges, and `"Faith that Endures" — James 1:2–4` Next Week card.
- [ ] Expose `GET /api/studies/default` in `src/server/app.ts` prior to the `/api` `404` fallback and update `ARCHITECTURE.md`.
- [ ] Add `tests/unit/study-seed.test.ts` covering `validateStudyDocument`, full Matthew 15:21–28 verse coverage (`21..28`), Gospel-only Section 3 separation, 12 questions, `A–J` commentary, `A–D` doctrine/application items, Opening/Closing prayers, defensive cloning immutability, and zero `"Assistant"` occurrences.
- [ ] Add `tests/integration/studies-default.test.ts` and `tests/e2e/studies-default.spec.ts` asserting `GET /api/studies/default` returns HTTP `200` with all 5 interactive section payloads on the unified single port (including external tunnel `Host` headers) and `/api/studies/unknown` returns JSON `404`.
- [ ] Run `./init.sh`, `PLAYWRIGHT_PORT=3301 npm run test:e2e`, and a quick `PORT=3101` CLI `curl` check to verify everything exits cleanly.

## Verification Plan

- Run `./init.sh`:
  - `./init.sh` executes the non-blocking standard gate (`npm run typecheck`, `npm test`, `npm run build`) and must exit `0` without starting long-running processes such as `npm run dev` or `npm start`.
- Run `PLAYWRIGHT_PORT=3301 npm run test:e2e`:
  - Builds production assets, starts the unified single-port server on isolated worktree port `3301`, and verifies `GET /api/studies/default` returns HTTP `200` with the complete 5-section `"Great Is Your Faith"` `StudyDocument` alongside the existing Midnight Sanctuary bootstrap suite.
- Run a direct single-port CLI smoke check on dedicated worktree port `PORT=3101`:
  - Start `PORT=3101 node dist/server/index.js`, assert `curl -fsS http://127.0.0.1:3101/api/studies/default` returns HTTP `200` JSON with `"id":"great-is-your-faith"` and `5` sections and `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3101/api/studies/unknown` returns `404`, then terminate the process cleanly.

## Evidence To Capture

- Exit code and summary of `./init.sh` (`npm run typecheck`, Vitest suite/test counts including `study-seed.test.ts` and `studies-default.test.ts`, and `npm run build` output).
- Exit code and test count of `PLAYWRIGHT_PORT=3301 npm run test:e2e` (`studies-default.spec.ts` + `app-shell-bootstrap.spec.ts`).
- `PORT=3101` CLI `curl` verification summary confirming HTTP `200` `StudyDocument` metadata/section counts on `GET /api/studies/default` and HTTP `404` JSON on `/api/studies/unknown`, recorded in `feature_list.json` and `PROGRESS.md`.

## Validator Checklist

- [ ] Implementation stays strictly within `preloaded-great-is-your-faith-seed` scope (no `.md`/`.pdf` upload parser, `/ws` session handlers, or premature UI screens).
- [ ] `GET /api/studies/default` returns HTTP `200` with the complete `"Great Is Your Faith"` (`Matthew 15:21–28`) `StudyDocument` containing all 5 interactive section payloads (`openingPrayer`, `icebreaker`, `gospelReading`, `deepAnalysis`, `closing`).
- [ ] Section 3 (`gospelReading`) contains **only** the full `Matthew 15:21–28` Gospel proclamation as main reading while keeping Isaiah 56, Psalm 67, and Romans 11 strictly in `leaderLiturgicalContextNote`.
- [ ] All 12 reflection questions (`q-6`, `q-5`, `q-8` default active queue), `A–J` commentary (with Augustine, Chrysostom, Jerome notes), `A–D` Catholic doctrine notes (including Romans 11:29 guardrail), `A–D` applications, 3 `"Lord, Help Me"` Prayer Card prompts, 4 weekly challenges, Next Week (`"Faith that Endures" — James 1:2–4`), and Opening/Closing Prayers match `docs/domain-model.md`.
- [ ] Zero occurrences of `"Assistant"` exist in types, comments, or payload values, and mutating a returned `StudyDocument` does not corrupt subsequent calls.
- [ ] `./init.sh` and `PLAYWRIGHT_PORT=3301 npm run test:e2e` pass with concrete evidence recorded in `feature_list.json` and `PROGRESS.md`, `ARCHITECTURE.md` is updated accurately, and no background server processes are left running.

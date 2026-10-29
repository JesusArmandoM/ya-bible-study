# Feature Implementation Spec: Markdown study upload parses structured sections deterministically

## Source Feature

- `id`: `markdown-study-deterministic-parser`
- `area`: `study-content`
- `depends_on`: `["preloaded-great-is-your-faith-seed"]`
- `status`: `not_started`
- `source`: `feature_list.json`

## Goal

Implement a deterministic, zero-AI parser module (`src/server/studies/markdownParser.ts`) that extracts structured Catholic Young Adult Bible study curriculums from standard numbered Markdown documents into validated `StudyDocument` payloads conforming to `src/shared/study.ts`, and expose it at `POST /api/studies/parse` on the unified Express server supporting both raw text (Markdown/plain text/JSON) and `multipart/form-data` file uploads with a strict 10 MB ceiling and HTTP 413/400 error handling.

This capability enables the `Study Leader` to load any weekly study written in the standard 17-heading Catholic Bible study format, instantly validating all 5 interactive session sections (`Opening Prayer`, `Icebreaker`, `Gospel Reading`, `Deep Analysis & Discussion`, and `Closing Prayer`) in memory with actionable error reporting when required sections or Gospel readings are missing.

## Non-Goals

- Calling external AI/LLM APIs (OpenAI, Claude, Anthropic, Gemini, etc.) (`CONSTRAINTS.md` #9).
- Parsing binary PDF files (`pdf-study-deterministic-parser`).
- Building the React "Load Your Study" upload dropzone / setup preview UI (`leader-load-study-setup-screen`).
- Writing uploaded files to public disk or persistent database storage (`CONSTRAINTS.md` #9; parse in memory only).
- Supporting non-Gospel passages (OT / Psalm / Epistle) as Section 3 interactive reading turns (`CONSTRAINTS.md` #4).
- Calling external Bible lookup APIs (`docs/risks-and-open-questions.md`).

## Job Story

When a `Study Leader` prepares a weekly session with a custom or updated Markdown study outline,
I want to upload or submit the `.md` content to `POST /api/studies/parse` and receive a fully parsed, validated 5-section `StudyDocument` (or specific, actionable error messages if sections or Gospel text are missing),
so the app deterministically extracts all prayers, icebreaker prompts, Gospel Scripture, 12 reflection questions, commentary, doctrine, prayer card prompts, challenges, and detection metrics in milliseconds without relying on external cloud AI services.

## Users And Permissions

- **Unauthenticated / `Study Leader` Setup Stage**: Can send `POST /api/studies/parse` with raw markdown text, JSON `{ "content": "..." }`, or `multipart/form-data` (`file`) up to 10 MB over same-origin HTTP(S) or public tunnels.
- **Terminology Invariant**: All code, error messages, test descriptions, and types must use `Study Leader` and `Participant` (never `Assistant`).
- **Facilitator Pastoral Privacy**: Parser outputs pastoral notes (`leaderNote`, `examplesToListenFor`, `leaderLiturgicalContextNote`, `verseCommentary`, `catholicDoctrine`, `youngAdultApplication`, `sampleAnswer`) into designated fields ready for leader-only delivery.

## Acceptance Scenarios

### Scenario 1: Canonical "Great Is Your Faith" Markdown parses to valid `StudyDocument`

Given canonical `Great Is Your Faith.md` text following the 17-section Catholic Bible study format
When submitted to `POST /api/studies/parse` (via raw text, JSON `{ "content": "..." }`, or multipart `file`)
Then the server responds with HTTP `200 OK` and `Content-Type: application/json`
And the JSON payload passes `validateStudyDocument()` from `src/shared/study.ts` with `sectionCount: 5`, `curatedQuestionCount: 3`, and `totalQuestionCount: 12`
And `gospelReading.fullText` contains Matthew 15:21–28 Gospel verses with zero OT/Psalm/Epistle text
And Isaiah 56, Psalm 67, and Romans 11 are placed into `leaderLiturgicalContextNote`.

### Scenario 2: Fallback Gospel reconstruction from Section 8 Deep Analysis headers

Given a Markdown study where Section 6 lists only `*Key lines:*` without verbatim Gospel verse paragraphs, but Section 8 (`A–J`) quotes individual verses in subsection headings
When parsed by `parseMarkdownStudy()`
Then the parser reconstructs the continuous Gospel text and `GospelVerse[]` by extracting verse numbers and quoted text from Section 8 headers
And Section 3 `fullText` and `verses` validate cleanly with non-empty text, keyLines, and Gospel-only citation.

### Scenario 3: Second distinct weekly study parses deterministically

Given a second distinct Catholic Young Adult Bible study Markdown fixture ("Peace! Be Still" — Mark 4:35–41) following the same 17-heading structure
When submitted to `POST /api/studies/parse`
Then the server responds with HTTP `200 OK` and `Content-Type: application/json`
And the parsed `StudyDocument` validates cleanly with `gospelCitation: "Mark 4:35–41"`, distinct title, Opening Prayer, Icebreaker, 12 reflection questions (with 3 curated active prompts), Catholic doctrine highlights, and Closing Prayer.

### Scenario 4: Rejection of oversized payloads (> 10 MB)

Given a payload (raw text, JSON, or multipart file) exceeding 10 MB (`10 * 1024 * 1024` bytes)
When submitted to `POST /api/studies/parse`
Then the server rejects the request with HTTP `413 Payload Too Large` and JSON `{ "error": "File size exceeds 10MB limit" }` without crashing or allocating excess memory.

### Scenario 5: Actionable validation errors for malformed or missing sections

Given empty text, non-study markdown, or a study missing mandatory sections (e.g. missing Opening Prayer, missing Gospel reading, or invalid questions)
When submitted to `POST /api/studies/parse`
Then the server responds with HTTP `400 Bad Request` and JSON `{ "error": "Study validation failed", "errors": string[] }` detailing exactly which sections or fields are missing.

### Scenario 6: Terminology and In-Memory Safety

Given any valid or invalid parsing run
When inspecting response payloads, error strings, and parser source code
Then zero occurrences of `"Assistant"` exist
And no temporary files are written to the filesystem (parsed entirely in memory).

## Repository Research

### Files Inspected

- `src/shared/study.ts` — Canonical `StudyDocument` interface, 5 discriminated `StudySection` types, `getStudySections()`, `validateStudyDocument()`, and `NON_GOSPEL_MAIN_READING_PATTERNS`.
- `src/server/studies/greatIsYourFaithSeed.ts` — Canonical seed curriculum for "Great Is Your Faith" (reference for expected parsed output structure).
- `src/server/app.ts` — Express 5 app creation, `/api/*` routing, JSON 404 fallback, and `createAppServer()` factory.
- `CONSTRAINTS.md` — Rule 3 (Participant never Assistant), Rule 4 (Gospel-only Section 3), Rule 9 (Deterministic in-memory study parsing, zero external AI, <=10MB).
- `docs/domain-model.md` — Canonical 17-heading Catholic Bible study mapping (lines 67–79).
- `docs/risks-and-open-questions.md` — Implementation-Time Question 1 (fallback rule when Gospel verses appear in Section 8 headers).
- `package.json` — Express 5 dependencies, script commands (`npm run typecheck`, `npm test`, `npm run test:e2e`).

### Existing Patterns To Follow

- Keep `src/shared/*` pure TypeScript with zero Node built-ins or DOM globals so both client and server compile cleanly.
- Use explicit `.js` extensions on all relative imports in `src/server/**/*.ts` and `src/shared/**/*.ts` to satisfy `tsconfig.server.json` (`NodeNext`).
- Mount `/api/*` endpoints in `createAppServer` (`src/server/app.ts`) **before** the `app.use('/api', ...)` 404 handler.
- Integration tests bind ephemeral port `0` using `createAppServer()` and verify HTTP responses cleanly without port collisions.

### Current Gaps

- `src/server/studies/markdownParser.ts` does not exist yet.
- `POST /api/studies/parse` is not registered in `src/server/app.ts`.
- Multipart upload middleware (`multer` with memory storage) is not installed/configured.
- Test fixtures (`tests/fixtures/great-is-your-faith.md` and `tests/fixtures/peace-be-still-mark-4.md`) do not exist yet.

## Technical Approach

1. **Deterministic Markdown Heading & Block Parser (`src/server/studies/markdownParser.ts`)**:
   - Export pure in-memory parser function:
     `parseMarkdownStudy(markdownContent: string, options?: { fileName?: string }): StudyValidationResult`
   - Split Markdown into sections using regex matching top-level `#` / `##` headings corresponding to the standard 17-section structure:
     - Title & Metadata: `# <Title>` (subtitle, liturgical date, eyebrow, gospel citation, duration).
     - Section 1 / Central Themes: `## 1. Central Theme(s)` (extract bullet points).
     - Section 2 / Session Goals: `## 2. Session Goals` (extract bullet points).
     - Section 3 / Schedule: `## 3. Schedule` (extract estimated duration, e.g. 90m).
     - Section 4 / Opening Prayer: `## 4. Opening Prayer` (extract prayer text, supply canonical prompts).
     - Section 5 / Icebreaker: `## 5. Icebreaker: <Title>` (extract intro, main question, follow-up, leader note, examples to listen for).
     - Section 6 / Proclamation: `## 6. Proclamation of the Readings` (extract Gospel citation, fullText, verses, keyLines, and shunt OT/Psalm/Epistle texts into leader liturgical context notes).
     - Section 7 / Biblical Context: `## 7. Biblical & Liturgical Context` (append to `leaderLiturgicalContextNote`).
     - Section 8 / Deep Analysis: `## 8. Deep Analysis (A–J)` (extract commentary items `A..J`, verse citations, quoted text, catechism references, patristic notes; **Fallback Rule**: if Section 6 omitted continuous verse text, reconstruct `verses` and `fullText` by extracting quotes from Section 8 headers).
     - Section 9 / Catholic Doctrine: `## 9. Catholic Doctrine Highlights (A–D)` (extract `A..D` doctrine items).
     - Section 10 / Young Adult Application: `## 10. Young Adult Pastoral Application (A–D)` (extract `A..D` items).
     - Section 11 / Reflection Questions: `## 11. Reflection Questions (1–12)` (extract questions 1..12, prompts, categories, sample answers, leader notes; determine default curated question IDs).
     - Section 12 / Group Activity: `## 12. Group Activity: "Lord, Help Me" Prayer Card` (extract instructions and 3 prompt lines).
     - Section 13 / Weekly Challenges: `## 13. Practical Weekly Challenges` (extract options 1..4).
     - Section 14 / Closing Summary: `## 14. Closing Summary` (extract summary bullets).
     - Section 15 / Closing Prayer: `## 15. Closing Prayer` (extract closing prayer text).
     - Section 16 / Next Week: `## 16. Next Week Announcement` (extract title, citation, display label).
     - Section 17 / Main Point: `## 17. One-Sentence Main Point` (extract main point).
   - Compute `detectionSummary` (`5 sections detected`, `detectedLabel`, `curatedQuestionCount`, `totalQuestionCount`, flags).
   - Validate constructed candidate against `validateStudyDocument()` from `src/shared/study.ts`.
   - Return `{ valid: true, value: doc }` or `{ valid: false, errors: string[] }`.

2. **HTTP Endpoint Wiring (`POST /api/studies/parse` in `src/server/app.ts`)**:
   - Install `multer` (`^2.5.0` or `^1.4.5-lts.1`) and `@types/multer` for in-memory multipart handling.
   - Configure multer with `memoryStorage()` and `limits: { fileSize: 10 * 1024 * 1024 }` (10 MB).
   - Early `Content-Length` header check: if `Number(req.headers['content-length']) > 10 * 1024 * 1024`, return HTTP 413 `{ "error": "File size exceeds 10MB limit" }`.
   - Support three body formats:
     - `multipart/form-data`: extract text from `req.file.buffer.toString('utf-8')`, `fileName = req.file.originalname`.
     - `text/markdown` / `text/plain` / raw string: parse raw body with `express.text({ limit: '10mb' })`, `fileName = 'uploaded-study.md'`.
     - `application/json`: extract `req.body.content` or `req.body.markdown` and optional `req.body.fileName`.
   - Multer error handling: catch `LIMIT_FILE_SIZE` and return HTTP 413 `{ "error": "File size exceeds 10MB limit" }`.
   - On parse/validation failure: return HTTP 400 `{ "error": "Study validation failed", "errors": result.errors }`.
   - On success: return HTTP 200 JSON `result.value`.

3. **Test Fixtures (`tests/fixtures/`)**:
   - `tests/fixtures/great-is-your-faith.md`: Full canonical 17-section study for Matthew 15:21–28 matching `docs/domain-model.md`.
   - `tests/fixtures/great-is-your-faith-section8-fallback.md`: Section 6 lists only key lines; verses reconstructed from Section 8 headers.
   - `tests/fixtures/peace-be-still-mark-4.md`: Second distinct weekly study for Mark 4:35–41 (Twelfth Sunday in Ordinary Time, Year B).

## Expected File Changes

- `package.json` — modify; add `multer` and `@types/multer` dependencies.
- `src/server/studies/markdownParser.ts` — create; deterministic regex/heading Markdown study parser, section extractors, and Section 8 fallback rule.
- `src/server/app.ts` — modify; wire multer memory upload, text parser, and `POST /api/studies/parse` with 10MB limits and error handlers.
- `tests/fixtures/great-is-your-faith.md` — create; canonical 17-section Markdown study fixture.
- `tests/fixtures/great-is-your-faith-section8-fallback.md` — create; fallback Gospel reconstruction fixture.
- `tests/fixtures/peace-be-still-mark-4.md` — create; second distinct weekly Markdown study fixture.
- `tests/unit/markdown-parser.test.ts` — create; unit tests for parser extraction, Section 8 fallback, second study, and error cases.
- `tests/integration/studies-parse.test.ts` — create; integration tests for `POST /api/studies/parse` (raw text, JSON, multipart, >10MB rejection, HTTP 400 validation errors, zero `Assistant`).
- `tests/e2e/studies-parse.spec.ts` — create; Playwright single-port E2E test verifying `POST /api/studies/parse` against the production server.
- `ARCHITECTURE.md` — modify; document `markdownParser.ts` and `POST /api/studies/parse` in server routing.

## Visual Design Impact

- UI involved: no
- Design source: `DESIGN.md` (no visual UI components change in this slice; outputs feed `leader-load-study-setup-screen`).
- Screens or states affected: none in this feature.
- New design artifact required: no — pure backend parser and API slice.

## Durable Documentation Impact

- `ARCHITECTURE.md`: update — Add `src/server/studies/markdownParser.ts` and `POST /api/studies/parse` to module boundaries and route listing.
- `CONSTRAINTS.md`: not needed — Constraint 9 (deterministic in-memory study parsing, zero external AI, <=10MB) already captures the invariant.
- `AGENTS.md`: not needed — Workflow and repo operating rules do not change.
- Other docs: `PROGRESS.md` and `feature_list.json` updated with verification evidence upon implementation and independent validation.

## Implementation Plan

1. Install `multer` and `@types/multer` with `npm install multer` and `npm install -D @types/multer`.
2. Create test fixtures under `tests/fixtures/`: `great-is-your-faith.md`, `great-is-your-faith-section8-fallback.md`, and `peace-be-still-mark-4.md`.
3. Implement `src/server/studies/markdownParser.ts` with regex heading splitting, 17-section block extractors, Section 8 Gospel reconstruction fallback, detection summary generation, and `validateStudyDocument()` validation.
4. Add unit test suite `tests/unit/markdown-parser.test.ts` verifying all fixtures, fallback logic, and error handling.
5. Wire `POST /api/studies/parse` into `src/server/app.ts` with 10MB limit enforcement, multer memory storage, raw text/JSON body support, and HTTP 413/400/200 handling.
6. Add integration test suite `tests/integration/studies-parse.test.ts` and Playwright E2E suite `tests/e2e/studies-parse.spec.ts`.
7. Update `ARCHITECTURE.md`, run `./init.sh`, run `npm run test:e2e`, and verify all gates pass.

## Implementation Tasks

- [ ] Install `multer` and `@types/multer` in `package.json`.
- [ ] Create canonical Markdown fixture `tests/fixtures/great-is-your-faith.md` matching `docs/domain-model.md`.
- [ ] Create fallback Markdown fixture `tests/fixtures/great-is-your-faith-section8-fallback.md` omitting Section 6 verse body.
- [ ] Create second distinct study fixture `tests/fixtures/peace-be-still-mark-4.md` for Mark 4:35–41.
- [ ] Implement `src/server/studies/markdownParser.ts` with deterministic heading extraction, Section 8 Gospel fallback, and `validateStudyDocument` validation.
- [ ] Implement `POST /api/studies/parse` in `src/server/app.ts` supporting multipart, raw text, and JSON with 10 MB caps and HTTP 413/400 error handling.
- [ ] Add unit tests `tests/unit/markdown-parser.test.ts` covering canonical study, Section 8 fallback, second distinct study, missing sections, non-Gospel readings in section 3, and zero `Assistant`.
- [ ] Add integration tests `tests/integration/studies-parse.test.ts` verifying raw string, JSON, multipart uploads, >10MB HTTP 413 rejection, and HTTP 400 validation errors.
- [ ] Add Playwright E2E test `tests/e2e/studies-parse.spec.ts` verifying `POST /api/studies/parse` on the unified single-port production server.
- [ ] Update `ARCHITECTURE.md` to document the parser and endpoint.

## Verification Plan

- Run `./init.sh` to verify TypeScript compile, Vitest unit/integration tests, and production build pass.
- Run dedicated port verification:
  `PORT=3101 API_PORT=3201 PLAYWRIGHT_PORT=3301 npm run test:e2e`
- Run negative test asserting a 10.5 MB payload to `POST /api/studies/parse` returns HTTP 413.
- Run static scan: `grep -rn "Assistant" src/server/studies/markdownParser.ts tests/unit/markdown-parser.test.ts tests/integration/studies-parse.test.ts` asserting 0 occurrences.

## Evidence To Capture

- `./init.sh` exit 0 output verifying typecheck, Vitest suites, and build.
- `PLAYWRIGHT_PORT=3301 npm run test:e2e` exit 0 output.
- CLI smoke check with curl on `http://127.0.0.1:3101/api/studies/parse` with both valid markdown and oversized/invalid payload.
- Zero `"Assistant"` grep verification output.

## Validator Checklist

- [ ] Implementation stays within this feature's scope (no React UI, no PDF parsing).
- [ ] Acceptance scenarios 1 through 6 pass.
- [ ] Zero external AI/LLM APIs are invoked (deterministic regex/heading parsing only).
- [ ] Section 3 main reading contains ONLY Gospel Scripture text; other liturgical readings placed into leader notes.
- [ ] Section 8 Gospel reconstruction fallback works when Section 6 contains only key lines.
- [ ] Second distinct weekly study fixture parses deterministically into valid `StudyDocument`.
- [ ] Payloads > 10MB are rejected with HTTP 413.
- [ ] Zero occurrences of `"Assistant"` in code, copy, or tests (uses `Study Leader` and `Participant`).
- [ ] `./init.sh` and `npm run test:e2e` pass with concrete evidence in `PROGRESS.md` and `feature_list.json`.

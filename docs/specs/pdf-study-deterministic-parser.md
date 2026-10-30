# Feature Implementation Spec: PDF study upload extracts structured sections into study model

## Source Feature

- `id`: `pdf-study-deterministic-parser`
- `area`: `study-content`
- `depends_on`: `["markdown-study-deterministic-parser"]`
- `status`: `not_started`
- `source`: `feature_list.json`

## Goal

Implement a deterministic, zero-AI PDF text extraction and normalization parser module (`src/server/studies/pdfParser.ts`) that extracts structured Catholic Young Adult Bible study curriculums from text-based `.pdf` documents into validated `StudyDocument` payloads conforming to `src/shared/study.ts`, and expand `POST /api/studies/parse` on the unified Express server to accept `.pdf` uploads via both `multipart/form-data` and raw binary `application/pdf` bodies with a strict 10 MB ceiling, unsupported file type filtering (rejecting non-PDF and non-MD files with HTTP 400), and HTTP 413/400 error handling.

This capability enables the `Study Leader` to upload weekly study PDF handouts directly into the application in memory, extracting all 5 interactive sections (`Opening Prayer`, `Icebreaker`, `Gospel Reading`, `Deep Analysis & Discussion`, and `Closing Prayer`) and detection metrics in milliseconds without cloud AI or disk persistence.

## Non-Goals

- Calling external AI/LLM APIs (OpenAI, Claude, Anthropic, Gemini, etc.) (`CONSTRAINTS.md` #9).
- Performing Optical Character Recognition (OCR) on image-only / scanned PDFs (`docs/risks-and-open-questions.md`). Only text-based PDFs with selectable text are supported.
- Writing uploaded files or intermediate buffers to public disk or persistent database storage (`CONSTRAINTS.md` #9; parse in memory only).
- Building the React "Load Your Study" upload dropzone / setup preview UI (`leader-load-study-setup-screen`).
- Supporting non-Gospel passages (OT / Psalm / Epistle) as Section 3 interactive reading turns (`CONSTRAINTS.md` #4).
- Calling external Bible lookup APIs (`docs/risks-and-open-questions.md`).

## Job Story

When a `Study Leader` prepares a weekly session with a published or diocesan `.pdf` Bible study document,
I want to upload the text-based `.pdf` file to `POST /api/studies/parse` and receive a fully parsed, validated 5-section `StudyDocument` with `source: { type: 'pdf', fileName: ..., statusLabel: 'Analyzed' }` and detection summary (or clear, actionable error messages if sections, Gospel text, or selectable text are missing),
so the app deterministically extracts all prayers, icebreaker prompts, Gospel Scripture, 12 reflection questions, commentary, doctrine, prayer card prompts, challenges, and detection metrics in milliseconds without relying on external cloud AI services or writing files to disk.

## Users And Permissions

- **Unauthenticated / `Study Leader` Setup Stage**: Can send `POST /api/studies/parse` with `multipart/form-data` (`.pdf` or `.md`), raw binary `application/pdf`, raw markdown text, or JSON `{ "content": "..." }` up to 10 MB over same-origin HTTP(S) or public tunnels.
- **Terminology Invariant**: All English UI copy, error messages, test descriptions, and types must use `Study Leader` and `Participant` (zero occurrences of non-Participant roles).
- **Facilitator Pastoral Privacy**: Parser outputs pastoral notes (`leaderNote`, `examplesToListenFor`, `leaderLiturgicalContextNote`, `verseCommentary`, `catholicDoctrine`, `youngAdultApplication`, `sampleAnswer`) into designated fields ready for leader-only delivery.

## Acceptance Scenarios

### Scenario 1: Canonical "Great Is Your Faith" PDF parses to valid `StudyDocument`

Given a text-based PDF fixture (`great-is-your-faith.pdf`) following the standard 17-section Catholic Bible study format
When uploaded via `multipart/form-data` to `POST /api/studies/parse`
Then the server responds with HTTP `200 OK` and `Content-Type: application/json`
And the JSON payload passes `validateStudyDocument()` from `src/shared/study.ts` with `sectionCount: 5`, `source.type === 'pdf'`, `source.fileName === 'great-is-your-faith.pdf'`, and `source.statusLabel === 'Analyzed'`
And `detectionSummary` reports `sectionsDetectedLabel: "5 sections detected"`, `hasOpeningPrayer: true`, `hasGospelReading: true`, and `hasClosingPrayer: true`
And `gospelReading.fullText` contains Matthew 15:21–28 Gospel verses with zero OT/Psalm/Epistle text
And Isaiah 56, Psalm 67, and Romans 11 are placed into `leaderLiturgicalContextNote`.

### Scenario 2: Raw binary `application/pdf` body parsing

Given a valid PDF buffer submitted with `Content-Type: application/pdf` and optional `X-File-Name: great-is-your-faith.pdf`
When submitted to `POST /api/studies/parse`
Then the server responds with HTTP `200 OK` and `Content-Type: application/json`
And the parsed `StudyDocument` validates cleanly with `source: { type: 'pdf', fileName: 'great-is-your-faith.pdf', statusLabel: 'Analyzed' }` and all 5 populated sections.

### Scenario 3: Text normalization of PDF artifacts

Given a PDF containing running headers, page number patterns (e.g. `Page 1 of 4`, `- 2 -`, `[ 3 ]`), typographic ligatures (`ﬁ`, `ﬂ`, `ﬀ`, `ﬃ`, `ﬄ`), smart quotes (`“`, `”`, `‘`, `’`), and form feeds (`\f`)
When parsed by `parsePdfStudy()`
Then running headers and footers are stripped, ligatures are expanded (`fi`, `fl`, `ff`), smart quotes are normalized, and section headings are recognized
And the resulting `StudyDocument` validates cleanly without section misalignments or extraction errors.

### Scenario 4: Second distinct weekly study PDF parses deterministically

Given a second distinct Catholic Young Adult Bible study PDF fixture ("Peace! Be Still" — Mark 4:35–41) following the same 17-heading structure
When submitted to `POST /api/studies/parse`
Then the server responds with HTTP `200 OK` and `Content-Type: application/json`
And the parsed `StudyDocument` validates cleanly with `gospelCitation: "Mark 4:35–41"`, distinct title, Opening Prayer, Icebreaker, 12 reflection questions (with 3 curated active prompts), Catholic doctrine highlights, and Closing Prayer.

### Scenario 5: Rejection of oversized payloads (> 10 MB)

Given a PDF payload (multipart file or raw binary) exceeding 10 MB (`10 * 1024 * 1024` bytes)
When submitted to `POST /api/studies/parse`
Then the server rejects the request with HTTP `413 Payload Too Large` and JSON `{ "error": "File size exceeds 10MB limit" }` without crashing or allocating excess memory.

### Scenario 6: Rejection of unsupported file types

Given a multipart file upload with an unsupported extension or MIME type (e.g. `.docx`, `.txt`, `.png`, `.jpg`, `.csv`)
When submitted to `POST /api/studies/parse`
Then the server rejects the request with HTTP `400 Bad Request` and JSON `{ "error": "Study validation failed", "errors": ["Unsupported file type: only .pdf and .md study files are supported."] }`.

### Scenario 7: Actionable error for textless/scanned or corrupted PDF files

Given a PDF containing no selectable text (e.g. scanned image-only PDF without OCR) or corrupt PDF bytes
When submitted to `POST /api/studies/parse`
Then the server responds with HTTP `400 Bad Request` and JSON `{ "error": "Study validation failed", "errors": string[] }` with an actionable message indicating selectable text could not be extracted or mandatory sections are missing.

### Scenario 8: Terminology and In-Memory Safety

Given any valid or invalid PDF parsing run
When inspecting response payloads, error strings, and parser source code
Then zero occurrences of invalid legacy role labels exist (uses `Study Leader` and `Participant` exclusively)
And no temporary files are written to the filesystem (parsed entirely in memory).

## Repository Research

### Files Inspected

- `src/shared/study.ts` — Canonical `StudyDocument`, `StudySourceMetadata` (`type: 'preloaded' | 'markdown' | 'pdf'`), `StudyDetectionSummary`, `validateStudyDocument()`, and `NON_GOSPEL_MAIN_READING_PATTERNS`.
- `src/server/studies/markdownParser.ts` — Deterministic 17-heading section splitter, block extractors, Section 8 fallback rule, and `ParseMarkdownStudyOptions`.
- `src/server/app.ts` — Express 5 app, multer memory storage, `POST /api/studies/parse` handling, and early 10MB `Content-Length` check.
- `CONSTRAINTS.md` — Constraint 3 (Participant terminology), Constraint 4 (Gospel-only Section 3), Constraint 9 (Deterministic in-memory study parsing, zero external AI, <=10MB).
- `docs/domain-model.md` — Canonical 17-heading Catholic Bible study mapping (lines 67–79).
- `docs/technical-discovery.md` — Line 23: deterministic `.pdf` extraction (`pdf-parse` / `pdfjs-dist`) normalizing headings and line breaks into the structured pipeline.
- `docs/risks-and-open-questions.md` — Research task on `pdf-parse` vs `pdfjs-dist` ESM compatibility without native OS binary dependencies.
- `tests/fixtures/great-is-your-faith.md` & `tests/fixtures/peace-be-still-mark-4.md` — Existing markdown fixtures to mirror in PDF format.
- `tests/integration/studies-parse.test.ts` & `tests/e2e/studies-parse.spec.ts` — Integration and E2E test suites for `POST /api/studies/parse`.

### Existing Patterns To Follow

- Keep `src/shared/*` pure TypeScript with zero Node built-ins or DOM globals.
- Use explicit `.js` extensions on all relative imports in `src/server/**/*.ts` and `src/shared/**/*.ts` to satisfy `tsconfig.server.json` (`NodeNext`).
- Use in-memory buffers (`multer.memoryStorage()`, `express.raw()`) without writing to disk.
- Mount `/api/*` endpoints in `createAppServer` (`src/server/app.ts`) before the `app.use('/api', ...)` 404 handler.
- Return consistent error envelope `{ "error": "Study validation failed", "errors": string[] }` for HTTP 400 validation failures and `{ "error": "File size exceeds 10MB limit" }` for HTTP 413.

### Current Gaps

- `unpdf` (or chosen PDF extraction library) is not installed in `package.json`.
- `src/server/studies/pdfParser.ts` does not exist yet.
- `src/server/studies/markdownParser.ts` hardcodes `source.type: 'markdown'` in `candidateDoc` rather than accepting `sourceType` from options.
- `POST /api/studies/parse` in `src/server/app.ts` does not handle raw `application/pdf` binary bodies, does not route `.pdf` multipart uploads to a PDF extractor, and does not validate file extensions / MIME types.
- PDF test fixtures (`tests/fixtures/great-is-your-faith.pdf`, `tests/fixtures/peace-be-still-mark-4.pdf`) do not exist yet.

## Technical Approach

1. **PDF Text Extraction Library (`unpdf`)**:
   - Install `unpdf` (`npm install unpdf`).
   - `unpdf` is a zero-dependency, pure JavaScript library bundling Mozilla's PDF.js specifically for modern serverless and ESM Node runtimes.
   - It requires zero native OS binary dependencies (no `@napi-rs/canvas` or `node-gyp`), supports `Uint8Array` / `Buffer` in memory, and provides page-level text extraction:
     ```ts
     import { extractText } from 'unpdf';
     const { text, totalPages } = await extractText(pdfBuffer, { mergePages: false });
     ```
   - Page-by-page array extraction (`string[]`) enables precise header, footer, and page-number stripping across page boundaries before joining into document text.

2. **Text Normalization Engine (`src/server/studies/pdfParser.ts`)**:
   - Export pure in-memory normalization and parser functions:
     `normalizePdfText(pages: string[]): string`
     `parsePdfStudy(pdfBuffer: Buffer | Uint8Array, options?: ParsePdfStudyOptions): Promise<StudyValidationResult>`
   - **Page Header and Footer Stripping**:
     - Remove running page numbers: `Page \d+(?: of \d+)?`, `[-–—]\s*\d+\s*[-–—]`, `\[\s*\d+\s*\]`, `\b\d+\s*\/\s*\d+\b`, and isolated `^\s*\d+\s*$` lines at page margins.
     - Strip repeated running headers: detect and remove document titles repeated on consecutive page tops.
     - Replace form feeds (`\f`) and page breaks with clean newlines.
   - **Ligature Expansion**:
     - `ﬁ` -> `fi`, `ﬂ` -> `fl`, `ﬀ` -> `ff`, `ﬃ` -> `ffi`, `ﬄ` -> `ffl`, `œ`/`Œ` -> `oe`/`Oe`, `æ`/`Æ` -> `ae`/`Ae`.
   - **Unicode Whitespace & Quotes Normalization**:
     - Non-breaking spaces (`\u00A0`), narrow spaces (`\u202F`), zero-width spaces (`\u200B`) -> standard ASCII spaces.
     - Smart double quotes (`“`, `”`, `„`, `«`, `»`) -> standard `"`.
     - Smart single quotes (`‘`, `’`, `‚`) -> `'`.
     - Normalize em-dash (`—`) and en-dash (`–`) spacing for heading and citation patterns.
   - **De-hyphenation**:
     - Join words split by line-break hyphens (`dis-\nciples` -> `disciples`).
   - **Heading Formatting**:
     - PDF text often lacks markdown `#` / `##` prefixes.
     - Ensure lines matching the 17 standard section titles (e.g. `1. Central Themes`, `4. Opening Prayer`, `5. Icebreaker: ...`, `6. Proclamation of the Readings`, `8. Deep Analysis (A-J)`, `11. Reflection Questions (1-12)`, `15. Closing Prayer`) are prefixed with `## ` if hashes are absent.
     - Ensure subsection titles (e.g. `A. Matthew 15:21`, `1. When has someone...`) are prefixed with `### ` if hashes are absent.

3. **Deterministic Parser Integration**:
   - Update `ParseMarkdownStudyOptions` in `src/server/studies/markdownParser.ts`:
     ```ts
     export interface ParseMarkdownStudyOptions {
       fileName?: string;
       sourceType?: StudySourceType;
     }
     ```
   - In `candidateDoc`, set `source.type` to `options.sourceType ?? 'markdown'`.
   - In `parsePdfStudy()`, feed normalized markdown text into `parseMarkdownStudy(normalizedText, { fileName, sourceType: 'pdf' })`.
   - Validate the resulting document with `validateStudyDocument()`.
   - Verify `candidateDoc.source.type === 'pdf'`, `source.fileName === options.fileName`, and `source.statusLabel === 'Analyzed'`.

4. **Endpoint Wiring (`src/server/app.ts`)**:
   - Register `express.raw({ type: 'application/pdf', limit: '10mb' })` before the `/api/studies/parse` handler.
   - In `POST /api/studies/parse`:
     - Early `Content-Length > 10MB` check returns HTTP 413 `{ "error": "File size exceeds 10MB limit" }`.
     - **Multipart Upload (`multipart/form-data`)**:
       - Inspect `req.file.originalname` and `req.file.mimetype`.
       - If `.pdf` or `application/pdf`: call `await parsePdfStudy(req.file.buffer, { fileName: req.file.originalname })`.
       - If `.md` / `.markdown` or `text/markdown`: call `parseMarkdownStudy(req.file.buffer.toString('utf-8'), { fileName: req.file.originalname })`.
       - If any other extension/MIME (e.g. `.docx`, `.txt`, `.png`): return HTTP 400 `{ "error": "Study validation failed", "errors": ["Unsupported file type: only .pdf and .md study files are supported."] }`.
     - **Raw Binary Body (`application/pdf`)**:
       - If `req.is('application/pdf')` or `Buffer.isBuffer(req.body)`:
         - Resolve `fileName` from `req.headers['x-file-name']` or default to `'uploaded-study.pdf'`.
         - Call `await parsePdfStudy(req.body, { fileName })`.
     - **Error Handling**:
       - On parse/validation failure: return HTTP 400 `{ "error": "Study validation failed", "errors": result.errors }`.
       - If zero selectable text is extracted: return HTTP 400 `{ "error": "Study validation failed", "errors": ["No selectable text could be extracted from this PDF. Please ensure the PDF is text-based rather than a scanned image."] }`.
       - On success: return HTTP 200 JSON `result.value`.

5. **PDF Fixtures (`tests/fixtures/`)**:
   - Add `pdf-lib` to `devDependencies` (`npm install -D pdf-lib`).
   - Create `scripts/generate-pdf-fixtures.ts` that compiles `tests/fixtures/great-is-your-faith.md` and `tests/fixtures/peace-be-still-mark-4.md` into valid text-based PDF files using `pdf-lib` with standard fonts (Helvetica).
   - Commit the generated `tests/fixtures/great-is-your-faith.pdf` and `tests/fixtures/peace-be-still-mark-4.pdf` to the repository so test suites run instantaneously without runtime fixture generation overhead.

## Expected File Changes

- `package.json` — modify; add `unpdf` to `dependencies` and `pdf-lib` to `devDependencies`.
- `src/server/studies/pdfParser.ts` — create; in-memory PDF extraction, text normalizer, ligature expansion, heading formatting, and `parsePdfStudy()`.
- `src/server/studies/markdownParser.ts` — modify; accept `sourceType?: StudySourceType` in `ParseMarkdownStudyOptions` and assign to `candidateDoc.source.type`.
- `src/server/app.ts` — modify; add `express.raw({ type: 'application/pdf', limit: '10mb' })`, multipart file extension / MIME type whitelist (.pdf, .md), raw `application/pdf` routing, and HTTP 413/400 handling.
- `scripts/generate-pdf-fixtures.ts` — create; reproducible script using `pdf-lib` to build text-based PDF fixtures from existing markdown studies.
- `tests/fixtures/great-is-your-faith.pdf` — create; canonical 17-section Catholic Bible study PDF fixture.
- `tests/fixtures/peace-be-still-mark-4.pdf` — create; second distinct weekly study PDF fixture (Mark 4:35–41).
- `tests/unit/pdf-parser.test.ts` — create; unit tests for PDF extraction, normalization, ligature expansion, page number stripping, scanned/textless PDF handling, and zero forbidden role words.
- `tests/integration/studies-parse.test.ts` — modify; add tests for multipart `.pdf` upload, raw binary `application/pdf`, unsupported file type rejection (.docx/.txt/.png), >10MB rejection, and zero forbidden role words.
- `tests/e2e/studies-parse.spec.ts` — modify; add Playwright E2E tests for `.pdf` multipart upload and raw binary `application/pdf` upload against single-port production server.
- `ARCHITECTURE.md` — modify; document `pdfParser.ts` and PDF upload support in server routing.

## Visual Design Impact

- UI involved: no
- Design source: not applicable (backend parser and API slice; outputs feed `leader-load-study-setup-screen`).
- Screens or states affected: none in this feature.
- New design artifact required: no.

## Durable Documentation Impact

- `ARCHITECTURE.md`: update — Add `src/server/studies/pdfParser.ts` and PDF ingestion support to module boundaries and route listing.
- `CONSTRAINTS.md`: not needed — Constraint 9 already mandates in-memory deterministic parsing, zero external AI, and <= 10MB limits.
- `AGENTS.md`: not needed — Workflow and repo operating rules do not change.
- Other docs: `PROGRESS.md` and `feature_list.json` updated with verification evidence upon implementation and independent validation.

## Implementation Plan

1. Install `unpdf` as production dependency and `pdf-lib` as dev dependency.
2. Create `scripts/generate-pdf-fixtures.ts` and generate `tests/fixtures/great-is-your-faith.pdf` and `tests/fixtures/peace-be-still-mark-4.pdf`.
3. Update `ParseMarkdownStudyOptions` in `src/server/studies/markdownParser.ts` to support `sourceType?: StudySourceType`.
4. Implement `src/server/studies/pdfParser.ts` with `unpdf` text extraction, page header/footer stripping, ligature expansion, unicode quote normalization, heading formatting, and `parsePdfStudy()`.
5. Add unit test suite `tests/unit/pdf-parser.test.ts` covering canonical PDF, second distinct PDF, normalization edge cases, scanned/corrupt PDFs, and terminology scan.
6. Wire raw `application/pdf` body parsing and multipart file type filtering into `src/server/app.ts`.
7. Update integration tests `tests/integration/studies-parse.test.ts` and Playwright E2E suite `tests/e2e/studies-parse.spec.ts`.
8. Update `ARCHITECTURE.md`, run `./init.sh`, run `npm run test:e2e`, and verify all gates pass.

## Implementation Tasks

- [ ] Install `unpdf` in `dependencies` and `pdf-lib` in `devDependencies` in `package.json`.
- [ ] Create `scripts/generate-pdf-fixtures.ts` to build valid text-based PDF fixtures from `great-is-your-faith.md` and `peace-be-still-mark-4.md`.
- [ ] Generate and commit `tests/fixtures/great-is-your-faith.pdf` and `tests/fixtures/peace-be-still-mark-4.pdf`.
- [ ] Update `src/server/studies/markdownParser.ts` to accept `sourceType?: StudySourceType` in options.
- [ ] Implement `src/server/studies/pdfParser.ts` with in-memory text extraction, ligature expansion, header/footer stripping, and `parsePdfStudy()`.
- [ ] Wire raw `application/pdf` parsing and multipart file type validation (.pdf, .md only) into `POST /api/studies/parse` in `src/server/app.ts`.
- [ ] Add unit test suite `tests/unit/pdf-parser.test.ts` testing canonical PDF, second study, ligature expansion, page numbers, scanned/empty PDF error, and zero forbidden role labels.
- [ ] Update integration test suite `tests/integration/studies-parse.test.ts` with multipart PDF upload, raw binary `application/pdf`, unsupported file type rejection (.docx/.txt/.png), >10MB rejection, and terminology checks.
- [ ] Update Playwright E2E suite `tests/e2e/studies-parse.spec.ts` with single-port PDF parsing tests.
- [ ] Update `ARCHITECTURE.md` to document the PDF parser module and endpoint support.

## Verification Plan

- Run `./init.sh` to verify TypeScript compile, Vitest unit/integration tests, and production build pass.
- Run dedicated port verification:
  `PORT=3101 API_PORT=3201 PLAYWRIGHT_PORT=3301 npm run test:e2e`
- Run negative test asserting an unsupported file (e.g. `.docx`, `.txt`) to `POST /api/studies/parse` returns HTTP 400 with an actionable message.
- Run negative test asserting a 10.5 MB PDF payload to `POST /api/studies/parse` returns HTTP 413.
- Run static scan verifying zero occurrences of forbidden legacy role labels in `src/server/studies/pdfParser.ts`, `tests/unit/pdf-parser.test.ts`, and `tests/integration/studies-parse.test.ts`.

## Evidence To Capture

- `./init.sh` exit 0 output verifying typecheck, Vitest suites, and build.
- `PLAYWRIGHT_PORT=3301 npm run test:e2e` exit 0 output.
- CLI smoke check with curl on `http://127.0.0.1:3101/api/studies/parse` with `.pdf` multipart, raw `application/pdf`, unsupported `.docx`, and oversized payload.
- Zero forbidden legacy role label grep verification output.

## Validator Checklist

- [ ] Implementation stays within this feature's scope (no React UI, no external AI APIs).
- [ ] Acceptance scenarios 1 through 8 pass.
- [ ] In-memory extraction only; no temporary files written to disk.
- [ ] Clean Node ESM compatibility with zero native OS dependencies.
- [ ] Ligatures (`ﬁ`, `ﬂ`, `ﬀ`), page numbers (`Page X of Y`, `- X -`), and running headers are cleanly normalized.
- [ ] Section 3 main reading contains ONLY Gospel Scripture text; supporting Mass readings are placed into leader notes.
- [ ] Second distinct weekly study PDF fixture ("Peace! Be Still" — Mark 4:35–41) parses deterministically into valid `StudyDocument`.
- [ ] Non-PDF/non-MD files (e.g. `.docx`, `.txt`, `.png`) return HTTP 400 with human-readable error messages.
- [ ] Payloads > 10MB are rejected with HTTP 413.
- [ ] Zero occurrences of legacy forbidden role labels in code, copy, or tests (uses `Study Leader` and `Participant` exclusively).
- [ ] `./init.sh` and `npm run test:e2e` pass with concrete evidence in `PROGRESS.md` and `feature_list.json`.

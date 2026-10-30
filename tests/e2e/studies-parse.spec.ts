import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { validateStudyDocument, type StudyDocument } from '../../src/shared/study';

test.describe('POST /api/studies/parse single-port E2E', () => {
  const fixturesDir = path.resolve(import.meta.dirname, '../fixtures');
  const greatIsYourFaithMarkdown = fs.readFileSync(
    path.join(fixturesDir, 'great-is-your-faith.md'),
    'utf-8',
  );
  const peaceBeStillMarkdown = fs.readFileSync(
    path.join(fixturesDir, 'peace-be-still-mark-4.md'),
    'utf-8',
  );
  const greatIsYourFaithPdf = fs.readFileSync(
    path.join(fixturesDir, 'great-is-your-faith.pdf'),
  );
  const peaceBeStillPdf = fs.readFileSync(
    path.join(fixturesDir, 'peace-be-still-mark-4.pdf'),
  );

  test('parses canonical Great Is Your Faith markdown via raw text and verifies 5 sections on unified port', async ({
    request,
  }) => {
    const parseRes = await request.post('/api/studies/parse', {
      headers: {
        'Content-Type': 'text/markdown',
        'X-Forwarded-Host': 'sanctuary-study.trycloudflare.com',
      },
      data: greatIsYourFaithMarkdown,
    });

    expect(parseRes.status()).toBe(200);
    expect(parseRes.headers()['content-type']).toContain('application/json');

    const rawText = await parseRes.text();
    expect(rawText).not.toMatch(/assistant/i);

    const doc = JSON.parse(rawText) as StudyDocument;
    const validation = validateStudyDocument(doc);
    expect(validation.valid).toBe(true);
    expect(doc.id).toBe('great-is-your-faith');
    expect(doc.title).toBe('Great Is Your Faith');
    expect(doc.gospelCitation).toBe('Matthew 15:21–28');
    expect(doc.sectionCount).toBe(5);
    expect(doc.gospelReading.verses).toHaveLength(8);
    expect(doc.deepAnalysis.reflectionQuestions).toHaveLength(12);
    expect(doc.deepAnalysis.defaultActiveQuestionIds).toEqual(['q-6', 'q-5', 'q-8']);
    expect(doc.detectionSummary.hasOpeningPrayer).toBe(true);
    expect(doc.detectionSummary.hasGospelReading).toBe(true);
    expect(doc.detectionSummary.hasClosingPrayer).toBe(true);
  });

  test('parses second distinct study "Peace! Be Still" (Mark 4:35–41) via multipart upload', async ({
    request,
  }) => {
    const parseRes = await request.post('/api/studies/parse', {
      multipart: {
        file: {
          name: 'peace-be-still-mark-4.md',
          mimeType: 'text/markdown',
          buffer: Buffer.from(peaceBeStillMarkdown, 'utf-8'),
        },
      },
    });

    expect(parseRes.status()).toBe(200);
    expect(parseRes.headers()['content-type']).toContain('application/json');

    const doc = (await parseRes.json()) as StudyDocument;
    const validation = validateStudyDocument(doc);
    expect(validation.valid).toBe(true);
    expect(doc.id).toBe('peace-be-still');
    expect(doc.title).toBe('Peace! Be Still');
    expect(doc.gospelCitation).toBe('Mark 4:35–41');
    expect(doc.icebreaker.title).toBe('Weathering the Storm');
    expect(doc.gospelReading.verses).toHaveLength(7);
    expect(doc.source.fileName).toBe('peace-be-still-mark-4.md');
  });

  test('rejects oversized payload (> 10MB) with HTTP 413 and JSON error', async ({
    request,
  }) => {
    const bigPayload = 'A'.repeat(10.5 * 1024 * 1024);
    const parseRes = await request.post('/api/studies/parse', {
      headers: {
        'Content-Type': 'text/plain',
      },
      data: bigPayload,
    });

    expect(parseRes.status()).toBe(413);
    const body = (await parseRes.json()) as { error: string };
    expect(body.error).toBe('File size exceeds 10MB limit');
  });

  test('returns HTTP 400 with actionable validation error list for malformed markdown', async ({
    request,
  }) => {
    const parseRes = await request.post('/api/studies/parse', {
      data: {
        content: '# Just A Title Without Headings\nSome body text.',
      },
    });

    expect(parseRes.status()).toBe(400);
    const body = (await parseRes.json()) as { error: string; errors: string[] };
    expect(body.error).toBe('Study validation failed');
    expect(Array.isArray(body.errors)).toBe(true);
    expect(body.errors.length).toBeGreaterThanOrEqual(1);
  });

  test('parses canonical Great Is Your Faith .pdf via multipart upload on single-port server', async ({
    request,
  }) => {
    const parseRes = await request.post('/api/studies/parse', {
      multipart: {
        file: {
          name: 'great-is-your-faith.pdf',
          mimeType: 'application/pdf',
          buffer: greatIsYourFaithPdf,
        },
      },
    });

    expect(parseRes.status()).toBe(200);
    expect(parseRes.headers()['content-type']).toContain('application/json');

    const rawText = await parseRes.text();
    expect(rawText).not.toMatch(/assistant/i);

    const doc = JSON.parse(rawText) as StudyDocument;
    const validation = validateStudyDocument(doc);
    expect(validation.valid).toBe(true);
    expect(doc.source.type).toBe('pdf');
    expect(doc.source.fileName).toBe('great-is-your-faith.pdf');
    expect(doc.id).toBe('great-is-your-faith');
    expect(doc.title).toBe('Great Is Your Faith');
    expect(doc.gospelCitation).toBe('Matthew 15:21–28');
    expect(doc.sectionCount).toBe(5);
    expect(doc.detectionSummary.hasOpeningPrayer).toBe(true);
    expect(doc.detectionSummary.hasGospelReading).toBe(true);
    expect(doc.detectionSummary.hasClosingPrayer).toBe(true);
  });

  test('parses second distinct study "Peace! Be Still" .pdf via raw binary application/pdf body', async ({
    request,
  }) => {
    const parseRes = await request.post('/api/studies/parse', {
      headers: {
        'Content-Type': 'application/pdf',
        'X-File-Name': 'peace-be-still-mark-4.pdf',
      },
      data: peaceBeStillPdf,
    });

    expect(parseRes.status()).toBe(200);
    expect(parseRes.headers()['content-type']).toContain('application/json');

    const doc = (await parseRes.json()) as StudyDocument;
    const validation = validateStudyDocument(doc);
    expect(validation.valid).toBe(true);
    expect(doc.source.type).toBe('pdf');
    expect(doc.source.fileName).toBe('peace-be-still-mark-4.pdf');
    expect(doc.id).toBe('peace-be-still');
    expect(doc.title).toBe('Peace! Be Still');
    expect(doc.gospelCitation).toBe('Mark 4:35–41');
    expect(doc.deepAnalysis.reflectionQuestions).toHaveLength(12);
  });

  test('rejects unsupported file type (.docx) via multipart upload with HTTP 400', async ({
    request,
  }) => {
    const parseRes = await request.post('/api/studies/parse', {
      multipart: {
        file: {
          name: 'study.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          buffer: Buffer.from('simulated docx binary bytes'),
        },
      },
    });

    expect(parseRes.status()).toBe(400);
    const body = (await parseRes.json()) as { error: string; errors: string[] };
    expect(body.error).toBe('Study validation failed');
    expect(body.errors).toContain(
      'Unsupported file type: only .pdf and .md study files are supported.',
    );
  });
});

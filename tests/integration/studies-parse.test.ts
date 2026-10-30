import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAppServer, type AppServer } from '../../src/server/app';
import { validateStudyDocument, type StudyDocument } from '../../src/shared/study';

describe('POST /api/studies/parse integration', () => {
  let server: AppServer;
  let baseUrl: string;
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

  beforeEach(async () => {
    server = createAppServer({ staticDir: false });
    const bound = await server.start(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${bound.port}`;
  });

  afterEach(async () => {
    await server.close();
  });

  it('parses raw text/markdown body to valid StudyDocument', async () => {
    const response = await fetch(`${baseUrl}/api/studies/parse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/markdown',
      },
      body: greatIsYourFaithMarkdown,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');

    const rawJson = await response.text();
    expect(rawJson).not.toMatch(/assistant/i);

    const doc = JSON.parse(rawJson) as StudyDocument;
    const validation = validateStudyDocument(doc);
    expect(validation.valid).toBe(true);
    expect(doc.id).toBe('great-is-your-faith');
    expect(doc.title).toBe('Great Is Your Faith');
    expect(doc.gospelCitation).toBe('Matthew 15:21–28');
    expect(doc.sectionCount).toBe(5);
    expect(doc.gospelReading.verses).toHaveLength(8);
  });

  it('parses application/json body containing content and fileName', async () => {
    const response = await fetch(`${baseUrl}/api/studies/parse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: peaceBeStillMarkdown,
        fileName: 'peace-be-still.md',
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');

    const doc = (await response.json()) as StudyDocument;
    const validation = validateStudyDocument(doc);
    expect(validation.valid).toBe(true);
    expect(doc.id).toBe('peace-be-still');
    expect(doc.title).toBe('Peace! Be Still');
    expect(doc.gospelCitation).toBe('Mark 4:35–41');
    expect(doc.source.fileName).toBe('peace-be-still.md');
    expect(doc.gospelReading.verses).toHaveLength(7);
  });

  it('parses multipart/form-data upload using form field "file"', async () => {
    const formData = new FormData();
    const blob = new Blob([greatIsYourFaithMarkdown], { type: 'text/markdown' });
    formData.append('file', blob, 'great-is-your-faith.md');

    const response = await fetch(`${baseUrl}/api/studies/parse`, {
      method: 'POST',
      body: formData,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');

    const doc = (await response.json()) as StudyDocument;
    const validation = validateStudyDocument(doc);
    expect(validation.valid).toBe(true);
    expect(doc.source.fileName).toBe('great-is-your-faith.md');
    expect(doc.detectionSummary.hasOpeningPrayer).toBe(true);
    expect(doc.detectionSummary.hasGospelReading).toBe(true);
    expect(doc.detectionSummary.hasClosingPrayer).toBe(true);
  });

  it('rejects oversized payload (> 10MB) via early Content-Length header with HTTP 413', async () => {
    const url = new URL(`${baseUrl}/api/studies/parse`);
    const statusAndBody = await new Promise<{ status: number; body: { error: string } }>(
      (resolve, reject) => {
        const req = http.request(
          {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: 'POST',
            headers: {
              'Content-Type': 'text/markdown',
              'Content-Length': String(11 * 1024 * 1024),
              Connection: 'close',
            },
          },
          (res) => {
            let data = '';
            res.on('data', (chunk) => {
              data += chunk;
            });
            res.on('end', () => {
              try {
                resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) });
              } catch (e) {
                reject(e);
              }
            });
          },
        );
        req.on('error', (err) => {
          if ((err as { code?: string }).code === 'ECONNRESET') {
            return;
          }
          reject(err);
        });
        req.end();
      },
    );

    expect(statusAndBody.status).toBe(413);
    expect(statusAndBody.body.error).toBe('File size exceeds 10MB limit');
  });

  it('rejects oversized multipart upload (> 10MB) with HTTP 413', async () => {
    const formData = new FormData();
    // 10.5 MB buffer
    const bigBuffer = new Uint8Array(10.5 * 1024 * 1024);
    const blob = new Blob([bigBuffer], { type: 'text/markdown' });
    formData.append('file', blob, 'oversized.md');

    const response = await fetch(`${baseUrl}/api/studies/parse`, {
      method: 'POST',
      body: formData,
    });

    expect(response.status).toBe(413);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('File size exceeds 10MB limit');
  });

  it('rejects oversized raw text payload (> 10MB) with HTTP 413', async () => {
    // 10.5 MB string
    const bigText = 'a'.repeat(10.5 * 1024 * 1024);

    const response = await fetch(`${baseUrl}/api/studies/parse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: bigText,
    });

    expect(response.status).toBe(413);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('File size exceeds 10MB limit');
  });

  it('returns HTTP 400 with actionable errors for empty or malformed markdown', async () => {
    const response = await fetch(`${baseUrl}/api/studies/parse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/markdown',
      },
      body: '   ',
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string; errors: string[] };
    expect(body.error).toBe('Study validation failed');
    expect(body.errors).toContain('Study document markdown content is empty.');
  });

  it('returns HTTP 400 detailing missing sections when mandatory sections are omitted', async () => {
    const incompleteMarkdown = `
# Incomplete Title

## 1. Central Themes
- Theme A
`;

    const response = await fetch(`${baseUrl}/api/studies/parse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/markdown',
      },
      body: incompleteMarkdown,
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string; errors: string[] };
    expect(body.error).toBe('Study validation failed');
    expect(body.errors).toContain('Missing Section 4 (Opening Prayer).');
    expect(body.errors).toContain('Missing Section 5 (Icebreaker).');
    expect(body.errors).toContain('Missing Section 6 (Proclamation of the Readings).');
    expect(body.errors).toContain('Missing Section 15 (Closing Prayer).');
  });

  it('parses multipart/form-data upload of canonical .pdf fixture', async () => {
    const formData = new FormData();
    const blob = new Blob([greatIsYourFaithPdf], { type: 'application/pdf' });
    formData.append('file', blob, 'great-is-your-faith.pdf');

    const response = await fetch(`${baseUrl}/api/studies/parse`, {
      method: 'POST',
      body: formData,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');

    const doc = (await response.json()) as StudyDocument;
    const validation = validateStudyDocument(doc);
    expect(validation.valid).toBe(true);
    expect(doc.source.type).toBe('pdf');
    expect(doc.source.fileName).toBe('great-is-your-faith.pdf');
    expect(doc.source.statusLabel).toBe('Analyzed');
    expect(doc.sectionCount).toBe(5);
    expect(doc.detectionSummary.sectionsDetectedLabel).toBe('5 sections detected');
    expect(doc.detectionSummary.hasOpeningPrayer).toBe(true);
    expect(doc.detectionSummary.hasGospelReading).toBe(true);
    expect(doc.detectionSummary.hasClosingPrayer).toBe(true);
    expect(doc.gospelReading.verses).toHaveLength(8);
    expect(doc.gospelReading.fullText).not.toContain('Isaiah');
    expect(doc.gospelReading.leaderLiturgicalContextNote).toContain('Isaiah 56:1, 6–7');
  });

  it('parses raw binary application/pdf body with X-File-Name header', async () => {
    const response = await fetch(`${baseUrl}/api/studies/parse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/pdf',
        'X-File-Name': 'great-is-your-faith.pdf',
      },
      body: greatIsYourFaithPdf,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');

    const doc = (await response.json()) as StudyDocument;
    const validation = validateStudyDocument(doc);
    expect(validation.valid).toBe(true);
    expect(doc.source.type).toBe('pdf');
    expect(doc.source.fileName).toBe('great-is-your-faith.pdf');
    expect(doc.title).toBe('Great Is Your Faith');
    expect(doc.gospelCitation).toBe('Matthew 15:21–28');
  });

  it('parses second distinct weekly study "Peace! Be Still" .pdf fixture', async () => {
    const formData = new FormData();
    const blob = new Blob([peaceBeStillPdf], { type: 'application/pdf' });
    formData.append('file', blob, 'peace-be-still-mark-4.pdf');

    const response = await fetch(`${baseUrl}/api/studies/parse`, {
      method: 'POST',
      body: formData,
    });

    expect(response.status).toBe(200);
    const doc = (await response.json()) as StudyDocument;
    const validation = validateStudyDocument(doc);
    expect(validation.valid).toBe(true);
    expect(doc.source.type).toBe('pdf');
    expect(doc.source.fileName).toBe('peace-be-still-mark-4.pdf');
    expect(doc.title).toBe('Peace! Be Still');
    expect(doc.gospelCitation).toBe('Mark 4:35–41');
    expect(doc.deepAnalysis.reflectionQuestions).toHaveLength(12);
  });

  it('rejects unsupported file types (.docx, .txt, .png) with HTTP 400', async () => {
    const unsupportedCases = [
      { name: 'study.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      { name: 'study.txt', type: 'text/plain' },
      { name: 'handout.png', type: 'image/png' },
    ];

    for (const testCase of unsupportedCases) {
      const formData = new FormData();
      const blob = new Blob(['sample content'], { type: testCase.type });
      formData.append('file', blob, testCase.name);

      const response = await fetch(`${baseUrl}/api/studies/parse`, {
        method: 'POST',
        body: formData,
      });

      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: string; errors: string[] };
      expect(body.error).toBe('Study validation failed');
      expect(body.errors).toContain(
        'Unsupported file type: only .pdf and .md study files are supported.',
      );
    }
  });

  it('rejects corrupt or textless PDF uploads with HTTP 400 and actionable error', async () => {
    const response = await fetch(`${baseUrl}/api/studies/parse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/pdf',
      },
      body: Buffer.from('not a valid pdf'),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string; errors: string[] };
    expect(body.error).toBe('Study validation failed');
    expect(body.errors[0]).toMatch(/valid|selectable/i);
  });

  it('rejects oversized raw application/pdf payload (> 10MB) with HTTP 413', async () => {
    const bigPdfBuffer = new Uint8Array(10.5 * 1024 * 1024);

    const response = await fetch(`${baseUrl}/api/studies/parse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/pdf',
      },
      body: bigPdfBuffer,
    });

    expect(response.status).toBe(413);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('File size exceeds 10MB limit');
  });

  it('enforces zero occurrences of "Assistant" in responses and error messages', async () => {
    const validRes = await fetch(`${baseUrl}/api/studies/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/markdown' },
      body: greatIsYourFaithMarkdown,
    });
    const validText = await validRes.text();
    expect(validText).not.toMatch(/assistant/i);

    const pdfRes = await fetch(`${baseUrl}/api/studies/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/pdf' },
      body: greatIsYourFaithPdf,
    });
    const pdfText = await pdfRes.text();
    expect(pdfText).not.toMatch(/assistant/i);

    const errRes = await fetch(`${baseUrl}/api/studies/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/markdown' },
      body: '## Incomplete',
    });
    const errText = await errRes.text();
    expect(errText).not.toMatch(/assistant/i);
  });
});

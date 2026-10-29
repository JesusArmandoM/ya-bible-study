import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAppServer, type AppServer } from '../../src/server/app';
import {
  getStudySections,
  validateStudyDocument,
  type StudyDocument,
} from '../../src/shared/study';

describe('GET /api/studies/default single-port integration', () => {
  let server: AppServer;
  let baseUrl: string;

  beforeEach(async () => {
    server = createAppServer({ staticDir: false });
    const bound = await server.start(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${bound.port}`;
  });

  afterEach(async () => {
    await server.close();
  });

  it('returns HTTP 200 with the validated 5-section "Great Is Your Faith" StudyDocument', async () => {
    const response = await fetch(`${baseUrl}/api/studies/default`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');

    const rawText = await response.text();
    expect(rawText).not.toMatch(/assistant/i);

    const payload = JSON.parse(rawText) as unknown;
    const validation = validateStudyDocument(payload);
    expect(validation.valid).toBe(true);
    if (!validation.valid) {
      throw new Error(validation.errors.join('\n'));
    }

    const doc: StudyDocument = validation.value;
    expect(doc.id).toBe('great-is-your-faith');
    expect(doc.title).toBe('Great Is Your Faith');
    expect(doc.gospelCitation).toBe('Matthew 15:21–28');
    expect(doc.sectionCount).toBe(5);
    expect(getStudySections(doc)).toHaveLength(5);
    expect(doc.gospelReading.verses).toHaveLength(8);
    expect(doc.deepAnalysis.reflectionQuestions).toHaveLength(12);
    expect(doc.deepAnalysis.verseCommentary).toHaveLength(10);
    expect(doc.closing.weeklyChallenges).toHaveLength(4);
  });

  it('serves GET /api/studies/default across external HTTPS tunnel Host headers and keeps server payload immutable', async () => {
    const tunnelRes = await fetch(`${baseUrl}/api/studies/default`, {
      headers: {
        Host: 'parish-study.trycloudflare.com',
        'X-Forwarded-Proto': 'https',
      },
    });
    expect(tunnelRes.status).toBe(200);
    const firstBody = (await tunnelRes.json()) as StudyDocument;
    firstBody.title = 'Client-Mutated Copy';
    firstBody.deepAnalysis.reflectionQuestions.length = 0;

    const repeatRes = await fetch(`${baseUrl}/api/studies/default`);
    expect(repeatRes.status).toBe(200);
    const repeatBody = (await repeatRes.json()) as StudyDocument;
    expect(repeatBody.title).toBe('Great Is Your Faith');
    expect(repeatBody.deepAnalysis.reflectionQuestions).toHaveLength(12);
  });

  it('returns HTTP 404 JSON for unknown /api/studies/* subroutes', async () => {
    const unknownRes = await fetch(`${baseUrl}/api/studies/unknown`);
    expect(unknownRes.status).toBe(404);
    expect(unknownRes.headers.get('content-type')).toContain(
      'application/json',
    );
    expect(await unknownRes.json()).toEqual({ error: 'Not found' });
  });
});

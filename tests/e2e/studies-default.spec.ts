import { expect, test } from '@playwright/test';
import {
  getStudySections,
  validateStudyDocument,
} from '../../src/shared/study';

test.describe('Unified single-port default study API', () => {
  test('serves GET /api/studies/default with complete 5-section Matthew 15:21-28 payload alongside "/" shell', async ({
    page,
    request,
  }) => {
    const studyResponse = await request.get('/api/studies/default', {
      headers: { 'X-Forwarded-Host': 'sanctuary-room.trycloudflare.com' },
    });
    expect(studyResponse.status()).toBe(200);
    expect(studyResponse.headers()['content-type']).toContain(
      'application/json',
    );

    const rawBody = await studyResponse.text();
    expect(rawBody).not.toMatch(/assistant/i);

    const parsed = JSON.parse(rawBody) as unknown;
    const validation = validateStudyDocument(parsed);
    expect(validation.valid).toBe(true);
    if (!validation.valid) {
      throw new Error(validation.errors.join('\n'));
    }

    const doc = validation.value;
    expect(doc.id).toBe('great-is-your-faith');
    expect(doc.title).toBe('Great Is Your Faith');
    expect(doc.gospelCitation).toBe('Matthew 15:21–28');
    expect(getStudySections(doc)).toHaveLength(5);
    expect(doc.gospelReading.verses).toHaveLength(8);
    expect(doc.deepAnalysis.defaultActiveQuestionIds).toEqual([
      'q-6',
      'q-5',
      'q-8',
    ]);
    expect(doc.deepAnalysis.reflectionQuestions).toHaveLength(12);
    expect(doc.closing.nextWeekAnnouncement.displayLabel).toBe(
      '"Faith that Endures" — James 1:2–4',
    );

    const unknownResponse = await request.get('/api/studies/unknown');
    expect(unknownResponse.status()).toBe(404);
    expect(await unknownResponse.json()).toEqual({ error: 'Not found' });

    await page.goto('/');
    await expect(page).toHaveTitle('YA Bible Study');
    await expect(page.getByTestId('sanctuary-health-pill')).toHaveAttribute(
      'data-status',
      'ok',
    );
  });
});

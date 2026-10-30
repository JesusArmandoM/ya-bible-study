import { expect, test, type Page } from '@playwright/test';

/**
 * Closes the leader's live session over /ws so later suites (e.g.
 * ws-room-lifecycle.spec.ts) still observe activeSessionCount 0.
 */
async function closeLiveSession(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const raw = sessionStorage.getItem('ya-bible-study.session-credentials');
    if (!raw) return;
    const creds = JSON.parse(raw) as {
      sessionCode?: string;
      leaderToken?: string;
    };
    if (!creds.sessionCode || !creds.leaderToken) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    await new Promise<void>((resolve) =>
      ws.addEventListener('open', () => resolve(), { once: true }),
    );
    ws.send(
      JSON.stringify({
        type: 'close_session',
        sessionCode: creds.sessionCode,
        leaderToken: creds.leaderToken,
      }),
    );
    await new Promise<void>((resolve) =>
      ws.addEventListener('message', () => resolve(), { once: true }),
    );
    ws.close();
  });
}

async function createLeaderSetupSession(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByTestId('welcome-role-leader').click();
  await expect(page.getByTestId('leader-access-sheet')).toBeVisible();
  await page.getByLabel(/Leader Name/i).fill('Claire');
  await page.getByRole('button', { name: 'Create Room' }).click();
  await expect(page.getByTestId('active-session-banner')).toBeVisible();
  await expect(page.getByTestId('study-setup-screen')).toBeVisible();
}

test.describe('Leader Load Your Study Setup Screen', () => {
  test('Scenario 1: default study previews with 5-section structure (Gospel-only Section 3)', async ({
    page,
  }) => {
    try {
      await createLeaderSetupSession(page);

      // Default pre-analyzed study preview
      const previewCard = page.getByTestId('study-preview-card');
      await expect(previewCard).toBeVisible();
      await expect(previewCard).toContainText('Great Is Your Faith.pdf');
      await expect(page.getByTestId('study-analyzed-pill')).toContainText(
        'Analyzed',
      );
      await expect(previewCard).toContainText('5 sections detected');
      await expect(page.getByTestId('study-detection-summary')).toContainText(
        '5 sections detected',
      );

      // 5-row structure list (from getStudySections)
      const structureList = page.getByTestId('study-structure-list');
      for (const sectionName of [
        'Opening Prayer',
        'Icebreaker',
        'Gospel Reading',
        'Deep Analysis & Discussion',
        'Closing Prayer',
      ]) {
        await expect(structureList).toContainText(sectionName);
      }
      await expect(
        page.locator('[data-testid^="study-structure-row-"]'),
      ).toHaveCount(5);

      // Section 3 row shows only the Gospel citation
      await expect(page.getByTestId('study-structure-row-3')).toContainText(
        'Matthew 15:21–28',
      );

      // No Old Testament / Psalm / Epistle content anywhere in the preview
      const previewText = await page.getByTestId('study-preview').innerText();
      for (const forbidden of [
        'Isaiah',
        'Psalm',
        'Romans',
        'First Reading',
        'Second Reading',
        'Responsorial Psalm',
      ]) {
        expect(previewText).not.toContain(forbidden);
      }

      // Continue enabled once the study is analyzed
      await expect(page.getByTestId('study-setup-continue')).toBeEnabled();

      // Persistent single Sacred3DScene canvas
      const canvasCount = await page.evaluate(
        () => document.querySelectorAll('canvas').length,
      );
      expect(canvasCount).toBeLessThanOrEqual(1);

      // Zero Assistant occurrences
      const bodyText = await page.locator('body').innerText();
      expect(bodyText).not.toContain('Assistant');

      // No horizontal overflow on 390x844
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);

      // >= 16px control font-size and >= 44px tap targets
      const metrics = await page.evaluate(() => {
        const input = document.querySelector(
          '[data-testid="study-file-input"]',
        );
        const cta = document.querySelector(
          '[data-testid="study-setup-continue"]',
        );
        const dropzone = document.querySelector(
          '[data-testid="study-upload-dropzone"]',
        );
        return {
          inputFontSize: input
            ? parseFloat(window.getComputedStyle(input).fontSize)
            : 0,
          ctaMinHeight: cta
            ? parseFloat(window.getComputedStyle(cta).minHeight)
            : 0,
          dropzoneMinHeight: dropzone
            ? parseFloat(window.getComputedStyle(dropzone).minHeight)
            : 0,
        };
      });
      expect(metrics.inputFontSize).toBeGreaterThanOrEqual(16);
      expect(metrics.ctaMinHeight).toBeGreaterThanOrEqual(44);
      expect(metrics.dropzoneMinHeight).toBeGreaterThanOrEqual(44);
    } finally {
      await closeLiveSession(page);
    }
  });

  test('Scenario 2: custom .md upload updates the preview live', async ({
    page,
  }) => {
    try {
      await createLeaderSetupSession(page);
      await expect(page.getByTestId('study-preview-card')).toContainText(
        'Great Is Your Faith.pdf',
      );

      await page
        .getByTestId('study-file-input')
        .setInputFiles('tests/fixtures/peace-be-still-mark-4.md');

      const previewCard = page.getByTestId('study-preview-card');
      await expect(previewCard).toContainText('Peace! Be Still');
      await expect(page.getByTestId('study-analyzed-pill')).toContainText(
        'Analyzed',
      );
      await expect(previewCard).toContainText('5 sections detected');
      await expect(page.getByTestId('study-structure-row-3')).toContainText(
        'Mark 4:35–41',
      );
      await expect(page.getByTestId('study-setup-continue')).toBeEnabled();
    } finally {
      await closeLiveSession(page);
    }
  });

  test('Scenario 3: invalid upload keeps the previous preview with actionable error', async ({
    page,
  }) => {
    try {
      await createLeaderSetupSession(page);
      await expect(page.getByTestId('study-preview-card')).toContainText(
        'Great Is Your Faith.pdf',
      );

      await page
        .getByTestId('study-file-input')
        .setInputFiles('tests/fixtures/malformed-study.md');

      const alert = page.getByTestId('study-setup-alert');
      await expect(alert).toBeVisible();
      await expect(alert).toContainText(/Missing Section/);

      // Previous valid preview and Continue remain intact
      await expect(page.getByTestId('study-preview-card')).toContainText(
        'Great Is Your Faith.pdf',
      );
      await expect(page.getByTestId('study-setup-continue')).toBeEnabled();
    } finally {
      await closeLiveSession(page);
    }
  });

  test('Scenario 5: Continue transitions the session to the Title Lobby placeholder', async ({
    page,
  }) => {
    try {
      await createLeaderSetupSession(page);
      await expect(page.getByTestId('study-preview-card')).toContainText(
        'Great Is Your Faith.pdf',
      );

      await page.getByTestId('study-setup-continue').click();

      const placeholder = page.getByTestId('title-lobby-placeholder');
      await expect(placeholder).toBeVisible();
      await expect(placeholder).toContainText('Great Is Your Faith');
      await expect(placeholder).toContainText('Matthew 15:21–28');
      await expect(placeholder).toContainText('STEP 2 OF 2 · TITLE LOBBY');

      // Banner session view and single persistent canvas survive the transition
      await expect(page.getByTestId('active-session-banner')).toBeVisible();
      const canvasCount = await page.evaluate(
        () => document.querySelectorAll('canvas').length,
      );
      expect(canvasCount).toBeLessThanOrEqual(1);
    } finally {
      await closeLiveSession(page);
    }
  });
});

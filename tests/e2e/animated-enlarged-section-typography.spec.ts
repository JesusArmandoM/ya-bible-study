import { expect as baseExpect, test, type Page } from '@playwright/test';

const expect = baseExpect.configure({ timeout: 15_000 });

async function closeLiveSession(page: Page): Promise<void> {
  try {
    await Promise.race([
      page.evaluate(async () => {
        try {
          const raw = sessionStorage.getItem('ya-bible-study.session-credentials');
          if (!raw) return;
          const creds = JSON.parse(raw) as {
            sessionCode?: string;
            leaderToken?: string;
          };
          if (!creds.sessionCode || !creds.leaderToken) return;
          const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
          const bounded = (work: Promise<void>): Promise<void> =>
            Promise.race([
              work,
              new Promise<void>((resolve) => setTimeout(resolve, 2000)),
            ]);
          await bounded(
            new Promise<void>((resolve) =>
              ws.addEventListener('open', () => resolve(), { once: true }),
            ),
          );
          ws.send(
            JSON.stringify({
              type: 'close_session',
              sessionCode: creds.sessionCode,
              leaderToken: creds.leaderToken,
            }),
          );
          await bounded(
            new Promise<void>((resolve) =>
              ws.addEventListener('message', () => resolve(), { once: true }),
            ),
          );
          ws.close();
        } catch {
          // Cleanup must never throw.
        }
      }),
      new Promise<void>((resolve) => setTimeout(resolve, 5000)),
    ]);
  } catch {
    // Cleanup must never fail.
  }
}

async function createLeaderInLobby(page: Page): Promise<string> {
  await page.goto('/');
  await page.getByTestId('welcome-role-leader').click();
  await expect(page.getByTestId('leader-access-sheet')).toBeVisible();
  await page.getByLabel(/Leader Name/i).fill('Claire');
  await page.getByRole('button', { name: 'Create Room' }).click();
  await expect(page.getByTestId('study-setup-screen')).toBeVisible();

  const sessionCode = (
    await page.getByTestId('active-session-code').innerText()
  ).trim();
  expect(sessionCode).toMatch(/^[A-Z0-9]{6}$/);

  await page.getByTestId('study-setup-continue').click();
  await expect(page.getByTestId('title-lobby')).toBeVisible();
  return sessionCode;
}

async function joinAsParticipant(
  page: Page,
  sessionCode: string,
  displayName: string,
): Promise<void> {
  await page.goto(`/join/${sessionCode}`);
  await expect(page.getByTestId('participant-join-sheet')).toBeVisible();
  await page.getByLabel(/Your Name/i).fill(displayName);
  await page.getByRole('button', { name: 'Join Study' }).click();
  await expect(page.getByTestId('active-session-banner')).toBeVisible();
}

test.describe('Animated Enlarged Section Typography (E2E)', () => {
  test.describe.configure({ timeout: 75_000 });

  test('Mobile: verifies enlarged typography sizes and animated text attributes across sections', async ({
    browser,
  }) => {
    const leaderContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const participantContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });

    const leaderPage = await leaderContext.newPage();
    const participantPage = await participantContext.newPage();

    let sessionCode = '';

    try {
      sessionCode = await createLeaderInLobby(leaderPage);
      await joinAsParticipant(participantPage, sessionCode, 'Maria');

      // Start Study -> Section 1 Opening Prayer
      await leaderPage.getByTestId('lobby-start-study').click();

      // Wait for 3D overlay dismiss
      await expect(leaderPage.getByTestId('section-entry-overlay')).not.toBeVisible({ timeout: 12_000 });
      await expect(leaderPage.getByTestId('section-one-handoff')).toBeVisible();
      await expect(participantPage.getByTestId('section-one-handoff')).toBeVisible();

      // ─── Section 1: Opening Prayer Typography Verification ──────────
      // Check scripture text computed font-size >= 21px
      const prayerTextLocator = leaderPage.getByTestId('opening-prayer-text');
      await expect(prayerTextLocator).toBeVisible();
      const prayerFontSize = await prayerTextLocator.evaluate((el) =>
        parseFloat(window.getComputedStyle(el).fontSize),
      );
      expect(prayerFontSize).toBeGreaterThanOrEqual(21);
      await expect(prayerTextLocator).toHaveAttribute('data-animated-text', 'true');

      // Check section heading computed font-size >= 24px
      const headingLocator = leaderPage.getByTestId('section-one-title');
      const headingFontSize = await headingLocator.evaluate((el) =>
        parseFloat(window.getComputedStyle(el).fontSize),
      );
      expect(headingFontSize).toBeGreaterThanOrEqual(24);
      await expect(headingLocator).toHaveAttribute('data-animated-text', 'true');

      // Check body copy computed font-size >= 18px
      const copyLocator = leaderPage.getByTestId('section-one-copy');
      const copyFontSize = await copyLocator.evaluate((el) =>
        parseFloat(window.getComputedStyle(el).fontSize),
      );
      expect(copyFontSize).toBeGreaterThanOrEqual(18);
      await expect(copyLocator).toHaveAttribute('data-animated-text', 'true');

      // Participant raises hand (First-Hand-Wins) and completes turn
      await participantPage.getByTestId('hand-raise-orb').click();
      await expect(participantPage.getByTestId('prayer-chosen-view')).toBeVisible();

      // Chosen view title >= 24px
      const chosenTitle = participantPage.getByTestId('prayer-chosen-title');
      const chosenTitleSize = await chosenTitle.evaluate((el) =>
        parseFloat(window.getComputedStyle(el).fontSize),
      );
      expect(chosenTitleSize).toBeGreaterThanOrEqual(24);
      await expect(chosenTitle).toHaveAttribute('data-animated-text', 'true');

      // Complete turn
      await participantPage.getByTestId('prayer-done-button').click();
      await expect(participantPage.getByTestId('prayer-done-completed')).toBeVisible();

      // Advance to Section 2 Icebreaker
      await expect(leaderPage.getByTestId('prayer-advance-cta')).toBeVisible();
      await leaderPage.getByTestId('prayer-advance-cta').click();
      await expect(leaderPage.getByTestId('section-entry-overlay')).not.toBeVisible({ timeout: 12_000 });
      await expect(leaderPage.getByTestId('icebreaker-screen')).toBeVisible();
      await expect(participantPage.getByTestId('icebreaker-screen')).toBeVisible();

      // ─── Section 2: Icebreaker Typography Verification ──────────────
      const icebreakerTitle = leaderPage.getByTestId('icebreaker-title');
      const icebreakerTitleSize = await icebreakerTitle.evaluate((el) =>
        parseFloat(window.getComputedStyle(el).fontSize),
      );
      expect(icebreakerTitleSize).toBeGreaterThanOrEqual(24);
      await expect(icebreakerTitle).toHaveAttribute('data-animated-text', 'true');

      const icebreakerPrompt = leaderPage.getByTestId('icebreaker-prompt-question');
      const icebreakerPromptSize = await icebreakerPrompt.evaluate((el) =>
        parseFloat(window.getComputedStyle(el).fontSize),
      );
      expect(icebreakerPromptSize).toBeGreaterThanOrEqual(18);
      await expect(icebreakerPrompt).toHaveAttribute('data-animated-text', 'true');

      // Participant volunteers and completes turn
      await participantPage.getByTestId('hand-raise-orb').click();
      await expect(participantPage.getByTestId('icebreaker-chosen-view')).toBeVisible();
      await participantPage.getByTestId('icebreaker-done-button').click();
      await expect(participantPage.getByTestId('icebreaker-done-completed')).toBeVisible();

      // Advance to Section 3 Gospel Reading
      await leaderPage.getByTestId('icebreaker-advance-cta').click();
      await expect(leaderPage.getByTestId('section-entry-overlay')).not.toBeVisible({ timeout: 12_000 });
      await expect(leaderPage.getByTestId('gospel-reading-screen')).toBeVisible();
      await expect(participantPage.getByTestId('gospel-reading-screen')).toBeVisible();

      // ─── Section 3: Gospel Reading Typography Verification ──────────
      const citationLocator = leaderPage.getByTestId('scripture-card-citation');
      const citationFontSize = await citationLocator.evaluate((el) =>
        parseFloat(window.getComputedStyle(el).fontSize),
      );
      expect(citationFontSize).toBeGreaterThanOrEqual(24);
      await expect(citationLocator).toHaveAttribute('data-animated-text', 'true');

      // Scripture verse >= 21px
      const verse21 = leaderPage.getByTestId('scripture-verse-21');
      const verse21FontSize = await verse21.evaluate((el) =>
        parseFloat(window.getComputedStyle(el).fontSize),
      );
      expect(verse21FontSize).toBeGreaterThanOrEqual(21);
      await expect(verse21).toHaveAttribute('data-animated-text', 'true');

      // Complete Gospel Reading turn
      await participantPage.getByTestId('read-aloud-orb').click();
      await expect(participantPage.getByTestId('reading-chosen-view')).toBeVisible();
      await participantPage.getByTestId('reading-done-button').click();
      await expect(participantPage.getByTestId('reading-done-completed')).toBeVisible();

      // Advance to Section 4 Deep Analysis
      await leaderPage.getByTestId('reading-advance-cta').click();
      await expect(leaderPage.getByTestId('section-entry-overlay')).not.toBeVisible({ timeout: 12_000 });
      await expect(leaderPage.getByTestId('deep-analysis-screen')).toBeVisible();
      await expect(participantPage.getByTestId('deep-analysis-screen')).toBeVisible();

      // ─── Section 4: Deep Analysis Typography Verification ───────────
      const commItems = leaderPage.getByTestId('commentary-item');
      await expect(commItems.first()).toBeVisible();
      await expect(commItems.first()).toHaveAttribute('data-animated-text', 'true');

      const commQuote = commItems.first().locator('.commentary-scripture-quote');
      const commQuoteSize = await commQuote.evaluate((el) =>
        parseFloat(window.getComputedStyle(el).fontSize),
      );
      expect(commQuoteSize).toBeGreaterThanOrEqual(21);

      const commBody = commItems.first().locator('.commentary-body-text');
      const commBodySize = await commBody.evaluate((el) =>
        parseFloat(window.getComputedStyle(el).fontSize),
      );
      expect(commBodySize).toBeGreaterThanOrEqual(18);

      // Advance to Section 5 Discussion
      await leaderPage.getByTestId('deep-analysis-advance-cta').click();
      await expect(leaderPage.getByTestId('section-entry-overlay')).not.toBeVisible({ timeout: 12_000 });
      await expect(leaderPage.getByTestId('discussion-screen')).toBeVisible();

      // ─── Section 5: Discussion & Reflection Typography Verification ─
      const activePrompt = participantPage.getByTestId('active-question-prompt');
      await expect(activePrompt).toBeVisible();
      const promptFontSize = await activePrompt.evaluate((el) =>
        parseFloat(window.getComputedStyle(el).fontSize),
      );
      expect(promptFontSize).toBeGreaterThanOrEqual(24);
      await expect(activePrompt).toHaveAttribute('data-animated-text', 'true');

      // Advance to Section 6 Closing Prayer
      await leaderPage.getByTestId('advance-section-5-direct').click();
      await expect(leaderPage.getByTestId('section-entry-overlay')).not.toBeVisible({ timeout: 12_000 });
      await expect(leaderPage.getByTestId('closing-prayer-screen')).toBeVisible();

      // ─── Section 6: Closing Prayer Typography Verification ──────────
      const closingPrayer = leaderPage.getByTestId('closing-prayer-text');
      await expect(closingPrayer).toBeVisible();
      const closingPrayerSize = await closingPrayer.evaluate((el) =>
        parseFloat(window.getComputedStyle(el).fontSize),
      );
      expect(closingPrayerSize).toBeGreaterThanOrEqual(21);
      await expect(closingPrayer).toHaveAttribute('data-animated-text', 'true');

      const weeklyChallenges = leaderPage.getByTestId('weekly-challenges-card');
      await expect(weeklyChallenges).toBeVisible();
      await expect(weeklyChallenges).toHaveAttribute('data-animated-text', 'true');
    } finally {
      await closeLiveSession(leaderPage);
      await Promise.allSettled([leaderContext.close(), participantContext.close()]);
    }
  });

  test('Desktop Dual Mode: both frames render enlarged typography and synchronized animated text reveals', async ({
    page,
  }) => {
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/');

      const dualBtn = page.getByTestId('welcome-dual-mode-btn');
      await expect(dualBtn).toBeVisible();
      await dualBtn.click();

      await expect(page.getByTestId('simulation-toolbar')).toBeVisible();

      const leaderFrame = page.getByTestId('leader-frame');
      const participantFrame = page.getByTestId('participant-frame');

      // Start Study from leader frame
      const startBtn = leaderFrame.getByTestId('lobby-start-study');
      await expect(startBtn).toBeVisible();
      await startBtn.click();

      // Wait for section entry overlay dismiss
      await expect(leaderFrame.getByTestId('section-entry-overlay')).not.toBeVisible({ timeout: 12_000 });
      await expect(participantFrame.getByTestId('section-entry-overlay')).not.toBeVisible({ timeout: 12_000 });

      // In Section 1, both frames show enlarged scripture and animated text
      const leaderPrayer = leaderFrame.getByTestId('opening-prayer-text');
      const participantPrayer = participantFrame.getByTestId('opening-prayer-text');

      await expect(leaderPrayer).toBeVisible();
      await expect(participantPrayer).toBeVisible();

      await expect(leaderPrayer).toHaveAttribute('data-animated-text', 'true');
      await expect(participantPrayer).toHaveAttribute('data-animated-text', 'true');

      const leaderPrayerFontSize = await leaderPrayer.evaluate((el) =>
        parseFloat(window.getComputedStyle(el).fontSize),
      );
      const participantPrayerFontSize = await participantPrayer.evaluate((el) =>
        parseFloat(window.getComputedStyle(el).fontSize),
      );

      expect(leaderPrayerFontSize).toBeGreaterThanOrEqual(21);
      expect(participantPrayerFontSize).toBeGreaterThanOrEqual(21);

      // Verify WebGL Canvas budget strictly <= 2
      const canvasCount = await page.locator('canvas').count();
      expect(canvasCount).toBeLessThanOrEqual(2);
    } finally {
      await closeLiveSession(page);
    }
  });
});

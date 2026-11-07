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

test.describe('Full-Screen 3D Section Entry Animations Across Six Sections', () => {
  test.describe.configure({ timeout: 60_000 });

  test('Scenarios 1, 2, 3: Section entry overlays display distinct emblems, titles, and descriptions forward and backward', async ({
    browser,
  }) => {
    const leaderContext = await browser.newContext();
    const participantContext = await browser.newContext();

    const leaderPage = await leaderContext.newPage();
    const participantPage = await participantContext.newPage();

    let sessionCode = '';

    try {
      sessionCode = await createLeaderInLobby(leaderPage);
      await joinAsParticipant(participantPage, sessionCode, 'Maria');

      // ─── Scenario 1: Start Study -> Section 1 Opening Prayer ─────────
      await leaderPage.getByTestId('lobby-start-study').click();

      // Both Leader and Participant viewports render section-entry-overlay concurrently
      const leaderOverlay = leaderPage.getByTestId('section-entry-overlay');
      const participantOverlay = participantPage.getByTestId('section-entry-overlay');
      await Promise.all([
        expect(leaderOverlay).toBeVisible(),
        expect(participantOverlay).toBeVisible(),
      ]);

      // Displays SECTION 1 OF 6, Opening Prayer, and description
      await expect(leaderOverlay).toContainText('SECTION 1 OF 6');
      await expect(leaderOverlay).toContainText('Opening Prayer');
      await expect(leaderOverlay).toContainText('Prepare our hearts in humility and mercy');

      // Canvas budget <= 1 per viewport
      expect(await leaderPage.locator('canvas').count()).toBeLessThanOrEqual(1);
      expect(await participantPage.locator('canvas').count()).toBeLessThanOrEqual(1);

      // Invariant: zero Assistant text
      const bodyTextLeader = await leaderPage.textContent('body');
      expect(bodyTextLeader).not.toContain('Assistant');

      // Auto-dismisses smoothly after duration, revealing Section 1 content
      await Promise.all([
        expect(leaderOverlay).not.toBeVisible({ timeout: 10_000 }),
        expect(participantOverlay).not.toBeVisible({ timeout: 10_000 }),
      ]);

      await Promise.all([
        expect(leaderPage.getByTestId('section-one-handoff')).toBeVisible(),
        expect(participantPage.getByTestId('section-one-handoff')).toBeVisible(),
      ]);

      // ─── Scenario 2: Advancing to Section 2 Icebreaker ─────────────────
      // Complete Section 1 volunteer turn via Leader override
      await leaderPage.getByTestId('prayer-override-button').click();
      await expect(leaderPage.getByTestId('prayer-advance-cta')).toBeVisible();

      // Click advance CTA -> triggers Section 2 entry overlay
      await leaderPage.getByTestId('prayer-advance-cta').click();

      const leaderOverlay2 = leaderPage.getByTestId('section-entry-overlay');
      const participantOverlay2 = participantPage.getByTestId('section-entry-overlay');
      await Promise.all([
        expect(leaderOverlay2).toBeVisible(),
        expect(participantOverlay2).toBeVisible(),
      ]);

      await expect(leaderOverlay2).toContainText('SECTION 2 OF 6');
      await expect(leaderOverlay2).toContainText('Icebreaker');
      await expect(leaderOverlay2).toContainText('Outsiders Wanted');

      // Canvas budget preserved <= 1
      expect(await leaderPage.locator('canvas').count()).toBeLessThanOrEqual(1);
      expect(await participantPage.locator('canvas').count()).toBeLessThanOrEqual(1);

      // Auto-dismisses, revealing Section 2 Icebreaker screen
      await Promise.all([
        expect(leaderOverlay2).not.toBeVisible({ timeout: 10_000 }),
        expect(participantOverlay2).not.toBeVisible({ timeout: 10_000 }),
      ]);

      await Promise.all([
        expect(leaderPage.getByTestId('icebreaker-screen')).toBeVisible(),
        expect(participantPage.getByTestId('icebreaker-screen')).toBeVisible(),
      ]);

      // Advance through Section 2 -> Section 3
      await leaderPage.getByTestId('icebreaker-advance-cta').click();
      const leaderOverlay3 = leaderPage.getByTestId('section-entry-overlay');
      await expect(leaderOverlay3).toBeVisible();
      await expect(leaderOverlay3).toContainText('SECTION 3 OF 6');
      await expect(leaderOverlay3).not.toBeVisible({ timeout: 10_000 });
      await expect(leaderPage.getByTestId('gospel-reading-screen')).toBeVisible();

      // Complete Section 3 turn via override, then advance to Section 4
      await leaderPage.getByTestId('reading-override-button').click();
      await expect(leaderPage.getByTestId('reading-advance-cta')).toBeVisible();
      await leaderPage.getByTestId('reading-advance-cta').click();

      // Section 4 Deep Analysis entry overlay
      const leaderOverlay4 = leaderPage.getByTestId('section-entry-overlay');
      await expect(leaderOverlay4).toBeVisible();
      await expect(leaderOverlay4).toContainText('SECTION 4 OF 6');
      await expect(leaderOverlay4).toContainText('Deep Analysis');
      await expect(leaderOverlay4).toContainText(
        'Verse-by-Verse Gospel Breakdown & Catholic Doctrine',
      );
      await expect(leaderOverlay4).not.toBeVisible({ timeout: 10_000 });

      // ─── Scenario 3: Backward Navigation to Section 3 ─────────────────
      await expect(leaderPage.getByTestId('previous-section-btn')).toBeVisible();
      await leaderPage.getByTestId('previous-section-btn').click();

      // Returning backward to Section 3 triggers Gospel Reading 3D entry overlay
      const leaderOverlayBack = leaderPage.getByTestId('section-entry-overlay');
      const participantOverlayBack = participantPage.getByTestId('section-entry-overlay');
      await Promise.all([
        expect(leaderOverlayBack).toBeVisible(),
        expect(participantOverlayBack).toBeVisible(),
      ]);

      await expect(leaderOverlayBack).toContainText('SECTION 3 OF 6');
      await expect(leaderOverlayBack).toContainText('Gospel Reading');
      await expect(leaderOverlayBack).toContainText('Proclamation of Matthew 15:21–28');

      // Auto-dismisses, revealing Section 3 Gospel Reading screen
      await Promise.all([
        expect(leaderOverlayBack).not.toBeVisible({ timeout: 10_000 }),
        expect(participantOverlayBack).not.toBeVisible({ timeout: 10_000 }),
      ]);

      await Promise.all([
        expect(leaderPage.getByTestId('gospel-reading-screen')).toBeVisible(),
        expect(participantPage.getByTestId('gospel-reading-screen')).toBeVisible(),
      ]);
    } finally {
      await closeLiveSession(leaderPage);
      await Promise.allSettled([leaderContext.close(), participantContext.close()]);
    }
  });

  test('Scenario 4: Canvas budget is strictly preserved (<= 1 in standalone, <= 2 in Desktop Dual Mode)', async ({
    page,
  }) => {
    try {
      // Set desktop viewport for dual mode test
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/');

      // Launch Dual Mode
      const dualBtn = page.getByTestId('welcome-dual-mode-btn');
      await expect(dualBtn).toBeVisible();
      await dualBtn.click();

      await expect(page.getByTestId('simulation-toolbar')).toBeVisible();

      // Total canvases across dual mode document strictly <= 2 (one per device frame)
      const canvasCount = await page.locator('canvas').count();
      expect(canvasCount).toBeLessThanOrEqual(2);

      // Start Study from leader frame
      const leaderFrame = page.getByTestId('leader-frame');
      const startBtn = leaderFrame.getByTestId('lobby-start-study');
      await expect(startBtn).toBeVisible();
      await startBtn.click();

      // Both frames render section-entry-overlay
      await expect(leaderFrame.getByTestId('section-entry-overlay')).toBeVisible();
      await expect(page.getByTestId('participant-frame').getByTestId('section-entry-overlay')).toBeVisible();

      // During animation, canvas count is still strictly <= 2
      const canvasCountDuring = await page.locator('canvas').count();
      expect(canvasCountDuring).toBeLessThanOrEqual(2);

      // After dismiss, both frames show section-one-handoff and canvas count is still <= 2
      await expect(leaderFrame.getByTestId('section-entry-overlay')).not.toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId('participant-frame').getByTestId('section-entry-overlay')).not.toBeVisible({ timeout: 10_000 });
      await expect(leaderFrame.getByTestId('section-one-handoff')).toBeVisible();
      await expect(page.getByTestId('participant-frame').getByTestId('section-one-handoff')).toBeVisible();

      const canvasCountAfter = await page.locator('canvas').count();
      expect(canvasCountAfter).toBeLessThanOrEqual(2);
    } finally {
      await closeLiveSession(page);
    }
  });
});

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
    // Cleanup must never fail or hang.
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

test.describe('Section 4 Deep Analysis Screen', () => {
  test.describe.configure({ timeout: 60_000 });

  test('Mobile: Study Leader and Participant experience Section 4 Deep Analysis with content, tabs, and navigation', async ({
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

      // Start Study -> Section 1 (Opening Prayer)
      await leaderPage.getByTestId('lobby-start-study').click();
      await expect(leaderPage.getByTestId('section-one-handoff')).toBeVisible();
      await expect(participantPage.getByTestId('section-one-handoff')).toBeVisible();

      // Complete Section 1 via leader override
      await leaderPage.getByTestId('prayer-override-button').click();
      await expect(leaderPage.getByTestId('prayer-advance-cta')).toBeVisible();
      await leaderPage.getByTestId('prayer-advance-cta').click();

      // Section 2 (Icebreaker) -> Advance to Section 3
      await expect(leaderPage.getByTestId('icebreaker-screen')).toBeVisible();
      await expect(participantPage.getByTestId('icebreaker-screen')).toBeVisible();
      await leaderPage.getByTestId('icebreaker-advance-cta').click();

      // Section 3 (Gospel Reading) -> Complete reading turn and advance to Section 4
      await expect(leaderPage.getByTestId('gospel-reading-screen')).toBeVisible();
      await expect(participantPage.getByTestId('gospel-reading-screen')).toBeVisible();
      await leaderPage.getByTestId('reading-override-button').click();
      await expect(leaderPage.getByTestId('reading-advance-cta')).toBeVisible();
      await leaderPage.getByTestId('reading-advance-cta').click();

      // --- SECTION 4: Deep Analysis ---
      await expect(leaderPage.getByTestId('deep-analysis-screen')).toBeVisible();
      await expect(participantPage.getByTestId('deep-analysis-screen')).toBeVisible();

      // Progress Header checks: SECTION 4 OF 6 · 67%
      await expect(leaderPage.getByTestId('section-one-label')).toHaveText('SECTION 4 OF 6');
      await expect(leaderPage.getByTestId('section-one-percent')).toHaveText('67%');
      await expect(participantPage.getByTestId('section-one-label')).toHaveText('SECTION 4 OF 6');
      await expect(participantPage.getByTestId('section-one-percent')).toHaveText('67%');

      // Eyebrow and title
      await expect(leaderPage.getByTestId('deep-analysis-title')).toBeVisible();
      await expect(participantPage.getByTestId('deep-analysis-title')).toBeVisible();

      // Canonical content counts on both Leader and Participant screens
      await expect(leaderPage.getByTestId('commentary-item')).toHaveCount(10);
      await expect(leaderPage.getByTestId('doctrine-item')).toHaveCount(4);
      await expect(leaderPage.getByTestId('application-item')).toHaveCount(4);

      await expect(participantPage.getByTestId('commentary-item')).toHaveCount(10);
      await expect(participantPage.getByTestId('doctrine-item')).toHaveCount(4);
      await expect(participantPage.getByTestId('application-item')).toHaveCount(4);

      // Leader navigation controls & Share QR
      await expect(leaderPage.getByTestId('previous-section-btn')).toBeVisible();
      await expect(leaderPage.getByTestId('deep-analysis-advance-cta')).toBeVisible();
      await expect(leaderPage.getByTestId('section-share-qr-trigger')).toBeVisible();

      // Participant must not see leader controls
      await expect(participantPage.getByTestId('previous-section-btn')).toHaveCount(0);
      await expect(participantPage.getByTestId('deep-analysis-advance-cta')).toHaveCount(0);
      await expect(participantPage.getByTestId('section-share-qr-trigger')).toHaveCount(0);
      await expect(participantPage.getByTestId('locked-advance-bar')).toBeVisible();
      await expect(participantPage.getByTestId('locked-advance-bar')).toHaveAttribute(
        'data-role',
        'participant',
      );

      // Interactive tabs filtering on Participant screen
      await participantPage.getByTestId('tab-commentary').click();
      await expect(participantPage.getByTestId('commentary-item')).toHaveCount(10);
      await expect(participantPage.getByTestId('doctrine-item')).toHaveCount(0);
      await expect(participantPage.getByTestId('application-item')).toHaveCount(0);

      await participantPage.getByTestId('tab-doctrine').click();
      await expect(participantPage.getByTestId('commentary-item')).toHaveCount(0);
      await expect(participantPage.getByTestId('doctrine-item')).toHaveCount(4);
      await expect(participantPage.getByTestId('application-item')).toHaveCount(0);

      await participantPage.getByTestId('tab-application').click();
      await expect(participantPage.getByTestId('commentary-item')).toHaveCount(0);
      await expect(participantPage.getByTestId('doctrine-item')).toHaveCount(0);
      await expect(participantPage.getByTestId('application-item')).toHaveCount(4);

      await participantPage.getByTestId('tab-all').click();
      await expect(participantPage.getByTestId('commentary-item')).toHaveCount(10);
      await expect(participantPage.getByTestId('doctrine-item')).toHaveCount(4);
      await expect(participantPage.getByTestId('application-item')).toHaveCount(4);

      // Backward navigation to Section 3
      await leaderPage.getByTestId('previous-section-btn').click();
      await expect(leaderPage.getByTestId('gospel-reading-screen')).toBeVisible();
      await expect(participantPage.getByTestId('gospel-reading-screen')).toBeVisible();

      // Forward return to Section 4
      await leaderPage.getByTestId('reading-advance-cta').click();
      await expect(leaderPage.getByTestId('deep-analysis-screen')).toBeVisible();
      await expect(participantPage.getByTestId('deep-analysis-screen')).toBeVisible();

      // Forward navigation to Section 5 (Discussion & Reflection)
      await leaderPage.getByTestId('deep-analysis-advance-cta').click();
      await expect(leaderPage.getByTestId('discussion-screen')).toBeVisible();
      await expect(participantPage.getByTestId('discussion-screen')).toBeVisible();
      await expect(leaderPage.getByTestId('section-one-label')).toHaveText('SECTION 5 OF 6');
      await expect(leaderPage.getByTestId('section-one-percent')).toHaveText('83%');

      // Terminology invariant: DOM must have 0 occurrences of 'Assistant'
      const leaderHtml = await leaderPage.content();
      const participantHtml = await participantPage.content();
      expect(leaderHtml).not.toContain('Assistant');
      expect(participantHtml).not.toContain('Assistant');
    } finally {
      await closeLiveSession(leaderPage);
      await Promise.allSettled([leaderContext.close(), participantContext.close()]);
    }
  });
});

test.describe('Section 4 Deep Analysis Screen (Desktop Dual Mode)', () => {
  test.use({
    viewport: { width: 1440, height: 900 },
    isMobile: false,
    hasTouch: false,
  });

  test('Desktop Dual Mode: Section 4 renders Deep Analysis side-by-side with frame isolation', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    try {
      await page.goto('/?mode=dual');
      await expect(page.getByTestId('simulation-toolbar')).toBeVisible();

      const leaderFrame = page.getByTestId('leader-frame');
      const participantFrame = page.getByTestId('participant-frame');

      // Start study -> Section 1 (Opening Prayer)
      await leaderFrame.getByTestId('lobby-start-study').click();
      await expect(leaderFrame.getByTestId('section-one-handoff')).toBeVisible();
      await expect(participantFrame.getByTestId('section-one-handoff')).toBeVisible();

      // Override Section 1 turn
      await leaderFrame.getByTestId('prayer-override-button').click();
      await expect(leaderFrame.getByTestId('prayer-advance-cta')).toBeVisible();
      await leaderFrame.getByTestId('prayer-advance-cta').click();

      // Section 2 Icebreaker -> Section 3
      await expect(leaderFrame.getByTestId('icebreaker-screen')).toBeVisible();
      await expect(participantFrame.getByTestId('icebreaker-screen')).toBeVisible();
      await leaderFrame.getByTestId('icebreaker-advance-cta').click();

      // Section 3 Gospel Reading -> Section 4
      await expect(leaderFrame.getByTestId('gospel-reading-screen')).toBeVisible();
      await expect(participantFrame.getByTestId('gospel-reading-screen')).toBeVisible();
      await leaderFrame.getByTestId('reading-override-button').click();
      await expect(leaderFrame.getByTestId('reading-advance-cta')).toBeVisible();
      await leaderFrame.getByTestId('reading-advance-cta').click();

      // Both frames render DeepAnalysisScreen in Section 4
      await expect(leaderFrame.getByTestId('deep-analysis-screen')).toBeVisible();
      await expect(participantFrame.getByTestId('deep-analysis-screen')).toBeVisible();

      // Content synced in both frames
      await expect(leaderFrame.getByTestId('commentary-item')).toHaveCount(10);
      await expect(participantFrame.getByTestId('commentary-item')).toHaveCount(10);

      // Frame role controls isolation
      await expect(leaderFrame.getByTestId('deep-analysis-advance-cta')).toBeVisible();
      await expect(leaderFrame.getByTestId('previous-section-btn')).toBeVisible();
      await expect(participantFrame.getByTestId('deep-analysis-advance-cta')).toHaveCount(0);
      await expect(participantFrame.getByTestId('previous-section-btn')).toHaveCount(0);
      await expect(participantFrame.getByTestId('locked-advance-bar')).toBeVisible();

      // Advance to Section 5
      await leaderFrame.getByTestId('deep-analysis-advance-cta').click();
      await expect(leaderFrame.getByTestId('discussion-screen')).toBeVisible();
      await expect(participantFrame.getByTestId('discussion-screen')).toBeVisible();
    } finally {
      await closeLiveSession(page);
    }
  });
});

import { expect as baseExpect, test, type Page } from '@playwright/test';

// Per-suite assertion headroom for multi-context live /ws tests
const expect = baseExpect.configure({ timeout: 20_000 });

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
    // Cleanup must never fail or hang the suite.
  }
}

async function createLeaderInLobby(page: Page): Promise<string> {
  await page.goto('/');
  await page.getByTestId('welcome-role-leader').click({ force: true });
  await expect(page.getByTestId('leader-access-sheet')).toBeVisible();
  await page.getByLabel(/Leader Name/i).fill('Claire');
  await page.getByRole('button', { name: 'Create Room' }).click({ force: true });
  await expect(page.getByTestId('study-setup-screen')).toBeVisible();

  const sessionCode = (
    await page.getByTestId('active-session-code').innerText()
  ).trim();
  expect(sessionCode).toMatch(/^[A-Z0-9]{6}$/);

  await page.getByTestId('study-setup-continue').click({ force: true });
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
  await page.getByRole('button', { name: 'Join Study' }).click({ force: true });
  await expect(page.getByTestId('active-session-banner')).toBeVisible();
}

async function startStudyOnSection1(
  pageLeader: Page,
  participants: Page[],
): Promise<void> {
  await pageLeader.getByTestId('lobby-start-study').click({ force: true });
  await expect(pageLeader.getByTestId('section-one-handoff')).toBeVisible();
  for (const page of participants) {
    await expect(page.getByTestId('section-one-handoff')).toBeVisible();
  }
}

test.describe('Full-Screen 3D Random Picker Reveal', () => {
  test.describe.configure({ timeout: 180_000 });

  test('Scenario 1: Section 1 random pick full-screen 3D overlay, auto-resolve winner reveal, re-roll, and Done progression', async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(180_000);
    const leaderContext = await browser.newContext();
    const pageLeader = await leaderContext.newPage();
    const miaContext = await browser.newContext();
    const pageMia = await miaContext.newPage();
    const leoContext = await browser.newContext();
    const pageLeo = await leoContext.newPage();

    try {
      const sessionCode = await createLeaderInLobby(pageLeader);
      await joinAsParticipant(pageMia, sessionCode, 'Mia');
      await joinAsParticipant(pageLeo, sessionCode, 'Leo');
      await startStudyOnSection1(pageLeader, [pageMia, pageLeo]);

      // Leader triggers random pick
      const pickButton = pageLeader.getByTestId('random-pick-button');
      await expect(pickButton).toBeEnabled();
      await pickButton.click({ force: true });

      // Participants immediately see the full-screen 3D random picker overlay
      const miaOverlay = pageMia.getByTestId('random-picker-overlay');
      await expect(miaOverlay).toBeVisible();
      await expect(pageMia.getByTestId('random-picker-pill')).toHaveText('RANDOM SELECTION');
      await expect(pageMia.getByTestId('random-picker-title')).toHaveText('Selecting a participant at random…');
      await expect(pageMia.getByTestId('random-picker-subtitle')).toHaveText('Spinning for a volunteer…');
      expect(await pageMia.locator('canvas').count()).toBeLessThanOrEqual(1);

      // Section cards and hand-raise orb are hidden from Participants during spin
      await expect(pageMia.getByTestId('prayer-card')).not.toBeVisible();
      await expect(pageMia.getByTestId('hand-raise-orb')).not.toBeVisible();

      // Auto-resolve: within ~3.5s, server automatically locks in the candidate to assigned phase
      await expect(pageLeader.getByTestId('prayer-chosen-banner')).toBeVisible({
        timeout: 30_000,
      });

      const leaderBannerText = await pageLeader
        .getByTestId('prayer-chosen-banner')
        .innerText();
      const isMiaWinner = leaderBannerText.includes('Mia');
      const winnerPage = isMiaWinner ? pageMia : pageLeo;
      const bystanderPage = isMiaWinner ? pageLeo : pageMia;
      const winnerName = isMiaWinner ? 'Mia' : 'Leo';

      // Winner sees high-visibility YOU WERE CHOSEN view with exclusive Done CTA
      await expect(winnerPage.getByTestId('prayer-chosen-view')).toBeVisible();
      await expect(winnerPage.getByTestId('prayer-chosen-pill')).toContainText(
        'YOU WERE CHOSEN',
      );
      await expect(winnerPage.getByTestId('prayer-done-button')).toBeEnabled();

      // Bystander sees "<Name> was chosen! <Name> is praying now"
      await expect(
        bystanderPage.getByTestId('prayer-active-volunteer-note'),
      ).toContainText(`${winnerName} was chosen!`);

      // Leader sees active volunteer banner with Pick Again button
      await expect(pageLeader.getByTestId('prayer-chosen-banner')).toContainText(
        `${winnerName} is praying — waiting for Done`,
      );
      const retryButton = pageLeader.getByTestId('random-retry-button');
      await expect(retryButton).toBeVisible();
      await expect(retryButton).toContainText('Pick Again');

      // Test Pick Again re-roll: leader clicks Pick Again while assigned
      await retryButton.click({ force: true });

      // Participant sees the full-screen 3D random picker overlay again
      await expect(pageMia.getByTestId('random-picker-overlay')).toBeVisible();

      // Wait for leader's banner to update to the other participant
      const secondWinnerName = isMiaWinner ? 'Leo' : 'Mia';
      const secondWinnerPage = isMiaWinner ? pageLeo : pageMia;
      await expect(pageLeader.getByTestId('prayer-chosen-banner')).toContainText(
        `${secondWinnerName} is praying — waiting for Done`,
        { timeout: 30_000 },
      );

      await expect(
        secondWinnerPage.getByTestId('prayer-chosen-view'),
      ).toBeVisible();

      // Newly chosen volunteer clicks Done
      await expect(
        secondWinnerPage.getByTestId('prayer-done-button'),
      ).toBeEnabled();
      await secondWinnerPage.getByTestId('prayer-done-button').click({ force: true });
      await expect(
        secondWinnerPage.getByTestId('prayer-done-completed'),
      ).toHaveText('Amen — thank you for praying.');

      // Turn is completed, unlocking leader's Continue CTA
      const advanceCta = pageLeader.getByTestId('prayer-advance-cta');
      await expect(advanceCta).toBeVisible();
      await expect(advanceCta).toContainText('Continue to Section 2 →');
    } finally {
      await closeLiveSession(pageLeader);
      await Promise.allSettled([
        pageLeader.close(),
        pageMia.close(),
        pageLeo.close(),
        leaderContext.close(),
        miaContext.close(),
        leoContext.close(),
      ]);
    }
  });

  test('Scenario 2: Section 2 (Icebreaker) and Section 3 (Reading) random pick and turn completion', async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(180_000);
    const leaderContext = await browser.newContext();
    const pageLeader = await leaderContext.newPage();
    const miaContext = await browser.newContext();
    const pageMia = await miaContext.newPage();
    const leoContext = await browser.newContext();
    const pageLeo = await leoContext.newPage();

    try {
      const sessionCode = await createLeaderInLobby(pageLeader);
      await joinAsParticipant(pageMia, sessionCode, 'Mia');
      await joinAsParticipant(pageLeo, sessionCode, 'Leo');
      await startStudyOnSection1(pageLeader, [pageMia, pageLeo]);

      // Complete Section 1 via leader override to reach Section 2
      await pageLeader.getByTestId('prayer-override-button').click({ force: true });
      await expect(pageLeader.getByTestId('prayer-advance-cta')).toBeVisible();
      await pageLeader.getByTestId('prayer-advance-cta').click({ force: true });

      // Section 2: Icebreaker (waits past 3.2s section entry animation)
      await expect(pageLeader.getByTestId('icebreaker-screen')).toBeVisible({ timeout: 20_000 });
      await expect(pageMia.getByTestId('icebreaker-screen')).toBeVisible({ timeout: 20_000 });
      await expect(pageLeo.getByTestId('icebreaker-screen')).toBeVisible({ timeout: 20_000 });

      // Leader clicks Pick Randomly in Section 2
      const icebreakerPickButton = pageLeader.getByTestId('random-pick-button');
      await expect(icebreakerPickButton).toBeVisible();
      await icebreakerPickButton.click({ force: true });

      // Participants see random picker overlay
      await expect(pageMia.getByTestId('random-picker-overlay')).toBeVisible();

      // Wait for auto-resolve in Section 2
      await expect(
        pageLeader.getByTestId('icebreaker-chosen-banner'),
      ).toBeVisible({ timeout: 30_000 });

      const icebreakerBannerText = await pageLeader
        .getByTestId('icebreaker-chosen-banner')
        .innerText();
      const isMiaIcebreakerWinner = icebreakerBannerText.includes('Mia');
      const icebreakerWinnerPage = isMiaIcebreakerWinner ? pageMia : pageLeo;
      const icebreakerBystanderPage = isMiaIcebreakerWinner ? pageLeo : pageMia;
      const icebreakerWinnerName = isMiaIcebreakerWinner ? 'Mia' : 'Leo';

      await expect(
        icebreakerWinnerPage.getByTestId('icebreaker-chosen-view'),
      ).toBeVisible();
      await expect(
        icebreakerWinnerPage.getByTestId('icebreaker-done-button'),
      ).toBeEnabled();

      await expect(
        icebreakerBystanderPage.getByTestId('icebreaker-active-volunteer-note'),
      ).toContainText(`${icebreakerWinnerName} was chosen!`);

      await expect(
        pageLeader.getByTestId('icebreaker-chosen-banner'),
      ).toContainText(`${icebreakerWinnerName} is sharing`);
      await expect(
        pageLeader.getByTestId('random-retry-button'),
      ).toBeVisible();

      // Winner clicks Done Sharing
      await icebreakerWinnerPage.getByTestId('icebreaker-done-button').click({ force: true });
      await expect(
        icebreakerWinnerPage.getByTestId('icebreaker-done-completed'),
      ).toBeVisible();

      // Advance to Section 3: Gospel Reading
      const icebreakerAdvance = pageLeader.getByTestId('icebreaker-advance-cta');
      await expect(icebreakerAdvance).toBeVisible();
      await icebreakerAdvance.click({ force: true });

      // Section 3: Reading (waits past 3.2s section entry animation)
      await expect(pageLeader.getByTestId('gospel-reading-screen')).toBeVisible({ timeout: 20_000 });
      await expect(pageMia.getByTestId('gospel-reading-screen')).toBeVisible({ timeout: 20_000 });
      await expect(pageLeo.getByTestId('gospel-reading-screen')).toBeVisible({ timeout: 20_000 });

      // Leader clicks Pick Randomly in Section 3
      const readingPickButton = pageLeader.getByTestId('random-picker-button');
      await expect(readingPickButton).toBeVisible();
      await readingPickButton.click({ force: true });

      // Participants see random picker overlay
      await expect(pageMia.getByTestId('random-picker-overlay')).toBeVisible();

      // Wait for auto-resolve in Section 3
      await expect(
        pageLeader.getByTestId('reading-chosen-banner'),
      ).toBeVisible({ timeout: 30_000 });

      const readingBannerText = await pageLeader
        .getByTestId('reading-chosen-banner')
        .innerText();
      const isMiaReadingWinner = readingBannerText.includes('Mia');
      const readingWinnerPage = isMiaReadingWinner ? pageMia : pageLeo;
      const readingBystanderPage = isMiaReadingWinner ? pageLeo : pageMia;
      const readingWinnerName = isMiaReadingWinner ? 'Mia' : 'Leo';

      await expect(
        readingWinnerPage.getByTestId('reading-chosen-view'),
      ).toBeVisible();
      await expect(
        readingWinnerPage.getByTestId('reading-done-button'),
      ).toBeEnabled();

      await expect(
        readingBystanderPage.getByTestId('reading-active-volunteer-note'),
      ).toContainText(`${readingWinnerName} was chosen!`);

      await expect(
        pageLeader.getByTestId('reading-chosen-banner'),
      ).toContainText(`${readingWinnerName} is reading`);
      await expect(pageLeader.getByTestId('random-retry-button')).toBeVisible();

      // Winner clicks Done Reading
      await readingWinnerPage.getByTestId('reading-done-button').click({ force: true });
      await expect(
        readingWinnerPage.getByTestId('reading-done-completed'),
      ).toBeVisible();

      // Leader can advance to Section 4
      await expect(
        pageLeader.getByTestId('reading-advance-cta'),
      ).toBeVisible();
    } finally {
      await closeLiveSession(pageLeader);
      await Promise.allSettled([
        pageLeader.close(),
        pageMia.close(),
        pageLeo.close(),
        leaderContext.close(),
        miaContext.close(),
        leoContext.close(),
      ]);
    }
  });

  test('Scenario 3: WebGL canvas budget in Desktop Dual Mode and zero Assistant occurrences', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/?dual=true');
    await expect(page.getByTestId('desktop-dual-screen')).toBeVisible();

    // Verify active WebGL canvas count <= 2 in Desktop Dual Mode
    const canvasCount = await page.locator('canvas').count();
    expect(canvasCount).toBeLessThanOrEqual(2);

    // Verify invariant: zero occurrences of "Assistant"
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('Assistant');
  });
});

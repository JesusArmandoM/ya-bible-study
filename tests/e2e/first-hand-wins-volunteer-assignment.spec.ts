import { expect as baseExpect, test, type Page } from '@playwright/test';

// Per-suite assertion headroom for multi-context WebSocket e2e runs
const expect = baseExpect.configure({ timeout: 15_000 });

/**
 * Closes the leader's live session over /ws so subsequent suites observe activeSessionCount 0.
 */
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

test.describe('First-Hand-Wins volunteer assignment across Sections 1, 2, and 3', () => {
  test.describe.configure({ timeout: 90_000 });

  test('First participant to raise hand immediately wins the volunteer turn and unlocks advancement upon Done', async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(120_000);
    const leaderContext = await browser.newContext();
    const pageLeader = await leaderContext.newPage();
    const firstContext = await browser.newContext();
    const pageFirst = await firstContext.newPage();
    const secondContext = await browser.newContext();
    const pageSecond = await secondContext.newPage();

    const all = [pageLeader, pageFirst, pageSecond];

    try {
      // 1. Setup session and join participants.
      const sessionCode = await createLeaderInLobby(pageLeader);
      await joinAsParticipant(pageFirst, sessionCode, 'Maria');
      await joinAsParticipant(pageSecond, sessionCode, 'Daniel');

      // 2. Start Study -> Section 1 (Opening Prayer).
      await pageLeader.getByTestId('lobby-start-study').click();
      for (const page of all) {
        await expect(page.getByTestId('section-one-handoff')).toBeVisible();
      }

      // --- SECTION 1: Opening Prayer First-Hand-Wins ---
      // Maria taps the prayer orb.
      await pageFirst.getByTestId('hand-raise-orb').click();

      // Maria immediately wins and sees the prominent YOU WERE CHOSEN view with Done button.
      await expect(pageFirst.getByTestId('prayer-chosen-view')).toBeVisible();
      await expect(pageFirst.getByTestId('prayer-chosen-pill')).toHaveText('YOU WERE CHOSEN');
      await expect(pageFirst.getByTestId('prayer-chosen-title')).toHaveText("It's your turn to pray");
      await expect(pageFirst.getByTestId('prayer-done-button')).toBeVisible();

      // Daniel sees Maria is praying now.
      await expect(pageSecond.getByTestId('prayer-active-volunteer-note')).toHaveText('Maria is praying now');

      // Study Leader sees Maria is praying banner, and forward CTA is locked.
      await expect(pageLeader.getByTestId('prayer-chosen-banner')).toContainText('Maria is praying — waiting for Done');
      await expect(pageLeader.getByTestId('locked-advance-bar')).toBeVisible();

      // Maria taps Done.
      await pageFirst.getByTestId('prayer-done-button').click();
      await expect(pageFirst.getByTestId('prayer-done-completed')).toBeVisible();

      // Leader advance unlocks.
      await expect(pageLeader.getByTestId('prayer-advance-cta')).toContainText('Continue to Section 2 →');
      await pageLeader.getByTestId('prayer-advance-cta').click();

      // --- SECTION 2: Icebreaker First-Hand-Wins ---
      for (const page of all) {
        await expect(page.getByTestId('icebreaker-screen')).toBeVisible();
      }

      // Daniel taps the icebreaker orb.
      await pageSecond.getByTestId('hand-raise-orb').click();

      // Daniel immediately wins and sees the prominent YOU WERE CHOSEN view with Done Sharing button.
      await expect(pageSecond.getByTestId('icebreaker-chosen-view')).toBeVisible();
      await expect(pageSecond.getByTestId('icebreaker-chosen-pill')).toHaveText('YOU WERE CHOSEN');
      await expect(pageSecond.getByTestId('icebreaker-chosen-title')).toHaveText("It's your turn to share");
      await expect(pageSecond.getByTestId('icebreaker-done-button')).toBeVisible();

      // Maria sees Daniel is sharing.
      await expect(pageFirst.getByTestId('icebreaker-active-volunteer-note')).toHaveText('Daniel is sharing');

      // Study Leader sees Daniel is sharing banner and locked forward progression.
      await expect(pageLeader.getByTestId('icebreaker-chosen-banner')).toHaveText('Daniel is sharing — waiting for Done');
      await expect(pageLeader.getByTestId('locked-advance-bar')).toBeVisible();
      await expect(pageLeader.getByTestId('icebreaker-override-button')).toBeVisible();

      // Daniel taps Done Sharing.
      await pageSecond.getByTestId('icebreaker-done-button').click();
      await expect(pageSecond.getByTestId('icebreaker-done-completed')).toBeVisible();

      // Leader advance unlocks.
      await expect(pageLeader.getByTestId('icebreaker-advance-cta')).toContainText('Begin Reading →');
      await pageLeader.getByTestId('icebreaker-advance-cta').click();

      // --- SECTION 3: Gospel Reading First-Hand-Wins ---
      for (const page of all) {
        await expect(page.getByTestId('gospel-reading-screen')).toBeVisible();
      }

      // Maria taps the read aloud orb.
      await pageFirst.getByTestId('read-aloud-orb').click();

      // Maria immediately wins and sees the prominent YOU WERE CHOSEN view with Done Reading button.
      await expect(pageFirst.getByTestId('reading-chosen-view')).toBeVisible();
      await expect(pageFirst.getByTestId('reading-chosen-pill')).toHaveText('YOU WERE CHOSEN');
      await expect(pageFirst.getByTestId('reading-chosen-title')).toHaveText("It's your turn to read");
      await expect(pageFirst.getByTestId('reading-done-button')).toBeVisible();

      // Daniel sees Maria is reading aloud.
      await expect(pageSecond.getByTestId('reading-active-volunteer-note')).toHaveText('Maria is reading aloud');

      // Study Leader sees Maria reading banner and locked advance.
      await expect(pageLeader.getByTestId('reading-chosen-banner')).toHaveText('Maria is reading aloud — waiting for Done');
      await expect(pageLeader.getByTestId('locked-advance-bar')).toBeVisible();
      await expect(pageLeader.getByTestId('reading-override-button')).toBeVisible();

      // Maria taps Done Reading.
      await pageFirst.getByTestId('reading-done-button').click();
      await expect(pageFirst.getByTestId('reading-done-completed')).toBeVisible();

      // Leader advance unlocks.
      await expect(pageLeader.getByTestId('reading-advance-cta')).toContainText('Continue to Deep Analysis →');
      await pageLeader.getByTestId('reading-advance-cta').click();

      // All arrive at Section 4.
      for (const page of all) {
        await expect(page.getByTestId('deep-analysis-placeholder')).toBeVisible();
        await expect(page.getByTestId('section-one-label')).toHaveText('SECTION 4 OF 6');
      }

      // Invariant checks: zero Assistant copy, WebGL canvas count <= 1.
      for (const page of all) {
        const canvasCount = await page.evaluate(
          () => document.querySelectorAll('canvas').length,
        );
        expect(canvasCount).toBeLessThanOrEqual(1);
        const bodyText = await page.evaluate(() => document.body.textContent ?? '');
        expect(bodyText).not.toContain('Assistant');
      }
    } finally {
      await closeLiveSession(pageLeader);
      await Promise.allSettled([
        firstContext.close(),
        secondContext.close(),
        leaderContext.close(),
      ]);
    }
  });
});

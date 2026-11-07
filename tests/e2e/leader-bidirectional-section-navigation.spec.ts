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

test.describe('Leader Bidirectional Section Navigation (6 interactive sections)', () => {
  test.describe.configure({ timeout: 60_000 });
  test('Study Leader navigates forward and backward across all 6 sections, with turn reset and participant gating', async ({
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

      // Section 1 Header: SECTION 1 OF 6 · 17%
      await expect(leaderPage.getByTestId('section-one-label')).toHaveText('SECTION 1 OF 6');
      await expect(leaderPage.getByTestId('section-one-percent')).toHaveText('17%');
      await expect(participantPage.getByTestId('section-one-label')).toHaveText('SECTION 1 OF 6');
      await expect(participantPage.getByTestId('section-one-percent')).toHaveText('17%');

      // Section 1: Study Leader has NO Previous button
      await expect(leaderPage.getByTestId('previous-section-btn')).toHaveCount(0);
      await expect(participantPage.getByTestId('previous-section-btn')).toHaveCount(0);
      await expect(participantPage.getByTestId('reset-turn-btn')).toHaveCount(0);

      // Complete Section 1 turn via override
      await leaderPage.getByTestId('prayer-override-button').click();
      await expect(leaderPage.getByTestId('prayer-advance-cta')).toBeVisible();

      // Advance to Section 2 (Icebreaker)
      await leaderPage.getByTestId('prayer-advance-cta').click();
      await expect(leaderPage.getByTestId('icebreaker-screen')).toBeVisible();
      await expect(participantPage.getByTestId('icebreaker-screen')).toBeVisible();

      // Section 2 Header: SECTION 2 OF 6 · 33%
      await expect(leaderPage.getByTestId('section-one-label')).toHaveText('SECTION 2 OF 6');
      await expect(leaderPage.getByTestId('section-one-percent')).toHaveText('33%');
      await expect(participantPage.getByTestId('section-one-label')).toHaveText('SECTION 2 OF 6');
      await expect(participantPage.getByTestId('section-one-percent')).toHaveText('33%');

      // Leader sees ← Previous on Section 2; Participant does not
      await expect(leaderPage.getByTestId('previous-section-btn')).toBeVisible();
      await expect(participantPage.getByTestId('previous-section-btn')).toHaveCount(0);

      // Leader clicks ← Previous to return to Section 1
      await leaderPage.getByTestId('previous-section-btn').click();
      await expect(leaderPage.getByTestId('section-one-handoff')).toBeVisible();
      await expect(participantPage.getByTestId('section-one-handoff')).toBeVisible();
      await expect(leaderPage.getByTestId('section-one-label')).toHaveText('SECTION 1 OF 6');

      // Section 1 was already completed, so advance CTA is immediately unlocked
      await expect(leaderPage.getByTestId('prayer-advance-cta')).toBeVisible();
      // Leader sees Reset turn button on completed Section 1
      await expect(leaderPage.getByTestId('reset-turn-btn')).toBeVisible();
      await expect(participantPage.getByTestId('reset-turn-btn')).toHaveCount(0);

      // Leader clicks Reset turn: clears completed status and re-opens turn
      await leaderPage.getByTestId('reset-turn-btn').click();
      // Now locked advance bar returns
      await expect(leaderPage.getByTestId('locked-advance-bar')).toBeVisible();
      await expect(leaderPage.getByTestId('reset-turn-btn')).toHaveCount(0);

      // Leader re-completes Section 1 turn via override
      await leaderPage.getByTestId('prayer-override-button').click();
      await expect(leaderPage.getByTestId('prayer-advance-cta')).toBeVisible();

      // Advance: Section 1 -> Section 2 (Icebreaker)
      await leaderPage.getByTestId('prayer-advance-cta').click();
      await expect(leaderPage.getByTestId('icebreaker-screen')).toBeVisible();
      await expect(participantPage.getByTestId('icebreaker-screen')).toBeVisible();

      // Advance: Section 2 -> Section 3 (Gospel Reading)
      await leaderPage.getByTestId('icebreaker-advance-cta').click();
      await expect(leaderPage.getByTestId('gospel-reading-screen')).toBeVisible();
      await expect(participantPage.getByTestId('gospel-reading-screen')).toBeVisible();

      // Section 3 Header: SECTION 3 OF 6 · 50%
      await expect(leaderPage.getByTestId('section-one-label')).toHaveText('SECTION 3 OF 6');
      await expect(leaderPage.getByTestId('section-one-percent')).toHaveText('50%');
      await expect(leaderPage.getByTestId('previous-section-btn')).toBeVisible();
      await expect(participantPage.getByTestId('previous-section-btn')).toHaveCount(0);

      // Leader overrides reading turn to complete Section 3
      await leaderPage.getByTestId('reading-override-button').click();
      await expect(leaderPage.getByTestId('reading-advance-cta')).toBeVisible();
      await expect(leaderPage.getByTestId('reading-advance-cta')).toHaveText('Continue to Deep Analysis →');

      // Advance: Section 3 -> Section 4 (Deep Analysis placeholder)
      await leaderPage.getByTestId('reading-advance-cta').click();
      await expect(leaderPage.getByTestId('deep-analysis-placeholder')).toBeVisible();
      await expect(participantPage.getByTestId('deep-analysis-placeholder')).toBeVisible();

      // Section 4 Header: SECTION 4 OF 6 · 67%
      await expect(leaderPage.getByTestId('section-one-label')).toHaveText('SECTION 4 OF 6');
      await expect(leaderPage.getByTestId('section-one-percent')).toHaveText('67%');
      await expect(leaderPage.getByTestId('previous-section-btn')).toBeVisible();
      await expect(leaderPage.getByTestId('deep-analysis-advance-cta')).toBeVisible();
      await expect(participantPage.getByTestId('previous-section-btn')).toHaveCount(0);
      await expect(participantPage.getByTestId('deep-analysis-advance-cta')).toHaveCount(0);

      // Leader navigates backward from Section 4 to Section 3
      await leaderPage.getByTestId('previous-section-btn').click();
      await expect(leaderPage.getByTestId('gospel-reading-screen')).toBeVisible();
      await expect(participantPage.getByTestId('gospel-reading-screen')).toBeVisible();
      await expect(leaderPage.getByTestId('section-one-label')).toHaveText('SECTION 3 OF 6');
      // Section 3 reading advance CTA is already unlocked because Section 3 is in completedSectionIds
      await expect(leaderPage.getByTestId('reading-advance-cta')).toBeVisible();

      // Leader navigates forward to Section 4
      await leaderPage.getByTestId('reading-advance-cta').click();
      await expect(leaderPage.getByTestId('deep-analysis-placeholder')).toBeVisible();

      // Leader advances from Section 4 to Section 5 (Discussion)
      await leaderPage.getByTestId('deep-analysis-advance-cta').click();
      await expect(leaderPage.getByTestId('discussion-screen')).toBeVisible();
      await expect(participantPage.getByTestId('discussion-screen')).toBeVisible();

      // Section 5 Header: SECTION 5 OF 6 · 83%
      await expect(leaderPage.getByTestId('section-one-label')).toHaveText('SECTION 5 OF 6');
      await expect(leaderPage.getByTestId('section-one-percent')).toHaveText('83%');
      await expect(leaderPage.getByTestId('previous-section-btn')).toBeVisible();
      await expect(participantPage.getByTestId('previous-section-btn')).toHaveCount(0);

      // Leader advances from Section 5 to Section 6 (Closing Prayer)
      await leaderPage.getByTestId('advance-section-5-direct').click();
      await expect(leaderPage.getByTestId('closing-prayer-screen')).toBeVisible();
      await expect(participantPage.getByTestId('closing-prayer-screen')).toBeVisible();

      // Section 6 Header: SECTION 6 OF 6 · 100%
      await expect(leaderPage.getByTestId('section-one-label')).toHaveText('SECTION 6 OF 6');
      await expect(leaderPage.getByTestId('section-one-percent')).toHaveText('100%');
      await expect(leaderPage.getByTestId('previous-section-btn')).toBeVisible();
      await expect(leaderPage.getByTestId('finish-study-btn')).toBeVisible();
      await expect(participantPage.getByTestId('previous-section-btn')).toHaveCount(0);
      await expect(participantPage.getByTestId('finish-study-btn')).toHaveCount(0);

      // Leader navigates backward from Section 6 to Section 5
      await leaderPage.getByTestId('previous-section-btn').click();
      await expect(leaderPage.getByTestId('discussion-screen')).toBeVisible();
      await expect(participantPage.getByTestId('discussion-screen')).toBeVisible();
      await expect(leaderPage.getByTestId('section-one-label')).toHaveText('SECTION 5 OF 6');

      // Leader advances back to Section 6
      await leaderPage.getByTestId('advance-section-5-direct').click();
      await expect(leaderPage.getByTestId('closing-prayer-screen')).toBeVisible();

      // Leader finishes study
      await leaderPage.getByTestId('finish-study-btn').click();
      await expect(leaderPage.getByTestId('welcome-role-leader')).toBeVisible();
      await expect(participantPage.getByTestId('welcome-role-leader')).toBeVisible();
    } finally {
      await closeLiveSession(leaderPage);
      await leaderContext.close();
      await participantContext.close();
    }
  });
});

import { expect as baseExpect, test, type Page } from '@playwright/test';

test.describe.configure({ timeout: 60_000 });

// Per-suite assertion headroom (Session 021-022 hardening): under in-suite contention
// live /ws round trips can stall past the default 5s budget.
const expect = baseExpect.configure({ timeout: 15_000 });

/**
 * Closes the leader's live session over /ws so later suites still observe
 * activeSessionCount 0. Hardened cleanup: never throws and never hangs (bounded
 * waits + try/catch) so a timed-out test cannot leak a live session.
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

  // Continue dispatches load_study and opens the Title Lobby.
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

async function reachSection5(
  pageLeader: Page,
  all: Page[],
): Promise<void> {
  // Start study -> Section 1
  await pageLeader.getByTestId('lobby-start-study').click();
  for (const page of all) {
    await expect(page.getByTestId('section-one-handoff')).toBeVisible();
  }

  // Section 1: complete turn & advance to Section 2
  await pageLeader.getByTestId('prayer-override-button').click();
  await expect(pageLeader.getByTestId('prayer-advance-cta')).toContainText(
    'Continue to Section 2 →',
  );
  await pageLeader.getByTestId('prayer-advance-cta').click();
  for (const page of all) {
    await expect(page.getByTestId('icebreaker-screen')).toBeVisible();
  }

  // Section 2: advance to Section 3
  await expect(pageLeader.getByTestId('icebreaker-advance-cta')).toContainText(
    'Begin Reading →',
  );
  await pageLeader.getByTestId('icebreaker-advance-cta').click();
  for (const page of all) {
    await expect(page.getByTestId('gospel-reading-screen')).toBeVisible();
  }

  // Section 3: complete turn & advance to Section 4
  await pageLeader.getByTestId('reading-override-button').click();
  await expect(pageLeader.getByTestId('reading-advance-cta')).toContainText(
    'Begin Discussion →',
  );
  await pageLeader.getByTestId('reading-advance-cta').click();
  for (const page of all) {
    await expect(page.getByTestId('discussion-screen')).toBeVisible();
  }

  // Section 4 -> Section 5 via direct advance button
  await pageLeader.getByTestId('advance-section-5-direct').click();
  for (const page of all) {
    await expect(page.getByTestId('closing-prayer-screen')).toBeVisible();
  }
}

test.describe('Section 5 Closing Prayer & Session Completion (Scenarios 1–8)', () => {
  test('Scenario 1 & 2: Advance to Section 5 with 100% progress, Star of Faith, and Session Stats (Both Roles)', async ({
    browser,
  }) => {
    const leaderContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const maryContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });

    const pageLeader = await leaderContext.newPage();
    const pageMary = await maryContext.newPage();

    try {
      const sessionCode = await createLeaderInLobby(pageLeader);
      await joinAsParticipant(pageMary, sessionCode, 'Mary Lopez');

      await reachSection5(pageLeader, [pageLeader, pageMary]);

      // Both roles see 100% progress header
      for (const page of [pageLeader, pageMary]) {
        await expect(page.getByTestId('section-one-label')).toHaveText('SECTION 5 OF 5');
        await expect(page.getByTestId('section-one-percent')).toHaveText('100%');
        await expect(page.getByTestId('sacred-active-moment')).toHaveText('SECTION 5 · CLOSING');
        await expect(page.getByText('WRAPPING UP')).toBeVisible();
        await expect(page.getByRole('heading', { level: 2, name: 'Closing Prayer' })).toBeVisible();

        // Stats card
        const statsCard = page.getByTestId('session-stats-card');
        await expect(statsCard).toBeVisible();
        await expect(page.getByTestId('stat-sections')).toContainText('5');
        await expect(page.getByTestId('stat-duration')).toContainText('m');
        await expect(page.getByTestId('stat-participants')).toContainText('1');
      }
    } finally {
      await closeLiveSession(pageLeader);
      await leaderContext.close();
      await maryContext.close();
    }
  });

  test('Scenario 3, 4 & 5: Challenges selection, Next Week card, Closing Prayer text, and Role-Gated Action Zone', async ({
    browser,
  }) => {
    const leaderContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const maryContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });

    const pageLeader = await leaderContext.newPage();
    const pageMary = await maryContext.newPage();

    try {
      const sessionCode = await createLeaderInLobby(pageLeader);
      await joinAsParticipant(pageMary, sessionCode, 'Mary Lopez');

      await reachSection5(pageLeader, [pageLeader, pageMary]);

      // Next Week card
      for (const page of [pageLeader, pageMary]) {
        await expect(page.getByTestId('next-week-card')).toBeVisible();
        await expect(page.getByTestId('next-week-title')).toContainText('Faith that Endures');
        await expect(page.getByTestId('next-week-title')).toContainText('James 1:2–4');

        // Closing prayer text card
        await expect(page.getByTestId('closing-prayer-card')).toBeVisible();
        await expect(page.getByTestId('closing-prayer-card')).toContainText('Lord Jesus, Son of David, have mercy on us.');
      }

      // Interactive weekly challenge selection on Participant
      const ch2 = pageMary.getByTestId('weekly-challenge-2');
      await expect(ch2).toContainText('Humble Prayer');
      await ch2.click();
      await expect(ch2).toHaveClass(/is-selected/);

      // Role-gated action zone
      // Study Leader sees Finish study button
      const finishBtn = pageLeader.getByTestId('finish-study-btn');
      await expect(finishBtn).toBeVisible();
      await expect(finishBtn).toContainText('Finish study');
      await expect(pageLeader.getByTestId('participant-waiting-bar')).not.toBeVisible();

      // Participant sees calm locked waiting bar and NO finish button
      await expect(pageMary.getByTestId('finish-study-btn')).not.toBeVisible();
      const waitingBar = pageMary.getByTestId('participant-waiting-bar');
      await expect(waitingBar).toBeVisible();
      await expect(waitingBar).toContainText('Waiting for Study Leader to conclude study...');
    } finally {
      await closeLiveSession(pageLeader);
      await leaderContext.close();
      await maryContext.close();
    }
  });

  test('Scenario 6 & 7: Study Leader finishes study, session closes, reflections purged from server memory', async ({
    browser,
    request,
  }) => {
    const leaderContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const maryContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });

    const pageLeader = await leaderContext.newPage();
    const pageMary = await maryContext.newPage();

    try {
      const sessionCode = await createLeaderInLobby(pageLeader);
      await joinAsParticipant(pageMary, sessionCode, 'Mary Lopez');

      // Submit a reflection in Section 4 before advancing
      // Start study -> Section 1
      await pageLeader.getByTestId('lobby-start-study').click();
      await expect(pageLeader.getByTestId('section-one-handoff')).toBeVisible();
      await pageLeader.getByTestId('prayer-override-button').click();
      await pageLeader.getByTestId('prayer-advance-cta').click();

      // Section 2
      await expect(pageLeader.getByTestId('icebreaker-screen')).toBeVisible();
      await pageLeader.getByTestId('icebreaker-advance-cta').click();

      // Section 3
      await expect(pageLeader.getByTestId('gospel-reading-screen')).toBeVisible();
      await pageLeader.getByTestId('reading-override-button').click();
      await pageLeader.getByTestId('reading-advance-cta').click();

      // Section 4
      await expect(pageLeader.getByTestId('discussion-screen')).toBeVisible();
      await expect(pageMary.getByTestId('discussion-screen')).toBeVisible();

      // Mary submits a reflection
      await pageMary.getByTestId('respond-trigger-btn').click();
      await expect(pageMary.getByTestId('submit-reflection-modal')).toBeVisible();
      await pageMary.getByTestId('reflection-textarea').fill('Great is your faith inspires me.');
      await pageMary.getByTestId('submit-reflection-btn').click();
      await expect(pageMary.getByTestId('submit-reflection-modal')).not.toBeVisible();

      // Advance to Section 5
      await pageLeader.getByTestId('advance-section-5-direct').click();
      await expect(pageLeader.getByTestId('closing-prayer-screen')).toBeVisible();
      await expect(pageMary.getByTestId('closing-prayer-screen')).toBeVisible();

      // Scenario 7: Participant attempts to send finish_study over WS directly
      const participantAttemptResult = await pageMary.evaluate(async () => {
        const raw = sessionStorage.getItem('ya-bible-study.session-credentials');
        if (!raw) return 'no-creds';
        const creds = JSON.parse(raw);
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
        await new Promise((r) => ws.addEventListener('open', r, { once: true }));
        ws.send(
          JSON.stringify({
            type: 'finish_study',
            sessionCode: creds.sessionCode,
            leaderToken: 'fake-token',
            memberId: creds.memberId,
          }),
        );
        const response: any = await new Promise((r) =>
          ws.addEventListener('message', (ev) => r(JSON.parse(ev.data)), { once: true }),
        );
        ws.close();
        return response.code;
      });
      expect(participantAttemptResult).toBe('FORBIDDEN_LEADER_ONLY');

      // Scenario 6: Study Leader finishes study
      await pageLeader.getByTestId('finish-study-btn').click();

      // Both clients return to Welcome screen cleanly
      await expect(pageLeader.getByTestId('welcome-role-leader')).toBeVisible();
      await expect(pageMary.getByTestId('welcome-role-participant')).toBeVisible();

      // Verify health check shows activeSessionCount === 0
      const healthRes = await request.get('/api/health');
      expect(healthRes.ok()).toBe(true);
      const healthData = await healthRes.json();
      expect(healthData.activeSessionCount).toBe(0);
    } finally {
      await closeLiveSession(pageLeader);
      await leaderContext.close();
      await maryContext.close();
    }
  });

  test('Scenario 8: Mobile ergonomics, single persistent WebGL canvas, and zero legacy terminology', async ({
    browser,
  }) => {
    const leaderContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const pageLeader = await leaderContext.newPage();

    try {
      await createLeaderInLobby(pageLeader);
      await reachSection5(pageLeader, [pageLeader]);

      // Exactly one WebGL canvas in DOM
      const canvasCount = await pageLeader.locator('canvas').count();
      expect(canvasCount).toBe(1);

      // Verify touch targets >= 44x44
      const finishBtn = pageLeader.getByTestId('finish-study-btn');
      const finishBox = await finishBtn.boundingBox();
      expect(finishBox).not.toBeNull();
      expect(finishBox!.height).toBeGreaterThanOrEqual(44);
      expect(finishBox!.width).toBeGreaterThanOrEqual(44);

      const challengeItem = pageLeader.getByTestId('weekly-challenge-1');
      const chBox = await challengeItem.boundingBox();
      expect(chBox).not.toBeNull();
      expect(chBox!.height).toBeGreaterThanOrEqual(44);
      expect(chBox!.width).toBeGreaterThanOrEqual(44);

      // Verify zero occurrences of "Assistant" in page DOM
      const pageText = await pageLeader.innerText('body');
      expect(pageText).not.toContain('Assistant');
      expect(pageText).toContain('Study Leader');
    } finally {
      await closeLiveSession(pageLeader);
      await leaderContext.close();
    }
  });
});

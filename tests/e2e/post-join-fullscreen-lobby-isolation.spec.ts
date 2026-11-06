import { expect as baseExpect, test, type Page } from '@playwright/test';

const expect = baseExpect.configure({ timeout: 15_000 });

interface StashedLeaderCredentials {
  sessionCode: string;
  leaderToken: string;
}

/** Reads the Study Leader's credentials BEFORE any `Leave` clears `sessionStorage`. */
async function stashLeaderCredentials(
  page: Page,
): Promise<StashedLeaderCredentials | null> {
  return page.evaluate(() => {
    const raw = sessionStorage.getItem('ya-bible-study.session-credentials');
    if (!raw) return null;
    const creds = JSON.parse(raw) as {
      sessionCode?: string;
      leaderToken?: string;
    };
    if (!creds.sessionCode || !creds.leaderToken) return null;
    return { sessionCode: creds.sessionCode, leaderToken: creds.leaderToken };
  });
}

/** Never-throwing bounded cleanup using pre-stashed Study Leader credentials. */
async function closeSessionWith(
  page: Page,
  creds: StashedLeaderCredentials | null,
): Promise<void> {
  if (!creds?.sessionCode || !creds.leaderToken) {
    return;
  }
  try {
    await Promise.race([
      page.evaluate(
        async ({ sessionCode, leaderToken }) => {
          try {
            const protocol =
              window.location.protocol === 'https:' ? 'wss:' : 'ws:';
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
                sessionCode,
                leaderToken,
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
        },
        { sessionCode: creds.sessionCode, leaderToken: creds.leaderToken },
      ),
      new Promise<void>((resolve) => setTimeout(resolve, 5000)),
    ]);
  } catch {
    // Cleanup must never fail or hang the suite.
  }
}

/** Never-throwing bounded cleanup reading current `sessionStorage` credentials. */
async function closeLiveSession(page: Page): Promise<void> {
  try {
    const creds = await stashLeaderCredentials(page);
    await closeSessionWith(page, creds);
  } catch {
    // Cleanup must never fail or hang the suite.
  }
}

async function expectZeroWelcomeChromeAndFullViewport(
  page: Page,
): Promise<void> {
  await expect(page.locator('.sanctuary-hero')).toHaveCount(0);
  await expect(page.locator('.sanctuary-stage-card')).toHaveCount(0);
  await expect(page.locator('.sanctuary-stage-header')).toHaveCount(0);
  await expect(page.locator('.sacred-stage-pill-grid')).toHaveCount(0);
  await expect(page.locator('[data-stage-pill]')).toHaveCount(0);
  await expect(page.locator('.sanctuary-stage-copy')).toHaveCount(0);
  await expect(page.locator('.sanctuary-footer')).toHaveCount(0);
  await expect(page.getByTestId('sanctuary-health-pill')).toHaveCount(0);

  const metrics = await page.evaluate(() => {
    const main = document.querySelector('main');
    const mainRect = main?.getBoundingClientRect();
    const leaveBtn = document.querySelector(
      '[data-testid="active-session-leave-btn"]',
    );
    const leaveRect = leaveBtn?.getBoundingClientRect();
    return {
      hasFullscreenClass:
        main?.classList.contains('sanctuary-column--fullscreen') ?? false,
      mainHeight: mainRect?.height ?? 0,
      innerHeight: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      leaveHeight: leaveRect?.height ?? 0,
      canvasCount: document.querySelectorAll('canvas').length,
    };
  });

  expect(metrics.hasFullscreenClass).toBe(true);
  expect(metrics.mainHeight).toBeGreaterThanOrEqual(metrics.innerHeight);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
  expect(metrics.leaveHeight).toBeGreaterThanOrEqual(44);
  expect(metrics.canvasCount).toBeLessThanOrEqual(1);
}

test.describe('Post-Join Fullscreen Isolation & Participant Waiting View', () => {
  test.describe.configure({ timeout: 90_000 });

  test('Scenarios 1–4: mobile 390x844 full-screen post-join shell, Participant waiting isolation, Study Leader lobby controls, and single persistent WebGL canvas across Join/Leave', async ({
    browser,
  }) => {
    const leaderContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const pageLeader = await leaderContext.newPage();
    const participantAContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const pageParticipantA = await participantAContext.newPage();
    const participantBContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const pageParticipantB = await participantBContext.newPage();

    const pageErrors: string[] = [];
    for (const p of [pageLeader, pageParticipantA, pageParticipantB]) {
      p.on('pageerror', (err) => pageErrors.push(String(err)));
    }

    let leaderCreds: StashedLeaderCredentials | null = null;

    try {
      // -------------------------------------------------------------------
      // Pre-join Welcome state on Study Leader: hero, 6 stage pills, health pill
      // -------------------------------------------------------------------
      await pageLeader.goto('/');
      await expect(pageLeader.locator('.sanctuary-hero')).toBeVisible();
      await expect(pageLeader.locator('.sanctuary-stage-card')).toBeVisible();
      await expect(pageLeader.locator('[data-stage-pill]')).toHaveCount(6);
      await expect(pageLeader.getByTestId('sanctuary-health-pill')).toBeVisible();

      // Tag initial WebGL <canvas> on Study Leader and switch stage to star-of-faith
      const leaderHasInitialCanvas = await pageLeader.evaluate(() => {
        const canvas = document.querySelector('canvas');
        (window as unknown as { __initialCanvas?: Element | null }).__initialCanvas =
          canvas;
        return Boolean(canvas);
      });
      expect(leaderHasInitialCanvas).toBe(true);

      await pageLeader.getByTestId('stage-pill-star-of-faith').click();
      await expect(pageLeader.getByTestId('sacred-3d-scene')).toHaveAttribute(
        'data-stage',
        'star-of-faith',
      );

      // -------------------------------------------------------------------
      // Study Leader creates a session -> enters `setup`
      // -------------------------------------------------------------------
      await pageLeader.getByTestId('welcome-role-leader').click();
      await expect(pageLeader.getByTestId('leader-access-sheet')).toBeVisible();
      await pageLeader.getByLabel(/Leader Name/i).fill('Claire');
      await pageLeader.getByRole('button', { name: 'Create Room' }).click();
      await expect(pageLeader.getByTestId('study-setup-screen')).toBeVisible();

      leaderCreds = await stashLeaderCredentials(pageLeader);
      expect(leaderCreds?.sessionCode).toMatch(/^[A-Z0-9]{6}$/);
      const sessionCode = leaderCreds!.sessionCode;

      // Scenario 1 & 4 on Study Leader in `setup`: zero Welcome chrome, stage reset to sanctuary-emblem, exact same <canvas>
      await expectZeroWelcomeChromeAndFullViewport(pageLeader);
      await expect(pageLeader.getByTestId('active-session-banner')).toHaveAttribute(
        'data-compact',
        'true',
      );
      await expect(pageLeader.getByTestId('active-user-role')).toHaveText(
        'Study Leader',
      );
      await expect(pageLeader.getByTestId('active-leader-pin')).toBeVisible();
      await expect(pageLeader.getByTestId('session-resilience-chip')).toBeVisible();
      await expect(pageLeader.getByTestId('sacred-3d-scene')).toHaveAttribute(
        'data-stage',
        'sanctuary-emblem',
      );
      expect(
        await pageLeader.evaluate(
          () =>
            document.querySelector('canvas') ===
            (window as unknown as { __initialCanvas?: Element | null })
              .__initialCanvas,
        ),
      ).toBe(true);

      // -------------------------------------------------------------------
      // Scenario 2 (early `setup` join): Participant A joins via /join/:code BEFORE lobby opens
      // -------------------------------------------------------------------
      await pageParticipantA.goto(`/join/${sessionCode}`);
      await expect(
        pageParticipantA.getByTestId('participant-join-sheet'),
      ).toBeVisible();
      const participantHasInitialCanvas = await pageParticipantA.evaluate(() => {
        const canvas = document.querySelector('canvas');
        (window as unknown as { __initialCanvas?: Element | null }).__initialCanvas =
          canvas;
        return Boolean(canvas);
      });
      expect(participantHasInitialCanvas).toBe(true);

      await pageParticipantA.getByLabel(/Your Name/i).fill('Daniel');
      await pageParticipantA
        .getByRole('button', { name: 'Join Study' })
        .click();

      await expect(
        pageParticipantA.getByTestId('participant-waiting-screen'),
      ).toBeVisible();
      await expect(
        pageParticipantA.getByTestId('participant-waiting-message'),
      ).toHaveText('The study leader will begin shortly');

      // URL /join/:code cleaned up to /
      await expect.poll(() => new URL(pageParticipantA.url()).pathname).toBe('/');

      // Full-screen + zero Welcome chrome + zero lobby chrome during early setup
      await expectZeroWelcomeChromeAndFullViewport(pageParticipantA);
      await expect(pageParticipantA.getByTestId('title-lobby')).toHaveCount(0);
      await expect(
        pageParticipantA.getByTestId('study-setup-screen'),
      ).toHaveCount(0);
      await expect(
        pageParticipantA.getByTestId('active-leader-pin-box'),
      ).toHaveCount(0);
      await expect(
        pageParticipantA.getByTestId('active-leader-pin'),
      ).toHaveCount(0);

      // -------------------------------------------------------------------
      // Scenario 2 & 3 (`lobby`): Study Leader opens Title Lobby; Participant B joins
      // -------------------------------------------------------------------
      await pageLeader.getByTestId('study-setup-continue').click();
      await expect(pageLeader.getByTestId('title-lobby')).toBeVisible();

      // Study Leader sees clean full-screen TitleLobbyScreen
      await expectZeroWelcomeChromeAndFullViewport(pageLeader);
      await expect(pageLeader.getByTestId('title-lobby')).toHaveAttribute(
        'data-mode',
        'leader',
      );
      await expect(pageLeader.getByTestId('title-lobby-title')).toHaveText(
        'Great Is Your Faith',
      );
      await expect(pageLeader.getByTestId('title-lobby-citation')).toContainText(
        'Matthew 15:21–28',
      );
      await expect(
        pageLeader.getByTestId('title-lobby-attendee-count'),
      ).toHaveText('1');
      await expect(
        pageLeader.getByTestId('title-lobby-section-count'),
      ).toHaveText('5');
      await expect(pageLeader.getByTestId('title-lobby-duration')).toHaveText(
        '90m',
      );
      await expect(pageLeader.getByTestId('lobby-share-trigger')).toBeVisible();
      await expect(pageLeader.getByTestId('lobby-start-study')).toBeVisible();

      const leaderLobbyButtonHeights = await pageLeader.evaluate(() => {
        const share = document
          .querySelector('[data-testid="lobby-share-trigger"]')
          ?.getBoundingClientRect();
        const start = document
          .querySelector('[data-testid="lobby-start-study"]')
          ?.getBoundingClientRect();
        return {
          shareHeight: share?.height ?? 0,
          startHeight: start?.height ?? 0,
        };
      });
      expect(leaderLobbyButtonHeights.shareHeight).toBeGreaterThanOrEqual(44);
      expect(leaderLobbyButtonHeights.startHeight).toBeGreaterThanOrEqual(44);

      // Participant B joins directly into `lobby` after switching Welcome stage pill first
      await pageParticipantB.goto('/');
      await pageParticipantB.getByTestId('stage-pill-gospel-codex').click();
      await expect(pageParticipantB.getByTestId('sacred-3d-scene')).toHaveAttribute(
        'data-stage',
        'gospel-codex',
      );
      await pageParticipantB.getByTestId('welcome-role-participant').click();
      await pageParticipantB.getByLabel(/Session Code/i).fill(sessionCode);
      await pageParticipantB.getByLabel(/Your Name/i).fill('Maya');
      await pageParticipantB
        .getByRole('button', { name: 'Join Study' })
        .click();

      await expect(
        pageParticipantB.getByTestId('participant-waiting-screen'),
      ).toBeVisible();

      // Study Leader live ATTENDEES count updates to 2
      await expect(
        pageLeader.getByTestId('title-lobby-attendee-count'),
      ).toHaveText('2');

      // Both Participants in `lobby` see ONLY ParticipantWaitingScreen + 3D sanctuary-emblem
      for (const participantPage of [pageParticipantA, pageParticipantB]) {
        await expectZeroWelcomeChromeAndFullViewport(participantPage);
        await expect(
          participantPage.getByTestId('participant-waiting-screen'),
        ).toBeVisible();
        await expect(
          participantPage.getByTestId('participant-waiting-message'),
        ).toHaveText('The study leader will begin shortly');
        await expect(
          participantPage.getByTestId('sacred-3d-scene'),
        ).toHaveAttribute('data-stage', 'sanctuary-emblem');
        await expect(
          participantPage.getByTestId('sacred-3d-scene'),
        ).toHaveAttribute('data-accent-mode', 'default');

        // Zero TitleLobbyScreen elements or leader controls
        await expect(participantPage.getByTestId('title-lobby')).toHaveCount(0);
        await expect(
          participantPage.getByTestId('title-lobby-title'),
        ).toHaveCount(0);
        await expect(
          participantPage.getByTestId('title-lobby-citation'),
        ).toHaveCount(0);
        await expect(
          participantPage.getByTestId('title-lobby-metrics'),
        ).toHaveCount(0);
        await expect(
          participantPage.getByTestId('title-lobby-attendee-count'),
        ).toHaveCount(0);
        await expect(
          participantPage.getByTestId('title-lobby-section-count'),
        ).toHaveCount(0);
        await expect(
          participantPage.getByTestId('title-lobby-duration'),
        ).toHaveCount(0);
        await expect(
          participantPage.getByTestId('lobby-share-trigger'),
        ).toHaveCount(0);
        await expect(
          participantPage.getByTestId('lobby-start-study'),
        ).toHaveCount(0);
        await expect(
          participantPage.getByTestId('active-leader-pin-box'),
        ).toHaveCount(0);

        // Verify the 3D emblem + waiting message cluster is vertically centered in the viewport
        const centering = await participantPage.evaluate(() => {
          const bar = document
            .querySelector('[data-testid="post-join-session-bar"]')
            ?.getBoundingClientRect();
          const stage = document
            .querySelector('[data-testid="post-join-stage-shell"]')
            ?.getBoundingClientRect();
          const waiting = document
            .querySelector('[data-testid="participant-waiting-screen"]')
            ?.getBoundingClientRect();
          if (!bar || !stage || !waiting) return null;
          const clusterTop = stage.top;
          const clusterBottom = waiting.bottom;
          const clusterMidpoint = (clusterTop + clusterBottom) / 2;
          const availableMidpoint = (bar.bottom + window.innerHeight) / 2;
          return {
            topGap: clusterTop - bar.bottom,
            bottomGap: window.innerHeight - clusterBottom,
            midpointDelta: Math.abs(clusterMidpoint - availableMidpoint),
          };
        });
        expect(centering).not.toBeNull();
        expect(centering!.topGap).toBeGreaterThan(24);
        expect(centering!.bottomGap).toBeGreaterThan(24);
        expect(centering!.midpointDelta).toBeLessThanOrEqual(80);

        const bodyText = await participantPage.locator('body').innerText();
        expect(bodyText).not.toContain('Assistant');
      }

      // Participant B leaves -> Welcome chrome remounts cleanly; Leader ATTENDEES drops to 1
      await pageParticipantB.getByTestId('active-session-leave-btn').click();
      await expect(pageParticipantB.locator('.sanctuary-hero')).toBeVisible();
      await expect(pageParticipantB.locator('[data-stage-pill]')).toHaveCount(6);
      await expect(
        pageParticipantB.getByTestId('sacred-3d-scene'),
      ).toHaveAttribute('data-stage', 'sanctuary-emblem');
      await participantBContext.close();

      await expect(
        pageLeader.getByTestId('title-lobby-attendee-count'),
      ).toHaveText('1');

      // -------------------------------------------------------------------
      // Scenario 3 & 4 (`in_progress` + Leave): Start Study -> Section 1 -> Leave
      // -------------------------------------------------------------------
      await pageLeader.getByTestId('lobby-start-study').click();

      for (const activePage of [pageLeader, pageParticipantA]) {
        await expect(
          activePage.getByTestId('section-one-handoff'),
        ).toBeVisible();
        await expectZeroWelcomeChromeAndFullViewport(activePage);
        await expect(activePage.getByTestId('sacred-3d-scene')).toHaveAttribute(
          'data-stage',
          'prayer-orb',
        );
        expect(
          await activePage.evaluate(
            () =>
              document.querySelector('canvas') ===
              (window as unknown as { __initialCanvas?: Element | null })
                .__initialCanvas,
          ),
        ).toBe(true);
      }

      // Participant A leaves Section 1 -> Welcome chrome remounts, stage resets to sanctuary-emblem, same <canvas>
      await pageParticipantA.getByTestId('active-session-leave-btn').click();
      await expect(pageParticipantA.locator('.sanctuary-hero')).toBeVisible();
      await expect(pageParticipantA.locator('[data-stage-pill]')).toHaveCount(6);
      await expect(
        pageParticipantA.getByTestId('sanctuary-health-pill'),
      ).toBeVisible();
      await expect(
        pageParticipantA.getByTestId('sacred-3d-scene'),
      ).toHaveAttribute('data-stage', 'sanctuary-emblem');
      await expect(
        pageParticipantA.getByTestId('sacred-3d-scene'),
      ).toHaveAttribute('data-accent-mode', 'default');
      expect(
        await pageParticipantA.evaluate(
          () =>
            document.querySelector('canvas') ===
            (window as unknown as { __initialCanvas?: Element | null })
              .__initialCanvas,
        ),
      ).toBe(true);

      // Study Leader leaves -> Welcome chrome remounts, stage resets to sanctuary-emblem, same <canvas>
      await pageLeader.getByTestId('active-session-leave-btn').click();
      await expect(pageLeader.locator('.sanctuary-hero')).toBeVisible();
      await expect(pageLeader.locator('[data-stage-pill]')).toHaveCount(6);
      await expect(
        pageLeader.getByTestId('sanctuary-health-pill'),
      ).toBeVisible();
      await expect(pageLeader.getByTestId('sacred-3d-scene')).toHaveAttribute(
        'data-stage',
        'sanctuary-emblem',
      );
      await expect(pageLeader.getByTestId('sacred-3d-scene')).toHaveAttribute(
        'data-accent-mode',
        'default',
      );
      expect(
        await pageLeader.evaluate(
          () =>
            document.querySelector('canvas') ===
            (window as unknown as { __initialCanvas?: Element | null })
              .__initialCanvas,
        ),
      ).toBe(true);

      expect(pageErrors).toEqual([]);
    } finally {
      await closeSessionWith(pageLeader, leaderCreds);
      await closeLiveSession(pageLeader);
      await Promise.allSettled([
        participantAContext.close(),
        participantBContext.close(),
        leaderContext.close(),
      ]);
    }
  });

  test('Scenario 5: Desktop Dual Side-by-Side Mode (1440x900) isolates ParticipantWaitingScreen in right frame from TitleLobbyScreen in left frame', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();

    try {
      await page.goto('/?mode=dual');
      await expect(page.getByTestId('simulation-toolbar')).toBeVisible();

      const leaderFrame = page.getByTestId('leader-frame');
      const participantFrame = page.getByTestId('participant-frame');
      await expect(leaderFrame).toBeVisible();
      await expect(participantFrame).toBeVisible();

      // Study Leader frame renders TitleLobbyScreen; Participant frame renders ONLY ParticipantWaitingScreen
      await expect(leaderFrame.getByTestId('title-lobby')).toBeVisible();
      await expect(leaderFrame.getByTestId('title-lobby')).toHaveAttribute(
        'data-mode',
        'leader',
      );
      await expect(leaderFrame.getByTestId('lobby-start-study')).toBeVisible();
      await expect(
        leaderFrame.getByTestId('participant-waiting-screen'),
      ).toHaveCount(0);

      await expect(
        participantFrame.getByTestId('participant-waiting-screen'),
      ).toBeVisible();
      await expect(
        participantFrame.getByTestId('participant-waiting-message'),
      ).toHaveText('The study leader will begin shortly');
      await expect(participantFrame.getByTestId('title-lobby')).toHaveCount(0);
      await expect(
        participantFrame.getByTestId('title-lobby-metrics'),
      ).toHaveCount(0);
      await expect(
        participantFrame.getByTestId('lobby-share-trigger'),
      ).toHaveCount(0);
      await expect(
        participantFrame.getByTestId('lobby-start-study'),
      ).toHaveCount(0);

      // Switching virtual Participant tabs keeps the waiting screen isolated
      await page.getByTestId('participant-tab-daniel-reyes').click();
      await expect(
        participantFrame.getByTestId('participant-waiting-screen'),
      ).toBeVisible();
      await expect(participantFrame.getByTestId('title-lobby')).toHaveCount(0);

      // WebGL budget <= 2 across the entire Dual Mode viewport
      expect(await page.locator('canvas').count()).toBeLessThanOrEqual(2);

      // Start Study advances both frames to Section 1
      await leaderFrame.getByTestId('lobby-start-study').click();
      await expect(
        leaderFrame.getByTestId('section-one-handoff'),
      ).toBeVisible();
      await expect(
        participantFrame.getByTestId('section-one-handoff'),
      ).toBeVisible();
    } finally {
      const exitBtn = page.getByTestId('dual-mode-exit-btn');
      if (await exitBtn.isVisible().catch(() => false)) {
        await exitBtn.click().catch(() => undefined);
      }
      await closeLiveSession(page);
      await context.close();
    }
  });

  test('Session-leak hygiene: GET /api/health activeSessionCount returns to 0', async ({
    request,
  }) => {
    const response = await request.get('/api/health');
    expect(response.ok()).toBe(true);
    const body = (await response.json()) as { activeSessionCount: number };
    expect(body.activeSessionCount).toBe(0);
  });
});

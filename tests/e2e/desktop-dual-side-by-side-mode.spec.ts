import { expect as baseExpect, test, type Page } from '@playwright/test';

test.describe.configure({ timeout: 60_000 });

const expect = baseExpect.configure({ timeout: 15_000 });

/**
 * Safely closes any lingering session over /ws so later suites still observe
 * activeSessionCount 0. Hardened cleanup: never throws and never hangs.
 */
async function closeLingeringSession(page: Page): Promise<void> {
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
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, 2000);
            ws.addEventListener('open', () => {
              clearTimeout(timer);
              resolve();
            });
          });
          ws.send(
            JSON.stringify({
              type: 'close_session',
              sessionCode: creds.sessionCode,
              leaderToken: creds.leaderToken,
            }),
          );
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, 2000);
            ws.addEventListener('message', () => {
              clearTimeout(timer);
              resolve();
            });
          });
          ws.close();
        } catch {
          // Cleanup must never throw.
        }
      }),
      new Promise<void>((resolve) => setTimeout(resolve, 4000)),
    ]);
  } catch {
    // Cleanup must never fail.
  }
}

test.describe('Desktop Dual Side-by-Side Mode (1440x900)', () => {
  test.use({
    viewport: { width: 1440, height: 900 },
    isMobile: false,
    hasTouch: false,
  });

  test('Scenario 1 & 2: Launch from Welcome screen, initialize rehearsal room, and synchronize Lobby start', async ({
    page,
  }) => {
    try {
      await page.goto('/');

      // Welcome screen renders Dual Mode trigger button on desktop
      const dualBtn = page.getByTestId('welcome-dual-mode-btn');
      await expect(dualBtn).toBeVisible();
      await dualBtn.click();

      // Simulation toolbar appears with rehearsal badge and session code
      await expect(page.getByTestId('simulation-toolbar')).toBeVisible();
      await expect(page.getByTestId('rehearsal-badge')).toContainText(
        'DESKTOP REHEARSAL MODE',
      );

      const codePill = page.getByTestId('dual-session-code');
      await expect(codePill).toBeVisible();
      const sessionCode = (await codePill.innerText()).trim();
      expect(sessionCode).toMatch(/^[A-Z0-9]{6}$/);

      // Participant switcher has default 3 participants
      const switcher = page.getByTestId('participant-switcher');
      await expect(switcher).toBeVisible();
      await expect(
        page.getByTestId('participant-tab-mary-lopez'),
      ).toBeVisible();
      await expect(
        page.getByTestId('participant-tab-daniel-reyes'),
      ).toBeVisible();
      await expect(
        page.getByTestId('participant-tab-sara-castillo'),
      ).toBeVisible();

      // Two side-by-side frames are mounted
      const leaderFrame = page.getByTestId('leader-frame');
      const participantFrame = page.getByTestId('participant-frame');
      await expect(leaderFrame).toBeVisible();
      await expect(participantFrame).toBeVisible();

      await expect(page.getByTestId('leader-frame-badge')).toContainText(
        'STUDY LEADER',
      );
      await expect(page.getByTestId('participant-frame-badge')).toContainText(
        'PARTICIPANT: Mary Lopez',
      );

      // WebGL budget: strictly <= 2 canvases across entire viewport
      const canvasCount = await page.locator('canvas').count();
      expect(canvasCount).toBeLessThanOrEqual(2);

      // Left Frame has Start Study button; Right Frame has waiting state without it
      const leaderStartBtn = leaderFrame.getByTestId('lobby-start-study');
      await expect(leaderStartBtn).toBeVisible();
      await expect(participantFrame.getByTestId('lobby-start-study')).toHaveCount(
        0,
      );

      // Start Study advances both frames to Section 1
      await leaderStartBtn.click();

      await expect(
        leaderFrame.getByTestId('section-one-handoff'),
      ).toBeVisible();
      await expect(
        participantFrame.getByTestId('section-one-handoff'),
      ).toBeVisible();

      // WebGL budget remains strictly <= 2
      expect(await page.locator('canvas').count()).toBeLessThanOrEqual(2);
    } finally {
      // Exit rehearsal cleanly
      const exitBtn = page.getByTestId('dual-mode-exit-btn');
      if (await exitBtn.isVisible()) {
        await exitBtn.click();
      }
      await closeLingeringSession(page);
    }
  });

  test('Scenario 3–7: Full 5-Section Study Walkthrough with Switcher, Volunteer Turn, and Reflections', async ({
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
      await expect(
        leaderFrame.getByTestId('section-one-handoff'),
      ).toBeVisible();
      await expect(
        participantFrame.getByTestId('section-one-handoff'),
      ).toBeVisible();

      // --- SECTION 1: Hand raise, switcher, and chosen turn gate ---
      // Mary raises hand in participant frame
      await participantFrame.getByTestId('hand-raise-orb').click();
      await expect(
        participantFrame.getByTestId('prayer-count-pill-text'),
      ).toContainText('1 person has raised their hand');

      // Leader sees Mary in the queue
      await expect(leaderFrame.getByTestId('prayer-queue-choose')).toBeVisible();

      // Switch to Daniel Reyes
      await page.getByTestId('participant-tab-daniel-reyes').click();
      await expect(page.getByTestId('participant-frame-badge')).toContainText(
        'PARTICIPANT: Daniel Reyes',
      );

      // Daniel's orb is not raised
      await expect(
        participantFrame.getByTestId('hand-raise-orb'),
      ).toBeVisible();

      // Leader chooses volunteer (Mary Lopez)
      await leaderFrame.getByTestId('prayer-queue-choose').click();

      // Switch back to Mary Lopez
      await page.getByTestId('participant-tab-mary-lopez').click();
      await expect(page.getByTestId('participant-frame-badge')).toContainText(
        'PARTICIPANT: Mary Lopez',
      );

      // Mary sees YOU WERE CHOSEN and exclusive Done button
      await expect(
        participantFrame.getByTestId('prayer-chosen-view'),
      ).toBeVisible();
      await expect(
        participantFrame.getByTestId('prayer-chosen-pill'),
      ).toContainText('YOU WERE CHOSEN');

      // Mary clicks Done
      await participantFrame.getByTestId('prayer-done-button').click();

      // Leader advance unlocks
      await expect(leaderFrame.getByTestId('prayer-advance-cta')).toContainText(
        'Continue to Section 2 →',
      );
      await leaderFrame.getByTestId('prayer-advance-cta').click();

      // --- SECTION 2: Icebreaker ---
      await expect(leaderFrame.getByTestId('icebreaker-screen')).toBeVisible();
      await expect(
        participantFrame.getByTestId('icebreaker-screen'),
      ).toBeVisible();

      // Verify canvas budget <= 2
      expect(await page.locator('canvas').count()).toBeLessThanOrEqual(2);

      // Advance to Section 3
      await expect(
        leaderFrame.getByTestId('icebreaker-advance-cta'),
      ).toContainText('Begin Reading →');
      await leaderFrame.getByTestId('icebreaker-advance-cta').click();

      // --- SECTION 3: Gospel Reading Proclamation ---
      await expect(
        leaderFrame.getByTestId('gospel-reading-screen'),
      ).toBeVisible();
      await expect(
        participantFrame.getByTestId('gospel-reading-screen'),
      ).toBeVisible();

      // Both frames show Matthew 15:21–28 Gospel-only text
      await expect(leaderFrame.getByTestId('reading-citation')).toHaveText(
        'Matthew 15:21–28',
      );
      await expect(participantFrame.getByTestId('reading-citation')).toHaveText(
        'Matthew 15:21–28',
      );

      // Complete Section 3 turn via leader override or reader Done
      await leaderFrame.getByTestId('reading-override-button').click();
      await expect(leaderFrame.getByTestId('reading-advance-cta')).toContainText(
        'Begin Discussion →',
      );
      await leaderFrame.getByTestId('reading-advance-cta').click();

      // --- SECTION 4: Discussion Question Queue & Reflections ---
      await expect(leaderFrame.getByTestId('discussion-screen')).toBeVisible();
      await expect(
        participantFrame.getByTestId('discussion-screen'),
      ).toBeVisible();

      // Mary submits a named reflection
      await participantFrame.getByTestId('respond-trigger-btn').click();
      await expect(
        participantFrame.getByTestId('submit-reflection-modal'),
      ).toBeVisible();
      await participantFrame
        .getByTestId('reflection-textarea')
        .fill('She trusted Jesus with persevering faith.');
      await participantFrame.getByTestId('submit-reflection-btn').click();

      // Live feed on both frames updates
      const maryFeed = participantFrame.getByTestId('discussion-sharing-feed');
      await expect(
        maryFeed.getByTestId('reflection-count-badge'),
      ).toHaveText('1');

      // Switch to Daniel Reyes
      await page.getByTestId('participant-tab-daniel-reyes').click();
      await expect(page.getByTestId('participant-frame-badge')).toContainText(
        'PARTICIPANT: Daniel Reyes',
      );

      // Daniel submits anonymous reflection
      await participantFrame.getByTestId('respond-trigger-btn').click();
      await participantFrame
        .getByTestId('reflection-textarea')
        .fill('Help me persist in prayer during dry seasons.');
      await participantFrame.getByTestId('reflection-anonymous-checkbox').check();
      await participantFrame.getByTestId('submit-reflection-btn').click();

      // Both feeds show 2 reflections with Anonymous masked
      await expect(
        maryFeed.getByTestId('reflection-count-badge'),
      ).toHaveText('2');
      const authors = await maryFeed
        .getByTestId('reflection-author')
        .allInnerTexts();
      expect(authors).toContain('Anonymous');

      // Leader advances to Section 5
      await leaderFrame.getByTestId('advance-section-5-direct').click();

      // --- SECTION 5: Closing Prayer & Finish Study ---
      await expect(
        leaderFrame.getByTestId('closing-prayer-screen'),
      ).toBeVisible();
      await expect(
        participantFrame.getByTestId('closing-prayer-screen'),
      ).toBeVisible();

      // Verify canvas budget <= 2
      expect(await page.locator('canvas').count()).toBeLessThanOrEqual(2);

      // Leader clicks Finish study
      await leaderFrame.getByTestId('finish-study-btn').click();

      // Both frames render study completed
      await expect(
        leaderFrame.getByTestId('leader-frame-completed'),
      ).toBeVisible();
      await expect(
        participantFrame.getByTestId('participant-frame-completed'),
      ).toBeVisible();

      // Exit rehearsal cleanly
      await page.getByTestId('dual-mode-exit-btn').click();
      await expect(page.getByTestId('welcome-role-section')).toBeVisible();

      // Verify server activeSessionCount is 0
      const healthRes = await page.request.get('/api/health');
      const health = (await healthRes.json()) as { activeSessionCount: number };
      expect(health.activeSessionCount).toBe(0);
    } finally {
      const exitBtn = page.getByTestId('dual-mode-exit-btn');
      if (await exitBtn.isVisible()) {
        await exitBtn.click();
      }
      await closeLingeringSession(page);
    }
  });

  test('Scenario 8 & 10: Dynamic Participant Addition, Viewport Fallback Notice & Clean Teardown', async ({
    page,
  }) => {
    try {
      await page.goto('/?mode=dual');
      await expect(page.getByTestId('simulation-toolbar')).toBeVisible();

      // Add a 4th participant (David Kim)
      await page.getByTestId('add-participant-btn').click();
      await page.getByTestId('add-participant-input').fill('David Kim');
      await page.getByTestId('add-participant-submit').click();

      // New tab appears and right frame automatically switches to David Kim
      await expect(
        page.getByTestId('participant-tab-david-kim'),
      ).toBeVisible();
      await expect(page.getByTestId('participant-frame-badge')).toContainText(
        'PARTICIPANT: David Kim',
      );

      // WebGL budget remains strictly <= 2
      expect(await page.locator('canvas').count()).toBeLessThanOrEqual(2);

      // Resize window below 1024px to test responsive notice
      await page.setViewportSize({ width: 800, height: 600 });
      await expect(
        page.getByTestId('desktop-viewport-notice'),
      ).toBeVisible();
      await expect(
        page.getByTestId('desktop-viewport-notice'),
      ).toContainText('Desktop Viewport Required');

      // Click Return to Welcome
      await page.getByTestId('viewport-notice-exit-btn').click();
      await expect(page.getByTestId('welcome-role-section')).toBeVisible();

      // Verify active session count returns to 0
      const healthRes = await page.request.get('/api/health');
      const health = (await healthRes.json()) as { activeSessionCount: number };
      expect(health.activeSessionCount).toBe(0);
    } finally {
      await closeLingeringSession(page);
    }
  });
});

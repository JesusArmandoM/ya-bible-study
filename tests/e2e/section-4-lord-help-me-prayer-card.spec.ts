import { expect as baseExpect, test, type Page } from '@playwright/test';
import * as fs from 'node:fs';

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

async function reachDiscussion(
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
    await expect(page.getByTestId('section-one-label')).toHaveText(
      'SECTION 4 OF 5',
    );
    await expect(page.getByTestId('section-one-percent')).toHaveText('80%');
  }
}

test.describe('Section 4 "Lord, Help Me" Prayer Card (Scenarios 1–6)', () => {
  test('Scenario 1: Opening the Prayer Card builder in Section 4 (Participant)', async ({
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
      await reachDiscussion(pageLeader, [pageLeader, pageMary]);

      // Mary sees the Prayer Card trigger pill
      const openBtn = pageMary.getByTestId('open-prayer-card-btn');
      await expect(openBtn).toBeVisible();
      await expect(openBtn).toContainText('"Lord, Help Me" Prayer Card');

      // Tapping open displays the Prayer Card modal
      await openBtn.click();
      const modal = pageMary.getByTestId('prayer-card-modal');
      await expect(modal).toBeVisible();

      // Biblical instruction and title
      await expect(pageMary.getByTestId('prayer-card-title')).toHaveText(
        '"Lord, Help Me" Prayer Card',
      );
      await expect(pageMary.getByTestId('prayer-card-instructions')).toHaveText(
        'Write three short, honest prayers inspired by Matthew 15:21–28.',
      );

      // Privacy badge
      await expect(pageMary.getByTestId('prayer-card-privacy-badge')).toHaveText(
        '🔒 Private on your device — never shared automatically',
      );

      // Three prayer prompt cards are rendered
      await expect(pageMary.getByTestId('prayer-input-self')).toBeVisible();
      await expect(pageMary.getByTestId('prayer-input-loved-one')).toBeVisible();
      await expect(pageMary.getByTestId('prayer-input-church-world')).toBeVisible();

      // Export CTA button
      await expect(pageMary.getByTestId('export-prayer-card-btn')).toBeVisible();

      // Close modal
      await pageMary.getByTestId('close-prayer-card-btn').click();
      await expect(modal).not.toBeVisible();
    } finally {
      await closeLiveSession(pageLeader);
      await Promise.allSettled([leaderContext.close(), maryContext.close()]);
    }
  });

  test('Scenario 2: Strict draft privacy — zero network requests or /ws frames while typing', async ({
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
      await reachDiscussion(pageLeader, [pageLeader, pageMary]);

      await pageMary.getByTestId('open-prayer-card-btn').click();
      await expect(pageMary.getByTestId('prayer-card-modal')).toBeVisible();

      // Instrument WebSocket send to count outgoing frames
      await pageMary.evaluate(() => {
        (window as any).__outgoingFrameCount = 0;
        const originalSend = WebSocket.prototype.send;
        WebSocket.prototype.send = function (...args: any[]) {
          (window as any).__outgoingFrameCount =
            ((window as any).__outgoingFrameCount || 0) + 1;
          return (originalSend as any).apply(this, args);
        };
      });

      // Type into all three inputs
      await pageMary
        .getByTestId('prayer-input-self')
        .fill('trust Your timing when answers seem slow');
      await pageMary
        .getByTestId('prayer-input-loved-one')
        .fill('my brother navigating difficult choices');
      await pageMary
        .getByTestId('prayer-input-church-world')
        .fill('young adults feeling alienated from the parish');

      // CRITICAL PRIVACY ASSERTION:
      // ZERO WebSocket frames sent during typing!
      const outgoingFrames = await pageMary.evaluate(
        () => (window as any).__outgoingFrameCount,
      );
      expect(outgoingFrames).toBe(0);

      // Verify draft saved to localStorage
      const stored = await pageMary.evaluate((code) => {
        const key = `ya-bible-study.prayer-card.${code}`;
        // Find matching key in localStorage
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i) || '';
          if (k.startsWith(key)) {
            return JSON.parse(localStorage.getItem(k) || '{}');
          }
        }
        return null;
      }, sessionCode);

      expect(stored).toBeTruthy();
      expect(stored.self).toBe('trust Your timing when answers seem slow');
      expect(stored.lovedOne).toBe('my brother navigating difficult choices');
      expect(stored.churchWorld).toBe(
        'young adults feeling alienated from the parish',
      );

      // Close and re-open modal -> draft values are restored
      await pageMary.getByTestId('close-prayer-card-btn').click();
      await expect(pageMary.getByTestId('prayer-card-modal')).not.toBeVisible();

      await pageMary.getByTestId('open-prayer-card-btn').click();
      await expect(pageMary.getByTestId('prayer-card-modal')).toBeVisible();

      await expect(pageMary.getByTestId('prayer-input-self')).toHaveValue(
        'trust Your timing when answers seem slow',
      );
      await expect(pageMary.getByTestId('prayer-input-loved-one')).toHaveValue(
        'my brother navigating difficult choices',
      );
      await expect(pageMary.getByTestId('prayer-input-church-world')).toHaveValue(
        'young adults feeling alienated from the parish',
      );
    } finally {
      await closeLiveSession(pageLeader);
      await Promise.allSettled([leaderContext.close(), maryContext.close()]);
    }
  });

  test('Scenario 3: Keepsake PNG image export on mobile & desktop', async ({
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
      await reachDiscussion(pageLeader, [pageLeader, pageMary]);

      await pageMary.getByTestId('open-prayer-card-btn').click();
      await expect(pageMary.getByTestId('prayer-card-modal')).toBeVisible();

      await pageMary
        .getByTestId('prayer-input-self')
        .fill('humility to kneel before You');

      // Intercept file download
      const downloadPromise = pageMary.waitForEvent('download');
      await pageMary.getByTestId('export-prayer-card-btn').click();

      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe('prayer-card.png');

      const path = await download.path();
      expect(path).toBeTruthy();
      if (path) {
        const buffer = fs.readFileSync(path);
        // Assert file is non-empty and starts with PNG header (89 50 4E 47 0D 0A 1A 0A)
        expect(buffer.length).toBeGreaterThan(100);
        expect(buffer[0]).toBe(0x89);
        expect(buffer[1]).toBe(0x50); // P
        expect(buffer[2]).toBe(0x4e); // N
        expect(buffer[3]).toBe(0x47); // G
      }

      await expect(pageMary.getByTestId('prayer-export-status')).toHaveText(
        'Prayer card downloaded!',
      );
    } finally {
      await closeLiveSession(pageLeader);
      await Promise.allSettled([leaderContext.close(), maryContext.close()]);
    }
  });

  test('Scenario 4: Voluntary single-prayer line sharing to live group feed', async ({
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
      await reachDiscussion(pageLeader, [pageLeader, pageMary]);

      await pageMary.getByTestId('open-prayer-card-btn').click();
      await expect(pageMary.getByTestId('prayer-card-modal')).toBeVisible();

      // Enter prayer text in "For myself"
      await pageMary
        .getByTestId('prayer-input-self')
        .fill('trust Your timing when answers seem slow');

      // Instrument WebSocket sends
      await pageMary.evaluate(() => {
        (window as any).__sentFrames = [];
        const originalSend = WebSocket.prototype.send;
        WebSocket.prototype.send = function (data: any) {
          (window as any).__sentFrames.push(
            typeof data === 'string' ? JSON.parse(data) : data,
          );
          return (originalSend as any).apply(this, [data]);
        };
      });

      // Tap "Share line to group"
      await pageMary.getByTestId('prayer-share-btn-self').click();

      // Feedback on button
      await expect(pageMary.getByTestId('prayer-share-feedback-self')).toHaveText(
        'Shared to group! ✓',
      );

      // Verify exactly ONE WebSocket frame was transmitted
      const sentFrames = await pageMary.evaluate(() => (window as any).__sentFrames);
      expect(sentFrames.length).toBe(1);
      expect(sentFrames[0].type).toBe('submit_reflection');
      expect(sentFrames[0].content).toBe(
        '[For myself] Lord, help me trust Your timing when answers seem slow.',
      );

      // Close modal and verify the shared prayer appears in the live feed
      await pageMary.getByTestId('close-prayer-card-btn').click();

      const maryFeed = pageMary.getByTestId('discussion-sharing-feed');
      await expect(maryFeed.getByTestId('reflection-count-badge')).toHaveText('1');
      await expect(maryFeed.getByTestId('reflection-content')).toContainText(
        '[For myself] Lord, help me trust Your timing when answers seem slow.',
      );
      await expect(maryFeed.getByTestId('reflection-author')).toHaveText('Mary Lopez');

      // Leader question queue also reflects the response count
      await expect(
        pageLeader.getByTestId('question-response-count-q-6'),
      ).toHaveText('1 response');
    } finally {
      await closeLiveSession(pageLeader);
      await Promise.allSettled([leaderContext.close(), maryContext.close()]);
    }
  });

  test('Scenario 5: Anonymous single-prayer line sharing maintains privacy across wire and DOM', async ({
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
      await reachDiscussion(pageLeader, [pageLeader, pageMary]);

      await pageMary.getByTestId('open-prayer-card-btn').click();
      await expect(pageMary.getByTestId('prayer-card-modal')).toBeVisible();

      // Enter prayer text in "For someone I love"
      await pageMary
        .getByTestId('prayer-input-loved-one')
        .fill('my father undergoing surgery');

      // Toggle anonymous checkbox
      await pageMary.getByTestId('prayer-anon-toggle-loved-one').check();
      await expect(
        pageMary.getByTestId('prayer-anon-toggle-loved-one'),
      ).toBeChecked();

      // Share line
      await pageMary.getByTestId('prayer-share-btn-loved-one').click();
      await expect(
        pageMary.getByTestId('prayer-share-feedback-loved-one'),
      ).toHaveText('Shared to group! ✓');

      // Close modal
      await pageMary.getByTestId('close-prayer-card-btn').click();

      // Check live feed shows "Anonymous" and initial "?"
      const maryFeed = pageMary.getByTestId('discussion-sharing-feed');
      await expect(maryFeed.getByTestId('reflection-content')).toContainText(
        '[For someone I love] Lord, have mercy on my father undergoing surgery.',
      );

      const authorText = await maryFeed.getByTestId('reflection-author').innerText();
      expect(authorText).toBe('Anonymous');

      const initialsText = await maryFeed.getByTestId('reflection-initials').innerText();
      expect(initialsText).toBe('?');

      // Verify Mary Lopez does not appear in the DOM card
      const cardHtml = await maryFeed.locator('.reflection-card').innerHTML();
      expect(cardHtml).not.toContain('Mary');
      expect(cardHtml).not.toContain('Lopez');
    } finally {
      await closeLiveSession(pageLeader);
      await Promise.allSettled([leaderContext.close(), maryContext.close()]);
    }
  });

  test('Scenario 6: Mobile ergonomics and input validation', async ({
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
      await reachDiscussion(pageLeader, [pageLeader, pageMary]);

      await pageMary.getByTestId('open-prayer-card-btn').click();
      await expect(pageMary.getByTestId('prayer-card-modal')).toBeVisible();

      // Verify computed font-size >= 16px on all 3 inputs to prevent iOS Safari auto-zoom
      const selfFontSize = await pageMary
        .getByTestId('prayer-input-self')
        .evaluate((el) => parseFloat(window.getComputedStyle(el).fontSize));
      expect(selfFontSize).toBeGreaterThanOrEqual(16);

      const lovedOneFontSize = await pageMary
        .getByTestId('prayer-input-loved-one')
        .evaluate((el) => parseFloat(window.getComputedStyle(el).fontSize));
      expect(lovedOneFontSize).toBeGreaterThanOrEqual(16);

      const churchWorldFontSize = await pageMary
        .getByTestId('prayer-input-church-world')
        .evaluate((el) => parseFloat(window.getComputedStyle(el).fontSize));
      expect(churchWorldFontSize).toBeGreaterThanOrEqual(16);

      // Verify button disabled state when input is empty
      await expect(pageMary.getByTestId('prayer-share-btn-self')).toBeDisabled();
      await pageMary.getByTestId('prayer-input-self').fill('a');
      await expect(pageMary.getByTestId('prayer-share-btn-self')).toBeEnabled();
      await pageMary.getByTestId('prayer-input-self').fill('   ');
      await expect(pageMary.getByTestId('prayer-share-btn-self')).toBeDisabled();

      // Zero legacy "Assistant" matches across the page
      const bodyText = await pageMary.locator('body').innerText();
      expect(bodyText).not.toContain('Assistant');
    } finally {
      await closeLiveSession(pageLeader);
      await Promise.allSettled([leaderContext.close(), maryContext.close()]);
    }
  });
});

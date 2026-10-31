import { expect as baseExpect, test, type Page } from '@playwright/test';
import { getDefaultStudyDocument } from '../../src/server/studies/greatIsYourFaithSeed';

test.describe.configure({ timeout: 60_000 });

// Per-suite assertion headroom (Session 021-022 hardening): under in-suite contention
// live /ws round trips can stall past the default 5s budget.
const expect = baseExpect.configure({ timeout: 15_000 });

const SEED = getDefaultStudyDocument();

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

test.describe('Section 4 Live Participant Reflections (Scenarios 1–6)', () => {
  test('Scenario 1: Active question view renders empty Sharing feed and "I want to respond" CTA for Participant', async ({
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

      // Participant checks
      await expect(pageMary.getByTestId('participant-question-progress')).toHaveText(
        'QUESTION 1 OF 3',
      );
      await expect(pageMary.getByTestId('participant-active-question-card')).toBeVisible();
      await expect(pageMary.getByTestId('active-question-prompt')).toHaveText(
        'What makes the Canaanite woman\'s faith "great"?',
      );

      // Sharing feed initial empty state
      const feed = pageMary.getByTestId('discussion-sharing-feed');
      await expect(feed).toBeVisible();
      await expect(feed.getByTestId('reflection-count-badge')).toHaveText('0');
      await expect(feed.getByTestId('reflection-feed-empty')).toHaveText(
        'No responses yet. Be the first to share your reflection.',
      );

      // Participant CTA and locked advance note
      const respondBtn = pageMary.getByTestId('respond-trigger-btn');
      await expect(respondBtn).toBeVisible();
      await expect(respondBtn).toContainText('I want to respond');

      const lockedNote = pageMary.getByTestId('participant-locked-note');
      await expect(lockedNote).toBeVisible();
      await expect(lockedNote).toHaveText('Only the leader decides when to advance');
    } finally {
      await closeLiveSession(pageLeader);
      await Promise.allSettled([
        leaderContext.close(),
        maryContext.close(),
      ]);
    }
  });

  test('Scenario 2: Submitting a named reflection updates feed and response counts in real time across clients', async ({
    browser,
  }) => {
    const leaderContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const maryContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const saraContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });

    const pageLeader = await leaderContext.newPage();
    const pageMary = await maryContext.newPage();
    const pageSara = await saraContext.newPage();

    try {
      const sessionCode = await createLeaderInLobby(pageLeader);
      await joinAsParticipant(pageMary, sessionCode, 'Mary Lopez');
      await joinAsParticipant(pageSara, sessionCode, 'Sara Castillo');

      await reachDiscussion(pageLeader, [pageLeader, pageMary, pageSara]);

      // Mary taps 'I want to respond'
      await pageMary.getByTestId('respond-trigger-btn').click();
      const modal = pageMary.getByTestId('submit-reflection-modal');
      await expect(modal).toBeVisible();

      // Enter reflection text
      const reflectionText =
        'She humbled herself before Jesus and trusted His mercy was enough.';
      await pageMary.getByTestId('reflection-textarea').fill(reflectionText);

      // Submit
      await pageMary.getByTestId('submit-reflection-btn').click();
      await expect(modal).not.toBeVisible();

      // Mary's screen feed updates
      const maryFeed = pageMary.getByTestId('discussion-sharing-feed');
      await expect(maryFeed.getByTestId('reflection-count-badge')).toHaveText('1');
      await expect(maryFeed.getByTestId('reflection-author')).toHaveText('Mary Lopez');
      await expect(maryFeed.getByTestId('reflection-initials')).toHaveText('ML');
      await expect(maryFeed.getByTestId('reflection-content')).toHaveText(reflectionText);

      // Sara's screen immediately syncs Mary's reflection
      const saraFeed = pageSara.getByTestId('discussion-sharing-feed');
      await expect(saraFeed.getByTestId('reflection-count-badge')).toHaveText('1');
      await expect(saraFeed.getByTestId('reflection-author')).toHaveText('Mary Lopez');
      await expect(saraFeed.getByTestId('reflection-initials')).toHaveText('ML');
      await expect(saraFeed.getByTestId('reflection-content')).toHaveText(reflectionText);

      // Leader screen question queue response counter updates to '1 response'
      const q1Counter = pageLeader.getByTestId('question-response-count-q-6');
      await expect(q1Counter).toHaveText('1 response');
    } finally {
      await closeLiveSession(pageLeader);
      await Promise.allSettled([
        leaderContext.close(),
        maryContext.close(),
        saraContext.close(),
      ]);
    }
  });

  test('Scenario 3: Submitting an anonymous reflection masks author identity across DOM and wire', async ({
    browser,
  }) => {
    const leaderContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const maryContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const saraContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });

    const pageLeader = await leaderContext.newPage();
    const pageMary = await maryContext.newPage();
    const pageSara = await saraContext.newPage();

    try {
      const sessionCode = await createLeaderInLobby(pageLeader);
      await joinAsParticipant(pageMary, sessionCode, 'Mary Lopez');
      await joinAsParticipant(pageSara, sessionCode, 'Sara Castillo');

      await reachDiscussion(pageLeader, [pageLeader, pageMary, pageSara]);

      // 1. Mary submits named reflection
      await pageMary.getByTestId('respond-trigger-btn').click();
      await pageMary
        .getByTestId('reflection-textarea')
        .fill('She humbled herself before Jesus and trusted His mercy was enough.');
      await pageMary.getByTestId('submit-reflection-btn').click();
      await expect(pageMary.getByTestId('submit-reflection-modal')).not.toBeVisible();

      // 2. Sara submits anonymous reflection
      await pageSara.getByTestId('respond-trigger-btn').click();
      const anonModal = pageSara.getByTestId('submit-reflection-modal');
      await expect(anonModal).toBeVisible();

      const anonText = 'She kept praying, even when Jesus seemed silent.';
      await pageSara.getByTestId('reflection-textarea').fill(anonText);
      await pageSara.getByTestId('reflection-anonymous-checkbox').check();
      await expect(pageSara.getByTestId('reflection-anonymous-checkbox')).toBeChecked();

      await pageSara.getByTestId('submit-reflection-btn').click();
      await expect(anonModal).not.toBeVisible();

      // Both participant screens see the anonymous reflection with 'Anonymous' and '?'
      for (const page of [pageMary, pageSara]) {
        const feed = page.getByTestId('discussion-sharing-feed');
        await expect(feed.getByTestId('reflection-count-badge')).toHaveText('2');

        const authors = await feed.getByTestId('reflection-author').allInnerTexts();
        expect(authors).toContain('Anonymous');
        expect(authors).toContain('Mary Lopez');

        const initials = await feed.getByTestId('reflection-initials').allInnerTexts();
        expect(initials).toContain('?');
        expect(initials).toContain('ML');
      }

      // Leader question queue reflects '2 responses'
      await expect(
        pageLeader.getByTestId('question-response-count-q-6'),
      ).toHaveText('2 responses');

      // CRITICAL WIRE PRIVACY ASSERTION:
      // Inspect raw session state on Mary's page and leader page.
      // Assert that Sara's identity ('Sara' / memberId) NEVER leaks into the anonymous reflection object!
      const leakedOnLeader = await pageLeader.evaluate(() => {
        const raw = sessionStorage.getItem('ya-bible-study.session-credentials');
        return raw;
      });
      expect(leakedOnLeader).toBeTruthy();

      const maryAnonReflection = await pageMary.evaluate(() => {
        // Access React/window state or DOM reflection attributes
        const card = document.querySelector('.reflection-card.is-anonymous');
        return {
          author: card?.querySelector('[data-testid="reflection-author"]')?.textContent,
          initials: card?.querySelector('[data-testid="reflection-initials"]')?.textContent,
          html: card?.outerHTML,
        };
      });

      expect(maryAnonReflection.author).toBe('Anonymous');
      expect(maryAnonReflection.initials).toBe('?');
      expect(maryAnonReflection.html).not.toContain('Sara');
      expect(maryAnonReflection.html).not.toContain('Castillo');
    } finally {
      await closeLiveSession(pageLeader);
      await Promise.allSettled([
        leaderContext.close(),
        maryContext.close(),
        saraContext.close(),
      ]);
    }
  });

  test('Scenario 4: Switching questions partitions reflections per question', async ({
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

      // Submit reflection on Question 1 (q-6)
      await pageMary.getByTestId('respond-trigger-btn').click();
      await pageMary
        .getByTestId('reflection-textarea')
        .fill('Faith means persevering through trials.');
      await pageMary.getByTestId('submit-reflection-btn').click();
      await expect(pageMary.getByTestId('submit-reflection-modal')).not.toBeVisible();

      await expect(
        pageMary.getByTestId('discussion-sharing-feed').getByTestId('reflection-count-badge'),
      ).toHaveText('1');

      // Leader switches to Question 2 (q-5)
      await pageLeader.getByTestId('next-question-btn').click();

      // Mary transitions to Question 2
      await expect(pageMary.getByTestId('participant-question-progress')).toHaveText(
        'QUESTION 2 OF 3',
      );
      await expect(pageMary.getByTestId('active-question-prompt')).toHaveText(
        "Have you ever experienced God's silence in prayer? How did you respond?",
      );

      // Question 2 feed is empty!
      const q2Feed = pageMary.getByTestId('discussion-sharing-feed');
      await expect(q2Feed.getByTestId('reflection-count-badge')).toHaveText('0');
      await expect(q2Feed.getByTestId('reflection-feed-empty')).toBeVisible();

      // Leader queue cards: q-5 shows Active (0 responses), q-6 shows 1 response
      await expect(pageLeader.getByTestId('question-response-count-q-5')).toHaveText('Active');
      await expect(pageLeader.getByTestId('question-response-count-q-6')).toHaveText('1 response');

      // Switch back to Question 1 via card tap
      await pageLeader.getByTestId('question-card-q-6').click();

      // Mary transitions back to Question 1 with its reflection restored!
      await expect(pageMary.getByTestId('participant-question-progress')).toHaveText(
        'QUESTION 1 OF 3',
      );
      const restoredFeed = pageMary.getByTestId('discussion-sharing-feed');
      await expect(restoredFeed.getByTestId('reflection-count-badge')).toHaveText('1');
      await expect(restoredFeed.getByTestId('reflection-content')).toHaveText(
        'Faith means persevering through trials.',
      );
    } finally {
      await closeLiveSession(pageLeader);
      await Promise.allSettled([
        leaderContext.close(),
        maryContext.close(),
      ]);
    }
  });

  test('Scenario 5: Mobile ergonomics and reflection input bounds', async ({
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

      await pageMary.getByTestId('respond-trigger-btn').click();
      const modal = pageMary.getByTestId('submit-reflection-modal');
      await expect(modal).toBeVisible();

      // Check font-size >= 16px to prevent iOS Safari auto-zoom
      const fontSize = await pageMary
        .getByTestId('reflection-textarea')
        .evaluate((el) => window.getComputedStyle(el).fontSize);
      const parsedFontSize = Number.parseFloat(fontSize);
      expect(parsedFontSize).toBeGreaterThanOrEqual(16);

      // Character counter tracks length
      const charCounter = pageMary.getByTestId('reflection-char-counter');
      await expect(charCounter).toHaveText('0 / 1000');

      const submitBtn = pageMary.getByTestId('submit-reflection-btn');
      await expect(submitBtn).toBeDisabled();

      // Whitespace only remains disabled
      await pageMary.getByTestId('reflection-textarea').fill('     ');
      await expect(submitBtn).toBeDisabled();

      // Valid text updates char counter and enables button
      await pageMary
        .getByTestId('reflection-textarea')
        .fill('Trusting even in silence.');
      await expect(charCounter).toHaveText('25 / 1000');
      await expect(submitBtn).not.toBeDisabled();

      // Close button closes modal without submitting
      await pageMary.getByTestId('reflection-modal-close-btn').click();
      await expect(modal).not.toBeVisible();
      await expect(pageMary.getByTestId('reflection-feed-empty')).toBeVisible();
    } finally {
      await closeLiveSession(pageLeader);
      await Promise.allSettled([
        leaderContext.close(),
        maryContext.close(),
      ]);
    }
  });

  test('Scenario 6: Reconnection and late-join hydration restores reflections with privacy', async ({
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

      // Mary submits a named reflection
      await pageMary.getByTestId('respond-trigger-btn').click();
      await pageMary
        .getByTestId('reflection-textarea')
        .fill('Persist in prayer with humility.');
      await pageMary.getByTestId('submit-reflection-btn').click();
      await expect(pageMary.getByTestId('submit-reflection-modal')).not.toBeVisible();

      // 1. Mary reloads the page
      await pageMary.reload();
      await expect(pageMary.getByTestId('discussion-screen')).toBeVisible();

      const reloadedFeed = pageMary.getByTestId('discussion-sharing-feed');
      await expect(reloadedFeed.getByTestId('reflection-count-badge')).toHaveText('1');
      await expect(reloadedFeed.getByTestId('reflection-author')).toHaveText('Mary Lopez');
      await expect(reloadedFeed.getByTestId('reflection-content')).toHaveText(
        'Persist in prayer with humility.',
      );

      // 2. Late-joining Participant Daniel connects
      const danielContext = await browser.newContext({
        viewport: { width: 390, height: 844 },
      });
      const pageDaniel = await danielContext.newPage();

      try {
        await joinAsParticipant(pageDaniel, sessionCode, 'Daniel Reyes');
        await expect(pageDaniel.getByTestId('discussion-screen')).toBeVisible();

        const danielFeed = pageDaniel.getByTestId('discussion-sharing-feed');
        await expect(danielFeed.getByTestId('reflection-count-badge')).toHaveText('1');
        await expect(danielFeed.getByTestId('reflection-author')).toHaveText('Mary Lopez');
        await expect(danielFeed.getByTestId('reflection-content')).toHaveText(
          'Persist in prayer with humility.',
        );
      } finally {
        await danielContext.close();
      }
    } finally {
      await closeLiveSession(pageLeader);
      await Promise.allSettled([
        leaderContext.close(),
        maryContext.close(),
      ]);
    }
  });
});

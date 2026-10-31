import { expect as baseExpect, test, type Page } from '@playwright/test';
import { getDefaultStudyDocument } from '../../src/server/studies/greatIsYourFaithSeed';

// Per-suite assertion headroom (Session 021-022 hardening): under in-suite contention
// (one worker, sequential multi-context scenarios) live /ws round trips can stall
// past the default 5s budget.
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

async function startStudyOnSection1(
  pageLeader: Page,
  participants: Page[],
): Promise<void> {
  await pageLeader.getByTestId('lobby-start-study').click();
  await expect(pageLeader.getByTestId('section-one-handoff')).toBeVisible();
  for (const page of participants) {
    await expect(page.getByTestId('section-one-handoff')).toBeVisible();
  }
}

async function reachIcebreaker(
  pageLeader: Page,
  all: Page[],
): Promise<void> {
  await pageLeader.getByTestId('prayer-override-button').click();
  await expect(pageLeader.getByTestId('prayer-advance-cta')).toContainText(
    'Continue to Section 2 →',
  );
  await pageLeader.getByTestId('prayer-advance-cta').click();
  for (const page of all) {
    await expect(page.getByTestId('icebreaker-screen')).toBeVisible();
    await expect(page.getByTestId('section-one-label')).toHaveText(
      'SECTION 2 OF 5',
    );
    await expect(page.getByTestId('section-one-percent')).toHaveText('40%');
  }
}

async function reachGospelReading(
  pageLeader: Page,
  all: Page[],
): Promise<void> {
  await reachIcebreaker(pageLeader, all);
  await expect(pageLeader.getByTestId('icebreaker-advance-cta')).toContainText(
    'Begin Reading →',
  );
  await pageLeader.getByTestId('icebreaker-advance-cta').click();
  for (const page of all) {
    await expect(page.getByTestId('gospel-reading-screen')).toBeVisible();
    await expect(page.getByTestId('section-one-label')).toHaveText(
      'SECTION 3 OF 5',
    );
    await expect(page.getByTestId('section-one-percent')).toHaveText('60%');
  }
}

async function reachDiscussion(
  pageLeader: Page,
  all: Page[],
): Promise<void> {
  await reachGospelReading(pageLeader, all);
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

test.describe('Section 4 Deep Analysis Leader Question Queue & Pastoral Notes (ux/10, ux/11)', () => {
  test.describe.configure({ timeout: 60_000 });

  test('Scenario 1: Initial Section 4 state and default curated queue (both roles)', async ({
    browser,
  }) => {
    const leaderContext = await browser.newContext();
    const participantContext = await browser.newContext();

    const pageLeader = await leaderContext.newPage();
    const pageParticipant = await participantContext.newPage();

    try {
      const sessionCode = await createLeaderInLobby(pageLeader);
      await joinAsParticipant(pageParticipant, sessionCode, 'Sara');
      await startStudyOnSection1(pageLeader, [pageParticipant]);

      await reachDiscussion(pageLeader, [pageLeader, pageParticipant]);

      // Both roles show Section 4 header, title, and eyebrow
      for (const page of [pageLeader, pageParticipant]) {
        await expect(page.getByTestId('section-one-label')).toHaveText(
          'SECTION 4 OF 5',
        );
        await expect(page.getByTestId('section-one-percent')).toHaveText('80%');
        await expect(page.getByText('DEEP ANALYSIS · 25 MIN')).toBeVisible();
        await expect(page.getByText('Lord, Help Me Pray')).toBeVisible();

        // Exactly one persistent WebGL canvas mounted
        await expect(page.locator('canvas')).toHaveCount(1);

        // Strict terminology: zero Assistant occurrences
        const bodyText = await page.innerText('body');
        expect(bodyText).not.toContain('Assistant');
      }

      // Leader sees the 3 default curated questions with q-6 marked active
      await expect(pageLeader.getByTestId('leader-question-queue')).toBeVisible();
      const card1 = pageLeader.getByTestId('question-card-q-6');
      const card2 = pageLeader.getByTestId('question-card-q-5');
      const card3 = pageLeader.getByTestId('question-card-q-8');

      await expect(card1).toBeVisible();
      await expect(card2).toBeVisible();
      await expect(card3).toBeVisible();

      await expect(card1).toHaveAttribute('data-active', 'true');
      await expect(card2).toHaveAttribute('data-active', 'false');
      await expect(card3).toHaveAttribute('data-active', 'false');

      await expect(card1).toContainText('Active');
      await expect(card2).toContainText('0 responses');
      await expect(card3).toContainText('0 responses');

      // Participant sees only active question card
      await expect(
        pageParticipant.getByTestId('participant-question-progress'),
      ).toHaveText('QUESTION 1 OF 3');
      await expect(
        pageParticipant.getByTestId('active-question-prompt'),
      ).toContainText("What makes the Canaanite woman's faith");
      await expect(
        pageParticipant.getByTestId('participant-locked-note'),
      ).toContainText('Only the leader decides when to advance');

      // Participant has no leader controls
      await expect(pageParticipant.getByTestId('next-question-btn')).toHaveCount(0);
      await expect(pageParticipant.getByTestId('add-question-trigger')).toHaveCount(0);
      await expect(pageParticipant.getByTestId('pastoral-notes-trigger')).toHaveCount(0);
    } finally {
      await closeLiveSession(pageLeader);
      await Promise.allSettled([
        participantContext.close(),
        leaderContext.close(),
      ]);
    }
  });

  test('Scenario 2: Active question switching via Next question and card tap', async ({
    browser,
  }) => {
    const leaderContext = await browser.newContext();
    const participantContext = await browser.newContext();

    const pageLeader = await leaderContext.newPage();
    const pageParticipant = await participantContext.newPage();

    try {
      const sessionCode = await createLeaderInLobby(pageLeader);
      await joinAsParticipant(pageParticipant, sessionCode, 'Daniel');
      await startStudyOnSection1(pageLeader, [pageParticipant]);
      await reachDiscussion(pageLeader, [pageLeader, pageParticipant]);

      // Leader taps Next question →
      await pageLeader.getByTestId('next-question-btn').click();

      // Card 2 (q-5) is now active across both screens
      await expect(pageLeader.getByTestId('question-card-q-5')).toHaveAttribute(
        'data-active',
        'true',
      );
      await expect(
        pageParticipant.getByTestId('participant-question-progress'),
      ).toHaveText('QUESTION 2 OF 3');
      await expect(
        pageParticipant.getByTestId('active-question-prompt'),
      ).toContainText("Have you ever experienced God's silence");

      // Leader directly taps Card 3 (q-8)
      await pageLeader.getByTestId('question-card-q-8').click();

      // Card 3 (q-8) is now active across both screens
      await expect(pageLeader.getByTestId('question-card-q-8')).toHaveAttribute(
        'data-active',
        'true',
      );
      await expect(
        pageParticipant.getByTestId('participant-question-progress'),
      ).toHaveText('QUESTION 3 OF 3');
      await expect(
        pageParticipant.getByTestId('active-question-prompt'),
      ).toContainText('Lord, help me');

      // On final question (q-8), Next question morphs to Begin Closing Prayer →
      await expect(pageLeader.getByTestId('advance-section-5-btn')).toBeVisible();
      await expect(pageLeader.getByTestId('next-question-btn')).toHaveCount(0);
    } finally {
      await closeLiveSession(pageLeader);
      await Promise.allSettled([
        participantContext.close(),
        leaderContext.close(),
      ]);
    }
  });

  test('Scenario 3: Adding questions from 12-question bank and custom prompt', async ({
    browser,
  }) => {
    const leaderContext = await browser.newContext();
    const participantContext = await browser.newContext();

    const pageLeader = await leaderContext.newPage();
    const pageParticipant = await participantContext.newPage();

    try {
      const sessionCode = await createLeaderInLobby(pageLeader);
      await joinAsParticipant(pageParticipant, sessionCode, 'Mary');
      await startStudyOnSection1(pageLeader, [pageParticipant]);
      await reachDiscussion(pageLeader, [pageLeader, pageParticipant]);

      // Leader taps + Add
      await pageLeader.getByTestId('add-question-trigger').click();
      await expect(pageLeader.getByTestId('add-question-modal')).toBeVisible();

      // Promote bank question q-2
      await pageLeader.getByTestId('add-bank-question-q-2').click();

      // Modal closes, total question count becomes 4
      await expect(pageLeader.getByTestId('add-question-modal')).toHaveCount(0);
      await expect(pageLeader.getByTestId('question-card-q-2')).toBeVisible();
      await expect(
        pageParticipant.getByTestId('participant-question-progress'),
      ).toHaveText('QUESTION 1 OF 4');

      // Leader taps Card 4 (q-2) to activate it
      await pageLeader.getByTestId('question-card-q-2').click();
      await expect(
        pageParticipant.getByTestId('participant-question-progress'),
      ).toHaveText('QUESTION 4 OF 4');
      await expect(
        pageParticipant.getByTestId('active-question-prompt'),
      ).toContainText('What does Isaiah mean');

      // Leader adds custom prompt
      await pageLeader.getByTestId('add-question-trigger').click();
      await pageLeader.getByTestId('tab-custom-question').click();

      const customInput = pageLeader.getByTestId('custom-question-input');
      // Assert mobile input font-size >= 16px
      const fontSize = await customInput.evaluate((el) =>
        window.getComputedStyle(el).fontSize,
      );
      expect(parseFloat(fontSize)).toBeGreaterThanOrEqual(16);

      await customInput.fill('Where is God calling our young adult community this season?');
      await pageLeader.getByTestId('submit-custom-question').click();

      // Modal closes, total question count becomes 5
      await expect(pageLeader.getByTestId('add-question-modal')).toHaveCount(0);
      await expect(
        pageParticipant.getByTestId('participant-question-progress'),
      ).toHaveText('QUESTION 4 OF 5');
    } finally {
      await closeLiveSession(pageLeader);
      await Promise.allSettled([
        participantContext.close(),
        leaderContext.close(),
      ]);
    }
  });

  test('Scenario 4: Facilitator pastoral drawer & Romans 11:29 doctrinal guardrail privacy', async ({
    browser,
  }) => {
    const leaderContext = await browser.newContext();
    const participantContext = await browser.newContext();

    const pageLeader = await leaderContext.newPage();
    const pageParticipant = await participantContext.newPage();

    try {
      const sessionCode = await createLeaderInLobby(pageLeader);
      await joinAsParticipant(pageParticipant, sessionCode, 'Thomas');
      await startStudyOnSection1(pageLeader, [pageParticipant]);
      await reachDiscussion(pageLeader, [pageLeader, pageParticipant]);

      // Leader opens Pastoral Notes drawer
      await pageLeader.getByTestId('pastoral-notes-trigger').click();
      await expect(pageLeader.getByTestId('pastoral-notes-drawer')).toBeVisible();

      // Verify Romans 11:29 doctrinal guardrail on Leader device
      await expect(pageLeader.getByTestId('pastoral-doctrine-section')).toBeVisible();
      const leaderDrawerText = await pageLeader.getByTestId('pastoral-notes-drawer').innerText();
      expect(leaderDrawerText).toContain('ROMANS 11:29');
      expect(leaderDrawerText).toContain('CCC 839–840');

      // Switch to commentary tab: verify patristic authors Augustine, Chrysostom, Jerome
      await pageLeader.getByTestId('pastoral-tab-commentary').click();
      await expect(pageLeader.getByTestId('pastoral-commentary-section')).toBeVisible();
      const commentaryText = await pageLeader.getByTestId('pastoral-commentary-section').innerText();
      expect(commentaryText).toContain('St. Augustine');
      expect(commentaryText).toContain('St. John Chrysostom');
      expect(commentaryText).toContain('St. Jerome');

      // Switch to active question prompt notes: sample answer & leader note
      await pageLeader.getByTestId('pastoral-tab-active-q').click();
      await expect(pageLeader.getByTestId('pastoral-sample-answer')).toBeVisible();
      await expect(pageLeader.getByTestId('pastoral-leader-note')).toBeVisible();

      // Crucial privacy check: Participant DOM has ZERO instances of pastoral texts
      const participantBody = await pageParticipant.innerText('body');
      expect(participantBody).not.toContain('ROMANS 11:29');
      expect(participantBody).not.toContain('CCC 839–840');
      expect(participantBody).not.toContain('Chrysostom');
      expect(participantBody).not.toContain('Augustine');
      expect(participantBody).not.toContain('Jerome');
      expect(participantBody).not.toContain('Sample Answer');
      expect(participantBody).not.toContain(SEED.deepAnalysis.reflectionQuestions[0]!.sampleAnswer);

      // Close drawer
      await pageLeader.getByTestId('close-pastoral-notes').click();
      await expect(pageLeader.getByTestId('pastoral-notes-drawer')).toHaveCount(0);
    } finally {
      await closeLiveSession(pageLeader);
      await Promise.allSettled([
        participantContext.close(),
        leaderContext.close(),
      ]);
    }
  });

  test('Scenario 5: Leader-only advancement to Section 5 without turn gate', async ({
    browser,
  }) => {
    const leaderContext = await browser.newContext();
    const participantContext = await browser.newContext();

    const pageLeader = await leaderContext.newPage();
    const pageParticipant = await participantContext.newPage();

    try {
      const sessionCode = await createLeaderInLobby(pageLeader);
      await joinAsParticipant(pageParticipant, sessionCode, 'Elena');
      await startStudyOnSection1(pageLeader, [pageParticipant]);
      await reachDiscussion(pageLeader, [pageLeader, pageParticipant]);

      // Participant has zero advance controls
      await expect(pageParticipant.getByTestId('advance-section-5-btn')).toHaveCount(0);
      await expect(pageParticipant.getByTestId('advance-section-5-direct')).toHaveCount(0);

      // Leader uses direct advance (mercy, not pace, is the goal)
      await pageLeader.getByTestId('advance-section-5-direct').click();

      // All clients immediately advance to Section 5
      for (const page of [pageLeader, pageParticipant]) {
        await expect(page.getByTestId('section-placeholder')).toBeVisible();
        await expect(page.getByTestId('section-one-label')).toHaveText(
          'SECTION 5 OF 5',
        );
        await expect(page.getByTestId('section-one-percent')).toHaveText('100%');
      }
    } finally {
      await closeLiveSession(pageLeader);
      await Promise.allSettled([
        participantContext.close(),
        leaderContext.close(),
      ]);
    }
  });

  test('Scenario 6: Reconnection and late join hydration', async ({
    browser,
  }) => {
    const leaderContext = await browser.newContext();
    const participantContext = await browser.newContext();
    const lateContext = await browser.newContext();

    const pageLeader = await leaderContext.newPage();
    const pageParticipant = await participantContext.newPage();
    const pageLate = await lateContext.newPage();

    try {
      const sessionCode = await createLeaderInLobby(pageLeader);
      await joinAsParticipant(pageParticipant, sessionCode, 'Gabriel');
      await startStudyOnSection1(pageLeader, [pageParticipant]);
      await reachDiscussion(pageLeader, [pageLeader, pageParticipant]);

      // Leader switches to question 2 (q-5) and adds bank question q-2 (total 4 questions)
      await pageLeader.getByTestId('next-question-btn').click();
      await pageLeader.getByTestId('add-question-trigger').click();
      await pageLeader.getByTestId('add-bank-question-q-2').click();

      await expect(
        pageParticipant.getByTestId('participant-question-progress'),
      ).toHaveText('QUESTION 2 OF 4');

      // Participant reloads
      await pageParticipant.reload();
      await expect(
        pageParticipant.getByTestId('participant-question-progress'),
      ).toHaveText('QUESTION 2 OF 4');
      await expect(
        pageParticipant.getByTestId('active-question-prompt'),
      ).toContainText("Have you ever experienced God's silence");

      // Late participant joins
      await joinAsParticipant(pageLate, sessionCode, 'Latecomer');
      await expect(
        pageLate.getByTestId('participant-question-progress'),
      ).toHaveText('QUESTION 2 OF 4');
      await expect(
        pageLate.getByTestId('active-question-prompt'),
      ).toContainText("Have you ever experienced God's silence");
    } finally {
      await closeLiveSession(pageLeader);
      await Promise.allSettled([
        lateContext.close(),
        participantContext.close(),
        leaderContext.close(),
      ]);
    }
  });
});

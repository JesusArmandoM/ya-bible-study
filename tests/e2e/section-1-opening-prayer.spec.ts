import { expect as baseExpect, test, type Page } from '@playwright/test';

// Per-suite assertion headroom: under in-suite contention (one worker, many
// sequential multi-context scenarios) a live /ws round trip or React resync can
// stall past the default 5s expect budget. Assertions are unchanged — only the
// patience is.
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

/** Leader: start the study; every connected screen lands on Section 1. */
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

test.describe('Section 1 — Opening Prayer hand raise + leader queue', () => {
  // These scenarios orchestrate 2-4 live contexts with real /ws round trips;
  // in-suite contention can exceed the default 30s budget (Scenario 6 passed
  // 2/2 in isolation at ~20s but timed out 2/2 in-suite). Give every test
  // headroom without trimming any scenario assertion.
  test.describe.configure({ timeout: 60_000 });
  test('Scenario 1: Section 1 shows the Opening Prayer content on both roles', async ({
    browser,
  }) => {
    const leaderContext = await browser.newContext();
    const pageLeader = await leaderContext.newPage();
    const participantContext = await browser.newContext();
    const pageParticipant = await participantContext.newPage();

    try {
      const sessionCode = await createLeaderInLobby(pageLeader);
      await joinAsParticipant(pageParticipant, sessionCode, 'Daniel');
      await startStudyOnSection1(pageLeader, [pageParticipant]);

      for (const page of [pageLeader, pageParticipant]) {
        await expect(page.getByTestId('section-one-label')).toHaveText(
          'SECTION 1 OF 5',
        );
        await expect(page.getByTestId('section-one-percent')).toHaveText('20%');
        await expect(page.getByTestId('section-one-title')).toHaveText(
          'Opening Prayer',
        );
        await expect(page.getByTestId('prayer-eyebrow')).toHaveText('MOMENT');

        // Full suggested prayer text, readable without truncation.
        const prayerText = page.getByTestId('opening-prayer-text');
        await expect(prayerText).toContainText(
          'Lord Jesus Christ, Son of David',
        );
        await expect(prayerText).toContainText('Amen.');

        // 4px gold progress bar.
        const barHeight = await page.evaluate(() => {
          const el = document.querySelector('.section-one-progress');
          return el ? getComputedStyle(el).height : null;
        });
        expect(barHeight).toBe('4px');

        // Stage switched to the violet prayer-orb variant (single canvas).
        await expect(page.getByTestId('sacred-3d-scene')).toHaveAttribute(
          'data-stage',
          'prayer-orb',
        );
        const canvasCount = await page.evaluate(
          () => document.querySelectorAll('canvas').length,
        );
        expect(canvasCount).toBeLessThanOrEqual(1);

        const bodyText = await page.locator('body').innerText();
        expect(bodyText).not.toContain('Assistant');

        // No horizontal overflow on the 390x844 mobile viewport.
        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
      }

      // Role-appropriate subtitle copy.
      await expect(pageLeader.getByTestId('section-one-copy')).toContainText(
        'Waiting for someone to volunteer to pray',
      );
      await expect(
        pageParticipant.getByTestId('section-one-copy'),
      ).toContainText('Tap Raise Hand');
    } finally {
      await closeLiveSession(pageLeader);
      await Promise.allSettled([
        participantContext.close(),
        leaderContext.close(),
      ]);
    }
  });

  test('Scenarios 2-3: live queue sync on 3 screens, idempotent toggles, lower, and re-raise ordering', async ({
    browser,
  }) => {
    const leaderContext = await browser.newContext();
    const pageLeader = await leaderContext.newPage();
    const participantAContext = await browser.newContext();
    const pageA = await participantAContext.newPage();
    const participantBContext = await browser.newContext();
    const pageB = await participantBContext.newPage();

    try {
      const sessionCode = await createLeaderInLobby(pageLeader);
      await joinAsParticipant(pageA, sessionCode, 'Daniel');
      await joinAsParticipant(pageB, sessionCode, 'Maria');
      await startStudyOnSection1(pageLeader, [pageA, pageB]);

      // Empty queue on the leader; zeroed count pill on both Participants.
      await expect(pageLeader.getByTestId('prayer-queue-count')).toHaveText(
        '0 hands raised',
      );
      await expect(pageLeader.getByTestId('prayer-queue-empty')).toHaveText(
        'No hands raised yet',
      );
      for (const page of [pageA, pageB]) {
        await expect(page.getByTestId('prayer-count-pill-text')).toHaveText(
          'No one has raised their hand yet',
        );
        await expect(page.getByTestId('prayer-count-pill-hint')).toHaveCount(0);
      }

      // Participant 1 taps the orb: instant optimistic raised state.
      const orbA = pageA.getByTestId('hand-raise-orb');
      await expect(orbA).toHaveAttribute('aria-pressed', 'false');
      await orbA.click();
      await expect(orbA).toHaveAttribute('aria-pressed', 'true');
      await expect(orbA).toContainText('Hand Raised');
      await expect(orbA).toContainText('Tap again to lower');

      // Within a round trip the leader queue shows the row.
      const firstRow = pageLeader.getByTestId('prayer-queue-row').first();
      await expect(firstRow).toHaveAttribute('data-member-id', /.+/);
      await expect(firstRow).toContainText('DA'); // centered initials
      await expect(firstRow).toContainText('Daniel');
      await expect(
        pageLeader.getByTestId('prayer-queue-row-time').first(),
      ).toContainText(/Raised (just now|\d+[smh] ago)/);
      await expect(pageLeader.getByTestId('prayer-queue-count')).toHaveText(
        '1 hand raised',
      );
      for (const page of [pageA, pageB]) {
        await expect(page.getByTestId('prayer-count-pill-text')).toHaveText(
          '1 person has raised their hand',
        );
        await expect(page.getByTestId('prayer-count-pill-hint')).toHaveText(
          'The leader will choose shortly',
        );
      }

      // Participant 2 raises: leader reads 2 hands, rows ordered by raise time.
      await pageB.getByTestId('hand-raise-orb').click();
      await expect(pageLeader.getByTestId('prayer-queue-count')).toHaveText(
        '2 hands raised',
      );
      let rows = await pageLeader.getByTestId('prayer-queue-row').allInnerTexts();
      expect(rows.map((text) => (text.includes('Daniel') ? 'DA' : 'MA'))).toEqual(
        ['DA', 'MA'],
      );
      for (const page of [pageA, pageB]) {
        await expect(page.getByTestId('prayer-count-pill-text')).toHaveText(
          '2 people have raised their hand',
        );
      }

      // Scenario 3: Participant 1 lowers — the row exits everywhere.
      await pageA.getByTestId('hand-raise-orb').click();
      await expect(pageA.getByTestId('hand-raise-orb')).toHaveAttribute(
        'aria-pressed',
        'false',
      );
      await expect(pageLeader.getByTestId('prayer-queue-count')).toHaveText(
        '1 hand raised',
      );
      await expect(pageLeader.getByTestId('prayer-queue-row')).toHaveCount(1);
      await expect(pageLeader.getByTestId('prayer-queue-row')).toContainText(
        'Maria',
      );

      // Re-raise re-appends at the END of the queue (order: Maria, Daniel).
      await pageA.getByTestId('hand-raise-orb').click();
      await expect(pageLeader.getByTestId('prayer-queue-count')).toHaveText(
        '2 hands raised',
      );
      rows = await pageLeader.getByTestId('prayer-queue-row').allInnerTexts();
      expect(rows.map((text) => (text.includes('Daniel') ? 'DA' : 'MA'))).toEqual(
        ['MA', 'DA'],
      );

      // Protocol-level idempotency over raw /ws: duplicate raise_hand frames
      // from a bound Participant never duplicate a row or move its position.
      await pageB.evaluate(async () => {
        const raw = sessionStorage.getItem('ya-bible-study.session-credentials');
        if (!raw) return;
        const creds = JSON.parse(raw) as { sessionCode?: string };
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
        await new Promise<void>((resolve) =>
          ws.addEventListener('open', () => resolve(), { once: true }),
        );
        const once = () =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          new Promise<any>((resolve) =>
            ws.addEventListener('message', (event) => resolve(JSON.parse(String(event.data))), {
              once: true,
            }),
          );
        // A dedicated raw peer joins as its own bound member.
        ws.send(
          JSON.stringify({
            type: 'join_session',
            sessionCode: creds.sessionCode,
            displayName: 'Ezra',
            requestId: 'raw-join',
          }),
        );
        const joined = await once();
        ws.send(
          JSON.stringify({
            type: 'raise_hand',
            sessionCode: creds.sessionCode,
            memberId: joined.memberId,
            requestId: 'raw-raise-1',
          }),
        );
        await once();
        ws.send(
          JSON.stringify({
            type: 'raise_hand',
            sessionCode: creds.sessionCode,
            memberId: joined.memberId,
            requestId: 'raw-raise-2',
          }),
        );
        await once();
        ws.close();
      });

      // Exactly one Ezra row despite the duplicate frames.
      await expect(pageLeader.getByTestId('prayer-queue-count')).toHaveText(
        '3 hands raised',
      );
      await expect(
        pageLeader.getByTestId('prayer-queue-row').filter({ hasText: 'Ezra' }),
      ).toHaveCount(1);
      rows = await pageLeader.getByTestId('prayer-queue-row').allInnerTexts();
      expect(
        rows.map((text) => (text.includes('Daniel') ? 'DA' : text.includes('Maria') ? 'MA' : 'EZ')),
      ).toEqual(['MA', 'DA', 'EZ']);
    } finally {
      await closeLiveSession(pageLeader);
      await Promise.allSettled([
        participantAContext.close(),
        participantBContext.close(),
        leaderContext.close(),
      ]);
    }
  });

  test('Scenarios 4-5: queue management is leader-only and the advance bar stays locked', async ({
    browser,
  }) => {
    const leaderContext = await browser.newContext();
    const pageLeader = await leaderContext.newPage();
    const participantContext = await browser.newContext();
    const pageParticipant = await participantContext.newPage();

    try {
      const sessionCode = await createLeaderInLobby(pageLeader);
      await joinAsParticipant(pageParticipant, sessionCode, 'Daniel');
      await startStudyOnSection1(pageLeader, [pageParticipant]);

      await pageParticipant.getByTestId('hand-raise-orb').click();
      await expect(pageLeader.getByTestId('prayer-queue-row')).toHaveCount(1);

      // Leader-only queue management controls.
      const lowerRow = pageLeader.getByTestId('prayer-queue-row-lower');
      await expect(lowerRow).toHaveAttribute(
        'aria-label',
        "Lower Daniel's hand",
      );
      await expect(pageLeader.getByTestId('prayer-queue-clear-all')).toHaveAttribute(
        'aria-label',
        'Lower all hands',
      );

      // Neither control exists anywhere in the Participant DOM.
      await expect(
        pageParticipant.getByTestId('prayer-queue-row-lower'),
      ).toHaveCount(0);
      await expect(
        pageParticipant.getByTestId('prayer-queue-clear-all'),
      ).toHaveCount(0);
      await expect(
        pageParticipant.getByTestId('prayer-queue-row'),
      ).toHaveCount(0);

      // Per-row lower removes only that row on every client.
      await lowerRow.click();
      await expect(pageLeader.getByTestId('prayer-queue-row')).toHaveCount(0);
      await expect(pageLeader.getByTestId('prayer-queue-empty')).toBeVisible();
      await expect(
        pageParticipant.getByTestId('prayer-count-pill-text'),
      ).toHaveText('No one has raised their hand yet');

      // Locked bar copy per role — and zero advance controls in either DOM.
      await expect(pageLeader.getByTestId('locked-advance-bar')).toContainText(
        'Waiting for volunteer to advance',
      );
      await expect(
        pageParticipant.getByTestId('locked-advance-bar'),
      ).toContainText('Only the leader decides when to advance');
      for (const page of [pageLeader, pageParticipant]) {
        const advanceControls = await page.evaluate(() => {
          const bar = document.querySelector('[data-testid="locked-advance-bar"]');
          return bar
            ? bar.querySelectorAll('button, a, [role="button"]').length
            : -1;
        });
        expect(advanceControls).toBe(0);
      }
      const participantBody = await pageParticipant.locator('body').innerText();
      expect(participantBody).not.toContain('Choose');
      expect(participantBody).not.toContain('Pick Randomly');
    } finally {
      await closeLiveSession(pageLeader);
      await Promise.allSettled([
        participantContext.close(),
        leaderContext.close(),
      ]);
    }
  });

  test('Scenario 6: raised hands survive reload and late joins (session state, not socket state)', async ({
    browser,
  }) => {
    const leaderContext = await browser.newContext();
    const pageLeader = await leaderContext.newPage();
    const participantContext = await browser.newContext();
    const pageParticipant = await participantContext.newPage();
    const lateContext = await browser.newContext();
    const pageLate = await lateContext.newPage();

    try {
      const sessionCode = await createLeaderInLobby(pageLeader);
      await joinAsParticipant(pageParticipant, sessionCode, 'Daniel');
      await startStudyOnSection1(pageLeader, [pageParticipant]);

      await pageParticipant.getByTestId('hand-raise-orb').click();
      await expect(pageLeader.getByTestId('prayer-queue-row')).toHaveCount(1);

      // Participant reload: their own hand is still raised on their screen.
      await pageParticipant.reload();
      await expect(pageParticipant.getByTestId('active-session-banner')).toBeVisible();
      await expect(
        pageParticipant.getByTestId('hand-raise-orb'),
      ).toHaveAttribute('aria-pressed', 'true');

      // Leader reload: the queue order and row survive the resync.
      await pageLeader.reload();
      await expect(pageLeader.getByTestId('section-one-handoff')).toBeVisible();
      await expect(pageLeader.getByTestId('prayer-queue-row')).toHaveCount(1);
      await expect(pageLeader.getByTestId('prayer-queue-row')).toContainText(
        'Daniel',
      );

      // A late joiner's session_joined snapshot restores the same turn state.
      await joinAsParticipant(pageLate, sessionCode, 'Maria');
      await expect(pageLate.getByTestId('section-one-handoff')).toBeVisible();
      await expect(pageLate.getByTestId('prayer-count-pill-text')).toHaveText(
        '1 person has raised their hand',
      );

      // Privacy: no leader secrets reach a Participant client.
      const participantStorage = await pageParticipant.evaluate(() =>
        sessionStorage.getItem('ya-bible-study.session-credentials'),
      );
      expect(participantStorage).not.toBeNull();
      expect(participantStorage).not.toContain('leaderToken');
      expect(participantStorage).not.toContain('leaderPin');
      const bodyText = await pageParticipant.locator('body').innerText();
      expect(bodyText).not.toContain('Assistant');
    } finally {
      await closeLiveSession(pageLeader);
      await Promise.allSettled([
        participantContext.close(),
        lateContext.close(),
        leaderContext.close(),
      ]);
    }
  });
});

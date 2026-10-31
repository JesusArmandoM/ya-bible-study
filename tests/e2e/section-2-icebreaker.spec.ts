import { expect as baseExpect, test, type Page } from '@playwright/test';
import { getDefaultStudyDocument } from '../../src/server/studies/greatIsYourFaithSeed';

// Per-suite assertion headroom: under in-suite contention (one worker, many
// sequential multi-context scenarios) a live /ws round trip or React resync can
// stall past the default 5s expect budget. Assertions are unchanged — only the
// patience is.
const expect = baseExpect.configure({ timeout: 15_000 });

const SEED_ICEBREAKER = getDefaultStudyDocument().icebreaker;
const SEED_EXAMPLES = SEED_ICEBREAKER.examplesToListenFor;
const SEED_LEADER_NOTE = SEED_ICEBREAKER.leaderNote;

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

/**
 * Reach Section 2 fast: the Study Leader marks the open Section 1 turn done via
 * the discreet override, then the gold `Continue to Section 2 →` CTA advances
 * every client to the icebreaker screen.
 */
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

test.describe('Section 2 — Icebreaker "Outsiders Wanted" prompt with live hand-raise count', () => {
  // Multi-context live /ws scenarios: same headroom rationale as the Section 1
  // suites (one worker, sequential multi-context scenarios).
  test.describe.configure({ timeout: 60_000 });

  test('Scenario 1: both roles render Outsiders Wanted — leader QUESTION card + facilitator card, participant share prompt', async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(90_000);
    const leaderContext = await browser.newContext();
    const pageLeader = await leaderContext.newPage();
    const participantContext = await browser.newContext();
    const pageParticipant = await participantContext.newPage();

    try {
      const sessionCode = await createLeaderInLobby(pageLeader);
      await joinAsParticipant(pageParticipant, sessionCode, 'Daniel');
      await startStudyOnSection1(pageLeader, [pageParticipant]);
      await reachIcebreaker(pageLeader, [pageLeader, pageParticipant]);

      // Shared heading on both roles.
      for (const page of [pageLeader, pageParticipant]) {
        await expect(page.getByTestId('icebreaker-eyebrow')).toHaveText(
          'ICEBREAKER · 10 MIN',
        );
        await expect(page.getByTestId('icebreaker-title')).toHaveText(
          'Outsiders Wanted',
        );
      }

      // Study Leader: QUESTION card (main question + hairline divider + italic follow-up).
      await expect(pageLeader.getByTestId('icebreaker-prompt-eyebrow')).toHaveText(
        'QUESTION',
      );
      await expect(
        pageLeader.getByTestId('icebreaker-prompt-question'),
      ).toHaveText(SEED_ICEBREAKER.mainQuestion);
      await expect(
        pageLeader.getByTestId('icebreaker-prompt-divider'),
      ).toBeVisible();
      const leaderFollowUp = pageLeader.getByTestId('icebreaker-prompt-followup');
      await expect(leaderFollowUp).toHaveText(SEED_ICEBREAKER.followUpQuestion);
      await expect(leaderFollowUp).toHaveCSS('font-style', 'italic');

      // Study Leader: introText, examples card, count pill, gold Begin Reading → CTA.
      await expect(pageLeader.getByTestId('icebreaker-intro')).toHaveText(
        SEED_ICEBREAKER.introText,
      );
      await expect(
        pageLeader.getByTestId('icebreaker-examples-eyebrow'),
      ).toHaveText('EXAMPLES TO LISTEN FOR');
      await expect(
        pageLeader.getByTestId('icebreaker-examples-item'),
      ).toHaveCount(SEED_EXAMPLES.length);
      await expect(pageLeader.getByTestId('icebreaker-examples-note')).toHaveText(
        SEED_LEADER_NOTE,
      );
      await expect(
        pageLeader.getByTestId('icebreaker-count-pill-text'),
      ).toHaveText('0 PEOPLE HAVE RAISED THEIR HAND');
      await expect(pageLeader.getByTestId('icebreaker-advance-cta')).toContainText(
        'Begin Reading →',
      );

      // Participant: SHARE WHEN READY hero, italic follow-up, fixed sub-copy,
      // bronze orb with the spec captions, and the count pill.
      await expect(
        pageParticipant.getByTestId('icebreaker-share-eyebrow'),
      ).toHaveText('SHARE WHEN READY');
      await expect(
        pageParticipant.getByTestId('icebreaker-share-question'),
      ).toHaveText(SEED_ICEBREAKER.mainQuestion);
      const participantFollowUp = pageParticipant.getByTestId(
        'icebreaker-share-followup',
      );
      await expect(participantFollowUp).toHaveText(
        SEED_ICEBREAKER.followUpQuestion,
      );
      await expect(participantFollowUp).toHaveCSS('font-style', 'italic');
      await expect(
        pageParticipant.getByTestId('icebreaker-share-subcopy'),
      ).toHaveText(
        'The leader will give you a moment to share your reflection.',
      );
      await expect(
        pageParticipant.getByTestId('icebreaker-orb-caption'),
      ).toHaveText('Tap to raise your hand');
      await expect(pageParticipant.getByTestId('icebreaker-orb-hint')).toHaveText(
        'The leader will call on you to share.',
      );
      await expect(pageParticipant.getByTestId('hand-raise-orb')).toBeVisible();
      await expect(
        pageParticipant.getByTestId('icebreaker-count-pill-text'),
      ).toHaveText('0 PEOPLE HAVE RAISED THEIR HAND');

      // Participant has no advance control and no leader intro.
      await expect(
        pageParticipant.getByTestId('icebreaker-advance-cta'),
      ).toHaveCount(0);
      await expect(
        pageParticipant.getByTestId('icebreaker-intro'),
      ).toHaveCount(0);

      // Invariants: single Sacred3DScene canvas budget, zero Assistant copy.
      for (const page of [pageLeader, pageParticipant]) {
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
        participantContext.close(),
        leaderContext.close(),
      ]);
    }
  });

  test('Scenario 2: leader-only fields never reach the Participant DOM', async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(90_000);
    const leaderContext = await browser.newContext();
    const pageLeader = await leaderContext.newPage();
    const participantContext = await browser.newContext();
    const pageParticipant = await participantContext.newPage();

    try {
      const sessionCode = await createLeaderInLobby(pageLeader);
      await joinAsParticipant(pageParticipant, sessionCode, 'Daniel');
      await startStudyOnSection1(pageLeader, [pageParticipant]);
      await reachIcebreaker(pageLeader, [pageLeader, pageParticipant]);

      // The Study Leader screen carries the facilitator card (localStudyDocument).
      await expect(
        pageLeader.getByTestId('icebreaker-examples-eyebrow'),
      ).toHaveText('EXAMPLES TO LISTEN FOR');
      await expect(pageLeader.getByTestId('icebreaker-examples-note')).toHaveText(
        SEED_LEADER_NOTE,
      );
      for (const example of SEED_EXAMPLES) {
        await expect(pageLeader.getByText(example)).toBeVisible();
      }

      // The Participant DOM contains none of it — not the header, not the note,
      // not one example string, not even the wire key names.
      const participantDom =
        (await pageParticipant.evaluate(() => document.body.textContent)) ?? '';
      expect(participantDom).not.toContain('Examples to Listen For');
      expect(participantDom).not.toContain('EXAMPLES TO LISTEN FOR');
      expect(participantDom).not.toContain(SEED_LEADER_NOTE);
      for (const example of SEED_EXAMPLES) {
        expect(participantDom).not.toContain(example);
      }
      expect(participantDom).not.toContain('leaderNote');
      expect(participantDom).not.toContain('examplesToListenFor');
      await expect(
        pageParticipant.getByTestId('icebreaker-examples-card'),
      ).toHaveCount(0);
    } finally {
      await closeLiveSession(pageLeader);
      await Promise.allSettled([
        participantContext.close(),
        leaderContext.close(),
      ]);
    }
  });

  test('Scenario 3: live hand-raise count syncs 0 → 1 → 2 → 1 → 2 on all three screens', async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(90_000);
    const leaderContext = await browser.newContext();
    const pageLeader = await leaderContext.newPage();
    const firstContext = await browser.newContext();
    const pageFirst = await firstContext.newPage();
    const secondContext = await browser.newContext();
    const pageSecond = await secondContext.newPage();

    const all = [pageLeader, pageFirst, pageSecond];
    const expectCountEverywhere = async (copy: string) => {
      for (const page of all) {
        await expect(
          page.getByTestId('icebreaker-count-pill-text'),
        ).toHaveText(copy);
      }
    };

    try {
      const sessionCode = await createLeaderInLobby(pageLeader);
      await joinAsParticipant(pageFirst, sessionCode, 'Daniel');
      await joinAsParticipant(pageSecond, sessionCode, 'Maria');
      await startStudyOnSection1(pageLeader, [pageFirst, pageSecond]);
      await reachIcebreaker(pageLeader, all);

      await expectCountEverywhere('0 PEOPLE HAVE RAISED THEIR HAND');

      // Daniel raises: 0 -> 1.
      await pageFirst.getByTestId('hand-raise-orb').click();
      await expectCountEverywhere('1 PERSON HAS RAISED THEIR HAND');
      await expect(pageFirst.getByTestId('hand-raise-orb')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(
        pageFirst.getByTestId('icebreaker-orb-caption'),
      ).toHaveText('Tap again to lower');

      // Maria raises: 1 -> 2.
      await pageSecond.getByTestId('hand-raise-orb').click();
      await expectCountEverywhere('2 PEOPLE HAVE RAISED THEIR HAND');

      // Maria lowers: 2 -> 1.
      await pageSecond.getByTestId('hand-raise-orb').click();
      await expectCountEverywhere('1 PERSON HAS RAISED THEIR HAND');
      await expect(
        pageSecond.getByTestId('icebreaker-orb-caption'),
      ).toHaveText('Tap to raise your hand');

      // Maria re-raises: 1 -> 2 (single count entry, raise order preserved).
      await pageSecond.getByTestId('hand-raise-orb').click();
      await expectCountEverywhere('2 PEOPLE HAVE RAISED THEIR HAND');
    } finally {
      await closeLiveSession(pageLeader);
      await Promise.allSettled([
        firstContext.close(),
        secondContext.close(),
        leaderContext.close(),
      ]);
    }
  });

  test('Scenario 4: only the Study Leader advances — Begin Reading → reaches Section 3 with hands still raised', async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(90_000);
    const leaderContext = await browser.newContext();
    const pageLeader = await leaderContext.newPage();
    const participantContext = await browser.newContext();
    const pageParticipant = await participantContext.newPage();

    try {
      const sessionCode = await createLeaderInLobby(pageLeader);
      await joinAsParticipant(pageParticipant, sessionCode, 'Daniel');
      await startStudyOnSection1(pageLeader, [pageParticipant]);
      await reachIcebreaker(pageLeader, [pageLeader, pageParticipant]);

      // A raised hand is up — Section 2 → 3 needs no completion precondition.
      await pageParticipant.getByTestId('hand-raise-orb').click();
      await expect(
        pageParticipant.getByTestId('icebreaker-count-pill-text'),
      ).toHaveText('1 PERSON HAS RAISED THEIR HAND');

      // Participants have no advance control at any point.
      await expect(
        pageParticipant.getByTestId('icebreaker-advance-cta'),
      ).toHaveCount(0);

      // The Study Leader taps Begin Reading → and everyone lands on Section 3.
      await expect(pageLeader.getByTestId('icebreaker-advance-cta')).toContainText(
        'Begin Reading →',
      );
      await pageLeader.getByTestId('icebreaker-advance-cta').click();
      for (const page of [pageLeader, pageParticipant]) {
        await expect(page.getByTestId('section-placeholder')).toBeVisible();
        await expect(page.getByTestId('section-one-label')).toHaveText(
          'SECTION 3 OF 5',
        );
        await expect(page.getByTestId('section-one-percent')).toHaveText('60%');
      }
    } finally {
      await closeLiveSession(pageLeader);
      await Promise.allSettled([
        participantContext.close(),
        leaderContext.close(),
      ]);
    }
  });

  test('Scenario 5: reconnect and late join restore the raised queue, exact count, and own raised state', async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(90_000);
    const leaderContext = await browser.newContext();
    const pageLeader = await leaderContext.newPage();
    const firstContext = await browser.newContext();
    const pageFirst = await firstContext.newPage();
    const secondContext = await browser.newContext();
    const pageSecond = await secondContext.newPage();

    try {
      const sessionCode = await createLeaderInLobby(pageLeader);
      await joinAsParticipant(pageFirst, sessionCode, 'Daniel');
      await joinAsParticipant(pageSecond, sessionCode, 'Maria');
      await startStudyOnSection1(pageLeader, [pageFirst, pageSecond]);
      await reachIcebreaker(pageLeader, [pageLeader, pageFirst, pageSecond]);

      // Two raised hands before the reload.
      await pageFirst.getByTestId('hand-raise-orb').click();
      await pageSecond.getByTestId('hand-raise-orb').click();
      await expect(
        pageLeader.getByTestId('icebreaker-count-pill-text'),
      ).toHaveText('2 PEOPLE HAVE RAISED THEIR HAND');

      // Daniel reloads: the snapshot restores his own raised state and the count.
      await pageFirst.reload();
      await expect(pageFirst.getByTestId('icebreaker-screen')).toBeVisible();
      await expect(pageFirst.getByTestId('hand-raise-orb')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(
        pageFirst.getByTestId('icebreaker-orb-caption'),
      ).toHaveText('Tap again to lower');
      await expect(
        pageFirst.getByTestId('icebreaker-count-pill-text'),
      ).toHaveText('2 PEOPLE HAVE RAISED THEIR HAND');

      // A late joiner sees the exact count immediately.
      const lateContext = await browser.newContext();
      const pageLate = await lateContext.newPage();
      try {
        await joinAsParticipant(pageLate, sessionCode, 'Ruth');
        await expect(pageLate.getByTestId('icebreaker-screen')).toBeVisible();
        await expect(
          pageLate.getByTestId('icebreaker-count-pill-text'),
        ).toHaveText('2 PEOPLE HAVE RAISED THEIR HAND');
        await expect(pageLate.getByTestId('hand-raise-orb')).toHaveAttribute(
          'aria-pressed',
          'false',
        );
      } finally {
        await lateContext.close();
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

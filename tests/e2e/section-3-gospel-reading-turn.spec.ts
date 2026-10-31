import { expect as baseExpect, test, type Page } from '@playwright/test';
import { getDefaultStudyDocument } from '../../src/server/studies/greatIsYourFaithSeed';

// Per-suite assertion headroom (Session 021-022 hardening): under in-suite contention
// (one worker, sequential multi-context scenarios) live /ws round trips can stall
// past the default 5s budget.
const expect = baseExpect.configure({ timeout: 15_000 });

const SEED = getDefaultStudyDocument();
const SEED_LITURGICAL_NOTE = SEED.gospelReading.leaderLiturgicalContextNote;

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

test.describe('Section 3 — Gospel Reading sole passage presentation with gated Done Reading turn', () => {
  test.describe.configure({ timeout: 60_000 });

  test('Scenario 1: sole Gospel Reading presentation on both roles without multi-reading Mass tabs', async ({
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
      await reachGospelReading(pageLeader, [pageLeader, pageParticipant]);

      // Both roles see SECTION 3 OF 5 / 60%, Matthew 15:21–28 citation, and Gospel Reading title
      for (const page of [pageLeader, pageParticipant]) {
        await expect(page.getByTestId('section-one-label')).toHaveText(
          'SECTION 3 OF 5',
        );
        await expect(page.getByTestId('section-one-percent')).toHaveText('60%');
        await expect(page.getByTestId('reading-title')).toHaveText(
          'Gospel Reading',
        );
        await expect(page.getByTestId('reading-citation')).toHaveText(
          'Matthew 15:21–28',
        );
        await expect(page.getByTestId('scripture-card')).toBeVisible();

        // Exactly one persistent <canvas> is mounted
        await expect(page.locator('canvas')).toHaveCount(1);

        // Gospel-only invariant: main reading contains ONLY Gospel text; zero Mass tabs
        const scriptureCardText =
          (await page.getByTestId('scripture-card').innerText()) ?? '';
        expect(scriptureCardText).not.toContain('First Reading');
        expect(scriptureCardText).not.toContain('Second Reading');
        expect(scriptureCardText).not.toContain('Responsorial Psalm');
        await expect(page.getByRole('tab')).toHaveCount(0);

        // Zero legacy-role copy
        const bodyText = (await page.locator('body').innerText()) ?? '';
        const forbiddenRole = ['Assis', 'tant'].join('');
        expect(bodyText).not.toContain(forbiddenRole);
      }

      // Participant DOM contains zero Mass reading references (no facilitator context note)
      const participantBody =
        (await pageParticipant.locator('body').innerText()) ?? '';
      expect(participantBody).not.toContain('First Reading');
      expect(participantBody).not.toContain('Second Reading');
      expect(participantBody).not.toContain('Responsorial Psalm');
    } finally {
      await closeLiveSession(pageLeader);
      await Promise.allSettled([
        participantContext.close(),
        leaderContext.close(),
      ]);
    }
  });

  test('Scenario 2: non-overlapping mobile layout on 375x812 viewport', async ({
    browser,
  }) => {
    // 375x812 mobile viewport (iPhone mini standard)
    const leaderContext = await browser.newContext({
      viewport: { width: 375, height: 812 },
    });
    const participantContext = await browser.newContext({
      viewport: { width: 375, height: 812 },
    });
    const pageLeader = await leaderContext.newPage();
    const pageParticipant = await participantContext.newPage();

    try {
      const sessionCode = await createLeaderInLobby(pageLeader);
      await joinAsParticipant(pageParticipant, sessionCode, 'Elena');
      await startStudyOnSection1(pageLeader, [pageParticipant]);
      await reachGospelReading(pageLeader, [pageLeader, pageParticipant]);

      // Assert Scripture card and Read aloud orb render without vertical overlap
      const scriptureCard = pageParticipant.getByTestId('scripture-card');
      const readAloudOrb = pageParticipant.getByTestId('read-aloud-orb');
      await expect(scriptureCard).toBeVisible();
      await expect(readAloudOrb).toBeVisible();

      const scriptureBox = await scriptureCard.boundingBox();
      const orbBox = await readAloudOrb.boundingBox();
      expect(scriptureBox).toBeTruthy();
      expect(orbBox).toBeTruthy();

      if (scriptureBox && orbBox) {
        // Scripture card bottom must be strictly above or equal to orb top (positive vertical separation)
        expect(scriptureBox.y + scriptureBox.height).toBeLessThanOrEqual(
          orbBox.y,
        );
      }
    } finally {
      await closeLiveSession(pageLeader);
      await Promise.allSettled([
        participantContext.close(),
        leaderContext.close(),
      ]);
    }
  });

  test('Scenario 3: volunteering via Read aloud orb and avatar roster strip selection', async ({
    browser,
  }) => {
    const leaderContext = await browser.newContext();
    const danielContext = await browser.newContext();
    const mariaContext = await browser.newContext();
    const pageLeader = await leaderContext.newPage();
    const pageDaniel = await danielContext.newPage();
    const pageMaria = await mariaContext.newPage();

    try {
      const sessionCode = await createLeaderInLobby(pageLeader);
      await joinAsParticipant(pageDaniel, sessionCode, 'Daniel');
      await joinAsParticipant(pageMaria, sessionCode, 'Maria');
      await startStudyOnSection1(pageLeader, [pageDaniel, pageMaria]);
      await reachGospelReading(pageLeader, [
        pageLeader,
        pageDaniel,
        pageMaria,
      ]);

      // Initially 0 / 2 volunteers
      await expect(pageLeader.getByTestId('reader-count-chip')).toHaveText(
        '0 / 2',
      );

      // Daniel volunteers by tapping the Read aloud orb
      await pageDaniel.getByTestId('read-aloud-orb').click();
      await expect(pageDaniel.getByTestId('read-aloud-orb')).toHaveAttribute(
        'data-raised',
        'true',
      );

      // Leader sees counter update to 1 / 2
      await expect(pageLeader.getByTestId('reader-count-chip')).toHaveText(
        '1 / 2',
      );

      // Leader assigns Maria directly by tapping her avatar in the roster strip
      const mariaAvatar = pageLeader.locator(
        '[data-testid^="roster-avatar-"][data-member-id]',
      ).filter({ hasText: 'Maria' });
      await expect(mariaAvatar).toBeVisible();
      await mariaAvatar.click();

      // Maria receives chosen status
      await expect(
        pageMaria.getByTestId('reading-chosen-view'),
      ).toBeVisible();
    } finally {
      await closeLiveSession(pageLeader);
      await Promise.allSettled([
        mariaContext.close(),
        danielContext.close(),
        leaderContext.close(),
      ]);
    }
  });

  test('Scenario 4: random selection integration in Section 3 with 30s countdown', async ({
    browser,
  }) => {
    const leaderContext = await browser.newContext();
    const p1Context = await browser.newContext();
    const p2Context = await browser.newContext();
    const pageLeader = await leaderContext.newPage();
    const pageP1 = await p1Context.newPage();
    const pageP2 = await p2Context.newPage();

    try {
      const sessionCode = await createLeaderInLobby(pageLeader);
      await joinAsParticipant(pageP1, sessionCode, 'Lucas');
      await joinAsParticipant(pageP2, sessionCode, 'Sofia');
      await startStudyOnSection1(pageLeader, [pageP1, pageP2]);
      await reachGospelReading(pageLeader, [pageLeader, pageP1, pageP2]);

      // Leader clicks Random
      const randomBtn = pageLeader.getByTestId('random-picker-button');
      await expect(randomBtn).toBeVisible();
      await randomBtn.click();

      // 30s countdown panel appears on all screens
      for (const page of [pageLeader, pageP1, pageP2]) {
        await expect(page.getByTestId('random-selection-panel')).toBeVisible();
        await expect(page.getByTestId('random-countdown')).toBeVisible();
      }

      // Leader confirms selection
      await pageLeader.getByTestId('random-confirm-button').click();
      await expect(
        pageLeader.getByTestId('random-selection-panel'),
      ).toHaveCount(0);

      // One of the participants was chosen and receives YOU WERE CHOSEN view
      const p1Chosen = await pageP1
        .getByTestId('reading-chosen-view')
        .isVisible();
      const p2Chosen = await pageP2
        .getByTestId('reading-chosen-view')
        .isVisible();
      expect(p1Chosen || p2Chosen).toBe(true);
    } finally {
      await closeLiveSession(pageLeader);
      await Promise.allSettled([
        p2Context.close(),
        p1Context.close(),
        leaderContext.close(),
      ]);
    }
  });

  test('Scenario 5: exclusive Done Reading button and gated advance into Section 4', async ({
    browser,
  }) => {
    const leaderContext = await browser.newContext();
    const chosenContext = await browser.newContext();
    const bystanderContext = await browser.newContext();
    const pageLeader = await leaderContext.newPage();
    const pageChosen = await chosenContext.newPage();
    const pageBystander = await bystanderContext.newPage();

    try {
      const sessionCode = await createLeaderInLobby(pageLeader);
      await joinAsParticipant(pageChosen, sessionCode, 'Reader');
      await joinAsParticipant(pageBystander, sessionCode, 'Bystander');
      await startStudyOnSection1(pageLeader, [pageChosen, pageBystander]);
      await reachGospelReading(pageLeader, [
        pageLeader,
        pageChosen,
        pageBystander,
      ]);

      // Leader assigns Reader from roster strip
      const readerAvatar = pageLeader.locator(
        '[data-testid^="roster-avatar-"]',
      ).filter({ hasText: 'Reader' });
      await readerAvatar.click();

      // ONLY the chosen reader receives YOU WERE CHOSEN and Done Reading button
      await expect(pageChosen.getByTestId('reading-chosen-view')).toBeVisible();
      await expect(pageChosen.getByTestId('reading-done-button')).toBeVisible();

      // Bystander sees who is reading and zero Done controls
      await expect(
        pageBystander.getByTestId('reading-active-volunteer-note'),
      ).toHaveText('Reader is reading aloud');
      await expect(
        pageBystander.getByTestId('reading-done-button'),
      ).toHaveCount(0);

      // Study Leader advance bar is locked
      await expect(pageLeader.getByTestId('locked-advance-bar')).toContainText(
        'Reading proceeds: Waiting for reader to finish to advance',
      );
      await expect(pageLeader.getByTestId('reading-advance-cta')).toHaveCount(0);

      // Reader taps Done Reading
      await pageChosen.getByTestId('reading-done-button').click();
      await expect(
        pageChosen.getByTestId('reading-done-completed'),
      ).toHaveText('Praise to you, Lord Jesus Christ.');

      // Leader's advance bar morphs into gold Begin Discussion → CTA
      await expect(pageLeader.getByTestId('reading-advance-cta')).toBeVisible();
      await expect(pageLeader.getByTestId('reading-advance-cta')).toHaveText(
        'Begin Discussion →',
      );

      // Leader advances all clients to Section 4
      await pageLeader.getByTestId('reading-advance-cta').click();
      for (const page of [pageLeader, pageChosen, pageBystander]) {
        await expect(page.getByTestId('section-placeholder')).toBeVisible();
        await expect(page.getByTestId('section-one-label')).toHaveText(
          'SECTION 4 OF 5',
        );
        await expect(page.getByTestId('section-one-percent')).toHaveText('80%');
      }
    } finally {
      await closeLiveSession(pageLeader);
      await Promise.allSettled([
        bystanderContext.close(),
        chosenContext.close(),
        leaderContext.close(),
      ]);
    }
  });

  test('Scenario 6: facilitator liturgical context privacy, reload hydration, & leader override', async ({
    browser,
  }) => {
    const leaderContext = await browser.newContext();
    const readerContext = await browser.newContext();
    const pageLeader = await leaderContext.newPage();
    const pageReader = await readerContext.newPage();

    try {
      const sessionCode = await createLeaderInLobby(pageLeader);
      await joinAsParticipant(pageReader, sessionCode, 'Mateo');
      await startStudyOnSection1(pageLeader, [pageReader]);
      await reachGospelReading(pageLeader, [pageLeader, pageReader]);

      // Liturgical context note is visible exclusively on Study Leader screen
      await expect(
        pageLeader.getByTestId('leader-liturgical-context-note'),
      ).toBeVisible();
      await expect(
        pageLeader.getByTestId('leader-liturgical-context-note'),
      ).toContainText('Isaiah 56');

      // Participant DOM contains zero traces of liturgical note
      await expect(
        pageReader.getByTestId('leader-liturgical-context-note'),
      ).toHaveCount(0);
      const readerBody = (await pageReader.locator('body').innerText()) ?? '';
      expect(readerBody).not.toContain('Isaiah 56');

      // Assign Mateo as reader
      const mateoAvatar = pageLeader.locator(
        '[data-testid^="roster-avatar-"]',
      ).filter({ hasText: 'Mateo' });
      await mateoAvatar.click();
      await expect(pageReader.getByTestId('reading-chosen-view')).toBeVisible();

      // Reload Mateo's page — chosen state rehydrates from sessionStorage / snapshot
      await pageReader.reload();
      await expect(pageReader.getByTestId('reading-chosen-view')).toBeVisible();
      await expect(pageReader.getByTestId('reading-done-button')).toBeVisible();

      // Mateo disconnects (closes tab)
      await pageReader.close();

      // Leader can use override to unlock advancement without deadlock
      await pageLeader.getByTestId('reading-override-button').click();
      await expect(pageLeader.getByTestId('reading-advance-cta')).toBeVisible();
      await pageLeader.getByTestId('reading-advance-cta').click();
      await expect(pageLeader.getByTestId('section-placeholder')).toBeVisible();
      await expect(pageLeader.getByTestId('section-one-label')).toHaveText(
        'SECTION 4 OF 5',
      );
    } finally {
      await closeLiveSession(pageLeader);
      await Promise.allSettled([
        leaderContext.close(),
      ]);
    }
  });
});

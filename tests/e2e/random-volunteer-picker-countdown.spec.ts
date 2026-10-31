import { expect as baseExpect, test, type Page } from '@playwright/test';

// Per-suite assertion headroom: under in-suite contention (one worker, many
// sequential multi-context scenarios) a live /ws round trip or React resync can
// stall past the default 5s expect budget. Assertions are unchanged — only the
// patience is.
const expect = baseExpect.configure({ timeout: 15_000 });

interface RawRandomProbeResult {
  joinType: string | null;
  errorType: string | null;
  errorCode: string | null;
}

/**
 * Raw /ws probe from the page (a fresh socket bound via `join_session`, never
 * the app's live client): the bound Participant's own `pick_random` must
 * reject with `FORBIDDEN_LEADER_ONLY` — leader-only gating is enforced on the
 * server, not by hiding buttons. Bounded waits (3s each); never throws.
 */
async function probeRawParticipantPickRandom(
  page: Page,
  input: { sessionCode: string },
): Promise<RawRandomProbeResult | null> {
  try {
    return await page.evaluate(async ({ sessionCode }) => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      const messages: Array<Record<string, unknown>> = [];
      ws.addEventListener('message', (event) => {
        messages.push(JSON.parse(String(event.data)) as Record<string, unknown>);
      });

      const bounded = <T,>(work: Promise<T>): Promise<T | null> =>
        Promise.race([
          work,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
        ]);

      await bounded(
        new Promise<void>((resolve) =>
          ws.addEventListener('open', () => resolve(), { once: true }),
        ),
      );

      let cursor = 0;
      const waitFor = async (
        match: (msg: Record<string, unknown>) => boolean,
      ): Promise<Record<string, unknown> | null> => {
        const deadline = Date.now() + 3000;
        while (Date.now() < deadline) {
          for (let i = cursor; i < messages.length; i += 1) {
            const msg = messages[i];
            if (msg && match(msg)) {
              cursor = i + 1;
              return msg;
            }
          }
          await new Promise<void>((resolve) => setTimeout(resolve, 50));
        }
        return null;
      };

      // Bind this raw socket as a fresh Participant.
      ws.send(
        JSON.stringify({ type: 'join_session', sessionCode, displayName: 'Carla' }),
      );
      const joined = await waitFor((m) => m.type === 'session_joined');
      const session = joined?.session as
        | { members?: Array<{ memberId: string; displayName: string }> }
        | undefined;
      const selfId = session?.members?.find(
        (m) => m.displayName === 'Carla',
      )?.memberId;

      if (selfId) {
        ws.send(
          JSON.stringify({
            type: 'pick_random',
            sessionCode,
            leaderToken: 'not-a-leader-token',
            memberId: selfId,
          }),
        );
      }
      const error = await waitFor((m) => m.type === 'session_error');

      ws.close();
      return {
        joinType: (joined?.type as string | undefined) ?? null,
        errorType: (error?.type as string | undefined) ?? null,
        errorCode: (error?.code as string | undefined) ?? null,
      };
    }, input);
  } catch {
    return null;
  }
}

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

/** The three leader-control strings must never leak into participant DOM. */
async function expectNoLeaderControlsInParticipantDom(
  page: Page,
): Promise<void> {
  const body = await page.locator('body').innerText();
  expect(body).not.toContain('Pick Randomly');
  expect(body).not.toContain('Retry');
  expect(body).not.toContain('Confirm selection');
}

test.describe('Section 1 — random volunteer picker with 30s countdown', () => {
  // Multi-context live /ws scenarios: same hardening as Sessions 021–022
  // (60s suite timeout, 15s expects, bounded never-throwing cleanup).
  test.describe.configure({ timeout: 60_000 });

  test('Scenario 1 slice: Pick Randomly syncs the countdown panel on 3 clients, Confirm hands off to YOU WERE CHOSEN, Done opens the gate', async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(90_000);
    const leaderContext = await browser.newContext();
    const pageLeader = await leaderContext.newPage();
    const miaContext = await browser.newContext();
    const pageMia = await miaContext.newPage();
    const leoContext = await browser.newContext();
    const pageLeo = await leoContext.newPage();

    try {
      const sessionCode = await createLeaderInLobby(pageLeader);
      await joinAsParticipant(pageMia, sessionCode, 'Mia');
      await joinAsParticipant(pageLeo, sessionCode, 'Leo');
      await startStudyOnSection1(pageLeader, [pageMia, pageLeo]);

      // Leader-only Pick Randomly pill (ux/4) while collecting hands.
      const pickButton = pageLeader.getByTestId('random-pick-button');
      await expect(pickButton).toBeEnabled();
      await expect(pickButton).toContainText('Pick Randomly');
      await expect(pageMia.getByTestId('random-pick-button')).toHaveCount(0);
      await expect(pageLeo.getByTestId('random-pick-button')).toHaveCount(0);
      await pickButton.click();

      // Every client shows the shared countdown panel (ux/9). The candidate is
      // a fair pick among the two connected Participants (either is valid).
      for (const page of [pageLeader, pageMia, pageLeo]) {
        await expect(page.getByTestId('random-selection-panel')).toContainText(
          'RANDOM SELECTION',
        );
        await expect(page.getByTestId('random-notification-title')).toHaveText(
          'Notification sent',
        );
        await expect(page.getByTestId('random-countdown')).toHaveAttribute(
          'role',
          'timer',
        );
        await expect(page.getByTestId('random-countdown')).toHaveText(
          /^0:[0-5]\d$/,
        );
      }

      const candidateName = (
        await pageLeader.getByTestId('random-candidate-name').innerText()
      ).trim();
      expect(['Mia', 'Leo']).toContain(candidateName);
      const chosenPage = candidateName === 'Mia' ? pageMia : pageLeo;
      const bystanderPage = candidateName === 'Mia' ? pageLeo : pageMia;

      for (const page of [pageLeader, pageMia, pageLeo]) {
        await expect(page.getByTestId('random-candidate-name')).toHaveText(
          candidateName,
        );
        await expect(page.getByTestId('random-notification-copy')).toHaveText(
          `${candidateName} has 30 seconds to accept.`,
        );
        await expect(page.getByTestId('random-selection-panel')).toContainText(
          'has been randomly chosen to pray.',
        );
      }

      // The server-authoritative countdown ticks on every client.
      const countdown = pageMia.getByTestId('random-countdown');
      const initialCountdown = (await countdown.innerText()).trim();
      await expect(countdown).not.toHaveText(initialCountdown);

      // Leader-only controls: Retry + Confirm selection on the leader's DOM
      // only; the three leader strings never appear in participant DOM.
      await expect(pageLeader.getByTestId('random-retry-button')).toBeVisible();
      await expect(
        pageLeader.getByTestId('random-confirm-button'),
      ).toContainText('Confirm selection');
      await expect(pageMia.getByTestId('random-retry-button')).toHaveCount(0);
      await expect(pageMia.getByTestId('random-confirm-button')).toHaveCount(0);
      await expectNoLeaderControlsInParticipantDom(pageMia);
      await expectNoLeaderControlsInParticipantDom(pageLeo);

      // Confirm hands the candidate into the unchanged chosen-volunteer gate.
      await pageLeader.getByTestId('random-confirm-button').click();
      await expect(chosenPage.getByTestId('prayer-chosen-view')).toBeVisible();
      await expect(chosenPage.getByTestId('prayer-chosen-pill')).toContainText(
        'YOU WERE CHOSEN',
      );
      await expect(chosenPage.getByTestId('prayer-done-button')).toBeEnabled();
      await expect(pageLeader.getByTestId('prayer-chosen-banner')).toContainText(
        `${candidateName} is praying — waiting for Done`,
      );
      await expect(
        bystanderPage.getByTestId('prayer-active-volunteer-note'),
      ).toHaveText(`${candidateName} is praying now`);
      await expect(
        pageLeader.getByTestId('random-selection-panel'),
      ).toHaveCount(0);

      // Done unlocks the gold Continue CTA and next_section advances (gate reused).
      await chosenPage.getByTestId('prayer-done-button').click();
      await expect(
        chosenPage.getByTestId('prayer-done-completed'),
      ).toHaveText('Amen — thank you for praying.');
      await expect(pageLeader.getByTestId('prayer-advance-cta')).toContainText(
        'Continue to Section 2 →',
      );
      await pageLeader.getByTestId('prayer-advance-cta').click();
      await expect(pageLeader.getByTestId('icebreaker-screen')).toBeVisible();
      await expect(pageLeader.getByTestId('section-one-label')).toHaveText(
        'SECTION 2 OF 5',
      );
    } finally {
      await closeLiveSession(pageLeader);
      await Promise.allSettled([
        miaContext.close(),
        leoContext.close(),
        leaderContext.close(),
      ]);
    }
  });

  test('Scenario 2 slice: Retry re-rolls to the other eligible Participant', async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(90_000);
    const leaderContext = await browser.newContext();
    const pageLeader = await leaderContext.newPage();
    const miaContext = await browser.newContext();
    const pageMia = await miaContext.newPage();
    const leoContext = await browser.newContext();
    const pageLeo = await leoContext.newPage();

    try {
      const sessionCode = await createLeaderInLobby(pageLeader);
      await joinAsParticipant(pageMia, sessionCode, 'Mia');
      await joinAsParticipant(pageLeo, sessionCode, 'Leo');
      await startStudyOnSection1(pageLeader, [pageMia, pageLeo]);

      await pageLeader.getByTestId('random-pick-button').click();
      await expect(pageLeader.getByTestId('random-selection-panel')).toContainText(
        'RANDOM SELECTION',
      );
      const firstCandidate = (
        await pageLeader.getByTestId('random-candidate-name').innerText()
      ).trim();
      expect(['Mia', 'Leo']).toContain(firstCandidate);

      // With exactly two eligible Participants, Retry is deterministic: the
      // re-roll ALWAYS lands on the other one (server excludes the candidate).
      await pageLeader.getByTestId('random-retry-button').click();
      await expect
        .poll(async () =>
          (
            await pageLeader.getByTestId('random-candidate-name').innerText()
          ).trim(),
        )
        .toBe(firstCandidate === 'Mia' ? 'Leo' : 'Mia');

      // The re-rolled state syncs to everyone and stays confirmable.
      const secondCandidate = (
        await pageLeader.getByTestId('random-candidate-name').innerText()
      ).trim();
      await expect(pageMia.getByTestId('random-candidate-name')).toHaveText(
        secondCandidate,
      );
      await expect(pageLeo.getByTestId('random-candidate-name')).toHaveText(
        secondCandidate,
      );
      await pageLeader.getByTestId('random-confirm-button').click();
      await expect(pageLeader.getByTestId('prayer-chosen-banner')).toContainText(
        `${secondCandidate} is praying — waiting for Done`,
      );
    } finally {
      await closeLiveSession(pageLeader);
      await Promise.allSettled([
        miaContext.close(),
        leoContext.close(),
        leaderContext.close(),
      ]);
    }
  });

  test('Scenario 3 UI slice: raw participant pick_random rejects FORBIDDEN_LEADER_ONLY on /ws', async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(90_000);
    const leaderContext = await browser.newContext();
    const pageLeader = await leaderContext.newPage();
    const participantContext = await browser.newContext();
    const pageParticipant = await participantContext.newPage();

    try {
      const sessionCode = await createLeaderInLobby(pageLeader);
      await joinAsParticipant(pageParticipant, sessionCode, 'Mia');
      await startStudyOnSection1(pageLeader, [pageParticipant]);

      const probe = await probeRawParticipantPickRandom(pageParticipant, {
        sessionCode,
      });
      expect(probe).not.toBeNull();
      expect(probe?.joinType).toBe('session_joined');
      expect(probe?.errorType).toBe('session_error');
      expect(probe?.errorCode).toBe('FORBIDDEN_LEADER_ONLY');

      // Hiding the controls is cosmetic only; the DOM stays clean regardless.
      await expectNoLeaderControlsInParticipantDom(pageParticipant);
    } finally {
      await closeLiveSession(pageLeader);
      await Promise.allSettled([
        participantContext.close(),
        leaderContext.close(),
      ]);
    }
  });

  test('Scenario 4 slice: solo leader gets the disabled Pick Randomly pill with a clear note', async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(90_000);
    const leaderContext = await browser.newContext();
    const pageLeader = await leaderContext.newPage();

    try {
      await createLeaderInLobby(pageLeader);
      await startStudyOnSection1(pageLeader, []);

      const pickButton = pageLeader.getByTestId('random-pick-button');
      await expect(pickButton).toBeDisabled();
      await expect(pageLeader.getByTestId('random-empty-note')).toContainText(
        'No Participants are connected yet',
      );
    } finally {
      await closeLiveSession(pageLeader);
      await Promise.allSettled([leaderContext.close()]);
    }
  });
});

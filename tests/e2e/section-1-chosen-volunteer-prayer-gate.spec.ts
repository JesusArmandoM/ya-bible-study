import { expect as baseExpect, test, type Page } from '@playwright/test';

// Per-suite assertion headroom: under in-suite contention (one worker, many
// sequential multi-context scenarios) a live /ws round trip or React resync can
// stall past the default 5s expect budget. Assertions are unchanged — only the
// patience is.
const expect = baseExpect.configure({ timeout: 15_000 });

interface RawGateProbeResult {
  joinType: string | null;
  selfErrorType: string | null;
  selfErrorCode: string | null;
  spoofErrorType: string | null;
  spoofErrorCode: string | null;
}

/**
 * Raw /ws probe from the page (a fresh socket bound via `join_session`, never
 * the app's live client): the bound non-selected member's own `complete_turn`
 * and a spoofed chosen-memberId `complete_turn` must BOTH reject with
 * `UNAUTHORIZED_MEMBER`. Polling waits are bounded (3s each) and the helper
 * never throws — it reports what it observed.
 */
async function probeRawCompleteTurn(
  page: Page,
  input: { sessionCode: string; chosenName: string },
): Promise<RawGateProbeResult | null> {
  try {
    return await page.evaluate(
      async ({ sessionCode, chosenName }) => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
        const messages: Array<Record<string, unknown>> = [];
        ws.addEventListener('message', (event) => {
          messages.push(
            JSON.parse(String(event.data)) as Record<string, unknown>,
          );
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

        // Bind this raw socket as a fresh non-selected participant.
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
        const chosenId = session?.members?.find(
          (m) => m.displayName === chosenName,
        )?.memberId;

        // (1) Bound non-selected member's own complete_turn.
        if (selfId) {
          ws.send(
            JSON.stringify({ type: 'complete_turn', sessionCode, memberId: selfId }),
          );
        }
        const selfError = await waitFor((m) => m.type === 'session_error');

        // (2) Spoofed chosen-memberId complete_turn on the same foreign socket.
        if (chosenId) {
          ws.send(
            JSON.stringify({
              type: 'complete_turn',
              sessionCode,
              memberId: chosenId,
            }),
          );
        }
        const spoofError = await waitFor((m) => m.type === 'session_error');

        ws.close();
        return {
          joinType: (joined?.type as string | undefined) ?? null,
          selfErrorType: (selfError?.type as string | undefined) ?? null,
          selfErrorCode: (selfError?.code as string | undefined) ?? null,
          spoofErrorType: (spoofError?.type as string | undefined) ?? null,
          spoofErrorCode: (spoofError?.code as string | undefined) ?? null,
        };
      },
      input,
    );
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

test.describe('Section 1 — chosen volunteer prayer gate', () => {
  // Multi-context live /ws scenarios: same headroom rationale as
  // section-1-opening-prayer.spec.ts, plus per-test bumps where two
  // participant contexts round-trip through choose/complete.
  test.describe.configure({ timeout: 60_000 });

  test('Scenario 1 slice: leader chooses a raised hand, the chosen participant completes with Done, and the Section 1 gate opens', async ({
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

      // Daniel raises his hand.
      await pageParticipant.getByTestId('hand-raise-orb').click();
      await expect(pageParticipant.getByTestId('hand-raise-orb')).toContainText(
        'Hand Raised',
      );
      await expect(
        pageParticipant.getByTestId('prayer-count-pill-text'),
      ).toHaveText('1 person has raised their hand');
      await expect(
        pageParticipant.getByTestId('prayer-count-pill-hint'),
      ).toHaveText('The leader will choose shortly');
      await expect(pageLeader.getByTestId('prayer-queue-count')).toHaveText(
        '1 hand raised',
      );

      // Leader chooses Daniel from the queue row.
      const choosePill = pageLeader.getByTestId('prayer-queue-choose');
      await expect(choosePill).toHaveAttribute(
        'aria-label',
        'Choose Daniel to pray',
      );
      await choosePill.click();

      // Chosen-only view: exclusive Done action, chosen copy, aria-live.
      await expect(pageParticipant.getByTestId('prayer-chosen-view')).toBeVisible();
      await expect(pageParticipant.getByTestId('prayer-chosen-pill')).toContainText(
        'YOU WERE CHOSEN',
      );
      await expect(pageParticipant.getByTestId('prayer-chosen-title')).toHaveText(
        "It's your turn to pray",
      );
      await expect(pageParticipant.getByTestId('prayer-chosen-live')).toHaveText(
        'You were chosen',
      );
      await expect(pageParticipant.getByTestId('prayer-done-button')).toBeEnabled();
      await expect(pageParticipant.getByTestId('prayer-done-button')).toContainText(
        'Done',
      );

      // Leader: chosen banner, queue chip REPLACING the Choose pill, override
      // outside the locked bar, and the byte-identical locked copy.
      await expect(pageLeader.getByTestId('prayer-chosen-banner')).toContainText(
        'Daniel is praying — waiting for Done',
      );
      await expect(pageLeader.getByTestId('prayer-queue-choose')).toHaveCount(0);
      await expect(pageLeader.getByTestId('prayer-queue-chosen-chip')).toHaveText(
        'Chosen',
      );
      const overrideButton = pageLeader.getByTestId('prayer-override-button');
      await expect(overrideButton).toHaveText('Mark done (Leader override)');
      await expect(
        pageLeader.getByTestId('locked-advance-bar').getByTestId('prayer-override-button'),
      ).toHaveCount(0);
      await expect(
        pageLeader.getByTestId('locked-advance-bar').getByRole('button'),
      ).toHaveCount(0);
      await expect(pageLeader.getByTestId('locked-advance-bar')).toContainText(
        '🔒',
      );
      await expect(
        pageLeader.locator('.locked-advance-copy'),
      ).toHaveText('Waiting for volunteer to advance');
      await expect(
        pageParticipant.locator('.locked-advance-copy'),
      ).toHaveText('Only the leader decides when to advance');

      // The chosen participant completes the turn with Done.
      await pageParticipant.getByTestId('prayer-done-button').click();
      await expect(
        pageParticipant.getByTestId('prayer-done-completed'),
      ).toHaveText('Amen — thank you for praying.');
      await expect(pageParticipant.getByTestId('prayer-done-button')).toHaveCount(0);

      // The Section 1 gate opens: gold Continue CTA replaces the locked bar.
      await expect(pageLeader.getByTestId('prayer-advance-cta')).toContainText(
        'Continue to Section 2 →',
      );
      await expect(pageLeader.getByTestId('locked-advance-bar')).toHaveCount(0);

      // Continuing advances everyone to Section 2 (icebreaker screen, 40%).
      // Compat edit (section-2-icebreaker-flow): `section-placeholder` testid
      // became `icebreaker-screen` — the provisional placeholder is replaced by
      // the real Section 2 screen. Assertions otherwise unchanged.
      await pageLeader.getByTestId('prayer-advance-cta').click();
      await expect(pageLeader.getByTestId('icebreaker-screen')).toBeVisible();
      await expect(pageLeader.getByTestId('section-one-label')).toHaveText(
        'SECTION 2 OF 5',
      );
      await expect(pageLeader.getByTestId('section-one-percent')).toHaveText('40%');
      await expect(pageParticipant.getByTestId('icebreaker-screen')).toBeVisible();
      await expect(pageParticipant.getByTestId('section-one-label')).toHaveText(
        'SECTION 2 OF 5',
      );
      await expect(pageParticipant.getByTestId('section-one-percent')).toHaveText(
        '40%',
      );
    } finally {
      await closeLiveSession(pageLeader);
      await Promise.allSettled([
        participantContext.close(),
        leaderContext.close(),
      ]);
    }
  });

  test('Scenario 2 slice: everyone else stays an observer with byte-identical lock copy, and hand churn never revokes the choice', async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(90_000);
    const leaderContext = await browser.newContext();
    const pageLeader = await leaderContext.newPage();
    const chosenContext = await browser.newContext();
    const pageChosen = await chosenContext.newPage();
    const bystanderContext = await browser.newContext();
    const pageBystander = await bystanderContext.newPage();

    try {
      const sessionCode = await createLeaderInLobby(pageLeader);
      await joinAsParticipant(pageChosen, sessionCode, 'Daniel');
      await joinAsParticipant(pageBystander, sessionCode, 'Maria');
      await startStudyOnSection1(pageLeader, [pageChosen, pageBystander]);

      await pageChosen.getByTestId('hand-raise-orb').click();
      await expect(pageLeader.getByTestId('prayer-queue-count')).toHaveText(
        '1 hand raised',
      );
      await pageLeader.getByTestId('prayer-queue-choose').click();
      await expect(pageLeader.getByTestId('prayer-chosen-banner')).toContainText(
        'Daniel is praying — waiting for Done',
      );

      // Non-chosen participants see the active-volunteer note and no
      // Choose/Done action anywhere in their DOM.
      await expect(
        pageBystander.getByTestId('prayer-active-volunteer-note'),
      ).toHaveText('Daniel is praying now');
      await expect(pageBystander.getByTestId('prayer-chosen-view')).toHaveCount(0);
      await expect(pageBystander.locator('body')).not.toContainText(
        'YOU WERE CHOSEN',
      );
      await expect(pageBystander.locator('body')).not.toContainText('Choose');
      await expect(pageBystander.locator('body')).not.toContainText('Done');

      // The leader never gets a Done action; the chosen view is not theirs.
      await expect(
        pageLeader.getByRole('button', { name: 'Done', exact: true }),
      ).toHaveCount(0);
      await expect(pageLeader.getByTestId('prayer-chosen-view')).toHaveCount(0);

      // The chosen participant's own lowering control is gone (chosen-only
      // view), so hand churn comes from the leader queue: lowering Daniel's
      // hand never revokes the choice.
      await expect(pageChosen.getByTestId('hand-raise-orb')).toHaveCount(0);
      await pageLeader.getByRole('button', { name: "Lower Daniel's hand" }).click();
      await expect(pageLeader.getByTestId('prayer-queue-count')).toHaveText(
        '0 hands raised',
      );
      await expect(pageLeader.getByTestId('prayer-queue-empty')).toHaveText(
        'No hands raised yet',
      );
      await expect(pageChosen.getByTestId('prayer-chosen-view')).toBeVisible();
      await expect(pageChosen.getByTestId('prayer-done-button')).toBeEnabled();
      await expect(pageLeader.getByTestId('prayer-chosen-banner')).toContainText(
        'Daniel is praying — waiting for Done',
      );

      // Hand churn from someone else does not replace the selection: Maria
      // raises and gets her own Choose pill (reassignment stays available),
      // while Daniel remains the chosen volunteer (banner + chosen view +
      // Done below). The per-row Chosen chip only rides the chosen member's
      // own queue row (spec Open Question 3: a vanished row is cosmetic).
      await pageBystander.getByTestId('hand-raise-orb').click();
      await expect(pageLeader.getByTestId('prayer-queue-count')).toHaveText(
        '1 hand raised',
      );
      await expect(pageLeader.getByTestId('prayer-queue-choose')).toHaveCount(1);
      await expect(pageLeader.getByTestId('prayer-queue-choose')).toHaveAttribute(
        'aria-label',
        'Choose Maria to pray',
      );
      await expect(pageLeader.getByTestId('prayer-queue-row')).toHaveCount(1);
      await expect(pageLeader.getByTestId('prayer-chosen-banner')).toContainText(
        'Daniel is praying — waiting for Done',
      );
      await expect(pageChosen.getByTestId('prayer-done-button')).toBeEnabled();

      // The advance lock copy stays byte-identical until completion, with no
      // interactive controls inside the bar on any role.
      await expect(
        pageLeader.getByTestId('locked-advance-bar').getByRole('button'),
      ).toHaveCount(0);
      await expect(
        pageLeader.locator('.locked-advance-copy'),
      ).toHaveText('Waiting for volunteer to advance');
      await expect(
        pageChosen.locator('.locked-advance-copy'),
      ).toHaveText('Only the leader decides when to advance');
      await expect(
        pageBystander.locator('.locked-advance-copy'),
      ).toHaveText('Only the leader decides when to advance');

      // No horizontal overflow at 390x844 on the chosen view.
      const overflow = await pageChosen.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    } finally {
      await closeLiveSession(pageLeader);
      await Promise.allSettled([
        chosenContext.close(),
        bystanderContext.close(),
        leaderContext.close(),
      ]);
    }
  });

  test('Scenario 3 slice: the leader can complete an unassigned prayer turn by override, with no Choose/Done leaks', async ({
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

      // No raises: empty-state copy and a leader override strictly outside
      // the zero-control locked bar.
      await expect(pageLeader.getByTestId('prayer-queue-count')).toHaveText(
        '0 hands raised',
      );
      await expect(pageLeader.getByTestId('prayer-queue-empty')).toHaveText(
        'No hands raised yet',
      );
      await expect(
        pageLeader.getByTestId('locked-advance-bar').getByRole('button'),
      ).toHaveCount(0);
      await expect(
        pageLeader.locator('.locked-advance-copy'),
      ).toHaveText('Waiting for volunteer to advance');
      const overrideButton = pageLeader.getByTestId('prayer-override-button');
      await expect(overrideButton).toHaveText('Mark done (Leader override)');
      await expect(
        pageLeader.getByTestId('locked-advance-bar').getByTestId('prayer-override-button'),
      ).toHaveCount(0);

      await overrideButton.click();

      // Once completed there is no override control left to re-dispatch, and
      // the zone has morphed into the gold advance CTA.
      await expect(pageLeader.getByTestId('prayer-override-button')).toHaveCount(0);
      await expect(pageLeader.getByTestId('prayer-advance-cta')).toContainText(
        'Continue to Section 2 →',
      );

      // After completion: no Choose action anywhere and no Done action for
      // the participant, who just sees the completed note.
      await expect(pageLeader.getByTestId('prayer-queue-choose')).toHaveCount(0);
      await expect(
        pageLeader.getByRole('button', { name: 'Done', exact: true }),
      ).toHaveCount(0);
      await expect(pageParticipant.locator('body')).not.toContainText('Choose');
      await expect(pageParticipant.locator('body')).not.toContainText('Done');
      await expect(
        pageParticipant.getByTestId('prayer-completed-note'),
      ).toHaveText('The Opening Prayer is complete');
    } finally {
      await closeLiveSession(pageLeader);
      await Promise.allSettled([
        participantContext.close(),
        leaderContext.close(),
      ]);
    }
  });

  test('Scenario 4 slice: raw /ws complete_turn from a bystander rejects UNAUTHORIZED_MEMBER, and the leader override advances after the chosen phone dies', async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(90_000);
    const leaderContext = await browser.newContext();
    const pageLeader = await leaderContext.newPage();
    const chosenContext = await browser.newContext();
    const pageChosen = await chosenContext.newPage();
    const bystanderContext = await browser.newContext();
    const pageBystander = await bystanderContext.newPage();

    try {
      const sessionCode = await createLeaderInLobby(pageLeader);
      await joinAsParticipant(pageChosen, sessionCode, 'Daniel');
      await joinAsParticipant(pageBystander, sessionCode, 'Maria');
      await startStudyOnSection1(pageLeader, [pageChosen, pageBystander]);

      await pageChosen.getByTestId('hand-raise-orb').click();
      await expect(pageLeader.getByTestId('prayer-queue-count')).toHaveText(
        '1 hand raised',
      );
      await pageLeader.getByTestId('prayer-queue-choose').click();
      await expect(pageLeader.getByTestId('prayer-chosen-banner')).toContainText(
        'Daniel is praying — waiting for Done',
      );

      // Server-side exclusivity over raw /ws: a bound non-selected member and
      // a spoofed chosen identity both reject complete_turn (the UI hiding of
      // Done is never the enforcement point).
      const probe = await probeRawCompleteTurn(pageBystander, {
        sessionCode,
        chosenName: 'Daniel',
      });
      expect(probe?.joinType).toBe('session_joined');
      expect(probe?.selfErrorType).toBe('session_error');
      expect(probe?.selfErrorCode).toBe('UNAUTHORIZED_MEMBER');
      expect(probe?.spoofErrorType).toBe('session_error');
      expect(probe?.spoofErrorCode).toBe('UNAUTHORIZED_MEMBER');

      // The gate is still locked after the rejected frames.
      await expect(pageLeader.getByTestId('prayer-advance-cta')).toHaveCount(0);
      await expect(pageLeader.getByTestId('locked-advance-bar')).toContainText(
        '🔒',
      );
      await expect(
        pageLeader.locator('.locked-advance-copy'),
      ).toHaveText('Waiting for volunteer to advance');

      // The chosen phone dies: the banner flags the reconnecting volunteer and
      // the leader override (the never-deadlock guarantee) completes the turn.
      await chosenContext.close();
      await expect(
        pageLeader.getByTestId('prayer-chosen-banner-status'),
      ).toContainText('reconnecting');
      await pageLeader.getByTestId('prayer-override-button').click();
      await expect(pageLeader.getByTestId('prayer-override-button')).toHaveCount(
        0,
      );
      await expect(pageLeader.getByTestId('prayer-advance-cta')).toContainText(
        'Continue to Section 2 →',
      );

      // Continuing advances everyone to Section 2 (icebreaker screen, 40%).
      // Compat edit (section-2-icebreaker-flow): `section-placeholder` testid
      // became `icebreaker-screen` — the provisional placeholder is replaced by
      // the real Section 2 screen. Assertions otherwise unchanged.
      await pageLeader.getByTestId('prayer-advance-cta').click();
      await expect(pageLeader.getByTestId('icebreaker-screen')).toBeVisible();
      await expect(pageLeader.getByTestId('section-one-label')).toHaveText(
        'SECTION 2 OF 5',
      );
      await expect(pageLeader.getByTestId('section-one-percent')).toHaveText(
        '40%',
      );
      await expect(pageBystander.getByTestId('icebreaker-screen')).toBeVisible();
      await expect(pageBystander.getByTestId('section-one-label')).toHaveText(
        'SECTION 2 OF 5',
      );
    } finally {
      await closeLiveSession(pageLeader);
      await Promise.allSettled([
        chosenContext.close(),
        bystanderContext.close(),
        leaderContext.close(),
      ]);
    }
  });

  test('Scenario 5 slice: a reload restores the chosen volunteer view and the exclusive Done still completes the turn', async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(90_000);
    const leaderContext = await browser.newContext();
    const pageLeader = await leaderContext.newPage();
    const chosenContext = await browser.newContext();
    const pageChosen = await chosenContext.newPage();

    try {
      const sessionCode = await createLeaderInLobby(pageLeader);
      await joinAsParticipant(pageChosen, sessionCode, 'Daniel');
      await startStudyOnSection1(pageLeader, [pageChosen]);

      await pageChosen.getByTestId('hand-raise-orb').click();
      await expect(pageLeader.getByTestId('prayer-queue-count')).toHaveText(
        '1 hand raised',
      );
      await pageLeader.getByTestId('prayer-queue-choose').click();
      await expect(pageChosen.getByTestId('prayer-chosen-view')).toBeVisible();

      // Reload: the selection is session state (not socket state) — the chosen
      // view rehydrates through session_reconnected.
      await pageChosen.reload();
      await expect(
        pageChosen.getByTestId('active-session-banner'),
      ).toBeVisible();
      await expect(pageChosen.getByTestId('prayer-chosen-view')).toBeVisible();
      await expect(pageChosen.getByTestId('prayer-chosen-pill')).toContainText(
        'YOU WERE CHOSEN',
      );
      await expect(
        pageChosen.getByTestId('prayer-chosen-title'),
      ).toHaveText("It's your turn to pray");
      await expect(pageChosen.getByTestId('prayer-done-button')).toBeEnabled();

      // The rehydrated chosen volunteer can still complete the turn.
      await pageChosen.getByTestId('prayer-done-button').click();
      await expect(pageChosen.getByTestId('prayer-done-completed')).toHaveText(
        'Amen — thank you for praying.',
      );
      await expect(pageLeader.getByTestId('prayer-advance-cta')).toContainText(
        'Continue to Section 2 →',
      );
      await pageLeader.getByTestId('prayer-advance-cta').click();
      await expect(pageLeader.getByTestId('icebreaker-screen')).toBeVisible();
      await expect(pageChosen.getByTestId('icebreaker-screen')).toBeVisible();
      await expect(pageChosen.getByTestId('section-one-label')).toHaveText(
        'SECTION 2 OF 5',
      );
    } finally {
      await closeLiveSession(pageLeader);
      await Promise.allSettled([
        chosenContext.close(),
        leaderContext.close(),
      ]);
    }
  });

  test('Scenario 5 slice: clearing raised hands never invalidates the chosen volunteer', async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(90_000);
    const leaderContext = await browser.newContext();
    const pageLeader = await leaderContext.newPage();
    const chosenContext = await browser.newContext();
    const pageChosen = await chosenContext.newPage();
    const churnContext = await browser.newContext();
    const pageChurn = await churnContext.newPage();

    try {
      const sessionCode = await createLeaderInLobby(pageLeader);
      await joinAsParticipant(pageChosen, sessionCode, 'Daniel');
      await joinAsParticipant(pageChurn, sessionCode, 'Maria');
      await startStudyOnSection1(pageLeader, [pageChosen, pageChurn]);

      await pageChosen.getByTestId('hand-raise-orb').click();
      await pageLeader.getByTestId('prayer-queue-choose').click();
      await expect(pageChosen.getByTestId('prayer-chosen-view')).toBeVisible();

      // Hand churn plus clear-hands wipes the queue but not the selection.
      await pageChurn.getByTestId('hand-raise-orb').click();
      await expect(pageLeader.getByTestId('prayer-queue-count')).toHaveText(
        '2 hands raised',
      );
      await pageLeader.getByTestId('prayer-queue-clear-all').click();
      await expect(pageLeader.getByTestId('prayer-queue-count')).toHaveText(
        '0 hands raised',
      );
      await expect(pageLeader.getByTestId('prayer-queue-empty')).toHaveText(
        'No hands raised yet',
      );
      await expect(pageLeader.getByTestId('prayer-chosen-banner')).toContainText(
        'Daniel is praying — waiting for Done',
      );
      // With zero raised hands there are zero queue rows (the per-row Chosen
      // chip lives on the chosen member's own row — spec Open Question 3:
      // the vanished row is cosmetic and never revokes the selection).
      await expect(pageLeader.getByTestId('prayer-queue-row')).toHaveCount(0);

      // The chosen participant keeps the exclusive Done action throughout.
      await expect(pageChosen.getByTestId('prayer-chosen-view')).toBeVisible();
      await expect(pageChosen.getByTestId('prayer-done-button')).toBeEnabled();

      // The turn is still completable and the gate still opens afterwards.
      await pageChosen.getByTestId('prayer-done-button').click();
      await expect(pageChosen.getByTestId('prayer-done-completed')).toHaveText(
        'Amen — thank you for praying.',
      );
      await expect(pageLeader.getByTestId('prayer-advance-cta')).toContainText(
        'Continue to Section 2 →',
      );
    } finally {
      await closeLiveSession(pageLeader);
      await Promise.allSettled([
        chosenContext.close(),
        churnContext.close(),
        leaderContext.close(),
      ]);
    }
  });
});

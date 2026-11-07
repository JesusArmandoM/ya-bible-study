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
                ws.addEventListener('close', () => resolve(), { once: true }),
              ),
            );
          } catch {
            // Best-effort cleanup.
          }
        },
        { sessionCode: creds.sessionCode, leaderToken: creds.leaderToken },
      ),
      new Promise<void>((resolve) => setTimeout(resolve, 2500)),
    ]);
  } catch {
    // Suppress cleanup failures.
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
}

test.describe('Study Leader Persistent QR Code Re-Share', () => {
  test.describe.configure({ timeout: 60_000 });

  test('leader can re-share room QR code from Section 1 and late-joining participant hydrates directly into active section', async ({
    browser,
  }) => {
    const leaderContext = await browser.newContext();
    const participantAContext = await browser.newContext();
    const lateParticipantContext = await browser.newContext();

    const pageLeader = await leaderContext.newPage();
    const pageA = await participantAContext.newPage();
    const pageLate = await lateParticipantContext.newPage();

    let leaderCreds: StashedLeaderCredentials | null = null;

    try {
      // 1. Leader creates study session and enters lobby
      const sessionCode = await createLeaderInLobby(pageLeader);
      leaderCreds = await stashLeaderCredentials(pageLeader);

      // 2. Participant A joins in lobby
      await joinAsParticipant(pageA, sessionCode, 'Sarah');
      await expect(pageA.getByTestId('participant-waiting-message')).toHaveText(
        'The study leader will begin shortly',
      );

      // 3. Leader starts study -> Section 1 (Opening Prayer)
      await pageLeader.getByTestId('lobby-start-study').click();
      await expect(pageLeader.getByTestId('section-one-handoff')).toBeVisible();
      await expect(pageA.getByTestId('section-one-handoff')).toBeVisible();

      // 4. In Section 1, Study Leader sees "Share QR" trigger; Participant A does NOT
      await expect(
        pageLeader.getByTestId('section-share-qr-trigger'),
      ).toBeVisible();
      await expect(pageA.getByTestId('section-share-qr-trigger')).toHaveCount(0);

      // 5. Leader clicks "Share QR" -> RoomCodeShareSheet opens
      await pageLeader.getByTestId('section-share-qr-trigger').click();
      const shareSheet = pageLeader.getByTestId('room-code-share-sheet');
      await expect(shareSheet).toBeVisible();
      await expect(pageLeader.getByTestId('lobby-qr-svg')).toBeVisible();
      await expect(pageLeader.getByTestId('lobby-room-code')).toHaveText(
        sessionCode,
      );
      await expect(pageLeader.getByTestId('lobby-join-url')).toHaveValue(
        new RegExp(`/join/${sessionCode}$`),
      );

      // 6. Late Participant joins directly using join link while Leader modal is open
      await joinAsParticipant(pageLate, sessionCode, 'Latecomer Marcus');

      // Latecomer lands directly in active Section 1 (not lobby or waiting screen)
      await expect(pageLate.getByTestId('section-one-handoff')).toBeVisible();
      await expect(pageLate.getByTestId('participant-waiting-message')).toHaveCount(0);
      await expect(pageLate.getByTestId('section-share-qr-trigger')).toHaveCount(0);

      // Leader modal remains open and uninterrupted
      await expect(shareSheet).toBeVisible();

      // Close modal on Leader side
      await pageLeader.getByTestId('room-code-sheet-close').click();
      await expect(shareSheet).toHaveCount(0);
      await expect(pageLeader.getByTestId('section-one-handoff')).toBeVisible();

      // Terminology invariant: zero occurrences of "Assistant"
      const leaderBody = await pageLeader.locator('body').innerText();
      const pLateBody = await pageLate.locator('body').innerText();
      expect(leaderBody).not.toContain('Assistant');
      expect(pLateBody).not.toContain('Assistant');
    } finally {
      await closeSessionWith(pageLeader, leaderCreds);
      await leaderContext.close();
      await participantAContext.close();
      await lateParticipantContext.close();
    }
  });

  test('desktop dual side-by-side mode isolates Share QR trigger to Study Leader frame', async ({
    page,
  }) => {
    // Open Desktop Dual Side-by-Side Mode
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/?mode=dual');

    await expect(page.getByTestId('desktop-dual-screen')).toBeVisible();
    await expect(page.getByTestId('dual-sandbox-loading')).toBeHidden({
      timeout: 20_000,
    });

    const leaderFrame = page.getByTestId('leader-frame');
    const participantFrame = page.getByTestId('participant-frame');

    // In lobby, leader starts study
    await leaderFrame.getByTestId('lobby-start-study').click();
    await expect(leaderFrame.getByTestId('section-one-handoff')).toBeVisible();
    await expect(participantFrame.getByTestId('section-one-handoff')).toBeVisible();

    // Leader frame has the Share QR trigger; Participant frame does NOT
    await expect(
      leaderFrame.getByTestId('section-share-qr-trigger'),
    ).toBeVisible();
    await expect(
      participantFrame.getByTestId('section-share-qr-trigger'),
    ).toHaveCount(0);

    // Leader clicks Share QR in dual frame -> modal opens inside leader context
    await leaderFrame.getByTestId('section-share-qr-trigger').click();
    await expect(page.getByTestId('room-code-share-sheet')).toBeVisible();

    // Dismiss modal
    await page.getByTestId('room-code-sheet-close').click();
    await expect(page.getByTestId('room-code-share-sheet')).toHaveCount(0);

    // Terminology invariant
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('Assistant');
  });
});

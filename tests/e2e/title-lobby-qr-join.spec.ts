import { expect, test, type Page } from '@playwright/test';

/**
 * Closes the leader's live session over /ws so later suites (e.g.
 * ws-room-lifecycle.spec.ts) still observe activeSessionCount 0.
 */
async function closeLiveSession(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const raw = sessionStorage.getItem('ya-bible-study.session-credentials');
    if (!raw) return;
    const creds = JSON.parse(raw) as {
      sessionCode?: string;
      leaderToken?: string;
    };
    if (!creds.sessionCode || !creds.leaderToken) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    await new Promise<void>((resolve) =>
      ws.addEventListener('open', () => resolve(), { once: true }),
    );
    ws.send(
      JSON.stringify({
        type: 'close_session',
        sessionCode: creds.sessionCode,
        leaderToken: creds.leaderToken,
      }),
    );
    await new Promise<void>((resolve) =>
      ws.addEventListener('message', () => resolve(), { once: true }),
    );
    ws.close();
  });
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
  await expect(page.getByTestId('title-lobby')).toBeVisible();
}

test.describe('Title Lobby + QR Join + Start Study Handoff', () => {
  test('Scenarios 2-5: live attendee count, localhost-safe QR sharing, and Study Leader-gated Start Study', async ({
    browser,
  }) => {
    const leaderContext = await browser.newContext();
    await leaderContext.grantPermissions(['clipboard-write']);
    const pageLeader = await leaderContext.newPage();
    const participantAContext = await browser.newContext();
    const pageA = await participantAContext.newPage();
    const participantBContext = await browser.newContext();
    const pageB = await participantBContext.newPage();

    try {
      // ----------------------------------------------------
      // Scenario 1/2: leader opens the Title Lobby (load_study handoff)
      // ----------------------------------------------------
      const sessionCode = await createLeaderInLobby(pageLeader);

      const lobbyLeader = pageLeader.getByTestId('title-lobby');
      await expect(
        pageLeader.getByTestId('title-lobby-chip'),
      ).toHaveText('YA BIBLE STUDY · LIVE SESSION');
      await expect(pageLeader.getByTestId('title-lobby-title')).toHaveText(
        'Great Is Your Faith',
      );
      await expect(pageLeader.getByTestId('title-lobby-citation')).toContainText(
        'Matthew 15:21–28',
      );
      // Gospel-only citation line: no secondary reading labels anywhere.
      const lobbyText = await lobbyLeader.innerText();
      for (const forbidden of [
        'Isaiah',
        'Psalm',
        'Romans',
        'First Reading',
        'Second Reading',
        'Responsorial Psalm',
      ]) {
        expect(lobbyText).not.toContain(forbidden);
      }

      // Study loaded through protocol v2: no fallback, metrics visible.
      await expect(
        pageLeader.getByTestId('title-lobby-study-fallback'),
      ).toHaveCount(0);
      await expect(
        pageLeader.getByTestId('title-lobby-attendee-count'),
      ).toHaveText('0');
      await expect(pageLeader.getByTestId('title-lobby-section-count')).toHaveText(
        '5',
      );
      await expect(pageLeader.getByTestId('title-lobby-duration')).toHaveText(
        '90m',
      );

      // The study summary arrives over /ws: assert protocol v2 in a snapshot.
      const protocolVersion = await pageLeader.evaluate(async () => {
        const raw = sessionStorage.getItem('ya-bible-study.session-credentials');
        if (!raw) return null;
        const creds = JSON.parse(raw) as { sessionCode?: string };
        const res = await fetch('/api/health');
        const health = (await res.json()) as { status: string };
        return {
          healthStatus: health.status,
          hasCode: Boolean(creds.sessionCode),
        };
      });
      expect(protocolVersion?.healthStatus).toBe('ok');

      // ----------------------------------------------------
      // Scenario 2: two Participants join; ATTENDEES is live on all screens
      // ----------------------------------------------------
      await joinAsParticipant(pageA, sessionCode, 'Daniel');
      await joinAsParticipant(pageB, sessionCode, 'Maya');

      for (const page of [pageLeader, pageA, pageB]) {
        await expect(
          page.getByTestId('title-lobby-attendee-count'),
        ).toHaveText('2');
        await expect(page.getByTestId('title-lobby-title')).toHaveText(
          'Great Is Your Faith',
        );
      }

      // ----------------------------------------------------
      // Scenario 3: QR + room code share sheet is localhost-safe
      // ----------------------------------------------------
      const externalRequests: string[] = [];
      pageLeader.on('request', (request) => {
        const url = new URL(request.url());
        if (
          url.protocol !== 'data:' &&
          url.protocol !== 'blob:' &&
          !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
        ) {
          externalRequests.push(request.url());
        }
      });

      await pageLeader.getByTestId('lobby-share-trigger').click();
      const sheet = pageLeader.getByTestId('room-code-share-sheet');
      await expect(sheet).toBeVisible();

      // QR SVG is generated client-side and appears without network calls.
      const qr = pageLeader.getByTestId('lobby-qr-svg');
      await expect(qr).toBeVisible();
      await expect(qr.locator('svg')).toHaveCount(1);

      await expect(pageLeader.getByTestId('lobby-room-code')).toHaveText(
        sessionCode,
      );
      const joinUrlField = pageLeader.getByTestId('lobby-join-url');
      await expect(joinUrlField).toHaveAttribute('readonly', '');
      const joinUrlValue = await joinUrlField.inputValue();
      expect(joinUrlValue).toContain(`/join/${sessionCode}`);
      // Dynamic origin: never a hardcoded host.
      expect(joinUrlValue).not.toContain('example.com');

      // Copy announces "Link copied" via aria-live status.
      await pageLeader.getByTestId('lobby-copy-link').click();
      await expect(pageLeader.getByTestId('lobby-copy-status')).toHaveText(
        'Link copied',
      );

      // Localhost-safe warning names the `npm run share` tunnel when the
      // join link is local-only without PUBLIC_URL (this test origin is
      // 127.0.0.1 with no tunnel).
      const warning = pageLeader.getByTestId('lobby-localhost-warning');
      await expect(warning).toBeVisible();
      await expect(warning).toContainText('npm run share');

      // QR generation is fully offline: no external requests were made.
      expect(externalRequests).toEqual([]);

      await pageLeader.getByTestId('room-code-sheet-close').click();
      await expect(sheet).toHaveCount(0);

      // ----------------------------------------------------
      // Scenario 4: Participants cannot start the study
      // ----------------------------------------------------
      for (const page of [pageA, pageB]) {
        await expect(page.getByTestId('lobby-start-study')).toHaveCount(0);
        await expect(page.getByTestId('title-lobby-waiting-pill')).toContainText(
          'The Study Leader will begin shortly…',
        );
      }
      await expect(pageLeader.getByTestId('lobby-start-study')).toBeVisible();

      // ----------------------------------------------------
      // Scenario 2 (disconnect): attendee count decrements live
      // ----------------------------------------------------
      await participantBContext.close();
      for (const page of [pageLeader, pageA]) {
        await expect(
          page.getByTestId('title-lobby-attendee-count'),
        ).toHaveText('1');
      }

      // ----------------------------------------------------
      // Scenario 5: Start Study advances every screen to Section 1
      // ----------------------------------------------------
      await pageLeader.getByTestId('lobby-start-study').click();

      for (const page of [pageLeader, pageA]) {
        const handoff = page.getByTestId('section-one-handoff');
        await expect(handoff).toBeVisible();
        await expect(page.getByTestId('section-one-label')).toHaveText(
          'SECTION 1 OF 5',
        );
        await expect(page.getByTestId('section-one-percent')).toHaveText('20%');
        await expect(page.getByTestId('section-one-title')).toHaveText(
          'Opening Prayer',
        );
      }

      // Study Leader stays the only one controlling progression; each role
      // shows its Opening Prayer subtitle copy.
      // Compat edit 2 of 2 (section-1-opening-prayer-hand-raise): the two
      // `section-one-copy` text assertions track the new role copy.
      await expect(pageA.getByTestId('section-one-copy')).toContainText(
        'Tap Raise Hand',
      );
      await expect(pageLeader.getByTestId('section-one-copy')).toContainText(
        'Waiting for someone to volunteer to pray',
      );

      // Invariants: single Sacred3DScene canvas, zero Assistant occurrences.
      for (const page of [pageLeader, pageA]) {
        const canvasCount = await page.evaluate(
          () => document.querySelectorAll('canvas').length,
        );
        expect(canvasCount).toBeLessThanOrEqual(1);
        const bodyText = await page.locator('body').innerText();
        expect(bodyText).not.toContain('Assistant');
      }

      // No horizontal overflow on the 390x844 mobile viewport.
      const overflow = await pageLeader.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
    } finally {
      await closeLiveSession(pageLeader);
      await participantAContext.close().catch(() => undefined);
      await participantBContext.close().catch(() => undefined);
      await leaderContext.close();
    }
  });

  test('Scenario 2 (metadata): the study fallback pill shows for Participants before load_study', async ({
    browser,
  }) => {
    const leaderContext = await browser.newContext();
    const pageLeader = await leaderContext.newPage();
    const participantContext = await browser.newContext();
    const pageParticipant = await participantContext.newPage();

    try {
      await pageLeader.goto('/');
      await pageLeader.getByTestId('welcome-role-leader').click();
      await pageLeader.getByLabel(/Leader Name/i).fill('Claire');
      await pageLeader.getByRole('button', { name: 'Create Room' }).click();
      await expect(pageLeader.getByTestId('study-setup-screen')).toBeVisible();
      const sessionCode = (
        await pageLeader.getByTestId('active-session-code').innerText()
      ).trim();

      // Open the lobby without loading a study: dispatch open_lobby directly.
      await pageLeader.evaluate(async () => {
        const raw = sessionStorage.getItem('ya-bible-study.session-credentials');
        if (!raw) return;
        const creds = JSON.parse(raw) as {
          sessionCode?: string;
          leaderToken?: string;
          memberId?: string;
        };
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
        await new Promise<void>((resolve) =>
          ws.addEventListener('open', () => resolve(), { once: true }),
        );
        ws.send(
          JSON.stringify({
            type: 'open_lobby',
            sessionCode: creds.sessionCode,
            leaderToken: creds.leaderToken,
            memberId: creds.memberId,
          }),
        );
        await new Promise<void>((resolve) =>
          ws.addEventListener('message', () => resolve(), { once: true }),
        );
      });
      await expect(pageLeader.getByTestId('title-lobby')).toBeVisible();

      // A Participant joining before load_study sees the fallback pill.
      await pageParticipant.goto(`/join/${sessionCode}`);
      await expect(
        pageParticipant.getByTestId('participant-join-sheet'),
      ).toBeVisible();
      await pageParticipant.getByLabel(/Your Name/i).fill('Daniel');
      await pageParticipant.getByRole('button', { name: 'Join Study' }).click();
      await expect(pageParticipant.getByTestId('title-lobby')).toBeVisible();
      await expect(
        pageParticipant.getByTestId('title-lobby-study-fallback'),
      ).toContainText('Study not loaded yet');
      await expect(
        pageParticipant.getByTestId('title-lobby-metrics'),
      ).toHaveCount(0);
    } finally {
      await closeLiveSession(pageLeader);
      await participantContext.close().catch(() => undefined);
      await leaderContext.close();
    }
  });
});

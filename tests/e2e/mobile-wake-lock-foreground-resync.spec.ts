import { expect as baseExpect, test, type Page } from '@playwright/test';

// Session 021–022 hardening from the start: under in-suite contention (one
// worker, sequential multi-context scenarios) a live /ws round trip or React
// resync can stall past the default 5s expect budget. Assertions are unchanged
// where not explicitly time-bounded — only the patience is.
const expect = baseExpect.configure({ timeout: 15_000 });

type WakeLockMode = 'mock' | 'unsupported' | 'denied';

/**
 * Installs an instrumented `navigator.wakeLock` (or deletes it) before any app
 * code runs. Headless Chromium cannot prove real screen wake; the e2e verifies
 * the API interaction via this spy (`window.__wakeLockLog`).
 */
async function installWakeLock(
  page: Page,
  mode: WakeLockMode,
): Promise<void> {
  await page.addInitScript((wakeLockMode: WakeLockMode) => {
    const log: string[] = [];
    (window as unknown as { __wakeLockLog: string[] }).__wakeLockLog = log;
    if (wakeLockMode === 'unsupported') {
      // Actively remove the API: headless Chromium ships a real
      // `navigator.wakeLock` (which rejects as `denied` in headless).
      Object.defineProperty(navigator, 'wakeLock', {
        configurable: true,
        value: undefined,
      });
      return;
    }
    const sentinels: Array<{ fireRelease: () => void }> = [];
    (window as unknown as { __wakeLockSentinels: typeof sentinels }).__wakeLockSentinels =
      sentinels;
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: (type: string) => {
          log.push(`request:${type}`);
          if (wakeLockMode === 'denied') {
            const err = new Error('Wake lock denied by the platform.');
            err.name = 'NotAllowedError';
            return Promise.reject(err);
          }
          const listeners = new Set<() => void>();
          const sentinel = {
            released: false,
            async release() {
              if (sentinel.released) return;
              sentinel.released = true;
              log.push('release');
              listeners.forEach((listener) => listener());
            },
            addEventListener: (t: string, cb: () => void) => {
              if (t === 'release') listeners.add(cb);
            },
            removeEventListener: (t: string, cb: () => void) => {
              if (t === 'release') listeners.delete(cb);
            },
            fireRelease() {
              if (sentinel.released) return;
              sentinel.released = true;
              log.push('release');
              listeners.forEach((listener) => listener());
            },
          };
          sentinels.push(sentinel);
          return Promise.resolve(sentinel);
        },
      },
    });
  }, mode);
}

/** Tracks every WebSocket the page opens so tests can forcibly suspend it. */
async function installSocketTracker(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const sockets: WebSocket[] = [];
    (window as unknown as { __sockets: WebSocket[] }).__sockets = sockets;
    const Original = window.WebSocket;
    window.WebSocket = class extends Original {
      constructor(...args: ConstructorParameters<typeof WebSocket>) {
        super(...args);
        sockets.push(this);
      }
    };
  });
}

async function readWakeLockLog(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      (window as unknown as { __wakeLockLog?: string[] }).__wakeLockLog ?? [],
  );
}

/** Simulates the app moving to the background (platform auto-releases). */
async function setBackground(page: Page): Promise<void> {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
    const sentinels = (
      window as unknown as {
        __wakeLockSentinels?: Array<{ fireRelease: () => void }>;
      }
    ).__wakeLockSentinels;
    if (Array.isArray(sentinels)) {
      for (const sentinel of sentinels) {
        sentinel.fireRelease();
      }
    }
  });
}

/** Simulates the app returning to the foreground. */
async function setForeground(page: Page): Promise<void> {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

/** iOS-style WebSocket suspension while backgrounded. */
async function forceCloseSockets(page: Page): Promise<void> {
  await page.evaluate(() => {
    const sockets = (window as unknown as { __sockets?: WebSocket[] }).__sockets ?? [];
    for (const ws of sockets) {
      try {
        ws.close();
      } catch {
        // Forcing a close must never throw.
      }
    }
  });
}

/** Never-throwing bounded live-session cleanup (Session 021–022 pattern). */
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

/**
 * Never-throwing bounded cleanup with PRE-STASHED leader credentials —
 * required for test paths that click `Leave` (which clears `sessionStorage`
 * without closing the server-side room).
 */
async function closeSessionWith(
  page: Page,
  creds: { sessionCode: string; leaderToken: string } | null,
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
              JSON.stringify({ type: 'close_session', sessionCode, leaderToken }),
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
        },
        { sessionCode: creds.sessionCode, leaderToken: creds.leaderToken },
      ),
      new Promise<void>((resolve) => setTimeout(resolve, 5000)),
    ]);
  } catch {
    // Cleanup must never fail or hang the suite.
  }
}

/** Reads the leader's reconnect credentials BEFORE any `Leave` clears them. */
async function stashLeaderCredentials(
  page: Page,
): Promise<{ sessionCode: string; leaderToken: string } | null> {
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

test.describe('Mobile wake lock + foreground state resync', () => {
  test.describe.configure({ timeout: 60_000 });

  test('Scenario 1 + 2: wake lock held once per live session, released on Leave, re-acquired on foreground', async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(90_000);
    const leaderContext = await browser.newContext();
    const pageLeader = await leaderContext.newPage();
    await installWakeLock(pageLeader, 'mock');
    const pageErrors: string[] = [];
    pageLeader.on('pageerror', (error) => pageErrors.push(String(error)));
    let leaderCreds: { sessionCode: string; leaderToken: string } | null = null;

    try {
      // No session yet: zero wake-lock requests.
      await pageLeader.goto('/');
      expect(await readWakeLockLog(pageLeader)).toEqual([]);

      const sessionCode = await createLeaderInLobby(pageLeader);
      expect(sessionCode).toMatch(/^[A-Z0-9]{6}$/);
      // Stash BEFORE the Leave path clears sessionStorage (Leave disconnects
      // the client without closing the server-side room).
      leaderCreds = await stashLeaderCredentials(pageLeader);

      // Scenario 1: exactly one request('screen') for the live session —
      // retained across setup -> lobby re-renders, never re-requested.
      await expect(pageLeader.getByTestId('session-resilience-chip')).toHaveAttribute(
        'data-connection',
        'live',
      );
      await expect(pageLeader.getByTestId('session-resilience-chip')).toHaveAttribute(
        'data-wake-lock',
        'active',
      );
      expect(await readWakeLockLog(pageLeader)).toEqual(['request:screen']);

      // Scenario 2: backgrounding auto-releases the sentinel (platform), and
      // returning to the foreground re-requests the wake lock.
      await setBackground(pageLeader);
      expect(await readWakeLockLog(pageLeader)).toEqual([
        'request:screen',
        'release',
      ]);
      await setForeground(pageLeader);
      await expect
        .poll(async () => readWakeLockLog(pageLeader))
        .toEqual(['request:screen', 'release', 'request:screen']);
      await expect(pageLeader.getByTestId('session-resilience-chip')).toHaveAttribute(
        'data-wake-lock',
        'active',
      );

      // Leave: the sentinel is released and no further requests are made.
      await pageLeader.getByTestId('active-session-leave-btn').click();
      await expect(pageLeader.getByTestId('welcome-role-leader')).toBeVisible();
      await expect(pageLeader.getByTestId('session-resilience-chip')).toHaveCount(0);
      const afterLeave = await readWakeLockLog(pageLeader);
      expect(afterLeave).toEqual([
        'request:screen',
        'release',
        'request:screen',
        'release',
      ]);
      await setBackground(pageLeader);
      await setForeground(pageLeader);
      expect(await readWakeLockLog(pageLeader)).toEqual(afterLeave);

      expect(pageErrors).toEqual([]);
    } finally {
      await closeSessionWith(pageLeader, leaderCreds);
      await closeLiveSession(pageLeader);
      await Promise.allSettled([leaderContext.close()]);
    }
  });

  test('Scenario 3: unsupported and denied wake locks degrade silently while the session stays fully usable', async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(90_000);
    const leaderContext = await browser.newContext();
    const pageLeader = await leaderContext.newPage();
    await installWakeLock(pageLeader, 'mock');
    const unsupportedContext = await browser.newContext();
    const pageUnsupported = await unsupportedContext.newPage();
    await installWakeLock(pageUnsupported, 'unsupported');
    const deniedContext = await browser.newContext();
    const pageDenied = await deniedContext.newPage();
    await installWakeLock(pageDenied, 'denied');

    const pageErrors: string[] = [];
    for (const page of [pageLeader, pageUnsupported, pageDenied]) {
      page.on('pageerror', (error) => pageErrors.push(String(error)));
    }

    try {
      const sessionCode = await createLeaderInLobby(pageLeader);
      await joinAsParticipant(pageUnsupported, sessionCode, 'Mia');
      await joinAsParticipant(pageDenied, sessionCode, 'Daniel');
      await startStudyOnSection1(pageLeader, [pageUnsupported, pageDenied]);

      // The session is fully usable: hand raise + live queue sync work.
      await pageUnsupported.getByTestId('hand-raise-orb').click();
      await expect(pageUnsupported.getByTestId('hand-raise-orb')).toContainText(
        'Hand Raised',
      );
      await expect(pageLeader.getByTestId('prayer-queue-count')).toHaveText(
        '1 hand raised',
      );

      // Silent degradation surfaces on the chip only — no error dialogs.
      await expect(
        pageUnsupported.getByTestId('session-resilience-chip'),
      ).toHaveAttribute('data-wake-lock', 'unsupported');
      await expect(
        pageUnsupported.getByTestId('session-resilience-chip'),
      ).toHaveAttribute('data-connection', 'live');
      await expect(pageDenied.getByTestId('session-resilience-chip')).toHaveAttribute(
        'data-wake-lock',
        'denied',
      );
      await expect(pageDenied.getByTestId('session-resilience-chip')).toHaveAttribute(
        'data-connection',
        'live',
      );
      await expect(pageLeader.getByTestId('session-resilience-chip')).toHaveAttribute(
        'data-wake-lock',
        'active',
      );

      // Denied path: exactly one request, silently rejected, no retry loop.
      expect(await readWakeLockLog(pageDenied)).toEqual(['request:screen']);
      expect(await readWakeLockLog(pageUnsupported)).toEqual([]);

      expect(pageErrors).toEqual([]);
    } finally {
      await closeLiveSession(pageLeader);
      await Promise.allSettled([
        unsupportedContext.close(),
        deniedContext.close(),
        leaderContext.close(),
      ]);
    }
  });

  test('Scenario 4: foreground resync restores the EXACT fresh turn screen within 2s after a forced socket suspension', async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(90_000);
    const leaderContext = await browser.newContext();
    const pageLeader = await leaderContext.newPage();
    await installWakeLock(pageLeader, 'mock');
    const participantContext = await browser.newContext();
    const pageMia = await participantContext.newPage();
    await installWakeLock(pageMia, 'mock');
    await installSocketTracker(pageMia);

    try {
      const sessionCode = await createLeaderInLobby(pageLeader);
      await joinAsParticipant(pageMia, sessionCode, 'Mia');
      await startStudyOnSection1(pageLeader, [pageMia]);

      // Mia raises her hand and is chosen: the YOU WERE CHOSEN screen.
      await pageMia.getByTestId('hand-raise-orb').click();
      await expect(pageLeader.getByTestId('prayer-queue-count')).toHaveText(
        '1 hand raised',
      );
      await pageLeader.getByTestId('prayer-queue-choose').click();
      await expect(pageMia.getByTestId('prayer-chosen-view')).toBeVisible();
      await expect(pageMia.getByTestId('prayer-done-button')).toBeEnabled();

      // Background Mia and forcibly suspend her WebSocket (iOS-style).
      await setBackground(pageMia);
      await forceCloseSockets(pageMia);

      // While she is away, the Study Leader completes the turn (override).
      await pageLeader.getByTestId('prayer-override-button').click();
      await expect(pageLeader.getByTestId('prayer-advance-cta')).toContainText(
        'Continue to Section 2 →',
      );

      // Stale pre-background view is still on screen.
      await expect(pageMia.getByTestId('prayer-done-button')).toHaveCount(1);

      // Foreground: one reconnect_session round trip re-hydrates the exact
      // fresh turn screen within the 2s product budget.
      const startedAt = Date.now();
      await setForeground(pageMia);
      await expect(pageMia.getByTestId('prayer-done-completed')).toBeVisible({
        timeout: 2000,
      });
      const foregroundRestoreMs = Date.now() - startedAt;
      await expect(pageMia.getByTestId('prayer-done-button')).toHaveCount(0);
      await expect(pageMia.getByTestId('prayer-done-completed')).toHaveText(
        'Amen — thank you for praying.',
      );
      // Recorded evidence: observed foreground-restore latency.
      console.log(
        `[e2e] Scenario 4 foreground-restore latency: ${foregroundRestoreMs}ms`,
      );
      expect(foregroundRestoreMs).toBeLessThanOrEqual(2000);
    } finally {
      await closeLiveSession(pageLeader);
      await Promise.allSettled([
        participantContext.close(),
        leaderContext.close(),
      ]);
    }
  });

  test('Scenario 5: resync against a closed room returns to Welcome with zero stale session DOM', async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(90_000);
    const leaderContext = await browser.newContext();
    const pageLeader = await leaderContext.newPage();
    await installWakeLock(pageLeader, 'mock');
    const participantContext = await browser.newContext();
    const pageMia = await participantContext.newPage();
    await installWakeLock(pageMia, 'mock');
    await installSocketTracker(pageMia);

    try {
      const sessionCode = await createLeaderInLobby(pageLeader);
      await joinAsParticipant(pageMia, sessionCode, 'Mia');
      await expect(pageMia.getByTestId('title-lobby')).toBeVisible();

      // Chip copy uses Study Leader / Participant wording only (zero legacy
      // role words), and the resilience signals are exposed to the DOM.
      const chip = pageMia.getByTestId('session-resilience-chip');
      await expect(chip).toHaveText('● Connected');
      await expect(pageMia.getByTestId('active-user-role')).toHaveText(
        'Participant',
      );
      await expect(pageLeader.getByTestId('active-user-role')).toHaveText(
        'Study Leader',
      );
      const chipText = await chip.innerText();
      expect(chipText).not.toContain('Assistant');

      // Background Mia and suspend her socket so she misses session_closed.
      await setBackground(pageMia);
      await forceCloseSockets(pageMia);

      // The Study Leader closes the live room while Mia is away.
      await closeLiveSession(pageLeader);

      // Foreground resync hits the definitive session-gone path: credentials
      // cleared and the app returns to the Welcome screen — never stale UI.
      await setForeground(pageMia);
      await expect(pageMia.getByTestId('welcome-role-leader')).toBeVisible();
      await expect(pageMia.getByTestId('active-session-banner')).toHaveCount(0);
      await expect(pageMia.getByTestId('session-resilience-chip')).toHaveCount(0);
      await expect(pageMia.getByTestId('prayer-chosen-view')).toHaveCount(0);
      // Zero stale session DOM on the closer's screen too (its session_closed
      // broadcast path is pre-existing behavior outside this feature's scope).
      await expect(pageLeader.getByTestId('active-session-banner')).toHaveCount(0);
      await expect(pageLeader.getByTestId('session-resilience-chip')).toHaveCount(0);
      const stored = await pageMia.evaluate(() =>
        sessionStorage.getItem('ya-bible-study.session-credentials'),
      );
      expect(stored).toBeNull();
    } finally {
      await closeLiveSession(pageLeader);
      await Promise.allSettled([
        participantContext.close(),
        leaderContext.close(),
      ]);
    }
  });

  test('Session-leak hygiene: GET /api/health activeSessionCount returns to 0', async ({
    request,
  }) => {
    const response = await request.get('/api/health');
    expect(response.ok()).toBe(true);
    const body = (await response.json()) as { activeSessionCount: number };
    expect(body.activeSessionCount).toBe(0);
  });
});

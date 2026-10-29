import { expect, test, type Page } from '@playwright/test';
import type { ServerWsMessage } from '../../src/shared/session';

declare global {
  interface Window {
    __wsHarness?: {
      wsUrl: string;
      send: (payload: Record<string, unknown>) => void;
      waitFor: (
        type: string,
        expectedMemberCount?: number,
      ) => Promise<ServerWsMessage>;
      close: () => void;
    };
  }
}

async function attachBrowserWsHarness(page: Page): Promise<string> {
  await page.goto('/');
  return await page.evaluate(async () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const socket = new WebSocket(wsUrl);
    const messages: ServerWsMessage[] = [];
    const consumed = new Set<ServerWsMessage>();
    const waiters: Array<() => void> = [];

    socket.addEventListener('message', (event) => {
      const parsed = JSON.parse(String(event.data)) as ServerWsMessage;
      messages.push(parsed);
      for (const notify of [...waiters]) {
        notify();
      }
    });

    await new Promise<void>((resolve, reject) => {
      socket.addEventListener('open', () => resolve(), { once: true });
      socket.addEventListener(
        'error',
        () => reject(new Error(`Failed to open ${wsUrl}`)),
        { once: true },
      );
    });

    window.__wsHarness = {
      wsUrl,
      send: (payload) => {
        socket.send(JSON.stringify(payload));
      },
      waitFor: (type, expectedMemberCount) =>
        new Promise<ServerWsMessage>((resolve, reject) => {
          const check = () => {
            for (const msg of messages) {
              if (consumed.has(msg) || msg.type !== type) {
                continue;
              }
              if (
                expectedMemberCount !== undefined &&
                'session' in msg &&
                msg.session.connectedMemberCount !== expectedMemberCount
              ) {
                continue;
              }
              consumed.add(msg);
              const idx = waiters.indexOf(check);
              if (idx >= 0) {
                waiters.splice(idx, 1);
              }
              clearTimeout(timer);
              resolve(msg);
              return;
            }
          };

          const timer = setTimeout(() => {
            reject(
              new Error(
                `Browser WS timed out waiting for "${type}" (seen: ${messages
                  .map((m) => m.type)
                  .join(', ')})`,
              ),
            );
          }, 5000);

          waiters.push(check);
          check();
        }),
      close: () => {
        socket.close();
      },
    };

    return wsUrl;
  });
}

test.describe('Multi-context mobile browser /ws room lifecycle', () => {
  test('coordinates Study Leader creation, duplicate-name Participant joins, role gating, leaderPin handoff, reconnect, and room close on one port', async ({
    browser,
    request,
  }) => {
    const leaderContext = await browser.newContext();
    const participantAContext = await browser.newContext();
    const participantBContext = await browser.newContext();
    const handoffLeaderContext = await browser.newContext();

    let activeSessionCode: string | null = null;
    let activeLeaderToken: string | null = null;
    let activeLeaderPage: Page | null = null;

    try {
      const initialHealth = (await (await request.get('/api/health')).json()) as {
        activeSessionCount: number;
      };
      expect(initialHealth.activeSessionCount).toBe(0);

      const leaderPage = await leaderContext.newPage();
      const participantAPage = await participantAContext.newPage();
      const participantBPage = await participantBContext.newPage();
      const handoffLeaderPage = await handoffLeaderContext.newPage();

      const resolvedWsUrl = await attachBrowserWsHarness(leaderPage);
      expect(resolvedWsUrl).toMatch(/^ws:\/\/127\.0\.0\.1:\d+\/ws$/);

      await attachBrowserWsHarness(participantAPage);
      await attachBrowserWsHarness(participantBPage);
      await attachBrowserWsHarness(handoffLeaderPage);

      // Study Leader creates room
      const created = (await leaderPage.evaluate(async () => {
        window.__wsHarness!.send({
          type: 'create_session',
          displayName: ' Claire ',
        });
        return await window.__wsHarness!.waitFor('session_created');
      })) as Extract<ServerWsMessage, { type: 'session_created' }>;

      activeSessionCode = created.sessionCode;
      activeLeaderToken = created.leaderToken;
      activeLeaderPage = leaderPage;

      expect(created.sessionCode).toMatch(/^[A-Z0-9]{6}$/);
      expect(created.leaderPin).toMatch(/^\d{4}$/);
      expect(created.role).toBe('Study Leader');
      expect(created.session.members[0]?.displayName).toBe('Claire');

      const healthAfterCreate = (await (
        await request.get('/api/health')
      ).json()) as { activeSessionCount: number };
      expect(healthAfterCreate.activeSessionCount).toBe(1);

      // Two Participants named Daniel join (second uses lowercase padded code)
      const joinedA = (await participantAPage.evaluate(async (code) => {
        window.__wsHarness!.send({
          type: 'join_session',
          sessionCode: code,
          displayName: 'Daniel',
        });
        return await window.__wsHarness!.waitFor('session_joined');
      }, created.sessionCode)) as Extract<
        ServerWsMessage,
        { type: 'session_joined' }
      >;

      const joinedB = (await participantBPage.evaluate(async (code) => {
        window.__wsHarness!.send({
          type: 'join_session',
          sessionCode: ` ${code.toLowerCase()} `,
          displayName: 'Daniel',
        });
        return await window.__wsHarness!.waitFor('session_joined');
      }, created.sessionCode)) as Extract<
        ServerWsMessage,
        { type: 'session_joined' }
      >;

      expect(joinedA.role).toBe('Participant');
      expect(joinedB.role).toBe('Participant');
      expect(joinedA.displayName).toBe('Daniel');
      expect(joinedB.displayName).toBe('Daniel (2)');
      expect(joinedA.memberId).not.toBe(joinedB.memberId);
      expect(joinedA.avatarPalette).not.toBe(joinedB.avatarPalette);
      expect(JSON.stringify(joinedA)).not.toContain(created.leaderPin);
      expect(JSON.stringify(joinedA)).not.toContain(created.leaderToken);

      const leaderRoster = (await leaderPage.evaluate(async () => {
        return await window.__wsHarness!.waitFor('roster_updated', 3);
      })) as Extract<ServerWsMessage, { type: 'roster_updated' }>;
      expect(leaderRoster.session.connectedMemberCount).toBe(3);
      expect(JSON.stringify(leaderRoster)).not.toContain('leaderToken');
      expect(JSON.stringify(leaderRoster)).not.toContain('reconnectToken');

      // Participant attempting leader command is rejected server-side
      const participantError = (await participantAPage.evaluate(
        async (code) => {
          window.__wsHarness!.send({
            type: 'start_study',
            sessionCode: code,
            leaderToken: 'spoofed-token',
          });
          return await window.__wsHarness!.waitFor('session_error');
        },
        created.sessionCode,
      )) as Extract<ServerWsMessage, { type: 'session_error' }>;
      expect(participantError.code).toBe('FORBIDDEN_LEADER_ONLY');

      // Handoff context fails with wrong PIN, then succeeds with valid leaderPin
      const wrongPin = created.leaderPin === '1234' ? '9876' : '1234';
      const badPinError = (await handoffLeaderPage.evaluate(
        async ({ code, pin }) => {
          window.__wsHarness!.send({
            type: 'claim_leader',
            sessionCode: code,
            leaderPin: pin,
            displayName: 'Intruder',
          });
          return await window.__wsHarness!.waitFor('session_error');
        },
        { code: created.sessionCode, pin: wrongPin },
      )) as Extract<ServerWsMessage, { type: 'session_error' }>;
      expect(badPinError.code).toBe('INVALID_LEADER_PIN');

      const claimed = (await handoffLeaderPage.evaluate(
        async ({ code, pin }) => {
          window.__wsHarness!.send({
            type: 'claim_leader',
            sessionCode: code,
            leaderPin: pin,
            displayName: 'Fr. Marco',
          });
          return await window.__wsHarness!.waitFor('leader_claimed');
        },
        { code: created.sessionCode, pin: created.leaderPin },
      )) as Extract<ServerWsMessage, { type: 'leader_claimed' }>;

      activeLeaderToken = claimed.leaderToken;
      activeLeaderPage = handoffLeaderPage;

      expect(claimed.leaderToken).not.toBe(created.leaderToken);
      const replaced = await leaderPage.evaluate(async () => {
        return await window.__wsHarness!.waitFor('leader_replaced');
      });
      expect(replaced.type).toBe('leader_replaced');

      // Original leader's stale token T1 is now rejected
      const staleError = (await leaderPage.evaluate(
        async ({ code, staleToken }) => {
          window.__wsHarness!.send({
            type: 'start_study',
            sessionCode: code,
            leaderToken: staleToken,
          });
          return await window.__wsHarness!.waitFor('session_error');
        },
        { code: created.sessionCode, staleToken: created.leaderToken },
      )) as Extract<ServerWsMessage, { type: 'session_error' }>;
      expect(staleError.code).toBe('UNAUTHORIZED_LEADER');

      // Participant A drops socket and reconnects cleanly without creating Daniel (3)
      await participantAPage.evaluate(() => window.__wsHarness!.close());
      await attachBrowserWsHarness(participantAPage);
      const reconnectedA = (await participantAPage.evaluate(
        async ({ code, memberId, reconnectToken }) => {
          window.__wsHarness!.send({
            type: 'reconnect_session',
            sessionCode: code,
            memberId,
            reconnectToken,
          });
          return await window.__wsHarness!.waitFor('session_reconnected');
        },
        {
          code: created.sessionCode,
          memberId: joinedA.memberId,
          reconnectToken: joinedA.reconnectToken,
        },
      )) as Extract<ServerWsMessage, { type: 'session_reconnected' }>;
      expect(reconnectedA.member.displayName).toBe('Daniel');
      expect(reconnectedA.session.members).toHaveLength(3);

      // New leader opens lobby, starts study, then closes session
      await handoffLeaderPage.evaluate(
        async ({ code, leaderToken }) => {
          window.__wsHarness!.send({
            type: 'open_lobby',
            sessionCode: code,
            leaderToken,
          });
          await window.__wsHarness!.waitFor('session_updated');
          window.__wsHarness!.send({
            type: 'start_study',
            sessionCode: code,
            leaderToken,
          });
          await window.__wsHarness!.waitFor('session_updated');
        },
        { code: created.sessionCode, leaderToken: claimed.leaderToken },
      );

      const closed = (await handoffLeaderPage.evaluate(
        async ({ code, leaderToken }) => {
          window.__wsHarness!.send({
            type: 'close_session',
            sessionCode: code,
            leaderToken,
          });
          return await window.__wsHarness!.waitFor('session_closed');
        },
        { code: created.sessionCode, leaderToken: claimed.leaderToken },
      )) as Extract<ServerWsMessage, { type: 'session_closed' }>;

      activeSessionCode = null;
      expect(closed.reason).toBe('closed_by_leader');

      const participantClosed = (await participantAPage.evaluate(async () => {
        return await window.__wsHarness!.waitFor('session_closed');
      })) as Extract<ServerWsMessage, { type: 'session_closed' }>;
      expect(participantClosed.sessionCode).toBe(created.sessionCode);

      const finalHealth = (await (await request.get('/api/health')).json()) as {
        activeSessionCount: number;
      };
      expect(finalHealth.activeSessionCount).toBe(0);
    } finally {
      if (activeSessionCode && activeLeaderToken && activeLeaderPage) {
        await activeLeaderPage
          .evaluate(
            async ({ code, leaderToken }) => {
              window.__wsHarness?.send({
                type: 'close_session',
                sessionCode: code,
                leaderToken,
              });
            },
            { code: activeSessionCode, leaderToken: activeLeaderToken },
          )
          .catch(() => {});
      }
      await Promise.all([
        leaderContext.close(),
        participantAContext.close(),
        participantBContext.close(),
        handoffLeaderContext.close(),
      ]);
    }
  });
});

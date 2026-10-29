import { WebSocket } from 'ws';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAppServer, type AppServer } from '../../src/server/app';
import { LiveSessionStore } from '../../src/server/sessionStore';
import type { HealthResponse } from '../../src/shared/health';
import {
  DEFAULT_SESSION_TTL_MS,
  DEFAULT_WS_MAX_PAYLOAD_BYTES,
  type ServerWsMessage,
} from '../../src/shared/session';

interface BufferedPeer {
  ws: WebSocket;
  received: ServerWsMessage[];
  send: (payload: unknown) => void;
  sendRaw: (raw: string | Buffer) => void;
  waitFor: <T extends ServerWsMessage['type']>(
    type: T,
    predicate?: (msg: Extract<ServerWsMessage, { type: T }>) => boolean,
  ) => Promise<Extract<ServerWsMessage, { type: T }>>;
  close: () => Promise<void>;
}

describe('WebSocket live session room lifecycle integration', () => {
  let currentNowMs: number;
  let sessionStore: LiveSessionStore;
  let server: AppServer;
  let port: number;
  let baseUrl: string;
  let wsUrl: string;
  let openPeers: BufferedPeer[];

  async function connectPeer(): Promise<BufferedPeer> {
    const ws = new WebSocket(wsUrl);
    const received: ServerWsMessage[] = [];
    const consumed = new Set<ServerWsMessage>();
    const waiters: Array<{
      tryResolve: () => boolean;
      reject: (err: Error) => void;
    }> = [];

    const flushWaiters = () => {
      for (let i = waiters.length - 1; i >= 0; i -= 1) {
        const waiter = waiters[i];
        if (waiter && waiter.tryResolve()) {
          waiters.splice(i, 1);
        }
      }
    };

    ws.on('message', (data) => {
      const parsed = JSON.parse(String(data)) as ServerWsMessage;
      received.push(parsed);
      flushWaiters();
    });

    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', (err) => reject(err));
    });

    const peer: BufferedPeer = {
      ws,
      received,
      send: (payload) => {
        ws.send(JSON.stringify(payload));
      },
      sendRaw: (raw) => {
        ws.send(raw);
      },
      waitFor: <T extends ServerWsMessage['type']>(
        type: T,
        predicate?: (msg: Extract<ServerWsMessage, { type: T }>) => boolean,
      ) =>
        new Promise<Extract<ServerWsMessage, { type: T }>>(
          (resolve, reject) => {
            const tryResolve = () => {
              for (const msg of received) {
                if (consumed.has(msg) || msg.type !== type) {
                  continue;
                }
                const typed = msg as Extract<ServerWsMessage, { type: T }>;
                if (!predicate || predicate(typed)) {
                  consumed.add(msg);
                  clearTimeout(timer);
                  resolve(typed);
                  return true;
                }
              }
              return false;
            };

            const timer = setTimeout(() => {
              reject(
                new Error(
                  `Timed out waiting for "${type}". Received: ${JSON.stringify(
                    received.map((m) => m.type),
                  )}`,
                ),
              );
            }, 3000);

            if (!tryResolve()) {
              waiters.push({
                tryResolve,
                reject: (err) => {
                  clearTimeout(timer);
                  reject(err);
                },
              });
            }
          },
        ),
      close: () =>
        new Promise<void>((resolve) => {
          if (ws.readyState === WebSocket.CLOSED) {
            resolve();
            return;
          }
          ws.once('close', () => resolve());
          ws.close();
        }),
    };

    openPeers.push(peer);
    return peer;
  }

  async function fetchHealth(): Promise<HealthResponse> {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    return (await res.json()) as HealthResponse;
  }

  beforeEach(async () => {
    currentNowMs = 1_760_000_000_000;
    openPeers = [];
    sessionStore = new LiveSessionStore({
      now: () => currentNowMs,
      sessionTtlMs: DEFAULT_SESSION_TTL_MS,
      sweepIntervalMs: false,
    });
    server = createAppServer({
      staticDir: false,
      sessionStore,
    });
    const bound = await server.start(0, '127.0.0.1');
    port = bound.port;
    baseUrl = `http://127.0.0.1:${port}`;
    wsUrl = `ws://127.0.0.1:${port}/ws`;
  });

  afterEach(async () => {
    await Promise.all(openPeers.map((peer) => peer.close()));
    await server.close();
  });

  it('Scenario 1 & 6: creates a PIN-protected LiveSession without unsolicited frames, preserves ping->pong, and increments GET /api/health activeSessionCount', async () => {
    const initialHealth = await fetchHealth();
    expect(initialHealth.activeSessionCount).toBe(0);

    const leader = await connectPeer();
    // Ensure no unsolicited greeting frame is emitted on open.
    await new Promise((r) => setTimeout(r, 25));
    expect(leader.received).toHaveLength(0);

    leader.send({ type: 'ping', requestId: 'hb-1' });
    const pong = await leader.waitFor('pong');
    expect(pong.requestId).toBe('hb-1');
    expect(Number.isNaN(Date.parse(pong.timestamp))).toBe(false);

    leader.send({
      type: 'create_session',
      displayName: ' Claire ',
      requestId: 'create-1',
    });
    const created = await leader.waitFor('session_created');

    expect(created.requestId).toBe('create-1');
    expect(created.sessionCode).toMatch(/^[A-Z0-9]{6}$/);
    expect(created.leaderPin).toMatch(/^\d{4}$/);
    expect(created.leaderToken.length).toBeGreaterThanOrEqual(24);
    expect(created.reconnectToken.length).toBeGreaterThanOrEqual(24);
    expect(created.role).toBe('Study Leader');
    expect(created.session).toMatchObject({
      sessionCode: created.sessionCode,
      status: 'setup',
      currentSectionIndex: null,
      currentSectionId: null,
      connectedMemberCount: 1,
      connectedParticipantCount: 0,
    });
    expect(created.session.members).toHaveLength(1);
    expect(created.session.members[0]).toMatchObject({
      memberId: created.memberId,
      displayName: 'Claire',
      initials: 'CL',
      avatarPalette: 'gold',
      role: 'Study Leader',
      connectionStatus: 'connected',
    });

    const afterHealth = await fetchHealth();
    expect(afterHealth.activeSessionCount).toBe(1);
  });

  it('Scenario 2: joins Participants with lowercase/padded code, disambiguates duplicate displayNames, broadcasts roster_updated, and leaks zero secrets', async () => {
    const leader = await connectPeer();
    leader.send({ type: 'create_session', displayName: 'Claire' });
    const created = await leader.waitFor('session_created');

    const participant1 = await connectPeer();
    participant1.send({
      type: 'join_session',
      sessionCode: `  ${created.sessionCode.toLowerCase()}  `,
      displayName: 'Daniel',
    });

    const joined1 = await participant1.waitFor('session_joined');
    await leader.waitFor(
      'roster_updated',
      (msg) => msg.session.connectedMemberCount === 2,
    );
    await participant1.waitFor(
      'roster_updated',
      (msg) => msg.session.connectedMemberCount === 2,
    );

    const participant2 = await connectPeer();
    participant2.send({
      type: 'join_session',
      sessionCode: created.sessionCode.toLowerCase(),
      displayName: 'daniel',
    });

    const joined2 = await participant2.waitFor('session_joined');
    const leaderRoster3 = await leader.waitFor(
      'roster_updated',
      (msg) => msg.session.connectedMemberCount === 3,
    );
    const p1Roster3 = await participant1.waitFor(
      'roster_updated',
      (msg) => msg.session.connectedMemberCount === 3,
    );
    const p2Roster3 = await participant2.waitFor(
      'roster_updated',
      (msg) => msg.session.connectedMemberCount === 3,
    );

    expect(joined1.memberId).not.toBe(joined2.memberId);
    expect(joined1.role).toBe('Participant');
    expect(joined2.role).toBe('Participant');
    expect(joined1.displayName).toBe('Daniel');
    expect(joined2.displayName).toBe('daniel (2)');
    expect(joined1.member.initials).toBe('DA');
    expect(joined2.member.initials).toBe('DA');
    expect(joined1.avatarPalette).not.toBe(joined2.avatarPalette);

    for (const rosterMsg of [leaderRoster3, p1Roster3, p2Roster3]) {
      expect(rosterMsg.session.connectedMemberCount).toBe(3);
      expect(rosterMsg.session.connectedParticipantCount).toBe(2);
      const serializedRoster = JSON.stringify(rosterMsg);
      expect(serializedRoster).not.toContain('leaderPin');
      expect(serializedRoster).not.toContain('leaderToken');
      expect(serializedRoster).not.toContain('reconnectToken');
      expect(serializedRoster).not.toContain(created.leaderPin);
      expect(serializedRoster).not.toContain(created.leaderToken);
      expect(serializedRoster).not.toContain(created.reconnectToken);
      expect(serializedRoster).not.toContain(joined1.reconnectToken);
      expect(serializedRoster).not.toContain(joined2.reconnectToken);
      expect(serializedRoster).not.toContain('Assistant');
    }

    // Verify neither session_joined frame leaks leader secrets or other members' reconnectTokens,
    // and neither session_joined.session nor session_joined.member contains any secret fields.
    for (const [joinedMsg, otherReconnect] of [
      [joined1, joined2.reconnectToken],
      [joined2, joined1.reconnectToken],
    ] as const) {
      expect(joinedMsg).not.toHaveProperty('leaderPin');
      expect(joinedMsg).not.toHaveProperty('leaderToken');
      const serializedJoined = JSON.stringify(joinedMsg);
      expect(serializedJoined).not.toContain(created.leaderPin);
      expect(serializedJoined).not.toContain(created.leaderToken);
      expect(serializedJoined).not.toContain(created.reconnectToken);
      expect(serializedJoined).not.toContain(otherReconnect);

      const serializedPublicSnapshot = JSON.stringify({
        member: joinedMsg.member,
        session: joinedMsg.session,
      });
      expect(serializedPublicSnapshot).not.toContain('leaderPin');
      expect(serializedPublicSnapshot).not.toContain('leaderToken');
      expect(serializedPublicSnapshot).not.toContain('reconnectToken');
      expect(serializedPublicSnapshot).not.toContain(joinedMsg.reconnectToken);
    }
  });

  it('Scenario 3: rejects unauthorized second leaders, Participant leader commands, unjoined leader commands, and malformed JSON server-side', async () => {
    const leader = await connectPeer();
    leader.send({ type: 'create_session', displayName: 'Claire' });
    const created = await leader.waitFor('session_created');

    const participant = await connectPeer();
    participant.send({
      type: 'join_session',
      sessionCode: created.sessionCode,
      displayName: 'Mary Lopez',
    });
    await participant.waitFor('session_joined');

    const intruder = await connectPeer();

    // Missing or wrong leaderPin on claim_leader
    const wrongPin = created.leaderPin === '0000' ? '9999' : '0000';
    intruder.send({
      type: 'claim_leader',
      sessionCode: created.sessionCode,
      leaderPin: wrongPin,
      displayName: 'Intruder',
      requestId: 'bad-pin-1',
    });
    const pinError = await intruder.waitFor('session_error');
    expect(pinError).toMatchObject({
      requestId: 'bad-pin-1',
      code: 'INVALID_LEADER_PIN',
    });

    intruder.send({
      type: 'claim_leader',
      sessionCode: created.sessionCode,
      leaderPin: '',
      requestId: 'missing-pin-1',
    });
    const missingPinError = await intruder.waitFor('session_error');
    expect(missingPinError).toMatchObject({
      requestId: 'missing-pin-1',
      code: 'INVALID_LEADER_PIN',
    });

    // Participant attempting every leader command (missing or bogus token) -> FORBIDDEN_LEADER_ONLY
    for (const command of [
      'open_lobby',
      'start_study',
      'next_section',
      'close_session',
    ] as const) {
      participant.send({
        type: command,
        sessionCode: created.sessionCode,
        leaderToken: 'bogus-token',
        requestId: `p-${command}`,
      });
      const err = await participant.waitFor('session_error');
      expect(err).toMatchObject({
        requestId: `p-${command}`,
        code: 'FORBIDDEN_LEADER_ONLY',
      });
    }

    // Unjoined socket attempting leader command with bogus token -> UNAUTHORIZED_LEADER
    intruder.send({
      type: 'start_study',
      sessionCode: created.sessionCode,
      leaderToken: 'bogus-leader-token',
      requestId: 'u-start',
    });
    const unauthorizedErr = await intruder.waitFor('session_error');
    expect(unauthorizedErr).toMatchObject({
      requestId: 'u-start',
      code: 'UNAUTHORIZED_LEADER',
    });

    // Malformed JSON frame -> INVALID_MESSAGE without crashing
    intruder.sendRaw('{not-valid-json');
    const jsonErr = await intruder.waitFor('session_error');
    expect(jsonErr.code).toBe('INVALID_MESSAGE');

    // Original leader retains full authority and room remains in 'setup' until leader acts.
    expect(sessionStore.getPublicSessionSnapshot(created.sessionCode)?.status).toBe(
      'setup',
    );
    leader.send({
      type: 'open_lobby',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      requestId: 'valid-lobby',
    });
    const updated = await leader.waitFor('session_updated');
    expect(updated.session.status).toBe('lobby');
  });

  it('Scenario 4: transfers Study Leader authority via valid leaderPin, rotates leaderToken, notifies displaced leader, and rejects stale tokens', async () => {
    const leader1 = await connectPeer();
    leader1.send({ type: 'create_session', displayName: 'Claire' });
    const created = await leader1.waitFor('session_created');
    const tokenT1 = created.leaderToken;

    const participant = await connectPeer();
    participant.send({
      type: 'join_session',
      sessionCode: created.sessionCode,
      displayName: 'Sara Castillo',
    });
    await participant.waitFor('session_joined');

    const leader2 = await connectPeer();
    leader2.send({
      type: 'claim_leader',
      sessionCode: created.sessionCode,
      leaderPin: created.leaderPin,
      displayName: 'Fr. Marco',
      requestId: 'claim-ok',
    });

    const claimed = await leader2.waitFor('leader_claimed');
    const replacedNotice = await leader1.waitFor('leader_replaced');
    const participantRoster = await participant.waitFor(
      'roster_updated',
      (msg) =>
        msg.session.members.some((m) => m.displayName === 'Fr. Marco'),
    );

    expect(claimed.requestId).toBe('claim-ok');
    expect(claimed.role).toBe('Study Leader');
    expect(claimed.leaderToken).not.toBe(tokenT1);
    expect(claimed.reconnectToken).not.toBe(created.reconnectToken);
    expect(replacedNotice.sessionCode).toBe(created.sessionCode);

    const leaderMembers = claimed.session.members.filter(
      (m) => m.role === 'Study Leader',
    );
    expect(leaderMembers).toHaveLength(1);
    expect(leaderMembers[0]).toMatchObject({
      displayName: 'Fr. Marco',
      initials: 'FM',
      role: 'Study Leader',
      connectionStatus: 'connected',
    });
    expect(participantRoster.session.members.filter((m) => m.role === 'Study Leader')).toHaveLength(1);

    // Displaced leader1 tries to start study with stale token T1 -> UNAUTHORIZED_LEADER
    leader1.send({
      type: 'start_study',
      sessionCode: created.sessionCode,
      leaderToken: tokenT1,
      requestId: 'stale-start',
    });
    const staleErr = await leader1.waitFor('session_error');
    expect(staleErr).toMatchObject({
      requestId: 'stale-start',
      code: 'UNAUTHORIZED_LEADER',
    });

    // Displaced leader1 also cannot reconnect using rotated-out credentials
    leader1.send({
      type: 'reconnect_session',
      sessionCode: created.sessionCode,
      memberId: created.memberId,
      reconnectToken: created.reconnectToken,
      requestId: 'stale-reconnect',
    });
    const staleReconnectErr = await leader1.waitFor('session_error');
    expect(staleReconnectErr).toMatchObject({
      requestId: 'stale-reconnect',
      code: 'UNAUTHORIZED_RECONNECT',
    });

    // New leader2 advances setup -> in_progress -> section_2_icebreaker cleanly
    leader2.send({
      type: 'start_study',
      sessionCode: created.sessionCode,
      leaderToken: claimed.leaderToken,
      requestId: 'new-leader-start',
    });
    const started = await leader2.waitFor('session_updated');
    expect(started.session.status).toBe('in_progress');
    expect(started.session.currentSectionIndex).toBe(0);
    expect(started.session.currentSectionId).toBe('section_1_prayer');

    const participantSync = await participant.waitFor(
      'session_updated',
      (msg) => msg.command === 'start_study',
    );
    expect(participantSync.session.currentSectionId).toBe('section_1_prayer');

    leader2.send({
      type: 'next_section',
      sessionCode: created.sessionCode,
      leaderToken: claimed.leaderToken,
      requestId: 'advance-sec-2',
    });
    const sec2 = await leader2.waitFor(
      'session_updated',
      (msg) => msg.command === 'next_section',
    );
    expect(sec2.session.currentSectionIndex).toBe(1);
    expect(sec2.session.currentSectionId).toBe('section_2_icebreaker');
  });

  it('Scenario 5 & maxPayload: supports safe member reconnect without duplicate (2) names, enforces 64 KiB maxPayload, and purges closed/expired rooms', async () => {
    const leader = await connectPeer();
    leader.send({ type: 'create_session', displayName: 'Claire' });
    const created = await leader.waitFor('session_created');

    const participant = await connectPeer();
    participant.send({
      type: 'join_session',
      sessionCode: created.sessionCode,
      displayName: 'Daniel',
    });
    const joined = await participant.waitFor('session_joined');
    await leader.waitFor(
      'roster_updated',
      (msg) => msg.session.connectedMemberCount === 2,
    );

    // Disconnect participant
    await participant.close();
    const afterDisconnectRoster = await leader.waitFor(
      'roster_updated',
      (msg) => msg.session.connectedMemberCount === 1,
    );
    expect(
      afterDisconnectRoster.session.members.find(
        (m) => m.memberId === joined.memberId,
      )?.connectionStatus,
    ).toBe('disconnected');

    // Attempt reconnect with wrong token -> UNAUTHORIZED_RECONNECT
    const reconnectPeer = await connectPeer();
    reconnectPeer.send({
      type: 'reconnect_session',
      sessionCode: created.sessionCode,
      memberId: joined.memberId,
      reconnectToken: 'wrong-reconnect-token',
      requestId: 'bad-reconnect',
    });
    const badReconnect = await reconnectPeer.waitFor('session_error');
    expect(badReconnect).toMatchObject({
      requestId: 'bad-reconnect',
      code: 'UNAUTHORIZED_RECONNECT',
    });

    // Valid reconnect restores existing memberId & displayName ('Daniel', not 'Daniel (2)')
    reconnectPeer.send({
      type: 'reconnect_session',
      sessionCode: created.sessionCode,
      memberId: joined.memberId,
      reconnectToken: joined.reconnectToken,
      requestId: 'good-reconnect',
    });
    const reconnected = await reconnectPeer.waitFor('session_reconnected');
    expect(reconnected.memberId).toBe(joined.memberId);
    expect(reconnected.member.displayName).toBe('Daniel');
    expect(reconnected.member.connectionStatus).toBe('connected');
    expect(reconnected.session.members).toHaveLength(2);
    expect(reconnected.session.connectedMemberCount).toBe(2);

    // Verify 64 KiB maxPayload closes an oversized rogue socket with code 1009 while keeping server healthy
    const oversizedSocket = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      oversizedSocket.once('open', () => resolve());
      oversizedSocket.once('error', reject);
    });
    const closeCodePromise = new Promise<number>((resolve) => {
      oversizedSocket.once('close', (code) => resolve(code));
    });
    oversizedSocket.send('x'.repeat(DEFAULT_WS_MAX_PAYLOAD_BYTES + 1024));
    const closeCode = await closeCodePromise;
    expect(closeCode).toBe(1009);

    expect((await fetchHealth()).activeSessionCount).toBe(1);

    // Verify transport ping does NOT reset 4-hour session inactivity TTL
    currentNowMs += DEFAULT_SESSION_TTL_MS - 1_000;
    leader.send({ type: 'ping' });
    await leader.waitFor('pong');
    expect((await fetchHealth()).activeSessionCount).toBe(1);

    // Advance past 4-hour inactivity TTL: GET /api/health purges expired room and notifies open sockets
    currentNowMs += 1_000;
    const expiredHealth = await fetchHealth();
    expect(expiredHealth.activeSessionCount).toBe(0);

    const leaderClosed = await leader.waitFor('session_closed');
    const participantClosed = await reconnectPeer.waitFor('session_closed');
    expect(leaderClosed).toMatchObject({
      sessionCode: created.sessionCode,
      reason: 'expired_inactivity',
    });
    expect(participantClosed).toMatchObject({
      sessionCode: created.sessionCode,
      reason: 'expired_inactivity',
    });
  });
});

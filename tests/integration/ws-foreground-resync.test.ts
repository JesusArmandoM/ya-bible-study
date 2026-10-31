import { WebSocket } from 'ws';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LiveSessionStore } from '../../src/server/sessionStore';
import { createAppServer, type AppServer, type BoundServerAddress } from '../../src/server/app';
import { getDefaultStudyDocument } from '../../src/server/studies/greatIsYourFaithSeed';
import {
  DEFAULT_SESSION_TTL_MS,
  toSessionStudySummary,
  type ClientWsMessage,
  type ServerWsMessage,
} from '../../src/shared/session';

interface BufferedPeer {
  send: (payload: ClientWsMessage) => void;
  waitFor: <T extends ServerWsMessage['type']>(
    type: T,
    predicate?: (msg: Extract<ServerWsMessage, { type: T }>) => boolean,
  ) => Promise<Extract<ServerWsMessage, { type: T }>>;
  close: () => Promise<void>;
}

/**
 * Foreground resync reuses the existing `reconnect_session` ->
 * `session_reconnected` round trip (zero protocol change). This suite proves
 * against the REAL server that it is idempotent on a connected socket, always
 * returns a full fresh snapshot (Scenario 4), strips secrets + pastoral fields,
 * and never leaks sessions.
 */
describe('WebSocket foreground resync (reconnect_session snapshot hydration)', () => {
  let sessionStore: LiveSessionStore;
  let server: AppServer;
  let bound: BoundServerAddress;
  let wsUrl: string;
  let openPeers: BufferedPeer[];

  async function connectPeer(): Promise<BufferedPeer> {
    const ws = new WebSocket(wsUrl);
    const received: ServerWsMessage[] = [];
    const consumed = new Set<ServerWsMessage>();
    const waiters: Array<{ tryResolve: () => boolean }> = [];

    const flushWaiters = () => {
      for (let i = waiters.length - 1; i >= 0; i -= 1) {
        const waiter = waiters[i];
        if (waiter && waiter.tryResolve()) {
          waiters.splice(i, 1);
        }
      }
    };

    ws.on('message', (data) => {
      received.push(JSON.parse(String(data)) as ServerWsMessage);
      flushWaiters();
    });

    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', (err) => reject(err));
    });

    const peer: BufferedPeer = {
      send: (payload) => {
        ws.send(JSON.stringify(payload));
      },
      waitFor: (type, predicate) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        new Promise<any>((resolve, reject) => {
          const tryResolve = () => {
            for (const msg of received) {
              if (consumed.has(msg) || msg.type !== type) {
                continue;
              }
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const typed = msg as any;
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
            waiters.push({ tryResolve });
          }
        }),
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

  beforeEach(async () => {
    openPeers = [];
    sessionStore = new LiveSessionStore({
      now: () => Date.now(),
      sessionTtlMs: DEFAULT_SESSION_TTL_MS,
      sweepIntervalMs: false,
    });
    server = createAppServer({ staticDir: false, sessionStore });
    bound = await server.start(0, '127.0.0.1');
    wsUrl = `ws://127.0.0.1:${bound.port}/ws`;
  });

  afterEach(async () => {
    // Never-throwing bounded cleanup: no leaked sockets or servers.
    await Promise.allSettled(openPeers.map((peer) => peer.close()));
    await Promise.allSettled([server.close()]);
  });

  async function createLeader() {
    const leader = await connectPeer();
    leader.send({ type: 'create_session', displayName: 'Ana', requestId: 'c1' });
    const created = await leader.waitFor('session_created');
    return { leader, created };
  }

  async function joinParticipant(sessionCode: string, displayName: string) {
    const participant = await connectPeer();
    participant.send({
      type: 'join_session',
      sessionCode,
      displayName,
      requestId: `join-${displayName}`,
    });
    const joined = await participant.waitFor('session_joined');
    expect(joined.role).toBe('Participant');
    return { participant, joined };
  }

  async function getActiveSessionCount(): Promise<number> {
    const response = await fetch(
      `http://127.0.0.1:${bound.port}/api/health`,
    );
    const body = (await response.json()) as { activeSessionCount: number };
    return body.activeSessionCount;
  }

  it('returns a full fresh session_reconnected snapshot (volunteerTurn included) on an already-connected socket', async () => {
    const { leader, created } = await createLeader();
    const { participant: p1, joined: j1 } = await joinParticipant(
      created.sessionCode,
      'Mia',
    );

    leader.send({
      type: 'start_study',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'start-1',
    });
    await leader.waitFor('session_updated', (m) => m.command === 'start_study');

    // Mia raises her hand, the leader chooses her.
    p1.send({
      type: 'raise_hand',
      sessionCode: created.sessionCode,
      memberId: j1.memberId,
      requestId: 'raise-1',
    });
    await p1.waitFor('session_updated', (m) => m.command === 'raise_hand');

    leader.send({
      type: 'choose_volunteer',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      targetMemberId: j1.memberId,
      requestId: 'choose-1',
    });
    await leader.waitFor(
      'session_updated',
      (m) => m.command === 'choose_volunteer',
    );

    // Foreground resync: reconnect_session on the SAME, still-connected socket
    // is idempotent and rebinds the socket identity.
    p1.send({
      type: 'reconnect_session',
      sessionCode: created.sessionCode,
      memberId: j1.memberId,
      reconnectToken: j1.reconnectToken,
      requestId: 'resync-1',
    });
    const reconnected = await p1.waitFor(
      'session_reconnected',
      (m) => m.requestId === 'resync-1',
    );

    expect(reconnected.memberId).toBe(j1.memberId);
    expect(reconnected.role).toBe('Participant');
    // Full fresh snapshot: current turn state reflects the LIVE selection.
    expect(reconnected.session.status).toBe('in_progress');
    expect(reconnected.session.currentSectionId).toBe('section_1_prayer');
    expect(reconnected.session.volunteerTurn?.selectedMemberId).toBe(
      j1.memberId,
    );
    expect(reconnected.session.volunteerTurn?.completedAt).toBeNull();
    expect(reconnected.session.volunteerTurn?.raisedHands).toEqual([
      { memberId: j1.memberId, raisedAt: expect.any(String) },
    ]);
    expect(reconnected.session.protocolVersion).toBe(3);
    expect(reconnected.session.members.map((m) => m.displayName).sort()).toEqual(
      ['Ana', 'Mia'],
    );

    // Idempotent rebind: the socket-bound identity still works after resync.
    p1.send({
      type: 'complete_turn',
      sessionCode: created.sessionCode,
      memberId: j1.memberId,
      requestId: 'done-1',
    });
    const done = await p1.waitFor(
      'session_updated',
      (m) => m.command === 'complete_turn',
    );
    expect(done.session.volunteerTurn?.completedAt).not.toBeNull();
  });

  it('reflects mutations between two reconnects in the second snapshot (freshness)', async () => {
    const { leader, created } = await createLeader();
    const { participant: p1, joined: j1 } = await joinParticipant(
      created.sessionCode,
      'Mia',
    );

    leader.send({
      type: 'start_study',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'start-1',
    });
    await leader.waitFor('session_updated', (m) => m.command === 'start_study');

    p1.send({
      type: 'raise_hand',
      sessionCode: created.sessionCode,
      memberId: j1.memberId,
      requestId: 'raise-1',
    });
    await p1.waitFor('session_updated', (m) => m.command === 'raise_hand');

    // Resync #1: assigned but not completed.
    leader.send({
      type: 'choose_volunteer',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      targetMemberId: j1.memberId,
      requestId: 'choose-1',
    });
    await leader.waitFor(
      'session_updated',
      (m) => m.command === 'choose_volunteer',
    );
    p1.send({
      type: 'reconnect_session',
      sessionCode: created.sessionCode,
      memberId: j1.memberId,
      reconnectToken: j1.reconnectToken,
      requestId: 'resync-1',
    });
    const first = await p1.waitFor(
      'session_reconnected',
      (m) => m.requestId === 'resync-1',
    );
    expect(first.session.volunteerTurn?.selectedMemberId).toBe(j1.memberId);
    expect(first.session.volunteerTurn?.completedAt).toBeNull();

    // Mutation while "backgrounded": the chosen volunteer completes the turn.
    p1.send({
      type: 'complete_turn',
      sessionCode: created.sessionCode,
      memberId: j1.memberId,
      requestId: 'done-1',
    });
    await p1.waitFor('session_updated', (m) => m.command === 'complete_turn');

    // Resync #2: the mutation is present in the fresh snapshot.
    p1.send({
      type: 'reconnect_session',
      sessionCode: created.sessionCode,
      memberId: j1.memberId,
      reconnectToken: j1.reconnectToken,
      requestId: 'resync-2',
    });
    const second = await p1.waitFor(
      'session_reconnected',
      (m) => m.requestId === 'resync-2',
    );
    expect(second.session.volunteerTurn?.selectedMemberId).toBe(j1.memberId);
    expect(second.session.volunteerTurn?.completedAt).not.toBeNull();
  });

  it('strips secrets and pastoral fields from session_reconnected snapshots', async () => {
    const { leader, created } = await createLeader();
    const { participant: p1, joined: j1 } = await joinParticipant(
      created.sessionCode,
      'Mia',
    );

    // Load the seeded study (carries Opening Prayer copy) so the snapshot has
    // study content to project — and pastoral fields to strip.
    const summary = toSessionStudySummary(getDefaultStudyDocument());
    expect(summary.openingPrayer?.suggestedPrayerText).toBeTruthy();
    leader.send({
      type: 'load_study',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      study: summary,
      requestId: 'load-1',
    });
    await leader.waitFor('session_updated', (m) => m.command === 'load_study');

    p1.send({
      type: 'reconnect_session',
      sessionCode: created.sessionCode,
      memberId: j1.memberId,
      reconnectToken: j1.reconnectToken,
      requestId: 'resync-1',
    });
    const reconnected = await p1.waitFor(
      'session_reconnected',
      (m) => m.requestId === 'resync-1',
    );

    const raw = JSON.stringify(reconnected);
    // Secrets never cross the wire on resync replies.
    expect(raw).not.toContain('leaderPin');
    expect(raw).not.toContain('leaderToken');
    expect(raw).not.toContain('reconnectToken');
    // Pastoral / facilitator-facing fields never cross either.
    expect(raw).not.toContain('leaderPrompt');
    expect(raw).not.toContain('leaderLiturgicalContextNote');
    // The participant-visible projection is present and fresh.
    expect(reconnected.session.study?.title).toBe('Great Is Your Faith');
    expect(reconnected.session.study?.gospelCitation).toBe('Matthew 15:21–28');
    expect(reconnected.session.study?.openingPrayer?.suggestedPrayerText).toBeTruthy();
  });

  it('leaves GET /api/health.activeSessionCount unchanged across repeated resyncs and tears down cleanly', async () => {
    const { leader, created } = await createLeader();
    const { participant: p1, joined: j1 } = await joinParticipant(
      created.sessionCode,
      'Mia',
    );
    const { participant: p2, joined: j2 } = await joinParticipant(
      created.sessionCode,
      'Leo',
    );

    const before = await getActiveSessionCount();
    expect(before).toBe(1);

    // Five resync round trips across two clients: no session churn.
    for (let i = 1; i <= 5; i += 1) {
      p1.send({
        type: 'reconnect_session',
        sessionCode: created.sessionCode,
        memberId: j1.memberId,
        reconnectToken: j1.reconnectToken,
        requestId: `resync-p1-${i}`,
      });
      await p1.waitFor(
        'session_reconnected',
        (m) => m.requestId === `resync-p1-${i}`,
      );
      p2.send({
        type: 'reconnect_session',
        sessionCode: created.sessionCode,
        memberId: j2.memberId,
        reconnectToken: j2.reconnectToken,
        requestId: `resync-p2-${i}`,
      });
      await p2.waitFor(
        'session_reconnected',
        (m) => m.requestId === `resync-p2-${i}`,
      );
    }

    const after = await getActiveSessionCount();
    expect(after).toBe(before);

    // Clean teardown path: closing the session returns the counter to 0.
    leader.send({
      type: 'close_session',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'close-1',
    });
    await leader.waitFor('session_closed');
    await Promise.allSettled([p1.close(), p2.close(), leader.close()]);
    openPeers = [];
    expect(await getActiveSessionCount()).toBe(0);
  });

  it('rejects a resync with definitive session-gone codes once the session is closed', async () => {
    const { leader, created } = await createLeader();
    const { participant: p1, joined: j1 } = await joinParticipant(
      created.sessionCode,
      'Mia',
    );

    leader.send({
      type: 'close_session',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'close-1',
    });
    await leader.waitFor('session_closed');

    // Foreground resync against a close_session-d room: definitive
    // SESSION_NOT_FOUND (client clears credentials and returns to Welcome).
    p1.send({
      type: 'reconnect_session',
      sessionCode: created.sessionCode,
      memberId: j1.memberId,
      reconnectToken: j1.reconnectToken,
      requestId: 'resync-gone',
    });
    const error = await p1.waitFor(
      'session_error',
      (m) => m.requestId === 'resync-gone',
    );
    expect(error.code).toBe('SESSION_NOT_FOUND');
    expect(await getActiveSessionCount()).toBe(0);
  });
});

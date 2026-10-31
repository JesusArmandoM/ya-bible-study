import { WebSocket } from 'ws';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LiveSessionStore } from '../../src/server/sessionStore';
import { createAppServer, type AppServer } from '../../src/server/app';
import {
  DEFAULT_SESSION_TTL_MS,
  type ClientWsMessage,
  type ServerWsMessage,
  type SessionErrorCode,
} from '../../src/shared/session';

interface BufferedPeer {
  send: (payload: ClientWsMessage) => void;
  waitFor: <T extends ServerWsMessage['type']>(
    type: T,
    predicate?: (msg: Extract<ServerWsMessage, { type: T }>) => boolean,
  ) => Promise<Extract<ServerWsMessage, { type: T }>>;
  close: () => Promise<void>;
}

interface ConnectHarness {
  connectPeer: () => Promise<BufferedPeer>;
  openPeers: BufferedPeer[];
}

function installConnectPeer(wsUrl: () => string, openPeers: BufferedPeer[]) {
  return async function connectPeer(): Promise<BufferedPeer> {
    const ws = new WebSocket(wsUrl());
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
  };
}

/**
 * Asserts that NO `random_expired` broadcast arrives within `windowMs`. The
 * pending waiter is silenced so its later timeout can never become an
 * unhandled rejection.
 */
async function expectNoRandomExpired(
  peer: BufferedPeer,
  windowMs: number,
): Promise<void> {
  const pending = peer
    .waitFor('session_updated', (m) => m.command === 'random_expired')
    .then(() => 'expired' as const)
    .catch(() => 'error' as const);
  const winner = await Promise.race([
    pending,
    new Promise<'timeout'>((resolve) =>
      setTimeout(() => resolve('timeout'), windowMs),
    ),
  ]);
  expect(winner).toBe('timeout');
}

describe('WebSocket random volunteer picker + 30s countdown (protocol v3)', () => {
  let sessionStore: LiveSessionStore;
  let server: AppServer;
  let wsUrl: string;
  let openPeers: BufferedPeer[];
  let connectPeer: ConnectHarness['connectPeer'];

  // Deterministic clock + RNG seams: the lazy window check and the fair pick
  // are both driven from the test, never from Math.random or real waiting.
  let nowMs: number;
  let pickCalls: number[];

  beforeEach(async () => {
    openPeers = [];
    nowMs = Date.parse('2026-10-30T20:00:00.000Z');
    pickCalls = [];
    sessionStore = new LiveSessionStore({
      now: () => nowMs,
      sessionTtlMs: DEFAULT_SESSION_TTL_MS,
      sweepIntervalMs: false,
      // Scripted uniform pick: always the first pool slot; pool sizes recorded
      // so the retry-exclusion rule is directly observable.
      pickRandomIndex: (maxExclusive) => {
        pickCalls.push(maxExclusive);
        return 0;
      },
      // Far-future window: nothing expires on the real clock inside these
      // tests — expiry is exercised lazily via the `now` seam.
      randomCountdownMs: 60_000,
    });
    server = createAppServer({ staticDir: false, sessionStore });
    const bound = await server.start(0, '127.0.0.1');
    wsUrl = `ws://127.0.0.1:${bound.port}/ws`;
    connectPeer = installConnectPeer(() => wsUrl, openPeers);
  });

  afterEach(async () => {
    await Promise.all(openPeers.map((peer) => peer.close()));
    await server.close();
    sessionStore.dispose();
  });

  async function createLeader() {
    const leader = await connectPeer();
    leader.send({ type: 'create_session', displayName: 'Claire', requestId: 'c1' });
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

  async function startStudy(
    leader: BufferedPeer,
    created: { sessionCode: string; leaderToken: string; memberId: string },
  ) {
    leader.send({
      type: 'start_study',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'start-1',
    });
    return leader.waitFor('session_updated', (m) => m.command === 'start_study');
  }

  type RandomCommandType = 'pick_random' | 'retry_random' | 'confirm_random';

  function randomCommand(
    peer: BufferedPeer,
    input: {
      sessionCode: string;
      leaderToken: string;
      memberId: string;
    },
    type: RandomCommandType,
    requestId: string,
    overrides: { leaderToken?: string; memberId?: string } = {},
  ) {
    peer.send({
      type,
      sessionCode: input.sessionCode,
      leaderToken: overrides.leaderToken ?? input.leaderToken,
      memberId: overrides.memberId ?? input.memberId,
      requestId,
    });
  }

  async function expectError(
    peer: BufferedPeer,
    code: SessionErrorCode,
    requestId: string,
  ) {
    return peer.waitFor(
      'session_error',
      (msg) => msg.code === code && msg.requestId === requestId,
    );
  }

  it('Scenario 1: pick -> countdown state -> confirm -> Done -> next_section gate reuses the established flow', async () => {
    const { leader, created } = await createLeader();
    const { participant: p1, joined: j1 } = await joinParticipant(
      created.sessionCode,
      'Mia',
    );
    const { participant: p2, joined: j2 } = await joinParticipant(
      created.sessionCode,
      'Leo',
    );
    await startStudy(leader, created);

    // Pick: fair candidate staged with a server-clock absolute expiry.
    randomCommand(leader, created, 'pick_random', 'pick-1');
    const picked = await leader.waitFor(
      'session_updated',
      (m) => m.command === 'pick_random',
    );
    expect(picked.session.volunteerTurn?.candidateMemberId).toBe(j1.memberId);
    expect(picked.session.volunteerTurn?.candidateExpiresAt).toBeTruthy();
    expect(
      Date.parse(picked.session.volunteerTurn?.candidateExpiresAt ?? ''),
    ).toBeGreaterThan(nowMs);
    expect(picked.session.volunteerTurn?.selectedMemberId).toBeNull();
    // Every client's snapshot carries the staged candidate.
    const pickedP2 = await p2.waitFor(
      'session_updated',
      (m) => m.command === 'pick_random',
    );
    expect(pickedP2.session.volunteerTurn?.candidateMemberId).toBe(j1.memberId);

    // Confirm within the window: assigned via the frozen chosen-volunteer gate.
    randomCommand(leader, created, 'confirm_random', 'confirm-1');
    const confirmed = await leader.waitFor(
      'session_updated',
      (m) => m.command === 'confirm_random',
    );
    expect(confirmed.session.volunteerTurn?.selectedMemberId).toBe(j1.memberId);
    expect(confirmed.session.volunteerTurn?.candidateMemberId).toBeNull();
    expect(confirmed.session.volunteerTurn?.candidateExpiresAt).toBeNull();
    await p2.waitFor('session_updated', (m) => m.command === 'confirm_random');

    // Done by the chosen volunteer, then the established gate opens.
    p1.send({
      type: 'complete_turn',
      sessionCode: created.sessionCode,
      memberId: j1.memberId,
      requestId: 'done-1',
    });
    await leader.waitFor('session_updated', (m) => m.command === 'complete_turn');
    leader.send({
      type: 'next_section',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'next-1',
    });
    const advanced = await leader.waitFor(
      'session_updated',
      (m) => m.command === 'next_section',
    );
    expect(advanced.session.currentSectionId).toBe('section_2_icebreaker');
    expect(advanced.session.volunteerTurn).toBeNull();
  }, 15_000);

  it('Scenario 2: Retry re-rolls excluding the current candidate and resets the window', async () => {
    const { leader, created } = await createLeader();
    const { joined: j1 } = await joinParticipant(created.sessionCode, 'Mia');
    const { joined: j2 } = await joinParticipant(created.sessionCode, 'Leo');
    await startStudy(leader, created);

    randomCommand(leader, created, 'pick_random', 'pick-1');
    const picked = await leader.waitFor(
      'session_updated',
      (m) => m.command === 'pick_random',
    );
    expect(picked.session.volunteerTurn?.candidateMemberId).toBe(j1.memberId);
    expect(pickCalls).toEqual([2]);

    // Advance the clock inside the window: Retry must reset to now + window.
    nowMs += 10_000;
    randomCommand(leader, created, 'retry_random', 'retry-1');
    const retried = await leader.waitFor(
      'session_updated',
      (m) => m.command === 'retry_random',
    );
    // Two eligible -> the pool shrank to one (exclusion), slot 0 = the other.
    expect(pickCalls).toEqual([2, 1]);
    expect(retried.session.volunteerTurn?.candidateMemberId).toBe(j2.memberId);
    expect(
      Date.parse(retried.session.volunteerTurn?.candidateExpiresAt ?? ''),
    ).toBe(nowMs + 60_000);
    expect(retried.session.volunteerTurn?.selectedMemberId).toBeNull();
  }, 15_000);

  it('Scenario 2: single-Person Retry re-picks with a reset window and never deadlocks', async () => {
    const { leader, created } = await createLeader();
    const { joined: j1 } = await joinParticipant(created.sessionCode, 'Mia');
    await startStudy(leader, created);

    randomCommand(leader, created, 'pick_random', 'pick-1');
    const picked = await leader.waitFor(
      'session_updated',
      (m) => m.command === 'pick_random',
    );
    expect(picked.session.volunteerTurn?.candidateMemberId).toBe(j1.memberId);

    nowMs += 5_000;
    randomCommand(leader, created, 'retry_random', 'retry-1');
    const retried = await leader.waitFor(
      'session_updated',
      (m) => m.command === 'retry_random',
    );
    // Exclusion empties the pool -> full-pool fallback re-picks the same Person.
    expect(retried.session.volunteerTurn?.candidateMemberId).toBe(j1.memberId);
    expect(
      Date.parse(retried.session.volunteerTurn?.candidateExpiresAt ?? ''),
    ).toBe(nowMs + 60_000);

    // Never-deadlock: Retry is valid even after the window elapsed.
    nowMs += 61_000;
    randomCommand(leader, created, 'retry_random', 'retry-2');
    const lateRetry = await leader.waitFor(
      'session_updated',
      (m) => m.command === 'retry_random' && m.requestId === 'retry-2',
    );
    expect(lateRetry.session.volunteerTurn?.candidateMemberId).toBe(j1.memberId);
  }, 15_000);

  it('Scenario 3: the full negative matrix is enforced on the /ws server', async () => {
    const { leader, created } = await createLeader();
    const { participant: p1, joined: j1 } = await joinParticipant(
      created.sessionCode,
      'Mia',
    );

    // (a) Lobby (no open turn yet) -> INVALID_STATE_TRANSITION.
    randomCommand(leader, created, 'pick_random', 'lobby-pick');
    await expectError(leader, 'INVALID_STATE_TRANSITION', 'lobby-pick');
    randomCommand(leader, created, 'confirm_random', 'lobby-confirm');
    await expectError(leader, 'INVALID_STATE_TRANSITION', 'lobby-confirm');

    // (b) Participant callers -> FORBIDDEN_LEADER_ONLY (established block).
    await startStudy(leader, created);
    for (const type of ['pick_random', 'retry_random', 'confirm_random'] as const) {
      randomCommand(
        p1,
        created,
        type,
        `p-${type}`,
      );
      await expectError(p1, 'FORBIDDEN_LEADER_ONLY', `p-${type}`);
    }

    // (c) Wrong leader token -> UNAUTHORIZED_LEADER.
    randomCommand(leader, created, 'pick_random', 'w-pick', {
      leaderToken: 'wrong-token',
    });
    await expectError(leader, 'UNAUTHORIZED_LEADER', 'w-pick');
    randomCommand(leader, created, 'confirm_random', 'w-confirm', {
      leaderToken: 'wrong-token',
    });
    await expectError(leader, 'UNAUTHORIZED_LEADER', 'w-confirm');

    // (d) Outside random_pending: retry/confirm reject, pick re-picks reject.
    randomCommand(leader, created, 'retry_random', 'collect-retry');
    await expectError(leader, 'INVALID_STATE_TRANSITION', 'collect-retry');
    randomCommand(leader, created, 'confirm_random', 'collect-confirm');
    await expectError(leader, 'INVALID_STATE_TRANSITION', 'collect-confirm');

    // (e) During random_pending, pick_random rejects (Retry is the re-roll).
    randomCommand(leader, created, 'pick_random', 'pick-1');
    await leader.waitFor('session_updated', (m) => m.command === 'pick_random');
    randomCommand(leader, created, 'pick_random', 'pending-pick');
    await expectError(leader, 'INVALID_STATE_TRANSITION', 'pending-pick');

    // (f) Confirm after the window elapsed (lazy clock, before any timer) rejects.
    nowMs += 61_000;
    randomCommand(leader, created, 'confirm_random', 'expired-confirm');
    const expired = await expectError(
      leader,
      'INVALID_STATE_TRANSITION',
      'expired-confirm',
    );
    expect(expired.message).toContain('window has expired');

    // (g) Retry after expiry re-stages; then assigned/turn_completed close it.
    randomCommand(leader, created, 'retry_random', 'retry-1');
    await leader.waitFor(
      'session_updated',
      (m) => m.command === 'retry_random' && m.requestId === 'retry-1',
    );
    randomCommand(leader, created, 'confirm_random', 'confirm-1');
    const confirmed = await leader.waitFor(
      'session_updated',
      (m) => m.command === 'confirm_random',
    );
    expect(confirmed.session.volunteerTurn?.selectedMemberId).toBe(j1.memberId);

    // Assigned: pick/retry/confirm all reject (reassignment stays choose_volunteer's job).
    randomCommand(leader, created, 'pick_random', 'assigned-pick');
    await expectError(leader, 'INVALID_STATE_TRANSITION', 'assigned-pick');
    randomCommand(leader, created, 'retry_random', 'assigned-retry');
    await expectError(leader, 'INVALID_STATE_TRANSITION', 'assigned-retry');
    randomCommand(leader, created, 'confirm_random', 'assigned-confirm');
    await expectError(leader, 'INVALID_STATE_TRANSITION', 'assigned-confirm');

    // (h) turn_completed: all three reject.
    p1.send({
      type: 'complete_turn',
      sessionCode: created.sessionCode,
      memberId: j1.memberId,
      requestId: 'done-1',
    });
    await leader.waitFor('session_updated', (m) => m.command === 'complete_turn');
    for (const type of ['pick_random', 'retry_random', 'confirm_random'] as const) {
      randomCommand(leader, created, type, `done-${type}`);
      await expectError(leader, 'INVALID_STATE_TRANSITION', `done-${type}`);
    }

    // (i) Past Section 1 there is no turn -> the shared gate rejects.
    leader.send({
      type: 'next_section',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'next-1',
    });
    await leader.waitFor('session_updated', (m) => m.command === 'next_section');
    randomCommand(leader, created, 'pick_random', 'section-2-pick');
    await expectError(leader, 'INVALID_STATE_TRANSITION', 'section-2-pick');
    randomCommand(leader, created, 'retry_random', 'section-2-retry');
    await expectError(leader, 'INVALID_STATE_TRANSITION', 'section-2-retry');
    randomCommand(leader, created, 'confirm_random', 'section-2-confirm');
    await expectError(leader, 'INVALID_STATE_TRANSITION', 'section-2-confirm');
  }, 20_000);

  it('Scenario 3/4: zero connected Participants rejects the pick and re-roll', async () => {
    const { leader, created } = await createLeader();
    await startStudy(leader, created);

    randomCommand(leader, created, 'pick_random', 'empty-pick');
    const pickError = await expectError(
      leader,
      'INVALID_STATE_TRANSITION',
      'empty-pick',
    );
    expect(pickError.message).toContain('At least one connected Participant');

    // A disconnected-only pool is equally empty for the picker.
    const { participant: p1 } = await joinParticipant(created.sessionCode, 'Mia');
    await p1.close();
    randomCommand(leader, created, 'pick_random', 'disconnected-pick');
    await expectError(leader, 'INVALID_STATE_TRANSITION', 'disconnected-pick');
    randomCommand(leader, created, 'retry_random', 'disconnected-retry');
    await expectError(leader, 'INVALID_STATE_TRANSITION', 'disconnected-retry');
  }, 15_000);

  it('Scenario 5: disconnects and hand churn never corrupt the countdown; snapshots stay clean', async () => {
    const { leader, created } = await createLeader();
    const { participant: p1, joined: j1 } = await joinParticipant(
      created.sessionCode,
      'Mia',
    );
    const { participant: p2 } = await joinParticipant(created.sessionCode, 'Leo');
    await startStudy(leader, created);

    randomCommand(leader, created, 'pick_random', 'pick-1');
    await leader.waitFor('session_updated', (m) => m.command === 'pick_random');

    // Hand churn during random_pending never touches the staged candidate.
    p1.send({
      type: 'raise_hand',
      sessionCode: created.sessionCode,
      memberId: j1.memberId,
      requestId: 'r1',
    });
    const raised = await p2.waitFor(
      'session_updated',
      (m) => m.command === 'raise_hand',
    );
    expect(raised.session.volunteerTurn?.candidateMemberId).toBe(j1.memberId);
    p1.send({
      type: 'lower_hand',
      sessionCode: created.sessionCode,
      memberId: j1.memberId,
      requestId: 'l1',
    });
    const lowered = await leader.waitFor(
      'session_updated',
      (m) => m.command === 'lower_hand',
    );
    expect(lowered.session.volunteerTurn?.candidateMemberId).toBe(j1.memberId);

    // Snapshot hygiene on the live snapshot: secrets + pastoral fields stripped.
    const json = JSON.stringify(lowered.session);
    expect(json).not.toContain('leaderPin');
    expect(json).not.toContain('leaderToken');
    expect(json).not.toContain('reconnectToken');
    expect(json).not.toContain('leaderPrompt');

    // Candidate disconnect never revokes: state persists, marked disconnected.
    await p1.close();
    leader.send({
      type: 'clear_hands',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'clear-1',
    });
    const cleared = await leader.waitFor(
      'session_updated',
      (m) => m.command === 'clear_hands',
    );
    expect(cleared.session.volunteerTurn?.candidateMemberId).toBe(j1.memberId);
    const mia = cleared.session.members.find(
      (member) => member.memberId === j1.memberId,
    );
    expect(mia?.connectionStatus).toBe('disconnected');

    // Reconnect rehydrates the panel from the absolute candidateExpiresAt.
    const reconnectedPeer = await connectPeer();
    reconnectedPeer.send({
      type: 'reconnect_session',
      sessionCode: created.sessionCode,
      memberId: j1.memberId,
      reconnectToken: j1.reconnectToken,
      requestId: 're-1',
    });
    const restored = await reconnectedPeer.waitFor('session_reconnected');
    expect(restored.session.volunteerTurn?.candidateMemberId).toBe(j1.memberId);
    expect(restored.session.volunteerTurn?.candidateExpiresAt).toBeTruthy();

    // Late joiners hydrate the same pending countdown.
    const late = await joinParticipant(created.sessionCode, 'Sam');
    expect(late.joined.session.volunteerTurn?.candidateMemberId).toBe(j1.memberId);

    // The leader can still Confirm the disconnected-then-reconnected candidate.
    randomCommand(leader, created, 'confirm_random', 'confirm-1');
    const confirmed = await leader.waitFor(
      'session_updated',
      (m) => m.command === 'confirm_random',
    );
    expect(confirmed.session.volunteerTurn?.selectedMemberId).toBe(j1.memberId);
    expect(confirmed.session.volunteerTurn?.candidateMemberId).toBeNull();

    // And the chosen volunteer finishes the turn normally.
    reconnectedPeer.send({
      type: 'complete_turn',
      sessionCode: created.sessionCode,
      memberId: j1.memberId,
      requestId: 'done-1',
    });
    const done = await leader.waitFor(
      'session_updated',
      (m) => m.command === 'complete_turn',
    );
    expect(done.session.volunteerTurn?.completedAt).toBeTruthy();
  }, 20_000);

  describe('timer-expiry authority (real timers, fast randomCountdownMs)', () => {
    let fastStore: LiveSessionStore;
    let fastServer: AppServer;
    let fastWsUrl: string;
    let fastPeers: BufferedPeer[];
    let fastConnect: ConnectHarness['connectPeer'];

    beforeEach(async () => {
      fastPeers = [];
      fastStore = new LiveSessionStore({
        now: () => Date.now(),
        sessionTtlMs: DEFAULT_SESSION_TTL_MS,
        sweepIntervalMs: false,
        pickRandomIndex: () => 0,
        randomCountdownMs: 120,
      });
      fastServer = createAppServer({ staticDir: false, sessionStore: fastStore });
      const bound = await fastServer.start(0, '127.0.0.1');
      fastWsUrl = `ws://127.0.0.1:${bound.port}/ws`;
      fastConnect = installConnectPeer(() => fastWsUrl, fastPeers);
    });

    afterEach(async () => {
      await Promise.all(fastPeers.map((peer) => peer.close()));
      await fastServer.close();
      fastStore.dispose();
    });

    it('Scenario 4: the server timer clears the candidate and broadcasts random_expired to everyone', async () => {
      const leader = await fastConnect();
      leader.send({ type: 'create_session', displayName: 'Claire', requestId: 'c1' });
      const created = await leader.waitFor('session_created');
      const p1 = await fastConnect();
      p1.send({
        type: 'join_session',
        sessionCode: created.sessionCode,
        displayName: 'Mia',
        requestId: 'j1',
      });
      const joined = await p1.waitFor('session_joined');
      leader.send({
        type: 'start_study',
        sessionCode: created.sessionCode,
        leaderToken: created.leaderToken,
        memberId: created.memberId,
        requestId: 'start-1',
      });
      await leader.waitFor('session_updated', (m) => m.command === 'start_study');

      leader.send({
        type: 'pick_random',
        sessionCode: created.sessionCode,
        leaderToken: created.leaderToken,
        memberId: created.memberId,
        requestId: 'pick-1',
      });
      const picked = await leader.waitFor(
        'session_updated',
        (m) => m.command === 'pick_random',
      );
      expect(picked.session.volunteerTurn?.candidateMemberId).toBe(
        joined.memberId,
      );

      // The unref'd per-session timer fires on the server clock: every client
      // drops back to collecting_hands.
      const expiredLeader = await leader.waitFor(
        'session_updated',
        (m) => m.command === 'random_expired',
      );
      expect(expiredLeader.session.volunteerTurn?.candidateMemberId).toBeNull();
      expect(expiredLeader.session.volunteerTurn?.candidateExpiresAt).toBeNull();
      expect(expiredLeader.session.volunteerTurn?.selectedMemberId).toBeNull();
      const expiredP1 = await p1.waitFor(
        'session_updated',
        (m) => m.command === 'random_expired',
      );
      expect(expiredP1.session.volunteerTurn?.candidateMemberId).toBeNull();

      // Back to collecting_hands: picking again works.
      leader.send({
        type: 'pick_random',
        sessionCode: created.sessionCode,
        leaderToken: created.leaderToken,
        memberId: created.memberId,
        requestId: 'pick-2',
      });
      const repicked = await leader.waitFor(
        'session_updated',
        (m) => m.command === 'pick_random' && m.requestId === 'pick-2',
      );
      expect(repicked.session.volunteerTurn?.candidateMemberId).toBe(
        joined.memberId,
      );
    }, 15_000);

    it('Scenario 4/5: the expiry timer self-cancels silently once a manual choice supersedes the pick', async () => {
      const leader = await fastConnect();
      leader.send({ type: 'create_session', displayName: 'Claire', requestId: 'c1' });
      const created = await leader.waitFor('session_created');
      const p1 = await fastConnect();
      p1.send({
        type: 'join_session',
        sessionCode: created.sessionCode,
        displayName: 'Mia',
        requestId: 'j1',
      });
      const joined = await p1.waitFor('session_joined');
      leader.send({
        type: 'start_study',
        sessionCode: created.sessionCode,
        leaderToken: created.leaderToken,
        memberId: created.memberId,
        requestId: 'start-1',
      });
      await leader.waitFor('session_updated', (m) => m.command === 'start_study');

      leader.send({
        type: 'pick_random',
        sessionCode: created.sessionCode,
        leaderToken: created.leaderToken,
        memberId: created.memberId,
        requestId: 'pick-1',
      });
      await leader.waitFor('session_updated', (m) => m.command === 'pick_random');

      // The established manual choose supersedes the staged pick byte-identically.
      leader.send({
        type: 'choose_volunteer',
        sessionCode: created.sessionCode,
        leaderToken: created.leaderToken,
        memberId: created.memberId,
        targetMemberId: joined.memberId,
        requestId: 'choose-1',
      });
      const chosen = await leader.waitFor(
        'session_updated',
        (m) => m.command === 'choose_volunteer',
      );
      expect(chosen.session.volunteerTurn?.selectedMemberId).toBe(joined.memberId);

      // Once the stale window elapses there is NO random_expired broadcast:
      // the timer self-cancelled silently and the assigned turn is intact.
      await expectNoRandomExpired(leader, 600);
      expect(chosen.session.volunteerTurn?.completedAt).toBeNull();
    }, 15_000);
  });
});

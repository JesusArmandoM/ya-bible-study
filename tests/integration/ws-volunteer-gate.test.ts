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

describe('WebSocket chosen-volunteer prayer gate (protocol v3)', () => {
  let sessionStore: LiveSessionStore;
  let server: AppServer;
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
    const bound = await server.start(0, '127.0.0.1');
    wsUrl = `ws://127.0.0.1:${bound.port}/ws`;
  });

  afterEach(async () => {
    await Promise.all(openPeers.map((peer) => peer.close()));
    await server.close();
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
    return leader.waitFor(
      'session_updated',
      (msg) => msg.command === 'start_study',
    );
  }

  function chooseVolunteer(
    leader: BufferedPeer,
    created: { sessionCode: string; leaderToken: string; memberId: string },
    targetMemberId: string,
    requestId: string,
    overrides: { leaderToken?: string; memberId?: string } = {},
  ) {
    leader.send({
      type: 'choose_volunteer',
      sessionCode: created.sessionCode,
      leaderToken: overrides.leaderToken ?? created.leaderToken,
      memberId: overrides.memberId ?? created.memberId,
      targetMemberId,
      requestId,
    });
  }

  function overrideTurn(
    leader: BufferedPeer,
    created: { sessionCode: string; leaderToken: string; memberId: string },
    requestId: string,
    overrides: { leaderToken?: string; memberId?: string } = {},
  ) {
    leader.send({
      type: 'override_turn',
      sessionCode: created.sessionCode,
      leaderToken: overrides.leaderToken ?? created.leaderToken,
      memberId: overrides.memberId ?? created.memberId,
      requestId,
    });
  }

  function nextSection(
    leader: BufferedPeer,
    created: { sessionCode: string; leaderToken: string; memberId: string },
    requestId: string,
  ) {
    leader.send({
      type: 'next_section',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId,
    });
  }

  function completeTurn(
    peer: BufferedPeer,
    sessionCode: string,
    memberId: string,
    requestId: string,
  ) {
    peer.send({ type: 'complete_turn', sessionCode, memberId, requestId });
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

  it('Scenario 1-2 happy path: raise -> choose -> Done -> next_section advances', async () => {
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

    p1.send({
      type: 'raise_hand',
      sessionCode: created.sessionCode,
      memberId: j1.memberId,
      requestId: 'r1',
    });
    await p1.waitFor('session_updated', (m) => m.command === 'raise_hand');
    p2.send({
      type: 'raise_hand',
      sessionCode: created.sessionCode,
      memberId: j2.memberId,
      requestId: 'r2',
    });
    await p2.waitFor('session_updated', (m) => m.command === 'raise_hand');

    // Leader chooses P1; every client's snapshot carries the selection.
    chooseVolunteer(leader, created, j1.memberId, 'choose-1');
    const leaderView = await leader.waitFor(
      'session_updated',
      (m) => m.command === 'choose_volunteer',
    );
    expect(leaderView.session.volunteerTurn?.selectedMemberId).toBe(j1.memberId);
    expect(leaderView.session.volunteerTurn?.completedAt).toBeNull();
    const p1View = await p1.waitFor(
      'session_updated',
      (m) => m.command === 'choose_volunteer',
    );
    expect(p1View.session.volunteerTurn?.selectedMemberId).toBe(j1.memberId);
    const p2View = await p2.waitFor(
      'session_updated',
      (m) => m.command === 'choose_volunteer',
    );
    expect(p2View.session.volunteerTurn?.selectedMemberId).toBe(j1.memberId);

    // The chosen volunteer completes the turn; completedAt rides the server clock.
    completeTurn(p1, created.sessionCode, j1.memberId, 'done-1');
    const done = await leader.waitFor(
      'session_updated',
      (m) => m.command === 'complete_turn',
    );
    expect(done.session.volunteerTurn?.selectedMemberId).toBe(j1.memberId);
    expect(done.session.volunteerTurn?.completedAt).toBeTruthy();
    await p2.waitFor('session_updated', (m) => m.command === 'complete_turn');

    // The gate opens: next_section advances to the Section 2 placeholder.
    nextSection(leader, created, 'next-1');
    const advanced = await leader.waitFor(
      'session_updated',
      (m) => m.command === 'next_section',
    );
    expect(advanced.session.currentSectionId).toBe('section_2_icebreaker');
    expect(advanced.session.currentSectionIndex).toBe(1);
    expect(advanced.session.volunteerTurn).toBeNull();
    await p1.waitFor('session_updated', (m) => m.command === 'next_section');
    await p2.waitFor('session_updated', (m) => m.command === 'next_section');
  }, 15_000);

  it('Scenario 3: leader next_section is rejected until completedAt is set', async () => {
    const { leader, created } = await createLeader();
    const { participant: p1, joined: j1 } = await joinParticipant(
      created.sessionCode,
      'Mia',
    );
    await startStudy(leader, created);

    // (a) Nobody chosen yet -> rejected, state unchanged.
    nextSection(leader, created, 'next-a');
    await expectError(leader, 'INVALID_STATE_TRANSITION', 'next-a');

    p1.send({
      type: 'raise_hand',
      sessionCode: created.sessionCode,
      memberId: j1.memberId,
      requestId: 'r1',
    });
    await p1.waitFor('session_updated', (m) => m.command === 'raise_hand');
    chooseVolunteer(leader, created, j1.memberId, 'choose-1');
    await leader.waitFor('session_updated', (m) => m.command === 'choose_volunteer');

    // (b) Chosen but not done -> rejected again.
    nextSection(leader, created, 'next-b');
    await expectError(leader, 'INVALID_STATE_TRANSITION', 'next-b');

    // State unchanged: idempotent same-target re-choose broadcasts Section 1.
    chooseVolunteer(leader, created, j1.memberId, 'choose-idem');
    const unchanged = await leader.waitFor(
      'session_updated',
      (m) => m.command === 'choose_volunteer',
    );
    expect(unchanged.session.currentSectionId).toBe('section_1_prayer');
    expect(unchanged.session.volunteerTurn?.selectedMemberId).toBe(j1.memberId);
    expect(unchanged.session.volunteerTurn?.completedAt).toBeNull();

    // After Done the gate opens.
    completeTurn(p1, created.sessionCode, j1.memberId, 'done-1');
    await leader.waitFor('session_updated', (m) => m.command === 'complete_turn');
    nextSection(leader, created, 'next-c');
    const advanced = await leader.waitFor(
      'session_updated',
      (m) => m.command === 'next_section',
    );
    expect(advanced.session.currentSectionId).toBe('section_2_icebreaker');
  }, 15_000);

  it('Scenario 3: participant leader-commands and wrong tokens are rejected', async () => {
    const { leader, created } = await createLeader();
    const { participant: p1, joined: j1 } = await joinParticipant(
      created.sessionCode,
      'Mia',
    );
    await startStudy(leader, created);

    // Participant next_section -> FORBIDDEN_LEADER_ONLY.
    p1.send({
      type: 'next_section',
      sessionCode: created.sessionCode,
      leaderToken: 'not-a-leader-token',
      memberId: j1.memberId,
      requestId: 'p-next',
    });
    await expectError(p1, 'FORBIDDEN_LEADER_ONLY', 'p-next');

    // Participant choose_volunteer / override_turn -> FORBIDDEN_LEADER_ONLY.
    p1.send({
      type: 'choose_volunteer',
      sessionCode: created.sessionCode,
      leaderToken: 'not-a-leader-token',
      memberId: j1.memberId,
      targetMemberId: j1.memberId,
      requestId: 'p-choose',
    });
    await expectError(p1, 'FORBIDDEN_LEADER_ONLY', 'p-choose');
    p1.send({
      type: 'override_turn',
      sessionCode: created.sessionCode,
      leaderToken: 'not-a-leader-token',
      memberId: j1.memberId,
      requestId: 'p-override',
    });
    await expectError(p1, 'FORBIDDEN_LEADER_ONLY', 'p-override');

    // Wrong-token choose_volunteer / override_turn -> UNAUTHORIZED_LEADER.
    chooseVolunteer(leader, created, j1.memberId, 'w-choose', {
      leaderToken: 'wrong-token',
    });
    await expectError(leader, 'UNAUTHORIZED_LEADER', 'w-choose');
    overrideTurn(leader, created, 'w-override', { leaderToken: 'wrong-token' });
    await expectError(leader, 'UNAUTHORIZED_LEADER', 'w-override');
  }, 15_000);

  it('Scenario 3: complete_turn identity matrix is UNAUTHORIZED_MEMBER', async () => {
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

    // Unbound socket (never joined) -> UNAUTHORIZED_MEMBER.
    const stranger = await connectPeer();
    completeTurn(stranger, created.sessionCode, j1.memberId, 'unbound-1');
    await expectError(stranger, 'UNAUTHORIZED_MEMBER', 'unbound-1');

    // Spoofed memberId on a bound socket -> UNAUTHORIZED_MEMBER.
    completeTurn(p1, created.sessionCode, j2.memberId, 'spoof-1');
    await expectError(p1, 'UNAUTHORIZED_MEMBER', 'spoof-1');

    // Study Leader caller -> UNAUTHORIZED_MEMBER.
    completeTurn(leader, created.sessionCode, created.memberId, 'leader-1');
    await expectError(leader, 'UNAUTHORIZED_MEMBER', 'leader-1');

    // Before any choose_volunteer: nobody is the chosen volunteer.
    completeTurn(p1, created.sessionCode, j1.memberId, 'pre-choose');
    await expectError(p1, 'UNAUTHORIZED_MEMBER', 'pre-choose');

    // After choosing P1: the non-selected member stays UNAUTHORIZED_MEMBER.
    chooseVolunteer(leader, created, j1.memberId, 'choose-1');
    await leader.waitFor('session_updated', (m) => m.command === 'choose_volunteer');
    completeTurn(p2, created.sessionCode, j2.memberId, 'bystander-1');
    await expectError(p2, 'UNAUTHORIZED_MEMBER', 'bystander-1');
  }, 15_000);

  it('Scenario 3: complete_turn outside the Section 1 turn is INVALID_STATE_TRANSITION', async () => {
    const { leader, created } = await createLeader();
    const { participant: p1, joined: j1 } = await joinParticipant(
      created.sessionCode,
      'Mia',
    );

    // In the lobby (no volunteer turn yet) -> INVALID_STATE_TRANSITION.
    completeTurn(p1, created.sessionCode, j1.memberId, 'lobby-1');
    await expectError(p1, 'INVALID_STATE_TRANSITION', 'lobby-1');

    await startStudy(leader, created);
    chooseVolunteer(leader, created, j1.memberId, 'choose-1');
    await leader.waitFor('session_updated', (m) => m.command === 'choose_volunteer');
    completeTurn(p1, created.sessionCode, j1.memberId, 'done-1');
    await leader.waitFor('session_updated', (m) => m.command === 'complete_turn');

    // Already completed by the chosen volunteer: idempotent no-op broadcast.
    completeTurn(p1, created.sessionCode, j1.memberId, 'done-again');
    const noOp = await p1.waitFor(
      'session_updated',
      (m) => m.command === 'complete_turn' && m.requestId === 'done-again',
    );
    expect(noOp.session.volunteerTurn?.selectedMemberId).toBe(j1.memberId);
    expect(noOp.session.volunteerTurn?.completedAt).toBeTruthy();

    // After advancing past Section 1 the turn is gone -> INVALID_STATE_TRANSITION.
    nextSection(leader, created, 'next-1');
    await leader.waitFor('session_updated', (m) => m.command === 'next_section');
    completeTurn(p1, created.sessionCode, j1.memberId, 'after-1');
    await expectError(p1, 'INVALID_STATE_TRANSITION', 'after-1');
  }, 15_000);

  it('Scenario 3: choose_volunteer target validation and reassignment rules', async () => {
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

    // Unknown target -> INVALID_MESSAGE.
    chooseVolunteer(leader, created, 'no-such-member', 'bad-1');
    await expectError(leader, 'INVALID_MESSAGE', 'bad-1');

    // Leader target -> INVALID_MESSAGE (choosing the leader is invalid).
    chooseVolunteer(leader, created, created.memberId, 'bad-2');
    await expectError(leader, 'INVALID_MESSAGE', 'bad-2');

    // Assign P1, then reassign to P2: the prior selection is revoked.
    chooseVolunteer(leader, created, j1.memberId, 'choose-1');
    await leader.waitFor('session_updated', (m) => m.command === 'choose_volunteer');
    chooseVolunteer(leader, created, j2.memberId, 'choose-2');
    const reassigned = await leader.waitFor(
      'session_updated',
      (m) => m.command === 'choose_volunteer' && m.requestId === 'choose-2',
    );
    expect(reassigned.session.volunteerTurn?.selectedMemberId).toBe(j2.memberId);

    // The revoked volunteer's Done now rejects.
    completeTurn(p1, created.sessionCode, j1.memberId, 'revoked-1');
    await expectError(p1, 'UNAUTHORIZED_MEMBER', 'revoked-1');

    // The new chosen volunteer completes normally.
    completeTurn(p2, created.sessionCode, j2.memberId, 'done-2');
    await leader.waitFor('session_updated', (m) => m.command === 'complete_turn');

    // After turn_completed, choose_volunteer -> INVALID_STATE_TRANSITION.
    chooseVolunteer(leader, created, j1.memberId, 'late-choose');
    await expectError(leader, 'INVALID_STATE_TRANSITION', 'late-choose');
  }, 15_000);

  it('Scenario 4: override_turn never deadlocks and never revokes', async () => {
    const { leader, created } = await createLeader();
    const { participant: p1, joined: j1 } = await joinParticipant(
      created.sessionCode,
      'Mia',
    );
    await startStudy(leader, created);

    // From collecting_hands (nobody chosen): unlock with selectedMemberId null.
    overrideTurn(leader, created, 'override-1');
    const unlocked = await leader.waitFor(
      'session_updated',
      (m) => m.command === 'override_turn',
    );
    expect(unlocked.session.volunteerTurn?.completedAt).toBeTruthy();
    expect(unlocked.session.volunteerTurn?.selectedMemberId).toBeNull();

    // Override after completion -> INVALID_STATE_TRANSITION.
    overrideTurn(leader, created, 'override-again');
    await expectError(leader, 'INVALID_STATE_TRANSITION', 'override-again');

    // next_section now advances (never-deadlock guarantee).
    nextSection(leader, created, 'next-1');
    const advanced = await leader.waitFor(
      'session_updated',
      (m) => m.command === 'next_section',
    );
    expect(advanced.session.currentSectionId).toBe('section_2_icebreaker');

    // From assigned: override keeps the existing selection (never revokes).
    const second = await createLeader();
    const { participant: q1, joined: qj1 } = await joinParticipant(
      second.created.sessionCode,
      'Nora',
    );
    await startStudy(second.leader, second.created);
    q1.send({
      type: 'raise_hand',
      sessionCode: second.created.sessionCode,
      memberId: qj1.memberId,
      requestId: 'rq',
    });
    await q1.waitFor('session_updated', (m) => m.command === 'raise_hand');
    chooseVolunteer(second.leader, second.created, qj1.memberId, 'choose-q');
    await second.leader.waitFor(
      'session_updated',
      (m) => m.command === 'choose_volunteer',
    );
    overrideTurn(second.leader, second.created, 'override-q');
    const kept = await second.leader.waitFor(
      'session_updated',
      (m) => m.command === 'override_turn',
    );
    expect(kept.session.volunteerTurn?.completedAt).toBeTruthy();
    expect(kept.session.volunteerTurn?.selectedMemberId).toBe(qj1.memberId);
  }, 20_000);

  it('Scenario 5: selection survives reconnects and hand churn; secrets stay stripped', async () => {
    const { leader, created } = await createLeader();
    const { participant: p1, joined: j1 } = await joinParticipant(
      created.sessionCode,
      'Mia',
    );
    await startStudy(leader, created);

    p1.send({
      type: 'raise_hand',
      sessionCode: created.sessionCode,
      memberId: j1.memberId,
      requestId: 'r1',
    });
    await p1.waitFor('session_updated', (m) => m.command === 'raise_hand');
    chooseVolunteer(leader, created, j1.memberId, 'choose-1');
    await leader.waitFor('session_updated', (m) => m.command === 'choose_volunteer');

    // Hand churn never revokes: lower_hand and clear_hands keep the selection.
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
    expect(lowered.session.volunteerTurn?.selectedMemberId).toBe(j1.memberId);
    expect(lowered.session.volunteerTurn?.completedAt).toBeNull();
    expect(lowered.session.volunteerTurn?.raisedHands).toEqual([]);

    p1.send({
      type: 'raise_hand',
      sessionCode: created.sessionCode,
      memberId: j1.memberId,
      requestId: 'r2',
    });
    await p1.waitFor('session_updated', (m) => m.command === 'raise_hand');
    leader.send({
      type: 'clear_hands',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      targetMemberId: j1.memberId,
      requestId: 'clear-1',
    });
    const cleared = await leader.waitFor(
      'session_updated',
      (m) => m.command === 'clear_hands',
    );
    expect(cleared.session.volunteerTurn?.selectedMemberId).toBe(j1.memberId);
    expect(cleared.session.volunteerTurn?.raisedHands).toEqual([]);

    // Snapshot hygiene: secrets stripped, candidate fields untouched.
    const json = JSON.stringify(cleared.session);
    expect(json).not.toContain('leaderPin');
    expect(json).not.toContain('leaderToken');
    expect(json).not.toContain('reconnectToken');
    expect(json).not.toContain('leaderPrompt');
    expect(cleared.session.volunteerTurn?.candidateMemberId).toBeNull();
    expect(cleared.session.volunteerTurn?.candidateExpiresAt).toBeNull();

    // Reconnect restores the assigned turn (session state, not socket state).
    await p1.close();
    const reconnectedPeer = await connectPeer();
    reconnectedPeer.send({
      type: 'reconnect_session',
      sessionCode: created.sessionCode,
      memberId: j1.memberId,
      reconnectToken: j1.reconnectToken,
      requestId: 're-1',
    });
    const restored = await reconnectedPeer.waitFor('session_reconnected');
    expect(restored.session.volunteerTurn?.selectedMemberId).toBe(j1.memberId);
    expect(restored.session.volunteerTurn?.completedAt).toBeNull();

    // Late joiners hydrate the same phase.
    const late = await joinParticipant(created.sessionCode, 'Sam');
    expect(late.joined.session.volunteerTurn?.selectedMemberId).toBe(j1.memberId);

    // The reconnected chosen volunteer can still complete the turn.
    completeTurn(reconnectedPeer, created.sessionCode, j1.memberId, 'done-1');
    const done = await leader.waitFor(
      'session_updated',
      (m) => m.command === 'complete_turn',
    );
    expect(done.session.volunteerTurn?.completedAt).toBeTruthy();
  }, 20_000);
});

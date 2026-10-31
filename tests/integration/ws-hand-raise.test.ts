import { WebSocket } from 'ws';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LiveSessionStore } from '../../src/server/sessionStore';
import { createAppServer, type AppServer } from '../../src/server/app';
import {
  DEFAULT_SESSION_TTL_MS,
  SESSION_PROTOCOL_VERSION,
  type ClientWsMessage,
  type ServerWsMessage,
  type SessionOpeningPrayerContent,
  type SessionStudySummary,
} from '../../src/shared/session';

interface BufferedPeer {
  send: (payload: ClientWsMessage) => void;
  waitFor: <T extends ServerWsMessage['type']>(
    type: T,
    predicate?: (msg: Extract<ServerWsMessage, { type: T }>) => boolean,
  ) => Promise<Extract<ServerWsMessage, { type: T }>>;
  close: () => Promise<void>;
}

function createStudySummary(): SessionStudySummary {
  return {
    title: 'Great Is Your Faith',
    subtitle: 'From persistence to trust',
    liturgicalEyebrow: 'Gospel Reading',
    gospelCitation: 'Matthew 15:21–28',
    gospelSummaryLabel: 'Gospel of Matthew 15:21–28',
    sectionCount: 5,
    estimatedMinutes: 45,
  };
}

const OPENING_PRAYER: SessionOpeningPrayerContent = {
  title: 'Opening Prayer',
  eyebrow: 'MOMENT',
  durationLabel: '5 min',
  suggestedPrayerText: 'Lord, gather us in prayer and open our hearts.',
  participantPrompt: 'Tap Raise Hand if you would like to open in prayer.',
  chosenVolunteerInstruction: 'When you finish, tap "Done".',
};

function summaryWithOpeningPrayer(
  openingPrayer: Record<string, unknown> | null,
): SessionStudySummary {
  return {
    ...createStudySummary(),
    ...(openingPrayer === null ? {} : { openingPrayer }),
  } as unknown as SessionStudySummary;
}

describe('WebSocket hand-raise / volunteer turn lifecycle (protocol v3)', () => {
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

  function raiseHand(
    peer: BufferedPeer,
    sessionCode: string,
    memberId: string,
    requestId: string,
  ) {
    peer.send({ type: 'raise_hand', sessionCode, memberId, requestId });
  }

  it('creates the Section 1 turn on start_study and fans out raises to every client', async () => {
    const { leader, created } = await createLeader();
    const { participant: p1, joined: j1 } = await joinParticipant(
      created.sessionCode,
      'Blake',
    );
    const { participant: p2, joined: j2 } = await joinParticipant(
      created.sessionCode,
      'Cameron',
    );

    const started = await startStudy(leader, created);
    expect(started.session.currentSectionId).toBe('section_1_prayer');
    expect(started.session.volunteerTurn?.sectionId).toBe('section_1_prayer');
    expect(started.session.volunteerTurn?.mode).toBe('gated_prayer');
    expect(started.session.volunteerTurn?.raisedHands).toEqual([]);
    expect(started.session.protocolVersion).toBe(SESSION_PROTOCOL_VERSION);

    raiseHand(p1, created.sessionCode, j1.memberId, 'raise-1');
    const echoed = await p1.waitFor(
      'session_updated',
      (msg) => msg.command === 'raise_hand',
    );
    // requestId echoes to the requester for uniform ack + resync.
    expect(echoed.requestId).toBe('raise-1');
    expect(echoed.session.volunteerTurn?.raisedHands).toEqual([
      { memberId: j1.memberId, raisedAt: expect.any(String) },
    ]);
    expect(
      Date.parse(echoed.session.volunteerTurn!.raisedHands[0]!.raisedAt),
    ).not.toBeNaN();

    // Fan-out: the Study Leader and the other Participant see the same queue.
    const leaderView = await leader.waitFor(
      'session_updated',
      (msg) => msg.command === 'raise_hand',
    );
    expect(leaderView.session.volunteerTurn?.raisedHands[0]?.memberId).toBe(
      j1.memberId,
    );
    const p2View = await p2.waitFor(
      'session_updated',
      (msg) => msg.command === 'raise_hand',
    );
    expect(p2View.session.volunteerTurn?.raisedHands[0]?.memberId).toBe(
      j1.memberId,
    );

    // Reserved follow-up fields stay null in every flow of this feature.
    for (const view of [echoed, leaderView, p2View]) {
      expect(view.session.volunteerTurn?.candidateMemberId).toBeNull();
      expect(view.session.volunteerTurn?.candidateExpiresAt).toBeNull();
      expect(view.session.volunteerTurn?.selectedMemberId).toBeNull();
      expect(view.session.volunteerTurn?.completedAt).toBeNull();
    }

    // Snapshots keep stripping every secret.
    for (const view of [echoed, leaderView, p2View]) {
      const json = JSON.stringify(view.session);
      expect(json).not.toContain(created.leaderPin);
      expect(json).not.toContain(created.leaderToken);
      expect(json).not.toContain(j1.reconnectToken);
      expect(json).not.toContain(j2.reconnectToken);
    }
  });

  it('is idempotent over the wire: duplicate raises never duplicate or reorder, re-raise appends fresh', async () => {
    const { leader, created } = await createLeader();
    const { participant: p1, joined: j1 } = await joinParticipant(
      created.sessionCode,
      'Blake',
    );
    const { participant: p2, joined: j2 } = await joinParticipant(
      created.sessionCode,
      'Cameron',
    );
    await startStudy(leader, created);

    // Queue order: participant 2, then participant 1.
    raiseHand(p2, created.sessionCode, j2.memberId, 'raise-p2');
    await p2.waitFor('session_updated', (m) => m.command === 'raise_hand');
    raiseHand(p1, created.sessionCode, j1.memberId, 'raise-p1');
    const ordered = await p1.waitFor(
      'session_updated',
      (m) => m.command === 'raise_hand' && m.session.volunteerTurn?.raisedHands.length === 2,
    );
    expect(
      ordered.session.volunteerTurn?.raisedHands.map((e) => e.memberId),
    ).toEqual([j2.memberId, j1.memberId]);
    const originalP2RaisedAt = ordered.session.volunteerTurn!.raisedHands[0]?.raisedAt;

    // Duplicate raise while raised: one row, same position, same raisedAt.
    raiseHand(p2, created.sessionCode, j2.memberId, 'raise-p2-again');
    const duplicate = await p2.waitFor(
      'session_updated',
      (m) => m.command === 'raise_hand' && m.requestId === 'raise-p2-again',
    );
    expect(
      duplicate.session.volunteerTurn?.raisedHands.map((e) => e.memberId),
    ).toEqual([j2.memberId, j1.memberId]);
    expect(duplicate.session.volunteerTurn?.raisedHands[0]?.raisedAt).toBe(
      originalP2RaisedAt,
    );

    // Lower participant 2, then a repeated lower is a harmless no-op broadcast.
    p2.send({
      type: 'lower_hand',
      sessionCode: created.sessionCode,
      memberId: j2.memberId,
      requestId: 'lower-p2',
    });
    const lowered = await p2.waitFor(
      'session_updated',
      (m) => m.command === 'lower_hand',
    );
    expect(lowered.requestId).toBe('lower-p2');
    expect(
      lowered.session.volunteerTurn?.raisedHands.map((e) => e.memberId),
    ).toEqual([j1.memberId]);

    p2.send({
      type: 'lower_hand',
      sessionCode: created.sessionCode,
      memberId: j2.memberId,
      requestId: 'lower-p2-again',
    });
    const noOp = await p2.waitFor(
      'session_updated',
      (m) => m.command === 'lower_hand',
    );
    expect(noOp.requestId).toBe('lower-p2-again');
    expect(
      noOp.session.volunteerTurn?.raisedHands.map((e) => e.memberId),
    ).toEqual([j1.memberId]);

    // Re-raise appends at the end with a fresh server-clock raisedAt.
    raiseHand(p2, created.sessionCode, j2.memberId, 'raise-p2-final');
    const reRaised = await p2.waitFor(
      'session_updated',
      (m) => m.command === 'raise_hand' && m.requestId === 'raise-p2-final',
    );
    expect(
      reRaised.session.volunteerTurn?.raisedHands.map((e) => e.memberId),
    ).toEqual([j1.memberId, j2.memberId]);
    expect(reRaised.session.volunteerTurn?.raisedHands[1]?.raisedAt).not.toBe(
      originalP2RaisedAt,
    );
  });

  it('rejects spoofed, unbound, and Study Leader raises with UNAUTHORIZED_MEMBER', async () => {
    const { leader, created } = await createLeader();
    const { participant: p1, joined: j1 } = await joinParticipant(
      created.sessionCode,
      'Blake',
    );
    const { participant: p2, joined: j2 } = await joinParticipant(
      created.sessionCode,
      'Cameron',
    );
    await startStudy(leader, created);

    // Foreign memberId (spoofing another Participant).
    raiseHand(p1, created.sessionCode, j2.memberId, 'raise-spoofed');
    const spoofed = await p1.waitFor('session_error');
    expect(spoofed.requestId).toBe('raise-spoofed');
    expect(spoofed.code).toBe('UNAUTHORIZED_MEMBER');

    // Unbound socket claiming a real memberId.
    const unbound = await connectPeer();
    unbound.send({
      type: 'raise_hand',
      sessionCode: created.sessionCode,
      memberId: j1.memberId,
      requestId: 'raise-unbound',
    });
    const unboundError = await unbound.waitFor('session_error');
    expect(unboundError.requestId).toBe('raise-unbound');
    expect(unboundError.code).toBe('UNAUTHORIZED_MEMBER');

    // The Study Leader can never raise a hand.
    leader.send({
      type: 'raise_hand',
      sessionCode: created.sessionCode,
      memberId: created.memberId,
      requestId: 'raise-leader',
    });
    const leaderError = await leader.waitFor('session_error');
    expect(leaderError.requestId).toBe('raise-leader');
    expect(leaderError.code).toBe('UNAUTHORIZED_MEMBER');

    // No hand ever landed; every raise was rejected server-side.
    p1.send({
      type: 'lower_hand',
      sessionCode: created.sessionCode,
      memberId: j1.memberId,
      requestId: 'check-empty',
    });
    const view = await p1.waitFor(
      'session_updated',
      (m) => m.command === 'lower_hand',
    );
    expect(view.session.volunteerTurn?.raisedHands).toEqual([]);
  });

  it('gates hand raises on Section 1 state: INVALID_STATE_TRANSITION before start and after next_section', async () => {
    const { leader, created } = await createLeader();
    const { participant: p1, joined: j1 } = await joinParticipant(
      created.sessionCode,
      'Blake',
    );

    // In the lobby (before start_study).
    leader.send({
      type: 'open_lobby',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'lobby-1',
    });
    await leader.waitFor('session_updated', (m) => m.command === 'open_lobby');

    raiseHand(p1, created.sessionCode, j1.memberId, 'raise-in-lobby');
    const lobbyError = await p1.waitFor('session_error');
    expect(lobbyError.requestId).toBe('raise-in-lobby');
    expect(lobbyError.code).toBe('INVALID_STATE_TRANSITION');

    // Accepted during Section 1.
    await startStudy(leader, created);
    raiseHand(p1, created.sessionCode, j1.memberId, 'raise-in-section-1');
    const accepted = await p1.waitFor(
      'session_updated',
      (m) => m.command === 'raise_hand',
    );
    expect(accepted.session.volunteerTurn?.raisedHands).toHaveLength(1);

    // After next_section leaves Section 1 the Section 1 turn is replaced by the
    // fresh Section 2 open-share turn and Section 1 raises no longer apply.
    // Compat edit (section-1-chosen-volunteer-prayer-gate): the Section 1
    // next_section gate now requires volunteerTurn.completedAt, so the leader
    // completes the turn via override_turn first. All assertions unchanged.
    // Compat edit (section-2-icebreaker-flow): next_section into Section 2 now
    // creates a fresh open-share turn (raises are the Section 2 interaction),
    // so the former `volunteerTurn toBeNull()` / rejection assertions moved to
    // after the second next_section into section_3_reading, where the turn is
    // cleared and raises reject again. Rejection codes and requestId routing
    // asserted unchanged.
    leader.send({
      type: 'override_turn',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'override-before-next',
    });
    await leader.waitFor(
      'session_updated',
      (m) => m.command === 'override_turn',
    );

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
    expect(advanced.session.currentSectionId).not.toBe('section_1_prayer');
    expect(advanced.session.currentSectionId).toBe('section_2_icebreaker');
    expect(advanced.session.volunteerTurn).toEqual({
      sectionId: 'section_2_icebreaker',
      mode: 'open_share',
      raisedHands: [],
      candidateMemberId: null,
      candidateExpiresAt: null,
      selectedMemberId: null,
      completedAt: null,
    });

    // Section 2 accepts raises (and lowers) on the fresh open-share turn.
    raiseHand(p1, created.sessionCode, j1.memberId, 'raise-in-section-2');
    const acceptedIn2 = await p1.waitFor(
      'session_updated',
      (m) => m.command === 'raise_hand',
    );
    expect(acceptedIn2.session.volunteerTurn?.raisedHands).toHaveLength(1);
    p1.send({
      type: 'lower_hand',
      sessionCode: created.sessionCode,
      memberId: j1.memberId,
      requestId: 'lower-in-section-2',
    });
    const loweredIn2 = await p1.waitFor(
      'session_updated',
      (m) => m.command === 'lower_hand',
    );
    expect(loweredIn2.session.volunteerTurn?.raisedHands).toEqual([]);

    // Leaving Section 2 clears the turn and raises reject again.
    leader.send({
      type: 'next_section',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'next-2',
    });
    const cleared = await leader.waitFor(
      'session_updated',
      (m) => m.command === 'next_section',
    );
    expect(cleared.session.currentSectionId).not.toBe('section_2_icebreaker');
    expect(cleared.session.volunteerTurn).toBeNull();

    raiseHand(p1, created.sessionCode, j1.memberId, 'raise-after-next');
    const afterError = await p1.waitFor('session_error');
    expect(afterError.requestId).toBe('raise-after-next');
    expect(afterError.code).toBe('INVALID_STATE_TRANSITION');

    p1.send({
      type: 'lower_hand',
      sessionCode: created.sessionCode,
      memberId: j1.memberId,
      requestId: 'lower-after-next',
    });
    const lowerError = await p1.waitFor('session_error');
    expect(lowerError.requestId).toBe('lower-after-next');
    expect(lowerError.code).toBe('INVALID_STATE_TRANSITION');
  });

  it('keeps clear_hands leader-gated, targeted, and idempotent', async () => {
    const { leader, created } = await createLeader();
    const { participant: p1, joined: j1 } = await joinParticipant(
      created.sessionCode,
      'Blake',
    );
    const { participant: p2, joined: j2 } = await joinParticipant(
      created.sessionCode,
      'Cameron',
    );
    await startStudy(leader, created);

    raiseHand(p1, created.sessionCode, j1.memberId, 'raise-p1');
    await p1.waitFor('session_updated', (m) => m.command === 'raise_hand');
    raiseHand(p2, created.sessionCode, j2.memberId, 'raise-p2');
    await p2.waitFor('session_updated', (m) => m.command === 'raise_hand');

    // A Participant cannot manage the queue.
    p1.send({
      type: 'clear_hands',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: j1.memberId,
      requestId: 'clear-participant',
    });
    const forbidden = await p1.waitFor('session_error');
    expect(forbidden.requestId).toBe('clear-participant');
    expect(forbidden.code).toBe('FORBIDDEN_LEADER_ONLY');

    // A wrong leaderToken is rejected before any state change.
    leader.send({
      type: 'clear_hands',
      sessionCode: created.sessionCode,
      leaderToken: `${created.leaderToken}-wrong`,
      memberId: created.memberId,
      requestId: 'clear-wrong-token',
    });
    const unauthorized = await leader.waitFor('session_error');
    expect(unauthorized.requestId).toBe('clear-wrong-token');
    expect(unauthorized.code).toBe('UNAUTHORIZED_LEADER');

    // An unknown targetMemberId is a malformed request.
    leader.send({
      type: 'clear_hands',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      targetMemberId: 'no-such-member',
      requestId: 'clear-unknown',
    });
    const invalid = await leader.waitFor('session_error');
    expect(invalid.requestId).toBe('clear-unknown');
    expect(invalid.code).toBe('INVALID_MESSAGE');

    // Targeted clear removes only that row on every client.
    leader.send({
      type: 'clear_hands',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      targetMemberId: j1.memberId,
      requestId: 'clear-targeted',
    });
    const targeted = await p1.waitFor(
      'session_updated',
      (m) => m.command === 'clear_hands',
    );
    expect(targeted.requestId).toBeUndefined();
    expect(
      targeted.session.volunteerTurn?.raisedHands.map((e) => e.memberId),
    ).toEqual([j2.memberId]);

    // Clearing an already-lowered hand is an idempotent no-op broadcast.
    leader.send({
      type: 'clear_hands',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      targetMemberId: j1.memberId,
      requestId: 'clear-targeted-again',
    });
    const noOpTarget = await leader.waitFor(
      'session_updated',
      (m) => m.command === 'clear_hands' && m.requestId === 'clear-targeted-again',
    );
    expect(noOpTarget.requestId).toBe('clear-targeted-again');
    expect(
      noOpTarget.session.volunteerTurn?.raisedHands.map((e) => e.memberId),
    ).toEqual([j2.memberId]);

    // Clear-all empties the queue everywhere.
    leader.send({
      type: 'clear_hands',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'clear-all',
    });
    const clearedAll = await p2.waitFor(
      'session_updated',
      (m) =>
        m.command === 'clear_hands' &&
        m.session.volunteerTurn?.raisedHands.length === 0,
    );
    expect(clearedAll.session.volunteerTurn?.raisedHands).toEqual([]);

    // Clear-all on an empty queue is still a harmless no-op broadcast.
    leader.send({
      type: 'clear_hands',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'clear-all-again',
    });
    const noOpAll = await leader.waitFor(
      'session_updated',
      (m) => m.command === 'clear_hands' && m.requestId === 'clear-all-again',
    );
    expect(noOpAll.requestId).toBe('clear-all-again');
    expect(noOpAll.session.volunteerTurn?.raisedHands).toEqual([]);
  });

  it('restores raised hands across reconnect and late joins from deep-copied snapshots', async () => {
    const { leader, created } = await createLeader();
    const { participant: p1, joined: j1 } = await joinParticipant(
      created.sessionCode,
      'Blake',
    );
    await startStudy(leader, created);

    raiseHand(p1, created.sessionCode, j1.memberId, 'raise-p1');
    const raised = await p1.waitFor(
      'session_updated',
      (m) => m.command === 'raise_hand',
    );

    // Raised hands are session state, not socket state: they survive a drop.
    await p1.close();

    // Reconnect restores the exact volunteerTurn (order + raisedAt intact).
    const reconnected = await connectPeer();
    reconnected.send({
      type: 'reconnect_session',
      sessionCode: created.sessionCode,
      memberId: j1.memberId,
      reconnectToken: j1.reconnectToken,
      requestId: 'rc-1',
    });
    const resumed = await reconnected.waitFor('session_reconnected');
    expect(resumed.session.volunteerTurn?.raisedHands).toEqual(
      raised.session.volunteerTurn?.raisedHands,
    );

    // Late joiners receive the live turn state in session_joined.
    const { participant: late, joined: lateJoined } = await joinParticipant(
      created.sessionCode,
      'Dana',
    );
    expect(lateJoined.session.volunteerTurn?.raisedHands).toEqual(
      raised.session.volunteerTurn?.raisedHands,
    );

    // Snapshots are deep copies: client mutation cannot corrupt the queue.
    if (lateJoined.session.volunteerTurn) {
      lateJoined.session.volunteerTurn.raisedHands.push({
        memberId: 'injected',
        raisedAt: '2026-10-29T19:00:00.000Z',
      });
    }
    const { joined: afterMutation } = await joinParticipant(
      created.sessionCode,
      'Elliot',
    );
    expect(
      afterMutation.session.volunteerTurn?.raisedHands.map((e) => e.memberId),
    ).toEqual([j1.memberId]);

    // And only lower/clear removes a raised hand: lowering works after reconnect.
    reconnected.send({
      type: 'lower_hand',
      sessionCode: created.sessionCode,
      memberId: j1.memberId,
      requestId: 'lower-after-reconnect',
    });
    const lowered = await late.waitFor(
      'session_updated',
      (m) => m.command === 'lower_hand',
    );
    expect(lowered.session.volunteerTurn?.raisedHands).toEqual([]);
  });

  it('validates the additive study.openingPrayer field and keeps pastoral copy off the wire', async () => {
    const { leader, created } = await createLeader();

    // A summary with a fully valid openingPrayer is accepted and sanitized.
    const smuggled = {
      ...OPENING_PRAYER,
      leaderPrompt: 'SMUGGLED FACILITATOR COPY',
    };
    leader.send({
      type: 'load_study',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'ls-prayer',
      study: summaryWithOpeningPrayer(smuggled),
    });
    const accepted = await leader.waitFor(
      'session_updated',
      (msg) => msg.command === 'load_study',
    );
    expect(accepted.session.study?.openingPrayer).toMatchObject({
      title: 'Opening Prayer',
      eyebrow: 'MOMENT',
      durationLabel: '5 min',
      suggestedPrayerText: OPENING_PRAYER.suggestedPrayerText,
      participantPrompt: OPENING_PRAYER.participantPrompt,
      chosenVolunteerInstruction: OPENING_PRAYER.chosenVolunteerInstruction,
    });
    const acceptedJson = JSON.stringify(accepted.session.study);
    expect(acceptedJson).not.toContain('leaderPrompt');
    expect(acceptedJson).not.toContain('SMUGGLED FACILITATOR COPY');

    // A present-but-invalid openingPrayer rejects with INVALID_MESSAGE.
    leader.send({
      type: 'load_study',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'ls-prayer-bad',
      study: summaryWithOpeningPrayer({
        ...OPENING_PRAYER,
        suggestedPrayerText: 'x'.repeat(2001),
      }),
    });
    const invalid = await leader.waitFor('session_error');
    expect(invalid.requestId).toBe('ls-prayer-bad');
    expect(invalid.code).toBe('INVALID_MESSAGE');

    // A missing openingPrayer stays valid (backward compat) and syncs as null.
    leader.send({
      type: 'load_study',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'ls-prayer-missing',
      study: createStudySummary(),
    });
    const missing = await leader.waitFor(
      'session_updated',
      (msg) => msg.command === 'load_study' && msg.requestId === 'ls-prayer-missing',
    );
    expect(missing.session.study?.openingPrayer).toBeNull();

    // Serialised snapshots carry neither secrets nor pastoral fields.
    const json = JSON.stringify(missing.session);
    expect(json).not.toContain(created.leaderPin);
    expect(json).not.toContain(created.leaderToken);
    expect(json).not.toContain(created.reconnectToken);
    expect(json).not.toContain('leaderNote');
  });
});

import { WebSocket } from 'ws';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LiveSessionStore } from '../../src/server/sessionStore';
import { createAppServer, type AppServer } from '../../src/server/app';
import {
  DEFAULT_SESSION_TTL_MS,
  type ClientWsMessage,
  type ServerWsMessage,
  type SessionStudySummary,
} from '../../src/shared/session';
import { getDefaultStudyDocument } from '../../src/server/studies/greatIsYourFaithSeed';

interface BufferedPeer {
  send: (payload: ClientWsMessage) => void;
  waitFor: <T extends ServerWsMessage['type']>(
    type: T,
    predicate?: (msg: Extract<ServerWsMessage, { type: T }>) => boolean,
  ) => Promise<Extract<ServerWsMessage, { type: T }>>;
  close: () => Promise<void>;
}

const SEED_ICEBREAKER = getDefaultStudyDocument().icebreaker;

const ICEBREAKER_SUMMARY_FIELDS = {
  title: SEED_ICEBREAKER.title,
  eyebrow: SEED_ICEBREAKER.eyebrow,
  durationLabel: SEED_ICEBREAKER.durationLabel,
  introText: SEED_ICEBREAKER.introText,
  mainQuestion: SEED_ICEBREAKER.mainQuestion,
  followUpQuestion: SEED_ICEBREAKER.followUpQuestion,
};

function createStudySummary(): SessionStudySummary {
  return {
    title: 'Great Is Your Faith',
    subtitle: 'From persistence to trust',
    liturgicalEyebrow: 'Gospel Reading',
    gospelCitation: 'Matthew 15:21–28',
    gospelSummaryLabel: 'Gospel of Matthew 15:21–28',
    sectionCount: 5,
    estimatedMinutes: 45,
    icebreaker: ICEBREAKER_SUMMARY_FIELDS,
  };
}

function summaryWithIcebreaker(
  icebreaker: Record<string, unknown> | null,
): SessionStudySummary {
  return {
    ...createStudySummary(),
    ...(icebreaker === null ? { icebreaker: undefined } : { icebreaker }),
  } as unknown as SessionStudySummary;
}

describe('WebSocket Section 2 icebreaker open-share turn (protocol v3)', () => {
  let sessionStore: LiveSessionStore;
  let server: AppServer;
  let wsUrl: string;
  let openPeers: BufferedPeer[];
  /** Raw JSON of every server frame, for whole-conversation privacy scans. */
  let capturedFrames: string[];

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
      const raw = String(data);
      capturedFrames.push(raw);
      received.push(JSON.parse(raw) as ServerWsMessage);
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
    capturedFrames = [];
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

  type LeaderHandle = {
    sessionCode: string;
    leaderToken: string;
    memberId: string;
    leaderPin: string;
    reconnectToken: string;
  };

  async function loadStudy(leader: BufferedPeer, created: LeaderHandle) {
    leader.send({
      type: 'load_study',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'load-1',
      study: createStudySummary(),
    });
    return leader.waitFor('session_updated', (m) => m.command === 'load_study');
  }

  async function startStudy(leader: BufferedPeer, created: LeaderHandle) {
    leader.send({
      type: 'start_study',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'start-1',
    });
    return leader.waitFor('session_updated', (m) => m.command === 'start_study');
  }

  /** Study Leader: complete the Section 1 turn (override) and land on Section 2. */
  async function advanceToIcebreaker(
    leader: BufferedPeer,
    created: LeaderHandle,
    requestId = 'next-1',
  ) {
    leader.send({
      type: 'override_turn',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'override-1',
    });
    await leader.waitFor('session_updated', (m) => m.command === 'override_turn');
    leader.send({
      type: 'next_section',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId,
    });
    return leader.waitFor(
      'session_updated',
      (m) => m.command === 'next_section' && m.requestId === requestId,
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

  function lowerHand(
    peer: BufferedPeer,
    sessionCode: string,
    memberId: string,
    requestId: string,
  ) {
    peer.send({ type: 'lower_hand', sessionCode, memberId, requestId });
  }

  /**
   * Serializes the `session` snapshot of every server frame — the secret- and
   * pastoral-stripping surface (credential envelopes like `session_created`
   * legitimately carry the caller's own credentials).
   */
  function snapshotTranscript(frames: string[]): string {
    return frames
      .map((raw) => JSON.parse(raw) as { session?: unknown })
      .filter((msg) => msg.session != null)
      .map((msg) => JSON.stringify(msg.session))
      .join('\n');
  }

  it('Scenario 2: load_study icebreaker rides the wire minus leaderNote / examplesToListenFor in every frame', async () => {
    const { leader, created } = await createLeader();

    // A valid icebreaker with smuggled pastoral keys: accepted, sanitized.
    leader.send({
      type: 'load_study',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'ls-ice',
      study: summaryWithIcebreaker({
        ...ICEBREAKER_SUMMARY_FIELDS,
        leaderNote: SEED_ICEBREAKER.leaderNote,
        examplesToListenFor: SEED_ICEBREAKER.examplesToListenFor,
      }),
    });
    const accepted = await leader.waitFor(
      'session_updated',
      (m) => m.command === 'load_study' && m.requestId === 'ls-ice',
    );
    expect(accepted.session.study?.icebreaker).toEqual(ICEBREAKER_SUMMARY_FIELDS);

    // A present-but-invalid icebreaker rejects with INVALID_MESSAGE.
    leader.send({
      type: 'load_study',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'ls-ice-bad',
      study: summaryWithIcebreaker({
        ...ICEBREAKER_SUMMARY_FIELDS,
        mainQuestion: 'x'.repeat(1001),
      }),
    });
    const invalid = await leader.waitFor('session_error');
    expect(invalid.requestId).toBe('ls-ice-bad');
    expect(invalid.code).toBe('INVALID_MESSAGE');

    // A missing icebreaker stays valid (backward compat) and syncs as null.
    leader.send({
      type: 'load_study',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'ls-ice-missing',
      study: summaryWithIcebreaker(null),
    });
    const missing = await leader.waitFor(
      'session_updated',
      (m) => m.command === 'load_study' && m.requestId === 'ls-ice-missing',
    );
    expect(missing.session.study?.icebreaker).toBeNull();

    // Reload the full sanitized summary so later frames carry it, and let a
    // Participant observe the broadcast + a late joiner observe session_joined.
    const { participant, joined } = await joinParticipant(
      created.sessionCode,
      'Daniel',
    );
    await loadStudy(leader, created);
    const participantView = await participant.waitFor(
      'session_updated',
      (m) =>
        m.command === 'load_study' &&
        m.session.study?.icebreaker != null,
    );
    expect(participantView.session.study?.icebreaker).toEqual(
      ICEBREAKER_SUMMARY_FIELDS,
    );
    const late = await joinParticipant(created.sessionCode, 'Maria');
    expect(late.joined.session.study?.icebreaker).toEqual(
      ICEBREAKER_SUMMARY_FIELDS,
    );
    expect(joined.session.study?.icebreaker ?? null).toBeNull();

    // Whole-conversation scan: not one frame carries leader-only copy or keys.
    const transcript = capturedFrames.join('\n');
    expect(transcript).not.toContain('leaderNote');
    expect(transcript).not.toContain('examplesToListenFor');
    expect(transcript).not.toContain('Examples to Listen For');
    expect(transcript).not.toContain(SEED_ICEBREAKER.leaderNote);
    for (const example of SEED_ICEBREAKER.examplesToListenFor) {
      expect(transcript).not.toContain(example);
    }
    // Secrets stay stripped from every broadcast snapshot.
    const snapshots = snapshotTranscript(capturedFrames);
    expect(snapshots).not.toContain(created.leaderPin);
    expect(snapshots).not.toContain(created.leaderToken);
    expect(snapshots).not.toContain(created.reconnectToken);
    expect(snapshots).not.toContain(joined.reconnectToken);
    expect(snapshots).not.toContain(late.joined.reconnectToken);
  });

  it('turn lifecycle: next_section into Section 2 creates the fresh open-share turn and Section 3 clears it', async () => {
    const { leader, created } = await createLeader();
    await loadStudy(leader, created);
    await startStudy(leader, created);

    const advanced = await advanceToIcebreaker(leader, created);
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

    // The reserved seams stay untouched through a raise.
    const { participant: p1, joined: j1 } = await joinParticipant(
      created.sessionCode,
      'Daniel',
    );
    raiseHand(p1, created.sessionCode, j1.memberId, 'raise-1');
    const raised = await p1.waitFor(
      'session_updated',
      (m) => m.command === 'raise_hand',
    );
    expect(raised.session.volunteerTurn?.candidateMemberId).toBeNull();
    expect(raised.session.volunteerTurn?.candidateExpiresAt).toBeNull();
    expect(raised.session.volunteerTurn?.selectedMemberId).toBeNull();
    expect(raised.session.volunteerTurn?.completedAt).toBeNull();

    // Scenario 4: Section 2 -> 3 is the leader's unconditional next_section —
    // no completion precondition, raised hands do not block it.
    leader.send({
      type: 'next_section',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'next-2',
    });
    const sec3 = await leader.waitFor(
      'session_updated',
      (m) => m.command === 'next_section' && m.requestId === 'next-2',
    );
    expect(sec3.session.currentSectionId).toBe('section_3_reading');
    expect(sec3.session.volunteerTurn).toBeNull();

    // Raises in Section 3 are back to INVALID_STATE_TRANSITION.
    raiseHand(p1, created.sessionCode, j1.memberId, 'raise-sec-3');
    const rejected = await p1.waitFor('session_error');
    expect(rejected.requestId).toBe('raise-sec-3');
    expect(rejected.code).toBe('INVALID_STATE_TRANSITION');
    lowerHand(p1, created.sessionCode, j1.memberId, 'lower-sec-3');
    const lowerRejected = await p1.waitFor('session_error');
    expect(lowerRejected.requestId).toBe('lower-sec-3');
    expect(lowerRejected.code).toBe('INVALID_STATE_TRANSITION');
  });

  it('Scenario 3: live count sync 0 -> 1 -> 2 -> 1 -> 2 with duplicate-raise idempotency and raise order', async () => {
    const { leader, created } = await createLeader();
    const { participant: p1, joined: j1 } = await joinParticipant(
      created.sessionCode,
      'Daniel',
    );
    const { participant: p2, joined: j2 } = await joinParticipant(
      created.sessionCode,
      'Maria',
    );
    await loadStudy(leader, created);
    await startStudy(leader, created);
    await advanceToIcebreaker(leader, created);

    // `requestId` echoes only to the requester socket; bystander frames match
    // on command + queue length in strict per-peer FIFO consumption order.
    const sync = async (
      command: 'raise_hand' | 'lower_hand' | 'clear_hands',
      length: number,
      requester?: { peer: BufferedPeer; requestId: string },
    ) => {
      const views = await Promise.all(
        [leader, p1, p2].map((peer) =>
          peer.waitFor('session_updated', (m) => {
            if (m.command !== command) {
              return false;
            }
            if (m.session.volunteerTurn?.raisedHands.length !== length) {
              return false;
            }
            return requester?.peer !== peer || m.requestId === requester.requestId;
          }),
        ),
      );
      return views[0]?.session.volunteerTurn?.raisedHands ?? [];
    };

    // 0 -> 1 (Daniel).
    raiseHand(p1, created.sessionCode, j1.memberId, 'r1');
    expect(await sync('raise_hand', 1, { peer: p1, requestId: 'r1' })).toEqual([
      { memberId: j1.memberId, raisedAt: expect.any(String) },
    ]);

    // 1 -> 2 (Maria): first-come order preserved everywhere.
    raiseHand(p2, created.sessionCode, j2.memberId, 'r2');
    const twoUp = await sync('raise_hand', 2, { peer: p2, requestId: 'r2' });
    expect(twoUp.map((e) => e.memberId)).toEqual([
      j1.memberId,
      j2.memberId,
    ]);

    // Duplicate raise_hand frame: no double-count, same position, same raisedAt.
    const original = twoUp[1];
    raiseHand(p2, created.sessionCode, j2.memberId, 'r2-dup');
    const dupHands = await sync('raise_hand', 2, {
      peer: p2,
      requestId: 'r2-dup',
    });
    expect(dupHands).toHaveLength(2);
    expect(dupHands[1]?.raisedAt).toBe(original?.raisedAt);

    // 2 -> 1 (Maria lowers).
    lowerHand(p2, created.sessionCode, j2.memberId, 'l2');
    expect(
      (await sync('lower_hand', 1, { peer: p2, requestId: 'l2' })).map(
        (e) => e.memberId,
      ),
    ).toEqual([j1.memberId]);

    // 1 -> 2 (Maria re-raises: fresh raisedAt, appended last).
    raiseHand(p2, created.sessionCode, j2.memberId, 'r2-again');
    const reRaised = await sync('raise_hand', 2, {
      peer: p2,
      requestId: 'r2-again',
    });
    expect(reRaised.map((e) => e.memberId)).toEqual([
      j1.memberId,
      j2.memberId,
    ]);
    expect(reRaised[1]?.raisedAt).not.toBe(original?.raisedAt);

    // Leader clear_hands works unchanged on the Section 2 open-share turn.
    leader.send({
      type: 'clear_hands',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'clear-1',
    });
    expect(
      (await sync('clear_hands', 0, { peer: leader, requestId: 'clear-1' })).map(
        (e) => e.memberId,
      ),
    ).toEqual([]);
  });

  it('locks Section-1-scoped commands out of Section 2: choose_volunteer / override_turn / complete_turn stay INVALID_STATE_TRANSITION', async () => {
    const { leader, created } = await createLeader();
    const { participant: p1, joined: j1 } = await joinParticipant(
      created.sessionCode,
      'Daniel',
    );
    await loadStudy(leader, created);
    await startStudy(leader, created);
    await advanceToIcebreaker(leader, created);

    // choose_volunteer passes target validation, then hits the state gate.
    leader.send({
      type: 'choose_volunteer',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      targetMemberId: j1.memberId,
      requestId: 'choose-in-sec-2',
    });
    const chooseError = await leader.waitFor('session_error');
    expect(chooseError.requestId).toBe('choose-in-sec-2');
    expect(chooseError.code).toBe('INVALID_STATE_TRANSITION');

    // override_turn is a Section 1 gate too.
    leader.send({
      type: 'override_turn',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'override-in-sec-2',
    });
    const overrideError = await leader.waitFor('session_error');
    expect(overrideError.requestId).toBe('override-in-sec-2');
    expect(overrideError.code).toBe('INVALID_STATE_TRANSITION');

    // complete_turn has no Section 1 turn to complete in Section 2.
    p1.send({
      type: 'complete_turn',
      sessionCode: created.sessionCode,
      memberId: j1.memberId,
      requestId: 'done-in-sec-2',
    });
    const doneError = await p1.waitFor('session_error');
    expect(doneError.requestId).toBe('done-in-sec-2');
    expect(doneError.code).toBe('INVALID_STATE_TRANSITION');

    // None of the rejected frames mutated the open-share turn.
    const probe = await connectPeer();
    probe.send({
      type: 'join_session',
      sessionCode: created.sessionCode,
      displayName: 'Nora',
      requestId: 'join-probe',
    });
    const joined = await probe.waitFor('session_joined');
    expect(joined.session.volunteerTurn).toEqual({
      sectionId: 'section_2_icebreaker',
      mode: 'open_share',
      raisedHands: [],
      candidateMemberId: null,
      candidateExpiresAt: null,
      selectedMemberId: null,
      completedAt: null,
    });
  });

  it('Scenario 5: raised queue, exact count, and own raised state survive reconnects and late joins (deep copies, stripped secrets)', async () => {
    const { leader, created } = await createLeader();
    const { participant: p1, joined: j1 } = await joinParticipant(
      created.sessionCode,
      'Daniel',
    );
    const { participant: p2, joined: j2 } = await joinParticipant(
      created.sessionCode,
      'Maria',
    );
    await loadStudy(leader, created);
    await startStudy(leader, created);
    await advanceToIcebreaker(leader, created);

    raiseHand(p1, created.sessionCode, j1.memberId, 'r1');
    await p1.waitFor('session_updated', (m) => m.command === 'raise_hand');
    raiseHand(p2, created.sessionCode, j2.memberId, 'r2');
    const raised = await p1.waitFor(
      'session_updated',
      (m) =>
        m.command === 'raise_hand' &&
        m.session.volunteerTurn?.raisedHands.length === 2,
    );
    expect(raised.session.volunteerTurn?.raisedHands.map((e) => e.memberId)).toEqual(
      [j1.memberId, j2.memberId],
    );

    // Reconnect restores the exact queue (order + raisedAt intact).
    await p1.close();
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
    // Own raised state is derivable from the restored queue.
    expect(
      resumed.session.volunteerTurn?.raisedHands.some(
        (e) => e.memberId === j1.memberId,
      ),
    ).toBe(true);

    // Late joiners see the same count and order.
    const late = await joinParticipant(created.sessionCode, 'Elliot');
    expect(late.joined.session.volunteerTurn?.raisedHands).toEqual(
      raised.session.volunteerTurn?.raisedHands,
    );

    // Snapshots are deep copies: client mutation cannot corrupt the queue.
    if (late.joined.session.volunteerTurn) {
      late.joined.session.volunteerTurn.raisedHands.push({
        memberId: 'injected',
        raisedAt: '2026-10-30T19:00:00.000Z',
      });
    }
    const after = await joinParticipant(created.sessionCode, 'Fabio');
    expect(
      after.joined.session.volunteerTurn?.raisedHands.map((e) => e.memberId),
    ).toEqual([j1.memberId, j2.memberId]);

    // Lower after reconnect still works on the Section 2 turn.
    lowerHand(reconnected, created.sessionCode, j1.memberId, 'l1');
    const lowered = await p2.waitFor(
      'session_updated',
      (m) => m.command === 'lower_hand',
    );
    expect(
      lowered.session.volunteerTurn?.raisedHands.map((e) => e.memberId),
    ).toEqual([j2.memberId]);

    // Conversation hygiene: secrets and pastoral fields never ride the wire.
    const transcript = capturedFrames.join('\n');
    expect(transcript).not.toContain('leaderNote');
    expect(transcript).not.toContain('examplesToListenFor');
    expect(transcript).not.toContain('Examples to Listen For');
    const snapshots = snapshotTranscript(capturedFrames);
    expect(snapshots).not.toContain(created.leaderPin);
    expect(snapshots).not.toContain(created.leaderToken);
    expect(snapshots).not.toContain(j1.reconnectToken);
    expect(snapshots).not.toContain(j2.reconnectToken);
  });
});

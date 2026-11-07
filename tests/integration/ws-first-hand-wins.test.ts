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
    subtitle: 'Twentieth Sunday in Ordinary Time Year A',
    liturgicalEyebrow: 'Gospel Reading',
    gospelCitation: 'Matthew 15:21–28',
    gospelSummaryLabel: 'Gospel of Matthew 15:21–28',
    sectionCount: 6,
    estimatedMinutes: 90,
  };
}

describe('First-Hand-Wins Volunteer Turn Assignment (Sections 1, 2, 3)', () => {
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
        new Promise<any>((resolve, reject) => {
          const tryResolve = () => {
            for (const msg of received) {
              if (consumed.has(msg) || msg.type !== type) {
                continue;
              }
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

  async function loadAndStartStudy(
    leader: BufferedPeer,
    created: { sessionCode: string; leaderToken: string; memberId: string },
  ) {
    leader.send({
      type: 'load_study',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      study: createStudySummary(),
      requestId: 'load-1',
    });
    await leader.waitFor('session_updated', (m) => m.command === 'load_study');

    leader.send({
      type: 'start_study',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'start-1',
    });
    return leader.waitFor('session_updated', (m) => m.command === 'start_study');
  }

  it('Scenario 1 & 2: Section 1 first raise_hand auto-assigns selectedMemberId and subsequent raises preserve the winner', async () => {
    const { leader, created } = await createLeader();
    const { participant: p1, joined: j1 } = await joinParticipant(
      created.sessionCode,
      'Maria',
    );
    const { participant: p2, joined: j2 } = await joinParticipant(
      created.sessionCode,
      'Elena',
    );
    await loadAndStartStudy(leader, created);

    // Maria is first to raise hand in Section 1
    p1.send({
      type: 'raise_hand',
      sessionCode: created.sessionCode,
      memberId: j1.memberId,
      requestId: 'raise-maria',
    });
    const mariaEcho = await p1.waitFor(
      'session_updated',
      (m) => m.command === 'raise_hand',
    );
    expect(mariaEcho.session.volunteerTurn?.selectedMemberId).toBe(j1.memberId);
    expect(mariaEcho.session.volunteerTurn?.completedAt).toBeNull();

    // Elena raises second: Elena is in raisedHands, but selectedMemberId stays Maria
    p2.send({
      type: 'raise_hand',
      sessionCode: created.sessionCode,
      memberId: j2.memberId,
      requestId: 'raise-elena',
    });
    const elenaEcho = await p2.waitFor(
      'session_updated',
      (m) => m.command === 'raise_hand' && m.requestId === 'raise-elena',
    );
    expect(elenaEcho.session.volunteerTurn?.raisedHands).toHaveLength(2);
    expect(elenaEcho.session.volunteerTurn?.selectedMemberId).toBe(j1.memberId);

    // Elena cannot complete Maria's turn
    p2.send({
      type: 'complete_turn',
      sessionCode: created.sessionCode,
      memberId: j2.memberId,
      requestId: 'complete-elena-bad',
    });
    const elenaErr = await p2.waitFor('session_error');
    expect(elenaErr.code).toBe('UNAUTHORIZED_MEMBER');
    expect(elenaErr.message).toContain('Only the chosen volunteer');

    // Maria (chosen volunteer) completes turn
    p1.send({
      type: 'complete_turn',
      sessionCode: created.sessionCode,
      memberId: j1.memberId,
      requestId: 'complete-maria-ok',
    });
    const doneUpdate = await leader.waitFor(
      'session_updated',
      (m) => m.command === 'complete_turn',
    );
    expect(doneUpdate.session.volunteerTurn?.completedAt).not.toBeNull();
    expect(doneUpdate.session.completedSectionIds).toContain('section_1_prayer');
  });

  it('Scenario 3: Section 2 first raise_hand auto-assigns selectedMemberId and gates advancement until Done', async () => {
    const { leader, created } = await createLeader();
    const { participant: p1, joined: j1 } = await joinParticipant(
      created.sessionCode,
      'Daniel',
    );
    const { participant: p2, joined: j2 } = await joinParticipant(
      created.sessionCode,
      'Sara',
    );
    await loadAndStartStudy(leader, created);

    // Complete Section 1 via leader override to reach Section 2
    leader.send({
      type: 'override_turn',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'override-sec-1',
    });
    await leader.waitFor('session_updated', (m) => m.command === 'override_turn');

    leader.send({
      type: 'next_section',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'to-sec-2',
    });
    const sec2 = await leader.waitFor(
      'session_updated',
      (m) => m.command === 'next_section',
    );
    expect(sec2.session.currentSectionId).toBe('section_2_icebreaker');
    expect(sec2.session.volunteerTurn?.selectedMemberId).toBeNull();

    // Daniel raises hand in Section 2: wins immediately
    p1.send({
      type: 'raise_hand',
      sessionCode: created.sessionCode,
      memberId: j1.memberId,
      requestId: 'daniel-raise-sec-2',
    });
    const danielWin = await p1.waitFor(
      'session_updated',
      (m) => m.command === 'raise_hand',
    );
    expect(danielWin.session.volunteerTurn?.selectedMemberId).toBe(j1.memberId);

    // Sara raises second: winner is preserved
    p2.send({
      type: 'raise_hand',
      sessionCode: created.sessionCode,
      memberId: j2.memberId,
      requestId: 'sara-raise-sec-2',
    });
    const saraView = await p2.waitFor(
      'session_updated',
      (m) => m.command === 'raise_hand' && m.requestId === 'sara-raise-sec-2',
    );
    expect(saraView.session.volunteerTurn?.selectedMemberId).toBe(j1.memberId);

    // Leader cannot advance until Daniel finishes
    leader.send({
      type: 'next_section',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'advance-blocked',
    });
    const advanceErr = await leader.waitFor('session_error');
    expect(advanceErr.code).toBe('INVALID_STATE_TRANSITION');
    expect(advanceErr.message).toContain('The Icebreaker turn must be completed before advancing');

    // Daniel completes turn with Done Sharing
    p1.send({
      type: 'complete_turn',
      sessionCode: created.sessionCode,
      memberId: j1.memberId,
      requestId: 'daniel-done-sec-2',
    });
    const doneUpdate = await leader.waitFor(
      'session_updated',
      (m) => m.command === 'complete_turn',
    );
    expect(doneUpdate.session.volunteerTurn?.completedAt).not.toBeNull();
    expect(doneUpdate.session.completedSectionIds).toContain('section_2_icebreaker');

    // Now leader can advance to Section 3
    leader.send({
      type: 'next_section',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'to-sec-3',
    });
    const sec3 = await leader.waitFor(
      'session_updated',
      (m) => m.command === 'next_section' && m.requestId === 'to-sec-3',
    );
    expect(sec3.session.currentSectionId).toBe('section_3_reading');
  });

  it('Scenario 4: Section 3 first raise_hand auto-assigns selectedMemberId and leader override works cleanly', async () => {
    const { leader, created } = await createLeader();
    const { participant: p1, joined: j1 } = await joinParticipant(
      created.sessionCode,
      'Elena',
    );
    const { participant: p2, joined: j2 } = await joinParticipant(
      created.sessionCode,
      'Marco',
    );
    await loadAndStartStudy(leader, created);

    // Fast-forward to Section 3 via overrides
    leader.send({
      type: 'override_turn',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'ov-1',
    });
    await leader.waitFor('session_updated', (m) => m.command === 'override_turn');
    leader.send({
      type: 'next_section',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'to-2',
    });
    await leader.waitFor('session_updated', (m) => m.command === 'next_section');
    leader.send({
      type: 'next_section',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'to-3',
    });
    await leader.waitFor('session_updated', (m) => m.command === 'next_section');

    // Elena raises hand to read aloud in Section 3
    p1.send({
      type: 'raise_hand',
      sessionCode: created.sessionCode,
      memberId: j1.memberId,
      requestId: 'elena-read-aloud',
    });
    const elenaWin = await p1.waitFor(
      'session_updated',
      (m) => m.command === 'raise_hand',
    );
    expect(elenaWin.session.currentSectionId).toBe('section_3_reading');
    expect(elenaWin.session.volunteerTurn?.selectedMemberId).toBe(j1.memberId);

    // Marco raises second: winner is preserved
    p2.send({
      type: 'raise_hand',
      sessionCode: created.sessionCode,
      memberId: j2.memberId,
      requestId: 'marco-read-second',
    });
    const marcoView = await p2.waitFor(
      'session_updated',
      (m) => m.command === 'raise_hand' && m.requestId === 'marco-read-second',
    );
    expect(marcoView.session.volunteerTurn?.selectedMemberId).toBe(j1.memberId);

    // Leader uses override to mark done
    leader.send({
      type: 'override_turn',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'leader-override-sec-3',
    });
    const overrideSuccess = await leader.waitFor(
      'session_updated',
      (m) => m.command === 'override_turn',
    );
    expect(overrideSuccess.session.volunteerTurn?.completedAt).not.toBeNull();
    expect(overrideSuccess.session.completedSectionIds).toContain('section_3_reading');

    // Advancing to Section 4 succeeds
    leader.send({
      type: 'next_section',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'to-sec-4',
    });
    const sec4 = await leader.waitFor(
      'session_updated',
      (m) => m.command === 'next_section',
    );
    expect(sec4.session.currentSectionId).toBe('section_4_deep_analysis');
  });
});

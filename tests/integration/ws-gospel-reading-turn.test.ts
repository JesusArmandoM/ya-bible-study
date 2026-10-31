import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createAppServer, type AppServer } from '../../src/server/app';
import { LiveSessionStore } from '../../src/server/sessionStore';
import { getDefaultStudyDocument } from '../../src/server/studies/greatIsYourFaithSeed';
import {
  DEFAULT_SESSION_TTL_MS,
  toSessionStudySummary,
  type PublicLiveSessionSnapshot,
  type ServerWsMessage,
  type SessionErrorCode,
} from '../../src/shared/session';

interface BufferedPeer {
  raw: WebSocket;
  received: ServerWsMessage[];
  send: (payload: unknown) => void;
  waitFor: <T extends ServerWsMessage['type']>(
    type: T,
    predicate?: (msg: Extract<ServerWsMessage, { type: T }>) => boolean,
  ) => Promise<Extract<ServerWsMessage, { type: T }>>;
  close: () => Promise<void>;
}

describe('WebSocket Section 3 Gospel Reading turn (protocol v3)', () => {
  let server: AppServer;
  let sessionStore: LiveSessionStore;
  let wsUrl: string;
  let openPeers: BufferedPeer[];

  async function connectPeer(): Promise<BufferedPeer> {
    const ws = new WebSocket(wsUrl);
    const received: ServerWsMessage[] = [];
    const waiters: Array<{ tryResolve: () => boolean }> = [];
    const consumed = new Set<ServerWsMessage>();

    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });

    ws.on('message', (raw) => {
      const parsed = JSON.parse(raw.toString('utf8')) as ServerWsMessage;
      received.push(parsed);
      for (let i = waiters.length - 1; i >= 0; i--) {
        const waiter = waiters[i];
        if (waiter?.tryResolve()) {
          waiters.splice(i, 1);
        }
      }
    });

    const peer: BufferedPeer = {
      raw: ws,
      received,
      send: (payload: unknown) => ws.send(JSON.stringify(payload)),
      waitFor: <T extends ServerWsMessage['type']>(
        type: T,
        predicate?: (msg: Extract<ServerWsMessage, { type: T }>) => boolean,
      ) =>
        new Promise<Extract<ServerWsMessage, { type: T }>>((resolve, reject) => {
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
          }, 4000);
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

  async function loadStudy(
    leader: BufferedPeer,
    created: { sessionCode: string; leaderToken: string; memberId: string },
  ) {
    const seed = getDefaultStudyDocument();
    leader.send({
      type: 'load_study',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      study: toSessionStudySummary(seed),
      requestId: 'load-1',
    });
    return leader.waitFor(
      'session_updated',
      (msg) => msg.command === 'load_study',
    );
  }

  async function advanceToSection3(
    leader: BufferedPeer,
    created: { sessionCode: string; leaderToken: string; memberId: string },
  ) {
    await loadStudy(leader, created);

    // Start study -> Section 1
    leader.send({
      type: 'start_study',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'start-1',
    });
    await leader.waitFor('session_updated', (m) => m.command === 'start_study');

    // Override Section 1 prayer turn so we can advance
    leader.send({
      type: 'override_turn',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'override-sec-1',
    });
    await leader.waitFor('session_updated', (m) => m.command === 'override_turn');

    // Section 1 -> Section 2 (Icebreaker)
    leader.send({
      type: 'next_section',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'next-sec-2',
    });
    await leader.waitFor(
      'session_updated',
      (m) => m.command === 'next_section' && m.session.currentSectionId === 'section_2_icebreaker',
    );

    // Section 2 -> Section 3 (Gospel Reading)
    leader.send({
      type: 'next_section',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'next-sec-3',
    });
    const sec3Msg = await leader.waitFor(
      'session_updated',
      (m) => m.command === 'next_section' && m.session.currentSectionId === 'section_3_reading',
    );
    return sec3Msg;
  }

  it('Scenario 1: load_study projects Gospel Reading onto snapshots and strictly strips facilitator secrets', async () => {
    const { leader, created } = await createLeader();
    const { participant: p1 } = await joinParticipant(created.sessionCode, 'Lucas');

    await loadStudy(leader, created);

    const snapshot = await p1.waitFor('session_updated', (m) => m.command === 'load_study');
    const gospel = snapshot.session.study?.gospelReading;
    expect(gospel).toBeDefined();
    expect(gospel?.title).toBe('Gospel Reading');
    expect(gospel?.citation).toBe('Matthew 15:21–28');
    expect(gospel?.verses.length).toBeGreaterThanOrEqual(8);
    expect(gospel).not.toHaveProperty('leaderLiturgicalContextNote');
    expect(gospel).not.toHaveProperty('keyLines');

    // Assert raw frame text never contains secrets or facilitator note
    const allFrames = p1.received.map((m) => JSON.stringify(m)).join(' ');
    expect(allFrames).not.toContain('leaderLiturgicalContextNote');
    expect(allFrames).not.toContain('leaderPin');
    expect(allFrames).not.toContain('leaderToken');
    expect(allFrames).not.toContain(created.leaderToken);
  });

  it('Scenario 2: advancing into Section 3 creates fresh gated_reading turn; advancing into Section 4 clears it', async () => {
    const { leader, created } = await createLeader();
    const { participant: p1 } = await joinParticipant(created.sessionCode, 'Lucas');

    const sec3 = await advanceToSection3(leader, created);
    expect(sec3.session.currentSectionId).toBe('section_3_reading');
    expect(sec3.session.currentSectionIndex).toBe(2);
    expect(sec3.session.volunteerTurn).toEqual({
      sectionId: 'section_3_reading',
      mode: 'gated_reading',
      raisedHands: [],
      candidateMemberId: null,
      candidateExpiresAt: null,
      selectedMemberId: null,
      completedAt: null,
    });

    // P1 also sees the Section 3 snapshot
    const p1Sec3 = await p1.waitFor(
      'session_updated',
      (m) => m.command === 'next_section' && m.session.currentSectionId === 'section_3_reading',
    );
    expect(p1Sec3.session.volunteerTurn?.mode).toBe('gated_reading');

    // Leader overrides to complete the reading turn
    leader.send({
      type: 'override_turn',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'override-3',
    });
    await leader.waitFor('session_updated', (m) => m.command === 'override_turn');

    // Advance to Section 4 clears volunteerTurn
    leader.send({
      type: 'next_section',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'next-4',
    });
    const sec4 = await leader.waitFor(
      'session_updated',
      (m) => m.command === 'next_section' && m.session.currentSectionId === 'section_4_discussion',
    );
    expect(sec4.session.currentSectionId).toBe('section_4_discussion');
    expect(sec4.session.volunteerTurn).toBeNull();
  });

  it('Scenario 3: Participant raises hand; Leader selects reader via choose_volunteer', async () => {
    const { leader, created } = await createLeader();
    const { participant: p1, joined: j1 } = await joinParticipant(created.sessionCode, 'Maria');
    const { participant: p2, joined: j2 } = await joinParticipant(created.sessionCode, 'David');

    await advanceToSection3(leader, created);

    // Maria raises hand to read
    p1.send({
      type: 'raise_hand',
      sessionCode: created.sessionCode,
      memberId: j1.memberId,
      requestId: 'raise-m',
    });
    const raised = await leader.waitFor('session_updated', (m) => m.command === 'raise_hand');
    expect(raised.session.volunteerTurn?.raisedHands).toHaveLength(1);
    expect(raised.session.volunteerTurn?.raisedHands[0]?.memberId).toBe(j1.memberId);

    // Leader chooses Maria
    leader.send({
      type: 'choose_volunteer',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      targetMemberId: j1.memberId,
      requestId: 'choose-m',
    });
    const chosen = await p1.waitFor('session_updated', (m) => m.command === 'choose_volunteer');
    expect(chosen.session.volunteerTurn?.selectedMemberId).toBe(j1.memberId);
    expect(chosen.session.volunteerTurn?.completedAt).toBeNull();

    // Re-choosing Maria is idempotent no-op
    leader.send({
      type: 'choose_volunteer',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      targetMemberId: j1.memberId,
      requestId: 'choose-m-again',
    });
    const idem = await leader.waitFor('session_updated', (m) => m.command === 'choose_volunteer');
    expect(idem.session.volunteerTurn?.selectedMemberId).toBe(j1.memberId);

    // Reassigning to David revokes Maria and assigns David
    leader.send({
      type: 'choose_volunteer',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      targetMemberId: j2.memberId,
      requestId: 'reassign-d',
    });
    const reassigned = await p2.waitFor(
      'session_updated',
      (m) => m.command === 'choose_volunteer' && m.session.volunteerTurn?.selectedMemberId === j2.memberId,
    );
    expect(reassigned.session.volunteerTurn?.selectedMemberId).toBe(j2.memberId);
  });

  it('Scenario 4: Leader triggers random picker and confirms candidate in Section 3', async () => {
    const { leader, created } = await createLeader();
    const { participant: p1, joined: j1 } = await joinParticipant(created.sessionCode, 'Elena');
    const { participant: p2, joined: j2 } = await joinParticipant(created.sessionCode, 'Mateo');

    await advanceToSection3(leader, created);

    // Leader triggers pick_random
    leader.send({
      type: 'pick_random',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'rand-1',
    });
    const picked = await leader.waitFor('session_updated', (m) => m.command === 'pick_random');
    expect(picked.session.volunteerTurn?.candidateMemberId).toBeTruthy();
    expect(picked.session.volunteerTurn?.candidateExpiresAt).toBeTruthy();

    const candidateId = picked.session.volunteerTurn?.candidateMemberId!;
    expect([j1.memberId, j2.memberId]).toContain(candidateId);

    // Leader confirms candidate
    leader.send({
      type: 'confirm_random',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'confirm-1',
    });
    const confirmed = await leader.waitFor('session_updated', (m) => m.command === 'confirm_random');
    expect(confirmed.session.volunteerTurn?.selectedMemberId).toBe(candidateId);
    expect(confirmed.session.volunteerTurn?.candidateMemberId).toBeNull();
    expect(confirmed.session.volunteerTurn?.candidateExpiresAt).toBeNull();
  });

  it('Scenario 5: complete_turn enforces reader gating; Section 4 advance is gated on turn completion', async () => {
    const { leader, created } = await createLeader();
    const { participant: p1, joined: j1 } = await joinParticipant(created.sessionCode, 'Reader');
    const { participant: p2, joined: j2 } = await joinParticipant(created.sessionCode, 'Bystander');

    await advanceToSection3(leader, created);

    // (a) Premature advance before volunteer is chosen is rejected
    leader.send({
      type: 'next_section',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'premature-advance-1',
    });
    const errPremature1 = await leader.waitFor('session_error');
    expect(errPremature1.code).toBe('INVALID_STATE_TRANSITION');
    expect(errPremature1.message).toBe('The Gospel Reading turn must be completed before advancing.');

    // Assign Reader
    leader.send({
      type: 'choose_volunteer',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      targetMemberId: j1.memberId,
      requestId: 'choose-r',
    });
    await leader.waitFor('session_updated', (m) => m.command === 'choose_volunteer');

    // (b) Advance while reading is assigned but not done is rejected
    leader.send({
      type: 'next_section',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'premature-advance-2',
    });
    const errPremature2 = await leader.waitFor('session_error');
    expect(errPremature2.code).toBe('INVALID_STATE_TRANSITION');
    expect(errPremature2.message).toBe('The Gospel Reading turn must be completed before advancing.');

    // (c) Bystander cannot complete the reading turn
    p2.send({
      type: 'complete_turn',
      sessionCode: created.sessionCode,
      memberId: j2.memberId,
      requestId: 'bystander-done',
    });
    const errBystander = await p2.waitFor('session_error');
    expect(errBystander.code).toBe('UNAUTHORIZED_MEMBER');

    // (d) Chosen Reader completes the reading turn
    p1.send({
      type: 'complete_turn',
      sessionCode: created.sessionCode,
      memberId: j1.memberId,
      requestId: 'reader-done',
    });
    const completed = await leader.waitFor('session_updated', (m) => m.command === 'complete_turn');
    expect(completed.session.volunteerTurn?.completedAt).toBeTruthy();
    expect(completed.session.volunteerTurn?.selectedMemberId).toBe(j1.memberId);

    // (e) Re-Done is idempotent no-op
    p1.send({
      type: 'complete_turn',
      sessionCode: created.sessionCode,
      memberId: j1.memberId,
      requestId: 'reader-done-again',
    });
    const reDone = await leader.waitFor('session_updated', (m) => m.command === 'complete_turn');
    expect(reDone.session.volunteerTurn?.completedAt).toBe(completed.session.volunteerTurn?.completedAt);

    // (f) Now advance succeeds to Section 4
    leader.send({
      type: 'next_section',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'advance-to-sec-4',
    });
    const sec4 = await leader.waitFor(
      'session_updated',
      (m) => m.command === 'next_section' && m.session.currentSectionId === 'section_4_discussion',
    );
    expect(sec4.session.currentSectionId).toBe('section_4_discussion');
    expect(sec4.session.volunteerTurn).toBeNull();
  });

  it('Scenario 6: Leader override completes Section 3 turn even when no one is chosen', async () => {
    const { leader, created } = await createLeader();
    await advanceToSection3(leader, created);

    // Leader overrides from collecting_hands
    leader.send({
      type: 'override_turn',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'override-solo',
    });
    const overridden = await leader.waitFor('session_updated', (m) => m.command === 'override_turn');
    expect(overridden.session.volunteerTurn?.completedAt).toBeTruthy();
    expect(overridden.session.volunteerTurn?.selectedMemberId).toBeNull();

    // Advance to Section 4 works immediately
    leader.send({
      type: 'next_section',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'adv-solo',
    });
    const sec4 = await leader.waitFor('session_updated', (m) => m.command === 'next_section');
    expect(sec4.session.currentSectionId).toBe('section_4_discussion');
  });
});

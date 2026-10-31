import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createAppServer, type AppServer } from '../../src/server/app';
import { LiveSessionStore } from '../../src/server/sessionStore';
import { getDefaultStudyDocument } from '../../src/server/studies/greatIsYourFaithSeed';
import {
  DEFAULT_SESSION_TTL_MS,
  toSessionStudySummary,
  type ServerWsMessage,
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

describe('WebSocket Section 4 live participant reflections (named & anonymous privacy)', () => {
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
    server = createAppServer({
      staticDir: false,
      sessionStore,
    });
    const bound = await server.start(0, '127.0.0.1');
    wsUrl = `ws://127.0.0.1:${bound.port}/ws`;
  });

  afterEach(async () => {
    await Promise.all(openPeers.map((peer) => peer.close()));
    await server.close();
  });

  async function setupRoomAdvancedToSection4() {
    const leaderPeer = await connectPeer();
    leaderPeer.send({
      type: 'create_session',
      displayName: 'Leader Armando',
    });
    const created = await leaderPeer.waitFor('session_created');
    const { sessionCode, leaderToken, memberId: leaderMemberId } = created;

    const maryPeer = await connectPeer();
    maryPeer.send({
      type: 'join_session',
      sessionCode,
      displayName: 'Mary Lopez',
    });
    const maryJoined = await maryPeer.waitFor('session_joined');
    const maryMemberId = maryJoined.memberId;

    const saraPeer = await connectPeer();
    saraPeer.send({
      type: 'join_session',
      sessionCode,
      displayName: 'Sara Castillo',
    });
    const saraJoined = await saraPeer.waitFor('session_joined');
    const saraMemberId = saraJoined.memberId;

    // Load study
    const seed = getDefaultStudyDocument();
    leaderPeer.send({
      type: 'load_study',
      sessionCode,
      leaderToken,
      study: toSessionStudySummary(seed),
    });
    await leaderPeer.waitFor('session_updated');

    // Open lobby
    leaderPeer.send({ type: 'open_lobby', sessionCode, leaderToken });
    await leaderPeer.waitFor('session_updated');

    // Start study -> Section 1
    leaderPeer.send({ type: 'start_study', sessionCode, leaderToken });
    await leaderPeer.waitFor('session_updated');

    // Section 1: complete turn & advance to Section 2
    leaderPeer.send({ type: 'override_turn', sessionCode, leaderToken });
    await leaderPeer.waitFor('session_updated');
    leaderPeer.send({ type: 'next_section', sessionCode, leaderToken });
    await leaderPeer.waitFor('session_updated');

    // Section 2: advance to Section 3
    leaderPeer.send({ type: 'next_section', sessionCode, leaderToken });
    await leaderPeer.waitFor('session_updated');

    // Section 3: complete turn & advance to Section 4
    leaderPeer.send({ type: 'override_turn', sessionCode, leaderToken });
    await leaderPeer.waitFor('session_updated');
    leaderPeer.send({ type: 'next_section', sessionCode, leaderToken });
    const s4Snapshot = await leaderPeer.waitFor(
      'session_updated',
      (m) => m.session.currentSectionId === 'section_4_discussion',
    );

    return {
      sessionCode,
      leaderToken,
      leaderMemberId,
      leaderPeer,
      maryPeer,
      maryMemberId,
      saraPeer,
      saraMemberId,
      initialDiscussionState: s4Snapshot.session.discussionState!,
    };
  }

  it('allows a participant to submit a named reflection, broadcasting to all connected peers', async () => {
    const {
      sessionCode,
      maryPeer,
      maryMemberId,
      leaderPeer,
      saraPeer,
      initialDiscussionState,
    } = await setupRoomAdvancedToSection4();

    expect(initialDiscussionState.reflections).toEqual([]);
    const questionId = initialDiscussionState.activeQuestionId;
    expect(questionId).toBe('q-6');

    // Mary submits named reflection
    maryPeer.send({
      type: 'submit_reflection',
      sessionCode,
      memberId: maryMemberId,
      questionId,
      content: 'She humbled herself before Jesus and trusted His mercy was enough.',
      isAnonymous: false,
      requestId: 'req-mary-1',
    });

    const maryUpdate = await maryPeer.waitFor(
      'session_updated',
      (m) => m.command === 'submit_reflection',
    );
    expect(maryUpdate.requestId).toBe('req-mary-1');

    const leaderUpdate = await leaderPeer.waitFor(
      'session_updated',
      (m) => m.command === 'submit_reflection',
    );
    const saraUpdate = await saraPeer.waitFor(
      'session_updated',
      (m) => m.command === 'submit_reflection',
    );

    const reflections = maryUpdate.session.discussionState?.reflections ?? [];
    expect(reflections).toHaveLength(1);
    const refl = reflections[0]!;
    expect(refl.questionId).toBe('q-6');
    expect(refl.authorDisplayName).toBe('Mary Lopez');
    expect(refl.authorInitials).toBe('ML');
    expect(refl.isAnonymous).toBe(false);
    expect(refl.content).toBe('She humbled herself before Jesus and trusted His mercy was enough.');
    expect(refl).not.toHaveProperty('memberId');
    expect(refl).not.toHaveProperty('authorMemberId');

    // Leader and Sara get the identical snapshot
    expect(leaderUpdate.session.discussionState?.reflections).toEqual(reflections);
    expect(saraUpdate.session.discussionState?.reflections).toEqual(reflections);
  });

  it('masks identity strictly server-side for anonymous reflections with zero leak across raw wire frames', async () => {
    const {
      sessionCode,
      saraPeer,
      saraMemberId,
      leaderPeer,
      maryPeer,
      initialDiscussionState,
    } = await setupRoomAdvancedToSection4();

    const questionId = initialDiscussionState.activeQuestionId;

    saraPeer.send({
      type: 'submit_reflection',
      sessionCode,
      memberId: saraMemberId,
      questionId,
      content: 'She kept praying, even when Jesus seemed silent.',
      isAnonymous: true,
      requestId: 'req-sara-anon',
    });

    const saraUpdate = await saraPeer.waitFor(
      'session_updated',
      (m) => m.command === 'submit_reflection',
    );
    const leaderUpdate = await leaderPeer.waitFor(
      'session_updated',
      (m) => m.command === 'submit_reflection',
    );
    const maryUpdate = await maryPeer.waitFor(
      'session_updated',
      (m) => m.command === 'submit_reflection',
    );

    const refl = saraUpdate.session.discussionState?.reflections[0]!;
    expect(refl.isAnonymous).toBe(true);
    expect(refl.authorDisplayName).toBe('Anonymous');
    expect(refl.authorInitials).toBe('?');
    expect(refl.avatarPalette).toBe('indigo');
    expect(refl.content).toBe('She kept praying, even when Jesus seemed silent.');

    // CRITICAL WIRE PRIVACY ASSERTIONS:
    // Verify that neither "Sara Castillo" nor saraMemberId appears anywhere inside
    // the leader's or Mary's reflection object!
    const leaderRefl = leaderUpdate.session.discussionState?.reflections[0]!;
    expect(leaderRefl.authorDisplayName).toBe('Anonymous');
    expect(leaderRefl.authorInitials).toBe('?');
    expect(JSON.stringify(leaderRefl)).not.toContain('Sara');
    expect(JSON.stringify(leaderRefl)).not.toContain(saraMemberId);

    const maryRefl = maryUpdate.session.discussionState?.reflections[0]!;
    expect(maryRefl.authorDisplayName).toBe('Anonymous');
    expect(JSON.stringify(maryRefl)).not.toContain('Sara');
    expect(JSON.stringify(maryRefl)).not.toContain(saraMemberId);
  });

  it('rejects submissions with UNAUTHORIZED_MEMBER if socket binding does not match memberId', async () => {
    const {
      sessionCode,
      maryPeer,
      saraMemberId,
      initialDiscussionState,
    } = await setupRoomAdvancedToSection4();

    // Mary socket tries to submit as Sara
    maryPeer.send({
      type: 'submit_reflection',
      sessionCode,
      memberId: saraMemberId,
      questionId: initialDiscussionState.activeQuestionId,
      content: 'Spoofed reflection.',
      requestId: 'req-spoof',
    });

    const errorMsg = await maryPeer.waitFor('session_error');
    expect(errorMsg.code).toBe('UNAUTHORIZED_MEMBER');
    expect(errorMsg.requestId).toBe('req-spoof');
  });

  it('rejects invalid questionId or content outside 1..1000 bounds with INVALID_MESSAGE', async () => {
    const {
      sessionCode,
      maryPeer,
      maryMemberId,
    } = await setupRoomAdvancedToSection4();

    // Non-existent questionId
    maryPeer.send({
      type: 'submit_reflection',
      sessionCode,
      memberId: maryMemberId,
      questionId: 'q-999-invalid',
      content: 'Valid content',
      requestId: 'req-bad-q',
    });
    const err1 = await maryPeer.waitFor('session_error');
    expect(err1.code).toBe('INVALID_MESSAGE');

    // Empty/whitespace-only content
    maryPeer.send({
      type: 'submit_reflection',
      sessionCode,
      memberId: maryMemberId,
      questionId: 'q-6',
      content: '     \n\t   ',
      requestId: 'req-empty-content',
    });
    const err2 = await maryPeer.waitFor('session_error');
    expect(err2.code).toBe('INVALID_MESSAGE');

    // Over 1000 characters
    maryPeer.send({
      type: 'submit_reflection',
      sessionCode,
      memberId: maryMemberId,
      questionId: 'q-6',
      content: 'x'.repeat(1001),
      requestId: 'req-too-long',
    });
    const err3 = await maryPeer.waitFor('session_error');
    expect(err3.code).toBe('INVALID_MESSAGE');
  });

  it('hydrates reflections and privacy masking cleanly for reconnecting and late-joining participants', async () => {
    const {
      sessionCode,
      maryPeer,
      maryMemberId,
      saraPeer,
      saraMemberId,
      initialDiscussionState,
    } = await setupRoomAdvancedToSection4();

    // 1 named reflection from Mary, 1 anonymous from Sara
    maryPeer.send({
      type: 'submit_reflection',
      sessionCode,
      memberId: maryMemberId,
      questionId: initialDiscussionState.activeQuestionId,
      content: 'Named reflection from Mary',
      isAnonymous: false,
    });
    await maryPeer.waitFor('session_updated');

    saraPeer.send({
      type: 'submit_reflection',
      sessionCode,
      memberId: saraMemberId,
      questionId: initialDiscussionState.activeQuestionId,
      content: 'She humbled herself before the Lord and kept praying.',
      isAnonymous: true,
    });
    await saraPeer.waitFor('session_updated');

    // Late joining participant Daniel
    const danielPeer = await connectPeer();
    danielPeer.send({
      type: 'join_session',
      sessionCode,
      displayName: 'Daniel Reyes',
    });
    const danielJoined = await danielPeer.waitFor('session_joined');
    const hydratedReflections = danielJoined.session.discussionState?.reflections ?? [];
    expect(hydratedReflections).toHaveLength(2);

    const named = hydratedReflections.find((r) => !r.isAnonymous);
    const anon = hydratedReflections.find((r) => r.isAnonymous);

    expect(named?.authorDisplayName).toBe('Mary Lopez');
    expect(anon?.authorDisplayName).toBe('Anonymous');
    expect(anon?.authorInitials).toBe('?');
    expect(JSON.stringify(anon)).not.toContain('Sara');
    expect(JSON.stringify(anon)).not.toContain(saraMemberId);
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createAppServer, type AppServer } from '../../src/server/app';
import { LiveSessionStore } from '../../src/server/sessionStore';
import { getDefaultStudyDocument } from '../../src/server/studies/greatIsYourFaithSeed';
import {
  DEFAULT_SESSION_TTL_MS,
  toSessionStudySummary,
  type ServerWsMessage,
  type SessionDiscussionQuestion,
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

describe('WebSocket Section 4 Deep Analysis discussion & question queue (protocol v3)', () => {
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

    const participantPeer = await connectPeer();
    participantPeer.send({
      type: 'join_session',
      sessionCode,
      displayName: 'Participant John',
    });
    const joined = await participantPeer.waitFor('session_joined');
    const participantMemberId = joined.memberId;

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
    await leaderPeer.waitFor('session_updated'); // Now in Section 2

    // Section 2: advance to Section 3 (open_share requires no turn completion)
    leaderPeer.send({ type: 'next_section', sessionCode, leaderToken });
    await leaderPeer.waitFor('session_updated'); // Now in Section 3

    // Section 3: complete turn & advance to Section 4
    leaderPeer.send({ type: 'override_turn', sessionCode, leaderToken });
    await leaderPeer.waitFor('session_updated');
    leaderPeer.send({ type: 'next_section', sessionCode, leaderToken });
    const sec4Updated = await leaderPeer.waitFor('session_updated');

    expect(sec4Updated.session.currentSectionId).toBe('section_4_discussion');
    expect(sec4Updated.session.volunteerTurn).toBeNull();

    return {
      leaderPeer,
      participantPeer,
      sessionCode,
      leaderToken,
      leaderMemberId,
      participantMemberId,
      sec4Snapshot: sec4Updated.session,
    };
  }

  it('initializes discussionState with default active questions and excludes pastoral fields', async () => {
    const { sec4Snapshot, participantPeer } = await setupRoomAdvancedToSection4();

    expect(sec4Snapshot.discussionState).toBeDefined();
    expect(sec4Snapshot.discussionState?.activeQuestionId).toBe('q-6');
    expect(sec4Snapshot.discussionState?.questions).toHaveLength(3);

    const questions = sec4Snapshot.discussionState!.questions;
    expect(questions[0]?.id).toBe('q-6');
    expect(questions[0]?.number).toBe(1);
    expect(questions[0]?.prompt).toContain("What makes the Canaanite woman's faith");

    expect(questions[1]?.id).toBe('q-5');
    expect(questions[1]?.number).toBe(2);

    expect(questions[2]?.id).toBe('q-8');
    expect(questions[2]?.number).toBe(3);

    // Verify wire privacy: participant messages never contain pastoral fields
    for (const msg of participantPeer.received) {
      const serialized = JSON.stringify(msg);
      expect(serialized).not.toContain('verseCommentary');
      expect(serialized).not.toContain('catholicDoctrine');
      expect(serialized).not.toContain('sampleAnswer');
      expect(serialized).not.toContain('leaderNote');
      expect(serialized).not.toContain('CCC 839–840');
      expect(serialized).not.toContain('anti-Jewish framing');
    }
  });

  it('allows Study Leader to switch active question and synchronizes to all peers', async () => {
    const { leaderPeer, participantPeer, sessionCode, leaderToken } =
      await setupRoomAdvancedToSection4();

    // Switch to question 2 (q-5)
    leaderPeer.send({
      type: 'switch_question',
      sessionCode,
      leaderToken,
      questionId: 'q-5',
    });

    const leaderUpdated = await leaderPeer.waitFor(
      'session_updated',
      (m) => m.command === 'switch_question',
    );
    expect(leaderUpdated.session.discussionState?.activeQuestionId).toBe('q-5');

    const participantUpdated = await participantPeer.waitFor(
      'session_updated',
      (m) => m.command === 'switch_question',
    );
    expect(participantUpdated.session.discussionState?.activeQuestionId).toBe('q-5');

    // Switch to question 3 (q-8)
    leaderPeer.send({
      type: 'switch_question',
      sessionCode,
      leaderToken,
      questionId: 'q-8',
    });

    const leaderUpdated2 = await leaderPeer.waitFor(
      'session_updated',
      (m) => m.command === 'switch_question',
    );
    expect(leaderUpdated2.session.discussionState?.activeQuestionId).toBe('q-8');
  });

  it('rejects switch_question from Participants, bad token, or invalid questionId', async () => {
    const { leaderPeer, participantPeer, sessionCode, leaderToken, participantMemberId } =
      await setupRoomAdvancedToSection4();

    // Participant attempts switch_question
    participantPeer.send({
      type: 'switch_question',
      sessionCode,
      memberId: participantMemberId,
      questionId: 'q-5',
    });
    const partErr = await participantPeer.waitFor('session_error');
    expect(partErr.code).toBe('FORBIDDEN_LEADER_ONLY');

    // Invalid leader token
    leaderPeer.send({
      type: 'switch_question',
      sessionCode,
      leaderToken: 'wrong-token',
      questionId: 'q-5',
    });
    const tokenErr = await leaderPeer.waitFor('session_error');
    expect(tokenErr.code).toBe('UNAUTHORIZED_LEADER');

    // Non-existent questionId
    leaderPeer.send({
      type: 'switch_question',
      sessionCode,
      leaderToken,
      questionId: 'q-999-does-not-exist',
    });
    const invalidErr = await leaderPeer.waitFor('session_error');
    expect(invalidErr.code).toBe('INVALID_MESSAGE');
  });

  it('allows Study Leader to add a question from bank or custom, updating queue count to 4', async () => {
    const { leaderPeer, participantPeer, sessionCode, leaderToken } =
      await setupRoomAdvancedToSection4();

    const newQuestion: SessionDiscussionQuestion = {
      id: 'q-2',
      number: 4,
      prompt: 'Why do you think Jesus tested the woman so severely?',
      category: 'Theological Focus',
      estimatedMinutes: 8,
    };

    leaderPeer.send({
      type: 'add_question',
      sessionCode,
      leaderToken,
      question: newQuestion,
    });

    const leaderUpdated = await leaderPeer.waitFor(
      'session_updated',
      (m) => m.command === 'add_question',
    );
    expect(leaderUpdated.session.discussionState?.questions).toHaveLength(4);
    const addedQ = leaderUpdated.session.discussionState?.questions[3];
    expect(addedQ?.id).toBe('q-2');
    expect(addedQ?.number).toBe(4);
    expect(addedQ?.prompt).toBe(newQuestion.prompt);

    const participantUpdated = await participantPeer.waitFor(
      'session_updated',
      (m) => m.command === 'add_question',
    );
    expect(participantUpdated.session.discussionState?.questions).toHaveLength(4);

    // Leader can now switch to the newly added question
    leaderPeer.send({
      type: 'switch_question',
      sessionCode,
      leaderToken,
      questionId: 'q-2',
    });
    const switchUpdated = await leaderPeer.waitFor(
      'session_updated',
      (m) => m.command === 'switch_question',
    );
    expect(switchUpdated.session.discussionState?.activeQuestionId).toBe('q-2');

    // Re-adding the same question ID is rejected as duplicate
    leaderPeer.send({
      type: 'add_question',
      sessionCode,
      leaderToken,
      question: newQuestion,
    });
    const dupErr = await leaderPeer.waitFor('session_error');
    expect(dupErr.code).toBe('INVALID_MESSAGE');
  });

  it('allows advancing to Section 5 without any turn gate ("mercy, not pace, is the goal")', async () => {
    const { leaderPeer, participantPeer, sessionCode, leaderToken, participantMemberId } =
      await setupRoomAdvancedToSection4();

    // Participant cannot advance
    participantPeer.send({
      type: 'next_section',
      sessionCode,
      memberId: participantMemberId,
    });
    const partErr = await participantPeer.waitFor('session_error');
    expect(partErr.code).toBe('FORBIDDEN_LEADER_ONLY');

    // Leader advances unconditionally into Section 5
    leaderPeer.send({
      type: 'next_section',
      sessionCode,
      leaderToken,
    });
    const leaderUpdated = await leaderPeer.waitFor(
      'session_updated',
      (m) => m.session.currentSectionId === 'section_5_closing',
    );
    expect(leaderUpdated.session.currentSectionId).toBe('section_5_closing');
    expect(leaderUpdated.session.currentSectionIndex).toBe(4);

    const participantUpdated = await participantPeer.waitFor(
      'session_updated',
      (m) => m.session.currentSectionId === 'section_5_closing',
    );
    expect(participantUpdated.session.currentSectionId).toBe('section_5_closing');
  });
});

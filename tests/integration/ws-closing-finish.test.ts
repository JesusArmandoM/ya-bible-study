import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createAppServer, type AppServer } from '../../src/server/app';
import { LiveSessionStore } from '../../src/server/sessionStore';
import { getDefaultStudyDocument } from '../../src/server/studies/greatIsYourFaithSeed';
import {
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

describe('WebSocket Section 5 Study Completion & Ephemeral Reflection Purging (protocol v3)', () => {
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
          const timer = setTimeout(() => {
            reject(
              new Error(
                `Timed out waiting for message type "${type}". Received: ${JSON.stringify(
                  received.map((m) => m.type),
                )}`,
              ),
            );
          }, 3500);

          const tryResolve = () => {
            for (const msg of received) {
              if (consumed.has(msg)) continue;
              if (msg.type === type) {
                const typedMsg = msg as Extract<ServerWsMessage, { type: T }>;
                if (!predicate || predicate(typedMsg)) {
                  consumed.add(msg);
                  clearTimeout(timer);
                  resolve(typedMsg);
                  return true;
                }
              }
            }
            return false;
          };

          if (!tryResolve()) {
            waiters.push({ tryResolve });
          }
        }),
      close: async () => {
        if (
          ws.readyState === WebSocket.OPEN ||
          ws.readyState === WebSocket.CONNECTING
        ) {
          ws.close();
          await new Promise<void>((resolve) => ws.once('close', () => resolve()));
        }
      },
    };

    openPeers.push(peer);
    return peer;
  }

  beforeEach(async () => {
    openPeers = [];
    sessionStore = new LiveSessionStore({
      now: () => Date.now(),
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

  async function setupLobby(seed = getDefaultStudyDocument()) {
    const leaderPeer = await connectPeer();
    leaderPeer.send({
      type: 'create_session',
      displayName: 'Leader Armando',
    });
    const created = await leaderPeer.waitFor('session_created');

    leaderPeer.send({
      type: 'load_study',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      study: toSessionStudySummary(seed),
    });
    await leaderPeer.waitFor(
      'session_updated',
      (m) => m.command === 'load_study',
    );

    leaderPeer.send({
      type: 'open_lobby',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
    });
    await leaderPeer.waitFor(
      'session_updated',
      (m) => m.command === 'open_lobby',
    );

    const participantPeer = await connectPeer();
    participantPeer.send({
      type: 'join_session',
      sessionCode: created.sessionCode,
      displayName: 'Participant John',
    });
    const joined = await participantPeer.waitFor('session_joined');

    return {
      leaderPeer,
      participantPeer,
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      leaderMemberId: created.memberId,
      participantMemberId: joined.memberId,
    };
  }

  async function advanceToSection5(context: Awaited<ReturnType<typeof setupLobby>>) {
    const { leaderPeer, sessionCode, leaderToken, participantPeer } = context;

    // Start study -> Section 1
    leaderPeer.send({
      type: 'start_study',
      sessionCode,
      leaderToken,
    });
    await leaderPeer.waitFor('session_updated', (m) => m.command === 'start_study');

    // Complete Opening Prayer turn via override
    leaderPeer.send({
      type: 'override_turn',
      sessionCode,
      leaderToken,
    });
    await leaderPeer.waitFor('session_updated', (m) => m.command === 'override_turn');

    // Advance to Section 2 (Icebreaker)
    leaderPeer.send({
      type: 'next_section',
      sessionCode,
      leaderToken,
    });
    await leaderPeer.waitFor('session_updated', (m) => m.command === 'next_section');

    // Advance to Section 3 (Gospel Reading)
    leaderPeer.send({
      type: 'next_section',
      sessionCode,
      leaderToken,
    });
    await leaderPeer.waitFor('session_updated', (m) => m.command === 'next_section');

    // Complete Gospel Reading turn via override
    leaderPeer.send({
      type: 'override_turn',
      sessionCode,
      leaderToken,
    });
    await leaderPeer.waitFor('session_updated', (m) => m.command === 'override_turn');

    // Advance to Section 4 (Discussion)
    leaderPeer.send({
      type: 'next_section',
      sessionCode,
      leaderToken,
    });
    await leaderPeer.waitFor('session_updated', (m) => m.command === 'next_section');

    // Participant submits a reflection in Section 4
    participantPeer.send({
      type: 'submit_reflection',
      sessionCode,
      memberId: context.participantMemberId,
      questionId: 'q-6',
      content: 'Her perseverance through apparent silence inspires my own prayer life.',
    });
    await leaderPeer.waitFor(
      'session_updated',
      (m) => m.command === 'submit_reflection',
    );

    // Verify reflection exists in session
    const internalSession = (sessionStore as any).sessions.get(sessionCode);
    expect(internalSession.discussionState?.reflections).toHaveLength(1);

    // Advance to Section 5 (Closing Prayer)
    leaderPeer.send({
      type: 'next_section',
      sessionCode,
      leaderToken,
    });
    const section5Msg = await leaderPeer.waitFor(
      'session_updated',
      (m) => m.command === 'next_section',
    );
    expect(section5Msg.session.currentSectionId).toBe('section_5_closing');
    expect(section5Msg.session.currentSectionIndex).toBe(4);
  }

  it('rejects Participant attempt to finish study with FORBIDDEN_LEADER_ONLY', async () => {
    const context = await setupLobby();
    await advanceToSection5(context);

    context.participantPeer.send({
      type: 'finish_study',
      sessionCode: context.sessionCode,
      leaderToken: 'invalid',
      memberId: context.participantMemberId,
    });

    const error = await context.participantPeer.waitFor('session_error');
    expect(error.code).toBe('FORBIDDEN_LEADER_ONLY');
    expect(sessionStore.getActiveSessionCount()).toBe(1);
  });

  it('rejects finish_study with invalid leaderToken with UNAUTHORIZED_LEADER', async () => {
    const context = await setupLobby();
    await advanceToSection5(context);

    const imposterPeer = await connectPeer();
    imposterPeer.send({
      type: 'finish_study',
      sessionCode: context.sessionCode,
      leaderToken: 'completely-wrong-token-abc',
    });

    const error = await imposterPeer.waitFor('session_error');
    expect(error.code).toBe('UNAUTHORIZED_LEADER');
    expect(sessionStore.getActiveSessionCount()).toBe(1);
  });

  it('Study Leader finishes study: broadcasts session_closed with study_completed and purges ephemeral reflections', async () => {
    const context = await setupLobby();
    await advanceToSection5(context);

    // Leader executes finish_study
    context.leaderPeer.send({
      type: 'finish_study',
      sessionCode: context.sessionCode,
      leaderToken: context.leaderToken,
      memberId: context.leaderMemberId,
    });

    const [leaderClose, participantClose] = await Promise.all([
      context.leaderPeer.waitFor('session_closed'),
      context.participantPeer.waitFor('session_closed'),
    ]);

    expect(leaderClose.reason).toBe('study_completed');
    expect(leaderClose.sessionCode).toBe(context.sessionCode);
    expect(participantClose.reason).toBe('study_completed');
    expect(participantClose.sessionCode).toBe(context.sessionCode);

    // Verify session is completely purged from server memory
    expect(sessionStore.getActiveSessionCount()).toBe(0);
    const purged = (sessionStore as any).sessions.get(context.sessionCode);
    expect(purged).toBeUndefined();
  });

  it('close_session with reason study_completed also purges ephemeral reflections', async () => {
    const context = await setupLobby();
    await advanceToSection5(context);

    context.leaderPeer.send({
      type: 'close_session',
      sessionCode: context.sessionCode,
      leaderToken: context.leaderToken,
      memberId: context.leaderMemberId,
      reason: 'study_completed',
    });

    const closeMsg = await context.participantPeer.waitFor('session_closed');
    expect(closeMsg.reason).toBe('study_completed');
    expect(sessionStore.getActiveSessionCount()).toBe(0);
  });
});

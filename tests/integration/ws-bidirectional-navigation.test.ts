import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createAppServer, type AppServer } from '../../src/server/app';
import { LiveSessionStore } from '../../src/server/sessionStore';
import { getDefaultStudyDocument } from '../../src/server/studies/greatIsYourFaithSeed';
import {
  STUDY_SECTION_IDS,
  toSessionStudySummary,
  type ServerWsMessage,
  type StudySectionId,
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

describe('WebSocket Bidirectional Navigation & Turn Resets (protocol v3)', () => {
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

  async function setupSession(seed = getDefaultStudyDocument()) {
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
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      leaderMemberId: created.memberId,
      participantMemberId: joined.memberId,
      leaderPeer,
      participantPeer,
    };
  }

  it('Scenario 1: Study Leader navigates backward from Section 2 to Section 1 over /ws', async () => {
    const ctx = await setupSession();

    // Start study -> Section 1
    ctx.leaderPeer.send({
      type: 'start_study',
      sessionCode: ctx.sessionCode,
      leaderToken: ctx.leaderToken,
    });
    const started = await ctx.leaderPeer.waitFor(
      'session_updated',
      (m) => m.command === 'start_study',
    );
    expect(started.session.currentSectionIndex).toBe(0);
    expect(started.session.currentSectionId).toBe('section_1_prayer');
    expect(started.session.sectionEnteredAt).toBeDefined();

    // Complete Section 1 turn via override
    ctx.leaderPeer.send({
      type: 'override_turn',
      sessionCode: ctx.sessionCode,
      leaderToken: ctx.leaderToken,
    });
    const completedTurn = await ctx.leaderPeer.waitFor(
      'session_updated',
      (m) => m.command === 'override_turn',
    );
    expect(completedTurn.session.completedSectionIds).toContain('section_1_prayer');

    // Advance to Section 2 (Icebreaker)
    ctx.leaderPeer.send({
      type: 'next_section',
      sessionCode: ctx.sessionCode,
      leaderToken: ctx.leaderToken,
    });
    const sec2 = await ctx.leaderPeer.waitFor(
      'session_updated',
      (m) => m.command === 'next_section',
    );
    expect(sec2.session.currentSectionIndex).toBe(1);
    expect(sec2.session.currentSectionId).toBe('section_2_icebreaker');

    // Leader sends previous_section
    ctx.leaderPeer.send({
      type: 'previous_section',
      sessionCode: ctx.sessionCode,
      leaderToken: ctx.leaderToken,
    });
    const prevMsg = await ctx.leaderPeer.waitFor(
      'session_updated',
      (m) => m.command === 'previous_section',
    );
    expect(prevMsg.session.currentSectionIndex).toBe(0);
    expect(prevMsg.session.currentSectionId).toBe('section_1_prayer');
    expect(prevMsg.session.completedSectionIds).toContain('section_1_prayer');

    // Participant also receives the session_updated broadcast
    const partPrevMsg = await ctx.participantPeer.waitFor(
      'session_updated',
      (m) => m.command === 'previous_section',
    );
    expect(partPrevMsg.session.currentSectionIndex).toBe(0);

    // Because Section 1 is in completedSectionIds, next_section is immediately unlocked
    ctx.leaderPeer.send({
      type: 'next_section',
      sessionCode: ctx.sessionCode,
      leaderToken: ctx.leaderToken,
    });
    const reAdvanced = await ctx.leaderPeer.waitFor(
      'session_updated',
      (m) => m.command === 'next_section',
    );
    expect(reAdvanced.session.currentSectionIndex).toBe(1);
    expect(reAdvanced.session.currentSectionId).toBe('section_2_icebreaker');
  });

  it('Scenario 2: Participant attempts to send previous_section or reset_turn are rejected with FORBIDDEN_LEADER_ONLY', async () => {
    const ctx = await setupSession();

    ctx.leaderPeer.send({
      type: 'start_study',
      sessionCode: ctx.sessionCode,
      leaderToken: ctx.leaderToken,
    });
    await ctx.leaderPeer.waitFor(
      'session_updated',
      (m) => m.command === 'start_study',
    );

    // Participant attempts previous_section
    ctx.participantPeer.send({
      type: 'previous_section',
      sessionCode: ctx.sessionCode,
      leaderToken: ctx.leaderToken,
      memberId: ctx.participantMemberId,
    });
    const err1 = await ctx.participantPeer.waitFor('session_error');
    expect(err1.code).toBe('FORBIDDEN_LEADER_ONLY');

    // Participant attempts reset_turn
    ctx.participantPeer.send({
      type: 'reset_turn',
      sessionCode: ctx.sessionCode,
      leaderToken: ctx.leaderToken,
      memberId: ctx.participantMemberId,
    });
    const err2 = await ctx.participantPeer.waitFor('session_error');
    expect(err2.code).toBe('FORBIDDEN_LEADER_ONLY');

    // Invalid leader token
    ctx.leaderPeer.send({
      type: 'previous_section',
      sessionCode: ctx.sessionCode,
      leaderToken: 'invalid_token',
    });
    const err3 = await ctx.leaderPeer.waitFor('session_error');
    expect(err3.code).toBe('UNAUTHORIZED_LEADER');
  });

  it('Scenario 3: Calling previous_section on Section 1 or outside in_progress is rejected', async () => {
    const ctx = await setupSession();

    // In lobby (status !== 'in_progress')
    ctx.leaderPeer.send({
      type: 'previous_section',
      sessionCode: ctx.sessionCode,
      leaderToken: ctx.leaderToken,
    });
    const errLobby = await ctx.leaderPeer.waitFor('session_error');
    expect(errLobby.code).toBe('INVALID_STATE_TRANSITION');
    expect(errLobby.message).toContain('Study must be in progress before navigating sections');

    // Start study -> Section 1 (index 0)
    ctx.leaderPeer.send({
      type: 'start_study',
      sessionCode: ctx.sessionCode,
      leaderToken: ctx.leaderToken,
    });
    await ctx.leaderPeer.waitFor(
      'session_updated',
      (m) => m.command === 'start_study',
    );

    // Attempt previous_section on Section 1
    ctx.leaderPeer.send({
      type: 'previous_section',
      sessionCode: ctx.sessionCode,
      leaderToken: ctx.leaderToken,
    });
    const errSec1 = await ctx.leaderPeer.waitFor('session_error');
    expect(errSec1.code).toBe('INVALID_STATE_TRANSITION');
    expect(errSec1.message).toContain('Session is already on the initial study section');
  });

  it('Scenario 4: Study Leader resets volunteer turn on a completed gated section (reset_turn)', async () => {
    const ctx = await setupSession();

    ctx.leaderPeer.send({
      type: 'start_study',
      sessionCode: ctx.sessionCode,
      leaderToken: ctx.leaderToken,
    });
    await ctx.leaderPeer.waitFor(
      'session_updated',
      (m) => m.command === 'start_study',
    );

    // Complete Section 1 turn
    ctx.leaderPeer.send({
      type: 'override_turn',
      sessionCode: ctx.sessionCode,
      leaderToken: ctx.leaderToken,
    });
    const completedTurn = await ctx.leaderPeer.waitFor(
      'session_updated',
      (m) => m.command === 'override_turn',
    );
    expect(completedTurn.session.completedSectionIds).toContain('section_1_prayer');

    // Reset turn
    ctx.leaderPeer.send({
      type: 'reset_turn',
      sessionCode: ctx.sessionCode,
      leaderToken: ctx.leaderToken,
    });
    const resetMsg = await ctx.leaderPeer.waitFor(
      'session_updated',
      (m) => m.command === 'reset_turn',
    );
    expect(resetMsg.session.completedSectionIds).not.toContain('section_1_prayer');
    expect(resetMsg.session.volunteerTurn?.completedAt).toBeNull();
    expect(resetMsg.session.volunteerTurn?.selectedMemberId).toBeNull();

    // Now forward advance must be rejected again because the turn is re-locked
    ctx.leaderPeer.send({
      type: 'next_section',
      sessionCode: ctx.sessionCode,
      leaderToken: ctx.leaderToken,
    });
    const lockedErr = await ctx.leaderPeer.waitFor('session_error');
    expect(lockedErr.code).toBe('INVALID_STATE_TRANSITION');
    expect(lockedErr.message).toContain('The Opening Prayer turn must be completed before advancing');
  });

  it('Scenario 5: reset_turn on non-gated section is rejected', async () => {
    const ctx = await setupSession();

    ctx.leaderPeer.send({
      type: 'start_study',
      sessionCode: ctx.sessionCode,
      leaderToken: ctx.leaderToken,
    });
    await ctx.leaderPeer.waitFor('session_updated', (m) => m.command === 'start_study');
    ctx.leaderPeer.send({
      type: 'override_turn',
      sessionCode: ctx.sessionCode,
      leaderToken: ctx.leaderToken,
    });
    await ctx.leaderPeer.waitFor('session_updated', (m) => m.command === 'override_turn');

    // Advance to Section 2 (Icebreaker)
    ctx.leaderPeer.send({
      type: 'next_section',
      sessionCode: ctx.sessionCode,
      leaderToken: ctx.leaderToken,
    });
    await ctx.leaderPeer.waitFor('session_updated', (m) => m.command === 'next_section');

    // Advance to Section 3 (Reading)
    ctx.leaderPeer.send({
      type: 'next_section',
      sessionCode: ctx.sessionCode,
      leaderToken: ctx.leaderToken,
    });
    await ctx.leaderPeer.waitFor('session_updated', (m) => m.command === 'next_section');
    ctx.leaderPeer.send({
      type: 'override_turn',
      sessionCode: ctx.sessionCode,
      leaderToken: ctx.leaderToken,
    });
    await ctx.leaderPeer.waitFor('session_updated', (m) => m.command === 'override_turn');

    // Advance to Section 4 (Deep Analysis)
    ctx.leaderPeer.send({
      type: 'next_section',
      sessionCode: ctx.sessionCode,
      leaderToken: ctx.leaderToken,
    });
    const sec4 = await ctx.leaderPeer.waitFor('session_updated', (m) => m.command === 'next_section');
    expect(sec4.session.currentSectionId).toBe('section_4_deep_analysis');

    // Calling reset_turn on Section 4 must be rejected
    ctx.leaderPeer.send({
      type: 'reset_turn',
      sessionCode: ctx.sessionCode,
      leaderToken: ctx.leaderToken,
    });
    const err = await ctx.leaderPeer.waitFor('session_error');
    expect(err.code).toBe('INVALID_STATE_TRANSITION');
    expect(err.message).toContain('Volunteer turn can only be reset on interactive volunteer sections');
  });

  it('Scenario 6: Full 6-section forward and backward navigation preserves state and turn history', async () => {
    const ctx = await setupSession();

    // Start -> Section 1 (index 0)
    ctx.leaderPeer.send({ type: 'start_study', sessionCode: ctx.sessionCode, leaderToken: ctx.leaderToken });
    await ctx.leaderPeer.waitFor('session_updated', (m) => m.command === 'start_study');

    // Complete Section 1
    ctx.leaderPeer.send({ type: 'override_turn', sessionCode: ctx.sessionCode, leaderToken: ctx.leaderToken });
    await ctx.leaderPeer.waitFor('session_updated', (m) => m.command === 'override_turn');

    // Advance to Section 2 (Icebreaker, index 1)
    ctx.leaderPeer.send({ type: 'next_section', sessionCode: ctx.sessionCode, leaderToken: ctx.leaderToken });
    const s2 = await ctx.leaderPeer.waitFor('session_updated', (m) => m.command === 'next_section');
    expect(s2.session.currentSectionIndex).toBe(1);
    expect(s2.session.currentSectionId).toBe('section_2_icebreaker');

    // Advance to Section 3 (Reading, index 2)
    ctx.leaderPeer.send({ type: 'next_section', sessionCode: ctx.sessionCode, leaderToken: ctx.leaderToken });
    const s3 = await ctx.leaderPeer.waitFor('session_updated', (m) => m.command === 'next_section');
    expect(s3.session.currentSectionIndex).toBe(2);
    expect(s3.session.currentSectionId).toBe('section_3_reading');

    // Complete Section 3
    ctx.leaderPeer.send({ type: 'override_turn', sessionCode: ctx.sessionCode, leaderToken: ctx.leaderToken });
    await ctx.leaderPeer.waitFor('session_updated', (m) => m.command === 'override_turn');

    // Advance to Section 4 (Deep Analysis, index 3)
    ctx.leaderPeer.send({ type: 'next_section', sessionCode: ctx.sessionCode, leaderToken: ctx.leaderToken });
    const s4 = await ctx.leaderPeer.waitFor('session_updated', (m) => m.command === 'next_section');
    expect(s4.session.currentSectionIndex).toBe(3);
    expect(s4.session.currentSectionId).toBe('section_4_deep_analysis');

    // Advance to Section 5 (Discussion, index 4)
    ctx.leaderPeer.send({ type: 'next_section', sessionCode: ctx.sessionCode, leaderToken: ctx.leaderToken });
    const s5 = await ctx.leaderPeer.waitFor('session_updated', (m) => m.command === 'next_section');
    expect(s5.session.currentSectionIndex).toBe(4);
    expect(s5.session.currentSectionId).toBe('section_5_discussion');
    expect(s5.session.discussionState).toBeDefined();

    // Advance to Section 6 (Closing, index 5)
    ctx.leaderPeer.send({ type: 'next_section', sessionCode: ctx.sessionCode, leaderToken: ctx.leaderToken });
    const s6 = await ctx.leaderPeer.waitFor('session_updated', (m) => m.command === 'next_section');
    expect(s6.session.currentSectionIndex).toBe(5);
    expect(s6.session.currentSectionId).toBe('section_6_closing');

    // Calling next_section on Section 6 is rejected (already on final section)
    ctx.leaderPeer.send({ type: 'next_section', sessionCode: ctx.sessionCode, leaderToken: ctx.leaderToken });
    const finalErr = await ctx.leaderPeer.waitFor('session_error');
    expect(finalErr.code).toBe('INVALID_STATE_TRANSITION');
    expect(finalErr.message).toContain('Session is already on the final study section');

    // Navigate backward across all sections: 6 -> 5 -> 4 -> 3 -> 2 -> 1
    const expectedBackward: Array<{ index: number; id: StudySectionId }> = [
      { index: 4, id: 'section_5_discussion' },
      { index: 3, id: 'section_4_deep_analysis' },
      { index: 2, id: 'section_3_reading' },
      { index: 1, id: 'section_2_icebreaker' },
      { index: 0, id: 'section_1_prayer' },
    ];

    for (const step of expectedBackward) {
      ctx.leaderPeer.send({
        type: 'previous_section',
        sessionCode: ctx.sessionCode,
        leaderToken: ctx.leaderToken,
      });
      const backMsg = await ctx.leaderPeer.waitFor(
        'session_updated',
        (m) => m.command === 'previous_section',
      );
      expect(backMsg.session.currentSectionIndex).toBe(step.index);
      expect(backMsg.session.currentSectionId).toBe(step.id);
    }
  });
});

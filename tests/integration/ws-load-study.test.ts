import { WebSocket } from 'ws';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LiveSessionStore } from '../../src/server/sessionStore';
import { createAppServer, type AppServer } from '../../src/server/app';
import {
  DEFAULT_SESSION_TTL_MS,
  SESSION_PROTOCOL_VERSION,
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
    subtitle: 'From persistence to trust',
    liturgicalEyebrow: 'Gospel Reading',
    gospelCitation: 'Matthew 15:21–28',
    gospelSummaryLabel: 'Gospel of Matthew 15:21–28',
    sectionCount: 5,
    estimatedMinutes: 45,
  };
}

describe('WebSocket load_study / start_study leader gating (protocol v2)', () => {
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

  it('load_study stores the summary, broadcasts it sanitized, and serves it to later peers with protocolVersion 2', async () => {
    const { leader, created } = await createLeader();
    const summary = createStudySummary();

    leader.send({
      type: 'load_study',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'ls-1',
      study: summary,
    });

    const updated = await leader.waitFor(
      'session_updated',
      (msg) => msg.command === 'load_study',
    );
    expect(updated.session.study).toMatchObject({
      title: 'Great Is Your Faith',
      gospelCitation: 'Matthew 15:21–28',
      gospelSummaryLabel: 'Gospel of Matthew 15:21–28',
      estimatedMinutes: 45,
      sectionCount: 5,
    });
    expect(updated.session.protocolVersion).toBe(SESSION_PROTOCOL_VERSION);
    const updatedJson = JSON.stringify(updated.session);
    expect(updatedJson).not.toContain(created.leaderPin);
    expect(updatedJson).not.toContain(created.leaderToken);
    expect(updatedJson).not.toContain(created.reconnectToken);

    // A later peer receives the study summary inside its session_joined snapshot.
    const { participant, joined } = await joinParticipant(
      created.sessionCode,
      'Blake',
    );
    expect(joined.session.study).toMatchObject({
      title: 'Great Is Your Faith',
      gospelCitation: 'Matthew 15:21–28',
    });
    expect(joined.session.protocolVersion).toBe(SESSION_PROTOCOL_VERSION);
    const joinedJson = JSON.stringify(joined.session);
    expect(joinedJson).not.toContain(created.leaderPin);
    expect(joinedJson).not.toContain(created.leaderToken);
    expect(joinedJson).not.toContain(created.reconnectToken);

    // Snapshots are deep copies: mutating one does not affect later snapshots.
    if (joined.session.study) {
      joined.session.study.title = 'Mutated By Client';
    }
    const participant2 = await connectPeer();
    participant2.send({
      type: 'join_session',
      sessionCode: created.sessionCode,
      displayName: 'Cameron',
      requestId: 'join-cameron',
    });
    const joined2 = await participant2.waitFor('session_joined');
    expect(joined2.session.study?.title).toBe('Great Is Your Faith');
    expect(joined2.session.study).not.toBe(joined.session.study);

    // Reconnected peers also receive the study summary.
    await participant.close();
    const reconnected = await connectPeer();
    reconnected.send({
      type: 'reconnect_session',
      sessionCode: created.sessionCode,
      memberId: joined.memberId,
      reconnectToken: joined.reconnectToken,
      requestId: 'rc-1',
    });
    const resumed = await reconnected.waitFor('session_reconnected');
    expect(resumed.session.study).toMatchObject({
      title: 'Great Is Your Faith',
      gospelCitation: 'Matthew 15:21–28',
    });
    expect(resumed.session.protocolVersion).toBe(SESSION_PROTOCOL_VERSION);
  });

  it('rejects load_study from Participants and from a wrong leaderToken', async () => {
    const { leader, created } = await createLeader();
    const { participant } = await joinParticipant(created.sessionCode, 'Blake');

    participant.send({
      type: 'load_study',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'ls-participant',
      study: createStudySummary(),
    });
    const denied = await participant.waitFor('session_error');
    expect(denied.requestId).toBe('ls-participant');
    expect(denied.code).toBe('FORBIDDEN_LEADER_ONLY');

    leader.send({
      type: 'load_study',
      sessionCode: created.sessionCode,
      leaderToken: `${created.leaderToken}-wrong`,
      memberId: created.memberId,
      requestId: 'ls-wrong-token',
      study: createStudySummary(),
    });
    const unauthorized = await leader.waitFor('session_error');
    expect(unauthorized.requestId).toBe('ls-wrong-token');
    expect(unauthorized.code).toBe('UNAUTHORIZED_LEADER');
  });

  it('rejects malformed study summaries with INVALID_MESSAGE and leaves state unchanged', async () => {
    const { leader, created } = await createLeader();

    const blankTitle = {
      ...createStudySummary(),
      title: '   ',
    };
    leader.send({
      type: 'load_study',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'ls-blank-title',
      study: blankTitle as unknown as SessionStudySummary,
    });
    const blankTitleError = await leader.waitFor('session_error');
    expect(blankTitleError.requestId).toBe('ls-blank-title');
    expect(blankTitleError.code).toBe('INVALID_MESSAGE');

    const fourSections = {
      ...createStudySummary(),
      sectionCount: 4,
    };
    leader.send({
      type: 'load_study',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'ls-four-sections',
      study: fourSections as unknown as SessionStudySummary,
    });
    const fourSectionsError = await leader.waitFor('session_error');
    expect(fourSectionsError.requestId).toBe('ls-four-sections');
    expect(fourSectionsError.code).toBe('INVALID_MESSAGE');

    const zeroMinutes = {
      ...createStudySummary(),
      estimatedMinutes: 0,
    };
    leader.send({
      type: 'load_study',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'ls-zero-minutes',
      study: zeroMinutes as unknown as SessionStudySummary,
    });
    const zeroMinutesError = await leader.waitFor('session_error');
    expect(zeroMinutesError.requestId).toBe('ls-zero-minutes');
    expect(zeroMinutesError.code).toBe('INVALID_MESSAGE');

    // State remains in setup with no study attached after all rejections.
    leader.send({
      type: 'load_study',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'ls-valid',
      study: createStudySummary(),
    });
    const updated = await leader.waitFor(
      'session_updated',
      (msg) => msg.command === 'load_study',
    );
    expect(updated.session.status).toBe('setup');
    expect(updated.session.study?.title).toBe('Great Is Your Faith');
  });

  it('start_study is leader-only, moves the session to Section 1, and blocks later load_study commands', async () => {
    const { leader, created } = await createLeader();
    const { participant } = await joinParticipant(created.sessionCode, 'Blake');

    participant.send({
      type: 'start_study',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'ss-participant',
    });
    const denied = await participant.waitFor('session_error');
    expect(denied.requestId).toBe('ss-participant');
    expect(denied.code).toBe('FORBIDDEN_LEADER_ONLY');

    leader.send({
      type: 'start_study',
      sessionCode: created.sessionCode,
      leaderToken: `${created.leaderToken}-wrong`,
      memberId: created.memberId,
      requestId: 'ss-wrong-token',
    });
    const unauthorized = await leader.waitFor('session_error');
    expect(unauthorized.requestId).toBe('ss-wrong-token');
    expect(unauthorized.code).toBe('UNAUTHORIZED_LEADER');

    leader.send({
      type: 'start_study',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'ss-1',
    });
    const started = await leader.waitFor(
      'session_updated',
      (msg) => msg.command === 'start_study',
    );
    expect(started.session.status).toBe('in_progress');
    expect(started.session.currentSectionIndex).toBe(0);
    expect(started.session.currentSectionId).toBe('section_1_prayer');

    // load_study is only valid in setup|lobby: it must now be rejected.
    leader.send({
      type: 'load_study',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'ls-after-start',
      study: createStudySummary(),
    });
    const lateLoad = await leader.waitFor('session_error');
    expect(lateLoad.requestId).toBe('ls-after-start');
    expect(lateLoad.code).toBe('INVALID_STATE_TRANSITION');
  });

  it('load_study is also valid in the lobby state (after open_lobby)', async () => {
    const { leader, created } = await createLeader();

    leader.send({
      type: 'open_lobby',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'ol-1',
    });
    const lobby = await leader.waitFor(
      'session_updated',
      (msg) => msg.command === 'open_lobby',
    );
    expect(lobby.session.status).toBe('lobby');

    leader.send({
      type: 'load_study',
      sessionCode: created.sessionCode,
      leaderToken: created.leaderToken,
      memberId: created.memberId,
      requestId: 'ls-in-lobby',
      study: createStudySummary(),
    });
    const updated = await leader.waitFor(
      'session_updated',
      (msg) => msg.command === 'load_study',
    );
    expect(updated.session.status).toBe('lobby');
    expect(updated.session.study?.gospelCitation).toBe('Matthew 15:21–28');
  });
});

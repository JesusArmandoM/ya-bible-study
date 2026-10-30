import { describe, expect, it } from 'vitest';
import {
  clearStoredSessionCredentials,
  createSessionSocketClient,
  loadStoredSessionCredentials,
  saveStoredSessionCredentials,
  SESSION_CREDENTIALS_STORAGE_KEY,
  SessionSocketError,
  type StorageLike,
  type StoredSessionCredentials,
  type WebSocketCloseEventLike,
  type WebSocketLike,
  type WebSocketMessageEventLike,
} from '../../src/client/lib/sessionSocket';
import { LiveSessionStore, type SessionPeerSocket } from '../../src/server/sessionStore';
import {
  AVATAR_PALETTES,
  DEFAULT_SESSION_TTL_MS,
  deriveInitials,
  isValidLeaderPin,
  isValidSessionCode,
  normalizeLeaderPin,
  normalizeSessionCode,
  type ServerWsMessage,
} from '../../src/shared/session';

class InMemoryStorage implements StorageLike {
  private readonly store = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  public removeItem(key: string): void {
    this.store.delete(key);
  }
}

class MockStorePeerSocket implements SessionPeerSocket {
  public readyState = 1;
  public readonly sentMessages: ServerWsMessage[] = [];

  public send(data: string): void {
    this.sentMessages.push(JSON.parse(data) as ServerWsMessage);
  }
}

class LoopbackClientSocket implements WebSocketLike {
  public readyState = 0;
  public readonly url: string;
  private readonly store: LiveSessionStore;
  private readonly openListeners = new Set<() => void>();
  private readonly messageListeners = new Set<
    (event: WebSocketMessageEventLike) => void
  >();
  private readonly closeListeners = new Set<
    (event: WebSocketCloseEventLike) => void
  >();
  private readonly errorListeners = new Set<(event: unknown) => void>();
  public readonly peer: SessionPeerSocket;

  public constructor(url: string, store: LiveSessionStore) {
    this.url = url;
    this.store = store;
    this.peer = {
      get readyState() {
        return 1;
      },
      send: (data: string) => {
        if (this.readyState !== 1) {
          return;
        }
        for (const listener of this.messageListeners) {
          listener({ data });
        }
      },
    };

    queueMicrotask(() => {
      if (this.readyState !== 0) {
        return;
      }
      this.readyState = 1;
      for (const listener of this.openListeners) {
        listener();
      }
    });
  }

  public send(data: string): void {
    const parsed = JSON.parse(data) as { type?: string; requestId?: string };
    if (parsed.type === 'ping') {
      const pong: ServerWsMessage = {
        type: 'pong',
        timestamp: '2026-10-29T19:30:00.000Z',
        ...(parsed.requestId ? { requestId: parsed.requestId } : {}),
      };
      this.peer.send(JSON.stringify(pong));
      return;
    }
    this.store.handleMessage(this.peer, parsed);
  }

  public close(code = 1000, reason = ''): void {
    if (this.readyState === 3) {
      return;
    }
    this.readyState = 3;
    this.store.handleSocketClose(this.peer);
    for (const listener of this.closeListeners) {
      listener({ code, reason });
    }
  }

  public addEventListener(type: 'open', listener: () => void): void;
  public addEventListener(
    type: 'message',
    listener: (event: WebSocketMessageEventLike) => void,
  ): void;
  public addEventListener(
    type: 'close',
    listener: (event: WebSocketCloseEventLike) => void,
  ): void;
  public addEventListener(
    type: 'error',
    listener: (event: unknown) => void,
  ): void;
  public addEventListener(type: string, listener: unknown): void {
    if (type === 'open') {
      this.openListeners.add(listener as () => void);
    } else if (type === 'message') {
      this.messageListeners.add(
        listener as (event: WebSocketMessageEventLike) => void,
      );
    } else if (type === 'close') {
      this.closeListeners.add(
        listener as (event: WebSocketCloseEventLike) => void,
      );
    } else if (type === 'error') {
      this.errorListeners.add(listener as (event: unknown) => void);
    }
  }

  public removeEventListener(type: 'open', listener: () => void): void;
  public removeEventListener(
    type: 'message',
    listener: (event: WebSocketMessageEventLike) => void,
  ): void;
  public removeEventListener(
    type: 'close',
    listener: (event: WebSocketCloseEventLike) => void,
  ): void;
  public removeEventListener(
    type: 'error',
    listener: (event: unknown) => void,
  ): void;
  public removeEventListener(type: string, listener: unknown): void {
    if (type === 'open') {
      this.openListeners.delete(listener as () => void);
    } else if (type === 'message') {
      this.messageListeners.delete(
        listener as (event: WebSocketMessageEventLike) => void,
      );
    } else if (type === 'close') {
      this.closeListeners.delete(
        listener as (event: WebSocketCloseEventLike) => void,
      );
    } else if (type === 'error') {
      this.errorListeners.delete(listener as (event: unknown) => void);
    }
  }
}

describe('shared session validation and avatar helpers', () => {
  it('normalizes and validates 6-character session codes and 4-digit leader PINs', () => {
    expect(normalizeSessionCode('  ab3k9z ')).toBe('AB3K9Z');
    expect(isValidSessionCode('AB3K9Z')).toBe(true);
    expect(isValidSessionCode('AB3K9')).toBe(false);
    expect(isValidSessionCode('AB3K9Z7')).toBe(false);
    expect(isValidSessionCode('AB3-9Z')).toBe(false);

    expect(normalizeLeaderPin(' 0429 ')).toBe('0429');
    expect(isValidLeaderPin('0429')).toBe(true);
    expect(isValidLeaderPin('429')).toBe(false);
    expect(isValidLeaderPin('12A4')).toBe(false);
  });

  it('derives centered 2-letter uppercase initials while ignoring duplicate suffixes', () => {
    expect(deriveInitials('Claire')).toBe('CL');
    expect(deriveInitials('Mary Lopez')).toBe('ML');
    expect(deriveInitials('Fr. Marco')).toBe('FM');
    expect(deriveInitials('Daniel')).toBe('DA');
    expect(deriveInitials('Daniel (2)')).toBe('DA');
    expect(deriveInitials('A')).toBe('AA');
    expect(AVATAR_PALETTES).toEqual([
      'gold',
      'indigo',
      'violet',
      'emerald',
      'terracotta',
    ]);
  });
});

describe('createSessionSocketClient dynamic ws(s):// resolution and sessionStorage scoping', () => {
  it('resolves ws:// on http: origins and wss:// on https: origins without hardcoding localhost', async () => {
    const store = new LiveSessionStore({ sweepIntervalMs: false });
    const openedUrls: string[] = [];

    const lanClient = createSessionSocketClient({
      location: { protocol: 'http:', host: '192.168.1.42:3102' },
      persistCredentials: false,
      createWebSocket: (url) => {
        openedUrls.push(url);
        return new LoopbackClientSocket(url, store);
      },
    });

    const tunnelClient = createSessionSocketClient({
      location: { protocol: 'https:', host: 'faith-study.trycloudflare.com' },
      persistCredentials: false,
      createWebSocket: (url) => {
        openedUrls.push(url);
        return new LoopbackClientSocket(url, store);
      },
    });

    expect(lanClient.getWsUrl()).toBe('ws://192.168.1.42:3102/ws');
    expect(tunnelClient.getWsUrl()).toBe(
      'wss://faith-study.trycloudflare.com/ws',
    );

    const pong = await lanClient.ping();
    expect(pong.type).toBe('pong');

    const created = await tunnelClient.createSession({ displayName: 'Claire' });
    expect(created.role).toBe('Study Leader');
    expect(openedUrls).toEqual([
      'ws://192.168.1.42:3102/ws',
      'wss://faith-study.trycloudflare.com/ws',
    ]);

    lanClient.disconnect();
    tunnelClient.disconnect();
    store.dispose();
  });

  it('scopes sessionStorage credentials strictly by role and never persists leaderPin or leader secrets on Participant clients', async () => {
    const store = new LiveSessionStore({ sweepIntervalMs: false });
    const leaderStorage = new InMemoryStorage();
    const participantStorage = new InMemoryStorage();

    const leaderClient = createSessionSocketClient({
      location: { protocol: 'https:', host: 'parish.example.org' },
      storage: leaderStorage,
      createWebSocket: (url) => new LoopbackClientSocket(url, store),
    });

    const participantClient = createSessionSocketClient({
      location: { protocol: 'https:', host: 'parish.example.org' },
      storage: participantStorage,
      createWebSocket: (url) => new LoopbackClientSocket(url, store),
    });

    const created = await leaderClient.createSession({ displayName: 'Claire' });
    const rawLeaderStored = leaderStorage.getItem(
      SESSION_CREDENTIALS_STORAGE_KEY,
    );
    expect(rawLeaderStored).not.toBeNull();
    expect(rawLeaderStored).not.toContain(created.leaderPin);

    const parsedLeaderStored = loadStoredSessionCredentials(leaderStorage);
    expect(parsedLeaderStored).toEqual({
      sessionCode: created.sessionCode,
      memberId: created.memberId,
      role: 'Study Leader',
      reconnectToken: created.reconnectToken,
      leaderToken: created.leaderToken,
    });

    const joined = await participantClient.joinSession({
      sessionCode: created.sessionCode.toLowerCase(),
      displayName: 'Daniel',
    });
    const rawParticipantStored = participantStorage.getItem(
      SESSION_CREDENTIALS_STORAGE_KEY,
    );
    expect(rawParticipantStored).not.toBeNull();
    expect(rawParticipantStored).not.toContain('leaderToken');
    expect(rawParticipantStored).not.toContain('leaderPin');
    expect(rawParticipantStored).not.toContain(created.leaderToken);

    expect(loadStoredSessionCredentials(participantStorage)).toEqual({
      sessionCode: created.sessionCode,
      memberId: joined.memberId,
      role: 'Participant',
      reconnectToken: joined.reconnectToken,
    });

    // Even if extra fields are forcefully passed into saveStoredSessionCredentials for a Participant, they are stripped.
    saveStoredSessionCredentials(
      {
        sessionCode: created.sessionCode,
        memberId: joined.memberId,
        role: 'Participant',
        reconnectToken: joined.reconnectToken,
        leaderToken: 'should-be-stripped',
        leaderPin: '9999',
      } as StoredSessionCredentials,
      participantStorage,
    );
    expect(loadStoredSessionCredentials(participantStorage)).toEqual({
      sessionCode: created.sessionCode,
      memberId: joined.memberId,
      role: 'Participant',
      reconnectToken: joined.reconnectToken,
    });

    await expect(
      participantClient.sendLeaderCommand({ type: 'start_study' }),
    ).rejects.toMatchObject({
      name: 'SessionSocketError',
      code: 'FORBIDDEN_LEADER_ONLY',
    } satisfies Partial<SessionSocketError>);

    // Closing the session clears stored credentials on connected clients.
    await leaderClient.sendLeaderCommand({ type: 'close_session' });
    expect(loadStoredSessionCredentials(leaderStorage)).toBeNull();
    expect(loadStoredSessionCredentials(participantStorage)).toBeNull();

    clearStoredSessionCredentials(leaderStorage);
    leaderClient.disconnect();
    participantClient.disconnect();
    store.dispose();
  });
});

describe('sessionSocket turn commands (protocol v3 hand-raise framing)', () => {
  it('frames raise_hand / lower_hand with the participant memberId and resolves on session_updated', async () => {
    const store = new LiveSessionStore({ sweepIntervalMs: false });
    const leaderClient = createSessionSocketClient({
      location: { protocol: 'https:', host: 'parish.example.org' },
      storage: new InMemoryStorage(),
      createWebSocket: (url) => new LoopbackClientSocket(url, store),
    });
    const participantClient = createSessionSocketClient({
      location: { protocol: 'https:', host: 'parish.example.org' },
      storage: new InMemoryStorage(),
      createWebSocket: (url) => new LoopbackClientSocket(url, store),
    });

    const created = await leaderClient.createSession({ displayName: 'Claire' });
    const joined = await participantClient.joinSession({
      sessionCode: created.sessionCode,
      displayName: 'Daniel',
    });
    await leaderClient.sendLeaderCommand({ type: 'start_study' });

    if (!participantClient.sendTurnCommand) {
      throw new Error('sendTurnCommand must be implemented by the client.');
    }

    const raised = await participantClient.sendTurnCommand({
      type: 'raise_hand',
    });
    expect(raised.command).toBe('raise_hand');
    expect(raised.session.volunteerTurn?.mode).toBe('gated_prayer');
    expect(raised.session.volunteerTurn?.raisedHands).toEqual([
      { memberId: joined.memberId, raisedAt: expect.any(String) },
    ]);
    // Reserved follow-up fields stay null in this feature.
    expect(raised.session.volunteerTurn?.candidateMemberId).toBeNull();
    expect(raised.session.volunteerTurn?.candidateExpiresAt).toBeNull();
    expect(raised.session.volunteerTurn?.selectedMemberId).toBeNull();
    expect(raised.session.volunteerTurn?.completedAt).toBeNull();

    // Idempotent re-raise keeps a single row with the original raisedAt.
    const raisedAgain = await participantClient.sendTurnCommand({
      type: 'raise_hand',
    });
    expect(raisedAgain.session.volunteerTurn?.raisedHands).toHaveLength(1);
    expect(raisedAgain.session.volunteerTurn?.raisedHands[0]?.raisedAt).toBe(
      raised.session.volunteerTurn?.raisedHands[0]?.raisedAt,
    );

    const lowered = await participantClient.sendTurnCommand({
      type: 'lower_hand',
    });
    expect(lowered.command).toBe('lower_hand');
    expect(lowered.session.volunteerTurn?.raisedHands).toEqual([]);

    // clear_hands with a target frames targetMemberId and clears just that hand.
    await participantClient.sendTurnCommand({ type: 'raise_hand' });
    const cleared = await leaderClient.sendLeaderCommand({
      type: 'clear_hands',
      targetMemberId: joined.memberId,
    });
    if (cleared.type !== 'session_updated') {
      throw new Error('clear_hands must resolve on session_updated.');
    }
    expect(cleared.command).toBe('clear_hands');
    expect(cleared.session.volunteerTurn?.raisedHands).toEqual([]);

    await leaderClient.sendLeaderCommand({ type: 'close_session' });
    leaderClient.disconnect();
    participantClient.disconnect();
    store.dispose();
  });

  it('rejects turn commands without a resolvable participant memberId', async () => {
    const store = new LiveSessionStore({ sweepIntervalMs: false });
    const unboundClient = createSessionSocketClient({
      location: { protocol: 'https:', host: 'parish.example.org' },
      storage: new InMemoryStorage(),
      createWebSocket: (url) => new LoopbackClientSocket(url, store),
    });

    if (!unboundClient.sendTurnCommand) {
      throw new Error('sendTurnCommand must be implemented by the client.');
    }

    await expect(
      unboundClient.sendTurnCommand({ type: 'raise_hand' }),
    ).rejects.toThrow(/memberId/);

    unboundClient.disconnect();
    store.dispose();
  });
});

describe('LiveSessionStore deterministic collision, reconnect guard, and 4-hour TTL behavior', () => {
  it('retries colliding sessionCode values until allocating a unique code', () => {
    const sequence = ['FAITH2', 'FAITH2', 'GRACE7'];
    let idx = 0;
    const store = new LiveSessionStore({
      sweepIntervalMs: false,
      generateSessionCode: () => sequence[idx++] ?? 'MERCY9',
    });

    const leaderA = new MockStorePeerSocket();
    const leaderB = new MockStorePeerSocket();

    store.handleMessage(leaderA, {
      type: 'create_session',
      displayName: 'Claire',
    });
    store.handleMessage(leaderB, {
      type: 'create_session',
      displayName: 'Marco',
    });

    expect(leaderA.sentMessages[0]).toMatchObject({
      type: 'session_created',
      sessionCode: 'FAITH2',
    });
    expect(leaderB.sentMessages[0]).toMatchObject({
      type: 'session_created',
      sessionCode: 'GRACE7',
    });
    expect(store.getActiveSessionCount()).toBe(2);
    store.dispose();
  });

  it('ignores stale socket close events after a member has already reconnected on a new socket', () => {
    const store = new LiveSessionStore({ sweepIntervalMs: false });
    const leaderSocket = new MockStorePeerSocket();
    const oldParticipantSocket = new MockStorePeerSocket();
    const newParticipantSocket = new MockStorePeerSocket();

    store.handleMessage(leaderSocket, {
      type: 'create_session',
      displayName: 'Claire',
    });
    const created = leaderSocket.sentMessages[0] as Extract<
      ServerWsMessage,
      { type: 'session_created' }
    >;

    store.handleMessage(oldParticipantSocket, {
      type: 'join_session',
      sessionCode: created.sessionCode,
      displayName: 'Sara',
    });
    const joined = oldParticipantSocket.sentMessages[0] as Extract<
      ServerWsMessage,
      { type: 'session_joined' }
    >;

    // Reconnect Sara on a fresh socket BEFORE the old mobile socket finishes closing.
    store.handleMessage(newParticipantSocket, {
      type: 'reconnect_session',
      sessionCode: created.sessionCode,
      memberId: joined.memberId,
      reconnectToken: joined.reconnectToken,
    });

    // Now the stale socket closes late.
    store.handleSocketClose(oldParticipantSocket);

    const snapshot = store.getPublicSessionSnapshot(created.sessionCode);
    expect(snapshot?.connectedMemberCount).toBe(2);
    expect(
      snapshot?.members.find((m) => m.memberId === joined.memberId)
        ?.connectionStatus,
    ).toBe('connected');

    store.dispose();
  });

  it('enforces the 4-hour (14,400,000 ms) inactivity TTL, emits session_closed, and resets TTL on room activity', () => {
    let currentNow = 1_700_000_000_000;
    const store = new LiveSessionStore({
      now: () => currentNow,
      sessionTtlMs: DEFAULT_SESSION_TTL_MS,
      sweepIntervalMs: false,
    });

    expect(DEFAULT_SESSION_TTL_MS).toBe(14_400_000);

    const leaderSocket = new MockStorePeerSocket();
    const participantSocket = new MockStorePeerSocket();

    store.handleMessage(leaderSocket, {
      type: 'create_session',
      displayName: 'Claire',
    });
    const created = leaderSocket.sentMessages[0] as Extract<
      ServerWsMessage,
      { type: 'session_created' }
    >;

    // Advance 3 hours: join_session updates lastActivityAt.
    currentNow += 3 * 60 * 60 * 1000;
    store.handleMessage(participantSocket, {
      type: 'join_session',
      sessionCode: created.sessionCode,
      displayName: 'Daniel',
    });
    expect(store.getActiveSessionCount()).toBe(1);

    // 4 hours minus 1ms after the join: still active!
    currentNow += DEFAULT_SESSION_TTL_MS - 1;
    expect(store.sweepExpiredSessions()).toEqual([]);
    expect(store.getActiveSessionCount()).toBe(1);

    // 1ms later (exact 4-hour inactivity mark): purged with session_closed broadcast!
    currentNow += 1;
    expect(store.sweepExpiredSessions()).toEqual([created.sessionCode]);
    expect(store.getActiveSessionCount()).toBe(0);

    expect(leaderSocket.sentMessages.at(-1)).toEqual({
      type: 'session_closed',
      sessionCode: created.sessionCode,
      reason: 'expired_inactivity',
    });
    expect(participantSocket.sentMessages.at(-1)).toEqual({
      type: 'session_closed',
      sessionCode: created.sessionCode,
      reason: 'expired_inactivity',
    });

    store.dispose();
  });
});

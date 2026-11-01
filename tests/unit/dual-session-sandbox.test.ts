// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createInMemoryStorage,
  DEFAULT_REHEARSAL_PARTICIPANTS,
  initializeRehearsalSession,
  addParticipantToRehearsal,
  exitRehearsalSession,
  useDualSessionSandbox,
} from '../../src/client/lib/dualSessionSandbox';
import type {
  WebSocketCloseEventLike,
  WebSocketLike,
  WebSocketMessageEventLike,
} from '../../src/client/lib/sessionSocket';
import { LiveSessionStore, type SessionPeerSocket } from '../../src/server/sessionStore';
import { getDefaultStudyDocument } from '../../src/server/studies/greatIsYourFaithSeed';
import type { ServerWsMessage } from '../../src/shared/session';

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

  public addEventListener(type: string, listener: (...args: any[]) => void): void {
    if (type === 'open') this.openListeners.add(listener);
    if (type === 'message') this.messageListeners.add(listener);
    if (type === 'close') this.closeListeners.add(listener);
    if (type === 'error') this.errorListeners.add(listener);
  }

  public removeEventListener(type: string, listener: (...args: any[]) => void): void {
    if (type === 'open') this.openListeners.delete(listener);
    if (type === 'message') this.messageListeners.delete(listener);
    if (type === 'close') this.closeListeners.delete(listener);
    if (type === 'error') this.errorListeners.delete(listener);
  }
}

describe('Dual Session Sandbox Manager', () => {
  let sessionStore: LiveSessionStore;

  beforeEach(() => {
    sessionStore = new LiveSessionStore();
    window.sessionStorage.clear();
  });

  it('createInMemoryStorage provides isolated key-value storage without touching window.sessionStorage', () => {
    const s1 = createInMemoryStorage();
    const s2 = createInMemoryStorage();

    s1.setItem('token', 'abc');
    expect(s1.getItem('token')).toBe('abc');
    expect(s2.getItem('token')).toBeNull();
    expect(window.sessionStorage.getItem('token')).toBeNull();

    s1.removeItem('token');
    expect(s1.getItem('token')).toBeNull();
  });

  it('initializes rehearsal session with leader and 3 default participants', async () => {
    const createWs = (url: string) => new LoopbackClientSocket(url, sessionStore);
    const studyDoc = getDefaultStudyDocument();

    const payload = await initializeRehearsalSession({
      createWebSocket: createWs,
      fetchStudyDoc: async () => studyDoc,
      defaultParticipants: DEFAULT_REHEARSAL_PARTICIPANTS,
    });

    expect(payload.sessionCode).toMatch(/^[A-Z0-9]{6}$/);
    expect(payload.leaderPin).toMatch(/^\d{4}$/);
    expect(payload.participants).toHaveLength(3);
    expect(payload.participants.map((p) => p.displayName)).toEqual([
      'Mary Lopez',
      'Daniel Reyes',
      'Sara Castillo',
    ]);
    expect(payload.activeParticipantId).toBe(payload.participants[0]?.memberId);

    // Verify session in store has lobby status and 4 members (leader + 3 participants)
    const latestSnapshot = payload.leaderClient.getLatestSession();
    expect(latestSnapshot?.status).toBe('lobby');
    expect(latestSnapshot?.study?.title).toBe('Great Is Your Faith');
    expect(latestSnapshot?.members).toHaveLength(4);

    // Verify dynamic addition of a participant
    const added = await addParticipantToRehearsal(
      payload.sessionCode,
      'David Kim',
      { createWebSocket: createWs },
    );
    expect(added.displayName).toBe('David Kim');
    expect(added.initials).toBe('DK');

    // Teardown
    await exitRehearsalSession(payload.leaderClient, [
      ...payload.participants,
      added,
    ]);
    expect(sessionStore.getActiveSessionCount()).toBe(0);
  });

  it('useDualSessionSandbox hook manages full lifecycle and participant switching', async () => {
    const createWs = (url: string) => new LoopbackClientSocket(url, sessionStore);
    const studyDoc = getDefaultStudyDocument();

    const { result, unmount } = renderHook(() =>
      useDualSessionSandbox({
        createWebSocket: createWs,
        fetchStudyDoc: async () => studyDoc,
      }),
    );

    expect(result.current.isInitializing).toBe(true);

    await waitFor(() => {
      expect(result.current.isInitializing).toBe(false);
      expect(result.current.sessionCode).toBeTruthy();
    });

    expect(result.current.participants).toHaveLength(3);
    expect(result.current.activeParticipant?.displayName).toBe('Mary Lopez');

    // Switch participant to Daniel Reyes
    const daniel = result.current.participants[1]!;
    act(() => {
      result.current.setActiveParticipantId(daniel.memberId);
    });

    expect(result.current.activeParticipant?.displayName).toBe('Daniel Reyes');

    // Add 4th participant
    await act(async () => {
      const newP = await result.current.addParticipant('Sara Test');
      expect(newP?.displayName).toBe('Sara Test');
    });

    expect(result.current.participants).toHaveLength(4);
    expect(result.current.activeParticipant?.displayName).toBe('Sara Test');

    // Unmount triggers teardown
    unmount();

    await waitFor(() => {
      expect(sessionStore.getActiveSessionCount()).toBe(0);
    });
  });
});

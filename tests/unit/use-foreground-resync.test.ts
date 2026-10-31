// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  PublicLiveSessionSnapshot,
  ServerWsMessage,
  VolunteerTurnState,
} from '../../src/shared/session';
import {
  clearStoredSessionCredentials,
  saveStoredSessionCredentials,
  loadStoredSessionCredentials,
  SessionSocketError,
  type SessionSocketClient,
  type StoredSessionCredentials,
} from '../../src/client/lib/sessionSocket';
import { useForegroundResync } from '../../src/client/lib/useForegroundResync';
import { useLiveSession } from '../../src/client/lib/useLiveSession';

const CREDENTIALS: StoredSessionCredentials = {
  sessionCode: 'ABC123',
  memberId: 'member-1',
  role: 'Participant',
  reconnectToken: 'reconnect-token-1',
};

function createTurn(overrides: Partial<VolunteerTurnState>): VolunteerTurnState {
  return {
    sectionId: 'section_1_prayer',
    mode: 'gated_prayer',
    raisedHands: [],
    candidateMemberId: null,
    candidateExpiresAt: null,
    selectedMemberId: null,
    completedAt: null,
    ...overrides,
  };
}

function createSnapshot(
  overrides: Partial<PublicLiveSessionSnapshot> = {},
): PublicLiveSessionSnapshot {
  return {
    sessionCode: 'ABC123',
    status: 'in_progress',
    currentSectionIndex: 0,
    currentSectionId: 'section_1_prayer',
    createdAt: '2026-10-31T12:00:00.000Z',
    startedAt: '2026-10-31T12:01:00.000Z',
    endedAt: null,
    connectedMemberCount: 1,
    connectedParticipantCount: 1,
    members: [
      {
        memberId: 'member-1',
        displayName: 'Mia',
        initials: 'MI',
        avatarPalette: 'indigo',
        role: 'Participant',
        connectionStatus: 'connected',
        joinedAt: '2026-10-31T12:00:30.000Z',
      },
    ],
    study: null,
    volunteerTurn: createTurn({}),
    protocolVersion: 3,
    ...overrides,
  };
}

interface StubClientOptions {
  credentials?: StoredSessionCredentials | null;
  connected?: boolean;
  /** When set, reconnectSession emits a `session_reconnected` frame with it. */
  reconnectedSession?: PublicLiveSessionSnapshot | null;
  onReconnect?: () => Promise<void>;
}

interface StubClient {
  reconnectCalls: number;
  listeners: Set<(message: ServerWsMessage) => void>;
  isConnected: () => boolean;
  getCredentials: () => StoredSessionCredentials | null;
  reconnectSession: SessionSocketClient['reconnectSession'];
  setConnected: (next: boolean) => void;
  setOnReconnect: (fn: () => Promise<void>) => void;
}

function createStubClient(options: StubClientOptions = {}): StubClient {
  let credentials = options.credentials ?? null;
  let connected = options.connected ?? true;
  let onReconnect = options.onReconnect ?? (async () => {});
  const reconnectedSession = options.reconnectedSession ?? null;
  const listeners = new Set<(message: ServerWsMessage) => void>();

  const stub: StubClient = {
    reconnectCalls: 0,
    listeners,
    setConnected: (next) => {
      connected = next;
    },
    setOnReconnect: (fn) => {
      onReconnect = fn;
    },
    isConnected: () => connected,
    getCredentials: () => (credentials ? { ...credentials } : null),
    reconnectSession: async () => {
      stub.reconnectCalls += 1;
      await onReconnect();
      const response = {
        type: 'session_reconnected',
        sessionCode: 'ABC123',
        memberId: 'member-1',
        role: 'Participant',
        member: createSnapshot().members[0]!,
        session: reconnectedSession ?? createSnapshot(),
      } as Extract<ServerWsMessage, { type: 'session_reconnected' }>;
      if (reconnectedSession) {
        // Mirror the real client pipeline: the reply frame flows through the
        // subscribers (the exact path `useLiveSession` consumes).
        for (const listener of [...listeners]) {
          listener(response);
        }
      }
      return response;
    },
  };
  return stub;
}

function dispatchForegroundBurst(): void {
  document.dispatchEvent(new Event('visibilitychange'));
  window.dispatchEvent(new Event('focus'));
  window.dispatchEvent(new Event('online'));
}

const originalVisibilityDescriptor = Object.getOwnPropertyDescriptor(
  document,
  'visibilityState',
);

function restoreVisibility(): void {
  if (originalVisibilityDescriptor) {
    Object.defineProperty(
      document,
      'visibilityState',
      originalVisibilityDescriptor,
    );
  }
}

describe('useForegroundResync', () => {
  beforeEach(() => {
    clearStoredSessionCredentials();
  });

  afterEach(() => {
    clearStoredSessionCredentials();
    restoreVisibility();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('coalesces a same-tick visibilitychange + focus + online burst into exactly one reconnectSession call', async () => {
    const client = createStubClient({ credentials: CREDENTIALS });
    const onSessionGone = vi.fn();
    const { result } = renderHook(() =>
      useForegroundResync({ client, enabled: true, onSessionGone }),
    );

    await act(async () => {
      dispatchForegroundBurst();
    });

    expect(client.reconnectCalls).toBe(1);
    await waitFor(() => expect(result.current.resyncState).toBe('idle'));
    expect(onSessionGone).not.toHaveBeenCalled();
  });

  it('performs no reconnect without stored credentials', async () => {
    const client = createStubClient({ credentials: null });
    const onSessionGone = vi.fn();
    const { result } = renderHook(() =>
      useForegroundResync({ client, enabled: true, onSessionGone }),
    );

    await act(async () => {
      dispatchForegroundBurst();
    });

    expect(client.reconnectCalls).toBe(0);
    expect(result.current.resyncState).toBe('idle');
  });

  it('does not resync on mount and does not resync while disabled', async () => {
    const client = createStubClient({ credentials: CREDENTIALS });
    const onSessionGone = vi.fn();
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useForegroundResync({ client, enabled, onSessionGone }),
      { initialProps: { enabled: false } },
    );

    await act(async () => {});
    expect(client.reconnectCalls).toBe(0);

    await act(async () => {
      dispatchForegroundBurst();
    });
    expect(client.reconnectCalls).toBe(0);

    rerender({ enabled: true });
    await act(async () => {});
    // Enabling alone must not trigger (the mount auto-reconnect covers it).
    expect(client.reconnectCalls).toBe(0);
  });

  it('re-hydrates a FRESH snapshot through the real subscriber pipeline on foreground resync (Scenario 4 freshness)', async () => {
    const staleSnapshot = createSnapshot({
      volunteerTurn: createTurn({ selectedMemberId: 'member-1' }),
    });
    const freshSnapshot = createSnapshot({
      currentSectionIndex: 1,
      currentSectionId: 'section_2_icebreaker',
      volunteerTurn: createTurn({
        sectionId: 'section_1_prayer',
        selectedMemberId: 'member-1',
        completedAt: '2026-10-31T12:05:00.000Z',
      }),
    });

    const client = createStubClient({
      credentials: CREDENTIALS,
      reconnectedSession: freshSnapshot,
    });
    // Minimal extra surface so the REAL useLiveSession can consume the stub
    // (subscribe/getLatestSession) exactly like the shared client.
    const liveClient = {
      ...client,
      getLatestSession: () => staleSnapshot,
      subscribe: (listener: (message: ServerWsMessage) => void) => {
        client.listeners.add(listener);
        return () => {
          client.listeners.delete(listener);
        };
      },
    } as unknown as SessionSocketClient;

    const onSessionGone = vi.fn();
    const { result } = renderHook(() => ({
      live: useLiveSession({ client: liveClient, autoReconnect: false }),
      resync: useForegroundResync({
        client: liveClient,
        enabled: true,
        onSessionGone,
      }),
    }));

    // Stale pre-background view first.
    expect(result.current.live.session?.currentSectionId).toBe(
      'section_1_prayer',
    );
    expect(
      result.current.live.session?.volunteerTurn?.selectedMemberId,
    ).toBe('member-1');
    expect(result.current.live.session?.volunteerTurn?.completedAt).toBeNull();

    await act(async () => {
      dispatchForegroundBurst();
    });

    // Fresh turn state restored via `session_reconnected`: changed section +
    // completed turn — never the stale pre-background view.
    await waitFor(() =>
      expect(result.current.live.session?.currentSectionId).toBe(
        'section_2_icebreaker',
      ),
    );
    expect(result.current.live.session?.volunteerTurn?.completedAt).toBe(
      '2026-10-31T12:05:00.000Z',
    );
    expect(result.current.live.session?.volunteerTurn?.selectedMemberId).toBe(
      'member-1',
    );
    expect(onSessionGone).not.toHaveBeenCalled();
  });

  it.each([
    'SESSION_NOT_FOUND',
    'UNAUTHORIZED_RECONNECT',
    'INVALID_SESSION_CODE',
  ] as const)(
    'clears credentials and ejects to Welcome on definitive session-gone (%s)',
    async (code) => {
      saveStoredSessionCredentials(CREDENTIALS);
      const client = createStubClient({ credentials: CREDENTIALS });
      client.setOnReconnect(async () => {
        throw new SessionSocketError(code, `Definitive failure: ${code}`);
      });
      const onSessionGone = vi.fn();
      const { result } = renderHook(() =>
        useForegroundResync({ client, enabled: true, onSessionGone }),
      );

      await act(async () => {
        dispatchForegroundBurst();
      });

      await waitFor(() => expect(onSessionGone).toHaveBeenCalledTimes(1));
      expect(loadStoredSessionCredentials()).toBeNull();
      expect(result.current.resyncState).toBe('idle');
    },
  );

  it('keeps the session on transient errors, shows "reconnecting", and recovers on the next trigger', async () => {
    saveStoredSessionCredentials(CREDENTIALS);
    const client = createStubClient({ credentials: CREDENTIALS });
    client.setOnReconnect(async () => {
      throw new Error('WebSocket connection closed before receiving reply.');
    });
    const onSessionGone = vi.fn();
    const { result } = renderHook(() =>
      useForegroundResync({ client, enabled: true, onSessionGone }),
    );

    await act(async () => {
      dispatchForegroundBurst();
    });

    await waitFor(() =>
      expect(result.current.resyncState).toBe('reconnecting'),
    );
    // Transient: credentials kept, never ejected.
    expect(loadStoredSessionCredentials()).not.toBeNull();
    expect(onSessionGone).not.toHaveBeenCalled();

    // Recovery retried on `online`.
    client.setOnReconnect(async () => {});
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(result.current.resyncState).toBe('idle'));
    expect(client.reconnectCalls).toBe(2);
    expect(onSessionGone).not.toHaveBeenCalled();
  });

  it('treats SessionSocketError with non-gone codes as transient', async () => {
    saveStoredSessionCredentials(CREDENTIALS);
    const client = createStubClient({ credentials: CREDENTIALS });
    client.setOnReconnect(async () => {
      throw new SessionSocketError(
        'INVALID_STATE_TRANSITION',
        'Rejected right now.',
      );
    });
    const onSessionGone = vi.fn();
    const { result } = renderHook(() =>
      useForegroundResync({ client, enabled: true, onSessionGone }),
    );

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    await waitFor(() =>
      expect(result.current.resyncState).toBe('reconnecting'),
    );
    expect(onSessionGone).not.toHaveBeenCalled();
    expect(loadStoredSessionCredentials()).not.toBeNull();
  });

  it('runs the isConnected() watchdog only while visible and the socket is down', async () => {
    vi.useFakeTimers({
      toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'],
    });
    const client = createStubClient({
      credentials: CREDENTIALS,
      connected: false,
    });
    const onSessionGone = vi.fn();
    renderHook(() =>
      useForegroundResync({
        client,
        enabled: true,
        onSessionGone,
        watchdogIntervalMs: 5_000,
      }),
    );

    // Connected: no watchdog-triggered resync.
    client.setConnected(true);
    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });
    expect(client.reconnectCalls).toBe(0);

    // Silent socket drop: the watchdog triggers a resync within ~5s.
    client.setConnected(false);
    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    await act(async () => {});
    expect(client.reconnectCalls).toBe(1);

    // Hidden: the watchdog stays quiet.
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });
    expect(client.reconnectCalls).toBe(1);
  });

  it('queues at most one re-run when triggers arrive mid-flight', async () => {
    const client = createStubClient({ credentials: CREDENTIALS });
    let releaseReconnect: (() => void) | null = null;
    client.setOnReconnect(
      () =>
        new Promise<void>((resolve) => {
          releaseReconnect = resolve;
        }),
    );
    const onSessionGone = vi.fn();
    renderHook(() =>
      useForegroundResync({ client, enabled: true, onSessionGone }),
    );

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(client.reconnectCalls).toBe(1);

    // Bursts mid-flight: coalesced into at most one queued re-run.
    await act(async () => {
      dispatchForegroundBurst();
      dispatchForegroundBurst();
    });
    expect(client.reconnectCalls).toBe(1);

    await act(async () => {
      releaseReconnect?.();
    });
    await act(async () => {});

    expect(client.reconnectCalls).toBe(2);
  });

  it('removes all listeners and intervals on unmount', async () => {
    vi.useFakeTimers({
      toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'],
    });
    const client = createStubClient({ credentials: CREDENTIALS });
    const onSessionGone = vi.fn();
    const { unmount } = renderHook(() =>
      useForegroundResync({ client, enabled: true, onSessionGone }),
    );

    unmount();

    await act(async () => {
      dispatchForegroundBurst();
      vi.advanceTimersByTime(30_000);
    });
    expect(client.reconnectCalls).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(onSessionGone).not.toHaveBeenCalled();
  });
});

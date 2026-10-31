// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionResilienceChip } from '../../src/client/components/session/SessionResilienceChip';
import type {
  WakeLockApiLike,
  WakeLockSentinelLike,
} from '../../src/client/lib/useScreenWakeLock';
import {
  clearStoredSessionCredentials,
  saveStoredSessionCredentials,
  SessionSocketError,
  type SessionSocketClient,
  type StoredSessionCredentials,
} from '../../src/client/lib/sessionSocket';

const CREDENTIALS: StoredSessionCredentials = {
  sessionCode: 'ABC123',
  memberId: 'member-1',
  role: 'Study Leader',
  reconnectToken: 'reconnect-token-1',
  leaderToken: 'leader-token-1',
};

function createWakeLockApi(
  options: { rejectWith?: Error } = {},
): WakeLockApiLike & { requests: string[] } {
  const requests: string[] = [];
  return {
    requests,
    request(type: 'screen') {
      requests.push(type);
      if (options.rejectWith) {
        return Promise.reject(options.rejectWith);
      }
      const sentinel = {
        released: false,
        async release() {
          sentinel.released = true;
        },
      };
      return Promise.resolve(sentinel);
    },
  };
}

function createStubClient(overrides: {
  onReconnect?: () => Promise<void>;
} = {}) {
  const listeners = new Set<(message: unknown) => void>();
  const client = {
    getWsUrl: () => 'ws://127.0.0.1/ws',
    connect: async () => {},
    disconnect: () => {},
    isConnected: () => true,
    getCredentials: () => ({ ...CREDENTIALS }),
    getLatestSession: () => null,
    subscribe: (listener: (message: unknown) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    ping: async () => ({ type: 'pong' }),
    createSession: async () => {
      throw new Error('not used');
    },
    joinSession: async () => {
      throw new Error('not used');
    },
    claimLeader: async () => {
      throw new Error('not used');
    },
    reconnectSession: async () => {
      if (overrides.onReconnect) {
        await overrides.onReconnect();
      }
      return {
        type: 'session_reconnected',
        sessionCode: 'ABC123',
        memberId: 'member-1',
        role: 'Study Leader',
        member: {
          memberId: 'member-1',
          displayName: 'Claire',
          initials: 'CL',
          avatarPalette: 'gold',
          role: 'Study Leader',
          connectionStatus: 'connected',
          joinedAt: '2026-10-31T12:00:30.000Z',
        },
        session: {
          sessionCode: 'ABC123',
          status: 'in_progress',
          currentSectionIndex: 0,
          currentSectionId: 'section_1_prayer',
          createdAt: '2026-10-31T12:00:00.000Z',
          startedAt: null,
          endedAt: null,
          connectedMemberCount: 1,
          connectedParticipantCount: 0,
          members: [],
          study: null,
          volunteerTurn: null,
          protocolVersion: 3,
        },
      };
    },
    sendLeaderCommand: async () => {
      throw new Error('not used');
    },
    sendTurnCommand: async () => {
      throw new Error('not used');
    },
  };
  return client as unknown as SessionSocketClient;
}

describe('SessionResilienceChip', () => {
  afterEach(() => {
    clearStoredSessionCredentials();
    vi.restoreAllMocks();
  });

  it('renders the emerald "● Connected" pill while the session is live', async () => {
    const wakeLockApi = createWakeLockApi();
    render(
      <SessionResilienceChip
        sessionActive
        onSessionGone={() => {}}
        client={createStubClient()}
        wakeLockApi={wakeLockApi}
      />,
    );

    const chip = await screen.findByTestId('session-resilience-chip');
    expect(chip).toHaveTextContent('● Connected');
    expect(chip).toHaveAttribute('data-connection', 'live');
    await waitFor(() => expect(chip).toHaveAttribute('data-wake-lock', 'active'));
    expect(wakeLockApi.requests).toEqual(['screen']);
  });

  it('is hidden and requests nothing when no session exists', () => {
    const wakeLockApi = createWakeLockApi();
    render(
      <SessionResilienceChip
        sessionActive={false}
        onSessionGone={() => {}}
        client={createStubClient()}
        wakeLockApi={wakeLockApi}
      />,
    );

    expect(screen.queryByTestId('session-resilience-chip')).toBeNull();
    expect(wakeLockApi.requests).toEqual([]);
  });

  it('reports "unsupported" wake lock silently while the chip stays live', async () => {
    render(
      <SessionResilienceChip
        sessionActive
        onSessionGone={() => {}}
        client={createStubClient()}
        wakeLockApi={null}
      />,
    );

    const chip = await screen.findByTestId('session-resilience-chip');
    expect(chip).toHaveAttribute('data-wake-lock', 'unsupported');
    expect(chip).toHaveAttribute('data-connection', 'live');
    expect(chip).toHaveTextContent('● Connected');
  });

  it('reports "denied" wake lock silently without breaking the session UI', async () => {
    const wakeLockApi = createWakeLockApi({
      rejectWith: Object.assign(new Error('Denied.'), {
        name: 'NotAllowedError',
      }),
    });
    render(
      <SessionResilienceChip
        sessionActive
        onSessionGone={() => {}}
        client={createStubClient()}
        wakeLockApi={wakeLockApi}
      />,
    );

    const chip = await screen.findByTestId('session-resilience-chip');
    await waitFor(() => expect(chip).toHaveAttribute('data-wake-lock', 'denied'));
    expect(chip).toHaveTextContent('● Connected');
  });

  it('announces the terracotta "● Reconnecting…" state with role="status" and aria-live="polite"', async () => {
    saveStoredSessionCredentials(CREDENTIALS);
    const client = createStubClient({
      onReconnect: async () => {
        throw new Error('WebSocket connection closed before receiving reply.');
      },
    });
    render(
      <SessionResilienceChip
        sessionActive
        onSessionGone={() => {}}
        client={client}
        wakeLockApi={null}
      />,
    );

    const chip = await screen.findByTestId('session-resilience-chip');
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() =>
      expect(chip).toHaveAttribute('data-connection', 'reconnecting'),
    );
    expect(chip).toHaveTextContent('● Reconnecting…');
    expect(chip).toHaveAttribute('role', 'status');
    expect(chip).toHaveAttribute('aria-live', 'polite');
  });

  it('calls onSessionGone on a definitive session-gone resync error', async () => {
    saveStoredSessionCredentials(CREDENTIALS);
    const onSessionGone = vi.fn();
    const client = createStubClient({
      onReconnect: async () => {
        throw new SessionSocketError('SESSION_NOT_FOUND', 'Session is gone.');
      },
    });
    render(
      <SessionResilienceChip
        sessionActive
        onSessionGone={onSessionGone}
        client={client}
        wakeLockApi={null}
      />,
    );

    await screen.findByTestId('session-resilience-chip');
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => expect(onSessionGone).toHaveBeenCalledTimes(1));
  });

  it('uses only Study Leader / Participant terminology (zero "Assistant")', () => {
    const wakeLockApi = createWakeLockApi();
    const { container } = render(
      <SessionResilienceChip
        sessionActive
        onSessionGone={() => {}}
        client={createStubClient()}
        wakeLockApi={wakeLockApi}
      />,
    );

    expect(container.textContent).not.toContain('Assistant');
    expect(container.textContent).toMatch(/● Connected/);
  });

  it('styles are static under reduced motion and use DESIGN.md tokens (global.css scan)', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/client/styles/global.css'),
      'utf8',
    );
    const chipBlock = css.slice(css.indexOf('/* Session resilience chip'));
    expect(chipBlock.length).toBeGreaterThan(0);
    // Reduced-motion guard: the pulse only runs under no-preference.
    expect(chipBlock).toContain(
      '@media (prefers-reduced-motion: no-preference)',
    );
    // DESIGN.md tokens only.
    expect(chipBlock).toContain('var(--color-accent-emerald)');
    expect(chipBlock).toContain('var(--color-accent-terracotta');
    expect(chipBlock).toContain('var(--radius-pill)');
    // Non-interactive chip: no pointer affordances required.
    expect(chipBlock).not.toContain('cursor: pointer');
  });
});

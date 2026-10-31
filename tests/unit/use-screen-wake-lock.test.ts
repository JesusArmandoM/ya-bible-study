// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  useScreenWakeLock,
  type WakeLockApiLike,
  type WakeLockSentinelLike,
} from '../../src/client/lib/useScreenWakeLock';

interface MockSentinel extends WakeLockSentinelLike {
  released: boolean;
  releaseCalls: number;
  listeners: Set<() => void>;
  fireRelease: () => void;
}

interface MockWakeLockApi extends WakeLockApiLike {
  requests: Array<'screen'>;
  sentinels: MockSentinel[];
  rejectWith: Error | null;
}

function createMockWakeLockApi(): MockWakeLockApi {
  const api: MockWakeLockApi = {
    requests: [],
    sentinels: [],
    rejectWith: null,
    request(type: 'screen') {
      api.requests.push(type);
      if (api.rejectWith) {
        return Promise.reject(api.rejectWith);
      }
      const listeners = new Set<() => void>();
      const sentinel: MockSentinel = {
        released: false,
        releaseCalls: 0,
        listeners,
        async release() {
          sentinel.releaseCalls += 1;
          if (sentinel.released) {
            return;
          }
          sentinel.released = true;
          for (const listener of [...listeners]) {
            listener();
          }
        },
        addEventListener: (type, listener) => {
          if (type === 'release') {
            listeners.add(listener);
          }
        },
        removeEventListener: (type, listener) => {
          if (type === 'release') {
            listeners.delete(listener);
          }
        },
        fireRelease: () => {
          if (sentinel.released) {
            return;
          }
          sentinel.released = true;
          for (const listener of [...listeners]) {
            listener();
          }
        },
      };
      api.sentinels.push(sentinel);
      return Promise.resolve(sentinel);
    },
  };
  return api;
}

type Visibility = 'visible' | 'hidden';

function setVisibility(visibility: Visibility): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibility,
  });
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => visibility === 'hidden',
  });
}

function dispatchVisibilityChange(): void {
  document.dispatchEvent(new Event('visibilitychange'));
}

const originalVisibilityDescriptor = Object.getOwnPropertyDescriptor(
  document,
  'visibilityState',
);
const originalHiddenDescriptor = Object.getOwnPropertyDescriptor(
  document,
  'hidden',
);

function restoreVisibility(): void {
  if (originalVisibilityDescriptor) {
    Object.defineProperty(document, 'visibilityState', originalVisibilityDescriptor);
  } else {
    delete (document as { visibilityState?: unknown }).visibilityState;
  }
  if (originalHiddenDescriptor) {
    Object.defineProperty(document, 'hidden', originalHiddenDescriptor);
  } else {
    delete (document as { hidden?: unknown }).hidden;
  }
}

describe('useScreenWakeLock', () => {
  afterEach(() => {
    restoreVisibility();
    vi.restoreAllMocks();
  });

  it('requests the screen wake lock once while a session is active and visible', async () => {
    const api = createMockWakeLockApi();
    const { result } = renderHook(() =>
      useScreenWakeLock({ enabled: true, wakeLockApi: api }),
    );

    await act(async () => {});
    expect(api.requests).toEqual(['screen']);
    expect(result.current.status).toBe('active');
    expect(api.sentinels[0]?.released).toBe(false);
    expect(api.sentinels[0]?.releaseCalls).toBe(0);
  });

  it('makes no request before a session exists', async () => {
    const api = createMockWakeLockApi();
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useScreenWakeLock({ enabled, wakeLockApi: api }),
      { initialProps: { enabled: false } },
    );

    await act(async () => {});
    expect(api.requests).toEqual([]);
    expect(result.current.status).toBe('inactive');

    rerender({ enabled: true });
    await act(async () => {});
    expect(api.requests).toEqual(['screen']);
    expect(result.current.status).toBe('active');
  });

  it('releases the sentinel and stops requesting when the session ends (Leave)', async () => {
    const api = createMockWakeLockApi();
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useScreenWakeLock({ enabled, wakeLockApi: api }),
      { initialProps: { enabled: true } },
    );

    await act(async () => {});
    expect(result.current.status).toBe('active');

    rerender({ enabled: false });
    await act(async () => {});
    expect(api.sentinels[0]?.released).toBe(true);
    expect(result.current.status).toBe('inactive');

    // Foreground churn after the session ended must never re-request.
    setVisibility('hidden');
    dispatchVisibilityChange();
    setVisibility('visible');
    dispatchVisibilityChange();
    await act(async () => {});
    expect(api.requests).toEqual(['screen']);
  });

  it('re-acquires on visibilitychange -> visible after the platform auto-released the sentinel while hidden', async () => {
    const api = createMockWakeLockApi();
    const { result } = renderHook(() =>
      useScreenWakeLock({ enabled: true, wakeLockApi: api }),
    );
    await act(async () => {});
    expect(result.current.status).toBe('active');

    // Background: the platform auto-releases the sentinel (release event).
    setVisibility('hidden');
    dispatchVisibilityChange();
    await act(async () => {
      api.sentinels[0]?.fireRelease();
    });
    expect(api.sentinels[0]?.released).toBe(true);
    expect(api.requests).toEqual(['screen']);

    // Foreground: the wake lock is re-requested.
    setVisibility('visible');
    await act(async () => {
      dispatchVisibilityChange();
    });
    expect(api.requests).toEqual(['screen', 'screen']);
    expect(result.current.status).toBe('active');
  });

  it('retries an unexpected sentinel release (system revocation) on the next foreground event', async () => {
    const api = createMockWakeLockApi();
    const { result } = renderHook(() =>
      useScreenWakeLock({ enabled: true, wakeLockApi: api }),
    );
    await act(async () => {});
    expect(result.current.status).toBe('active');

    // System revocation while visible: the sentinel fires `release`.
    await act(async () => {
      api.sentinels[0]?.fireRelease();
    });
    expect(result.current.status).toBe('inactive');
    expect(api.requests).toEqual(['screen']);

    // Retried on the next foreground event — never as a retry loop.
    await act(async () => {
      dispatchVisibilityChange();
    });
    expect(api.requests).toEqual(['screen', 'screen']);
    expect(result.current.status).toBe('active');
  });

  it('never requests while the document is hidden', async () => {
    const api = createMockWakeLockApi();
    setVisibility('hidden');
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useScreenWakeLock({ enabled, wakeLockApi: api }),
      { initialProps: { enabled: false } },
    );
    await act(async () => {});
    expect(api.requests).toEqual([]);

    rerender({ enabled: true });
    await act(async () => {});
    expect(api.requests).toEqual([]);
    expect(result.current.status).toBe('inactive');
  });

  it('degrades silently to "unsupported" when the wake-lock API is absent', async () => {
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useScreenWakeLock({ enabled, wakeLockApi: null }),
      { initialProps: { enabled: true } },
    );
    await act(async () => {});
    expect(result.current.status).toBe('unsupported');

    // Foreground churn: still unsupported, nothing throws.
    setVisibility('hidden');
    dispatchVisibilityChange();
    setVisibility('visible');
    await act(async () => {
      dispatchVisibilityChange();
    });
    expect(result.current.status).toBe('unsupported');

    rerender({ enabled: false });
    await act(async () => {});
    expect(result.current.status).toBe('unsupported');
  });

  it('degrades silently to "denied" on a rejected request and retries on the next foreground event', async () => {
    const api = createMockWakeLockApi();
    api.rejectWith = Object.assign(new Error('Wake lock denied.'), {
      name: 'NotAllowedError',
    });
    const { result } = renderHook(() =>
      useScreenWakeLock({ enabled: true, wakeLockApi: api }),
    );
    await act(async () => {});
    expect(api.requests).toEqual(['screen']);
    expect(result.current.status).toBe('denied');

    // No retry loop: another visibilitychange while still denied would retry
    // once per foreground event only; a hidden/visible cycle after the denial
    // is lifted re-acquires successfully.
    api.rejectWith = null;
    setVisibility('hidden');
    dispatchVisibilityChange();
    setVisibility('visible');
    await act(async () => {
      dispatchVisibilityChange();
    });
    expect(api.requests).toEqual(['screen', 'screen']);
    expect(result.current.status).toBe('active');
  });

  it('releases the sentinel and removes listeners on unmount', async () => {
    const api = createMockWakeLockApi();
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const { unmount } = renderHook(() =>
      useScreenWakeLock({ enabled: true, wakeLockApi: api }),
    );
    await act(async () => {});
    expect(api.requests).toEqual(['screen']);

    unmount();
    expect(api.sentinels[0]?.released).toBe(true);

    const visibilityRemovals = removeSpy.mock.calls.filter(
      ([type]) => type === 'visibilitychange',
    );
    expect(visibilityRemovals.length).toBeGreaterThan(0);

    // Post-unmount events must never re-request.
    setVisibility('hidden');
    dispatchVisibilityChange();
    setVisibility('visible');
    dispatchVisibilityChange();
    await act(async () => {});
    expect(api.requests).toEqual(['screen']);
  });

  it('keeps at most one live sentinel across rapid foreground churn', async () => {
    const api = createMockWakeLockApi();
    renderHook(() => useScreenWakeLock({ enabled: true, wakeLockApi: api }));
    await act(async () => {});
    expect(api.requests).toEqual(['screen']);

    // Multiple foreground events with a held sentinel: idempotent, no re-request.
    await act(async () => {
      dispatchVisibilityChange();
      dispatchVisibilityChange();
    });
    expect(api.requests).toEqual(['screen']);
    const releasedCount = api.sentinels.filter((s) => s.released).length;
    expect(releasedCount).toBe(0);
  });
});

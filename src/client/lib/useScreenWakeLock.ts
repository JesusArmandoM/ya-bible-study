import { useEffect, useRef, useState } from 'react';

/**
 * Minimal sentinel surface of the Screen Wake Lock API
 * (`WakeLockSentinel`), narrowed to what the hook needs and injectable in tests.
 */
export interface WakeLockSentinelLike {
  readonly released?: boolean;
  release(): Promise<void> | void;
  addEventListener?(type: 'release', listener: () => void): void;
  removeEventListener?(type: 'release', listener: () => void): void;
}

/** Minimal `navigator.wakeLock` surface, injectable in tests. */
export interface WakeLockApiLike {
  request(type: 'screen'): Promise<WakeLockSentinelLike>;
}

export type ScreenWakeLockStatus =
  | 'unsupported'
  | 'inactive'
  | 'requesting'
  | 'active'
  | 'denied';

export interface UseScreenWakeLockOptions {
  /** True while a live session exists and the display should stay awake. */
  enabled: boolean;
  /**
   * Injectable wake-lock API for tests. `undefined` falls back to
   * `navigator.wakeLock`; `null` forces the `unsupported` path (jsdom).
   */
  wakeLockApi?: WakeLockApiLike | null;
}

export interface UseScreenWakeLockResult {
  status: ScreenWakeLockStatus;
}

function resolveWakeLockApi(
  injected: WakeLockApiLike | null | undefined,
): WakeLockApiLike | null {
  if (injected !== undefined) {
    return injected ?? null;
  }
  if (typeof navigator === 'undefined') {
    return null;
  }
  const api = (navigator as Navigator & { wakeLock?: WakeLockApiLike }).wakeLock;
  return api && typeof api.request === 'function' ? api : null;
}

function isDocumentVisible(): boolean {
  if (typeof document === 'undefined') {
    return true;
  }
  return document.visibilityState === 'visible';
}

function releaseQuietly(sentinel: WakeLockSentinelLike | null): void {
  if (!sentinel) {
    return;
  }
  try {
    void Promise.resolve(sentinel.release()).catch(() => {
      // Release failures degrade silently — never an unhandled rejection.
    });
  } catch {
    // Release failures degrade silently.
  }
}

/**
 * Holds a Screen Wake Lock (`navigator.wakeLock.request('screen')`) while a
 * live session is active and the document is visible, so phones never auto-lock
 * mid-prayer or mid-reading.
 *
 * Lifecycle:
 * - Request only while `enabled && document.visibilityState === 'visible'`;
 *   at most one live sentinel is retained at a time.
 * - Re-acquire on `visibilitychange` -> `visible` (the platform auto-releases
 *   on hide) and after an unexpected sentinel `release` (system revocation),
 *   retried on the next foreground event — never a retry loop.
 * - Explicitly release on `enabled = false` (Leave / `session_closed` /
 *   unmount) and on `pagehide`.
 *
 * Failure handling is fully silent: a missing `navigator.wakeLock` reports
 * `unsupported`, a rejected request (e.g. `NotAllowedError` under power
 * saving) reports `denied`, and nothing ever throws into React.
 */
export function useScreenWakeLock(
  options: UseScreenWakeLockOptions,
): UseScreenWakeLockResult {
  const { enabled, wakeLockApi } = options;

  const [status, setStatus] = useState<ScreenWakeLockStatus>(() =>
    resolveWakeLockApi(wakeLockApi) ? 'inactive' : 'unsupported',
  );

  const sentinelRef = useRef<WakeLockSentinelLike | null>(null);
  // Monotonic token invalidating in-flight requests on release/unmount.
  const requestSeqRef = useRef(0);
  // Stable container so the effect (keyed on `enabled`) reads fresh values.
  const latestRef = useRef({ wakeLockApi });
  latestRef.current.wakeLockApi = wakeLockApi;

  useEffect(() => {
    let disposed = false;

    const safeSetStatus = (next: ScreenWakeLockStatus): void => {
      if (!disposed) {
        setStatus(next);
      }
    };

    const api = resolveWakeLockApi(latestRef.current.wakeLockApi);
    const inactiveStatus: ScreenWakeLockStatus = api ? 'inactive' : 'unsupported';

    const dropSentinel = (next: ScreenWakeLockStatus): void => {
      requestSeqRef.current += 1;
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      releaseQuietly(sentinel);
      safeSetStatus(next);
    };

    const acquire = async (): Promise<void> => {
      const currentApi = resolveWakeLockApi(latestRef.current.wakeLockApi);
      if (!currentApi) {
        safeSetStatus('unsupported');
        return;
      }
      if (!enabled || sentinelRef.current || !isDocumentVisible()) {
        // Never request without a live session, while hidden, or when a
        // sentinel is already held (idempotent, at most one live sentinel).
        return;
      }

      requestSeqRef.current += 1;
      const token = requestSeqRef.current;
      safeSetStatus('requesting');

      try {
        const sentinel = await currentApi.request('screen');
        if (disposed || token !== requestSeqRef.current || !enabled) {
          // Stale or disabled mid-flight: release quietly, keep state.
          releaseQuietly(sentinel);
          return;
        }

        sentinelRef.current = sentinel;
        const onRelease = (): void => {
          if (sentinelRef.current !== sentinel) {
            return;
          }
          sentinelRef.current = null;
          sentinel.removeEventListener?.('release', onRelease);
          // A release while hidden is the expected platform auto-release; a
          // release while visible is a system revocation. Either way the lock
          // is gone — re-acquisition happens on the next foreground event,
          // never as a retry loop.
          safeSetStatus('inactive');
        };
        sentinel.addEventListener?.('release', onRelease);
        safeSetStatus('active');
      } catch {
        // Silent degradation (unsupported platform / NotAllowedError under
        // power saving or restrictions). Retry only on the next foreground
        // event — never a loop, never an unhandled rejection.
        if (!disposed && token === requestSeqRef.current) {
          safeSetStatus('denied');
        }
      }
    };

    if (!enabled) {
      dropSentinel(inactiveStatus);
      return () => {
        disposed = true;
        requestSeqRef.current += 1;
      };
    }

    const onVisibilityChange = (): void => {
      if (isDocumentVisible()) {
        void acquire();
      }
    };

    const onPageHide = (): void => {
      dropSentinel(inactiveStatus);
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);

    void acquire();

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
      requestSeqRef.current += 1;
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      releaseQuietly(sentinel);
    };
  }, [enabled]);

  return { status };
}

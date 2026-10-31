import { useEffect, useRef, useState } from 'react';
import {
  clearStoredSessionCredentials,
  SessionSocketError,
  type SessionSocketClient,
} from './sessionSocket';
import type { SessionErrorCode } from '../../shared/session';

export type ForegroundResyncState = 'idle' | 'syncing' | 'reconnecting';

/**
 * Definitive session-gone error codes: the session (or the credentials) no
 * longer exists — stored credentials are cleared and the app returns to the
 * Welcome screen. Anything else is treated as transient.
 */
export const SESSION_GONE_ERROR_CODES: ReadonlySet<SessionErrorCode> = new Set([
  'SESSION_NOT_FOUND',
  'UNAUTHORIZED_RECONNECT',
  'INVALID_SESSION_CODE',
]);

export interface UseForegroundResyncOptions {
  /** Session socket client surface used for resync (injectable for tests). */
  client: Pick<
    SessionSocketClient,
    'reconnectSession' | 'isConnected' | 'getCredentials'
  >;
  /** True while a live session exists and foreground resync should run. */
  enabled: boolean;
  /** Called once when a definitive session-gone error ejects the client. */
  onSessionGone: () => void;
  /** `isConnected()` watchdog interval; defaults to ~5 seconds. */
  watchdogIntervalMs?: number;
}

export interface UseForegroundResyncResult {
  resyncState: ForegroundResyncState;
}

export const DEFAULT_RESYNC_WATCHDOG_INTERVAL_MS = 5_000;

/**
 * Instant foreground state resync: whenever the app returns to the foreground
 * (`visibilitychange` -> `visible`, `window` `focus`, `window` `online`) or a
 * ~5s watchdog notices a silent socket drop (`isConnected() === false`), the
 * client issues one `reconnect_session` round trip and the existing
 * `session_reconnected` subscriber pipeline re-hydrates a fresh full snapshot —
 * zero protocol change.
 *
 * - Single-flight: concurrent triggers coalesce into one request; at most one
 *   re-run is queued while a request is in flight.
 * - Definitive session-gone (`SESSION_NOT_FOUND` / `UNAUTHORIZED_RECONNECT` /
 *   `INVALID_SESSION_CODE`) clears stored credentials and calls `onSessionGone`
 *   so the app returns to the Welcome screen (never stale session UI).
 * - Transient failures keep the session and surface `reconnecting`; they retry
 *   on the next trigger. Action buttons stay enabled (the server remains
 *   authoritative and rejects stale actions).
 * - All promise chains are catch-guarded; no artificial delays.
 */
export function useForegroundResync(
  options: UseForegroundResyncOptions,
): UseForegroundResyncResult {
  const {
    enabled,
    watchdogIntervalMs = DEFAULT_RESYNC_WATCHDOG_INTERVAL_MS,
  } = options;
  const [resyncState, setResyncState] = useState<ForegroundResyncState>('idle');

  // Stable container so the effect (keyed on `enabled`) reads fresh values.
  const latestRef = useRef({
    client: options.client,
    onSessionGone: options.onSessionGone,
  });
  latestRef.current.client = options.client;
  latestRef.current.onSessionGone = options.onSessionGone;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let disposed = false;
    let inFlight = false;
    let rerunQueued = false;
    let scheduled = false;
    let pendingTrigger = false;

    const safeSetState = (next: ForegroundResyncState): void => {
      if (!disposed) {
        setResyncState(next);
      }
    };

    const performResync = async (): Promise<void> => {
      try {
        await latestRef.current.client.reconnectSession();
        // Success: the `session_reconnected` snapshot already flows through
        // the existing subscriber pipeline; state is fresh again.
        safeSetState('idle');
      } catch (error) {
        if (disposed) {
          return;
        }
        if (
          error instanceof SessionSocketError &&
          SESSION_GONE_ERROR_CODES.has(error.code)
        ) {
          // Definitive session-gone: clear credentials and return to Welcome.
          clearStoredSessionCredentials();
          safeSetState('idle');
          latestRef.current.onSessionGone();
          return;
        }
        // Transient (socket closed / timeout / offline / generic error): keep
        // the session and credentials, signal freshness risk, retry on the
        // next trigger — never eject a participant over a blip.
        safeSetState('reconnecting');
      }
    };

    const startResync = (): void => {
      if (disposed) {
        return;
      }
      if (inFlight) {
        // Single-flight with at most one queued re-run.
        rerunQueued = true;
        return;
      }
      inFlight = true;
      safeSetState('syncing');
      void performResync()
        .catch(() => {
          // performResync never throws; belt-and-braces guard.
        })
        .finally(() => {
          inFlight = false;
          if (rerunQueued && !disposed) {
            rerunQueued = false;
            startResync();
          }
        });
    };

    const trigger = (): void => {
      if (disposed) {
        return;
      }
      if (!latestRef.current.client.getCredentials()) {
        // No stored session — nothing to resync.
        return;
      }
      // Coalesce same-tick trigger bursts (visibilitychange + focus + online)
      // into a single reconnect.
      pendingTrigger = true;
      if (scheduled) {
        return;
      }
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        if (disposed || !pendingTrigger) {
          return;
        }
        pendingTrigger = false;
        startResync();
      });
    };

    const onVisibilityChange = (): void => {
      if (
        typeof document === 'undefined' ||
        document.visibilityState === 'visible'
      ) {
        trigger();
      }
    };
    const onFocus = (): void => {
      trigger();
    };
    const onOnline = (): void => {
      trigger();
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', onFocus);
      window.addEventListener('online', onOnline);
    }

    const watchdog = setInterval(() => {
      if (disposed) {
        return;
      }
      if (
        typeof document !== 'undefined' &&
        document.visibilityState !== 'visible'
      ) {
        // The watchdog only bounds silent socket-drop recovery while visible.
        return;
      }
      if (!latestRef.current.client.isConnected()) {
        trigger();
      }
    }, watchdogIntervalMs);

    return () => {
      disposed = true;
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', onFocus);
        window.removeEventListener('online', onOnline);
      }
      clearInterval(watchdog);
    };
  }, [enabled, watchdogIntervalMs]);

  return { resyncState };
}

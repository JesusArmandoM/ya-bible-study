import type { SessionSocketClient } from '../../lib/sessionSocket';
import { useForegroundResync } from '../../lib/useForegroundResync';
import {
  useScreenWakeLock,
  type WakeLockApiLike,
} from '../../lib/useScreenWakeLock';
import { getSharedSessionSocketClient } from '../../lib/useLiveSession';

export interface SessionResilienceChipProps {
  /** True while a live session exists (chip is hidden otherwise). */
  sessionActive: boolean;
  /** Called when a definitive session-gone error ejects the client. */
  onSessionGone: () => void;
  /** Injectable session client for tests; defaults to the shared client. */
  client?: SessionSocketClient;
  /** Injectable wake-lock API for tests; defaults to `navigator.wakeLock`. */
  wakeLockApi?: WakeLockApiLike | null;
}

/**
 * Live-session resilience indicator (docs/technical-discovery.md
 * Observability): owns both `useScreenWakeLock` and `useForegroundResync` and
 * renders the connection badge — `● Connected` (Live Emerald) or
 * `● Reconnecting…` (Alert Terracotta, announced via `aria-live="polite"`) —
 * plus a `data-wake-lock` status attribute. Non-interactive and static under
 * `prefers-reduced-motion`.
 */
export function SessionResilienceChip({
  sessionActive,
  onSessionGone,
  client,
  wakeLockApi,
}: SessionResilienceChipProps) {
  const resolvedClient = client ?? getSharedSessionSocketClient();

  const wakeLock = useScreenWakeLock({
    enabled: sessionActive,
    wakeLockApi,
  });
  const resync = useForegroundResync({
    client: resolvedClient,
    enabled: sessionActive,
    onSessionGone,
  });

  if (!sessionActive) {
    return null;
  }

  const reconnecting = resync.resyncState === 'reconnecting';

  return (
    <div
      className="session-resilience-chip"
      data-testid="session-resilience-chip"
      data-connection={reconnecting ? 'reconnecting' : 'live'}
      data-wake-lock={wakeLock.status}
      {...(reconnecting ? { role: 'status', 'aria-live': 'polite' as const } : {})}
    >
      {reconnecting ? '● Reconnecting…' : '● Connected'}
    </div>
  );
}

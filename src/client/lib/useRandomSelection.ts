import { useCallback, useMemo } from 'react';
import type { SessionSocketClient } from './sessionSocket';
import { getSharedSessionSocketClient } from './useLiveSession';

export type RandomSelectionCommandType =
  | 'pick_random'
  | 'retry_random'
  | 'confirm_random';

export interface UseRandomSelectionOptions {
  /** Session client; defaults to the shared live-session client. */
  client?: SessionSocketClient;
}

export interface UseRandomSelectionResult {
  /** Study Leader: stage a random candidate (`pick_random`). */
  pickRandom: () => Promise<void>;
  /** Study Leader: re-roll the pending candidate (`retry_random`). */
  retryRandom: () => Promise<void>;
  /** Study Leader: confirm the pending candidate (`confirm_random`). */
  confirmRandom: () => Promise<void>;
}

/**
 * Study Leader random-selection dispatch. The three commands ride the
 * existing `sendLeaderCommand` default fall-through (`sessionSocket.ts`
 * framing needs no change) and `session_error` rejections surface through the
 * same error path as every other leader command. The countdown itself is
 * server-authoritative — this hook only dispatches.
 */
export function useRandomSelection(
  options: UseRandomSelectionOptions = {},
): UseRandomSelectionResult {
  const client = useMemo(
    () => options.client ?? getSharedSessionSocketClient(),
    [options.client],
  );

  const dispatchRandomCommand = useCallback(
    async (type: RandomSelectionCommandType) => {
      const stored = client.getCredentials();
      await client.sendLeaderCommand({
        type,
        ...(stored?.sessionCode ? { sessionCode: stored.sessionCode } : {}),
        ...(stored?.leaderToken ? { leaderToken: stored.leaderToken } : {}),
        ...(stored?.memberId ? { memberId: stored.memberId } : {}),
      });
    },
    [client],
  );

  const pickRandom = useCallback(
    () => dispatchRandomCommand('pick_random'),
    [dispatchRandomCommand],
  );
  const retryRandom = useCallback(
    () => dispatchRandomCommand('retry_random'),
    [dispatchRandomCommand],
  );
  const confirmRandom = useCallback(
    () => dispatchRandomCommand('confirm_random'),
    [dispatchRandomCommand],
  );

  return { pickRandom, retryRandom, confirmRandom };
}

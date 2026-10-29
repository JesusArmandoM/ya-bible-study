import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SanctuaryRole } from '../../shared/health';
import type {
  PublicLiveSessionSnapshot,
  ServerWsMessage,
} from '../../shared/session';
import {
  clearStoredSessionCredentials,
  createSessionSocketClient,
  loadStoredSessionCredentials,
  type SessionSocketClient,
  type StoredSessionCredentials,
} from './sessionSocket';

export interface UseLiveSessionOptions {
  client?: SessionSocketClient;
  autoReconnect?: boolean;
}

export type LiveSessionConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected';

export interface UseLiveSessionResult {
  connectionStatus: LiveSessionConnectionStatus;
  session: PublicLiveSessionSnapshot | null;
  credentials: StoredSessionCredentials | null;
  role: SanctuaryRole | null;
  leaderPin: string | null;
  error: string | null;
  isSubmitting: boolean;
  createRoom: (
    displayName: string,
  ) => Promise<Extract<ServerWsMessage, { type: 'session_created' }>>;
  joinRoom: (
    sessionCode: string,
    displayName: string,
  ) => Promise<Extract<ServerWsMessage, { type: 'session_joined' }>>;
  claimLeadership: (
    sessionCode: string,
    leaderPin: string,
    displayName?: string,
  ) => Promise<Extract<ServerWsMessage, { type: 'leader_claimed' }>>;
  leaveRoom: () => void;
  clearError: () => void;
}

let sharedSessionSocketClient: SessionSocketClient | null = null;

export function getSharedSessionSocketClient(): SessionSocketClient {
  if (!sharedSessionSocketClient) {
    sharedSessionSocketClient = createSessionSocketClient();
  }
  return sharedSessionSocketClient;
}

/**
 * React hook bridging the SessionSocketClient singleton with reactive React state.
 * Manages WebSocket room lifecycle, auto-reconnects with stored credentials, and
 * dispatches creation, join, and claim actions.
 */
export function useLiveSession(
  options: UseLiveSessionOptions = {},
): UseLiveSessionResult {
  const client = useMemo(
    () => options.client ?? getSharedSessionSocketClient(),
    [options.client],
  );
  const autoReconnect = options.autoReconnect ?? true;

  const [session, setSession] = useState<PublicLiveSessionSnapshot | null>(() =>
    client.getLatestSession(),
  );
  const [credentials, setCredentials] =
    useState<StoredSessionCredentials | null>(() => client.getCredentials());
  const [role, setRole] = useState<SanctuaryRole | null>(
    () => client.getCredentials()?.role ?? null,
  );
  const [leaderPin, setLeaderPin] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] =
    useState<LiveSessionConnectionStatus>(() =>
      client.isConnected() ? 'connected' : 'disconnected',
    );

  // Subscribe to WebSocket events and sync reactive state
  useEffect(() => {
    const unsubscribe = client.subscribe((message: ServerWsMessage) => {
      switch (message.type) {
        case 'session_created':
          setSession(message.session);
          setRole('Study Leader');
          setLeaderPin(message.leaderPin);
          setCredentials(client.getCredentials());
          setConnectionStatus('connected');
          setError(null);
          break;

        case 'session_joined':
          setSession(message.session);
          setRole('Participant');
          setCredentials(client.getCredentials());
          setConnectionStatus('connected');
          setError(null);
          break;

        case 'leader_claimed':
          setSession(message.session);
          setRole('Study Leader');
          setLeaderPin(message.leaderPin);
          setCredentials(client.getCredentials());
          setConnectionStatus('connected');
          setError(null);
          break;

        case 'session_reconnected':
          setSession(message.session);
          setRole(message.role);
          setCredentials(client.getCredentials());
          setConnectionStatus('connected');
          setError(null);
          break;

        case 'roster_updated':
        case 'session_updated':
          setSession(message.session);
          break;

        case 'leader_replaced': {
          setRole('Participant');
          setLeaderPin(null);
          break;
        }

        case 'session_closed':
          setSession(null);
          setCredentials(null);
          setRole(null);
          setLeaderPin(null);
          setConnectionStatus('disconnected');
          setError('The Bible study session was closed.');
          break;

        case 'session_error':
          setError(message.message);
          break;
      }
    });

    return () => {
      unsubscribe();
    };
  }, [client]);

  // Automatic session re-hydration from stored credentials
  useEffect(() => {
    if (!autoReconnect) {
      return;
    }

    const stored = loadStoredSessionCredentials();
    if (!stored) {
      return;
    }

    setCredentials(stored);
    setRole(stored.role);
    setConnectionStatus('connecting');

    let isCancelled = false;

    async function attemptAutoReconnect() {
      try {
        const response = await client.reconnectSession();
        if (!isCancelled) {
          setSession(response.session);
          setRole(response.role);
          setCredentials(client.getCredentials());
          setConnectionStatus('connected');
        }
      } catch {
        if (!isCancelled) {
          clearStoredSessionCredentials();
          setSession(null);
          setCredentials(null);
          setRole(null);
          setConnectionStatus('disconnected');
        }
      }
    }

    void attemptAutoReconnect();

    return () => {
      isCancelled = true;
    };
  }, [client, autoReconnect]);

  const createRoom = useCallback(
    async (displayName: string) => {
      setIsSubmitting(true);
      setError(null);
      try {
        const response = await client.createSession({ displayName });
        setSession(response.session);
        setRole('Study Leader');
        setLeaderPin(response.leaderPin);
        setCredentials(client.getCredentials());
        setConnectionStatus('connected');
        return response;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to create room';
        setError(message);
        throw err;
      } finally {
        setIsSubmitting(false);
      }
    },
    [client],
  );

  const joinRoom = useCallback(
    async (sessionCode: string, displayName: string) => {
      setIsSubmitting(true);
      setError(null);
      try {
        const response = await client.joinSession({
          sessionCode,
          displayName,
        });
        setSession(response.session);
        setRole('Participant');
        setCredentials(client.getCredentials());
        setConnectionStatus('connected');
        return response;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to join session';
        setError(message);
        throw err;
      } finally {
        setIsSubmitting(false);
      }
    },
    [client],
  );

  const claimLeadership = useCallback(
    async (sessionCode: string, leaderPinInput: string, displayName?: string) => {
      setIsSubmitting(true);
      setError(null);
      try {
        const response = await client.claimLeader({
          sessionCode,
          leaderPin: leaderPinInput,
          displayName,
        });
        setSession(response.session);
        setRole('Study Leader');
        setLeaderPin(response.leaderPin);
        setCredentials(client.getCredentials());
        setConnectionStatus('connected');
        return response;
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Failed to claim leadership with PIN';
        setError(message);
        throw err;
      } finally {
        setIsSubmitting(false);
      }
    },
    [client],
  );

  const leaveRoom = useCallback(() => {
    client.disconnect();
    clearStoredSessionCredentials();
    setSession(null);
    setCredentials(null);
    setRole(null);
    setLeaderPin(null);
    setError(null);
    setConnectionStatus('disconnected');
  }, [client]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    connectionStatus,
    session,
    credentials,
    role,
    leaderPin,
    error,
    isSubmitting,
    createRoom,
    joinRoom,
    claimLeadership,
    leaveRoom,
    clearError,
  };
}

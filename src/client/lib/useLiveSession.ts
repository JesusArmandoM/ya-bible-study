import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SanctuaryRole } from '../../shared/health';
import type {
  PublicLiveSessionSnapshot,
  ServerWsMessage,
  SessionDiscussionQuestion,
  SessionStudySummary,
  SessionUpdatedCommand,
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
  loadStudy: (summary: SessionStudySummary) => Promise<void>;
  openLobby: () => Promise<void>;
  startStudy: () => Promise<void>;
  /** Study Leader: assign the chosen volunteer for the current turn. */
  chooseVolunteer: (targetMemberId: string) => Promise<void>;
  /** Chosen volunteer: mark the turn done (`complete_turn`). */
  completeTurn: () => Promise<void>;
  /** Study Leader: mark the turn done on the volunteer's behalf. */
  overrideTurn: () => Promise<void>;
  /** Study Leader: advance to the next section (`next_section`). */
  nextSection: () => Promise<void>;
  /** Participant self-service: raise (`true`) or lower (`false`) own hand. */
  setHandRaised: (raised: boolean) => Promise<void>;
  /** Study Leader: lower one participant's hand. */
  lowerHand: (targetMemberId: string) => Promise<void>;
  /** Study Leader: lower every raised hand. */
  clearRaisedHands: () => Promise<void>;
  /** Study Leader: switch active discussion question (`switch_question`). */
  switchQuestion: (questionId: string) => Promise<void>;
  /** Study Leader: append discussion question to the queue (`add_question`). */
  addQuestion: (question: SessionDiscussionQuestion) => Promise<void>;
  /** Participant/Leader: submit reflection to the Section 4 Sharing feed (`submit_reflection`). */
  submitReflection: (input: {
    questionId: string;
    content: string;
    isAnonymous?: boolean;
  }) => Promise<void>;
  /** Command of the latest `session_updated` broadcast (motion triggers). */
  lastSessionCommand: SessionUpdatedCommand | null;
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
  const [lastSessionCommand, setLastSessionCommand] =
    useState<SessionUpdatedCommand | null>(null);

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
          setSession(message.session);
          break;

        case 'session_updated':
          setSession(message.session);
          setLastSessionCommand(message.command);
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

  const loadStudy = useCallback(
    async (summary: SessionStudySummary) => {
      setIsSubmitting(true);
      setError(null);
      try {
        const stored = client.getCredentials();
        const response = await client.sendLeaderCommand({
          type: 'load_study',
          study: summary,
          ...(stored?.sessionCode ? { sessionCode: stored.sessionCode } : {}),
          ...(stored?.leaderToken ? { leaderToken: stored.leaderToken } : {}),
          ...(stored?.memberId ? { memberId: stored.memberId } : {}),
        });
        if (response.type === 'session_updated') {
          setSession(response.session);
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to sync the study title';
        setError(message);
        throw err;
      } finally {
        setIsSubmitting(false);
      }
    },
    [client],
  );

  const openLobby = useCallback(async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const stored = client.getCredentials();
      const response = await client.sendLeaderCommand({
        type: 'open_lobby',
        ...(stored?.sessionCode ? { sessionCode: stored.sessionCode } : {}),
        ...(stored?.leaderToken ? { leaderToken: stored.leaderToken } : {}),
        ...(stored?.memberId ? { memberId: stored.memberId } : {}),
      });
      if (response.type === 'session_updated') {
        setSession(response.session);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to open the title lobby';
      setError(message);
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  }, [client]);

  const startStudy = useCallback(async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const stored = client.getCredentials();
      const response = await client.sendLeaderCommand({
        type: 'start_study',
        ...(stored?.sessionCode ? { sessionCode: stored.sessionCode } : {}),
        ...(stored?.leaderToken ? { leaderToken: stored.leaderToken } : {}),
        ...(stored?.memberId ? { memberId: stored.memberId } : {}),
      });
      if (response.type === 'session_updated') {
        setSession(response.session);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to start the study';
      setError(message);
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  }, [client]);

  const chooseVolunteer = useCallback(
    async (targetMemberId: string) => {
      setIsSubmitting(true);
      setError(null);
      try {
        const stored = client.getCredentials();
        const response = await client.sendLeaderCommand({
          type: 'choose_volunteer',
          targetMemberId,
          ...(stored?.sessionCode ? { sessionCode: stored.sessionCode } : {}),
          ...(stored?.leaderToken ? { leaderToken: stored.leaderToken } : {}),
          ...(stored?.memberId ? { memberId: stored.memberId } : {}),
        });
        if (response.type === 'session_updated') {
          setSession(response.session);
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to choose the volunteer';
        setError(message);
        throw err;
      } finally {
        setIsSubmitting(false);
      }
    },
    [client],
  );

  const completeTurn = useCallback(async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const stored = client.getCredentials();
      if (!client.sendTurnCommand) {
        throw new Error(
          'The live session connection does not support turn commands.',
        );
      }
      const response = await client.sendTurnCommand({
        type: 'complete_turn',
        ...(stored?.sessionCode ? { sessionCode: stored.sessionCode } : {}),
        ...(stored?.memberId ? { memberId: stored.memberId } : {}),
      });
      if (response.type === 'session_updated') {
        setSession(response.session);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to complete the prayer turn';
      setError(message);
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  }, [client]);

  const overrideTurn = useCallback(async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const stored = client.getCredentials();
      const response = await client.sendLeaderCommand({
        type: 'override_turn',
        ...(stored?.sessionCode ? { sessionCode: stored.sessionCode } : {}),
        ...(stored?.leaderToken ? { leaderToken: stored.leaderToken } : {}),
        ...(stored?.memberId ? { memberId: stored.memberId } : {}),
      });
      if (response.type === 'session_updated') {
        setSession(response.session);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to complete the prayer turn';
      setError(message);
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  }, [client]);

  const nextSection = useCallback(async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const stored = client.getCredentials();
      const response = await client.sendLeaderCommand({
        type: 'next_section',
        ...(stored?.sessionCode ? { sessionCode: stored.sessionCode } : {}),
        ...(stored?.leaderToken ? { leaderToken: stored.leaderToken } : {}),
        ...(stored?.memberId ? { memberId: stored.memberId } : {}),
      });
      if (response.type === 'session_updated') {
        setSession(response.session);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to advance the section';
      setError(message);
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  }, [client]);

  const setHandRaised = useCallback(
    async (raised: boolean) => {
      setIsSubmitting(true);
      setError(null);
      try {
        const stored = client.getCredentials();
        if (!client.sendTurnCommand) {
          throw new Error(
            'The live session connection does not support hand-raise commands.',
          );
        }
        const response = await client.sendTurnCommand({
          type: raised ? 'raise_hand' : 'lower_hand',
          ...(stored?.sessionCode ? { sessionCode: stored.sessionCode } : {}),
          ...(stored?.memberId ? { memberId: stored.memberId } : {}),
        });
        if (response.type === 'session_updated') {
          setSession(response.session);
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to update your hand';
        setError(message);
        throw err;
      } finally {
        setIsSubmitting(false);
      }
    },
    [client],
  );

  const lowerHand = useCallback(
    async (targetMemberId: string) => {
      setIsSubmitting(true);
      setError(null);
      try {
        const stored = client.getCredentials();
        const response = await client.sendLeaderCommand({
          type: 'clear_hands',
          targetMemberId,
          ...(stored?.sessionCode ? { sessionCode: stored.sessionCode } : {}),
          ...(stored?.leaderToken ? { leaderToken: stored.leaderToken } : {}),
          ...(stored?.memberId ? { memberId: stored.memberId } : {}),
        });
        if (response.type === 'session_updated') {
          setSession(response.session);
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to lower the hand";
        setError(message);
        throw err;
      } finally {
        setIsSubmitting(false);
      }
    },
    [client],
  );

  const clearRaisedHands = useCallback(async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const stored = client.getCredentials();
      const response = await client.sendLeaderCommand({
        type: 'clear_hands',
        ...(stored?.sessionCode ? { sessionCode: stored.sessionCode } : {}),
        ...(stored?.leaderToken ? { leaderToken: stored.leaderToken } : {}),
        ...(stored?.memberId ? { memberId: stored.memberId } : {}),
      });
      if (response.type === 'session_updated') {
        setSession(response.session);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to lower all hands';
      setError(message);
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  }, [client]);

  const switchQuestion = useCallback(
    async (questionId: string) => {
      setIsSubmitting(true);
      setError(null);
      try {
        const stored = client.getCredentials();
        const response = await client.sendLeaderCommand({
          type: 'switch_question',
          questionId,
          ...(stored?.sessionCode ? { sessionCode: stored.sessionCode } : {}),
          ...(stored?.leaderToken ? { leaderToken: stored.leaderToken } : {}),
          ...(stored?.memberId ? { memberId: stored.memberId } : {}),
        });
        if (response.type === 'session_updated') {
          setSession(response.session);
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to switch question';
        setError(message);
        throw err;
      } finally {
        setIsSubmitting(false);
      }
    },
    [client],
  );

  const addQuestion = useCallback(
    async (question: SessionDiscussionQuestion) => {
      setIsSubmitting(true);
      setError(null);
      try {
        const stored = client.getCredentials();
        const response = await client.sendLeaderCommand({
          type: 'add_question',
          question,
          ...(stored?.sessionCode ? { sessionCode: stored.sessionCode } : {}),
          ...(stored?.leaderToken ? { leaderToken: stored.leaderToken } : {}),
          ...(stored?.memberId ? { memberId: stored.memberId } : {}),
        });
        if (response.type === 'session_updated') {
          setSession(response.session);
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to add question';
        setError(message);
        throw err;
      } finally {
        setIsSubmitting(false);
      }
    },
    [client],
  );

  const submitReflection = useCallback(
    async (input: {
      questionId: string;
      content: string;
      isAnonymous?: boolean;
    }) => {
      setIsSubmitting(true);
      setError(null);
      try {
        if (!client.submitReflection) {
          throw new Error(
            'Reflection submission is not supported on this client.',
          );
        }
        const stored = client.getCredentials();
        const response = await client.submitReflection({
          questionId: input.questionId,
          content: input.content,
          isAnonymous: input.isAnonymous,
          ...(stored?.sessionCode ? { sessionCode: stored.sessionCode } : {}),
          ...(stored?.memberId ? { memberId: stored.memberId } : {}),
        });
        if (response.type === 'session_updated') {
          setSession(response.session);
          setLastSessionCommand(response.command);
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to submit reflection';
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
    loadStudy,
    openLobby,
    startStudy,
    chooseVolunteer,
    completeTurn,
    overrideTurn,
    nextSection,
    setHandRaised,
    lowerHand,
    clearRaisedHands,
    switchQuestion,
    addQuestion,
    submitReflection,
    lastSessionCommand,
    leaveRoom,
    clearError,
  };
}

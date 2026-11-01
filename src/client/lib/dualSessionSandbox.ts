import { useCallback, useEffect, useRef, useState } from 'react';
import {
  deriveInitials,
  toSessionStudySummary,
  type AvatarPalette,
  type SessionStudySummary,
} from '../../shared/session';
import { validateStudyDocument, type StudyDocument } from '../../shared/study';
import { resolveApiUrl, type LocationLike } from './runtimeUrl';
import {
  createSessionSocketClient,
  type SessionSocketClient,
  type StorageLike,
  type WebSocketLike,
} from './sessionSocket';

export const DEFAULT_REHEARSAL_PARTICIPANTS = [
  'Mary Lopez',
  'Daniel Reyes',
  'Sara Castillo',
] as const;

export interface StorageMapLike extends StorageLike {
  readonly size: number;
  clear(): void;
}

export function createInMemoryStorage(): StorageMapLike {
  const map = new Map<string, string>();
  return {
    get size() {
      return map.size;
    },
    getItem(key: string): string | null {
      return map.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      map.set(key, value);
    },
    removeItem(key: string): void {
      map.delete(key);
    },
    clear(): void {
      map.clear();
    },
  };
}

export interface DualParticipant {
  memberId: string;
  displayName: string;
  initials: string;
  avatarPalette: AvatarPalette;
  client: SessionSocketClient;
  storage: StorageLike;
}

export interface DualSessionSandboxOptions {
  location?: LocationLike;
  fetchStudyDoc?: () => Promise<StudyDocument>;
  defaultParticipants?: readonly string[];
  createWebSocket?: (url: string) => WebSocketLike;
  autoInit?: boolean;
}

export interface DualSessionSandboxState {
  leaderClient: SessionSocketClient | null;
  leaderStorage: StorageLike | null;
  participants: DualParticipant[];
  activeParticipantId: string | null;
  sessionCode: string | null;
  leaderPin: string | null;
  isInitializing: boolean;
  error: string | null;
}

async function defaultFetchStudyDoc(): Promise<StudyDocument> {
  const url = resolveApiUrl('/api/studies/default');
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to load default study: server returned HTTP ${response.status}`,
    );
  }
  const payload = await response.json();
  const validation = validateStudyDocument(payload);
  if (!validation.valid) {
    throw new Error(
      `Invalid default study: ${validation.errors.join(', ') || 'malformed structure'}`,
    );
  }
  return validation.value;
}

export interface RehearsalSessionPayload {
  leaderClient: SessionSocketClient;
  leaderStorage: StorageLike;
  participants: DualParticipant[];
  activeParticipantId: string;
  sessionCode: string;
  leaderPin: string;
}

/**
 * Initializes an isolated rehearsal session:
 * 1. Spawns leader client with in-memory storage.
 * 2. Creates room, loads default study, and opens lobby.
 * 3. Joins default participants with isolated in-memory storages.
 */
export async function initializeRehearsalSession(
  options: DualSessionSandboxOptions = {},
): Promise<RehearsalSessionPayload> {
  const leaderStorage = createInMemoryStorage();
  const leaderClient = createSessionSocketClient({
    storage: leaderStorage,
    persistCredentials: true,
    location: options.location,
    createWebSocket: options.createWebSocket,
  });

  await leaderClient.connect();

  const sessionCreated = await leaderClient.createSession({
    displayName: 'Study Leader',
  });

  const sessionCode = sessionCreated.session.sessionCode;
  const leaderPin = sessionCreated.leaderPin;

  // Fetch and load study
  const fetchDoc = options.fetchStudyDoc ?? defaultFetchStudyDoc;
  const studyDoc = await fetchDoc();
  const summary: SessionStudySummary = toSessionStudySummary(studyDoc);

  await leaderClient.sendLeaderCommand({
    type: 'load_study',
    study: summary,
  });

  await leaderClient.sendLeaderCommand({
    type: 'open_lobby',
  });

  // Join participants
  const participantNames =
    options.defaultParticipants ?? DEFAULT_REHEARSAL_PARTICIPANTS;
  const participants: DualParticipant[] = [];

  for (const name of participantNames) {
    const pStorage = createInMemoryStorage();
    const pClient = createSessionSocketClient({
      storage: pStorage,
      persistCredentials: true,
      location: options.location,
      createWebSocket: options.createWebSocket,
    });
    await pClient.connect();
    const joinResult = await pClient.joinSession({
      sessionCode,
      displayName: name,
    });

    const member = joinResult.session.members.find(
      (m) => m.memberId === joinResult.memberId,
    );
    participants.push({
      memberId: joinResult.memberId,
      displayName: member?.displayName ?? name,
      initials: member?.initials ?? deriveInitials(name),
      avatarPalette: member?.avatarPalette ?? 'indigo',
      client: pClient,
      storage: pStorage,
    });
  }

  const activeParticipantId = participants[0]?.memberId ?? '';

  return {
    leaderClient,
    leaderStorage,
    participants,
    activeParticipantId,
    sessionCode,
    leaderPin,
  };
}

export async function addParticipantToRehearsal(
  sessionCode: string,
  displayName: string,
  options: {
    location?: LocationLike;
    createWebSocket?: (url: string) => WebSocketLike;
  } = {},
): Promise<DualParticipant> {
  const pStorage = createInMemoryStorage();
  const pClient = createSessionSocketClient({
    storage: pStorage,
    persistCredentials: true,
    location: options.location,
    createWebSocket: options.createWebSocket,
  });
  await pClient.connect();
  const joinResult = await pClient.joinSession({
    sessionCode,
    displayName,
  });

  const member = joinResult.session.members.find(
    (m) => m.memberId === joinResult.memberId,
  );
  return {
    memberId: joinResult.memberId,
    displayName: member?.displayName ?? displayName,
    initials: member?.initials ?? deriveInitials(displayName),
    avatarPalette: member?.avatarPalette ?? 'indigo',
    client: pClient,
    storage: pStorage,
  };
}

export async function exitRehearsalSession(
  leaderClient: SessionSocketClient | null,
  participants: DualParticipant[],
): Promise<void> {
  if (leaderClient && leaderClient.isConnected()) {
    try {
      await leaderClient.sendLeaderCommand({
        type: 'close_session',
        reason: 'dual_rehearsal_exit',
      });
    } catch {
      // Best-effort close
    }
  }

  for (const p of participants) {
    try {
      p.client.disconnect();
    } catch {
      // Disconnect best-effort
    }
  }

  if (leaderClient) {
    try {
      leaderClient.disconnect();
    } catch {
      // Disconnect best-effort
    }
  }
}

export interface UseDualSessionSandboxResult extends DualSessionSandboxState {
  activeParticipant: DualParticipant | null;
  addParticipant: (displayName: string) => Promise<DualParticipant | null>;
  setActiveParticipantId: (memberId: string) => void;
  exitRehearsal: () => Promise<void>;
  retryInit: () => void;
}

export function useDualSessionSandbox(
  options: DualSessionSandboxOptions = {},
): UseDualSessionSandboxResult {
  const [state, setState] = useState<DualSessionSandboxState>({
    leaderClient: null,
    leaderStorage: null,
    participants: [],
    activeParticipantId: null,
    sessionCode: null,
    leaderPin: null,
    isInitializing: options.autoInit !== false,
    error: null,
  });

  const optionsRef = useRef<DualSessionSandboxOptions>(options);
  optionsRef.current = options;

  const isMountedRef = useRef<boolean>(true);
  const isInitializingRef = useRef<boolean>(false);
  const activeSandboxRef = useRef<{
    leaderClient: SessionSocketClient | null;
    participants: DualParticipant[];
  }>({
    leaderClient: null,
    participants: [],
  });

  const initSandbox = useCallback(async () => {
    if (isInitializingRef.current) {
      return;
    }
    isInitializingRef.current = true;
    setState((prev) => ({ ...prev, isInitializing: true, error: null }));
    try {
      const payload = await initializeRehearsalSession(optionsRef.current);
      if (!isMountedRef.current) {
        await exitRehearsalSession(
          payload.leaderClient,
          payload.participants,
        );
        return;
      }

      activeSandboxRef.current = {
        leaderClient: payload.leaderClient,
        participants: [...payload.participants],
      };

      setState({
        leaderClient: payload.leaderClient,
        leaderStorage: payload.leaderStorage,
        participants: [...payload.participants],
        activeParticipantId: payload.activeParticipantId,
        sessionCode: payload.sessionCode,
        leaderPin: payload.leaderPin,
        isInitializing: false,
        error: null,
      });
    } catch (err) {
      if (!isMountedRef.current) return;
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to initialize rehearsal sandbox';
      setState((prev) => ({
        ...prev,
        isInitializing: false,
        error: message,
      }));
    } finally {
      isInitializingRef.current = false;
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    if (optionsRef.current.autoInit !== false) {
      void initSandbox();
    }

    return () => {
      isMountedRef.current = false;
      const { leaderClient, participants } = activeSandboxRef.current;
      void exitRehearsalSession(leaderClient, participants);
    };
  }, [initSandbox]);

  const addParticipant = useCallback(
    async (displayName: string): Promise<DualParticipant | null> => {
      if (!state.sessionCode) {
        return null;
      }
      try {
        const newParticipant = await addParticipantToRehearsal(
          state.sessionCode,
          displayName,
          {
            location: optionsRef.current.location,
            createWebSocket: optionsRef.current.createWebSocket,
          },
        );
        activeSandboxRef.current.participants = [
          ...activeSandboxRef.current.participants,
          newParticipant,
        ];
        setState((prev) => ({
          ...prev,
          participants: [...prev.participants, newParticipant],
          activeParticipantId: newParticipant.memberId,
        }));
        return newParticipant;
      } catch (err) {
        return null;
      }
    },
    [state.sessionCode],
  );

  const setActiveParticipantId = useCallback((memberId: string) => {
    setState((prev) => ({ ...prev, activeParticipantId: memberId }));
  }, []);

  const exitRehearsal = useCallback(async () => {
    const { leaderClient, participants } = activeSandboxRef.current;
    await exitRehearsalSession(leaderClient, participants);
    activeSandboxRef.current = { leaderClient: null, participants: [] };
    if (isMountedRef.current) {
      setState({
        leaderClient: null,
        leaderStorage: null,
        participants: [],
        activeParticipantId: null,
        sessionCode: null,
        leaderPin: null,
        isInitializing: false,
        error: null,
      });
    }
  }, []);

  const activeParticipant =
    state.participants.find((p) => p.memberId === state.activeParticipantId) ??
    state.participants[0] ??
    null;

  return {
    ...state,
    activeParticipant,
    addParticipant,
    setActiveParticipantId,
    exitRehearsal,
    retryInit: initSandbox,
  };
}

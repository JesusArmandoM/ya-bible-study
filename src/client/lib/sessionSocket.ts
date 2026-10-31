import type { SanctuaryRole } from '../../shared/health';
import {
  isValidSessionCode,
  normalizeSessionCode,
  type ClientWsMessage,
  type LeaderCommandType,
  type PublicLiveSessionSnapshot,
  type ServerWsMessage,
  type SessionDiscussionQuestion,
  type SessionErrorCode,
  type SessionStudySummary,
} from '../../shared/session';
import { resolveWebSocketUrl, type LocationLike } from './runtimeUrl';

export const SESSION_CREDENTIALS_STORAGE_KEY =
  'ya-bible-study.session-credentials';

const WS_CONNECTING = 0;
const WS_OPEN = 1;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

export interface StoredSessionCredentials {
  sessionCode: string;
  memberId: string;
  role: SanctuaryRole;
  reconnectToken: string;
  leaderToken?: string;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface WebSocketMessageEventLike {
  data: unknown;
}

export interface WebSocketCloseEventLike {
  code?: number;
  reason?: string;
}

export interface WebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: 'open', listener: () => void): void;
  addEventListener(
    type: 'message',
    listener: (event: WebSocketMessageEventLike) => void,
  ): void;
  addEventListener(
    type: 'close',
    listener: (event: WebSocketCloseEventLike) => void,
  ): void;
  addEventListener(type: 'error', listener: (event: unknown) => void): void;
  removeEventListener(type: 'open', listener: () => void): void;
  removeEventListener(
    type: 'message',
    listener: (event: WebSocketMessageEventLike) => void,
  ): void;
  removeEventListener(
    type: 'close',
    listener: (event: WebSocketCloseEventLike) => void,
  ): void;
  removeEventListener(type: 'error', listener: (event: unknown) => void): void;
}

export class SessionSocketError extends Error {
  public readonly code: SessionErrorCode;
  public readonly requestId?: string;

  public constructor(
    code: SessionErrorCode,
    message: string,
    requestId?: string,
  ) {
    super(message);
    this.name = 'SessionSocketError';
    this.code = code;
    if (requestId) {
      this.requestId = requestId;
    }
  }
}

function resolveDefaultStorage(
  storageOverride?: StorageLike | null,
): StorageLike | null {
  if (storageOverride !== undefined) {
    return storageOverride;
  }

  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      return window.sessionStorage;
    }
  } catch {
    return null;
  }

  return null;
}

function sanitizeCredentials(
  input: StoredSessionCredentials,
): StoredSessionCredentials {
  const normalizedCode = normalizeSessionCode(input.sessionCode);
  const role: SanctuaryRole =
    input.role === 'Study Leader' ? 'Study Leader' : 'Participant';

  const sanitized: StoredSessionCredentials = {
    sessionCode: normalizedCode,
    memberId: input.memberId.trim(),
    role,
    reconnectToken: input.reconnectToken.trim(),
  };

  if (
    role === 'Study Leader' &&
    typeof input.leaderToken === 'string' &&
    input.leaderToken.trim().length > 0
  ) {
    sanitized.leaderToken = input.leaderToken.trim();
  }

  return sanitized;
}

export function saveStoredSessionCredentials(
  credentials: StoredSessionCredentials,
  storageOverride?: StorageLike | null,
): StoredSessionCredentials {
  const sanitized = sanitizeCredentials(credentials);
  const storage = resolveDefaultStorage(storageOverride);
  if (storage) {
    storage.setItem(
      SESSION_CREDENTIALS_STORAGE_KEY,
      JSON.stringify(sanitized),
    );
  }
  return sanitized;
}

export function loadStoredSessionCredentials(
  storageOverride?: StorageLike | null,
): StoredSessionCredentials | null {
  const storage = resolveDefaultStorage(storageOverride);
  if (!storage) {
    return null;
  }

  const raw = storage.getItem(SESSION_CREDENTIALS_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null;
    }

    const sessionCode = normalizeSessionCode(parsed.sessionCode);
    const memberId =
      typeof parsed.memberId === 'string' ? parsed.memberId.trim() : '';
    const role = parsed.role;
    const reconnectToken =
      typeof parsed.reconnectToken === 'string'
        ? parsed.reconnectToken.trim()
        : '';

    if (
      !isValidSessionCode(sessionCode) ||
      memberId.length === 0 ||
      reconnectToken.length === 0 ||
      (role !== 'Study Leader' && role !== 'Participant')
    ) {
      return null;
    }

    const loaded: StoredSessionCredentials = {
      sessionCode,
      memberId,
      role,
      reconnectToken,
    };

    if (
      role === 'Study Leader' &&
      typeof parsed.leaderToken === 'string' &&
      parsed.leaderToken.trim().length > 0
    ) {
      loaded.leaderToken = parsed.leaderToken.trim();
    }

    return loaded;
  } catch {
    return null;
  }
}

export function clearStoredSessionCredentials(
  storageOverride?: StorageLike | null,
): void {
  const storage = resolveDefaultStorage(storageOverride);
  if (storage) {
    storage.removeItem(SESSION_CREDENTIALS_STORAGE_KEY);
  }
}

export interface SessionSocketClientOptions {
  pathname?: string;
  location?: LocationLike;
  storage?: StorageLike | null;
  persistCredentials?: boolean;
  requestTimeoutMs?: number;
  createWebSocket?: (url: string) => WebSocketLike;
  onMessage?: (message: ServerWsMessage) => void;
  onSessionSnapshot?: (
    snapshot: PublicLiveSessionSnapshot,
    message: ServerWsMessage,
  ) => void;
  onLeaderReplaced?: (
    message: Extract<ServerWsMessage, { type: 'leader_replaced' }>,
  ) => void;
  onSessionClosed?: (
    message: Extract<ServerWsMessage, { type: 'session_closed' }>,
  ) => void;
  onConnectionChange?: (connected: boolean) => void;
}

export interface LeaderCommandInput {
  type: LeaderCommandType;
  sessionCode?: string;
  leaderToken?: string;
  memberId?: string;
  reason?: string;
  /** Sanitized study summary; required for `load_study` commands. */
  study?: SessionStudySummary;
  /**
   * Single-member target: required for `choose_volunteer`, optional for
   * `clear_hands`.
   */
  targetMemberId?: string;
  /** Target question id: required for `switch_question`. */
  questionId?: string;
  /** Discussion question payload: required for `add_question`. */
  question?: SessionDiscussionQuestion;
}

/** Participant self-service turn commands (protocol v3). */
export interface TurnCommandInput {
  type: 'raise_hand' | 'lower_hand' | 'complete_turn';
  sessionCode?: string;
  memberId?: string;
}

export interface SessionSocketClient {
  getWsUrl(): string;
  connect(): Promise<void>;
  disconnect(code?: number, reason?: string): void;
  isConnected(): boolean;
  getCredentials(): StoredSessionCredentials | null;
  getLatestSession(): PublicLiveSessionSnapshot | null;
  subscribe(listener: (message: ServerWsMessage) => void): () => void;
  ping(): Promise<Extract<ServerWsMessage, { type: 'pong' }>>;
  createSession(input: {
    displayName: string;
  }): Promise<Extract<ServerWsMessage, { type: 'session_created' }>>;
  joinSession(input: {
    sessionCode: string;
    displayName: string;
  }): Promise<Extract<ServerWsMessage, { type: 'session_joined' }>>;
  claimLeader(input: {
    sessionCode: string;
    leaderPin: string;
    displayName?: string;
  }): Promise<Extract<ServerWsMessage, { type: 'leader_claimed' }>>;
  reconnectSession(
    input?: Partial<StoredSessionCredentials>,
  ): Promise<Extract<ServerWsMessage, { type: 'session_reconnected' }>>;
  sendLeaderCommand(
    input: LeaderCommandInput,
  ): Promise<Extract<ServerWsMessage, { type: 'session_updated' | 'session_closed' }>>;
  /**
   * Participant self-service hand-raise commands (protocol v3). OPTIONAL so
   * minimal `SessionSocketClient` test doubles that predate the hand-raise
   * feature keep typechecking without a breaking interface change; callers
   * guard with a descriptive error.
   */
  sendTurnCommand?(
    input: TurnCommandInput,
  ): Promise<Extract<ServerWsMessage, { type: 'session_updated' }>>;
}

interface PendingRequest {
  expectedTypes: ReadonlySet<ServerWsMessage['type']>;
  resolve: (message: ServerWsMessage) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

export function createSessionSocketClient(
  options: SessionSocketClientOptions = {},
): SessionSocketClient {
  const pathname = options.pathname ?? '/ws';
  const persistCredentials = options.persistCredentials ?? true;
  const requestTimeoutMs =
    options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const createWebSocket: (url: string) => WebSocketLike =
    options.createWebSocket ?? ((url: string) => new WebSocket(url));

  let activeSocket: WebSocketLike | null = null;
  let connectPromise: Promise<void> | null = null;
  let requestCounter = 0;
  let latestSession: PublicLiveSessionSnapshot | null = null;
  let credentials: StoredSessionCredentials | null = persistCredentials
    ? loadStoredSessionCredentials(options.storage)
    : null;

  const pendingRequests = new Map<string, PendingRequest>();
  const subscribers = new Set<(message: ServerWsMessage) => void>();

  function getWsUrl(): string {
    return resolveWebSocketUrl(pathname, options.location);
  }

  function updateCredentials(next: StoredSessionCredentials | null): void {
    if (!next) {
      credentials = null;
      if (persistCredentials) {
        clearStoredSessionCredentials(options.storage);
      }
      return;
    }

    credentials = persistCredentials
      ? saveStoredSessionCredentials(next, options.storage)
      : sanitizeCredentials(next);
  }

  function rejectAllPending(reason: string): void {
    for (const [reqId, pending] of pendingRequests.entries()) {
      clearTimeout(pending.timeoutId);
      pendingRequests.delete(reqId);
      pending.reject(new Error(reason));
    }
  }

  function handleIncomingFrame(event: WebSocketMessageEventLike): void {
    if (typeof event.data !== 'string') {
      return;
    }

    let message: ServerWsMessage;
    try {
      message = JSON.parse(event.data) as ServerWsMessage;
    } catch {
      return;
    }

    if (
      message.type === 'session_created' ||
      message.type === 'session_joined' ||
      message.type === 'leader_claimed' ||
      message.type === 'session_reconnected' ||
      message.type === 'roster_updated' ||
      message.type === 'session_updated'
    ) {
      latestSession = message.session;
    } else if (message.type === 'session_closed') {
      latestSession = null;
      if (credentials && credentials.sessionCode === message.sessionCode) {
        updateCredentials(null);
      }
    } else if (message.type === 'leader_replaced') {
      if (credentials && credentials.sessionCode === message.sessionCode) {
        updateCredentials(null);
      }
    }

    const requestId =
      'requestId' in message && typeof message.requestId === 'string'
        ? message.requestId
        : undefined;

    if (requestId && pendingRequests.has(requestId)) {
      const pending = pendingRequests.get(requestId)!;
      clearTimeout(pending.timeoutId);
      pendingRequests.delete(requestId);

      if (message.type === 'session_error') {
        pending.reject(
          new SessionSocketError(message.code, message.message, requestId),
        );
      } else if (pending.expectedTypes.has(message.type)) {
        pending.resolve(message);
      } else {
        pending.reject(
          new Error(`Unexpected WebSocket response type "${message.type}".`),
        );
      }
    }

    if (
      (message.type === 'session_created' ||
        message.type === 'session_joined' ||
        message.type === 'leader_claimed' ||
        message.type === 'session_reconnected' ||
        message.type === 'roster_updated' ||
        message.type === 'session_updated') &&
      options.onSessionSnapshot
    ) {
      options.onSessionSnapshot(message.session, message);
    }

    if (message.type === 'leader_replaced' && options.onLeaderReplaced) {
      options.onLeaderReplaced(message);
    }

    if (message.type === 'session_closed' && options.onSessionClosed) {
      options.onSessionClosed(message);
    }

    options.onMessage?.(message);
    for (const listener of subscribers) {
      listener(message);
    }
  }

  function connect(): Promise<void> {
    if (activeSocket && activeSocket.readyState === WS_OPEN) {
      return Promise.resolve();
    }

    if (connectPromise) {
      return connectPromise;
    }

    const url = getWsUrl();
    const socket = createWebSocket(url);
    activeSocket = socket;

    connectPromise = new Promise<void>((resolve, reject) => {
      let settled = false;

      const onOpen = () => {
        if (settled) {
          return;
        }
        settled = true;
        connectPromise = null;
        options.onConnectionChange?.(true);
        resolve();
      };

      const onError = () => {
        if (!settled) {
          settled = true;
          connectPromise = null;
          if (activeSocket === socket) {
            activeSocket = null;
          }
          reject(new Error(`Failed to open WebSocket connection to ${url}.`));
        }
      };

      const onClose = () => {
        socket.removeEventListener('open', onOpen);
        socket.removeEventListener('error', onError);
        socket.removeEventListener('close', onClose);
        socket.removeEventListener('message', handleIncomingFrame);

        if (activeSocket === socket) {
          activeSocket = null;
          connectPromise = null;
          options.onConnectionChange?.(false);
          rejectAllPending('WebSocket connection closed before receiving reply.');
        }

        if (!settled) {
          settled = true;
          reject(new Error(`WebSocket closed before opening (${url}).`));
        }
      };

      socket.addEventListener('open', onOpen);
      socket.addEventListener('error', onError);
      socket.addEventListener('close', onClose);
      socket.addEventListener('message', handleIncomingFrame);
    });

    return connectPromise;
  }

  function disconnect(code?: number, reason?: string): void {
    const socket = activeSocket;
    activeSocket = null;
    connectPromise = null;
    rejectAllPending('WebSocket client disconnected.');

    if (
      socket &&
      (socket.readyState === WS_CONNECTING || socket.readyState === WS_OPEN)
    ) {
      socket.close(code, reason);
      options.onConnectionChange?.(false);
    }
  }

  async function sendRequest<T extends ServerWsMessage['type']>(
    payload: ClientWsMessage,
    expectedTypes: readonly T[],
  ): Promise<Extract<ServerWsMessage, { type: T }>> {
    await connect();

    const socket = activeSocket;
    if (!socket || socket.readyState !== WS_OPEN) {
      throw new Error('WebSocket is not connected.');
    }

    requestCounter += 1;
    const requestId = payload.requestId ?? `req-${requestCounter}`;
    const frame: ClientWsMessage = { ...payload, requestId };

    return await new Promise<Extract<ServerWsMessage, { type: T }>>(
      (resolve, reject) => {
        const timeoutId = setTimeout(() => {
          pendingRequests.delete(requestId);
          reject(
            new Error(
              `Timed out waiting for WebSocket reply to "${payload.type}".`,
            ),
          );
        }, requestTimeoutMs);

        pendingRequests.set(requestId, {
          expectedTypes: new Set(expectedTypes),
          resolve: (msg) =>
            resolve(msg as Extract<ServerWsMessage, { type: T }>),
          reject,
          timeoutId,
        });

        socket.send(JSON.stringify(frame));
      },
    );
  }

  return {
    getWsUrl,
    connect,
    disconnect,
    isConnected: () => Boolean(activeSocket && activeSocket.readyState === WS_OPEN),
    getCredentials: () => (credentials ? { ...credentials } : null),
    getLatestSession: () => latestSession,
    subscribe: (listener) => {
      subscribers.add(listener);
      return () => {
        subscribers.delete(listener);
      };
    },

    ping: async () => {
      return await sendRequest({ type: 'ping' }, ['pong']);
    },

    createSession: async ({ displayName }) => {
      const response = await sendRequest(
        { type: 'create_session', displayName },
        ['session_created'],
      );
      updateCredentials({
        sessionCode: response.sessionCode,
        memberId: response.memberId,
        role: 'Study Leader',
        reconnectToken: response.reconnectToken,
        leaderToken: response.leaderToken,
      });
      return response;
    },

    joinSession: async ({ sessionCode, displayName }) => {
      const response = await sendRequest(
        { type: 'join_session', sessionCode, displayName },
        ['session_joined'],
      );
      updateCredentials({
        sessionCode: response.sessionCode,
        memberId: response.memberId,
        role: 'Participant',
        reconnectToken: response.reconnectToken,
      });
      return response;
    },

    claimLeader: async ({ sessionCode, leaderPin, displayName }) => {
      const response = await sendRequest(
        {
          type: 'claim_leader',
          sessionCode,
          leaderPin,
          ...(displayName !== undefined ? { displayName } : {}),
        },
        ['leader_claimed'],
      );
      updateCredentials({
        sessionCode: response.sessionCode,
        memberId: response.memberId,
        role: 'Study Leader',
        reconnectToken: response.reconnectToken,
        leaderToken: response.leaderToken,
      });
      return response;
    },

    reconnectSession: async (override) => {
      const mergedSessionCode = override?.sessionCode ?? credentials?.sessionCode ?? '';
      const mergedMemberId = override?.memberId ?? credentials?.memberId ?? '';
      const mergedReconnectToken =
        override?.reconnectToken !== undefined
          ? override.reconnectToken
          : credentials?.reconnectToken;
      const mergedLeaderToken =
        override?.leaderToken !== undefined
          ? override.leaderToken
          : credentials?.leaderToken;

      const response = await sendRequest(
        {
          type: 'reconnect_session',
          sessionCode: mergedSessionCode,
          memberId: mergedMemberId,
          ...(mergedReconnectToken !== undefined
            ? { reconnectToken: mergedReconnectToken }
            : {}),
          ...(mergedLeaderToken !== undefined
            ? { leaderToken: mergedLeaderToken }
            : {}),
        },
        ['session_reconnected'],
      );

      if (mergedReconnectToken) {
        updateCredentials({
          sessionCode: response.sessionCode,
          memberId: response.memberId,
          role: response.role,
          reconnectToken: mergedReconnectToken,
          ...(response.role === 'Study Leader' && mergedLeaderToken
            ? { leaderToken: mergedLeaderToken }
            : {}),
        });
      }

      return response;
    },

    sendLeaderCommand: async (input) => {
      const sessionCode = input.sessionCode ?? credentials?.sessionCode ?? '';
      const leaderToken = input.leaderToken ?? credentials?.leaderToken ?? '';
      const memberId = input.memberId ?? credentials?.memberId;

      if (input.type === 'close_session') {
        return await sendRequest(
          {
            type: 'close_session',
            sessionCode,
            leaderToken,
            ...(memberId ? { memberId } : {}),
            ...(input.reason ? { reason: input.reason } : {}),
          },
          ['session_closed'],
        );
      }

      if (input.type === 'load_study') {
        const study = input.study;
        if (!study) {
          throw new Error('load_study leader commands require a study summary.');
        }
        return await sendRequest(
          {
            type: 'load_study',
            sessionCode,
            leaderToken,
            ...(memberId ? { memberId } : {}),
            study,
          },
          ['session_updated'],
        );
      }

      if (input.type === 'clear_hands') {
        return await sendRequest(
          {
            type: 'clear_hands',
            sessionCode,
            leaderToken,
            ...(memberId ? { memberId } : {}),
            ...(input.targetMemberId ? { targetMemberId: input.targetMemberId } : {}),
          },
          ['session_updated'],
        );
      }

      if (input.type === 'choose_volunteer') {
        const targetMemberId = input.targetMemberId;
        if (!targetMemberId) {
          throw new Error(
            'choose_volunteer leader commands require a targetMemberId.',
          );
        }
        return await sendRequest(
          {
            type: 'choose_volunteer',
            sessionCode,
            leaderToken,
            ...(memberId ? { memberId } : {}),
            targetMemberId,
          },
          ['session_updated'],
        );
      }

      if (input.type === 'switch_question') {
        const questionId = input.questionId;
        if (!questionId) {
          throw new Error(
            'switch_question leader commands require a questionId.',
          );
        }
        return await sendRequest(
          {
            type: 'switch_question',
            sessionCode,
            leaderToken,
            ...(memberId ? { memberId } : {}),
            questionId,
          },
          ['session_updated'],
        );
      }

      if (input.type === 'add_question') {
        const question = input.question;
        if (!question) {
          throw new Error(
            'add_question leader commands require a question.',
          );
        }
        return await sendRequest(
          {
            type: 'add_question',
            sessionCode,
            leaderToken,
            ...(memberId ? { memberId } : {}),
            question,
          },
          ['session_updated'],
        );
      }

      return await sendRequest(
        {
          type: input.type,
          sessionCode,
          leaderToken,
          ...(memberId ? { memberId } : {}),
        },
        ['session_updated'],
      );
    },

    sendTurnCommand: async (input) => {
      const sessionCode = input.sessionCode ?? credentials?.sessionCode ?? '';
      const memberId = input.memberId ?? credentials?.memberId ?? '';
      if (!memberId) {
        throw new Error(
          `${input.type} turn commands require the participant memberId.`,
        );
      }
      return await sendRequest(
        {
          type: input.type,
          sessionCode,
          memberId,
        },
        ['session_updated'],
      );
    },
  };
}

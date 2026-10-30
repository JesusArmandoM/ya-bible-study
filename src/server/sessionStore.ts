import crypto from 'node:crypto';
import type { SanctuaryRole } from '../shared/health.js';
import {
  DEFAULT_SESSION_SWEEP_INTERVAL_MS,
  DEFAULT_SESSION_TTL_MS,
  LEADER_PIN_LENGTH,
  PARTICIPANT_AVATAR_PALETTES,
  SESSION_CODE_ALPHABET,
  SESSION_CODE_LENGTH,
  SESSION_PROTOCOL_VERSION,
  STUDY_SECTION_IDS,
  deriveInitials,
  isValidDisplayName,
  isValidLeaderPin,
  isValidSessionCode,
  normalizeDisplayName,
  normalizeLeaderPin,
  normalizeSessionCode,
  normalizeSessionStudySummary,
  type AvatarPalette,
  type LeaderCommandType,
  type LiveSessionStatus,
  type MemberConnectionStatus,
  type PublicLiveSessionSnapshot,
  type PublicSessionMember,
  type ServerWsMessage,
  type SessionCloseReason,
  type SessionErrorCode,
  type SessionStudySummary,
  type StudySectionId,
} from '../shared/session.js';

const SOCKET_OPEN_READY_STATE = 1;
const MAX_CODE_GENERATION_ATTEMPTS = 128;

export interface SessionPeerSocket {
  readonly readyState: number;
  send(data: string): void;
}

interface InternalSessionMember {
  memberId: string;
  displayName: string;
  initials: string;
  avatarPalette: AvatarPalette;
  role: SanctuaryRole;
  connectionStatus: MemberConnectionStatus;
  joinedAt: string;
  reconnectToken: string;
  socket: SessionPeerSocket | null;
}

interface InternalLiveSession {
  sessionCode: string;
  leaderPin: string;
  leaderToken: string;
  leaderMemberId: string;
  status: LiveSessionStatus;
  currentSectionIndex: number | null;
  currentSectionId: StudySectionId | null;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  lastActivityAt: number;
  nextParticipantPaletteIndex: number;
  study: SessionStudySummary | null;
  members: Map<string, InternalSessionMember>;
}

interface SocketBinding {
  sessionCode: string;
  memberId: string;
}

export interface LiveSessionStoreOptions {
  now?: () => number;
  sessionTtlMs?: number;
  sweepIntervalMs?: number | false;
  generateSessionCode?: () => string;
  generateLeaderPin?: () => string;
  generateSecretToken?: () => string;
  generateMemberId?: () => string;
}

function defaultGenerateSessionCode(): string {
  let code = '';
  for (let i = 0; i < SESSION_CODE_LENGTH; i += 1) {
    const index = crypto.randomInt(0, SESSION_CODE_ALPHABET.length);
    code += SESSION_CODE_ALPHABET[index];
  }
  return code;
}

function defaultGenerateLeaderPin(): string {
  return crypto
    .randomInt(0, 10 ** LEADER_PIN_LENGTH)
    .toString()
    .padStart(LEADER_PIN_LENGTH, '0');
}

function defaultGenerateSecretToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

function defaultGenerateMemberId(): string {
  return crypto.randomUUID();
}

function timingSafeEqualSecret(candidate: unknown, expected: string): boolean {
  if (typeof candidate !== 'string' || candidate.length === 0) {
    return false;
  }

  const candidateBuf = Buffer.from(candidate, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');

  if (candidateBuf.byteLength !== expectedBuf.byteLength) {
    crypto.timingSafeEqual(expectedBuf, expectedBuf);
    return false;
  }

  return crypto.timingSafeEqual(candidateBuf, expectedBuf);
}

function toPublicMember(member: InternalSessionMember): PublicSessionMember {
  return {
    memberId: member.memberId,
    displayName: member.displayName,
    initials: member.initials,
    avatarPalette: member.avatarPalette,
    role: member.role,
    connectionStatus: member.connectionStatus,
    joinedAt: member.joinedAt,
  };
}

function toPublicSnapshot(
  session: InternalLiveSession,
): PublicLiveSessionSnapshot {
  const members: PublicSessionMember[] = [];
  let connectedMemberCount = 0;
  let connectedParticipantCount = 0;

  for (const member of session.members.values()) {
    if (member.connectionStatus === 'connected') {
      connectedMemberCount += 1;
      if (member.role === 'Participant') {
        connectedParticipantCount += 1;
      }
    }
    members.push(toPublicMember(member));
  }

  return {
    sessionCode: session.sessionCode,
    status: session.status,
    currentSectionIndex: session.currentSectionIndex,
    currentSectionId: session.currentSectionId,
    createdAt: session.createdAt,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    connectedMemberCount,
    connectedParticipantCount,
    members,
    study: session.study ? { ...session.study } : null,
    protocolVersion: SESSION_PROTOCOL_VERSION,
  };
}

function extractRequestId(record: Record<string, unknown>): string | undefined {
  if (
    typeof record.requestId === 'string' &&
    record.requestId.length > 0 &&
    record.requestId.length <= 128
  ) {
    return record.requestId;
  }
  return undefined;
}

export class LiveSessionStore {
  private readonly sessions = new Map<string, InternalLiveSession>();
  private readonly socketBindings = new Map<SessionPeerSocket, SocketBinding>();
  private readonly now: () => number;
  private readonly sessionTtlMs: number;
  private readonly generateSessionCode: () => string;
  private readonly generateLeaderPin: () => string;
  private readonly generateSecretToken: () => string;
  private readonly generateMemberId: () => string;
  private sweepTimer: ReturnType<typeof setInterval> | undefined;

  public constructor(options: LiveSessionStoreOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.sessionTtlMs = options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
    this.generateSessionCode =
      options.generateSessionCode ?? defaultGenerateSessionCode;
    this.generateLeaderPin =
      options.generateLeaderPin ?? defaultGenerateLeaderPin;
    this.generateSecretToken =
      options.generateSecretToken ?? defaultGenerateSecretToken;
    this.generateMemberId = options.generateMemberId ?? defaultGenerateMemberId;

    const sweepIntervalMs =
      options.sweepIntervalMs === undefined
        ? DEFAULT_SESSION_SWEEP_INTERVAL_MS
        : options.sweepIntervalMs;

    if (sweepIntervalMs !== false && sweepIntervalMs > 0) {
      this.sweepTimer = setInterval(() => {
        this.sweepExpiredSessions();
      }, sweepIntervalMs);
      this.sweepTimer.unref();
    }
  }

  public getActiveSessionCount(): number {
    this.sweepExpiredSessions();
    return this.sessions.size;
  }

  public getPublicSessionSnapshot(
    rawSessionCode: string,
  ): PublicLiveSessionSnapshot | null {
    this.sweepExpiredSessions();
    const code = normalizeSessionCode(rawSessionCode);
    const session = this.sessions.get(code);
    return session ? toPublicSnapshot(session) : null;
  }

  public sweepExpiredSessions(): string[] {
    const currentNow = this.now();
    const expiredCodes: string[] = [];

    for (const [sessionCode, session] of this.sessions.entries()) {
      if (currentNow - session.lastActivityAt >= this.sessionTtlMs) {
        this.closeAndPurgeSession(session, 'expired_inactivity');
        expiredCodes.push(sessionCode);
      }
    }

    return expiredCodes;
  }

  public dispose(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = undefined;
    }
  }

  public handleSocketClose(socket: SessionPeerSocket): void {
    const binding = this.socketBindings.get(socket);
    if (!binding) {
      return;
    }

    this.socketBindings.delete(socket);

    const session = this.sessions.get(binding.sessionCode);
    if (!session) {
      return;
    }

    const member = session.members.get(binding.memberId);
    if (!member || member.socket !== socket) {
      return;
    }

    member.socket = null;
    member.connectionStatus = 'disconnected';
    this.broadcastRosterUpdated(session);
  }

  public handleMessage(socket: SessionPeerSocket, rawMessage: unknown): void {
    if (
      typeof rawMessage !== 'object' ||
      rawMessage === null ||
      Array.isArray(rawMessage)
    ) {
      this.sendError(
        socket,
        'INVALID_MESSAGE',
        'WebSocket frame must be a JSON object.',
      );
      return;
    }

    const record = rawMessage as Record<string, unknown>;
    const requestId = extractRequestId(record);

    if (typeof record.type !== 'string') {
      this.sendError(
        socket,
        'INVALID_MESSAGE',
        'WebSocket message is missing a string "type" field.',
        requestId,
      );
      return;
    }

    switch (record.type) {
      case 'create_session':
        this.handleCreateSession(socket, record, requestId);
        return;
      case 'join_session':
        this.handleJoinSession(socket, record, requestId);
        return;
      case 'claim_leader':
        this.handleClaimLeader(socket, record, requestId);
        return;
      case 'reconnect_session':
        this.handleReconnectSession(socket, record, requestId);
        return;
      case 'open_lobby':
      case 'load_study':
      case 'start_study':
      case 'next_section':
      case 'close_session':
        this.handleLeaderCommand(socket, record.type, record, requestId);
        return;
      default:
        this.sendError(
          socket,
          'INVALID_MESSAGE',
          `Unsupported WebSocket message type "${record.type}".`,
          requestId,
        );
    }
  }

  private handleCreateSession(
    socket: SessionPeerSocket,
    record: Record<string, unknown>,
    requestId?: string,
  ): void {
    this.sweepExpiredSessions();

    const normalizedName = normalizeDisplayName(record.displayName);
    if (!isValidDisplayName(normalizedName)) {
      this.sendError(
        socket,
        'INVALID_DISPLAY_NAME',
        'Enter a display name between 1 and 48 characters to create a session.',
        requestId,
      );
      return;
    }

    const sessionCode = this.allocateUniqueSessionCode();
    const leaderPin = this.generateLeaderPin();
    const leaderToken = this.generateSecretToken();
    const reconnectToken = this.generateSecretToken();
    const leaderMemberId = this.generateMemberId();
    const currentNow = this.now();
    const isoNow = new Date(currentNow).toISOString();

    this.detachSocketIfBound(socket);

    const leaderMember: InternalSessionMember = {
      memberId: leaderMemberId,
      displayName: normalizedName,
      initials: deriveInitials(normalizedName),
      avatarPalette: 'gold',
      role: 'Study Leader',
      connectionStatus: 'connected',
      joinedAt: isoNow,
      reconnectToken,
      socket,
    };

    const members = new Map<string, InternalSessionMember>();
    members.set(leaderMemberId, leaderMember);

    const session: InternalLiveSession = {
      sessionCode,
      leaderPin,
      leaderToken,
      leaderMemberId,
      status: 'setup',
      currentSectionIndex: null,
      currentSectionId: null,
      createdAt: isoNow,
      startedAt: null,
      endedAt: null,
      lastActivityAt: currentNow,
      nextParticipantPaletteIndex: 0,
      study: null,
      members,
    };

    this.sessions.set(sessionCode, session);
    this.socketBindings.set(socket, {
      sessionCode,
      memberId: leaderMemberId,
    });

    this.sendToSocket(socket, {
      type: 'session_created',
      ...(requestId ? { requestId } : {}),
      sessionCode,
      memberId: leaderMemberId,
      role: 'Study Leader',
      leaderPin,
      leaderToken,
      reconnectToken,
      session: toPublicSnapshot(session),
    });
  }

  private handleJoinSession(
    socket: SessionPeerSocket,
    record: Record<string, unknown>,
    requestId?: string,
  ): void {
    this.sweepExpiredSessions();

    const sessionCode = normalizeSessionCode(record.sessionCode);
    if (!isValidSessionCode(sessionCode)) {
      this.sendError(
        socket,
        'INVALID_SESSION_CODE',
        'Enter a valid 6-character session code.',
        requestId,
      );
      return;
    }

    const normalizedName = normalizeDisplayName(record.displayName);
    if (!isValidDisplayName(normalizedName)) {
      this.sendError(
        socket,
        'INVALID_DISPLAY_NAME',
        'Enter a display name between 1 and 48 characters to join.',
        requestId,
      );
      return;
    }

    const session = this.sessions.get(sessionCode);
    if (!session) {
      this.sendError(
        socket,
        'SESSION_NOT_FOUND',
        `No active Bible study session found for code "${sessionCode}".`,
        requestId,
      );
      return;
    }

    if (session.status === 'completed') {
      this.sendError(
        socket,
        'SESSION_CLOSED',
        'This Bible study session has already concluded.',
        requestId,
      );
      return;
    }

    this.detachSocketIfBound(socket);

    const disambiguatedName = this.disambiguateDisplayName(
      session,
      normalizedName,
    );
    const avatarPalette =
      PARTICIPANT_AVATAR_PALETTES[
        session.nextParticipantPaletteIndex %
          PARTICIPANT_AVATAR_PALETTES.length
      ] ?? 'indigo';
    session.nextParticipantPaletteIndex += 1;

    const memberId = this.generateMemberId();
    const reconnectToken = this.generateSecretToken();
    const currentNow = this.now();
    const isoNow = new Date(currentNow).toISOString();

    const participantMember: InternalSessionMember = {
      memberId,
      displayName: disambiguatedName,
      initials: deriveInitials(disambiguatedName),
      avatarPalette,
      role: 'Participant',
      connectionStatus: 'connected',
      joinedAt: isoNow,
      reconnectToken,
      socket,
    };

    session.members.set(memberId, participantMember);
    session.lastActivityAt = currentNow;
    this.socketBindings.set(socket, {
      sessionCode: session.sessionCode,
      memberId,
    });

    const snapshot = toPublicSnapshot(session);
    this.sendToSocket(socket, {
      type: 'session_joined',
      ...(requestId ? { requestId } : {}),
      sessionCode: session.sessionCode,
      memberId,
      role: 'Participant',
      displayName: disambiguatedName,
      avatarPalette,
      reconnectToken,
      member: toPublicMember(participantMember),
      session: snapshot,
    });

    this.broadcastRosterUpdated(session, snapshot);
  }

  private handleClaimLeader(
    socket: SessionPeerSocket,
    record: Record<string, unknown>,
    requestId?: string,
  ): void {
    this.sweepExpiredSessions();

    const sessionCode = normalizeSessionCode(record.sessionCode);
    if (!isValidSessionCode(sessionCode)) {
      this.sendError(
        socket,
        'INVALID_SESSION_CODE',
        'Enter a valid 6-character session code.',
        requestId,
      );
      return;
    }

    const session = this.sessions.get(sessionCode);
    if (!session) {
      this.sendError(
        socket,
        'SESSION_NOT_FOUND',
        `No active Bible study session found for code "${sessionCode}".`,
        requestId,
      );
      return;
    }

    let requestedDisplayName: string | undefined;
    if (record.displayName !== undefined) {
      const normalized = normalizeDisplayName(record.displayName);
      if (normalized.length > 0) {
        if (!isValidDisplayName(normalized)) {
          this.sendError(
            socket,
            'INVALID_DISPLAY_NAME',
            'Leader display name must be between 1 and 48 characters.',
            requestId,
          );
          return;
        }
        requestedDisplayName = normalized;
      }
    }

    const candidatePin = normalizeLeaderPin(record.leaderPin);
    if (
      !isValidLeaderPin(candidatePin) ||
      !timingSafeEqualSecret(candidatePin, session.leaderPin)
    ) {
      this.sendError(
        socket,
        'INVALID_LEADER_PIN',
        'Invalid 4-digit Study Leader PIN.',
        requestId,
      );
      return;
    }

    const leaderMember = session.members.get(session.leaderMemberId);
    if (!leaderMember) {
      this.sendError(
        socket,
        'SESSION_NOT_FOUND',
        'Session leader state is unavailable.',
        requestId,
      );
      return;
    }

    const previousLeaderSocket = leaderMember.socket;
    if (previousLeaderSocket && previousLeaderSocket !== socket) {
      this.socketBindings.delete(previousLeaderSocket);
    }

    const existingCallerBinding = this.socketBindings.get(socket);
    if (
      existingCallerBinding &&
      (existingCallerBinding.sessionCode !== session.sessionCode ||
        existingCallerBinding.memberId !== leaderMember.memberId)
    ) {
      this.detachSocketIfBound(socket);
    }

    const rotatedLeaderToken = this.generateDistinctSecretToken(
      session.leaderToken,
    );
    const rotatedReconnectToken = this.generateDistinctSecretToken(
      leaderMember.reconnectToken,
    );

    session.leaderToken = rotatedLeaderToken;
    leaderMember.reconnectToken = rotatedReconnectToken;
    leaderMember.socket = socket;
    leaderMember.connectionStatus = 'connected';

    if (requestedDisplayName) {
      const updatedLeaderName = this.disambiguateDisplayName(
        session,
        requestedDisplayName,
        leaderMember.memberId,
      );
      leaderMember.displayName = updatedLeaderName;
      leaderMember.initials = deriveInitials(updatedLeaderName);
    }

    session.lastActivityAt = this.now();
    this.socketBindings.set(socket, {
      sessionCode: session.sessionCode,
      memberId: leaderMember.memberId,
    });

    if (previousLeaderSocket && previousLeaderSocket !== socket) {
      this.sendToSocket(previousLeaderSocket, {
        type: 'leader_replaced',
        sessionCode: session.sessionCode,
        message:
          'Study Leader control was transferred to another device via Leader PIN.',
      });
    }

    const snapshot = toPublicSnapshot(session);
    this.sendToSocket(socket, {
      type: 'leader_claimed',
      ...(requestId ? { requestId } : {}),
      sessionCode: session.sessionCode,
      memberId: leaderMember.memberId,
      role: 'Study Leader',
      leaderPin: session.leaderPin,
      leaderToken: session.leaderToken,
      reconnectToken: leaderMember.reconnectToken,
      session: snapshot,
    });

    this.broadcastRosterUpdated(session, snapshot);
  }

  private handleReconnectSession(
    socket: SessionPeerSocket,
    record: Record<string, unknown>,
    requestId?: string,
  ): void {
    this.sweepExpiredSessions();

    const sessionCode = normalizeSessionCode(record.sessionCode);
    if (!isValidSessionCode(sessionCode)) {
      this.sendError(
        socket,
        'INVALID_SESSION_CODE',
        'Enter a valid 6-character session code.',
        requestId,
      );
      return;
    }

    const session = this.sessions.get(sessionCode);
    if (!session) {
      this.sendError(
        socket,
        'SESSION_NOT_FOUND',
        `No active Bible study session found for code "${sessionCode}".`,
        requestId,
      );
      return;
    }

    const memberId =
      typeof record.memberId === 'string' ? record.memberId.trim() : '';
    const member = memberId ? session.members.get(memberId) : undefined;
    if (!member) {
      this.sendError(
        socket,
        'UNAUTHORIZED_RECONNECT',
        'Invalid session reconnect credentials.',
        requestId,
      );
      return;
    }

    const hasReconnectToken =
      typeof record.reconnectToken === 'string' &&
      record.reconnectToken.length > 0;
    const hasLeaderToken =
      typeof record.leaderToken === 'string' && record.leaderToken.length > 0;

    let authorized = false;
    if (member.role === 'Study Leader') {
      const reconnectMatches = hasReconnectToken
        ? timingSafeEqualSecret(record.reconnectToken, member.reconnectToken)
        : true;
      const leaderMatches = hasLeaderToken
        ? timingSafeEqualSecret(record.leaderToken, session.leaderToken)
        : true;
      authorized =
        (hasReconnectToken || hasLeaderToken) &&
        reconnectMatches &&
        leaderMatches;
    } else {
      authorized =
        hasReconnectToken &&
        !hasLeaderToken &&
        timingSafeEqualSecret(record.reconnectToken, member.reconnectToken);
    }

    if (!authorized) {
      this.sendError(
        socket,
        'UNAUTHORIZED_RECONNECT',
        'Invalid session reconnect credentials.',
        requestId,
      );
      return;
    }

    if (member.socket && member.socket !== socket) {
      this.socketBindings.delete(member.socket);
    }

    const existingCallerBinding = this.socketBindings.get(socket);
    if (
      existingCallerBinding &&
      (existingCallerBinding.sessionCode !== session.sessionCode ||
        existingCallerBinding.memberId !== member.memberId)
    ) {
      this.detachSocketIfBound(socket);
    }

    member.socket = socket;
    member.connectionStatus = 'connected';
    session.lastActivityAt = this.now();
    this.socketBindings.set(socket, {
      sessionCode: session.sessionCode,
      memberId: member.memberId,
    });

    const snapshot = toPublicSnapshot(session);
    this.sendToSocket(socket, {
      type: 'session_reconnected',
      ...(requestId ? { requestId } : {}),
      sessionCode: session.sessionCode,
      memberId: member.memberId,
      role: member.role,
      member: toPublicMember(member),
      session: snapshot,
    });

    this.broadcastRosterUpdated(session, snapshot);
  }

  private handleLeaderCommand(
    socket: SessionPeerSocket,
    command: LeaderCommandType,
    record: Record<string, unknown>,
    requestId?: string,
  ): void {
    this.sweepExpiredSessions();

    const sessionCode = normalizeSessionCode(record.sessionCode);
    if (!isValidSessionCode(sessionCode)) {
      this.sendError(
        socket,
        'INVALID_SESSION_CODE',
        'Enter a valid 6-character session code.',
        requestId,
      );
      return;
    }

    const session = this.sessions.get(sessionCode);
    if (!session) {
      this.sendError(
        socket,
        'SESSION_NOT_FOUND',
        `No active Bible study session found for code "${sessionCode}".`,
        requestId,
      );
      return;
    }

    if (this.isParticipantCaller(socket, session, record.memberId)) {
      this.sendError(
        socket,
        'FORBIDDEN_LEADER_ONLY',
        'Only the Study Leader can perform this action.',
        requestId,
      );
      return;
    }

    if (!timingSafeEqualSecret(record.leaderToken, session.leaderToken)) {
      this.sendError(
        socket,
        'UNAUTHORIZED_LEADER',
        'Valid Study Leader authorization token is required.',
        requestId,
      );
      return;
    }

    if (
      typeof record.memberId === 'string' &&
      record.memberId.trim().length > 0 &&
      record.memberId.trim() !== session.leaderMemberId
    ) {
      this.sendError(
        socket,
        'UNAUTHORIZED_LEADER',
        'Member ID does not match the active Study Leader.',
        requestId,
      );
      return;
    }

    const currentNow = this.now();
    const isoNow = new Date(currentNow).toISOString();

    if (command === 'close_session') {
      this.closeAndPurgeSession(session, 'closed_by_leader', socket, requestId);
      return;
    }

    if (command === 'open_lobby') {
      if (session.status !== 'setup' && session.status !== 'lobby') {
        this.sendError(
          socket,
          'INVALID_STATE_TRANSITION',
          `Cannot open lobby while session status is "${session.status}".`,
          requestId,
        );
        return;
      }
      session.status = 'lobby';
      session.lastActivityAt = currentNow;
      this.broadcastSessionUpdated(session, command, socket, requestId);
      return;
    }

    if (command === 'load_study') {
      if (session.status !== 'setup' && session.status !== 'lobby') {
        this.sendError(
          socket,
          'INVALID_STATE_TRANSITION',
          `Cannot load a study while session status is "${session.status}".`,
          requestId,
        );
        return;
      }

      const summary = normalizeSessionStudySummary(record.study);
      if (!summary) {
        this.sendError(
          socket,
          'INVALID_MESSAGE',
          'Study summary must include non-empty title, subtitle, liturgical eyebrow, Gospel citation, and Gospel summary label fields, sectionCount 5, and estimatedMinutes (1-180).',
          requestId,
        );
        return;
      }

      session.study = summary;
      session.lastActivityAt = currentNow;
      this.broadcastSessionUpdated(session, command, socket, requestId);
      return;
    }

    if (command === 'start_study') {
      if (session.status !== 'setup' && session.status !== 'lobby') {
        this.sendError(
          socket,
          'INVALID_STATE_TRANSITION',
          `Cannot start study while session status is "${session.status}".`,
          requestId,
        );
        return;
      }
      session.status = 'in_progress';
      session.currentSectionIndex = 0;
      session.currentSectionId = STUDY_SECTION_IDS[0];
      session.startedAt = session.startedAt ?? isoNow;
      session.lastActivityAt = currentNow;
      this.broadcastSessionUpdated(session, command, socket, requestId);
      return;
    }

    if (command === 'next_section') {
      if (
        session.status !== 'in_progress' ||
        session.currentSectionIndex === null
      ) {
        this.sendError(
          socket,
          'INVALID_STATE_TRANSITION',
          'Study must be in progress before advancing sections.',
          requestId,
        );
        return;
      }

      const nextIndex = session.currentSectionIndex + 1;
      const nextSectionId = STUDY_SECTION_IDS[nextIndex];
      if (!nextSectionId) {
        this.sendError(
          socket,
          'INVALID_STATE_TRANSITION',
          'Session is already on the final study section.',
          requestId,
        );
        return;
      }

      session.currentSectionIndex = nextIndex;
      session.currentSectionId = nextSectionId;
      session.lastActivityAt = currentNow;
      this.broadcastSessionUpdated(session, command, socket, requestId);
    }
  }

  private isParticipantCaller(
    socket: SessionPeerSocket,
    session: InternalLiveSession,
    rawMemberId: unknown,
  ): boolean {
    const binding = this.socketBindings.get(socket);
    if (binding && binding.sessionCode === session.sessionCode) {
      const boundMember = session.members.get(binding.memberId);
      if (boundMember?.role === 'Participant') {
        return true;
      }
    }

    if (typeof rawMemberId === 'string' && rawMemberId.trim().length > 0) {
      const explicitMember = session.members.get(rawMemberId.trim());
      if (explicitMember?.role === 'Participant') {
        return true;
      }
    }

    return false;
  }

  private detachSocketIfBound(socket: SessionPeerSocket): void {
    this.handleSocketClose(socket);
  }

  private allocateUniqueSessionCode(): string {
    for (let attempt = 0; attempt < MAX_CODE_GENERATION_ATTEMPTS; attempt += 1) {
      const candidate = normalizeSessionCode(this.generateSessionCode());
      if (isValidSessionCode(candidate) && !this.sessions.has(candidate)) {
        return candidate;
      }
    }

    throw new Error('Unable to allocate a unique 6-character sessionCode.');
  }

  private generateDistinctSecretToken(previousToken: string): string {
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const candidate = this.generateSecretToken();
      if (candidate !== previousToken) {
        return candidate;
      }
    }
    return `${this.generateSecretToken()}-${crypto.randomUUID()}`;
  }

  private disambiguateDisplayName(
    session: InternalLiveSession,
    baseDisplayName: string,
    excludeMemberId?: string,
  ): string {
    const takenLowerNames = new Set<string>();
    for (const member of session.members.values()) {
      if (member.memberId !== excludeMemberId) {
        takenLowerNames.add(member.displayName.toLowerCase());
      }
    }

    if (!takenLowerNames.has(baseDisplayName.toLowerCase())) {
      return baseDisplayName;
    }

    let suffix = 2;
    while (takenLowerNames.has(`${baseDisplayName} (${suffix})`.toLowerCase())) {
      suffix += 1;
    }

    return `${baseDisplayName} (${suffix})`;
  }

  private broadcastRosterUpdated(
    session: InternalLiveSession,
    precomputedSnapshot?: PublicLiveSessionSnapshot,
  ): void {
    const snapshot = precomputedSnapshot ?? toPublicSnapshot(session);
    const message: ServerWsMessage = {
      type: 'roster_updated',
      sessionCode: session.sessionCode,
      session: snapshot,
    };

    for (const member of session.members.values()) {
      if (member.socket) {
        this.sendToSocket(member.socket, message);
      }
    }
  }

  private broadcastSessionUpdated(
    session: InternalLiveSession,
    command: Exclude<LeaderCommandType, 'close_session'>,
    requesterSocket: SessionPeerSocket,
    requestId?: string,
  ): void {
    const snapshot = toPublicSnapshot(session);
    const notifiedSockets = new Set<SessionPeerSocket>();

    for (const member of session.members.values()) {
      if (!member.socket) {
        continue;
      }
      notifiedSockets.add(member.socket);
      const isRequester = member.socket === requesterSocket;
      this.sendToSocket(member.socket, {
        type: 'session_updated',
        ...(isRequester && requestId ? { requestId } : {}),
        command,
        sessionCode: session.sessionCode,
        session: snapshot,
      });
    }

    if (!notifiedSockets.has(requesterSocket)) {
      this.sendToSocket(requesterSocket, {
        type: 'session_updated',
        ...(requestId ? { requestId } : {}),
        command,
        sessionCode: session.sessionCode,
        session: snapshot,
      });
    }
  }

  private closeAndPurgeSession(
    session: InternalLiveSession,
    reason: SessionCloseReason,
    requesterSocket?: SessionPeerSocket,
    requestId?: string,
  ): void {
    const notifiedSockets = new Set<SessionPeerSocket>();

    for (const member of session.members.values()) {
      if (!member.socket) {
        continue;
      }
      this.socketBindings.delete(member.socket);
      notifiedSockets.add(member.socket);

      const isRequester = member.socket === requesterSocket;
      this.sendToSocket(member.socket, {
        type: 'session_closed',
        ...(isRequester && requestId ? { requestId } : {}),
        sessionCode: session.sessionCode,
        reason,
      });
      member.socket = null;
      member.connectionStatus = 'disconnected';
    }

    if (requesterSocket && !notifiedSockets.has(requesterSocket)) {
      this.sendToSocket(requesterSocket, {
        type: 'session_closed',
        ...(requestId ? { requestId } : {}),
        sessionCode: session.sessionCode,
        reason,
      });
    }

    session.members.clear();
    this.sessions.delete(session.sessionCode);
  }

  private sendError(
    socket: SessionPeerSocket,
    code: SessionErrorCode,
    message: string,
    requestId?: string,
  ): void {
    this.sendToSocket(socket, {
      type: 'session_error',
      ...(requestId ? { requestId } : {}),
      code,
      message,
    });
  }

  private sendToSocket(
    socket: SessionPeerSocket,
    message: ServerWsMessage,
  ): void {
    if (socket.readyState === SOCKET_OPEN_READY_STATE) {
      socket.send(JSON.stringify(message));
    }
  }
}

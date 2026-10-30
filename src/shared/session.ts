import type { SanctuaryRole } from './health.js';
import type { StudyDocument } from './study.js';

export const SESSION_PROTOCOL_VERSION = 2;
export const SESSION_CODE_LENGTH = 6;
export const SESSION_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const LEADER_PIN_LENGTH = 4;
export const MAX_DISPLAY_NAME_LENGTH = 48;
export const DEFAULT_SESSION_TTL_MS = 4 * 60 * 60 * 1000;
export const DEFAULT_SESSION_SWEEP_INTERVAL_MS = 60 * 1000;
export const DEFAULT_WS_MAX_PAYLOAD_BYTES = 64 * 1024;

export const AVATAR_PALETTES = [
  'gold',
  'indigo',
  'violet',
  'emerald',
  'terracotta',
] as const;

export type AvatarPalette = (typeof AVATAR_PALETTES)[number];

export const PARTICIPANT_AVATAR_PALETTES: readonly AvatarPalette[] = [
  'indigo',
  'violet',
  'emerald',
  'terracotta',
  'gold',
] as const;

export const STUDY_SECTION_IDS = [
  'section_1_prayer',
  'section_2_icebreaker',
  'section_3_reading',
  'section_4_discussion',
  'section_5_closing',
] as const;

export type StudySectionId = (typeof STUDY_SECTION_IDS)[number];

export type LiveSessionStatus = 'setup' | 'lobby' | 'in_progress' | 'completed';

export type MemberConnectionStatus = 'connected' | 'disconnected';

export interface PublicSessionMember {
  memberId: string;
  displayName: string;
  initials: string;
  avatarPalette: AvatarPalette;
  role: SanctuaryRole;
  connectionStatus: MemberConnectionStatus;
  joinedAt: string;
}

/**
 * Sanitized, title/meta-only study summary synced to every client via the
 * leader-gated `load_study` command. Never carries pastoral/facilitator fields
 * (`leaderNote`, `examplesToListenFor`, `sampleAnswer`, commentary, doctrine).
 */
export interface SessionStudySummary {
  title: string;
  subtitle: string;
  liturgicalEyebrow: string;
  gospelCitation: string;
  gospelSummaryLabel: string;
  sectionCount: 5;
  estimatedMinutes: number;
}

export const SESSION_STUDY_SUMMARY_MAX_TITLE_LENGTH = 120;
export const SESSION_STUDY_SUMMARY_MAX_FIELD_LENGTH = 200;
export const SESSION_STUDY_SUMMARY_MIN_ESTIMATED_MINUTES = 1;
export const SESSION_STUDY_SUMMARY_MAX_ESTIMATED_MINUTES = 180;

export interface PublicLiveSessionSnapshot {
  sessionCode: string;
  status: LiveSessionStatus;
  currentSectionIndex: number | null;
  currentSectionId: StudySectionId | null;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  connectedMemberCount: number;
  connectedParticipantCount: number;
  members: PublicSessionMember[];
  /** Title/meta-only study summary once the leader dispatched `load_study`. */
  study?: SessionStudySummary | null;
  /** Snapshot protocol version (`SESSION_PROTOCOL_VERSION`); additive in v2. */
  protocolVersion?: number;
}

/**
 * Projects a full `StudyDocument` onto the sanitized session study summary
 * shared with Participants over `/ws` snapshots.
 */
export function toSessionStudySummary(doc: StudyDocument): SessionStudySummary {
  return {
    title: doc.title,
    subtitle: doc.subtitle,
    liturgicalEyebrow: doc.liturgicalEyebrow,
    gospelCitation: doc.gospelCitation,
    gospelSummaryLabel: doc.gospelSummaryLabel,
    sectionCount: 5,
    estimatedMinutes: doc.estimatedMinutes,
  };
}

function normalizeBoundedSummaryString(
  raw: unknown,
  maxLength: number,
): string | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (trimmed.length === 0 || trimmed.length > maxLength) {
    return null;
  }
  return trimmed;
}

/**
 * Validates and normalizes an inbound `load_study` summary. Returns `null`
 * when any field is missing, empty, or exceeds its bound so the server can
 * reject the frame with `INVALID_MESSAGE`.
 */
export function normalizeSessionStudySummary(
  raw: unknown,
): SessionStudySummary | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const title = normalizeBoundedSummaryString(
    record.title,
    SESSION_STUDY_SUMMARY_MAX_TITLE_LENGTH,
  );
  const subtitle = normalizeBoundedSummaryString(
    record.subtitle,
    SESSION_STUDY_SUMMARY_MAX_FIELD_LENGTH,
  );
  const liturgicalEyebrow = normalizeBoundedSummaryString(
    record.liturgicalEyebrow,
    SESSION_STUDY_SUMMARY_MAX_FIELD_LENGTH,
  );
  const gospelCitation = normalizeBoundedSummaryString(
    record.gospelCitation,
    SESSION_STUDY_SUMMARY_MAX_FIELD_LENGTH,
  );
  const gospelSummaryLabel = normalizeBoundedSummaryString(
    record.gospelSummaryLabel,
    SESSION_STUDY_SUMMARY_MAX_FIELD_LENGTH,
  );

  if (
    title === null ||
    subtitle === null ||
    liturgicalEyebrow === null ||
    gospelCitation === null ||
    gospelSummaryLabel === null
  ) {
    return null;
  }

  if (record.sectionCount !== 5) {
    return null;
  }

  const estimatedMinutes = record.estimatedMinutes;
  if (
    typeof estimatedMinutes !== 'number' ||
    !Number.isInteger(estimatedMinutes) ||
    estimatedMinutes < SESSION_STUDY_SUMMARY_MIN_ESTIMATED_MINUTES ||
    estimatedMinutes > SESSION_STUDY_SUMMARY_MAX_ESTIMATED_MINUTES
  ) {
    return null;
  }

  return {
    title,
    subtitle,
    liturgicalEyebrow,
    gospelCitation,
    gospelSummaryLabel,
    sectionCount: 5,
    estimatedMinutes,
  };
}

export type SessionErrorCode =
  | 'INVALID_MESSAGE'
  | 'INVALID_DISPLAY_NAME'
  | 'INVALID_SESSION_CODE'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_CLOSED'
  | 'INVALID_LEADER_PIN'
  | 'FORBIDDEN_LEADER_ONLY'
  | 'UNAUTHORIZED_LEADER'
  | 'UNAUTHORIZED_RECONNECT'
  | 'INVALID_STATE_TRANSITION';

export type LeaderCommandType =
  | 'open_lobby'
  | 'load_study'
  | 'start_study'
  | 'next_section'
  | 'close_session';

export type SessionCloseReason = 'closed_by_leader' | 'expired_inactivity';

export type ClientWsMessage =
  | {
      type: 'ping';
      requestId?: string;
    }
  | {
      type: 'create_session';
      displayName: string;
      requestId?: string;
    }
  | {
      type: 'join_session';
      sessionCode: string;
      displayName: string;
      requestId?: string;
    }
  | {
      type: 'claim_leader';
      sessionCode: string;
      leaderPin: string;
      displayName?: string;
      requestId?: string;
    }
  | {
      type: 'reconnect_session';
      sessionCode: string;
      memberId: string;
      reconnectToken?: string;
      leaderToken?: string;
      requestId?: string;
    }
  | {
      type: 'open_lobby';
      sessionCode: string;
      leaderToken: string;
      memberId?: string;
      requestId?: string;
    }
  | {
      type: 'load_study';
      sessionCode: string;
      leaderToken: string;
      memberId?: string;
      study: SessionStudySummary;
      requestId?: string;
    }
  | {
      type: 'start_study';
      sessionCode: string;
      leaderToken: string;
      memberId?: string;
      requestId?: string;
    }
  | {
      type: 'next_section';
      sessionCode: string;
      leaderToken: string;
      memberId?: string;
      requestId?: string;
    }
  | {
      type: 'close_session';
      sessionCode: string;
      leaderToken: string;
      memberId?: string;
      reason?: string;
      requestId?: string;
    };

export type ServerWsMessage =
  | {
      type: 'pong';
      timestamp: string;
      requestId?: string;
    }
  | {
      type: 'session_created';
      requestId?: string;
      sessionCode: string;
      memberId: string;
      role: 'Study Leader';
      leaderPin: string;
      leaderToken: string;
      reconnectToken: string;
      session: PublicLiveSessionSnapshot;
    }
  | {
      type: 'session_joined';
      requestId?: string;
      sessionCode: string;
      memberId: string;
      role: 'Participant';
      displayName: string;
      avatarPalette: AvatarPalette;
      reconnectToken: string;
      member: PublicSessionMember;
      session: PublicLiveSessionSnapshot;
    }
  | {
      type: 'roster_updated';
      sessionCode: string;
      session: PublicLiveSessionSnapshot;
    }
  | {
      type: 'leader_claimed';
      requestId?: string;
      sessionCode: string;
      memberId: string;
      role: 'Study Leader';
      leaderPin: string;
      leaderToken: string;
      reconnectToken: string;
      session: PublicLiveSessionSnapshot;
    }
  | {
      type: 'leader_replaced';
      sessionCode: string;
      message: string;
    }
  | {
      type: 'session_reconnected';
      requestId?: string;
      sessionCode: string;
      memberId: string;
      role: SanctuaryRole;
      member: PublicSessionMember;
      session: PublicLiveSessionSnapshot;
    }
  | {
      type: 'session_updated';
      requestId?: string;
      command: Exclude<LeaderCommandType, 'close_session'>;
      sessionCode: string;
      session: PublicLiveSessionSnapshot;
    }
  | {
      type: 'session_closed';
      requestId?: string;
      sessionCode: string;
      reason: SessionCloseReason;
    }
  | {
      type: 'session_error';
      requestId?: string;
      code: SessionErrorCode;
      message: string;
    };

export function normalizeDisplayName(raw: unknown): string {
  if (typeof raw !== 'string') {
    return '';
  }
  return raw.trim().replace(/\s+/g, ' ');
}

export function isValidDisplayName(normalizedName: string): boolean {
  return (
    normalizedName.length >= 1 &&
    normalizedName.length <= MAX_DISPLAY_NAME_LENGTH
  );
}

export function normalizeSessionCode(raw: unknown): string {
  if (typeof raw !== 'string') {
    return '';
  }
  return raw.trim().toUpperCase();
}

export function isValidSessionCode(normalizedCode: string): boolean {
  return /^[A-Z0-9]{6}$/.test(normalizedCode);
}

export function normalizeLeaderPin(raw: unknown): string {
  if (typeof raw !== 'string') {
    return '';
  }
  return raw.trim();
}

export function isValidLeaderPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

/**
 * Derives 1-2 uppercase avatar initials from a member's display name,
 * ignoring trailing duplicate-disambiguation suffixes like " (2)".
 */
export function deriveInitials(displayName: string): string {
  const withoutSuffix = normalizeDisplayName(displayName).replace(
    /\s+\(\d+\)$/,
    '',
  );
  const words = withoutSuffix.match(/[\p{L}\p{N}]+/gu) ?? [];

  if (words.length >= 2) {
    const firstChar = Array.from(words[0] ?? '')[0] ?? '';
    const secondChar = Array.from(words[1] ?? '')[0] ?? '';
    return `${firstChar}${secondChar}`.toUpperCase();
  }

  if (words.length === 1) {
    const chars = Array.from(words[0] ?? '');
    if (chars.length >= 2) {
      return `${chars[0]}${chars[1]}`.toUpperCase();
    }
    if (chars.length === 1) {
      return `${chars[0]}${chars[0]}`.toUpperCase();
    }
  }

  return 'YA';
}

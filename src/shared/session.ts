import type { SanctuaryRole } from './health.js';
import type {
  GospelReadingSection,
  GospelVerse,
  IcebreakerSection,
  OpeningPrayerSection,
  StudyDocument,
} from './study.js';

export const SESSION_PROTOCOL_VERSION = 3;
export const SESSION_CODE_LENGTH = 6;
export const SESSION_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const LEADER_PIN_LENGTH = 4;
export const MAX_DISPLAY_NAME_LENGTH = 48;
export const DEFAULT_SESSION_TTL_MS = 4 * 60 * 60 * 1000;
export const DEFAULT_SESSION_SWEEP_INTERVAL_MS = 60 * 1000;
export const DEFAULT_WS_MAX_PAYLOAD_BYTES = 64 * 1024;
export const RANDOM_SELECTION_COUNTDOWN_MS = 30_000;

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
 * Sanitized, participant-visible Opening Prayer content synced with the study
 * summary. Never carries the facilitator-facing `leaderPrompt` (that copy stays
 * on the locally held `StudyDocument`).
 */
export interface SessionOpeningPrayerContent {
  title: string;
  eyebrow: string;
  durationLabel: string;
  /** Participant-visible suggested prayer text. */
  suggestedPrayerText: string;
  /** Participant-visible invitation copy. */
  participantPrompt: string;
  /** Participant-visible; RESERVED for the chosen-volunteer Done-gate feature. */
  chosenVolunteerInstruction: string;
}

/**
 * Sanitized, participant-visible Icebreaker content synced with the study
 * summary. Never carries the facilitator-facing pastoral fields (`leaderNote`,
 * `examplesToListenFor` — that copy stays on the locally held `StudyDocument`).
 */
export interface SessionIcebreakerContent {
  title: string;
  eyebrow: string;
  durationLabel: string;
  /** Group-facing icebreaker framing copy. */
  introText: string;
  /** Group-facing main icebreaker question. */
  mainQuestion: string;
  /** Group-facing italic follow-up question. */
  followUpQuestion: string;
}

/**
 * Sanitized, participant-visible Gospel Reading content synced with the study
 * summary. Never carries the facilitator-facing `leaderLiturgicalContextNote`
 * (that copy stays strictly on the locally held `StudyDocument`).
 */
export interface SessionGospelReadingContent {
  title: string;
  eyebrow: string;
  durationLabel: string;
  citation: string;
  liturgicalLabel: string;
  /** Complete Gospel proclamation read aloud by the chosen Participant. */
  fullText: string;
  verses: GospelVerse[];
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
  /** Participant-visible Opening Prayer copy (additive in protocol v3). */
  openingPrayer?: SessionOpeningPrayerContent | null;
  /** Participant-visible Icebreaker copy (additive in protocol v3). */
  icebreaker?: SessionIcebreakerContent | null;
  /** Participant-visible Gospel Reading copy (additive in protocol v3). */
  gospelReading?: SessionGospelReadingContent | null;
}

export const SESSION_STUDY_SUMMARY_MAX_TITLE_LENGTH = 120;
export const SESSION_STUDY_SUMMARY_MAX_FIELD_LENGTH = 200;
export const SESSION_STUDY_SUMMARY_MAX_PRAYER_TEXT_LENGTH = 2000;
export const SESSION_STUDY_SUMMARY_MAX_QUESTION_LENGTH = 1000;
export const SESSION_STUDY_SUMMARY_MAX_GOSPEL_TEXT_LENGTH = 10_000;
export const SESSION_STUDY_SUMMARY_MIN_ESTIMATED_MINUTES = 1;
export const SESSION_STUDY_SUMMARY_MAX_ESTIMATED_MINUTES = 180;

/** One raised hand in the volunteer turn queue (server-clock timestamp). */
export interface RaisedHandEntry {
  memberId: string;
  raisedAt: string;
}

export type VolunteerTurnMode = 'gated_prayer' | 'open_share' | 'gated_reading';

/**
 * Per-section volunteer turn state (protocol v3). `raisedHands` is
 * append-only raise order with at most one entry per member. The
 * `candidate*` fields carry the random-selection countdown state; the
 * `selected*` / `completed*` fields carry the chosen-volunteer Done-gate
 * state. All four stay `null` while only hand raising is active.
 */
export interface VolunteerTurnState {
  sectionId: StudySectionId;
  mode: VolunteerTurnMode;
  raisedHands: RaisedHandEntry[];
  /** Random-selection candidate staged by `pick_random` / `retry_random`. */
  candidateMemberId: string | null;
  /** Absolute server-clock ISO expiry of the random-selection countdown. */
  candidateExpiresAt: string | null;
  /** Chosen volunteer (chosen-volunteer Done gate). */
  selectedMemberId: string | null;
  /** Done / turn completion timestamp. */
  completedAt: string | null;
}

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
  /** Per-section volunteer turn state (additive in protocol v3). */
  volunteerTurn?: VolunteerTurnState | null;
  /** Snapshot protocol version (`SESSION_PROTOCOL_VERSION`); additive in v2. */
  protocolVersion?: number;
}

/**
 * Projects the Opening Prayer section onto the participant-visible synced
 * content. Explicitly excludes the facilitator-facing `leaderPrompt`.
 */
export function toSessionOpeningPrayerContent(
  section: OpeningPrayerSection,
): SessionOpeningPrayerContent {
  return {
    title: section.title,
    eyebrow: section.eyebrow,
    durationLabel: section.durationLabel,
    suggestedPrayerText: section.suggestedPrayerText,
    participantPrompt: section.participantPrompt,
    chosenVolunteerInstruction: section.chosenVolunteerInstruction,
  };
}

/**
 * Projects the Icebreaker section onto the participant-visible synced content.
 * Explicitly excludes the facilitator-facing `leaderNote` and
 * `examplesToListenFor` (they never cross `/ws`).
 */
export function toSessionIcebreakerContent(
  section: IcebreakerSection,
): SessionIcebreakerContent {
  return {
    title: section.title,
    eyebrow: section.eyebrow,
    durationLabel: section.durationLabel,
    introText: section.introText,
    mainQuestion: section.mainQuestion,
    followUpQuestion: section.followUpQuestion,
  };
}

/**
 * Projects the Gospel Reading section onto the participant-visible synced
 * content. Explicitly excludes the facilitator-facing `leaderLiturgicalContextNote`.
 */
export function toSessionGospelReadingContent(
  section: GospelReadingSection,
): SessionGospelReadingContent {
  return {
    title: section.title,
    eyebrow: section.eyebrow,
    durationLabel: section.durationLabel,
    citation: section.citation,
    liturgicalLabel: section.liturgicalLabel,
    fullText: section.fullText,
    verses: section.verses.map((v) => ({
      verseNumber: v.verseNumber,
      text: v.text,
    })),
  };
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
    openingPrayer: toSessionOpeningPrayerContent(doc.openingPrayer),
    icebreaker: toSessionIcebreakerContent(doc.icebreaker),
    gospelReading: toSessionGospelReadingContent(doc.gospelReading),
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
 * Bounded free-text validation that preserves internal whitespace (prayer
 * text keeps its line structure); only the ends are trimmed.
 */
function normalizeBoundedPrayerText(raw: unknown, maxLength: number): string | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) {
    return null;
  }
  return trimmed;
}

/**
 * Allow-list validation for a present `openingPrayer` payload. Returns `null`
 * when any field is missing, empty, or exceeds its bound so the server can
 * reject the frame with `INVALID_MESSAGE`. Unknown keys (e.g. a smuggled
 * `leaderPrompt`) are dropped by the explicit field projection.
 */
export function normalizeSessionOpeningPrayerContent(
  raw: unknown,
): SessionOpeningPrayerContent | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const title = normalizeBoundedSummaryString(
    record.title,
    SESSION_STUDY_SUMMARY_MAX_TITLE_LENGTH,
  );
  const eyebrow = normalizeBoundedSummaryString(
    record.eyebrow,
    SESSION_STUDY_SUMMARY_MAX_FIELD_LENGTH,
  );
  const durationLabel = normalizeBoundedSummaryString(
    record.durationLabel,
    SESSION_STUDY_SUMMARY_MAX_FIELD_LENGTH,
  );
  const suggestedPrayerText = normalizeBoundedPrayerText(
    record.suggestedPrayerText,
    SESSION_STUDY_SUMMARY_MAX_PRAYER_TEXT_LENGTH,
  );
  const participantPrompt = normalizeBoundedSummaryString(
    record.participantPrompt,
    SESSION_STUDY_SUMMARY_MAX_FIELD_LENGTH,
  );
  const chosenVolunteerInstruction = normalizeBoundedSummaryString(
    record.chosenVolunteerInstruction,
    SESSION_STUDY_SUMMARY_MAX_FIELD_LENGTH,
  );

  if (
    title === null ||
    eyebrow === null ||
    durationLabel === null ||
    suggestedPrayerText === null ||
    participantPrompt === null ||
    chosenVolunteerInstruction === null
  ) {
    return null;
  }

  return {
    title,
    eyebrow,
    durationLabel,
    suggestedPrayerText,
    participantPrompt,
    chosenVolunteerInstruction,
  };
}

/**
 * Allow-list validation for a present `icebreaker` payload. Returns `null`
 * when any field is missing, empty, or exceeds its bound so the server can
 * reject the frame with `INVALID_MESSAGE`. Unknown keys (e.g. smuggled
 * `leaderNote` / `examplesToListenFor`) are dropped by the explicit field
 * projection. Question/intro copy mirrors the bounded prayer-text precedent
 * (internal whitespace preserved) at
 * `SESSION_STUDY_SUMMARY_MAX_QUESTION_LENGTH`.
 */
export function normalizeSessionIcebreakerContent(
  raw: unknown,
): SessionIcebreakerContent | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const title = normalizeBoundedSummaryString(
    record.title,
    SESSION_STUDY_SUMMARY_MAX_TITLE_LENGTH,
  );
  const eyebrow = normalizeBoundedSummaryString(
    record.eyebrow,
    SESSION_STUDY_SUMMARY_MAX_FIELD_LENGTH,
  );
  const durationLabel = normalizeBoundedSummaryString(
    record.durationLabel,
    SESSION_STUDY_SUMMARY_MAX_FIELD_LENGTH,
  );
  const introText = normalizeBoundedPrayerText(
    record.introText,
    SESSION_STUDY_SUMMARY_MAX_QUESTION_LENGTH,
  );
  const mainQuestion = normalizeBoundedPrayerText(
    record.mainQuestion,
    SESSION_STUDY_SUMMARY_MAX_QUESTION_LENGTH,
  );
  const followUpQuestion = normalizeBoundedPrayerText(
    record.followUpQuestion,
    SESSION_STUDY_SUMMARY_MAX_QUESTION_LENGTH,
  );

  if (
    title === null ||
    eyebrow === null ||
    durationLabel === null ||
    introText === null ||
    mainQuestion === null ||
    followUpQuestion === null
  ) {
    return null;
  }

  return {
    title,
    eyebrow,
    durationLabel,
    introText,
    mainQuestion,
    followUpQuestion,
  };
}

/**
 * Allow-list validation for a present `gospelReading` payload. Returns `null`
 * when any field is missing, empty, or exceeds its bound so the server can
 * reject the frame with `INVALID_MESSAGE`. Unknown keys (e.g. smuggled
 * `leaderLiturgicalContextNote` / `keyLines`) are dropped by the explicit field
 * projection.
 */
export function normalizeSessionGospelReadingContent(
  raw: unknown,
): SessionGospelReadingContent | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const title = normalizeBoundedSummaryString(
    record.title,
    SESSION_STUDY_SUMMARY_MAX_TITLE_LENGTH,
  );
  const eyebrow = normalizeBoundedSummaryString(
    record.eyebrow,
    SESSION_STUDY_SUMMARY_MAX_FIELD_LENGTH,
  );
  const durationLabel = normalizeBoundedSummaryString(
    record.durationLabel,
    SESSION_STUDY_SUMMARY_MAX_FIELD_LENGTH,
  );
  const citation = normalizeBoundedSummaryString(
    record.citation,
    SESSION_STUDY_SUMMARY_MAX_FIELD_LENGTH,
  );
  const liturgicalLabel = normalizeBoundedSummaryString(
    record.liturgicalLabel,
    SESSION_STUDY_SUMMARY_MAX_FIELD_LENGTH,
  );
  const fullText = normalizeBoundedPrayerText(
    record.fullText,
    SESSION_STUDY_SUMMARY_MAX_GOSPEL_TEXT_LENGTH,
  );

  if (
    title === null ||
    eyebrow === null ||
    durationLabel === null ||
    citation === null ||
    liturgicalLabel === null ||
    fullText === null
  ) {
    return null;
  }

  if (!Array.isArray(record.verses) || record.verses.length === 0) {
    return null;
  }

  const verses: GospelVerse[] = [];
  for (const item of record.verses) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return null;
    }
    const verseObj = item as Record<string, unknown>;
    const verseNumber = verseObj.verseNumber;
    if (
      typeof verseNumber !== 'number' ||
      !Number.isInteger(verseNumber) ||
      verseNumber <= 0
    ) {
      return null;
    }
    const text = normalizeBoundedPrayerText(
      verseObj.text,
      SESSION_STUDY_SUMMARY_MAX_GOSPEL_TEXT_LENGTH,
    );
    if (text === null) {
      return null;
    }
    verses.push({ verseNumber, text });
  }

  return {
    title,
    eyebrow,
    durationLabel,
    citation,
    liturgicalLabel,
    fullText,
    verses,
  };
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

  /**
   * Protocol v3 (bounded additive): a missing `openingPrayer` stays valid and
   * normalizes to `null`; a present-but-invalid payload rejects the frame with
   * `INVALID_MESSAGE`.
   */
  let openingPrayer: SessionOpeningPrayerContent | null = null;
  if (record.openingPrayer !== undefined && record.openingPrayer !== null) {
    openingPrayer = normalizeSessionOpeningPrayerContent(record.openingPrayer);
    if (openingPrayer === null) {
      return null;
    }
  }

  /**
   * Protocol v3 (bounded additive): a missing `icebreaker` stays valid and
   * normalizes to `null`; a present-but-invalid payload rejects the frame with
   * `INVALID_MESSAGE`.
   */
  let icebreaker: SessionIcebreakerContent | null = null;
  if (record.icebreaker !== undefined && record.icebreaker !== null) {
    icebreaker = normalizeSessionIcebreakerContent(record.icebreaker);
    if (icebreaker === null) {
      return null;
    }
  }

  /**
   * Protocol v3 (bounded additive): a missing `gospelReading` stays valid and
   * normalizes to `null`; a present-but-invalid payload rejects the frame with
   * `INVALID_MESSAGE`.
   */
  let gospelReading: SessionGospelReadingContent | null = null;
  if (record.gospelReading !== undefined && record.gospelReading !== null) {
    gospelReading = normalizeSessionGospelReadingContent(record.gospelReading);
    if (gospelReading === null) {
      return null;
    }
  }

  return {
    title,
    subtitle,
    liturgicalEyebrow,
    gospelCitation,
    gospelSummaryLabel,
    sectionCount: 5,
    estimatedMinutes,
    openingPrayer,
    icebreaker,
    gospelReading,
  };
}

/** Maps a study section onto its volunteer-turn interaction mode. */
export function volunteerTurnModeForSection(
  sectionId: StudySectionId,
): VolunteerTurnMode {
  switch (sectionId) {
    case 'section_1_prayer':
      return 'gated_prayer';
    case 'section_3_reading':
      return 'gated_reading';
    default:
      return 'open_share';
  }
}

/**
 * Pure reducer: creates the volunteer-turn state for the current section on
 * `start_study`. Starts with an empty hand-raise queue; candidate / selected /
 * completion fields start `null`.
 */
export function createVolunteerTurnForSection(
  sectionId: StudySectionId,
): VolunteerTurnState {
  return {
    sectionId,
    mode: volunteerTurnModeForSection(sectionId),
    raisedHands: [],
    candidateMemberId: null,
    candidateExpiresAt: null,
    selectedMemberId: null,
    completedAt: null,
  };
}

/**
 * Pure reducer: sets one member's hand-raise state on the turn queue.
 * Raising an already-raised hand keeps the original `raisedAt` and queue
 * position; lowering is a no-op when the hand is not raised.
 */
export function applySetHandRaised(
  turn: VolunteerTurnState,
  memberId: string,
  raised: boolean,
  isoNow: string,
): VolunteerTurnState {
  const isRaised = turn.raisedHands.some((entry) => entry.memberId === memberId);
  if (raised) {
    if (isRaised) {
      return turn;
    }
    return {
      ...turn,
      raisedHands: [...turn.raisedHands, { memberId, raisedAt: isoNow }],
    };
  }
  if (!isRaised) {
    return turn;
  }
  return {
    ...turn,
    raisedHands: turn.raisedHands.filter((entry) => entry.memberId !== memberId),
  };
}

/**
 * Pure reducer: clears one member's hand (`targetMemberId`) or the whole queue
 * when no target is given. Clearing an already-lowered hand / an empty queue is
 * a no-op.
 */
export function applyClearHands(
  turn: VolunteerTurnState,
  targetMemberId?: string,
): VolunteerTurnState {
  if (targetMemberId !== undefined) {
    const isRaised = turn.raisedHands.some(
      (entry) => entry.memberId === targetMemberId,
    );
    if (!isRaised) {
      return turn;
    }
    return {
      ...turn,
      raisedHands: turn.raisedHands.filter(
        (entry) => entry.memberId !== targetMemberId,
      ),
    };
  }
  if (turn.raisedHands.length === 0) {
    return turn;
  }
  return {
    ...turn,
    raisedHands: [],
  };
}

/**
 * Derived volunteer-turn phase for the gated Section 1 prayer flow.
 *
 * - `collecting_hands`: nobody selected yet (a cleared/expired random
 *   candidate returns here).
 * - `random_pending`: a random-selection candidate is staged while
 *   `selectedMemberId`/`completedAt` stay null (the countdown window is a
 *   sub-state judged against `candidateExpiresAt` and the server clock).
 * - `assigned`: a volunteer is selected and the turn is not completed.
 * - `turn_completed`: the turn is completed (`completedAt` set), whether or not
 *   a volunteer was ever selected (leader override is allowed with no
 *   selection).
 */
export type VolunteerTurnPhase =
  | 'collecting_hands'
  | 'random_pending'
  | 'assigned'
  | 'turn_completed';

/** Pure helper: derives the {@link VolunteerTurnPhase} of a volunteer turn. */
export function volunteerTurnPhase(
  turn: VolunteerTurnState,
): VolunteerTurnPhase {
  if (turn.completedAt != null) {
    return 'turn_completed';
  }
  if (turn.selectedMemberId != null) {
    return 'assigned';
  }
  if (turn.candidateMemberId != null) {
    return 'random_pending';
  }
  return 'collecting_hands';
}

/**
 * Pure reducer: assigns the chosen volunteer for the current turn. Only
 * `selectedMemberId` changes — `raisedHands`, `completedAt`, and the
 * `candidateMemberId`/`candidateExpiresAt` fields are left untouched.
 */
export function applySelectVolunteer(
  turn: VolunteerTurnState,
  memberId: string,
): VolunteerTurnState {
  return {
    ...turn,
    selectedMemberId: memberId,
  };
}

/**
 * Pure reducer: marks the turn complete (`completedAt` = `isoNow`) while
 * preserving `selectedMemberId` (including `null` for a leader override with no
 * selection). Completing an already-completed turn keeps the original
 * `completedAt` (idempotent).
 */
export function applyCompleteTurn(
  turn: VolunteerTurnState,
  isoNow: string,
): VolunteerTurnState {
  if (turn.completedAt != null) {
    return turn;
  }
  return {
    ...turn,
    completedAt: isoNow,
  };
}

/**
 * Pure reducer: stages the random-selection candidate and its absolute
 * countdown expiry (`pick_random` / `retry_random`). Nothing else changes.
 */
export function applyStageRandomCandidate(
  turn: VolunteerTurnState,
  candidateMemberId: string,
  isoExpiresAt: string,
): VolunteerTurnState {
  return {
    ...turn,
    candidateMemberId,
    candidateExpiresAt: isoExpiresAt,
  };
}

/**
 * Pure reducer: confirms the staged random candidate as the chosen volunteer.
 * Composes the frozen {@link applySelectVolunteer} with the staged
 * `candidateMemberId`, then clears the `candidate*` countdown fields. A turn
 * without a staged candidate is a no-op.
 */
export function applyConfirmRandomCandidate(
  turn: VolunteerTurnState,
): VolunteerTurnState {
  if (turn.candidateMemberId === null) {
    return turn;
  }
  const assigned = applySelectVolunteer(turn, turn.candidateMemberId);
  return {
    ...assigned,
    candidateMemberId: null,
    candidateExpiresAt: null,
  };
}

/**
 * Pure reducer: clears the staged random candidate (countdown expiry). A turn
 * without staged candidate fields is a no-op.
 */
export function applyClearRandomCandidate(
  turn: VolunteerTurnState,
): VolunteerTurnState {
  if (turn.candidateMemberId === null && turn.candidateExpiresAt === null) {
    return turn;
  }
  return {
    ...turn,
    candidateMemberId: null,
    candidateExpiresAt: null,
  };
}

/**
 * Pure helper: the fair-pick pool — connected `Participant` members in join
 * order. Raised-hand membership is deliberately NOT required: the defining
 * "Zero volunteers raise hand" scenario must still be pickable.
 */
export function eligibleRandomCandidateIds(
  members: ReadonlyArray<
    Pick<PublicSessionMember, 'memberId' | 'role' | 'connectionStatus'>
  >,
): string[] {
  const ids: string[] = [];
  for (const member of members) {
    if (
      member.role === 'Participant' &&
      member.connectionStatus === 'connected'
    ) {
      ids.push(member.memberId);
    }
  }
  return ids;
}

/**
 * Pure helper: display-only remaining countdown seconds derived from the
 * absolute `candidateExpiresAt`, clamped to `0..30`. Clients render this —
 * no client input can set or extend the server-clock window.
 */
export function remainingCountdownSeconds(
  candidateExpiresAt: string,
  nowMs: number,
): number {
  const maxSeconds = RANDOM_SELECTION_COUNTDOWN_MS / 1000;
  const expiresMs = Date.parse(candidateExpiresAt);
  if (!Number.isFinite(expiresMs)) {
    return 0;
  }
  const remaining = Math.ceil((expiresMs - nowMs) / 1000);
  return Math.min(maxSeconds, Math.max(0, remaining));
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
  | 'INVALID_STATE_TRANSITION'
  | 'UNAUTHORIZED_MEMBER';

export type LeaderCommandType =
  | 'open_lobby'
  | 'load_study'
  | 'start_study'
  | 'next_section'
  | 'choose_volunteer'
  | 'override_turn'
  | 'pick_random'
  | 'retry_random'
  | 'confirm_random'
  | 'clear_hands'
  | 'close_session';

/**
 * Protocol v3 (additive): `session_updated.command` widens to include the
 * participant self-service hand-raise commands, the chosen volunteer's
 * `complete_turn` completion, the random-selection picker commands, and the
 * server-initiated `random_expired` countdown expiry. `close_session` stays
 * excluded because it ends the session without broadcasting `session_updated`.
 */
export type SessionUpdatedCommand = Exclude<
  | LeaderCommandType
  | 'raise_hand'
  | 'lower_hand'
  | 'complete_turn'
  | 'random_expired',
  'close_session'
>;

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
      type: 'choose_volunteer';
      sessionCode: string;
      leaderToken: string;
      memberId?: string;
      targetMemberId: string;
      requestId?: string;
    }
  | {
      type: 'override_turn';
      sessionCode: string;
      leaderToken: string;
      memberId?: string;
      requestId?: string;
    }
  | {
      type: 'pick_random';
      sessionCode: string;
      leaderToken: string;
      memberId?: string;
      requestId?: string;
    }
  | {
      type: 'retry_random';
      sessionCode: string;
      leaderToken: string;
      memberId?: string;
      requestId?: string;
    }
  | {
      type: 'confirm_random';
      sessionCode: string;
      leaderToken: string;
      memberId?: string;
      requestId?: string;
    }
  | {
      type: 'raise_hand';
      sessionCode: string;
      memberId: string;
      requestId?: string;
    }
  | {
      type: 'lower_hand';
      sessionCode: string;
      memberId: string;
      requestId?: string;
    }
  | {
      type: 'clear_hands';
      sessionCode: string;
      leaderToken: string;
      memberId?: string;
      targetMemberId?: string;
      requestId?: string;
    }
  | {
      type: 'complete_turn';
      sessionCode: string;
      memberId: string;
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
      command: SessionUpdatedCommand;
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

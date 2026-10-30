import { useEffect, useMemo } from 'react';
import type { SanctuaryRole } from '../../../shared/health';
import type {
  PublicLiveSessionSnapshot,
  SessionOpeningPrayerContent,
} from '../../../shared/session';
import type { StudyDocument } from '../../../shared/study';
import {
  resolveSacredStage,
  useSacredStageStore,
} from '../../state/sacredStageStore';
import { SectionProgressHeader } from '../sections/SectionProgressHeader';
import { HandRaiseOrb } from './HandRaiseOrb';
import { LockedAdvanceBar } from './LockedAdvanceBar';
import { OpeningPrayerCard } from './OpeningPrayerCard';
import {
  RaisedHandsQueue,
  type RaisedHandRowData,
} from './RaisedHandsQueue';

export interface OpeningPrayerScreenProps {
  role: SanctuaryRole;
  session: PublicLiveSessionSnapshot;
  /**
   * Locally held study document (facilitator side). Supplies the
   * facilitator-facing `leaderPrompt` for the Study Leader subtitle; it is
   * intentionally never synced over `/ws`.
   */
  localStudyDocument?: StudyDocument | null;
  /** Current member id (used to derive the caller's own raised-hand state). */
  memberId?: string | null;
  /** Participant self-service: raise (`true`) / lower (`false`) own hand. */
  onToggleHandRaised: (next: boolean) => void | Promise<void>;
  /** Study Leader: lower one member's hand. */
  onLowerHand: (targetMemberId: string) => void;
  /** Study Leader: lower every raised hand. */
  onClearRaisedHands: () => void;
}

const LEADER_SUBTITLE_FALLBACK = 'Waiting for someone to volunteer to pray';
const PARTICIPANT_SUBTITLE_FALLBACK =
  'Waiting for the Study Leader to begin the Opening Prayer…';
const RANDOM_HINT_COPY =
  'If no one raises their hand, the leader will pick someone randomly.';
const COUNT_HINT_COPY = 'The leader will choose shortly';

/** Participant count pill copy: `0` / `1 person` / `N people` phrasing. */
export function formatPeopleRaisedCount(count: number): string {
  if (count === 0) {
    return 'No one has raised their hand yet';
  }
  if (count === 1) {
    return '1 person has raised their hand';
  }
  return `${count} people have raised their hand`;
}

/**
 * Section 1 — Opening Prayer (`in_progress` + `section_1_prayer`). Replaces
 * the provisional `SectionOneHandoff`, keeping its legacy-stable `section-one-*`
 * hooks. The Study Leader sees the prayer card, live raised-hands queue, and
 * locked advance bar; Participants see the violet `Raise Hand` orb, suggested
 * prayer, live count pill, and the locked info bar.
 */
export function OpeningPrayerScreen({
  role,
  session,
  localStudyDocument = null,
  memberId = null,
  onToggleHandRaised,
  onLowerHand,
  onClearRaisedHands,
}: OpeningPrayerScreenProps) {
  const isLeader = role === 'Study Leader';
  const setStage = useSacredStageStore((s) => s.setStage);

  // Stage wiring: Section 1 owns the violet prayer-orb stage variant
  // (guarded — only ever applied while this screen is mounted).
  useEffect(() => {
    const resolved = resolveSacredStage({ screen: 'section-1-prayer' });
    setStage(resolved.stage, { accentMode: resolved.accentMode });
  }, [setStage]);

  const openingPrayer: SessionOpeningPrayerContent | null =
    session.study?.openingPrayer ?? null;

  const eyebrow = openingPrayer?.eyebrow ?? 'MOMENT';
  const title = openingPrayer?.title ?? 'Opening Prayer';
  const subtitle = isLeader
    ? (localStudyDocument?.openingPrayer?.leaderPrompt ??
      LEADER_SUBTITLE_FALLBACK)
    : (openingPrayer?.participantPrompt ?? PARTICIPANT_SUBTITLE_FALLBACK);

  const raisedHands = session.volunteerTurn?.raisedHands ?? [];
  const rows = useMemo<RaisedHandRowData[]>(
    () =>
      raisedHands.flatMap((entry) => {
        const member = session.members.find(
          (candidate) => candidate.memberId === entry.memberId,
        );
        if (!member) {
          return [];
        }
        return [
          {
            memberId: entry.memberId,
            raisedAt: entry.raisedAt,
            displayName: member.displayName,
            initials: member.initials,
            avatarPalette: member.avatarPalette,
          },
        ];
      }),
    [raisedHands, session.members],
  );

  const isRaised =
    memberId !== null &&
    raisedHands.some((entry) => entry.memberId === memberId);

  return (
    <section
      className="section-one-handoff prayer-screen"
      data-testid="section-one-handoff"
      data-role={isLeader ? 'leader' : 'participant'}
      aria-label="Section 1 of 5, Opening Prayer"
    >
      <SectionProgressHeader sectionNumber={1} />

      <div className="prayer-heading">
        <span className="prayer-eyebrow" data-testid="prayer-eyebrow">
          {eyebrow}
        </span>
        <h2 className="section-one-title" data-testid="section-one-title">
          {title}
        </h2>
        <p className="section-one-copy" data-testid="section-one-copy">
          {subtitle}
        </p>
      </div>

      {isLeader ? (
        <>
          <OpeningPrayerCard
            suggestedPrayerText={openingPrayer?.suggestedPrayerText}
          />
          <RaisedHandsQueue
            rows={rows}
            onLowerHand={onLowerHand}
            onClearAll={onClearRaisedHands}
          />
          <LockedAdvanceBar role="Study Leader" />
        </>
      ) : (
        <>
          <HandRaiseOrb isRaised={isRaised} onToggle={onToggleHandRaised} />
          <p className="prayer-random-hint" data-testid="prayer-random-hint">
            {RANDOM_HINT_COPY}
          </p>
          <div className="prayer-scroll-region">
            <OpeningPrayerCard
              suggestedPrayerText={openingPrayer?.suggestedPrayerText}
            />
          </div>
          <div
            className="prayer-count-pill"
            data-testid="prayer-count-pill"
            role="status"
            aria-live="polite"
          >
            <span
              className="prayer-count-pill-text"
              data-testid="prayer-count-pill-text"
            >
              {formatPeopleRaisedCount(rows.length)}
            </span>
            {rows.length > 0 && (
              <span
                className="prayer-count-pill-hint"
                data-testid="prayer-count-pill-hint"
              >
                {COUNT_HINT_COPY}
              </span>
            )}
          </div>
          <LockedAdvanceBar role="Participant" />
        </>
      )}
    </section>
  );
}

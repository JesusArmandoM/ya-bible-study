import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo } from 'react';
import type { SanctuaryRole } from '../../../shared/health';
import type {
  PublicLiveSessionSnapshot,
  SessionUpdatedCommand,
} from '../../../shared/session';
import type { StudyDocument } from '../../../shared/study';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';
import {
  resolveSacredStage,
  useSacredStageStore,
  type SacredStageContext,
} from '../../state/sacredStageStore';
import {
  RandomSelectionPanel,
  type RandomCandidateData,
} from '../random/RandomSelectionPanel';
import { SectionProgressHeader } from '../sections/SectionProgressHeader';
import { LeaderReaderCard } from './LeaderReaderCard';
import { ParticipantRosterStrip } from './ParticipantRosterStrip';
import { ReadAloudOrb } from './ReadAloudOrb';
import { ReadingDoneView } from './ReadingDoneView';
import { ScriptureCard } from './ScriptureCard';

export interface GospelReadingScreenProps {
  role: SanctuaryRole;
  session: PublicLiveSessionSnapshot;
  /**
   * Locally held study document (facilitator side). Supplies the
   * facilitator-facing `leaderLiturgicalContextNote` for the Study Leader; it is
   * intentionally never synced over `/ws`.
   */
  localStudyDocument?: StudyDocument | null;
  /** Current member id (used to derive the caller's own raised/chosen state). */
  memberId?: string | null;
  /** Participant self-service: volunteer (`true`) / withdraw (`false`) to read aloud. */
  onToggleHandRaised: (next: boolean) => void | Promise<void>;
  /** Study Leader: assign the chosen reader (`choose_volunteer`). */
  onChooseVolunteer?: (targetMemberId: string) => void | Promise<void>;
  /** Chosen reader: mark reading completed (`complete_turn`). */
  onCompleteTurn?: () => void | Promise<void>;
  /** Study Leader: complete turn on reader's behalf (`override_turn`). */
  onOverrideTurn?: () => void | Promise<void>;
  /** Study Leader: advance sections (`next_section`, unlocked by `completedAt`). */
  onNextSection?: () => void | Promise<void>;
  /** Study Leader: stage a random candidate (`pick_random`). */
  onPickRandomly?: () => void | Promise<void>;
  /** Study Leader: re-roll the pending candidate (`retry_random`). */
  onRetryRandom?: () => void | Promise<void>;
  /** Study Leader: confirm the pending candidate (`confirm_random`). */
  onConfirmRandom?: () => void | Promise<void>;
  /** Command of latest `session_updated` broadcast. */
  lastSessionCommand?: SessionUpdatedCommand | null;
}

export function formatVolunteersCount(count: number): string {
  if (count === 0) {
    return 'No one has volunteered yet';
  }
  if (count === 1) {
    return '1 person volunteered to read';
  }
  return `${count} people volunteered to read`;
}

function morphTransition(reducedMotion: boolean) {
  return reducedMotion
    ? { duration: 0 }
    : ({ type: 'spring', stiffness: 280, damping: 28 } as const);
}

/**
 * Section 3 — Gospel Reading (`in_progress` + `section_3_reading`).
 * Follows `ux/7. Reading - Leader.png`, `ux/8. Reading` (Participant),
 * and CONSTRAINTS.md Gospel-only invariant: presents ONLY the Gospel passage
 * (full Matthew 15:21–28 passage for the seed study) without multi-reading Mass tabs.
 *
 * Participants tap the indigo "Read aloud" orb to volunteer. The Study Leader
 * selects a reader from raised hands, the avatar roster strip, or the 30-second
 * "Random" picker. Only the chosen reader receives the "YOU WERE CHOSEN" view with
 * exclusive "Done Reading" CTA. Advancing to Section 4 is server-gated until
 * the turn is marked completed.
 */
export function GospelReadingScreen({
  role,
  session,
  localStudyDocument = null,
  memberId = null,
  onToggleHandRaised,
  onChooseVolunteer,
  onCompleteTurn,
  onOverrideTurn,
  onNextSection,
  onPickRandomly,
  onRetryRandom,
  onConfirmRandom,
  lastSessionCommand,
}: GospelReadingScreenProps) {
  const isLeader = role === 'Study Leader';
  const reducedMotion = usePrefersReducedMotion();
  const setStage = useSacredStageStore((s) => s.setStage);
  const triggerImpulse = useSacredStageStore((s) => s.triggerImpulse);

  const turn = session.volunteerTurn;
  const completedAt = turn?.completedAt ?? null;
  const selectedMemberId = turn?.selectedMemberId ?? null;
  const isChosenReader =
    !isLeader && memberId != null && selectedMemberId === memberId;
  const isRandomizing = Boolean(
    turn?.candidateMemberId && turn?.candidateExpiresAt,
  );

  // Sacred3DScene stage resolution: gospel-codex -> chosen-aura / random-polyhedron
  useEffect(() => {
    const resolved = resolveSacredStage({
      screen: 'section-3-gospel',
      isChosenVolunteer: isChosenReader,
      isRandomizing,
    });
    setStage(resolved.stage, { accentMode: resolved.accentMode });
  }, [setStage, isChosenReader, isRandomizing]);

  useEffect(() => {
    if (
      lastSessionCommand === 'complete_turn' ||
      lastSessionCommand === 'override_turn'
    ) {
      triggerImpulse('completion-pulse');
    } else if (
      lastSessionCommand === 'pick_random' ||
      lastSessionCommand === 'retry_random'
    ) {
      triggerImpulse('random-spin');
    } else if (lastSessionCommand === 'confirm_random') {
      triggerImpulse('confirm-burst');
    }
  }, [lastSessionCommand, triggerImpulse]);

  // Gospel content resolution
  const gospelReadingContent = session.study?.gospelReading;
  const citation =
    gospelReadingContent?.citation ??
    session.study?.gospelCitation ??
    localStudyDocument?.gospelReading.citation ??
    'Matthew 15:21–28';
  const liturgicalLabel =
    gospelReadingContent?.liturgicalLabel ??
    localStudyDocument?.gospelReading.liturgicalLabel ??
    'The Canaanite Woman’s Faith';
  const verses =
    gospelReadingContent?.verses ?? localStudyDocument?.gospelReading.verses;
  const fullText =
    gospelReadingContent?.fullText ??
    localStudyDocument?.gospelReading.fullText ??
    '';
  const localLiturgicalNote = isLeader
    ? (localStudyDocument?.gospelReading.leaderLiturgicalContextNote ?? null)
    : null;

  // Member roster and raised hand sets
  const participants = useMemo(
    () => session.members.filter((m) => m.role === 'Participant'),
    [session.members],
  );
  const raisedMemberIds = useMemo(
    () => new Set(turn?.raisedHands.map((h) => h.memberId) ?? []),
    [turn?.raisedHands],
  );
  const isOwnHandRaised = memberId ? raisedMemberIds.has(memberId) : false;
  const selectedMember = selectedMemberId
    ? (session.members.find((m) => m.memberId === selectedMemberId) ?? null)
    : null;
  const firstRaisedMemberId = turn?.raisedHands[0]?.memberId ?? null;

  // Staged random candidate
  const candidateMember = useMemo<RandomCandidateData | null>(() => {
    if (!turn?.candidateMemberId) {
      return null;
    }
    const match = session.members.find(
      (m) => m.memberId === turn.candidateMemberId,
    );
    if (!match) {
      return null;
    }
    return {
      displayName: match.displayName,
      initials: match.initials,
      avatarPalette: match.avatarPalette,
      connectionStatus: match.connectionStatus,
    };
  }, [turn?.candidateMemberId, session.members]);

  return (
    <div
      className="gospel-reading-screen"
      data-testid="gospel-reading-screen"
      data-role={isLeader ? 'leader' : 'participant'}
    >
      <SectionProgressHeader sectionNumber={3} />

      <header className="reading-header">
        <h2 className="reading-title" data-testid="reading-title">
          Gospel Reading
        </h2>
        <p className="reading-citation" data-testid="reading-citation">
          {citation}
        </p>
      </header>

      {isRandomizing && candidateMember && turn?.candidateExpiresAt ? (
        <RandomSelectionPanel
          candidate={candidateMember}
          candidateExpiresAt={turn.candidateExpiresAt}
          chosenLine="has been randomly chosen to read."
          isLeader={isLeader}
          onRetryRandom={onRetryRandom}
          onConfirmRandom={onConfirmRandom}
        />
      ) : isChosenReader ? (
        <ReadingDoneView
          completedAt={completedAt}
          citation={citation}
          liturgicalLabel={liturgicalLabel}
          verses={verses}
          fullText={fullText}
          onCompleteTurn={() => {
            if (onCompleteTurn) {
              void onCompleteTurn();
            }
          }}
        />
      ) : isLeader ? (
        <section className="reading-leader-content">
          <ScriptureCard
            citation={citation}
            liturgicalLabel={liturgicalLabel}
            verses={verses}
            fullText={fullText}
          />

          <LeaderReaderCard
            raisedCount={raisedMemberIds.size}
            totalParticipants={participants.length}
            selectedMember={selectedMember}
            firstRaisedMemberId={firstRaisedMemberId}
            onChooseVolunteer={onChooseVolunteer}
            onPickRandomly={onPickRandomly}
            localLiturgicalNote={localLiturgicalNote}
            disabled={completedAt != null}
          />

          <ParticipantRosterStrip
            participants={participants}
            raisedMemberIds={raisedMemberIds}
            selectedMemberId={selectedMemberId}
            onChooseVolunteer={onChooseVolunteer}
            disabled={completedAt != null}
          />

          <div
            className="reading-advance-zone"
            data-testid="reading-advance-zone"
          >
            <AnimatePresence initial={false} mode="wait">
              {completedAt != null ? (
                <motion.button
                  key="reading-advance-cta"
                  type="button"
                  className="reading-advance-cta"
                  data-testid="reading-advance-cta"
                  initial={reducedMotion ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={
                    reducedMotion
                      ? { opacity: 0, transition: { duration: 0 } }
                      : { opacity: 0, y: -8 }
                  }
                  transition={morphTransition(reducedMotion)}
                  onClick={() => {
                    if (onNextSection) {
                      void onNextSection();
                    }
                  }}
                >
                  Begin Discussion →
                </motion.button>
              ) : (
                <div key="locked-group" className="reading-locked-group">
                  <div
                    className="locked-advance-bar"
                    data-testid="locked-advance-bar"
                    data-role="leader"
                    role="status"
                  >
                    <span className="locked-advance-icon" aria-hidden="true">
                      🔒
                    </span>
                    <span className="locked-advance-copy">
                      Reading proceeds: Waiting for reader to finish to advance
                    </span>
                  </div>

                  {onOverrideTurn && (
                    <button
                      type="button"
                      className="reading-override-button"
                      data-testid="reading-override-button"
                      onClick={() => {
                        void onOverrideTurn();
                      }}
                    >
                      Mark done (Leader override)
                    </button>
                  )}
                </div>
              )}
            </AnimatePresence>
          </div>
        </section>
      ) : (
        <section className="reading-participant-content">
          <ScriptureCard
            citation={citation}
            liturgicalLabel={liturgicalLabel}
            verses={verses}
            fullText={fullText}
          />

          {selectedMember ? (
            <div className="reading-status-card">
              {completedAt != null ? (
                <p
                  className="reading-completed-note"
                  data-testid="reading-completed-note"
                >
                  Gospel Reading concluded. Waiting for the Study Leader to begin
                  discussion.
                </p>
              ) : (
                <p
                  className="reading-active-volunteer-note"
                  data-testid="reading-active-volunteer-note"
                >
                  {selectedMember.displayName} is reading aloud
                </p>
              )}
            </div>
          ) : (
            <div className="reading-volunteer-zone">
              <ReadAloudOrb
                isHandRaised={isOwnHandRaised}
                onToggle={onToggleHandRaised}
              />
              <p
                className="reading-volunteers-count"
                data-testid="reading-volunteers-count"
              >
                {formatVolunteersCount(raisedMemberIds.size)}
              </p>
            </div>
          )}

          <div
            className="locked-advance-bar"
            data-testid="locked-advance-bar"
            data-role="participant"
            role="status"
          >
            <span className="locked-advance-icon" aria-hidden="true">
              ⓘ
            </span>
            <span className="locked-advance-copy">
              The leader advances when finished
            </span>
          </div>
        </section>
      )}
    </div>
  );
}

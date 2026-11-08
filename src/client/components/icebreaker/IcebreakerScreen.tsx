import { useEffect } from 'react';
import { motion } from 'motion/react';
import type { SanctuaryRole } from '../../../shared/health';
import type {
  PublicLiveSessionSnapshot,
  SessionIcebreakerContent,
  SessionUpdatedCommand,
} from '../../../shared/session';
import { volunteerTurnPhase } from '../../../shared/session';
import type { StudyDocument } from '../../../shared/study';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';
import { getTextItemMotion } from '../common/AnimatedTextReveal';
import {
  resolveSacredStage,
  useSacredStageStore,
} from '../../state/sacredStageStore';
import { SectionProgressHeader } from '../sections/SectionProgressHeader';
import { HandRaiseOrb } from '../prayer/HandRaiseOrb';
import { LockedAdvanceBar } from '../prayer/LockedAdvanceBar';
import { triggerTactileHaptic } from '../prayer/RaisedHandsQueue';
import {
  RandomPickButton,
  RandomSelectionPanel,
  type RandomCandidateData,
} from '../random/RandomSelectionPanel';
import { RandomSelectionOverlay } from '../random/RandomSelectionOverlay';
import { ExamplesToListenForCard } from './ExamplesToListenForCard';
import { HandRaiseCountPill } from './HandRaiseCountPill';
import { IcebreakerPromptCard } from './IcebreakerPromptCard';

export interface IcebreakerScreenProps {
  role: SanctuaryRole;
  session: PublicLiveSessionSnapshot;
  /**
   * Locally held study document (facilitator side). Supplies the
   * facilitator-only `examplesToListenFor` / `leaderNote` for the Study
   * Leader's listening card; intentionally never synced over `/ws`.
   */
  localStudyDocument?: StudyDocument | null;
  /** Current member id (used to derive the caller's own raised-hand state). */
  memberId?: string | null;
  /** Participant self-service: raise (`true`) / lower (`false`) own hand. */
  onToggleHandRaised: (next: boolean) => void | Promise<void>;
  /** Study Leader: return to Section 1 (`previous_section`). */
  onPreviousSection?: () => void | Promise<void>;
  /** Study Leader: advance to Section 3 (`next_section`). */
  onNextSection?: () => void | Promise<void>;
  /** Chosen volunteer: mark sharing completed (`complete_turn`). */
  onCompleteTurn?: () => void | Promise<void>;
  /** Study Leader: complete turn on volunteer's behalf (`override_turn`). */
  onOverrideTurn?: () => void | Promise<void>;
  /** Study Leader: reset icebreaker volunteer turn (`reset_turn`). */
  onResetTurn?: () => void | Promise<void>;
  /** Study Leader: stage a random candidate (`pick_random`). */
  onPickRandomly?: () => void | Promise<void>;
  /** Study Leader: re-roll the pending candidate (`retry_random`). */
  onRetryRandom?: () => void | Promise<void>;
  /** Study Leader: confirm the pending candidate (`confirm_random`). */
  onConfirmRandom?: () => void | Promise<void>;
  /** Latest broadcast command for trigger impulses. */
  lastSessionCommand?: SessionUpdatedCommand | null;
  /** Sanitized PUBLIC_URL origin from GET /api/health (null when unset). */
  publicUrl?: string | null;
  /** Optional custom share trigger handler (overrides internal share sheet state). */
  onShareQr?: () => void;
}

const PARTICIPANT_SUBCOPY =
  'The leader will give you a moment to share your reflection.';
const ORB_HINT_COPY = 'The leader will call on you to share.';
const ORB_CAPTION_WHEN_LOWER = 'Tap to raise your hand';
const ORB_CAPTION_WHEN_RAISED = 'Tap again to lower';
const TITLE_FALLBACK = 'Icebreaker';
const QUESTION_FALLBACK = 'The leader will share the icebreaker question shortly.';
const CHOSEN_INSTRUCTION =
  "When you finish, tap 'Done' so the Study Leader can continue.";

/**
 * Builds the `ICEBREAKER · 10 MIN` eyebrow from the wire fields without
 * duplicating the duration when the seed eyebrow already contains it
 * (Scenario 1 renders the eyebrow byte-exact).
 */
export function formatIcebreakerEyebrow(
  eyebrow?: string | null,
  durationLabel?: string | null,
): string {
  const base = (eyebrow ?? '').trim() || 'ICEBREAKER';
  const duration = (durationLabel ?? '').trim();
  if (duration === '' || base.toLowerCase().includes(duration.toLowerCase())) {
    return base;
  }
  return `${base} · ${duration}`;
}

/**
 * Section 2 — Icebreaker "Outsiders Wanted" (`in_progress` +
 * `section_2_icebreaker`). Both roles share the progress header and heading.
 * The Study Leader sees `introText`, the QUESTION card, the facilitator-only
 * "Examples to Listen For" card (sourced from `localStudyDocument`),
 * the live count pill, and the sticky gold `Begin Reading →` CTA (locked when
 * a volunteer is chosen until Done).
 * Under First-Hand-Wins, the first Participant to raise hand immediately wins
 * the turn, receiving the prominent `YOU WERE CHOSEN` view with `Done Sharing`.
 * Other participants see who was chosen.
 */
export function IcebreakerScreen({
  role,
  session,
  localStudyDocument = null,
  memberId = null,
  onToggleHandRaised,
  onPreviousSection,
  onNextSection,
  onCompleteTurn,
  onOverrideTurn,
  onResetTurn,
  onPickRandomly,
  onRetryRandom,
  onConfirmRandom,
  lastSessionCommand = null,
  publicUrl = null,
  onShareQr,
}: IcebreakerScreenProps) {
  const isLeader = role === 'Study Leader';
  const reducedMotion = usePrefersReducedMotion();
  const setStage = useSacredStageStore((s) => s.setStage);
  const triggerImpulse = useSacredStageStore((s) => s.triggerImpulse);

  const turn = session.volunteerTurn ?? null;
  const turnPhase = turn ? volunteerTurnPhase(turn) : null;
  const isRandomizing = turnPhase === 'random_pending';
  const selectedMemberId = turn?.selectedMemberId ?? null;
  const completedAt = turn?.completedAt ?? null;
  const isChosenVolunteer =
    !isLeader && memberId != null && selectedMemberId === memberId;
  const selectedMember = selectedMemberId
    ? (session.members.find((m) => m.memberId === selectedMemberId) ?? null)
    : null;
  const candidateMemberId = turn?.candidateMemberId ?? null;
  const candidateMember: RandomCandidateData | null =
    candidateMemberId !== null
      ? (() => {
          const match = session.members.find(
            (m) => m.memberId === candidateMemberId,
          );
          return match
            ? {
                displayName: match.displayName,
                initials: match.initials,
                avatarPalette: match.avatarPalette,
                connectionStatus: match.connectionStatus,
              }
            : null;
        })()
      : null;

  // Stage wiring: Section 2 owns the warm bronze hospitality-rings treatment
  // of the sanctuary emblem (or chosen-aura for the chosen volunteer / random-polyhedron while randomizing).
  useEffect(() => {
    const resolved = resolveSacredStage({
      screen: 'section-2-icebreaker',
      isChosenVolunteer,
      isRandomizing,
    });
    setStage(resolved.stage, { accentMode: resolved.accentMode });
  }, [setStage, isChosenVolunteer, isRandomizing]);

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

  const icebreaker: SessionIcebreakerContent | null =
    session.study?.icebreaker ?? null;

  const eyebrow = formatIcebreakerEyebrow(
    icebreaker?.eyebrow,
    icebreaker?.durationLabel,
  );
  const title = icebreaker?.title ?? TITLE_FALLBACK;

  const raisedHands = turn?.raisedHands ?? [];
  const raisedCount = raisedHands.length;
  const isRaised =
    memberId !== null &&
    raisedHands.some((entry) => entry.memberId === memberId);
  const isTurnOpen =
    turn !== null && turn.sectionId === session.currentSectionId;

  return (
    <section
      className="icebreaker-screen"
      data-testid="icebreaker-screen"
      data-role={isLeader ? 'leader' : 'participant'}
      aria-label="Section 2 of 6, Icebreaker"
    >
      <SectionProgressHeader
        sectionNumber={2}
        isLeader={isLeader}
        sessionCode={session.sessionCode}
        publicUrl={publicUrl}
        onShareQr={onShareQr}
      />

      <div className="icebreaker-heading">
        <motion.span
          className="icebreaker-eyebrow"
          data-testid="icebreaker-eyebrow"
          {...getTextItemMotion(reducedMotion, 0)}
        >
          {eyebrow}
        </motion.span>
        <motion.h2
          className="icebreaker-title"
          data-testid="icebreaker-title"
          {...getTextItemMotion(reducedMotion, 1)}
        >
          {title}
        </motion.h2>
      </div>

      {isRandomizing && !isLeader ? (
        <RandomSelectionOverlay />
      ) : isChosenVolunteer ? (
        <section
          className="icebreaker-chosen-view"
          data-testid="icebreaker-chosen-view"
          aria-label="Chosen volunteer icebreaker turn"
        >
          <div
            className="icebreaker-chosen-live"
            data-testid="icebreaker-chosen-live"
            role="status"
            aria-live="polite"
          >
            You were chosen
          </div>

          <motion.div
            className="icebreaker-chosen-pill"
            data-testid="icebreaker-chosen-pill"
            initial={reducedMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={
              reducedMotion
                ? { duration: 0 }
                : { type: 'spring', stiffness: 420, damping: 26 }
            }
          >
            <span className="icebreaker-chosen-pill-dot" aria-hidden="true" />
            YOU WERE CHOSEN
          </motion.div>

          <motion.h3
            className="icebreaker-chosen-title"
            data-testid="icebreaker-chosen-title"
            {...getTextItemMotion(reducedMotion, 1)}
          >
            It's your turn to share
          </motion.h3>
          <motion.p
            className="icebreaker-chosen-instruction"
            data-testid="icebreaker-chosen-instruction"
            {...getTextItemMotion(reducedMotion, 2)}
          >
            {CHOSEN_INSTRUCTION}
          </motion.p>

          <IcebreakerPromptCard
            mainQuestion={icebreaker?.mainQuestion}
            followUpQuestion={icebreaker?.followUpQuestion}
          />

          {completedAt !== null ? (
            <p
              className="icebreaker-done-completed"
              data-testid="icebreaker-done-completed"
            >
              Reflection shared — waiting for Study Leader.
            </p>
          ) : (
            <motion.button
              type="button"
              className="icebreaker-done-button"
              data-testid="icebreaker-done-button"
              whileTap={reducedMotion ? undefined : { scale: 0.96 }}
              transition={
                reducedMotion
                  ? { duration: 0 }
                  : { type: 'spring', stiffness: 420, damping: 26 }
              }
              onClick={() => {
                triggerTactileHaptic(reducedMotion);
                triggerImpulse('completion-pulse');
                if (onCompleteTurn) {
                  void onCompleteTurn();
                }
              }}
            >
              <span aria-hidden="true">✓</span> Done Sharing
            </motion.button>
          )}

          <LockedAdvanceBar role="Participant" />
        </section>
      ) : !isLeader ? (
        <>
          {selectedMember ? (
            <>
              <IcebreakerPromptCard
                mainQuestion={icebreaker?.mainQuestion}
                followUpQuestion={icebreaker?.followUpQuestion}
              />
              <div className="icebreaker-status-card">
                {completedAt !== null ? (
                  <p
                    className="icebreaker-completed-note"
                    data-testid="icebreaker-completed-note"
                  >
                    Icebreaker sharing concluded. Waiting for the Study Leader to begin Gospel Reading.
                  </p>
                ) : (
                  <p
                    className="icebreaker-active-volunteer-note"
                    data-testid="icebreaker-active-volunteer-note"
                  >
                    {`${selectedMember.displayName} was chosen! ${selectedMember.displayName} is sharing`}
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              <motion.span
                className="icebreaker-share-eyebrow"
                data-testid="icebreaker-share-eyebrow"
                {...getTextItemMotion(reducedMotion, 0)}
              >
                SHARE WHEN READY
              </motion.span>
              <motion.p
                className="icebreaker-share-question"
                data-testid="icebreaker-share-question"
                {...getTextItemMotion(reducedMotion, 1)}
              >
                {icebreaker?.mainQuestion ?? QUESTION_FALLBACK}
              </motion.p>
              {icebreaker?.followUpQuestion && (
                <motion.p
                  className="icebreaker-share-followup"
                  data-testid="icebreaker-share-followup"
                  {...getTextItemMotion(reducedMotion, 2)}
                >
                  {icebreaker.followUpQuestion}
                </motion.p>
              )}
              <motion.p
                className="icebreaker-share-subcopy"
                data-testid="icebreaker-share-subcopy"
                {...getTextItemMotion(reducedMotion, 3)}
              >
                {PARTICIPANT_SUBCOPY}
              </motion.p>
              <div className="icebreaker-orb-wrap">
                <HandRaiseOrb
                  isRaised={isRaised}
                  disabled={!isTurnOpen}
                  onToggle={onToggleHandRaised}
                />
                <p
                  className="icebreaker-orb-caption"
                  data-testid="icebreaker-orb-caption"
                >
                  {isRaised ? ORB_CAPTION_WHEN_RAISED : ORB_CAPTION_WHEN_LOWER}
                </p>
                <p className="icebreaker-orb-hint" data-testid="icebreaker-orb-hint">
                  {ORB_HINT_COPY}
                </p>
              </div>
              <HandRaiseCountPill count={raisedCount} />
            </>
          )}

          <LockedAdvanceBar role="Participant" />
        </>
      ) : (
        <>
          {isRandomizing && candidateMember && turn?.candidateExpiresAt && (
            <RandomSelectionPanel
              candidate={candidateMember}
              candidateExpiresAt={turn.candidateExpiresAt}
              chosenLine="has been randomly chosen to share."
              isLeader
              onRetryRandom={() => {
                void Promise.resolve(onRetryRandom?.()).catch(() => {});
              }}
              onConfirmRandom={() => {
                void Promise.resolve(onConfirmRandom?.()).catch(() => {});
              }}
            />
          )}
          {icebreaker?.introText && (
            <motion.p
              className="icebreaker-intro icebreaker-description"
              data-testid="icebreaker-intro"
              {...getTextItemMotion(reducedMotion, 2)}
            >
              {icebreaker.introText}
            </motion.p>
          )}
          <IcebreakerPromptCard
            mainQuestion={icebreaker?.mainQuestion}
            followUpQuestion={icebreaker?.followUpQuestion}
          />
          <ExamplesToListenForCard
            examplesToListenFor={
              localStudyDocument?.icebreaker?.examplesToListenFor ?? null
            }
            leaderNote={localStudyDocument?.icebreaker?.leaderNote ?? null}
          />
          {selectedMember && completedAt === null && (
            <div
              className="icebreaker-chosen-banner"
              data-testid="icebreaker-chosen-banner"
              role="status"
            >
              <span>{`${selectedMember.displayName} is sharing — waiting for Done`}</span>
              {onRetryRandom && (
                <button
                  type="button"
                  className="random-retry-button pick-again-button"
                  data-testid="random-retry-button"
                  onClick={() => {
                    void Promise.resolve(onRetryRandom()).catch(() => {});
                  }}
                >
                  Pick Again
                </button>
              )}
            </div>
          )}
          <div className="icebreaker-advance-zone" data-testid="icebreaker-advance-zone">
            <HandRaiseCountPill count={raisedCount} />
            {turnPhase === 'collecting_hands' && onPickRandomly && (
              <RandomPickButton
                onPickRandomly={() => {
                  void Promise.resolve(onPickRandomly()).catch(() => {});
                }}
                connectedParticipantCount={session.connectedParticipantCount}
              />
            )}
            <div className="leader-advance-nav-row">
              {onPreviousSection && (
                <button
                  type="button"
                  className="section-previous-btn"
                  data-testid="previous-section-btn"
                  onClick={() => {
                    void Promise.resolve(onPreviousSection()).catch(() => {});
                  }}
                >
                  ← Previous
                </button>
              )}
              {selectedMember && completedAt === null ? (
                <div className="icebreaker-locked-group">
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
                      Waiting for volunteer to finish to advance
                    </span>
                  </div>
                  {onOverrideTurn && (
                    <button
                      type="button"
                      className="icebreaker-override-button"
                      data-testid="icebreaker-override-button"
                      onClick={() => {
                        void onOverrideTurn();
                      }}
                    >
                      Mark done (Leader override)
                    </button>
                  )}
                </div>
              ) : (
                <motion.button
                  type="button"
                  className="icebreaker-advance-cta"
                  data-testid="icebreaker-advance-cta"
                  whileTap={{ scale: 0.96 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                  onClick={() => {
                    void Promise.resolve(onNextSection?.()).catch(() => {});
                  }}
                >
                  Begin Reading →
                </motion.button>
              )}
            </div>
            {completedAt !== null && onResetTurn && (
              <button
                type="button"
                className="section-reset-turn-btn"
                data-testid="reset-turn-btn"
                onClick={() => {
                  void Promise.resolve(onResetTurn()).catch(() => {});
                }}
              >
                🔄 Reset turn
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

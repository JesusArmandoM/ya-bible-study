import { useEffect } from 'react';
import { motion } from 'motion/react';
import type { SanctuaryRole } from '../../../shared/health';
import type {
  PublicLiveSessionSnapshot,
  SessionIcebreakerContent,
} from '../../../shared/session';
import type { StudyDocument } from '../../../shared/study';
import {
  resolveSacredStage,
  useSacredStageStore,
} from '../../state/sacredStageStore';
import { SectionProgressHeader } from '../sections/SectionProgressHeader';
import { HandRaiseOrb } from '../prayer/HandRaiseOrb';
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
  /** Study Leader: advance to Section 3 (`next_section`). */
  onNextSection?: () => void | Promise<void>;
}

const PARTICIPANT_SUBCOPY =
  'The leader will give you a moment to share your reflection.';
const ORB_HINT_COPY = 'The leader will call on you to share.';
const ORB_CAPTION_WHEN_LOWER = 'Tap to raise your hand';
const ORB_CAPTION_WHEN_RAISED = 'Tap again to lower';
const TITLE_FALLBACK = 'Icebreaker';
const QUESTION_FALLBACK = 'The leader will share the icebreaker question shortly.';

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
 * "Examples to Listen For" card (sourced from `localStudyDocument`, same
 * provenance and reload limitations as `OpeningPrayerScreen`'s `leaderPrompt`),
 * the live count pill, and the sticky gold `Begin Reading →` CTA. Participants
 * see the group-facing question hero, the bronze `HandRaiseOrb`, and the live
 * count — leader-only copy stays out of their DOM entirely.
 */
export function IcebreakerScreen({
  role,
  session,
  localStudyDocument = null,
  memberId = null,
  onToggleHandRaised,
  onNextSection,
}: IcebreakerScreenProps) {
  const isLeader = role === 'Study Leader';
  const setStage = useSacredStageStore((s) => s.setStage);

  // Stage wiring: Section 2 owns the warm bronze hospitality-rings treatment
  // of the sanctuary emblem (DESIGN.md override #3), guarded — only ever
  // applied while this screen is mounted.
  useEffect(() => {
    const resolved = resolveSacredStage({
      screen: 'section-2-icebreaker',
      isChosenVolunteer: false,
    });
    setStage(resolved.stage, { accentMode: resolved.accentMode });
  }, [setStage]);

  const icebreaker: SessionIcebreakerContent | null =
    session.study?.icebreaker ?? null;

  const eyebrow = formatIcebreakerEyebrow(
    icebreaker?.eyebrow,
    icebreaker?.durationLabel,
  );
  const title = icebreaker?.title ?? TITLE_FALLBACK;

  const turn = session.volunteerTurn ?? null;
  const raisedHands = turn?.raisedHands ?? [];
  const raisedCount = raisedHands.length;
  const isRaised =
    memberId !== null &&
    raisedHands.some((entry) => entry.memberId === memberId);
  // The server gate additionally requires the live turn to match the current
  // section; mirror that so the orb never offers an action the server rejects.
  const isTurnOpen =
    turn !== null && turn.sectionId === session.currentSectionId;

  return (
    <section
      className="icebreaker-screen"
      data-testid="icebreaker-screen"
      data-role={isLeader ? 'leader' : 'participant'}
      aria-label="Section 2 of 5, Icebreaker"
    >
      <SectionProgressHeader sectionNumber={2} />

      <div className="icebreaker-heading">
        <span className="icebreaker-eyebrow" data-testid="icebreaker-eyebrow">
          {eyebrow}
        </span>
        <h2 className="icebreaker-title" data-testid="icebreaker-title">
          {title}
        </h2>
      </div>

      {isLeader ? (
        <>
          {icebreaker?.introText && (
            <p className="icebreaker-intro" data-testid="icebreaker-intro">
              {icebreaker.introText}
            </p>
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
          <div className="icebreaker-advance-zone" data-testid="icebreaker-advance-zone">
            <HandRaiseCountPill count={raisedCount} />
            <motion.button
              type="button"
              className="icebreaker-advance-cta"
              data-testid="icebreaker-advance-cta"
              whileTap={{ scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 420, damping: 26 }}
              onClick={() => {
                void Promise.resolve(onNextSection?.()).catch(() => {
                  // Failure is surfaced via the session error path.
                });
              }}
            >
              Begin Reading →
            </motion.button>
          </div>
        </>
      ) : (
        <>
          <span
            className="icebreaker-share-eyebrow"
            data-testid="icebreaker-share-eyebrow"
          >
            SHARE WHEN READY
          </span>
          <p
            className="icebreaker-share-question"
            data-testid="icebreaker-share-question"
          >
            {icebreaker?.mainQuestion ?? QUESTION_FALLBACK}
          </p>
          {icebreaker?.followUpQuestion && (
            <p
              className="icebreaker-share-followup"
              data-testid="icebreaker-share-followup"
            >
              {icebreaker.followUpQuestion}
            </p>
          )}
          <p
            className="icebreaker-share-subcopy"
            data-testid="icebreaker-share-subcopy"
          >
            {PARTICIPANT_SUBCOPY}
          </p>
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
    </section>
  );
}

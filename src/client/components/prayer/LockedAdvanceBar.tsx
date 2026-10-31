import { AnimatePresence, motion } from 'motion/react';
import type { SanctuaryRole } from '../../../shared/health';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';

export interface LockedAdvanceBarProps {
  role: SanctuaryRole;
}

export interface LeaderAdvanceZoneProps {
  /** `volunteerTurn.completedAt` — unlocks the gold CTA when set. */
  completedAt: string | null;
  /** Study Leader: advance to the next section (`next_section`). */
  onNextSection: () => void;
  /** Study Leader: complete the turn on the volunteer's behalf (`override_turn`). */
  onOverrideTurn: () => void;
}

/** DESIGN.md Motion: `springMorph` (280/28) for the locked-bar <-> CTA morph. */
function morphTransition(reducedMotion: boolean) {
  return reducedMotion
    ? { duration: 0 }
    : ({ type: 'spring', stiffness: 280, damping: 28 } as const);
}

/**
 * Anchored bottom locked/info pill for Section 1. The root is a `motion.div`
 * (same class, testid, and byte-identical copy in every locked state) so the
 * Study Leader's {@link LeaderAdvanceZone} can morph it into the gold advance
 * CTA via `AnimatePresence`; Participant usage is unchanged (bar always shown).
 */
export function LockedAdvanceBar({ role }: LockedAdvanceBarProps) {
  const reducedMotion = usePrefersReducedMotion();
  const isLeader = role === 'Study Leader';

  return (
    <motion.div
      className="locked-advance-bar"
      data-testid="locked-advance-bar"
      data-role={isLeader ? 'leader' : 'participant'}
      role="status"
      initial={false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={
        reducedMotion
          ? { opacity: 0, transition: { duration: 0 } }
          : { opacity: 0, y: 8, scale: 0.98 }
      }
      transition={morphTransition(reducedMotion)}
    >
      <span className="locked-advance-icon" aria-hidden="true">
        {isLeader ? '🔒' : 'ⓘ'}
      </span>
      <span className="locked-advance-copy">
        {isLeader
          ? 'Waiting for volunteer to advance'
          : 'Only the leader decides when to advance'}
      </span>
    </motion.div>
  );
}

/**
 * Study Leader Section 1 advance zone: the locked bar (zero interactive
 * controls inside it — accepted assertion) plus a sibling discreet
 * `Mark done (Leader override)` tertiary control while the turn is open. On
 * `completedAt` the zone morphs (`springMorph`, instant under reduced motion)
 * into the gold `Continue to Section 2 →` CTA dispatching `next_section`.
 */
export function LeaderAdvanceZone({
  completedAt,
  onNextSection,
  onOverrideTurn,
}: LeaderAdvanceZoneProps) {
  const reducedMotion = usePrefersReducedMotion();
  const completed = completedAt != null;

  return (
    <div className="prayer-advance-zone" data-testid="prayer-advance-zone">
      <AnimatePresence initial={false} mode="wait">
        {completed ? (
          <motion.button
            key="prayer-advance-cta"
            type="button"
            className="prayer-advance-cta"
            data-testid="prayer-advance-cta"
            onClick={onNextSection}
            initial={reducedMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={
              reducedMotion
                ? { opacity: 0, transition: { duration: 0 } }
                : { opacity: 0, y: -8 }
            }
            transition={morphTransition(reducedMotion)}
          >
            Continue to Section 2 →
          </motion.button>
        ) : (
          <LockedAdvanceBar key="locked-advance-bar" role="Study Leader" />
        )}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {!completed && (
          <motion.button
            key="prayer-override-button"
            type="button"
            className="prayer-override-button"
            data-testid="prayer-override-button"
            onClick={onOverrideTurn}
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={
              reducedMotion
                ? { opacity: 0, transition: { duration: 0 } }
                : { opacity: 0 }
            }
            transition={morphTransition(reducedMotion)}
          >
            Mark done (Leader override)
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

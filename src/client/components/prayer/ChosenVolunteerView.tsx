import { motion } from 'motion/react';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';
import { useSacredStageStore } from '../../state/sacredStageStore';
import { OpeningPrayerCard } from './OpeningPrayerCard';
import { triggerTactileHaptic } from './RaisedHandsQueue';

export interface ChosenVolunteerViewProps {
  /** `volunteerTurn.completedAt` — post-Done state when set. */
  completedAt: string | null;
  /** Synced instruction subtitle (`study.openingPrayer.chosenVolunteerInstruction`). */
  chosenVolunteerInstruction: string | null | undefined;
  /** Participant-visible suggested prayer text (`study.openingPrayer`). */
  suggestedPrayerText: string | null | undefined;
  /** Chosen volunteer: mark the turn done (`complete_turn`). */
  onCompleteTurn: () => void;
}

const CHOSEN_INSTRUCTION_FALLBACK =
  'When you finish, tap "Done" so the Study Leader can continue.';

/**
 * Exclusive chosen-volunteer prayer view (`ux/6`): `YOU WERE CHOSEN` pill,
 * Playfair `It's your turn to pray`, the synced instruction, the suggested
 * prayer card, and the gold `✓ Done` completion control — the ONLY `Done`
 * surface in the app. After completion the control morphs into the
 * `prayer-done-completed` note. Rendered only for the socket-bound chosen
 * member (server-enforced exclusivity lives on `/ws`).
 */
export function ChosenVolunteerView({
  completedAt,
  chosenVolunteerInstruction,
  suggestedPrayerText,
  onCompleteTurn,
}: ChosenVolunteerViewProps) {
  const reducedMotion = usePrefersReducedMotion();
  const triggerImpulse = useSacredStageStore((s) => s.triggerImpulse);
  const completed = completedAt != null;

  return (
    <section
      className="prayer-chosen-view"
      data-testid="prayer-chosen-view"
      aria-label="Chosen volunteer prayer turn"
    >
      <div
        className="prayer-chosen-live"
        data-testid="prayer-chosen-live"
        role="status"
        aria-live="polite"
      >
        You were chosen
      </div>

      <motion.div
        className="prayer-chosen-pill"
        data-testid="prayer-chosen-pill"
        initial={reducedMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={
          reducedMotion
            ? { duration: 0 }
            : { type: 'spring', stiffness: 420, damping: 26 }
        }
      >
        <span className="prayer-chosen-pill-dot" aria-hidden="true" />
        YOU WERE CHOSEN
      </motion.div>

      <h3 className="prayer-chosen-title" data-testid="prayer-chosen-title">
        It's your turn to pray
      </h3>
      <p
        className="prayer-chosen-instruction"
        data-testid="prayer-chosen-instruction"
      >
        {chosenVolunteerInstruction ?? CHOSEN_INSTRUCTION_FALLBACK}
      </p>

      <OpeningPrayerCard suggestedPrayerText={suggestedPrayerText} />

      {completed ? (
        <p className="prayer-done-completed" data-testid="prayer-done-completed">
          Amen — thank you for praying.
        </p>
      ) : (
        <motion.button
          type="button"
          className="prayer-done-button"
          data-testid="prayer-done-button"
          whileTap={reducedMotion ? undefined : { scale: 0.96 }}
          transition={
            reducedMotion
              ? { duration: 0 }
              : { type: 'spring', stiffness: 420, damping: 26 }
          }
          onClick={() => {
            triggerTactileHaptic(reducedMotion);
            triggerImpulse('completion-pulse');
            onCompleteTurn();
          }}
        >
          <span aria-hidden="true">✓</span> Done
        </motion.button>
      )}
    </section>
  );
}

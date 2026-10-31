import { motion } from 'motion/react';
import type { GospelVerse } from '../../../shared/study';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';
import { useSacredStageStore } from '../../state/sacredStageStore';
import { triggerTactileHaptic } from '../prayer/RaisedHandsQueue';
import { ScriptureCard } from './ScriptureCard';

export interface ReadingDoneViewProps {
  completedAt: string | null;
  citation: string;
  liturgicalLabel: string;
  verses?: GospelVerse[];
  fullText?: string;
  onCompleteTurn: () => void | Promise<void>;
}

const INSTRUCTION_TEXT =
  "Proclaim the Gospel reading aloud for the group. When finished, tap 'Done Reading'.";

/**
 * Exclusive chosen-volunteer Gospel Reading view: `YOU WERE CHOSEN` pill,
 * Playfair title "It's your turn to read", the instruction, the full scrollable
 * ScriptureCard, and the gold `Done Reading` button — the ONLY `Done Reading`
 * surface in the app. Rendered exclusively for the socket-bound chosen reader.
 */
export function ReadingDoneView({
  completedAt,
  citation,
  liturgicalLabel,
  verses,
  fullText,
  onCompleteTurn,
}: ReadingDoneViewProps) {
  const reducedMotion = usePrefersReducedMotion();
  const triggerImpulse = useSacredStageStore((s) => s.triggerImpulse);
  const completed = completedAt != null;

  return (
    <section
      className="reading-chosen-view"
      data-testid="reading-chosen-view"
      aria-label="Chosen reader Gospel turn"
    >
      <div
        className="reading-chosen-live"
        data-testid="reading-chosen-live"
        role="status"
        aria-live="polite"
      >
        You were chosen
      </div>

      <motion.div
        className="reading-chosen-pill"
        data-testid="reading-chosen-pill"
        initial={reducedMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={
          reducedMotion
            ? { duration: 0 }
            : { type: 'spring', stiffness: 420, damping: 26 }
        }
      >
        <span className="reading-chosen-pill-dot" aria-hidden="true" />
        YOU WERE CHOSEN
      </motion.div>

      <h3 className="reading-chosen-title" data-testid="reading-chosen-title">
        It's your turn to read
      </h3>
      <p
        className="reading-chosen-instruction"
        data-testid="reading-chosen-instruction"
      >
        {INSTRUCTION_TEXT}
      </p>

      <ScriptureCard
        citation={citation}
        liturgicalLabel={liturgicalLabel}
        verses={verses}
        fullText={fullText}
        className="reading-chosen-scripture"
      />

      {completed ? (
        <p
          className="reading-done-completed"
          data-testid="reading-done-completed"
        >
          Praise to you, Lord Jesus Christ.
        </p>
      ) : (
        <motion.button
          type="button"
          className="reading-done-button"
          data-testid="reading-done-button"
          whileTap={reducedMotion ? undefined : { scale: 0.96 }}
          transition={
            reducedMotion
              ? { duration: 0 }
              : { type: 'spring', stiffness: 420, damping: 26 }
          }
          onClick={() => {
            triggerTactileHaptic(reducedMotion);
            triggerImpulse('completion-pulse');
            void onCompleteTurn();
          }}
        >
          Done Reading
        </motion.button>
      )}
    </section>
  );
}

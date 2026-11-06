import { motion } from 'motion/react';
import { useEffect } from 'react';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';
import {
  resolveSacredStage,
  useSacredStageStore,
} from '../../state/sacredStageStore';

/**
 * Exclusive full-screen waiting view (`DESIGN.md` Override #2) rendered for
 * `Participant`s while the live session is in `lobby` (or early `setup`).
 * Displays only `"The study leader will begin shortly"` beneath the persistent
 * 3D `Sacred3DScene` sanctuary emblem, with zero study metrics or controls.
 */
export function ParticipantWaitingScreen() {
  const reducedMotion = usePrefersReducedMotion();
  const setStage = useSacredStageStore((s) => s.setStage);

  useEffect(() => {
    const resolved = resolveSacredStage({ screen: 'title-lobby' });
    setStage(resolved.stage, { accentMode: resolved.accentMode });
  }, [setStage]);

  return (
    <section
      className="participant-waiting-screen"
      data-testid="participant-waiting-screen"
      aria-label="Waiting for Study Leader"
      aria-live="polite"
    >
      <motion.div
        className="participant-waiting-content"
        initial={reducedMotion ? false : { opacity: 0, y: 12 }}
        animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
        transition={
          reducedMotion
            ? { duration: 0 }
            : { duration: 0.32, ease: 'easeOut' }
        }
      >
        <p
          className="participant-waiting-message"
          data-testid="participant-waiting-message"
        >
          The study leader will begin shortly
        </p>
      </motion.div>
    </section>
  );
}

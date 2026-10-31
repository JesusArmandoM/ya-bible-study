import { AnimatePresence, motion } from 'motion/react';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';

export interface HandRaiseCountPillProps {
  /** Live count derived as `volunteerTurn.raisedHands.length`. */
  count: number;
}

/**
 * Live raised-hands count pill (emerald dot + uppercase literal copy).
 * Pluralization is literal per the design: `0 PEOPLE HAVE RAISED THEIR HAND`,
 * singular `1 PERSON HAS RAISED THEIR HAND`. The count number transitions with
 * `motion/react`, disabled under `prefers-reduced-motion`.
 */
export function formatIcebreakerRaisedCount(count: number): string {
  if (count === 1) {
    return '1 PERSON HAS RAISED THEIR HAND';
  }
  return `${count} PEOPLE HAVE RAISED THEIR HAND`;
}

export function HandRaiseCountPill({ count }: HandRaiseCountPillProps) {
  const reducedMotion = usePrefersReducedMotion();
  const copy = formatIcebreakerRaisedCount(count);

  return (
    <div
      className="icebreaker-count-pill"
      data-testid="icebreaker-count-pill"
      role="status"
      aria-live="polite"
    >
      <span className="icebreaker-count-dot" aria-hidden="true" />
      <span className="icebreaker-count-pill-text" data-testid="icebreaker-count-pill-text">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={copy}
            data-testid="icebreaker-count-pill-value"
            initial={reducedMotion ? false : { opacity: 0, y: 6 }}
            animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
            exit={reducedMotion ? undefined : { opacity: 0, y: -6 }}
            transition={{ type: 'spring', stiffness: 420, damping: 26 }}
          >
            {copy}
          </motion.span>
        </AnimatePresence>
      </span>
    </div>
  );
}

import { motion } from 'motion/react';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';
import { getTextItemMotion } from '../common/AnimatedTextReveal';

export interface OpeningPrayerCardProps {
  /** Participant-visible suggested prayer text (`study.openingPrayer`). */
  suggestedPrayerText: string | null | undefined;
}

/**
 * Scripture-italic suggested prayer card (`SUGGESTED OPENING PRAYER`).
 * Renders the full prayer text without truncation (DESIGN: readable on 375px)
 * and degrades to a clear fallback when the synced content is unavailable.
 */
export function OpeningPrayerCard({
  suggestedPrayerText,
}: OpeningPrayerCardProps) {
  const reducedMotion = usePrefersReducedMotion();
  const hasText =
    typeof suggestedPrayerText === 'string' && suggestedPrayerText.trim().length > 0;

  return (
    <section
      className="prayer-text-card"
      aria-label="Suggested opening prayer"
    >
      <motion.span
        className="prayer-text-label"
        {...getTextItemMotion(reducedMotion, 3)}
      >
        SUGGESTED OPENING PRAYER
      </motion.span>
      {hasText ? (
        <motion.p
          className="prayer-text prayer-text-body"
          data-testid="opening-prayer-text"
          {...getTextItemMotion(reducedMotion, 4)}
        >
          {suggestedPrayerText}
        </motion.p>
      ) : (
        <motion.p
          className="prayer-text prayer-text-body prayer-text-body-fallback"
          data-testid="opening-prayer-text"
          {...getTextItemMotion(reducedMotion, 4)}
        >
          Opening Prayer content unavailable
        </motion.p>
      )}
    </section>
  );
}

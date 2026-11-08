import { motion } from 'motion/react';
import type { SessionApplicationPointItem } from '../../../shared/session';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';
import { getTextItemMotion } from '../common/AnimatedTextReveal';

export interface ApplicationCardProps {
  item: SessionApplicationPointItem;
  index?: number;
}

/**
 * Renders a young adult practical life application card (A–D) with challenge
 * title and pastoral guidance for navigating modern culture and perseverance.
 */
export function ApplicationCard({ item, index = 0 }: ApplicationCardProps) {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <motion.article
      className="application-card"
      data-testid="application-item"
      data-item-id={item.id}
      aria-label={`Application point ${item.id}: ${item.title}`}
      {...getTextItemMotion(reducedMotion, index, 0.05)}
    >
      <header className="application-card-header">
        <span className="application-letter-badge" aria-hidden="true">
          {item.id}
        </span>
        <h4 className="application-item-title application-card-title">{item.title}</h4>
      </header>

      <p className="application-body-summary application-card-summary">{item.summary}</p>
    </motion.article>
  );
}

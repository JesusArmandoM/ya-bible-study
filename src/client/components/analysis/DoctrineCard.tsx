import { motion } from 'motion/react';
import type { SessionDoctrineHighlightItem } from '../../../shared/session';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';
import { getTextItemMotion } from '../common/AnimatedTextReveal';

export interface DoctrineCardProps {
  item: SessionDoctrineHighlightItem;
  index?: number;
}

/**
 * Renders a key Catholic doctrine highlight card (A–D) with theological dogma
 * title, summary explanation, and Catechism/Biblical references.
 */
export function DoctrineCard({ item, index = 0 }: DoctrineCardProps) {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <motion.article
      className="doctrine-card"
      data-testid="doctrine-item"
      data-item-id={item.id}
      aria-label={`Catholic doctrine point ${item.id}: ${item.title}`}
      {...getTextItemMotion(reducedMotion, index, 0.05)}
    >
      <header className="doctrine-card-header">
        <div className="doctrine-header-meta">
          <span className="doctrine-letter-badge" aria-hidden="true">
            {item.id}
          </span>
          <h4 className="doctrine-item-title doctrine-card-title">{item.title}</h4>
        </div>
        {item.references && item.references.length > 0 && (
          <div className="doctrine-ref-tags" aria-label="Doctrinal references">
            {item.references.map((ref) => (
              <span key={ref} className="doctrine-ref-pill">
                {ref}
              </span>
            ))}
          </div>
        )}
      </header>

      <p className="doctrine-body-summary doctrine-card-summary">{item.summary}</p>
    </motion.article>
  );
}

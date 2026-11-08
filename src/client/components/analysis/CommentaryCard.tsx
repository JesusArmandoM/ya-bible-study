import { motion } from 'motion/react';
import type { SessionVerseCommentaryItem } from '../../../shared/session';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';
import { getTextItemMotion } from '../common/AnimatedTextReveal';

export interface CommentaryCardProps {
  item: SessionVerseCommentaryItem;
  /** Facilitator-facing patristic note from local StudyDocument (Study Leader view only). */
  patristicNote?: string | null;
  index?: number;
}

/**
 * Renders a single verse-by-verse commentary point (A–J) with verse citation,
 * quoted scripture excerpt, patristic/expository commentary, CCC references,
 * and optional leader patristic context.
 */
export function CommentaryCard({
  item,
  patristicNote = null,
  index = 0,
}: CommentaryCardProps) {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <motion.article
      className="commentary-card"
      data-testid="commentary-item"
      data-item-id={item.id}
      aria-label={`Commentary point ${item.id}: ${item.verseCitation}`}
      {...getTextItemMotion(reducedMotion, index, 0.04)}
    >
      <header className="commentary-card-header">
        <div className="commentary-header-meta">
          <span className="commentary-letter-badge" aria-hidden="true">
            {item.id}
          </span>
          <span className="commentary-verse-citation commentary-card-title">{item.verseCitation}</span>
        </div>
        {item.catechismReferences.length > 0 && (
          <div className="commentary-ccc-tags" aria-label="Catechism references">
            {item.catechismReferences.map((ref) => (
              <span key={ref} className="commentary-ccc-pill">
                {ref}
              </span>
            ))}
          </div>
        )}
      </header>

      <blockquote className="commentary-scripture-quote">
        “{item.quotedText}”
      </blockquote>

      <p className="commentary-body-text commentary-card-body">{item.commentary}</p>

      {patristicNote && (
        <aside
          className="commentary-patristic-callout"
          data-testid="patristic-note"
          aria-label="Patristic context for Study Leader"
        >
          <div className="patristic-callout-header">
            <span className="patristic-callout-icon" aria-hidden="true">
              📜
            </span>
            <span className="patristic-callout-label">
              Patristic Context · Leader Note
            </span>
          </div>
          <p className="patristic-callout-body">{patristicNote}</p>
        </aside>
      )}
    </motion.article>
  );
}

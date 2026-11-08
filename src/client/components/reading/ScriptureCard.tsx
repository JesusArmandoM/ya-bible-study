import { motion } from 'motion/react';
import type { GospelVerse } from '../../../shared/study';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';
import { getTextItemMotion } from '../common/AnimatedTextReveal';

export interface ScriptureCardProps {
  citation: string;
  liturgicalLabel: string;
  verses?: GospelVerse[];
  fullText?: string;
  className?: string;
}

/**
 * Scrollable Scripture card presenting solely the Gospel passage (Matthew 15:21–28
 * for the seed study) per CONSTRAINTS.md and DESIGN.md override #2.
 * Positioned cleanly above the action orb with its own bounded scroll container
 * to ensure zero overlap on mobile viewports (override #4).
 */
export function ScriptureCard({
  citation,
  liturgicalLabel,
  verses,
  fullText,
  className,
}: ScriptureCardProps) {
  const reducedMotion = usePrefersReducedMotion();
  const hasVerses = Array.isArray(verses) && verses.length > 0;

  return (
    <article
      className={`scripture-card ${className ?? ''}`.trim()}
      data-testid="scripture-card"
      aria-label={`${citation} Scripture reading`}
    >
      <header className="scripture-card-header">
        <motion.span
          className="scripture-card-label gospel-reading-eyebrow"
          data-testid="scripture-card-label"
          {...getTextItemMotion(reducedMotion, 0)}
        >
          {liturgicalLabel}
        </motion.span>
        <motion.h3
          className="scripture-card-citation gospel-reading-title"
          data-testid="scripture-card-citation"
          {...getTextItemMotion(reducedMotion, 1)}
        >
          {citation}
        </motion.h3>
      </header>

      <div
        className="scripture-card-body"
        data-testid="scripture-card-body"
        tabIndex={0}
        role="region"
        aria-label="Gospel Scripture passage"
      >
        {hasVerses ? (
          <div className="scripture-verses-list">
            {verses.map((verse, idx) => (
              <motion.p
                key={verse.verseNumber}
                className="scripture-verse gospel-verse gospel-reading-text"
                data-testid={`scripture-verse-${verse.verseNumber}`}
                {...getTextItemMotion(reducedMotion, 2 + idx, 0.06)}
              >
                <sup
                  className="scripture-verse-num"
                  aria-label={`Verse ${verse.verseNumber}`}
                >
                  {verse.verseNumber}
                </sup>{' '}
                <span className="scripture-verse-text">{verse.text}</span>
              </motion.p>
            ))}
          </div>
        ) : (
          <motion.p
            className="scripture-full-text gospel-reading-text"
            {...getTextItemMotion(reducedMotion, 2)}
          >
            {fullText}
          </motion.p>
        )}
      </div>
    </article>
  );
}

import type { GospelVerse } from '../../../shared/study';

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
  const hasVerses = Array.isArray(verses) && verses.length > 0;

  return (
    <article
      className={`scripture-card ${className ?? ''}`.trim()}
      data-testid="scripture-card"
      aria-label={`${citation} Scripture reading`}
    >
      <header className="scripture-card-header">
        <span
          className="scripture-card-label"
          data-testid="scripture-card-label"
        >
          {liturgicalLabel}
        </span>
        <h3
          className="scripture-card-citation"
          data-testid="scripture-card-citation"
        >
          {citation}
        </h3>
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
            {verses.map((verse) => (
              <p
                key={verse.verseNumber}
                className="scripture-verse"
                data-testid={`scripture-verse-${verse.verseNumber}`}
              >
                <sup
                  className="scripture-verse-num"
                  aria-label={`Verse ${verse.verseNumber}`}
                >
                  {verse.verseNumber}
                </sup>{' '}
                <span className="scripture-verse-text">{verse.text}</span>
              </p>
            ))}
          </div>
        ) : (
          <p className="scripture-full-text">{fullText}</p>
        )}
      </div>
    </article>
  );
}

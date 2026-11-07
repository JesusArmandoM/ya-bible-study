import type { SessionDoctrineHighlightItem } from '../../../shared/session';

export interface DoctrineCardProps {
  item: SessionDoctrineHighlightItem;
  index?: number;
}

/**
 * Renders a key Catholic doctrine highlight card (A–D) with theological dogma
 * title, summary explanation, and Catechism/Biblical references.
 */
export function DoctrineCard({ item }: DoctrineCardProps) {
  return (
    <article
      className="doctrine-card"
      data-testid="doctrine-item"
      data-item-id={item.id}
      aria-label={`Catholic doctrine point ${item.id}: ${item.title}`}
    >
      <header className="doctrine-card-header">
        <div className="doctrine-header-meta">
          <span className="doctrine-letter-badge" aria-hidden="true">
            {item.id}
          </span>
          <h4 className="doctrine-item-title">{item.title}</h4>
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

      <p className="doctrine-body-summary">{item.summary}</p>
    </article>
  );
}

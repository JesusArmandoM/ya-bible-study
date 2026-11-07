import type { SessionApplicationPointItem } from '../../../shared/session';

export interface ApplicationCardProps {
  item: SessionApplicationPointItem;
  index?: number;
}

/**
 * Renders a young adult practical life application card (A–D) with challenge
 * title and pastoral guidance for navigating modern culture and perseverance.
 */
export function ApplicationCard({ item }: ApplicationCardProps) {
  return (
    <article
      className="application-card"
      data-testid="application-item"
      data-item-id={item.id}
      aria-label={`Application point ${item.id}: ${item.title}`}
    >
      <header className="application-card-header">
        <span className="application-letter-badge" aria-hidden="true">
          {item.id}
        </span>
        <h4 className="application-item-title">{item.title}</h4>
      </header>

      <p className="application-body-summary">{item.summary}</p>
    </article>
  );
}

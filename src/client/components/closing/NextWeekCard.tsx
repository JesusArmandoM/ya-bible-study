import type { SessionNextWeekAnnouncement } from '../../../shared/session';

export interface NextWeekCardProps {
  announcement?: SessionNextWeekAnnouncement | null;
}

const DEFAULT_ANNOUNCEMENT: SessionNextWeekAnnouncement = {
  title: 'Faith that Endures',
  citation: 'James 1:2–4',
  displayLabel: '“Faith that Endures” — James 1:2–4',
};

export function NextWeekCard({ announcement }: NextWeekCardProps) {
  const item = announcement ?? DEFAULT_ANNOUNCEMENT;

  return (
    <section
      className="closing-next-week-card"
      data-testid="next-week-card"
      data-animated-text="true"
      aria-label="Next week announcement"
    >
      <div className="closing-next-week-eyebrow">
        <span aria-hidden="true">📣</span> NEXT WEEK AT CHURCH
      </div>
      <p className="closing-next-week-announcement closing-summary" data-testid="next-week-title" data-animated-text="true">
        {item.displayLabel}
      </p>
    </section>
  );
}

import { AnimatePresence } from 'motion/react';
import type { SessionReflection } from '../../../shared/session';
import { ReflectionCard } from './ReflectionCard';

export interface ReflectionFeedProps {
  reflections: SessionReflection[];
  questionId: string;
}

export function ReflectionFeed({ reflections, questionId }: ReflectionFeedProps) {
  const questionReflections = reflections.filter((r) => r.questionId === questionId);

  // Newest first per UX mockup ux/11
  const sortedReflections = [...questionReflections].sort((a, b) => {
    const diff = Date.parse(b.createdAt) - Date.parse(a.createdAt);
    return Number.isFinite(diff) ? diff : 0;
  });

  return (
    <section
      className="discussion-sharing-feed"
      data-testid="discussion-sharing-feed"
      aria-labelledby="sharing-section-heading"
    >
      <div className="sharing-feed-header">
        <h3 id="sharing-section-heading" className="sharing-feed-title">
          SHARING
        </h3>
        <span
          className="sharing-count-badge"
          data-testid="reflection-count-badge"
        >
          {questionReflections.length}
        </span>
      </div>

      {sortedReflections.length === 0 ? (
        <div
          className="reflection-feed-empty"
          data-testid="reflection-feed-empty"
        >
          <p>No responses yet. Be the first to share your reflection.</p>
        </div>
      ) : (
        <div className="reflection-feed-list" data-testid="reflection-feed-list">
          <AnimatePresence initial={false}>
            {sortedReflections.map((reflection) => (
              <ReflectionCard key={reflection.id} reflection={reflection} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
}

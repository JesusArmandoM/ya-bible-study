import { useMemo } from 'react';
import type { PublicLiveSessionSnapshot } from '../../../shared/session';

export interface LiveSessionStatsCardProps {
  session: PublicLiveSessionSnapshot;
}

export function LiveSessionStatsCard({ session }: LiveSessionStatsCardProps) {
  const durationLabel = useMemo(() => {
    if (session.startedAt) {
      const startedMs = Date.parse(session.startedAt);
      if (!Number.isNaN(startedMs)) {
        const elapsedMinutes = Math.max(
          1,
          Math.round((Date.now() - startedMs) / 60000),
        );
        return `${elapsedMinutes}m`;
      }
    }
    const fallbackMins = session.study?.estimatedMinutes ?? 42;
    return `${fallbackMins}m`;
  }, [session.startedAt, session.study?.estimatedMinutes]);

  const participantCount = session.connectedParticipantCount;

  return (
    <section
      className="closing-stats-card"
      data-testid="session-stats-card"
      aria-label="Session metrics"
    >
      <div className="closing-stat-col" data-testid="stat-sections">
        <span className="closing-stat-value">5</span>
        <span className="closing-stat-label">SECTIONS</span>
      </div>

      <div className="closing-stat-divider" aria-hidden="true" />

      <div className="closing-stat-col" data-testid="stat-duration">
        <span className="closing-stat-value">{durationLabel}</span>
        <span className="closing-stat-label">DURATION</span>
      </div>

      <div className="closing-stat-divider" aria-hidden="true" />

      <div className="closing-stat-col" data-testid="stat-participants">
        <span className="closing-stat-value">{participantCount}</span>
        <span className="closing-stat-label">PARTICIPANTS</span>
      </div>
    </section>
  );
}

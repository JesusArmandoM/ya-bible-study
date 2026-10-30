import type { SanctuaryRole } from '../../../shared/health';

export interface SectionOneHandoffProps {
  role: SanctuaryRole;
}

/**
 * Minimal Section 1 (`in_progress`) handoff surface for both roles: the
 * persistent `SECTION 1 OF 5 · 20%` header with the 4px gold progress bar,
 * the `Opening Prayer` title, and role-appropriate waiting copy. Explicitly
 * provisional for `section-1-opening-prayer-hand-raise`.
 */
export function SectionOneHandoff({ role }: SectionOneHandoffProps) {
  const isLeader = role === 'Study Leader';

  return (
    <section
      className="section-one-handoff"
      data-testid="section-one-handoff"
      data-role={isLeader ? 'leader' : 'participant'}
      aria-label="Section 1 of 5, Opening Prayer"
    >
      <div className="section-one-header">
        <span
          className="section-one-label"
          data-testid="section-one-label"
        >
          SECTION 1 OF 5
        </span>
        <span className="section-one-percent" data-testid="section-one-percent">
          20%
        </span>
      </div>

      <div
        className="section-one-progress"
        role="progressbar"
        aria-valuenow={20}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Study progress"
      >
        <div className="section-one-progress-fill" aria-hidden="true" />
      </div>

      <h2 className="section-one-title" data-testid="section-one-title">
        Opening Prayer
      </h2>

      <p className="section-one-copy" data-testid="section-one-copy">
        {isLeader
          ? 'Opening Prayer is ready — hand raises and volunteer selection arrive with the next update.'
          : 'Waiting for the Study Leader to begin the Opening Prayer…'}
      </p>
    </section>
  );
}

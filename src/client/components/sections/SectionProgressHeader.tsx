export interface SectionProgressHeaderProps {
  /** 1-based study section number (1..6). */
  sectionNumber: number;
}

const PROGRESS_PERCENTS = [17, 33, 50, 67, 83, 100] as const;

/**
 * Shared `SECTION {n} OF 6 · {percent}%` progress header with the 4px gold
 * progress bar. Reused by all study screens; keeps the legacy-stable
 * `section-one-*` class names and test hooks so accepted assertions stay green.
 */
export function SectionProgressHeader({
  sectionNumber,
}: SectionProgressHeaderProps) {
  const percent =
    PROGRESS_PERCENTS[Math.min(Math.max(sectionNumber - 1, 0), 5)];

  return (
    <>
      <div className="section-one-header">
        <span className="section-one-label" data-testid="section-one-label">
          SECTION {sectionNumber} OF 6
        </span>
        <span className="section-one-percent" data-testid="section-one-percent">
          {percent}%
        </span>
      </div>

      <div
        className="section-one-progress"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Study progress"
      >
        <div
          className="section-one-progress-fill"
          aria-hidden="true"
          style={{ width: `${percent}%` }}
        />
      </div>
    </>
  );
}

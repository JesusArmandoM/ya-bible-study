export interface SectionProgressHeaderProps {
  /** 1-based study section number (1..5). */
  sectionNumber: number;
}

/**
 * Shared `SECTION {n} OF 5 · {percent}%` progress header with the 4px gold
 * progress bar. Reused by the Section 1 Opening Prayer screen and the generic
 * in-progress placeholder; keeps the legacy-stable `section-one-*` class names
 * and test hooks so accepted assertions stay green.
 */
export function SectionProgressHeader({
  sectionNumber,
}: SectionProgressHeaderProps) {
  const percent = sectionNumber * 20;

  return (
    <>
      <div className="section-one-header">
        <span className="section-one-label" data-testid="section-one-label">
          SECTION {sectionNumber} OF 5
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

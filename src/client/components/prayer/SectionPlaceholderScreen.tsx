import type { SanctuaryRole } from '../../../shared/health';
import { SectionProgressHeader } from '../sections/SectionProgressHeader';

export interface SectionPlaceholderScreenProps {
  /** 0-based `currentSectionIndex` from the live session snapshot. */
  sectionIndex: number;
  role?: SanctuaryRole;
  /** Whether the current viewer is the Study Leader. */
  isLeader?: boolean;
  /** Active session code used by the QR share sheet. */
  sessionCode?: string;
  /** Optional sanitized public URL origin (e.g. from /api/health). */
  publicUrl?: string | null;
  /** Optional custom share trigger handler (overrides internal share sheet state). */
  onShareQr?: () => void;
  onPreviousSection?: () => void | Promise<void>;
  onNextSection?: () => void | Promise<void>;
}

/**
 * Surface for `in_progress` outside implemented sections.
 * For Section 4 (Deep Analysis, index 3), provides a dedicated placeholder
 * with leader navigation (← Previous to Section 3 and Continue to Discussion → to Section 5)
 * and participant waiting copy.
 */
export function SectionPlaceholderScreen({
  sectionIndex,
  role = 'Participant',
  isLeader = false,
  sessionCode,
  publicUrl = null,
  onShareQr,
  onPreviousSection,
  onNextSection,
}: SectionPlaceholderScreenProps) {
  const sectionNumber = Math.min(Math.max(sectionIndex + 1, 1), 6);
  const effectiveIsLeader = Boolean(isLeader || role === 'Study Leader');

  if (sectionIndex === 3) {
    return (
      <section
        className="section-placeholder deep-analysis-placeholder"
        data-testid="deep-analysis-placeholder"
        data-section-number={4}
        aria-label="Section 4 of 6, Deep Analysis"
      >
        <SectionProgressHeader
          sectionNumber={4}
          isLeader={effectiveIsLeader}
          sessionCode={sessionCode}
          publicUrl={publicUrl}
          onShareQr={onShareQr}
        />

        <div className="section-placeholder-header">
          <span
            className="section-placeholder-eyebrow"
            data-testid="deep-analysis-eyebrow"
          >
            DEEP ANALYSIS · 20 MIN
          </span>
          <h2
            className="section-placeholder-title"
            data-testid="deep-analysis-title"
          >
            Deep Analysis
          </h2>
        </div>

        <p className="section-placeholder-copy">
          Gospel commentary breakdown, Catholic doctrine highlights, and young adult
          application points have been loaded. Interactive deep analysis view arrives
          in the next update.
        </p>

        {effectiveIsLeader ? (
          <div
            className="leader-advance-nav-row"
            data-testid="deep-analysis-advance-zone"
          >
            {onPreviousSection && (
              <button
                type="button"
                className="section-previous-btn"
                data-testid="previous-section-btn"
                onClick={() => {
                  void onPreviousSection();
                }}
              >
                ← Previous
              </button>
            )}
            {onNextSection && (
              <button
                type="button"
                className="deep-analysis-advance-cta"
                data-testid="deep-analysis-advance-cta"
                onClick={() => {
                  void onNextSection();
                }}
              >
                Continue to Discussion →
              </button>
            )}
          </div>
        ) : (
          <div
            className="locked-advance-bar"
            data-testid="locked-advance-bar"
            data-role="participant"
            role="status"
          >
            <span className="locked-advance-icon" aria-hidden="true">
              ⓘ
            </span>
            <span className="locked-advance-copy">
              The study leader will begin discussion shortly.
            </span>
          </div>
        )}
      </section>
    );
  }

  return (
    <section
      className="section-placeholder"
      data-testid="section-placeholder"
      data-section-number={sectionNumber}
      aria-label={`Section ${sectionNumber} of 6`}
    >
      <SectionProgressHeader
        sectionNumber={sectionNumber}
        isLeader={effectiveIsLeader}
        sessionCode={sessionCode}
        publicUrl={publicUrl}
        onShareQr={onShareQr}
      />
      <p className="section-placeholder-copy">
        This section arrives in a later update.
      </p>
    </section>
  );
}

import { SectionProgressHeader } from '../sections/SectionProgressHeader';

export interface SectionPlaceholderScreenProps {
  /** 0-based `currentSectionIndex` from the live session snapshot. */
  sectionIndex: number;
  /** Whether the current viewer is the Study Leader. */
  isLeader?: boolean;
  /** Active session code used by the QR share sheet. */
  sessionCode?: string;
  /** Optional sanitized public URL origin (e.g. from /api/health). */
  publicUrl?: string | null;
  /** Optional custom share trigger handler (overrides internal share sheet state). */
  onShareQr?: () => void;
}

/**
 * Minimal generic surface for `in_progress` outside Section 1. Future
 * sections (2–5) own their screens; this placeholder only keeps the shared
 * `SECTION {n} OF 5 · {percent}%` progress header truthful.
 */
export function SectionPlaceholderScreen({
  sectionIndex,
  isLeader = false,
  sessionCode,
  publicUrl = null,
  onShareQr,
}: SectionPlaceholderScreenProps) {
  const sectionNumber = Math.min(Math.max(sectionIndex + 1, 1), 5);

  return (
    <section
      className="section-placeholder"
      data-testid="section-placeholder"
      data-section-number={sectionNumber}
      aria-label={`Section ${sectionNumber} of 5`}
    >
      <SectionProgressHeader
        sectionNumber={sectionNumber}
        isLeader={isLeader}
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

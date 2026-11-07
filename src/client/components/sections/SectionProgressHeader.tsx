import { useState } from 'react';
import { resolveJoinUrl } from '../../lib/runtimeUrl';
import { RoomCodeShareSheet } from '../lobby/RoomCodeShareSheet';

export interface SectionProgressHeaderProps {
  /** 1-based study section number (1..6). */
  sectionNumber: number;
  /** Whether the current viewer is the Study Leader. */
  isLeader?: boolean;
  /** Active session code used by the QR share sheet. */
  sessionCode?: string;
  /** Optional sanitized public URL origin (e.g. from /api/health). */
  publicUrl?: string | null;
  /** Optional custom share trigger handler (overrides internal share sheet state). */
  onShareQr?: () => void;
}

const PROGRESS_PERCENTS = [17, 33, 50, 67, 83, 100] as const;

/**
 * Shared `SECTION {n} OF 6 · {percent}%` progress header with the 4px gold
 * progress bar and Study Leader persistent QR share button. Reused by all
 * active study sections; keeps the legacy-stable `section-one-*` class names
 * and test hooks so accepted assertions stay green.
 */
export function SectionProgressHeader({
  sectionNumber,
  isLeader = false,
  sessionCode,
  publicUrl = null,
  onShareQr,
}: SectionProgressHeaderProps) {
  const percent =
    PROGRESS_PERCENTS[Math.min(Math.max(sectionNumber - 1, 0), 5)];
  const [shareOpen, setShareOpen] = useState(false);
  const showShare = Boolean(isLeader || onShareQr);

  const handleShare = () => {
    if (onShareQr) {
      onShareQr();
    } else {
      setShareOpen(true);
    }
  };

  let join: ReturnType<typeof resolveJoinUrl> | null = null;
  if (sessionCode) {
    try {
      join = resolveJoinUrl(sessionCode, { publicUrl });
    } catch {
      join = null;
    }
  }

  return (
    <>
      <div className="section-one-header">
        <span className="section-one-label" data-testid="section-one-label">
          SECTION {sectionNumber} OF 6
        </span>
        <div className="section-header-actions">
          {showShare && (
            <button
              type="button"
              className="section-share-qr-trigger"
              data-testid="section-share-qr-trigger"
              onClick={handleShare}
            >
              Share QR
            </button>
          )}
          <span className="section-one-percent" data-testid="section-one-percent">
            {percent}%
          </span>
        </div>
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

      {sessionCode && join && (
        <RoomCodeShareSheet
          open={Boolean(showShare && shareOpen)}
          sessionCode={sessionCode}
          joinUrl={join.url}
          isLocalOnly={join.isLocalOnly}
          usedPublicUrl={join.usedPublicUrl}
          onClose={() => setShareOpen(false)}
        />
      )}
    </>
  );
}

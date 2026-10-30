import { motion } from 'motion/react';
import { useState } from 'react';
import type { SessionStudySummary } from '../../../shared/session';
import { resolveJoinUrl } from '../../lib/runtimeUrl';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';
import { RoomCodeShareSheet } from './RoomCodeShareSheet';

export interface TitleLobbyScreenProps {
  mode: 'leader' | 'participant';
  /** Sanitized study summary from `/ws` snapshots (`load_study`); null-safe. */
  study: SessionStudySummary | null;
  /** Connected `Participant` count (domain "Attendee"); leader excluded. */
  attendeeCount: number;
  sessionCode: string;
  /** True while the `Start Study` leader command is in flight. */
  isStarting?: boolean;
  /** Sanitized `PUBLIC_URL` origin from `GET /api/health` (null when unset). */
  publicUrl?: string | null;
  onStartStudy?: () => void;
}

function triggerTactileHaptic(reducedMotion: boolean): void {
  if (reducedMotion || typeof navigator === 'undefined') {
    return;
  }
  if (typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(12);
    } catch {
      // Ignore unsupported or restricted vibration calls.
    }
  }
}

/**
 * Title Lobby (`ux/3. Title - Leader.png`) for `lobby` session status: both
 * roles see the liturgical eyebrow, Playfair study title, Gospel-only
 * citation line, and the live ATTENDEES / sections / duration metrics card.
 * The Study Leader additionally gets the QR / Room Code share sheet trigger
 * and the exclusive `Start Study` CTA; Participants get a waiting pill and
 * never a `Start Study` control.
 */
export function TitleLobbyScreen({
  mode,
  study,
  attendeeCount,
  sessionCode,
  isStarting = false,
  publicUrl = null,
  onStartStudy,
}: TitleLobbyScreenProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [shareOpen, setShareOpen] = useState(false);
  const isLeader = mode === 'leader';

  const join = resolveJoinUrl(sessionCode, { publicUrl });
  const citationLine = study
    ? study.gospelSummaryLabel || study.gospelCitation
    : null;

  return (
    <section
      className="title-lobby"
      data-testid="title-lobby"
      data-mode={mode}
      aria-label="Title Lobby"
    >
      <div className="title-lobby-badges">
        <span
          className="title-lobby-role-badge"
          data-role={isLeader ? 'leader' : 'participant'}
        >
          {isLeader ? 'LEADER' : 'PARTICIPANT'}
        </span>
        <span className="title-lobby-live-pill">
          <span className="title-lobby-live-dot" aria-hidden="true" />
          LIVE
        </span>
      </div>

      <div className="title-lobby-chip" data-testid="title-lobby-chip">
        YA BIBLE STUDY · LIVE SESSION
      </div>

      {study ? (
        <>
          <span className="title-lobby-eyebrow" data-testid="title-lobby-eyebrow">
            {study.liturgicalEyebrow}
          </span>

          <h2 className="title-lobby-title" data-testid="title-lobby-title">
            {study.title}
          </h2>

          <p
            className="title-lobby-citation"
            data-testid="title-lobby-citation"
          >
            {citationLine}
          </p>

          <div className="title-lobby-metrics" data-testid="title-lobby-metrics">
            <div className="title-lobby-metric">
              <span
                className="title-lobby-metric-value"
                data-testid="title-lobby-attendee-count"
              >
                {attendeeCount}
              </span>
              <span className="title-lobby-metric-label">ATTENDEES</span>
            </div>
            <div className="title-lobby-metric">
              <span
                className="title-lobby-metric-value"
                data-testid="title-lobby-section-count"
              >
                {study.sectionCount}
              </span>
              <span className="title-lobby-metric-label">SECTIONS</span>
            </div>
            <div className="title-lobby-metric">
              <span
                className="title-lobby-metric-value"
                data-testid="title-lobby-duration"
              >
                {study.estimatedMinutes}m
              </span>
              <span className="title-lobby-metric-label">DURATION</span>
            </div>
          </div>
        </>
      ) : (
        <p
          className="title-lobby-study-fallback"
          data-testid="title-lobby-study-fallback"
        >
          Study not loaded yet
        </p>
      )}

      {isLeader ? (
        <div className="lobby-actions">
          <motion.button
            type="button"
            className="lobby-share-trigger"
            data-testid="lobby-share-trigger"
            whileTap={reducedMotion ? undefined : { scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 420, damping: 26 }}
            onClick={() => {
              triggerTactileHaptic(reducedMotion);
              setShareOpen(true);
            }}
          >
            Room Code / QR
          </motion.button>

          <motion.button
            type="button"
            className="lobby-start-study"
            data-testid="lobby-start-study"
            disabled={isStarting}
            whileTap={reducedMotion || isStarting ? undefined : { scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 420, damping: 26 }}
            onClick={() => {
              triggerTactileHaptic(reducedMotion);
              onStartStudy?.();
            }}
          >
            {isStarting ? 'Starting…' : 'Start Study →'}
          </motion.button>
        </div>
      ) : (
        <p
          className="title-lobby-waiting-pill"
          data-testid="title-lobby-waiting-pill"
        >
          The Study Leader will begin shortly…
        </p>
      )}

      <RoomCodeShareSheet
        open={isLeader && shareOpen}
        sessionCode={sessionCode}
        joinUrl={join.url}
        isLocalOnly={join.isLocalOnly}
        usedPublicUrl={join.usedPublicUrl}
        onClose={() => setShareOpen(false)}
      />
    </section>
  );
}

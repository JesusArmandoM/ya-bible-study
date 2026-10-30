import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import type { AvatarPalette } from '../../../shared/session';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';

export interface RaisedHandRowData {
  memberId: string;
  raisedAt: string;
  displayName: string;
  initials: string;
  avatarPalette: AvatarPalette;
}

export interface RaisedHandsQueueProps {
  /** Rows in raise order (server-authoritative queue order). */
  rows: RaisedHandRowData[];
  /** Study Leader: lower one member's hand (`clear_hands` + target). */
  onLowerHand: (targetMemberId: string) => void;
  /** Study Leader: lower every raised hand (`clear_hands`). */
  onClearAll: () => void;
}

/** `0 hands raised` / `1 hand raised` / `N hands raised` queue header copy. */
export function formatHandsRaisedCount(count: number): string {
  return `${count} ${count === 1 ? 'hand' : 'hands'} raised`;
}

/**
 * `Raised {s}s|{m}m|{h}h ago` relative label from a server-clock ISO timestamp.
 * Clock-skew negatives and sub-second deltas clamp to `Raised just now`.
 */
export function formatRaisedAtRelative(
  raisedAtIso: string,
  nowMs: number = Date.now(),
): string {
  const raisedMs = Date.parse(raisedAtIso);
  if (!Number.isFinite(raisedMs)) {
    return 'Raised just now';
  }
  const deltaMs = nowMs - raisedMs;
  if (deltaMs < 1000) {
    return 'Raised just now';
  }
  const seconds = Math.floor(deltaMs / 1000);
  if (seconds < 60) {
    return `Raised ${seconds}s ago`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `Raised ${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  return `Raised ${hours}h ago`;
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
 * Study Leader live prayer queue (`ux/4`, minus the follow-up features'
 * `Choose` pills and `Pick Randomly` CTA). Rows enter/exit with
 * `AnimatePresence` + `layout` springs (instant under reduced motion);
 * avatar initials are flex-centered per DESIGN override #4.
 */
export function RaisedHandsQueue({
  rows,
  onLowerHand,
  onClearAll,
}: RaisedHandsQueueProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Coarse refresh so relative labels keep ticking without re-render churn.
  useEffect(() => {
    const intervalId = setInterval(() => {
      setNowMs(Date.now());
    }, 5000);
    return () => {
      clearInterval(intervalId);
    };
  }, []);

  return (
    <section
      className="prayer-queue-card"
      aria-label="Raised hands queue"
    >
      <div className="prayer-queue-header">
        <span className="prayer-queue-count" data-testid="prayer-queue-count">
          {formatHandsRaisedCount(rows.length)}
        </span>
        <button
          type="button"
          className="prayer-queue-clear-all"
          data-testid="prayer-queue-clear-all"
          aria-label="Lower all hands"
          onClick={() => {
            triggerTactileHaptic(reducedMotion);
            onClearAll();
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M10 3v10m0 0 4-4m-4 4-4-4M4 17h12"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="prayer-queue-empty" data-testid="prayer-queue-empty">
          No hands raised yet
        </p>
      ) : (
        <ul className="prayer-queue-list" aria-live="polite">
          <AnimatePresence initial={false}>
            {rows.map((row) => (
              <motion.li
                key={row.memberId}
                layout
                className="prayer-queue-row"
                data-testid="prayer-queue-row"
                data-member-id={row.memberId}
                initial={reducedMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={
                  reducedMotion
                    ? { opacity: 0, transition: { duration: 0 } }
                    : { opacity: 0, scale: 0.96 }
                }
                transition={{ type: 'spring', stiffness: 420, damping: 26 }}
              >
                <span
                  className={`prayer-queue-avatar prayer-queue-avatar-${row.avatarPalette}`}
                  aria-hidden="true"
                >
                  {row.initials}
                </span>
                <span className="prayer-queue-info">
                  <span className="prayer-queue-name">{row.displayName}</span>
                  <span
                    className="prayer-queue-time"
                    data-testid="prayer-queue-row-time"
                  >
                    {formatRaisedAtRelative(row.raisedAt, nowMs)}
                  </span>
                </span>
                <button
                  type="button"
                  className="prayer-queue-lower"
                  data-testid="prayer-queue-row-lower"
                  aria-label={`Lower ${row.displayName}'s hand`}
                  onClick={() => {
                    triggerTactileHaptic(reducedMotion);
                    onLowerHand(row.memberId);
                  }}
                >
                  Lower
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}

import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import type {
  AvatarPalette,
  MemberConnectionStatus,
} from '../../../shared/session';
import { remainingCountdownSeconds } from '../../../shared/session';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';
import { triggerTactileHaptic } from '../prayer/RaisedHandsQueue';

export interface RandomCandidateData {
  displayName: string;
  initials: string;
  avatarPalette: AvatarPalette;
  connectionStatus: MemberConnectionStatus;
}

export interface RandomPickButtonProps {
  /** Study Leader: stage a random candidate (`pick_random`). */
  onPickRandomly: () => void;
  /** Disabled with the `random-empty-note` when zero Participants are connected. */
  connectedParticipantCount: number;
}

export interface RandomSelectionPanelProps {
  candidate: RandomCandidateData;
  /** Absolute server-clock countdown expiry (display-only). */
  candidateExpiresAt: string;
  /** Completion copy line — Section 1: "has been randomly chosen to pray." */
  chosenLine: string;
  /** Study Leader sees `Retry` / `Confirm selection`; Participants never do. */
  isLeader: boolean;
  onRetryRandom?: () => void;
  onConfirmRandom?: () => void;
}

/** DESIGN.md Motion: `springMorph` (280/28) for the panel enter/exit. */
function morphTransition(reducedMotion: boolean) {
  return reducedMotion
    ? { duration: 0 }
    : ({ type: 'spring', stiffness: 280, damping: 28 } as const);
}

/** DESIGN.md Motion: tap compression (`scale: 0.96`, 420/26). */
function tapTransition() {
  return { type: 'spring', stiffness: 420, damping: 26 } as const;
}

/** `0:{ss}` countdown label from the clamped remaining seconds. */
export function formatCountdownLabel(seconds: number): string {
  const clamped = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  return `0:${String(clamped).padStart(2, '0')}`;
}

function DiceIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 22 22"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="3"
        y="3"
        width="16"
        height="16"
        rx="4.5"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="7.5" cy="7.5" r="1.35" fill="currentColor" />
      <circle cx="14.5" cy="7.5" r="1.35" fill="currentColor" />
      <circle cx="11" cy="11" r="1.35" fill="currentColor" />
      <circle cx="7.5" cy="14.5" r="1.35" fill="currentColor" />
      <circle cx="14.5" cy="14.5" r="1.35" fill="currentColor" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M10 2.5a4.5 4.5 0 0 0-4.5 4.5v3l-1.4 2.6a.8.8 0 0 0 .7 1.2h10.4a.8.8 0 0 0 .7-1.2L14.5 10V7A4.5 4.5 0 0 0 10 2.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M8 15.5a2 2 0 0 0 4 0"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M15 9a6 6 0 1 1-1.8-4.3M15 2.5V6h-3.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Study Leader violet `Pick Randomly` dice pill (`ux/4`), rendered under the
 * raised-hands queue. Disabled with a clear note while zero Participants are
 * connected (the server still rejects the command).
 */
export function RandomPickButton({
  onPickRandomly,
  connectedParticipantCount,
}: RandomPickButtonProps) {
  const reducedMotion = usePrefersReducedMotion();
  const disabled = connectedParticipantCount === 0;

  return (
    <div className="random-pick-wrap">
      <motion.button
        type="button"
        className="random-pick-button"
        data-testid="random-pick-button"
        disabled={disabled}
        whileTap={reducedMotion || disabled ? undefined : { scale: 0.96 }}
        transition={tapTransition()}
        onClick={() => {
          triggerTactileHaptic(reducedMotion);
          onPickRandomly();
        }}
      >
        <DiceIcon />
        <span>Pick Randomly</span>
      </motion.button>
      {disabled && (
        <p className="random-empty-note" data-testid="random-empty-note" role="status">
          No Participants are connected yet — the random picker needs at least
          one Participant.
        </p>
      )}
    </div>
  );
}

/**
 * `ux/9` Random Selection panel: `RANDOM SELECTION` pill, candidate avatar +
 * Playfair name with the section completion line, terracotta "Notification
 * sent" card with the live server-authoritative `0:{ss}` countdown, and the
 * leader-only `Retry` / `Confirm selection` controls. Participants never see
 * those three leader strings — the countdown is rendered, never trusted.
 */
export function RandomSelectionPanel({
  candidate,
  candidateExpiresAt,
  chosenLine,
  isLeader,
  onRetryRandom,
  onConfirmRandom,
}: RandomSelectionPanelProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // 1s display tick derived from the absolute server-clock expiry.
  useEffect(() => {
    const intervalId = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => {
      clearInterval(intervalId);
    };
  }, []);

  const seconds = remainingCountdownSeconds(candidateExpiresAt, nowMs);

  return (
    <motion.section
      className="random-selection-panel"
      data-testid="random-selection-panel"
      aria-label="Random selection"
      initial={reducedMotion ? false : { opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={
        reducedMotion
          ? { opacity: 0, transition: { duration: 0 } }
          : { opacity: 0, y: -8, scale: 0.98 }
      }
      transition={morphTransition(reducedMotion)}
    >
      <span className="random-selection-pill" data-testid="random-selection-pill">
        RANDOM SELECTION
      </span>

      <div className="random-candidate-row">
        <span
          className={`random-candidate-avatar random-candidate-avatar-${candidate.avatarPalette}`}
          aria-hidden="true"
        >
          {candidate.initials}
        </span>
        <p className="random-candidate-line">
          <span className="random-candidate-name" data-testid="random-candidate-name">
            {candidate.displayName}
          </span>
          {` ${chosenLine}`}
          {candidate.connectionStatus === 'disconnected' && (
            <span
              className="random-candidate-status"
              data-testid="random-candidate-status"
            >
              {' · reconnecting'}
            </span>
          )}
        </p>
      </div>

      <div
        className="random-notification-card"
        data-testid="random-notification-card"
      >
        <span className="random-notification-icon" aria-hidden="true">
          <BellIcon />
        </span>
        <div className="random-notification-info">
          <span
            className="random-notification-title"
            data-testid="random-notification-title"
          >
            Notification sent
          </span>
          <span
            className="random-notification-copy"
            data-testid="random-notification-copy"
          >
            {`${candidate.displayName} has 30 seconds to accept.`}
          </span>
        </div>
        <span
          className="random-countdown"
          data-testid="random-countdown"
          role="timer"
          aria-live="polite"
          aria-label={`${seconds} seconds remaining`}
        >
          {formatCountdownLabel(seconds)}
        </span>
      </div>

      {isLeader && (
        <div className="random-actions">
          <motion.button
            type="button"
            className="random-retry-button"
            data-testid="random-retry-button"
            whileTap={reducedMotion ? undefined : { scale: 0.96 }}
            transition={tapTransition()}
            onClick={() => {
              triggerTactileHaptic(reducedMotion);
              onRetryRandom?.();
            }}
          >
            <RefreshIcon />
            <span>Retry</span>
          </motion.button>
          <motion.button
            type="button"
            className="random-confirm-button"
            data-testid="random-confirm-button"
            whileTap={reducedMotion ? undefined : { scale: 0.96 }}
            transition={tapTransition()}
            onClick={() => {
              triggerTactileHaptic(reducedMotion);
              onConfirmRandom?.();
            }}
          >
            Confirm selection
          </motion.button>
        </div>
      )}
    </motion.section>
  );
}

import { motion } from 'motion/react';
import type { PublicSessionMember } from '../../../shared/session';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';
import { triggerTactileHaptic } from '../prayer/RaisedHandsQueue';

export interface LeaderReaderCardProps {
  raisedCount: number;
  totalParticipants: number;
  selectedMember: PublicSessionMember | null;
  firstRaisedMemberId?: string | null;
  onChooseVolunteer?: (memberId: string) => void | Promise<void>;
  onPickRandomly?: () => void | Promise<void>;
  localLiturgicalNote?: string | null;
  disabled?: boolean;
}

function DiceIcon() {
  return (
    <svg
      width="18"
      height="18"
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

/**
 * Study Leader reader selection card matching `ux/7. Reading - Leader.png`.
 * Shows volunteered reader counter, `Choose reader` action, violet `Random` button,
 * and facilitator-only liturgical background note (kept strictly local to Leader).
 */
export function LeaderReaderCard({
  raisedCount,
  totalParticipants,
  selectedMember,
  firstRaisedMemberId,
  onChooseVolunteer,
  onPickRandomly,
  localLiturgicalNote,
  disabled = false,
}: LeaderReaderCardProps) {
  const reducedMotion = usePrefersReducedMotion();

  const handleChooseReader = () => {
    if (disabled || !onChooseVolunteer) {
      return;
    }
    triggerTactileHaptic(reducedMotion);
    if (firstRaisedMemberId) {
      void onChooseVolunteer(firstRaisedMemberId);
    }
  };

  const handlePickRandomly = () => {
    if (disabled || !onPickRandomly) {
      return;
    }
    triggerTactileHaptic(reducedMotion);
    void onPickRandomly();
  };

  return (
    <div className="leader-reader-card" data-testid="leader-reader-card">
      <header className="leader-reader-card-header">
        <div className="leader-reader-title-group">
          <span className="leader-reader-eyebrow">READER</span>
          <h4 className="leader-reader-prompt">Who will proclaim the Word?</h4>
        </div>
        <div
          className="leader-reader-count-chip"
          data-testid="reader-count-chip"
          aria-label={`${raisedCount} of ${totalParticipants} participants volunteered`}
        >
          {raisedCount} / {totalParticipants}
        </div>
      </header>

      {selectedMember ? (
        <div
          className="leader-reader-chosen-banner"
          data-testid="leader-reader-chosen-banner"
        >
          <span className="leader-reader-chosen-label">Reader chosen:</span>{' '}
          <strong className="leader-reader-chosen-name">
            {selectedMember.displayName}
          </strong>
        </div>
      ) : (
        <div className="leader-reader-actions">
          <motion.button
            type="button"
            className="choose-reader-button"
            data-testid="choose-reader-button"
            disabled={disabled || !firstRaisedMemberId}
            whileTap={
              reducedMotion || !firstRaisedMemberId ? undefined : { scale: 0.96 }
            }
            transition={{ type: 'spring', stiffness: 420, damping: 26 }}
            onClick={handleChooseReader}
          >
            Choose reader
          </motion.button>

          {onPickRandomly && (
            <motion.button
              type="button"
              className="reader-random-button"
              data-testid="random-picker-button"
              disabled={disabled || totalParticipants === 0}
              whileTap={
                reducedMotion || totalParticipants === 0
                  ? undefined
                  : { scale: 0.96 }
              }
              transition={{ type: 'spring', stiffness: 420, damping: 26 }}
              onClick={handlePickRandomly}
            >
              <DiceIcon />
              <span>Random</span>
            </motion.button>
          )}
        </div>
      )}

      {localLiturgicalNote && (
        <div
          className="leader-liturgical-note"
          data-testid="leader-liturgical-context-note"
        >
          <div className="leader-liturgical-note-title">
            Liturgical Context (Facilitator Reference)
          </div>
          <p className="leader-liturgical-note-body">{localLiturgicalNote}</p>
        </div>
      )}
    </div>
  );
}

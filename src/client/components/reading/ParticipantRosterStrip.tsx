import { motion } from 'motion/react';
import type { PublicSessionMember } from '../../../shared/session';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';
import { triggerTactileHaptic } from '../prayer/RaisedHandsQueue';

export interface ParticipantRosterStripProps {
  participants: PublicSessionMember[];
  raisedMemberIds: Set<string>;
  selectedMemberId: string | null;
  onChooseVolunteer?: (memberId: string) => void | Promise<void>;
  disabled?: boolean;
}

/**
 * Avatar roster strip for Section 3 (`ux/7. Reading - Leader.png`).
 * Displays connected participants with cleanly centered 2-letter initials (override #4).
 * Clicking an avatar directly selects that participant as the reader via `choose_volunteer`.
 */
export function ParticipantRosterStrip({
  participants,
  raisedMemberIds,
  selectedMemberId,
  onChooseVolunteer,
  disabled = false,
}: ParticipantRosterStripProps) {
  const reducedMotion = usePrefersReducedMotion();

  if (participants.length === 0) {
    return (
      <div
        className="participant-roster-empty"
        data-testid="participant-roster-empty"
      >
        Waiting for participants to join…
      </div>
    );
  }

  return (
    <div
      className="participant-roster-strip"
      data-testid="participant-roster-strip"
      role="group"
      aria-label="Connected participants roster"
    >
      <div className="participant-roster-scroll">
        {participants.map((member) => {
          const isRaised = raisedMemberIds.has(member.memberId);
          const isSelected = selectedMemberId === member.memberId;
          const isClickable = Boolean(onChooseVolunteer) && !disabled;

          return (
            <motion.button
              key={member.memberId}
              type="button"
              className={`roster-avatar-button ${isSelected ? 'is-selected' : ''} ${isRaised ? 'is-raised' : ''}`}
              data-testid={`roster-avatar-${member.memberId}`}
              data-member-id={member.memberId}
              data-raised={isRaised ? 'true' : 'false'}
              data-selected={isSelected ? 'true' : 'false'}
              aria-label={`${member.displayName}${isRaised ? ' (volunteered)' : ''}${isSelected ? ' (chosen reader)' : ''}`}
              disabled={!isClickable}
              whileTap={reducedMotion || !isClickable ? undefined : { scale: 0.94 }}
              transition={{ type: 'spring', stiffness: 420, damping: 26 }}
              onClick={() => {
                if (isClickable && onChooseVolunteer) {
                  triggerTactileHaptic(reducedMotion);
                  void onChooseVolunteer(member.memberId);
                }
              }}
            >
              <div
                className={`roster-avatar-circle roster-avatar-${member.avatarPalette}`}
              >
                <span className="roster-avatar-initials">{member.initials}</span>
              </div>
              <span className="roster-avatar-name">{member.displayName}</span>
              {isRaised && (
                <span
                  className="roster-avatar-badge"
                  aria-hidden="true"
                  title="Volunteered to read"
                >
                  ✋
                </span>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

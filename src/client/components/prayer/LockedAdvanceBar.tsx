import type { SanctuaryRole } from '../../../shared/health';

export interface LockedAdvanceBarProps {
  role: SanctuaryRole;
}

/**
 * Anchored bottom locked/info pill for Section 1. Never renders an advance
 * CTA — the leader's gold unlock morph arrives with the chosen-volunteer
 * Done-gate follow-up feature.
 */
export function LockedAdvanceBar({ role }: LockedAdvanceBarProps) {
  const isLeader = role === 'Study Leader';

  return (
    <div
      className="locked-advance-bar"
      data-testid="locked-advance-bar"
      data-role={isLeader ? 'leader' : 'participant'}
      role="status"
    >
      <span className="locked-advance-icon" aria-hidden="true">
        {isLeader ? '🔒' : 'ⓘ'}
      </span>
      <span className="locked-advance-copy">
        {isLeader
          ? 'Waiting for volunteer to advance'
          : 'Only the leader decides when to advance'}
      </span>
    </div>
  );
}

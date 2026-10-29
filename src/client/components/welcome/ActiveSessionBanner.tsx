import { motion } from 'motion/react';
import type { SanctuaryRole } from '../../../shared/health';
import type { PublicLiveSessionSnapshot } from '../../../shared/session';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';

export interface ActiveSessionBannerProps {
  session: PublicLiveSessionSnapshot;
  role: SanctuaryRole | null;
  leaderPin: string | null;
  onLeave: () => void;
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

export function ActiveSessionBanner({
  session,
  role,
  leaderPin,
  onLeave,
}: ActiveSessionBannerProps) {
  const reducedMotion = usePrefersReducedMotion();

  const handleLeave = () => {
    triggerTactileHaptic(reducedMotion);
    onLeave();
  };

  const isLeader = role === 'Study Leader';

  return (
    <div
      className="active-session-card"
      data-testid="active-session-banner"
      aria-label="Active Bible Study Session"
    >
      <div className="active-session-header">
        <div className="active-session-live-badge">
          <span className="active-session-live-dot" aria-hidden="true" />
          <span>LIVE ROOM</span>
        </div>

        <span
          className="active-session-role-badge"
          data-role={isLeader ? 'leader' : 'participant'}
          data-testid="active-user-role"
        >
          {role ?? 'Participant'}
        </span>
      </div>

      <div className="active-session-body">
        <div className="active-session-code-container">
          <span className="active-session-code-label">Room Code</span>
          <span
            className="active-session-code-value"
            data-testid="active-session-code"
          >
            {session.sessionCode}
          </span>
        </div>

        {isLeader && leaderPin && (
          <div className="active-session-pin-container" data-testid="active-leader-pin-box">
            <div className="active-session-pin-row">
              <span className="active-session-pin-label">Leader PIN</span>
              <span
                className="active-session-pin-value"
                data-testid="active-leader-pin"
              >
                {leaderPin}
              </span>
            </div>
            <p className="active-session-pin-hint">
              Keep this 4-digit PIN safe to reclaim leadership if you switch devices.
            </p>
          </div>
        )}

        <div className="active-session-meta">
          <span
            className="active-session-count"
            data-testid="active-connected-count"
          >
            {session.connectedMemberCount}{' '}
            {session.connectedMemberCount === 1 ? 'member' : 'members'} connected
          </span>
        </div>
      </div>

      <div className="active-session-actions">
        <motion.button
          type="button"
          className="active-session-leave-btn"
          data-testid="active-session-leave-btn"
          whileTap={reducedMotion ? undefined : { scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 420, damping: 26 }}
          onClick={handleLeave}
        >
          Leave Session
        </motion.button>
      </div>
    </div>
  );
}

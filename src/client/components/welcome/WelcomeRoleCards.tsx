import { motion } from 'motion/react';
import type { SanctuaryRole } from '../../../shared/health';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';

export interface WelcomeRoleCardsProps {
  onSelectRole: (role: SanctuaryRole) => void;
  onSelectDualMode?: () => void;
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

function CrownIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M4 18H20V20H4V18ZM4.5 15L2 6L7.5 10L12 4L16.5 10L22 6L19.5 15H4.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function GroupIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M16 11C17.66 11 18.99 9.66 18.99 8C18.99 6.34 17.66 5 16 5C14.34 5 13 6.34 13 8C13 9.66 14.34 11 16 11ZM8 11C9.66 11 10.99 9.66 10.99 8C10.99 6.34 9.66 5 8 5C6.34 5 5 6.34 5 8C5 9.66 6.34 11 8 11ZM8 13C5.67 13 1 14.17 1 16.5V19H15V16.5C15 14.17 10.33 13 8 13ZM16 13C15.71 13 15.38 13.02 15.03 13.05C16.19 13.89 17 15.02 17 16.5V19H23V16.5C23 14.17 18.33 13 16 13Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export function WelcomeRoleCards({
  onSelectRole,
  onSelectDualMode,
}: WelcomeRoleCardsProps) {
  const reducedMotion = usePrefersReducedMotion();

  const handleSelect = (role: SanctuaryRole) => {
    triggerTactileHaptic(reducedMotion);
    onSelectRole(role);
  };

  return (
    <div className="welcome-role-section" data-testid="welcome-role-section">
      <div className="welcome-role-eyebrow">CHOOSE YOUR ROLE</div>

      <div
        className="welcome-role-cards"
        role="group"
        aria-label="Choose your role in the Bible study"
      >
        <motion.button
          type="button"
          className="welcome-role-card"
          data-role="leader"
          data-testid="welcome-role-leader"
          whileTap={reducedMotion ? undefined : { scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 420, damping: 26 }}
          onClick={() => handleSelect('Study Leader')}
        >
          <div className="welcome-role-icon welcome-role-icon-leader" aria-hidden="true">
            <CrownIcon />
          </div>

          <div className="welcome-role-info">
            <h3 className="welcome-role-title">Study Leader</h3>
            <p className="welcome-role-desc">Lead the session with full control</p>
          </div>

          <div className="welcome-role-chevron" aria-hidden="true">
            <ChevronRightIcon />
          </div>
        </motion.button>

        <motion.button
          type="button"
          className="welcome-role-card"
          data-role="participant"
          data-testid="welcome-role-participant"
          whileTap={reducedMotion ? undefined : { scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 420, damping: 26 }}
          onClick={() => handleSelect('Participant')}
        >
          <div className="welcome-role-icon welcome-role-icon-participant" aria-hidden="true">
            <GroupIcon />
          </div>

          <div className="welcome-role-info">
            <h3 className="welcome-role-title">Participant</h3>
            <p className="welcome-role-desc">Participate, pray, and raise your hand</p>
          </div>

          <div className="welcome-role-chevron" aria-hidden="true">
            <ChevronRightIcon />
          </div>
        </motion.button>
      </div>

      {onSelectDualMode && (
        <div className="welcome-dual-mode-section">
          <motion.button
            type="button"
            className="welcome-dual-mode-btn"
            data-testid="welcome-dual-mode-btn"
            whileTap={reducedMotion ? undefined : { scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 420, damping: 26 }}
            onClick={() => {
              triggerTactileHaptic(reducedMotion);
              onSelectDualMode();
            }}
          >
            <span className="welcome-dual-mode-icon" aria-hidden="true">
              🖥️
            </span>
            <div className="welcome-dual-mode-info">
              <span className="welcome-dual-mode-title">
                Dual Side-by-Side Mode
              </span>
              <span className="welcome-dual-mode-subtitle">
                Rehearse Study Leader & Participant on desktop
              </span>
            </div>
            <span className="welcome-dual-mode-badge">Desktop</span>
          </motion.button>
        </div>
      )}
    </div>
  );
}

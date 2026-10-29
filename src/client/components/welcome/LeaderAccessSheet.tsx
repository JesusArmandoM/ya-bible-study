import { motion } from 'motion/react';
import { useState } from 'react';
import {
  isValidLeaderPin,
  isValidSessionCode,
  normalizeDisplayName,
  normalizeLeaderPin,
  normalizeSessionCode,
} from '../../../shared/session';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';

export interface LeaderAccessSheetProps {
  isSubmitting: boolean;
  errorMessage: string | null;
  onCreateRoom: (displayName: string) => Promise<unknown>;
  onClaimLeadership: (
    sessionCode: string,
    leaderPin: string,
    displayName?: string,
  ) => Promise<unknown>;
  onBack: () => void;
  onClearError: () => void;
}

type LeaderAccessMode = 'create' | 'claim';

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

export function LeaderAccessSheet({
  isSubmitting,
  errorMessage,
  onCreateRoom,
  onClaimLeadership,
  onBack,
  onClearError,
}: LeaderAccessSheetProps) {
  const [mode, setMode] = useState<LeaderAccessMode>('create');
  const [displayName, setDisplayName] = useState('');
  const [sessionCode, setSessionCode] = useState('');
  const [leaderPin, setLeaderPin] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const reducedMotion = usePrefersReducedMotion();

  const handleModeChange = (newMode: LeaderAccessMode) => {
    triggerTactileHaptic(reducedMotion);
    setMode(newMode);
    setValidationError(null);
    onClearError();
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const name = normalizeDisplayName(displayName) || 'Study Leader';
    try {
      await onCreateRoom(name);
    } catch {
      // Error is captured via errorMessage prop or useLiveSession
    }
  };

  const handleClaimSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const normalizedCode = normalizeSessionCode(sessionCode);
    const normalizedPin = normalizeLeaderPin(leaderPin);

    if (!isValidSessionCode(normalizedCode)) {
      setValidationError('Please enter a valid 6-character room code.');
      return;
    }

    if (!isValidLeaderPin(normalizedPin)) {
      setValidationError('Please enter a valid 4-digit leader PIN.');
      return;
    }

    const name = normalizeDisplayName(displayName) || undefined;
    try {
      await onClaimLeadership(normalizedCode, normalizedPin, name);
    } catch {
      // Error is captured via errorMessage prop or useLiveSession
    }
  };

  const activeError = validationError || errorMessage;

  return (
    <div className="sheet-container" data-testid="leader-access-sheet">
      <div className="sheet-header">
        <button
          type="button"
          className="sheet-back-button"
          onClick={() => {
            triggerTactileHaptic(reducedMotion);
            onBack();
          }}
          aria-label="Back to role selection"
        >
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
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span>Back</span>
        </button>

        <span className="sheet-eyebrow">STUDY LEADER ACCESS</span>
      </div>

      <div className="sheet-segmented-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'create'}
          className="sheet-tab-button"
          data-active={mode === 'create'}
          onClick={() => handleModeChange('create')}
        >
          Create Room
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'claim'}
          className="sheet-tab-button"
          data-active={mode === 'claim'}
          onClick={() => handleModeChange('claim')}
        >
          Claim Room
        </button>
      </div>

      {activeError && (
        <div className="sheet-error-alert" role="alert" aria-live="polite">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{activeError}</span>
        </div>
      )}

      {mode === 'create' ? (
        <form onSubmit={handleCreateSubmit} className="sheet-form">
          <div className="sheet-field">
            <label htmlFor="leader-create-name" className="sheet-label">
              Leader Name <span className="sheet-label-subtle">(optional)</span>
            </label>
            <input
              id="leader-create-name"
              type="text"
              className="sheet-input"
              placeholder="e.g. Claire"
              maxLength={48}
              autoComplete="name"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                if (validationError) setValidationError(null);
              }}
            />
          </div>

          <motion.button
            type="submit"
            className="sheet-primary-cta"
            disabled={isSubmitting}
            whileTap={reducedMotion ? undefined : { scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 420, damping: 26 }}
            onClick={() => triggerTactileHaptic(reducedMotion)}
          >
            {isSubmitting ? 'Creating Room…' : 'Create Room'}
          </motion.button>
        </form>
      ) : (
        <form onSubmit={handleClaimSubmit} className="sheet-form">
          <div className="sheet-field">
            <label htmlFor="leader-claim-code" className="sheet-label">
              Session Code
            </label>
            <input
              id="leader-claim-code"
              type="text"
              className="sheet-input sheet-input-code"
              placeholder="e.g. ABCXYZ"
              maxLength={6}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              value={sessionCode}
              onChange={(e) => {
                setSessionCode(e.target.value.toUpperCase());
                if (validationError) setValidationError(null);
              }}
            />
          </div>

          <div className="sheet-field">
            <label htmlFor="leader-claim-pin" className="sheet-label">
              4-Digit Leader PIN
            </label>
            <input
              id="leader-claim-pin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              className="sheet-input"
              placeholder="4-digit PIN"
              maxLength={4}
              autoComplete="one-time-code"
              value={leaderPin}
              onChange={(e) => {
                setLeaderPin(e.target.value.replace(/\D/g, '').slice(0, 4));
                if (validationError) setValidationError(null);
              }}
            />
          </div>

          <div className="sheet-field">
            <label htmlFor="leader-claim-name" className="sheet-label">
              Your Name <span className="sheet-label-subtle">(optional)</span>
            </label>
            <input
              id="leader-claim-name"
              type="text"
              className="sheet-input"
              placeholder="e.g. Claire"
              maxLength={48}
              autoComplete="name"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                if (validationError) setValidationError(null);
              }}
            />
          </div>

          <motion.button
            type="submit"
            className="sheet-primary-cta"
            disabled={isSubmitting}
            whileTap={reducedMotion ? undefined : { scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 420, damping: 26 }}
            onClick={() => triggerTactileHaptic(reducedMotion)}
          >
            {isSubmitting ? 'Claiming Leadership…' : 'Claim Leadership'}
          </motion.button>
        </form>
      )}
    </div>
  );
}

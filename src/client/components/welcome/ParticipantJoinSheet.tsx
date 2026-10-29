import { motion } from 'motion/react';
import { useState } from 'react';
import {
  isValidDisplayName,
  isValidSessionCode,
  normalizeDisplayName,
  normalizeSessionCode,
} from '../../../shared/session';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';

export interface ParticipantJoinSheetProps {
  initialSessionCode?: string | null;
  isSubmitting: boolean;
  errorMessage: string | null;
  onJoinRoom: (sessionCode: string, displayName: string) => Promise<unknown>;
  onBack: () => void;
  onClearError: () => void;
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

export function ParticipantJoinSheet({
  initialSessionCode,
  isSubmitting,
  errorMessage,
  onJoinRoom,
  onBack,
  onClearError: _onClearError,
}: ParticipantJoinSheetProps) {
  const [sessionCode, setSessionCode] = useState(
    () => initialSessionCode?.toUpperCase() ?? '',
  );
  const [displayName, setDisplayName] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const reducedMotion = usePrefersReducedMotion();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const normalizedCode = normalizeSessionCode(sessionCode);
    const normalizedName = normalizeDisplayName(displayName);

    if (!isValidSessionCode(normalizedCode)) {
      setValidationError('Please enter a valid 6-character room code.');
      return;
    }

    if (!isValidDisplayName(normalizedName)) {
      setValidationError('Please enter your name to join the study.');
      return;
    }

    try {
      await onJoinRoom(normalizedCode, normalizedName);
    } catch {
      // Error is captured via errorMessage prop or useLiveSession
    }
  };

  const activeError = validationError || errorMessage;

  return (
    <div className="sheet-container" data-testid="participant-join-sheet">
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

        <span className="sheet-eyebrow">PARTICIPANT JOIN</span>
      </div>

      <div className="sheet-intro">
        <h3 className="sheet-title">Join Live Study</h3>
        <p className="sheet-desc">
          Enter the room code shared by your Study Leader and your name.
        </p>
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

      <form onSubmit={handleSubmit} className="sheet-form">
        <div className="sheet-field">
          <label htmlFor="participant-code" className="sheet-label">
            Session Code
          </label>
          <input
            id="participant-code"
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
          <label htmlFor="participant-name" className="sheet-label">
            Your Name
          </label>
          <input
            id="participant-name"
            type="text"
            className="sheet-input"
            placeholder="e.g. Daniel"
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
          {isSubmitting ? 'Joining Study…' : 'Join Study'}
        </motion.button>
      </form>
    </div>
  );
}

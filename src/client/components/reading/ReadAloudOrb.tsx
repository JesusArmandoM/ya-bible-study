import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';
import { useSacredStageStore } from '../../state/sacredStageStore';

export interface ReadAloudOrbProps {
  /** Authoritative server state for the current member's own hand. */
  isHandRaised: boolean;
  disabled?: boolean;
  /** Dispatches `raise_hand` / `lower_hand`; may return a promise to await. */
  onToggle: (next: boolean) => void | Promise<void>;
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

function OpenBookIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

/**
 * Luminous concentric sanctuary-indigo (`#6E75F5`) "Read aloud" orb matching
 * `ux/8. Reading` (Participant). Tapping emits a 0ms optimistic ripple +
 * `hand-raise` Sacred3DScene impulse and flips the volunteered state instantly;
 * reconciles with server-authoritative `isHandRaised`.
 */
export function ReadAloudOrb({
  isHandRaised,
  disabled = false,
  onToggle,
}: ReadAloudOrbProps) {
  const reducedMotion = usePrefersReducedMotion();
  const triggerImpulse = useSacredStageStore((s) => s.triggerImpulse);
  const [pendingRaised, setPendingRaised] = useState<boolean | null>(null);
  const [rippleKey, setRippleKey] = useState(0);

  // Reconcile optimistic state with server prop
  useEffect(() => {
    setPendingRaised(null);
  }, [isHandRaised]);

  const effectiveRaised = pendingRaised ?? isHandRaised;
  const isPulsing = effectiveRaised && !reducedMotion;

  const handleToggle = () => {
    if (disabled) {
      return;
    }
    triggerTactileHaptic(reducedMotion);
    triggerImpulse('hand-raise');
    setRippleKey((k) => k + 1);
    const next = !effectiveRaised;
    setPendingRaised(next);
    try {
      const result: unknown = onToggle(next);
      if (result instanceof Promise) {
        void result.catch(() => {
          setPendingRaised(null);
        });
      }
    } catch {
      setPendingRaised(null);
    }
  };

  return (
    <div className="read-aloud-orb-wrapper">
      <motion.button
        type="button"
        className={
          isPulsing
            ? 'read-aloud-orb read-aloud-orb-raised read-aloud-orb-pulsing'
            : effectiveRaised
              ? 'read-aloud-orb read-aloud-orb-raised'
              : 'read-aloud-orb'
        }
        data-testid="read-aloud-orb"
        data-raised={effectiveRaised ? 'true' : 'false'}
        aria-pressed={effectiveRaised}
        aria-label={
          effectiveRaised
            ? 'You volunteered to read aloud'
            : 'Tap to volunteer to read aloud'
        }
        whileTap={reducedMotion ? undefined : { scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 420, damping: 26 }}
        disabled={disabled}
        onClick={handleToggle}
      >
        <span className="read-aloud-orb-ring" aria-hidden="true" />
        <span
          className="read-aloud-orb-ring read-aloud-orb-ring-inner"
          aria-hidden="true"
        />
        <span className="read-aloud-orb-core" aria-hidden="true">
          <OpenBookIcon />
        </span>
        {rippleKey > 0 && (
          <span
            key={rippleKey}
            className="read-aloud-orb-ripple"
            aria-hidden="true"
          />
        )}
      </motion.button>

      <span
        className="read-aloud-orb-caption"
        data-testid="read-aloud-orb-caption"
      >
        {effectiveRaised
          ? 'You volunteered to read aloud'
          : 'Tap to volunteer to read aloud'}
      </span>
    </div>
  );
}

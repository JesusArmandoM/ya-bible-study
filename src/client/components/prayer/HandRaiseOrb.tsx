import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';
import { useSacredStageStore } from '../../state/sacredStageStore';

export interface HandRaiseOrbProps {
  /** Authoritative server state for the current member's own hand. */
  isRaised: boolean;
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

/**
 * Luminous concentric violet `Raise Hand` toggle orb (`ux/5`). Tapping emits a
 * 0ms optimistic ripple + `hand-raise` Sacred3DScene impulse and flips the
 * raised state instantly; the optimistic state reconciles with the
 * server-authoritative `isRaised` prop and unwinds on dispatch failure.
 * The pulsing raised aura is disabled under `prefers-reduced-motion`.
 */
export function HandRaiseOrb({
  isRaised,
  disabled = false,
  onToggle,
}: HandRaiseOrbProps) {
  const reducedMotion = usePrefersReducedMotion();
  const triggerImpulse = useSacredStageStore((s) => s.triggerImpulse);
  const [pendingRaised, setPendingRaised] = useState<boolean | null>(null);
  const [rippleKey, setRippleKey] = useState(0);

  // Reconcile the optimistic toggle as soon as the authoritative state lands.
  useEffect(() => {
    setPendingRaised(null);
  }, [isRaised]);

  const effectiveRaised = pendingRaised ?? isRaised;
  const isPulsing = effectiveRaised && !reducedMotion;

  const handleToggle = () => {
    if (disabled) {
      return;
    }
    triggerTactileHaptic(reducedMotion);
    triggerImpulse('hand-raise');
    setRippleKey((key) => key + 1);
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
    <motion.button
      type="button"
      className={
        isPulsing
          ? 'hand-raise-orb hand-raise-orb-raised hand-raise-orb-pulsing'
          : effectiveRaised
            ? 'hand-raise-orb hand-raise-orb-raised'
            : 'hand-raise-orb'
      }
      data-testid="hand-raise-orb"
      data-raised={effectiveRaised ? 'true' : 'false'}
      aria-pressed={effectiveRaised}
      aria-label={effectiveRaised ? 'Hand Raised' : 'Raise Hand'}
      whileTap={reducedMotion ? undefined : { scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 420, damping: 26 }}
      disabled={disabled}
      onClick={handleToggle}
    >
      <span className="hand-raise-orb-ring" aria-hidden="true" />
      <span className="hand-raise-orb-ring hand-raise-orb-ring-inner" aria-hidden="true" />
      <span className="hand-raise-orb-core" aria-hidden="true" />
      {rippleKey > 0 && (
        <span
          key={rippleKey}
          className="hand-raise-orb-ripple"
          aria-hidden="true"
        />
      )}
      <span className="hand-raise-orb-label">
        {effectiveRaised ? 'Hand Raised' : 'Raise Hand'}
      </span>
      {effectiveRaised && (
        <span className="hand-raise-orb-sublabel">Tap again to lower</span>
      )}
    </motion.button>
  );
}

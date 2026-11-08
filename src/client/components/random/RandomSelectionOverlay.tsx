import { useEffect, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';
import {
  useSacredStageStore,
  type SacredStageStore,
} from '../../state/sacredStageStore';

export interface RandomSelectionOverlayProps {
  children?: ReactNode;
  className?: string;
  stageStore?: SacredStageStore;
}

export function RandomSelectionOverlay({
  children,
  className = '',
  stageStore,
}: RandomSelectionOverlayProps) {
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const store = stageStore ?? useSacredStageStore;
    store.getState().setStage('random-polyhedron', { accentMode: 'default' });
    store.getState().triggerImpulse('random-spin');
  }, [stageStore]);

  return (
    <div
      className={`random-picker-overlay post-join-stage-shell ${className}`.trim()}
      data-testid="random-picker-overlay"
      role="region"
      aria-label="Random participant selection"
    >
      <div
        className="random-picker-aura"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, rgba(184, 85, 200, 0.40) 0%, rgba(226, 168, 62, 0.18) 45%, transparent 70%)',
        }}
      />

      <div className="random-picker-content" data-testid="random-selection-panel">
        <span
          className="random-picker-pill"
          data-testid="random-picker-pill"
        >
          RANDOM SELECTION
        </span>

        <div className="random-picker-stage-slot">
          {children}
        </div>

        <motion.div
          className="random-picker-text"
          initial={reducedMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={
            reducedMotion
              ? { duration: 0 }
              : { type: 'spring', stiffness: 280, damping: 28 }
          }
        >
          <h2
            className="random-picker-title"
            data-testid="random-picker-title"
          >
            Selecting a participant at random…
          </h2>
          <p
            className="random-picker-subtitle"
            data-testid="random-picker-subtitle"
          >
            Spinning for a volunteer…
          </p>
        </motion.div>
      </div>
    </div>
  );
}

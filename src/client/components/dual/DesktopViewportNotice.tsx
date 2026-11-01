import { motion } from 'motion/react';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';

export interface DesktopViewportNoticeProps {
  currentWidth: number;
  onExit: () => void;
}

export function DesktopViewportNotice({
  currentWidth,
  onExit,
}: DesktopViewportNoticeProps) {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <div
      className="desktop-viewport-notice-container"
      data-testid="desktop-viewport-notice"
    >
      <div className="desktop-viewport-notice-card">
        <div className="desktop-viewport-notice-icon" aria-hidden="true">
          🖥️
        </div>
        <span className="desktop-viewport-notice-eyebrow">
          SCREEN RESOLUTION NOTICE
        </span>
        <h2 className="desktop-viewport-notice-title">
          Desktop Viewport Required
        </h2>
        <p className="desktop-viewport-notice-body">
          Desktop Dual Side-by-Side Mode requires a viewport width of at least{' '}
          <strong>1024px</strong> to display the Study Leader and Participant
          mobile frames side-by-side with synchronized real-time interactions.
        </p>
        <div className="desktop-viewport-notice-metrics">
          <span className="desktop-viewport-metric-pill">
            Current: {currentWidth}px
          </span>
          <span className="desktop-viewport-metric-arrow">→</span>
          <span className="desktop-viewport-metric-pill target">
            Required: ≥ 1024px
          </span>
        </div>
        <motion.button
          type="button"
          className="desktop-viewport-notice-cta"
          data-testid="viewport-notice-exit-btn"
          whileTap={reducedMotion ? undefined : { scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 420, damping: 26 }}
          onClick={onExit}
        >
          Return to Welcome
        </motion.button>
      </div>
    </div>
  );
}

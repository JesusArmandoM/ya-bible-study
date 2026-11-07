import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { StudySectionId } from '../../../shared/session';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';
import {
  getSectionEntryConfig,
  type SacredStageStore,
  useSacredStageStore,
} from '../../state/sacredStageStore';
import { Sacred3DScene } from './Sacred3DScene';

export interface SectionEntryOverlayProps {
  sectionId: StudySectionId;
  active?: boolean;
  onDismiss?: () => void;
  durationMs?: number;
  stageStore?: SacredStageStore;
  children?: ReactNode;
  className?: string;
  stageLayout?: string;
  hasSession?: boolean;
  role?: string;
  ariaLabel?: string;
  dataHealth?: string;
}

function getDefaultDuration(reducedMotion: boolean): number {
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) {
    return 200;
  }
  return reducedMotion ? 800 : 3200;
}

export function SectionEntryOverlay({
  sectionId,
  active = true,
  onDismiss,
  durationMs,
  stageStore,
  children,
  className = '',
  stageLayout = 'section',
  hasSession = true,
  role,
  ariaLabel,
  dataHealth,
}: SectionEntryOverlayProps) {
  const reducedMotion = usePrefersReducedMotion();
  const config = getSectionEntryConfig(sectionId);
  const [isDismissing, setIsDismissing] = useState<boolean>(false);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  // Sync stage and trigger impulse when active
  useEffect(() => {
    if (!active) {
      setIsDismissing(false);
      return;
    }
    const store = stageStore ?? useSacredStageStore;
    store.getState().setStage(config.stage, { accentMode: config.accentMode });
    store.getState().triggerImpulse('confirm-burst', 1.2);
  }, [active, config.stage, config.accentMode, stageStore]);

  // Auto-dismiss timer with smooth fade out (stable ref prevents parent re-render resets)
  useEffect(() => {
    if (!active) {
      setIsDismissing(false);
      return;
    }
    const totalDuration = durationMs ?? getDefaultDuration(reducedMotion);
    const fadeDuration = reducedMotion ? 0 : 250;
    const startFadeDelay = Math.max(0, totalDuration - fadeDuration);

    const fadeTimer = setTimeout(() => {
      setIsDismissing(true);
    }, startFadeDelay);

    const dismissTimer = setTimeout(() => {
      onDismissRef.current?.();
    }, totalDuration);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(dismissTimer);
    };
  }, [active, sectionId, durationMs, reducedMotion]);

  const rootClass = active
    ? `section-entry-overlay post-join-stage-shell ${className}`.trim()
    : hasSession
      ? `post-join-stage-shell ${className}`.trim()
      : className.trim();

  const testId = active
    ? 'section-entry-overlay'
    : hasSession
      ? 'post-join-stage-shell'
      : undefined;

  return (
    <div
      className={rootClass}
      data-testid={testId}
      data-section-id={active ? sectionId : undefined}
      data-stage-layout={active ? 'entry' : stageLayout}
      data-dismissing={isDismissing ? 'true' : undefined}
      role={role}
      aria-label={ariaLabel}
      data-health={dataHealth}
    >
      {active && (
        <div
          className="section-entry-aura"
          aria-hidden="true"
          style={{
            background: `radial-gradient(circle at 50% 50%, ${config.glowColor} 0%, transparent 70%)`,
          }}
        />
      )}

      {active && (
        <span
          className="section-entry-badge"
          data-testid="section-entry-badge"
        >
          SECTION {config.sectionNumber} OF 6
        </span>
      )}

      <div className="section-entry-stage-slot">
        {children ?? <Sacred3DScene store={stageStore} />}
      </div>

      {active && (
        <div className="section-entry-text">
          <h2
            className="section-entry-title"
            data-testid="section-entry-title"
          >
            {config.title}
          </h2>
          <p
            className="section-entry-description"
            data-testid="section-entry-description"
          >
            {config.description}
          </p>
        </div>
      )}
    </div>
  );
}

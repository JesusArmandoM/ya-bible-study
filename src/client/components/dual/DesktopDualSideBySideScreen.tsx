import { useEffect, useMemo, useState } from 'react';
import { useDualSessionSandbox } from '../../lib/dualSessionSandbox';
import { createSacredStageStore } from '../../state/sacredStageStore';
import { DesktopViewportNotice } from './DesktopViewportNotice';
import { DualDeviceFrame } from './DualDeviceFrame';
import { SimulationToolbar } from './SimulationToolbar';

export interface DesktopDualSideBySideScreenProps {
  onExit: () => void;
}

export function DesktopDualSideBySideScreen({
  onExit,
}: DesktopDualSideBySideScreenProps) {
  const [viewportWidth, setViewportWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1440,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      setViewportWidth(window.innerWidth);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const leaderStageStore = useMemo(() => createSacredStageStore(), []);
  const participantStageStore = useMemo(() => createSacredStageStore(), []);

  const sandbox = useDualSessionSandbox();

  const handleExit = async () => {
    await sandbox.exitRehearsal();
    onExit();
  };

  if (viewportWidth < 1024) {
    return (
      <DesktopViewportNotice
        currentWidth={viewportWidth}
        onExit={handleExit}
      />
    );
  }

  return (
    <div
      className="desktop-dual-screen-root"
      data-testid="desktop-dual-screen"
    >
      <SimulationToolbar
        sessionCode={sandbox.sessionCode}
        leaderPin={sandbox.leaderPin}
        participants={sandbox.participants}
        activeParticipantId={sandbox.activeParticipantId}
        onSelectParticipant={sandbox.setActiveParticipantId}
        onAddParticipant={sandbox.addParticipant}
        onExit={handleExit}
      />

      {sandbox.isInitializing ? (
        <div
          className="desktop-dual-loading-overlay"
          data-testid="dual-sandbox-loading"
        >
          <div className="dual-sandbox-spinner" aria-hidden="true" />
          <h2 className="dual-sandbox-loading-title">
            Preparing Rehearsal Sanctuary...
          </h2>
          <p className="dual-sandbox-loading-subtitle">
            Spawning Study Leader session and synchronizing 3 sample
            participants over WebSocket.
          </p>
        </div>
      ) : sandbox.error ? (
        <div
          className="desktop-dual-error-overlay"
          data-testid="dual-sandbox-error"
          role="alert"
        >
          <span className="dual-error-icon" aria-hidden="true">
            ⚠️
          </span>
          <h2 className="dual-error-title">Rehearsal Session Error</h2>
          <p className="dual-error-message">{sandbox.error}</p>
          <div className="dual-error-actions">
            <button
              type="button"
              className="dual-error-retry-btn"
              data-testid="dual-error-retry-btn"
              onClick={sandbox.retryInit}
            >
              Retry Connection
            </button>
            <button
              type="button"
              className="dual-error-exit-btn"
              data-testid="dual-error-exit-btn"
              onClick={handleExit}
            >
              Return to Welcome
            </button>
          </div>
        </div>
      ) : (
        <main
          className="desktop-dual-side-by-side-container"
          data-testid="dual-side-by-side-container"
        >
          <DualDeviceFrame
            role="Study Leader"
            displayName="Study Leader"
            client={sandbox.leaderClient}
            stageStore={leaderStageStore}
            testId="leader-frame"
          />

          <DualDeviceFrame
            role="Participant"
            displayName={sandbox.activeParticipant?.displayName ?? 'Participant'}
            client={sandbox.activeParticipant?.client ?? null}
            stageStore={participantStageStore}
            testId="participant-frame"
          />
        </main>
      )}
    </div>
  );
}

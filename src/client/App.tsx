import { useEffect, useState } from 'react';
import { SANCTUARY_ROLES, type HealthResponse } from '../shared/health';
import { resolveApiUrl } from './lib/runtimeUrl';

export type SanctuaryHealthState = 'loading' | 'ok' | 'degraded';

function SanctuaryStarIcon() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M11.5 3.5C12.1 8.6 14.4 10.9 19.5 11.5C14.4 12.1 12.1 14.4 11.5 19.5C10.9 14.4 8.6 12.1 3.5 11.5C8.6 10.9 10.9 8.6 11.5 3.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function App() {
  const [healthState, setHealthState] = useState<SanctuaryHealthState>('loading');

  useEffect(() => {
    const controller = new AbortController();

    async function checkServerHealth() {
      try {
        const response = await fetch(resolveApiUrl('/api/health'), {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });

        if (!response.ok) {
          setHealthState('degraded');
          return;
        }

        const data = (await response.json()) as Partial<HealthResponse>;
        if (data.status === 'ok' && data.wsReady === true) {
          setHealthState('ok');
        } else {
          setHealthState('degraded');
        }
      } catch (error) {
        if ((error as { name?: string }).name === 'AbortError') {
          return;
        }
        setHealthState('degraded');
      }
    }

    void checkServerHealth();

    return () => {
      controller.abort();
    };
  }, []);

  const footerLabel =
    healthState === 'ok'
      ? 'v1.0 · Connected in community'
      : healthState === 'loading'
        ? 'v1.0 · Connecting to sanctuary…'
        : 'v1.0 · Sanctuary offline';

  const stageSummary =
    healthState === 'ok'
      ? 'Unified sanctuary channel ready for real-time Scripture proclamation, prayer, and group reflection.'
      : healthState === 'loading'
        ? 'Verifying live sanctuary synchronization channel…'
        : 'Unable to reach the sanctuary server right now. Check your connection and refresh.';

  return (
    <div className="sanctuary-viewport">
      <div className="sanctuary-ambient" aria-hidden="true" />

      <main className="sanctuary-column">
        <header className="sanctuary-hero">
          <div className="brand-lockup">
            <div className="sanctuary-emblem-badge" aria-hidden="true">
              <SanctuaryStarIcon />
            </div>
            <div className="brand-wordmark">
              <span className="brand-ya">YA</span>
              <span className="brand-eyebrow">BIBLE STUDY</span>
            </div>
          </div>

          <h1 className="hero-title">Bible Study for Young Adults</h1>
          <p className="hero-subtitle">Live interactive sessions for young adults.</p>
        </header>

        <section
          className="sanctuary-stage-card"
          data-health={healthState}
          aria-label="Sanctuary readiness"
        >
          <span className="sanctuary-stage-eyebrow">MIDNIGHT SANCTUARY</span>
          <p className="sanctuary-stage-copy">{stageSummary}</p>
          <div className="sanctuary-role-tags" aria-label="Supported session roles">
            {SANCTUARY_ROLES.map((role) => (
              <span
                key={role}
                className="sanctuary-role-pill"
                data-role={role === 'Study Leader' ? 'leader' : 'participant'}
              >
                {role}
              </span>
            ))}
          </div>
        </section>

        <footer className="sanctuary-footer">
          <div
            className="sanctuary-status-pill"
            data-status={healthState}
            data-testid="sanctuary-health-pill"
            role="status"
            aria-live="polite"
          >
            <span className="status-dot" data-status={healthState} aria-hidden="true" />
            <span>{footerLabel}</span>
          </div>
        </footer>
      </main>
    </div>
  );
}

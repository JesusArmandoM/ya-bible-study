import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import type { HealthResponse } from '../shared/health';
import { toSessionStudySummary, type SessionStudySummary } from '../shared/session';
import { OpeningPrayerScreen } from './components/prayer/OpeningPrayerScreen';
import { SectionPlaceholderScreen } from './components/prayer/SectionPlaceholderScreen';
import { TitleLobbyScreen } from './components/lobby/TitleLobbyScreen';
import { LeaderStudySetupScreen } from './components/setup/LeaderStudySetupScreen';
import { Sacred3DScene } from './components/stage/Sacred3DScene';
import { SessionResilienceChip } from './components/session/SessionResilienceChip';
import { ActiveSessionBanner } from './components/welcome/ActiveSessionBanner';
import { LeaderAccessSheet } from './components/welcome/LeaderAccessSheet';
import { ParticipantJoinSheet } from './components/welcome/ParticipantJoinSheet';
import { WelcomeRoleCards } from './components/welcome/WelcomeRoleCards';
import { resolveApiUrl } from './lib/runtimeUrl';
import type { SessionSocketClient } from './lib/sessionSocket';
import { extractJoinCodeFromLocation } from './lib/urlHelpers';
import { useLiveSession } from './lib/useLiveSession';
import { usePrefersReducedMotion } from './lib/usePrefersReducedMotion';
import { useRandomSelection } from './lib/useRandomSelection';
import { useStudySetup } from './lib/useStudySetup';
import {
  SACRED_STAGE_METADATA,
  SACRED_STAGE_VARIANTS,
  useSacredStageStore,
  type SacredStageVariant,
} from './state/sacredStageStore';

export type SanctuaryHealthState = 'loading' | 'ok' | 'degraded';

export interface AppProps {
  sessionClient?: SessionSocketClient;
}

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

export function App({ sessionClient }: AppProps = {}) {
  const [healthState, setHealthState] = useState<SanctuaryHealthState>('loading');
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const activeStage = useSacredStageStore((s) => s.stage);
  const setStage = useSacredStageStore((s) => s.setStage);
  const triggerImpulse = useSacredStageStore((s) => s.triggerImpulse);
  const reducedMotion = usePrefersReducedMotion();

  const liveSession = useLiveSession({ client: sessionClient });
  const randomSelection = useRandomSelection({ client: sessionClient });
  const [urlJoinCode] = useState<string | null>(() =>
    extractJoinCodeFromLocation(),
  );
  const [activeSheet, setActiveSheet] = useState<
    'leader' | 'participant' | null
  >(() => (urlJoinCode ? 'participant' : null));
  const [setupPanelOpen, setSetupPanelOpen] = useState(true);

  const isLeader = liveSession.role === 'Study Leader';
  const sessionStatus = liveSession.session?.status ?? null;
  const studySetup = useStudySetup({
    enabled: Boolean(liveSession.session && isLeader),
  });
  const lobbyStudySummary: SessionStudySummary | null =
    liveSession.session?.study ??
    (studySetup.study ? toSessionStudySummary(studySetup.study) : null);

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
        setPublicUrl(data.publicUrl ?? null);
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

  const handleStageSelect = (variantId: SacredStageVariant) => {
    const metadata = SACRED_STAGE_METADATA[variantId];
    setStage(variantId);
    triggerImpulse(metadata.defaultImpulse);
    triggerTactileHaptic(reducedMotion);
  };

  const activeStageMeta = SACRED_STAGE_METADATA[activeStage];

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
          <div className="sanctuary-stage-header">
            <span className="sanctuary-stage-eyebrow">MIDNIGHT SANCTUARY</span>
            <span
              className="sanctuary-stage-moment"
              data-testid="sacred-active-moment"
              aria-live="polite"
            >
              {activeStageMeta.eyebrow}
            </span>
          </div>

          <Sacred3DScene />

          <div
            className="sacred-stage-pill-grid"
            role="group"
            aria-label="Sacred stage emblems"
          >
            {SACRED_STAGE_VARIANTS.map((variantId) => {
              const meta = SACRED_STAGE_METADATA[variantId];
              const isActive = activeStage === variantId;
              return (
                <motion.button
                  key={variantId}
                  type="button"
                  className="sacred-stage-pill"
                  data-active={isActive ? 'true' : 'false'}
                  data-stage-pill={variantId}
                  data-testid={`stage-pill-${variantId}`}
                  aria-pressed={isActive}
                  whileTap={reducedMotion ? undefined : { scale: 0.96 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                  onClick={() => handleStageSelect(variantId)}
                >
                  <span
                    className="sacred-stage-pill-dot"
                    aria-hidden="true"
                    style={{
                      backgroundColor: isActive ? '#11131F' : meta.primaryColor,
                    }}
                  />
                  <span className="sacred-stage-pill-label">{meta.label}</span>
                </motion.button>
              );
            })}
          </div>

          <p className="sanctuary-stage-copy">{stageSummary}</p>
        </section>

        {liveSession.session ? (
          <>
            <ActiveSessionBanner
              session={liveSession.session}
              role={liveSession.role}
              leaderPin={liveSession.leaderPin}
              onLeave={() => {
                if (
                  typeof window !== 'undefined' &&
                  window.location.pathname.startsWith('/join/')
                ) {
                  window.history.replaceState({}, '', '/');
                }
                setActiveSheet(null);
                setSetupPanelOpen(true);
                liveSession.leaveRoom();
              }}
            />

            <SessionResilienceChip
              sessionActive={Boolean(liveSession.session)}
              onSessionGone={() => {
                setActiveSheet(null);
                setSetupPanelOpen(true);
                liveSession.leaveRoom();
              }}
            />

            {isLeader && sessionStatus === 'setup' ? (
              setupPanelOpen ? (
                <LeaderStudySetupScreen
                  study={studySetup.study}
                  status={studySetup.status}
                  errorMessages={studySetup.errorMessages}
                  uploadedFileSize={studySetup.uploadedFileSize}
                  actionErrorMessage={liveSession.error}
                  isContinuing={liveSession.isSubmitting}
                  onFileSelected={(file) => {
                    void studySetup.analyzeFile(file);
                  }}
                  onContinue={() => {
                    const summary = studySetup.study
                      ? toSessionStudySummary(studySetup.study)
                      : null;
                    void (async () => {
                      try {
                        if (summary) {
                          await liveSession.loadStudy(summary);
                        }
                        await liveSession.openLobby();
                      } catch {
                        // Failure is surfaced via actionErrorMessage on the screen.
                      }
                    })();
                  }}
                  onBack={() => setSetupPanelOpen(false)}
                />
              ) : (
                <motion.button
                  type="button"
                  className="study-setup-resume"
                  data-testid="study-setup-resume"
                  whileTap={reducedMotion ? undefined : { scale: 0.96 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                  onClick={() => {
                    triggerTactileHaptic(reducedMotion);
                    setSetupPanelOpen(true);
                  }}
                >
                  Set up your study
                </motion.button>
              )
            ) : sessionStatus === 'lobby' ? (
              <TitleLobbyScreen
                mode={isLeader ? 'leader' : 'participant'}
                study={lobbyStudySummary}
                attendeeCount={liveSession.session.connectedParticipantCount}
                sessionCode={liveSession.session.sessionCode}
                isStarting={liveSession.isSubmitting}
                publicUrl={publicUrl}
                onStartStudy={() => {
                  void liveSession.startStudy().catch(() => {
                    // Failure is surfaced via the session error path.
                  });
                }}
              />
            ) : sessionStatus === 'in_progress' ? (
              liveSession.session.currentSectionId === 'section_1_prayer' ? (
                <OpeningPrayerScreen
                  role={liveSession.role ?? 'Participant'}
                  session={liveSession.session}
                  localStudyDocument={studySetup.study}
                  memberId={liveSession.credentials?.memberId ?? null}
                  onToggleHandRaised={(next) =>
                    liveSession.setHandRaised(next)
                  }
                  onLowerHand={(targetMemberId) => {
                    void liveSession.lowerHand(targetMemberId).catch(() => {
                      // Failure is surfaced via the session error path.
                    });
                  }}
                  onClearRaisedHands={() => {
                    void liveSession.clearRaisedHands().catch(() => {
                      // Failure is surfaced via the session error path.
                    });
                  }}
                  onChooseVolunteer={(targetMemberId) => {
                    void liveSession.chooseVolunteer(targetMemberId).catch(() => {
                      // Failure is surfaced via the session error path.
                    });
                  }}
                  onCompleteTurn={() => {
                    void liveSession.completeTurn().catch(() => {
                      // Failure is surfaced via the session error path.
                    });
                  }}
                  onOverrideTurn={() => {
                    void liveSession.overrideTurn().catch(() => {
                      // Failure is surfaced via the session error path.
                    });
                  }}
                  onNextSection={() => {
                    void liveSession.nextSection().catch(() => {
                      // Failure is surfaced via the session error path.
                    });
                  }}
                  onPickRandomly={() => {
                    void randomSelection.pickRandom().catch(() => {
                      // Failure is surfaced via the session error path.
                    });
                  }}
                  onRetryRandom={() => {
                    void randomSelection.retryRandom().catch(() => {
                      // Failure is surfaced via the session error path.
                    });
                  }}
                  onConfirmRandom={() => {
                    void randomSelection.confirmRandom().catch(() => {
                      // Failure is surfaced via the session error path.
                    });
                  }}
                  lastSessionCommand={liveSession.lastSessionCommand}
                />
              ) : (
                <SectionPlaceholderScreen
                  sectionIndex={liveSession.session.currentSectionIndex ?? 0}
                />
              )
            ) : null}
          </>
        ) : activeSheet === 'leader' ? (
          <LeaderAccessSheet
            isSubmitting={liveSession.isSubmitting}
            errorMessage={liveSession.error}
            onCreateRoom={(displayName) => liveSession.createRoom(displayName)}
            onClaimLeadership={(code, pin, name) =>
              liveSession.claimLeadership(code, pin, name)
            }
            onBack={() => setActiveSheet(null)}
            onClearError={liveSession.clearError}
          />
        ) : activeSheet === 'participant' ? (
          <ParticipantJoinSheet
            initialSessionCode={urlJoinCode}
            isSubmitting={liveSession.isSubmitting}
            errorMessage={liveSession.error}
            onJoinRoom={(code, name) => liveSession.joinRoom(code, name)}
            onBack={() => setActiveSheet(null)}
            onClearError={liveSession.clearError}
          />
        ) : (
          <WelcomeRoleCards
            onSelectRole={(role) =>
              setActiveSheet(role === 'Study Leader' ? 'leader' : 'participant')
            }
          />
        )}

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

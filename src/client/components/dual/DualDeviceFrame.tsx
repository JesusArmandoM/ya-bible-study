import { useCallback } from 'react';
import type { SanctuaryRole } from '../../../shared/health';
import type { StudyDocument } from '../../../shared/study';
import type { SessionSocketClient } from '../../lib/sessionSocket';
import { useLiveSession } from '../../lib/useLiveSession';
import { useRandomSelection } from '../../lib/useRandomSelection';
import {
  SacredStageProvider,
  type SacredStageStore,
} from '../../state/sacredStageStore';
import { ClosingPrayerScreen } from '../closing/ClosingPrayerScreen';
import { DiscussionScreen } from '../discussion/DiscussionScreen';
import { IcebreakerScreen } from '../icebreaker/IcebreakerScreen';
import { ParticipantWaitingScreen } from '../lobby/ParticipantWaitingScreen';
import { TitleLobbyScreen } from '../lobby/TitleLobbyScreen';
import { OpeningPrayerScreen } from '../prayer/OpeningPrayerScreen';
import { SectionPlaceholderScreen } from '../prayer/SectionPlaceholderScreen';
import { GospelReadingScreen } from '../reading/GospelReadingScreen';
import { Sacred3DScene } from '../stage/Sacred3DScene';

export interface DualDeviceFrameProps {
  role: SanctuaryRole;
  displayName: string;
  client: SessionSocketClient | null;
  stageStore: SacredStageStore;
  testId?: string;
  studyDocument?: StudyDocument | null;
  className?: string;
  publicUrl?: string | null;
}

export function DualDeviceFrame({
  role,
  displayName,
  client,
  stageStore,
  testId = 'device-frame',
  studyDocument,
  className,
  publicUrl = null,
}: DualDeviceFrameProps) {
  const isLeader = role === 'Study Leader';

  const liveSession = useLiveSession({
    client: client ?? undefined,
    autoReconnect: false,
  });

  const randomSelection = useRandomSelection({
    client: client ?? undefined,
  });

  const handleStartStudy = useCallback(() => {
    void liveSession.startStudy().catch(() => {});
  }, [liveSession]);

  const handleNextSection = useCallback(() => {
    void liveSession.nextSection().catch(() => {});
  }, [liveSession]);

  const handlePreviousSection = useCallback(() => {
    void liveSession.previousSection().catch(() => {});
  }, [liveSession]);

  const handleResetTurn = useCallback(() => {
    void liveSession.resetTurn().catch(() => {});
  }, [liveSession]);

  const session = liveSession.session;
  const currentSectionId = session?.currentSectionId;
  const isConnected = liveSession.connectionStatus === 'connected';
  const isWaitingView =
    !isLeader && (session?.status === 'lobby' || session?.status === 'setup');

  const frameHeaderLabel = isLeader
    ? 'STUDY LEADER'
    : `PARTICIPANT: ${displayName}`;

  return (
    <div
      className={`dual-device-frame-wrapper ${className ?? ''}`}
      data-testid={testId}
      data-frame-role={isLeader ? 'leader' : 'participant'}
    >
      <div className="dual-device-frame-header">
        <div
          className={`dual-frame-role-badge ${isLeader ? 'leader' : 'participant'}`}
          data-testid={`${testId}-badge`}
        >
          <span
            className={`frame-connection-dot ${isConnected ? 'connected' : 'disconnected'}`}
            aria-hidden="true"
          />
          <span className="frame-role-text">{frameHeaderLabel}</span>
        </div>
      </div>

      <div className="dual-device-chassis" data-testid={`${testId}-chassis`}>
        <div className="dual-device-screen-scroll">
          <SacredStageProvider store={stageStore}>
            <div
              className="dual-frame-stage-wrapper"
              data-stage-layout={isWaitingView ? 'waiting' : 'default'}
            >
              <Sacred3DScene store={stageStore} />
            </div>

            {liveSession.connectionStatus === 'connecting' && !session ? (
              <div
                className="dual-frame-loading"
                data-testid={`${testId}-connecting`}
              >
                <div className="loading-spinner" aria-hidden="true" />
                <span>Connecting to rehearsal...</span>
              </div>
            ) : session?.status === 'lobby' || session?.status === 'setup' ? (
              isLeader ? (
                <TitleLobbyScreen
                  mode="leader"
                  study={session.study ?? null}
                  attendeeCount={session.connectedParticipantCount}
                  sessionCode={session.sessionCode}
                  isStarting={liveSession.isSubmitting}
                  publicUrl={publicUrl}
                  onStartStudy={handleStartStudy}
                />
              ) : (
                <ParticipantWaitingScreen />
              )
            ) : session?.status === 'in_progress' ? (
              currentSectionId === 'section_1_prayer' ? (
                <OpeningPrayerScreen
                  role={liveSession.role ?? role}
                  session={session}
                  localStudyDocument={studyDocument}
                  memberId={liveSession.credentials?.memberId ?? null}
                  publicUrl={publicUrl}
                  onToggleHandRaised={(next) => liveSession.setHandRaised(next)}
                  onLowerHand={(id) => {
                    void liveSession.lowerHand(id).catch(() => {});
                  }}
                  onClearRaisedHands={() => {
                    void liveSession.clearRaisedHands().catch(() => {});
                  }}
                  onChooseVolunteer={(id) => {
                    void liveSession.chooseVolunteer(id).catch(() => {});
                  }}
                  onCompleteTurn={() => {
                    void liveSession.completeTurn().catch(() => {});
                  }}
                  onOverrideTurn={() => {
                    void liveSession.overrideTurn().catch(() => {});
                  }}
                  onNextSection={handleNextSection}
                  onResetTurn={handleResetTurn}
                  onPickRandomly={() => {
                    void randomSelection.pickRandom().catch(() => {});
                  }}
                  onRetryRandom={() => {
                    void randomSelection.retryRandom().catch(() => {});
                  }}
                  onConfirmRandom={() => {
                    void randomSelection.confirmRandom().catch(() => {});
                  }}
                  lastSessionCommand={liveSession.lastSessionCommand}
                />
              ) : currentSectionId === 'section_2_icebreaker' ? (
                <IcebreakerScreen
                  role={liveSession.role ?? role}
                  session={session}
                  localStudyDocument={studyDocument}
                  memberId={liveSession.credentials?.memberId ?? null}
                  publicUrl={publicUrl}
                  onToggleHandRaised={(next) => liveSession.setHandRaised(next)}
                  onPreviousSection={handlePreviousSection}
                  onNextSection={handleNextSection}
                  onCompleteTurn={() => {
                    void liveSession.completeTurn().catch(() => {});
                  }}
                  onOverrideTurn={() => {
                    void liveSession.overrideTurn().catch(() => {});
                  }}
                  onResetTurn={handleResetTurn}
                  lastSessionCommand={liveSession.lastSessionCommand}
                />
              ) : currentSectionId === 'section_3_reading' ? (
                <GospelReadingScreen
                  role={liveSession.role ?? role}
                  session={session}
                  localStudyDocument={studyDocument}
                  memberId={liveSession.credentials?.memberId ?? null}
                  publicUrl={publicUrl}
                  onToggleHandRaised={(next) => liveSession.setHandRaised(next)}
                  onChooseVolunteer={(id) => {
                    void liveSession.chooseVolunteer(id).catch(() => {});
                  }}
                  onCompleteTurn={() => {
                    void liveSession.completeTurn().catch(() => {});
                  }}
                  onOverrideTurn={() => {
                    void liveSession.overrideTurn().catch(() => {});
                  }}
                  onPreviousSection={handlePreviousSection}
                  onNextSection={handleNextSection}
                  onResetTurn={handleResetTurn}
                  onPickRandomly={() => {
                    void randomSelection.pickRandom().catch(() => {});
                  }}
                  onRetryRandom={() => {
                    void randomSelection.retryRandom().catch(() => {});
                  }}
                  onConfirmRandom={() => {
                    void randomSelection.confirmRandom().catch(() => {});
                  }}
                  lastSessionCommand={liveSession.lastSessionCommand}
                />
              ) : currentSectionId === 'section_4_deep_analysis' ? (
                <SectionPlaceholderScreen
                  sectionIndex={3}
                  role={liveSession.role ?? role}
                  onPreviousSection={handlePreviousSection}
                  onNextSection={handleNextSection}
                />
              ) : currentSectionId === 'section_5_discussion' ? (
                <DiscussionScreen
                  role={liveSession.role ?? role}
                  session={session}
                  localStudyDocument={studyDocument}
                  memberId={liveSession.credentials?.memberId ?? null}
                  publicUrl={publicUrl}
                  onSwitchQuestion={(id) => {
                    void liveSession.switchQuestion(id).catch(() => {});
                  }}
                  onAddQuestion={(q) => {
                    void liveSession.addQuestion(q).catch(() => {});
                  }}
                  onPreviousSection={handlePreviousSection}
                  onNextSection={handleNextSection}
                  onSubmitReflection={(input) => {
                    void liveSession.submitReflection(input).catch(() => {});
                  }}
                />
              ) : currentSectionId === 'section_6_closing' ? (
                <ClosingPrayerScreen
                  role={liveSession.role ?? role}
                  session={session}
                  localStudyDocument={studyDocument}
                  memberId={liveSession.credentials?.memberId ?? null}
                  publicUrl={publicUrl}
                  onPreviousSection={handlePreviousSection}
                  onFinishStudy={() => {
                    void liveSession.finishStudy().catch(() => {});
                  }}
                  isSubmitting={liveSession.isSubmitting}
                />
              ) : (
                <div className="dual-frame-fallback">
                  <span>Preparing Section...</span>
                </div>
              )
            ) : (
              <div
                className="dual-frame-completed"
                data-testid={`${testId}-completed`}
              >
                <span className="completed-emblem" aria-hidden="true">
                  ✨
                </span>
                <h3>Study Session Concluded</h3>
                <p>
                  All sections have been completed and reflections have been
                  purged from ephemeral server memory.
                </p>
              </div>
            )}
          </SacredStageProvider>
        </div>
      </div>
    </div>
  );
}

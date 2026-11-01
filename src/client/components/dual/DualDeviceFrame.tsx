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
import { TitleLobbyScreen } from '../lobby/TitleLobbyScreen';
import { OpeningPrayerScreen } from '../prayer/OpeningPrayerScreen';
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
}

export function DualDeviceFrame({
  role,
  displayName,
  client,
  stageStore,
  testId = 'device-frame',
  studyDocument,
  className,
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

  const session = liveSession.session;
  const currentSectionId = session?.currentSectionId;
  const isConnected = liveSession.connectionStatus === 'connected';

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
            <div className="dual-frame-stage-wrapper">
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
            ) : session?.status === 'lobby' ? (
              <TitleLobbyScreen
                mode={isLeader ? 'leader' : 'participant'}
                study={session.study ?? null}
                attendeeCount={session.connectedParticipantCount}
                sessionCode={session.sessionCode}
                isStarting={liveSession.isSubmitting}
                onStartStudy={handleStartStudy}
              />
            ) : session?.status === 'in_progress' ? (
              currentSectionId === 'section_1_prayer' ? (
                <OpeningPrayerScreen
                  role={liveSession.role ?? role}
                  session={session}
                  localStudyDocument={studyDocument}
                  memberId={liveSession.credentials?.memberId ?? null}
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
                  onToggleHandRaised={(next) => liveSession.setHandRaised(next)}
                  onNextSection={handleNextSection}
                />
              ) : currentSectionId === 'section_3_reading' ? (
                <GospelReadingScreen
                  role={liveSession.role ?? role}
                  session={session}
                  localStudyDocument={studyDocument}
                  memberId={liveSession.credentials?.memberId ?? null}
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
                  onNextSection={handleNextSection}
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
              ) : currentSectionId === 'section_4_discussion' ? (
                <DiscussionScreen
                  role={liveSession.role ?? role}
                  session={session}
                  localStudyDocument={studyDocument}
                  memberId={liveSession.credentials?.memberId ?? null}
                  onSwitchQuestion={(id) => {
                    void liveSession.switchQuestion(id).catch(() => {});
                  }}
                  onAddQuestion={(q) => {
                    void liveSession.addQuestion(q).catch(() => {});
                  }}
                  onNextSection={handleNextSection}
                  onSubmitReflection={(input) => {
                    void liveSession.submitReflection(input).catch(() => {});
                  }}
                />
              ) : currentSectionId === 'section_5_closing' ? (
                <ClosingPrayerScreen
                  role={liveSession.role ?? role}
                  session={session}
                  localStudyDocument={studyDocument}
                  memberId={liveSession.credentials?.memberId ?? null}
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

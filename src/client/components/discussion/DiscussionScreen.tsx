import { useEffect, useMemo, useState } from 'react';
import type { SanctuaryRole } from '../../../shared/health';
import type {
  PublicLiveSessionSnapshot,
  SessionDiscussionQuestion,
} from '../../../shared/session';
import type { StudyDocument } from '../../../shared/study';
import {
  resolveSacredStage,
  useSacredStageStore,
} from '../../state/sacredStageStore';
import { SectionProgressHeader } from '../sections/SectionProgressHeader';
import { ActiveQuestionCard } from './ActiveQuestionCard';
import { AddQuestionModal } from './AddQuestionModal';
import { LeaderQuestionQueue } from './LeaderQuestionQueue';
import { PastoralNotesDrawer } from './PastoralNotesDrawer';
import { PrayerCardModal } from './PrayerCardModal';
import { SubmitReflectionModal } from './SubmitReflectionModal';

export interface DiscussionScreenProps {
  role: SanctuaryRole;
  session: PublicLiveSessionSnapshot;
  /** Facilitator-only locally held study document with commentary and doctrinal notes. */
  localStudyDocument?: StudyDocument | null;
  memberId?: string | null;
  onSwitchQuestion: (questionId: string) => void | Promise<void>;
  onAddQuestion: (question: SessionDiscussionQuestion) => void | Promise<void>;
  onNextSection: () => void | Promise<void>;
  onSubmitReflection?: (input: {
    questionId: string;
    content: string;
    isAnonymous: boolean;
  }) => void | Promise<void>;
}

export function DiscussionScreen({
  role,
  session,
  localStudyDocument,
  memberId,
  onSwitchQuestion,
  onAddQuestion,
  onNextSection,
  onSubmitReflection,
}: DiscussionScreenProps) {
  const setStage = useSacredStageStore((s) => s.setStage);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isPastoralDrawerOpen, setIsPastoralDrawerOpen] = useState(false);
  const [isRespondModalOpen, setIsRespondModalOpen] = useState(false);
  const [isPrayerCardModalOpen, setIsPrayerCardModalOpen] = useState(false);

  const isLeader = role === 'Study Leader';

  useEffect(() => {
    const resolved = resolveSacredStage({ screen: 'section-4-discussion' });
    setStage(resolved.stage, { accentMode: resolved.accentMode });
  }, [setStage]);

  const discussionState = session.discussionState;
  const questions = useMemo(
    () => discussionState?.questions ?? [],
    [discussionState?.questions],
  );
  const reflections = useMemo(
    () => discussionState?.reflections ?? [],
    [discussionState?.reflections],
  );
  const activeQuestionId = discussionState?.activeQuestionId ?? '';

  const activeIndex = useMemo(() => {
    const idx = questions.findIndex((q) => q.id === activeQuestionId);
    return idx >= 0 ? idx : 0;
  }, [questions, activeQuestionId]);

  const activeQuestion = questions[activeIndex] ?? null;

  const handleNextQuestion = () => {
    if (questions.length === 0) {
      return;
    }
    const nextIdx = (activeIndex + 1) % questions.length;
    const nextQ = questions[nextIdx];
    if (nextQ) {
      void onSwitchQuestion(nextQ.id);
    }
  };

  return (
    <div className="discussion-screen" data-testid="discussion-screen">
      <SectionProgressHeader sectionNumber={4} />

      <header className="discussion-screen-header">
        <span className="discussion-eyebrow">DEEP ANALYSIS · 25 MIN</span>
        <h1 className="discussion-title">Lord, Help Me Pray</h1>

        {isLeader && (
          <div className="pastoral-trigger-container">
            <button
              type="button"
              className="pastoral-notes-trigger-btn"
              data-testid="pastoral-notes-trigger"
              onClick={() => setIsPastoralDrawerOpen(true)}
            >
              <span aria-hidden="true">📖</span>
              <span>Pastoral Notes & Commentary</span>
            </button>
            <button
              type="button"
              className="leader-prayer-card-trigger-btn"
              data-testid="leader-open-prayer-card-btn"
              onClick={() => setIsPrayerCardModalOpen(true)}
            >
              <span aria-hidden="true">✨</span>
              <span>"Lord, Help Me" Prayer Card</span>
            </button>
          </div>
        )}
      </header>

      {isLeader ? (
        <>
          <LeaderQuestionQueue
            questions={questions}
            activeQuestionId={activeQuestionId}
            reflections={reflections}
            onSwitchQuestion={(qId) => void onSwitchQuestion(qId)}
            onOpenAddModal={() => setIsAddModalOpen(true)}
            onNextQuestion={handleNextQuestion}
            onAdvanceSection={() => void onNextSection()}
          />

          <AddQuestionModal
            isOpen={isAddModalOpen}
            onClose={() => setIsAddModalOpen(false)}
            onAddQuestion={(q) => void onAddQuestion(q)}
            currentQuestions={questions}
            studyDocument={localStudyDocument}
            syncedBankQuestions={session.study?.discussion?.questions}
          />

          <PastoralNotesDrawer
            isOpen={isPastoralDrawerOpen}
            onClose={() => setIsPastoralDrawerOpen(false)}
            studyDocument={localStudyDocument}
            activeQuestion={activeQuestion}
          />
        </>
      ) : (
        <ActiveQuestionCard
          question={activeQuestion}
          activeIndex={activeIndex}
          totalQuestions={questions.length}
          reflections={reflections}
          onOpenRespondModal={() => setIsRespondModalOpen(true)}
          onOpenPrayerCard={() => setIsPrayerCardModalOpen(true)}
        />
      )}

      <SubmitReflectionModal
        isOpen={isRespondModalOpen}
        onClose={() => setIsRespondModalOpen(false)}
        onSubmit={async (input) => {
          if (onSubmitReflection) {
            await onSubmitReflection(input);
          }
        }}
        question={activeQuestion}
      />

      <PrayerCardModal
        isOpen={isPrayerCardModalOpen}
        onClose={() => setIsPrayerCardModalOpen(false)}
        sessionCode={session.sessionCode}
        memberId={memberId}
        activeQuestionId={activeQuestionId}
        onSubmitReflection={onSubmitReflection}
      />
    </div>
  );
}

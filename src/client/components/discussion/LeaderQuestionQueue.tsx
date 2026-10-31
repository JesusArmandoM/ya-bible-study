import { motion } from 'motion/react';
import type {
  SessionDiscussionQuestion,
  SessionReflection,
} from '../../../shared/session';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';

export interface LeaderQuestionQueueProps {
  questions: SessionDiscussionQuestion[];
  activeQuestionId: string;
  reflections?: SessionReflection[];
  onSwitchQuestion: (questionId: string) => void;
  onOpenAddModal: () => void;
  onNextQuestion: () => void;
  onAdvanceSection: () => void;
}

function SpeechBubbleIcon({ isActive }: { isActive: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={isActive ? 'icon-gold' : 'icon-muted'}
    >
      <path
        d="M2.5 7.5C2.5 4.73858 4.73858 2.5 7.5 2.5H8.5C11.2614 2.5 13.5 4.73858 13.5 7.5C13.5 10.2614 11.2614 12.5 8.5 12.5H7L3.5 14.5V11.8541C2.88047 10.6698 2.5 9.15546 2.5 7.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className="icon-muted"
    >
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8 5V8L10 10"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M8 3.5V12.5M3.5 8H12.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function LeaderQuestionQueue({
  questions,
  activeQuestionId,
  reflections = [],
  onSwitchQuestion,
  onOpenAddModal,
  onNextQuestion,
  onAdvanceSection,
}: LeaderQuestionQueueProps) {
  const reducedMotion = usePrefersReducedMotion();

  const activeIndex = questions.findIndex((q) => q.id === activeQuestionId);
  const isLastQuestion = activeIndex >= 0 && activeIndex === questions.length - 1;

  return (
    <div className="leader-discussion-queue" data-testid="leader-question-queue">
      <div className="queue-cards-stack">
        {questions.map((q) => {
          const isActive = q.id === activeQuestionId;
          const responseCount = reflections.filter((r) => r.questionId === q.id).length;
          const responseText =
            responseCount > 0
              ? `${responseCount} ${responseCount === 1 ? 'response' : 'responses'}`
              : isActive
                ? 'Active'
                : '0 responses';

          return (
            <motion.article
              key={q.id}
              className={`queue-card ${isActive ? 'is-active' : ''}`}
              data-testid={`question-card-${q.id}`}
              data-active={isActive ? 'true' : 'false'}
              onClick={() => onSwitchQuestion(q.id)}
              whileTap={reducedMotion ? undefined : { scale: 0.99 }}
              layout
              transition={
                reducedMotion
                  ? { duration: 0 }
                  : { type: 'spring', stiffness: 350, damping: 28 }
              }
            >
              <div
                className={`queue-badge ${isActive ? 'is-active' : ''}`}
                aria-hidden="true"
              >
                {q.number}
              </div>

              <div className="queue-card-main">
                <h3 className="queue-card-prompt">{q.prompt}</h3>

                <div className="queue-card-meta">
                  <div className="meta-indicator">
                    <SpeechBubbleIcon isActive={isActive || responseCount > 0} />
                    <span
                      className={isActive || responseCount > 0 ? 'meta-active' : 'meta-muted'}
                      data-testid={`question-response-count-${q.id}`}
                    >
                      {responseText}
                    </span>
                  </div>

                  <div className="meta-indicator">
                    <ClockIcon />
                    <span className="meta-muted">
                      ~{q.estimatedMinutes ?? 8} min
                    </span>
                  </div>
                </div>
              </div>
            </motion.article>
          );
        })}
      </div>

      <div className="queue-bottom-actions">
        <button
          type="button"
          className="queue-add-btn"
          data-testid="add-question-trigger"
          onClick={onOpenAddModal}
        >
          <PlusIcon />
          <span>Add</span>
        </button>

        {isLastQuestion ? (
          <button
            type="button"
            className="queue-next-btn is-advance"
            data-testid="advance-section-5-btn"
            onClick={onAdvanceSection}
          >
            <span>Begin Closing Prayer</span>
            <span aria-hidden="true">→</span>
          </button>
        ) : (
          <button
            type="button"
            className="queue-next-btn"
            data-testid="next-question-btn"
            onClick={onNextQuestion}
          >
            <span>Next question</span>
            <span aria-hidden="true">→</span>
          </button>
        )}
      </div>

      <div className="queue-footer-zone">
        <p className="queue-footnote">
          Only you decide when to advance — mercy, not pace, is the goal.
        </p>

        {!isLastQuestion && (
          <button
            type="button"
            className="queue-discreet-advance-btn"
            data-testid="advance-section-5-direct"
            onClick={onAdvanceSection}
          >
            Advance to Section 5 →
          </button>
        )}
      </div>
    </div>
  );
}

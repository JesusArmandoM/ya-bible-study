import { motion } from 'motion/react';
import type {
  SessionDiscussionQuestion,
  SessionReflection,
} from '../../../shared/session';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';
import { ReflectionFeed } from './ReflectionFeed';

export interface ActiveQuestionCardProps {
  question: SessionDiscussionQuestion | null;
  activeIndex: number;
  totalQuestions: number;
  reflections?: SessionReflection[];
  onOpenRespondModal: () => void;
  onOpenPrayerCard?: () => void;
}

function PrayerCrossIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className="prayer-card-pill-icon"
    >
      <path
        d="M8 2V14M4.5 5.5H11.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function InfoCircleIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className="participant-info-icon"
    >
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 7V11.5M8 4.75V5.25"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SpeechBubbleIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className="respond-icon"
    >
      <path
        d="M2.5 7.5C2.5 4.73858 4.73858 2.5 7.5 2.5H8.5C11.2614 2.5 13.5 4.73858 13.5 7.5C13.5 10.2614 11.2614 12.5 8.5 12.5H7L3.5 14.5V11.8541C2.88047 10.6698 2.5 9.15546 2.5 7.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ActiveQuestionCard({
  question,
  activeIndex,
  totalQuestions,
  reflections = [],
  onOpenRespondModal,
  onOpenPrayerCard,
}: ActiveQuestionCardProps) {
  const reducedMotion = usePrefersReducedMotion();

  if (!question) {
    return (
      <div className="discussion-empty-card" data-testid="discussion-empty-card">
        <p>Waiting for the Study Leader to open the discussion…</p>
      </div>
    );
  }

  return (
    <div className="participant-discussion-container">
      <div className="participant-question-counter-bar">
        <span
          className="participant-question-counter"
          data-testid="participant-question-progress"
        >
          QUESTION {activeIndex + 1} OF {totalQuestions}
        </span>
        <span className="participant-percent">80%</span>
      </div>

      <motion.article
        className="participant-active-card"
        data-testid="participant-active-question-card"
        initial={reducedMotion ? { opacity: 0 } : { scale: 0.98, opacity: 0 }}
        animate={reducedMotion ? { opacity: 1 } : { scale: 1, opacity: 1 }}
        transition={
          reducedMotion
            ? { duration: 0 }
            : { type: 'spring', stiffness: 320, damping: 28 }
        }
      >
        <div className="active-card-badge-row">
          <div className="active-question-badge" aria-hidden="true">
            {question.number}
          </div>
          <span className="active-question-eyebrow">DEEP ANALYSIS · ACTIVE</span>
        </div>

        <h2
          className="active-question-prompt"
          data-testid="active-question-prompt"
        >
          {question.prompt}
        </h2>
      </motion.article>

      <ReflectionFeed
        reflections={reflections}
        questionId={question.id}
      />

      <div className="participant-bottom-actions">
        <button
          type="button"
          className="participant-respond-btn"
          data-testid="respond-trigger-btn"
          onClick={onOpenRespondModal}
        >
          <SpeechBubbleIcon />
          <span>I want to respond</span>
        </button>

        <button
          type="button"
          className="participant-prayer-card-pill"
          data-testid="open-prayer-card-btn"
          onClick={onOpenPrayerCard}
        >
          <PrayerCrossIcon />
          <span>"Lord, Help Me" Prayer Card</span>
        </button>

        <div
          className="participant-locked-advance-pill"
          data-testid="participant-locked-note"
          role="status"
          aria-live="polite"
        >
          <InfoCircleIcon />
          <span>Only the leader decides when to advance</span>
        </div>
      </div>
    </div>
  );
}

import { motion } from 'motion/react';
import type { SessionDiscussionQuestion } from '../../../shared/session';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';

export interface ActiveQuestionCardProps {
  question: SessionDiscussionQuestion | null;
  activeIndex: number;
  totalQuestions: number;
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

export function ActiveQuestionCard({
  question,
  activeIndex,
  totalQuestions,
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
  );
}

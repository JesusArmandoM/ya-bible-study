import { motion, AnimatePresence } from 'motion/react';
import { useEffect, useState } from 'react';
import type { SessionDiscussionQuestion } from '../../../shared/session';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';

export interface SubmitReflectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: {
    questionId: string;
    content: string;
    isAnonymous: boolean;
  }) => Promise<void> | void;
  question: SessionDiscussionQuestion | null;
  isSubmitting?: boolean;
}

export function SubmitReflectionModal({
  isOpen,
  onClose,
  onSubmit,
  question,
  isSubmitting = false,
}: SubmitReflectionModalProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [content, setContent] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Reset form when modal opens or question changes
  useEffect(() => {
    if (isOpen) {
      setContent('');
      setIsAnonymous(false);
      setLocalError(null);
    }
  }, [isOpen, question?.id]);

  if (!isOpen || !question) {
    return null;
  }

  const trimmed = content.trim();
  const isValid = trimmed.length >= 1 && content.length <= 1000;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isSubmitting) {
      return;
    }

    try {
      setLocalError(null);
      await onSubmit({
        questionId: question.id,
        content: trimmed,
        isAnonymous,
      });
      setContent('');
      setIsAnonymous(false);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to submit reflection';
      setLocalError(msg);
    }
  };

  return (
    <AnimatePresence>
      <div
        className="reflection-modal-overlay"
        onClick={onClose}
        data-testid="reflection-modal-backdrop"
      >
        <motion.div
          className="reflection-modal-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Submit reflection"
          data-testid="submit-reflection-modal"
          onClick={(e) => e.stopPropagation()}
          initial={reducedMotion ? { opacity: 0 } : { y: '100%', opacity: 0.8 }}
          animate={reducedMotion ? { opacity: 1 } : { y: 0, opacity: 1 }}
          exit={reducedMotion ? { opacity: 0 } : { y: '100%', opacity: 0 }}
          transition={
            reducedMotion
              ? { duration: 0 }
              : { type: 'spring', stiffness: 380, damping: 30 }
          }
        >
          <div className="reflection-modal-header">
            <span className="reflection-modal-eyebrow">YOUR REFLECTION</span>
            <button
              type="button"
              className="reflection-modal-close"
              data-testid="reflection-modal-close-btn"
              onClick={onClose}
              aria-label="Close reflection modal"
            >
              ×
            </button>
          </div>

          <div
            className="reflection-modal-prompt-context"
            data-testid="reflection-modal-prompt"
          >
            <span className="prompt-badge">Q{question.number}</span>
            <p className="prompt-snippet">{question.prompt}</p>
          </div>

          <form onSubmit={handleSubmit} className="reflection-modal-form">
            <div className="reflection-input-group">
              <label htmlFor="reflection-textarea" className="reflection-input-label">
                What resonated with you?
              </label>
              <textarea
                id="reflection-textarea"
                className="reflection-textarea"
                data-testid="reflection-textarea"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                maxLength={1000}
                placeholder="Share your reflection with the group..."
                rows={4}
                disabled={isSubmitting}
                autoFocus
              />
              <div className="reflection-counter-row">
                <span
                  className="reflection-char-counter"
                  data-testid="reflection-char-counter"
                >
                  {content.length} / 1000
                </span>
              </div>
            </div>

            <div className="reflection-anonymous-row">
              <label className="anonymous-toggle-label">
                <input
                  type="checkbox"
                  id="reflection-anonymous-toggle"
                  className="anonymous-checkbox"
                  data-testid="reflection-anonymous-checkbox"
                  checked={isAnonymous}
                  onChange={(e) => setIsAnonymous(e.target.checked)}
                  disabled={isSubmitting}
                />
                <span className="anonymous-label-text">Share anonymously</span>
              </label>
              <p
                className="anonymous-reassurance-note"
                data-testid="reflection-anonymous-note"
              >
                Your name and avatar will be hidden
              </p>
            </div>

            {localError && (
              <p className="reflection-form-error" role="alert">
                {localError}
              </p>
            )}

            <div className="reflection-modal-actions">
              <button
                type="submit"
                className="submit-reflection-btn"
                data-testid="submit-reflection-btn"
                disabled={!isValid || isSubmitting}
              >
                {isSubmitting ? 'Submitting…' : 'Submit reflection'}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

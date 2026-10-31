import { motion, AnimatePresence } from 'motion/react';
import { useState } from 'react';
import type { StudyDocument } from '../../../shared/study';
import type { SessionDiscussionQuestion } from '../../../shared/session';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';

export interface AddQuestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddQuestion: (question: SessionDiscussionQuestion) => void;
  currentQuestions: SessionDiscussionQuestion[];
  studyDocument?: StudyDocument | null;
  syncedBankQuestions?: SessionDiscussionQuestion[];
}

export function AddQuestionModal({
  isOpen,
  onClose,
  onAddQuestion,
  currentQuestions,
  studyDocument,
  syncedBankQuestions,
}: AddQuestionModalProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [customPrompt, setCustomPrompt] = useState('');
  const [customCategory, setCustomCategory] = useState('Custom Reflection');
  const [activeTab, setActiveTab] = useState<'bank' | 'custom'>('bank');

  if (!isOpen) {
    return null;
  }

  // Derive unqueued questions from either localStudyDocument or syncedBankQuestions
  const bankQuestions: Array<Pick<SessionDiscussionQuestion, 'id' | 'number' | 'prompt' | 'category' | 'estimatedMinutes'>> =
    studyDocument?.deepAnalysis.reflectionQuestions.map((q) => ({
      id: q.id,
      number: q.number,
      prompt: q.prompt,
      category: q.category,
      estimatedMinutes: q.estimatedMinutes,
    })) ??
    syncedBankQuestions ??
    [];

  const currentIds = new Set(currentQuestions.map((q) => q.id));
  const unqueuedBank = bankQuestions.filter((q) => !currentIds.has(q.id));

  const handleAddBank = (bankQ: (typeof unqueuedBank)[number]) => {
    onAddQuestion({
      id: bankQ.id,
      number: currentQuestions.length + 1,
      prompt: bankQ.prompt,
      category: bankQ.category,
      estimatedMinutes: bankQ.estimatedMinutes,
    });
    onClose();
  };

  const handleAddCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedPrompt = customPrompt.trim();
    if (!trimmedPrompt) {
      return;
    }

    const uuid =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : Date.now().toString(36);

    onAddQuestion({
      id: `custom-${uuid}`,
      number: currentQuestions.length + 1,
      prompt: trimmedPrompt,
      category: customCategory.trim() || 'Custom Reflection',
      estimatedMinutes: 8,
    });
    setCustomPrompt('');
    onClose();
  };

  return (
    <AnimatePresence>
      <div
        className="add-question-overlay"
        onClick={onClose}
        data-testid="add-question-backdrop"
      >
        <motion.div
          className="add-question-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Add discussion question"
          data-testid="add-question-modal"
          onClick={(e) => e.stopPropagation()}
          initial={reducedMotion ? { opacity: 0 } : { y: '100%', opacity: 0.8 }}
          animate={reducedMotion ? { opacity: 1 } : { y: 0, opacity: 1 }}
          exit={reducedMotion ? { opacity: 0 } : { y: '100%', opacity: 0 }}
          transition={
            reducedMotion
              ? { duration: 0 }
              : { type: 'spring', damping: 28, stiffness: 280 }
          }
        >
          <div className="add-question-header">
            <h2 className="add-question-title">Add Discussion Question</h2>
            <button
              type="button"
              className="add-question-close-btn"
              onClick={onClose}
              data-testid="close-add-modal"
              aria-label="Close modal"
            >
              ✕
            </button>
          </div>

          <div className="add-question-mode-toggle" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'bank'}
              className={`add-mode-btn ${activeTab === 'bank' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('bank')}
              data-testid="tab-bank-questions"
            >
              Study Bank ({unqueuedBank.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'custom'}
              className={`add-mode-btn ${activeTab === 'custom' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('custom')}
              data-testid="tab-custom-question"
            >
              Custom Prompt
            </button>
          </div>

          <div className="add-question-content">
            {activeTab === 'bank' ? (
              <div
                className="add-bank-list"
                data-testid="bank-questions-container"
              >
                {unqueuedBank.length > 0 ? (
                  unqueuedBank.map((q) => (
                    <article key={q.id} className="add-bank-card">
                      <div className="add-bank-meta">
                        <span className="add-bank-category">{q.category}</span>
                        {q.estimatedMinutes && (
                          <span className="add-bank-duration">
                            ~{q.estimatedMinutes} min
                          </span>
                        )}
                      </div>
                      <p className="add-bank-prompt">{q.prompt}</p>
                      <button
                        type="button"
                        className="add-bank-promote-btn"
                        onClick={() => handleAddBank(q)}
                        data-testid={`add-bank-question-${q.id}`}
                      >
                        + Add to Queue
                      </button>
                    </article>
                  ))
                ) : (
                  <p className="add-bank-empty">
                    All questions from the study bank are already in the queue.
                  </p>
                )}
              </div>
            ) : (
              <form
                className="add-custom-form"
                onSubmit={handleAddCustom}
                data-testid="custom-question-form"
              >
                <div className="form-group">
                  <label htmlFor="custom-prompt-input" className="form-label">
                    Reflection Prompt
                  </label>
                  <textarea
                    id="custom-prompt-input"
                    className="custom-textarea"
                    data-testid="custom-question-input"
                    rows={4}
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder="Type your reflection prompt for the group…"
                    autoFocus
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="custom-category-input" className="form-label">
                    Category Tag
                  </label>
                  <input
                    type="text"
                    id="custom-category-input"
                    className="custom-input"
                    data-testid="custom-category-input"
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    placeholder="e.g. Personal Prayer, Discernment"
                  />
                </div>

                <button
                  type="submit"
                  className="add-custom-submit-btn"
                  data-testid="submit-custom-question"
                  disabled={!customPrompt.trim()}
                >
                  Add Custom Question →
                </button>
              </form>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

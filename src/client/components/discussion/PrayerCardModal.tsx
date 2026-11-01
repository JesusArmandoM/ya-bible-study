import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useId, useState } from 'react';
import {
  exportOrSharePrayerCard,
  renderPrayerCardToBlob,
} from '../../lib/prayerCardCanvas';
import {
  buildPrayerCardStorageKey,
  formatPrayerLine,
  loadPrayerCardDraft,
  PRAYER_PROMPT_CONFIG,
  savePrayerCardDraft,
  type PrayerCardPromptId,
} from '../../lib/prayerCardStorage';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';

export interface PrayerCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionCode?: string | null;
  memberId?: string | null;
  activeQuestionId?: string | null;
  onSubmitReflection?: (input: {
    questionId: string;
    content: string;
    isAnonymous: boolean;
  }) => Promise<void> | void;
}

export function PrayerCardModal({
  isOpen,
  onClose,
  sessionCode,
  memberId,
  activeQuestionId,
  onSubmitReflection,
}: PrayerCardModalProps) {
  const reducedMotion = usePrefersReducedMotion();
  const titleId = useId();

  const storageKey = buildPrayerCardStorageKey(sessionCode, memberId);

  const [selfText, setSelfText] = useState('');
  const [lovedOneText, setLovedOneText] = useState('');
  const [churchWorldText, setChurchWorldText] = useState('');

  const [selfAnon, setSelfAnon] = useState(false);
  const [lovedOneAnon, setLovedOneAnon] = useState(false);
  const [churchWorldAnon, setChurchWorldAnon] = useState(false);

  const [sharedFeedback, setSharedFeedback] = useState<Record<string, string>>({});
  const [isExporting, setIsExporting] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);

  // Load draft from localStorage on open
  useEffect(() => {
    if (isOpen) {
      const draft = loadPrayerCardDraft(storageKey);
      setSelfText(draft.self);
      setLovedOneText(draft.lovedOne);
      setChurchWorldText(draft.churchWorld);
      setSharedFeedback({});
      setExportFeedback(null);
    }
  }, [isOpen, storageKey]);

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const handleSelfChange = (val: string) => {
    setSelfText(val);
    savePrayerCardDraft(storageKey, { self: val });
  };

  const handleLovedOneChange = (val: string) => {
    setLovedOneText(val);
    savePrayerCardDraft(storageKey, { lovedOne: val });
  };

  const handleChurchWorldChange = (val: string) => {
    setChurchWorldText(val);
    savePrayerCardDraft(storageKey, { churchWorld: val });
  };

  const handleShareLine = async (
    promptId: PrayerCardPromptId,
    rawText: string,
    isAnon: boolean,
  ) => {
    if (!onSubmitReflection || !rawText.trim()) {
      return;
    }
    const formatted = formatPrayerLine(promptId, rawText);
    const qId = activeQuestionId || 'q-6';

    try {
      await onSubmitReflection({
        questionId: qId,
        content: formatted,
        isAnonymous: isAnon,
      });

      setSharedFeedback((prev) => ({
        ...prev,
        [promptId]: 'Shared to group! ✓',
      }));

      setTimeout(() => {
        setSharedFeedback((prev) => {
          const next = { ...prev };
          delete next[promptId];
          return next;
        });
      }, 3500);
    } catch {
      setSharedFeedback((prev) => ({
        ...prev,
        [promptId]: 'Error sharing line',
      }));
    }
  };

  const handleExportPng = async () => {
    try {
      setIsExporting(true);
      setExportFeedback('Generating keepsake…');

      const blob = await renderPrayerCardToBlob({
        self: selfText,
        lovedOne: lovedOneText,
        churchWorld: churchWorldText,
        scriptureCitation: 'Matthew 15:21–28',
      });

      const { method } = await exportOrSharePrayerCard(blob, 'prayer-card.png');
      setExportFeedback(
        method === 'share' ? 'Shared successfully!' : 'Prayer card downloaded!',
      );

      setTimeout(() => {
        setExportFeedback(null);
      }, 4000);
    } catch (err) {
      setExportFeedback('Could not export card. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <AnimatePresence>
      <div
        className="prayer-card-backdrop"
        data-testid="prayer-card-backdrop"
        onClick={onClose}
      >
        <motion.div
          className="prayer-card-modal"
          data-testid="prayer-card-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={(e) => e.stopPropagation()}
          initial={
            reducedMotion ? { opacity: 0 } : { y: '100%', opacity: 0.5 }
          }
          animate={reducedMotion ? { opacity: 1 } : { y: 0, opacity: 1 }}
          exit={reducedMotion ? { opacity: 0 } : { y: '100%', opacity: 0 }}
          transition={
            reducedMotion
              ? { duration: 0 }
              : { type: 'spring', damping: 28, stiffness: 320 }
          }
        >
          {/* Header */}
          <div className="prayer-card-modal-header">
            <div className="prayer-card-header-titles">
              <span className="prayer-card-eyebrow">
                PERSONAL PRAYER · PRIVATE
              </span>
              <h2
                id={titleId}
                className="prayer-card-title"
                data-testid="prayer-card-title"
              >
                "Lord, Help Me" Prayer Card
              </h2>
            </div>
            <button
              type="button"
              className="prayer-card-close-btn"
              data-testid="close-prayer-card-btn"
              aria-label="Close prayer card"
              onClick={onClose}
            >
              ✕
            </button>
          </div>

          {/* Scriptural instruction & Privacy badge */}
          <div className="prayer-card-intro-block">
            <p
              className="prayer-card-instructions"
              data-testid="prayer-card-instructions"
            >
              Write three short, honest prayers inspired by Matthew 15:21–28.
            </p>
            <div
              className="prayer-card-privacy-badge"
              data-testid="prayer-card-privacy-badge"
              role="status"
            >
              <span>🔒 Private on your device — never shared automatically</span>
            </div>
          </div>

          {/* 3 Prayer Form Sections */}
          <div className="prayer-card-prompts-container">
            {/* Prompt 1: For myself */}
            <div
              className="prayer-card-prompt-card"
              data-testid="prayer-card-prompt-self"
            >
              <div className="prayer-prompt-header-row">
                <span className="prayer-prompt-audience">
                  {PRAYER_PROMPT_CONFIG.self.audienceLabel}
                </span>
                <span className="prayer-prompt-char-count">
                  {selfText.length} / 280
                </span>
              </div>
              <label
                htmlFor="prayer-textarea-self"
                className="prayer-prompt-prefix"
              >
                {PRAYER_PROMPT_CONFIG.self.promptPrefix} …
              </label>
              <textarea
                id="prayer-textarea-self"
                className="prayer-prompt-textarea"
                data-testid="prayer-input-self"
                placeholder={PRAYER_PROMPT_CONFIG.self.placeholder}
                value={selfText}
                maxLength={280}
                rows={3}
                onChange={(e) => handleSelfChange(e.target.value)}
              />

              <div className="prayer-line-actions-row">
                <label className="prayer-anon-toggle-label">
                  <input
                    type="checkbox"
                    className="prayer-anon-checkbox"
                    data-testid="prayer-anon-toggle-self"
                    checked={selfAnon}
                    onChange={(e) => setSelfAnon(e.target.checked)}
                  />
                  <span>Share anonymously</span>
                </label>

                <div className="prayer-share-btn-wrapper">
                  {sharedFeedback['self'] && (
                    <span
                      className="prayer-share-feedback"
                      data-testid="prayer-share-feedback-self"
                    >
                      {sharedFeedback['self']}
                    </span>
                  )}
                  <button
                    type="button"
                    className="prayer-line-share-btn"
                    data-testid="prayer-share-btn-self"
                    disabled={!selfText.trim()}
                    onClick={() => handleShareLine('self', selfText, selfAnon)}
                  >
                    Share line to group
                  </button>
                </div>
              </div>
            </div>

            {/* Prompt 2: For someone I love */}
            <div
              className="prayer-card-prompt-card"
              data-testid="prayer-card-prompt-loved-one"
            >
              <div className="prayer-prompt-header-row">
                <span className="prayer-prompt-audience">
                  {PRAYER_PROMPT_CONFIG['loved-one'].audienceLabel}
                </span>
                <span className="prayer-prompt-char-count">
                  {lovedOneText.length} / 280
                </span>
              </div>
              <label
                htmlFor="prayer-textarea-loved-one"
                className="prayer-prompt-prefix"
              >
                {PRAYER_PROMPT_CONFIG['loved-one'].promptPrefix} …
              </label>
              <textarea
                id="prayer-textarea-loved-one"
                className="prayer-prompt-textarea"
                data-testid="prayer-input-loved-one"
                placeholder={PRAYER_PROMPT_CONFIG['loved-one'].placeholder}
                value={lovedOneText}
                maxLength={280}
                rows={3}
                onChange={(e) => handleLovedOneChange(e.target.value)}
              />

              <div className="prayer-line-actions-row">
                <label className="prayer-anon-toggle-label">
                  <input
                    type="checkbox"
                    className="prayer-anon-checkbox"
                    data-testid="prayer-anon-toggle-loved-one"
                    checked={lovedOneAnon}
                    onChange={(e) => setLovedOneAnon(e.target.checked)}
                  />
                  <span>Share anonymously</span>
                </label>

                <div className="prayer-share-btn-wrapper">
                  {sharedFeedback['loved-one'] && (
                    <span
                      className="prayer-share-feedback"
                      data-testid="prayer-share-feedback-loved-one"
                    >
                      {sharedFeedback['loved-one']}
                    </span>
                  )}
                  <button
                    type="button"
                    className="prayer-line-share-btn"
                    data-testid="prayer-share-btn-loved-one"
                    disabled={!lovedOneText.trim()}
                    onClick={() =>
                      handleShareLine('loved-one', lovedOneText, lovedOneAnon)
                    }
                  >
                    Share line to group
                  </button>
                </div>
              </div>
            </div>

            {/* Prompt 3: For the Church/world */}
            <div
              className="prayer-card-prompt-card"
              data-testid="prayer-card-prompt-church-world"
            >
              <div className="prayer-prompt-header-row">
                <span className="prayer-prompt-audience">
                  {PRAYER_PROMPT_CONFIG['church-world'].audienceLabel}
                </span>
                <span className="prayer-prompt-char-count">
                  {churchWorldText.length} / 280
                </span>
              </div>
              <label
                htmlFor="prayer-textarea-church-world"
                className="prayer-prompt-prefix"
              >
                {PRAYER_PROMPT_CONFIG['church-world'].promptPrefix} …
              </label>
              <textarea
                id="prayer-textarea-church-world"
                className="prayer-prompt-textarea"
                data-testid="prayer-input-church-world"
                placeholder={PRAYER_PROMPT_CONFIG['church-world'].placeholder}
                value={churchWorldText}
                maxLength={280}
                rows={3}
                onChange={(e) => handleChurchWorldChange(e.target.value)}
              />

              <div className="prayer-line-actions-row">
                <label className="prayer-anon-toggle-label">
                  <input
                    type="checkbox"
                    className="prayer-anon-checkbox"
                    data-testid="prayer-anon-toggle-church-world"
                    checked={churchWorldAnon}
                    onChange={(e) => setChurchWorldAnon(e.target.checked)}
                  />
                  <span>Share anonymously</span>
                </label>

                <div className="prayer-share-btn-wrapper">
                  {sharedFeedback['church-world'] && (
                    <span
                      className="prayer-share-feedback"
                      data-testid="prayer-share-feedback-church-world"
                    >
                      {sharedFeedback['church-world']}
                    </span>
                  )}
                  <button
                    type="button"
                    className="prayer-line-share-btn"
                    data-testid="prayer-share-btn-church-world"
                    disabled={!churchWorldText.trim()}
                    onClick={() =>
                      handleShareLine(
                        'church-world',
                        churchWorldText,
                        churchWorldAnon,
                      )
                    }
                  >
                    Share line to group
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Export Action CTA */}
          <div className="prayer-card-footer">
            {exportFeedback && (
              <div
                className="prayer-export-status"
                data-testid="prayer-export-status"
                role="status"
              >
                {exportFeedback}
              </div>
            )}
            <button
              type="button"
              className="prayer-card-export-cta"
              data-testid="export-prayer-card-btn"
              disabled={isExporting}
              onClick={handleExportPng}
            >
              <span className="prayer-card-export-icon" aria-hidden="true">
                ✨
              </span>
              <span>
                {isExporting ? 'Preparing Keepsake…' : 'Export Prayer Card (PNG)'}
              </span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

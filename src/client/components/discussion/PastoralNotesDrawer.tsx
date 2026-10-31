import { motion, AnimatePresence } from 'motion/react';
import { useState } from 'react';
import type { StudyDocument } from '../../../shared/study';
import type { SessionDiscussionQuestion } from '../../../shared/session';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';

export interface PastoralNotesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  studyDocument?: StudyDocument | null;
  activeQuestion?: SessionDiscussionQuestion | null;
}

type PastoralTab = 'active-q' | 'doctrine' | 'commentary' | 'application';

export function PastoralNotesDrawer({
  isOpen,
  onClose,
  studyDocument,
  activeQuestion,
}: PastoralNotesDrawerProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [activeTab, setActiveTab] = useState<PastoralTab>('doctrine');

  if (!isOpen) {
    return null;
  }

  const deepAnalysis = studyDocument?.deepAnalysis;
  const activeQuestionDetail = deepAnalysis?.reflectionQuestions.find(
    (q) => q.id === activeQuestion?.id,
  );

  return (
    <AnimatePresence>
      <div
        className="pastoral-drawer-overlay"
        onClick={onClose}
        data-testid="pastoral-drawer-backdrop"
      >
        <motion.div
          className="pastoral-drawer-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Facilitator Pastoral Notes"
          data-testid="pastoral-notes-drawer"
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
          <div className="pastoral-drawer-header">
            <div className="pastoral-drawer-brand">
              <span className="pastoral-drawer-badge">STUDY LEADER ONLY</span>
              <h2 className="pastoral-drawer-title">Pastoral & Doctrinal Notes</h2>
            </div>
            <button
              type="button"
              className="pastoral-drawer-close-btn"
              onClick={onClose}
              data-testid="close-pastoral-notes"
              aria-label="Close pastoral notes"
            >
              ✕
            </button>
          </div>

          <div className="pastoral-tabs-row" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'doctrine'}
              className={`pastoral-tab-btn ${activeTab === 'doctrine' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('doctrine')}
              data-testid="pastoral-tab-doctrine"
            >
              Catholic Doctrine
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'commentary'}
              className={`pastoral-tab-btn ${activeTab === 'commentary' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('commentary')}
              data-testid="pastoral-tab-commentary"
            >
              A–J Commentary
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'active-q'}
              className={`pastoral-tab-btn ${activeTab === 'active-q' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('active-q')}
              data-testid="pastoral-tab-active-q"
            >
              Active Prompt Notes
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'application'}
              className={`pastoral-tab-btn ${activeTab === 'application' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('application')}
              data-testid="pastoral-tab-application"
            >
              YA Application
            </button>
          </div>

          <div className="pastoral-drawer-content">
            {activeTab === 'doctrine' && (
              <div
                className="pastoral-tab-panel"
                data-testid="pastoral-doctrine-section"
              >
                <div className="pastoral-notice-card">
                  <span className="pastoral-notice-eyebrow">
                    DOCTRINAL GUARDRAIL · ROMANS 11:29
                  </span>
                  <p className="pastoral-notice-text">
                    The Church firmly rejects anti-Jewish contempt and affirms
                    God&apos;s irrevocable covenant with Israel (CCC 839–840,
                    Nostra Aetate 4). Jesus tests faith without revoking
                    Israel&apos;s dignity.
                  </p>
                </div>

                <div className="pastoral-items-list">
                  {deepAnalysis?.catholicDoctrine.map((doc) => (
                    <article key={doc.id} className="pastoral-item-card">
                      <div className="pastoral-item-header">
                        <span className="pastoral-item-id">Point {doc.id}</span>
                        <h3 className="pastoral-item-title">{doc.title}</h3>
                      </div>
                      <p className="pastoral-item-summary">{doc.summary}</p>
                      {doc.references.length > 0 && (
                        <div className="pastoral-item-refs">
                          {doc.references.map((ref) => (
                            <span key={ref} className="pastoral-ref-pill">
                              {ref}
                            </span>
                          ))}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'commentary' && (
              <div
                className="pastoral-tab-panel"
                data-testid="pastoral-commentary-section"
              >
                <p className="pastoral-section-intro">
                  Verse-by-verse analysis of Matthew 15:21–28 with patristic
                  insights from St. Augustine, St. John Chrysostom, and St.
                  Jerome.
                </p>
                <div className="pastoral-items-list">
                  {deepAnalysis?.verseCommentary.map((comm) => (
                    <article key={comm.id} className="pastoral-item-card">
                      <div className="pastoral-item-header">
                        <span className="pastoral-item-id">
                          Section {comm.id} · {comm.verseCitation}
                        </span>
                      </div>
                      <blockquote className="pastoral-quote">
                        &ldquo;{comm.quotedText}&rdquo;
                      </blockquote>
                      <p className="pastoral-item-summary">{comm.commentary}</p>
                      {comm.patristicNote && (
                        <div
                          className="pastoral-patristic-note"
                          data-testid={`patristic-note-${comm.id}`}
                        >
                          <span className="pastoral-patristic-label">
                            Patristic Voice
                          </span>
                          <p>{comm.patristicNote}</p>
                        </div>
                      )}
                      {comm.catechismReferences.length > 0 && (
                        <div className="pastoral-item-refs">
                          {comm.catechismReferences.map((ref) => (
                            <span key={ref} className="pastoral-ref-pill">
                              {ref}
                            </span>
                          ))}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'active-q' && (
              <div
                className="pastoral-tab-panel"
                data-testid="pastoral-active-q-section"
              >
                {activeQuestion ? (
                  <div className="pastoral-active-q-card">
                    <span className="pastoral-active-badge">
                      QUESTION {activeQuestion.number} · {activeQuestion.category}
                    </span>
                    <h3 className="pastoral-active-prompt">
                      {activeQuestion.prompt}
                    </h3>

                    {activeQuestionDetail ? (
                      <>
                        <div className="pastoral-field-group">
                          <h4 className="pastoral-field-label">
                            Sample Answer / Core Insight
                          </h4>
                          <p
                            className="pastoral-field-body"
                            data-testid="pastoral-sample-answer"
                          >
                            {activeQuestionDetail.sampleAnswer}
                          </p>
                        </div>

                        <div className="pastoral-field-group">
                          <h4 className="pastoral-field-label">
                            Facilitator Listening Cues & Pastoral Note
                          </h4>
                          <p
                            className="pastoral-field-body"
                            data-testid="pastoral-leader-note"
                          >
                            {activeQuestionDetail.leaderNote}
                          </p>
                        </div>
                      </>
                    ) : (
                      <p className="pastoral-empty-note">
                        This is a custom reflection prompt entered during the
                        session.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="pastoral-empty-note">
                    No active question selected in the queue.
                  </p>
                )}
              </div>
            )}

            {activeTab === 'application' && (
              <div
                className="pastoral-tab-panel"
                data-testid="pastoral-application-section"
              >
                <div className="pastoral-items-list">
                  {deepAnalysis?.youngAdultApplication.map((app) => (
                    <article key={app.id} className="pastoral-item-card">
                      <div className="pastoral-item-header">
                        <span className="pastoral-item-id">Theme {app.id}</span>
                        <h3 className="pastoral-item-title">{app.title}</h3>
                      </div>
                      <p className="pastoral-item-summary">{app.summary}</p>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

import { useEffect, useMemo, useState } from 'react';
import type { SanctuaryRole } from '../../../shared/health';
import type { PublicLiveSessionSnapshot } from '../../../shared/session';
import type { StudyDocument } from '../../../shared/study';
import { resolveSacredStage, useSacredStageStore } from '../../state/sacredStageStore';
import { SectionProgressHeader } from '../sections/SectionProgressHeader';
import { ApplicationCard } from './ApplicationCard';
import { CommentaryCard } from './CommentaryCard';
import { DoctrineCard } from './DoctrineCard';

export type DeepAnalysisTab = 'all' | 'commentary' | 'doctrine' | 'application';

export interface DeepAnalysisScreenProps {
  role?: SanctuaryRole;
  isLeader?: boolean;
  session?: PublicLiveSessionSnapshot | null;
  localStudyDocument?: StudyDocument | null;
  publicUrl?: string | null;
  onShareQr?: () => void;
  onPreviousSection?: () => void | Promise<void>;
  onNextSection?: () => void | Promise<void>;
}

/**
 * Section 4 of 6: Deep Analysis.
 * Presents the parsed Matthew 15:21–28 Gospel breakdown:
 * - A–J Verse-by-verse commentary with Catechism citations (and facilitator patristic notes for Study Leader)
 * - A–D Key Catholic Doctrine dogmas & teachings
 * - A–D Application for Young Adults pastoral guidance
 * Includes mobile section filter tabs, Study Leader bidirectional navigation (← Previous to Section 3,
 * Continue to Discussion → to Section 5), and Participant waiting status.
 */
export function DeepAnalysisScreen({
  role = 'Participant',
  isLeader = false,
  session = null,
  localStudyDocument = null,
  publicUrl = null,
  onShareQr,
  onPreviousSection,
  onNextSection,
}: DeepAnalysisScreenProps) {
  const effectiveIsLeader = Boolean(isLeader || role === 'Study Leader');
  const [activeTab, setActiveTab] = useState<DeepAnalysisTab>('all');
  const setStage = useSacredStageStore((s) => s.setStage);

  useEffect(() => {
    const resolved = resolveSacredStage({ screen: 'section-4-deep-analysis' });
    setStage(resolved.stage, { accentMode: resolved.accentMode });
  }, [setStage]);

  const analysis = useMemo(() => {
    return session?.study?.deepAnalysis ?? localStudyDocument?.deepAnalysis ?? null;
  }, [session?.study?.deepAnalysis, localStudyDocument?.deepAnalysis]);

  const verseCommentary = analysis?.verseCommentary ?? [];
  const catholicDoctrine = analysis?.catholicDoctrine ?? [];
  const youngAdultApplication = analysis?.youngAdultApplication ?? [];

  // Map facilitator-only patristic notes by verse commentary ID for Study Leader
  const patristicNotesMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!effectiveIsLeader || !localStudyDocument?.deepAnalysis?.verseCommentary) {
      return map;
    }
    for (const item of localStudyDocument.deepAnalysis.verseCommentary) {
      if (item.patristicNote) {
        map.set(item.id, item.patristicNote);
      }
    }
    return map;
  }, [effectiveIsLeader, localStudyDocument]);

  const showCommentary = activeTab === 'all' || activeTab === 'commentary';
  const showDoctrine = activeTab === 'all' || activeTab === 'doctrine';
  const showApplication = activeTab === 'all' || activeTab === 'application';

  return (
    <section
      className="deep-analysis-screen"
      data-testid="deep-analysis-screen"
      data-section-number={4}
      aria-label="Section 4 of 6, Deep Analysis"
    >
      <div
        className="deep-analysis-container"
        data-testid="deep-analysis-placeholder"
      >
        <SectionProgressHeader
          sectionNumber={4}
          isLeader={effectiveIsLeader}
          sessionCode={session?.sessionCode}
          publicUrl={publicUrl}
          onShareQr={onShareQr}
        />

        <header className="deep-analysis-header">
          <span
            className="deep-analysis-eyebrow"
            data-testid="deep-analysis-eyebrow"
          >
            {analysis?.eyebrow ?? 'DEEP ANALYSIS · 15 MIN'}
          </span>
          <h2
            className="deep-analysis-title"
            data-testid="deep-analysis-title"
          >
            {analysis?.title ?? 'Deep Analysis & Catholic Doctrine'}
          </h2>
          <p className="deep-analysis-subtitle">
            Unpacking the theological depth, Catholic doctrine, and young adult life
            application of Matthew 15:21–28.
          </p>
        </header>

        <nav
          className="deep-analysis-tabs"
          data-testid="deep-analysis-tabs"
          role="tablist"
          aria-label="Deep Analysis Sections"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'all'}
            className={`deep-analysis-tab-btn ${activeTab === 'all' ? 'active' : ''}`}
            data-testid="tab-all"
            onClick={() => setActiveTab('all')}
          >
            All Insights ({verseCommentary.length + catholicDoctrine.length + youngAdultApplication.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'commentary'}
            className={`deep-analysis-tab-btn ${activeTab === 'commentary' ? 'active' : ''}`}
            data-testid="tab-commentary"
            onClick={() => setActiveTab('commentary')}
          >
            Commentary ({verseCommentary.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'doctrine'}
            className={`deep-analysis-tab-btn ${activeTab === 'doctrine' ? 'active' : ''}`}
            data-testid="tab-doctrine"
            onClick={() => setActiveTab('doctrine')}
          >
            Doctrine ({catholicDoctrine.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'application'}
            className={`deep-analysis-tab-btn ${activeTab === 'application' ? 'active' : ''}`}
            data-testid="tab-application"
            onClick={() => setActiveTab('application')}
          >
            Application ({youngAdultApplication.length})
          </button>
        </nav>

        <main className="deep-analysis-content-stream">
          {showCommentary && verseCommentary.length > 0 && (
            <section
              className="deep-analysis-subsection commentary-subsection"
              aria-labelledby="commentary-subheading"
            >
              <div className="subsection-header-row">
                <h3
                  id="commentary-subheading"
                  className="subsection-heading"
                  data-testid="commentary-section-heading"
                >
                  Verse-by-Verse Commentary
                </h3>
                <span className="subsection-count-pill">
                  {verseCommentary.length} verses
                </span>
              </div>
              <div className="commentary-items-list">
                {verseCommentary.map((item, idx) => (
                  <CommentaryCard
                    key={item.id}
                    item={item}
                    index={idx}
                    patristicNote={patristicNotesMap.get(item.id) ?? null}
                  />
                ))}
              </div>
            </section>
          )}

          {showDoctrine && catholicDoctrine.length > 0 && (
            <section
              className="deep-analysis-subsection doctrine-subsection"
              aria-labelledby="doctrine-subheading"
            >
              <div className="subsection-header-row">
                <h3
                  id="doctrine-subheading"
                  className="subsection-heading"
                  data-testid="doctrine-section-heading"
                >
                  Key Catholic Doctrine
                </h3>
                <span className="subsection-count-pill">
                  {catholicDoctrine.length} dogmas
                </span>
              </div>
              <div className="doctrine-items-list">
                {catholicDoctrine.map((item, idx) => (
                  <DoctrineCard key={item.id} item={item} index={idx} />
                ))}
              </div>
            </section>
          )}

          {showApplication && youngAdultApplication.length > 0 && (
            <section
              className="deep-analysis-subsection application-subsection"
              aria-labelledby="application-subheading"
            >
              <div className="subsection-header-row">
                <h3
                  id="application-subheading"
                  className="subsection-heading"
                  data-testid="application-section-heading"
                >
                  Application for Young Adults
                </h3>
                <span className="subsection-count-pill">
                  {youngAdultApplication.length} applications
                </span>
              </div>
              <div className="application-items-list">
                {youngAdultApplication.map((item, idx) => (
                  <ApplicationCard key={item.id} item={item} index={idx} />
                ))}
              </div>
            </section>
          )}

          {!analysis && (
            <p className="deep-analysis-empty-copy">
              Gospel commentary and analysis content will appear once the study is loaded.
            </p>
          )}
        </main>

        {effectiveIsLeader ? (
          <footer
            className="leader-advance-nav-row"
            data-testid="deep-analysis-advance-zone"
          >
            {onPreviousSection && (
              <button
                type="button"
                className="section-previous-btn"
                data-testid="previous-section-btn"
                onClick={() => {
                  void onPreviousSection();
                }}
              >
                ← Previous
              </button>
            )}
            {onNextSection && (
              <button
                type="button"
                className="deep-analysis-advance-cta"
                data-testid="deep-analysis-advance-cta"
                onClick={() => {
                  void onNextSection();
                }}
              >
                Continue to Discussion →
              </button>
            )}
          </footer>
        ) : (
          <footer className="participant-advance-zone">
            <div
              className="locked-advance-bar"
              data-testid="locked-advance-bar"
              data-role="participant"
              role="status"
            >
              <span className="locked-advance-icon" aria-hidden="true">
                ⓘ
              </span>
              <span className="locked-advance-copy">
                The study leader will begin discussion shortly.
              </span>
            </div>
          </footer>
        )}
      </div>
    </section>
  );
}

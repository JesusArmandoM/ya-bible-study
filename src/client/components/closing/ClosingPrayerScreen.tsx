import { motion } from 'motion/react';
import { useEffect } from 'react';
import type { SanctuaryRole } from '../../../shared/health';
import type { PublicLiveSessionSnapshot } from '../../../shared/session';
import type { StudyDocument } from '../../../shared/study';
import {
  resolveSacredStage,
  useSacredStageStore,
} from '../../state/sacredStageStore';
import { SectionProgressHeader } from '../sections/SectionProgressHeader';
import { ClosingPrayerCard } from './ClosingPrayerCard';
import { LiveSessionStatsCard } from './LiveSessionStatsCard';
import { NextWeekCard } from './NextWeekCard';
import { WeeklyChallengesCard } from './WeeklyChallengesCard';

export interface ClosingPrayerScreenProps {
  role: SanctuaryRole;
  session: PublicLiveSessionSnapshot;
  localStudyDocument?: StudyDocument | null;
  memberId?: string | null;
  onFinishStudy: () => void | Promise<void>;
  isSubmitting?: boolean;
}

export function ClosingPrayerScreen({
  role,
  session,
  localStudyDocument,
  memberId,
  onFinishStudy,
  isSubmitting = false,
}: ClosingPrayerScreenProps) {
  const setStage = useSacredStageStore((s) => s.setStage);
  const isLeader = role === 'Study Leader';

  useEffect(() => {
    const resolved = resolveSacredStage({ screen: 'section-5-closing' });
    setStage(resolved.stage, { accentMode: resolved.accentMode });
  }, [setStage]);

  const closingContent = session.study?.closing ?? localStudyDocument?.closing ?? null;
  const challenges = closingContent?.weeklyChallenges ?? [];
  const nextWeekAnnouncement = closingContent?.nextWeekAnnouncement ?? null;
  const prayerText = closingContent?.closingPrayerText ?? null;

  return (
    <div className="closing-screen-container" data-testid="closing-prayer-screen">
      <SectionProgressHeader sectionNumber={5} />

      <header className="closing-header-lockup">
        <span className="closing-eyebrow">WRAPPING UP</span>
        <h2 className="closing-title">Closing Prayer</h2>
      </header>

      <div className="closing-content-stack">
        <LiveSessionStatsCard session={session} />

        <NextWeekCard announcement={nextWeekAnnouncement} />

        <WeeklyChallengesCard
          challenges={challenges}
          sessionCode={session.sessionCode}
          memberId={memberId}
        />

        <ClosingPrayerCard prayerText={prayerText} />
      </div>

      <div className="closing-bottom-zone">
        {isLeader ? (
          <motion.button
            type="button"
            className="closing-finish-btn"
            data-testid="finish-study-btn"
            disabled={isSubmitting}
            whileTap={{ scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 420, damping: 26 }}
            onClick={() => {
              void onFinishStudy();
            }}
          >
            <span className="closing-finish-icon" aria-hidden="true">
              ✓
            </span>
            <span>Finish study</span>
          </motion.button>
        ) : (
          <div
            className="closing-waiting-bar"
            data-testid="participant-waiting-bar"
            role="status"
            aria-live="polite"
          >
            <span className="closing-waiting-icon" aria-hidden="true">
              🔒
            </span>
            <span>Waiting for Study Leader to conclude study...</span>
          </div>
        )}
      </div>
    </div>
  );
}

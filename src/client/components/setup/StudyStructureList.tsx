import { motion } from 'motion/react';
import {
  getStudySections,
  type StudyDocument,
  type StudySection,
} from '../../../shared/study';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';

export interface StudyStructureListProps {
  study: StudyDocument;
}

/**
 * Canonical 5-section study structure names (docs/domain-model.md). The
 * per-study `StudySection.title` may vary (e.g. an Icebreaker theme title) and
 * is shown as a secondary line when it differs from the canonical name.
 */
const CANONICAL_SECTION_NAMES: Record<StudySection['sectionId'], string> = {
  section_1_prayer: 'Opening Prayer',
  section_2_icebreaker: 'Icebreaker',
  section_3_reading: 'Gospel Reading',
  section_4_discussion: 'Deep Analysis & Discussion',
  section_5_closing: 'Closing Prayer',
};

/**
 * Read-only 5-row confirmation list of the detected study structure. The
 * Gospel Reading row presents **only** the Gospel citation — never Old
 * Testament, Psalm, Epistle, or any pastoral/facilitator field.
 */
export function StudyStructureList({ study }: StudyStructureListProps) {
  const reducedMotion = usePrefersReducedMotion();
  const sections = getStudySections(study);

  return (
    <ol
      className="study-structure-list"
      data-testid="study-structure-list"
      aria-label="Detected study structure"
    >
      {sections.map((section, index) => {
        const rowNumber = index + 1;
        const canonicalName = CANONICAL_SECTION_NAMES[section.sectionId];
        const showStudyTitle = section.title !== canonicalName;
        const isGospelRow = section.sectionId === 'section_3_reading';

        return (
          <motion.li
            key={section.sectionId}
            className="study-structure-row"
            data-testid={`study-structure-row-${rowNumber}`}
            initial={reducedMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              type: 'spring',
              stiffness: 280,
              damping: 28,
              delay: reducedMotion ? 0 : index * 0.05,
            }}
          >
            <div className="study-structure-row-head">
              <span className="study-structure-row-name">{canonicalName}</span>
              <span className="study-structure-row-duration">
                Section {rowNumber} of 5 · {section.durationLabel}
              </span>
            </div>

            {showStudyTitle && (
              <span className="study-structure-row-title">{section.title}</span>
            )}

            {isGospelRow && (
              <span
                className="study-structure-row-citation"
                data-testid="study-structure-gospel-citation"
              >
                {study.gospelReading.citation}
              </span>
            )}
          </motion.li>
        );
      })}
    </ol>
  );
}

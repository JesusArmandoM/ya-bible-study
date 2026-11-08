import { motion } from 'motion/react';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';
import { getTextItemMotion } from '../common/AnimatedTextReveal';

export interface IcebreakerPromptCardProps {
  /** Sanitized group-facing main question (from the `/ws` summary). */
  mainQuestion?: string | null;
  /** Sanitized group-facing follow-up question (from the `/ws` summary). */
  followUpQuestion?: string | null;
}

const QUESTION_FALLBACK = 'The leader will share the icebreaker question shortly.';

/**
 * Section 2 QUESTION card (`ux/7`): `#1F2442` surface, gold `QUESTION`
 * eyebrow, the main question in editorial serif `#F8FAFC`, a hairline divider,
 * and the italic serif follow-up `#E2E8F0`. Both roles may render this card;
 * its content comes exclusively from the participant-visible `study.icebreaker`
 * wire projection (never the leader-only fields).
 */
export function IcebreakerPromptCard({
  mainQuestion = null,
  followUpQuestion = null,
}: IcebreakerPromptCardProps) {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <section
      className="icebreaker-prompt-card"
      data-testid="icebreaker-prompt-card"
      aria-label="Icebreaker question"
    >
      <motion.span
        className="icebreaker-prompt-eyebrow"
        data-testid="icebreaker-prompt-eyebrow"
        {...getTextItemMotion(reducedMotion, 3)}
      >
        QUESTION
      </motion.span>
      <motion.p
        className="icebreaker-prompt-question icebreaker-description"
        data-testid="icebreaker-prompt-question"
        {...getTextItemMotion(reducedMotion, 4)}
      >
        {mainQuestion ?? QUESTION_FALLBACK}
      </motion.p>
      <hr
        className="icebreaker-prompt-divider"
        data-testid="icebreaker-prompt-divider"
        aria-hidden="true"
      />
      {followUpQuestion && (
        <motion.p
          className="icebreaker-prompt-followup icebreaker-description"
          data-testid="icebreaker-prompt-followup"
          {...getTextItemMotion(reducedMotion, 5)}
        >
          {followUpQuestion}
        </motion.p>
      )}
    </section>
  );
}

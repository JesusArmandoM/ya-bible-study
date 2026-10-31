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
  return (
    <section
      className="icebreaker-prompt-card"
      data-testid="icebreaker-prompt-card"
      aria-label="Icebreaker question"
    >
      <span className="icebreaker-prompt-eyebrow" data-testid="icebreaker-prompt-eyebrow">
        QUESTION
      </span>
      <p className="icebreaker-prompt-question" data-testid="icebreaker-prompt-question">
        {mainQuestion ?? QUESTION_FALLBACK}
      </p>
      <hr
        className="icebreaker-prompt-divider"
        data-testid="icebreaker-prompt-divider"
        aria-hidden="true"
      />
      {followUpQuestion && (
        <p
          className="icebreaker-prompt-followup"
          data-testid="icebreaker-prompt-followup"
        >
          {followUpQuestion}
        </p>
      )}
    </section>
  );
}

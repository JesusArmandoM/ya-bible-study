export interface ExamplesToListenForCardProps {
  /**
   * Facilitator listening cues from the locally held `StudyDocument`
   * (`localStudyDocument.icebreaker.examplesToListenFor`). Never synced over
   * `/ws`; when absent on this device the neutral fallback note renders and no
   * seed content from another study is substituted.
   */
  examplesToListenFor?: readonly string[] | null;
  /** Facilitator-only leader note (`localStudyDocument.icebreaker.leaderNote`). */
  leaderNote?: string | null;
}

const FALLBACK_NOTE = 'Facilitator examples unavailable on this device.';

/**
 * Study Leader-only "EXAMPLES TO LISTEN FOR" card (`ux/7`). Sourced from
 * `localStudyDocument` — the accepted `OpeningPrayerScreen` `leaderPrompt`
 * provenance pattern — so the leader-only copy never renders in a Participant
 * DOM and never crosses `/ws`.
 */
export function ExamplesToListenForCard({
  examplesToListenFor = null,
  leaderNote = null,
}: ExamplesToListenForCardProps) {
  const examples = examplesToListenFor ?? [];
  const hasContent = examples.length > 0 || (leaderNote ?? '').length > 0;

  return (
    <section
      className="icebreaker-examples-card"
      data-testid="icebreaker-examples-card"
      aria-label="Examples to listen for"
    >
      <span className="icebreaker-examples-eyebrow" data-testid="icebreaker-examples-eyebrow">
        EXAMPLES TO LISTEN FOR
      </span>
      {hasContent ? (
        <>
          <ul className="icebreaker-examples-list" data-testid="icebreaker-examples-list">
            {examples.map((example) => (
              <li
                className="icebreaker-examples-item"
                data-testid="icebreaker-examples-item"
                key={example}
              >
                {example}
              </li>
            ))}
          </ul>
          {leaderNote && (
            <p className="icebreaker-examples-note" data-testid="icebreaker-examples-note">
              {leaderNote}
            </p>
          )}
        </>
      ) : (
        <p className="icebreaker-examples-fallback" data-testid="icebreaker-examples-fallback">
          {FALLBACK_NOTE}
        </p>
      )}
    </section>
  );
}

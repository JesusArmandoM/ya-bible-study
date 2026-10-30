export interface OpeningPrayerCardProps {
  /** Participant-visible suggested prayer text (`study.openingPrayer`). */
  suggestedPrayerText: string | null | undefined;
}

/**
 * Scripture-italic suggested prayer card (`SUGGESTED OPENING PRAYER`).
 * Renders the full prayer text without truncation (DESIGN: readable on 375px)
 * and degrades to a clear fallback when the synced content is unavailable.
 */
export function OpeningPrayerCard({
  suggestedPrayerText,
}: OpeningPrayerCardProps) {
  const hasText =
    typeof suggestedPrayerText === 'string' && suggestedPrayerText.trim().length > 0;

  return (
    <section
      className="prayer-text-card"
      aria-label="Suggested opening prayer"
    >
      <span className="prayer-text-label">SUGGESTED OPENING PRAYER</span>
      {hasText ? (
        <p className="prayer-text-body" data-testid="opening-prayer-text">
          {suggestedPrayerText}
        </p>
      ) : (
        <p
          className="prayer-text-body prayer-text-body-fallback"
          data-testid="opening-prayer-text"
        >
          Opening Prayer content unavailable
        </p>
      )}
    </section>
  );
}

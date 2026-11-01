export interface ClosingPrayerCardProps {
  prayerText?: string | null;
}

const DEFAULT_CLOSING_PRAYER =
  'Lord Jesus, Son of David, have mercy on us. When we feel like outsiders, draw us closer. When You seem silent, teach us to persevere. When we are proud, make us humble. When we are discouraged, strengthen our faith. When we are tempted to send others away, give us Your heart of mercy. Make Your Church a house of prayer for all peoples. Let all nations praise You. Heal those we carry in our hearts. And say over us, by Your grace: "Great is your faith." Amen.';

export function ClosingPrayerCard({ prayerText }: ClosingPrayerCardProps) {
  const text = prayerText ?? DEFAULT_CLOSING_PRAYER;

  return (
    <section
      className="closing-prayer-card"
      data-testid="closing-prayer-card"
      aria-label="Closing prayer"
    >
      <div className="closing-prayer-eyebrow">CLOSING PRAYER</div>
      <p className="closing-prayer-text">{text}</p>
    </section>
  );
}

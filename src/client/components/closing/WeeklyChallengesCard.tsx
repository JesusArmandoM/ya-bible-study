import { useEffect, useState } from 'react';
import type { SessionWeeklyChallengeItem } from '../../../shared/session';

export interface WeeklyChallengesCardProps {
  challenges: SessionWeeklyChallengeItem[];
  sessionCode: string;
  memberId?: string | null;
}

const DEFAULT_CHALLENGES: SessionWeeklyChallengeItem[] = [
  {
    optionNumber: 1,
    title: 'Persistent Prayer',
    description:
      'Intercede daily by name all week for one suffering person without giving up.',
  },
  {
    optionNumber: 2,
    title: 'Humble Prayer',
    description:
      'Begin each day with the Canaanite woman\'s simple prayer: "Lord, help me."',
  },
  {
    optionNumber: 3,
    title: 'Catholic Hospitality',
    description:
      'Intentionally reach out to someone feeling like an outsider at Mass, work, or young adult group.',
  },
  {
    optionNumber: 4,
    title: 'Eucharistic Humility',
    description:
      'Pray "Lord, I am not worthy..." slowly and attentively before Holy Communion.',
  },
];

export function WeeklyChallengesCard({
  challenges,
  sessionCode,
  memberId,
}: WeeklyChallengesCardProps) {
  const items = challenges.length > 0 ? challenges : DEFAULT_CHALLENGES;
  const storageKey = `ya-bible-study.weekly-challenge.${sessionCode}.${memberId ?? 'anon'}`;

  const [selectedOption, setSelectedOption] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (parsed >= 1 && parsed <= 4) {
          return parsed;
        }
      }
    } catch {
      // Ignore localStorage errors
    }
    return null;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (selectedOption !== null) {
        window.localStorage.setItem(storageKey, String(selectedOption));
      }
    } catch {
      // Ignore localStorage errors
    }
  }, [selectedOption, storageKey]);

  const handleSelectOption = (optionNumber: number) => {
    setSelectedOption((current) => (current === optionNumber ? null : optionNumber));
  };

  return (
    <section
      className="closing-challenges-card"
      data-testid="weekly-challenges-card"
      aria-label="Practical weekly spiritual challenges"
    >
      <div className="closing-card-header">
        <span className="closing-card-eyebrow">CHOOSE ONE CHALLENGE FOR THE WEEK</span>
      </div>

      <div className="closing-challenges-grid" role="group" aria-label="Weekly challenges">
        {items.map((challenge) => {
          const isSelected = selectedOption === challenge.optionNumber;
          return (
            <button
              key={challenge.optionNumber}
              type="button"
              className={`closing-challenge-item ${isSelected ? 'is-selected' : ''}`}
              data-testid={`weekly-challenge-${challenge.optionNumber}`}
              aria-pressed={isSelected}
              onClick={() => handleSelectOption(challenge.optionNumber)}
            >
              <div className="closing-challenge-top">
                <span className="closing-challenge-num" aria-hidden="true">
                  {challenge.optionNumber}
                </span>
                <span className="closing-challenge-title">{challenge.title}</span>
                <span className="closing-challenge-check" aria-hidden="true">
                  {isSelected ? '✓' : ''}
                </span>
              </div>
              <p className="closing-challenge-desc">{challenge.description}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}

import { describe, expect, it } from 'vitest';
import {
  SESSION_STUDY_SUMMARY_MAX_FIELD_LENGTH,
  SESSION_STUDY_SUMMARY_MAX_PRAYER_TEXT_LENGTH,
  SESSION_STUDY_SUMMARY_MAX_TITLE_LENGTH,
  normalizeSessionClosingContent,
  normalizeSessionStudySummary,
  toSessionClosingContent,
  toSessionStudySummary,
} from '../../src/shared/session';
import { getDefaultStudyDocument } from '../../src/server/studies/greatIsYourFaithSeed';

const BASE_SUMMARY = {
  title: 'Great Is Your Faith',
  subtitle: 'From persistence to trust',
  liturgicalEyebrow: 'MATTHEW 15:21–28',
  gospelCitation: 'Matthew 15:21–28',
  gospelSummaryLabel: 'Gospel of Matthew 15:21–28',
  sectionCount: 5,
  estimatedMinutes: 45,
};

const VALID_CLOSING_CONTENT = {
  title: 'Closing Prayer',
  eyebrow: 'WRAPPING UP',
  durationLabel: '3 min',
  summaryBullets: [
    "God's house is a house of prayer for all peoples.",
    'Apparent divine silence is never abandonment.',
  ],
  weeklyChallenges: [
    {
      optionNumber: 1,
      title: 'Persistent Prayer',
      description: 'Intercede daily by name all week for one suffering person without giving up.',
    },
    {
      optionNumber: 2,
      title: 'Humble Prayer',
      description: 'Begin each day with the simple prayer: "Lord, help me."',
    },
    {
      optionNumber: 3,
      title: 'Catholic Hospitality',
      description: 'Intentionally reach out to someone feeling like an outsider.',
    },
    {
      optionNumber: 4,
      title: 'Eucharistic Humility',
      description: 'Pray "Lord, I am not worthy..." slowly before Holy Communion.',
    },
  ],
  nextWeekAnnouncement: {
    title: 'Faith that Endures',
    citation: 'James 1:2–4',
    displayLabel: '"Faith that Endures" — James 1:2–4',
  },
  closingPrayerText:
    'Lord Jesus, Son of David, have mercy on us. Great is your faith. Amen.',
};

describe('SessionClosingContent projection', () => {
  it('projects all participant-visible Section 5 fields from seed', () => {
    const seed = getDefaultStudyDocument();
    const closing = toSessionClosingContent(seed.closing);

    expect(Object.keys(closing).sort()).toEqual([
      'closingPrayerText',
      'durationLabel',
      'eyebrow',
      'nextWeekAnnouncement',
      'summaryBullets',
      'title',
      'weeklyChallenges',
    ]);
    expect(closing.title).toBe('Closing Prayer');
    expect(closing.eyebrow).toBe('WRAPPING UP');
    expect(closing.durationLabel).toBe('3 min');
    expect(closing.summaryBullets).toHaveLength(4);
    expect(closing.weeklyChallenges).toHaveLength(4);
    expect(closing.weeklyChallenges[0]).toEqual({
      optionNumber: 1,
      title: 'Persistent Prayer',
      description:
        'Intercede daily by name all week for one suffering person without giving up.',
    });
    expect(closing.nextWeekAnnouncement).toEqual({
      title: 'Faith that Endures',
      citation: 'James 1:2–4',
      displayLabel: '"Faith that Endures" — James 1:2–4',
    });
    expect(closing.closingPrayerText).toContain('Lord Jesus, Son of David, have mercy on us.');
    expect(closing.closingPrayerText).toContain('"Great is your faith." Amen.');
  });

  it('provides defensive array cloning for summaryBullets and weeklyChallenges', () => {
    const seed = getDefaultStudyDocument();
    const closing = toSessionClosingContent(seed.closing);

    expect(closing.summaryBullets).not.toBe(seed.closing.summaryBullets);
    expect(closing.weeklyChallenges).not.toBe(seed.closing.weeklyChallenges);
  });

  it('projects closing section in toSessionStudySummary', () => {
    const seed = getDefaultStudyDocument();
    const summary = toSessionStudySummary(seed);

    expect(summary.closing).toBeDefined();
    expect(summary.closing?.title).toBe('Closing Prayer');
    expect(summary.closing?.weeklyChallenges).toHaveLength(4);
  });
});

describe('normalizeSessionClosingContent validation', () => {
  it('accepts and normalizes valid closing payload', () => {
    const normalized = normalizeSessionClosingContent(VALID_CLOSING_CONTENT);

    expect(normalized).not.toBeNull();
    expect(normalized?.title).toBe('Closing Prayer');
    expect(normalized?.eyebrow).toBe('WRAPPING UP');
    expect(normalized?.durationLabel).toBe('3 min');
    expect(normalized?.summaryBullets).toHaveLength(2);
    expect(normalized?.weeklyChallenges).toHaveLength(4);
    expect(normalized?.nextWeekAnnouncement.title).toBe('Faith that Endures');
    expect(normalized?.closingPrayerText).toContain('Lord Jesus, Son of David');
  });

  it('rejects null, non-objects, or empty inputs', () => {
    expect(normalizeSessionClosingContent(null)).toBeNull();
    expect(normalizeSessionClosingContent(undefined)).toBeNull();
    expect(normalizeSessionClosingContent('closing')).toBeNull();
    expect(normalizeSessionClosingContent([])).toBeNull();
    expect(normalizeSessionClosingContent({})).toBeNull();
  });

  it('rejects missing or empty title / eyebrow / durationLabel', () => {
    expect(
      normalizeSessionClosingContent({
        ...VALID_CLOSING_CONTENT,
        title: '',
      }),
    ).toBeNull();
    expect(
      normalizeSessionClosingContent({
        ...VALID_CLOSING_CONTENT,
        eyebrow: '   ',
      }),
    ).toBeNull();
    expect(
      normalizeSessionClosingContent({
        ...VALID_CLOSING_CONTENT,
        durationLabel: undefined,
      }),
    ).toBeNull();
  });

  it('rejects title / field lengths exceeding maximum bounds', () => {
    expect(
      normalizeSessionClosingContent({
        ...VALID_CLOSING_CONTENT,
        title: 'A'.repeat(SESSION_STUDY_SUMMARY_MAX_TITLE_LENGTH + 1),
      }),
    ).toBeNull();
    expect(
      normalizeSessionClosingContent({
        ...VALID_CLOSING_CONTENT,
        eyebrow: 'B'.repeat(SESSION_STUDY_SUMMARY_MAX_FIELD_LENGTH + 1),
      }),
    ).toBeNull();
  });

  it('rejects invalid weekly challenges (invalid optionNumber or empty challenges)', () => {
    expect(
      normalizeSessionClosingContent({
        ...VALID_CLOSING_CONTENT,
        weeklyChallenges: [],
      }),
    ).toBeNull();
    expect(
      normalizeSessionClosingContent({
        ...VALID_CLOSING_CONTENT,
        weeklyChallenges: [
          {
            optionNumber: 5, // Only 1, 2, 3, 4 allowed
            title: 'Invalid',
            description: 'Desc',
          },
        ],
      }),
    ).toBeNull();
    expect(
      normalizeSessionClosingContent({
        ...VALID_CLOSING_CONTENT,
        weeklyChallenges: [
          {
            optionNumber: '1',
            title: 'Invalid',
            description: 'Desc',
          },
        ],
      }),
    ).toBeNull();
  });

  it('rejects invalid nextWeekAnnouncement', () => {
    expect(
      normalizeSessionClosingContent({
        ...VALID_CLOSING_CONTENT,
        nextWeekAnnouncement: null,
      }),
    ).toBeNull();
    expect(
      normalizeSessionClosingContent({
        ...VALID_CLOSING_CONTENT,
        nextWeekAnnouncement: {
          title: '',
          citation: 'James 1:2',
          displayLabel: 'Label',
        },
      }),
    ).toBeNull();
  });

  it('rejects closing prayer text exceeding maximum bound', () => {
    expect(
      normalizeSessionClosingContent({
        ...VALID_CLOSING_CONTENT,
        closingPrayerText: 'P'.repeat(SESSION_STUDY_SUMMARY_MAX_PRAYER_TEXT_LENGTH + 1),
      }),
    ).toBeNull();
  });

  it('drops smuggled unknown properties from projected output', () => {
    const smuggled = {
      ...VALID_CLOSING_CONTENT,
      unauthorizedSecret: 'leak',
      pastoralNotes: 'secret note',
    };
    const normalized = normalizeSessionClosingContent(smuggled);
    expect(normalized).not.toBeNull();
    expect(normalized).not.toHaveProperty('unauthorizedSecret');
    expect(normalized).not.toHaveProperty('pastoralNotes');
  });
});

describe('normalizeSessionStudySummary with closing payload', () => {
  it('normalizes summary with closing content cleanly', () => {
    const raw = {
      ...BASE_SUMMARY,
      closing: VALID_CLOSING_CONTENT,
    };
    const normalized = normalizeSessionStudySummary(raw);
    expect(normalized).not.toBeNull();
    expect(normalized?.closing).not.toBeNull();
    expect(normalized?.closing?.title).toBe('Closing Prayer');
  });

  it('allows missing closing payload and defaults to null', () => {
    const raw = {
      ...BASE_SUMMARY,
    };
    const normalized = normalizeSessionStudySummary(raw);
    expect(normalized).not.toBeNull();
    expect(normalized?.closing).toBeNull();
  });

  it('rejects entire summary when closing payload is present but invalid', () => {
    const raw = {
      ...BASE_SUMMARY,
      closing: {
        title: '', // invalid
      },
    };
    const normalized = normalizeSessionStudySummary(raw);
    expect(normalized).toBeNull();
  });
});

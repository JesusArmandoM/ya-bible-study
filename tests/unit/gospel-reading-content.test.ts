import { describe, expect, it } from 'vitest';
import {
  SESSION_STUDY_SUMMARY_MAX_GOSPEL_TEXT_LENGTH,
  normalizeSessionGospelReadingContent,
  normalizeSessionStudySummary,
  toSessionGospelReadingContent,
  toSessionStudySummary,
  type SessionStudySummary,
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

const VALID_GOSPEL_READING = {
  title: 'Gospel Reading',
  eyebrow: 'SECTION 3 OF 5 · 60%',
  durationLabel: '10 min',
  citation: 'Matthew 15:21–28',
  liturgicalLabel: 'The Canaanite Woman’s Faith',
  fullText:
    'At that time, Jesus withdrew to the region of Tyre and Sidon.\nAnd behold, a Canaanite woman of that district came and called out,\n"Have pity on me, Lord, Son of David!"',
  verses: [
    {
      verseNumber: 21,
      text: 'At that time, Jesus withdrew to the region of Tyre and Sidon.',
    },
    {
      verseNumber: 22,
      text: 'And behold, a Canaanite woman of that district came and called out, "Have pity on me, Lord, Son of David!"',
    },
  ],
};

describe('SessionGospelReadingContent projection (participant-only, pastoral fields never cross)', () => {
  it('projects exactly the seven participant-visible fields and never leaderLiturgicalContextNote or keyLines', () => {
    const seed = getDefaultStudyDocument();
    const content = toSessionGospelReadingContent(seed.gospelReading);

    expect(Object.keys(content).sort()).toEqual([
      'citation',
      'durationLabel',
      'eyebrow',
      'fullText',
      'liturgicalLabel',
      'title',
      'verses',
    ]);
    expect(content.title).toBe('Gospel Reading');
    expect(content.citation).toBe('Matthew 15:21–28');
    expect(content.liturgicalLabel).toBe(seed.gospelReading.liturgicalLabel);
    expect(content.fullText).toBe(seed.gospelReading.fullText);
    expect(content.verses).toHaveLength(seed.gospelReading.verses.length);
    expect(content).not.toHaveProperty('leaderLiturgicalContextNote');
    expect(content).not.toHaveProperty('keyLines');
  });

  it('keeps leaderLiturgicalContextNote and keyLines off the serialized study summary', () => {
    const seed = getDefaultStudyDocument();
    const summary = toSessionStudySummary(seed);
    const json = JSON.stringify(summary);

    expect(summary.gospelReading).toEqual(
      toSessionGospelReadingContent(seed.gospelReading),
    );
    expect(json).not.toContain('leaderLiturgicalContextNote');
    expect(json).not.toContain('keyLines');
    expect(json).not.toContain(seed.gospelReading.leaderLiturgicalContextNote);
    for (const keyLine of seed.gospelReading.keyLines) {
      // Key line array itself should not be present as a property name
      expect(json).not.toContain('"keyLines"');
    }
    // Opening Prayer and Icebreaker pastoral copy stays excluded as well
    expect(json).not.toContain('leaderPrompt');
    expect(json).not.toContain('leaderNote');
    expect(json).not.toContain('examplesToListenFor');
  });
});

describe('normalizeSessionGospelReadingContent (bounded allow-list)', () => {
  it('accepts a fully valid payload and returns the explicit field projection', () => {
    const smuggled = {
      ...VALID_GOSPEL_READING,
      leaderLiturgicalContextNote: 'SMUGGLED FACILITATOR LITURGICAL NOTE',
      keyLines: ['SMUGGLED KEY LINE'],
    };
    const normalized = normalizeSessionGospelReadingContent(smuggled);

    expect(normalized).toEqual(VALID_GOSPEL_READING);
    expect(normalized).not.toHaveProperty('leaderLiturgicalContextNote');
    expect(normalized).not.toHaveProperty('keyLines');
  });

  it('preserves internal whitespace and line breaks in fullText and verse text', () => {
    const normalized = normalizeSessionGospelReadingContent({
      ...VALID_GOSPEL_READING,
      title: '  Gospel   Reading  ',
      fullText: 'Line 1\n  Line 2\n\nLine 3',
      verses: [
        {
          verseNumber: 1,
          text: 'Verse text line 1\nVerse text line 2',
        },
      ],
    });

    expect(normalized?.title).toBe('Gospel Reading');
    expect(normalized?.fullText).toBe('Line 1\n  Line 2\n\nLine 3');
    expect(normalized?.verses[0]?.text).toBe(
      'Verse text line 1\nVerse text line 2',
    );
  });

  it('rejects missing, empty, or over-bounds fields with null', () => {
    for (const key of [
      'title',
      'eyebrow',
      'durationLabel',
      'citation',
      'liturgicalLabel',
      'fullText',
    ] as const) {
      expect(
        normalizeSessionGospelReadingContent({
          ...VALID_GOSPEL_READING,
          [key]: undefined,
        }),
      ).toBeNull();
      expect(
        normalizeSessionGospelReadingContent({
          ...VALID_GOSPEL_READING,
          [key]: '',
        }),
      ).toBeNull();
      expect(
        normalizeSessionGospelReadingContent({
          ...VALID_GOSPEL_READING,
          [key]: '   ',
        }),
      ).toBeNull();
    }
  });

  it('rejects empty verses array or malformed verse objects', () => {
    expect(
      normalizeSessionGospelReadingContent({
        ...VALID_GOSPEL_READING,
        verses: [],
      }),
    ).toBeNull();

    expect(
      normalizeSessionGospelReadingContent({
        ...VALID_GOSPEL_READING,
        verses: 'not-an-array',
      }),
    ).toBeNull();

    expect(
      normalizeSessionGospelReadingContent({
        ...VALID_GOSPEL_READING,
        verses: [{ verseNumber: 0, text: 'Invalid verse number' }],
      }),
    ).toBeNull();

    expect(
      normalizeSessionGospelReadingContent({
        ...VALID_GOSPEL_READING,
        verses: [{ verseNumber: -1, text: 'Negative verse number' }],
      }),
    ).toBeNull();

    expect(
      normalizeSessionGospelReadingContent({
        ...VALID_GOSPEL_READING,
        verses: [{ verseNumber: 1.5, text: 'Non-integer verse number' }],
      }),
    ).toBeNull();

    expect(
      normalizeSessionGospelReadingContent({
        ...VALID_GOSPEL_READING,
        verses: [{ verseNumber: 1, text: '' }],
      }),
    ).toBeNull();
  });

  it(`rejects fullText exceeding SESSION_STUDY_SUMMARY_MAX_GOSPEL_TEXT_LENGTH (${SESSION_STUDY_SUMMARY_MAX_GOSPEL_TEXT_LENGTH})`, () => {
    const oversized = 'a'.repeat(
      SESSION_STUDY_SUMMARY_MAX_GOSPEL_TEXT_LENGTH + 1,
    );
    expect(
      normalizeSessionGospelReadingContent({
        ...VALID_GOSPEL_READING,
        fullText: oversized,
      }),
    ).toBeNull();
  });

  it('rejects non-object inputs', () => {
    expect(normalizeSessionGospelReadingContent(null)).toBeNull();
    expect(normalizeSessionGospelReadingContent(undefined)).toBeNull();
    expect(normalizeSessionGospelReadingContent('string')).toBeNull();
    expect(normalizeSessionGospelReadingContent(123)).toBeNull();
    expect(normalizeSessionGospelReadingContent([])).toBeNull();
  });
});

describe('normalizeSessionStudySummary with gospelReading wiring', () => {
  it('accepts summary with valid gospelReading and strips smuggled fields', () => {
    const raw = {
      ...BASE_SUMMARY,
      gospelReading: {
        ...VALID_GOSPEL_READING,
        leaderLiturgicalContextNote: 'SMUGGLED NOTE',
      },
    };
    const summary = normalizeSessionStudySummary(raw);
    expect(summary).not.toBeNull();
    expect(summary?.gospelReading).toEqual(VALID_GOSPEL_READING);
    expect(summary?.gospelReading).not.toHaveProperty(
      'leaderLiturgicalContextNote',
    );
  });

  it('allows missing or null gospelReading (backward compat with older study summaries)', () => {
    const summaryNull = normalizeSessionStudySummary({
      ...BASE_SUMMARY,
      gospelReading: null,
    });
    expect(summaryNull).not.toBeNull();
    expect(summaryNull?.gospelReading).toBeNull();

    const summaryMissing = normalizeSessionStudySummary({
      ...BASE_SUMMARY,
    });
    expect(summaryMissing).not.toBeNull();
    expect(summaryMissing?.gospelReading).toBeNull();
  });

  it('rejects summary when gospelReading payload is present but invalid', () => {
    const summary = normalizeSessionStudySummary({
      ...BASE_SUMMARY,
      gospelReading: {
        ...VALID_GOSPEL_READING,
        fullText: '',
      },
    });
    expect(summary).toBeNull();
  });

  it('contains zero occurrences of "Assistant" in test file or domain objects', () => {
    const seed = getDefaultStudyDocument();
    const summary = toSessionStudySummary(seed);
    const json = JSON.stringify(summary);
    expect(json).not.toContain('Assistant');
  });
});

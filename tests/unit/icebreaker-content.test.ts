import { describe, expect, it } from 'vitest';
import {
  SESSION_STUDY_SUMMARY_MAX_QUESTION_LENGTH,
  normalizeSessionIcebreakerContent,
  normalizeSessionStudySummary,
  toSessionIcebreakerContent,
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

const VALID_ICEBREAKER = {
  title: 'Outsiders Wanted',
  eyebrow: 'ICEBREAKER · 10 MIN',
  durationLabel: '10 min',
  introText:
    'Reflect on the moments you felt left out — then bring them to Jesus.',
  mainQuestion:
    'Have you ever felt like an outsider spiritually, socially, culturally, or even in the Church?',
  followUpQuestion:
    'When you feel like an outsider, do you usually move closer to Jesus, pull away, become defensive, or stay silent?',
};

describe('SessionIcebreakerContent projection (participant-only, pastoral fields never cross)', () => {
  it('projects exactly the six participant-visible fields and never leaderNote / examplesToListenFor', () => {
    const seed = getDefaultStudyDocument();
    const content = toSessionIcebreakerContent(seed.icebreaker);

    expect(Object.keys(content).sort()).toEqual([
      'durationLabel',
      'eyebrow',
      'followUpQuestion',
      'introText',
      'mainQuestion',
      'title',
    ]);
    expect(content.title).toBe('Outsiders Wanted');
    expect(content.eyebrow).toBe('ICEBREAKER · 10 MIN');
    expect(content.durationLabel).toBe('10 min');
    expect(content.mainQuestion).toBe(seed.icebreaker.mainQuestion);
    expect(content.followUpQuestion).toBe(seed.icebreaker.followUpQuestion);
    expect(content.introText).toBe(seed.icebreaker.introText);
    expect(content).not.toHaveProperty('leaderNote');
    expect(content).not.toHaveProperty('examplesToListenFor');
  });

  it('keeps leaderNote and every seed example string off the serialized study summary', () => {
    const seed = getDefaultStudyDocument();
    const summary = toSessionStudySummary(seed);
    const json = JSON.stringify(summary);

    expect(summary.icebreaker).toEqual(toSessionIcebreakerContent(seed.icebreaker));
    expect(json).not.toContain('leaderNote');
    expect(json).not.toContain('examplesToListenFor');
    expect(json).not.toContain(seed.icebreaker.leaderNote);
    for (const example of seed.icebreaker.examplesToListenFor) {
      expect(json).not.toContain(example);
    }
    // Opening Prayer pastoral copy stays excluded as before.
    expect(json).not.toContain('leaderPrompt');
  });
});

describe('normalizeSessionIcebreakerContent (bounded allow-list)', () => {
  it('accepts a fully valid payload and returns the explicit field projection', () => {
    const smuggled = {
      ...VALID_ICEBREAKER,
      leaderNote: 'SMUGGLED FACILITATOR GUIDANCE',
      examplesToListenFor: ['SMUGGLED EXAMPLE'],
    };
    const normalized = normalizeSessionIcebreakerContent(smuggled);

    expect(normalized).toEqual(VALID_ICEBREAKER);
    expect(normalized).not.toHaveProperty('leaderNote');
    expect(normalized).not.toHaveProperty('examplesToListenFor');
  });

  it('preserves internal whitespace in question copy but collapses it in short fields', () => {
    const normalized = normalizeSessionIcebreakerContent({
      ...VALID_ICEBREAKER,
      title: '  Outsiders   Wanted  ',
      mainQuestion: 'First line?\n  Second line?',
    });

    expect(normalized?.title).toBe('Outsiders Wanted');
    expect(normalized?.mainQuestion).toBe('First line?\n  Second line?');
  });

  it('rejects missing, empty, or over-bounds fields with null', () => {
    for (const key of Object.keys(VALID_ICEBREAKER)) {
      const missing = { ...VALID_ICEBREAKER } as Record<string, unknown>;
      delete missing[key];
      expect(normalizeSessionIcebreakerContent(missing)).toBeNull();

      expect(
        normalizeSessionIcebreakerContent({
          ...VALID_ICEBREAKER,
          [key]: '   ',
        }),
      ).toBeNull();
    }

    expect(
      normalizeSessionIcebreakerContent({
        ...VALID_ICEBREAKER,
        title: 'x'.repeat(121),
      }),
    ).toBeNull();
    expect(
      normalizeSessionIcebreakerContent({
        ...VALID_ICEBREAKER,
        eyebrow: 'x'.repeat(201),
      }),
    ).toBeNull();
    expect(
      normalizeSessionIcebreakerContent({
        ...VALID_ICEBREAKER,
        durationLabel: 'x'.repeat(201),
      }),
    ).toBeNull();
    for (const key of ['introText', 'mainQuestion', 'followUpQuestion']) {
      expect(
        normalizeSessionIcebreakerContent({
          ...VALID_ICEBREAKER,
          [key]: 'x'.repeat(SESSION_STUDY_SUMMARY_MAX_QUESTION_LENGTH + 1),
        }),
      ).toBeNull();
    }
  });

  it('rejects non-object payloads with null', () => {
    expect(normalizeSessionIcebreakerContent(null)).toBeNull();
    expect(normalizeSessionIcebreakerContent('icebreaker')).toBeNull();
    expect(normalizeSessionIcebreakerContent([VALID_ICEBREAKER])).toBeNull();
    expect(normalizeSessionIcebreakerContent(7)).toBeNull();
  });

  it('pins the question bound at 1000 chars (mirrors the prayer-text precedent)', () => {
    expect(SESSION_STUDY_SUMMARY_MAX_QUESTION_LENGTH).toBe(1000);
    expect(
      normalizeSessionIcebreakerContent({
        ...VALID_ICEBREAKER,
        mainQuestion: 'x'.repeat(SESSION_STUDY_SUMMARY_MAX_QUESTION_LENGTH),
      }),
    ).not.toBeNull();
  });
});

describe('normalizeSessionStudySummary with the additive icebreaker field (protocol v3)', () => {
  const withIcebreaker = (
    icebreaker: Record<string, unknown> | null,
  ): Record<string, unknown> => ({
    ...BASE_SUMMARY,
    ...(icebreaker === null ? {} : { icebreaker }),
  });

  it('keeps a missing or null icebreaker valid and normalizes it to null', () => {
    const missing = normalizeSessionStudySummary(withIcebreaker(null));
    expect(missing).not.toBeNull();
    expect(missing?.icebreaker).toBeNull();

    const explicitNull = normalizeSessionStudySummary({
      ...BASE_SUMMARY,
      icebreaker: null,
    });
    expect(explicitNull).not.toBeNull();
    expect(explicitNull?.icebreaker).toBeNull();
  });

  it('rejects a present-but-invalid icebreaker with null (INVALID_MESSAGE path)', () => {
    expect(
      normalizeSessionStudySummary(
        withIcebreaker({ ...VALID_ICEBREAKER, introText: '' }),
      ),
    ).toBeNull();
    expect(
      normalizeSessionStudySummary(
        withIcebreaker({ ...VALID_ICEBREAKER, mainQuestion: 'x'.repeat(1001) }),
      ),
    ).toBeNull();
  });

  it('accepts a valid icebreaker and drops smuggled pastoral keys', () => {
    const summary: SessionStudySummary | null = normalizeSessionStudySummary(
      withIcebreaker({
        ...VALID_ICEBREAKER,
        leaderNote: 'SMUGGLED FACILITATOR GUIDANCE',
        examplesToListenFor: ['SMUGGLED EXAMPLE'],
      }),
    );

    expect(summary?.icebreaker).toEqual(VALID_ICEBREAKER);
    expect(JSON.stringify(summary)).not.toContain('leaderNote');
    expect(JSON.stringify(summary)).not.toContain('examplesToListenFor');
  });
});

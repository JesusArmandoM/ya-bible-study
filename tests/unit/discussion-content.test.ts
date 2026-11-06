import { describe, expect, it } from 'vitest';
import {
  SESSION_DEEP_ANALYSIS_MAX_COMMENTARY_ITEMS,
  SESSION_DEEP_ANALYSIS_MAX_HIGHLIGHT_ITEMS,
  SESSION_DEEP_ANALYSIS_MAX_REFERENCES_PER_ITEM,
  SESSION_STUDY_SUMMARY_MAX_QUESTION_LENGTH,
  normalizeSessionDeepAnalysisContent,
  normalizeSessionDiscussionContent,
  normalizeSessionDiscussionQuestion,
  normalizeSessionStudySummary,
  toSessionDeepAnalysisContent,
  toSessionDiscussionContent,
  toSessionStudySummary,
} from '../../src/shared/session';
import { getDefaultStudyDocument } from '../../src/server/studies/greatIsYourFaithSeed';

const BASE_SUMMARY = {
  title: 'Great Is Your Faith',
  subtitle: 'From persistence to trust',
  liturgicalEyebrow: 'MATTHEW 15:21–28',
  gospelCitation: 'Matthew 15:21–28',
  gospelSummaryLabel: 'Gospel of Matthew 15:21–28',
  sectionCount: 6,
  estimatedMinutes: 45,
};

const VALID_DISCUSSION_CONTENT = {
  title: 'Discussion & Reflection',
  eyebrow: 'DISCUSSION · 25 MIN',
  durationLabel: '25 min',
  defaultActiveQuestionIds: ['q-6', 'q-5', 'q-8'],
  questions: [
    {
      id: 'q-6',
      number: 6,
      prompt: "What makes the Canaanite woman's faith 'great'?",
      category: 'Theological Focus',
      estimatedMinutes: 8,
    },
    {
      id: 'q-5',
      number: 5,
      prompt: "Have you ever felt God's silence — and what did you do?",
      category: 'Spiritual Life',
      estimatedMinutes: 9,
    },
    {
      id: 'q-8',
      number: 8,
      prompt: "Who do you need to pray 'Lord, help me' for this week?",
      category: 'Practical Application',
      estimatedMinutes: 8,
    },
  ],
};

describe('SessionDeepAnalysisContent & SessionDiscussionContent projections', () => {
  it('projects shared Deep Analysis (A–J commentary without patristicNote, A–D doctrine, A–D application)', () => {
    const seed = getDefaultStudyDocument();
    const deep = toSessionDeepAnalysisContent(seed.deepAnalysis);

    expect(Object.keys(deep).sort()).toEqual([
      'catholicDoctrine',
      'durationLabel',
      'eyebrow',
      'title',
      'verseCommentary',
      'youngAdultApplication',
    ]);
    expect(deep.title).toBe('Deep Analysis');
    expect(deep.eyebrow).toBe('DEEP ANALYSIS · 20 MIN');
    expect(deep.durationLabel).toBe('20 min');
    expect(deep.verseCommentary).toHaveLength(10);
    expect(deep.catholicDoctrine).toHaveLength(4);
    expect(deep.youngAdultApplication).toHaveLength(4);

    for (const item of deep.verseCommentary) {
      expect(item).not.toHaveProperty('patristicNote');
    }
    const deepJson = JSON.stringify(deep);
    expect(deepJson).not.toContain('patristicNote');
    expect(deepJson).not.toContain('Chrysostom');
    expect(deepJson).not.toContain('Augustine');
    expect(deepJson).not.toContain('Jerome');
  });

  it('projects exactly the five participant-visible discussion fields and never verseCommentary, catholicDoctrine, sampleAnswer, or leaderNote', () => {
    const seed = getDefaultStudyDocument();
    const content = toSessionDiscussionContent(seed.discussion);

    expect(Object.keys(content).sort()).toEqual([
      'defaultActiveQuestionIds',
      'durationLabel',
      'eyebrow',
      'questions',
      'title',
    ]);
    expect(content.title).toBe(seed.discussion.title);
    expect(content.eyebrow).toBe(seed.discussion.eyebrow);
    expect(content.durationLabel).toBe(seed.discussion.durationLabel);
    expect(content.defaultActiveQuestionIds).toEqual(['q-6', 'q-5', 'q-8']);
    expect(content.questions).toHaveLength(12);

    // Verify first question structure
    const q1 = content.questions[0];
    expect(q1).toBeDefined();
    expect(Object.keys(q1!).sort()).toEqual([
      'category',
      'estimatedMinutes',
      'id',
      'number',
      'prompt',
    ]);
    expect(q1).not.toHaveProperty('sampleAnswer');
    expect(q1).not.toHaveProperty('leaderNote');
    expect(content).not.toHaveProperty('verseCommentary');
    expect(content).not.toHaveProperty('catholicDoctrine');
    expect(content).not.toHaveProperty('youngAdultApplication');
    expect(content).not.toHaveProperty('prayerCardTemplate');
  });

  it('syncs shared deepAnalysis on study summary while stripping facilitator-only notes', () => {
    const seed = getDefaultStudyDocument();
    const summary = toSessionStudySummary(seed);
    const json = JSON.stringify(summary);
    const discussionJson = JSON.stringify(summary.discussion);

    expect(summary.sectionCount).toBe(6);
    expect(summary.deepAnalysis).toEqual(
      toSessionDeepAnalysisContent(seed.deepAnalysis),
    );
    expect(summary.discussion).toEqual(
      toSessionDiscussionContent(seed.discussion),
    );
    expect(discussionJson).not.toContain('verseCommentary');
    expect(discussionJson).not.toContain('catholicDoctrine');
    expect(discussionJson).not.toContain('youngAdultApplication');
    expect(discussionJson).not.toContain('Romans 11:29');
    expect(json).not.toContain('sampleAnswer');
    expect(json).not.toContain('leaderNote');
    expect(json).not.toContain('patristicNote');
    expect(json).not.toContain('examplesToListenFor');
    expect(json).not.toContain('leaderLiturgicalContextNote');
    expect(json).not.toContain('prayerCardTemplate');
    expect(json).not.toContain('anti-Jewish framing');
    expect(json).not.toContain('Chrysostom');
    expect(json).not.toContain('Augustine');
    expect(json).not.toContain('Jerome');
  });
});

describe('normalizeSessionDiscussionQuestion (bounded allow-list)', () => {
  it('accepts a valid question and strips smuggled pastoral fields', () => {
    const smuggled = {
      id: 'q-custom-1',
      number: 4,
      prompt: 'How does this Scripture speak to your vocation?',
      category: 'Vocation & Discernment',
      estimatedMinutes: 7,
      sampleAnswer: 'SMUGGLED SAMPLE ANSWER',
      leaderNote: 'SMUGGLED LEADER NOTE',
      extraProperty: 'EXTRA',
    };
    const normalized = normalizeSessionDiscussionQuestion(smuggled);

    expect(normalized).toEqual({
      id: 'q-custom-1',
      number: 4,
      prompt: 'How does this Scripture speak to your vocation?',
      category: 'Vocation & Discernment',
      estimatedMinutes: 7,
    });
    expect(normalized).not.toHaveProperty('sampleAnswer');
    expect(normalized).not.toHaveProperty('leaderNote');
  });

  it('accepts a question without estimatedMinutes', () => {
    const validNoMins = {
      id: 'q-custom-2',
      number: 5,
      prompt: 'What stood out to you in this reading?',
      category: 'Open Sharing',
    };
    const normalized = normalizeSessionDiscussionQuestion(validNoMins);
    expect(normalized).toEqual({
      id: 'q-custom-2',
      number: 5,
      prompt: 'What stood out to you in this reading?',
      category: 'Open Sharing',
    });
  });

  it('rejects invalid fields in question', () => {
    expect(normalizeSessionDiscussionQuestion(null)).toBeNull();
    expect(normalizeSessionDiscussionQuestion([])).toBeNull();
    expect(normalizeSessionDiscussionQuestion({ id: '', number: 1, prompt: 'Hello', category: 'General' })).toBeNull();
    expect(normalizeSessionDiscussionQuestion({ id: 'q-1', number: 0, prompt: 'Hello', category: 'General' })).toBeNull();
    expect(normalizeSessionDiscussionQuestion({ id: 'q-1', number: 1, prompt: '', category: 'General' })).toBeNull();
    expect(normalizeSessionDiscussionQuestion({ id: 'q-1', number: 1, prompt: '   ', category: 'General' })).toBeNull();
    expect(normalizeSessionDiscussionQuestion({ id: 'q-1', number: 1, prompt: 'a'.repeat(SESSION_STUDY_SUMMARY_MAX_QUESTION_LENGTH + 1), category: 'General' })).toBeNull();
    expect(normalizeSessionDiscussionQuestion({ id: 'q-1', number: 1, prompt: 'Hello', category: '' })).toBeNull();
    expect(normalizeSessionDiscussionQuestion({ id: 'q-1', number: 1, prompt: 'Hello', category: 'General', estimatedMinutes: 0 })).toBeNull();
    expect(normalizeSessionDiscussionQuestion({ id: 'q-1', number: 1, prompt: 'Hello', category: 'General', estimatedMinutes: 200 })).toBeNull();
  });
});

describe('normalizeSessionDiscussionContent (bounded allow-list)', () => {
  it('accepts a fully valid payload and strips smuggled pastoral fields', () => {
    const smuggled = {
      ...VALID_DISCUSSION_CONTENT,
      verseCommentary: [{ id: 'A', text: 'smuggled' }],
      catholicDoctrine: [{ id: 'A', text: 'smuggled' }],
    };
    const normalized = normalizeSessionDiscussionContent(smuggled);

    expect(normalized).toEqual(VALID_DISCUSSION_CONTENT);
    expect(normalized).not.toHaveProperty('verseCommentary');
    expect(normalized).not.toHaveProperty('catholicDoctrine');
  });

  it('rejects malformed payloads', () => {
    expect(normalizeSessionDiscussionContent(null)).toBeNull();
    expect(normalizeSessionDiscussionContent([])).toBeNull();
    expect(normalizeSessionDiscussionContent({ ...VALID_DISCUSSION_CONTENT, title: '' })).toBeNull();
    expect(normalizeSessionDiscussionContent({ ...VALID_DISCUSSION_CONTENT, eyebrow: '' })).toBeNull();
    expect(normalizeSessionDiscussionContent({ ...VALID_DISCUSSION_CONTENT, durationLabel: '' })).toBeNull();
    expect(normalizeSessionDiscussionContent({ ...VALID_DISCUSSION_CONTENT, defaultActiveQuestionIds: 'not-array' })).toBeNull();
    expect(normalizeSessionDiscussionContent({ ...VALID_DISCUSSION_CONTENT, defaultActiveQuestionIds: [''] })).toBeNull();
    expect(normalizeSessionDiscussionContent({ ...VALID_DISCUSSION_CONTENT, questions: [] })).toBeNull();
    expect(normalizeSessionDiscussionContent({ ...VALID_DISCUSSION_CONTENT, questions: 'not-array' })).toBeNull();
    expect(normalizeSessionDiscussionContent({ ...VALID_DISCUSSION_CONTENT, questions: [{ id: '' }] })).toBeNull();
  });
});

describe('normalizeSessionStudySummary with discussion', () => {
  it('normalizes missing discussion to null', () => {
    const summary = normalizeSessionStudySummary({
      ...BASE_SUMMARY,
    });
    expect(summary).not.toBeNull();
    expect(summary?.discussion).toBeNull();
  });

  it('normalizes present discussion correctly', () => {
    const summary = normalizeSessionStudySummary({
      ...BASE_SUMMARY,
      discussion: VALID_DISCUSSION_CONTENT,
    });
    expect(summary).not.toBeNull();
    expect(summary?.discussion).toEqual(VALID_DISCUSSION_CONTENT);
  });

  it('rejects invalid discussion in study summary', () => {
    const summary = normalizeSessionStudySummary({
      ...BASE_SUMMARY,
      discussion: { title: '' },
    });
    expect(summary).toBeNull();
  });
});

describe('normalizeSessionDeepAnalysisContent (bounded allow-list)', () => {
  it('accepts valid deepAnalysis and strips smuggled patristicNote', () => {
    const seed = getDefaultStudyDocument();
    const validDeep = toSessionDeepAnalysisContent(seed.deepAnalysis);
    const smuggled = {
      ...validDeep,
      verseCommentary: validDeep.verseCommentary.map((item) => ({
        ...item,
        patristicNote: 'SMUGGLED PATRISTIC NOTE',
      })),
      extraField: 'SMUGGLED',
    };

    const normalized = normalizeSessionDeepAnalysisContent(smuggled);
    expect(normalized).toEqual(validDeep);
    expect(JSON.stringify(normalized)).not.toContain('patristicNote');
    expect(JSON.stringify(normalized)).not.toContain('SMUGGLED');
  });

  it('enforces commentary, doctrine, application, and reference array bounds', () => {
    const seed = getDefaultStudyDocument();
    const validDeep = toSessionDeepAnalysisContent(seed.deepAnalysis);

    expect(normalizeSessionDeepAnalysisContent(null)).toBeNull();
    expect(
      normalizeSessionDeepAnalysisContent({ ...validDeep, verseCommentary: [] }),
    ).toBeNull();
    expect(
      normalizeSessionDeepAnalysisContent({
        ...validDeep,
        verseCommentary: Array.from(
          { length: SESSION_DEEP_ANALYSIS_MAX_COMMENTARY_ITEMS + 1 },
          () => validDeep.verseCommentary[0]!,
        ),
      }),
    ).toBeNull();
    expect(
      normalizeSessionDeepAnalysisContent({
        ...validDeep,
        catholicDoctrine: Array.from(
          { length: SESSION_DEEP_ANALYSIS_MAX_HIGHLIGHT_ITEMS + 1 },
          () => validDeep.catholicDoctrine[0]!,
        ),
      }),
    ).toBeNull();
    expect(
      normalizeSessionDeepAnalysisContent({
        ...validDeep,
        youngAdultApplication: Array.from(
          { length: SESSION_DEEP_ANALYSIS_MAX_HIGHLIGHT_ITEMS + 1 },
          () => validDeep.youngAdultApplication[0]!,
        ),
      }),
    ).toBeNull();
    expect(
      normalizeSessionDeepAnalysisContent({
        ...validDeep,
        verseCommentary: [
          {
            ...validDeep.verseCommentary[0]!,
            catechismReferences: Array.from(
              { length: SESSION_DEEP_ANALYSIS_MAX_REFERENCES_PER_ITEM + 1 },
              (_, idx) => `CCC ${idx + 1}`,
            ),
          },
        ],
      }),
    ).toBeNull();

    const summaryWithoutDeep = normalizeSessionStudySummary({ ...BASE_SUMMARY });
    expect(summaryWithoutDeep?.deepAnalysis).toBeNull();

    const summaryWithInvalidDeep = normalizeSessionStudySummary({
      ...BASE_SUMMARY,
      deepAnalysis: { title: '' },
    });
    expect(summaryWithInvalidDeep).toBeNull();
  });
});

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseMarkdownStudy } from '../../src/server/studies/markdownParser.js';
import { validateStudyDocument } from '../../src/shared/study.js';

describe('markdownParser', () => {
  const fixturesDir = path.resolve(import.meta.dirname, '../fixtures');

  it('parses canonical Great Is Your Faith markdown into a valid StudyDocument', () => {
    const rawMarkdown = fs.readFileSync(
      path.join(fixturesDir, 'great-is-your-faith.md'),
      'utf-8',
    );

    const result = parseMarkdownStudy(rawMarkdown, {
      fileName: 'great-is-your-faith.md',
    });

    expect(result.valid).toBe(true);
    if (!result.valid) return;

    const doc = result.value;
    expect(doc.id).toBe('great-is-your-faith');
    expect(doc.title).toBe('Great Is Your Faith');
    expect(doc.subtitle).toBe('Mercy, Humility, and the House of Prayer for All Peoples');
    expect(doc.gospelCitation).toBe('Matthew 15:21–28');
    expect(doc.sectionCount).toBe(5);
    expect(doc.estimatedMinutes).toBe(90);

    // Section 1: Opening Prayer
    expect(doc.openingPrayer.sectionId).toBe('section_1_prayer');
    expect(doc.openingPrayer.sectionNumber).toBe(1);
    expect(doc.openingPrayer.suggestedPrayerText).toContain('Lord Jesus Christ, Son of David');
    expect(doc.openingPrayer.turnMode).toBe('gated_prayer');

    // Section 2: Icebreaker
    expect(doc.icebreaker.sectionId).toBe('section_2_icebreaker');
    expect(doc.icebreaker.sectionNumber).toBe(2);
    expect(doc.icebreaker.title).toBe('Outsiders Wanted');
    expect(doc.icebreaker.mainQuestion).toContain('Have you ever felt like an outsider');
    expect(doc.icebreaker.examplesToListenFor.length).toBeGreaterThanOrEqual(4);

    // Section 3: Gospel Reading (Gospel-only invariant)
    expect(doc.gospelReading.sectionId).toBe('section_3_reading');
    expect(doc.gospelReading.sectionNumber).toBe(3);
    expect(doc.gospelReading.citation).toBe('Matthew 15:21–28');
    expect(doc.gospelReading.verses.length).toBe(8);
    expect(doc.gospelReading.verses[0]?.verseNumber).toBe(21);
    expect(doc.gospelReading.verses[7]?.verseNumber).toBe(28);
    expect(doc.gospelReading.fullText).toContain('At that time, Jesus withdrew to the region of Tyre and Sidon.');
    expect(doc.gospelReading.fullText).not.toContain('Isaiah');
    expect(doc.gospelReading.fullText).not.toContain('Psalm');
    expect(doc.gospelReading.fullText).not.toContain('Romans');

    // Liturgical context holds the Mass readings
    expect(doc.gospelReading.leaderLiturgicalContextNote).toContain('Isaiah 56:1, 6–7');
    expect(doc.gospelReading.leaderLiturgicalContextNote).toContain('Psalm 67');
    expect(doc.gospelReading.leaderLiturgicalContextNote).toContain('Romans 11');

    // Section 4: Deep Analysis
    expect(doc.deepAnalysis.sectionId).toBe('section_4_discussion');
    expect(doc.deepAnalysis.sectionNumber).toBe(4);
    expect(doc.deepAnalysis.reflectionQuestions.length).toBe(12);
    expect(doc.deepAnalysis.defaultActiveQuestionIds).toEqual(['q-6', 'q-5', 'q-8']);
    expect(doc.deepAnalysis.verseCommentary.length).toBe(10);
    expect(doc.deepAnalysis.verseCommentary[0]?.id).toBe('A');
    expect(doc.deepAnalysis.verseCommentary[9]?.id).toBe('J');
    expect(doc.deepAnalysis.catholicDoctrine.length).toBe(4);
    expect(doc.deepAnalysis.youngAdultApplication.length).toBe(4);
    expect(doc.deepAnalysis.prayerCardTemplate.prompts.length).toBe(3);

    // Section 5: Closing
    expect(doc.closing.sectionId).toBe('section_5_closing');
    expect(doc.closing.sectionNumber).toBe(5);
    expect(doc.closing.weeklyChallenges.length).toBe(4);
    expect(doc.closing.closingPrayerText).toContain('Lord Jesus, Son of David, have mercy on us.');
    expect(doc.closing.nextWeekAnnouncement.title).toBe('Faith that Endures');

    // Detection Summary
    expect(doc.detectionSummary.sectionCount).toBe(5);
    expect(doc.detectionSummary.curatedQuestionCount).toBe(3);
    expect(doc.detectionSummary.totalQuestionCount).toBe(12);
    expect(doc.detectionSummary.hasOpeningPrayer).toBe(true);
    expect(doc.detectionSummary.hasGospelReading).toBe(true);
    expect(doc.detectionSummary.hasClosingPrayer).toBe(true);

    // Validates cleanly against validateStudyDocument
    const validation = validateStudyDocument(doc);
    expect(validation.valid).toBe(true);
  });

  it('reconstructs continuous Gospel text from Section 8 headers when Section 6 contains only key lines (fallback rule)', () => {
    const rawMarkdown = fs.readFileSync(
      path.join(fixturesDir, 'great-is-your-faith-section8-fallback.md'),
      'utf-8',
    );

    const result = parseMarkdownStudy(rawMarkdown, {
      fileName: 'great-is-your-faith-section8-fallback.md',
    });

    expect(result.valid).toBe(true);
    if (!result.valid) return;

    const doc = result.value;
    expect(doc.gospelReading.verses.length).toBe(8);
    expect(doc.gospelReading.verses[0]?.verseNumber).toBe(21);
    expect(doc.gospelReading.verses[0]?.text).toContain('Jesus withdrew to the region of Tyre and Sidon');
    expect(doc.gospelReading.verses[7]?.verseNumber).toBe(28);
    expect(doc.gospelReading.verses[7]?.text).toContain('O woman, great is your faith!');
    expect(doc.gospelReading.fullText).toContain('Jesus withdrew to the region of Tyre and Sidon');
    expect(doc.gospelReading.fullText).toContain('O woman, great is your faith!');
    expect(doc.gospelReading.keyLines.length).toBeGreaterThanOrEqual(1);

    const validation = validateStudyDocument(doc);
    expect(validation.valid).toBe(true);
  });

  it('parses second distinct weekly study "Peace! Be Still" (Mark 4:35–41) deterministically', () => {
    const rawMarkdown = fs.readFileSync(
      path.join(fixturesDir, 'peace-be-still-mark-4.md'),
      'utf-8',
    );

    const result = parseMarkdownStudy(rawMarkdown, {
      fileName: 'peace-be-still-mark-4.md',
    });

    expect(result.valid).toBe(true);
    if (!result.valid) return;

    const doc = result.value;
    expect(doc.id).toBe('peace-be-still');
    expect(doc.title).toBe('Peace! Be Still');
    expect(doc.subtitle).toBe('Faith, Fear, and the Lord of Wind and Sea');
    expect(doc.gospelCitation).toBe('Mark 4:35–41');
    expect(doc.icebreaker.title).toBe('Weathering the Storm');
    expect(doc.gospelReading.verses.length).toBe(7);
    expect(doc.gospelReading.verses[0]?.verseNumber).toBe(35);
    expect(doc.gospelReading.verses[6]?.verseNumber).toBe(41);
    expect(doc.gospelReading.fullText).toContain('Quiet! Be still!');
    expect(doc.deepAnalysis.reflectionQuestions.length).toBe(12);
    expect(doc.deepAnalysis.defaultActiveQuestionIds).toEqual(['q-6', 'q-3', 'q-8']);
    expect(doc.closing.weeklyChallenges.length).toBe(4);
    expect(doc.closing.nextWeekAnnouncement.title).toBe('Do Not Be Afraid; Just Have Faith');

    const validation = validateStudyDocument(doc);
    expect(validation.valid).toBe(true);
  });

  it('rejects empty markdown content with an actionable error', () => {
    const result = parseMarkdownStudy('   \n  \t  ');
    expect(result.valid).toBe(false);
    if (result.valid) return;

    expect(result.errors).toContain('Study document markdown content is empty.');
  });

  it('rejects markdown missing mandatory sections with descriptive errors', () => {
    const incompleteMarkdown = `
# Incomplete Study

## 1. Central Themes
- Test theme

## 2. Session Goals
- Test goal
`;

    const result = parseMarkdownStudy(incompleteMarkdown);
    expect(result.valid).toBe(false);
    if (result.valid) return;

    expect(result.errors.length).toBeGreaterThanOrEqual(4);
    expect(result.errors).toContain('Missing Section 4 (Opening Prayer).');
    expect(result.errors).toContain('Missing Section 5 (Icebreaker).');
    expect(result.errors).toContain('Missing Section 6 (Proclamation of the Readings).');
    expect(result.errors).toContain('Missing Section 15 (Closing Prayer).');
  });

  it('enforces zero occurrences of "Assistant" across all parsed outputs', () => {
    const rawMarkdown1 = fs.readFileSync(path.join(fixturesDir, 'great-is-your-faith.md'), 'utf-8');
    const rawMarkdown2 = fs.readFileSync(path.join(fixturesDir, 'peace-be-still-mark-4.md'), 'utf-8');

    const res1 = parseMarkdownStudy(rawMarkdown1);
    const res2 = parseMarkdownStudy(rawMarkdown2);

    expect(res1.valid).toBe(true);
    expect(res2.valid).toBe(true);

    const serialized1 = JSON.stringify(res1);
    const serialized2 = JSON.stringify(res2);

    expect(serialized1).not.toContain('Assistant');
    expect(serialized2).not.toContain('Assistant');
  });
});

import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { normalizePdfText, parsePdfStudy } from '../../src/server/studies/pdfParser.js';
import { validateStudyDocument } from '../../src/shared/study.js';

describe('pdfParser', () => {
  const fixturesDir = path.resolve(import.meta.dirname, '../fixtures');

  it('parses canonical Great Is Your Faith PDF into a valid StudyDocument', async () => {
    const pdfBuffer = fs.readFileSync(path.join(fixturesDir, 'great-is-your-faith.pdf'));

    const result = await parsePdfStudy(pdfBuffer, {
      fileName: 'great-is-your-faith.pdf',
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

    // Source metadata
    expect(doc.source.type).toBe('pdf');
    expect(doc.source.fileName).toBe('great-is-your-faith.pdf');
    expect(doc.source.statusLabel).toBe('Analyzed');

    // Detection summary
    expect(doc.detectionSummary.sectionCount).toBe(5);
    expect(doc.detectionSummary.sectionsDetectedLabel).toBe('5 sections detected');
    expect(doc.detectionSummary.curatedQuestionCount).toBe(3);
    expect(doc.detectionSummary.totalQuestionCount).toBe(12);
    expect(doc.detectionSummary.hasOpeningPrayer).toBe(true);
    expect(doc.detectionSummary.hasGospelReading).toBe(true);
    expect(doc.detectionSummary.hasClosingPrayer).toBe(true);

    // Section 1: Opening Prayer
    expect(doc.openingPrayer.sectionId).toBe('section_1_prayer');
    expect(doc.openingPrayer.suggestedPrayerText).toContain('Lord Jesus Christ, Son of David');
    expect(doc.openingPrayer.turnMode).toBe('gated_prayer');

    // Section 2: Icebreaker
    expect(doc.icebreaker.sectionId).toBe('section_2_icebreaker');
    expect(doc.icebreaker.title).toBe('Outsiders Wanted');
    expect(doc.icebreaker.mainQuestion).toContain('Have you ever felt like an outsider');
    expect(doc.icebreaker.examplesToListenFor.length).toBeGreaterThanOrEqual(4);

    // Section 3: Gospel Reading (Gospel-only invariant)
    expect(doc.gospelReading.sectionId).toBe('section_3_reading');
    expect(doc.gospelReading.citation).toBe('Matthew 15:21–28');
    expect(doc.gospelReading.verses.length).toBe(8);
    expect(doc.gospelReading.verses[0]?.verseNumber).toBe(21);
    expect(doc.gospelReading.verses[7]?.verseNumber).toBe(28);
    expect(doc.gospelReading.fullText).toContain(
      'At that time, Jesus withdrew to the region of Tyre and Sidon.',
    );
    expect(doc.gospelReading.fullText).not.toContain('Isaiah');
    expect(doc.gospelReading.fullText).not.toContain('Psalm');
    expect(doc.gospelReading.fullText).not.toContain('Romans');

    // Supporting Mass readings in leaderLiturgicalContextNote
    expect(doc.gospelReading.leaderLiturgicalContextNote).toContain('Isaiah 56:1, 6–7');
    expect(doc.gospelReading.leaderLiturgicalContextNote).toContain('Psalm 67');
    expect(doc.gospelReading.leaderLiturgicalContextNote).toContain('Romans 11');

    // Section 4: Deep Analysis
    expect(doc.deepAnalysis.sectionId).toBe('section_4_discussion');
    expect(doc.deepAnalysis.reflectionQuestions.length).toBe(12);
    expect(doc.deepAnalysis.defaultActiveQuestionIds).toEqual(['q-6', 'q-5', 'q-8']);
    expect(doc.deepAnalysis.verseCommentary.length).toBe(10);
    expect(doc.deepAnalysis.catholicDoctrine.length).toBe(4);
    expect(doc.deepAnalysis.youngAdultApplication.length).toBe(4);
    expect(doc.deepAnalysis.prayerCardTemplate.prompts.length).toBe(3);

    // Section 5: Closing
    expect(doc.closing.sectionId).toBe('section_5_closing');
    expect(doc.closing.weeklyChallenges.length).toBe(4);
    expect(doc.closing.closingPrayerText).toContain(
      'Lord Jesus, Son of David, have mercy on us.',
    );
    expect(doc.closing.nextWeekAnnouncement.title).toBe('Faith that Endures');

    // Validates cleanly against validateStudyDocument
    const validation = validateStudyDocument(doc);
    expect(validation.valid).toBe(true);
  });

  it('parses second distinct weekly study "Peace! Be Still" (Mark 4:35–41) PDF deterministically', async () => {
    const pdfBuffer = fs.readFileSync(path.join(fixturesDir, 'peace-be-still-mark-4.pdf'));

    const result = await parsePdfStudy(pdfBuffer, {
      fileName: 'peace-be-still-mark-4.pdf',
    });

    expect(result.valid).toBe(true);
    if (!result.valid) return;

    const doc = result.value;
    expect(doc.id).toBe('peace-be-still');
    expect(doc.title).toBe('Peace! Be Still');
    expect(doc.subtitle).toBe('Faith, Fear, and the Lord of Wind and Sea');
    expect(doc.gospelCitation).toBe('Mark 4:35–41');
    expect(doc.source.type).toBe('pdf');
    expect(doc.source.fileName).toBe('peace-be-still-mark-4.pdf');
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

  it('normalizes PDF artifacts: ligatures, smart quotes, running headers, and page numbers', () => {
    const simulatedPages = [
      `Catholic Young Adult Bible Study — Great Is Your Faith\nPage 1 of 3\n\n# Great Is Your Faith\n**Liturgical Occasion:** Sunday, August 16, 2026\n**Eyebrow:** WEEK 32\n**Gospel:** Matthew 15:21–28\n\n1. Central Themes\n- Faith is persistent\n- The Church is catholic: universal in a\uFB04iction and mercy\n\n4. Opening Prayer\nLord Jesus Christ, in our de\uFB01ned mission teach us to pray.\nPage 1 of 3`,
      `Catholic Young Adult Bible Study — Great Is Your Faith\n- 2 -\n\n5. Icebreaker: Outsiders Wanted\n**Intro:** “Outsiders” welcomed by Jesus.\n**Main Question:** When you feel ‘left out’, what happens?\n**Leader Note:** Affirm each voice.\n\n6. Proclamation of the Readings\n**Gospel Citation:** Matthew 15:21–28\nSupporting Mass Readings\n- Isaiah 56:1\nGospel Proclamation (Matthew 15:21–28)\n21 Dis-\nciples followed him.\n[ 2 ]`,
      `Catholic Young Adult Bible Study — Great Is Your Faith\n3 / 3\n\n8. Deep Analysis (A-J)\nA. Matthew 15:21\nCommentary\n\n11. Reflection Questions (1-12)\n1. First question?\n**Estimated Time:** 4 minutes\n2. Second question?\n**Estimated Time:** 4 minutes\n\n15. Closing Prayer\nLord, hear our prayer. Amen.\n3`,
    ];

    const normalized = normalizePdfText(simulatedPages);

    // Running headers & footers stripped
    expect(normalized).not.toContain('Page 1 of 3');
    expect(normalized).not.toContain('- 2 -');
    expect(normalized).not.toContain('[ 2 ]');
    expect(normalized).not.toContain('3 / 3');

    // Ligatures expanded (fi -> \uFB01, ffl -> \uFB04)
    expect(normalized).toContain('affliction and mercy');
    expect(normalized).toContain('in our defined mission teach us');
    expect(normalized).not.toContain('\uFB01');
    expect(normalized).not.toContain('\uFB04');

    // Smart quotes normalized
    expect(normalized).toContain('"Outsiders" welcomed by Jesus.');
    expect(normalized).toContain("'left out'");

    // De-hyphenation across line breaks: "Dis-\nciples" -> "Disciples"
    expect(normalized).toContain('Disciples followed him.');

    // Unhashed section headings normalized with ##
    expect(normalized).toContain('## 1. Central Themes');
    expect(normalized).toContain('## 4. Opening Prayer');
    expect(normalized).toContain('## 5. Icebreaker: Outsiders Wanted');
    expect(normalized).toContain('## 6. Proclamation of the Readings');
    expect(normalized).toContain('## 8. Deep Analysis (A-J)');
    expect(normalized).toContain('## 11. Reflection Questions (1-12)');
    expect(normalized).toContain('## 15. Closing Prayer');

    // Subsections normalized with ###
    expect(normalized).toContain('### Supporting Mass Readings');
    expect(normalized).toContain('### Gospel Proclamation (Matthew 15:21–28)');
    expect(normalized).toContain('### A. Matthew 15:21');
    expect(normalized).toContain('### 1. First question?');
    expect(normalized).toContain('### 2. Second question?');
  });

  it('rejects textless / scanned image PDFs with actionable error', async () => {
    // Generate an empty single-page PDF with zero text
    const emptyPdfDoc = await PDFDocument.create();
    emptyPdfDoc.addPage([595.28, 841.89]);
    const emptyPdfBytes = await emptyPdfDoc.save();

    const result = await parsePdfStudy(emptyPdfBytes);
    expect(result.valid).toBe(false);
    if (result.valid) return;

    expect(result.errors).toContain(
      'No selectable text could be extracted from this PDF. Please ensure the PDF is text-based rather than a scanned image.',
    );
  });

  it('rejects corrupt PDF bytes with actionable error', async () => {
    const corruptBuffer = Buffer.from('This is not a valid PDF file content at all.');

    const result = await parsePdfStudy(corruptBuffer);
    expect(result.valid).toBe(false);
    if (result.valid) return;

    expect(result.errors).toContain(
      'Could not parse PDF document. Please verify the file is a valid text-based PDF.',
    );
  });

  it('rejects zero-byte PDF buffer with actionable error', async () => {
    const zeroByte = Buffer.alloc(0);

    const result = await parsePdfStudy(zeroByte);
    expect(result.valid).toBe(false);
    if (result.valid) return;

    expect(result.errors).toContain(
      'No selectable text could be extracted from this PDF. Please ensure the PDF is text-based rather than a scanned image.',
    );
  });

  it('enforces zero occurrences of forbidden legacy role word "Assistant"', async () => {
    const pdfBuffer1 = fs.readFileSync(path.join(fixturesDir, 'great-is-your-faith.pdf'));
    const pdfBuffer2 = fs.readFileSync(path.join(fixturesDir, 'peace-be-still-mark-4.pdf'));

    const res1 = await parsePdfStudy(pdfBuffer1);
    const res2 = await parsePdfStudy(pdfBuffer2);

    expect(res1.valid).toBe(true);
    expect(res2.valid).toBe(true);

    const serialized1 = JSON.stringify(res1);
    const serialized2 = JSON.stringify(res2);

    expect(serialized1).not.toContain('Assistant');
    expect(serialized2).not.toContain('Assistant');
  });
});

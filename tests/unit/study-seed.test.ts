import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STUDY_ID,
  getDefaultStudyDocument,
} from '../../src/server/studies/greatIsYourFaithSeed';
import {
  FOUR_POINT_ITEM_IDS,
  PRAYER_CARD_PROMPT_IDS,
  STUDY_SECTION_IDS,
  VERSE_COMMENTARY_IDS,
  getStudySections,
  validateStudyDocument,
} from '../../src/shared/study';

describe('Preloaded "Great Is Your Faith" StudyDocument seed & validator', () => {
  it('validates the complete 5-section default StudyDocument metadata and ordered section tuple', () => {
    const doc = getDefaultStudyDocument();
    const validation = validateStudyDocument(doc);

    expect(validation).toEqual({ valid: true, value: doc });
    expect(doc.id).toBe(DEFAULT_STUDY_ID);
    expect(doc.id).toBe('great-is-your-faith');
    expect(doc.title).toBe('Great Is Your Faith');
    expect(doc.subtitle).toBe(
      'Mercy, Humility, and the House of Prayer for All Peoples',
    );
    expect(doc.liturgicalDate).toContain('Sunday, August 16, 2026');
    expect(doc.liturgicalDate).toContain(
      'Twentieth Sunday in Ordinary Time, Year A',
    );
    expect(doc.gospelCitation).toBe('Matthew 15:21–28');
    expect(doc.estimatedMinutes).toBe(90);
    expect(doc.sectionCount).toBe(5);
    expect(doc.centralThemes).toHaveLength(4);
    expect(doc.sessionGoals.length).toBeGreaterThanOrEqual(3);
    expect(doc.oneSentenceMainPoint).toBe(
      "The Canaanite woman teaches us that great faith is humble, persistent, and bold, trusting that even the smallest gift of Christ's mercy is enough to heal.",
    );
    expect(doc.source).toEqual({
      type: 'preloaded',
      fileName: 'Great Is Your Faith.pdf',
      statusLabel: 'Analyzed',
    });
    expect(doc.detectionSummary).toEqual({
      sectionCount: 5,
      sectionsDetectedLabel: '5 sections detected',
      detectedLabel: 'Prayer · Reading · 3 Questions',
      curatedQuestionCount: 3,
      totalQuestionCount: 12,
      hasOpeningPrayer: true,
      hasGospelReading: true,
      hasClosingPrayer: true,
    });

    const sections = getStudySections(doc);
    expect(sections).toHaveLength(5);
    expect(sections.map((s) => s.sectionId)).toEqual([...STUDY_SECTION_IDS]);
    expect(sections.map((s) => s.sectionNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(sections.map((s) => s.progressPercent)).toEqual([
      20, 40, 60, 80, 100,
    ]);
    expect(sections.map((s) => s.turnMode)).toEqual([
      'gated_prayer',
      'open_share',
      'gated_reading',
      'none',
      'none',
    ]);
  });

  it('enforces the Gospel-only Section 3 invariant with full verbatim Matthew 15:21-28 text', () => {
    const { gospelReading } = getDefaultStudyDocument();

    expect(gospelReading.citation).toBe('Matthew 15:21–28');
    expect(gospelReading.durationMinutes).toBe(10);
    expect(gospelReading.durationLabel).toBe('10 min');
    expect(gospelReading.verses.map((v) => v.verseNumber)).toEqual([
      21, 22, 23, 24, 25, 26, 27, 28,
    ]);

    expect(gospelReading.fullText).toContain('Tyre and Sidon');
    expect(gospelReading.fullText).toContain(
      'Have pity on me, Lord, Son of David!',
    );
    expect(gospelReading.fullText).toContain(
      'But Jesus did not say a word in answer to her.',
    );
    expect(gospelReading.fullText).toContain('Send her away');
    expect(gospelReading.fullText).toContain(
      'lost sheep of the house of Israel',
    );
    expect(gospelReading.fullText).toContain('Lord, help me.');
    expect(gospelReading.fullText).toContain(
      'scraps that fall from the table of their masters',
    );
    expect(gospelReading.fullText).toContain('O woman, great is your faith!');
    expect(gospelReading.fullText).toContain(
      'daughter was healed from that hour',
    );

    expect(gospelReading.keyLines).toEqual([
      'Have pity on me, Lord, Son of David!',
      'Lord, help me.',
      'Even the dogs eat the scraps that fall from the table of their masters.',
      'O woman, great is your faith!',
    ]);

    // Supporting Sunday Mass readings belong strictly to leaderLiturgicalContextNote
    for (const nonGospelRef of ['Isaiah', 'Psalm', 'Romans', 'Alleluia']) {
      expect(gospelReading.fullText).not.toContain(nonGospelRef);
      for (const verse of gospelReading.verses) {
        expect(verse.text).not.toContain(nonGospelRef);
      }
    }

    expect(gospelReading.leaderLiturgicalContextNote).toContain(
      'Isaiah 56:1, 6–7',
    );
    expect(gospelReading.leaderLiturgicalContextNote).toContain(
      'Psalm 67:2–3, 5, 6, 8',
    );
    expect(gospelReading.leaderLiturgicalContextNote).toContain(
      'Romans 11:13–15, 29–32',
    );
    expect(gospelReading.leaderLiturgicalContextNote).toContain(
      'Alleluia cf. Matthew 4:23',
    );
  });

  it('exposes complete Opening/Closing prayers, Outsiders Wanted icebreaker, 12 questions, A-J commentary, A-D doctrine/applications, Prayer Card, and weekly challenges', () => {
    const doc = getDefaultStudyDocument();

    // Section 1: Opening Prayer
    expect(doc.openingPrayer.durationMinutes).toBe(5);
    expect(doc.openingPrayer.durationLabel).toBe('5 min');
    expect(doc.openingPrayer.suggestedPrayerText).toBe(
      'Lord Jesus Christ, Son of David and Savior of the world, we come before You like the Canaanite woman, asking not for what we deserve, but for Your mercy. Teach us to pray with humility, to persevere when You seem silent, and to trust that Your mercy is greater than our limits. Open our hearts to all peoples, purify us from pride and exclusion, and make us living members of Your Catholic Church, a house of prayer for all nations. Amen.',
    );

    // Section 2: Icebreaker
    expect(doc.icebreaker.title).toBe('Outsiders Wanted');
    expect(doc.icebreaker.durationMinutes).toBe(10);
    expect(doc.icebreaker.durationLabel).toBe('10 min');
    expect(doc.icebreaker.mainQuestion).toBe(
      'Have you ever felt like an outsider spiritually, socially, culturally, or even in the Church?',
    );
    expect(doc.icebreaker.followUpQuestion).toBe(
      'When you feel like an outsider, do you usually move closer to Jesus, pull away, become defensive, or stay silent?',
    );
    expect(doc.icebreaker.leaderNote.length).toBeGreaterThan(20);
    expect(doc.icebreaker.examplesToListenFor).toHaveLength(8);

    // Section 4: Deep Analysis & Discussion
    const { deepAnalysis } = doc;
    expect(deepAnalysis.title).toBe('Lord, Help Me Pray');
    expect(deepAnalysis.durationLabel).toBe('25–50 min');
    expect(deepAnalysis.defaultActiveQuestionIds).toEqual([
      'q-6',
      'q-5',
      'q-8',
    ]);
    expect(deepAnalysis.reflectionQuestions).toHaveLength(12);
    expect(deepAnalysis.reflectionQuestions.map((q) => q.number)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);

    const q6 = deepAnalysis.reflectionQuestions.find((q) => q.id === 'q-6');
    const q5 = deepAnalysis.reflectionQuestions.find((q) => q.id === 'q-5');
    const q8 = deepAnalysis.reflectionQuestions.find((q) => q.id === 'q-8');
    expect(q6?.curatedOrder).toBe(1);
    expect(q5?.curatedOrder).toBe(2);
    expect(q8?.curatedOrder).toBe(3);

    expect(deepAnalysis.verseCommentary.map((item) => item.id)).toEqual([
      ...VERSE_COMMENTARY_IDS,
    ]);
    const patristicNotesJoined = deepAnalysis.verseCommentary
      .map((item) => item.patristicNote ?? '')
      .join(' ');
    expect(patristicNotesJoined).toContain('St. Augustine');
    expect(patristicNotesJoined).toContain('St. John Chrysostom');
    expect(patristicNotesJoined).toContain('St. Jerome');
    expect(patristicNotesJoined).toContain('Catena Aurea');

    expect(deepAnalysis.catholicDoctrine.map((item) => item.id)).toEqual([
      ...FOUR_POINT_ITEM_IDS,
    ]);
    const doctrineJoined = JSON.stringify(deepAnalysis.catholicDoctrine);
    expect(doctrineJoined).toContain('Romans 11:29');
    expect(doctrineJoined).toContain('anti-Jewish contempt');

    expect(deepAnalysis.youngAdultApplication.map((item) => item.id)).toEqual([
      ...FOUR_POINT_ITEM_IDS,
    ]);

    expect(deepAnalysis.prayerCardTemplate.prompts.map((p) => p.id)).toEqual([
      ...PRAYER_CARD_PROMPT_IDS,
    ]);
    expect(
      deepAnalysis.prayerCardTemplate.prompts.map((p) => p.audienceLabel),
    ).toEqual(['For myself', 'For someone I love', 'For the Church/world']);
    expect(
      deepAnalysis.prayerCardTemplate.prompts.map((p) => p.templateText),
    ).toEqual([
      'Lord, help me ___.',
      'Lord, have mercy on ___.',
      'Lord, make Your house a house of prayer for ___.',
    ]);

    // Section 5: Closing Prayer
    expect(doc.closing.durationMinutes).toBe(3);
    expect(doc.closing.durationLabel).toBe('3 min');
    expect(doc.closing.summaryBullets.length).toBeGreaterThanOrEqual(3);
    expect(doc.closing.weeklyChallenges.map((c) => c.title)).toEqual([
      'Persistent Prayer',
      'Humble Prayer',
      'Catholic Hospitality',
      'Eucharistic Humility',
    ]);
    expect(doc.closing.nextWeekAnnouncement).toEqual({
      title: 'Faith that Endures',
      citation: 'James 1:2–4',
      displayLabel: '"Faith that Endures" — James 1:2–4',
    });
    expect(doc.closing.closingPrayerText).toBe(
      'Lord Jesus, Son of David, have mercy on us. When we feel like outsiders, draw us closer. When You seem silent, teach us to persevere. When we are proud, make us humble. When we are discouraged, strengthen our faith. When we are tempted to send others away, give us Your heart of mercy. Make Your Church a house of prayer for all peoples. Let all nations praise You. Heal those we carry in our hearts. And say over us, by Your grace: "Great is your faith." Amen.',
    );
  });

  it('rejects malformed payloads and non-Gospel main readings in validateStudyDocument', () => {
    expect(validateStudyDocument(null).valid).toBe(false);

    const pollutedGospel = getDefaultStudyDocument();
    pollutedGospel.gospelReading.fullText +=
      ' First Reading: Isaiah 56:1, 6-7.';
    const pollutedResult = validateStudyDocument(pollutedGospel);
    expect(pollutedResult.valid).toBe(false);
    if (!pollutedResult.valid) {
      expect(pollutedResult.errors.join(' ')).toContain(
        'gospelReading.fullText must contain only the Gospel passage',
      );
    }

    const brokenCurated = getDefaultStudyDocument();
    brokenCurated.deepAnalysis.defaultActiveQuestionIds = ['q-missing'];
    const brokenCuratedResult = validateStudyDocument(brokenCurated);
    expect(brokenCuratedResult.valid).toBe(false);

    const emptyPrayers = getDefaultStudyDocument();
    emptyPrayers.openingPrayer.suggestedPrayerText = '   ';
    emptyPrayers.closing.closingPrayerText = '';
    const emptyPrayersResult = validateStudyDocument(emptyPrayers);
    expect(emptyPrayersResult.valid).toBe(false);
  });

  it('returns defensive clones on every call and maintains zero occurrences of "Assistant"', () => {
    const first = getDefaultStudyDocument();
    first.title = 'Mutated Title';
    first.centralThemes.push('Mutated Theme');
    first.icebreaker.examplesToListenFor.splice(0, 4);
    first.gospelReading.verses[0]!.text = 'Mutated Verse';
    first.deepAnalysis.reflectionQuestions.pop();
    first.closing.weeklyChallenges.pop();

    const second = getDefaultStudyDocument();
    expect(second.title).toBe('Great Is Your Faith');
    expect(second.centralThemes).toHaveLength(4);
    expect(second.icebreaker.examplesToListenFor).toHaveLength(8);
    expect(second.gospelReading.verses[0]?.text).toBe(
      'At that time, Jesus withdrew to the region of Tyre and Sidon.',
    );
    expect(second.deepAnalysis.reflectionQuestions).toHaveLength(12);
    expect(second.closing.weeklyChallenges).toHaveLength(4);

    const serialized = JSON.stringify(second);
    expect(serialized).not.toMatch(/assistant/i);

    const sharedStudySource = fs.readFileSync(
      path.resolve(import.meta.dirname, '../../src/shared/study.ts'),
      'utf8',
    );
    const seedSource = fs.readFileSync(
      path.resolve(
        import.meta.dirname,
        '../../src/server/studies/greatIsYourFaithSeed.ts',
      ),
      'utf8',
    );
    expect(sharedStudySource).not.toMatch(/assistant/i);
    expect(seedSource).not.toMatch(/assistant/i);
  });
});

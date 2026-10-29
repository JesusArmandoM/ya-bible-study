export type StudySectionId =
  | 'section_1_prayer'
  | 'section_2_icebreaker'
  | 'section_3_reading'
  | 'section_4_discussion'
  | 'section_5_closing';

export const STUDY_SECTION_IDS = [
  'section_1_prayer',
  'section_2_icebreaker',
  'section_3_reading',
  'section_4_discussion',
  'section_5_closing',
] as const satisfies readonly StudySectionId[];

export type StudySectionNumber = 1 | 2 | 3 | 4 | 5;

export type StudySectionProgressPercent = 20 | 40 | 60 | 80 | 100;

export type StudySectionTurnMode =
  | 'gated_prayer'
  | 'open_share'
  | 'gated_reading'
  | 'none';

export interface StudySectionBase {
  sectionId: StudySectionId;
  sectionNumber: StudySectionNumber;
  progressPercent: StudySectionProgressPercent;
  turnMode: StudySectionTurnMode;
  title: string;
  eyebrow: string;
  durationMinutes: number;
  durationLabel: string;
}

export interface OpeningPrayerSection extends StudySectionBase {
  sectionId: 'section_1_prayer';
  sectionNumber: 1;
  progressPercent: 20;
  turnMode: 'gated_prayer';
  suggestedPrayerText: string;
  leaderPrompt: string;
  participantPrompt: string;
  chosenVolunteerInstruction: string;
}

export interface IcebreakerSection extends StudySectionBase {
  sectionId: 'section_2_icebreaker';
  sectionNumber: 2;
  progressPercent: 40;
  turnMode: 'open_share';
  introText: string;
  mainQuestion: string;
  followUpQuestion: string;
  /** Study Leader pastoral guidance; hidden from Participant views. */
  leaderNote: string;
  /** Study Leader listening cues; hidden from Participant views. */
  examplesToListenFor: string[];
}

export interface GospelVerse {
  verseNumber: number;
  text: string;
}

export interface GospelReadingSection extends StudySectionBase {
  sectionId: 'section_3_reading';
  sectionNumber: 3;
  progressPercent: 60;
  turnMode: 'gated_reading';
  citation: string;
  liturgicalLabel: string;
  /** Complete Gospel proclamation read aloud by the chosen Participant. */
  fullText: string;
  verses: GospelVerse[];
  keyLines: string[];
  /** Supporting Sunday liturgical background for the Study Leader only. */
  leaderLiturgicalContextNote: string;
}

export type CuratedQuestionOrder = 1 | 2 | 3 | null;

export interface ReflectionQuestionItem {
  id: string;
  number: number;
  prompt: string;
  category: string;
  isDefaultCurated: boolean;
  curatedOrder: CuratedQuestionOrder;
  estimatedMinutes: number;
  /** Study Leader reference response; hidden from Participant views. */
  sampleAnswer: string;
  /** Study Leader pastoral guidance; hidden from Participant views. */
  leaderNote: string;
}

export type VerseCommentaryId =
  | 'A'
  | 'B'
  | 'C'
  | 'D'
  | 'E'
  | 'F'
  | 'G'
  | 'H'
  | 'I'
  | 'J';

export const VERSE_COMMENTARY_IDS = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
] as const satisfies readonly VerseCommentaryId[];

export interface VerseCommentaryItem {
  id: VerseCommentaryId;
  verseCitation: string;
  quotedText: string;
  commentary: string;
  catechismReferences: string[];
  patristicNote: string | null;
}

export type FourPointItemId = 'A' | 'B' | 'C' | 'D';

export const FOUR_POINT_ITEM_IDS = [
  'A',
  'B',
  'C',
  'D',
] as const satisfies readonly FourPointItemId[];

export interface DoctrineHighlightItem {
  id: FourPointItemId;
  title: string;
  summary: string;
  references: string[];
}

export interface ApplicationPointItem {
  id: FourPointItemId;
  title: string;
  summary: string;
}

export type PrayerCardPromptId = 'self' | 'loved-one' | 'church-world';

export const PRAYER_CARD_PROMPT_IDS = [
  'self',
  'loved-one',
  'church-world',
] as const satisfies readonly PrayerCardPromptId[];

export interface PrayerCardPromptItem {
  id: PrayerCardPromptId;
  audienceLabel: string;
  promptPrefix: string;
  templateText: string;
}

export interface PrayerCardTemplate {
  title: string;
  instructions: string;
  prompts: [PrayerCardPromptItem, PrayerCardPromptItem, PrayerCardPromptItem];
}

export interface DeepAnalysisSection extends StudySectionBase {
  sectionId: 'section_4_discussion';
  sectionNumber: 4;
  progressPercent: 80;
  turnMode: 'none';
  defaultActiveQuestionIds: string[];
  reflectionQuestions: ReflectionQuestionItem[];
  /** Study Leader verse-by-verse commentary; hidden from Participant views. */
  verseCommentary: VerseCommentaryItem[];
  /** Study Leader doctrinal guardrails; hidden from Participant views. */
  catholicDoctrine: DoctrineHighlightItem[];
  /** Study Leader pastoral application notes; hidden from Participant views. */
  youngAdultApplication: ApplicationPointItem[];
  prayerCardTemplate: PrayerCardTemplate;
}

export interface WeeklyChallengeItem {
  optionNumber: 1 | 2 | 3 | 4;
  title: string;
  description: string;
}

export interface NextWeekAnnouncement {
  title: string;
  citation: string;
  displayLabel: string;
}

export interface ClosingSection extends StudySectionBase {
  sectionId: 'section_5_closing';
  sectionNumber: 5;
  progressPercent: 100;
  turnMode: 'none';
  summaryBullets: string[];
  weeklyChallenges: WeeklyChallengeItem[];
  nextWeekAnnouncement: NextWeekAnnouncement;
  closingPrayerText: string;
}

export type StudySection =
  | OpeningPrayerSection
  | IcebreakerSection
  | GospelReadingSection
  | DeepAnalysisSection
  | ClosingSection;

export type OrderedStudySections = [
  OpeningPrayerSection,
  IcebreakerSection,
  GospelReadingSection,
  DeepAnalysisSection,
  ClosingSection,
];

export type StudySourceType = 'preloaded' | 'markdown' | 'pdf';

export interface StudySourceMetadata {
  type: StudySourceType;
  fileName: string;
  statusLabel: 'Analyzed';
}

export interface StudyDetectionSummary {
  sectionCount: 5;
  sectionsDetectedLabel: string;
  detectedLabel: string;
  curatedQuestionCount: number;
  totalQuestionCount: number;
  hasOpeningPrayer: boolean;
  hasGospelReading: boolean;
  hasClosingPrayer: boolean;
}

export interface StudyDocument {
  id: string;
  title: string;
  subtitle: string;
  liturgicalDate: string;
  liturgicalEyebrow: string;
  gospelCitation: string;
  gospelSummaryLabel: string;
  estimatedMinutes: number;
  sectionCount: 5;
  centralThemes: string[];
  sessionGoals: string[];
  oneSentenceMainPoint: string;
  source: StudySourceMetadata;
  detectionSummary: StudyDetectionSummary;
  openingPrayer: OpeningPrayerSection;
  icebreaker: IcebreakerSection;
  gospelReading: GospelReadingSection;
  deepAnalysis: DeepAnalysisSection;
  closing: ClosingSection;
}

export type StudyValidationResult =
  | { valid: true; value: StudyDocument }
  | { valid: false; errors: string[] };

export function getStudySections(doc: StudyDocument): OrderedStudySections {
  return [
    doc.openingPrayer,
    doc.icebreaker,
    doc.gospelReading,
    doc.deepAnalysis,
    doc.closing,
  ];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((entry) => isNonEmptyString(entry))
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => isNonEmptyString(entry));
}

const NON_GOSPEL_MAIN_READING_PATTERNS: readonly RegExp[] = [
  /\bFirst Reading\b/i,
  /\bSecond Reading\b/i,
  /\bResponsorial Psalm\b/i,
  /\bIsaiah\s+\d+/i,
  /\bPsalm\s+\d+/i,
  /\bRomans\s+\d+/i,
];

function validateSectionBase(
  rawSection: unknown,
  expected: {
    key: string;
    sectionId: StudySectionId;
    sectionNumber: StudySectionNumber;
    progressPercent: StudySectionProgressPercent;
    turnMode: StudySectionTurnMode;
  },
  errors: string[],
): rawSection is Record<string, unknown> {
  if (!isPlainRecord(rawSection)) {
    errors.push(`${expected.key} must be an object.`);
    return false;
  }

  if (rawSection.sectionId !== expected.sectionId) {
    errors.push(
      `${expected.key}.sectionId must be "${expected.sectionId}".`,
    );
  }
  if (rawSection.sectionNumber !== expected.sectionNumber) {
    errors.push(
      `${expected.key}.sectionNumber must be ${expected.sectionNumber}.`,
    );
  }
  if (rawSection.progressPercent !== expected.progressPercent) {
    errors.push(
      `${expected.key}.progressPercent must be ${expected.progressPercent}.`,
    );
  }
  if (rawSection.turnMode !== expected.turnMode) {
    errors.push(`${expected.key}.turnMode must be "${expected.turnMode}".`);
  }
  if (!isNonEmptyString(rawSection.title)) {
    errors.push(`${expected.key}.title must be a non-empty string.`);
  }
  if (!isNonEmptyString(rawSection.eyebrow)) {
    errors.push(`${expected.key}.eyebrow must be a non-empty string.`);
  }
  if (!isPositiveNumber(rawSection.durationMinutes)) {
    errors.push(`${expected.key}.durationMinutes must be a positive number.`);
  }
  if (!isNonEmptyString(rawSection.durationLabel)) {
    errors.push(`${expected.key}.durationLabel must be a non-empty string.`);
  }

  return true;
}

export function validateStudyDocument(input: unknown): StudyValidationResult {
  const errors: string[] = [];

  if (!isPlainRecord(input)) {
    return { valid: false, errors: ['StudyDocument must be an object.'] };
  }

  const requiredStringFields = [
    'id',
    'title',
    'subtitle',
    'liturgicalDate',
    'liturgicalEyebrow',
    'gospelCitation',
    'gospelSummaryLabel',
    'oneSentenceMainPoint',
  ] as const;

  for (const field of requiredStringFields) {
    if (!isNonEmptyString(input[field])) {
      errors.push(`${field} must be a non-empty string.`);
    }
  }

  if (!isPositiveNumber(input.estimatedMinutes)) {
    errors.push('estimatedMinutes must be a positive number.');
  }
  if (input.sectionCount !== 5) {
    errors.push('sectionCount must equal 5.');
  }
  if (!isNonEmptyStringArray(input.centralThemes)) {
    errors.push('centralThemes must be a non-empty array of strings.');
  }
  if (!isNonEmptyStringArray(input.sessionGoals)) {
    errors.push('sessionGoals must be a non-empty array of strings.');
  }

  if (!isPlainRecord(input.source)) {
    errors.push('source must be an object.');
  } else {
    const sourceType = input.source.type;
    if (
      sourceType !== 'preloaded' &&
      sourceType !== 'markdown' &&
      sourceType !== 'pdf'
    ) {
      errors.push('source.type must be "preloaded", "markdown", or "pdf".');
    }
    if (!isNonEmptyString(input.source.fileName)) {
      errors.push('source.fileName must be a non-empty string.');
    }
    if (input.source.statusLabel !== 'Analyzed') {
      errors.push('source.statusLabel must be "Analyzed".');
    }
  }

  if (!isPlainRecord(input.detectionSummary)) {
    errors.push('detectionSummary must be an object.');
  } else {
    if (input.detectionSummary.sectionCount !== 5) {
      errors.push('detectionSummary.sectionCount must equal 5.');
    }
    if (!isNonEmptyString(input.detectionSummary.sectionsDetectedLabel)) {
      errors.push(
        'detectionSummary.sectionsDetectedLabel must be a non-empty string.',
      );
    }
    if (!isNonEmptyString(input.detectionSummary.detectedLabel)) {
      errors.push('detectionSummary.detectedLabel must be a non-empty string.');
    }
    if (
      typeof input.detectionSummary.curatedQuestionCount !== 'number' ||
      input.detectionSummary.curatedQuestionCount < 1
    ) {
      errors.push('detectionSummary.curatedQuestionCount must be at least 1.');
    }
    if (
      typeof input.detectionSummary.totalQuestionCount !== 'number' ||
      input.detectionSummary.totalQuestionCount < 1
    ) {
      errors.push('detectionSummary.totalQuestionCount must be at least 1.');
    }
    if (input.detectionSummary.hasOpeningPrayer !== true) {
      errors.push('detectionSummary.hasOpeningPrayer must be true.');
    }
    if (input.detectionSummary.hasGospelReading !== true) {
      errors.push('detectionSummary.hasGospelReading must be true.');
    }
    if (input.detectionSummary.hasClosingPrayer !== true) {
      errors.push('detectionSummary.hasClosingPrayer must be true.');
    }
  }

  if (
    validateSectionBase(
      input.openingPrayer,
      {
        key: 'openingPrayer',
        sectionId: 'section_1_prayer',
        sectionNumber: 1,
        progressPercent: 20,
        turnMode: 'gated_prayer',
      },
      errors,
    )
  ) {
    if (!isNonEmptyString(input.openingPrayer.suggestedPrayerText)) {
      errors.push(
        'openingPrayer.suggestedPrayerText must be a non-empty string.',
      );
    }
    if (!isNonEmptyString(input.openingPrayer.leaderPrompt)) {
      errors.push('openingPrayer.leaderPrompt must be a non-empty string.');
    }
    if (!isNonEmptyString(input.openingPrayer.participantPrompt)) {
      errors.push(
        'openingPrayer.participantPrompt must be a non-empty string.',
      );
    }
    if (!isNonEmptyString(input.openingPrayer.chosenVolunteerInstruction)) {
      errors.push(
        'openingPrayer.chosenVolunteerInstruction must be a non-empty string.',
      );
    }
  }

  if (
    validateSectionBase(
      input.icebreaker,
      {
        key: 'icebreaker',
        sectionId: 'section_2_icebreaker',
        sectionNumber: 2,
        progressPercent: 40,
        turnMode: 'open_share',
      },
      errors,
    )
  ) {
    if (!isNonEmptyString(input.icebreaker.introText)) {
      errors.push('icebreaker.introText must be a non-empty string.');
    }
    if (!isNonEmptyString(input.icebreaker.mainQuestion)) {
      errors.push('icebreaker.mainQuestion must be a non-empty string.');
    }
    if (!isNonEmptyString(input.icebreaker.followUpQuestion)) {
      errors.push('icebreaker.followUpQuestion must be a non-empty string.');
    }
    if (!isNonEmptyString(input.icebreaker.leaderNote)) {
      errors.push('icebreaker.leaderNote must be a non-empty string.');
    }
    if (!isNonEmptyStringArray(input.icebreaker.examplesToListenFor)) {
      errors.push(
        'icebreaker.examplesToListenFor must be a non-empty array of strings.',
      );
    }
  }

  if (
    validateSectionBase(
      input.gospelReading,
      {
        key: 'gospelReading',
        sectionId: 'section_3_reading',
        sectionNumber: 3,
        progressPercent: 60,
        turnMode: 'gated_reading',
      },
      errors,
    )
  ) {
    const gospel = input.gospelReading;
    if (!isNonEmptyString(gospel.citation)) {
      errors.push('gospelReading.citation must be a non-empty string.');
    }
    if (!isNonEmptyString(gospel.liturgicalLabel)) {
      errors.push('gospelReading.liturgicalLabel must be a non-empty string.');
    }
    if (!isNonEmptyString(gospel.fullText)) {
      errors.push('gospelReading.fullText must be a non-empty string.');
    } else {
      for (const pattern of NON_GOSPEL_MAIN_READING_PATTERNS) {
        if (pattern.test(gospel.fullText)) {
          errors.push(
            'gospelReading.fullText must contain only the Gospel passage without Old Testament, Psalm, or Epistle readings.',
          );
          break;
        }
      }
    }
    if (
      isNonEmptyString(gospel.citation) &&
      NON_GOSPEL_MAIN_READING_PATTERNS.some((pattern) =>
        pattern.test(gospel.citation as string),
      )
    ) {
      errors.push('gospelReading.citation must cite a Gospel passage only.');
    }
    if (!Array.isArray(gospel.verses) || gospel.verses.length === 0) {
      errors.push('gospelReading.verses must be a non-empty array.');
    } else {
      for (const [index, verse] of gospel.verses.entries()) {
        if (
          !isPlainRecord(verse) ||
          typeof verse.verseNumber !== 'number' ||
          !Number.isInteger(verse.verseNumber) ||
          verse.verseNumber < 1 ||
          !isNonEmptyString(verse.text)
        ) {
          errors.push(
            `gospelReading.verses[${index}] must include a positive integer verseNumber and non-empty text.`,
          );
        }
      }
    }
    if (!isNonEmptyStringArray(gospel.keyLines)) {
      errors.push('gospelReading.keyLines must be a non-empty array of strings.');
    }
    if (!isNonEmptyString(gospel.leaderLiturgicalContextNote)) {
      errors.push(
        'gospelReading.leaderLiturgicalContextNote must be a non-empty string.',
      );
    }
  }

  if (
    validateSectionBase(
      input.deepAnalysis,
      {
        key: 'deepAnalysis',
        sectionId: 'section_4_discussion',
        sectionNumber: 4,
        progressPercent: 80,
        turnMode: 'none',
      },
      errors,
    )
  ) {
    const analysis = input.deepAnalysis;
    const questionIdSet = new Set<string>();

    if (
      !Array.isArray(analysis.reflectionQuestions) ||
      analysis.reflectionQuestions.length === 0
    ) {
      errors.push(
        'deepAnalysis.reflectionQuestions must be a non-empty array.',
      );
    } else {
      for (const [index, question] of analysis.reflectionQuestions.entries()) {
        if (!isPlainRecord(question)) {
          errors.push(
            `deepAnalysis.reflectionQuestions[${index}] must be an object.`,
          );
          continue;
        }
        if (!isNonEmptyString(question.id)) {
          errors.push(
            `deepAnalysis.reflectionQuestions[${index}].id must be a non-empty string.`,
          );
        } else if (questionIdSet.has(question.id)) {
          errors.push(
            `deepAnalysis.reflectionQuestions contains duplicate id "${question.id}".`,
          );
        } else {
          questionIdSet.add(question.id);
        }
        if (
          typeof question.number !== 'number' ||
          !Number.isInteger(question.number) ||
          question.number < 1
        ) {
          errors.push(
            `deepAnalysis.reflectionQuestions[${index}].number must be a positive integer.`,
          );
        }
        if (!isNonEmptyString(question.prompt)) {
          errors.push(
            `deepAnalysis.reflectionQuestions[${index}].prompt must be a non-empty string.`,
          );
        }
        if (!isNonEmptyString(question.category)) {
          errors.push(
            `deepAnalysis.reflectionQuestions[${index}].category must be a non-empty string.`,
          );
        }
        if (typeof question.isDefaultCurated !== 'boolean') {
          errors.push(
            `deepAnalysis.reflectionQuestions[${index}].isDefaultCurated must be a boolean.`,
          );
        }
        const curatedOrder = question.curatedOrder;
        if (
          curatedOrder !== null &&
          curatedOrder !== 1 &&
          curatedOrder !== 2 &&
          curatedOrder !== 3
        ) {
          errors.push(
            `deepAnalysis.reflectionQuestions[${index}].curatedOrder must be 1, 2, 3, or null.`,
          );
        }
        if (!isPositiveNumber(question.estimatedMinutes)) {
          errors.push(
            `deepAnalysis.reflectionQuestions[${index}].estimatedMinutes must be a positive number.`,
          );
        }
        if (!isNonEmptyString(question.sampleAnswer)) {
          errors.push(
            `deepAnalysis.reflectionQuestions[${index}].sampleAnswer must be a non-empty string.`,
          );
        }
        if (!isNonEmptyString(question.leaderNote)) {
          errors.push(
            `deepAnalysis.reflectionQuestions[${index}].leaderNote must be a non-empty string.`,
          );
        }
      }
    }

    if (!isNonEmptyStringArray(analysis.defaultActiveQuestionIds)) {
      errors.push(
        'deepAnalysis.defaultActiveQuestionIds must contain at least 1 question id.',
      );
    } else {
      for (const activeId of analysis.defaultActiveQuestionIds) {
        if (!questionIdSet.has(activeId)) {
          errors.push(
            `deepAnalysis.defaultActiveQuestionIds references unknown question id "${activeId}".`,
          );
        }
      }
    }

    if (
      !Array.isArray(analysis.verseCommentary) ||
      analysis.verseCommentary.length === 0
    ) {
      errors.push('deepAnalysis.verseCommentary must be a non-empty array.');
    } else {
      for (const [index, entry] of analysis.verseCommentary.entries()) {
        if (
          !isPlainRecord(entry) ||
          !VERSE_COMMENTARY_IDS.includes(entry.id as VerseCommentaryId) ||
          !isNonEmptyString(entry.verseCitation) ||
          !isNonEmptyString(entry.quotedText) ||
          !isNonEmptyString(entry.commentary) ||
          !isStringArray(entry.catechismReferences) ||
          (entry.patristicNote !== null && !isNonEmptyString(entry.patristicNote))
        ) {
          errors.push(
            `deepAnalysis.verseCommentary[${index}] is missing required fields.`,
          );
        }
      }
    }

    if (
      !Array.isArray(analysis.catholicDoctrine) ||
      analysis.catholicDoctrine.length === 0
    ) {
      errors.push('deepAnalysis.catholicDoctrine must be a non-empty array.');
    } else {
      for (const [index, entry] of analysis.catholicDoctrine.entries()) {
        if (
          !isPlainRecord(entry) ||
          !FOUR_POINT_ITEM_IDS.includes(entry.id as FourPointItemId) ||
          !isNonEmptyString(entry.title) ||
          !isNonEmptyString(entry.summary) ||
          !isStringArray(entry.references)
        ) {
          errors.push(
            `deepAnalysis.catholicDoctrine[${index}] is missing required fields.`,
          );
        }
      }
    }

    if (
      !Array.isArray(analysis.youngAdultApplication) ||
      analysis.youngAdultApplication.length === 0
    ) {
      errors.push(
        'deepAnalysis.youngAdultApplication must be a non-empty array.',
      );
    } else {
      for (const [index, entry] of analysis.youngAdultApplication.entries()) {
        if (
          !isPlainRecord(entry) ||
          !FOUR_POINT_ITEM_IDS.includes(entry.id as FourPointItemId) ||
          !isNonEmptyString(entry.title) ||
          !isNonEmptyString(entry.summary)
        ) {
          errors.push(
            `deepAnalysis.youngAdultApplication[${index}] is missing required fields.`,
          );
        }
      }
    }

    if (!isPlainRecord(analysis.prayerCardTemplate)) {
      errors.push('deepAnalysis.prayerCardTemplate must be an object.');
    } else {
      if (!isNonEmptyString(analysis.prayerCardTemplate.title)) {
        errors.push(
          'deepAnalysis.prayerCardTemplate.title must be a non-empty string.',
        );
      }
      if (!isNonEmptyString(analysis.prayerCardTemplate.instructions)) {
        errors.push(
          'deepAnalysis.prayerCardTemplate.instructions must be a non-empty string.',
        );
      }
      const prompts = analysis.prayerCardTemplate.prompts;
      if (!Array.isArray(prompts) || prompts.length !== 3) {
        errors.push(
          'deepAnalysis.prayerCardTemplate.prompts must contain 3 items.',
        );
      } else {
        for (const [index, expectedId] of PRAYER_CARD_PROMPT_IDS.entries()) {
          const item = prompts[index];
          if (
            !isPlainRecord(item) ||
            item.id !== expectedId ||
            !isNonEmptyString(item.audienceLabel) ||
            !isNonEmptyString(item.promptPrefix) ||
            !isNonEmptyString(item.templateText)
          ) {
            errors.push(
              `deepAnalysis.prayerCardTemplate.prompts[${index}] must match prompt "${expectedId}".`,
            );
          }
        }
      }
    }
  }

  if (
    validateSectionBase(
      input.closing,
      {
        key: 'closing',
        sectionId: 'section_5_closing',
        sectionNumber: 5,
        progressPercent: 100,
        turnMode: 'none',
      },
      errors,
    )
  ) {
    const closing = input.closing;
    if (!isNonEmptyStringArray(closing.summaryBullets)) {
      errors.push('closing.summaryBullets must be a non-empty array of strings.');
    }
    if (
      !Array.isArray(closing.weeklyChallenges) ||
      closing.weeklyChallenges.length === 0
    ) {
      errors.push('closing.weeklyChallenges must be a non-empty array.');
    } else {
      for (const [index, challenge] of closing.weeklyChallenges.entries()) {
        if (
          !isPlainRecord(challenge) ||
          (challenge.optionNumber !== 1 &&
            challenge.optionNumber !== 2 &&
            challenge.optionNumber !== 3 &&
            challenge.optionNumber !== 4) ||
          !isNonEmptyString(challenge.title) ||
          !isNonEmptyString(challenge.description)
        ) {
          errors.push(
            `closing.weeklyChallenges[${index}] must include optionNumber (1..4), title, and description.`,
          );
        }
      }
    }
    if (!isPlainRecord(closing.nextWeekAnnouncement)) {
      errors.push('closing.nextWeekAnnouncement must be an object.');
    } else {
      if (!isNonEmptyString(closing.nextWeekAnnouncement.title)) {
        errors.push(
          'closing.nextWeekAnnouncement.title must be a non-empty string.',
        );
      }
      if (!isNonEmptyString(closing.nextWeekAnnouncement.citation)) {
        errors.push(
          'closing.nextWeekAnnouncement.citation must be a non-empty string.',
        );
      }
      if (!isNonEmptyString(closing.nextWeekAnnouncement.displayLabel)) {
        errors.push(
          'closing.nextWeekAnnouncement.displayLabel must be a non-empty string.',
        );
      }
    }
    if (!isNonEmptyString(closing.closingPrayerText)) {
      errors.push('closing.closingPrayerText must be a non-empty string.');
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, value: input as unknown as StudyDocument };
}

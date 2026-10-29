import {
  type ApplicationPointItem,
  type ClosingSection,
  type CuratedQuestionOrder,
  type DeepAnalysisSection,
  type DoctrineHighlightItem,
  type FourPointItemId,
  type GospelReadingSection,
  type GospelVerse,
  type IcebreakerSection,
  type NextWeekAnnouncement,
  type OpeningPrayerSection,
  type PrayerCardPromptItem,
  type PrayerCardTemplate,
  type ReflectionQuestionItem,
  type StudyDetectionSummary,
  type StudyDocument,
  type StudyValidationResult,
  type VerseCommentaryId,
  type VerseCommentaryItem,
  type WeeklyChallengeItem,
  validateStudyDocument,
} from '../../shared/study.js';

export interface ParseMarkdownStudyOptions {
  fileName?: string;
}

function cleanMarkdownText(text: string): string {
  return text
    .replace(/^>\s*/gm, '')
    .replace(/[*_~`]/g, '')
    .trim();
}

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return slug.length > 0 ? slug : 'study';
}

function group(match: RegExpMatchArray | null, index: number): string {
  return match?.[index]?.trim() ?? '';
}

function extractBullets(content: string): string[] {
  const lines = content.split('\n');
  const bullets: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(/^[-*•]\s+(.*)$/) || trimmed.match(/^\d+\.\s+(.*)$/);
    if (match) {
      const item = group(match, 1);
      if (item.length > 0) {
        bullets.push(item);
      }
    }
  }

  return bullets;
}

interface SplitSections {
  preamble: string;
  sectionMap: Map<number, { title: string; content: string }>;
}

function splitSections(markdown: string): SplitSections {
  const lines = markdown.split('\n');
  const sectionMap = new Map<number, { title: string; content: string }>();
  let currentSectionNumber: number | null = null;
  let currentSectionTitle = '';
  let currentLines: string[] = [];
  const preambleLines: string[] = [];

  const getSectionNumber = (headingText: string): number | null => {
    const numMatch = headingText.match(/^(\d+)\.\s*(.*)$/);
    if (numMatch) {
      const parsedNum = parseInt(group(numMatch, 1), 10);
      if (Number.isFinite(parsedNum)) {
        return parsedNum;
      }
    }
    const lower = headingText.toLowerCase();
    if (lower.includes('central theme')) return 1;
    if (lower.includes('session goal')) return 2;
    if (lower.includes('schedule')) return 3;
    if (lower.includes('opening prayer')) return 4;
    if (lower.includes('icebreaker')) return 5;
    if (lower.includes('proclamation')) return 6;
    if (lower.includes('biblical') && lower.includes('context')) return 7;
    if (lower.includes('deep analysis')) return 8;
    if (lower.includes('catholic doctrine')) return 9;
    if (lower.includes('young adult')) return 10;
    if (lower.includes('reflection question')) return 11;
    if (lower.includes('group activity') || lower.includes('prayer card')) return 12;
    if (lower.includes('weekly challenge')) return 13;
    if (lower.includes('closing summary')) return 14;
    if (lower.includes('closing prayer')) return 15;
    if (lower.includes('next week')) return 16;
    if (lower.includes('main point')) return 17;
    return null;
  };

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.*)$/);
    if (headingMatch) {
      if (currentSectionNumber !== null) {
        sectionMap.set(currentSectionNumber, {
          title: currentSectionTitle,
          content: currentLines.join('\n').trim(),
        });
      }
      const rawHeading = group(headingMatch, 1);
      currentSectionNumber = getSectionNumber(rawHeading);
      currentSectionTitle = rawHeading;
      currentLines = [];
    } else if (currentSectionNumber !== null) {
      currentLines.push(line);
    } else {
      preambleLines.push(line);
    }
  }

  if (currentSectionNumber !== null) {
    sectionMap.set(currentSectionNumber, {
      title: currentSectionTitle,
      content: currentLines.join('\n').trim(),
    });
  }

  return {
    preamble: preambleLines.join('\n').trim(),
    sectionMap,
  };
}

export function parseMarkdownStudy(
  markdownContent: string,
  options: ParseMarkdownStudyOptions = {},
): StudyValidationResult {
  const rawText = (markdownContent ?? '').trim();
  if (rawText.length === 0) {
    return {
      valid: false,
      errors: ['Study document markdown content is empty.'],
    };
  }

  const { preamble, sectionMap } = splitSections(rawText);

  // Validate presence of fundamental required sections before deep extraction
  const missingSectionErrors: string[] = [];
  if (!sectionMap.has(4)) {
    missingSectionErrors.push('Missing Section 4 (Opening Prayer).');
  }
  if (!sectionMap.has(5)) {
    missingSectionErrors.push('Missing Section 5 (Icebreaker).');
  }
  if (!sectionMap.has(6)) {
    missingSectionErrors.push('Missing Section 6 (Proclamation of the Readings).');
  }
  if (!sectionMap.has(8)) {
    missingSectionErrors.push('Missing Section 8 (Deep Analysis).');
  }
  if (!sectionMap.has(11)) {
    missingSectionErrors.push('Missing Section 11 (Reflection Questions).');
  }
  if (!sectionMap.has(15)) {
    missingSectionErrors.push('Missing Section 15 (Closing Prayer).');
  }

  if (missingSectionErrors.length > 0) {
    return { valid: false, errors: missingSectionErrors };
  }

  // --- Preamble & Metadata ---
  let title = 'Catholic Young Adult Bible Study';
  let subtitle = '';
  const titleMatch = preamble.match(/^#\s+(.*)$/m);
  if (titleMatch) {
    const rawTitle = group(titleMatch, 1);
    const splitIndex = rawTitle.search(/:\s+|—\s+|–\s+/);
    if (splitIndex !== -1) {
      title = cleanMarkdownText(rawTitle.slice(0, splitIndex));
      subtitle = cleanMarkdownText(rawTitle.slice(splitIndex + 1).replace(/^[:—–]\s*/, ''));
    } else {
      title = cleanMarkdownText(rawTitle);
    }
  }

  const subtitleMetaMatch = preamble.match(/\*\*Subtitle:\*\*\s*(.*)/i);
  if (subtitleMetaMatch) {
    const subText = group(subtitleMetaMatch, 1);
    if (subText.length > 0) {
      subtitle = cleanMarkdownText(subText);
    }
  }
  if (subtitle.length === 0) {
    subtitle = title;
  }

  let liturgicalDate = 'Twentieth Sunday in Ordinary Time, Year A';
  const liturgicalDateMatch =
    preamble.match(/\*\*Liturgical Occasion:\*\*\s*(.*)/i) ||
    preamble.match(/\*\*Liturgical Date:\*\*\s*(.*)/i);
  if (liturgicalDateMatch) {
    liturgicalDate = cleanMarkdownText(group(liturgicalDateMatch, 1));
  }

  let liturgicalEyebrow = 'WEEK 32 · 20TH SUNDAY OT';
  const eyebrowMatch =
    preamble.match(/\*\*Eyebrow:\*\*\s*(.*)/i) ||
    preamble.match(/\*\*Liturgical Eyebrow:\*\*\s*(.*)/i);
  if (eyebrowMatch) {
    liturgicalEyebrow = cleanMarkdownText(group(eyebrowMatch, 1));
  } else {
    liturgicalEyebrow = liturgicalDate.toUpperCase();
  }

  let gospelCitation = '';
  let gospelSummaryLabel = '';
  const gospelMetaMatch =
    preamble.match(/\*\*Gospel:\*\*\s*(.*)/i) ||
    preamble.match(/\*\*Gospel Citation:\*\*\s*(.*)/i);
  if (gospelMetaMatch) {
    const rawGospel = cleanMarkdownText(group(gospelMetaMatch, 1));
    const parenMatch = rawGospel.match(/^(.*?)\s*\((.*?)\)$/);
    if (parenMatch) {
      gospelCitation = group(parenMatch, 1);
      gospelSummaryLabel = `${gospelCitation} · ${group(parenMatch, 2)}`;
    } else {
      gospelCitation = rawGospel;
      gospelSummaryLabel = rawGospel;
    }
  }

  let estimatedMinutes = 90;
  const scheduleMetaMatch =
    preamble.match(/\*\*Schedule:\*\*\s*~?(\d+)/i) ||
    preamble.match(/\*\*Duration:\*\*\s*~?(\d+)/i);
  if (scheduleMetaMatch) {
    const mins = parseInt(group(scheduleMetaMatch, 1), 10);
    if (Number.isFinite(mins)) {
      estimatedMinutes = mins;
    }
  }

  // --- Section 1: Central Themes ---
  let centralThemes: string[] = [];
  const sec1 = sectionMap.get(1);
  if (sec1) {
    centralThemes = extractBullets(sec1.content);
  }
  if (centralThemes.length === 0) {
    centralThemes = ['Universal mercy in Christ Jesus', 'Humble and persistent faith'];
  }

  // --- Section 2: Session Goals ---
  let sessionGoals: string[] = [];
  const sec2 = sectionMap.get(2);
  if (sec2) {
    sessionGoals = extractBullets(sec2.content);
  }
  if (sessionGoals.length === 0) {
    sessionGoals = [
      'Proclaim Scripture as one community of Catholic young adults.',
      'Reflect on authentic Gospel discipleship and personal prayer.',
    ];
  }

  // --- Section 3: Schedule ---
  const sec3 = sectionMap.get(3);
  if (sec3) {
    const durMatch = sec3.content.match(/(\d+)\s*(?:min|minutes|m\b)/i);
    if (durMatch && !scheduleMetaMatch) {
      const mins = parseInt(group(durMatch, 1), 10);
      if (Number.isFinite(mins)) {
        estimatedMinutes = mins;
      }
    }
  }

  // --- Section 4: Opening Prayer ---
  const sec4Content = sectionMap.get(4)!.content;
  const openingPrayerText = sec4Content
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .map((line) => line.replace(/^>\s*/, '').trim())
    .filter((line) => line.length > 0)
    .join(' ');

  const openingPrayer: OpeningPrayerSection = {
    sectionId: 'section_1_prayer',
    sectionNumber: 1,
    progressPercent: 20,
    turnMode: 'gated_prayer',
    title: 'Opening Prayer',
    eyebrow: 'MOMENT',
    durationMinutes: 5,
    durationLabel: '5 min',
    suggestedPrayerText: openingPrayerText,
    leaderPrompt: 'Waiting for someone to volunteer to pray',
    participantPrompt: 'Tap Raise Hand if you would like to open our Bible study in prayer.',
    chosenVolunteerInstruction: 'When you finish, tap "Done" so the Study Leader can continue.',
  };

  // --- Section 5: Icebreaker ---
  const sec5 = sectionMap.get(5)!;
  let icebreakerTitle = 'Icebreaker';
  const icebreakerTitleMatch = sec5.title.match(/Icebreaker:\s*(.*)$/i);
  if (icebreakerTitleMatch) {
    icebreakerTitle = cleanMarkdownText(group(icebreakerTitleMatch, 1));
  }

  const introMatch = sec5.content.match(/\*\*Intro(?:duction)?:\*\*\s*([\s\S]*?)(?=\n\*\*|\n##|$)/i);
  const mainQMatch = sec5.content.match(/\*\*Main Question:\*\*\s*([\s\S]*?)(?=\n\*\*|\n##|$)/i);
  const followUpMatch = sec5.content.match(
    /\*\*Follow-up(?: Question)?:\*\*\s*([\s\S]*?)(?=\n\*\*|\n##|$)/i,
  );
  const leaderNoteMatch = sec5.content.match(
    /\*?\*?Leader Note:\*?\*?\s*([\s\S]*?)(?=\n\*\*|\n##|$)/i,
  );
  const examplesBlockMatch = sec5.content.match(
    /\*\*Examples to Listen For:\*\*\s*([\s\S]*?)(?=\n##|$)/i,
  );

  const introText = introMatch
    ? cleanMarkdownText(group(introMatch, 1))
    : 'Reflect on moments in your life — then bring them to Jesus.';
  const mainQuestion = mainQMatch
    ? cleanMarkdownText(group(mainQMatch, 1))
    : 'Where in your life have you encountered challenges recently?';
  const followUpQuestion = followUpMatch
    ? cleanMarkdownText(group(followUpMatch, 1))
    : 'How do you usually respond in those moments?';
  const icebreakerLeaderNote = leaderNoteMatch
    ? cleanMarkdownText(group(leaderNoteMatch, 1))
    : 'Invite 2–4 brief, honest shares without pressuring any Participant.';

  let examplesToListenFor: string[] = [];
  if (examplesBlockMatch) {
    examplesToListenFor = extractBullets(group(examplesBlockMatch, 1));
  }
  if (examplesToListenFor.length === 0) {
    examplesToListenFor = [
      'Feeling spiritually behind others',
      'Not knowing enough about the faith',
      'Being new to the parish or young adult fellowship',
      'Feeling unworthy to pray',
    ];
  }

  const icebreaker: IcebreakerSection = {
    sectionId: 'section_2_icebreaker',
    sectionNumber: 2,
    progressPercent: 40,
    turnMode: 'open_share',
    title: icebreakerTitle,
    eyebrow: 'ICEBREAKER · 10 MIN',
    durationMinutes: 10,
    durationLabel: '10 min',
    introText,
    mainQuestion,
    followUpQuestion,
    leaderNote: icebreakerLeaderNote,
    examplesToListenFor,
  };

  // --- Section 6 & 7: Proclamation & Liturgical Context ---
  const sec6Content = sectionMap.get(6)!.content;
  const gospelCitationMatch = sec6Content.match(/\*\*Gospel Citation:\*\*\s*(.*)/i);
  if (gospelCitationMatch) {
    const cit = group(gospelCitationMatch, 1);
    if (cit.length > 0) {
      gospelCitation = cleanMarkdownText(cit);
    }
  }

  let liturgicalLabel = 'Twentieth Sunday in Ordinary Time · Year A';
  const liturgicalLabelMatch = sec6Content.match(/\*\*Liturgical Label:\*\*\s*(.*)/i);
  if (liturgicalLabelMatch) {
    liturgicalLabel = cleanMarkdownText(group(liturgicalLabelMatch, 1));
  } else if (liturgicalDate.length > 0) {
    liturgicalLabel = liturgicalDate;
  }

  if (gospelSummaryLabel.length === 0) {
    gospelSummaryLabel = gospelCitation;
  }

  // Extract Key lines
  const keyLinesBlockMatch = sec6Content.match(
    /\*?\*?Key [Ll]ines:\*?\*?\s*([\s\S]*?)(?=\n###|\n##|$)/,
  );
  let keyLines: string[] = [];
  if (keyLinesBlockMatch) {
    keyLines = extractBullets(group(keyLinesBlockMatch, 1));
  }

  // Extract Supporting Mass readings from Section 6
  let supportingMassReadingsText = '';
  const supportingReadingsMatch = sec6Content.match(
    /### Supporting Mass Readings([\s\S]*?)(?=\n###|\n\*\*Key|\n\*Key|$)/i,
  );
  if (supportingReadingsMatch) {
    const rawBullets = extractBullets(group(supportingReadingsMatch, 1));
    if (rawBullets.length > 0) {
      supportingMassReadingsText = rawBullets.join('; ');
    } else {
      supportingMassReadingsText = cleanMarkdownText(group(supportingReadingsMatch, 1));
    }
  }

  // Section 7 Biblical Context
  let sec7ContentText = '';
  const sec7 = sectionMap.get(7);
  if (sec7) {
    sec7ContentText = cleanMarkdownText(sec7.content);
  }

  let leaderLiturgicalContextNote = '';
  if (sec7ContentText.length > 0) {
    leaderLiturgicalContextNote = sec7ContentText;
  } else if (supportingMassReadingsText.length > 0) {
    leaderLiturgicalContextNote = `Supporting Sunday Mass Liturgical Context for Study Leader reference only (Section 3 proclaims only the Gospel Reading aloud): ${supportingMassReadingsText}`;
  } else {
    leaderLiturgicalContextNote =
      'Supporting Sunday Mass Liturgical Context for Study Leader reference only (Section 3 proclaims only the Gospel Reading aloud).';
  }

  // Extract Gospel verses from Section 6
  let gospelVerses: GospelVerse[] = [];
  let gospelFullText = '';

  const gospelProclamationBlockMatch = sec6Content.match(
    /### Gospel Proclamation.*?\n([\s\S]*?)(?=\n\*\*Key|\n\*Key|\n###|$)/i,
  );

  const blockToScan = gospelProclamationBlockMatch
    ? group(gospelProclamationBlockMatch, 1)
    : sec6Content;

  const verseLines = blockToScan.split('\n');
  for (const line of verseLines) {
    const trimmed = line.trim();
    const verseMatch =
      trimmed.match(/^(\d+)\s+([A-Z"'].*)$/) ||
      trimmed.match(/^\[(\d+)\]\s+(.*)$/) ||
      trimmed.match(/^\*\*(\d+)\*\*\s+(.*)$/);
    if (verseMatch) {
      const verseNumber = parseInt(group(verseMatch, 1), 10);
      const text = group(verseMatch, 2);
      if (Number.isFinite(verseNumber) && text.length > 0) {
        gospelVerses.push({ verseNumber, text });
      }
    }
  }

  if (gospelVerses.length > 0) {
    gospelFullText = gospelVerses.map((v) => v.text).join(' ');
  }

  // --- Section 8: Deep Analysis (A–J) ---
  const sec8Content = sectionMap.get(8)!.content;
  const verseCommentary: VerseCommentaryItem[] = [];
  const sec8Subsections = sec8Content.split(/\n(?=###\s+[A-J]\.)/i);

  for (const sub of sec8Subsections) {
    const trimmed = sub.trim();
    const headerMatch = trimmed.match(/^###\s+([A-J])\.\s*(.*)$/m);
    if (!headerMatch) continue;

    const id = group(headerMatch, 1).toUpperCase() as VerseCommentaryId;
    const headerRest = group(headerMatch, 2);

    // Parse citation and quoted text from header, e.g. 'Matthew 15:21 — "Jesus withdrew..."'
    let verseCitation = '';
    let quotedText = '';
    const quoteMatch = headerRest.match(/^(.*?)\s*[:—–]\s*["'“](.*?)["'”]\s*$/);
    if (quoteMatch) {
      verseCitation = group(quoteMatch, 1);
      quotedText = group(quoteMatch, 2);
    } else {
      const parts = headerRest.split(/[:—–]\s+/);
      verseCitation = parts[0]?.trim() ?? '';
      quotedText = (parts.slice(1).join(' ').trim() || headerRest).replace(/["'“”]/g, '');
    }

    const linesAfterHeader = trimmed.split('\n').slice(1);
    const commentaryLines: string[] = [];
    const catechismReferences: string[] = [];
    let patristicNote: string | null = null;

    for (const line of linesAfterHeader) {
      const lineTrimmed = line.trim();
      const catMatch = lineTrimmed.match(/^[-*•]?\s*Catechism:\s*(.*)$/i);
      const patMatch = lineTrimmed.match(/^[-*•]?\s*Patristic:\s*(.*)$/i);

      if (catMatch) {
        const refs = group(catMatch, 1)
          .split(/[,;]/)
          .map((r) => r.trim())
          .filter(Boolean);
        catechismReferences.push(...refs);
      } else if (patMatch) {
        patristicNote = group(patMatch, 1);
      } else if (lineTrimmed.length > 0 && !lineTrimmed.startsWith('###')) {
        commentaryLines.push(lineTrimmed);
      }
    }

    const commentary = commentaryLines.join(' ').trim();

    verseCommentary.push({
      id,
      verseCitation,
      quotedText,
      commentary: commentary.length > 0 ? commentary : quotedText,
      catechismReferences,
      patristicNote,
    });
  }

  // --- Fallback Rule: Reconstruct Gospel text from Section 8 headers if Section 6 had no verse paragraphs ---
  if (gospelVerses.length === 0 && verseCommentary.length > 0) {
    const verseMap = new Map<number, string>();

    for (const item of verseCommentary) {
      const verseMatch =
        item.verseCitation.match(/:(\d+)/) || item.verseCitation.match(/\b(\d+)/);
      if (verseMatch && item.quotedText.length > 0) {
        const vNum = parseInt(group(verseMatch, 1), 10);
        if (Number.isFinite(vNum)) {
          const existing = verseMap.get(vNum);
          if (existing) {
            verseMap.set(vNum, `${existing} ${item.quotedText}`);
          } else {
            verseMap.set(vNum, item.quotedText);
          }
        }
      }
    }

    const sortedVerseNums = Array.from(verseMap.keys()).sort((a, b) => a - b);
    for (const vNum of sortedVerseNums) {
      const text = verseMap.get(vNum);
      if (text) {
        gospelVerses.push({
          verseNumber: vNum,
          text,
        });
      }
    }

    if (gospelVerses.length > 0) {
      gospelFullText = gospelVerses.map((v) => v.text).join(' ');
    }
  }

  if (keyLines.length === 0 && gospelVerses.length > 0) {
    keyLines = gospelVerses.slice(0, 4).map((v) => v.text);
  }

  const gospelReading: GospelReadingSection = {
    sectionId: 'section_3_reading',
    sectionNumber: 3,
    progressPercent: 60,
    turnMode: 'gated_reading',
    title: 'Gospel Reading',
    eyebrow: gospelCitation,
    durationMinutes: 10,
    durationLabel: '10 min',
    citation: gospelCitation,
    liturgicalLabel,
    fullText: gospelFullText,
    verses: gospelVerses,
    keyLines,
    leaderLiturgicalContextNote,
  };

  // --- Section 9: Catholic Doctrine Highlights (A–D) ---
  const catholicDoctrine: DoctrineHighlightItem[] = [];
  const sec9 = sectionMap.get(9);
  if (sec9) {
    const sec9Subsections = sec9.content.split(/\n(?=###\s+[A-D]\.)/i);
    for (const sub of sec9Subsections) {
      const trimmed = sub.trim();
      const headerMatch = trimmed.match(/^###\s+([A-D])\.\s*(.*)$/m);
      if (!headerMatch) continue;

      const id = group(headerMatch, 1).toUpperCase() as FourPointItemId;
      const doctrineTitle = cleanMarkdownText(group(headerMatch, 2));
      const linesAfterHeader = trimmed.split('\n').slice(1);
      const summaryLines: string[] = [];
      const references: string[] = [];

      for (const line of linesAfterHeader) {
        const lineTrimmed = line.trim();
        const refMatch = lineTrimmed.match(/^[-*•]?\s*References:\s*(.*)$/i);
        if (refMatch) {
          const refs = group(refMatch, 1)
            .split(/[;]/)
            .map((r) => r.trim())
            .filter(Boolean);
          references.push(...refs);
        } else if (lineTrimmed.length > 0 && !lineTrimmed.startsWith('###')) {
          summaryLines.push(lineTrimmed);
        }
      }

      catholicDoctrine.push({
        id,
        title: doctrineTitle,
        summary: summaryLines.join(' ').trim(),
        references,
      });
    }
  }

  // --- Section 10: Young Adult Pastoral Application (A–D) ---
  const youngAdultApplication: ApplicationPointItem[] = [];
  const sec10 = sectionMap.get(10);
  if (sec10) {
    const sec10Subsections = sec10.content.split(/\n(?=###\s+[A-D]\.)/i);
    for (const sub of sec10Subsections) {
      const trimmed = sub.trim();
      const headerMatch = trimmed.match(/^###\s+([A-D])\.\s*(.*)$/m);
      if (!headerMatch) continue;

      const id = group(headerMatch, 1).toUpperCase() as FourPointItemId;
      const appTitle = cleanMarkdownText(group(headerMatch, 2));
      const linesAfterHeader = trimmed.split('\n').slice(1);
      const summary = linesAfterHeader
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('###'))
        .join(' ');

      youngAdultApplication.push({
        id,
        title: appTitle,
        summary,
      });
    }
  }

  // --- Section 11: Reflection Questions (1–12) ---
  const reflectionQuestions: ReflectionQuestionItem[] = [];
  const sec11 = sectionMap.get(11)!;
  const sec11Subsections = sec11.content.split(/\n(?=###\s+\d+\.)/i);

  for (const sub of sec11Subsections) {
    const trimmed = sub.trim();
    const headerMatch = trimmed.match(/^###\s+(\d+)\.\s*(.*)$/m);
    if (!headerMatch) continue;

    const num = parseInt(group(headerMatch, 1), 10);
    const prompt = cleanMarkdownText(group(headerMatch, 2));
    const linesAfterHeader = trimmed.split('\n').slice(1);

    let category = 'Discussion';
    let curatedOrder: CuratedQuestionOrder = null;
    let estimatedMinutes = 5;
    let sampleAnswer = 'We bring our honest prayer directly to Jesus with surrendered trust.';
    let leaderNote = 'Guide participants in open, gentle reflection.';

    for (const line of linesAfterHeader) {
      const lineTrimmed = line.trim();
      const catMatch = lineTrimmed.match(/^[-*•]?\s*Category:\s*(.*)$/i);
      const curMatch = lineTrimmed.match(/^[-*•]?\s*Curated Order:\s*(\d+)/i);
      const estMatch = lineTrimmed.match(/^[-*•]?\s*Estimated Minutes:\s*(\d+)/i);
      const ansMatch = lineTrimmed.match(/^[-*•]?\s*Sample Answer:\s*(.*)$/i);
      const noteMatch = lineTrimmed.match(/^[-*•]?\s*Leader Note:\s*(.*)$/i);

      if (catMatch) category = group(catMatch, 1);
      if (curMatch) {
        const orderVal = parseInt(group(curMatch, 1), 10);
        if (orderVal === 1 || orderVal === 2 || orderVal === 3) {
          curatedOrder = orderVal;
        }
      }
      if (estMatch) {
        const estVal = parseInt(group(estMatch, 1), 10);
        if (Number.isFinite(estVal)) {
          estimatedMinutes = estVal;
        }
      }
      if (ansMatch) sampleAnswer = group(ansMatch, 1);
      if (noteMatch) leaderNote = group(noteMatch, 1);
    }

    reflectionQuestions.push({
      id: `q-${num}`,
      number: num,
      prompt,
      category,
      isDefaultCurated: curatedOrder !== null,
      curatedOrder,
      estimatedMinutes,
      sampleAnswer,
      leaderNote,
    });
  }

  // If no question has curated order specified, default Q6 (order 1), Q5 (order 2), Q8 (order 3) or Q1..Q3
  const hasAnyCurated = reflectionQuestions.some((q) => q.curatedOrder !== null);
  if (!hasAnyCurated && reflectionQuestions.length >= 3) {
    const q6 = reflectionQuestions.find((q) => q.number === 6);
    const q5 = reflectionQuestions.find((q) => q.number === 5);
    const q8 = reflectionQuestions.find((q) => q.number === 8);

    if (q6 && q5 && q8) {
      q6.curatedOrder = 1;
      q6.isDefaultCurated = true;
      q5.curatedOrder = 2;
      q5.isDefaultCurated = true;
      q8.curatedOrder = 3;
      q8.isDefaultCurated = true;
    } else {
      const first = reflectionQuestions[0];
      const second = reflectionQuestions[1];
      const third = reflectionQuestions[2];
      if (first) {
        first.curatedOrder = 1;
        first.isDefaultCurated = true;
      }
      if (second) {
        second.curatedOrder = 2;
        second.isDefaultCurated = true;
      }
      if (third) {
        third.curatedOrder = 3;
        third.isDefaultCurated = true;
      }
    }
  }

  const curatedQuestions = reflectionQuestions
    .filter((q) => q.isDefaultCurated && q.curatedOrder !== null)
    .sort((a, b) => (a.curatedOrder ?? 0) - (b.curatedOrder ?? 0));

  const defaultActiveQuestionIds =
    curatedQuestions.length > 0
      ? curatedQuestions.map((q) => q.id)
      : [reflectionQuestions[0]?.id ?? 'q-1'];

  // --- Section 12: Group Activity / Prayer Card Template ---
  let prayerCardTitle = '"Lord, Help Me" Prayer Card';
  let prayerCardInstructions =
    'Write three short, honest prayers inspired by Scripture. Your Prayer Card stays private on your device for personal prayer and download, with an optional choice to share one line with the group.';

  let promptSelfText = 'Lord, help me ___.';
  let promptLovedOneText = 'Lord, have mercy on ___.';
  let promptWorldText = 'Lord, make Your house a house of prayer for ___.';

  const sec12 = sectionMap.get(12);
  if (sec12) {
    const activityTitleMatch = sec12.title.match(/Group Activity:\s*(.*)$/i);
    if (activityTitleMatch) {
      prayerCardTitle = cleanMarkdownText(group(activityTitleMatch, 1));
    }

    const lines = sec12.content.split('\n');
    const instructionLines: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      const selfMatch = trimmed.match(/^[-*•]?\s*For myself:\s*(.*)$/i);
      const lovedMatch = trimmed.match(/^[-*•]?\s*For someone I love:\s*(.*)$/i);
      const worldMatch = trimmed.match(/^[-*•]?\s*For the Church\/world:\s*(.*)$/i);

      if (selfMatch) {
        promptSelfText = group(selfMatch, 1);
      } else if (lovedMatch) {
        promptLovedOneText = group(lovedMatch, 1);
      } else if (worldMatch) {
        promptWorldText = group(worldMatch, 1);
      } else if (trimmed.length > 0 && !trimmed.startsWith('##')) {
        instructionLines.push(trimmed);
      }
    }
    if (instructionLines.length > 0) {
      prayerCardInstructions = instructionLines.join(' ');
    }
  }

  const prayerCardTemplate: PrayerCardTemplate = {
    title: prayerCardTitle,
    instructions: prayerCardInstructions,
    prompts: [
      {
        id: 'self',
        audienceLabel: 'For myself',
        promptPrefix: promptSelfText.split('___')[0]?.trim() || 'Lord, help me',
        templateText: promptSelfText,
      },
      {
        id: 'loved-one',
        audienceLabel: 'For someone I love',
        promptPrefix: promptLovedOneText.split('___')[0]?.trim() || 'Lord, have mercy on',
        templateText: promptLovedOneText,
      },
      {
        id: 'church-world',
        audienceLabel: 'For the Church/world',
        promptPrefix:
          promptWorldText.split('___')[0]?.trim() || 'Lord, make Your house a house of prayer for',
        templateText: promptWorldText,
      },
    ],
  };

  const deepAnalysis: DeepAnalysisSection = {
    sectionId: 'section_4_discussion',
    sectionNumber: 4,
    progressPercent: 80,
    turnMode: 'none',
    title: 'Lord, Help Me Pray',
    eyebrow: 'DEEP ANALYSIS · 25 MIN',
    durationMinutes: 25,
    durationLabel: '25–50 min',
    defaultActiveQuestionIds,
    reflectionQuestions,
    verseCommentary,
    catholicDoctrine,
    youngAdultApplication,
    prayerCardTemplate,
  };

  // --- Section 13: Practical Weekly Challenges (1–4) ---
  const weeklyChallenges: WeeklyChallengeItem[] = [];
  const sec13 = sectionMap.get(13);
  if (sec13) {
    const lines = sec13.content.split('\n');
    for (const line of lines) {
      const match = line.trim().match(/^(\d+)\.\s*([^:]+):\s*(.*)$/);
      if (match) {
        const optionNumber = parseInt(group(match, 1), 10);
        if (
          optionNumber === 1 ||
          optionNumber === 2 ||
          optionNumber === 3 ||
          optionNumber === 4
        ) {
          weeklyChallenges.push({
            optionNumber,
            title: group(match, 2),
            description: group(match, 3),
          });
        }
      }
    }
  }

  // --- Section 14: Closing Summary ---
  let summaryBullets: string[] = [];
  const sec14 = sectionMap.get(14);
  if (sec14) {
    summaryBullets = extractBullets(sec14.content);
  }
  if (summaryBullets.length === 0) {
    summaryBullets = [
      'God calls all nations into communion through Christ Jesus.',
      'Faith perseveres through trials with humble trust in divine mercy.',
    ];
  }

  // --- Section 15: Closing Prayer ---
  const closingPrayerText = cleanMarkdownText(sectionMap.get(15)!.content);

  // --- Section 16: Next Week Announcement ---
  let nextWeekAnnouncement: NextWeekAnnouncement = {
    title: 'Faith that Endures',
    citation: 'James 1:2–4',
    displayLabel: '"Faith that Endures" — James 1:2–4',
  };
  const sec16 = sectionMap.get(16);
  if (sec16) {
    const content16 = sec16.content;
    const nwTitleMatch = content16.match(/\*\*Title:\*\*\s*(.*)/i);
    const nwCitMatch = content16.match(/\*\*Citation:\*\*\s*(.*)/i);
    const nwLabelMatch = content16.match(/\*\*Display Label:\*\*\s*(.*)/i);

    const nwTitle = nwTitleMatch
      ? cleanMarkdownText(group(nwTitleMatch, 1))
      : 'Next Week at Church';
    const nwCit = nwCitMatch ? cleanMarkdownText(group(nwCitMatch, 1)) : 'Scripture Reading';
    const nwLabel = nwLabelMatch
      ? cleanMarkdownText(group(nwLabelMatch, 1))
      : `"${nwTitle}" — ${nwCit}`;

    nextWeekAnnouncement = {
      title: nwTitle,
      citation: nwCit,
      displayLabel: nwLabel,
    };
  }

  // --- Section 17: One-Sentence Main Point ---
  let oneSentenceMainPoint =
    'Authentic faith is humble, persistent, and bold, trusting completely in the mercy of Christ.';
  const sec17 = sectionMap.get(17);
  if (sec17) {
    const mainPointText = cleanMarkdownText(sec17.content);
    if (mainPointText.length > 0) {
      oneSentenceMainPoint = mainPointText;
    }
  }

  const closing: ClosingSection = {
    sectionId: 'section_5_closing',
    sectionNumber: 5,
    progressPercent: 100,
    turnMode: 'none',
    title: 'Closing Prayer',
    eyebrow: 'WRAPPING UP',
    durationMinutes: 3,
    durationLabel: '3 min',
    summaryBullets,
    weeklyChallenges,
    nextWeekAnnouncement,
    closingPrayerText,
  };

  const detectionSummary: StudyDetectionSummary = {
    sectionCount: 5,
    sectionsDetectedLabel: '5 sections detected',
    detectedLabel: `${curatedQuestions.length} Curated · ${reflectionQuestions.length} Questions`,
    curatedQuestionCount: curatedQuestions.length,
    totalQuestionCount: reflectionQuestions.length,
    hasOpeningPrayer: openingPrayerText.length > 0,
    hasGospelReading: gospelVerses.length > 0 && gospelFullText.length > 0,
    hasClosingPrayer: closingPrayerText.length > 0,
  };

  const id = slugify(title);

  const candidateDoc: StudyDocument = {
    id,
    title,
    subtitle,
    liturgicalDate,
    liturgicalEyebrow,
    gospelCitation,
    gospelSummaryLabel,
    estimatedMinutes,
    sectionCount: 5,
    centralThemes,
    sessionGoals,
    oneSentenceMainPoint,
    source: {
      type: 'markdown',
      fileName: options.fileName || `${id}.md`,
      statusLabel: 'Analyzed',
    },
    detectionSummary,
    openingPrayer,
    icebreaker,
    gospelReading,
    deepAnalysis,
    closing,
  };

  return validateStudyDocument(candidateDoc);
}

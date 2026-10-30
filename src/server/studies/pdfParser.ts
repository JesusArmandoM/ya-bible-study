import { extractText } from 'unpdf';
import {
  type StudySourceType,
  type StudyValidationResult,
} from '../../shared/study.js';
import { parseMarkdownStudy } from './markdownParser.js';

export interface ParsePdfStudyOptions {
  fileName?: string;
  sourceType?: StudySourceType;
}

const LIGATURE_REPLACEMENTS: Record<string, string> = {
  '\uFB00': 'ff',
  '\uFB01': 'fi',
  '\uFB02': 'fl',
  '\uFB03': 'ffi',
  '\uFB04': 'ffl',
  'œ': 'oe',
  'Œ': 'Oe',
  'æ': 'ae',
  'Æ': 'Ae',
};

const SECTION_HEADING_REGEX =
  /^(?:##\s+)?((?:[1-9]|1[0-7])\.\s+(?:Central Theme|Session Goal|Schedule|Opening Prayer|Icebreaker|Proclamation|Biblical|Deep Analysis|Catholic Doctrine|Young Adult|Reflection Question|Group Activity|Prayer Card|Weekly Challenge|Closing Summary|Closing Prayer|Next Week|One-Sentence).*)$/i;

const UNNUMBERED_SECTION_HEADING_REGEX =
  /^(?:##\s+)?(Central Themes?|Session Goals?|Schedule & Overview|Opening Prayer|Icebreaker(?::.*)?|Proclamation of the Readings|Biblical Context.*|Deep Analysis.*|Catholic Doctrine.*|Young Adult Pastoral Applications?|Reflection Questions.*|Group Activity.*|Weekly Challenges?|Closing Summary.*|Closing Prayer|Next Week Announcement.*|One-Sentence Main Point.*)$/i;

function toUint8Array(data: Buffer | Uint8Array): Uint8Array {
  if (Buffer.isBuffer(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return data;
}

/**
 * Normalizes extracted page-level text arrays from a PDF:
 * 1. Strips page numbers, running headers, and running footers across page boundaries.
 * 2. Expands typographic ligatures (fi, fl, ff, ffi, ffl, oe, ae).
 * 3. Normalizes smart quotes and unicode whitespace characters.
 * 4. Resolves line-break word hyphenations (e.g. dis-\nciples -> disciples).
 * 5. Formats standard Catholic study section and subsection headings with markdown hashes.
 */
export function normalizePdfText(pages: string[]): string {
  const processedPages = pages.map((pageText, pageIndex) => {
    const rawLines = pageText.replace(/\r\n|\r|\f/g, '\n').split('\n');
    const cleanedLines: string[] = [];

    for (let i = 0; i < rawLines.length; i++) {
      const rawLine = rawLines[i];
      if (rawLine === undefined) {
        continue;
      }
      const line = rawLine.trim();

      // Skip empty lines in margin checks
      if (!line) {
        cleanedLines.push(rawLine);
        continue;
      }

      // Page number patterns: "Page 1 of 6", "Page 1/6", "- 2 -", "[ 3 ]", "1 / 4"
      if (
        /^Page\s+\d+(\s+(?:of|\/)\s+\d+)?$/i.test(line) ||
        /^[-–—]\s*\d+\s*[-–—]$/.test(line) ||
        /^\[\s*\d+\s*\]$/.test(line) ||
        /^\d+\s*\/\s*\d+$/.test(line)
      ) {
        continue;
      }

      // Isolated standalone page digits at page margins (top 3 or bottom 3 lines)
      if (/^\d+$/.test(line) && (i < 3 || i >= rawLines.length - 3)) {
        continue;
      }

      // Repeated running headers at top margin
      if (
        i < 3 &&
        (/^(?:Catholic\s+)?Young\s+Adult\s+Bible\s+Study\b/i.test(line) ||
          (pageIndex > 0 &&
            /^(?:Catholic Young Adult|Great Is Your Faith|Peace!\s*Be Still)/i.test(line)))
      ) {
        continue;
      }

      cleanedLines.push(rawLine);
    }

    return cleanedLines.join('\n');
  });

  let text = processedPages.join('\n\n');

  // 1. Ligature expansion
  for (const [ligature, replacement] of Object.entries(LIGATURE_REPLACEMENTS)) {
    text = text.replaceAll(ligature, replacement);
  }

  // 2. Unicode whitespace normalization
  text = text
    .replace(/[\u00A0\u202F\u2000-\u200A]/g, ' ')
    .replace(/[\u200B\uFEFF]/g, '');

  // 3. Smart quotes and typographic marks normalization
  text = text
    .replace(/[“”„«»]/g, '"')
    .replace(/[‘’‚′‵]/g, "'");

  // 4. De-hyphenation across line breaks: word-\nbreak -> wordbreak
  text = text.replace(/([a-zA-Z]{2,})-\s*\n\s*([a-zA-Z]{2,})/g, '$1$2');

  // 5. Section and subsection heading formatting
  const lines = text.split('\n');
  const resultLines: string[] = [];
  let inPreamble = true;
  let currentSectionNumber = 0;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    if (rawLine === undefined) {
      continue;
    }
    const trimmed = rawLine.trim();

    if (!trimmed) {
      resultLines.push(rawLine);
      continue;
    }

    // Numbered 17-section heading check
    const secMatch = trimmed.match(SECTION_HEADING_REGEX);
    if (secMatch) {
      inPreamble = false;
      const numMatch = trimmed.match(/^(\d+)\./);
      const parsedNum = numMatch?.[1];
      if (parsedNum) {
        currentSectionNumber = parseInt(parsedNum, 10);
      }
      if (!trimmed.startsWith('## ')) {
        resultLines.push(`## ${secMatch[1]}`);
      } else {
        resultLines.push(trimmed);
      }
      continue;
    }

    // Unnumbered section heading check
    const unnumberedMatch = trimmed.match(UNNUMBERED_SECTION_HEADING_REGEX);
    if (unnumberedMatch) {
      inPreamble = false;
      if (!trimmed.startsWith('## ')) {
        resultLines.push(`## ${unnumberedMatch[1]}`);
      } else {
        resultLines.push(trimmed);
      }
      continue;
    }

    // Preamble document title detection
    if (inPreamble) {
      if (
        !trimmed.startsWith('#') &&
        !trimmed.startsWith('**') &&
        !trimmed.startsWith('-') &&
        !trimmed.startsWith('*')
      ) {
        resultLines.push(`# ${trimmed}`);
        inPreamble = false;
        continue;
      }
    }

    // Section 6 Subsections: Supporting Mass Readings & Gospel Proclamation
    if (currentSectionNumber === 6) {
      if (/^(?:###\s+)?Supporting Mass Readings/i.test(trimmed)) {
        resultLines.push('### Supporting Mass Readings');
        continue;
      }
      if (/^(?:###\s+)?Gospel Proclamation/i.test(trimmed)) {
        const after = trimmed.replace(/^(?:###\s+)?Gospel Proclamation/i, '').trim();
        resultLines.push(`### Gospel Proclamation${after ? ` ${after}` : ''}`);
        continue;
      }
    }

    // Sections 8, 9, 10 Subsections: [A-J]. or [A-D].
    if (
      currentSectionNumber === 8 ||
      currentSectionNumber === 9 ||
      currentSectionNumber === 10
    ) {
      const alphaMatch = trimmed.match(/^(?:###\s+)?([A-J]\.\s+.*)$/);
      if (alphaMatch) {
        resultLines.push(`### ${alphaMatch[1]}`);
        continue;
      }
    }

    // Section 11 Subsections: Reflection questions 1–12
    if (currentSectionNumber === 11) {
      const qMatch = trimmed.match(/^(?:###\s+)?((?:[1-9]|1[0-2])\.\s+.*)$/);
      if (qMatch) {
        resultLines.push(`### ${qMatch[1]}`);
        continue;
      }
    }

    resultLines.push(rawLine);
  }

  return resultLines.join('\n');
}

/**
 * Deterministically parses a PDF buffer into a validated StudyDocument payload.
 * Parses purely in memory without disk persistence.
 */
export async function parsePdfStudy(
  pdfBuffer: Buffer | Uint8Array,
  options?: ParsePdfStudyOptions,
): Promise<StudyValidationResult> {
  const fileName = options?.fileName ?? 'uploaded-study.pdf';

  try {
    const uint8 = toUint8Array(pdfBuffer);
    if (!uint8 || uint8.byteLength === 0) {
      return {
        valid: false,
        errors: [
          'No selectable text could be extracted from this PDF. Please ensure the PDF is text-based rather than a scanned image.',
        ],
      };
    }

    const { text } = await extractText(uint8, { mergePages: false });
    const pages = Array.isArray(text) ? text : [text];

    // Check if any selectable text was extracted
    const totalSelectableText = pages.map((p) => p.trim()).join('');
    if (!totalSelectableText || totalSelectableText.length === 0) {
      return {
        valid: false,
        errors: [
          'No selectable text could be extracted from this PDF. Please ensure the PDF is text-based rather than a scanned image.',
        ],
      };
    }

    const normalizedMarkdown = normalizePdfText(pages);

    return parseMarkdownStudy(normalizedMarkdown, {
      fileName,
      sourceType: options?.sourceType ?? 'pdf',
    });
  } catch (_err) {
    return {
      valid: false,
      errors: [
        'Could not parse PDF document. Please verify the file is a valid text-based PDF.',
      ],
    };
  }
}

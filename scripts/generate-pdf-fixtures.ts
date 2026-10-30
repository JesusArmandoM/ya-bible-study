import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export async function generatePdfFromMarkdown(
  markdownRelativePath: string,
  pdfRelativePath: string,
  runningHeaderTitle: string,
): Promise<{ totalPages: number; byteLength: number }> {
  const inputPath = path.resolve(rootDir, markdownRelativePath);
  const outputPath = path.resolve(rootDir, pdfRelativePath);

  const markdownContent = fs.readFileSync(inputPath, 'utf-8');
  const rawLines = markdownContent.split('\n');

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const pageWidth = 595.28; // Standard A4 width in points
  const pageHeight = 841.89; // Standard A4 height in points
  const margin = 50;
  const marginTop = 50;
  const marginBottom = 50;
  const lineHeight = 13;
  const fontSize = 10;
  const maxWidth = pageWidth - 2 * margin;

  const wrappedLines: string[] = [];

  for (const rawLine of rawLines) {
    if (rawLine.trim().length === 0) {
      wrappedLines.push('');
      continue;
    }

    const words = rawLine.split(' ');
    let currentLine = '';

    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      const width = font.widthOfTextAtSize(candidate, fontSize);
      if (width <= maxWidth) {
        currentLine = candidate;
      } else {
        if (currentLine) {
          wrappedLines.push(currentLine);
        }
        currentLine = word;
      }
    }
    if (currentLine) {
      wrappedLines.push(currentLine);
    }
  }

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - marginTop;

  for (const line of wrappedLines) {
    if (y < marginBottom) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - marginTop;
    }
    if (line) {
      page.drawText(line, {
        x: margin,
        y,
        font,
        size: fontSize,
      });
    }
    y -= lineHeight;
  }

  const totalPages = pdfDoc.getPageCount();
  const pages = pdfDoc.getPages();

  for (let i = 0; i < totalPages; i++) {
    const p = pages[i];
    p.drawText(runningHeaderTitle, {
      x: margin,
      y: pageHeight - 30,
      font,
      size: 8,
    });
    p.drawText(`Page ${i + 1} of ${totalPages}`, {
      x: pageWidth - margin - 70,
      y: 25,
      font,
      size: 8,
    });
  }

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(outputPath, pdfBytes);

  return { totalPages, byteLength: pdfBytes.length };
}

async function main(): Promise<void> {
  const fixtures = [
    {
      input: 'tests/fixtures/great-is-your-faith.md',
      output: 'tests/fixtures/great-is-your-faith.pdf',
      header: 'Catholic Young Adult Bible Study — Great Is Your Faith',
    },
    {
      input: 'tests/fixtures/peace-be-still-mark-4.md',
      output: 'tests/fixtures/peace-be-still-mark-4.pdf',
      header: 'Catholic Young Adult Bible Study — Peace! Be Still',
    },
  ];

  for (const fixture of fixtures) {
    const result = await generatePdfFromMarkdown(fixture.input, fixture.output, fixture.header);
    console.log(
      `Generated ${fixture.output} (${result.totalPages} pages, ${result.byteLength} bytes)`,
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('Error generating PDF fixtures:', err);
    process.exit(1);
  });
}

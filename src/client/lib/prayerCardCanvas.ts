import { PRAYER_PROMPT_CONFIG } from './prayerCardStorage';

export interface PrayerCardCanvasData {
  self: string;
  lovedOne: string;
  churchWorld: string;
  studyTitle?: string;
  scriptureCitation?: string;
  dateLabel?: string;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines;
}

export function drawPrayerCard(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  cardData: PrayerCardCanvasData,
): void {
  // 1. Deep Midnight Background
  ctx.fillStyle = '#0B0D17';
  ctx.fillRect(0, 0, width, height);

  // Subtle ambient radial glow centered at top
  const glow = ctx.createRadialGradient(width / 2, 220, 40, width / 2, 220, 560);
  glow.addColorStop(0, 'rgba(226, 168, 62, 0.14)');
  glow.addColorStop(1, 'rgba(11, 13, 23, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  // 2. Decorative Double Gold Frame
  drawRoundedRect(ctx, 40, 40, width - 80, height - 80, 28);
  ctx.strokeStyle = 'rgba(226, 168, 62, 0.50)';
  ctx.lineWidth = 3;
  ctx.stroke();

  drawRoundedRect(ctx, 52, 52, width - 104, height - 104, 22);
  ctx.strokeStyle = 'rgba(226, 168, 62, 0.16)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // 3. Header Section
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Eyebrow
  ctx.fillStyle = '#E2A83E';
  ctx.font = '600 16px system-ui, -apple-system, sans-serif';
  ctx.fillText('YA BIBLE STUDY · PRAYER CARD', width / 2, 105);

  // Title
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 44px "Playfair Display", Georgia, serif';
  ctx.fillText('"Lord, Help Me"', width / 2, 160);

  // Scripture Citation
  ctx.fillStyle = '#94A3B8';
  ctx.font = '400 20px system-ui, -apple-system, sans-serif';
  ctx.fillText(cardData.scriptureCitation || 'Matthew 15:21–28', width / 2, 205);

  // Decorative divider
  ctx.strokeStyle = 'rgba(226, 168, 62, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(width / 2 - 180, 235);
  ctx.lineTo(width / 2 + 180, 235);
  ctx.stroke();

  // 4. Three Intention Cards
  const cardItems = [
    {
      config: PRAYER_PROMPT_CONFIG.self,
      text: cardData.self,
    },
    {
      config: PRAYER_PROMPT_CONFIG['loved-one'],
      text: cardData.lovedOne,
    },
    {
      config: PRAYER_PROMPT_CONFIG['church-world'],
      text: cardData.churchWorld,
    },
  ];

  const cardWidth = width - 180;
  const cardX = 90;
  const cardHeight = 260;
  const startY = 265;
  const gapY = 30;

  cardItems.forEach((item, index) => {
    const cardY = startY + index * (cardHeight + gapY);

    // Card background
    drawRoundedRect(ctx, cardX, cardY, cardWidth, cardHeight, 18);
    ctx.fillStyle = '#171B2E';
    ctx.fill();
    ctx.strokeStyle = 'rgba(226, 168, 62, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Audience label badge
    ctx.textAlign = 'left';
    ctx.fillStyle = '#E2A83E';
    ctx.font = '700 16px system-ui, -apple-system, sans-serif';
    ctx.fillText(item.config.audienceLabel.toUpperCase(), cardX + 36, cardY + 45);

    // Prompt prefix
    ctx.font = 'italic 22px "Playfair Display", Georgia, serif';
    ctx.fillStyle = '#E2A83E';
    ctx.fillText(item.config.promptPrefix + ' …', cardX + 36, cardY + 85);

    // Prayer content
    const trimmed = item.text.trim();
    if (!trimmed) {
      ctx.font = 'italic 20px "Playfair Display", Georgia, serif';
      ctx.fillStyle = '#64748B';
      ctx.fillText('(silent intention held before God)', cardX + 36, cardY + 140);
    } else {
      ctx.font = '22px "Playfair Display", Georgia, serif';
      ctx.fillStyle = '#F8FAFC';
      const maxTextWidth = cardWidth - 72;
      const lines = wrapText(ctx, trimmed, maxTextWidth);

      // Render up to 3 lines
      const maxLines = 3;
      const displayLines = lines.slice(0, maxLines);
      if (lines.length > maxLines && displayLines.length > 0) {
        displayLines[maxLines - 1] = displayLines[maxLines - 1] + ' …';
      }

      displayLines.forEach((line, lineIdx) => {
        ctx.fillText(line, cardX + 36, cardY + 130 + lineIdx * 34);
      });
    }
  });

  // 5. Footer Section
  ctx.textAlign = 'center';

  // Cross emblem
  ctx.fillStyle = '#E2A83E';
  ctx.font = '24px serif';
  ctx.fillText('☩', width / 2, 1160);

  // Verse quotation
  ctx.font = 'italic 22px "Playfair Display", Georgia, serif';
  ctx.fillStyle = '#E2A83E';
  ctx.fillText('"O woman, great is your faith!" — Matthew 15:28', width / 2, 1205);

  // Subtext
  ctx.font = '400 15px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.fillText('Private Keepsake · Catholic Young Adult Ministry', width / 2, 1245);
}

export async function renderPrayerCardToBlob(
  cardData: PrayerCardCanvasData,
): Promise<Blob> {
  if (typeof document === 'undefined') {
    // Return mock blob in non-DOM/node environments
    return new Blob(['prayer-card-png-bytes'], { type: 'image/png' });
  }

  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    // If context not available (e.g. basic jsdom without canvas package), return fallback blob
    return new Blob(['prayer-card-png-bytes'], { type: 'image/png' });
  }

  drawPrayerCard(ctx, canvas.width, canvas.height, cardData);

  return new Promise<Blob>((resolve, reject) => {
    if (typeof canvas.toBlob === 'function') {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          // Fallback to dataURL
          try {
            const dataUrl = canvas.toDataURL('image/png');
            const blobFromUrl = dataUrlToBlob(dataUrl);
            resolve(blobFromUrl);
          } catch (err) {
            reject(err);
          }
        }
      }, 'image/png');
    } else if (typeof canvas.toDataURL === 'function') {
      try {
        const dataUrl = canvas.toDataURL('image/png');
        resolve(dataUrlToBlob(dataUrl));
      } catch (err) {
        reject(err);
      }
    } else {
      resolve(new Blob(['prayer-card-png-bytes'], { type: 'image/png' }));
    }
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',');
  const byteString = atob(parts[1] || '');
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: 'image/png' });
}

export function triggerDownload(blob: Blob, filename: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // Ignore
    }
  }, 1000);
}

export async function exportOrSharePrayerCard(
  blob: Blob,
  filename = 'prayer-card.png',
): Promise<{ method: 'share' | 'download' }> {
  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function'
  ) {
    try {
      const file = new File([blob], filename, { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: '"Lord, Help Me" Prayer Card',
          text: 'My personal prayer card from YA Bible Study (Matthew 15:21–28).',
        });
        return { method: 'share' };
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return { method: 'share' };
      }
      // On any other share exception, fallback to download below
    }
  }

  triggerDownload(blob, filename);
  return { method: 'download' };
}

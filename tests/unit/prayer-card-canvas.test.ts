// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  drawPrayerCard,
  exportOrSharePrayerCard,
  renderPrayerCardToBlob,
} from '../../src/client/lib/prayerCardCanvas';

describe('prayerCardCanvas', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('drawPrayerCard', () => {
    it('executes canvas drawing operations without throwing', () => {
      const fillRectSpy = vi.fn();
      const strokeSpy = vi.fn();
      const fillSpy = vi.fn();
      const fillTextSpy = vi.fn();
      const measureTextSpy = vi.fn(() => ({ width: 100 }));
      const createRadialGradientSpy = vi.fn(() => ({
        addColorStop: vi.fn(),
      }));

      const mockCtx = {
        fillRect: fillRectSpy,
        stroke: strokeSpy,
        fill: fillSpy,
        fillText: fillTextSpy,
        measureText: measureTextSpy,
        createRadialGradient: createRadialGradientSpy,
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        quadraticCurveTo: vi.fn(),
        closePath: vi.fn(),
      } as unknown as CanvasRenderingContext2D;

      drawPrayerCard(mockCtx, 1080, 1350, {
        self: 'trust Your timing',
        lovedOne: 'my mother',
        churchWorld: 'parish unity',
        scriptureCitation: 'Matthew 15:21–28',
      });

      expect(fillRectSpy).toHaveBeenCalled();
      expect(createRadialGradientSpy).toHaveBeenCalledWith(540, 220, 40, 540, 220, 560);
      expect(fillTextSpy).toHaveBeenCalledWith('YA BIBLE STUDY · PRAYER CARD', 540, 105);
      expect(fillTextSpy).toHaveBeenCalledWith('"Lord, Help Me"', 540, 160);
      expect(fillTextSpy).toHaveBeenCalledWith('Matthew 15:21–28', 540, 205);
    });

    it('renders placeholder text for empty intention inputs', () => {
      const fillTextSpy = vi.fn();
      const mockCtx = {
        fillRect: vi.fn(),
        stroke: vi.fn(),
        fill: vi.fn(),
        fillText: fillTextSpy,
        measureText: vi.fn(() => ({ width: 100 })),
        createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        quadraticCurveTo: vi.fn(),
        closePath: vi.fn(),
      } as unknown as CanvasRenderingContext2D;

      drawPrayerCard(mockCtx, 1080, 1350, {
        self: '',
        lovedOne: '',
        churchWorld: '',
      });

      expect(fillTextSpy).toHaveBeenCalledWith(
        '(silent intention held before God)',
        expect.any(Number),
        expect.any(Number),
      );
    });
  });

  describe('renderPrayerCardToBlob', () => {
    it('returns a valid image/png Blob', async () => {
      const mockBlob = new Blob(['png-bytes'], { type: 'image/png' });
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
        fillRect: vi.fn(),
        stroke: vi.fn(),
        fill: vi.fn(),
        fillText: vi.fn(),
        measureText: vi.fn(() => ({ width: 80 })),
        createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        quadraticCurveTo: vi.fn(),
        closePath: vi.fn(),
      } as unknown as CanvasRenderingContext2D);

      vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
        (callback: BlobCallback) => {
          callback(mockBlob);
        },
      );

      const blob = await renderPrayerCardToBlob({
        self: 'trust Your timing',
        lovedOne: 'my family',
        churchWorld: 'the Church',
      });

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('image/png');
    });
  });

  describe('exportOrSharePrayerCard', () => {
    const testBlob = new Blob(['png-test'], { type: 'image/png' });

    it('uses navigator.share when Web Share API is available and canShare returns true', async () => {
      const shareSpy = vi.fn().mockResolvedValue(undefined);
      const canShareSpy = vi.fn().mockReturnValue(true);

      Object.defineProperty(navigator, 'share', {
        value: shareSpy,
        configurable: true,
        writable: true,
      });
      Object.defineProperty(navigator, 'canShare', {
        value: canShareSpy,
        configurable: true,
        writable: true,
      });

      const result = await exportOrSharePrayerCard(testBlob, 'my-card.png');

      expect(canShareSpy).toHaveBeenCalled();
      expect(shareSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '"Lord, Help Me" Prayer Card',
        }),
      );
      expect(result.method).toBe('share');
    });

    it('handles user cancellation of share sheet gracefully without error', async () => {
      const abortError = new Error('User cancelled');
      abortError.name = 'AbortError';

      const shareSpy = vi.fn().mockRejectedValue(abortError);
      const canShareSpy = vi.fn().mockReturnValue(true);

      Object.defineProperty(navigator, 'share', {
        value: shareSpy,
        configurable: true,
        writable: true,
      });
      Object.defineProperty(navigator, 'canShare', {
        value: canShareSpy,
        configurable: true,
        writable: true,
      });

      const result = await exportOrSharePrayerCard(testBlob);
      expect(result.method).toBe('share');
    });

    it('falls back to browser file download when navigator.share is unavailable', async () => {
      Object.defineProperty(navigator, 'share', {
        value: undefined,
        configurable: true,
        writable: true,
      });

      const clickSpy = vi.fn();
      const realCreateElement = document.createElement.bind(document);
      const createObjectURLSpy = vi
        .spyOn(URL, 'createObjectURL')
        .mockReturnValue('blob:http://localhost/test');

      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        const el = realCreateElement(tagName);
        if (tagName === 'a') {
          el.click = clickSpy;
        }
        return el;
      });

      const result = await exportOrSharePrayerCard(testBlob, 'prayer-card.png');

      expect(createObjectURLSpy).toHaveBeenCalledWith(testBlob);
      expect(clickSpy).toHaveBeenCalled();
      expect(result.method).toBe('download');
    });
  });
});

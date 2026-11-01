// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildPrayerCardStorageKey,
  clearPrayerCardDraft,
  createEmptyPrayerCardDraft,
  formatPrayerLine,
  loadPrayerCardDraft,
  savePrayerCardDraft,
} from '../../src/client/lib/prayerCardStorage';

describe('prayerCardStorage', () => {
  const TEST_KEY = 'ya-bible-study.prayer-card.TEST01.member-123';

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('buildPrayerCardStorageKey', () => {
    it('constructs key with session code and memberId', () => {
      const key = buildPrayerCardStorageKey('ROOM42', 'mem-abc');
      expect(key).toBe('ya-bible-study.prayer-card.ROOM42.mem-abc');
    });

    it('falls back to default and guest when arguments are omitted or empty', () => {
      expect(buildPrayerCardStorageKey(null, null)).toBe(
        'ya-bible-study.prayer-card.default.guest',
      );
      expect(buildPrayerCardStorageKey('', '')).toBe(
        'ya-bible-study.prayer-card.default.guest',
      );
      expect(buildPrayerCardStorageKey('ROOM42', '')).toBe(
        'ya-bible-study.prayer-card.ROOM42.guest',
      );
    });
  });

  describe('createEmptyPrayerCardDraft', () => {
    it('creates an empty draft with current timestamp', () => {
      const before = Date.now();
      const draft = createEmptyPrayerCardDraft();
      const after = Date.now();

      expect(draft.self).toBe('');
      expect(draft.lovedOne).toBe('');
      expect(draft.churchWorld).toBe('');
      expect(draft.updatedAt).toBeGreaterThanOrEqual(before);
      expect(draft.updatedAt).toBeLessThanOrEqual(after);
    });
  });

  describe('loadPrayerCardDraft', () => {
    it('returns empty draft when nothing is saved', () => {
      const draft = loadPrayerCardDraft(TEST_KEY);
      expect(draft.self).toBe('');
      expect(draft.lovedOne).toBe('');
      expect(draft.churchWorld).toBe('');
    });

    it('returns empty draft if localStorage has corrupt JSON', () => {
      localStorage.setItem(TEST_KEY, 'invalid-json{{');
      const draft = loadPrayerCardDraft(TEST_KEY);
      expect(draft.self).toBe('');
      expect(draft.lovedOne).toBe('');
      expect(draft.churchWorld).toBe('');
    });

    it('loads previously stored draft faithfully', () => {
      localStorage.setItem(
        TEST_KEY,
        JSON.stringify({
          self: 'patience in trial',
          lovedOne: 'healing for mom',
          churchWorld: 'unity in the parish',
          updatedAt: 12345678,
        }),
      );

      const draft = loadPrayerCardDraft(TEST_KEY);
      expect(draft.self).toBe('patience in trial');
      expect(draft.lovedOne).toBe('healing for mom');
      expect(draft.churchWorld).toBe('unity in the parish');
      expect(draft.updatedAt).toBe(12345678);
    });
  });

  describe('savePrayerCardDraft', () => {
    it('saves partial fields without overwriting unmodified ones', () => {
      savePrayerCardDraft(TEST_KEY, { self: 'initial self prayer' });
      const draft1 = loadPrayerCardDraft(TEST_KEY);
      expect(draft1.self).toBe('initial self prayer');
      expect(draft1.lovedOne).toBe('');

      savePrayerCardDraft(TEST_KEY, { lovedOne: 'my brother' });
      const draft2 = loadPrayerCardDraft(TEST_KEY);
      expect(draft2.self).toBe('initial self prayer');
      expect(draft2.lovedOne).toBe('my brother');
    });

    it('updates timestamp on save', () => {
      const draft = savePrayerCardDraft(TEST_KEY, { self: 'test' });
      expect(draft.updatedAt).toBeGreaterThan(0);
    });
  });

  describe('clearPrayerCardDraft', () => {
    it('removes draft from localStorage', () => {
      savePrayerCardDraft(TEST_KEY, { self: 'to be cleared' });
      expect(loadPrayerCardDraft(TEST_KEY).self).toBe('to be cleared');

      clearPrayerCardDraft(TEST_KEY);
      expect(loadPrayerCardDraft(TEST_KEY).self).toBe('');
    });
  });

  describe('formatPrayerLine', () => {
    it('returns empty string for empty or whitespace text', () => {
      expect(formatPrayerLine('self', '')).toBe('');
      expect(formatPrayerLine('self', '   ')).toBe('');
    });

    it('formats "For myself" prayer line with promptPrefix and punctuation', () => {
      const formatted = formatPrayerLine(
        'self',
        'trust Your timing when answers seem slow',
      );
      expect(formatted).toBe(
        '[For myself] Lord, help me trust Your timing when answers seem slow.',
      );
    });

    it('does not duplicate existing trailing punctuation', () => {
      expect(
        formatPrayerLine('self', 'trust Your timing when answers seem slow!'),
      ).toBe('[For myself] Lord, help me trust Your timing when answers seem slow!');

      expect(
        formatPrayerLine('self', 'trust Your timing when answers seem slow?'),
      ).toBe('[For myself] Lord, help me trust Your timing when answers seem slow?');

      expect(
        formatPrayerLine('self', 'trust Your timing when answers seem slow.'),
      ).toBe('[For myself] Lord, help me trust Your timing when answers seem slow.');
    });

    it('strips redundant user-typed prompt prefix if already provided', () => {
      const formatted = formatPrayerLine(
        'self',
        'Lord, help me trust Your timing when answers seem slow',
      );
      expect(formatted).toBe(
        '[For myself] Lord, help me trust Your timing when answers seem slow.',
      );
    });

    it('formats "For someone I love" with audience and prefix', () => {
      const formatted = formatPrayerLine('loved-one', 'my mother');
      expect(formatted).toBe(
        '[For someone I love] Lord, have mercy on my mother.',
      );

      const formattedCamel = formatPrayerLine('lovedOne', 'my brother');
      expect(formattedCamel).toBe(
        '[For someone I love] Lord, have mercy on my brother.',
      );
    });

    it('formats "For the Church/world" with audience and prefix', () => {
      const formatted = formatPrayerLine('church-world', 'our young adult group');
      expect(formatted).toBe(
        '[For the Church/world] Lord, make Your house a house of prayer for our young adult group.',
      );

      const formattedCamel = formatPrayerLine(
        'churchWorld',
        'all parishes in our diocese',
      );
      expect(formattedCamel).toBe(
        '[For the Church/world] Lord, make Your house a house of prayer for all parishes in our diocese.',
      );
    });
  });
});

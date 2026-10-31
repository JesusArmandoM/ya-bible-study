import { describe, expect, it } from 'vitest';
import {
  SESSION_REFLECTION_CONTENT_MAX_LENGTH,
  SESSION_REFLECTION_CONTENT_MIN_LENGTH,
  normalizeReflectionContent,
  type SessionReflection,
} from '../../src/shared/session';

describe('normalizeReflectionContent', () => {
  it('has expected bounds constants', () => {
    expect(SESSION_REFLECTION_CONTENT_MIN_LENGTH).toBe(1);
    expect(SESSION_REFLECTION_CONTENT_MAX_LENGTH).toBe(1000);
  });

  it('accepts valid reflection content and trims leading and trailing whitespace', () => {
    const raw = '   Faith means trusting Jesus even when He is quiet.   ';
    const normalized = normalizeReflectionContent(raw);
    expect(normalized).toBe('Faith means trusting Jesus even when He is quiet.');
  });

  it('preserves internal line breaks and paragraphs', () => {
    const raw = 'Paragraph 1: She knelt before Jesus.\n\nParagraph 2: Her persistence was rewarded.';
    const normalized = normalizeReflectionContent(raw);
    expect(normalized).toBe(raw);
    expect(normalized).toContain('\n\n');
  });

  it('rejects non-string inputs', () => {
    expect(normalizeReflectionContent(null)).toBeNull();
    expect(normalizeReflectionContent(undefined)).toBeNull();
    expect(normalizeReflectionContent(12345)).toBeNull();
    expect(normalizeReflectionContent({})).toBeNull();
    expect(normalizeReflectionContent(['hello'])).toBeNull();
  });

  it('rejects empty or whitespace-only content', () => {
    expect(normalizeReflectionContent('')).toBeNull();
    expect(normalizeReflectionContent('   ')).toBeNull();
    expect(normalizeReflectionContent('\n\t\r\n')).toBeNull();
  });

  it('accepts content up to 1000 characters', () => {
    const exactly1000 = 'a'.repeat(1000);
    expect(normalizeReflectionContent(exactly1000)).toBe(exactly1000);
  });

  it('rejects content exceeding 1000 characters', () => {
    const over1000 = 'a'.repeat(1001);
    expect(normalizeReflectionContent(over1000)).toBeNull();
  });

  it('verifies anonymous SessionReflection contract shape', () => {
    const anonymousReflection: SessionReflection = {
      id: 'refl-123',
      questionId: 'q-6',
      authorDisplayName: 'Anonymous',
      authorInitials: '?',
      avatarPalette: 'indigo',
      content: 'Lord help me trust your mercy.',
      createdAt: '2026-10-31T20:00:00.000Z',
      isAnonymous: true,
    };

    expect(anonymousReflection.authorDisplayName).toBe('Anonymous');
    expect(anonymousReflection.authorInitials).toBe('?');
    expect(anonymousReflection.avatarPalette).toBe('indigo');
    expect(anonymousReflection.isAnonymous).toBe(true);
    expect(anonymousReflection).not.toHaveProperty('memberId');
    expect(anonymousReflection).not.toHaveProperty('authorMemberId');
  });
});

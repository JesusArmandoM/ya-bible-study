import { describe, expect, it } from 'vitest';
import { extractJoinCodeFromLocation } from '../../src/client/lib/urlHelpers';

describe('extractJoinCodeFromLocation', () => {
  it('extracts join code from /join/:code', () => {
    expect(
      extractJoinCodeFromLocation({
        pathname: '/join/ABCXYZ',
      }),
    ).toBe('ABCXYZ');
  });

  it('normalizes lowercase code to uppercase from pathname', () => {
    expect(
      extractJoinCodeFromLocation({
        pathname: '/join/abcxyz/',
      }),
    ).toBe('ABCXYZ');
  });

  it('extracts join code from ?code= query param', () => {
    expect(
      extractJoinCodeFromLocation({
        pathname: '/',
        search: '?code=DEF789',
      }),
    ).toBe('DEF789');
  });

  it('extracts join code from ?join= query param', () => {
    expect(
      extractJoinCodeFromLocation({
        pathname: '/',
        search: '?join=ghj456',
      }),
    ).toBe('GHJ456');
  });

  it('returns null for non-matching or invalid codes', () => {
    expect(extractJoinCodeFromLocation({ pathname: '/' })).toBeNull();
    expect(extractJoinCodeFromLocation({ pathname: '/join/' })).toBeNull();
    expect(extractJoinCodeFromLocation({ pathname: '/join/too-long-code' })).toBeNull();
    expect(extractJoinCodeFromLocation({ pathname: '/join/123' })).toBeNull();
    expect(extractJoinCodeFromLocation({ pathname: '/', search: '?code=short' })).toBeNull();
    expect(extractJoinCodeFromLocation(null)).toBeNull();
  });
});

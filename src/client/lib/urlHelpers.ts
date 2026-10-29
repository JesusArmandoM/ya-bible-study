import { isValidSessionCode, normalizeSessionCode } from '../../shared/session';

export interface LocationWithSearchOrPathname {
  pathname?: string;
  search?: string;
}

/**
 * Extracts and validates a 6-character alphanumeric session join code from
 * either a path (/join/:code) or query string (?code=:code or ?join=:code).
 * Returns normalized uppercase code, or null if no valid code is present.
 */
export function extractJoinCodeFromLocation(
  locationLike?: LocationWithSearchOrPathname | null,
): string | null {
  const loc =
    locationLike !== undefined
      ? locationLike
      : typeof window !== 'undefined'
        ? window.location
        : null;

  if (!loc) {
    return null;
  }

  // 1. Pathname match: e.g. /join/ABCXYZ or /join/ABCXYZ/
  if (typeof loc.pathname === 'string') {
    const pathMatch = loc.pathname.match(/^\/join\/([A-Za-z0-9]{6})(?:\/|$)/);
    if (pathMatch && pathMatch[1]) {
      const code = normalizeSessionCode(pathMatch[1]);
      if (isValidSessionCode(code)) {
        return code;
      }
    }
  }

  // 2. Query search match: e.g. ?code=ABCXYZ or ?join=ABCXYZ
  if (typeof loc.search === 'string' && loc.search.length > 1) {
    try {
      const searchParams = new URLSearchParams(loc.search);
      const queryParam = searchParams.get('code') ?? searchParams.get('join');
      if (queryParam) {
        const code = normalizeSessionCode(queryParam);
        if (isValidSessionCode(code)) {
          return code;
        }
      }
    } catch {
      // Ignore URLSearchParams parsing exceptions
    }
  }

  return null;
}

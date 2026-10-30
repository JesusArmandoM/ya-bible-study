export interface LocationLike {
  protocol: string;
  host: string;
}

/**
 * Hostnames that only resolve on the machine running the dev server. Join
 * links built from these origins will not reach phones on other networks,
 * so the QR share sheet prefers `PUBLIC_URL` and warns otherwise.
 */
const LOCAL_ONLY_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function extractHostname(host: string): string {
  const trimmed = host.trim().toLowerCase();
  if (trimmed.length === 0) {
    return '';
  }
  if (trimmed.startsWith('[')) {
    const end = trimmed.indexOf(']');
    return end === -1 ? trimmed : trimmed.slice(0, end + 1);
  }
  // A bare IPv6 host (e.g. `::1`) contains multiple colons and is only
  // written with brackets when a port is appended.
  if (trimmed.split(':').length > 2) {
    return trimmed;
  }
  const colon = trimmed.indexOf(':');
  return colon === -1 ? trimmed : trimmed.slice(0, colon);
}

/**
 * True when the given `host` (optionally with a `:port`) is a local-only
 * hostname (`localhost`, `127.0.0.1`, `[::1]`, `::1`).
 */
export function isLocalOnlyHostname(host: string): boolean {
  return LOCAL_ONLY_HOSTNAMES.has(extractHostname(host));
}

/**
 * Sanitizes a configured `PUBLIC_URL` into a bare `http(s)` origin (path
 * stripped). Returns `null` when unset or not a valid `http(s)` URL so a
 * misconfigured tunnel variable can never break join links.
 */
export function sanitizeHttpOrigin(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.origin;
    }
  } catch {
    // Not a parsable URL; treated as unconfigured.
  }
  return null;
}

export interface ResolveJoinUrlOptions {
  location?: LocationLike;
  publicUrl?: string | null;
}

export interface ResolvedJoinUrl {
  url: string;
  isLocalOnly: boolean;
  usedPublicUrl: boolean;
}

/**
 * Builds the localhost-safe `/join/:sessionCode` URL encoded by the lobby QR
 * share sheet. Resolution order (CONSTRAINTS #1 — never hardcode hosts):
 * - local-only origin **and** valid `PUBLIC_URL` -> `{publicUrlOrigin}/join/{code}`;
 * - otherwise -> `{location.protocol}//{location.host}/join/{code}` untouched
 *   (LAN IPs and HTTPS tunnel origins are already reachable).
 */
export function resolveJoinUrl(
  sessionCode: string,
  options: ResolveJoinUrlOptions = {},
): ResolvedJoinUrl {
  const normalizedCode = sessionCode.trim().toUpperCase();
  const loc =
    options.location ??
    (typeof window !== 'undefined' ? window.location : undefined);

  const publicUrlOrigin = sanitizeHttpOrigin(options.publicUrl);
  const isLocalOnly = loc ? isLocalOnlyHostname(loc.host) : false;

  if (isLocalOnly && publicUrlOrigin) {
    return {
      url: `${publicUrlOrigin}/join/${normalizedCode}`,
      isLocalOnly,
      usedPublicUrl: true,
    };
  }

  if (!loc || !loc.host) {
    throw new Error('Cannot resolve a join URL without an active browser host.');
  }

  return {
    url: `${loc.protocol}//${loc.host}/join/${normalizedCode}`,
    isLocalOnly,
    usedPublicUrl: false,
  };
}

/**
 * Resolves a backend API path without hardcoding localhost.
 * Returns a same-origin relative path by default so dev proxies, unified ports,
 * and public HTTPS tunnels (cloudflared / ngrok) work seamlessly.
 */
export function resolveApiUrl(
  pathname: string,
  locationOverride?: LocationLike,
): string {
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  if (!normalizedPath.startsWith('/api/') && normalizedPath !== '/api') {
    throw new Error(`API path must begin with "/api": received "${pathname}"`);
  }

  if (locationOverride) {
    return `${locationOverride.protocol}//${locationOverride.host}${normalizedPath}`;
  }

  return normalizedPath;
}

/**
 * Dynamically resolves ws:// or wss:// from window.location (or an explicit location)
 * so external HTTPS tunnels automatically upgrade over wss:// without localhost leaks.
 */
export function resolveWebSocketUrl(
  pathname = '/ws',
  locationOverride?: LocationLike,
): string {
  const loc =
    locationOverride ?? (typeof window !== 'undefined' ? window.location : undefined);

  if (!loc || !loc.host) {
    throw new Error('Cannot resolve WebSocket URL without an active browser host.');
  }

  const wsProtocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${wsProtocol}//${loc.host}${normalizedPath}`;
}

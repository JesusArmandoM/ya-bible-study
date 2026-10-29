export interface LocationLike {
  protocol: string;
  host: string;
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

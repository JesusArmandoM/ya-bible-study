import { describe, expect, it } from 'vitest';
import {
  isLocalOnlyHostname,
  resolveJoinUrl,
  sanitizeHttpOrigin,
} from '../../src/client/lib/runtimeUrl';

describe('isLocalOnlyHostname', () => {
  it('flags localhost, 127.0.0.1, [::1], and ::1 with or without ports', () => {
    expect(isLocalOnlyHostname('localhost')).toBe(true);
    expect(isLocalOnlyHostname('localhost:3000')).toBe(true);
    expect(isLocalOnlyHostname('LOCALHOST:3101')).toBe(true);
    expect(isLocalOnlyHostname('127.0.0.1')).toBe(true);
    expect(isLocalOnlyHostname('127.0.0.1:3101')).toBe(true);
    expect(isLocalOnlyHostname('[::1]')).toBe(true);
    expect(isLocalOnlyHostname('[::1]:3000')).toBe(true);
    expect(isLocalOnlyHostname('::1')).toBe(true);
  });

  it('does not flag LAN IPs, tunnel hosts, or lookalike domains', () => {
    expect(isLocalOnlyHostname('192.168.1.25:3000')).toBe(false);
    expect(isLocalOnlyHostname('10.0.0.7')).toBe(false);
    expect(isLocalOnlyHostname('demo-room.trycloudflare.com')).toBe(false);
    expect(isLocalOnlyHostname('localhost.example.com')).toBe(false);
    expect(isLocalOnlyHostname('')).toBe(false);
  });
});

describe('sanitizeHttpOrigin', () => {
  it('returns a bare http(s) origin with any path stripped', () => {
    expect(sanitizeHttpOrigin('https://demo.trycloudflare.com')).toBe(
      'https://demo.trycloudflare.com',
    );
    expect(sanitizeHttpOrigin('https://demo.trycloudflare.com/join/ABC123')).toBe(
      'https://demo.trycloudflare.com',
    );
    expect(sanitizeHttpOrigin('  http://192.168.1.25:8080/  ')).toBe(
      'http://192.168.1.25:8080',
    );
  });

  it('rejects unset, empty, unparsable, and non-http(s) values', () => {
    expect(sanitizeHttpOrigin(undefined)).toBeNull();
    expect(sanitizeHttpOrigin(null)).toBeNull();
    expect(sanitizeHttpOrigin('')).toBeNull();
    expect(sanitizeHttpOrigin('   ')).toBeNull();
    expect(sanitizeHttpOrigin('not a url')).toBeNull();
    expect(sanitizeHttpOrigin('ftp://demo.example.com')).toBeNull();
    expect(sanitizeHttpOrigin('javascript:alert(1)')).toBeNull();
    expect(sanitizeHttpOrigin('file:///etc/passwd')).toBeNull();
  });
});

describe('resolveJoinUrl', () => {
  const tunnelLocation = {
    protocol: 'https:',
    host: 'demo-room.trycloudflare.com',
  };

  it('builds {origin}/join/{CODE} from a local origin without PUBLIC_URL (warning case)', () => {
    const resolved = resolveJoinUrl('abc123', {
      location: { protocol: 'http:', host: '127.0.0.1:3101' },
      publicUrl: null,
    });
    expect(resolved).toEqual({
      url: 'http://127.0.0.1:3101/join/ABC123',
      isLocalOnly: true,
      usedPublicUrl: false,
    });

    const localhostResolved = resolveJoinUrl('TEST99', {
      location: { protocol: 'http:', host: 'localhost:3000' },
    });
    expect(localhostResolved).toEqual({
      url: 'http://localhost:3000/join/TEST99',
      isLocalOnly: true,
      usedPublicUrl: false,
    });

    const ipv6Resolved = resolveJoinUrl('TEST99', {
      location: { protocol: 'http:', host: '[::1]:3000' },
    });
    expect(ipv6Resolved.url).toBe('http://[::1]:3000/join/TEST99');
    expect(ipv6Resolved.isLocalOnly).toBe(true);
    expect(ipv6Resolved.usedPublicUrl).toBe(false);
  });

  it('prefers PUBLIC_URL on local-only origins and sanitizes its origin', () => {
    const resolved = resolveJoinUrl('JOIN42', {
      location: { protocol: 'http:', host: 'localhost:3000' },
      publicUrl: 'https://demo.trycloudflare.com/some/path',
    });
    expect(resolved).toEqual({
      url: 'https://demo.trycloudflare.com/join/JOIN42',
      isLocalOnly: true,
      usedPublicUrl: true,
    });
  });

  it('ignores invalid PUBLIC_URL values on local-only origins', () => {
    for (const publicUrl of [
      'not a url',
      'ftp://demo.example.com',
      'javascript:alert(1)',
      '',
    ]) {
      const resolved = resolveJoinUrl('JOIN42', {
        location: { protocol: 'http:', host: '127.0.0.1:3101' },
        publicUrl,
      });
      expect(resolved).toEqual({
        url: 'http://127.0.0.1:3101/join/JOIN42',
        isLocalOnly: true,
        usedPublicUrl: false,
      });
    }
  });

  it('encodes the current origin untouched on LAN IPs and HTTPS tunnels even with PUBLIC_URL set', () => {
    const lanResolved = resolveJoinUrl('LAN777', {
      location: { protocol: 'http:', host: '192.168.1.25:3000' },
      publicUrl: 'https://demo.trycloudflare.com',
    });
    expect(lanResolved).toEqual({
      url: 'http://192.168.1.25:3000/join/LAN777',
      isLocalOnly: false,
      usedPublicUrl: false,
    });

    const tunnelResolved = resolveJoinUrl('TUNNEL', {
      location: tunnelLocation,
      publicUrl: 'https://other.trycloudflare.com',
    });
    expect(tunnelResolved).toEqual({
      url: 'https://demo-room.trycloudflare.com/join/TUNNEL',
      isLocalOnly: false,
      usedPublicUrl: false,
    });
  });

  it('throws without any browser host to build from', () => {
    expect(() => resolveJoinUrl('ABC123')).toThrow(/active browser host/);
    expect(() =>
      resolveJoinUrl('ABC123', { location: { protocol: 'http:', host: '' } }),
    ).toThrow(/active browser host/);
  });
});

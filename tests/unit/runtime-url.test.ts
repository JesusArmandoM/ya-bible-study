import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import viteConfig from '../../vite.config';
import {
  resolveApiUrl,
  resolveWebSocketUrl,
} from '../../src/client/lib/runtimeUrl';
import { SANCTUARY_ROLES } from '../../src/shared/health';

describe('runtimeUrl helpers', () => {
  it('resolves relative /api/* paths by default without hardcoding localhost', () => {
    expect(resolveApiUrl('/api/health')).toBe('/api/health');
    expect(resolveApiUrl('api/health')).toBe('/api/health');
  });

  it('resolves explicit origin overrides for tunnel hosts', () => {
    expect(
      resolveApiUrl('/api/health', {
        protocol: 'https:',
        host: 'demo-room.trycloudflare.com',
      }),
    ).toBe('https://demo-room.trycloudflare.com/api/health');
  });

  it('rejects paths outside /api', () => {
    expect(() => resolveApiUrl('/other/path')).toThrow(/must begin with "\/api"/);
  });

  it('resolves ws:// for http origins and wss:// for https tunnel origins', () => {
    expect(
      resolveWebSocketUrl('/ws', {
        protocol: 'http:',
        host: '192.168.1.25:3000',
      }),
    ).toBe('ws://192.168.1.25:3000/ws');

    expect(
      resolveWebSocketUrl('/ws', {
        protocol: 'https:',
        host: 'demo-room.trycloudflare.com',
      }),
    ).toBe('wss://demo-room.trycloudflare.com/ws');
  });

  it('throws when no browser host is available', () => {
    expect(() =>
      resolveWebSocketUrl('/ws', { protocol: 'http:', host: '' }),
    ).toThrow(/active browser host/);
  });
});

describe('vite single-port & tunnel configuration', () => {
  it('enables allowedHosts: true for server and preview and proxies /api and /ws', () => {
    const resolved = viteConfig;

    expect(resolved.build?.outDir).toBe('dist/client');
    expect(resolved.server?.allowedHosts).toBe(true);
    expect(resolved.preview?.allowedHosts).toBe(true);

    const proxy = resolved.server?.proxy ?? {};
    expect(proxy).toHaveProperty('/api');
    expect(proxy).toHaveProperty('/ws');

    const wsProxy = proxy['/ws'];
    expect(typeof wsProxy).toBe('object');
    if (typeof wsProxy === 'object' && wsProxy !== null) {
      expect(wsProxy.ws).toBe(true);
    }
  });
});

describe('domain role terminology & CSS baseline', () => {
  it('exposes Study Leader and Participant roles and never Assistant', () => {
    expect(SANCTUARY_ROLES).toEqual(['Study Leader', 'Participant']);
    expect(SANCTUARY_ROLES).not.toContain('Assistant');
  });

  it('defines DESIGN.md Midnight Sanctuary tokens and >= 16px input baseline', () => {
    const tokensCss = fs.readFileSync(
      path.resolve(process.cwd(), 'src/client/styles/tokens.css'),
      'utf8',
    );
    const globalCss = fs.readFileSync(
      path.resolve(process.cwd(), 'src/client/styles/global.css'),
      'utf8',
    );

    expect(tokensCss).toContain('--color-bg: #0B0D17;');
    expect(tokensCss).toContain('--color-surface: #171B2E;');
    expect(tokensCss).toContain('--color-primary: #E2A83E;');
    expect(tokensCss).toContain('--color-primary-fg: #11131F;');
    expect(tokensCss).toContain('--color-secondary: #B855C8;');
    expect(tokensCss).toContain('--color-accent-indigo: #6E75F5;');
    expect(tokensCss).toContain("'Playfair Display'");
    expect(tokensCss).toContain("'Plus Jakarta Sans'");
    expect(globalCss).toContain('font-size: max(16px, 1rem);');
  });
});

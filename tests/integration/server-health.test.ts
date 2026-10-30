import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAppServer, type AppServer } from '../../src/server/app';
import type { HealthResponse } from '../../src/shared/health';

describe('Unified single-port HTTP + WebSocket server', () => {
  let tempStaticDir: string;
  let server: AppServer;
  let baseUrl: string;
  let port: number;

  beforeEach(async () => {
    tempStaticDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'ya-bible-study-static-'),
    );
    fs.writeFileSync(
      path.join(tempStaticDir, 'index.html'),
      '<!doctype html><html lang="en"><head><title>YA Bible Study</title></head><body><div id="root">Midnight Sanctuary Shell</div></body></html>',
      'utf8',
    );

    server = createAppServer({ staticDir: tempStaticDir });
    const bound = await server.start(0, '127.0.0.1');
    port = bound.port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await server.close();
    fs.rmSync(tempStaticDir, { recursive: true, force: true });
  });

  it('serves GET /api/health with status ok and GET / React HTML shell on the same port', async () => {
    const healthRes = await fetch(`${baseUrl}/api/health`);
    expect(healthRes.status).toBe(200);
    expect(healthRes.headers.get('content-type')).toContain('application/json');

    const healthBody = (await healthRes.json()) as HealthResponse;
    expect(healthBody.status).toBe('ok');
    expect(typeof healthBody.uptimeSeconds).toBe('number');
    expect(healthBody.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(healthBody.activeSessionCount).toBe(0);
    expect(healthBody.wsReady).toBe(true);
    expect(healthBody.publicUrl ?? null).toBeNull();
    expect(Number.isNaN(Date.parse(healthBody.timestamp))).toBe(false);
  });

  it('exposes the sanitized PUBLIC_URL origin on GET /api/health when configured', async () => {
    const priorPublicUrl = process.env.PUBLIC_URL;
    try {
      process.env.PUBLIC_URL = 'https://example-tunnel.trycloudflare.com/join';
      const healthy = await fetch(`${baseUrl}/api/health`);
      expect(healthy.status).toBe(200);
      const body = (await healthy.json()) as HealthResponse;
      expect(body.publicUrl).toBe('https://example-tunnel.trycloudflare.com');

      process.env.PUBLIC_URL = 'not-a-valid-url';
      const invalid = await fetch(`${baseUrl}/api/health`);
      const invalidBody = (await invalid.json()) as HealthResponse;
      expect(invalidBody.publicUrl ?? null).toBeNull();
    } finally {
      if (priorPublicUrl === undefined) {
        delete process.env.PUBLIC_URL;
      } else {
        process.env.PUBLIC_URL = priorPublicUrl;
      }
    }

    const shellRes = await fetch(`${baseUrl}/`);
    expect(shellRes.status).toBe(200);
    expect(shellRes.headers.get('content-type')).toContain('text/html');
    const shellHtml = await shellRes.text();
    expect(shellHtml).toContain('<title>YA Bible Study</title>');
  });

  it('returns JSON 404 for unknown /api/* routes while serving index.html for SPA client paths', async () => {
    const unknownApiRes = await fetch(`${baseUrl}/api/nonexistent`);
    expect(unknownApiRes.status).toBe(404);
    expect(unknownApiRes.headers.get('content-type')).toContain(
      'application/json',
    );
    expect(await unknownApiRes.json()).toEqual({ error: 'Not found' });

    const spaRouteRes = await fetch(`${baseUrl}/join/ABC123`);
    expect(spaRouteRes.status).toBe(200);
    expect(spaRouteRes.headers.get('content-type')).toContain('text/html');
    expect(await spaRouteRes.text()).toContain('Midnight Sanctuary Shell');
  });

  it('accepts external public HTTPS tunnel Host headers and upgrades /ws on the unified port', async () => {
    const tunnelHealthRes = await fetch(`${baseUrl}/api/health`, {
      headers: {
        Host: 'demo-room.trycloudflare.com',
        'X-Forwarded-Proto': 'https',
      },
    });
    expect(tunnelHealthRes.status).toBe(200);
    const tunnelHealth = (await tunnelHealthRes.json()) as HealthResponse;
    expect(tunnelHealth.status).toBe('ok');

    const pongPayload = await new Promise<{ type: string; timestamp: string }>(
      (resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
          headers: { Host: 'demo-room.trycloudflare.com' },
        });

        ws.once('error', reject);
        ws.once('open', () => {
          ws.send(JSON.stringify({ type: 'ping' }));
        });
        ws.once('message', (data) => {
          const parsed = JSON.parse(String(data)) as {
            type: string;
            timestamp: string;
          };
          ws.close();
          resolve(parsed);
        });
      },
    );

    expect(pongPayload.type).toBe('pong');
    expect(Number.isNaN(Date.parse(pongPayload.timestamp))).toBe(false);
  });

  it('rejects WebSocket upgrade attempts on non-/ws paths', async () => {
    await expect(
      new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/not-ws`);
        ws.once('open', () => {
          ws.close();
          resolve();
        });
        ws.once('error', (err) => {
          reject(err);
        });
      }),
    ).rejects.toThrow();
  });
});

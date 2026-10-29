import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import express, { type Express } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import type { HealthResponse } from '../shared/health.js';

export interface AppServerOptions {
  staticDir?: string | false;
  getActiveSessionCount?: () => number;
}

export interface BoundServerAddress {
  port: number;
  host: string;
}

export interface AppServer {
  app: Express;
  httpServer: http.Server;
  wss: WebSocketServer;
  start: (port?: number, host?: string) => Promise<BoundServerAddress>;
  close: () => Promise<void>;
}

function resolveDefaultStaticDir(): string | undefined {
  const candidates = [
    path.resolve(import.meta.dirname, '../client'),
    path.resolve(process.cwd(), 'dist/client'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'index.html'))) {
      return candidate;
    }
  }

  return undefined;
}

export function createAppServer(options: AppServerOptions = {}): AppServer {
  const startedAtMs = Date.now();
  const getActiveSessionCount = options.getActiveSessionCount ?? (() => 0);
  let isClosing = false;
  let closePromise: Promise<void> | undefined;

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    const payload: HealthResponse = {
      status: 'ok',
      uptimeSeconds: Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)),
      activeSessionCount: getActiveSessionCount(),
      wsReady: !isClosing,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(payload);
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  const resolvedStaticDir =
    options.staticDir === false
      ? undefined
      : (options.staticDir ?? resolveDefaultStaticDir());

  if (resolvedStaticDir) {
    const indexHtmlPath = path.join(resolvedStaticDir, 'index.html');
    if (fs.existsSync(indexHtmlPath)) {
      app.use(express.static(resolvedStaticDir));
      app.use((req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          next();
          return;
        }
        if (req.path === '/ws' || req.path.startsWith('/ws/')) {
          next();
          return;
        }
        res.sendFile(indexHtmlPath);
      });
    }
  }

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (socket) => {
    socket.on('error', () => {
      // Prevent unhandled client socket errors from crashing the server process.
    });

    socket.on('message', (rawData) => {
      try {
        const parsed = JSON.parse(String(rawData)) as { type?: unknown };
        if (parsed.type === 'ping' && socket.readyState === WebSocket.OPEN) {
          socket.send(
            JSON.stringify({
              type: 'pong',
              timestamp: new Date().toISOString(),
            }),
          );
        }
      } catch {
        // Malformed frames are ignored at bootstrap; protocol handlers arrive in ws-live-session-room-lifecycle.
      }
    });
  });

  httpServer.on('upgrade', (request, socket, head) => {
    if (isClosing) {
      socket.destroy();
      return;
    }

    let pathname = '/';
    try {
      const parsedUrl = new URL(
        request.url ?? '/',
        `http://${request.headers.host ?? 'localhost'}`,
      );
      pathname = parsedUrl.pathname;
    } catch {
      socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }

    if (pathname !== '/ws') {
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  const start = (port = 3000, host = '0.0.0.0'): Promise<BoundServerAddress> =>
    new Promise((resolve, reject) => {
      const onError = (err: Error) => {
        httpServer.off('listening', onListening);
        reject(err);
      };
      const onListening = () => {
        httpServer.off('error', onError);
        const addr = httpServer.address() as AddressInfo | string | null;
        if (!addr || typeof addr === 'string') {
          resolve({ port, host });
          return;
        }
        resolve({ port: addr.port, host: addr.address });
      };

      httpServer.once('error', onError);
      httpServer.once('listening', onListening);
      httpServer.listen(port, host);
    });

  const close = (): Promise<void> => {
    if (closePromise) {
      return closePromise;
    }
    isClosing = true;

    closePromise = new Promise<void>((resolve, reject) => {
      for (const client of wss.clients) {
        client.terminate();
      }

      wss.close(() => {
        if (!httpServer.listening) {
          resolve();
          return;
        }
        httpServer.close((err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      });
    });

    return closePromise;
  };

  return {
    app,
    httpServer,
    wss,
    start,
    close,
  };
}

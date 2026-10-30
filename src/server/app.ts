import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import express, { type Express } from 'express';
import multer from 'multer';
import { WebSocketServer, WebSocket } from 'ws';
import type { HealthResponse } from '../shared/health.js';
import {
  DEFAULT_WS_MAX_PAYLOAD_BYTES,
  type ServerWsMessage,
} from '../shared/session.js';
import { LiveSessionStore } from './sessionStore.js';
import { getDefaultStudyDocument } from './studies/greatIsYourFaithSeed.js';
import { parseMarkdownStudy } from './studies/markdownParser.js';
import { parsePdfStudy } from './studies/pdfParser.js';

export const MAX_STUDY_PAYLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Sanitizes the optional `PUBLIC_URL` environment variable into a bare
 * `http(s)` origin (path stripped) for localhost-safe QR join URLs.
 * Returns `null` when unset or not a valid `http(s)` URL.
 */
export function resolvePublicUrlOrigin(raw: string | undefined): string | null {
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

export interface AppServerOptions {
  staticDir?: string | false;
  sessionStore?: LiveSessionStore;
  getActiveSessionCount?: () => number;
  wsMaxPayloadBytes?: number;
}

export interface BoundServerAddress {
  port: number;
  host: string;
}

export interface AppServer {
  app: Express;
  httpServer: http.Server;
  wss: WebSocketServer;
  sessionStore: LiveSessionStore;
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
  const sessionStore = options.sessionStore ?? new LiveSessionStore();
  const getActiveSessionCount =
    options.getActiveSessionCount ?? (() => sessionStore.getActiveSessionCount());
  let isClosing = false;
  let closePromise: Promise<void> | undefined;

  const app = express();
  app.disable('x-powered-by');

  app.use('/api/studies/parse', (req, res, next) => {
    const contentLength = req.headers['content-length'];
    if (contentLength && Number(contentLength) > MAX_STUDY_PAYLOAD_BYTES) {
      res.status(413).json({ error: 'File size exceeds 10MB limit' });
      return;
    }
    next();
  });

  app.use(express.json({ limit: '10mb' }));
  app.use(express.text({ type: ['text/plain', 'text/markdown'], limit: '10mb' }));
  app.use(express.raw({ type: 'application/pdf', limit: '10mb' }));

  const studyUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: MAX_STUDY_PAYLOAD_BYTES,
    },
  });

  app.get('/api/health', (_req, res) => {
    const payload: HealthResponse = {
      status: 'ok',
      uptimeSeconds: Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)),
      activeSessionCount: getActiveSessionCount(),
      wsReady: !isClosing,
      timestamp: new Date().toISOString(),
      publicUrl: resolvePublicUrlOrigin(process.env.PUBLIC_URL),
    };

    res.status(200).json(payload);
  });

  app.get('/api/studies/default', (_req, res) => {
    res.status(200).json(getDefaultStudyDocument());
  });

  app.post('/api/studies/parse', async (req, res) => {
    const contentLength = req.headers['content-length'];
    if (contentLength && Number(contentLength) > MAX_STUDY_PAYLOAD_BYTES) {
      res.status(413).json({ error: 'File size exceeds 10MB limit' });
      return;
    }

    const contentType = req.headers['content-type'] ?? '';
    if (contentType.includes('multipart/form-data')) {
      studyUpload.single('file')(req, res, async (err) => {
        if (err) {
          if (
            (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') ||
            (err as { code?: unknown }).code === 'LIMIT_FILE_SIZE'
          ) {
            res.status(413).json({ error: 'File size exceeds 10MB limit' });
            return;
          }
          res.status(400).json({
            error: 'Study validation failed',
            errors: [err.message || 'File upload error.'],
          });
          return;
        }

        const file = req.file;
        if (!file || !file.buffer) {
          res.status(400).json({
            error: 'Study validation failed',
            errors: ['No file uploaded in form field "file".'],
          });
          return;
        }

        const originalName = (file.originalname || '').toLowerCase();
        const mimeType = (file.mimetype || '').toLowerCase();

        const isPdf =
          originalName.endsWith('.pdf') || mimeType === 'application/pdf';
        const isMd =
          (originalName.endsWith('.md') ||
            originalName.endsWith('.markdown') ||
            mimeType === 'text/markdown') &&
          !originalName.endsWith('.docx') &&
          !originalName.endsWith('.txt') &&
          !originalName.endsWith('.png') &&
          !originalName.endsWith('.jpg') &&
          !originalName.endsWith('.csv');

        if (!isPdf && !isMd) {
          res.status(400).json({
            error: 'Study validation failed',
            errors: [
              'Unsupported file type: only .pdf and .md study files are supported.',
            ],
          });
          return;
        }

        if (isPdf) {
          const fileName = file.originalname || 'uploaded-study.pdf';
          const result = await parsePdfStudy(file.buffer, { fileName });

          if (!result.valid) {
            res.status(400).json({
              error: 'Study validation failed',
              errors: result.errors,
            });
            return;
          }

          res.status(200).json(result.value);
          return;
        }

        const markdownContent = file.buffer.toString('utf-8');
        const fileName = file.originalname || 'uploaded-study.md';
        const result = parseMarkdownStudy(markdownContent, { fileName });

        if (!result.valid) {
          res.status(400).json({
            error: 'Study validation failed',
            errors: result.errors,
          });
          return;
        }

        res.status(200).json(result.value);
      });
      return;
    }

    // Raw binary application/pdf
    if (req.is('application/pdf') || Buffer.isBuffer(req.body)) {
      const headerFileName = req.headers['x-file-name'];
      const fileName =
        typeof headerFileName === 'string' && headerFileName.trim().length > 0
          ? headerFileName.trim()
          : 'uploaded-study.pdf';

      const buffer = Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.from(req.body as ArrayBuffer);

      const result = await parsePdfStudy(buffer, { fileName });
      if (!result.valid) {
        res.status(400).json({
          error: 'Study validation failed',
          errors: result.errors,
        });
        return;
      }

      res.status(200).json(result.value);
      return;
    }

    // Raw text or JSON
    let markdownContent = '';
    let fileName = 'uploaded-study.md';

    if (typeof req.body === 'string') {
      markdownContent = req.body;
    } else if (typeof req.body === 'object' && req.body !== null) {
      const rawContent =
        (req.body as { content?: unknown; markdown?: unknown }).content ??
        (req.body as { content?: unknown; markdown?: unknown }).markdown;
      if (typeof rawContent === 'string') {
        markdownContent = rawContent;
      }
      const reqFileName = (req.body as { fileName?: unknown }).fileName;
      if (typeof reqFileName === 'string' && reqFileName.trim().length > 0) {
        fileName = reqFileName.trim();
      }
    }

    if (markdownContent.trim().length === 0) {
      res.status(400).json({
        error: 'Study validation failed',
        errors: ['Study document markdown content is empty.'],
      });
      return;
    }

    const result = parseMarkdownStudy(markdownContent, { fileName });
    if (!result.valid) {
      res.status(400).json({
        error: 'Study validation failed',
        errors: result.errors,
      });
      return;
    }

    res.status(200).json(result.value);
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      if (
        err &&
        typeof err === 'object' &&
        (('type' in err && (err as { type: unknown }).type === 'entity.too.large') ||
          ('status' in err && (err as { status: unknown }).status === 413) ||
          ('statusCode' in err && (err as { statusCode: unknown }).statusCode === 413) ||
          ('code' in err && (err as { code: unknown }).code === 'LIMIT_FILE_SIZE'))
      ) {
        res.status(413).json({ error: 'File size exceeds 10MB limit' });
        return;
      }
      next(err);
    },
  );

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
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: options.wsMaxPayloadBytes ?? DEFAULT_WS_MAX_PAYLOAD_BYTES,
  });

  const sendSocketMessage = (socket: WebSocket, message: ServerWsMessage) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  };

  wss.on('connection', (socket) => {
    socket.on('error', () => {
      // Prevent unhandled client socket errors (including maxPayload violations) from crashing the process.
    });

    socket.on('close', () => {
      sessionStore.handleSocketClose(socket);
    });

    socket.on('message', (rawData, isBinary) => {
      if (isBinary) {
        sendSocketMessage(socket, {
          type: 'session_error',
          code: 'INVALID_MESSAGE',
          message: 'Binary WebSocket frames are not supported; send UTF-8 JSON.',
        });
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(String(rawData));
      } catch {
        sendSocketMessage(socket, {
          type: 'session_error',
          code: 'INVALID_MESSAGE',
          message: 'Malformed WebSocket JSON frame.',
        });
        return;
      }

      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        !Array.isArray(parsed) &&
        (parsed as { type?: unknown }).type === 'ping'
      ) {
        const requestId = (parsed as { requestId?: unknown }).requestId;
        sendSocketMessage(socket, {
          type: 'pong',
          timestamp: new Date().toISOString(),
          ...(typeof requestId === 'string' && requestId.length > 0
            ? { requestId }
            : {}),
        });
        return;
      }

      sessionStore.handleMessage(socket, parsed);
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
    sessionStore.dispose();

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
    sessionStore,
    start,
    close,
  };
}

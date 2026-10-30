// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getDefaultStudyDocument } from '../../src/server/studies/greatIsYourFaithSeed';
import type { StudyDocument } from '../../src/shared/study';
import {
  UNSUPPORTED_STUDY_FILE_MESSAGE,
  useStudySetup,
} from '../../src/client/lib/useStudySetup';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function createPeaceStudy(): StudyDocument {
  const base = getDefaultStudyDocument();
  return {
    ...base,
    id: 'peace-be-still',
    title: 'Peace! Be Still',
    gospelCitation: 'Mark 4:35–41',
    gospelSummaryLabel: 'Mark 4:35–41 · Calming of the Storm',
    source: {
      type: 'markdown',
      fileName: 'peace-be-still-mark-4.md',
      statusLabel: 'Analyzed',
    },
    gospelReading: {
      ...base.gospelReading,
      citation: 'Mark 4:35–41',
    },
  };
}

interface RecordedCall {
  url: string;
  init?: RequestInit;
}

function installFetchRouter(routes: {
  onDefault?: () => Promise<Response>;
  onParse?: (init?: RequestInit) => Promise<Response>;
}): RecordedCall[] {
  const calls: RecordedCall[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url === '/api/studies/default' && routes.onDefault) {
        return await routes.onDefault();
      }
      if (url === '/api/studies/parse' && routes.onParse) {
        return await routes.onParse(init);
      }
      throw new Error(`Unexpected fetch in test: ${url}`);
    },
  );
  return calls;
}

describe('useStudySetup hook', () => {
  it('fetches the default study on mount and settles on ready', async () => {
    const calls = installFetchRouter({
      onDefault: async () => jsonResponse(getDefaultStudyDocument()),
    });

    const { result } = renderHook(() => useStudySetup());

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.study?.title).toBe('Great Is Your Faith');
    expect(result.current.study?.source.fileName).toBe('Great Is Your Faith.pdf');
    expect(result.current.errorMessages).toEqual([]);
    expect(result.current.uploadedFileSize).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('/api/studies/default');
    expect(calls[0]?.init?.method).toBe('GET');
  });

  it('posts multipart FormData to /api/studies/parse and replaces the study on HTTP 200', async () => {
    const peaceStudy = createPeaceStudy();
    const calls = installFetchRouter({
      onDefault: async () => jsonResponse(getDefaultStudyDocument()),
      onParse: async () => jsonResponse(peaceStudy),
    });

    const { result } = renderHook(() => useStudySetup());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const file = new File(['# Peace'], 'peace-be-still-mark-4.md', {
      type: 'text/markdown',
    });
    await act(async () => {
      await result.current.analyzeFile(file);
    });

    expect(calls).toHaveLength(2);
    expect(calls[1]?.url).toBe('/api/studies/parse');
    expect(calls[1]?.init?.method).toBe('POST');
    const body = calls[1]?.init?.body;
    expect(body).toBeInstanceOf(FormData);
    const uploaded = (body as FormData).get('file');
    expect(uploaded).toBeInstanceOf(File);
    expect((uploaded as File).name).toBe('peace-be-still-mark-4.md');

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.study?.title).toBe('Peace! Be Still');
    expect(result.current.study?.gospelReading.citation).toBe('Mark 4:35–41');
    expect(result.current.uploadedFileSize).toBe(file.size);
    expect(result.current.errorMessages).toEqual([]);
  });

  it('rejects unsupported file types client-side without any network request', async () => {
    const calls = installFetchRouter({
      onDefault: async () => jsonResponse(getDefaultStudyDocument()),
    });

    const { result } = renderHook(() => useStudySetup());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.analyzeFile(new File(['x'], 'notes.txt'));
    });

    expect(calls).toHaveLength(1);
    expect(result.current.errorMessages).toEqual([
      UNSUPPORTED_STUDY_FILE_MESSAGE,
    ]);
    expect(result.current.errorMessages[0]).toBe(
      'Unsupported file type: only .pdf and .md study files are supported.',
    );
    expect(result.current.study?.title).toBe('Great Is Your Faith');
    expect(result.current.status).toBe('ready');
  });

  it('maps HTTP 400 errors to actionable messages and retains the previous preview', async () => {
    const calls = installFetchRouter({
      onDefault: async () => jsonResponse(getDefaultStudyDocument()),
      onParse: async () =>
        jsonResponse(
          {
            error: 'Study validation failed',
            errors: ['Missing Section 4 (Opening Prayer).'],
          },
          400,
        ),
    });

    const { result } = renderHook(() => useStudySetup());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.analyzeFile(new File(['broken'], 'malformed-study.md'));
    });

    expect(calls).toHaveLength(2);
    expect(result.current.errorMessages).toEqual([
      'Missing Section 4 (Opening Prayer).',
    ]);
    expect(result.current.study?.title).toBe('Great Is Your Faith');
    expect(result.current.status).toBe('ready');
  });

  it('maps HTTP 413 oversized errors and retains the previous preview', async () => {
    installFetchRouter({
      onDefault: async () => jsonResponse(getDefaultStudyDocument()),
      onParse: async () =>
        jsonResponse({ error: 'File size exceeds 10MB limit' }, 413),
    });

    const { result } = renderHook(() => useStudySetup());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.analyzeFile(new File(['big'], 'huge-study.md'));
    });

    expect(result.current.errorMessages).toEqual([
      'File size exceeds 10MB limit',
    ]);
    expect(result.current.study?.title).toBe('Great Is Your Faith');
    expect(result.current.status).toBe('ready');
  });

  it('reports uploading while the parse request is in flight and ready after it resolves', async () => {
    const parseGate: { resolve?: (response: Response) => void } = {};
    installFetchRouter({
      onDefault: async () => jsonResponse(getDefaultStudyDocument()),
      onParse: async () =>
        await new Promise<Response>((resolve) => {
          parseGate.resolve = resolve;
        }),
    });

    const { result } = renderHook(() => useStudySetup());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    let pending: Promise<void> | null = null;
    act(() => {
      pending = result.current.analyzeFile(new File(['x'], 'study.md'));
    });
    await waitFor(() => expect(result.current.status).toBe('uploading'));

    await act(async () => {
      parseGate.resolve?.(jsonResponse(createPeaceStudy()));
      await pending;
    });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.study?.title).toBe('Peace! Be Still');
  });

  it('reports error status with actionable messages when the default study fails to load', async () => {
    installFetchRouter({
      onDefault: async () => {
        throw new Error('Network down');
      },
    });

    const { result } = renderHook(() => useStudySetup());

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.study).toBeNull();
    expect(result.current.errorMessages.length).toBeGreaterThan(0);
  });

  it('resetError clears surfaced messages', async () => {
    installFetchRouter({
      onDefault: async () => jsonResponse(getDefaultStudyDocument()),
    });

    const { result } = renderHook(() => useStudySetup());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.analyzeFile(new File(['x'], 'notes.txt'));
    });
    expect(result.current.errorMessages.length).toBeGreaterThan(0);

    act(() => {
      result.current.resetError();
    });
    expect(result.current.errorMessages).toEqual([]);
  });

  it('stays idle without fetching while disabled, then loads once enabled', async () => {
    const calls = installFetchRouter({
      onDefault: async () => jsonResponse(getDefaultStudyDocument()),
    });

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useStudySetup({ enabled }),
      { initialProps: { enabled: false } },
    );

    expect(calls).toHaveLength(0);
    expect(result.current.study).toBeNull();

    rerender({ enabled: true });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(calls).toHaveLength(1);
    expect(result.current.study?.title).toBe('Great Is Your Faith');
  });
});

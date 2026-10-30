import { useCallback, useEffect, useRef, useState } from 'react';
import { validateStudyDocument, type StudyDocument } from '../../shared/study';
import { resolveApiUrl } from './runtimeUrl';

export type StudySetupStatus = 'loading' | 'ready' | 'uploading' | 'error';

export const UNSUPPORTED_STUDY_FILE_MESSAGE =
  'Unsupported file type: only .pdf and .md study files are supported.';

const GENERIC_ANALYZE_FAILURE_MESSAGE =
  'Unable to analyze the study file. Check your connection and try again.';

const GENERIC_DEFAULT_FAILURE_MESSAGE =
  'Unable to load the preloaded study. Check your connection and refresh.';

export interface UseStudySetupOptions {
  /**
   * When false the hook stays idle (no `/api/studies/default` fetch) until
   * enabled. App only enables study loading once a Study Leader holds a live
   * session, so Participants and visitors never request study payloads.
   */
  enabled?: boolean;
}

export interface UseStudySetupResult {
  /** Latest successfully analyzed `StudyDocument` (default or uploaded). */
  study: StudyDocument | null;
  status: StudySetupStatus;
  /** Actionable messages rendered in the `role="alert"` region. */
  errorMessages: string[];
  /** `File.size` of the last uploaded study (null for the preloaded default). */
  uploadedFileSize: number | null;
  analyzeFile: (file: File) => Promise<void>;
  resetError: () => void;
}

function isSupportedStudyFileName(fileName: string): boolean {
  const lower = fileName.trim().toLowerCase();
  return lower.endsWith('.pdf') || lower.endsWith('.md');
}

async function readJsonPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function extractErrorMessages(payload: unknown, fallback: string): string[] {
  if (payload !== null && typeof payload === 'object' && !Array.isArray(payload)) {
    const record = payload as { error?: unknown; errors?: unknown };
    if (Array.isArray(record.errors)) {
      const messages = record.errors
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
      if (messages.length > 0) {
        return messages;
      }
    }
    if (typeof record.error === 'string' && record.error.trim().length > 0) {
      return [record.error.trim()];
    }
  }
  return [fallback];
}

/**
 * Study setup state machine for the Load Your Study screen.
 *
 * - On mount (when `enabled`) it fetches `GET /api/studies/default`.
 * - `analyzeFile` rejects unsupported extensions client-side without any
 *   network request, posts `multipart/form-data` (`file` field) to
 *   `POST /api/studies/parse`, and replaces `study` only on HTTP 200 so the
 *   previous preview stays intact when analysis fails.
 * - Uploaded file bytes are never retained beyond the in-flight request.
 */
export function useStudySetup(
  options: UseStudySetupOptions = {},
): UseStudySetupResult {
  const enabled = options.enabled ?? true;

  const [study, setStudy] = useState<StudyDocument | null>(null);
  const [status, setStatus] = useState<StudySetupStatus>('loading');
  const [errorMessages, setErrorMessages] = useState<string[]>([]);
  const [uploadedFileSize, setUploadedFileSize] = useState<number | null>(null);

  const studyRef = useRef<StudyDocument | null>(null);
  studyRef.current = study;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let isCancelled = false;
    setStatus('loading');
    setErrorMessages([]);

    async function loadDefaultStudy() {
      try {
        const response = await fetch(resolveApiUrl('/api/studies/default'), {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        const payload = await readJsonPayload(response);
        if (isCancelled) {
          return;
        }

        if (response.ok) {
          const result = validateStudyDocument(payload);
          if (result.valid) {
            setStudy(result.value);
            setStatus('ready');
            setErrorMessages([]);
            return;
          }
          setErrorMessages(result.errors);
          setStatus('error');
          return;
        }

        setErrorMessages(
          extractErrorMessages(payload, GENERIC_DEFAULT_FAILURE_MESSAGE),
        );
        setStatus('error');
      } catch {
        if (isCancelled) {
          return;
        }
        setErrorMessages([GENERIC_DEFAULT_FAILURE_MESSAGE]);
        setStatus('error');
      }
    }

    void loadDefaultStudy();

    return () => {
      isCancelled = true;
    };
  }, [enabled]);

  const analyzeFile = useCallback(async (file: File) => {
    if (!isSupportedStudyFileName(file.name)) {
      setErrorMessages([UNSUPPORTED_STUDY_FILE_MESSAGE]);
      setStatus(studyRef.current ? 'ready' : 'error');
      return;
    }

    setStatus('uploading');
    setErrorMessages([]);

    try {
      const formData = new FormData();
      formData.append('file', file, file.name);

      const response = await fetch(resolveApiUrl('/api/studies/parse'), {
        method: 'POST',
        body: formData,
      });
      const payload = await readJsonPayload(response);

      if (response.ok) {
        const result = validateStudyDocument(payload);
        if (result.valid) {
          setStudy(result.value);
          setUploadedFileSize(file.size);
          setStatus('ready');
          setErrorMessages([]);
          return;
        }
        setErrorMessages(result.errors);
        setStatus(studyRef.current ? 'ready' : 'error');
        return;
      }

      setErrorMessages(extractErrorMessages(payload, GENERIC_ANALYZE_FAILURE_MESSAGE));
      setStatus(studyRef.current ? 'ready' : 'error');
    } catch {
      setErrorMessages([GENERIC_ANALYZE_FAILURE_MESSAGE]);
      setStatus(studyRef.current ? 'ready' : 'error');
    }
  }, []);

  const resetError = useCallback(() => {
    setErrorMessages([]);
  }, []);

  return {
    study,
    status,
    errorMessages,
    uploadedFileSize,
    analyzeFile,
    resetError,
  };
}

// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/client/App';
import { LeaderStudySetupScreen } from '../../src/client/components/setup/LeaderStudySetupScreen';
import type {
  LeaderCommandInput,
  SessionSocketClient,
  StoredSessionCredentials,
} from '../../src/client/lib/sessionSocket';
import { useStudySetup } from '../../src/client/lib/useStudySetup';
import { getDefaultStudyDocument } from '../../src/server/studies/greatIsYourFaithSeed';
import type {
  PublicLiveSessionSnapshot,
  ServerWsMessage,
} from '../../src/shared/session';
import type { StudyDocument } from '../../src/shared/study';

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

function createSession(
  status: PublicLiveSessionSnapshot['status'],
  overrides: Partial<PublicLiveSessionSnapshot> = {},
): PublicLiveSessionSnapshot {
  return {
    sessionCode: 'TEST99',
    status,
    currentSectionIndex: null,
    currentSectionId: null,
    createdAt: new Date().toISOString(),
    startedAt: null,
    endedAt: null,
    connectedMemberCount: 1,
    connectedParticipantCount: 0,
    members: [],
    ...overrides,
  };
}

const LEADER_CREDENTIALS: StoredSessionCredentials = {
  sessionCode: 'TEST99',
  memberId: 'member-1',
  role: 'Study Leader',
  reconnectToken: 'reconnect-token-1',
  leaderToken: 'leader-token-abc',
};

function createStubSessionClient(options: {
  session: PublicLiveSessionSnapshot;
  lobbySession: PublicLiveSessionSnapshot;
}): { client: SessionSocketClient; sentCommands: LeaderCommandInput[] } {
  const sentCommands: LeaderCommandInput[] = [];

  const client: SessionSocketClient = {
    getWsUrl: () => 'ws://127.0.0.1/test/ws',
    connect: async () => {},
    disconnect: () => {},
    isConnected: () => true,
    getCredentials: () => ({ ...LEADER_CREDENTIALS }),
    getLatestSession: () => options.session,
    subscribe: () => () => {},
    ping: async () => ({
      type: 'pong',
      timestamp: new Date().toISOString(),
    }),
    createSession: async () => {
      throw new Error('createSession is not used in this test.');
    },
    joinSession: async () => {
      throw new Error('joinSession is not used in this test.');
    },
    claimLeader: async () => {
      throw new Error('claimLeader is not used in this test.');
    },
    reconnectSession: async () => {
      throw new Error('reconnectSession is not used in this test.');
    },
    sendLeaderCommand: async (input) => {
      sentCommands.push(input);
      return {
        type: 'session_updated',
        command: 'open_lobby',
        sessionCode: LEADER_CREDENTIALS.sessionCode,
        session: options.lobbySession,
      };
    },
  };

  return { client, sentCommands };
}

interface RecordedCall {
  url: string;
  init?: RequestInit;
}

function installFetchRouter(routes: {
  onHealth?: () => Promise<Response>;
  onDefault?: () => Promise<Response>;
  onParse?: (init?: RequestInit) => Promise<Response>;
}): RecordedCall[] {
  const calls: RecordedCall[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url === '/api/health' && routes.onHealth) {
        return await routes.onHealth();
      }
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

function okHealth() {
  return jsonResponse({
    status: 'ok',
    uptimeSeconds: 5,
    activeSessionCount: 0,
    wsReady: true,
    timestamp: new Date().toISOString(),
  });
}

function StudySetupHarness({
  onContinue,
  onBack,
}: {
  onContinue: () => void;
  onBack: () => void;
}) {
  const setup = useStudySetup();
  return (
    <LeaderStudySetupScreen
      study={setup.study}
      status={setup.status}
      errorMessages={setup.errorMessages}
      uploadedFileSize={setup.uploadedFileSize}
      onFileSelected={(file) => {
        void setup.analyzeFile(file);
      }}
      onContinue={onContinue}
      onBack={onBack}
    />
  );
}

beforeEach(() => {
  sessionStorage.clear();
});

describe('LeaderStudySetupScreen — preview surface', () => {
  it('Scenario 1: previews the default study with 5-section structure and Gospel-only Section 3', async () => {
    installFetchRouter({
      onDefault: async () => jsonResponse(getDefaultStudyDocument()),
    });

    render(<StudySetupHarness onContinue={vi.fn()} onBack={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByTestId('study-preview-card')).toBeInTheDocument(),
    );

    const previewCard = screen.getByTestId('study-preview-card');
    expect(previewCard).toHaveTextContent('Great Is Your Faith.pdf');
    expect(screen.getByTestId('study-analyzed-pill')).toHaveTextContent(
      '✓ Analyzed',
    );
    expect(screen.getByTestId('study-detection-summary')).toHaveTextContent(
      '5 sections detected',
    );
    expect(previewCard).toHaveTextContent('5 sections detected');

    const list = screen.getByTestId('study-structure-list');
    expect(list).toHaveTextContent('Opening Prayer');
    expect(list).toHaveTextContent('Icebreaker');
    expect(list).toHaveTextContent('Gospel Reading');
    expect(list).toHaveTextContent('Deep Analysis & Discussion');
    expect(list).toHaveTextContent('Closing Prayer');

    for (const rowNumber of [1, 2, 3, 4, 5]) {
      expect(
        screen.getByTestId(`study-structure-row-${rowNumber}`),
      ).toBeInTheDocument();
    }

    const gospelRow = screen.getByTestId('study-structure-row-3');
    expect(gospelRow).toHaveTextContent('Matthew 15:21–28');
    expect(screen.getByTestId('study-structure-gospel-citation')).toHaveTextContent(
      'Matthew 15:21–28',
    );

    // Gospel-only Section 3: no Old Testament / Psalm / Epistle content anywhere in the preview.
    const previewText = screen.getByTestId('study-preview').textContent ?? '';
    for (const forbidden of [
      'Isaiah',
      'Psalm',
      'Romans',
      'First Reading',
      'Second Reading',
      'Responsorial Psalm',
    ]) {
      expect(previewText).not.toContain(forbidden);
    }

    expect(document.body.textContent).not.toContain('Assistant');
    expect(
      screen.getByTestId('study-setup-continue'),
    ).toBeEnabled();
  });

  it('Scenario 2: a valid custom upload updates the preview live and keeps Continue enabled', async () => {
    const calls = installFetchRouter({
      onDefault: async () => jsonResponse(getDefaultStudyDocument()),
      onParse: async () => jsonResponse(createPeaceStudy()),
    });

    render(<StudySetupHarness onContinue={vi.fn()} onBack={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByTestId('study-preview-card')).toBeInTheDocument(),
    );

    const input = screen.getByTestId('study-file-input') as HTMLInputElement;
    fireEvent.change(input, {
      target: {
        files: [new File(['# Peace'], 'peace-be-still-mark-4.md')],
      },
    });

    await waitFor(() =>
      expect(screen.getByTestId('study-preview-card')).toHaveTextContent(
        'Peace! Be Still',
      ),
    );
    expect(screen.getByTestId('study-analyzed-pill')).toHaveTextContent(
      '✓ Analyzed',
    );
    expect(screen.getByTestId('study-detection-summary')).toHaveTextContent(
      '5 sections detected',
    );
    expect(screen.getByTestId('study-structure-row-3')).toHaveTextContent(
      'Mark 4:35–41',
    );
    expect(screen.getByTestId('study-file-size')).toBeInTheDocument();
    expect(screen.getByTestId('study-setup-continue')).toBeEnabled();

    const parseCall = calls.find((call) => call.url === '/api/studies/parse');
    expect(parseCall).toBeDefined();
    expect(parseCall?.init?.method).toBe('POST');
    expect(parseCall?.init?.body).toBeInstanceOf(FormData);
  });

  it('Scenario 3: an invalid upload keeps the previous preview and surfaces actionable errors', async () => {
    installFetchRouter({
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

    render(<StudySetupHarness onContinue={vi.fn()} onBack={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByTestId('study-preview-card')).toBeInTheDocument(),
    );

    const input = screen.getByTestId('study-file-input') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(['broken'], 'malformed-study.md')] },
    });

    await waitFor(() =>
      expect(screen.getByTestId('study-setup-alert')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('study-setup-alert')).toHaveTextContent(
      'Missing Section 4 (Opening Prayer).',
    );
    expect(screen.getByRole('alert')).toBe(screen.getByTestId('study-setup-alert'));
    expect(screen.getByTestId('study-preview-card')).toHaveTextContent(
      'Great Is Your Faith.pdf',
    );
    expect(screen.getByTestId('study-setup-continue')).toBeEnabled();
  });

  it('Scenario 4: unsupported file types are rejected before upload without a network request', async () => {
    const calls = installFetchRouter({
      onDefault: async () => jsonResponse(getDefaultStudyDocument()),
    });

    render(<StudySetupHarness onContinue={vi.fn()} onBack={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByTestId('study-preview-card')).toBeInTheDocument(),
    );

    const input = screen.getByTestId('study-file-input') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'notes.txt')] },
    });

    await waitFor(() =>
      expect(screen.getByTestId('study-setup-alert')).toHaveTextContent(
        'Unsupported file type: only .pdf and .md study files are supported.',
      ),
    );
    expect(calls.filter((call) => call.url === '/api/studies/parse')).toHaveLength(
      0,
    );
    expect(screen.getByTestId('study-preview-card')).toHaveTextContent(
      'Great Is Your Faith.pdf',
    );
  });
});

describe('LeaderStudySetupScreen — CTA and a11y regions', () => {
  it('keeps Continue disabled until the study status is ready', () => {
    const onContinue = vi.fn();
    const shared = {
      onFileSelected: () => {},
      onContinue,
      onBack: () => {},
    };

    const { rerender } = render(
      <LeaderStudySetupScreen
        study={null}
        status="loading"
        errorMessages={[]}
        {...shared}
      />,
    );
    expect(screen.getByTestId('study-setup-continue')).toBeDisabled();

    rerender(
      <LeaderStudySetupScreen
        study={null}
        status="uploading"
        errorMessages={[]}
        {...shared}
      />,
    );
    expect(screen.getByTestId('study-setup-continue')).toBeDisabled();

    rerender(
      <LeaderStudySetupScreen
        study={getDefaultStudyDocument()}
        status="ready"
        errorMessages={[]}
        {...shared}
      />,
    );
    const cta = screen.getByTestId('study-setup-continue');
    expect(cta).toBeEnabled();
    fireEvent.click(cta);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('renders the inline alert region and polite analysis status', () => {
    render(
      <LeaderStudySetupScreen
        study={null}
        status="error"
        errorMessages={['Study validation failed.']}
        actionErrorMessage="Failed to open the title lobby"
        onFileSelected={() => {}}
        onContinue={() => {}}
        onBack={() => {}}
      />,
    );

    const alert = screen.getByTestId('study-setup-alert');
    expect(alert).toHaveAttribute('role', 'alert');
    expect(alert).toHaveTextContent('Study validation failed.');
    expect(alert).toHaveTextContent('Failed to open the title lobby');

    const status = screen.getByTestId('study-setup-status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('Study analysis needs your attention.');
    expect(document.body.textContent).not.toContain('Assistant');
  });

  it('keeps >= 16px control font-size and >= 44px tap targets in global.css', () => {
    // Vitest runs from the repository root; jsdom's import.meta.url is not a
    // file: URL, so resolve the stylesheet from the working directory instead.
    const cssPath = resolve(process.cwd(), 'src/client/styles/global.css');
    const css = readFileSync(cssPath, 'utf-8');

    // >= 16px baseline for inputs (hidden study file input inherits it).
    expect(css).toMatch(/font-size: max\(16px, 1rem\)/);
    // 56px gold Continue pill, >= 44px back control and resume action.
    expect(css).toMatch(/\.study-setup-cta\s*\{[^}]*min-height: 56px/);
    expect(css).toMatch(/\.study-setup-back-button\s*\{[^}]*min-height: 44px/);
    expect(css).toMatch(/\.study-setup-resume\s*\{[^}]*min-height: 44px/);
    // Large gold-glow dropzone tap area.
    expect(css).toMatch(/\.study-upload-dropzone\s*\{[^}]*min-height: 176px/);
  });
});

describe('App — Study Leader setup routing', () => {
  it('Scenario 5: Continue dispatches load_study + open_lobby with the stored leaderToken and renders the Title Lobby', async () => {
    const { client, sentCommands } = createStubSessionClient({
      session: createSession('setup'),
      lobbySession: createSession('lobby', { connectedMemberCount: 3 }),
    });
    installFetchRouter({
      onHealth: async () => okHealth(),
      onDefault: async () => jsonResponse(getDefaultStudyDocument()),
    });

    render(<App sessionClient={client} />);

    await waitFor(() =>
      expect(screen.getByTestId('study-preview-card')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('active-session-banner')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('study-setup-continue'));

    await waitFor(() => expect(sentCommands).toHaveLength(2));
    expect(sentCommands[0]).toMatchObject({
      type: 'load_study',
      sessionCode: 'TEST99',
      leaderToken: 'leader-token-abc',
      memberId: 'member-1',
    });
    expect(sentCommands[1]).toMatchObject({
      type: 'open_lobby',
      sessionCode: 'TEST99',
      leaderToken: 'leader-token-abc',
      memberId: 'member-1',
    });

    await waitFor(() =>
      expect(screen.getByTestId('title-lobby')).toBeInTheDocument(),
    );
    const lobby = screen.getByTestId('title-lobby');
    expect(lobby).toHaveTextContent('Great Is Your Faith');
    expect(lobby).toHaveTextContent('Matthew 15:21–28');
    expect(lobby).toHaveTextContent('YA BIBLE STUDY · LIVE SESSION');
    expect(screen.getByTestId('active-session-banner')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('Assistant');
  });

  it('Scenario 6: the back control collapses the setup panel and the resume action restores it', async () => {
    const { client } = createStubSessionClient({
      session: createSession('setup'),
      lobbySession: createSession('lobby'),
    });
    installFetchRouter({
      onHealth: async () => okHealth(),
      onDefault: async () => jsonResponse(getDefaultStudyDocument()),
    });

    render(<App sessionClient={client} />);

    await waitFor(() =>
      expect(screen.getByTestId('study-setup-screen')).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByTestId('study-setup-back'));
    expect(screen.queryByTestId('study-setup-screen')).not.toBeInTheDocument();
    // The room stays live — the banner session view remains mounted without reload.
    expect(screen.getByTestId('active-session-banner')).toBeInTheDocument();

    const resume = screen.getByTestId('study-setup-resume');
    expect(resume).toHaveTextContent('Set up your study');
    fireEvent.click(resume);

    await waitFor(() =>
      expect(screen.getByTestId('study-setup-screen')).toBeInTheDocument(),
    );
  });
});

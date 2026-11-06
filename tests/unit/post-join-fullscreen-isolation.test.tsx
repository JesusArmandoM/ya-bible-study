// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@react-three/fiber', () => ({
  Canvas: ({
    dpr,
    frameloop,
  }: {
    dpr?: [number, number];
    frameloop?: string;
    children?: ReactNode;
  }) => (
    <canvas
      data-testid="mock-r3f-canvas"
      data-dpr={Array.isArray(dpr) ? dpr.join(',') : ''}
      data-frameloop={frameloop ?? 'always'}
    />
  ),
  useFrame: vi.fn(),
  useThree: vi.fn(),
}));

import { App } from '../../src/client/App';
import { DualDeviceFrame } from '../../src/client/components/dual/DualDeviceFrame';
import { setWebGLSupportProbeForTests } from '../../src/client/components/stage/webglSupport';
import {
  clearStoredSessionCredentials,
  SessionSocketError,
  type SessionSocketClient,
  type StoredSessionCredentials,
} from '../../src/client/lib/sessionSocket';
import {
  createSacredStageStore,
  defaultSacredStageStore,
  useSacredStageStore,
} from '../../src/client/state/sacredStageStore';
import { getDefaultStudyDocument } from '../../src/server/studies/greatIsYourFaithSeed';
import {
  toSessionStudySummary,
  type PublicLiveSessionSnapshot,
  type ServerWsMessage,
} from '../../src/shared/session';

const DEFAULT_STUDY = getDefaultStudyDocument();
const SUMMARY = toSessionStudySummary(DEFAULT_STUDY);

function createSessionSnapshot(
  status: PublicLiveSessionSnapshot['status'],
  overrides: Partial<PublicLiveSessionSnapshot> = {},
): PublicLiveSessionSnapshot {
  return {
    sessionCode: 'TEST99',
    status,
    currentSectionIndex: status === 'in_progress' ? 0 : null,
    currentSectionId: status === 'in_progress' ? 'section_1_prayer' : null,
    createdAt: '2026-11-06T19:00:00.000Z',
    startedAt: status === 'in_progress' ? '2026-11-06T19:05:00.000Z' : null,
    endedAt: null,
    connectedMemberCount: 2,
    connectedParticipantCount: 1,
    members: [
      {
        memberId: 'leader-1',
        displayName: 'Claire',
        initials: 'CL',
        avatarPalette: 'gold',
        role: 'Study Leader',
        connectionStatus: 'connected',
        joinedAt: '2026-11-06T19:00:00.000Z',
      },
      {
        memberId: 'participant-1',
        displayName: 'Daniel',
        initials: 'DA',
        avatarPalette: 'indigo',
        role: 'Participant',
        connectionStatus: 'connected',
        joinedAt: '2026-11-06T19:01:00.000Z',
      },
    ],
    study: SUMMARY,
    volunteerTurn:
      status === 'in_progress'
        ? {
            sectionId: 'section_1_prayer',
            mode: 'gated_prayer',
            raisedHands: [],
            candidateMemberId: null,
            candidateExpiresAt: null,
            selectedMemberId: null,
            completedAt: null,
          }
        : null,
    protocolVersion: 3,
    ...overrides,
  };
}

interface ControllableClient {
  client: SessionSocketClient;
  emit: (message: ServerWsMessage) => void;
  setCredentials: (creds: StoredSessionCredentials | null) => void;
  setLatestSession: (session: PublicLiveSessionSnapshot | null) => void;
  setReconnectHandler: (
    handler: () => Promise<Extract<ServerWsMessage, { type: 'session_reconnected' }>>,
  ) => void;
}

function createControllableSessionClient(initial?: {
  session?: PublicLiveSessionSnapshot | null;
  credentials?: StoredSessionCredentials | null;
}): ControllableClient {
  const listeners = new Set<(message: ServerWsMessage) => void>();
  let currentSession: PublicLiveSessionSnapshot | null =
    initial?.session ?? null;
  let currentCredentials: StoredSessionCredentials | null =
    initial?.credentials ?? null;
  let reconnectHandler: (() => Promise<
    Extract<ServerWsMessage, { type: 'session_reconnected' }>
  >) | null = null;

  const emit = (message: ServerWsMessage) => {
    if (
      message.type === 'session_created' ||
      message.type === 'session_joined' ||
      message.type === 'leader_claimed' ||
      message.type === 'session_reconnected' ||
      message.type === 'session_updated' ||
      message.type === 'roster_updated'
    ) {
      currentSession = message.session;
    } else if (message.type === 'session_closed') {
      currentSession = null;
      currentCredentials = null;
    }
    for (const listener of listeners) {
      listener(message);
    }
  };

  const client: SessionSocketClient = {
    getWsUrl: () => 'ws://127.0.0.1/ws',
    connect: async () => {},
    disconnect: () => {
      currentSession = null;
      currentCredentials = null;
    },
    isConnected: () => true,
    getCredentials: () => (currentCredentials ? { ...currentCredentials } : null),
    getLatestSession: () => currentSession,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    ping: async () => ({ type: 'pong', timestamp: new Date().toISOString() }),
    createSession: async ({ displayName }) => {
      currentCredentials = {
        sessionCode: 'TEST99',
        memberId: 'leader-1',
        role: 'Study Leader',
        reconnectToken: 'reconnect-leader',
        leaderToken: 'leader-secret',
      };
      const session = createSessionSnapshot('setup', {
        connectedMemberCount: 1,
        connectedParticipantCount: 0,
        study: null,
      });
      const reply: Extract<ServerWsMessage, { type: 'session_created' }> = {
        type: 'session_created',
        sessionCode: 'TEST99',
        memberId: 'leader-1',
        role: 'Study Leader',
        leaderPin: '4821',
        leaderToken: 'leader-secret',
        reconnectToken: 'reconnect-leader',
        session,
      };
      emit(reply);
      return reply;
    },
    joinSession: async ({ sessionCode, displayName }) => {
      currentCredentials = {
        sessionCode,
        memberId: 'participant-1',
        role: 'Participant',
        reconnectToken: 'reconnect-participant',
      };
      const session =
        currentSession ??
        createSessionSnapshot('lobby', {
          sessionCode,
          connectedMemberCount: 2,
          connectedParticipantCount: 1,
        });
      const reply: Extract<ServerWsMessage, { type: 'session_joined' }> = {
        type: 'session_joined',
        sessionCode,
        memberId: 'participant-1',
        role: 'Participant',
        displayName,
        avatarPalette: 'indigo',
        reconnectToken: 'reconnect-participant',
        member: {
          memberId: 'participant-1',
          displayName,
          initials: 'DA',
          avatarPalette: 'indigo',
          role: 'Participant',
          connectionStatus: 'connected',
          joinedAt: '2026-11-06T19:01:00.000Z',
        },
        session,
      };
      emit(reply);
      return reply;
    },
    claimLeader: async () => {
      throw new Error('claimLeader not used in test');
    },
    reconnectSession: async () => {
      if (reconnectHandler) {
        return await reconnectHandler();
      }
      throw new Error('reconnectSession not configured in test');
    },
    sendLeaderCommand: async (input) => {
      if (input.type === 'load_study') {
        const next = createSessionSnapshot(currentSession?.status ?? 'setup', {
          study: input.study ?? SUMMARY,
        });
        const reply: Extract<ServerWsMessage, { type: 'session_updated' }> = {
          type: 'session_updated',
          command: 'load_study',
          sessionCode: 'TEST99',
          session: next,
        };
        emit(reply);
        return reply;
      }
      if (input.type === 'open_lobby') {
        const next = createSessionSnapshot('lobby', { study: SUMMARY });
        const reply: Extract<ServerWsMessage, { type: 'session_updated' }> = {
          type: 'session_updated',
          command: 'open_lobby',
          sessionCode: 'TEST99',
          session: next,
        };
        emit(reply);
        return reply;
      }
      if (input.type === 'start_study') {
        const next = createSessionSnapshot('in_progress', { study: SUMMARY });
        const reply: Extract<ServerWsMessage, { type: 'session_updated' }> = {
          type: 'session_updated',
          command: 'start_study',
          sessionCode: 'TEST99',
          session: next,
        };
        emit(reply);
        return reply;
      }
      throw new Error(`Unhandled command: ${input.type}`);
    },
    sendTurnCommand: async () => {
      throw new Error('sendTurnCommand not used in test');
    },
  };

  return {
    client,
    emit,
    setCredentials: (creds) => {
      currentCredentials = creds;
    },
    setLatestSession: (session) => {
      currentSession = session;
    },
    setReconnectHandler: (handler) => {
      reconnectHandler = handler;
    },
  };
}

function installDefaultFetchMocks(): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith('/api/health')) {
      return new Response(
        JSON.stringify({
          status: 'ok',
          uptimeSeconds: 10,
          activeSessionCount: 1,
          wsReady: true,
          publicUrl: null,
          timestamp: '2026-11-06T19:00:00.000Z',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (url.endsWith('/api/studies/default')) {
      return new Response(JSON.stringify(DEFAULT_STUDY), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  });
}

function expectZeroWelcomeChrome(): void {
  expect(document.querySelectorAll('.sanctuary-hero')).toHaveLength(0);
  expect(document.querySelectorAll('.sanctuary-stage-card')).toHaveLength(0);
  expect(document.querySelectorAll('.sanctuary-stage-header')).toHaveLength(0);
  expect(document.querySelectorAll('.sacred-stage-pill-grid')).toHaveLength(0);
  expect(document.querySelectorAll('[data-stage-pill]')).toHaveLength(0);
  expect(document.querySelectorAll('.sanctuary-stage-copy')).toHaveLength(0);
  expect(document.querySelectorAll('.sanctuary-footer')).toHaveLength(0);
  expect(screen.queryByTestId('sanctuary-health-pill')).not.toBeInTheDocument();
}

describe('Post-Join Exclusive Full-Screen Isolation & Participant Waiting View', () => {
  beforeEach(() => {
    clearStoredSessionCredentials();
    sessionStorage.clear();
    setWebGLSupportProbeForTests(() => true);
    defaultSacredStageStore.getState().reset();
    window.history.replaceState({}, '', '/');
    installDefaultFetchMocks();
  });

  afterEach(() => {
    setWebGLSupportProbeForTests(null);
    window.history.replaceState({}, '', '/');
    vi.restoreAllMocks();
  });

  it('Scenarios 1, 3 & 4: unmounts Welcome chrome across setup/lobby/in_progress, keeps the exact same <canvas> instance, syncs stages, and restores Welcome on Leave', async () => {
    const harness = createControllableSessionClient();

    render(<App sessionClient={harness.client} />);

    // Pre-join Welcome state: hero, 6 stage pills, and health footer are mounted.
    expect(document.querySelectorAll('.sanctuary-hero')).toHaveLength(1);
    expect(document.querySelectorAll('.sanctuary-stage-card')).toHaveLength(1);
    expect(document.querySelectorAll('[data-stage-pill]')).toHaveLength(6);
    await waitFor(() =>
      expect(screen.getByTestId('sanctuary-health-pill')).toHaveAttribute(
        'data-status',
        'ok',
      ),
    );

    const initialCanvas = document.querySelector('canvas');
    expect(initialCanvas).not.toBeNull();
    expect(document.querySelectorAll('canvas')).toHaveLength(1);

    // Switch stage on Welcome to star-of-faith before creating a session.
    fireEvent.click(screen.getByTestId('stage-pill-star-of-faith'));
    expect(screen.getByTestId('sacred-3d-scene')).toHaveAttribute(
      'data-stage',
      'star-of-faith',
    );
    expect(document.querySelector('canvas')).toBe(initialCanvas);

    // Study Leader creates a room -> enters setup.
    fireEvent.click(screen.getByTestId('welcome-role-leader'));
    fireEvent.change(screen.getByLabelText(/Leader Name/i), {
      target: { value: 'Claire' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Room' }));

    await waitFor(() =>
      expect(screen.getByTestId('study-setup-screen')).toBeInTheDocument(),
    );

    // Scenario 1: Welcome chrome is completely unmounted in setup.
    expectZeroWelcomeChrome();
    expect(document.querySelector('main')).toHaveClass(
      'sanctuary-column--fullscreen',
    );
    expect(screen.getByTestId('post-join-stage-shell')).toHaveAttribute(
      'data-stage-layout',
      'setup',
    );

    // Compact session bar preserves all leader hooks and omits verbose PIN hint.
    const banner = screen.getByTestId('active-session-banner');
    expect(banner).toHaveAttribute('data-compact', 'true');
    expect(screen.getByTestId('active-user-role')).toHaveTextContent(
      'Study Leader',
    );
    expect(screen.getByTestId('active-session-code')).toHaveTextContent(
      'TEST99',
    );
    expect(screen.getByTestId('active-leader-pin')).toHaveTextContent('4821');
    expect(screen.getByTestId('active-connected-count')).toHaveTextContent(
      '1 member connected',
    );
    const leaveBtn = screen.getByTestId('active-session-leave-btn');
    expect(leaveBtn).toHaveAttribute('aria-label', 'Leave Session');
    expect(leaveBtn).toHaveTextContent('Leave');
    expect(screen.getByTestId('session-resilience-chip')).toBeInTheDocument();

    // Scenario 4: Entering LeaderStudySetupScreen resets stage to sanctuary-emblem without remounting <canvas>.
    expect(screen.getByTestId('sacred-3d-scene')).toHaveAttribute(
      'data-stage',
      'sanctuary-emblem',
    );
    expect(document.querySelectorAll('canvas')).toHaveLength(1);
    expect(document.querySelector('canvas')).toBe(initialCanvas);

    // Wait for default study analysis, then Continue -> lobby (Scenario 3).
    await waitFor(() =>
      expect(screen.getByTestId('study-setup-continue')).toBeEnabled(),
    );
    fireEvent.click(screen.getByTestId('study-setup-continue'));

    await waitFor(() =>
      expect(screen.getByTestId('title-lobby')).toBeInTheDocument(),
    );

    expectZeroWelcomeChrome();
    expect(screen.getByTestId('post-join-stage-shell')).toHaveAttribute(
      'data-stage-layout',
      'lobby',
    );
    expect(screen.getByTestId('title-lobby')).toHaveAttribute(
      'data-mode',
      'leader',
    );
    expect(screen.getByTestId('title-lobby-title')).toHaveTextContent(
      'Great Is Your Faith',
    );
    expect(screen.getByTestId('title-lobby-attendee-count')).toHaveTextContent(
      '1',
    );
    expect(screen.getByTestId('lobby-share-trigger')).toBeInTheDocument();
    expect(screen.getByTestId('lobby-start-study')).toBeInTheDocument();
    expect(screen.getByTestId('sacred-3d-scene')).toHaveAttribute(
      'data-stage',
      'sanctuary-emblem',
    );
    expect(document.querySelectorAll('canvas')).toHaveLength(1);
    expect(document.querySelector('canvas')).toBe(initialCanvas);

    // Advance into Section 1 (in_progress).
    fireEvent.click(screen.getByTestId('lobby-start-study'));
    await waitFor(() =>
      expect(screen.getByTestId('section-one-handoff')).toBeInTheDocument(),
    );

    expectZeroWelcomeChrome();
    expect(screen.getByTestId('post-join-stage-shell')).toHaveAttribute(
      'data-stage-layout',
      'section',
    );
    expect(screen.getByTestId('sacred-3d-scene')).toHaveAttribute(
      'data-stage',
      'prayer-orb',
    );
    expect(document.querySelectorAll('canvas')).toHaveLength(1);
    expect(document.querySelector('canvas')).toBe(initialCanvas);

    // Leave session -> Welcome chrome cleanly remounts, stage resets to sanctuary-emblem, same <canvas> survives!
    fireEvent.click(screen.getByTestId('active-session-leave-btn'));

    await waitFor(() =>
      expect(screen.getByTestId('welcome-role-leader')).toBeInTheDocument(),
    );
    expect(document.querySelectorAll('.sanctuary-hero')).toHaveLength(1);
    expect(document.querySelectorAll('.sanctuary-stage-card')).toHaveLength(1);
    expect(document.querySelectorAll('[data-stage-pill]')).toHaveLength(6);
    expect(screen.getByTestId('sanctuary-health-pill')).toBeInTheDocument();
    expect(useSacredStageStore.getState().stage).toBe('sanctuary-emblem');
    expect(useSacredStageStore.getState().accentMode).toBe('default');
    expect(screen.getByTestId('sacred-3d-scene')).toHaveAttribute(
      'data-stage',
      'sanctuary-emblem',
    );
    expect(document.querySelectorAll('canvas')).toHaveLength(1);
    expect(document.querySelector('canvas')).toBe(initialCanvas);
    expect(document.body.textContent).not.toContain('Assistant');
  });

  it('Scenario 2: Participant joining during early setup OR lobby sees ONLY ParticipantWaitingScreen with zero lobby metrics or controls', async () => {
    window.history.replaceState({}, '', '/join/TEST99');
    const harness = createControllableSessionClient();

    render(<App sessionClient={harness.client} />);

    // Auto-opened join sheet on Welcome before joining.
    const initialCanvas = document.querySelector('canvas');
    expect(initialCanvas).not.toBeNull();
    fireEvent.click(screen.getByTestId('stage-pill-gospel-codex'));
    expect(screen.getByTestId('sacred-3d-scene')).toHaveAttribute(
      'data-stage',
      'gospel-codex',
    );

    // Reset session on harness to null until joinSession resolves, with joinSession returning setup snapshot.
    const setupSnapshot = createSessionSnapshot('setup', {
      study: null,
      connectedMemberCount: 2,
      connectedParticipantCount: 1,
    });
    harness.setLatestSession(setupSnapshot);

    fireEvent.change(screen.getByLabelText(/Your Name/i), {
      target: { value: 'Daniel' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Join Study' }));

    await waitFor(() =>
      expect(
        screen.getByTestId('participant-waiting-screen'),
      ).toBeInTheDocument(),
    );

    // /join/TEST99 cleaned up on join
    expect(window.location.pathname).toBe('/');

    // Participant in setup sees ONLY waiting screen + compact bar + 3D sanctuary-emblem
    expectZeroWelcomeChrome();
    expect(screen.getByTestId('post-join-stage-shell')).toHaveAttribute(
      'data-stage-layout',
      'waiting',
    );
    expect(screen.getByTestId('sacred-3d-scene')).toHaveAttribute(
      'data-stage',
      'sanctuary-emblem',
    );
    expect(document.querySelector('canvas')).toBe(initialCanvas);
    expect(screen.getByTestId('participant-waiting-message')).toHaveTextContent(
      'The study leader will begin shortly',
    );
    expect(screen.getByTestId('active-user-role')).toHaveTextContent(
      'Participant',
    );
    expect(
      screen.queryByTestId('active-leader-pin-box'),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('active-leader-pin')).not.toBeInTheDocument();
    expect(screen.queryByTestId('title-lobby')).not.toBeInTheDocument();

    // Leader opens lobby with loaded study -> Participant STILL sees only ParticipantWaitingScreen
    act(() => {
      harness.emit({
        type: 'session_updated',
        command: 'open_lobby',
        sessionCode: 'TEST99',
        session: createSessionSnapshot('lobby', {
          study: SUMMARY,
          connectedMemberCount: 3,
          connectedParticipantCount: 2,
        }),
      });
    });

    expectZeroWelcomeChrome();
    expect(screen.getByTestId('participant-waiting-screen')).toBeInTheDocument();
    expect(screen.getByTestId('participant-waiting-message')).toHaveTextContent(
      'The study leader will begin shortly',
    );
    expect(screen.getByTestId('active-connected-count')).toHaveTextContent(
      '3 members connected',
    );
    expect(screen.queryByTestId('title-lobby')).not.toBeInTheDocument();
    expect(screen.queryByTestId('title-lobby-title')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('title-lobby-citation'),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('title-lobby-metrics')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('title-lobby-attendee-count'),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('lobby-share-trigger')).not.toBeInTheDocument();
    expect(screen.queryByTestId('lobby-start-study')).not.toBeInTheDocument();
    expect(document.querySelector('canvas')).toBe(initialCanvas);
    expect(document.body.textContent).not.toContain('Assistant');
  });

  it('Scenario 1 (onSessionGone): cleans up /join/ URL and restores Welcome chrome when foreground resync detects a closed session', async () => {
    const participantCreds: StoredSessionCredentials = {
      sessionCode: 'TEST99',
      memberId: 'participant-1',
      role: 'Participant',
      reconnectToken: 'reconnect-participant',
    };
    const harness = createControllableSessionClient({
      session: createSessionSnapshot('lobby'),
      credentials: participantCreds,
    });
    harness.setReconnectHandler(async () => {
      throw new SessionSocketError('SESSION_NOT_FOUND', 'Session is gone.');
    });

    render(<App sessionClient={harness.client} />);
    expect(screen.getByTestId('participant-waiting-screen')).toBeInTheDocument();
    expectZeroWelcomeChrome();

    // Simulate a /join/ URL still present when onSessionGone fires.
    window.history.replaceState({}, '', '/join/TEST99');

    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() =>
      expect(screen.getByTestId('welcome-role-leader')).toBeInTheDocument(),
    );
    expect(window.location.pathname).toBe('/');
    expect(document.querySelectorAll('.sanctuary-hero')).toHaveLength(1);
    expect(document.querySelectorAll('[data-stage-pill]')).toHaveLength(6);
    expect(screen.getByTestId('sanctuary-health-pill')).toBeInTheDocument();
  });

  it('Scenario 5: Desktop Dual Mode DualDeviceFrame isolates ParticipantWaitingScreen from Study Leader TitleLobbyScreen with <= 2 canvases', () => {
    const leaderStore = createSacredStageStore({ stage: 'prayer-orb' });
    const participantStore = createSacredStageStore({ stage: 'star-of-faith' });

    const leaderHarness = createControllableSessionClient({
      session: createSessionSnapshot('lobby'),
      credentials: {
        sessionCode: 'TEST99',
        memberId: 'leader-1',
        role: 'Study Leader',
        reconnectToken: 'reconnect-leader',
        leaderToken: 'leader-secret',
      },
    });
    const participantHarness = createControllableSessionClient({
      session: createSessionSnapshot('lobby'),
      credentials: {
        sessionCode: 'TEST99',
        memberId: 'participant-1',
        role: 'Participant',
        reconnectToken: 'reconnect-participant',
      },
    });

    render(
      <div>
        <DualDeviceFrame
          role="Study Leader"
          displayName="Study Leader"
          client={leaderHarness.client}
          stageStore={leaderStore}
          testId="leader-frame"
          studyDocument={DEFAULT_STUDY}
        />
        <DualDeviceFrame
          role="Participant"
          displayName="Mary Lopez"
          client={participantHarness.client}
          stageStore={participantStore}
          testId="participant-frame"
          studyDocument={DEFAULT_STUDY}
        />
      </div>,
    );

    const leaderFrame = screen.getByTestId('leader-frame');
    const participantFrame = screen.getByTestId('participant-frame');

    // Left frame: Study Leader sees TitleLobbyScreen, metrics, and Start Study
    expect(within(leaderFrame).getByTestId('title-lobby')).toHaveAttribute(
      'data-mode',
      'leader',
    );
    expect(
      within(leaderFrame).getByTestId('title-lobby-attendee-count'),
    ).toHaveTextContent('1');
    expect(
      within(leaderFrame).getByTestId('lobby-start-study'),
    ).toBeInTheDocument();
    expect(
      within(leaderFrame).queryByTestId('participant-waiting-screen'),
    ).not.toBeInTheDocument();
    expect(
      leaderFrame.querySelector('.dual-frame-stage-wrapper'),
    ).toHaveAttribute('data-stage-layout', 'default');

    // Right frame: Participant sees ONLY ParticipantWaitingScreen with centered stage layout
    expect(
      within(participantFrame).getByTestId('participant-waiting-screen'),
    ).toBeInTheDocument();
    expect(
      within(participantFrame).getByTestId('participant-waiting-message'),
    ).toHaveTextContent('The study leader will begin shortly');
    expect(
      within(participantFrame).queryByTestId('title-lobby'),
    ).not.toBeInTheDocument();
    expect(
      within(participantFrame).queryByTestId('title-lobby-metrics'),
    ).not.toBeInTheDocument();
    expect(
      within(participantFrame).queryByTestId('lobby-start-study'),
    ).not.toBeInTheDocument();
    expect(
      participantFrame.querySelector('.dual-frame-stage-wrapper'),
    ).toHaveAttribute('data-stage-layout', 'waiting');

    // Both scoped stage stores synchronized to sanctuary-emblem, total canvases <= 2
    expect(leaderStore.getState().stage).toBe('sanctuary-emblem');
    expect(participantStore.getState().stage).toBe('sanctuary-emblem');
    expect(document.querySelectorAll('canvas').length).toBeLessThanOrEqual(2);
    expect(document.body.textContent).not.toContain('Assistant');
  });
});

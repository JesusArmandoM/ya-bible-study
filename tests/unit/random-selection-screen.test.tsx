// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpeningPrayerScreen } from '../../src/client/components/prayer/OpeningPrayerScreen';
import {
  RandomPickButton,
  RandomSelectionPanel,
  formatCountdownLabel,
} from '../../src/client/components/random/RandomSelectionPanel';
import { getDefaultStudyDocument } from '../../src/server/studies/greatIsYourFaithSeed';
import type {
  PublicLiveSessionSnapshot,
  SessionStudySummary,
  VolunteerTurnState,
} from '../../src/shared/session';
import { toSessionStudySummary } from '../../src/shared/session';
import { useSacredStageStore } from '../../src/client/state/sacredStageStore';

const SUMMARY: SessionStudySummary = toSessionStudySummary(
  getDefaultStudyDocument(),
);
const ISO_NOW = '2026-10-30T20:00:00.000Z';

function makeTurn(overrides: Partial<VolunteerTurnState> = {}): VolunteerTurnState {
  return {
    sectionId: 'section_1_prayer',
    mode: 'gated_prayer',
    raisedHands: [],
    candidateMemberId: null,
    candidateExpiresAt: null,
    selectedMemberId: null,
    completedAt: null,
    ...overrides,
  };
}

function makeSession(
  turnOverrides: Partial<VolunteerTurnState> = {},
  options: { connectedParticipantCount?: number } = {},
): PublicLiveSessionSnapshot {
  return {
    sessionCode: 'ABC123',
    status: 'in_progress',
    currentSectionIndex: 0,
    currentSectionId: 'section_1_prayer',
    createdAt: ISO_NOW,
    startedAt: ISO_NOW,
    endedAt: null,
    connectedMemberCount: 3,
    connectedParticipantCount:
      options.connectedParticipantCount === undefined
        ? 2
        : options.connectedParticipantCount,
    members: [
      {
        memberId: 'leader-1',
        displayName: 'Claire',
        initials: 'CL',
        avatarPalette: 'gold',
        role: 'Study Leader',
        connectionStatus: 'connected',
        joinedAt: ISO_NOW,
      },
      {
        memberId: 'member-1',
        displayName: 'Daniel',
        initials: 'DA',
        avatarPalette: 'indigo',
        role: 'Participant',
        connectionStatus: 'connected',
        joinedAt: ISO_NOW,
      },
      {
        memberId: 'member-2',
        displayName: 'Maria',
        initials: 'MA',
        avatarPalette: 'emerald',
        role: 'Participant',
        connectionStatus: 'connected',
        joinedAt: ISO_NOW,
      },
    ],
    study: SUMMARY,
    volunteerTurn: makeTurn(turnOverrides),
    protocolVersion: 3,
  };
}

/** A `random_pending` turn: Maria staged with a fresh 30s window. */
function makeRandomPendingTurn(
  overrides: Partial<VolunteerTurnState> = {},
): VolunteerTurnState {
  return makeTurn({
    candidateMemberId: 'member-2',
    candidateExpiresAt: new Date(Date.now() + 30_000).toISOString(),
    ...overrides,
  });
}

const noop = () => {};

function renderScreen(
  overrides: Partial<Parameters<typeof OpeningPrayerScreen>[0]> = {},
) {
  const props = {
    role: 'Participant' as const,
    session: makeSession(),
    memberId: 'member-1',
    onToggleHandRaised: noop,
    onLowerHand: noop,
    onClearRaisedHands: noop,
    ...overrides,
  };
  return render(<OpeningPrayerScreen {...props} />);
}

function mockReducedMotion(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches,
      media: '(prefers-reduced-motion: reduce)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(window, 'matchMedia');
  useSacredStageStore.getState().reset();
});

describe('RandomPickButton — leader-only Pick Randomly (ux/4)', () => {
  it('renders for the Study Leader during collecting_hands and dispatches pick_random', () => {
    const onPickRandomly = vi.fn();
    renderScreen({ role: 'Study Leader', memberId: 'leader-1', onPickRandomly });

    const button = screen.getByTestId('random-pick-button');
    expect(button).toHaveTextContent('Pick Randomly');
    fireEvent.click(button);
    expect(onPickRandomly).toHaveBeenCalledTimes(1);
  });

  it('never renders without the leader callback (accepted suites stay byte-identical)', () => {
    renderScreen({ role: 'Study Leader', memberId: 'leader-1' });
    expect(screen.queryByTestId('random-pick-button')).toBeNull();
  });

  it('never renders for Participants or during random_pending', () => {
    const pick = vi.fn();
    renderScreen({ onPickRandomly: pick });
    expect(screen.queryByTestId('random-pick-button')).toBeNull();

    renderScreen({
      role: 'Study Leader',
      memberId: 'leader-1',
      onPickRandomly: pick,
      session: makeSession(makeRandomPendingTurn()),
    });
    expect(screen.queryByTestId('random-pick-button')).toBeNull();
  });

  it('is disabled with a clear note when zero Participants are connected (Scenario 4)', () => {
    renderScreen({
      role: 'Study Leader',
      memberId: 'leader-1',
      onPickRandomly: vi.fn(),
      session: makeSession({}, { connectedParticipantCount: 0 }),
    });

    const button = screen.getByTestId('random-pick-button');
    expect(button).toBeDisabled();
    expect(screen.getByTestId('random-empty-note')).toHaveTextContent(
      'No Participants are connected yet',
    );
  });

  it('stays enabled whenever at least one Participant is connected', () => {
    render(
      <RandomPickButton onPickRandomly={noop} connectedParticipantCount={1} />,
    );
    expect(screen.getByTestId('random-pick-button')).toBeEnabled();
    expect(screen.queryByTestId('random-empty-note')).toBeNull();
  });
});

describe('RandomSelectionPanel — shared countdown state (ux/9)', () => {
  it('shows the leader panel with candidate copy, terracotta card, and 0:30 countdown', () => {
    renderScreen({
      role: 'Study Leader',
      memberId: 'leader-1',
      onRetryRandom: vi.fn(),
      onConfirmRandom: vi.fn(),
      session: makeSession(makeRandomPendingTurn()),
    });

    const panel = screen.getByTestId('random-selection-panel');
    expect(panel).toHaveTextContent('RANDOM SELECTION');
    expect(panel).toHaveTextContent('Maria');
    expect(panel).toHaveTextContent('has been randomly chosen to pray.');
    expect(screen.getByTestId('random-notification-title')).toHaveTextContent(
      'Notification sent',
    );
    expect(screen.getByTestId('random-notification-copy')).toHaveTextContent(
      'Maria has 30 seconds to accept.',
    );

    const countdown = screen.getByTestId('random-countdown');
    expect(countdown).toHaveTextContent('0:30');
    expect(countdown).toHaveAttribute('role', 'timer');
    expect(countdown).toHaveAttribute('aria-live', 'polite');
  });

  it('dispatches Retry and Confirm selection from the leader-only controls', () => {
    const onRetryRandom = vi.fn();
    const onConfirmRandom = vi.fn();
    renderScreen({
      role: 'Study Leader',
      memberId: 'leader-1',
      onRetryRandom,
      onConfirmRandom,
      session: makeSession(makeRandomPendingTurn()),
    });

    fireEvent.click(screen.getByTestId('random-retry-button'));
    expect(onRetryRandom).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('random-confirm-button'));
    expect(onConfirmRandom).toHaveBeenCalledTimes(1);
  });

  it('keeps every leader-control string out of the participant DOM', () => {
    renderScreen({
      session: makeSession(makeRandomPendingTurn()),
    });

    // The shared panel is present for Participants (motion-animated section).
    expect(screen.getByTestId('random-selection-panel')).toHaveTextContent(
      'RANDOM SELECTION',
    );
    const body = document.body.textContent ?? '';
    expect(body).not.toContain('Pick Randomly');
    expect(body).not.toContain('Retry');
    expect(body).not.toContain('Confirm selection');
    // The orb is replaced by the panel while randomizing.
    expect(screen.queryByTestId('hand-raise-orb')).toBeNull();
  });

  it('replaces the orb with the panel while pending and restores the orb after expiry', () => {
    // Collecting: orb visible, no panel.
    renderScreen();
    expect(screen.getByTestId('hand-raise-orb')).toBeVisible();
    expect(screen.queryByTestId('random-selection-panel')).toBeNull();

    // Expiry: snapshot is back to collecting_hands — orb restored, panel gone.
    renderScreen({ lastSessionCommand: 'random_expired' });
    expect(screen.getAllByTestId('hand-raise-orb').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('random-selection-panel')).toBeNull();
  });

  it('marks a disconnected candidate with the reconnecting suffix (Scenario 5)', () => {
    render(
      <RandomSelectionPanel
        candidate={{
          displayName: 'Maria',
          initials: 'MA',
          avatarPalette: 'emerald',
          connectionStatus: 'disconnected',
        }}
        candidateExpiresAt={new Date(Date.now() + 30_000).toISOString()}
        chosenLine="has been randomly chosen to pray."
        isLeader={false}
      />,
    );
    expect(screen.getByTestId('random-candidate-status')).toHaveTextContent(
      '· reconnecting',
    );
    // Suffix rides the end of the line, like the chosen-volunteer banner.
    expect(document.body.textContent).toContain(
      'Maria has been randomly chosen to pray. · reconnecting',
    );
  });
});

describe('RandomSelectionPanel — server-authoritative countdown display', () => {
  it('ticks down from the absolute expiry and clamps at 0:00 (fake timers)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-30T20:00:00.000Z'));
    render(
      <RandomSelectionPanel
        candidate={{
          displayName: 'Maria',
          initials: 'MA',
          avatarPalette: 'emerald',
          connectionStatus: 'connected',
        }}
        candidateExpiresAt="2026-10-30T20:00:30.000Z"
        chosenLine="has been randomly chosen to pray."
        isLeader={false}
      />,
    );

    expect(screen.getByTestId('random-countdown')).toHaveTextContent('0:30');
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.getByTestId('random-countdown')).toHaveTextContent('0:25');
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    // Clamped: the countdown never renders negative or wraps.
    expect(screen.getByTestId('random-countdown')).toHaveTextContent('0:00');
  });

  it('formats 0:{ss} labels with zero padding', () => {
    expect(formatCountdownLabel(30)).toBe('0:30');
    expect(formatCountdownLabel(7)).toBe('0:07');
    expect(formatCountdownLabel(0)).toBe('0:00');
    expect(formatCountdownLabel(-5)).toBe('0:00');
  });
});

describe('OpeningPrayerScreen — random expiry announcement and stage wiring', () => {
  it('announces the server expiry with an aria-live notice', () => {
    renderScreen({ lastSessionCommand: 'random_expired' });
    const notice = screen.getByTestId('random-expired-notice');
    expect(notice).toHaveAttribute('aria-live', 'polite');
    expect(notice).toHaveTextContent('The random selection window expired.');
  });

  it('swaps in the random-polyhedron stage only while randomizing', () => {
    renderScreen();
    expect(useSacredStageStore.getState().stage).toBe('prayer-orb');

    renderScreen({
      role: 'Study Leader',
      memberId: 'leader-1',
      session: makeSession(makeRandomPendingTurn()),
    });
    expect(useSacredStageStore.getState().stage).toBe('random-polyhedron');
  });

  it('fires random-spin on pick/retry broadcasts and confirm-burst on confirm', () => {
    renderScreen({ lastSessionCommand: 'pick_random' });
    expect(useSacredStageStore.getState().impulse.kind).toBe('random-spin');

    renderScreen({ lastSessionCommand: 'retry_random' });
    expect(useSacredStageStore.getState().impulse.kind).toBe('random-spin');

    renderScreen({ lastSessionCommand: 'confirm_random' });
    expect(useSacredStageStore.getState().impulse.kind).toBe('confirm-burst');
  });

  it('hands the confirmed candidate straight into the unchanged Done flow', () => {
    // Post-confirm snapshot: selectedMemberId set, candidate fields cleared.
    renderScreen({
      role: 'Participant',
      memberId: 'member-2',
      session: makeSession(makeTurn({ selectedMemberId: 'member-2' })),
    });

    expect(screen.getByTestId('prayer-chosen-view')).toBeVisible();
    expect(screen.getByTestId('prayer-done-button')).toHaveTextContent('Done');
    expect(screen.queryByTestId('random-selection-panel')).toBeNull();
    expect(document.body.textContent).not.toContain('Retry');
    expect(document.body.textContent).not.toContain('Confirm selection');
    expect(document.body.textContent).not.toContain('Pick Randomly');
  });

  it('keeps the chosen view functional under prefers-reduced-motion', () => {
    mockReducedMotion(true);
    const onPickRandomly = vi.fn();
    const onRetryRandom = vi.fn();
    const onConfirmRandom = vi.fn();

    renderScreen({ role: 'Study Leader', memberId: 'leader-1', onPickRandomly });
    fireEvent.click(screen.getByTestId('random-pick-button'));
    expect(onPickRandomly).toHaveBeenCalledTimes(1);

    renderScreen({
      role: 'Study Leader',
      memberId: 'leader-1',
      onRetryRandom,
      onConfirmRandom,
      session: makeSession(makeRandomPendingTurn()),
    });
    fireEvent.click(screen.getByTestId('random-retry-button'));
    fireEvent.click(screen.getByTestId('random-confirm-button'));
    expect(onRetryRandom).toHaveBeenCalledTimes(1);
    expect(onConfirmRandom).toHaveBeenCalledTimes(1);
  });
});

describe('Random-selection CSS baseline (>= 16px text, >= 44px targets, override #4)', () => {
  it('keeps the ergonomics floors and the generous pill padding in global.css', () => {
    const cssPath = resolve(process.cwd(), 'src/client/styles/global.css');
    const css = readFileSync(cssPath, 'utf-8');

    // Violet Pick Randomly pill: 54px target with >= 16px control text.
    expect(css).toMatch(/\.random-pick-button\s*\{[^}]*min-height: 54px/);
    expect(css).toMatch(/\.random-pick-button\s*\{[^}]*font-size: 1\.05rem/);
    // Leader controls: Retry >= 44px, Confirm selection 56px, both >= 16px.
    expect(css).toMatch(/\.random-retry-button\s*\{[^}]*min-height: 44px/);
    expect(css).toMatch(/\.random-retry-button\s*\{[^}]*font-size: 1\.05rem/);
    expect(css).toMatch(/\.random-confirm-button\s*\{[^}]*min-height: 56px/);
    expect(css).toMatch(/\.random-confirm-button\s*\{[^}]*font-size: 1\.05rem/);
    // Panel copy and countdown respect the same text floor.
    expect(css).toMatch(/\.random-notification-copy\s*\{[^}]*font-size: 1rem/);
    expect(css).toMatch(/\.random-countdown\s*\{[^}]*font-size: 1\.25rem/);
    expect(css).toMatch(/\.random-candidate-line\s*\{[^}]*font-size: 1\.05rem/);
    expect(css).toMatch(/\.random-empty-note\s*\{[^}]*font-size: 1rem/);
    // DESIGN override #4: generous padding on the RANDOM SELECTION pill.
    expect(css).toMatch(/\.random-selection-pill\s*\{[^}]*padding: 0\.75rem 1\.75rem/);
  });
});

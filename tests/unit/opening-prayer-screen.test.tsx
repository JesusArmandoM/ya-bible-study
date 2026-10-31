// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpeningPrayerScreen, formatPeopleRaisedCount } from '../../src/client/components/prayer/OpeningPrayerScreen';
import {
  formatHandsRaisedCount,
  formatRaisedAtRelative,
} from '../../src/client/components/prayer/RaisedHandsQueue';
import { getDefaultStudyDocument } from '../../src/server/studies/greatIsYourFaithSeed';
import type {
  PublicLiveSessionSnapshot,
  RaisedHandEntry,
  SessionStudySummary,
} from '../../src/shared/session';
import { toSessionStudySummary } from '../../src/shared/session';
import { useSacredStageStore } from '../../src/client/state/sacredStageStore';

const SUMMARY: SessionStudySummary = toSessionStudySummary(
  getDefaultStudyDocument(),
);

function makeSession(
  raisedHands: RaisedHandEntry[] = [],
  study: SessionStudySummary | null = SUMMARY,
): PublicLiveSessionSnapshot {
  return {
    sessionCode: 'ABC123',
    status: 'in_progress',
    currentSectionIndex: 0,
    currentSectionId: 'section_1_prayer',
    createdAt: '2026-10-29T19:30:00.000Z',
    startedAt: '2026-10-29T19:31:00.000Z',
    endedAt: null,
    connectedMemberCount: 3,
    connectedParticipantCount: 2,
    members: [
      {
        memberId: 'leader-1',
        displayName: 'Claire',
        initials: 'CL',
        avatarPalette: 'gold',
        role: 'Study Leader',
        connectionStatus: 'connected',
        joinedAt: '2026-10-29T19:30:00.000Z',
      },
      {
        memberId: 'member-1',
        displayName: 'Daniel',
        initials: 'DA',
        avatarPalette: 'indigo',
        role: 'Participant',
        connectionStatus: 'connected',
        joinedAt: '2026-10-29T19:30:10.000Z',
      },
      {
        memberId: 'member-2',
        displayName: 'Maria',
        initials: 'MA',
        avatarPalette: 'emerald',
        role: 'Participant',
        connectionStatus: 'connected',
        joinedAt: '2026-10-29T19:30:20.000Z',
      },
    ],
    study,
    volunteerTurn: {
      sectionId: 'section_1_prayer',
      mode: 'gated_prayer',
      raisedHands,
      candidateMemberId: null,
      candidateExpiresAt: null,
      selectedMemberId: null,
      completedAt: null,
    },
    protocolVersion: 3,
  };
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

afterEach(() => {
  Reflect.deleteProperty(window, 'matchMedia');
  useSacredStageStore.getState().reset();
});

describe('OpeningPrayerScreen — Scenario 1 content on both roles', () => {
  it('shows the persistent header, MOMENT eyebrow, Opening Prayer title, and synced suggested prayer text', () => {
    renderScreen();

    expect(screen.getByTestId('section-one-label')).toHaveTextContent(
      'SECTION 1 OF 5',
    );
    expect(screen.getByTestId('section-one-percent')).toHaveTextContent('20%');
    expect(screen.getByTestId('section-one-title')).toHaveTextContent(
      'Opening Prayer',
    );
    expect(screen.getByTestId('prayer-eyebrow')).toHaveTextContent('MOMENT');
    expect(screen.getByTestId('opening-prayer-text')).toHaveTextContent(
      SUMMARY.openingPrayer!.suggestedPrayerText,
    );
    expect(screen.getByTestId('section-one-copy')).toHaveTextContent(
      'Tap Raise Hand if you would like to open our Bible study in prayer.',
    );
    expect(document.body.textContent).not.toContain('Assistant');
  });

  it('renders the Study Leader subtitle from the locally held StudyDocument leaderPrompt', () => {
    renderScreen({ role: 'Study Leader', localStudyDocument: getDefaultStudyDocument() });

    expect(screen.getByTestId('section-one-copy')).toHaveTextContent(
      'Waiting for someone to volunteer to pray',
    );
  });

  it('falls back to the fixed copy when the synced study content is unavailable', () => {
    renderScreen({ session: makeSession([], null) });

    expect(screen.getByTestId('opening-prayer-text')).toHaveTextContent(
      'Opening Prayer content unavailable',
    );
    expect(screen.getByTestId('section-one-copy')).toHaveTextContent(
      'Waiting for the Study Leader to begin the Opening Prayer',
    );
  });
});

describe('OpeningPrayerScreen — leader queue (Scenario 2/3/4)', () => {
  it('renders the count header and rows in raise order with initials and relative timestamps', () => {
    renderScreen({
      role: 'Study Leader',
      session: makeSession([
        { memberId: 'member-1', raisedAt: new Date().toISOString() },
        { memberId: 'member-2', raisedAt: new Date().toISOString() },
      ]),
    });

    expect(screen.getByTestId('prayer-queue-count')).toHaveTextContent(
      '2 hands raised',
    );
    const rows = screen.getAllByTestId('prayer-queue-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute('data-member-id', 'member-1');
    expect(rows[1]).toHaveAttribute('data-member-id', 'member-2');
    expect(rows[0]).toHaveTextContent('DA');
    expect(rows[0]).toHaveTextContent('Daniel');
    expect(screen.getAllByTestId('prayer-queue-row-time')[0]).toHaveTextContent(
      /Raised (just now|\d+[smh] ago)/,
    );
  });

  it('pluralizes the queue count copy', () => {
    expect(formatHandsRaisedCount(0)).toBe('0 hands raised');
    expect(formatHandsRaisedCount(1)).toBe('1 hand raised');
    expect(formatHandsRaisedCount(2)).toBe('2 hands raised');
  });

  it('shows the empty state and still renders the leader count header', () => {
    renderScreen({ role: 'Study Leader' });

    expect(screen.getByTestId('prayer-queue-count')).toHaveTextContent(
      '0 hands raised',
    );
    expect(screen.getByTestId('prayer-queue-empty')).toHaveTextContent(
      'No hands raised yet',
    );
    expect(screen.queryAllByTestId('prayer-queue-row')).toHaveLength(0);
  });

  it('dispatches per-row lower with the member id and clear-all through the leader callbacks', () => {
    const onLowerHand = vi.fn();
    const onClearRaisedHands = vi.fn();
    renderScreen({
      role: 'Study Leader',
      session: makeSession([
        { memberId: 'member-1', raisedAt: new Date().toISOString() },
        { memberId: 'member-2', raisedAt: new Date().toISOString() },
      ]),
      onLowerHand,
      onClearRaisedHands,
    });

    const lowerButtons = screen.getAllByTestId('prayer-queue-row-lower');
    expect(lowerButtons[0]).toHaveAttribute(
      'aria-label',
      "Lower Daniel's hand",
    );
    fireEvent.click(lowerButtons[0]!);
    expect(onLowerHand).toHaveBeenCalledWith('member-1');

    const clearAll = screen.getByTestId('prayer-queue-clear-all');
    expect(clearAll).toHaveAttribute('aria-label', 'Lower all hands');
    fireEvent.click(clearAll);
    expect(onClearRaisedHands).toHaveBeenCalledTimes(1);
  });

  it('keeps queue-management controls out of the Participant DOM entirely', () => {
    renderScreen({
      role: 'Participant',
      session: makeSession([
        { memberId: 'member-1', raisedAt: new Date().toISOString() },
      ]),
    });

    expect(screen.queryByTestId('prayer-queue-row-lower')).toBeNull();
    expect(screen.queryByTestId('prayer-queue-clear-all')).toBeNull();
    expect(screen.queryByTestId('prayer-queue-row')).toBeNull();
  });
});

describe('OpeningPrayerScreen — participant orb toggle', () => {
  it('toggles aria-pressed optimistically and dispatches raise/lower with the next value', async () => {
    const onToggleHandRaised = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderScreen({ onToggleHandRaised });

    const orb = screen.getByTestId('hand-raise-orb');
    expect(orb).toHaveAttribute('aria-pressed', 'false');
    expect(orb).toHaveTextContent('Raise Hand');

    fireEvent.click(orb);
    expect(onToggleHandRaised).toHaveBeenCalledWith(true);
    // 0ms optimistic feedback: the orb flips before the round trip lands.
    expect(orb).toHaveAttribute('aria-pressed', 'true');
    expect(orb).toHaveTextContent('Hand Raised');
    expect(orb).toHaveTextContent('Tap again to lower');

    // Authoritative state lands; toggling again lowers the hand.
    rerender(
      <OpeningPrayerScreen
        role="Participant"
        session={makeSession([
          { memberId: 'member-1', raisedAt: new Date().toISOString() },
        ])}
        memberId="member-1"
        onToggleHandRaised={onToggleHandRaised}
        onLowerHand={noop}
        onClearRaisedHands={noop}
      />,
    );
    fireEvent.click(screen.getByTestId('hand-raise-orb'));
    expect(onToggleHandRaised).toHaveBeenLastCalledWith(false);
  });

  it('unwinds the optimistic state when the dispatch fails', async () => {
    const onToggleHandRaised = vi
      .fn()
      .mockRejectedValue(new Error('raise rejected'));
    renderScreen({ onToggleHandRaised });

    const orb = screen.getByTestId('hand-raise-orb');
    fireEvent.click(orb);
    expect(orb).toHaveAttribute('aria-pressed', 'true');

    await waitFor(() => {
      expect(orb).toHaveAttribute('aria-pressed', 'false');
    });
  });

  it('marks the member hand state raised when their memberId is in the queue', () => {
    renderScreen({
      memberId: 'member-1',
      session: makeSession([
        { memberId: 'member-1', raisedAt: new Date().toISOString() },
      ]),
    });

    expect(screen.getByTestId('hand-raise-orb')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('wires the prayer-orb stage on mount and the hand-raise impulse on toggle', () => {
    const store = useSacredStageStore.getState();
    renderScreen({ onToggleHandRaised: vi.fn().mockResolvedValue(undefined) });

    expect(useSacredStageStore.getState().stage).toBe('prayer-orb');

    const sequenceBefore = useSacredStageStore.getState().impulse.sequence;
    fireEvent.click(screen.getByTestId('hand-raise-orb'));
    expect(useSacredStageStore.getState().impulse.kind).toBe('hand-raise');
    expect(useSacredStageStore.getState().impulse.sequence).toBe(
      sequenceBefore + 1,
    );
    // sanity: unrelated store actions remain stable
    expect(typeof store.setStage).toBe('function');
  });
});

describe('OpeningPrayerScreen — participant count pill', () => {
  it('pluralizes the raised-people copy and shows the choose hint only once hands are up', () => {
    expect(formatPeopleRaisedCount(0)).toBe(
      'No one has raised their hand yet',
    );
    expect(formatPeopleRaisedCount(1)).toBe(
      '1 person has raised their hand',
    );
    expect(formatPeopleRaisedCount(3)).toBe(
      '3 people have raised their hand',
    );

    const { rerender } = renderScreen();
    expect(screen.getByTestId('prayer-count-pill-text')).toHaveTextContent(
      'No one has raised their hand yet',
    );
    expect(screen.queryByTestId('prayer-count-pill-hint')).toBeNull();

    rerender(
      <OpeningPrayerScreen
        role="Participant"
        session={makeSession([
          { memberId: 'member-2', raisedAt: new Date().toISOString() },
        ])}
        memberId="member-1"
        onToggleHandRaised={noop}
        onLowerHand={noop}
        onClearRaisedHands={noop}
      />,
    );
    expect(screen.getByTestId('prayer-count-pill-text')).toHaveTextContent(
      '1 person has raised their hand',
    );
    expect(screen.getByTestId('prayer-count-pill-hint')).toHaveTextContent(
      'The leader will choose shortly',
    );
  });
});

describe('OpeningPrayerScreen — locked advance bar (Scenario 5)', () => {
  it('renders the role copy and never an advance CTA in either role DOM', () => {
    const { rerender } = renderScreen({ role: 'Study Leader' });
    const leaderBar = screen.getByTestId('locked-advance-bar');
    expect(leaderBar).toHaveAttribute('data-role', 'leader');
    expect(leaderBar).toHaveTextContent('Waiting for volunteer to advance');
    expect(leaderBar.querySelectorAll('button')).toHaveLength(0);
    expect(leaderBar.textContent).not.toMatch(/advance now|continue|next/i);

    rerender(
      <OpeningPrayerScreen
        role="Participant"
        session={makeSession()}
        memberId="member-1"
        onToggleHandRaised={noop}
        onLowerHand={noop}
        onClearRaisedHands={noop}
      />,
    );
    const participantBar = screen.getByTestId('locked-advance-bar');
    expect(participantBar).toHaveAttribute('data-role', 'participant');
    expect(participantBar).toHaveTextContent(
      'Only the leader decides when to advance',
    );
    expect(participantBar.querySelectorAll('button')).toHaveLength(0);
  });
});

describe('OpeningPrayerScreen — reduced-motion guards', () => {
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

  it('pulses the raised orb under default motion but not under prefers-reduced-motion', () => {
    mockReducedMotion(false);
    const { unmount } = renderScreen({
      session: makeSession([
        { memberId: 'member-1', raisedAt: new Date().toISOString() },
      ]),
    });
    expect(screen.getByTestId('hand-raise-orb').className).toContain(
      'hand-raise-orb-pulsing',
    );
    unmount();

    mockReducedMotion(true);
    renderScreen({
      session: makeSession([
        { memberId: 'member-1', raisedAt: new Date().toISOString() },
      ]),
    });
    const orb = screen.getByTestId('hand-raise-orb');
    expect(orb).toHaveAttribute('aria-pressed', 'true');
    expect(orb.className).not.toContain('hand-raise-orb-pulsing');
  });
});

describe('Prayer screen helpers — relative timestamps', () => {
  it('formats seconds, minutes, and hours ago from the server-clock raisedAt', () => {
    const now = Date.parse('2026-10-29T19:30:00.000Z');
    expect(
      formatRaisedAtRelative('2026-10-29T19:29:56.000Z', now),
    ).toBe('Raised 4s ago');
    expect(
      formatRaisedAtRelative('2026-10-29T19:28:00.000Z', now),
    ).toBe('Raised 2m ago');
    expect(
      formatRaisedAtRelative('2026-10-29T17:30:00.000Z', now),
    ).toBe('Raised 2h ago');
  });

  it('clamps clock-skew negatives and sub-second deltas to just now', () => {
    const now = Date.parse('2026-10-29T19:30:00.000Z');
    expect(
      formatRaisedAtRelative('2026-10-29T19:30:02.000Z', now),
    ).toBe('Raised just now');
    expect(
      formatRaisedAtRelative('2026-10-29T19:29:59.600Z', now),
    ).toBe('Raised just now');
    expect(formatRaisedAtRelative('not-a-date', now)).toBe('Raised just now');
  });
});

describe('Prayer screen CSS baseline (>= 16px text, >= 44px targets, DESIGN overrides)', () => {
  it('keeps the mobile ergonomics floors and centered avatar initials in global.css', () => {
    const cssPath = resolve(process.cwd(), 'src/client/styles/global.css');
    const css = readFileSync(cssPath, 'utf-8');

    // Concentric orb is comfortably above the 44px touch floor.
    expect(css).toMatch(/\.hand-raise-orb\s*\{[^}]*min-width: 180px/);
    expect(css).toMatch(/\.hand-raise-orb\s*\{[^}]*min-height: 180px/);
    // >= 16px control text.
    expect(css).toMatch(/\.hand-raise-orb-label\s*\{[^}]*font-size: 1\.15rem/);
    expect(css).toMatch(/\.hand-raise-orb-sublabel\s*\{[^}]*font-size: 1rem/);
    expect(css).toMatch(/\.prayer-queue-lower\s*\{[^}]*font-size: 1rem/);
    expect(css).toMatch(/\.locked-advance-copy\s*\{[^}]*font-size: 1rem/);
    expect(css).toMatch(/\.prayer-count-pill-text\s*\{[^}]*font-size: 1rem/);
    // >= 44px interactive targets.
    expect(css).toMatch(/\.prayer-queue-clear-all\s*\{[^}]*min-height: 44px/);
    expect(css).toMatch(/\.prayer-queue-lower\s*\{[^}]*min-height: 44px/);
    expect(css).toMatch(/\.locked-advance-bar\s*\{[^}]*min-height: 44px/);
    expect(css).toMatch(/\.prayer-count-pill\s*\{[^}]*min-height: 44px/);
    // DESIGN override #4: avatar initials flex-centered inside the circle.
    expect(css).toMatch(/\.prayer-queue-avatar\s*\{[^}]*display: flex/);
    expect(css).toMatch(/\.prayer-queue-avatar\s*\{[^}]*align-items: center/);
    expect(css).toMatch(
      /\.prayer-queue-avatar\s*\{[^}]*justify-content: center/,
    );
    // 4px gold section progress bar stays intact.
    expect(css).toMatch(/\.section-one-progress\s*\{[^}]*height: 4px/);
  });
});

describe('OpeningPrayerScreen — chosen-volunteer gate extension (Choose pills)', () => {
  it('renders the leader Choose pill and dispatches choose_volunteer with the row memberId', () => {
    const onChooseVolunteer = vi.fn();
    renderScreen({
      role: 'Study Leader',
      session: makeSession([
        { memberId: 'member-1', raisedAt: new Date().toISOString() },
      ]),
      onChooseVolunteer,
    });

    const pill = screen.getByTestId('prayer-queue-choose');
    expect(pill).toHaveAttribute('aria-label', 'Choose Daniel to pray');
    fireEvent.click(pill);
    expect(onChooseVolunteer).toHaveBeenCalledWith('member-1');
  });

  it('never renders Choose pills or a chosen view in the Participant DOM', () => {
    renderScreen({
      role: 'Participant',
      session: makeSession([
        { memberId: 'member-2', raisedAt: new Date().toISOString() },
      ]),
      onChooseVolunteer: vi.fn(),
    });

    expect(screen.queryByTestId('prayer-queue-choose')).toBeNull();
    expect(screen.queryByTestId('prayer-chosen-view')).toBeNull();
    expect(screen.queryByTestId('prayer-done-button')).toBeNull();
    expect(document.body.textContent).not.toContain('Choose');
    expect(document.body.textContent).not.toContain('Done');
  });
});

// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  OpeningPrayerScreen,
  type OpeningPrayerScreenProps,
} from '../../src/client/components/prayer/OpeningPrayerScreen';
import { getDefaultStudyDocument } from '../../src/server/studies/greatIsYourFaithSeed';
import type {
  PublicLiveSessionSnapshot,
  RaisedHandEntry,
  SessionStudySummary,
  VolunteerTurnState,
} from '../../src/shared/session';
import { toSessionStudySummary } from '../../src/shared/session';
import { useSacredStageStore } from '../../src/client/state/sacredStageStore';

const SUMMARY: SessionStudySummary = toSessionStudySummary(
  getDefaultStudyDocument(),
);

const ISO_NOW = '2026-10-30T19:30:00.000Z';

function makeTurn(
  overrides: Partial<VolunteerTurnState> = {},
): VolunteerTurnState {
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
  turn: Partial<VolunteerTurnState> = {},
  members: PublicLiveSessionSnapshot['members'] = defaultMembers(),
): PublicLiveSessionSnapshot {
  return {
    sessionCode: 'ABC123',
    status: 'in_progress',
    currentSectionIndex: 0,
    currentSectionId: 'section_1_prayer',
    createdAt: '2026-10-30T19:25:00.000Z',
    startedAt: '2026-10-30T19:26:00.000Z',
    endedAt: null,
    connectedMemberCount: 3,
    connectedParticipantCount: 2,
    members,
    study: SUMMARY,
    volunteerTurn: makeTurn(turn),
    protocolVersion: 3,
  };
}

function defaultMembers(): PublicLiveSessionSnapshot['members'] {
  return [
    {
      memberId: 'leader-1',
      displayName: 'Claire',
      initials: 'CL',
      avatarPalette: 'gold',
      role: 'Study Leader',
      connectionStatus: 'connected',
      joinedAt: '2026-10-30T19:25:00.000Z',
    },
    {
      memberId: 'member-1',
      displayName: 'Daniel',
      initials: 'DA',
      avatarPalette: 'indigo',
      role: 'Participant',
      connectionStatus: 'connected',
      joinedAt: '2026-10-30T19:25:10.000Z',
    },
    {
      memberId: 'member-2',
      displayName: 'Maria',
      initials: 'MA',
      avatarPalette: 'emerald',
      role: 'Participant',
      connectionStatus: 'connected',
      joinedAt: '2026-10-30T19:25:20.000Z',
    },
  ];
}

const noop = () => {};

function raisedFor(memberId: string): RaisedHandEntry {
  return { memberId, raisedAt: ISO_NOW };
}

function renderScreen(
  overrides: Partial<OpeningPrayerScreenProps> = {},
) {
  const props: OpeningPrayerScreenProps = {
    role: 'Participant',
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
  Reflect.deleteProperty(window, 'matchMedia');
  useSacredStageStore.getState().reset();
});

describe('ChosenVolunteerView — chosen-only YOU WERE CHOSEN view (Scenario 1)', () => {
  it('renders the YOU WERE CHOSEN view only for the chosen member', () => {
    renderScreen({
      session: makeSession({
        selectedMemberId: 'member-1',
        raisedHands: [raisedFor('member-1'), raisedFor('member-2')],
      }),
      memberId: 'member-1',
    });

    expect(screen.getByTestId('prayer-chosen-view')).toBeInTheDocument();
    expect(screen.getByTestId('prayer-chosen-pill')).toHaveTextContent(
      'YOU WERE CHOSEN',
    );
    expect(screen.getByTestId('prayer-chosen-title')).toHaveTextContent(
      "It's your turn to pray",
    );
    expect(screen.getByTestId('prayer-chosen-instruction')).toHaveTextContent(
      SUMMARY.openingPrayer!.chosenVolunteerInstruction,
    );
    expect(screen.getByTestId('opening-prayer-text')).toHaveTextContent(
      SUMMARY.openingPrayer!.suggestedPrayerText,
    );
    expect(screen.getByTestId('prayer-done-button')).toHaveTextContent('Done');
    expect(useSacredStageStore.getState().stage).toBe('chosen-aura');
  });

  it('keeps the normal view for the non-chosen participant with no chosen-only nodes', () => {
    renderScreen({
      session: makeSession({
        selectedMemberId: 'member-2',
        raisedHands: [raisedFor('member-2')],
      }),
      memberId: 'member-1',
    });

    expect(screen.queryByTestId('prayer-chosen-view')).toBeNull();
    expect(screen.queryByTestId('prayer-done-button')).toBeNull();
    expect(screen.queryByTestId('prayer-chosen-pill')).toBeNull();
    expect(document.body.textContent).not.toContain('YOU WERE CHOSEN');
    expect(useSacredStageStore.getState().stage).toBe('prayer-orb');
  });

  it('announces "You were chosen" through a polite aria-live region', () => {
    renderScreen({
      session: makeSession({ selectedMemberId: 'member-1' }),
      memberId: 'member-1',
    });

    const live = screen.getByTestId('prayer-chosen-live');
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live).toHaveTextContent('You were chosen');
  });

  it('Done dispatches complete_turn and fires the completion-pulse impulse', () => {
    const onCompleteTurn = vi.fn();
    renderScreen({
      session: makeSession({ selectedMemberId: 'member-1' }),
      memberId: 'member-1',
      onCompleteTurn,
    });

    const sequenceBefore = useSacredStageStore.getState().impulse.sequence;
    fireEvent.click(screen.getByTestId('prayer-done-button'));
    expect(onCompleteTurn).toHaveBeenCalledTimes(1);
    expect(useSacredStageStore.getState().impulse.kind).toBe('completion-pulse');
    expect(useSacredStageStore.getState().impulse.sequence).toBe(
      sequenceBefore + 1,
    );
  });

  it('shows the completed state after the turn is done', () => {
    renderScreen({
      session: makeSession({
        selectedMemberId: 'member-1',
        completedAt: ISO_NOW,
      }),
      memberId: 'member-1',
    });

    expect(screen.queryByTestId('prayer-done-button')).toBeNull();
    expect(screen.getByTestId('prayer-done-completed')).toHaveTextContent(
      'Amen — thank you for praying.',
    );
    expect(screen.getByTestId('locked-advance-bar')).toHaveAttribute(
      'data-role',
      'participant',
    );
  });

  it('fires the completion pulse when the latest session command completes the turn', () => {
    const sequenceBefore = useSacredStageStore.getState().impulse.sequence;
    renderScreen({
      session: makeSession({ selectedMemberId: 'member-1' }),
      memberId: 'member-1',
      lastSessionCommand: 'complete_turn',
    });
    expect(useSacredStageStore.getState().impulse.kind).toBe('completion-pulse');
    expect(useSacredStageStore.getState().impulse.sequence).toBe(
      sequenceBefore + 1,
    );
    useSacredStageStore.getState().reset();

    renderScreen({
      session: makeSession({ selectedMemberId: 'member-1' }),
      memberId: 'member-1',
      lastSessionCommand: 'override_turn',
    });
    expect(useSacredStageStore.getState().impulse.kind).toBe('completion-pulse');
    expect(useSacredStageStore.getState().impulse.sequence).toBe(1);
    useSacredStageStore.getState().reset();

    renderScreen({
      session: makeSession({ selectedMemberId: 'member-1' }),
      memberId: 'member-1',
      lastSessionCommand: 'raise_hand',
    });
    expect(useSacredStageStore.getState().impulse.sequence).toBe(0);
  });
});

describe('Leader chosen-volunteer controls (Scenarios 1/2/4)', () => {
  const leaderProps: Partial<OpeningPrayerScreenProps> = {
    role: 'Study Leader',
    memberId: 'leader-1',
  };

  it('renders Choose pills on raised rows and dispatches choose_volunteer', () => {
    const onChooseVolunteer = vi.fn();
    renderScreen({
      ...leaderProps,
      session: makeSession({
        raisedHands: [raisedFor('member-1'), raisedFor('member-2')],
      }),
      onChooseVolunteer,
    });

    const pills = screen.getAllByTestId('prayer-queue-choose');
    expect(pills).toHaveLength(2);
    expect(pills[0]).toHaveAttribute('aria-label', 'Choose Daniel to pray');
    expect(pills[1]).toHaveAttribute('aria-label', 'Choose Maria to pray');
    fireEvent.click(pills[1]!);
    expect(onChooseVolunteer).toHaveBeenCalledWith('member-2');
  });

  it('gold-highlights the chosen row with a Chosen chip and keeps Lower available', () => {
    renderScreen({
      ...leaderProps,
      session: makeSession({
        selectedMemberId: 'member-1',
        raisedHands: [raisedFor('member-1'), raisedFor('member-2')],
      }),
      onChooseVolunteer: noop,
    });

    const rows = screen.getAllByTestId('prayer-queue-row');
    expect(rows[0]!.className).toContain('is-chosen');
    expect(rows[1]!.className).not.toContain('is-chosen');
    expect(screen.getByTestId('prayer-queue-chosen-chip')).toHaveTextContent(
      'Chosen',
    );
    // The chosen row swaps its Choose pill for the chip but keeps Lower
    // (hand churn never revokes a selection); other rows keep reassign pills.
    expect(screen.getAllByTestId('prayer-queue-choose')).toHaveLength(1);
    expect(screen.getAllByTestId('prayer-queue-row-lower')).toHaveLength(2);
  });

  it('banners the assigned volunteer with a reconnecting suffix when disconnected', () => {
    const members = defaultMembers();
    members[1] = { ...members[1]!, connectionStatus: 'disconnected' };
    const { rerender } = renderScreen({
      ...leaderProps,
      session: makeSession(
        { selectedMemberId: 'member-1' },
        members,
      ),
      onChooseVolunteer: noop,
    });

    const banner = screen.getByTestId('prayer-chosen-banner');
    expect(banner).toHaveTextContent('Daniel is praying — waiting for Done');
    expect(screen.getByTestId('prayer-chosen-banner-status')).toHaveTextContent(
      '· reconnecting',
    );

    rerender(
      <OpeningPrayerScreen
        role="Study Leader"
        session={makeSession({
          selectedMemberId: 'member-1',
          completedAt: ISO_NOW,
        })}
        memberId="leader-1"
        onToggleHandRaised={noop}
        onLowerHand={noop}
        onClearRaisedHands={noop}
        onChooseVolunteer={noop}
      />,
    );
    expect(screen.queryByTestId('prayer-chosen-banner')).toBeNull();
  });

  it('keeps the override control outside the locked bar and dispatches override_turn', () => {
    const onOverrideTurn = vi.fn();
    renderScreen({
      ...leaderProps,
      session: makeSession({
        selectedMemberId: 'member-1',
        raisedHands: [raisedFor('member-1')],
      }),
      onChooseVolunteer: noop,
      onOverrideTurn,
    });

    const bar = screen.getByTestId('locked-advance-bar');
    expect(bar).toHaveAttribute('data-role', 'leader');
    expect(bar).toHaveTextContent('Waiting for volunteer to advance');
    expect(bar.textContent).not.toMatch(/advance now|continue|next/i);
    expect(bar.querySelectorAll('button')).toHaveLength(0);

    const override = screen.getByTestId('prayer-override-button');
    expect(override).toHaveTextContent('Mark done (Leader override)');
    expect(override.closest('[data-testid="locked-advance-bar"]')).toBeNull();
    fireEvent.click(override);
    expect(onOverrideTurn).toHaveBeenCalledTimes(1);
  });

  it('renders no override control once the turn is completed', () => {
    renderScreen({
      ...leaderProps,
      session: makeSession({
        selectedMemberId: 'member-1',
        completedAt: ISO_NOW,
      }),
      onChooseVolunteer: noop,
      onOverrideTurn: noop,
    });

    expect(screen.queryByTestId('prayer-override-button')).toBeNull();
  });

  it('morphs the locked bar into the gold Continue to Section 2 CTA on completion', async () => {
    mockReducedMotion(true);
    const onNextSection = vi.fn();
    const view = renderScreen({
      ...leaderProps,
      session: makeSession({
        selectedMemberId: 'member-1',
        raisedHands: [raisedFor('member-1')],
      }),
      onChooseVolunteer: noop,
      onNextSection,
    });

    expect(screen.getByTestId('locked-advance-bar')).toBeInTheDocument();

    // completedAt lands (Done or override): the bar morphs into the CTA.
    view.rerender(
      <OpeningPrayerScreen
        role="Study Leader"
        session={makeSession({
          selectedMemberId: 'member-1',
          completedAt: ISO_NOW,
          raisedHands: [raisedFor('member-1')],
        })}
        memberId="leader-1"
        onToggleHandRaised={noop}
        onLowerHand={noop}
        onClearRaisedHands={noop}
        onChooseVolunteer={noop}
        onNextSection={onNextSection}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByTestId('locked-advance-bar')).toBeNull();
    });
    await waitFor(() => {
      expect(screen.queryByTestId('prayer-advance-cta')).not.toBeNull();
    });
    expect(screen.getByTestId('prayer-advance-cta')).toHaveTextContent(
      'Continue to Section 2 →',
    );

    fireEvent.click(screen.getByTestId('prayer-advance-cta'));
    expect(onNextSection).toHaveBeenCalledTimes(1);
  });

  it('hides the Choose pills once the turn is completed', () => {
    renderScreen({
      ...leaderProps,
      session: makeSession({
        selectedMemberId: 'member-1',
        completedAt: ISO_NOW,
        raisedHands: [raisedFor('member-1'), raisedFor('member-2')],
      }),
      onChooseVolunteer: noop,
    });

    expect(screen.queryAllByTestId('prayer-queue-choose')).toHaveLength(0);
  });
});

describe('Non-chosen participant notes and exclusivity (Scenario 2/3 UI slice)', () => {
  it('shows who is praying and never renders Done / Choose controls', () => {
    renderScreen({
      role: 'Participant',
      memberId: 'member-1',
      session: makeSession({
        selectedMemberId: 'member-2',
        raisedHands: [raisedFor('member-2')],
      }),
    });

    expect(screen.getByTestId('prayer-active-volunteer-note')).toHaveTextContent(
      'Maria is praying now',
    );
    expect(screen.queryByTestId('prayer-done-button')).toBeNull();
    expect(screen.queryByTestId('prayer-queue-choose')).toBeNull();
    expect(screen.queryByTestId('prayer-override-button')).toBeNull();
    expect(screen.queryByTestId('prayer-advance-cta')).toBeNull();
    expect(document.body.textContent).not.toContain('Choose');
    expect(document.body.textContent).not.toContain('Done');
  });

  it('shows the completed note after the Opening Prayer turn finishes', () => {
    renderScreen({
      role: 'Participant',
      memberId: 'member-1',
      session: makeSession({
        selectedMemberId: 'member-2',
        completedAt: ISO_NOW,
        raisedHands: [],
      }),
    });

    expect(screen.getByTestId('prayer-completed-note')).toHaveTextContent(
      'The Opening Prayer is complete',
    );
    expect(screen.queryByTestId('prayer-active-volunteer-note')).toBeNull();
  });

  it('keeps the chosen view functional under prefers-reduced-motion', () => {
    mockReducedMotion(true);
    const onCompleteTurn = vi.fn();
    const onChooseVolunteer = vi.fn();
    const chosen = renderScreen({
      role: 'Participant',
      memberId: 'member-1',
      session: makeSession({ selectedMemberId: 'member-1' }),
      onCompleteTurn,
    });
    fireEvent.click(screen.getByTestId('prayer-done-button'));
    expect(onCompleteTurn).toHaveBeenCalledTimes(1);
    chosen.unmount();

    renderScreen({
      role: 'Study Leader',
      memberId: 'leader-1',
      session: makeSession({ raisedHands: [raisedFor('member-1')] }),
      onChooseVolunteer,
    });
    fireEvent.click(screen.getByTestId('prayer-queue-choose'));
    expect(onChooseVolunteer).toHaveBeenCalledWith('member-1');
  });
});

describe('Chosen-volunteer CSS baseline (>= 16px text, >= 44px targets, DESIGN override #4)', () => {
  it('keeps the ergonomics floors and pill padding in global.css', () => {
    const cssPath = resolve(process.cwd(), 'src/client/styles/global.css');
    const css = readFileSync(cssPath, 'utf-8');

    // Gold Done CTA is 56px with >= 16px control text.
    expect(css).toMatch(/\.prayer-done-button\s*\{[^}]*min-height: 56px/);
    expect(css).toMatch(/\.prayer-done-button\s*\{[^}]*font-size: 1\.15rem/);
    // Leader advance CTA + discreet override respect the same floors.
    expect(css).toMatch(/\.prayer-advance-cta\s*\{[^}]*min-height: 56px/);
    expect(css).toMatch(/\.prayer-advance-cta\s*\{[^}]*font-size: 1\.05rem/);
    expect(css).toMatch(/\.prayer-override-button\s*\{[^}]*min-height: 44px/);
    expect(css).toMatch(/\.prayer-override-button\s*\{[^}]*font-size: 1rem/);
    // Queue Choose pill is a >= 44px target with >= 16px text.
    expect(css).toMatch(/\.prayer-queue-choose\s*\{[^}]*min-height: 44px/);
    expect(css).toMatch(/\.prayer-queue-choose\s*\{[^}]*font-size: 1rem/);
    expect(css).toMatch(/\.prayer-queue-chosen-chip\s*\{[^}]*min-height: 44px/);
    // DESIGN override #4: YOU WERE CHOSEN pill never overflows its border.
    expect(css).toMatch(/\.prayer-chosen-pill\s*\{[^}]*padding: 0\.55rem 1\.5rem/);
  });
});

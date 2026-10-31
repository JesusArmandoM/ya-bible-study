// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  IcebreakerScreen,
  formatIcebreakerEyebrow,
} from '../../src/client/components/icebreaker/IcebreakerScreen';
import {
  HandRaiseCountPill,
  formatIcebreakerRaisedCount,
} from '../../src/client/components/icebreaker/HandRaiseCountPill';
import { getDefaultStudyDocument } from '../../src/server/studies/greatIsYourFaithSeed';
import type {
  PublicLiveSessionSnapshot,
  RaisedHandEntry,
  SessionStudySummary,
} from '../../src/shared/session';
import { toSessionStudySummary } from '../../src/shared/session';
import { useSacredStageStore } from '../../src/client/state/sacredStageStore';

const SEED = getDefaultStudyDocument();
const SUMMARY: SessionStudySummary = toSessionStudySummary(SEED);
const SEED_EXAMPLES = SEED.icebreaker.examplesToListenFor;
const SEED_LEADER_NOTE = SEED.icebreaker.leaderNote;

function makeSession(
  raisedHands: RaisedHandEntry[] = [],
  study: SessionStudySummary | null = SUMMARY,
): PublicLiveSessionSnapshot {
  return {
    sessionCode: 'ABC123',
    status: 'in_progress',
    currentSectionIndex: 1,
    currentSectionId: 'section_2_icebreaker',
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
      sectionId: 'section_2_icebreaker',
      mode: 'open_share',
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
  overrides: Partial<Parameters<typeof IcebreakerScreen>[0]> = {},
) {
  const props = {
    role: 'Participant' as const,
    session: makeSession(),
    memberId: 'member-1',
    onToggleHandRaised: noop,
    ...overrides,
  };
  return render(<IcebreakerScreen {...props} />);
}

function mockReducedMotion(reduced: boolean) {
  Reflect.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: reduced && query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

afterEach(() => {
  Reflect.deleteProperty(window, 'matchMedia');
  useSacredStageStore.getState().reset();
});

describe('IcebreakerScreen — Scenario 1 content on both roles', () => {
  it('shows the persistent header, ICEBREAKER · 10 MIN eyebrow, and Outsiders Wanted title for both roles', () => {
    const { unmount } = renderScreen();
    expect(screen.getByTestId('section-one-label')).toHaveTextContent(
      'SECTION 2 OF 5',
    );
    expect(screen.getByTestId('section-one-percent')).toHaveTextContent('40%');
    expect(screen.getByTestId('icebreaker-eyebrow')).toHaveTextContent(
      'ICEBREAKER · 10 MIN',
    );
    expect(screen.getByTestId('icebreaker-title')).toHaveTextContent(
      'Outsiders Wanted',
    );
    unmount();

    renderScreen({ role: 'Study Leader', localStudyDocument: SEED });
    expect(screen.getByTestId('section-one-label')).toHaveTextContent(
      'SECTION 2 OF 5',
    );
    expect(screen.getByTestId('section-one-percent')).toHaveTextContent('40%');
    expect(screen.getByTestId('icebreaker-eyebrow')).toHaveTextContent(
      'ICEBREAKER · 10 MIN',
    );
    expect(screen.getByTestId('icebreaker-title')).toHaveTextContent(
      'Outsiders Wanted',
    );
    expect(document.body.textContent).not.toContain('Assistant');
  });

  it('builds the eyebrow from the wire fields without duplicating the duration', () => {
    expect(formatIcebreakerEyebrow('ICEBREAKER · 10 MIN', '10 min')).toBe(
      'ICEBREAKER · 10 MIN',
    );
    expect(formatIcebreakerEyebrow('ICEBREAKER', '10 min')).toBe(
      'ICEBREAKER · 10 min',
    );
    expect(formatIcebreakerEyebrow(null, '10 min')).toBe('ICEBREAKER · 10 min');
    expect(formatIcebreakerEyebrow('ICEBREAKER · 10 MIN', null)).toBe(
      'ICEBREAKER · 10 MIN',
    );
    expect(formatIcebreakerEyebrow(null, null)).toBe('ICEBREAKER');
    expect(formatIcebreakerEyebrow('  Meet Up  ', ' ')).toBe('Meet Up');
  });

  it('gives the Study Leader the QUESTION card with main question, hairline divider, and italic follow-up', () => {
    renderScreen({ role: 'Study Leader', localStudyDocument: SEED });

    expect(screen.getByTestId('icebreaker-prompt-eyebrow')).toHaveTextContent(
      'QUESTION',
    );
    expect(screen.getByTestId('icebreaker-prompt-question')).toHaveTextContent(
      SUMMARY.icebreaker!.mainQuestion,
    );
    expect(
      screen.getByTestId('icebreaker-prompt-divider').tagName,
    ).toBe('HR');
    const followUp = screen.getByTestId('icebreaker-prompt-followup');
    expect(followUp).toHaveTextContent(SUMMARY.icebreaker!.followUpQuestion);
    expect(followUp.className).toContain('icebreaker-prompt-followup');
  });

  it('gives the Study Leader introText, the examples card, the count pill, and the Begin Reading → CTA', () => {
    const onNextSection = vi.fn();
    renderScreen({
      role: 'Study Leader',
      localStudyDocument: SEED,
      onNextSection,
    });

    expect(screen.getByTestId('icebreaker-intro')).toHaveTextContent(
      SUMMARY.icebreaker!.introText,
    );
    const examples = screen.getAllByTestId('icebreaker-examples-item');
    expect(examples).toHaveLength(SEED_EXAMPLES.length);
    for (const example of SEED_EXAMPLES) {
      expect(screen.getByText(example)).toBeInTheDocument();
    }
    expect(screen.getByTestId('icebreaker-examples-note')).toHaveTextContent(
      SEED_LEADER_NOTE,
    );
    expect(screen.getByTestId('icebreaker-count-pill-text')).toHaveTextContent(
      '0 PEOPLE HAVE RAISED THEIR HAND',
    );
    fireEvent.click(screen.getByTestId('icebreaker-advance-cta'));
    expect(onNextSection).toHaveBeenCalledTimes(1);
  });

  it('gives the Participant the SHARE WHEN READY hero, follow-up, fixed sub-copy, bronze orb, and count pill', () => {
    renderScreen();

    expect(screen.getByTestId('icebreaker-share-eyebrow')).toHaveTextContent(
      'SHARE WHEN READY',
    );
    expect(screen.getByTestId('icebreaker-share-question')).toHaveTextContent(
      SUMMARY.icebreaker!.mainQuestion,
    );
    expect(screen.getByTestId('icebreaker-share-followup')).toHaveTextContent(
      SUMMARY.icebreaker!.followUpQuestion,
    );
    expect(screen.getByTestId('icebreaker-share-subcopy')).toHaveTextContent(
      'The leader will give you a moment to share your reflection.',
    );
    expect(
      screen.getByTestId('icebreaker-orb-caption'),
    ).toHaveTextContent('Tap to raise your hand');
    expect(screen.getByTestId('icebreaker-orb-hint')).toHaveTextContent(
      'The leader will call on you to share.',
    );
    expect(screen.getByTestId('hand-raise-orb')).toBeInTheDocument();
    expect(screen.getByTestId('icebreaker-count-pill-text')).toHaveTextContent(
      '0 PEOPLE HAVE RAISED THEIR HAND',
    );
    // Participants have no advance control and no leader intro.
    expect(screen.queryByTestId('icebreaker-advance-cta')).toBeNull();
    expect(screen.queryByTestId('icebreaker-intro')).toBeNull();
  });
});

describe('IcebreakerScreen — Scenario 2 leader-only fields stay out of the Participant DOM', () => {
  it('renders the facilitator card from localStudyDocument on the leader screen only', () => {
    renderScreen({ role: 'Study Leader', localStudyDocument: SEED });

    expect(screen.getByTestId('icebreaker-examples-eyebrow')).toHaveTextContent(
      'EXAMPLES TO LISTEN FOR',
    );
    expect(screen.getByTestId('icebreaker-examples-note')).toHaveTextContent(
      SEED_LEADER_NOTE,
    );
    for (const example of SEED_EXAMPLES) {
      expect(screen.getByText(example)).toBeInTheDocument();
    }
  });

  it('keeps every leader-only string and key out of the Participant DOM', () => {
    renderScreen({ role: 'Participant', localStudyDocument: SEED });

    const dom = document.body.textContent ?? '';
    expect(dom).not.toContain('Examples to Listen For');
    expect(dom).not.toContain('EXAMPLES TO LISTEN FOR');
    expect(dom).not.toContain(SEED_LEADER_NOTE);
    for (const example of SEED_EXAMPLES) {
      expect(dom).not.toContain(example);
    }
    expect(dom).not.toContain('leaderNote');
    expect(dom).not.toContain('examplesToListenFor');
    expect(screen.queryByTestId('icebreaker-examples-card')).toBeNull();
  });
});

describe('IcebreakerScreen — live count, orb captions, and fallbacks', () => {
  it('pluralizes the count pill copy with literal uppercase phrasing', () => {
    expect(formatIcebreakerRaisedCount(0)).toBe(
      '0 PEOPLE HAVE RAISED THEIR HAND',
    );
    expect(formatIcebreakerRaisedCount(1)).toBe(
      '1 PERSON HAS RAISED THEIR HAND',
    );
    expect(formatIcebreakerRaisedCount(2)).toBe(
      '2 PEOPLE HAVE RAISED THEIR HAND',
    );
  });

  it('shows the live count on both roles and the raised-state caption on the orb', () => {
    const raised: RaisedHandEntry[] = [
      { memberId: 'member-1', raisedAt: '2026-10-29T19:32:00.000Z' },
      { memberId: 'member-2', raisedAt: '2026-10-29T19:32:05.000Z' },
    ];
    const { unmount } = renderScreen({ session: makeSession(raised) });
    expect(screen.getByTestId('icebreaker-count-pill-text')).toHaveTextContent(
      '2 PEOPLE HAVE RAISED THEIR HAND',
    );
    expect(
      screen.getByTestId('icebreaker-orb-caption'),
    ).toHaveTextContent('Tap again to lower');
    expect(screen.getByTestId('hand-raise-orb')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    unmount();

    renderScreen({
      role: 'Study Leader',
      session: makeSession([raised[0]!]),
      localStudyDocument: SEED,
    });
    expect(screen.getByTestId('icebreaker-count-pill-text')).toHaveTextContent(
      '1 PERSON HAS RAISED THEIR HAND',
    );
  });

  it('derives the own raised-hand state from memberId and dispatches the toggle', () => {
    const onToggleHandRaised = vi.fn();
    renderScreen({
      session: makeSession([
        { memberId: 'member-2', raisedAt: '2026-10-29T19:32:05.000Z' },
      ]),
      memberId: 'member-1',
      onToggleHandRaised,
    });

    const orb = screen.getByTestId('hand-raise-orb');
    expect(orb).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(orb);
    expect(onToggleHandRaised).toHaveBeenCalledWith(true);
  });

  it('falls back to the neutral facilitator note when the local study document is unavailable', () => {
    renderScreen({ role: 'Study Leader', localStudyDocument: null });

    expect(
      screen.getByTestId('icebreaker-examples-fallback'),
    ).toHaveTextContent('Facilitator examples unavailable on this device.');
    expect(screen.queryByTestId('icebreaker-examples-list')).toBeNull();
    expect(screen.queryByTestId('icebreaker-examples-note')).toBeNull();
  });

  it('falls back gracefully when the synced study summary is unavailable', () => {
    const { unmount } = renderScreen({ session: makeSession([], null) });

    expect(screen.getByTestId('icebreaker-title')).toHaveTextContent(
      'Icebreaker',
    );
    expect(screen.getByTestId('icebreaker-eyebrow')).toHaveTextContent(
      'ICEBREAKER',
    );
    expect(screen.getByTestId('icebreaker-share-question')).toHaveTextContent(
      'The leader will share the icebreaker question shortly.',
    );
    unmount();

    renderScreen({ role: 'Study Leader', session: makeSession([], null) });
    expect(
      screen.getByTestId('icebreaker-prompt-question'),
    ).toHaveTextContent(
      'The leader will share the icebreaker question shortly.',
    );
  });
});

describe('IcebreakerScreen — stage wiring and canvas budget', () => {
  it('wires the sanctuary-emblem hospitality stage on mount', () => {
    renderScreen();
    expect(useSacredStageStore.getState().stage).toBe('sanctuary-emblem');
    expect(useSacredStageStore.getState().accentMode).toBe('hospitality');
  });

  it('mounts no canvas of its own (single Sacred3DScene budget)', () => {
    renderScreen({ role: 'Study Leader', localStudyDocument: SEED });
    expect(document.querySelectorAll('canvas')).toHaveLength(0);
  });
});

describe('IcebreakerScreen — reduced-motion guards', () => {
  it('animates the count pill under default motion but not under prefers-reduced-motion', () => {
    mockReducedMotion(false);
    const { unmount } = render(
      <HandRaiseCountPill count={2} />,
    );
    const value = screen.getByTestId('icebreaker-count-pill-value');
    expect(value.getAttribute('style') ?? '').not.toBe('');
    unmount();

    mockReducedMotion(true);
    render(<HandRaiseCountPill count={2} />);
    const reduced = screen.getByTestId('icebreaker-count-pill-value');
    // No transform/opacity animation styles are applied when motion is reduced.
    expect(reduced.getAttribute('style') ?? '').not.toContain('translate');
  });
});

describe('Icebreaker screen CSS baseline (>= 16px text, >= 44px targets, DESIGN overrides)', () => {
  it('keeps the mobile ergonomics floors and the bronze orb recolor in global.css', () => {
    const cssPath = resolve(process.cwd(), 'src/client/styles/global.css');
    const css = readFileSync(cssPath, 'utf-8');

    // Sticky gold CTA at the 56px primary-button floor with >= 16px text.
    expect(css).toMatch(
      /\.icebreaker-advance-cta\s*\{[^}]*min-height: 56px/,
    );
    expect(css).toMatch(
      /\.icebreaker-advance-cta\s*\{[^}]*font-size: 1\.05rem/,
    );
    // >= 44px interactive targets.
    expect(css).toMatch(
      /\.icebreaker-count-pill\s*\{[^}]*min-height: 44px/,
    );
    // Participant copy is above the 16px input-text floor.
    expect(css).toMatch(
      /\.icebreaker-orb-caption\s*\{[^}]*font-size: 1rem/,
    );
    expect(css).toMatch(
      /\.icebreaker-share-question\s*\{[^}]*font-size: 1\.45rem/,
    );
    // Bronze DESIGN override #3 recolors the shared orb via descendants only.
    expect(css).toMatch(/\.icebreaker-orb-wrap \.hand-raise-orb\s*\{/);
    expect(css).toMatch(/rgba\(226, 168, 62, 0\.32\)/);
    expect(css).toMatch(
      /\.icebreaker-orb-wrap \.hand-raise-orb-sublabel\s*\{[^}]*display: none/,
    );
    // No horizontal overflow at 320px: zero-min-width columns + wrap-anywhere text.
    expect(css).toMatch(/\.icebreaker-screen\s*\{[^}]*min-width: 0/);
    expect(css).toMatch(
      /\.icebreaker-share-question\s*\{[^}]*overflow-wrap: anywhere/,
    );
    expect(css).toMatch(
      /\.icebreaker-prompt-question\s*\{[^}]*overflow-wrap: anywhere/,
    );
  });
});

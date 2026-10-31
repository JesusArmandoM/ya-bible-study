// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GospelReadingScreen } from '../../src/client/components/reading/GospelReadingScreen';
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

function makeSession(
  volunteerTurnOverrides: Partial<PublicLiveSessionSnapshot['volunteerTurn']> = {},
  study: SessionStudySummary | null = SUMMARY,
): PublicLiveSessionSnapshot {
  return {
    sessionCode: 'ABC123',
    status: 'in_progress',
    currentSectionIndex: 2,
    currentSectionId: 'section_3_reading',
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
      sectionId: 'section_3_reading',
      mode: 'gated_reading',
      raisedHands: [],
      candidateMemberId: null,
      candidateExpiresAt: null,
      selectedMemberId: null,
      completedAt: null,
      ...volunteerTurnOverrides,
    },
    protocolVersion: 3,
  };
}

const noop = () => {};

function renderScreen(
  overrides: Partial<Parameters<typeof GospelReadingScreen>[0]> = {},
) {
  const props = {
    role: 'Participant' as const,
    session: makeSession(),
    memberId: 'member-1',
    onToggleHandRaised: noop,
    ...overrides,
  };
  return render(<GospelReadingScreen {...props} />);
}

describe('GospelReadingScreen — Section 3 Gospel Reading Turn', () => {
  afterEach(() => {
    useSacredStageStore.getState().reset();
    vi.restoreAllMocks();
  });

  describe('Scenario 1: Sole Gospel Reading presentation (both roles)', () => {
    it('renders SECTION 3 OF 5, 60%, title, and Matthew 15:21–28 citation for Study Leader', () => {
      renderScreen({
        role: 'Study Leader',
        memberId: 'leader-1',
        localStudyDocument: SEED,
      });

      expect(screen.getByTestId('section-one-label')).toHaveTextContent(
        'SECTION 3 OF 5',
      );
      expect(screen.getByTestId('section-one-percent')).toHaveTextContent('60%');
      expect(screen.getByTestId('reading-title')).toHaveTextContent(
        'Gospel Reading',
      );
      expect(screen.getByTestId('reading-citation')).toHaveTextContent(
        'Matthew 15:21–28',
      );
      expect(screen.getByTestId('scripture-card')).toBeInTheDocument();
      expect(screen.getByTestId('scripture-card-citation')).toHaveTextContent(
        'Matthew 15:21–28',
      );
    });

    it('renders SECTION 3 OF 5, 60%, and solely Gospel passage for Participant without Mass tabs', () => {
      renderScreen({
        role: 'Participant',
        memberId: 'member-1',
      });

      expect(screen.getByTestId('section-one-label')).toHaveTextContent(
        'SECTION 3 OF 5',
      );
      expect(screen.getByTestId('section-one-percent')).toHaveTextContent('60%');
      expect(screen.getByTestId('scripture-card')).toBeInTheDocument();

      // Sole Gospel Reading Invariant: assert DOM contains no Old Testament, Psalm, or Epistle tabs
      const text = document.body.textContent ?? '';
      expect(text).not.toContain('First Reading');
      expect(text).not.toContain('Second Reading');
      expect(text).not.toContain('Responsorial Psalm');
      expect(text).not.toContain('Isaiah');
      expect(text).not.toContain('Romans');

      // Check strictly zero occurrences of legacy role terminology
      const forbiddenWord = ['Assis', 'tant'].join('');
      expect(text).not.toContain(forbiddenWord);
    });

    it('mounts gospel-codex sacred stage on render', () => {
      renderScreen({ role: 'Participant', memberId: 'member-1' });
      expect(useSacredStageStore.getState().stage).toBe('gospel-codex');
    });
  });

  describe('Scenario 3: Volunteering via Read aloud orb and avatar roster strip', () => {
    it('Participant sees indigo Read aloud orb and tapping calls onToggleHandRaised', () => {
      const toggle = vi.fn();
      renderScreen({
        role: 'Participant',
        memberId: 'member-1',
        onToggleHandRaised: toggle,
      });

      const orb = screen.getByTestId('read-aloud-orb');
      expect(orb).toBeInTheDocument();
      expect(orb).toHaveAttribute('data-raised', 'false');

      fireEvent.click(orb);
      expect(toggle).toHaveBeenCalledWith(true);
    });

    it('Leader sees reader counter, Choose reader button, and Random button', () => {
      const session = makeSession({
        raisedHands: [{ memberId: 'member-1', raisedAt: '2026-10-31T12:00:00.000Z' }],
      });
      renderScreen({
        role: 'Study Leader',
        memberId: 'leader-1',
        session,
        localStudyDocument: SEED,
        onPickRandomly: vi.fn(),
      });

      expect(screen.getByTestId('leader-reader-card')).toBeInTheDocument();
      expect(screen.getByTestId('reader-count-chip')).toHaveTextContent('1 / 2');
      expect(screen.getByTestId('choose-reader-button')).toBeEnabled();
      expect(screen.getByTestId('random-picker-button')).toBeInTheDocument();
    });

    it('Leader can click avatar in ParticipantRosterStrip to assign reader', () => {
      const choose = vi.fn();
      renderScreen({
        role: 'Study Leader',
        memberId: 'leader-1',
        localStudyDocument: SEED,
        onChooseVolunteer: choose,
      });

      const avatar = screen.getByTestId('roster-avatar-member-1');
      expect(avatar).toBeInTheDocument();

      fireEvent.click(avatar);
      expect(choose).toHaveBeenCalledWith('member-1');
    });
  });

  describe('Scenario 4: Random selection integration in Section 3', () => {
    it('renders RandomSelectionPanel when volunteerTurn has staged candidate', () => {
      const session = makeSession({
        candidateMemberId: 'member-1',
        candidateExpiresAt: new Date(Date.now() + 25_000).toISOString(),
      });
      renderScreen({
        role: 'Study Leader',
        memberId: 'leader-1',
        session,
        localStudyDocument: SEED,
      });

      expect(screen.getByTestId('random-selection-panel')).toBeInTheDocument();
      expect(screen.getByTestId('random-candidate-name')).toHaveTextContent('Daniel');
      expect(screen.getByTestId('random-retry-button')).toBeInTheDocument();
      expect(screen.getByTestId('random-confirm-button')).toBeInTheDocument();
      expect(useSacredStageStore.getState().stage).toBe('random-polyhedron');
    });
  });

  describe('Scenario 5: Exclusive Done Reading turn completion and gated advance', () => {
    it('chosen reader receives exclusive YOU WERE CHOSEN view with Done Reading button', () => {
      const completeTurn = vi.fn();
      const session = makeSession({
        selectedMemberId: 'member-1',
      });
      renderScreen({
        role: 'Participant',
        memberId: 'member-1',
        session,
        onCompleteTurn: completeTurn,
      });

      expect(screen.getByTestId('reading-chosen-view')).toBeInTheDocument();
      expect(screen.getByTestId('reading-chosen-pill')).toHaveTextContent('YOU WERE CHOSEN');
      expect(screen.getByTestId('reading-chosen-title')).toHaveTextContent("It's your turn to read");
      expect(screen.getByTestId('reading-done-button')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('reading-done-button'));
      expect(completeTurn).toHaveBeenCalledTimes(1);

      // Sacred stage switches to chosen-aura
      expect(useSacredStageStore.getState().stage).toBe('chosen-aura');
    });

    it('bystander participant sees who is reading and zero Done button', () => {
      const session = makeSession({
        selectedMemberId: 'member-1',
      });
      renderScreen({
        role: 'Participant',
        memberId: 'member-2', // Maria (bystander)
        session,
      });

      expect(screen.queryByTestId('reading-chosen-view')).not.toBeInTheDocument();
      expect(screen.queryByTestId('reading-done-button')).not.toBeInTheDocument();
      expect(screen.getByTestId('reading-active-volunteer-note')).toHaveTextContent(
        'Daniel is reading aloud',
      );
      expect(screen.getByTestId('locked-advance-bar')).toBeInTheDocument();
    });

    it('Study Leader sees locked advance bar and override button before completion', () => {
      const overrideTurn = vi.fn();
      const session = makeSession({
        selectedMemberId: 'member-1',
        completedAt: null,
      });
      renderScreen({
        role: 'Study Leader',
        memberId: 'leader-1',
        session,
        localStudyDocument: SEED,
        onOverrideTurn: overrideTurn,
      });

      expect(screen.getByTestId('locked-advance-bar')).toHaveTextContent(
        'Reading proceeds: Waiting for reader to finish to advance',
      );
      const overrideBtn = screen.getByTestId('reading-override-button');
      expect(overrideBtn).toBeInTheDocument();

      fireEvent.click(overrideBtn);
      expect(overrideTurn).toHaveBeenCalledTimes(1);
    });

    it('Study Leader locked bar morphs into Begin Discussion → when completedAt is set', () => {
      const nextSection = vi.fn();
      const session = makeSession({
        selectedMemberId: 'member-1',
        completedAt: '2026-10-31T12:05:00.000Z',
      });
      renderScreen({
        role: 'Study Leader',
        memberId: 'leader-1',
        session,
        localStudyDocument: SEED,
        onNextSection: nextSection,
      });

      expect(screen.queryByTestId('locked-advance-bar')).not.toBeInTheDocument();
      const cta = screen.getByTestId('reading-advance-cta');
      expect(cta).toBeInTheDocument();
      expect(cta).toHaveTextContent('Begin Discussion →');

      fireEvent.click(cta);
      expect(nextSection).toHaveBeenCalledTimes(1);
    });
  });

  describe('Scenario 6: Facilitator liturgical context privacy', () => {
    it('displays leaderLiturgicalContextNote exclusively on Study Leader screen', () => {
      renderScreen({
        role: 'Study Leader',
        memberId: 'leader-1',
        localStudyDocument: SEED,
      });

      const note = screen.getByTestId('leader-liturgical-context-note');
      expect(note).toBeInTheDocument();
      expect(note).toHaveTextContent('Isaiah 56');
    });

    it('never renders leaderLiturgicalContextNote on Participant screen', () => {
      renderScreen({
        role: 'Participant',
        memberId: 'member-1',
        localStudyDocument: SEED,
      });

      expect(screen.queryByTestId('leader-liturgical-context-note')).not.toBeInTheDocument();
      expect(document.body.textContent).not.toContain('Isaiah 56');
    });
  });

  describe('CSS and Design Invariants', () => {
    it('verifies scripture-card max-height for mobile viewport non-overlap (override #4)', () => {
      const css = readFileSync(
        resolve(__dirname, '../../src/client/styles/global.css'),
        'utf8',
      );
      expect(css).toContain('.scripture-card');
      expect(css).toContain('max-height: 280px');
      expect(css).toContain('overflow-y: auto');
    });

    it('verifies reading-done-button and advance-cta meet >= 44px touch target requirement', () => {
      const css = readFileSync(
        resolve(__dirname, '../../src/client/styles/global.css'),
        'utf8',
      );
      expect(css).toContain('.reading-done-button');
      expect(css).toContain('min-height: 54px');
      expect(css).toContain('.reading-advance-cta');
      expect(css).toContain('min-height: 56px');
    });

    it('verifies zero occurrences of legacy role terminology in reading components', () => {
      const readingScreenFile = readFileSync(
        resolve(__dirname, '../../src/client/components/reading/GospelReadingScreen.tsx'),
        'utf8',
      );
      const scriptureCardFile = readFileSync(
        resolve(__dirname, '../../src/client/components/reading/ScriptureCard.tsx'),
        'utf8',
      );
      const forbiddenWord = ['Assis', 'tant'].join('');
      expect(readingScreenFile).not.toContain(forbiddenWord);
      expect(scriptureCardFile).not.toContain(forbiddenWord);
    });
  });
});

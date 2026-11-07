// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeepAnalysisScreen } from '../../src/client/components/analysis/DeepAnalysisScreen';
import { useSacredStageStore } from '../../src/client/state/sacredStageStore';
import { getDefaultStudyDocument } from '../../src/server/studies/greatIsYourFaithSeed';
import {
  toSessionStudySummary,
  type PublicLiveSessionSnapshot,
  type SessionStudySummary,
} from '../../src/shared/session';

const SEED = getDefaultStudyDocument();
const SUMMARY: SessionStudySummary = toSessionStudySummary(SEED);

function makeSection4Session(
  overrides: Partial<PublicLiveSessionSnapshot> = {},
): PublicLiveSessionSnapshot {
  return {
    sessionCode: 'FAITH4',
    status: 'in_progress',
    currentSectionIndex: 3,
    currentSectionId: 'section_4_deep_analysis',
    createdAt: '2026-11-06T20:00:00.000Z',
    startedAt: '2026-11-06T20:05:00.000Z',
    endedAt: null,
    connectedMemberCount: 8,
    connectedParticipantCount: 7,
    members: [
      {
        memberId: 'leader-1',
        displayName: 'Armando Leader',
        initials: 'AL',
        avatarPalette: 'gold',
        role: 'Study Leader',
        connectionStatus: 'connected',
        joinedAt: '2026-11-06T20:00:00.000Z',
      },
      {
        memberId: 'part-1',
        displayName: 'John Participant',
        initials: 'JP',
        avatarPalette: 'indigo',
        role: 'Participant',
        connectionStatus: 'connected',
        joinedAt: '2026-11-06T20:01:00.000Z',
      },
    ],
    study: SUMMARY,
    volunteerTurn: null,
    discussionState: null,
    protocolVersion: 3,
    ...overrides,
  };
}

describe('DeepAnalysisScreen (Section 4)', () => {
  beforeEach(() => {
    useSacredStageStore.setState({ stage: 'sanctuary-emblem' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Scenario 1: renders full Deep Analysis screen for Study Leader with all canonical items and header progress', () => {
    const session = makeSection4Session();
    render(
      <DeepAnalysisScreen
        role="Study Leader"
        isLeader={true}
        session={session}
        localStudyDocument={SEED}
      />,
    );

    expect(screen.getByTestId('deep-analysis-screen')).toBeInTheDocument();
    expect(screen.getByTestId('deep-analysis-placeholder')).toBeInTheDocument();

    // SectionProgressHeader asserts SECTION 4 OF 6 and 67%
    expect(screen.getByTestId('section-one-label')).toHaveTextContent('SECTION 4 OF 6');
    expect(screen.getByTestId('section-one-percent')).toHaveTextContent('67%');

    // Eyebrow and title
    expect(screen.getByTestId('deep-analysis-eyebrow')).toHaveTextContent('DEEP ANALYSIS');
    expect(screen.getByTestId('deep-analysis-title')).toBeInTheDocument();

    // Canonical item counts
    const commentaryItems = screen.getAllByTestId('commentary-item');
    expect(commentaryItems).toHaveLength(10); // A through J
    const doctrineItems = screen.getAllByTestId('doctrine-item');
    expect(doctrineItems).toHaveLength(4); // A through D
    const applicationItems = screen.getAllByTestId('application-item');
    expect(applicationItems).toHaveLength(4); // A through D

    // Stage syncs to gospel-codex
    expect(useSacredStageStore.getState().stage).toBe('gospel-codex');
  });

  it('Scenario 2: Study Leader sees bidirectional navigation controls and Share QR button', () => {
    const session = makeSection4Session();
    const handlePrevious = vi.fn();
    const handleNext = vi.fn();

    render(
      <DeepAnalysisScreen
        role="Study Leader"
        isLeader={true}
        session={session}
        localStudyDocument={SEED}
        onPreviousSection={handlePrevious}
        onNextSection={handleNext}
      />,
    );

    // Share QR trigger in header
    expect(screen.getByTestId('section-share-qr-trigger')).toBeInTheDocument();

    // Previous button
    const prevBtn = screen.getByTestId('previous-section-btn');
    expect(prevBtn).toHaveTextContent('← Previous');
    fireEvent.click(prevBtn);
    expect(handlePrevious).toHaveBeenCalledTimes(1);

    // Continue CTA
    const nextBtn = screen.getByTestId('deep-analysis-advance-cta');
    expect(nextBtn).toHaveTextContent('Continue to Discussion →');
    fireEvent.click(nextBtn);
    expect(handleNext).toHaveBeenCalledTimes(1);

    // Participant locked bar must not exist for Study Leader
    expect(screen.queryByTestId('locked-advance-bar')).toBeNull();

    // Facilitator patristic notes visible for Study Leader
    const patristicNotes = screen.getAllByTestId('patristic-note');
    expect(patristicNotes.length).toBeGreaterThan(0);
  });

  it('Scenario 3: Participant sees read-only status bar, no leader navigation buttons, and no facilitator notes', () => {
    const session = makeSection4Session();
    const handlePrevious = vi.fn();
    const handleNext = vi.fn();

    render(
      <DeepAnalysisScreen
        role="Participant"
        isLeader={false}
        session={session}
        onPreviousSection={handlePrevious}
        onNextSection={handleNext}
      />,
    );

    // Leader buttons are NOT in Participant DOM
    expect(screen.queryByTestId('previous-section-btn')).toBeNull();
    expect(screen.queryByTestId('deep-analysis-advance-cta')).toBeNull();
    expect(screen.queryByTestId('section-share-qr-trigger')).toBeNull();

    // Participant sees locked status bar
    const lockedBar = screen.getByTestId('locked-advance-bar');
    expect(lockedBar).toBeInTheDocument();
    expect(lockedBar).toHaveAttribute('data-role', 'participant');
    expect(lockedBar).toHaveAttribute('role', 'status');
    expect(lockedBar).toHaveTextContent(/leader/i);

    // Facilitator patristic notes must not appear for Participant
    expect(screen.queryByTestId('patristic-note')).toBeNull();
  });

  it('supports interactive section tabs (All, Commentary, Doctrine, Application)', () => {
    const session = makeSection4Session();
    render(
      <DeepAnalysisScreen
        role="Participant"
        isLeader={false}
        session={session}
      />,
    );

    // Initial state: 'all' -> all 18 items rendered
    expect(screen.getAllByTestId('commentary-item')).toHaveLength(10);
    expect(screen.getAllByTestId('doctrine-item')).toHaveLength(4);
    expect(screen.getAllByTestId('application-item')).toHaveLength(4);

    // Switch to Commentary tab
    fireEvent.click(screen.getByTestId('tab-commentary'));
    expect(screen.getAllByTestId('commentary-item')).toHaveLength(10);
    expect(screen.queryByTestId('doctrine-item')).toBeNull();
    expect(screen.queryByTestId('application-item')).toBeNull();

    // Switch to Doctrine tab
    fireEvent.click(screen.getByTestId('tab-doctrine'));
    expect(screen.queryByTestId('commentary-item')).toBeNull();
    expect(screen.getAllByTestId('doctrine-item')).toHaveLength(4);
    expect(screen.queryByTestId('application-item')).toBeNull();

    // Switch to Application tab
    fireEvent.click(screen.getByTestId('tab-application'));
    expect(screen.queryByTestId('commentary-item')).toBeNull();
    expect(screen.queryByTestId('doctrine-item')).toBeNull();
    expect(screen.getAllByTestId('application-item')).toHaveLength(4);

    // Switch back to All tab
    fireEvent.click(screen.getByTestId('tab-all'));
    expect(screen.getAllByTestId('commentary-item')).toHaveLength(10);
    expect(screen.getAllByTestId('doctrine-item')).toHaveLength(4);
    expect(screen.getAllByTestId('application-item')).toHaveLength(4);
  });

  it('renders scripture citations, CCC pills, and quoted text in commentary cards', () => {
    const session = makeSection4Session();
    render(
      <DeepAnalysisScreen
        role="Participant"
        isLeader={false}
        session={session}
      />,
    );

    // Matthew 15:21 citation
    expect(screen.getByText('Matthew 15:21')).toBeInTheDocument();
    expect(
      screen.getByText(/Jesus withdrew to the region of Tyre and Sidon/i),
    ).toBeInTheDocument();

    // Catechism reference pills
    expect(screen.getAllByText('CCC 543').length).toBeGreaterThan(0);
  });

  it('guarantees zero occurrences of "Assistant" in rendered DOM', () => {
    const session = makeSection4Session();
    const { container } = render(
      <DeepAnalysisScreen
        role="Study Leader"
        isLeader={true}
        session={session}
        localStudyDocument={SEED}
      />,
    );

    expect(container.innerHTML).not.toContain('Assistant');
  });
});

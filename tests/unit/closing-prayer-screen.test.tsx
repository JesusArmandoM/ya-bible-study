// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClosingPrayerScreen } from '../../src/client/components/closing/ClosingPrayerScreen';
import { useSacredStageStore } from '../../src/client/state/sacredStageStore';
import { getDefaultStudyDocument } from '../../src/server/studies/greatIsYourFaithSeed';
import {
  toSessionStudySummary,
  type PublicLiveSessionSnapshot,
  type SessionStudySummary,
} from '../../src/shared/session';

const SEED = getDefaultStudyDocument();
const SUMMARY: SessionStudySummary = toSessionStudySummary(SEED);

function makeSection5Session(
  overrides: Partial<PublicLiveSessionSnapshot> = {},
): PublicLiveSessionSnapshot {
  return {
    sessionCode: 'FAITH5',
    status: 'in_progress',
    currentSectionIndex: 4,
    currentSectionId: 'section_5_closing',
    createdAt: '2026-10-31T20:00:00.000Z',
    startedAt: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
    endedAt: null,
    connectedMemberCount: 13,
    connectedParticipantCount: 12,
    members: [
      {
        memberId: 'leader-1',
        displayName: 'Armando Leader',
        initials: 'AL',
        avatarPalette: 'gold',
        role: 'Study Leader',
        connectionStatus: 'connected',
        joinedAt: '2026-10-31T20:00:00.000Z',
      },
      {
        memberId: 'part-1',
        displayName: 'John Participant',
        initials: 'JP',
        avatarPalette: 'indigo',
        role: 'Participant',
        connectionStatus: 'connected',
        joinedAt: '2026-10-31T20:01:00.000Z',
      },
    ],
    study: SUMMARY,
    volunteerTurn: null,
    discussionState: null,
    protocolVersion: 3,
    ...overrides,
  };
}

describe('ClosingPrayerScreen component (Section 5)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useSacredStageStore.setState({ stage: 'sanctuary-emblem' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders progress header at 100% and syncs stage to star-of-faith', () => {
    const session = makeSection5Session();
    render(
      <ClosingPrayerScreen
        role="Study Leader"
        session={session}
        onFinishStudy={vi.fn()}
      />,
    );

    expect(screen.getByTestId('section-one-label')).toHaveTextContent('SECTION 5 OF 5');
    expect(screen.getByTestId('section-one-percent')).toHaveTextContent('100%');
    expect(screen.getByText('WRAPPING UP')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Closing Prayer' })).toBeInTheDocument();
    expect(useSacredStageStore.getState().stage).toBe('star-of-faith');
  });

  it('renders LiveSessionStatsCard with 5 sections, elapsed duration, and participant count', () => {
    const session = makeSection5Session();
    render(
      <ClosingPrayerScreen
        role="Study Leader"
        session={session}
        onFinishStudy={vi.fn()}
      />,
    );

    const statsCard = screen.getByTestId('session-stats-card');
    expect(statsCard).toBeInTheDocument();

    expect(screen.getByTestId('stat-sections')).toHaveTextContent('5');
    expect(screen.getByTestId('stat-sections')).toHaveTextContent('SECTIONS');

    expect(screen.getByTestId('stat-duration')).toHaveTextContent('42m');
    expect(screen.getByTestId('stat-duration')).toHaveTextContent('DURATION');

    expect(screen.getByTestId('stat-participants')).toHaveTextContent('12');
    expect(screen.getByTestId('stat-participants')).toHaveTextContent('PARTICIPANTS');
  });

  it('renders NextWeekCard with title and display label', () => {
    const session = makeSection5Session();
    render(
      <ClosingPrayerScreen
        role="Study Leader"
        session={session}
        onFinishStudy={vi.fn()}
      />,
    );

    const nextWeekCard = screen.getByTestId('next-week-card');
    expect(nextWeekCard).toBeInTheDocument();
    expect(screen.getByText('NEXT WEEK AT CHURCH')).toBeInTheDocument();
    expect(screen.getByTestId('next-week-title')).toHaveTextContent('Faith that Endures');
    expect(screen.getByTestId('next-week-title')).toHaveTextContent('James 1:2–4');
  });

  it('renders 4 weekly challenges and allows interactive selection persisted in localStorage', () => {
    const session = makeSection5Session();
    render(
      <ClosingPrayerScreen
        role="Participant"
        session={session}
        memberId="part-1"
        onFinishStudy={vi.fn()}
      />,
    );

    expect(screen.getByTestId('weekly-challenges-card')).toBeInTheDocument();
    expect(screen.getByText('CHOOSE ONE CHALLENGE FOR THE WEEK')).toBeInTheDocument();

    const ch1 = screen.getByTestId('weekly-challenge-1');
    const ch2 = screen.getByTestId('weekly-challenge-2');
    const ch3 = screen.getByTestId('weekly-challenge-3');
    const ch4 = screen.getByTestId('weekly-challenge-4');

    expect(ch1).toHaveTextContent('Persistent Prayer');
    expect(ch2).toHaveTextContent('Humble Prayer');
    expect(ch3).toHaveTextContent('Catholic Hospitality');
    expect(ch4).toHaveTextContent('Eucharistic Humility');

    // Tap challenge 2
    fireEvent.click(ch2);
    expect(ch2.className).toContain('is-selected');
    expect(window.localStorage.getItem('ya-bible-study.weekly-challenge.FAITH5.part-1')).toBe('2');

    // Tap challenge 3 switches selection
    fireEvent.click(ch3);
    expect(ch3.className).toContain('is-selected');
    expect(ch2.className).not.toContain('is-selected');
    expect(window.localStorage.getItem('ya-bible-study.weekly-challenge.FAITH5.part-1')).toBe('3');
  });

  it('renders full Closing Prayer text card', () => {
    const session = makeSection5Session();
    render(
      <ClosingPrayerScreen
        role="Study Leader"
        session={session}
        onFinishStudy={vi.fn()}
      />,
    );

    const prayerCard = screen.getByTestId('closing-prayer-card');
    expect(prayerCard).toBeInTheDocument();
    expect(prayerCard).toHaveTextContent('Lord Jesus, Son of David, have mercy on us.');
    expect(prayerCard).toHaveTextContent('"Great is your faith." Amen.');
  });

  it('Study Leader sees Finish study button and tapping triggers onFinishStudy', () => {
    const session = makeSection5Session();
    const handleFinish = vi.fn();
    render(
      <ClosingPrayerScreen
        role="Study Leader"
        session={session}
        onFinishStudy={handleFinish}
      />,
    );

    const finishBtn = screen.getByTestId('finish-study-btn');
    expect(finishBtn).toBeInTheDocument();
    expect(finishBtn).toHaveTextContent('Finish study');
    expect(screen.queryByTestId('participant-waiting-bar')).not.toBeInTheDocument();

    fireEvent.click(finishBtn);
    expect(handleFinish).toHaveBeenCalledTimes(1);
  });

  it('Participant views calm locked waiting bar without Finish study button', () => {
    const session = makeSection5Session();
    const handleFinish = vi.fn();
    render(
      <ClosingPrayerScreen
        role="Participant"
        session={session}
        onFinishStudy={handleFinish}
      />,
    );

    expect(screen.queryByTestId('finish-study-btn')).not.toBeInTheDocument();
    const waitingBar = screen.getByTestId('participant-waiting-bar');
    expect(waitingBar).toBeInTheDocument();
    expect(waitingBar).toHaveTextContent('Waiting for Study Leader to conclude study...');
  });
});

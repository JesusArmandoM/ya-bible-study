// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiscussionScreen } from '../../src/client/components/discussion/DiscussionScreen';
import { getDefaultStudyDocument } from '../../src/server/studies/greatIsYourFaithSeed';
import type {
  PublicLiveSessionSnapshot,
  SessionDiscussionState,
  SessionStudySummary,
} from '../../src/shared/session';
import { toSessionStudySummary } from '../../src/shared/session';
import { useSacredStageStore } from '../../src/client/state/sacredStageStore';

const SEED = getDefaultStudyDocument();
const SUMMARY: SessionStudySummary = toSessionStudySummary(SEED);

const DEFAULT_DISCUSSION_STATE: SessionDiscussionState = {
  activeQuestionId: 'q-6',
  questions: [
    {
      id: 'q-6',
      number: 1,
      prompt: "What makes the Canaanite woman's faith 'great'?",
      category: 'Theological Focus',
      estimatedMinutes: 8,
    },
    {
      id: 'q-5',
      number: 2,
      prompt: "Have you ever felt God's silence — and what did you do?",
      category: 'Spiritual Life',
      estimatedMinutes: 9,
    },
    {
      id: 'q-8',
      number: 3,
      prompt: "Who do you need to pray 'Lord, help me' for this week?",
      category: 'Practical Application',
      estimatedMinutes: 8,
    },
  ],
  reflections: [],
};

function makeSession(
  discussionStateOverrides: Partial<SessionDiscussionState> = {},
): PublicLiveSessionSnapshot {
  return {
    sessionCode: 'ABC123',
    status: 'in_progress',
    currentSectionIndex: 3,
    currentSectionId: 'section_4_discussion',
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
    ],
    study: SUMMARY,
    volunteerTurn: null,
    discussionState: {
      ...DEFAULT_DISCUSSION_STATE,
      ...discussionStateOverrides,
    },
    protocolVersion: 3,
  };
}

const noop = () => {};

function renderScreen(
  overrides: Partial<Parameters<typeof DiscussionScreen>[0]> = {},
) {
  const props = {
    role: 'Study Leader' as const,
    session: makeSession(),
    localStudyDocument: SEED,
    memberId: 'leader-1',
    onSwitchQuestion: noop,
    onAddQuestion: noop,
    onNextSection: noop,
    ...overrides,
  };
  return render(<DiscussionScreen {...props} />);
}

describe('DiscussionScreen — Section 4 Deep Analysis & Discussion', () => {
  afterEach(() => {
    useSacredStageStore.getState().reset();
    vi.restoreAllMocks();
  });

  describe('Scenario 1: Initial Section 4 state and default curated queue', () => {
    it('renders SECTION 4 OF 5, 80%, title, and 3 default questions for Study Leader', () => {
      renderScreen({ role: 'Study Leader' });

      expect(screen.getByTestId('section-one-label').textContent).toBe(
        'SECTION 4 OF 5',
      );
      expect(screen.getByTestId('section-one-percent').textContent).toBe('80%');
      expect(screen.getByText('DEEP ANALYSIS · 25 MIN')).toBeTruthy();
      expect(screen.getByText('Lord, Help Me Pray')).toBeTruthy();

      // Study Leader sees queue with 3 questions
      expect(screen.getByTestId('leader-question-queue')).toBeTruthy();
      const card1 = screen.getByTestId('question-card-q-6');
      const card2 = screen.getByTestId('question-card-q-5');
      const card3 = screen.getByTestId('question-card-q-8');

      expect(card1.getAttribute('data-active')).toBe('true');
      expect(card2.getAttribute('data-active')).toBe('false');
      expect(card3.getAttribute('data-active')).toBe('false');

      expect(card1.textContent).toContain('Active');
      expect(card2.textContent).toContain('0 responses');
      expect(card3.textContent).toContain('0 responses');

      expect(card1.textContent).toContain('~8 min');
      expect(card2.textContent).toContain('~9 min');

      // Footnote text
      expect(
        screen.getByText(
          'Only you decide when to advance — mercy, not pace, is the goal.',
        ),
      ).toBeTruthy();

      // Zero occurrences of legacy terminology
      expect(document.body.textContent).not.toContain('Assistant');
    });

    it('renders active question card with QUESTION 1 OF 3 and lock pill for Participant', () => {
      renderScreen({ role: 'Participant', localStudyDocument: null });

      expect(screen.getByTestId('section-one-label').textContent).toBe(
        'SECTION 4 OF 5',
      );
      expect(screen.getByTestId('section-one-percent').textContent).toBe('80%');
      expect(screen.getByTestId('participant-question-progress').textContent).toBe(
        'QUESTION 1 OF 3',
      );

      // Active prompt rendered
      expect(screen.getByTestId('active-question-prompt').textContent).toBe(
        "What makes the Canaanite woman's faith 'great'?",
      );

      // Participant lock note
      expect(screen.getByTestId('participant-locked-note').textContent).toContain(
        'Only the leader decides when to advance',
      );

      // Participant has zero advance controls, zero question switching buttons, and zero pastoral notes
      expect(screen.queryByTestId('next-question-btn')).toBeNull();
      expect(screen.queryByTestId('add-question-trigger')).toBeNull();
      expect(screen.queryByTestId('pastoral-notes-trigger')).toBeNull();
      expect(document.body.textContent).not.toContain('Romans 11:29');
      expect(document.body.textContent).not.toContain('Chrysostom');
      expect(document.body.textContent).not.toContain('Augustine');
      expect(document.body.textContent).not.toContain('Jerome');
    });
  });

  describe('Scenario 2: Active question switching via Next question and card tap', () => {
    it('calls onSwitchQuestion with next question when tapping Next question →', () => {
      const onSwitchQuestion = vi.fn();
      renderScreen({ role: 'Study Leader', onSwitchQuestion });

      const nextBtn = screen.getByTestId('next-question-btn');
      fireEvent.click(nextBtn);

      expect(onSwitchQuestion).toHaveBeenCalledWith('q-5');
    });

    it('calls onSwitchQuestion when directly tapping Card 3', () => {
      const onSwitchQuestion = vi.fn();
      renderScreen({ role: 'Study Leader', onSwitchQuestion });

      const card3 = screen.getByTestId('question-card-q-8');
      fireEvent.click(card3);

      expect(onSwitchQuestion).toHaveBeenCalledWith('q-8');
    });

    it('morphs Next question into Begin Closing Prayer on the final question', () => {
      const onNextSection = vi.fn();
      renderScreen({
        role: 'Study Leader',
        session: makeSession({ activeQuestionId: 'q-8' }),
        onNextSection,
      });

      expect(screen.queryByTestId('next-question-btn')).toBeNull();
      const advanceBtn = screen.getByTestId('advance-section-5-btn');
      expect(advanceBtn.textContent).toContain('Begin Closing Prayer');

      fireEvent.click(advanceBtn);
      expect(onNextSection).toHaveBeenCalledTimes(1);
    });

    it('allows discreet Section 5 advancement anytime', () => {
      const onNextSection = vi.fn();
      renderScreen({
        role: 'Study Leader',
        session: makeSession({ activeQuestionId: 'q-6' }),
        onNextSection,
      });

      const directBtn = screen.getByTestId('advance-section-5-direct');
      fireEvent.click(directBtn);
      expect(onNextSection).toHaveBeenCalledTimes(1);
    });
  });

  describe('Scenario 3: Adding questions from 12-question bank and custom prompt', () => {
    it('opens modal and promotes bank question with sequence number 4', () => {
      const onAddQuestion = vi.fn();
      renderScreen({ role: 'Study Leader', onAddQuestion });

      const addBtn = screen.getByTestId('add-question-trigger');
      fireEvent.click(addBtn);

      expect(screen.getByTestId('add-question-modal')).toBeTruthy();

      // Promoting bank question q-2
      const promoteBtn = screen.getByTestId('add-bank-question-q-2');
      fireEvent.click(promoteBtn);

      expect(onAddQuestion).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'q-2',
          number: 4,
          category: 'Doctrinal/discussion',
        }),
      );
    });

    it('allows entering a custom question prompt', () => {
      const onAddQuestion = vi.fn();
      renderScreen({ role: 'Study Leader', onAddQuestion });

      fireEvent.click(screen.getByTestId('add-question-trigger'));
      fireEvent.click(screen.getByTestId('tab-custom-question'));

      const textarea = screen.getByTestId('custom-question-input');
      fireEvent.change(textarea, {
        target: { value: 'How does this scripture inspire you today?' },
      });

      const submitBtn = screen.getByTestId('submit-custom-question');
      fireEvent.click(submitBtn);

      expect(onAddQuestion).toHaveBeenCalledWith(
        expect.objectContaining({
          number: 4,
          prompt: 'How does this scripture inspire you today?',
          category: 'Custom Reflection',
        }),
      );
    });
  });

  describe('Scenario 4: Facilitator pastoral drawer & Romans 11:29 guardrail privacy', () => {
    it('opens Pastoral Notes drawer displaying Romans 11:29 guardrail, patristic commentary, and active question sample answer', () => {
      renderScreen({ role: 'Study Leader', localStudyDocument: SEED });

      const pastoralBtn = screen.getByTestId('pastoral-notes-trigger');
      fireEvent.click(pastoralBtn);

      expect(screen.getByTestId('pastoral-notes-drawer')).toBeTruthy();

      // Catholic doctrine tab is default
      expect(screen.getByTestId('pastoral-doctrine-section')).toBeTruthy();
      expect(document.body.textContent).toContain('ROMANS 11:29');
      expect(document.body.textContent).toContain('CCC 839–840');

      // Switch to commentary tab
      fireEvent.click(screen.getByTestId('pastoral-tab-commentary'));
      expect(screen.getByTestId('pastoral-commentary-section')).toBeTruthy();
      expect(document.body.textContent).toContain('St. Augustine');
      expect(document.body.textContent).toContain('St. John Chrysostom');
      expect(document.body.textContent).toContain('St. Jerome');

      // Switch to active question prompt notes tab
      fireEvent.click(screen.getByTestId('pastoral-tab-active-q'));
      expect(screen.getByTestId('pastoral-sample-answer')).toBeTruthy();
      expect(screen.getByTestId('pastoral-leader-note')).toBeTruthy();

      // Close drawer
      fireEvent.click(screen.getByTestId('close-pastoral-notes'));
      expect(screen.queryByTestId('pastoral-notes-drawer')).toBeNull();
    });
  });

  describe('Mobile layout invariants', () => {
    it('enforces font-size >= 16px on textarea and input in global.css', () => {
      const cssPath = resolve(__dirname, '../../src/client/styles/global.css');
      const css = readFileSync(cssPath, 'utf8');

      expect(css).toMatch(/\.custom-textarea\s*\{[^}]*font-size:\s*16px/);
      expect(css).toMatch(/\.custom-input\s*\{[^}]*font-size:\s*16px/);
    });
  });
});

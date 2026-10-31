// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  formatRelativeTime,
  ReflectionCard,
} from '../../src/client/components/discussion/ReflectionCard';
import { ReflectionFeed } from '../../src/client/components/discussion/ReflectionFeed';
import { SubmitReflectionModal } from '../../src/client/components/discussion/SubmitReflectionModal';
import { LeaderQuestionQueue } from '../../src/client/components/discussion/LeaderQuestionQueue';
import { ActiveQuestionCard } from '../../src/client/components/discussion/ActiveQuestionCard';
import type {
  SessionDiscussionQuestion,
  SessionReflection,
} from '../../src/shared/session';

const MOCK_QUESTION_1: SessionDiscussionQuestion = {
  id: 'q-6',
  number: 1,
  prompt: "What makes the Canaanite woman's faith 'great'?",
  category: 'Theological Focus',
  estimatedMinutes: 8,
};

const MOCK_QUESTION_2: SessionDiscussionQuestion = {
  id: 'q-5',
  number: 2,
  prompt: "Have you ever felt God's silence — and what did you do?",
  category: 'Spiritual Life',
  estimatedMinutes: 9,
};

const MOCK_NAMED_REFLECTION: SessionReflection = {
  id: 'refl-1',
  questionId: 'q-6',
  authorDisplayName: 'Mary Lopez',
  authorInitials: 'ML',
  avatarPalette: 'emerald',
  content: 'She humbled herself before Jesus and trusted His mercy was enough.',
  createdAt: new Date(Date.now() - 20_000).toISOString(),
  isAnonymous: false,
};

const MOCK_ANON_REFLECTION: SessionReflection = {
  id: 'refl-2',
  questionId: 'q-6',
  authorDisplayName: 'Anonymous',
  authorInitials: '?',
  avatarPalette: 'indigo',
  content: 'She kept praying, even when Jesus seemed silent.',
  createdAt: new Date(Date.now() - 5_000).toISOString(),
  isAnonymous: true,
};

const MOCK_Q2_REFLECTION: SessionReflection = {
  id: 'refl-3',
  questionId: 'q-5',
  authorDisplayName: 'Sara Castillo',
  authorInitials: 'SC',
  avatarPalette: 'violet',
  content: 'Silence is sometimes an invitation to deeper longing.',
  createdAt: new Date(Date.now() - 100_000).toISOString(),
  isAnonymous: false,
};

describe('formatRelativeTime helper', () => {
  it('formats recent timestamps accurately', () => {
    const now = 1_000_000_000_000;
    expect(formatRelativeTime(new Date(now - 4_000).toISOString(), now)).toBe('Just now');
    expect(formatRelativeTime(new Date(now - 20_000).toISOString(), now)).toBe('20s ago');
    expect(formatRelativeTime(new Date(now - 120_000).toISOString(), now)).toBe('2m ago');
    expect(formatRelativeTime(new Date(now - 7_200_000).toISOString(), now)).toBe('2h ago');
  });
});

describe('ReflectionCard component', () => {
  it('renders a named reflection with avatar initials, author name, and content', () => {
    render(<ReflectionCard reflection={MOCK_NAMED_REFLECTION} />);

    expect(screen.getByTestId('reflection-author')).toHaveTextContent('Mary Lopez');
    expect(screen.getByTestId('reflection-initials')).toHaveTextContent('ML');
    expect(screen.getByTestId('reflection-content')).toHaveTextContent(
      'She humbled herself before Jesus and trusted His mercy was enough.',
    );
    expect(screen.getByTestId('reflection-avatar')).toHaveClass('avatar-palette-emerald');
  });

  it('renders an anonymous reflection with ? avatar and Anonymous label', () => {
    render(<ReflectionCard reflection={MOCK_ANON_REFLECTION} />);

    expect(screen.getByTestId('reflection-author')).toHaveTextContent('Anonymous');
    expect(screen.getByTestId('reflection-initials')).toHaveTextContent('?');
    expect(screen.getByTestId('reflection-content')).toHaveTextContent(
      'She kept praying, even when Jesus seemed silent.',
    );
    expect(screen.getByTestId('reflection-avatar')).toHaveClass('avatar-anonymous');
  });
});

describe('ReflectionFeed component', () => {
  it('renders empty state when question has 0 reflections', () => {
    render(<ReflectionFeed reflections={[]} questionId="q-6" />);

    expect(screen.getByText('SHARING')).toBeInTheDocument();
    expect(screen.getByTestId('reflection-count-badge')).toHaveTextContent('0');
    expect(screen.getByTestId('reflection-feed-empty')).toHaveTextContent(
      'No responses yet. Be the first to share your reflection.',
    );
  });

  it('partitions reflections by questionId and orders newest first', () => {
    const reflections = [
      MOCK_NAMED_REFLECTION, // 20s ago on q-6
      MOCK_ANON_REFLECTION,  // 5s ago on q-6 (newer)
      MOCK_Q2_REFLECTION,    // on q-5
    ];

    render(<ReflectionFeed reflections={reflections} questionId="q-6" />);

    expect(screen.getByTestId('reflection-count-badge')).toHaveTextContent('2');
    const cards = screen.getAllByTestId(/^reflection-card-/);
    expect(cards).toHaveLength(2);

    // Newest first: refl-2 (5s ago) should come before refl-1 (20s ago)
    expect(cards[0]).toHaveAttribute('data-reflection-id', 'refl-2');
    expect(cards[1]).toHaveAttribute('data-reflection-id', 'refl-1');

    // Reflection for q-5 must not be rendered
    expect(screen.queryByText('Silence is sometimes an invitation to deeper longing.')).not.toBeInTheDocument();
  });
});

describe('SubmitReflectionModal component', () => {
  it('renders modal with prompt context, character counter, anonymous toggle, and submit button', () => {
    const handleClose = vi.fn();
    const handleSubmit = vi.fn();

    render(
      <SubmitReflectionModal
        isOpen={true}
        onClose={handleClose}
        onSubmit={handleSubmit}
        question={MOCK_QUESTION_1}
      />,
    );

    expect(screen.getByTestId('submit-reflection-modal')).toBeInTheDocument();
    expect(screen.getByTestId('reflection-modal-prompt')).toHaveTextContent(
      "What makes the Canaanite woman's faith 'great'?",
    );
    expect(screen.getByTestId('reflection-char-counter')).toHaveTextContent('0 / 1000');
    expect(screen.getByTestId('reflection-anonymous-checkbox')).not.toBeChecked();
    expect(screen.getByTestId('reflection-anonymous-note')).toHaveTextContent(
      'Your name and avatar will be hidden',
    );

    const submitBtn = screen.getByTestId('submit-reflection-btn');
    expect(submitBtn).toBeDisabled();
  });

  it('validates input and calls onSubmit with correct payload for named and anonymous reflections', () => {
    const handleClose = vi.fn();
    const handleSubmit = vi.fn();

    const { rerender } = render(
      <SubmitReflectionModal
        isOpen={true}
        onClose={handleClose}
        onSubmit={handleSubmit}
        question={MOCK_QUESTION_1}
      />,
    );

    const textarea = screen.getByTestId('reflection-textarea');
    const submitBtn = screen.getByTestId('submit-reflection-btn');

    // Entering whitespace only leaves button disabled
    fireEvent.change(textarea, { target: { value: '    ' } });
    expect(submitBtn).toBeDisabled();

    // Entering text enables button
    fireEvent.change(textarea, {
      target: { value: 'Her faith refused to take no for an answer.' },
    });
    expect(submitBtn).not.toBeDisabled();
    expect(screen.getByTestId('reflection-char-counter')).toHaveTextContent('43 / 1000');

    // Submit named
    fireEvent.click(submitBtn);
    expect(handleSubmit).toHaveBeenCalledWith({
      questionId: 'q-6',
      content: 'Her faith refused to take no for an answer.',
      isAnonymous: false,
    });

    // Reset and check anonymous
    rerender(
      <SubmitReflectionModal
        isOpen={true}
        onClose={handleClose}
        onSubmit={handleSubmit}
        question={MOCK_QUESTION_1}
      />,
    );
    const textarea2 = screen.getByTestId('reflection-textarea');
    fireEvent.change(textarea2, { target: { value: 'Anonymous prayer.' } });
    fireEvent.click(screen.getByTestId('reflection-anonymous-checkbox'));

    fireEvent.click(screen.getByTestId('submit-reflection-btn'));
    expect(handleSubmit).toHaveBeenCalledWith({
      questionId: 'q-6',
      content: 'Anonymous prayer.',
      isAnonymous: true,
    });
  });
});

describe('LeaderQuestionQueue dynamic response counter', () => {
  it('displays accurate per-question response counts and Active label for 0-response active card', () => {
    const questions = [MOCK_QUESTION_1, MOCK_QUESTION_2];
    const reflections = [
      MOCK_NAMED_REFLECTION, // on q-6
      MOCK_ANON_REFLECTION,  // on q-6
      // q-5 has 0 reflections
    ];

    render(
      <LeaderQuestionQueue
        questions={questions}
        activeQuestionId="q-5"
        reflections={reflections}
        onSwitchQuestion={vi.fn()}
        onOpenAddModal={vi.fn()}
        onNextQuestion={vi.fn()}
        onAdvanceSection={vi.fn()}
      />,
    );

    // q-6 has 2 responses (inactive)
    expect(screen.getByTestId('question-response-count-q-6')).toHaveTextContent('2 responses');

    // q-5 is active with 0 responses -> displays Active
    expect(screen.getByTestId('question-response-count-q-5')).toHaveTextContent('Active');
  });

  it('displays 1 response singular when exactly one reflection exists', () => {
    const questions = [MOCK_QUESTION_1];
    const reflections = [MOCK_NAMED_REFLECTION];

    render(
      <LeaderQuestionQueue
        questions={questions}
        activeQuestionId="q-6"
        reflections={reflections}
        onSwitchQuestion={vi.fn()}
        onOpenAddModal={vi.fn()}
        onNextQuestion={vi.fn()}
        onAdvanceSection={vi.fn()}
      />,
    );

    expect(screen.getByTestId('question-response-count-q-6')).toHaveTextContent('1 response');
  });
});

describe('ActiveQuestionCard participant CTA and reflection integration', () => {
  it('renders "I want to respond" button and triggers modal open callback', () => {
    const handleOpen = vi.fn();

    render(
      <ActiveQuestionCard
        question={MOCK_QUESTION_1}
        activeIndex={0}
        totalQuestions={3}
        reflections={[]}
        onOpenRespondModal={handleOpen}
      />,
    );

    expect(screen.getByTestId('participant-question-progress')).toHaveTextContent(
      'QUESTION 1 OF 3',
    );
    expect(screen.getByTestId('discussion-sharing-feed')).toBeInTheDocument();

    const respondBtn = screen.getByTestId('respond-trigger-btn');
    expect(respondBtn).toHaveTextContent('I want to respond');
    fireEvent.click(respondBtn);
    expect(handleOpen).toHaveBeenCalledTimes(1);

    expect(screen.getByTestId('participant-locked-note')).toHaveTextContent(
      'Only the leader decides when to advance',
    );
  });
});

describe('Mobile layout and domain language invariants', () => {
  it('enforces font-size >= 16px on .reflection-textarea in global.css', () => {
    const cssPath = resolve(__dirname, '../../src/client/styles/global.css');
    const css = readFileSync(cssPath, 'utf8');

    expect(css).toMatch(/\.reflection-textarea\s*\{[^}]*font-size:\s*16px/);
  });

  it('contains zero occurrences of legacy role label "Assistant"', () => {
    const { container } = render(
      <ActiveQuestionCard
        question={MOCK_QUESTION_1}
        activeIndex={0}
        totalQuestions={3}
        reflections={[MOCK_NAMED_REFLECTION, MOCK_ANON_REFLECTION]}
        onOpenRespondModal={vi.fn()}
      />,
    );

    expect(container.textContent).not.toContain('Assistant');
  });
});

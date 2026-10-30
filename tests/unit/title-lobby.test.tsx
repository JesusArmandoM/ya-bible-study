// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { OpeningPrayerScreen, type OpeningPrayerScreenProps } from '../../src/client/components/prayer/OpeningPrayerScreen';
import { TitleLobbyScreen } from '../../src/client/components/lobby/TitleLobbyScreen';
import { StudyStructureList } from '../../src/client/components/setup/StudyStructureList';
import { getDefaultStudyDocument } from '../../src/server/studies/greatIsYourFaithSeed';
import type {
  PublicLiveSessionSnapshot,
  SessionStudySummary,
} from '../../src/shared/session';
import { toSessionStudySummary } from '../../src/shared/session';

const SUMMARY: SessionStudySummary = toSessionStudySummary(
  getDefaultStudyDocument(),
);

const FORBIDDEN_SECTION_3_TERMS = [
  'Isaiah',
  'Psalm',
  'Romans',
  'First Reading',
  'Second Reading',
  'Responsorial Psalm',
];

describe('TitleLobbyScreen — leader mode (Scenario 1)', () => {
  it('shows the synced study summary with Gospel-only citation and metrics card', () => {
    render(
      <TitleLobbyScreen
        mode="leader"
        study={SUMMARY}
        attendeeCount={2}
        sessionCode="ABC123"
      />,
    );

    const lobby = screen.getByTestId('title-lobby');
    expect(lobby).toHaveAttribute('aria-label', 'Title Lobby');
    expect(lobby).toHaveAttribute('data-mode', 'leader');
    expect(screen.getByTestId('title-lobby-chip')).toHaveTextContent(
      'YA BIBLE STUDY · LIVE SESSION',
    );
    expect(screen.getByTestId('title-lobby-eyebrow')).toHaveTextContent(
      'WEEK 32 · 20TH SUNDAY OT',
    );
    expect(screen.getByTestId('title-lobby-title')).toHaveTextContent(
      'Great Is Your Faith',
    );
    expect(screen.getByTestId('title-lobby-citation')).toHaveTextContent(
      'Matthew 15:21–28 · Canaanite Woman',
    );

    // Metrics card: live ATTENDEES count, 5 sections, 90m duration.
    expect(screen.getByTestId('title-lobby-attendee-count')).toHaveTextContent(
      '2',
    );
    expect(screen.getByText('ATTENDEES')).toBeInTheDocument();
    expect(screen.getByTestId('title-lobby-section-count')).toHaveTextContent(
      '5',
    );
    expect(screen.getByTestId('title-lobby-duration')).toHaveTextContent('90m');

    // Gospel-only: the lobby summary/citation region never surfaces
    // non-Gospel Mass readings or pastoral fields.
    const lobbyText = lobby.textContent ?? '';
    for (const forbidden of FORBIDDEN_SECTION_3_TERMS) {
      expect(lobbyText).not.toContain(forbidden);
    }
    for (const pastoralField of [
      'leaderNote',
      'examplesToListenFor',
      'sampleAnswer',
      'leaderLiturgicalContextNote',
      'verseCommentary',
      'catholicDoctrine',
      'youngAdultApplication',
    ]) {
      expect(lobbyText).not.toContain(pastoralField);
    }

    expect(document.body.textContent).not.toContain('Assistant');
  });

  it('gives the Study Leader the share trigger and the exclusive Start Study CTA', () => {
    const onStartStudy = vi.fn();
    render(
      <TitleLobbyScreen
        mode="leader"
        study={SUMMARY}
        attendeeCount={0}
        sessionCode="ABC123"
        onStartStudy={onStartStudy}
      />,
    );

    expect(screen.getByTestId('lobby-share-trigger')).toBeInTheDocument();
    const start = screen.getByTestId('lobby-start-study');
    expect(start).toHaveTextContent('Start Study');
    expect(screen.queryByTestId('title-lobby-waiting-pill')).not.toBeInTheDocument();
  });

  it('shows the study-not-loaded fallback when no summary has been synced', () => {
    render(
      <TitleLobbyScreen
        mode="leader"
        study={null}
        attendeeCount={0}
        sessionCode="ABC123"
      />,
    );
    expect(screen.getByTestId('title-lobby-study-fallback')).toHaveTextContent(
      'Study not loaded yet',
    );
  });
});

describe('TitleLobbyScreen — participant mode (Scenario 5)', () => {
  it('shows the waiting pill and zero Start Study control anywhere in the DOM', () => {
    render(
      <TitleLobbyScreen
        mode="participant"
        study={SUMMARY}
        attendeeCount={2}
        sessionCode="ABC123"
      />,
    );

    expect(screen.getByTestId('title-lobby')).toHaveAttribute(
      'data-mode',
      'participant',
    );
    expect(screen.getByTestId('title-lobby-title')).toHaveTextContent(
      'Great Is Your Faith',
    );
    expect(screen.getByTestId('title-lobby-waiting-pill')).toHaveTextContent(
      'The Study Leader will begin shortly…',
    );

    // Exclusive Start Study gating: no control in the DOM for Participants.
    expect(screen.queryByTestId('lobby-start-study')).not.toBeInTheDocument();
    expect(screen.queryByTestId('lobby-share-trigger')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('Start Study');
    expect(document.body.textContent).not.toContain('Assistant');
  });

  it('syncs the live attendee count in real time (Scenario 3)', () => {
    const { rerender } = render(
      <TitleLobbyScreen
        mode="participant"
        study={SUMMARY}
        attendeeCount={0}
        sessionCode="ABC123"
      />,
    );
    expect(screen.getByTestId('title-lobby-attendee-count')).toHaveTextContent(
      '0',
    );

    rerender(
      <TitleLobbyScreen
        mode="participant"
        study={SUMMARY}
        attendeeCount={2}
        sessionCode="ABC123"
      />,
    );
    expect(screen.getByTestId('title-lobby-attendee-count')).toHaveTextContent(
      '2',
    );
  });
});

// Compat edit 1 of 2 (section-1-opening-prayer-hand-raise): the provisional
// `SectionOneHandoff` block is migrated to `OpeningPrayerScreen` with the same
// `section-one-*` testids and the two updated role subtitle copy strings.
const PRAYER_SESSION: PublicLiveSessionSnapshot = {
  sessionCode: 'ABC123',
  status: 'in_progress',
  currentSectionIndex: 0,
  currentSectionId: 'section_1_prayer',
  createdAt: '2026-10-29T19:30:00.000Z',
  startedAt: '2026-10-29T19:31:00.000Z',
  endedAt: null,
  connectedMemberCount: 2,
  connectedParticipantCount: 1,
  members: [
    {
      memberId: 'participant-1',
      displayName: 'Daniel',
      initials: 'DA',
      avatarPalette: 'indigo',
      role: 'Participant',
      connectionStatus: 'connected',
      joinedAt: '2026-10-29T19:30:30.000Z',
    },
  ],
  study: SUMMARY,
  volunteerTurn: {
    sectionId: 'section_1_prayer',
    mode: 'gated_prayer',
    raisedHands: [],
    candidateMemberId: null,
    candidateExpiresAt: null,
    selectedMemberId: null,
    completedAt: null,
  },
  protocolVersion: 3,
};

describe('OpeningPrayerScreen — Section 1 surface', () => {
  it('renders SECTION 1 OF 5 / 20% / Opening Prayer with role-appropriate subtitle copy', () => {
    const baseProps: Omit<OpeningPrayerScreenProps, 'role'> = {
      session: PRAYER_SESSION,
      memberId: 'participant-1',
      onToggleHandRaised: () => {},
      onLowerHand: () => {},
      onClearRaisedHands: () => {},
    };
    const { rerender } = render(
      <OpeningPrayerScreen {...baseProps} role="Participant" />,
    );
    expect(screen.getByTestId('section-one-label')).toHaveTextContent(
      'SECTION 1 OF 5',
    );
    expect(screen.getByTestId('section-one-percent')).toHaveTextContent('20%');
    expect(screen.getByTestId('section-one-title')).toHaveTextContent(
      'Opening Prayer',
    );
    expect(screen.getByTestId('section-one-copy')).toHaveTextContent(
      'Tap Raise Hand',
    );
    expect(document.body.textContent).not.toContain('Assistant');

    rerender(<OpeningPrayerScreen {...baseProps} role="Study Leader" />);
    expect(screen.getByTestId('section-one-copy')).toHaveTextContent(
      'Waiting for someone to volunteer to pray',
    );
  });
});

describe('StudyStructureList — Gospel row is citation-only (handoff note 2)', () => {
  it('suppresses a custom Section 3 section.title line even for custom uploads', () => {
    const base = getDefaultStudyDocument();
    render(
      <StudyStructureList
        study={{
          ...base,
          gospelReading: {
            ...base.gospelReading,
            title: 'Canaanite Woman Persistence',
          },
          icebreaker: {
            ...base.icebreaker,
            title: 'Outsiders Wanted Banter',
          },
        }}
      />,
    );

    const gospelRow = screen.getByTestId('study-structure-row-3');
    expect(gospelRow).toHaveTextContent('Matthew 15:21–28');
    expect(gospelRow).not.toHaveTextContent('Canaanite Woman Persistence');
    expect(
      gospelRow.querySelector('.study-structure-row-title'),
    ).toBeNull();

    // Non-Gospel rows keep their custom secondary title line.
    const icebreakerRow = screen.getByTestId('study-structure-row-2');
    expect(icebreakerRow).toHaveTextContent('Outsiders Wanted Banter');

    for (const forbidden of FORBIDDEN_SECTION_3_TERMS) {
      expect(gospelRow.textContent ?? '').not.toContain(forbidden);
    }
  });
});

describe('Title Lobby CSS baseline (>= 16px inputs, >= 44px targets, 56px CTA)', () => {
  it('keeps the mobile ergonomics floor in global.css', () => {
    // Vitest runs from the repository root; resolve the stylesheet from cwd.
    const cssPath = resolve(process.cwd(), 'src/client/styles/global.css');
    const css = readFileSync(cssPath, 'utf-8');

    // >= 16px readonly join-URL input (iOS Safari auto-zoom guard).
    expect(css).toMatch(/\.lobby-join-url\s*\{[^}]*font-size: max\(16px, 1rem\)/);
    // >= 44px interactive targets.
    expect(css).toMatch(/\.lobby-share-trigger\s*\{[^}]*min-height: 44px/);
    expect(css).toMatch(/\.lobby-copy-link\s*\{[^}]*min-height: 44px/);
    expect(css).toMatch(/\.room-code-sheet-close\s*\{[^}]*min-height: 44px/);
    expect(css).toMatch(/\.title-lobby-waiting-pill\s*\{[^}]*min-height: 44px/);
    // 56px gold Start Study CTA per DESIGN.md button-primary.
    expect(css).toMatch(/\.lobby-start-study\s*\{[^}]*min-height: 56px/);
    // 4px gold section progress bar.
    expect(css).toMatch(/\.section-one-progress\s*\{[^}]*height: 4px/);
  });
});

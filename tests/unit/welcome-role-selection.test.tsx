// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../src/client/App';
import { ActiveSessionBanner } from '../../src/client/components/welcome/ActiveSessionBanner';
import { LeaderAccessSheet } from '../../src/client/components/welcome/LeaderAccessSheet';
import { ParticipantJoinSheet } from '../../src/client/components/welcome/ParticipantJoinSheet';
import { WelcomeRoleCards } from '../../src/client/components/welcome/WelcomeRoleCards';
import type { PublicLiveSessionSnapshot } from '../../src/shared/session';

const MOCK_SESSION: PublicLiveSessionSnapshot = {
  sessionCode: 'TEST99',
  status: 'lobby',
  currentSectionIndex: null,
  currentSectionId: null,
  createdAt: new Date().toISOString(),
  startedAt: null,
  endedAt: null,
  connectedMemberCount: 3,
  connectedParticipantCount: 2,
  members: [],
};

describe('WelcomeRoleCards component', () => {
  it('renders Study Leader and Participant role cards with zero Assistant copy', () => {
    const onSelectRole = vi.fn();
    render(<WelcomeRoleCards onSelectRole={onSelectRole} />);

    expect(screen.getByText('CHOOSE YOUR ROLE')).toBeInTheDocument();
    expect(screen.getByText('Study Leader')).toBeInTheDocument();
    expect(
      screen.getByText('Lead the session with full control'),
    ).toBeInTheDocument();
    expect(screen.getByText('Participant')).toBeInTheDocument();
    expect(
      screen.getByText('Participate, pray, and raise your hand'),
    ).toBeInTheDocument();

    expect(document.body.textContent).not.toContain('Assistant');
  });

  it('triggers onSelectRole with Study Leader and Participant on click', () => {
    const onSelectRole = vi.fn();
    render(<WelcomeRoleCards onSelectRole={onSelectRole} />);

    fireEvent.click(screen.getByTestId('welcome-role-leader'));
    expect(onSelectRole).toHaveBeenCalledWith('Study Leader');

    fireEvent.click(screen.getByTestId('welcome-role-participant'));
    expect(onSelectRole).toHaveBeenCalledWith('Participant');
  });
});

describe('LeaderAccessSheet component', () => {
  it('supports Create Room and Claim Room modes and enforces input validation', () => {
    const onCreate = vi.fn().mockResolvedValue({});
    const onClaim = vi.fn().mockResolvedValue({});
    const onBack = vi.fn();
    const onClearError = vi.fn();

    render(
      <LeaderAccessSheet
        isSubmitting={false}
        errorMessage={null}
        onCreateRoom={onCreate}
        onClaimLeadership={onClaim}
        onBack={onBack}
        onClearError={onClearError}
      />,
    );

    // Initial mode is Create Room
    expect(screen.getByText('STUDY LEADER ACCESS')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Create Room' }),
    ).toBeInTheDocument();

    const nameInput = screen.getByLabelText(/Leader Name/i);
    fireEvent.change(nameInput, { target: { value: 'Claire' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Room' }));
    expect(onCreate).toHaveBeenCalledWith('Claire');

    // Switch to Claim Room mode
    fireEvent.click(screen.getByRole('tab', { name: 'Claim Room' }));
    expect(
      screen.getByRole('button', { name: 'Claim Leadership' }),
    ).toBeInTheDocument();

    // Clear name for claim test
    const claimNameInput = screen.getByLabelText(/Your Name/i);
    fireEvent.change(claimNameInput, { target: { value: '' } });

    // Submit invalid room code
    fireEvent.click(screen.getByRole('button', { name: 'Claim Leadership' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Please enter a valid 6-character room code.',
    );
    expect(onClaim).not.toHaveBeenCalled();

    // Type code but invalid PIN
    const codeInput = screen.getByLabelText(/Session Code/i);
    fireEvent.change(codeInput, { target: { value: 'ABCXYZ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Claim Leadership' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Please enter a valid 4-digit leader PIN.',
    );

    // Type valid 4-digit PIN
    const pinInput = screen.getByLabelText(/4-Digit Leader PIN/i);
    fireEvent.change(pinInput, { target: { value: '4821' } });
    fireEvent.click(screen.getByRole('button', { name: 'Claim Leadership' }));
    expect(onClaim).toHaveBeenCalledWith('ABCXYZ', '4821', undefined);

    // Back button
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(onBack).toHaveBeenCalled();
  });
});

describe('ParticipantJoinSheet component', () => {
  it('prefills session code, auto-uppercases, and validates display name', () => {
    const onJoin = vi.fn().mockResolvedValue({});
    const onBack = vi.fn();
    const onClearError = vi.fn();

    render(
      <ParticipantJoinSheet
        initialSessionCode="PRE123"
        isSubmitting={false}
        errorMessage={null}
        onJoinRoom={onJoin}
        onBack={onBack}
        onClearError={onClearError}
      />,
    );

    const codeInput = screen.getByLabelText(
      /Session Code/i,
    ) as HTMLInputElement;
    expect(codeInput.value).toBe('PRE123');

    // Attempt submit with empty name
    fireEvent.click(screen.getByRole('button', { name: 'Join Study' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Please enter your name to join the study.',
    );
    expect(onJoin).not.toHaveBeenCalled();

    // Type display name
    const nameInput = screen.getByLabelText(/Your Name/i);
    fireEvent.change(nameInput, { target: { value: 'Daniel' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join Study' }));
    expect(onJoin).toHaveBeenCalledWith('PRE123', 'Daniel');

    // Back button
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(onBack).toHaveBeenCalled();
  });
});

describe('ActiveSessionBanner component', () => {
  it('displays session code, member count, and leader PIN for Study Leader', () => {
    const onLeave = vi.fn();

    render(
      <ActiveSessionBanner
        session={MOCK_SESSION}
        role="Study Leader"
        leaderPin="7721"
        onLeave={onLeave}
      />,
    );

    expect(screen.getByText('LIVE ROOM')).toBeInTheDocument();
    expect(screen.getByTestId('active-session-code')).toHaveTextContent(
      'TEST99',
    );
    expect(screen.getByTestId('active-user-role')).toHaveTextContent(
      'Study Leader',
    );
    expect(screen.getByTestId('active-leader-pin')).toHaveTextContent('7721');
    expect(screen.getByTestId('active-connected-count')).toHaveTextContent(
      '3 members connected',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Leave Session' }));
    expect(onLeave).toHaveBeenCalled();
  });

  it('hides leader PIN when viewed by Participant', () => {
    render(
      <ActiveSessionBanner
        session={MOCK_SESSION}
        role="Participant"
        leaderPin={null}
        onLeave={vi.fn()}
      />,
    );

    expect(screen.getByTestId('active-user-role')).toHaveTextContent(
      'Participant',
    );
    expect(screen.queryByTestId('active-leader-pin')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('Assistant');
  });
});

describe('App Welcome Flow integration', () => {
  it('transitions between Welcome cards and sheets seamlessly with Back navigation', () => {
    // Mock /api/health
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'ok',
          uptimeSeconds: 5,
          activeSessionCount: 0,
          wsReady: true,
          timestamp: new Date().toISOString(),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    render(<App />);

    // 1. Initial Welcome cards
    expect(screen.getByText('CHOOSE YOUR ROLE')).toBeInTheDocument();
    expect(screen.getByTestId('welcome-role-leader')).toBeInTheDocument();
    expect(screen.getByTestId('welcome-role-participant')).toBeInTheDocument();

    // 2. Click Study Leader -> Leader sheet opens
    fireEvent.click(screen.getByTestId('welcome-role-leader'));
    expect(screen.getByTestId('leader-access-sheet')).toBeInTheDocument();
    expect(screen.queryByText('CHOOSE YOUR ROLE')).not.toBeInTheDocument();

    // 3. Click Back -> returns to Welcome cards
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.getByText('CHOOSE YOUR ROLE')).toBeInTheDocument();

    // 4. Click Participant -> Participant join sheet opens
    fireEvent.click(screen.getByTestId('welcome-role-participant'));
    expect(screen.getByTestId('participant-join-sheet')).toBeInTheDocument();

    // 5. Click Back -> returns to Welcome cards
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.getByText('CHOOSE YOUR ROLE')).toBeInTheDocument();

    // Zero Assistant check
    expect(document.body.textContent).not.toContain('Assistant');
  });
});

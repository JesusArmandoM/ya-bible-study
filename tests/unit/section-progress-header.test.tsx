// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SectionProgressHeader } from '../../src/client/components/sections/SectionProgressHeader';

describe('SectionProgressHeader', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  it('renders section label and percentage correctly for any section (1..6)', () => {
    const { rerender } = render(<SectionProgressHeader sectionNumber={1} />);
    expect(screen.getByTestId('section-one-label')).toHaveTextContent('SECTION 1 OF 6');
    expect(screen.getByTestId('section-one-percent')).toHaveTextContent('17%');

    rerender(<SectionProgressHeader sectionNumber={3} />);
    expect(screen.getByTestId('section-one-label')).toHaveTextContent('SECTION 3 OF 6');
    expect(screen.getByTestId('section-one-percent')).toHaveTextContent('50%');

    rerender(<SectionProgressHeader sectionNumber={6} />);
    expect(screen.getByTestId('section-one-label')).toHaveTextContent('SECTION 6 OF 6');
    expect(screen.getByTestId('section-one-percent')).toHaveTextContent('100%');
  });

  it('does NOT render Share QR button when isLeader is false (Participant default)', () => {
    render(<SectionProgressHeader sectionNumber={1} isLeader={false} sessionCode="ABC123" />);

    expect(screen.queryByTestId('section-share-qr-trigger')).toBeNull();
    expect(document.body.textContent).not.toContain('Share QR');
  });

  it('renders persistent Share QR trigger when isLeader is true', () => {
    render(<SectionProgressHeader sectionNumber={1} isLeader={true} sessionCode="ABC123" />);

    const trigger = screen.getByTestId('section-share-qr-trigger');
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveTextContent('Share QR');
  });

  it('opens RoomCodeShareSheet modal when Study Leader clicks Share QR trigger', async () => {
    render(<SectionProgressHeader sectionNumber={2} isLeader={true} sessionCode="ABC123" />);

    expect(screen.queryByTestId('room-code-share-sheet')).toBeNull();

    const trigger = screen.getByTestId('section-share-qr-trigger');
    fireEvent.click(trigger);

    const sheet = await screen.findByTestId('room-code-share-sheet');
    expect(sheet).toBeInTheDocument();
    expect(screen.getByTestId('lobby-room-code')).toHaveTextContent('ABC123');
    expect(screen.getByTestId('lobby-join-url')).toHaveValue(
      `${window.location.origin}/join/ABC123`,
    );

    // Dismiss modal
    const closeBtn = screen.getByTestId('room-code-sheet-close');
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByTestId('room-code-share-sheet')).toBeNull();
    });
  });

  it('invokes custom onShareQr callback when provided', () => {
    const handleCustomShare = vi.fn();
    render(
      <SectionProgressHeader
        sectionNumber={1}
        isLeader={true}
        sessionCode="ABC123"
        onShareQr={handleCustomShare}
      />,
    );

    const trigger = screen.getByTestId('section-share-qr-trigger');
    fireEvent.click(trigger);

    expect(handleCustomShare).toHaveBeenCalledTimes(1);
    // Modal is NOT opened directly because onShareQr overrides default behavior
    expect(screen.queryByTestId('room-code-share-sheet')).toBeNull();
  });

  it('strictly adheres to terminology invariant: zero occurrences of Assistant', () => {
    render(<SectionProgressHeader sectionNumber={1} isLeader={true} sessionCode="ABC123" />);

    expect(document.body.textContent).not.toContain('Assistant');
    expect(document.body.innerHTML).not.toContain('Assistant');
  });
});

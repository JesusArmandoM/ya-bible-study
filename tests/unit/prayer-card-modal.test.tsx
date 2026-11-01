// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrayerCardModal } from '../../src/client/components/discussion/PrayerCardModal';
import * as canvasModule from '../../src/client/lib/prayerCardCanvas';
import {
  buildPrayerCardStorageKey,
  savePrayerCardDraft,
} from '../../src/client/lib/prayerCardStorage';

describe('PrayerCardModal', () => {
  const sessionCode = 'ROOM99';
  const memberId = 'mem-user-1';
  const storageKey = buildPrayerCardStorageKey(sessionCode, memberId);

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('renders modal header, biblical instruction, privacy badge, and three prompts when open', () => {
    render(
      <PrayerCardModal
        isOpen={true}
        onClose={vi.fn()}
        sessionCode={sessionCode}
        memberId={memberId}
      />,
    );

    expect(screen.getByTestId('prayer-card-title')).toHaveTextContent(
      '"Lord, Help Me" Prayer Card',
    );
    expect(screen.getByTestId('prayer-card-instructions')).toHaveTextContent(
      'Write three short, honest prayers inspired by Matthew 15:21–28.',
    );
    expect(screen.getByTestId('prayer-card-privacy-badge')).toHaveTextContent(
      '🔒 Private on your device — never shared automatically',
    );

    expect(screen.getByTestId('prayer-input-self')).toBeInTheDocument();
    expect(screen.getByTestId('prayer-input-loved-one')).toBeInTheDocument();
    expect(screen.getByTestId('prayer-input-church-world')).toBeInTheDocument();
    expect(screen.getByTestId('export-prayer-card-btn')).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <PrayerCardModal
        isOpen={false}
        onClose={vi.fn()}
        sessionCode={sessionCode}
        memberId={memberId}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('loads previously saved draft from localStorage upon opening', () => {
    savePrayerCardDraft(storageKey, {
      self: 'give me patience',
      lovedOne: 'my father in the hospital',
      churchWorld: 'healing for our parish',
    });

    render(
      <PrayerCardModal
        isOpen={true}
        onClose={vi.fn()}
        sessionCode={sessionCode}
        memberId={memberId}
      />,
    );

    expect(screen.getByTestId('prayer-input-self')).toHaveValue('give me patience');
    expect(screen.getByTestId('prayer-input-loved-one')).toHaveValue(
      'my father in the hospital',
    );
    expect(screen.getByTestId('prayer-input-church-world')).toHaveValue(
      'healing for our parish',
    );
  });

  it('saves typed input synchronously to localStorage', () => {
    render(
      <PrayerCardModal
        isOpen={true}
        onClose={vi.fn()}
        sessionCode={sessionCode}
        memberId={memberId}
      />,
    );

    const selfInput = screen.getByTestId('prayer-input-self');
    fireEvent.change(selfInput, {
      target: { value: 'trust Your timing when answers seem slow' },
    });

    const stored = JSON.parse(localStorage.getItem(storageKey) || '{}');
    expect(stored.self).toBe('trust Your timing when answers seem slow');
  });

  it('keeps "Share line to group" disabled when input is empty and enables when typed', () => {
    render(
      <PrayerCardModal
        isOpen={true}
        onClose={vi.fn()}
        sessionCode={sessionCode}
        memberId={memberId}
      />,
    );

    const shareBtn = screen.getByTestId('prayer-share-btn-self');
    expect(shareBtn).toBeDisabled();

    fireEvent.change(screen.getByTestId('prayer-input-self'), {
      target: { value: 'trust Your timing' },
    });
    expect(shareBtn).not.toBeDisabled();
  });

  it('calls onSubmitReflection with formatted line and anonymous flag', async () => {
    const onSubmitReflection = vi.fn().mockResolvedValue(undefined);

    render(
      <PrayerCardModal
        isOpen={true}
        onClose={vi.fn()}
        sessionCode={sessionCode}
        memberId={memberId}
        activeQuestionId="q-6"
        onSubmitReflection={onSubmitReflection}
      />,
    );

    // Type text into "For myself"
    fireEvent.change(screen.getByTestId('prayer-input-self'), {
      target: { value: 'trust Your timing when answers seem slow' },
    });

    // Check anonymous toggle
    const anonToggle = screen.getByTestId('prayer-anon-toggle-self');
    fireEvent.click(anonToggle);

    // Click share line
    fireEvent.click(screen.getByTestId('prayer-share-btn-self'));

    await waitFor(() => {
      expect(onSubmitReflection).toHaveBeenCalledWith({
        questionId: 'q-6',
        content:
          '[For myself] Lord, help me trust Your timing when answers seem slow.',
        isAnonymous: true,
      });
    });

    expect(screen.getByTestId('prayer-share-feedback-self')).toHaveTextContent(
      'Shared to group! ✓',
    );
  });

  it('invokes canvas render and export when Export CTA is clicked', async () => {
    const mockBlob = new Blob(['png-bytes'], { type: 'image/png' });
    const renderSpy = vi
      .spyOn(canvasModule, 'renderPrayerCardToBlob')
      .mockResolvedValue(mockBlob);
    const exportSpy = vi
      .spyOn(canvasModule, 'exportOrSharePrayerCard')
      .mockResolvedValue({ method: 'download' });

    render(
      <PrayerCardModal
        isOpen={true}
        onClose={vi.fn()}
        sessionCode={sessionCode}
        memberId={memberId}
      />,
    );

    fireEvent.click(screen.getByTestId('export-prayer-card-btn'));

    await waitFor(() => {
      expect(renderSpy).toHaveBeenCalled();
      expect(exportSpy).toHaveBeenCalledWith(mockBlob, 'prayer-card.png');
    });

    expect(screen.getByTestId('prayer-export-status')).toHaveTextContent(
      'Prayer card downloaded!',
    );
  });

  it('enforces zero legacy "Assistant" occurrences in rendered markup', () => {
    const { container } = render(
      <PrayerCardModal
        isOpen={true}
        onClose={vi.fn()}
        sessionCode={sessionCode}
        memberId={memberId}
      />,
    );

    expect(container.innerHTML).not.toContain('Assistant');
    expect(container.innerHTML).not.toContain('assistant');
  });
});

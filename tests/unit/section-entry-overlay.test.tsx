// @vitest-environment jsdom
import { render, screen, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@react-three/fiber', () => ({
  Canvas: ({
    dpr,
    frameloop,
  }: {
    dpr?: [number, number];
    frameloop?: string;
    children?: ReactNode;
  }) => (
    <canvas
      data-testid="mock-r3f-canvas"
      data-dpr={Array.isArray(dpr) ? dpr.join(',') : ''}
      data-frameloop={frameloop ?? 'always'}
    />
  ),
  useFrame: vi.fn(),
  useThree: vi.fn(),
}));

import { SectionEntryOverlay } from '../../src/client/components/stage/SectionEntryOverlay';
import { setWebGLSupportProbeForTests } from '../../src/client/components/stage/webglSupport';
import {
  createSacredStageStore,
  SECTION_ENTRY_CONFIGS,
} from '../../src/client/state/sacredStageStore';
import { STUDY_SECTION_IDS } from '../../src/shared/session';

describe('SectionEntryOverlay', () => {
  beforeEach(() => {
    setWebGLSupportProbeForTests(() => true);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    setWebGLSupportProbeForTests(null);
  });

  it('renders distinct 3D emblem metadata, titles, and descriptions across all 6 sections', () => {
    for (const sectionId of STUDY_SECTION_IDS) {
      const store = createSacredStageStore();
      const config = SECTION_ENTRY_CONFIGS[sectionId];

      const { unmount } = render(
        <SectionEntryOverlay
          sectionId={sectionId}
          stageStore={store}
        />,
      );

      const overlay = screen.getByTestId('section-entry-overlay');
      expect(overlay).toBeInTheDocument();
      expect(overlay).toHaveAttribute('data-section-id', sectionId);
      expect(overlay).toHaveAttribute('data-stage-layout', 'entry');

      // Section badge
      const badge = screen.getByTestId('section-entry-badge');
      expect(badge).toHaveTextContent(`SECTION ${config.sectionNumber} OF 6`);

      // Section title
      const title = screen.getByTestId('section-entry-title');
      expect(title).toHaveTextContent(config.title);

      // Section description
      const desc = screen.getByTestId('section-entry-description');
      expect(desc).toHaveTextContent(config.description);

      // Canvas budget <= 1
      expect(overlay.querySelectorAll('canvas')).toHaveLength(1);

      // 3D scene stage synced to section emblem
      expect(store.getState().stage).toBe(config.stage);
      expect(store.getState().accentMode).toBe(config.accentMode);

      // Invariant check: zero "Assistant" copy
      expect(overlay.textContent).not.toContain('Assistant');

      unmount();
    }
  });

  it('Section 1 Opening Prayer renders violet Prayer Orb metadata and description', () => {
    const store = createSacredStageStore();
    render(
      <SectionEntryOverlay
        sectionId="section_1_prayer"
        stageStore={store}
      />,
    );

    expect(screen.getByTestId('section-entry-badge')).toHaveTextContent('SECTION 1 OF 6');
    expect(screen.getByTestId('section-entry-title')).toHaveTextContent('Opening Prayer');
    expect(screen.getByTestId('section-entry-description')).toHaveTextContent(
      'Prepare our hearts in humility and mercy',
    );
    expect(store.getState().stage).toBe('prayer-orb');
    expect(store.getState().accentMode).toBe('default');
  });

  it('Section 2 Icebreaker renders amber/bronze Hospitality Rings metadata and description', () => {
    const store = createSacredStageStore();
    render(
      <SectionEntryOverlay
        sectionId="section_2_icebreaker"
        stageStore={store}
      />,
    );

    expect(screen.getByTestId('section-entry-badge')).toHaveTextContent('SECTION 2 OF 6');
    expect(screen.getByTestId('section-entry-title')).toHaveTextContent('Icebreaker');
    expect(screen.getByTestId('section-entry-description')).toHaveTextContent('Outsiders Wanted');
    expect(store.getState().stage).toBe('sanctuary-emblem');
    expect(store.getState().accentMode).toBe('hospitality');
  });

  it('Section 3 Gospel Reading renders indigo-periwinkle Gospel Codex metadata and description', () => {
    const store = createSacredStageStore();
    render(
      <SectionEntryOverlay
        sectionId="section_3_reading"
        stageStore={store}
      />,
    );

    expect(screen.getByTestId('section-entry-badge')).toHaveTextContent('SECTION 3 OF 6');
    expect(screen.getByTestId('section-entry-title')).toHaveTextContent('Gospel Reading');
    expect(screen.getByTestId('section-entry-description')).toHaveTextContent(
      'Proclamation of Matthew 15:21–28',
    );
    expect(store.getState().stage).toBe('gospel-codex');
    expect(store.getState().accentMode).toBe('default');
  });

  it('Section 4 Deep Analysis renders emerald/gold Lantern & Scroll metadata and description', () => {
    const store = createSacredStageStore();
    render(
      <SectionEntryOverlay
        sectionId="section_4_deep_analysis"
        stageStore={store}
      />,
    );

    expect(screen.getByTestId('section-entry-badge')).toHaveTextContent('SECTION 4 OF 6');
    expect(screen.getByTestId('section-entry-title')).toHaveTextContent('Deep Analysis');
    expect(screen.getByTestId('section-entry-description')).toHaveTextContent(
      'Verse-by-Verse Gospel Breakdown & Catholic Doctrine',
    );
    expect(store.getState().stage).toBe('sanctuary-emblem');
    expect(store.getState().accentMode).toBe('lantern-scroll');
  });

  it('Section 5 Discussion & Reflection renders rose-gold Community Flame metadata and description', () => {
    const store = createSacredStageStore();
    render(
      <SectionEntryOverlay
        sectionId="section_5_discussion"
        stageStore={store}
      />,
    );

    expect(screen.getByTestId('section-entry-badge')).toHaveTextContent('SECTION 5 OF 6');
    expect(screen.getByTestId('section-entry-title')).toHaveTextContent('Discussion & Reflection');
    expect(screen.getByTestId('section-entry-description')).toHaveTextContent('Lord, Help Me Pray');
    expect(store.getState().stage).toBe('sanctuary-emblem');
    expect(store.getState().accentMode).toBe('community-flame');
  });

  it('Section 6 Closing Prayer renders golden Star of Faith metadata and description', () => {
    const store = createSacredStageStore();
    render(
      <SectionEntryOverlay
        sectionId="section_6_closing"
        stageStore={store}
      />,
    );

    expect(screen.getByTestId('section-entry-badge')).toHaveTextContent('SECTION 6 OF 6');
    expect(screen.getByTestId('section-entry-title')).toHaveTextContent('Closing Prayer');
    expect(screen.getByTestId('section-entry-description')).toHaveTextContent(
      'Sending Forth in Faith',
    );
    expect(store.getState().stage).toBe('star-of-faith');
    expect(store.getState().accentMode).toBe('default');
  });

  it('auto-dismisses smoothly after duration and calls onDismiss', () => {
    const onDismiss = vi.fn();
    render(
      <SectionEntryOverlay
        sectionId="section_1_prayer"
        durationMs={3200}
        onDismiss={onDismiss}
      />,
    );

    expect(screen.getByTestId('section-entry-overlay')).toBeInTheDocument();
    expect(onDismiss).not.toHaveBeenCalled();

    // Advance to fade start (3200 - 250 = 2950ms)
    act(() => {
      vi.advanceTimersByTime(2950);
    });
    expect(screen.getByTestId('section-entry-overlay')).toHaveAttribute(
      'data-dismissing',
      'true',
    );
    expect(onDismiss).not.toHaveBeenCalled();

    // Advance to completion (3200ms)
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('renders post-join-stage-shell and preserves persistent canvas when active is false', () => {
    const store = createSacredStageStore();
    render(
      <SectionEntryOverlay
        sectionId="section_1_prayer"
        active={false}
        stageStore={store}
        stageLayout="section"
      />,
    );

    expect(screen.queryByTestId('section-entry-overlay')).not.toBeInTheDocument();
    const stageShell = screen.getByTestId('post-join-stage-shell');
    expect(stageShell).toBeInTheDocument();
    expect(stageShell).toHaveAttribute('data-stage-layout', 'section');
    expect(stageShell.querySelectorAll('canvas')).toHaveLength(1);
  });
});

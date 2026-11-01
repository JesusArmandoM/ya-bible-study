// @vitest-environment jsdom
import { act, render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@react-three/fiber', () => ({
  Canvas: () => <canvas data-testid="mock-r3f-canvas" />,
  useFrame: vi.fn(),
  useThree: vi.fn(),
}));

import { Sacred3DScene } from '../../src/client/components/stage/Sacred3DScene';
import {
  SacredStageProvider,
  createSacredStageStore,
  defaultSacredStageStore,
  useSacredStageStore,
} from '../../src/client/state/sacredStageStore';

describe('Scoped SacredStageStore Provider Pattern', () => {
  beforeEach(() => {
    defaultSacredStageStore.getState().reset();
  });

  it('reads from defaultSacredStageStore when outside SacredStageProvider', () => {
    const { result } = renderHook(() => ({
      stage: useSacredStageStore((s) => s.stage),
      trigger: useSacredStageStore((s) => s.triggerImpulse),
    }));

    expect(result.current.stage).toBe('sanctuary-emblem');

    act(() => {
      result.current.trigger('hand-raise');
    });

    expect(defaultSacredStageStore.getState().impulse.kind).toBe('hand-raise');
    expect(defaultSacredStageStore.getState().impulse.sequence).toBe(1);
  });

  it('scopes useSacredStageStore to provided store instance', () => {
    const customStore = createSacredStageStore({ stage: 'prayer-orb' });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <SacredStageProvider store={customStore}>{children}</SacredStageProvider>
    );

    const { result } = renderHook(
      () => ({
        stage: useSacredStageStore((s) => s.stage),
        setStage: useSacredStageStore((s) => s.setStage),
        trigger: useSacredStageStore((s) => s.triggerImpulse),
      }),
      { wrapper },
    );

    expect(result.current.stage).toBe('prayer-orb');
    expect(defaultSacredStageStore.getState().stage).toBe('sanctuary-emblem');

    act(() => {
      result.current.setStage('gospel-codex');
      result.current.trigger('confirm-burst');
    });

    expect(customStore.getState().stage).toBe('gospel-codex');
    expect(customStore.getState().impulse.sequence).toBe(1);
    expect(customStore.getState().impulse.kind).toBe('confirm-burst');

    // Default store remains untouched
    expect(defaultSacredStageStore.getState().stage).toBe('sanctuary-emblem');
    expect(defaultSacredStageStore.getState().impulse.sequence).toBe(0);
  });

  it('isolates sibling providers (Leader vs Participant)', () => {
    const leaderStore = createSacredStageStore({ stage: 'sanctuary-emblem' });
    const participantStore = createSacredStageStore({ stage: 'prayer-orb' });

    function LeaderChild() {
      const stage = useSacredStageStore((s) => s.stage);
      const trigger = useSacredStageStore((s) => s.triggerImpulse);
      return (
        <div data-testid="leader-child" data-stage={stage}>
          <button data-testid="leader-trigger" onClick={() => trigger('random-spin')}>
            Leader Spin
          </button>
        </div>
      );
    }

    function ParticipantChild() {
      const stage = useSacredStageStore((s) => s.stage);
      const trigger = useSacredStageStore((s) => s.triggerImpulse);
      return (
        <div data-testid="participant-child" data-stage={stage}>
          <button data-testid="participant-trigger" onClick={() => trigger('hand-raise')}>
            Participant Raise
          </button>
        </div>
      );
    }

    render(
      <div>
        <SacredStageProvider store={leaderStore}>
          <LeaderChild />
        </SacredStageProvider>
        <SacredStageProvider store={participantStore}>
          <ParticipantChild />
        </SacredStageProvider>
      </div>,
    );

    expect(screen.getByTestId('leader-child').getAttribute('data-stage')).toBe(
      'sanctuary-emblem',
    );
    expect(screen.getByTestId('participant-child').getAttribute('data-stage')).toBe(
      'prayer-orb',
    );

    act(() => {
      screen.getByTestId('participant-trigger').click();
    });

    expect(participantStore.getState().impulse.kind).toBe('hand-raise');
    expect(participantStore.getState().impulse.sequence).toBe(1);
    expect(leaderStore.getState().impulse.sequence).toBe(0);
  });

  it('allows Sacred3DScene to resolve store from SacredStageProvider context', () => {
    const scopedStore = createSacredStageStore({ stage: 'chosen-aura' });

    render(
      <SacredStageProvider store={scopedStore}>
        <Sacred3DScene />
      </SacredStageProvider>,
    );

    const scene = screen.getByTestId('sacred-3d-scene');
    expect(scene.getAttribute('data-stage')).toBe('chosen-aura');
  });

  it('allows Sacred3DScene to override context with explicit store prop', () => {
    const contextStore = createSacredStageStore({ stage: 'chosen-aura' });
    const explicitStore = createSacredStageStore({ stage: 'star-of-faith' });

    render(
      <SacredStageProvider store={contextStore}>
        <Sacred3DScene store={explicitStore} />
      </SacredStageProvider>,
    );

    const scene = screen.getByTestId('sacred-3d-scene');
    expect(scene.getAttribute('data-stage')).toBe('star-of-faith');
  });

  it('preserves vanilla methods on useSacredStageStore for backward compatibility', () => {
    expect(typeof useSacredStageStore.getState).toBe('function');
    expect(typeof useSacredStageStore.setState).toBe('function');
    expect(typeof useSacredStageStore.subscribe).toBe('function');

    act(() => {
      useSacredStageStore.setState({ stage: 'star-of-faith' });
    });

    expect(useSacredStageStore.getState().stage).toBe('star-of-faith');
    expect(defaultSacredStageStore.getState().stage).toBe('star-of-faith');
  });
});

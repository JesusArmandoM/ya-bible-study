// @vitest-environment jsdom
import { Profiler, type ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const canvasRenderSpy = vi.fn();

// Lightweight R3F Canvas harness for jsdom unit tests (real WebGL2 Canvas runs unmocked in Playwright E2E).
vi.mock('@react-three/fiber', () => ({
  Canvas: ({
    dpr,
    frameloop,
  }: {
    dpr?: [number, number];
    frameloop?: string;
    children?: ReactNode;
  }) => {
    canvasRenderSpy({ dpr, frameloop });
    return (
      <canvas
        data-testid="mock-r3f-canvas"
        data-dpr={Array.isArray(dpr) ? dpr.join(',') : ''}
        data-frameloop={frameloop ?? 'always'}
      />
    );
  },
  useFrame: vi.fn(),
  useThree: vi.fn(),
}));

import { App } from '../../src/client/App';
import { Sacred3DScene } from '../../src/client/components/stage/Sacred3DScene';
import {
  detectWebGLSupport,
  setWebGLSupportProbeForTests,
} from '../../src/client/components/stage/webglSupport';
import {
  SACRED_STAGE_VARIANTS,
  createSacredStageStore,
  useSacredStageStore,
} from '../../src/client/state/sacredStageStore';

describe('Sacred3DScene component, fallback, and zero-rerender zustand impulses', () => {
  beforeEach(() => {
    canvasRenderSpy.mockClear();
    setWebGLSupportProbeForTests(null);
    useSacredStageStore.getState().reset();
  });

  afterEach(() => {
    setWebGLSupportProbeForTests(null);
    vi.restoreAllMocks();
  });

  it('quietly renders stage-matched SVG/CSS fallback when WebGL is unavailable in jsdom or getContext returns null', () => {
    const stderrSpy = vi.spyOn(console, 'error');
    const store = createSacredStageStore();

    expect(detectWebGLSupport()).toBe(false);

    // Also verify when WebGLRenderingContext exists on window but canvas.getContext returns null
    const win = window as Window & { WebGLRenderingContext?: unknown };
    const prevWebGL = win.WebGLRenderingContext;
    win.WebGLRenderingContext = function FakeWebGL() {};
    const getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(null);
    expect(detectWebGLSupport()).toBe(false);
    getContextSpy.mockRestore();
    win.WebGLRenderingContext = prevWebGL;

    render(<Sacred3DScene store={store} />);

    const sceneEl = screen.getByTestId('sacred-3d-scene');
    expect(sceneEl).toHaveAttribute('data-render-mode', 'fallback');
    expect(sceneEl).toHaveAttribute('data-stage', 'sanctuary-emblem');
    expect(screen.getByTestId('sacred-fallback-emblem')).toHaveAttribute(
      'data-stage',
      'sanctuary-emblem',
    );
    expect(document.querySelectorAll('canvas')).toHaveLength(0);

    for (const variant of SACRED_STAGE_VARIANTS) {
      act(() => {
        store.getState().setStage(variant);
      });
      expect(sceneEl).toHaveAttribute('data-stage', variant);
      expect(screen.getByTestId('sacred-fallback-emblem')).toHaveAttribute(
        'data-stage',
        variant,
      );
    }

    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('keeps a single persistent <canvas> (dpr 1..2) across all 6 stages and triggers zero React re-renders on triggerImpulse', () => {
    setWebGLSupportProbeForTests(() => true);
    const store = createSacredStageStore();
    let commitCount = 0;

    render(
      <Profiler
        id="Sacred3DSceneProfiler"
        onRender={() => {
          commitCount += 1;
        }}
      >
        <Sacred3DScene store={store} />
      </Profiler>,
    );

    const sceneEl = screen.getByTestId('sacred-3d-scene');
    expect(sceneEl).toHaveAttribute('data-render-mode', 'webgl');

    const initialCanvas = sceneEl.querySelector('canvas');
    expect(initialCanvas).not.toBeNull();
    expect(initialCanvas).toHaveAttribute('data-dpr', '1,2');
    expect(document.querySelectorAll('canvas')).toHaveLength(1);

    for (const variant of SACRED_STAGE_VARIANTS) {
      act(() => {
        store.getState().setStage(variant);
      });
      expect(sceneEl).toHaveAttribute('data-stage', variant);
      expect(document.querySelectorAll('canvas')).toHaveLength(1);
      expect(sceneEl.querySelector('canvas')).toBe(initialCanvas);
    }

    const commitsBeforeImpulses = commitCount;

    act(() => {
      store.getState().triggerImpulse('hand-raise');
      store.getState().triggerImpulse('random-spin', 1.5);
      store.getState().triggerImpulse('confirm-burst');
      store.getState().triggerImpulse('completion-pulse');
    });

    expect(store.getState().impulse.sequence).toBe(4);
    expect(commitCount).toBe(commitsBeforeImpulses);

    // Pointer move & release also update ref without React re-renders
    fireEvent.pointerMove(sceneEl, { clientX: 120, clientY: 60 });
    fireEvent.pointerLeave(sceneEl);
    expect(commitCount).toBe(commitsBeforeImpulses);
  });

  it('triggers zero React re-renders in App when transient impulses fire on useSacredStageStore', async () => {
    setWebGLSupportProbeForTests(() => true);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'ok',
          uptimeSeconds: 5,
          activeSessionCount: 0,
          wsReady: true,
          timestamp: '2026-10-29T19:00:00.000Z',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    let appCommits = 0;

    render(
      <Profiler
        id="AppProfiler"
        onRender={() => {
          appCommits += 1;
        }}
      >
        <App />
      </Profiler>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('sanctuary-health-pill')).toHaveAttribute(
        'data-status',
        'ok',
      );
    });

    const commitsAtSteadyState = appCommits;

    act(() => {
      useSacredStageStore.getState().triggerImpulse('hand-raise');
      useSacredStageStore.getState().triggerImpulse('random-spin');
      useSacredStageStore.getState().triggerImpulse('confirm-burst');
      useSacredStageStore.getState().triggerImpulse('completion-pulse');
    });

    expect(useSacredStageStore.getState().impulse.sequence).toBe(4);
    expect(appCommits).toBe(commitsAtSteadyState);
  });

  it('honors prefers-reduced-motion: reduce and pauses frameloop when document.hidden is true', () => {
    setWebGLSupportProbeForTests(() => true);

    let changeHandler: ((event: MediaQueryListEvent) => void) | null = null;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: true,
        media: '(prefers-reduced-motion: reduce)',
        addEventListener: (
          _type: string,
          listener: (event: MediaQueryListEvent) => void,
        ) => {
          changeHandler = listener;
        },
        removeEventListener: vi.fn(),
      })),
    });

    render(<Sacred3DScene store={createSacredStageStore()} />);

    const sceneEl = screen.getByTestId('sacred-3d-scene');
    const canvasEl = screen.getByTestId('mock-r3f-canvas');

    expect(sceneEl).toHaveAttribute('data-reduced-motion', 'true');
    expect(canvasEl).toHaveAttribute('data-frameloop', 'demand');

    // Simulate background tab visibilitychange -> hidden
    const originalHidden = Object.getOwnPropertyDescriptor(
      Document.prototype,
      'hidden',
    );
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => true,
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(sceneEl).toHaveAttribute('data-paused', 'true');
    expect(canvasEl).toHaveAttribute('data-frameloop', 'never');

    // Resume foreground tab -> visible
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false,
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(sceneEl).toHaveAttribute('data-paused', 'false');
    expect(canvasEl).toHaveAttribute('data-frameloop', 'demand');

    // Switch reduced-motion off dynamically
    act(() => {
      changeHandler?.({ matches: false } as MediaQueryListEvent);
    });
    expect(sceneEl).toHaveAttribute('data-reduced-motion', 'false');
    expect(canvasEl).toHaveAttribute('data-frameloop', 'always');

    if (originalHidden) {
      Object.defineProperty(Document.prototype, 'hidden', originalHidden);
    }
    Reflect.deleteProperty(window, 'matchMedia');
  });

  it('switches to SVG fallback on webglcontextlost (preventDefault) and recovers to webgl on webglcontextrestored', () => {
    setWebGLSupportProbeForTests(() => true);
    const store = createSacredStageStore({ stage: 'gospel-codex' });

    render(<Sacred3DScene store={store} />);

    const sceneEl = screen.getByTestId('sacred-3d-scene');
    const canvasEl = screen.getByTestId('mock-r3f-canvas');

    expect(sceneEl).toHaveAttribute('data-render-mode', 'webgl');
    expect(screen.queryByTestId('sacred-fallback-emblem')).toBeNull();

    const lostEvent = new Event('webglcontextlost', { cancelable: true });
    act(() => {
      canvasEl.dispatchEvent(lostEvent);
    });

    expect(lostEvent.defaultPrevented).toBe(true);
    expect(sceneEl).toHaveAttribute('data-render-mode', 'fallback');
    expect(sceneEl).toHaveAttribute('data-paused', 'true');
    expect(screen.getByTestId('sacred-fallback-emblem')).toHaveAttribute(
      'data-stage',
      'gospel-codex',
    );

    act(() => {
      canvasEl.dispatchEvent(new Event('webglcontextrestored'));
    });

    expect(sceneEl).toHaveAttribute('data-render-mode', 'webgl');
    expect(sceneEl).toHaveAttribute('data-paused', 'false');
    expect(screen.queryByTestId('sacred-fallback-emblem')).toBeNull();
  });
});

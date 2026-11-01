import { Canvas } from '@react-three/fiber';
import {
  Component,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ErrorInfo,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { useStore } from 'zustand';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';
import {
  SACRED_STAGE_METADATA,
  SacredStageStoreContext,
  defaultSacredStageStore,
  type SacredStageStore,
} from '../../state/sacredStageStore';
import { SacredFallbackEmblem } from './SacredFallbackEmblem';
import { SacredStageRig, type PointerTiltTarget } from './SacredStageRig';
import { detectWebGLSupport } from './webglSupport';

interface SacredCanvasErrorBoundaryProps {
  onError: () => void;
  children: ReactNode;
}

interface SacredCanvasErrorBoundaryState {
  hasError: boolean;
}

class SacredCanvasErrorBoundary extends Component<
  SacredCanvasErrorBoundaryProps,
  SacredCanvasErrorBoundaryState
> {
  public override state: SacredCanvasErrorBoundaryState = { hasError: false };

  public static getDerivedStateFromError(): SacredCanvasErrorBoundaryState {
    return { hasError: true };
  }

  public override componentDidCatch(_error: Error, _info: ErrorInfo): void {
    this.props.onError();
  }

  public override render(): ReactNode {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

export interface Sacred3DSceneProps {
  store?: SacredStageStore;
  className?: string;
  webglSupportedOverride?: boolean;
}

function readDocumentHidden(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }
  return Boolean(document.hidden);
}

function clampNormalized(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(Math.max(value, -1), 1);
}

export function Sacred3DScene({
  store: storeProp,
  className,
  webglSupportedOverride,
}: Sacred3DSceneProps) {
  const contextStore = useContext(SacredStageStoreContext);
  const store = storeProp ?? contextStore ?? defaultSacredStageStore;

  // Strictly primitive selectors so transient 60fps `impulse` ticks cause zero React re-renders.
  const stage = useStore(store, (s) => s.stage);
  const accentMode = useStore(store, (s) => s.accentMode);

  const reducedMotion = usePrefersReducedMotion();
  const [isDocumentHidden, setIsDocumentHidden] =
    useState<boolean>(readDocumentHidden);
  const [webglSupported] = useState<boolean>(() =>
    webglSupportedOverride !== undefined
      ? webglSupportedOverride
      : detectWebGLSupport(),
  );
  const [contextLost, setContextLost] = useState<boolean>(false);
  const [canvasErrored, setCanvasErrored] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const pointerTargetRef = useRef<PointerTiltTarget>({ x: 0, y: 0 });
  const canvasCleanupRef = useRef<(() => void) | null>(null);
  const attachedCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const bindCanvasContextListeners = useCallback(
    (canvasEl: HTMLCanvasElement | null) => {
      if (!canvasEl || attachedCanvasRef.current === canvasEl) {
        return;
      }

      canvasCleanupRef.current?.();

      const handleContextLost = (event: Event) => {
        event.preventDefault();
        setContextLost(true);
      };

      const handleContextRestored = () => {
        setContextLost(false);
      };

      canvasEl.addEventListener('webglcontextlost', handleContextLost);
      canvasEl.addEventListener('webglcontextrestored', handleContextRestored);

      attachedCanvasRef.current = canvasEl;
      canvasCleanupRef.current = () => {
        canvasEl.removeEventListener('webglcontextlost', handleContextLost);
        canvasEl.removeEventListener(
          'webglcontextrestored',
          handleContextRestored,
        );
        if (attachedCanvasRef.current === canvasEl) {
          attachedCanvasRef.current = null;
        }
      };
    },
    [],
  );

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const handleVisibilityChange = () => {
      setIsDocumentHidden(Boolean(document.hidden));
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const canMountCanvas = webglSupported && !canvasErrored;

  useEffect(() => {
    if (!canMountCanvas) {
      canvasCleanupRef.current?.();
      canvasCleanupRef.current = null;
      return;
    }

    const existingCanvas =
      containerRef.current?.querySelector('canvas') ?? null;
    if (existingCanvas) {
      bindCanvasContextListeners(existingCanvas);
    }

    return () => {
      canvasCleanupRef.current?.();
      canvasCleanupRef.current = null;
    };
  }, [canMountCanvas, bindCanvasContextListeners]);

  const updatePointerTarget = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const container = containerRef.current;
      if (!container) {
        return;
      }
      const rect = container.getBoundingClientRect();
      const width = rect.width > 0 ? rect.width : 180;
      const height = rect.height > 0 ? rect.height : 176;
      const nx = ((event.clientX - rect.left) / width) * 2 - 1;
      const ny = ((event.clientY - rect.top) / height) * 2 - 1;
      pointerTargetRef.current.x = clampNormalized(nx);
      pointerTargetRef.current.y = clampNormalized(ny);
    },
    [],
  );

  const resetPointerTarget = useCallback(() => {
    pointerTargetRef.current.x = 0;
    pointerTargetRef.current.y = 0;
  }, []);

  const handleCanvasError = useCallback(() => {
    setCanvasErrored(true);
  }, []);

  const renderMode: 'webgl' | 'fallback' =
    canMountCanvas && !contextLost ? 'webgl' : 'fallback';
  const paused = isDocumentHidden || contextLost;
  const frameloop: 'always' | 'demand' | 'never' = paused
    ? 'never'
    : reducedMotion
      ? 'demand'
      : 'always';

  const metadata = SACRED_STAGE_METADATA[stage];
  const rootClassName = className
    ? `sacred-stage-container ${className}`
    : 'sacred-stage-container';

  return (
    <div
      ref={containerRef}
      className={rootClassName}
      data-testid="sacred-3d-scene"
      data-stage={stage}
      data-accent-mode={accentMode}
      data-render-mode={renderMode}
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
      data-paused={paused ? 'true' : 'false'}
      role="img"
      aria-label={metadata.ariaDescription}
      onPointerDown={updatePointerTarget}
      onPointerMove={updatePointerTarget}
      onPointerUp={resetPointerTarget}
      onPointerCancel={resetPointerTarget}
      onPointerLeave={resetPointerTarget}
    >
      <div
        className="sacred-stage-ambient"
        aria-hidden="true"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${metadata.glowColor} 0%, transparent 72%)`,
        }}
      />

      {canMountCanvas && (
        <div
          className="sacred-stage-canvas-layer"
          data-hidden={contextLost ? 'true' : 'false'}
        >
          <SacredCanvasErrorBoundary onError={handleCanvasError}>
            <Canvas
              dpr={[1, 2]}
              frameloop={frameloop}
              camera={{ position: [0, 0, 3.6], fov: 40 }}
              gl={{
                antialias: true,
                alpha: true,
                powerPreference: 'high-performance',
              }}
              onCreated={(state) => {
                bindCanvasContextListeners(state.gl.domElement);
                state.invalidate();
              }}
            >
              <SacredStageRig
                store={store}
                stage={stage}
                accentMode={accentMode}
                reducedMotion={reducedMotion}
                paused={paused}
                pointerTargetRef={pointerTargetRef}
              />
            </Canvas>
          </SacredCanvasErrorBoundary>
        </div>
      )}

      {renderMode === 'fallback' && (
        <SacredFallbackEmblem
          stage={stage}
          accentMode={accentMode}
          reducedMotion={reducedMotion}
        />
      )}
    </div>
  );
}

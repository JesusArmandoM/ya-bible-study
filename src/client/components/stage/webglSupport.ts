export type WebGLSupportProbe = () => boolean;

let testProbeOverride: WebGLSupportProbe | null = null;

export function setWebGLSupportProbeForTests(
  probe: WebGLSupportProbe | null,
): void {
  testProbeOverride = probe;
}

/**
 * Quietly detects whether the current browser environment can create a WebGL context.
 *
 * Guards `window.WebGLRenderingContext` / `window.WebGL2RenderingContext` before calling
 * `canvas.getContext` so `jsdom` tests never emit unimplemented canvas stderr warnings.
 */
export function detectWebGLSupport(customProbe?: WebGLSupportProbe): boolean {
  const override = customProbe ?? testProbeOverride;
  if (override) {
    try {
      return Boolean(override());
    } catch {
      return false;
    }
  }

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }

  const win = window as Window & {
    WebGLRenderingContext?: unknown;
    WebGL2RenderingContext?: unknown;
  };

  if (!win.WebGLRenderingContext && !win.WebGL2RenderingContext) {
    return false;
  }

  try {
    const probeCanvas = document.createElement('canvas');
    probeCanvas.width = 1;
    probeCanvas.height = 1;

    const glContext =
      probeCanvas.getContext('webgl2') ??
      probeCanvas.getContext('webgl') ??
      probeCanvas.getContext('experimental-webgl');

    if (!glContext) {
      return false;
    }

    const maybeWebGL = glContext as Partial<WebGLRenderingContext>;
    if (typeof maybeWebGL.getExtension === 'function') {
      try {
        maybeWebGL.getExtension('WEBGL_lose_context')?.loseContext();
      } catch {
        // Ignore cleanup errors on synthetic or restricted contexts.
      }
    }

    return true;
  } catch {
    return false;
  }
}

import { expect, test } from '@playwright/test';

const CANONICAL_STAGES = [
  'prayer-orb',
  'chosen-aura',
  'gospel-codex',
  'random-polyhedron',
  'star-of-faith',
  'sanctuary-emblem',
] as const;

test.describe('Persistent Sacred3DScene hero stage', () => {
  test('mounts 1 persistent WebGL canvas across all 6 stages, consumes zustand impulses in useFrame, and tilts with spring return', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    const externalAssetUrls: string[] = [];

    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });
    page.on('request', (req) => {
      const url = req.url();
      if (/\.(glb|gltf|hdr|exr)(\?|$)/i.test(url)) {
        externalAssetUrls.push(url);
      }
    });

    await page.goto('/');

    const scene = page.getByTestId('sacred-3d-scene');
    await expect(scene).toBeVisible();
    await expect(scene).toHaveAttribute('data-render-mode', 'webgl');
    await expect(scene).toHaveAttribute('data-stage', 'sanctuary-emblem');
    await expect(scene).toHaveAttribute('data-reduced-motion', 'false');
    await expect(scene).toHaveAttribute('data-paused', 'false');

    const canvas = scene.locator('canvas');
    await expect(canvas).toHaveCount(1);
    await expect(canvas).toHaveAttribute(
      'data-rendered-stage',
      'sanctuary-emblem',
    );

    const initialMetrics = await page.evaluate(() => {
      const allCanvases = document.querySelectorAll('canvas');
      const stageEl = document.querySelector(
        '[data-testid="sacred-3d-scene"]',
      ) as HTMLElement | null;
      const canvasEl = allCanvases[0] ?? null;
      (
        window as Window & { __initialSacredCanvas?: HTMLCanvasElement | null }
      ).__initialSacredCanvas = canvasEl;

      const pills = Array.from(
        document.querySelectorAll<HTMLElement>('[data-stage-pill]'),
      ).map((pill) => {
        const rect = pill.getBoundingClientRect();
        return {
          id: pill.dataset.stagePill,
          width: rect.width,
          height: rect.height,
        };
      });

      const stageRect = stageEl?.getBoundingClientRect();
      return {
        canvasCount: allCanvases.length,
        touchAction: stageEl ? window.getComputedStyle(stageEl).touchAction : '',
        canvasBufferWidth: canvasEl?.width ?? 0,
        stageCssWidth: stageRect?.width ?? 0,
        stageCssHeight: stageRect?.height ?? 0,
        pills,
        hasHorizontalOverflow:
          document.documentElement.scrollWidth > window.innerWidth,
        bodyText: document.body.innerText,
      };
    });

    expect(initialMetrics.canvasCount).toBe(1);
    expect(initialMetrics.touchAction).toBe('pan-y');
    expect(initialMetrics.stageCssHeight).toBeGreaterThanOrEqual(140);
    expect(initialMetrics.stageCssHeight).toBeLessThanOrEqual(220);
    expect(initialMetrics.canvasBufferWidth).toBeLessThanOrEqual(
      Math.ceil(initialMetrics.stageCssWidth * 2) + 4,
    );
    expect(initialMetrics.hasHorizontalOverflow).toBe(false);
    expect(initialMetrics.bodyText).not.toContain('Assistant');
    expect(initialMetrics.pills).toHaveLength(6);
    for (const pill of initialMetrics.pills) {
      expect(pill.height).toBeGreaterThanOrEqual(44);
      expect(pill.width).toBeGreaterThanOrEqual(44);
    }

    // Morph across all 6 canonical stages and verify the exact same <canvas> stays mounted.
    let expectedImpulseSeq = 0;
    for (const stageId of CANONICAL_STAGES) {
      expectedImpulseSeq += 1;
      await page.getByTestId(`stage-pill-${stageId}`).click();
      await expect(scene).toHaveAttribute('data-stage', stageId);
      await expect(canvas).toHaveAttribute('data-rendered-stage', stageId);
      await expect(canvas).toHaveAttribute(
        'data-last-impulse-seq',
        String(expectedImpulseSeq),
      );

      const persistenceCheck = await page.evaluate(() => {
        const allCanvases = document.querySelectorAll('canvas');
        const initial = (
          window as Window & {
            __initialSacredCanvas?: HTMLCanvasElement | null;
          }
        ).__initialSacredCanvas;
        return {
          count: allCanvases.length,
          sameCanvasElement: allCanvases[0] === initial,
        };
      });
      expect(persistenceCheck).toEqual({
        count: 1,
        sameCanvasElement: true,
      });
    }

    // Tapping the already-active pill still fires a transient 60fps zustand impulse into useFrame.
    expectedImpulseSeq += 1;
    await page.getByTestId('stage-pill-sanctuary-emblem').click();
    await expect(canvas).toHaveAttribute(
      'data-last-impulse-seq',
      String(expectedImpulseSeq),
    );

    // Drag pointer across stage to tilt 3D rig, then release and verify spring return to rest.
    const box = await scene.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      const startX = box.x + box.width * 0.5;
      const startY = box.y + box.height * 0.5;
      const dragX = box.x + box.width * 0.92;
      const dragY = box.y + box.height * 0.15;

      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(dragX, dragY, { steps: 8 });
      await expect(canvas).toHaveAttribute('data-tilted', 'true');

      await page.mouse.up();
      await page.mouse.move(8, 8);
      await expect(canvas).toHaveAttribute('data-tilted', 'false');
    }

    expect(externalAssetUrls).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('honors prefers-reduced-motion: reduce and recovers cleanly across webglcontextlost and webglcontextrestored', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    const scene = page.getByTestId('sacred-3d-scene');
    const canvas = scene.locator('canvas');

    await expect(scene).toHaveAttribute('data-reduced-motion', 'true');
    await expect(scene).toHaveAttribute('data-render-mode', 'webgl');
    await expect(canvas).toHaveAttribute(
      'data-rendered-stage',
      'sanctuary-emblem',
    );

    // Stage switch under frameloop="demand" immediately invalidates and renders new stage.
    await page.getByTestId('stage-pill-gospel-codex').click();
    await expect(scene).toHaveAttribute('data-stage', 'gospel-codex');
    await expect(canvas).toHaveAttribute('data-rendered-stage', 'gospel-codex');

    // Simulate webglcontextlost on active <canvas>.
    const defaultPrevented = await page.evaluate(() => {
      const canvasEl = document.querySelector('canvas');
      if (!canvasEl) return false;
      const event = new Event('webglcontextlost', { cancelable: true });
      canvasEl.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(defaultPrevented).toBe(true);

    await expect(scene).toHaveAttribute('data-render-mode', 'fallback');
    await expect(scene).toHaveAttribute('data-paused', 'true');
    const fallback = page.getByTestId('sacred-fallback-emblem');
    await expect(fallback).toBeVisible();
    await expect(fallback).toHaveAttribute('data-stage', 'gospel-codex');

    // Simulate webglcontextrestored and verify automatic recovery back to WebGL.
    await page.evaluate(() => {
      const canvasEl = document.querySelector('canvas');
      canvasEl?.dispatchEvent(new Event('webglcontextrestored'));
    });

    await expect(scene).toHaveAttribute('data-render-mode', 'webgl');
    await expect(scene).toHaveAttribute('data-paused', 'false');
    await expect(fallback).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });

  test('renders SVG/CSS Sacred Midnight fallback cleanly when WebGL context creation is unavailable', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    await page.addInitScript(() => {
      const origGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function patchedGetContext(
        this: HTMLCanvasElement,
        contextId: string,
        options?: unknown,
      ) {
        if (
          contextId === 'webgl' ||
          contextId === 'webgl2' ||
          contextId === 'experimental-webgl'
        ) {
          return null;
        }
        return origGetContext.call(
          this,
          contextId as '2d',
          options as CanvasRenderingContext2DSettings,
        );
      } as typeof HTMLCanvasElement.prototype.getContext;
    });

    await page.goto('/');

    const scene = page.getByTestId('sacred-3d-scene');
    const fallback = page.getByTestId('sacred-fallback-emblem');

    await expect(scene).toHaveAttribute('data-render-mode', 'fallback');
    await expect(fallback).toBeVisible();
    await expect(fallback).toHaveAttribute('data-stage', 'sanctuary-emblem');
    await expect(page.locator('canvas')).toHaveCount(0);

    await page.getByTestId('stage-pill-prayer-orb').click();
    await expect(fallback).toHaveAttribute('data-stage', 'prayer-orb');

    await page.getByTestId('stage-pill-star-of-faith').click();
    await expect(fallback).toHaveAttribute('data-stage', 'star-of-faith');

    expect(pageErrors).toEqual([]);
  });
});

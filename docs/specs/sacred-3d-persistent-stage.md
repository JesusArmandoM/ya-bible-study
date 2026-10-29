# Feature Implementation Spec: Persistent Sacred3DScene canvas morphs emblems across session stages

## Source Feature

- `id`: `sacred-3d-persistent-stage`
- `area`: `3d-motion`
- `depends_on`: `["app-shell-single-port-bootstrap"]`
- `status`: `not_started`
- `source`: `feature_list.json`

## Goal

Deliver the persistent single-canvas Three.js hero stage (`Sacred3DScene`) and its `zustand` state/impulse bridge so every liturgical stage of **YA Bible Study** can morph smoothly across all 6 canonical procedural PBR geometries (`sanctuary-emblem`, `prayer-orb`, `chosen-aura`, `gospel-codex`, `random-polyhedron`, `star-of-faith`—plus warm-amber hospitality ring styling for Section 2) within a single WebGL `<Canvas>` per active viewport (`dpr={[1, 2]}`).

The stage must support tactile finger/pointer tilt inertia with spring return to rest, consume 60fps transient action impulses (`hand-raise`, `random-spin`, `confirm-burst`, `completion-pulse`) inside `useFrame` via `store.getState()` **without triggering React component re-renders**, pause rendering when `document.hidden` is `true`, honor `prefers-reduced-motion: reduce`, and automatically render a matching Sacred Midnight SVG/CSS emblem fallback when WebGL is unavailable or `webglcontextlost` fires.

## Non-Goals

- Implementing `/ws` room creation, `leaderPin` lock, or `Participant` join handlers (deferred to `ws-live-session-room-lifecycle`).
- Implementing interactive `Study Leader` / `Participant` role-selection forms or PIN claim sheets (deferred to `welcome-role-selection-flow`).
- Implementing `GET /api/studies/default` or `.md`/`.pdf` study parsing (deferred to `preloaded-great-is-your-faith-seed` and parser features).
- Implementing Title Lobby QR generation, Section 1–5 study screens, or Desktop Dual Side-by-Side frames (deferred to their respective features, though `Sacred3DScene` must accept an optional scoped store instance so Dual Mode can later mount 2 independent canvases cleanly).
- Fetching external `.glb` models or remote CDN HDRI textures over the network (all geometries and studio PBR environment lighting must be 100% procedural and offline-safe).

## Job Story

When participating in or leading a live **YA Bible Study** session on a mobile or desktop browser,
I want a contemplative, responsive 3D sacred emblem that morphs smoothly across prayer, Gospel proclamation, random selection, and closing stages without frame hitches or battery drain,
so each liturgical moment feels tactile and reverent while staying reliable even on reduced-motion or non-WebGL devices.

## Users And Permissions

- **Unauthenticated Visitor / `Study Leader` / `Participant`**: Views and interacts (pointer/touch tilt and tactile stage preview pills in the bootstrap shell) with `Sacred3DScene`.
- **Terminology Invariant**: All stage labels, ARIA descriptions, store types, and preview controls must use `Study Leader` and `Participant`—never `Assistant`.

## Acceptance Scenarios

### Scenario 1: Single persistent WebGL canvas morphs across all 6 canonical stages

Given a browser with WebGL support opens the Midnight Sanctuary shell (`390x844` mobile viewport)
When the active stage transitions across `sanctuary-emblem`, `prayer-orb`, `chosen-aura`, `gospel-codex`, `random-polyhedron`, and `star-of-faith`
Then `document.querySelectorAll('canvas').length` remains `1` (`dpr` capped at `[1, 2]`), the exact same `<canvas>` DOM element stays mounted without recreating WebGL contexts, and `Sacred3DScene` updates `data-stage` and cross-morphs procedural PBR meshes and liturgical light accents smoothly.

### Scenario 2: 60fps `zustand` transient impulses and pointer tilt run without React re-renders

Given `Sacred3DScene` is mounted and connected to its `zustand` stage store
When `triggerImpulse('hand-raise' | 'random-spin' | 'confirm-burst' | 'completion-pulse')` is invoked repeatedly or the user drags/tilts across the stage container and releases
Then `store.getState().impulse` increments sequence/metadata read by `useFrame` (accelerating spin/pulse/flare and damping back to rest, with pointer tilt springing back to `(0, 0)`), while triggering **zero** React component re-renders in `Sacred3DScene` or `App`.

### Scenario 3: `prefers-reduced-motion` and background tab visibility hardening

Given `Sacred3DScene` is mounted
When `(prefers-reduced-motion: reduce)` matches
Then `data-reduced-motion="true"` is set, continuous idle rotation/bobbing and rapid polyhedron spinning are suppressed in favor of calm static/gentle PBR presentation (`frameloop="demand"` when visible)
And when `document.hidden` becomes `true` via `visibilitychange`, `<Canvas>` switches to `frameloop="never"` (`data-paused="true"`) and resumes cleanly with clamped frame delta (`<= 0.05s`) when `document.hidden` returns to `false`.

### Scenario 4: Automatic SVG/CSS fallback on unavailable WebGL or `webglcontextlost`

Given WebGL context creation is unavailable (`WebGLRenderingContext` absent in `jsdom` or `HTMLCanvasElement.prototype.getContext` returning `null`) or `webglcontextlost` is dispatched on the active `<canvas>`
When `Sacred3DScene` renders or handles the context-loss event (`event.preventDefault()`)
Then `Sacred3DScene` switches `data-render-mode="fallback"` without throwing uncaught errors, displays the stage-matched Sacred Midnight SVG/CSS emblem (`[data-testid="sacred-fallback-emblem"]`), and automatically restores `data-render-mode="webgl"` if `webglcontextrestored` fires.

### Scenario 5: App shell integration preserves all bootstrap invariants

Given `Sacred3DScene` and its compact liturgical stage preview controls are mounted in `src/client/App.tsx`
When the app loads on `390x844` mobile Chromium and in Vitest `jsdom`
Then `YA`, `BIBLE STUDY`, `Bible Study for Young Adults` (`Playfair Display`), `Study Leader`, `Participant`, and `v1.0 · Connected in community` (`sanctuary-health-pill`) all remain intact with zero `"Assistant"` text, `#0B0D17` background, `>= 16px` input font-size, and zero horizontal overflow.

## Repository Research

### Files Inspected

- `feature_list.json` & `PROGRESS.md` — `app-shell-single-port-bootstrap` is `accepted`; `sacred-3d-persistent-stage` prerequisite is satisfied.
- `DESIGN.md` & `ux/1. Welcome.png`, `ux/3. Title - Leader.png`, `ux/5. Prayer - Assistant.png`, `ux/6. Prayer - Selected.png`, `ux/8. Ice Breaker - Assistant.png`, `ux/8. Reading - Assistant.png`, `ux/9. Randomizing.png`, `ux/12. Closing Prayer.png` — defines stage colors (`#E2A83E`, `#B855C8`, `#6E75F5`, `#0B0D17`), `140px–220px` hero stage height, spring constants (`springTap`: `420/26`, `springMorph`: `280/28`), and 3D impulse behaviors.
- `ARCHITECTURE.md`, `CONSTRAINTS.md`, `CONTEXT.md`, `docs/technical-discovery.md` — single-canvas GPU budget (`<= 1` per viewport, `<= 2` in Dual Mode, `dpr={[1, 2]}`), `zustand` transient 60fps channel, and module boundaries (`src/client` never imported by `src/server`).
- `package.json`, `tsconfig*.json`, `vitest.config.ts`, `playwright.config.ts`, `.env` — React `^19.3.1`, TypeScript `5.9` (`strict: true`, `verbatimModuleSyntax: true`, `noUncheckedIndexedAccess: true`), worktree ports `PORT=3103`, `API_PORT=3203`, `PLAYWRIGHT_PORT=3303`.
- `src/client/App.tsx`, `src/client/styles/tokens.css`, `src/client/styles/global.css`, `tests/unit/app-shell.test.tsx`, `tests/e2e/app-shell-bootstrap.spec.ts` — current shell structure and assertions that must remain green.

### Existing Patterns To Follow

- **Verified React 19 npm compatibility**: Registry inspection confirms clean peerDependencies against `react@^19.3.1` for `three@^0.186.1`, `@types/three@^0.186.0`, `@react-three/fiber@^9.8.2` (`react: ">=19 <19.4"`), `zustand@^5.0.16` (`react: ">=18.0.0"`), and `motion@^14.8.0` (`react: "^18.0.0 || ^19.0.0"`). Omit `@react-three/drei` to avoid 21 heavy transitive dependencies (`@mediapipe/tasks-vision`, `hls.js`, `troika-three-text`) and runtime external CDN HDRI fetches; use Three.js's built-in `PMREMGenerator` + `RoomEnvironment` (`three/examples/jsm/environments/RoomEnvironment.js`) plus procedural studio lights instead.
- **Test environment realities**: Empirical checks show Playwright headless Chromium supports `WebGL2` (`WebKit WebGL`), whereas `jsdom@26.1.0` defines `matchMedia`, `ResizeObserver`, and `WebGLRenderingContext` as `undefined` (and emits stderr noise if `canvas.getContext` is called unconditionally). Guard `window.WebGLRenderingContext || window.WebGL2RenderingContext` before probing `canvas.getContext`, and guard `typeof window.matchMedia === 'function'`.

### Current Gaps

- `three`, `@types/three`, `@react-three/fiber`, `zustand`, and `motion` are not yet in `package.json`.
- No `src/client/state/` store or `src/client/components/stage/` 3D/fallback components exist yet.

## Technical Approach

1. **Scoped + Default `zustand` Stage & Transient Impulse Store (`src/client/state/sacredStageStore.ts`)**:
   - Export canonical types:
     - `SACRED_STAGE_VARIANTS = ['sanctuary-emblem', 'prayer-orb', 'chosen-aura', 'gospel-codex', 'random-polyhedron', 'star-of-faith'] as const` (`SacredStageVariant`).
     - `SacredImpulseKind = 'hand-raise' | 'random-spin' | 'confirm-burst' | 'completion-pulse'`.
     - `SacredAccentMode = 'default' | 'hospitality'` (allowing Section 2 Icebreaker's warm bronze hospitality rings to render on `sanctuary-emblem` inside the same persistent `<Canvas>` via `resolveSacredStage(context)`).
   - Provide `createSacredStageStore(initial?)` (vanilla/bound `zustand` store factory so future Dual Side-by-Side Mode can instantiate 2 isolated viewport stores) plus default singleton `useSacredStageStore`.
   - Store state holds `{ stage, accentMode, impulse: { sequence, kind, intensity, triggeredAtMs }, setStage, triggerImpulse, reset }`.
   - React components (`Sacred3DScene`, `App`) subscribe **strictly** via primitive selectors (`useStore(store, (s) => s.stage)` and `useStore(store, (s) => s.accentMode)`), never selecting `impulse` or the root state object. `useSyncExternalStore` guarantees **zero React re-renders** when `triggerImpulse(...)` updates `impulse`, while `SacredStageRig` reads `store.getState().impulse` directly inside `useFrame` at 60fps.

2. **Pure Deterministic 60fps Stage & Physics Stepper (`src/client/components/stage/sacredStageMath.ts`)**:
   - Extract frame simulation into pure functions (`createSacredFrameState`, `stepSacredFrameState`) clamping `dt = Math.min(Math.max(delta, 0), 0.05)`:
     - Smoothly cross-damps per-variant blend weights (`0..1`) across the 6 canonical stages (`springMorph` feel; instant settle when `reducedMotion` is `true`).
     - Integrates pointer/finger tilt spring (`targetX`, `targetY` in `[-0.38, 0.38]` rad -> damped angular velocity returning smoothly to `(0, 0)` on release).
     - Consumes new `impulse.sequence` ticks into decaying channels: `shockwave` + `emissiveBoost` (`hand-raise`), `polyhedronSpinVel` (`random-spin` physics damping), `goldFlare` (`confirm-burst`), and `completionWave` (`completion-pulse`), clamping rapid spin when `reducedMotion` is `true`.

3. **Procedural PBR Geometries & Persistent `<Canvas>` (`SacredStageRig.tsx` + `Sacred3DScene.tsx`)**:
   - Inside `<Canvas dpr={[1, 2]} frameloop={paused ? 'never' : reducedMotion ? 'demand' : 'always'} gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}>`:
     - Generate an offline studio reflection `envMap` once via `THREE.PMREMGenerator` + `RoomEnvironment` (disposing generator/renderTarget cleanly on unmount) paired with key/fill/rim lights smoothly tinted per active stage (`#E2A83E`, `#B855C8`, `#6E75F5`).
     - Keep all 6 lightweight procedural PBR mesh groups mounted in one `<group>` (setting `group.visible = weight > 0.004` so inactive stages incur `0` draw calls while avoiding shader recompile hitches):
       1. `sanctuary-emblem`: Sculpted `#E2A83E` 4-point sanctuary star + obsidian core + tilted golden halo torus (plus dual warm-amber hospitality rings when `accentMode === 'hospitality'`).
       2. `prayer-orb`: Translucent/clearcoat `#B855C8` physical prayer sphere + two concentric liturgical halo rings.
       3. `chosen-aura`: Radiant `#E2A83E` chalice/vessel silhouette + luminous inner pearl + ascending double golden aura rings.
       4. `gospel-codex`: Angled `#6E75F5` open two-leaf Gospel codex diptych with `#E2A83E` gilded spine and halo.
       5. `random-polyhedron`: Faceted `#B855C8` icosahedron jewel core inside a counter-rotating `#E2A83E` dodecahedron wireframe/edge cage.
       6. `star-of-faith`: Extruded beveled 5-point `#E2A83E` Star of Faith inside a rounded golden sanctuary nimbus ring.
     - Attach pointer drag/move/leave listeners (`touch-action: pan-y` so vertical mobile scroll never blocks) updating a mutable `pointerTargetRef` without `setState`.
     - Guard WebGL via `detectWebGLSupport()` (`webglSupport.ts`), an inner `SacredCanvasErrorBoundary`, and `gl.domElement` listeners for `webglcontextlost` (`event.preventDefault()`, overlay `<SacredFallbackEmblem>`, pause frameloop) and `webglcontextrestored` (hide fallback, resume WebGL).

4. **SVG/CSS Fallback & Bootstrap Shell Preview (`SacredFallbackEmblem.tsx` + `src/client/App.tsx`)**:
   - `SacredFallbackEmblem` renders crisp layered SVG artwork + ambient CSS glow tailored to each of the 6 stage variants (`data-testid="sacred-fallback-emblem"`, `data-stage={stage}`).
   - Mount `<Sacred3DScene />` inside `src/client/App.tsx`'s `.sanctuary-stage-card` alongside a compact 2-column accessible stage preview pill grid (`motion.button` from `motion/react`, `min-height: 44px`, `whileTap={{ scale: 0.96 }}`) that lets users and Playwright tests switch across the 6 sacred emblems and trigger matching `zustand` impulses while preserving all existing bootstrap copy and health status elements.

## Expected File Changes

- `package.json` & `package-lock.json` — modify; add runtime dependencies `three` (`^0.186.1`), `@react-three/fiber` (`^9.8.2`), `zustand` (`^5.0.16`), `motion` (`^14.8.0`) and devDependency `@types/three` (`^0.186.0`).
- `src/client/state/sacredStageStore.ts` — create; 6 canonical `SacredStageVariant` definitions, stage metadata/labels/colors, `resolveSacredStage` mapper, `createSacredStageStore` factory, and `useSacredStageStore` with zero-rerender transient `impulse` channel.
- `src/client/lib/usePrefersReducedMotion.ts` — create; `matchMedia('(prefers-reduced-motion: reduce)')` hook safe in `jsdom` and reactive to runtime changes.
- `src/client/components/stage/webglSupport.ts` — create; `jsdom`-quiet `detectWebGLSupport()` helper with injectable probe override for tests.
- `src/client/components/stage/sacredStageMath.ts` — create; pure 60fps frame stepper for variant morph weights, pointer tilt spring inertia, impulse physics decay, and reduced-motion clamping.
- `src/client/components/stage/SacredFallbackEmblem.tsx` — create; accessible stage-matched SVG/CSS Sacred Midnight emblem fallback for all 6 variants.
- `src/client/components/stage/SacredStageRig.tsx` — create; `@react-three/fiber` procedural PBR 6-stage mesh rig + offline `RoomEnvironment` studio lighting + `useFrame` transient `zustand` reader.
- `src/client/components/stage/Sacred3DScene.tsx` — create; persistent single-`<Canvas>` stage wrapper with pointer tilt ref, `visibilitychange` pause, `prefers-reduced-motion`, error boundary, and `webglcontextlost`/`webglcontextrestored` fallback.
- `src/client/App.tsx` & `src/client/styles/global.css` — modify; mount `<Sacred3DScene />` and `motion/react` stage preview pills inside `.sanctuary-stage-card` without altering existing bootstrap headings, role badges (`Study Leader` / `Participant`), or `sanctuary-health-pill`.
- `tests/unit/sacred-stage-store-and-math.test.ts` — create; Vitest unit suite covering store transitions, `resolveSacredStage`, impulse physics decay, pointer spring return, delta clamping, and reduced-motion clamping.
- `tests/unit/sacred-3d-scene.test.tsx` — create; Vitest `jsdom` component suite verifying all 6 stage transitions, **zero React re-renders** on `triggerImpulse`, `prefers-reduced-motion`, `visibilitychange` pause/resume, unavailable-WebGL fallback, and `webglcontextlost`/`webglcontextrestored` handling.
- `tests/e2e/sacred-3d-stage.spec.ts` — create; Playwright `mobile-chromium` (`390x844`) E2E suite verifying live single-`<Canvas>` persistence across all 6 stages, pointer drag tilt, reduced-motion media emulation, `webglcontextlost` recovery, and forced non-WebGL SVG fallback.
- `ARCHITECTURE.md` — modify; document `src/client/state/` and `src/client/components/stage/` boundaries.

## Visual Design Impact

- UI involved: yes
- Design source: `DESIGN.md` and `ux/1. Welcome.png`, `ux/3. Title - Leader.png`, `ux/5. Prayer - Assistant.png`, `ux/6. Prayer - Selected.png`, `ux/8. Ice Breaker - Assistant.png`, `ux/8. Reading - Assistant.png`, `ux/9. Randomizing.png`, `ux/12. Closing Prayer.png`
- Screens or states affected: Root Midnight Sanctuary stage card (`Sacred3DScene` hero viewport `176px` mobile height, 6 liturgical stage palettes, WebGL vs SVG fallback state, reduced-motion state, compact `2x3` stage preview pills with `>= 44px` touch height).
- New design artifact required: no — `DESIGN.md` specifies exact tokens (`#0B0D17` base, `#171B2E` surface, `#E2A83E` Sacred Gold with `#11131F` active ink, `#B855C8` Liturgical Violet, `#6E75F5` Sanctuary Periwinkle) and spring physics (`420/26` tap, `280/28` morph).

## Durable Documentation Impact

- `ARCHITECTURE.md`: update — Add `src/client/state/sacredStageStore.ts` (`zustand` 60fps transient bridge) and `src/client/components/stage/` (`Sacred3DScene` single-canvas PBR stage + SVG/CSS fallback) under `src/client/`.
- `CONSTRAINTS.md`: not needed — Constraint #3 (`Participant` terminology), Constraint #7 (`>= 16px` inputs / `44px` targets), and Constraint #8 (`Persistent Single-Canvas 3D Budget`) already capture all durable invariants.
- `AGENTS.md`: not needed — Agent startup workflow and verification gates remain unchanged.
- Other docs: Update `feature_list.json` and `PROGRESS.md` during implementation/validation with verification evidence; discovery docs under `docs/` require no changes.

## Implementation Plan

1. Add `three`, `@types/three`, `@react-three/fiber`, `zustand`, and `motion` to `package.json` and verify clean `npm install` + `npm run typecheck` with React 19.
2. Implement `sacredStageStore.ts`, `usePrefersReducedMotion.ts`, `webglSupport.ts`, and pure `sacredStageMath.ts`, followed by unit tests in `tests/unit/sacred-stage-store-and-math.test.ts`.
3. Implement `SacredFallbackEmblem.tsx`, `SacredStageRig.tsx`, and `Sacred3DScene.tsx` with single-canvas PBR lighting, 6 procedural geometries, pointer tilt inertia, `visibilitychange` pause, reduced-motion handling, and WebGL unavailable/context-loss fallback.
4. Integrate `<Sacred3DScene />` and `motion/react` stage preview pills into `src/client/App.tsx` + `src/client/styles/global.css`, add `tests/unit/sacred-3d-scene.test.tsx` and `tests/e2e/sacred-3d-stage.spec.ts`, update `ARCHITECTURE.md`, and run all gates on worktree ports.

## Implementation Tasks

- [ ] Install `three@^0.186.1`, `@react-three/fiber@^9.8.2`, `zustand@^5.0.16`, `motion@^14.8.0`, and `@types/three@^0.186.0` in `package.json` without `--legacy-peer-deps`.
- [ ] Create `src/client/state/sacredStageStore.ts` with the 6 canonical `SacredStageVariant` IDs, `resolveSacredStage`, `createSacredStageStore`, and `useSacredStageStore` (`triggerImpulse` causing `0` React re-renders).
- [ ] Create `src/client/lib/usePrefersReducedMotion.ts`, `src/client/components/stage/webglSupport.ts`, and `src/client/components/stage/sacredStageMath.ts`.
- [ ] Create `src/client/components/stage/SacredFallbackEmblem.tsx`, `src/client/components/stage/SacredStageRig.tsx`, and `src/client/components/stage/Sacred3DScene.tsx` (`dpr={[1, 2]}`, `touch-action: pan-y`, `visibilitychange` pause, `webglcontextlost`/`webglcontextrestored` handling).
- [ ] Mount `<Sacred3DScene />` and `motion/react` tactile stage preview controls in `src/client/App.tsx` and style in `src/client/styles/global.css` (`>= 44px` targets, zero horizontal overflow on `390x844`, zero `"Assistant"` text).
- [ ] Add `tests/unit/sacred-stage-store-and-math.test.ts`, `tests/unit/sacred-3d-scene.test.tsx`, and `tests/e2e/sacred-3d-stage.spec.ts`; update `ARCHITECTURE.md`.

## Verification Plan

- Run `./init.sh` (non-blocking baseline gate: executes `npm run typecheck`, `npm test`, and `npm run build`, and must **not** start long-running `npm run dev` or `npm start` processes).
- Confirm Vitest unit and component tests pass (`tests/unit/sacred-stage-store-and-math.test.ts`, `tests/unit/sacred-3d-scene.test.tsx`, `tests/unit/app-shell.test.tsx`, `tests/unit/runtime-url.test.ts`, `tests/integration/server-health.test.ts`) with zero `jsdom` canvas stderr errors.
- Run Playwright mobile E2E suite on the dedicated worktree port: `PLAYWRIGHT_PORT=3303 npm run test:e2e`, verifying both `tests/e2e/app-shell-bootstrap.spec.ts` and `tests/e2e/sacred-3d-stage.spec.ts` pass on `mobile-chromium` (`390x844`).

## Evidence To Capture

- Exit code and summary of `./init.sh` (`npm run typecheck`, Vitest suite/test count, production Vite/server bundle output).
- Vitest proof of 6 stage transitions, `0` React re-renders during `triggerImpulse` bursts, `prefers-reduced-motion` clamping, and WebGL-unavailable / `webglcontextlost` fallback.
- `PLAYWRIGHT_PORT=3303 npm run test:e2e` pass summary confirming `<= 1` persistent `<canvas>` element across all 6 stages, pointer tilt interaction, `webglcontextlost` fallback + `webglcontextrestored` recovery, and clean non-WebGL fallback on `390x844` mobile Chromium.

## Validator Checklist

- [ ] Implementation stays within `sacred-3d-persistent-stage` scope (no premature `/ws` room handlers, study parser routes, or role-selection forms).
- [ ] `package.json` installs cleanly under React 19 (`npm ci` / `npm install` without peer-dependency conflicts) and uses zero external `.glb`/HDRI network requests.
- [ ] At most `1` persistent WebGL `<Canvas>` (`dpr={[1, 2]}`) mounts per viewport and morphs across all 6 canonical stage variants without unmounting `<canvas>`.
- [ ] `triggerImpulse` updates transient 3D physics state read in `useFrame` with **zero** React component re-renders.
- [ ] `prefers-reduced-motion: reduce`, `document.hidden` frame pausing, unavailable-WebGL SVG/CSS fallback, and `webglcontextlost`/`webglcontextrestored` recovery all work and are covered by automated Vitest + Playwright tests.
- [ ] Existing bootstrap invariants (`Study Leader` / `Participant`, zero `"Assistant"`, `#0B0D17`, `Playfair Display`, `>= 16px` inputs, `>= 44px` interactive pills, zero horizontal overflow) remain green; `ARCHITECTURE.md`, `feature_list.json`, and `PROGRESS.md` are updated accurately.

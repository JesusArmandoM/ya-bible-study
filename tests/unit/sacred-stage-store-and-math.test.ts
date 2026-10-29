import { describe, expect, it } from 'vitest';
import {
  MAX_FRAME_DELTA_SECONDS,
  MAX_POINTER_TILT_RAD,
  createSacredFrameState,
  stepSacredFrameState,
} from '../../src/client/components/stage/sacredStageMath';
import {
  SACRED_STAGE_METADATA,
  SACRED_STAGE_VARIANTS,
  createSacredStageStore,
  resolveSacredStage,
  type SacredStageImpulse,
} from '../../src/client/state/sacredStageStore';

const NO_IMPULSE: SacredStageImpulse = {
  sequence: 0,
  kind: null,
  intensity: 0,
  triggeredAtMs: 0,
};

describe('sacredStageStore and resolveSacredStage', () => {
  it('defines all 6 canonical sacred stage variants with Study Leader / Participant terminology and zero Assistant copy', () => {
    expect(SACRED_STAGE_VARIANTS).toEqual([
      'sanctuary-emblem',
      'prayer-orb',
      'chosen-aura',
      'gospel-codex',
      'random-polyhedron',
      'star-of-faith',
    ]);

    for (const variant of SACRED_STAGE_VARIANTS) {
      const meta = SACRED_STAGE_METADATA[variant];
      expect(meta.id).toBe(variant);
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.ariaDescription.length).toBeGreaterThan(0);
      expect(meta.label).not.toContain('Assistant');
      expect(meta.ariaDescription).not.toContain('Assistant');
    }
  });

  it('maps session screens, Section 2 hospitality accent, chosen volunteer, and randomizing states deterministically', () => {
    expect(resolveSacredStage({ screen: 'welcome' })).toEqual({
      stage: 'sanctuary-emblem',
      accentMode: 'default',
    });
    expect(resolveSacredStage({ screen: 'title-lobby' })).toEqual({
      stage: 'sanctuary-emblem',
      accentMode: 'default',
    });
    expect(resolveSacredStage({ screen: 'section-1-prayer' })).toEqual({
      stage: 'prayer-orb',
      accentMode: 'default',
    });
    expect(
      resolveSacredStage({
        screen: 'section-1-prayer',
        isChosenVolunteer: true,
      }),
    ).toEqual({
      stage: 'chosen-aura',
      accentMode: 'default',
    });
    expect(
      resolveSacredStage({
        screen: 'section-1-prayer',
        isRandomizing: true,
      }),
    ).toEqual({
      stage: 'random-polyhedron',
      accentMode: 'default',
    });
    expect(resolveSacredStage({ screen: 'section-2-icebreaker' })).toEqual({
      stage: 'sanctuary-emblem',
      accentMode: 'hospitality',
    });
    expect(resolveSacredStage({ screen: 'section-3-gospel' })).toEqual({
      stage: 'gospel-codex',
      accentMode: 'default',
    });
    expect(resolveSacredStage({ screen: 'section-4-discussion' })).toEqual({
      stage: 'sanctuary-emblem',
      accentMode: 'default',
    });
    expect(resolveSacredStage({ screen: 'section-5-closing' })).toEqual({
      stage: 'star-of-faith',
      accentMode: 'default',
    });
  });

  it('creates isolated scoped store instances for independent Dual Mode viewports and increments transient impulses', () => {
    const leaderStore = createSacredStageStore();
    const participantStore = createSacredStageStore({ stage: 'prayer-orb' });

    expect(leaderStore.getState().stage).toBe('sanctuary-emblem');
    expect(participantStore.getState().stage).toBe('prayer-orb');

    leaderStore.getState().applyStageContext({ screen: 'section-2-icebreaker' });
    expect(leaderStore.getState().stage).toBe('sanctuary-emblem');
    expect(leaderStore.getState().accentMode).toBe('hospitality');
    expect(participantStore.getState().accentMode).toBe('default');

    participantStore.getState().triggerImpulse('hand-raise', 1.4);
    participantStore.getState().triggerImpulse('random-spin', 99);

    expect(participantStore.getState().impulse.sequence).toBe(2);
    expect(participantStore.getState().impulse.kind).toBe('random-spin');
    expect(participantStore.getState().impulse.intensity).toBe(3);
    expect(leaderStore.getState().impulse.sequence).toBe(0);

    participantStore.getState().reset();
    expect(participantStore.getState().stage).toBe('prayer-orb');
    expect(participantStore.getState().impulse.sequence).toBe(0);
  });
});

describe('sacredStageMath 60fps stepper', () => {
  it('cross-morphs blend weights smoothly across all 6 stages and settles hospitality rings', () => {
    let state = createSacredFrameState('sanctuary-emblem');
    expect(state.weights['sanctuary-emblem']).toBe(1);
    expect(state.weights['gospel-codex']).toBe(0);

    for (let i = 0; i < 60; i += 1) {
      state = stepSacredFrameState(state, {
        delta: 1 / 60,
        stage: 'gospel-codex',
        accentMode: 'hospitality',
        pointerTargetX: 0,
        pointerTargetY: 0,
        impulse: NO_IMPULSE,
        reducedMotion: false,
      });
    }

    expect(state.weights['gospel-codex']).toBeGreaterThan(0.99);
    expect(state.weights['sanctuary-emblem']).toBeLessThan(0.01);
    expect(state.hospitalityWeight).toBeGreaterThan(0.99);
  });

  it('tilts toward pointer coordinates within [-0.38, 0.38] rad and springs back to (0, 0) on release', () => {
    let state = createSacredFrameState();

    for (let i = 0; i < 45; i += 1) {
      state = stepSacredFrameState(state, {
        delta: 1 / 60,
        stage: 'sanctuary-emblem',
        accentMode: 'default',
        pointerTargetX: 1,
        pointerTargetY: -1,
        impulse: NO_IMPULSE,
        reducedMotion: false,
      });
    }

    expect(state.tiltX).toBeGreaterThan(0.32);
    expect(state.tiltX).toBeLessThanOrEqual(MAX_POINTER_TILT_RAD * 1.05);
    expect(state.tiltY).toBeLessThan(-0.32);

    // Release pointer back to rest (0, 0)
    for (let i = 0; i < 75; i += 1) {
      state = stepSacredFrameState(state, {
        delta: 1 / 60,
        stage: 'sanctuary-emblem',
        accentMode: 'default',
        pointerTargetX: 0,
        pointerTargetY: 0,
        impulse: NO_IMPULSE,
        reducedMotion: false,
      });
    }

    expect(Math.abs(state.tiltX)).toBeLessThan(0.005);
    expect(Math.abs(state.tiltY)).toBeLessThan(0.005);
  });

  it('consumes hand-raise, random-spin, confirm-burst, and completion-pulse impulses once per sequence and decays to rest', () => {
    let state = createSacredFrameState('random-polyhedron');

    state = stepSacredFrameState(state, {
      delta: 1 / 60,
      stage: 'random-polyhedron',
      accentMode: 'default',
      pointerTargetX: 0,
      pointerTargetY: 0,
      impulse: {
        sequence: 1,
        kind: 'random-spin',
        intensity: 1,
        triggeredAtMs: 100,
      },
      reducedMotion: false,
    });

    expect(state.lastImpulseSequence).toBe(1);
    expect(state.polyhedronSpinVel).toBeGreaterThan(8);
    const spinAfterTrigger = state.polyhedronSpinVel;

    // Passing the same sequence=1 does not re-trigger the impulse; physics damps smoothly.
    for (let i = 0; i < 120; i += 1) {
      state = stepSacredFrameState(state, {
        delta: 1 / 60,
        stage: 'random-polyhedron',
        accentMode: 'default',
        pointerTargetX: 0,
        pointerTargetY: 0,
        impulse: {
          sequence: 1,
          kind: 'random-spin',
          intensity: 1,
          triggeredAtMs: 100,
        },
        reducedMotion: false,
      });
    }

    expect(state.polyhedronSpinVel).toBeLessThan(spinAfterTrigger * 0.05);
    expect(state.polyhedronAngle).toBeGreaterThan(1);

    // Trigger hand-raise, confirm-burst, and completion-pulse sequences.
    state = stepSacredFrameState(state, {
      delta: 1 / 60,
      stage: 'prayer-orb',
      accentMode: 'default',
      pointerTargetX: 0,
      pointerTargetY: 0,
      impulse: {
        sequence: 2,
        kind: 'hand-raise',
        intensity: 1,
        triggeredAtMs: 200,
      },
      reducedMotion: false,
    });
    expect(state.shockwave).toBeGreaterThan(0.8);
    expect(state.emissiveBoost).toBeGreaterThan(0.5);

    state = stepSacredFrameState(state, {
      delta: 1 / 60,
      stage: 'chosen-aura',
      accentMode: 'default',
      pointerTargetX: 0,
      pointerTargetY: 0,
      impulse: {
        sequence: 3,
        kind: 'confirm-burst',
        intensity: 1,
        triggeredAtMs: 300,
      },
      reducedMotion: false,
    });
    expect(state.goldFlare).toBeGreaterThan(0.8);

    state = stepSacredFrameState(state, {
      delta: 1 / 60,
      stage: 'star-of-faith',
      accentMode: 'default',
      pointerTargetX: 0,
      pointerTargetY: 0,
      impulse: {
        sequence: 4,
        kind: 'completion-pulse',
        intensity: 1,
        triggeredAtMs: 400,
      },
      reducedMotion: false,
    });
    expect(state.completionWave).toBeGreaterThan(0.7);
  });

  it('clamps huge background-tab resume frame deltas to <= 0.05s and honors reducedMotion', () => {
    const initial = createSacredFrameState('sanctuary-emblem');
    const afterResumeJump = stepSacredFrameState(initial, {
      delta: 4.2,
      stage: 'sanctuary-emblem',
      accentMode: 'default',
      pointerTargetX: 0.5,
      pointerTargetY: 0,
      impulse: NO_IMPULSE,
      reducedMotion: false,
    });

    expect(afterResumeJump.elapsedTime).toBeCloseTo(MAX_FRAME_DELTA_SECONDS, 6);

    const reduced = stepSacredFrameState(initial, {
      delta: 1 / 60,
      stage: 'star-of-faith',
      accentMode: 'default',
      pointerTargetX: 0,
      pointerTargetY: 0,
      impulse: {
        sequence: 1,
        kind: 'random-spin',
        intensity: 2,
        triggeredAtMs: 500,
      },
      reducedMotion: true,
    });

    expect(reduced.weights['star-of-faith']).toBe(1);
    expect(reduced.weights['sanctuary-emblem']).toBe(0);
    expect(reduced.idleAngle).toBe(0);
    expect(reduced.bobOffset).toBe(0);
    expect(reduced.polyhedronSpinVel).toBe(0);
    expect(reduced.shockwave).toBe(0);
  });
});

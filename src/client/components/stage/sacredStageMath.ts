import {
  SACRED_STAGE_VARIANTS,
  type SacredAccentMode,
  type SacredStageImpulse,
  type SacredStageVariant,
} from '../../state/sacredStageStore';

export const MAX_FRAME_DELTA_SECONDS = 0.05;
export const MAX_POINTER_TILT_RAD = 0.38;
export const STAGE_VISIBILITY_EPSILON = 0.004;

export interface SacredFrameState {
  elapsedTime: number;
  activeStage: SacredStageVariant;
  accentMode: SacredAccentMode;
  weights: Record<SacredStageVariant, number>;
  hospitalityWeight: number;
  tiltX: number;
  tiltY: number;
  tiltVelX: number;
  tiltVelY: number;
  idleAngle: number;
  bobOffset: number;
  lastImpulseSequence: number;
  shockwave: number;
  emissiveBoost: number;
  polyhedronAngle: number;
  polyhedronSpinVel: number;
  goldFlare: number;
  completionWave: number;
}

export interface SacredFrameStepInput {
  delta: number;
  stage: SacredStageVariant;
  accentMode: SacredAccentMode;
  pointerTargetX: number;
  pointerTargetY: number;
  impulse: SacredStageImpulse;
  reducedMotion: boolean;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(Math.max(value, min), max);
}

export function createSacredFrameState(
  initialStage: SacredStageVariant = 'sanctuary-emblem',
  initialAccentMode: SacredAccentMode = 'default',
): SacredFrameState {
  const weights = {} as Record<SacredStageVariant, number>;
  for (const variant of SACRED_STAGE_VARIANTS) {
    weights[variant] = variant === initialStage ? 1 : 0;
  }

  return {
    elapsedTime: 0,
    activeStage: initialStage,
    accentMode: initialAccentMode,
    weights,
    hospitalityWeight: initialAccentMode === 'hospitality' ? 1 : 0,
    tiltX: 0,
    tiltY: 0,
    tiltVelX: 0,
    tiltVelY: 0,
    idleAngle: 0,
    bobOffset: 0,
    lastImpulseSequence: 0,
    shockwave: 0,
    emissiveBoost: 0,
    polyhedronAngle: 0,
    polyhedronSpinVel: 0,
    goldFlare: 0,
    completionWave: 0,
  };
}

export function cloneSacredFrameState(state: SacredFrameState): SacredFrameState {
  return {
    ...state,
    weights: { ...state.weights },
  };
}

/**
 * Mutates `state` in place for zero-GC 60fps execution inside Three.js `useFrame`.
 */
export function stepSacredFrameStateInPlace(
  state: SacredFrameState,
  input: SacredFrameStepInput,
): SacredFrameState {
  const dt = Number.isFinite(input.delta)
    ? Math.min(Math.max(input.delta, 0), MAX_FRAME_DELTA_SECONDS)
    : 0;

  state.activeStage = input.stage;
  state.accentMode = input.accentMode;

  const tiltScale = input.reducedMotion
    ? MAX_POINTER_TILT_RAD * 0.35
    : MAX_POINTER_TILT_RAD;
  const targetTiltX = clamp(input.pointerTargetX, -1, 1) * tiltScale;
  const targetTiltY = clamp(input.pointerTargetY, -1, 1) * tiltScale;

  // 1. Consume any newly triggered transient zustand impulse without React re-renders.
  if (
    input.impulse &&
    input.impulse.sequence > state.lastImpulseSequence &&
    input.impulse.kind !== null
  ) {
    state.lastImpulseSequence = input.impulse.sequence;
    const intensity = clamp(input.impulse.intensity || 1, 0.1, 3);

    if (input.reducedMotion) {
      // Suppress rapid spinning/pulsing under prefers-reduced-motion: reduce.
      state.polyhedronSpinVel = 0;
      state.shockwave = 0;
      state.completionWave = 0;
      state.emissiveBoost = Math.min(0.25, 0.2 * intensity);
      if (
        input.impulse.kind === 'confirm-burst' ||
        input.impulse.kind === 'completion-pulse'
      ) {
        state.goldFlare = Math.min(0.25, 0.2 * intensity);
      }
    } else {
      switch (input.impulse.kind) {
        case 'hand-raise':
          state.shockwave = Math.min(
            1.6,
            Math.max(state.shockwave, 0.18) + 0.92 * intensity,
          );
          state.emissiveBoost = Math.min(
            1.8,
            state.emissiveBoost + 0.85 * intensity,
          );
          state.tiltVelX = clamp(state.tiltVelX + 0.85 * intensity, -4.5, 4.5);
          break;
        case 'random-spin':
          state.polyhedronSpinVel = Math.min(
            18,
            state.polyhedronSpinVel + 10.5 * intensity,
          );
          state.emissiveBoost = Math.min(
            1.8,
            state.emissiveBoost + 0.65 * intensity,
          );
          break;
        case 'confirm-burst':
          state.goldFlare = Math.min(1.8, state.goldFlare + 1.15 * intensity);
          state.emissiveBoost = Math.min(
            1.8,
            state.emissiveBoost + 0.75 * intensity,
          );
          state.polyhedronSpinVel *= 0.25;
          break;
        case 'completion-pulse':
          state.completionWave = Math.min(
            1.6,
            state.completionWave + 1.0 * intensity,
          );
          state.goldFlare = Math.min(1.8, state.goldFlare + 0.9 * intensity);
          state.emissiveBoost = Math.min(
            1.8,
            state.emissiveBoost + 0.7 * intensity,
          );
          break;
      }
    }
  }

  // 2. Reduced-motion mode settles weights and tilt immediately with zero idle oscillation.
  if (input.reducedMotion) {
    for (const variant of SACRED_STAGE_VARIANTS) {
      state.weights[variant] = variant === input.stage ? 1 : 0;
    }
    state.hospitalityWeight = input.accentMode === 'hospitality' ? 1 : 0;
    state.tiltX = targetTiltX;
    state.tiltY = targetTiltY;
    state.tiltVelX = 0;
    state.tiltVelY = 0;
    state.bobOffset = 0;
    state.polyhedronSpinVel = 0;
    state.shockwave = 0;
    state.completionWave = 0;

    if (dt > 0) {
      state.emissiveBoost *= Math.exp(-5.0 * dt);
      state.goldFlare *= Math.exp(-5.0 * dt);
      if (state.emissiveBoost < 0.002) state.emissiveBoost = 0;
      if (state.goldFlare < 0.002) state.goldFlare = 0;
    }

    return state;
  }

  if (dt <= 0) {
    return state;
  }

  // 3. Cross-damp stage variant blend weights (springMorph feel).
  const morphAlpha = 1 - Math.exp(-9.5 * dt);
  for (const variant of SACRED_STAGE_VARIANTS) {
    const targetWeight = variant === input.stage ? 1 : 0;
    const nextWeight =
      state.weights[variant] + (targetWeight - state.weights[variant]) * morphAlpha;
    if (nextWeight < 0.0005) {
      state.weights[variant] = 0;
    } else if (nextWeight > 0.9995) {
      state.weights[variant] = 1;
    } else {
      state.weights[variant] = nextWeight;
    }
  }

  const targetHospitality = input.accentMode === 'hospitality' ? 1 : 0;
  const nextHospitality =
    state.hospitalityWeight +
    (targetHospitality - state.hospitalityWeight) * morphAlpha;
  state.hospitalityWeight =
    nextHospitality < 0.0005
      ? 0
      : nextHospitality > 0.9995
        ? 1
        : nextHospitality;

  // 4. Integrate pointer tilt spring-damper with 2 substeps for unconditional stability at dt <= 0.05s.
  const subDt = dt * 0.5;
  const springStiffness = 120;
  const springDamping = 20;
  for (let step = 0; step < 2; step += 1) {
    const accelX =
      (targetTiltX - state.tiltX) * springStiffness -
      state.tiltVelX * springDamping;
    const accelY =
      (targetTiltY - state.tiltY) * springStiffness -
      state.tiltVelY * springDamping;

    state.tiltVelX += accelX * subDt;
    state.tiltVelY += accelY * subDt;
    state.tiltX = clamp(
      state.tiltX + state.tiltVelX * subDt,
      -MAX_POINTER_TILT_RAD * 1.35,
      MAX_POINTER_TILT_RAD * 1.35,
    );
    state.tiltY = clamp(
      state.tiltY + state.tiltVelY * subDt,
      -MAX_POINTER_TILT_RAD * 1.35,
      MAX_POINTER_TILT_RAD * 1.35,
    );
  }

  if (
    targetTiltX === 0 &&
    Math.abs(state.tiltX) < 0.0002 &&
    Math.abs(state.tiltVelX) < 0.0005
  ) {
    state.tiltX = 0;
    state.tiltVelX = 0;
  }

  if (
    targetTiltY === 0 &&
    Math.abs(state.tiltY) < 0.0002 &&
    Math.abs(state.tiltVelY) < 0.0005
  ) {
    state.tiltY = 0;
    state.tiltVelY = 0;
  }

  // 5. Contemplative idle motion and transient impulse physics decay.
  state.elapsedTime += dt;
  state.idleAngle = (state.idleAngle + dt * 0.52) % (Math.PI * 200);
  state.bobOffset = Math.sin(state.elapsedTime * 1.65) * 0.055;

  state.polyhedronAngle =
    (state.polyhedronAngle + state.polyhedronSpinVel * dt) % (Math.PI * 200);
  state.polyhedronSpinVel *= Math.exp(-3.2 * dt);
  if (state.polyhedronSpinVel < 0.005) {
    state.polyhedronSpinVel = 0;
  }

  state.shockwave *= Math.exp(-3.8 * dt);
  if (state.shockwave < 0.002) {
    state.shockwave = 0;
  }

  state.emissiveBoost *= Math.exp(-3.4 * dt);
  if (state.emissiveBoost < 0.002) {
    state.emissiveBoost = 0;
  }

  state.goldFlare *= Math.exp(-3.0 * dt);
  if (state.goldFlare < 0.002) {
    state.goldFlare = 0;
  }

  state.completionWave *= Math.exp(-2.8 * dt);
  if (state.completionWave < 0.002) {
    state.completionWave = 0;
  }

  return state;
}

/**
 * Pure immutable wrapper around `stepSacredFrameStateInPlace`.
 */
export function stepSacredFrameState(
  state: SacredFrameState,
  input: SacredFrameStepInput,
): SacredFrameState {
  const next = cloneSacredFrameState(state);
  return stepSacredFrameStateInPlace(next, input);
}

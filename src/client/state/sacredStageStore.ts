import { create, type UseBoundStore } from 'zustand';
import type { StoreApi } from 'zustand/vanilla';

export const SACRED_STAGE_VARIANTS = [
  'sanctuary-emblem',
  'prayer-orb',
  'chosen-aura',
  'gospel-codex',
  'random-polyhedron',
  'star-of-faith',
] as const;

export type SacredStageVariant = (typeof SACRED_STAGE_VARIANTS)[number];

export type SacredImpulseKind =
  | 'hand-raise'
  | 'random-spin'
  | 'confirm-burst'
  | 'completion-pulse';

export type SacredAccentMode = 'default' | 'hospitality';

export type SacredSessionScreen =
  | 'welcome'
  | 'leader-setup'
  | 'title-lobby'
  | 'section-1-prayer'
  | 'section-2-icebreaker'
  | 'section-3-gospel'
  | 'section-4-discussion'
  | 'section-5-closing';

export interface SacredStageContext {
  screen: SacredSessionScreen;
  isChosenVolunteer?: boolean;
  isRandomizing?: boolean;
}

export interface ResolvedSacredStage {
  stage: SacredStageVariant;
  accentMode: SacredAccentMode;
}

export interface SacredStageMetadata {
  id: SacredStageVariant;
  label: string;
  eyebrow: string;
  ariaDescription: string;
  primaryColor: string;
  secondaryColor: string;
  glowColor: string;
  defaultImpulse: SacredImpulseKind;
}

export const SACRED_STAGE_METADATA: Record<SacredStageVariant, SacredStageMetadata> = {
  'sanctuary-emblem': {
    id: 'sanctuary-emblem',
    label: 'Sanctuary',
    eyebrow: 'WELCOME & LOBBY',
    ariaDescription:
      'Golden 4-point sanctuary emblem welcoming Study Leader and Participant community.',
    primaryColor: '#E2A83E',
    secondaryColor: '#F4C96B',
    glowColor: 'rgba(226, 168, 62, 0.24)',
    defaultImpulse: 'confirm-burst',
  },
  'prayer-orb': {
    id: 'prayer-orb',
    label: 'Prayer Orb',
    eyebrow: 'SECTION 1 · PRAYER',
    ariaDescription:
      'Luminous liturgical violet prayer orb inviting a Participant volunteer to open in prayer.',
    primaryColor: '#B855C8',
    secondaryColor: '#E2A83E',
    glowColor: 'rgba(184, 85, 200, 0.26)',
    defaultImpulse: 'hand-raise',
  },
  'chosen-aura': {
    id: 'chosen-aura',
    label: 'Chosen Aura',
    eyebrow: 'VOLUNTEER TURN',
    ariaDescription:
      'Radiant golden chosen vessel aura honoring the selected Participant during prayer.',
    primaryColor: '#E2A83E',
    secondaryColor: '#FDE68A',
    glowColor: 'rgba(226, 168, 62, 0.30)',
    defaultImpulse: 'completion-pulse',
  },
  'gospel-codex': {
    id: 'gospel-codex',
    label: 'Gospel Codex',
    eyebrow: 'SECTION 3 · GOSPEL',
    ariaDescription:
      'Sanctuary indigo open Gospel codex prepared for oral Scripture proclamation.',
    primaryColor: '#6E75F5',
    secondaryColor: '#E2A83E',
    glowColor: 'rgba(110, 117, 245, 0.26)',
    defaultImpulse: 'hand-raise',
  },
  'random-polyhedron': {
    id: 'random-polyhedron',
    label: 'Random Picker',
    eyebrow: 'RANDOM SELECTION',
    ariaDescription:
      'Faceted liturgical violet and gold polyhedron selecting an eligible Participant.',
    primaryColor: '#B855C8',
    secondaryColor: '#E2A83E',
    glowColor: 'rgba(184, 85, 200, 0.26)',
    defaultImpulse: 'random-spin',
  },
  'star-of-faith': {
    id: 'star-of-faith',
    label: 'Star of Faith',
    eyebrow: 'SECTION 5 · CLOSING',
    ariaDescription:
      'Golden 5-point Star of Faith celebrating Closing Prayer and weekly mission.',
    primaryColor: '#E2A83E',
    secondaryColor: '#FDE68A',
    glowColor: 'rgba(226, 168, 62, 0.28)',
    defaultImpulse: 'completion-pulse',
  },
};

export function resolveSacredStage(context: SacredStageContext): ResolvedSacredStage {
  if (context.isRandomizing) {
    return { stage: 'random-polyhedron', accentMode: 'default' };
  }

  if (context.isChosenVolunteer) {
    return { stage: 'chosen-aura', accentMode: 'default' };
  }

  switch (context.screen) {
    case 'section-1-prayer':
      return { stage: 'prayer-orb', accentMode: 'default' };
    case 'section-2-icebreaker':
      return { stage: 'sanctuary-emblem', accentMode: 'hospitality' };
    case 'section-3-gospel':
      return { stage: 'gospel-codex', accentMode: 'default' };
    case 'section-5-closing':
      return { stage: 'star-of-faith', accentMode: 'default' };
    case 'welcome':
    case 'leader-setup':
    case 'title-lobby':
    case 'section-4-discussion':
    default:
      return { stage: 'sanctuary-emblem', accentMode: 'default' };
  }
}

export interface SacredStageImpulse {
  sequence: number;
  kind: SacredImpulseKind | null;
  intensity: number;
  triggeredAtMs: number;
}

export interface SetSacredStageOptions {
  accentMode?: SacredAccentMode;
}

export interface SacredStageStoreInit {
  stage?: SacredStageVariant;
  accentMode?: SacredAccentMode;
}

export interface SacredStageStoreState {
  stage: SacredStageVariant;
  accentMode: SacredAccentMode;
  impulse: SacredStageImpulse;
  setStage: (stage: SacredStageVariant, options?: SetSacredStageOptions) => void;
  applyStageContext: (context: SacredStageContext) => void;
  triggerImpulse: (kind: SacredImpulseKind, intensity?: number) => void;
  reset: () => void;
}

export type SacredStageStore = UseBoundStore<StoreApi<SacredStageStoreState>>;

const INITIAL_IMPULSE: SacredStageImpulse = {
  sequence: 0,
  kind: null,
  intensity: 0,
  triggeredAtMs: 0,
};

function clampImpulseIntensity(intensity: number): number {
  if (!Number.isFinite(intensity)) {
    return 1;
  }
  return Math.min(Math.max(intensity, 0.1), 3);
}

/**
 * Creates a scoped Sacred3DScene store instance.
 * Supports isolated Dual Side-by-Side Mode viewports as well as the default app store.
 *
 * Components subscribe strictly to `stage` / `accentMode` primitives while `SacredStageRig`
 * reads `store.getState().impulse` inside `useFrame` at 60fps with zero React re-renders.
 */
export function createSacredStageStore(
  initial: SacredStageStoreInit = {},
): SacredStageStore {
  const initialStage = initial.stage ?? 'sanctuary-emblem';
  const initialAccentMode = initial.accentMode ?? 'default';

  return create<SacredStageStoreState>((set) => ({
    stage: initialStage,
    accentMode: initialAccentMode,
    impulse: { ...INITIAL_IMPULSE },
    setStage: (nextStage, options) => {
      const nextAccentMode = options?.accentMode ?? 'default';
      set((state) => {
        if (state.stage === nextStage && state.accentMode === nextAccentMode) {
          return state;
        }
        return {
          stage: nextStage,
          accentMode: nextAccentMode,
        };
      });
    },
    applyStageContext: (context) => {
      const resolved = resolveSacredStage(context);
      set((state) => {
        if (
          state.stage === resolved.stage &&
          state.accentMode === resolved.accentMode
        ) {
          return state;
        }
        return {
          stage: resolved.stage,
          accentMode: resolved.accentMode,
        };
      });
    },
    triggerImpulse: (kind, intensity = 1) => {
      const clampedIntensity = clampImpulseIntensity(intensity);
      set((state) => ({
        impulse: {
          sequence: state.impulse.sequence + 1,
          kind,
          intensity: clampedIntensity,
          triggeredAtMs: Date.now(),
        },
      }));
    },
    reset: () => {
      set({
        stage: initialStage,
        accentMode: initialAccentMode,
        impulse: { ...INITIAL_IMPULSE },
      });
    },
  }));
}

export const useSacredStageStore: SacredStageStore = createSacredStageStore();

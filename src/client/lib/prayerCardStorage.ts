export interface PrayerCardDraft {
  self: string;
  lovedOne: string;
  churchWorld: string;
  updatedAt: number;
}

export type PrayerCardPromptKey = 'self' | 'lovedOne' | 'churchWorld';

export type PrayerCardPromptId = 'self' | 'loved-one' | 'church-world';

export interface PrayerPromptMeta {
  id: PrayerCardPromptId;
  key: PrayerCardPromptKey;
  audienceLabel: string;
  promptPrefix: string;
  templateText: string;
  placeholder: string;
}

export const PRAYER_PROMPT_CONFIG: Record<PrayerCardPromptId, PrayerPromptMeta> = {
  self: {
    id: 'self',
    key: 'self',
    audienceLabel: 'For myself',
    promptPrefix: 'Lord, help me',
    templateText: 'Lord, help me ___.',
    placeholder: 'e.g. trust Your timing when answers seem slow',
  },
  'loved-one': {
    id: 'loved-one',
    key: 'lovedOne',
    audienceLabel: 'For someone I love',
    promptPrefix: 'Lord, have mercy on',
    templateText: 'Lord, have mercy on ___.',
    placeholder: 'e.g. my brother as he searches for work',
  },
  'church-world': {
    id: 'church-world',
    key: 'churchWorld',
    audienceLabel: 'For the Church/world',
    promptPrefix: 'Lord, make Your house a house of prayer for',
    templateText: 'Lord, make Your house a house of prayer for ___.',
    placeholder: 'e.g. young adults feeling disconnected from the parish',
  },
};

export function buildPrayerCardStorageKey(
  sessionCode?: string | null,
  memberId?: string | null,
): string {
  const code = (sessionCode ?? '').trim() || 'default';
  const member = (memberId ?? '').trim() || 'guest';
  return `ya-bible-study.prayer-card.${code}.${member}`;
}

export function createEmptyPrayerCardDraft(): PrayerCardDraft {
  return {
    self: '',
    lovedOne: '',
    churchWorld: '',
    updatedAt: Date.now(),
  };
}

export function loadPrayerCardDraft(key: string): PrayerCardDraft {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return createEmptyPrayerCardDraft();
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return createEmptyPrayerCardDraft();
    }
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return createEmptyPrayerCardDraft();
    }
    return {
      self: typeof parsed.self === 'string' ? parsed.self : '',
      lovedOne: typeof parsed.lovedOne === 'string' ? parsed.lovedOne : '',
      churchWorld: typeof parsed.churchWorld === 'string' ? parsed.churchWorld : '',
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
    };
  } catch {
    return createEmptyPrayerCardDraft();
  }
}

export function savePrayerCardDraft(
  key: string,
  draft: Partial<PrayerCardDraft>,
): PrayerCardDraft {
  const existing = loadPrayerCardDraft(key);
  const updated: PrayerCardDraft = {
    self: typeof draft.self === 'string' ? draft.self : existing.self,
    lovedOne: typeof draft.lovedOne === 'string' ? draft.lovedOne : existing.lovedOne,
    churchWorld:
      typeof draft.churchWorld === 'string' ? draft.churchWorld : existing.churchWorld,
    updatedAt: Date.now(),
  };

  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    try {
      window.localStorage.setItem(key, JSON.stringify(updated));
    } catch {
      // Gracefully handle storage quota or private browsing exceptions
    }
  }

  return updated;
}

export function clearPrayerCardDraft(key: string): void {
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore
    }
  }
}

export function formatPrayerLine(
  promptId: PrayerCardPromptId | 'lovedOne' | 'churchWorld',
  text: string,
): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return '';
  }

  let config = PRAYER_PROMPT_CONFIG.self;
  if (promptId === 'loved-one' || promptId === 'lovedOne') {
    config = PRAYER_PROMPT_CONFIG['loved-one'];
  } else if (promptId === 'church-world' || promptId === 'churchWorld') {
    config = PRAYER_PROMPT_CONFIG['church-world'];
  }

  // Strip prefix if the user typed it redundantly
  let cleanText = trimmed;
  const prefixLower = config.promptPrefix.toLowerCase();
  if (cleanText.toLowerCase().startsWith(prefixLower)) {
    cleanText = cleanText.slice(prefixLower.length).trim();
  }

  const hasPunctuation = /[.!?]$/.test(cleanText);
  const punctuation = hasPunctuation ? '' : '.';

  return `[${config.audienceLabel}] ${config.promptPrefix} ${cleanText}${punctuation}`;
}

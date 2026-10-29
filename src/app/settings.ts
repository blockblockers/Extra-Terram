// Extra Terram — src/app/settings.ts v0.8.0 — music and game sounds switched apart from their volumes
// Player settings, persisted per device. Every storage access is wrapped: standalone PWAs and
// private windows can refuse localStorage, and the game must still run without it.

export interface Settings {
  /** Render at 30 fps instead of 60 to run cooler on phones. The sim rate never changes. */
  batterySaver: boolean;
  /** Always draw the build-pad rings, not only while placing a tower. */
  showPads: boolean;
  /** Tap a pad, then confirm, instead of building on the first tap. Unset = on for touch screens, off for a mouse. */
  confirmBuild?: boolean;
  lastRace?: string;
  lastLevel?: string;
  /** Run rules last picked (menu or lobby): rounds 0 = the level's own, bossEvery 0 = no mini-bosses. */
  rounds?: number;
  bossEvery?: number;
  /** Co-op difficulty last picked by a host (index into DIFFICULTIES). */
  coopDifficulty?: number;
  /** Background music and game sounds: each on/off (unset = on) with its volume 0–1 (unset = the defaults in src/audio); mute silences both. */
  musicOn?: boolean;
  sfxOn?: boolean;
  music?: number;
  sfx?: number;
  muted?: boolean;
  /** The board seen from an angle (default) or straight down; the ground lit by a normal map and the shots (default) or as painted. */
  camera?: 'tilt' | 'flat';
  lighting?: boolean;
}

const KEY = 'extra-terram.settings.v1';

export const defaultSettings: Settings = { batterySaver: false, showPads: false };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...defaultSettings };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...defaultSettings, ...parsed };
  } catch {
    return { ...defaultSettings };
  }
}

/** Whether building takes a confirm step: the player's choice, else on for coarse pointers (touch). */
export function confirmBuildOn(settings: Settings): boolean {
  if (settings.confirmBuild !== undefined) return settings.confirmBuild;
  try {
    return (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
  } catch {
    return false;
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable; settings live for this session only.
  }
}

/** A readable random seed, e.g. "mossy-7k2q". Seeds are strings so daily challenges can be words. */
export function randomSeed(): string {
  const words = ['mossy', 'amber', 'cinder', 'hollow', 'tidal', 'quartz', 'ember', 'spore', 'birch', 'ferric'];
  const bytes = new Uint32Array(2);
  crypto.getRandomValues(bytes);
  return `${words[bytes[0] % words.length]}-${bytes[1].toString(36).slice(0, 4)}`;
}

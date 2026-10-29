// Extra Terram — src/audio/types.ts v0.1.0 — what the audio manifest lists and the sound ids the game asks for
// public/audio/manifest.json is written by scripts/audio-manifest.py from the files in public/audio/ and
// the loop points in audio/loops.json. The game only ever asks for ids; an id with no file plays its
// placeholder (src/audio/synth.ts) so the mix can be heard before the real sounds arrive.

/** Encodings a file may come in; the first the browser can decode is used (see pickFormat). */
export type AudioFormat = 'ogg' | 'm4a' | 'mp3' | 'wav';

export interface MusicAsset {
  /** Path under public/audio/ without the extension, e.g. "music/world-rootkin". */
  file: string;
  formats: AudioFormat[];
  /** Seconds: the loop region. Omitted = the whole file. */
  loop?: [number, number];
  /** Linear gain trim applied on top of the music volume (default 1). */
  gain?: number;
  /** Seconds the file is long (from the manifest script; informational). */
  duration?: number;
}

export interface SfxAsset {
  /** Variations, each a path under public/audio/ without the extension; one is picked at random per play. */
  files: string[];
  formats: AudioFormat[];
  gain?: number;
}

export interface AudioManifest {
  version: number;
  music: Record<string, MusicAsset>;
  sfx: Record<string, SfxAsset>;
}

/**
 * Music ids. One calm loop per world and, optionally, a battle stem of the same length that fades in
 * during waves ("world-<world>-battle"); the menu theme; the two result stings.
 */
export type MusicId = 'menu' | `world-${string}` | `world-${string}-battle` | 'result-win' | 'result-lose';

/** Sound-effect ids the game raises (variations are files, not ids). */
export type SfxId =
  // weapons, by what leaves the tower
  | 'fire-thorn'
  | 'fire-kinetic'
  | 'fire-acid'
  | 'fire-energy'
  | 'fire-splash'
  | 'fire-beam'
  // what the shot does when it lands
  | 'hit-thorn'
  | 'hit-kinetic'
  | 'hit-acid'
  | 'hit-energy'
  | 'hit-splash'
  // a creep dying, by its armour
  | 'death-bark'
  | 'death-plated'
  | 'death-carapace'
  | 'death-shielded'
  // the base
  | 'leak'
  | 'leak-boss'
  | 'lives-low'
  // building
  | 'place'
  | 'upgrade'
  | 'reinforce'
  | 'sell'
  | 'income'
  // the round
  | 'wave-start'
  | 'wave-boss'
  | 'wave-clear'
  | 'boss-appear'
  // multiplayer
  | 'send'
  | 'incoming'
  // interface
  | 'ui-tap'
  | 'ui-error';

/** How a sound behaves in the mix: its base level, how many may sound at once, the shortest gap between two starts. */
export interface SfxRule {
  gain: number;
  maxVoices: number;
  minGapMs: number;
  /** At most this many may start from one tick's events (the rest add a little level instead). */
  perTick: number;
  /** Which bus it goes through. */
  bus: 'sfx' | 'ui';
}

export const SFX_RULES: Record<SfxId, SfxRule> = {
  'fire-thorn': { gain: 0.45, maxVoices: 3, minGapMs: 55, perTick: 2, bus: 'sfx' },
  'fire-kinetic': { gain: 0.5, maxVoices: 3, minGapMs: 55, perTick: 2, bus: 'sfx' },
  'fire-acid': { gain: 0.45, maxVoices: 3, minGapMs: 60, perTick: 2, bus: 'sfx' },
  'fire-energy': { gain: 0.42, maxVoices: 3, minGapMs: 60, perTick: 2, bus: 'sfx' },
  'fire-splash': { gain: 0.6, maxVoices: 2, minGapMs: 120, perTick: 1, bus: 'sfx' },
  'fire-beam': { gain: 0.35, maxVoices: 2, minGapMs: 320, perTick: 1, bus: 'sfx' },
  'hit-thorn': { gain: 0.28, maxVoices: 4, minGapMs: 40, perTick: 2, bus: 'sfx' },
  'hit-kinetic': { gain: 0.3, maxVoices: 4, minGapMs: 40, perTick: 2, bus: 'sfx' },
  'hit-acid': { gain: 0.28, maxVoices: 4, minGapMs: 40, perTick: 2, bus: 'sfx' },
  'hit-energy': { gain: 0.26, maxVoices: 4, minGapMs: 40, perTick: 2, bus: 'sfx' },
  'hit-splash': { gain: 0.55, maxVoices: 2, minGapMs: 120, perTick: 1, bus: 'sfx' },
  'death-bark': { gain: 0.55, maxVoices: 4, minGapMs: 50, perTick: 3, bus: 'sfx' },
  'death-plated': { gain: 0.55, maxVoices: 4, minGapMs: 50, perTick: 3, bus: 'sfx' },
  'death-carapace': { gain: 0.55, maxVoices: 4, minGapMs: 50, perTick: 3, bus: 'sfx' },
  'death-shielded': { gain: 0.55, maxVoices: 4, minGapMs: 50, perTick: 3, bus: 'sfx' },
  leak: { gain: 0.8, maxVoices: 2, minGapMs: 250, perTick: 1, bus: 'sfx' },
  'leak-boss': { gain: 0.95, maxVoices: 1, minGapMs: 500, perTick: 1, bus: 'sfx' },
  'lives-low': { gain: 0.8, maxVoices: 1, minGapMs: 4000, perTick: 1, bus: 'sfx' },
  place: { gain: 0.6, maxVoices: 2, minGapMs: 80, perTick: 1, bus: 'sfx' },
  upgrade: { gain: 0.65, maxVoices: 2, minGapMs: 80, perTick: 1, bus: 'sfx' },
  reinforce: { gain: 0.6, maxVoices: 2, minGapMs: 80, perTick: 1, bus: 'sfx' },
  sell: { gain: 0.6, maxVoices: 2, minGapMs: 80, perTick: 1, bus: 'sfx' },
  income: { gain: 0.3, maxVoices: 2, minGapMs: 150, perTick: 1, bus: 'sfx' },
  'wave-start': { gain: 0.9, maxVoices: 1, minGapMs: 1000, perTick: 1, bus: 'sfx' },
  'wave-boss': { gain: 0.95, maxVoices: 1, minGapMs: 1000, perTick: 1, bus: 'sfx' },
  'wave-clear': { gain: 0.6, maxVoices: 1, minGapMs: 1000, perTick: 1, bus: 'sfx' },
  'boss-appear': { gain: 0.9, maxVoices: 1, minGapMs: 1000, perTick: 1, bus: 'sfx' },
  send: { gain: 0.7, maxVoices: 2, minGapMs: 150, perTick: 1, bus: 'sfx' },
  incoming: { gain: 0.8, maxVoices: 1, minGapMs: 400, perTick: 1, bus: 'sfx' },
  'ui-tap': { gain: 0.5, maxVoices: 2, minGapMs: 40, perTick: 1, bus: 'ui' },
  'ui-error': { gain: 0.6, maxVoices: 1, minGapMs: 200, perTick: 1, bus: 'ui' },
};

/** The most sound effects that may sound at once, whatever they are; the oldest gives way. */
export const MAX_VOICES = 24;
/** The most new sound effects one tick's events may start. */
export const MAX_STARTS_PER_TICK = 8;

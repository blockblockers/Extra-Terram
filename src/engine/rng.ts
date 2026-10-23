// Extra Terram — src/engine/rng.ts v0.1.0 — Phase 1 scaffold
// The only source of randomness allowed inside the engine. sfc32 is fast, integer-only
// (so bit-identical on every JS engine) and its state is four plain numbers, so it
// serializes with the rest of the sim state and survives a snapshot/replay round trip.

export interface RngState {
  a: number;
  b: number;
  c: number;
  d: number;
}

/** FNV-1a 32-bit hash of a string. Also used by snapshot.ts to fingerprint state. */
export function fnv1a32(str: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Derive a warmed-up sfc32 state from any string seed. */
export function createRng(seed: string): RngState {
  const s: RngState = {
    a: fnv1a32(seed, 0x811c9dc5),
    b: fnv1a32(seed + '#b', 0x9747b28c),
    c: fnv1a32(seed + '#c', 0x02f6e2b1),
    d: 1,
  };
  for (let i = 0; i < 16; i++) nextU32(s);
  return s;
}

/** Next 32-bit unsigned integer; advances the state in place. */
export function nextU32(s: RngState): number {
  s.a >>>= 0;
  s.b >>>= 0;
  s.c >>>= 0;
  s.d >>>= 0;
  const t = (((s.a + s.b) | 0) + s.d) | 0;
  s.d = (s.d + 1) | 0;
  s.a = s.b ^ (s.b >>> 9);
  s.b = (s.c + (s.c << 3)) | 0;
  s.c = (s.c << 21) | (s.c >>> 11);
  s.c = (s.c + t) | 0;
  return t >>> 0;
}

/** Uniform float in [0, 1). */
export function nextFloat(s: RngState): number {
  return nextU32(s) / 4294967296;
}

/** Uniform integer in [min, max] inclusive. */
export function nextInt(s: RngState, min: number, max: number): number {
  return min + Math.floor(nextFloat(s) * (max - min + 1));
}

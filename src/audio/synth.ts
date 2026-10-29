// Extra Terram — src/audio/synth.ts v0.1.0 — placeholder sounds, made in code, for every id that has no file yet
// Short effects are rendered once into AudioBuffers (a few ms each); music placeholders are live
// oscillator pads, one per world, with a battle layer that the mixer fades in during waves. None of
// this is meant to ship: it lets the mix, the limits and the cues be heard and tuned before the real
// sounds arrive, and it is what plays for any file the manifest does not have.
import type { SfxId } from './types';

type Fill = (t: number, i: number, n: number) => number;

/** Render `seconds` of mono audio from a sample function into a buffer. */
function render(ctx: BaseAudioContext, seconds: number, fill: Fill): AudioBuffer {
  const n = Math.max(1, Math.round(seconds * ctx.sampleRate));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = fill(i / ctx.sampleRate, i, n);
  // a 2 ms fade either end so nothing clicks
  const edge = Math.min(n >> 1, Math.round(ctx.sampleRate * 0.002));
  for (let i = 0; i < edge; i++) {
    const k = i / edge;
    data[i] *= k;
    data[n - 1 - i] *= k;
  }
  return buf;
}

/** Deterministic noise (a small LCG), so a placeholder sounds the same every time. */
function noiseGen(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296 - 0.5;
  };
}

const decay = (t: number, tau: number) => Math.exp(-t / tau);
const sweep = (t: number, f0: number, f1: number, dur: number) => {
  // instantaneous phase of a frequency gliding linearly from f0 to f1 over dur
  const k = (f1 - f0) / dur;
  return 2 * Math.PI * (f0 * t + 0.5 * k * t * t);
};

/** One-pole low-pass over a noise source, as a closure (cheap "filtered noise"). */
function lowNoise(seed: number, coef: number): () => number {
  const g = noiseGen(seed);
  let y = 0;
  return () => {
    y += coef * (g() - y);
    return y;
  };
}

function tone(ctx: BaseAudioContext, notes: number[], noteSec: number, tau: number, timbre: (ph: number) => number = Math.sin): AudioBuffer {
  return render(ctx, notes.length * noteSec + tau * 2, (t) => {
    const k = Math.min(notes.length - 1, Math.floor(t / noteSec));
    const local = t - k * noteSec;
    const f = notes[k];
    return 0.5 * timbre(2 * Math.PI * f * local) * decay(local, tau) * (k === notes.length - 1 ? 1 : 0.9);
  });
}

const saw = (ph: number) => 2 * ((ph / (2 * Math.PI)) % 1) - 1;
const horn = (ph: number) => (Math.sin(ph) + 0.5 * Math.sin(2 * ph) + 0.25 * Math.sin(3 * ph)) / 1.75;

/** Build the placeholder for a sound id. */
export function synthSfx(ctx: BaseAudioContext, id: SfxId): AudioBuffer {
  switch (id) {
    case 'fire-thorn': {
      const nz = lowNoise(11, 0.6);
      return render(ctx, 0.09, (t) => 0.6 * Math.sin(sweep(t, 1100, 500, 0.09)) * decay(t, 0.02) + 0.5 * nz() * decay(t, 0.008));
    }
    case 'fire-kinetic': {
      const nz = lowNoise(23, 0.25);
      return render(ctx, 0.12, (t) => 1.6 * nz() * decay(t, 0.03) + 0.5 * Math.sin(2 * Math.PI * 110 * t) * decay(t, 0.05));
    }
    case 'fire-acid': {
      const nz = lowNoise(37, 0.4);
      return render(ctx, 0.11, (t) => 1.2 * nz() * decay(t, 0.035) * (1 + 0.3 * Math.sin(2 * Math.PI * 60 * t)));
    }
    case 'fire-energy':
      return render(ctx, 0.13, (t) => 0.55 * (Math.sin(sweep(t, 1400, 350, 0.13)) + 0.3 * Math.sin(sweep(t, 2800, 700, 0.13))) * decay(t, 0.04));
    case 'fire-beam':
      return render(ctx, 0.3, (t) => 0.35 * (Math.sin(2 * Math.PI * 220 * t) * Math.sin(2 * Math.PI * 7 * t) + 0.3 * Math.sin(2 * Math.PI * 1760 * t)) * Math.min(1, t / 0.03) * decay(t, 0.12));
    case 'fire-splash': {
      const nz = lowNoise(41, 0.12);
      return render(ctx, 0.2, (t) => 2.2 * nz() * decay(t, 0.06) + 0.6 * Math.sin(sweep(t, 160, 60, 0.2)) * decay(t, 0.09));
    }
    case 'hit-thorn':
      return render(ctx, 0.05, (t) => 0.6 * Math.sin(sweep(t, 700, 300, 0.05)) * decay(t, 0.012));
    case 'hit-kinetic': {
      const nz = lowNoise(53, 0.5);
      return render(ctx, 0.05, (t) => 1.4 * nz() * decay(t, 0.012));
    }
    case 'hit-acid': {
      const nz = lowNoise(59, 0.3);
      return render(ctx, 0.07, (t) => 1.2 * nz() * decay(t, 0.02));
    }
    case 'hit-energy':
      return render(ctx, 0.06, (t) => 0.5 * Math.sin(2 * Math.PI * 1900 * t) * decay(t, 0.015));
    case 'hit-splash': {
      const nz = lowNoise(61, 0.1);
      return render(ctx, 0.35, (t) => 2.4 * nz() * decay(t, 0.09) + 0.5 * Math.sin(sweep(t, 90, 40, 0.35)) * decay(t, 0.15));
    }
    case 'death-bark': {
      const nz = lowNoise(71, 0.2);
      return render(ctx, 0.22, (t) => 1.6 * nz() * decay(t, 0.06) * (1 + 0.5 * Math.sin(2 * Math.PI * 30 * t)));
    }
    case 'death-plated':
      return render(ctx, 0.3, (t) => 0.4 * (Math.sin(2 * Math.PI * 420 * t) + 0.8 * Math.sin(2 * Math.PI * 613 * t) + 0.5 * Math.sin(2 * Math.PI * 1090 * t)) * decay(t, 0.08));
    case 'death-carapace': {
      const nz = lowNoise(79, 0.45);
      return render(ctx, 0.18, (t) => 1.3 * nz() * decay(t, 0.035) * (t < 0.03 || (t > 0.06 && t < 0.1) ? 1 : 0.4));
    }
    case 'death-shielded':
      return render(ctx, 0.35, (t) => 0.35 * (Math.sin(2 * Math.PI * 1800 * t) + Math.sin(2 * Math.PI * 2700 * t) + 0.6 * Math.sin(2 * Math.PI * 4100 * t)) * decay(t, 0.09));
    case 'leak':
      return tone(ctx, [330, 262], 0.16, 0.08, saw);
    case 'leak-boss':
      return tone(ctx, [196, 147, 110], 0.22, 0.12, saw);
    case 'lives-low':
      return render(ctx, 0.5, (t) => 0.45 * Math.sin(2 * Math.PI * 440 * t) * (Math.sin(2 * Math.PI * 8 * t) > 0 ? 1 : 0) * decay(t, 0.3));
    case 'place': {
      const nz = lowNoise(83, 0.15);
      return render(ctx, 0.14, (t) => 1.2 * nz() * decay(t, 0.04) + 0.5 * Math.sin(sweep(t, 220, 120, 0.14)) * decay(t, 0.06));
    }
    case 'upgrade':
      return tone(ctx, [392, 494, 587], 0.09, 0.12);
    case 'reinforce':
      return tone(ctx, [523, 659], 0.1, 0.12);
    case 'sell':
      return tone(ctx, [494, 370], 0.11, 0.1);
    case 'income':
      return render(ctx, 0.08, (t) => 0.4 * (Math.sin(2 * Math.PI * 1568 * t) + 0.5 * Math.sin(2 * Math.PI * 2349 * t)) * decay(t, 0.02));
    case 'wave-start':
      return tone(ctx, [294, 392], 0.28, 0.25, horn);
    case 'wave-boss':
      return tone(ctx, [147, 139, 196], 0.32, 0.3, horn);
    case 'wave-clear':
      return tone(ctx, [659, 784, 1047], 0.12, 0.2);
    case 'boss-appear':
      return render(ctx, 0.8, (t) => 0.5 * (Math.sin(2 * Math.PI * 55 * t) + 0.5 * Math.sin(2 * Math.PI * 82.5 * t)) * Math.min(1, t / 0.05) * decay(t, 0.35));
    case 'send': {
      const nz = lowNoise(97, 0.08);
      return render(ctx, 0.3, (t) => 2.5 * nz() * Math.sin(Math.PI * Math.min(1, t / 0.3)));
    }
    case 'incoming':
      return tone(ctx, [523, 523, 659], 0.11, 0.1, saw);
    case 'ui-tap':
      return render(ctx, 0.03, (t) => 0.5 * Math.sin(2 * Math.PI * 1200 * t) * decay(t, 0.008));
    case 'ui-error':
      return render(ctx, 0.16, (t) => 0.4 * saw(2 * Math.PI * 140 * t) * decay(t, 0.08));
  }
}

/** The root note (Hz) and the character of each world's placeholder pad. */
const PAD: Record<string, { root: number; type: OscillatorType; cutoff: number; lfo: number }> = {
  menu: { root: 130.81, type: 'triangle', cutoff: 900, lfo: 0.05 },
  rootkin: { root: 146.83, type: 'triangle', cutoff: 700, lfo: 0.07 },
  assembly: { root: 110.0, type: 'sawtooth', cutoff: 520, lfo: 0.11 },
  chitin: { root: 92.5, type: 'sine', cutoff: 800, lfo: 0.09 },
  lumenari: { root: 164.81, type: 'sine', cutoff: 1600, lfo: 0.06 },
};

export interface SynthPad {
  /** 0 = calm layer only, 1 = battle layer in full. Ramped over `seconds`. */
  setIntensity(v: number, seconds: number): void;
  /** Fade everything out and free the nodes. */
  stop(seconds: number): void;
  readonly output: GainNode;
}

/**
 * A live pad for a world (or the menu): two detuned oscillators a fifth apart through a slowly
 * sweeping low-pass, plus a battle layer (a pulsing octave-below saw and a bed of wind) that the mixer
 * brings in during waves. Everything is automation on a handful of nodes; nothing is scheduled.
 */
export function synthPad(ctx: AudioContext, world: string): SynthPad {
  const p = PAD[world] ?? PAD.menu;
  const output = ctx.createGain();
  output.gain.value = 0;
  const now = ctx.currentTime;

  // calm layer
  const calm = ctx.createGain();
  calm.gain.value = 0.22;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = p.cutoff;
  filter.Q.value = 0.7;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = p.lfo;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = p.cutoff * 0.45;
  lfo.connect(lfoGain).connect(filter.frequency);
  const oscs: OscillatorNode[] = [];
  for (const [ratio, detune] of [
    [1, -6],
    [1, 6],
    [1.5, -4],
    [2, 5],
  ] as const) {
    const o = ctx.createOscillator();
    o.type = p.type;
    o.frequency.value = p.root * ratio;
    o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.value = ratio === 1 ? 0.35 : ratio === 1.5 ? 0.22 : 0.12;
    o.connect(g).connect(filter);
    oscs.push(o);
  }
  filter.connect(calm).connect(output);

  // battle layer: an octave-below saw with a 6 Hz tremolo, and a bed of band-passed wind
  const battle = ctx.createGain();
  battle.gain.value = 0;
  const bass = ctx.createOscillator();
  bass.type = 'sawtooth';
  bass.frequency.value = p.root / 2;
  const bassFilter = ctx.createBiquadFilter();
  bassFilter.type = 'lowpass';
  bassFilter.frequency.value = 260;
  const trem = ctx.createGain();
  trem.gain.value = 0.18;
  const tremLfo = ctx.createOscillator();
  tremLfo.frequency.value = 6;
  const tremDepth = ctx.createGain();
  tremDepth.gain.value = 0.12;
  tremLfo.connect(tremDepth).connect(trem.gain);
  bass.connect(bassFilter).connect(trem).connect(battle);
  const windBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const wd = windBuf.getChannelData(0);
  const g = noiseGen(5);
  for (let i = 0; i < wd.length; i++) wd[i] = g() * 0.8;
  const wind = ctx.createBufferSource();
  wind.buffer = windBuf;
  wind.loop = true;
  const windFilter = ctx.createBiquadFilter();
  windFilter.type = 'bandpass';
  windFilter.frequency.value = 900;
  windFilter.Q.value = 0.5;
  const windGain = ctx.createGain();
  windGain.gain.value = 0.06;
  wind.connect(windFilter).connect(windGain).connect(battle);
  battle.connect(output);

  for (const o of [...oscs, lfo, bass, tremLfo]) o.start(now);
  wind.start(now);
  output.gain.setTargetAtTime(1, now, 0.6);

  let stopped = false;
  return {
    output,
    setIntensity(v, seconds) {
      if (stopped) return;
      const t = ctx.currentTime;
      battle.gain.cancelScheduledValues(t);
      battle.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), t, Math.max(0.05, seconds / 3));
      calm.gain.setTargetAtTime(0.22 - 0.06 * v, t, Math.max(0.05, seconds / 3));
    },
    stop(seconds) {
      if (stopped) return;
      stopped = true;
      const t = ctx.currentTime;
      output.gain.cancelScheduledValues(t);
      output.gain.setTargetAtTime(0, t, Math.max(0.05, seconds / 3));
      const end = t + seconds + 0.3;
      for (const o of [...oscs, lfo, bass, tremLfo]) o.stop(end);
      wind.stop(end);
      window.setTimeout(() => output.disconnect(), (seconds + 0.4) * 1000);
    },
  };
}

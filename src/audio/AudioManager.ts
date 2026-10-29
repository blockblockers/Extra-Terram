// Extra Terram — src/audio/AudioManager.ts v0.2.0 — music and sounds switched apart; silent while the screen is not active; a limiter
// One AudioContext, opened on the first tap (browsers allow no sound before one). Buses: master →
// music (through a ducker the stings and the pause press on) and sfx / ui. Music is a "deck" per
// scene: the menu theme, or a world's calm loop with its battle stem started in sync and faded in
// during waves; decks crossfade when the scene changes. Effects come from the sim's events, once a
// tick: they are grouped by sound, each sound starts at most a couple of voices a tick (a burst of
// twelve shots adds a little level, not twelve voices), keeps a minimum gap between starts, holds a
// per-sound and a global voice cap (the oldest voice gives way), and pans by where it happened.
// Any id without a file in public/audio/manifest.json plays its placeholder from synth.ts.
// Sound plays only while the page is the active screen: a hidden tab, a minimised app or a phone's
// lock screen suspends the context, drops the voices in flight and refuses new ones until the page
// shows again (then the music carries on from where it was). A compressor on the master catches
// the sum of many voices before the output clips.
import type { SimContext, SimEvent, SimState } from '../engine';
import { hasBoss } from '../engine';
import { MAX_STARTS_PER_TICK, MAX_VOICES, SFX_RULES, type AudioFormat, type AudioManifest, type MusicAsset, type SfxId } from './types';
import { synthPad, synthSfx } from './synth';

export interface AudioVolumes {
  /** 0–1 */
  music: number;
  /** 0–1 */
  sfx: number;
  /** Background music on at all (off: no deck is loaded or played). */
  musicOn: boolean;
  /** Game sounds and interface taps on at all. */
  sfxOn: boolean;
  /** Everything off, whatever the switches above say. */
  muted: boolean;
}

export const DEFAULT_VOLUMES: AudioVolumes = { music: 0.7, sfx: 0.8, musicOn: true, sfxOn: true, muted: false };

/** Where the player is: decides the music. */
export type AudioScene = { kind: 'menu' } | { kind: 'level'; world: string } | { kind: 'silence' };

interface Voice {
  id: SfxId;
  src: AudioBufferSourceNode;
  gain: GainNode;
  at: number;
  done: boolean;
}

/** A playing piece of music: a calm layer and, maybe, a battle layer. */
interface Deck {
  key: string;
  setIntensity(v: number, seconds: number): void;
  stop(seconds: number): void;
}

const FORMAT_MIME: Record<AudioFormat, string> = {
  ogg: 'audio/ogg; codecs="vorbis"',
  m4a: 'audio/mp4; codecs="mp4a.40.2"',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
};

/** Sounds in the order they get a voice when a tick brings more than the cap allows. */
const PRIORITY: SfxId[] = [
  'wave-boss',
  'wave-start',
  'boss-appear',
  'leak-boss',
  'leak',
  'lives-low',
  'incoming',
  'send',
  'place',
  'upgrade',
  'reinforce',
  'sell',
  'wave-clear',
  'death-shielded',
  'death-plated',
  'death-carapace',
  'death-bark',
  'hit-splash',
  'fire-splash',
  'fire-beam',
  'fire-thorn',
  'fire-kinetic',
  'fire-acid',
  'fire-energy',
  'hit-thorn',
  'hit-kinetic',
  'hit-acid',
  'hit-energy',
  'income',
  'ui-tap',
  'ui-error',
];
const RANK = new Map(PRIORITY.map((id, i) => [id, i]));

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private duck!: GainNode;
  private sfxBus!: GainNode;
  private uiBus!: GainNode;
  private manifest: AudioManifest = { version: 0, music: {}, sfx: {} };
  private manifestReady: Promise<void>;
  private format: AudioFormat | null = null;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private synthCache = new Map<SfxId, AudioBuffer>();
  private voices: Voice[] = [];
  private lastStart = new Map<SfxId, number>();
  private deck: Deck | null = null;
  private loading = false;
  private scene: AudioScene = { kind: 'silence' };
  private sceneKey = 'silence';
  private intensity = 0;
  private paused = false;
  /** False while the page is hidden (another tab, the app minimised, the phone locked). */
  private active = true;
  private duckUntil = 0;
  volumes: AudioVolumes = { ...DEFAULT_VOLUMES };
  /** Counters for tests and tuning. */
  readonly stats = { played: 0, dropped: 0, stolen: 0, ticks: 0 };

  constructor() {
    this.manifestReady =
      typeof fetch === 'function'
        ? fetch('/audio/manifest.json')
            .then((r) => (r.ok ? (r.json() as Promise<AudioManifest>) : null))
            .then((m) => {
              if (m && m.music && m.sfx) this.manifest = m;
            })
            .catch(() => undefined)
        : Promise.resolve();
  }

  /** True once the context runs (after the first gesture). */
  get running(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** True while the page is the active screen (for tests). */
  get screenActive(): boolean {
    return this.active;
  }

  /** The music playing now, for tests: "menu", "world-rootkin", "synth:menu", … or null. */
  get playing(): string | null {
    return this.deck?.key ?? null;
  }

  /** Open (or resume) the context. Call from a user gesture; safe to call often. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor({ latencyHint: 'interactive' });
      const c = this.ctx;
      this.master = c.createGain();
      this.musicBus = c.createGain();
      this.duck = c.createGain();
      this.sfxBus = c.createGain();
      this.uiBus = c.createGain();
      this.musicBus.connect(this.duck).connect(this.master);
      this.sfxBus.connect(this.master);
      this.uiBus.connect(this.master);
      // a gentle limiter: twenty voices and the music summed must not clip the output
      const limiter = c.createDynamicsCompressor();
      limiter.threshold.value = -8;
      limiter.knee.value = 10;
      limiter.ratio.value = 8;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.12;
      this.master.connect(limiter).connect(c.destination);
      this.format = this.pickFormat();
      this.applyVolumes();
      void this.manifestReady.then(() => this.preloadSfx());
      this.watchScreen();
    }
    if (!this.active) return; // the next gesture on a visible page will open it
    if (this.ctx.state !== 'running') {
      void this.ctx.resume().then(() => this.applyScene());
    } else {
      this.applyScene();
    }
  }

  /**
   * Sound only while the screen is active. `visibilitychange` covers another tab, a minimised window
   * and a phone's lock screen; `pagehide` / `freeze` the app being put away; iOS reports a locked
   * phone as the context "interrupted", which the state change catches. Coming back resumes the
   * context and the scene; voices queued while hidden are dropped so nothing bursts out on return.
   */
  private watchScreen(): void {
    const update = () => {
      const active = !document.hidden;
      if (active === this.active) return;
      this.active = active;
      if (!this.ctx) return;
      if (!active) {
        const silenced = this.voices.length;
        for (const v of [...this.voices]) this.steal(v);
        this.stats.stolen -= silenced; // not stolen for room: silenced
        void this.ctx.suspend();
      } else {
        void this.ctx.resume().then(() => this.applyScene());
      }
    };
    document.addEventListener('visibilitychange', update);
    window.addEventListener('pagehide', () => {
      this.active = false;
      void this.ctx?.suspend();
    });
    window.addEventListener('pageshow', update);
    document.addEventListener('freeze', () => void this.ctx?.suspend());
    document.addEventListener('resume', update);
    this.ctx?.addEventListener('statechange', () => {
      // "interrupted" (iOS) or suspended by the system: no sound until the page shows and a gesture comes
      if (this.ctx?.state === 'running' && this.active) this.applyScene();
    });
    update();
  }

  setVolumes(v: Partial<AudioVolumes>): void {
    this.volumes = { ...this.volumes, ...v };
    this.applyVolumes();
    this.applyScene(); // music switched off stops the deck (nothing loads or plays); on brings it back
  }

  /** What should be playing. Takes effect at once when the context runs, else when it is unlocked. */
  setScene(scene: AudioScene): void {
    this.scene = scene;
    this.applyScene();
  }

  /** 0 = build window, 1 = a wave in progress: fades the battle stem. */
  setIntensity(v: number): void {
    this.intensity = Math.max(0, Math.min(1, v));
    this.deck?.setIntensity(this.intensity, 1.5);
  }

  /** Paused: the music drops to a murmur and no effect plays. */
  setPaused(paused: boolean): void {
    this.paused = paused;
    this.applyDuck();
  }

  /** A short piece over the music (the result), which ducks the music while it plays. */
  sting(id: 'result-win' | 'result-lose'): void {
    if (!this.running || !this.active || this.volumes.muted || !this.volumes.musicOn) return;
    const asset = this.manifest.music[id];
    const c = this.ctx!;
    const play = (buf: AudioBuffer, gain: number) => {
      const src = c.createBufferSource();
      src.buffer = buf;
      const g = c.createGain();
      g.gain.value = gain;
      src.connect(g).connect(this.musicBus);
      src.start();
      this.duckFor(buf.duration);
    };
    if (asset) {
      void this.load(asset.file, asset.formats).then((buf) => buf && play(buf, asset.gain ?? 1));
    } else {
      // placeholder: a rising major arpeggio or a falling minor one
      const notes = id === 'result-win' ? [262, 330, 392, 523, 659] : [392, 349, 311, 262, 196];
      const n = Math.round(c.sampleRate * 2.2);
      const buf = c.createBuffer(1, n, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) {
        const t = i / c.sampleRate;
        const k = Math.min(notes.length - 1, Math.floor(t / 0.28));
        const local = t - k * 0.28;
        d[i] = 0.3 * Math.sin(2 * Math.PI * notes[k] * local) * Math.exp(-local / (k === notes.length - 1 ? 0.9 : 0.25));
      }
      play(buf, 1);
    }
  }

  /** One sound, with the limits applied. Returns whether it started. */
  play(id: SfxId, opts: { gain?: number; pan?: number; rate?: number } = {}): boolean {
    if (!this.running || !this.active || this.volumes.muted || !this.volumes.sfxOn || this.paused) return false;
    const rule = SFX_RULES[id];
    const now = performance.now();
    const last = this.lastStart.get(id) ?? -1e9;
    if (now - last < rule.minGapMs) {
      this.stats.dropped++;
      return false;
    }
    const buf = this.bufferFor(id);
    if (!buf) {
      this.stats.dropped++;
      return false;
    }
    this.voices = this.voices.filter((v) => !v.done);
    const same = this.voices.filter((v) => v.id === id);
    if (same.length >= rule.maxVoices) this.steal(same[0]);
    if (this.voices.length >= MAX_VOICES) this.steal(this.voices[0]);

    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.rate ?? 1 + (Math.random() - 0.5) * 0.08;
    const gain = c.createGain();
    const asset = this.manifest.sfx[id];
    gain.gain.value = rule.gain * (opts.gain ?? 1) * (asset?.gain ?? 1);
    let tail: AudioNode = gain;
    if (opts.pan !== undefined && typeof c.createStereoPanner === 'function') {
      const pan = c.createStereoPanner();
      pan.pan.value = Math.max(-1, Math.min(1, opts.pan));
      gain.connect(pan);
      tail = pan;
    }
    tail.connect(rule.bus === 'ui' ? this.uiBus : this.sfxBus);
    const voice: Voice = { id, src, gain, at: now, done: false };
    src.onended = () => {
      voice.done = true;
      gain.disconnect();
    };
    src.start();
    this.voices.push(voice);
    this.lastStart.set(id, now);
    this.stats.played++;
    return true;
  }

  /** A tap on any button. */
  tap(): void {
    this.play('ui-tap');
  }

  /**
   * One tick's events from the sim. `mySeat` tells sends apart (yours whooshes, a rival's warns);
   * `cols` places the pan.
   */
  pushEvents(events: SimEvent[], ctx: SimContext, state: SimState, mySeat: number): void {
    if (!this.running || !this.active || this.volumes.muted || !this.volumes.sfxOn || this.paused || events.length === 0) return;
    this.stats.ticks++;
    const cols = ctx.map.cols || 1;
    const wanted = new Map<SfxId, { n: number; xs: number[] }>();
    const want = (id: SfxId, x?: number) => {
      const w = wanted.get(id) ?? { n: 0, xs: [] };
      w.n++;
      if (x !== undefined && w.xs.length < 4) w.xs.push(x);
      wanted.set(id, w);
    };
    for (const ev of events) {
      switch (ev.kind) {
        case 'fire': {
          const tower = state.towers.find((t) => t.id === ev.tower);
          const def = tower ? ctx.towerIndex[tower.def] : undefined;
          want(def?.splash ? 'fire-splash' : (`fire-${ev.damageType}` as SfxId), ev.x);
          break;
        }
        case 'beam':
          want('fire-beam', ev.x);
          break;
        case 'hit':
          if (!ev.kill) want(ev.splash ? 'hit-splash' : (`hit-${ev.damageType}` as SfxId), ev.x);
          break;
        case 'kill':
          want(`death-${ev.armor}` as SfxId, ev.x);
          break;
        case 'leak':
          want(ctx.creepIndex[ev.creep]?.archetype === 'boss' ? 'leak-boss' : 'leak', ev.x);
          break;
        case 'place':
          want('place', ev.x);
          break;
        case 'upgrade':
          want('upgrade', ev.x);
          break;
        case 'sell':
          want('sell', ev.x);
          break;
        case 'income':
          want('income', ev.x);
          break;
        case 'wave':
          want(state.waveIndex >= 0 && hasBoss(state.rules, state.waveIndex) ? 'wave-boss' : 'wave-start');
          break;
        case 'boss':
          want('boss-appear');
          break;
        case 'send':
          if (ev.seat === mySeat) want('send');
          break;
        case 'incoming':
          want('incoming');
          break;
        default:
          break;
      }
    }
    if (wanted.size === 0) return;
    const ids = [...wanted.keys()].sort((a, b) => (RANK.get(a) ?? 99) - (RANK.get(b) ?? 99));
    let starts = 0;
    for (const id of ids) {
      if (starts >= MAX_STARTS_PER_TICK) break;
      const { n, xs } = wanted.get(id)!;
      const rule = SFX_RULES[id];
      const plays = Math.min(n, rule.perTick, MAX_STARTS_PER_TICK - starts);
      // many at once: a touch louder, never many voices
      const boost = Math.min(1.5, 1 + 0.12 * Math.log2(Math.max(1, n)));
      for (let k = 0; k < plays; k++) {
        const x = xs.length ? xs[Math.min(xs.length - 1, Math.round((k * (xs.length - 1)) / Math.max(1, plays - 1)))] : undefined;
        const pan = x === undefined ? undefined : (x / cols - 0.5) * 0.7;
        if (this.play(id, { gain: boost, pan })) starts++;
      }
    }
  }

  // ---------------------------------------------------------------- music

  private applyScene(): void {
    if (!this.running || !this.active) return;
    const wanted = this.scene.kind === 'menu' ? 'menu' : this.scene.kind === 'level' ? `world-${this.scene.world}` : 'silence';
    const key = this.volumes.musicOn && !this.volumes.muted ? wanted : 'silence';
    if (key === this.sceneKey && (this.deck || this.loading)) return;
    this.sceneKey = key;
    this.deck?.stop(1.2);
    this.deck = null;
    if (key === 'silence') return;
    const world = this.scene.kind === 'level' ? this.scene.world : 'menu';
    const asset = this.manifest.music[key];
    if (asset) {
      this.loading = true;
      void this.startBufferDeck(key, asset, this.manifest.music[`${key}-battle`]).finally(() => {
        this.loading = false;
      });
    } else {
      const pad = synthPad(this.ctx!, world);
      pad.output.connect(this.musicBus);
      const deck: Deck = { key: `synth:${key}`, setIntensity: (v, s) => pad.setIntensity(v, s), stop: (s) => pad.stop(s) };
      this.deck = deck;
      deck.setIntensity(this.intensity, 0.1);
    }
  }

  private async startBufferDeck(key: string, calm: MusicAsset, battle: MusicAsset | undefined): Promise<void> {
    const [calmBuf, battleBuf] = await Promise.all([this.load(calm.file, calm.formats), battle ? this.load(battle.file, battle.formats) : Promise.resolve(null)]);
    if (this.sceneKey !== key || !calmBuf || !this.running) return; // the scene moved on while loading
    const c = this.ctx!;
    const out = c.createGain();
    out.gain.value = 0;
    out.connect(this.musicBus);
    const calmGain = c.createGain();
    calmGain.gain.value = 1;
    calmGain.connect(out);
    const battleGain = c.createGain();
    battleGain.gain.value = 0;
    battleGain.connect(out);
    const loop = calm.loop ?? [0, calmBuf.duration];
    const mk = (buf: AudioBuffer, to: GainNode) => {
      const s = c.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.loopStart = loop[0];
      s.loopEnd = Math.min(loop[1], buf.duration);
      s.connect(to);
      return s;
    };
    const calmSrc = mk(calmBuf, calmGain);
    const battleSrc = battleBuf ? mk(battleBuf, battleGain) : null;
    const t0 = c.currentTime + 0.05;
    calmSrc.start(t0);
    battleSrc?.start(t0);
    out.gain.setTargetAtTime(calm.gain ?? 1, t0, 0.5);
    let stopped = false;
    const deck: Deck = {
      key,
      setIntensity: (v, seconds) => {
        if (stopped) return;
        const t = c.currentTime;
        battleGain.gain.cancelScheduledValues(t);
        battleGain.gain.setTargetAtTime(battleSrc ? v : 0, t, Math.max(0.05, seconds / 3));
        calmGain.gain.cancelScheduledValues(t);
        calmGain.gain.setTargetAtTime(battleSrc ? 1 - 0.35 * v : 1, t, Math.max(0.05, seconds / 3));
      },
      stop: (seconds) => {
        if (stopped) return;
        stopped = true;
        const t = c.currentTime;
        out.gain.cancelScheduledValues(t);
        out.gain.setTargetAtTime(0, t, Math.max(0.05, seconds / 3));
        calmSrc.stop(t + seconds + 0.3);
        battleSrc?.stop(t + seconds + 0.3);
        window.setTimeout(() => out.disconnect(), (seconds + 0.4) * 1000);
      },
    };
    this.deck = deck;
    deck.setIntensity(this.intensity, 0.1);
  }

  private duckFor(seconds: number): void {
    this.duckUntil = performance.now() + seconds * 1000;
    this.applyDuck();
    window.setTimeout(() => this.applyDuck(), seconds * 1000 + 50);
  }

  private applyDuck(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const level = this.paused ? 0.3 : performance.now() < this.duckUntil ? 0.45 : 1;
    this.duck.gain.cancelScheduledValues(t);
    this.duck.gain.setTargetAtTime(level, t, 0.15);
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const m = this.volumes.muted ? 0 : 1;
    this.master.gain.setTargetAtTime(m, t, 0.05);
    const music = this.volumes.musicOn ? this.volumes.music * this.volumes.music : 0; // squared: the slider feels even
    const sfx = this.volumes.sfxOn ? this.volumes.sfx * this.volumes.sfx : 0;
    this.musicBus.gain.setTargetAtTime(music, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(sfx, t, 0.05);
    this.uiBus.gain.setTargetAtTime(sfx, t, 0.05);
  }

  // ---------------------------------------------------------------- effects

  private steal(v: Voice): void {
    const t = this.ctx!.currentTime;
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setTargetAtTime(0, t, 0.01);
    try {
      v.src.stop(t + 0.04);
    } catch {
      // already stopped
    }
    v.done = true;
    this.voices = this.voices.filter((x) => x !== v);
    this.stats.stolen++;
  }

  /** The decoded buffer for a sound id: a loaded file, or the placeholder when there is none. */
  private bufferFor(id: SfxId): AudioBuffer | null {
    const asset = this.manifest.sfx[id];
    if (asset && asset.files.length) {
      const file = asset.files[Math.floor(Math.random() * asset.files.length)];
      const ready = this.decoded.get(file);
      if (ready) return ready;
      void this.load(file, asset.formats); // not here yet: load it, and let the placeholder stand in meanwhile
    }
    let buf = this.synthCache.get(id);
    if (!buf) {
      buf = synthSfx(this.ctx!, id);
      this.synthCache.set(id, buf);
    }
    return buf;
  }

  private decoded = new Map<string, AudioBuffer>();

  private preloadSfx(): void {
    for (const asset of Object.values(this.manifest.sfx)) for (const f of asset.files) void this.load(f, asset.formats);
  }

  private pickFormat(): AudioFormat | null {
    const probe = document.createElement('audio');
    for (const f of ['ogg', 'm4a', 'mp3', 'wav'] as AudioFormat[]) {
      if (probe.canPlayType(FORMAT_MIME[f])) return f;
    }
    return null;
  }

  private load(file: string, formats: AudioFormat[]): Promise<AudioBuffer | null> {
    const have = this.buffers.get(file);
    if (have) return have;
    const fmt = formats.find((f) => f === this.format) ?? formats.find((f) => this.probeOk(f));
    const p = (async () => {
      if (!fmt || !this.ctx) return null;
      try {
        const res = await fetch(`/audio/${file}.${fmt}`);
        if (!res.ok) return null;
        const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
        this.decoded.set(file, buf);
        return buf;
      } catch {
        return null;
      }
    })();
    this.buffers.set(file, p);
    return p;
  }

  private probeOk(f: AudioFormat): boolean {
    return !!document.createElement('audio').canPlayType(FORMAT_MIME[f]);
  }
}

/** The one mixer for the app. */
export const audio = new AudioManager();

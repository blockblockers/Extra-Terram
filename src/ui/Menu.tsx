// Extra Terram — src/ui/Menu.tsx v0.1.0 — Phase 1 scaffold
// Title screen: one level for now, a seed you can share, and the two device settings.
import { useState } from 'react';
import { CONTENT_VERSION, type LevelEntry } from '../content';
import { ENGINE_VERSION } from '../engine';
import { randomSeed, type Settings } from '../app/settings';

interface Props {
  levels: LevelEntry[];
  settings: Settings;
  onSettings(next: Settings): void;
  onPlay(level: LevelEntry, seed: string): void;
}

export function Menu({ levels, settings, onSettings, onPlay }: Props) {
  const [seed, setSeed] = useState(() => randomSeed());
  const level = levels[0];

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-grove-950 px-[calc(var(--safe-left)+1rem)] pb-[calc(var(--safe-bottom)+1rem)] pr-[calc(var(--safe-right)+1rem)] pt-[calc(var(--safe-top)+1rem)] font-ui">
      <div className="w-full max-w-md">
        <p className="text-xs uppercase tracking-[0.3em] text-grove-300/60">Extra Terram</p>
        <h1 className="mt-1 text-3xl font-bold leading-tight">The Alien Race Tower Defense</h1>
        <p className="mt-2 text-sm text-grove-300/80">Pick a race, defend your maze. Phase 1 slice: the Rootkin hold a forest moon against the Assembly's construction crew.</p>

        <section className="mt-6 rounded-xl border border-grove-700 bg-grove-900 p-4">
          <h2 className="text-xs uppercase tracking-wide text-grove-300/60">Level</h2>
          <p className="mt-1 font-semibold">{level.map.name}</p>
          <p className="text-sm text-grove-300/80">
            {level.map.world} home world · {level.map.difficulty} · {level.waves.waves.length} waves · {level.waves.lives} lives
          </p>

          <label className="mt-4 block text-xs uppercase tracking-wide text-grove-300/60" htmlFor="seed">
            Seed
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="seed"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-grove-700 bg-grove-950 px-3 py-2 font-mono text-sm"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <button onClick={() => setSeed(randomSeed())} className="rounded-md border border-grove-700 px-3 py-2 text-sm text-grove-300 hover:bg-grove-800">
              Random
            </button>
          </div>
          <p className="mt-1 text-xs text-grove-300/60">Same seed, same waves. Share it to compare runs.</p>

          <button onClick={() => onPlay(level, seed.trim() || randomSeed())} className="mt-4 w-full rounded-lg bg-grove-500 px-4 py-3 text-lg font-semibold text-grove-950 hover:bg-grove-300">
            Play
          </button>
        </section>

        <section className="mt-4 rounded-xl border border-grove-700 bg-grove-900 p-4">
          <h2 className="text-xs uppercase tracking-wide text-grove-300/60">Settings</h2>
          <Toggle label="Battery saver (render at 30 fps)" checked={settings.batterySaver} onChange={(v) => onSettings({ ...settings, batterySaver: v })} />
          <Toggle label="Always show build pads" checked={settings.showPads} onChange={(v) => onSettings({ ...settings, showPads: v })} />
        </section>

        <p className="mt-4 text-center text-xs text-grove-300/40">
          engine {ENGINE_VERSION} · content {CONTENT_VERSION}
        </p>
      </div>
    </main>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange(v: boolean): void }) {
  return (
    <label className="mt-2 flex cursor-pointer items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-5 w-5 accent-grove-500" />
    </label>
  );
}

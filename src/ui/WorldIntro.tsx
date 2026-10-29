// Extra Terram — src/ui/WorldIntro.tsx v0.1.0 — the home world from orbit before a solo level: who is attacking, why, and how your weapons fare
// Full-screen over the shell while the loop is held: a starfield, the world's planet drifting closer
// (public/art/worlds/<world>.webp, placeholders from scripts/gen-planets.py until the painted shots
// arrive — art/WORLD_INTRO_HANDOFF.md), the world and level names, the lore, the invader and the matchup
// for the race you brought. A tap, Enter or Space begins; so does the timer. Reduced motion: no drift.
import { useEffect, useMemo, useState } from 'react';
import { matchupsFor, raceById, type LevelEntry } from '../content';
import { loreFor } from '../content/lore';
import { WORLD_NAMES } from './Menu';
import { UiIcon, emblemIcon } from './UiIcon';

/** How long the intro holds before the level begins on its own. */
export const INTRO_MS = 5200;

interface Props {
  level: LevelEntry;
  raceId: string;
  /** The level has loaded under the intro: the hold's timer runs from here. */
  ready: boolean;
  onBegin(): void;
}

export function planetArtUrl(world: string): string {
  return `/art/worlds/${world}.webp`;
}

export function WorldIntro({ level, raceId, ready, onBegin }: Props) {
  const world = level.map.world;
  const lore = loreFor(world, level.enemyRace);
  const race = raceById(raceId);
  const invader = raceById(lore.invader);
  const edge = matchupsFor(raceId).multiplier[invader.id] ?? 1;
  const stars = useMemo(() => starfield(level.id), [level.id]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // the hold starts once the level has loaded under the intro, so the picture gets its moment on a slow device too
    const t = ready ? window.setTimeout(onBegin, INTRO_MS) : null;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
        e.preventDefault();
        onBegin();
      }
    };
    window.addEventListener('keydown', key);
    return () => {
      if (t !== null) window.clearTimeout(t);
      window.removeEventListener('keydown', key);
    };
    // `onBegin` is stable per run; the timer re-arms when the level becomes ready
  }, [ready]);

  const edgeLine =
    edge > 1.05
      ? `Your ${race.damageTypes[0]} bites ${invader.creepArmor}: ×${edge.toFixed(2)} damage. A good army to bring.`
      : edge < 0.95
        ? `Your ${race.damageTypes[0]} barely scratches ${invader.creepArmor}: ×${edge.toFixed(2)} damage. Build wide and early.`
        : `Your ${race.damageTypes[0]} meets ${invader.creepArmor} even: ×${edge.toFixed(2)} damage.`;
  const edgeTone = edge > 1.05 ? 'text-grove-300' : edge < 0.95 ? 'text-amber-300' : 'text-grove-100/80';

  return (
    <div className="et-intro fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden text-center" role="dialog" aria-modal="true" aria-label={`${WORLD_NAMES[world] ?? world}: ${level.map.name}`} onPointerDown={onBegin}>
      <div className="et-intro-stars absolute inset-0" style={{ backgroundImage: stars }} aria-hidden="true" />
      <div className="et-intro-planet-wrap relative" aria-hidden="true">
        <img src={planetArtUrl(world)} alt="" className={`et-intro-planet ${loaded ? 'opacity-100' : 'opacity-0'}`} onLoad={() => setLoaded(true)} draggable={false} />
      </div>
      <div className="relative mx-auto w-full max-w-md px-[calc(var(--safe-left)+1.25rem)] pr-[calc(var(--safe-right)+1.25rem)]">
        <p className="font-tech text-xs font-bold uppercase tracking-[0.3em] text-grove-300/70">{WORLD_NAMES[world] ?? world}</p>
        <h1 className="et-intro-title mt-1 font-tech font-bold leading-none text-white">{level.map.name}</h1>
        <p className="mt-3 font-tech text-lg font-bold leading-snug text-amber-200">{lore.line}</p>
        <p className="mt-2 text-sm leading-snug text-grove-100/90">{lore.story}</p>
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          <span className="flex items-center gap-1.5 rounded-lg border border-grove-700/80 bg-grove-900/80 px-2.5 py-1.5">
            <UiIcon name={emblemIcon(invader.id)} size={22} alt="" />
            <span className="text-grove-100">{invader.name}</span>
          </span>
          <span className="text-grove-300/60">vs</span>
          <span className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5" style={{ borderColor: `${race.palette.primary}99`, background: `${race.palette.primary}22` }}>
            <UiIcon name={emblemIcon(race.id)} size={22} alt="" />
            <span className="text-white">{race.name}</span>
          </span>
        </div>
        <p className={`mt-2 text-xs font-semibold ${edgeTone}`}>{edgeLine}</p>
        <p className="mt-6 animate-pulse text-[11px] uppercase tracking-[0.3em] text-grove-300/60">{ready ? 'Tap to begin' : 'Loading the trail…'}</p>
        <div className="mx-auto mt-2 h-0.5 w-40 overflow-hidden rounded bg-grove-800" aria-hidden="true">
          {ready && <div className="et-intro-timer h-full bg-grove-300/70" style={{ animationDuration: `${INTRO_MS}ms` }} />}
        </div>
      </div>
    </div>
  );
}

/** A deterministic starfield as layered radial gradients, seeded by the level so it is the same each time. */
function starfield(seed: string): string {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rnd = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
  const dots: string[] = [];
  for (let i = 0; i < 90; i++) {
    const x = (rnd() * 100).toFixed(1);
    const y = (rnd() * 100).toFixed(1);
    const r = rnd() < 0.15 ? 1.6 : rnd() < 0.5 ? 1.1 : 0.7;
    const a = (0.35 + rnd() * 0.6).toFixed(2);
    dots.push(`radial-gradient(circle at ${x}% ${y}%, rgba(255,255,255,${a}) 0, rgba(255,255,255,${a}) ${r}px, transparent ${r + 0.8}px)`);
  }
  return dots.join(',');
}

// Extra Terram — src/ui/Menu.tsx v0.11.0 — race details panel (style, matchups, every tower and its trait); confirm-build setting
import { useState } from 'react';
import { CONTENT_VERSION, content, levels, raceById, towersForRace, type LevelEntry } from '../content';
import { ENGINE_VERSION, type ArmorType, type RaceDef } from '../engine';
import { confirmBuildOn, randomSeed, type Settings } from '../app/settings';
import { online } from '../net';
import { AccountBar } from './AccountBar';
import { Leaderboard } from './Leaderboard';
import { LogoLockup, Reveal, TitleColumn } from './Title';
import { RaceDetails } from './RaceDetails';
import { TowerIcon } from './TowerIcon';

interface Props {
  settings: Settings;
  /** Pending lobby invites, shown as a badge on the Multiplayer button. */
  inviteCount?: number;
  onSettings(next: Settings): void;
  onPlay(level: LevelEntry, raceId: string, seed: string): void;
  onMultiplayer(raceId: string, levelId: string): void;
}

const WORLD_NAMES: Record<string, string> = {
  rootkin: 'Forest moon',
  assembly: 'Scrap plains',
  chitin: 'Hive tunnels',
  lumenari: 'Crystal fields',
};

type Panel = 'none' | 'code' | 'scores' | 'settings';

export function Menu({ settings, inviteCount = 0, onSettings, onPlay, onMultiplayer }: Props) {
  const [raceId, setRaceId] = useState(() => settings.lastRace ?? 'rootkin');
  const [levelId, setLevelId] = useState(() => settings.lastLevel ?? levels[0].id);
  const [panel, setPanel] = useState<Panel>('none');
  const [code, setCode] = useState('');
  const [details, setDetails] = useState(false);
  const level = levels.find((l) => l.id === levelId) ?? levels[0];
  const race = raceById(raceId);
  const roster = towersForRace(raceId);

  const toggle = (p: Panel) => setPanel((cur) => (cur === p ? 'none' : p));

  const play = () => {
    onSettings({ ...settings, lastRace: raceId, lastLevel: level.id });
    // Every run gets a fresh random challenge code unless the player typed one in to replay or
    // compare against a friend; the code is shown on the result screen either way.
    onPlay(level, raceId, code.trim() || randomSeed());
  };

  return (
    <TitleColumn>
      <LogoLockup />
      <Reveal>
        <AccountBar />
      </Reveal>

      <div className="flex-1" />

      <Reveal>
      <section className="rounded-xl border border-grove-700/80 bg-grove-900/85 p-3 backdrop-blur-sm">
        <h2 className="text-xs uppercase tracking-wide text-grove-300/60">Your race</h2>
        <div className="mt-2 grid grid-cols-4 gap-2" role="radiogroup" aria-label="Race">
          {content.races.map((r) => {
            const starter = towersForRace(r.id)[0];
            const active = r.id === raceId;
            return (
              <button
                key={r.id}
                role="radio"
                aria-checked={active}
                onClick={() => setRaceId(r.id)}
                className={`flex flex-col items-center rounded-lg border px-1 py-2 ${active ? 'border-sap bg-grove-700' : 'border-grove-700 bg-grove-800/80 hover:bg-grove-700'}`}
                style={active ? { boxShadow: `0 0 0 1px ${r.palette.primary}55 inset` } : undefined}
              >
                {starter && <TowerIcon tower={starter} size={44} state="t2" />}
                <span className="mt-1 w-full truncate text-center text-[11px] font-semibold">{r.name}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-grove-300">{race.tagline}</p>
        <p className="mt-1 text-xs text-grove-300/80">
          <span className="font-semibold text-sap">{race.passive.name}.</span> {race.passive.description}
        </p>
        <p className="mt-1 text-xs text-grove-300/70">{matchupLine(race)}</p>
        <button onClick={() => setDetails((v) => !v)} className="mt-1.5 text-xs text-sap underline-offset-2 hover:underline" aria-expanded={details}>
          {details ? 'Hide race details' : `Race details: play style and all ${roster.length} towers`}
        </button>
        {details && <RaceDetails race={race} />}
      </section>

      <section className="mt-3 rounded-xl border border-grove-700/80 bg-grove-900/85 p-3 backdrop-blur-sm">
        <h2 className="text-xs uppercase tracking-wide text-grove-300/60">Level</h2>
        <div className="mt-2 flex flex-col gap-1.5" role="radiogroup" aria-label="Level">
          {levels.map((l) => {
            const active = l.id === level.id;
            const enemy = raceById(l.enemyRace);
            return (
              <button
                key={l.id}
                role="radio"
                aria-checked={active}
                onClick={() => setLevelId(l.id)}
                className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left ${active ? 'border-sap bg-grove-700' : 'border-grove-700 bg-grove-800/80 hover:bg-grove-700'}`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{l.map.name}</span>
                  <span className="block truncate text-xs text-grove-300/70">
                    {WORLD_NAMES[l.map.world] ?? l.map.world} · {l.waves.waves.length} waves · {l.waves.lives} lives · vs {enemy.name} ({enemy.creepArmor})
                  </span>
                </span>
                <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase ${l.map.difficulty === 'hard' ? 'bg-rust/30 text-rust' : l.map.difficulty === 'normal' ? 'bg-sap/20 text-sap' : 'bg-grove-500/30 text-grove-300'}`}>
                  {l.map.difficulty}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 grid grid-cols-[2fr_1fr] gap-2">
          <button onClick={play} className="rounded-lg bg-grove-500 px-4 py-3 text-lg font-semibold text-grove-950 hover:bg-grove-300">
            Play
          </button>
          <button
            onClick={() => {
              onSettings({ ...settings, lastRace: raceId, lastLevel: level.id });
              onMultiplayer(raceId, level.id);
            }}
            className="relative rounded-lg border border-grove-500 px-3 py-3 font-semibold text-grove-300 hover:bg-grove-700"
          >
            Multiplayer
            {inviteCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 min-w-[1.25rem] rounded-full bg-sap px-1.5 text-center text-[11px] font-bold text-grove-950" aria-label={`${inviteCount} invites`}>
                {inviteCount}
              </span>
            )}
          </button>
        </div>

        <div className="mt-2 flex items-center justify-between gap-3 text-xs">
          <button onClick={() => toggle('code')} className="text-grove-300/80 underline-offset-2 hover:underline">
            {panel === 'code' ? 'Hide challenge code' : 'Have a challenge code?'}
          </button>
          {online && (
            <button onClick={() => toggle('scores')} className="text-grove-300/80 underline-offset-2 hover:underline">
              {panel === 'scores' ? 'Hide scores' : 'Top scores'}
            </button>
          )}
          <button onClick={() => toggle('settings')} className="text-grove-300/80 underline-offset-2 hover:underline">
            {panel === 'settings' ? 'Hide settings' : 'Settings'}
          </button>
        </div>
        {panel === 'code' && (
          <div className="mt-2">
            <input
              id="seed"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. mossy-7k2q"
              className="w-full rounded-md border border-grove-700 bg-grove-950/80 px-3 py-2 font-mono text-sm"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <p className="mt-1 text-xs text-grove-300/60">A code replays the exact same waves, so two players can compare runs. Leave it blank for a fresh one; your run's code is shown when it ends.</p>
          </div>
        )}
        {panel === 'scores' && <Leaderboard levelId={level.id} levelName={level.map.name} />}
        {panel === 'settings' && (
          <div className="mt-2 border-t border-grove-700/60 pt-1">
            <Toggle label="Battery saver (render at 30 fps)" checked={settings.batterySaver} onChange={(v) => onSettings({ ...settings, batterySaver: v })} />
            <Toggle label="Always show build pads" checked={settings.showPads} onChange={(v) => onSettings({ ...settings, showPads: v })} />
            <Toggle label="Confirm before building (tap pad, then Build)" checked={confirmBuildOn(settings)} onChange={(v) => onSettings({ ...settings, confirmBuild: v })} />
          </div>
        )}
      </section>

      <p className="mt-3 text-center text-[11px] text-grove-300/40">
        engine {ENGINE_VERSION} · content {CONTENT_VERSION}
      </p>
      </Reveal>
    </TitleColumn>
  );
}

/** "kinetic & bio · strong vs shielded, weak vs plated" from the damage matrix, so the counters are visible before a run. */
function matchupLine(race: RaceDef): string {
  const m = content.damage.multipliers;
  const armours: ArmorType[] = ['organic', 'plated', 'shielded'];
  const best = (armour: ArmorType) => Math.max(...race.damageTypes.map((t) => m[t][armour]));
  const strong = armours.filter((a) => best(a) >= 1.2);
  const weak = armours.filter((a) => best(a) <= 0.9);
  const parts = [race.damageTypes.join(' & ')];
  if (strong.length) parts.push(`strong vs ${strong.join(' and ')}`);
  if (weak.length) parts.push(`weak vs ${weak.join(' and ')}`);
  return parts.join(' · ');
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange(v: boolean): void }) {
  return (
    <label className="mt-2 flex cursor-pointer items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-5 w-5 accent-grove-500" />
    </label>
  );
}

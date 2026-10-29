// Extra Terram — src/ui/Menu.tsx v0.22.0 — the phone menu is one screen: plates in the middle, Solo play opens a card with the race and the battlefield
// Two layouts over two paintings of the same world (public/art/title.jpg for landscape, 16:9, the
// Rootkin tree at the left and the bottom 11% dark; title-portrait.jpg for portrait, 3:4), neither with
// lettering. Landscape (aspect ≥ 5:4): a stage the size of the screen, the title live top left, a
// column of six plates over the tree (Play, Multiplayer, Battlefield, Your race, How to play, Settings)
// drawn in the key art's plate style, a floating panel to their right for the choices, the account
// chip top right and a race bar across the dark band. Portrait (phones): the same idea held to one
// screen with nothing to scroll — the lockup over the sky, four plates in the middle (Solo play,
// Multiplayer, How to play, Settings), and a plate opens a centred card in its place: Solo play holds
// the race tiles with the chosen race's card, the battlefield strips, the rules and Play; Settings the
// settings. The card scrolls inside itself on a short phone; ← Menu or Escape goes back. Picking a race
// recolours Play. Static styling only: the canvas is the only moving surface in the game.
import { useEffect, useState, type ReactNode } from 'react';
import { CONTENT_VERSION, content, levels, matchupsFor, raceById, towersForRace, type LevelEntry } from '../content';
import { ENGINE_VERSION, type RaceDef, type RunRules } from '../engine';
import { resolveRules, type RulePick } from '../app/rules';
import { randomSeed, type Settings } from '../app/settings';
import { online } from '../net';
import { AccountBar } from './AccountBar';
import { Leaderboard } from './Leaderboard';
import { LogoLockup, OnRevealed, Reveal, TitleColumn } from './Title';
import { RaceDetails } from './RaceDetails';
import { RulesPicker } from './RulesPicker';
import { SettingsBody } from './SettingsPanel';
import { TowerIcon } from './TowerIcon';
import { UiIcon, currencyIcon, emblemIcon, modeIcon } from './UiIcon';

interface Props {
  settings: Settings;
  /** Pending lobby invites, shown as a badge on the Multiplayer button. */
  inviteCount?: number;
  onSettings(next: Settings): void;
  onPlay(level: LevelEntry, raceId: string, seed: string, rules: RunRules): void;
  onMultiplayer(raceId: string, levelId: string): void;
  onHowTo(): void;
  /** Open the how-to by itself once the title intro has given way (guests and new players). */
  autoHowTo?: boolean;
}

export const WORLD_NAMES: Record<string, string> = {
  rootkin: 'Forest moon',
  assembly: 'Scrap plains',
  chitin: 'Hive tunnels',
  lumenari: 'Crystal fields',
};

/** One line on each race for the landscape race bar, after the key art's own captions. */
const RACE_TAGLINES: Record<string, string> = {
  rootkin: 'Living growth',
  assembly: 'Industrial might',
  chitin: 'Bio-adaptive',
  lumenari: 'Crystal tech',
};

/** A wide strip of a map's painting, for level pickers (written by scripts/gen-map-thumbs.py). */
export const mapStripUrl = (mapId: string): string => `/maps/thumbs/${mapId}.jpg`;

/** Landscape at 5:4 or wider gets the stage layout; everything narrower the column. */
const WIDE_QUERY = '(min-aspect-ratio: 5/4)';

function useWide(): boolean {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE_QUERY).matches);
  useEffect(() => {
    const m = window.matchMedia(WIDE_QUERY);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

/** The viewport height in px, for icon sizes that follow the painting (1 lvh = height / 100). */
function useViewportHeight(): number {
  const [h, setH] = useState(() => window.innerHeight);
  useEffect(() => {
    const on = () => setH(window.innerHeight);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return h;
}

type Panel = 'none' | 'code' | 'scores' | 'settings';
type StagePanel = 'none' | 'battlefield' | 'race' | 'settings';
/** The phone menu: the plates, or the card one of them opened. */
type Step = 'home' | 'solo' | 'settings';

export function Menu({ settings, inviteCount = 0, onSettings, onPlay, onMultiplayer, onHowTo, autoHowTo = false }: Props) {
  const [raceId, setRaceId] = useState(() => settings.lastRace ?? 'rootkin');
  const [levelId, setLevelId] = useState(() => settings.lastLevel ?? levels[0].id);
  const [panel, setPanel] = useState<Panel>('none');
  const [stagePanel, setStagePanel] = useState<StagePanel>('none');
  const [step, setStep] = useState<Step>('home');
  const [code, setCode] = useState('');
  const [details, setDetails] = useState(false);
  const [pick, setPick] = useState<RulePick>(() => ({ rounds: settings.rounds ?? 0, bossEvery: settings.bossEvery ?? 0, difficulty: 0 }));
  const wide = useWide();
  const level = levels.find((l) => l.id === levelId) ?? levels[0];
  const race = raceById(raceId);
  const roster = towersForRace(raceId);
  const matchups = matchupsFor(raceId);
  const accent = race.palette.primary;
  const onAccent = darkText(accent) ? '#07131a' : '#ffffff'; // the Play button's lettering: dark on gold and cyan, white on purple and green

  const toggle = (p: Panel) => setPanel((cur) => (cur === p ? 'none' : p));
  const toggleStage = (p: StagePanel) => setStagePanel((cur) => (cur === p ? 'none' : p));

  const remember = () => onSettings({ ...settings, lastRace: raceId, lastLevel: level.id, rounds: pick.rounds, bossEvery: pick.bossEvery });

  const play = () => {
    remember();
    // Every run gets a fresh random challenge code unless the player typed one in to replay or
    // compare against a friend; the code is shown on the result screen either way.
    onPlay(level, raceId, code.trim() || randomSeed(), resolveRules({ ...pick, difficulty: 0 }, level));
  };

  const multiplayer = () => {
    remember();
    onMultiplayer(raceId, level.id);
  };

  // Escape closes the stage panel, or a phone card.
  useEffect(() => {
    if (stagePanel === 'none' && step === 'home') return;
    const on = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setStagePanel('none');
      setStep('home');
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [stagePanel, step]);

  const raceCard = (
    <RaceCardBody race={race} roster={roster} matchups={matchups} accent={accent} details={details} onDetails={() => setDetails((v) => !v)} compact={!wide} />
  );

  const battlefield = (
    <BattlefieldBody
      level={level}
      race={race}
      matchups={matchups}
      accent={accent}
      onLevel={setLevelId}
      pick={pick}
      onPick={setPick}
      panel={panel}
      onToggle={toggle}
      code={code}
      onCode={setCode}
      compact={!wide}
    />
  );

  const settingsBody = <SettingsBody settings={settings} onSettings={onSettings} />;

  const playLine = `${level.map.name} · ${level.map.difficulty} · ${level.waves.waves.length} waves`;
  const playStyle = { color: onAccent, background: `linear-gradient(180deg, ${accent} 0%, ${accent} 55%, ${accent}cc 100%)`, boxShadow: `0 6px 24px -8px ${accent}` };

  if (wide) {
    return (
      <TitleColumn layout="stage">
        {autoHowTo && <OnRevealed run={onHowTo} delayMs={700} />}
        <LogoLockup stage />

        <Reveal className="et-stage-top">
          <AccountBar />
        </Reveal>

        {/* The plate column, over the painting's tree. */}
        <Reveal className="et-plates">
          <button onClick={play} className="et-plate et-plate-play">
            <Glyph kind="play" />
            <span className="min-w-0">
              <span className="et-plate-label">Play</span>
              <span className="et-plate-sub">{playLine}</span>
            </span>
          </button>
          <button onClick={multiplayer} className="et-plate relative">
            <UiIcon name={modeIcon('lanes')} size={28} className="et-plate-icon" fallback={<Glyph kind="versus" />} />
            <span className="et-plate-label">Multiplayer</span>
            {inviteCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 min-w-[1.25rem] rounded-full bg-sap px-1.5 text-center text-[11px] font-bold text-grove-950" aria-label={`${inviteCount} invites`}>
                {inviteCount}
              </span>
            )}
          </button>
          <button onClick={() => toggleStage('battlefield')} aria-expanded={stagePanel === 'battlefield'} className="et-plate">
            <Glyph kind="map" />
            <span className="min-w-0">
              <span className="et-plate-label">Battlefield</span>
              <span className="et-plate-sub">{level.map.name} · vs {raceById(level.enemyRace).name}</span>
            </span>
          </button>
          <button onClick={() => toggleStage('race')} aria-expanded={stagePanel === 'race'} className="et-plate">
            <UiIcon name={emblemIcon(raceId)} size={28} className="et-plate-icon" fallback={<Glyph kind="race" />} />
            <span className="min-w-0">
              <span className="et-plate-label">Your race</span>
              <span className="et-plate-sub">
                {race.name} · {race.passive.name}
              </span>
            </span>
          </button>
          <button onClick={onHowTo} className="et-plate">
            <Glyph kind="book" />
            <span className="et-plate-label">How to play</span>
          </button>
          <button onClick={() => toggleStage('settings')} aria-expanded={stagePanel === 'settings'} className="et-plate">
            <Glyph kind="gear" />
            <span className="et-plate-label">Settings</span>
          </button>
          <p className="mt-[1.2lvh] pl-1 text-[11px] text-grove-300/50">
            engine {ENGINE_VERSION} · content {CONTENT_VERSION}
          </p>
        </Reveal>

        {stagePanel !== 'none' && (
          <section
            className="et-stage-panel rounded-2xl border border-grove-700/80 bg-grove-900/95 p-3 backdrop-blur-sm"
            style={{ boxShadow: `0 0 0 1px ${accent}33, 0 16px 48px -16px #000` }}
            role="region"
            aria-label={stagePanel === 'battlefield' ? 'Battlefield' : stagePanel === 'race' ? 'Your race' : 'Settings'}
          >
            <div className="flex items-baseline justify-between gap-3">
              {stagePanel === 'battlefield' && <h2 className="font-tech text-lg font-bold leading-none text-grove-100">Choose a battlefield</h2>}
              {stagePanel === 'race' && <RaceHeading race={race} raceId={raceId} />}
              {stagePanel === 'settings' && <h2 className="font-tech text-lg font-bold leading-none text-grove-100">Settings</h2>}
              <button onClick={() => setStagePanel('none')} className="shrink-0 rounded-md px-2 py-0.5 text-sm text-grove-300/80 hover:bg-grove-700 hover:text-white" aria-label="Close">
                ✕
              </button>
            </div>
            <div className="mt-2">
              {stagePanel === 'battlefield' && battlefield}
              {stagePanel === 'race' && raceCard}
              {stagePanel === 'settings' && settingsBody}
            </div>
          </section>
        )}

        {/* The race bar across the painting's dark band. */}
        <Reveal className="et-racebar">
          <RaceBar raceId={raceId} onRace={setRaceId} />
        </Reveal>
      </TitleColumn>
    );
  }

  // Phones: one screen, nothing to scroll. The plates sit in the middle like the desktop's; Solo play
  // opens one centred card with the race and the battlefield (and Play), Settings another.
  const back = () => setStep('home');
  return (
    <TitleColumn layout="screen">
      {autoHowTo && <OnRevealed run={onHowTo} delayMs={700} />}
      <LogoLockup />
      <Reveal>
        <AccountBar />
      </Reveal>

      <div className="et-screen-middle">
        {step === 'home' && (
          <Reveal className="et-phone-plates">
            <button onClick={() => setStep('solo')} className="et-plate et-plate-play">
              <Glyph kind="play" />
              <span className="min-w-0">
                <span className="et-plate-label">Solo play</span>
                <span className="et-plate-sub">
                  {race.name} · {level.map.name}
                </span>
              </span>
            </button>
            <button onClick={multiplayer} className="et-plate relative">
              <UiIcon name={modeIcon('lanes')} size={28} className="et-plate-icon" fallback={<Glyph kind="versus" />} />
              <span className="min-w-0">
                <span className="et-plate-label">Multiplayer</span>
                <span className="et-plate-sub">Co-op, Mirror, Lanes, King of the Maze</span>
              </span>
              {inviteCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 min-w-[1.25rem] rounded-full bg-sap px-1.5 text-center text-[11px] font-bold text-grove-950" aria-label={`${inviteCount} invites`}>
                  {inviteCount}
                </span>
              )}
            </button>
            <button onClick={onHowTo} className="et-plate">
              <Glyph kind="book" />
              <span className="et-plate-label">How to play</span>
            </button>
            <button onClick={() => setStep('settings')} className="et-plate">
              <Glyph kind="gear" />
              <span className="et-plate-label">Settings</span>
            </button>
          </Reveal>
        )}

        {step === 'solo' && (
          <section className="et-phone-card rounded-2xl border border-grove-700/80 bg-grove-900/95 p-3 backdrop-blur-sm" style={{ boxShadow: `0 0 0 1px ${accent}33, 0 16px 48px -16px #000` }} role="region" aria-label="Solo play">
            <CardHeader title="Solo play" onBack={back} />

            {/* The race: four tiles, the chosen one lit; its card under them. */}
            <div className="mt-3 grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Race">
              {content.races.map((r) => (
                <RaceTile key={r.id} race={r} active={r.id === raceId} onPick={() => setRaceId(r.id)} />
              ))}
            </div>
            <div className="mt-2 rounded-xl border border-grove-800 bg-grove-950/50 px-3 pb-2.5 pt-2">
              <RaceHeading race={race} raceId={raceId} />
              <div className="mt-1.5">{raceCard}</div>
            </div>

            <h2 className="mt-3 px-1 font-tech text-lg font-bold leading-none text-grove-100">Choose a battlefield</h2>
            <div className="mt-2">{battlefield}</div>

            {/* Play stays in view while the card scrolls. */}
            <div className="sticky bottom-0 -mx-3 -mb-3 mt-2 bg-gradient-to-t from-grove-900 via-grove-900/95 to-transparent px-3 pb-3 pt-3">
              <button onClick={play} className="w-full rounded-xl px-4 py-2.5 text-left hover:brightness-110" style={playStyle}>
                <span className="block font-tech text-2xl font-bold leading-none">Play</span>
                <span className="mt-1 block truncate text-xs font-semibold opacity-80">
                  {race.name} · {playLine}
                </span>
              </button>
            </div>
          </section>
        )}

        {step === 'settings' && (
          <section className="et-phone-card rounded-2xl border border-grove-700/80 bg-grove-900/95 p-3 backdrop-blur-sm" style={{ boxShadow: `0 0 0 1px ${accent}33, 0 16px 48px -16px #000` }} role="region" aria-label="Settings">
            <CardHeader title="Settings" onBack={back} />
            <div className="mt-1">{settingsBody}</div>
          </section>
        )}
      </div>

      <p className="text-center text-[11px] text-grove-300/40">
        engine {ENGINE_VERSION} · content {CONTENT_VERSION}
      </p>
    </TitleColumn>
  );
}

/** A card's first row on the phone menu: back to the plates, and the card's name. */
function CardHeader({ title, onBack }: { title: string; onBack(): void }) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={onBack} className="rounded-md border border-grove-700 px-2.5 py-1 text-sm text-grove-300 hover:bg-grove-800" aria-label="Back to the menu">
        ← Menu
      </button>
      <h2 className="font-tech text-lg font-bold leading-none text-grove-100">{title}</h2>
    </div>
  );
}

/** One race in the phone menu's row of four: the emblem, the name and the world, lit in the race's colour when chosen. */
function RaceTile({ race: r, active, onPick }: { race: RaceDef; active: boolean; onPick(): void }) {
  const starter = towersForRace(r.id)[0];
  return (
    <button
      role="radio"
      aria-checked={active}
      onClick={onPick}
      className={`relative flex flex-col items-center overflow-hidden rounded-xl border px-1 pb-1 pt-1.5 transition-colors ${active ? 'border-transparent' : 'border-grove-800 bg-grove-950/40 opacity-75 hover:opacity-100'}`}
      style={active ? { background: `radial-gradient(120% 90% at 50% 20%, ${r.palette.primary}55, ${r.palette.primary}12 60%, transparent)`, boxShadow: `inset 0 0 0 1.5px ${r.palette.primary}` } : undefined}
    >
      <UiIcon name={emblemIcon(r.id)} size={active ? 44 : 36} className="transition-all" fallback={starter && <TowerIcon tower={starter} size={active ? 44 : 36} state="t2" />} />
      <span className={`mt-0.5 w-full truncate text-center text-[11px] font-semibold ${active ? 'text-white' : 'text-grove-300'}`}>{r.name}</span>
      <span className="w-full truncate text-center text-[10px] text-grove-300/60">{WORLD_NAMES[r.id]}</span>
    </button>
  );
}

/** The landscape race bar: four cells across the painting's bottom band, the chosen one lit. */
function RaceBar({ raceId, onRace }: { raceId: string; onRace(id: string): void }) {
  const vh = useViewportHeight();
  const emblem = Math.max(18, Math.round(vh * 0.052));
  return (
    <div className="contents" role="radiogroup" aria-label="Race">
      {content.races.map((r) => {
        const starter = towersForRace(r.id)[0];
        const active = r.id === raceId;
        return (
          <button
            key={r.id}
            role="radio"
            aria-checked={active}
            onClick={() => onRace(r.id)}
            style={active ? { background: `linear-gradient(180deg, ${r.palette.primary}33, transparent 70%)`, boxShadow: `inset 0 3px 0 ${r.palette.primary}` } : undefined}
          >
            <UiIcon name={emblemIcon(r.id)} size={emblem} fallback={starter && <TowerIcon tower={starter} size={emblem} state="t2" />} />
            <span className="min-w-0 text-left">
              <span className={`et-racebar-name block truncate ${active ? 'text-white' : 'text-grove-100'}`}>{r.name}</span>
              <span className="et-racebar-tag truncate text-grove-300">{RACE_TAGLINES[r.id]}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function RaceHeading({ race, raceId }: { race: RaceDef; raceId: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="min-w-0 truncate font-tech text-lg font-bold leading-none text-grove-100">
        {race.name} <span className="font-normal text-grove-300/70">· {WORLD_NAMES[raceId]}</span>
      </h2>
      <span className="flex shrink-0 items-center gap-1 text-xs text-grove-300/70">
        pays in <UiIcon name={currencyIcon(race.currency)} size={14} alt="" /> {race.currency}
      </span>
    </div>
  );
}

function RaceCardBody({ race, roster, matchups, accent, details, onDetails, compact = false }: { race: RaceDef; roster: ReturnType<typeof towersForRace>; matchups: ReturnType<typeof matchupsFor>; accent: string; details: boolean; onDetails(): void; compact?: boolean }) {
  return (
    <>
      <p className="text-sm leading-snug text-grove-100/90">{race.blurb}</p>
      <div className={`mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs ${compact && !details ? 'hidden' : ''}`}>
        <ul className="flex flex-col gap-1" aria-label="Strengths">
          {race.pros.map((p) => (
            <li key={p} className="flex gap-1.5 text-grove-300">
              <span style={{ color: accent }} aria-hidden>
                +
              </span>
              {p}
            </li>
          ))}
        </ul>
        <ul className="flex flex-col gap-1" aria-label="Drawbacks">
          {race.cons.map((c) => (
            <li key={c} className="flex gap-1.5 text-amber-200/90">
              <span className="text-rust" aria-hidden>
                −
              </span>
              {c}
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-2 text-xs text-grove-300/90">
        Strong against <span className="font-semibold text-grove-300">{matchups.strongAgainst.map((r) => r.name).join(', ') || 'no one'}</span>
        <span className="mx-1.5 text-grove-300/40">·</span>
        Weak against <span className="font-semibold text-rust">{matchups.weakAgainst.map((r) => r.name).join(', ') || 'no one'}</span>
      </p>
      <button onClick={onDetails} aria-expanded={details} className="mt-2 flex w-full items-center justify-between gap-2 rounded-lg border border-grove-700 bg-grove-800/70 px-3 py-1.5 text-left text-sm text-grove-300 hover:bg-grove-700">
        <span>{details ? 'Hide the details' : `Special ability, numbers and all ${roster.length} towers`}</span>
        <span aria-hidden className={`shrink-0 transition-transform ${details ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </button>
      {details && <RaceDetails race={race} />}
    </>
  );
}

interface BattlefieldProps {
  level: LevelEntry;
  race: RaceDef;
  matchups: ReturnType<typeof matchupsFor>;
  accent: string;
  onLevel(id: string): void;
  pick: RulePick;
  onPick(p: RulePick): void;
  panel: Panel;
  onToggle(p: Panel): void;
  code: string;
  onCode(c: string): void;
  /** Shorter strips, for the phone card. */
  compact?: boolean;
}

/** The level strips, the rules, and the challenge code and top scores under them. */
function BattlefieldBody({ level, race, matchups, accent, onLevel, pick, onPick, panel, onToggle, code, onCode, compact = false }: BattlefieldProps) {
  return (
    <>
      <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Level">
        {levels.map((l) => {
          const active = l.id === level.id;
          const enemy = raceById(l.enemyRace);
          const edge = matchups.multiplier[enemy.id];
          const chip = l.map.difficulty === 'hard' ? 'bg-rust text-grove-950' : l.map.difficulty === 'normal' ? 'bg-sap text-grove-950' : 'bg-grove-300 text-grove-950';
          return (
            <button
              key={l.id}
              role="radio"
              aria-checked={active}
              onClick={() => onLevel(l.id)}
              className={`relative ${compact ? 'h-[3.4rem]' : 'h-[4.25rem]'} overflow-hidden rounded-xl border text-left ${active ? 'border-white/80' : 'border-grove-800 hover:border-grove-700'}`}
              style={{ backgroundImage: `url(${mapStripUrl(l.id)})`, backgroundSize: 'cover', backgroundPosition: 'center', boxShadow: active ? `0 0 0 2px ${accent}` : undefined }}
            >
              <span className={`absolute inset-0 bg-gradient-to-r from-grove-950/90 via-grove-950/55 to-grove-950/10 ${active ? '' : 'opacity-95'}`} aria-hidden="true" />
              <span className="relative flex h-full items-center justify-between gap-3 px-3">
                <span className="min-w-0">
                  <span className={`block truncate font-tech font-bold leading-tight text-white ${compact ? 'text-base' : 'text-lg'}`}>
                    {l.map.name}
                    {compact && edge > 1.05 && <span className="text-grove-300" title={`${race.name} are strong against them`}> ▲</span>}
                    {compact && edge < 0.95 && <span className="text-amber-300" title={`${race.name} are weak against them`}> ▼</span>}
                  </span>
                  <span className="block truncate text-xs text-grove-100/80">
                    {WORLD_NAMES[l.map.world] ?? l.map.world} · {l.waves.waves.length} waves · vs {enemy.name}
                  </span>
                  {!compact && edge > 1.05 && <span className="block text-[11px] font-semibold text-grove-300">▲ {race.name} are strong against them</span>}
                  {!compact && edge < 0.95 && <span className="block text-[11px] font-semibold text-amber-300">▼ {race.name} are weak against them</span>}
                </span>
                <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold ${chip}`}>{l.map.difficulty}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="px-1">
        <RulesPicker level={level} pick={pick} onChange={onPick} solo />
      </div>

      <div className="mt-3 flex items-center gap-4 px-1 text-xs">
        <button onClick={() => onToggle('code')} className="text-grove-300/80 underline-offset-2 hover:underline">
          {panel === 'code' ? 'Hide challenge code' : 'Have a challenge code?'}
        </button>
        {online && (
          <button onClick={() => onToggle('scores')} className="text-grove-300/80 underline-offset-2 hover:underline">
            {panel === 'scores' ? 'Hide scores' : 'Top scores'}
          </button>
        )}
      </div>
      {panel === 'code' && (
        <div className="mt-1 px-1 pb-1">
          <input
            id="seed"
            value={code}
            onChange={(e) => onCode(e.target.value)}
            placeholder="e.g. mossy-7k2q"
            className="w-full rounded-md border border-grove-700 bg-grove-950/80 px-3 py-2 font-mono text-sm"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <p className="mt-1 text-xs text-grove-300/60">A code replays the exact same waves, so two players can compare runs. Leave it blank for a fresh one; your run's code is shown when it ends.</p>
        </div>
      )}
      {panel === 'scores' && (
        <div className="px-1 pb-1">
          <Leaderboard level={level} />
        </div>
      )}
    </>
  );
}

/** Line glyphs for the plates that have no painted icon of their own. */
function Glyph({ kind }: { kind: 'play' | 'versus' | 'map' | 'race' | 'book' | 'gear' }): ReactNode {
  const common = { className: 'et-plate-icon', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  switch (kind) {
    case 'play':
      return (
        <svg {...common}>
          <path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'versus':
      return (
        <svg {...common}>
          <path d="M4 20l7-7M20 4l-7 7M4 4l16 16M9 4H4v5M15 20h5v-5" />
        </svg>
      );
    case 'map':
      return (
        <svg {...common}>
          <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" />
          <path d="M9 4v14M15 6v14" />
        </svg>
      );
    case 'race':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 4v16M4 12h16" />
        </svg>
      );
    case 'book':
      return (
        <svg {...common}>
          <path d="M4 5h6a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4zM20 5h-6a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h6z" />
        </svg>
      );
    case 'gear':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
        </svg>
      );
  }
}

/** True when near-black lettering reads better than white on this colour (relative luminance above 0.35). */
function darkText(hex: string): boolean {
  const n = parseInt(hex.slice(1, 7), 16);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lum = 0.2126 * lin(((n >> 16) & 255) / 255) + 0.7152 * lin(((n >> 8) & 255) / 255) + 0.0722 * lin((n & 255) / 255);
  return lum > 0.35;
}


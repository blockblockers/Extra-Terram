// Extra Terram — src/ui/HowToPlay.tsx v0.3.3 — the sound settings
// Opens by itself the first time a guest or a new player reaches the menu (see `shouldAutoOpenHowTo`),
// and any time from "How to play" at the bottom of the menu or from the pause screen.
import { useEffect, useRef } from 'react';
import { content, currencyLabel, matchupsFor, raceById, towersForRace } from '../content';
import { BOSS_SEND_FROM_ROUND, DIFFICULTIES, MAX_REINFORCE, MAX_ROUNDS, REINFORCE_STEP, type RaceDef } from '../engine';
import { TowerIcon } from './TowerIcon';

const SEEN_KEY = 'extra-terram.howto.seen.v1';
const NEW_ACCOUNT_DAYS = 7;

export function markHowToSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // storage unavailable: it may open again next time, which is harmless
  }
}

function seen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return true; // no storage (private mode): never nag on every load
  }
}

/** Guests, offline play and accounts younger than a week get the guide once per device. */
export function shouldAutoOpenHowTo(status: string, accountCreatedAt: string | null | undefined): boolean {
  if (seen()) return false;
  if (status === 'guest' || status === 'offline') return true;
  if (status !== 'signed-in') return false;
  if (!accountCreatedAt) return true;
  const age = Date.now() - new Date(accountCreatedAt).getTime();
  return !Number.isFinite(age) || age < NEW_ACCOUNT_DAYS * 24 * 3600 * 1000;
}

const ROLES: Array<{ role: string; name: string; text: string }> = [
  { role: 'starter', name: 'Starter', text: 'cheap and quick; your first line' },
  { role: 'heavy', name: 'Heavy', text: 'slow, big hits for tough creeps' },
  { role: 'control', name: 'Slow field', text: 'slows everything near it' },
  { role: 'splash', name: 'Splash', text: 'hits a whole group at once' },
  { role: 'range', name: 'Sniper', text: 'long reach, hits hard, fires rarely' },
  { role: 'economy', name: 'Income', text: 'never attacks; pays out every wave' },
  { role: 'support', name: 'Buff', text: 'makes towers around it stronger' },
];

/** The four races in "beats" order, starting from the first race: each beats the next. */
function cycle(): RaceDef[] {
  const order: RaceDef[] = [content.races[0]];
  while (order.length < content.races.length) {
    const next = matchupsFor(order[order.length - 1].id).strongAgainst[0];
    if (!next || order.includes(next)) break;
    order.push(next);
  }
  return order.length === content.races.length ? order : content.races;
}

function RaceChip({ race }: { race: RaceDef }) {
  const starter = towersForRace(race.id)[0];
  return (
    <div className="flex flex-col items-center rounded-lg border border-grove-700 bg-grove-800/80 px-1 py-1.5">
      {starter && <TowerIcon tower={starter} size={36} state="t2" />}
      <span className="mt-0.5 text-center text-[11px] font-semibold leading-tight">{race.name}</span>
    </div>
  );
}

function Beats({ dir }: { dir: '→' | '↓' | '←' | '↑' }) {
  return (
    <div className="flex flex-col items-center justify-center text-sap">
      <span className="text-lg leading-none">{dir}</span>
      <span className="text-[10px] uppercase tracking-wide text-grove-300/70">beats</span>
    </div>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-sap">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sap/20 text-[11px]">{n}</span>
        {title}
      </h3>
      <div className="mt-1 text-sm leading-relaxed text-grove-300/90">{children}</div>
    </section>
  );
}

export function HowToPlay({ raceId, onClose }: { raceId?: string; onClose(): void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const bossLeak = content.creeps.find((c) => c.archetype === 'boss')?.leakCost ?? 5;
  const race = raceById(raceId ?? content.races[0].id);
  const roster = towersForRace(race.id);
  const ring = cycle();
  const mults = Object.values(matchupsFor(ring[0].id).multiplier);
  const strongPct = Math.round((Math.max(...mults) - 1) * 100);
  const weakPct = Math.round((1 - Math.min(...mults)) * 100);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="howto-title">
      <div className="flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-2xl border border-grove-700 bg-grove-900 shadow-2xl sm:rounded-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-grove-700/70 px-4 pb-2 pt-[calc(0.75rem)]">
          <h2 id="howto-title" className="text-lg font-bold">
            How to play
          </h2>
          <button ref={closeRef} onClick={onClose} className="rounded-md px-2 py-1 text-grove-300 hover:bg-grove-800" aria-label="Close">
            ✕
          </button>
        </header>

        <div className="overflow-y-auto px-4 pb-4">
          <Section n={1} title="Hold the maze">
            Aliens of another race march along the path toward your base. Every one that slips through costs you lives — big ones cost more. Survive every wave to win; lose all your lives and the maze falls.
          </Section>

          <Section n={2} title="Build towers">
            Pick a tower in the bar at the bottom, tap a round pad next to the path, then tap <b>Build</b>. You can also tap a pad first and then choose the tower. Towers aim and fire on their own. Swipe the bar to see all seven.
          </Section>

          <Section n={3} title="Earn and spend">
            Each race has its own money — {content.races.map((r) => `${currencyLabel(r.id)} for ${r.name}`).join(', ')}. You earn it for every kill and every wave you clear. <b>Call it</b> starts the next wave early and pays a bonus for the seconds you skip.
          </Section>

          <Section n={4} title="Upgrade">
            A gold <span className="font-bold text-amber-300">▲</span> over a tower means you can afford its next level — tap the tower. Level 2 is a straight upgrade; at level 3 you choose one of two specialities, and the buttons show exactly what changes. A tower at level 3 can then be <b>reinforced</b>: +{Math.round(REINFORCE_STEP * 100)}% damage a level, up to {MAX_REINFORCE} levels (a blue <span className="font-bold text-sky-200">+</span> shows when you can afford one). Selling gives part of the price back.
          </Section>

          <Section n={5} title="Pick your race">
            Every race has a special ability and fights one race well and another badly. Each level says who attacks it and whether your race is strong or weak there.
            <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-1.5" aria-label="Which race beats which">
              {ring.length === 4 ? (
                <>
                  <RaceChip race={ring[0]} />
                  <Beats dir="→" />
                  <RaceChip race={ring[1]} />
                  <Beats dir="↑" />
                  <div />
                  <Beats dir="↓" />
                  <RaceChip race={ring[3]} />
                  <Beats dir="←" />
                  <RaceChip race={ring[2]} />
                </>
              ) : (
                ring.map((r) => <RaceChip key={r.id} race={r} />)
              )}
            </div>
            <p className="mt-1.5 text-xs text-grove-300/70">
              Strong means your towers deal {strongPct}% more damage to that race; weak means {weakPct}% less. Some upgrades ignore armour and are never weak.
            </p>
          </Section>

          <Section n={6} title="Know your towers">
            <ul className="mt-1 flex flex-col gap-1">
              {ROLES.map(({ role, name, text }) => {
                const tower = roster.find((t) => t.role === role);
                return (
                  <li key={role} className="flex items-center gap-2 rounded-md bg-grove-800/60 px-2 py-1 text-xs">
                    {tower && <TowerIcon tower={tower} size={28} state="t1" />}
                    <span>
                      <span className="font-semibold text-grove-300">{name}</span>
                      {tower && <span className="text-grove-300/60"> ({tower.name})</span>} — {text}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Section>

          <Section n={7} title="Play with others">
            <b>Multiplayer</b> on the menu: a <b>Parallel race</b> (same level, your own board, best score wins), <b>Mirror</b> (the same, and you can pay to send creeps into a rival's lane) or <b>Co-op</b> (one shared board; each player builds and upgrades their own towers). Signed-in players can invite friends by name or email.
            <span className="mt-1.5 block">
              <b>Lanes</b>: one board with a lane each. The same waves come down every lane, your towers guard only yours (its pads carry a ring in your colour), and the money you spend on <b>Send</b> drops creeps into a rival&rsquo;s lane. A lane that runs out of lives closes; the last player standing wins. In 2 v 2 a team shares one life pool and can build in both of its lanes.
            </span>
            <span className="mt-1.5 block">
              <b>King of the Maze</b>: one trail that forks to a base for each player (or team). Every creep picks a base in turn and wears its colour. Towers on the shared trail help everyone (and earn their builder the bounty); pads on your fork (ringed in your colour) are yours alone; unringed pads are anyone&rsquo;s. Sends land where a rival&rsquo;s fork begins. A base that falls is out; the last base standing wins.
            </span>
            <span className="mt-1.5 block">
              <b>Sending</b>: a sent creep costs more than its bounty, but every send raises your income for the rest of the run, and the strip over the board tells the rival what is coming. With more than one rival, pick who takes it (or leave it to chance). From round {BOSS_SEND_FROM_ROUND} the Send tab also offers your race&rsquo;s <b>mini-boss</b>, one at a time, for half the income a normal send would give.
            </span>
            <span className="mt-1.5 block text-xs text-grove-300/70">In Lanes and King, waves come on the clock (nobody calls one early). If the rounds run out first, the most lives wins, then the higher score. When a match ends, the host can open a <b>rematch</b>: a fresh lobby with the same rules, and a button to join it for everyone else.</span>
          </Section>

          <Section n={8} title="Longer runs and mini-bosses">
            Under the level list (or in a lobby, for the host) pick how many <b>rounds</b> to play, up to {MAX_ROUNDS}. Past the level&rsquo;s own waves the rounds keep getting harder, and every round counts for more points. <b>Mini-bosses</b> can close every 10th, 5th or 3rd round: one huge alien worth a big payout and triple points that costs {bossLeak} lives if it gets through. In co-op the host can also raise the difficulty to {DIFFICULTIES.slice(1).map((d) => d.name).join(' or ')}. Runs with other rules earn no stars and go on the level&rsquo;s <b>Ultimate</b> top scores (any rules) instead of the Standard list. In a long run, spend on Reinforce: money in the bank does not fight.
          </Section>

          <Section n={9} title="Handy">
            1×, 2× and 3× speed and Pause are at the top of the game. Settings has the music and effects volumes, a mute switch, a battery saver and the build-confirm switch. A challenge code replays the exact same waves, so you and a friend can compare runs.
          </Section>
        </div>

        <footer className="border-t border-grove-700/70 px-4 pb-[calc(var(--safe-bottom)+0.75rem)] pt-3">
          <button onClick={onClose} className="w-full rounded-lg bg-grove-500 px-4 py-3 font-semibold text-grove-950 hover:bg-grove-300">
            Let's play
          </button>
          <p className="mt-1.5 text-center text-[11px] text-grove-300/60">Open this again any time from “How to play” at the bottom of the menu.</p>
        </footer>
      </div>
    </div>
  );
}

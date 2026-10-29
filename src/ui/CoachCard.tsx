// Extra Terram — src/ui/CoachCard.tsx v0.1.0 — a first-play hint per race over the board during the first build window
// Shown once per race per device (remembered in localStorage; the storage may be refused, then it shows
// every first wave of a run). Two lines: what to do first with this race, and the one rule its passive
// turns on. Static styling only; the canvas is the only moving surface.
import { raceById, towersForRace } from '../content';

const SEEN_KEY = 'extra-terram.hints.v1';

function seen(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
}

export function hintSeen(raceId: string): boolean {
  return seen()[raceId] === true;
}

export function markHintSeen(raceId: string): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify({ ...seen(), [raceId]: true }));
  } catch {
    // storage refused: the hint shows again next run
  }
}

/** The opening move and the passive rule, in the race's own terms. Falls back to the passive's description. */
export function coachLines(raceId: string): { first: string; rule: string } {
  const race = raceById(raceId);
  const starter = towersForRace(raceId)[0]?.name ?? 'the starter';
  switch (race.passive.id) {
    case 'rooted':
      return {
        first: `Plant two ${starter}s on the first bend now and leave them: they start at 85% and grow every wave they stand through.`,
        rule: 'Rootkin reward patience. Sell as little as you can; a moved tree starts over.',
      };
    case 'spin-up':
      return {
        first: `Put a ${starter} where creeps stay in range longest: each shot within a second of the last fires sooner, up to 30%.`,
        rule: 'Kills pay +10%, upgrades cost +20%: build wide first, upgrade later.',
      };
    case 'hive':
      return {
        first: `Pack ${starter}s within 1.5 tiles of each other: every neighbour makes them fire faster, and acid stacks on a target.`,
        rule: 'Chitin towers are cheap, but selling refunds only half. Place them where they stay.',
      };
    case 'overcharge':
      return {
        first: `Spread a few ${starter}s along the trail rather than bunching them: a tower idle for 2 s hits 2.5× with its next shot.`,
        rule: 'Lumenari fire 8% slower and beams pierce: long straights are their ground.',
      };
    default:
      return { first: `Pick ${starter}, then tap a build pad.`, rule: race.passive.description };
  }
}

interface Props {
  raceId: string;
  onClose(): void;
}

export function CoachCard({ raceId, onClose }: Props) {
  const race = raceById(raceId);
  const lines = coachLines(raceId);
  return (
    <div className="absolute inset-x-3 bottom-3 rounded-xl border border-sap/50 bg-grove-900/95 p-3 text-sm shadow-lg backdrop-blur" role="note" aria-label="First-play hint">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-tech text-base font-bold leading-none text-sap">
            First run as {race.name}: {race.passive.name}
          </p>
          <p className="mt-1 text-grove-100">{lines.first}</p>
          <p className="mt-1 text-xs text-grove-300/85">{lines.rule} Call the wave early to bank the seconds left.</p>
        </div>
        <button onClick={onClose} className="shrink-0 rounded-md bg-grove-500 px-3 py-1.5 font-semibold text-grove-950 hover:bg-grove-300">
          Got it
        </button>
      </div>
    </div>
  );
}

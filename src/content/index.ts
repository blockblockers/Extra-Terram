// Extra Terram — src/content/index.ts v0.6.0 — versus maps (Lanes, King of the Maze) beside the campaign levels
// Assembles the typed ContentPack from the JSON files. The engine never imports JSON itself;
// it is handed a pack, so the same engine runs on the server with content loaded another way.
import type { ContentPack, CreepDef, DamageMatrix, MapDef, RaceDef, TowerDef, WaveScript } from '../engine/types';
import racesJson from './races.json';
import towersJson from './towers.json';
import creepsJson from './creeps.json';
import damageJson from './damage-matrix.json';
import mapRootkinForest01 from './maps/rootkin-forest-01.json';
import mapAssemblyScrap01 from './maps/assembly-scrap-01.json';
import mapChitinHive01 from './maps/chitin-hive-01.json';
import mapLumenariCrystal01 from './maps/lumenari-crystal-01.json';
import wavesRootkinForest01 from './waves/rootkin-forest-01.json';
import wavesAssemblyScrap01 from './waves/assembly-scrap-01.json';
import wavesChitinHive01 from './waves/chitin-hive-01.json';
import wavesLumenariCrystal01 from './waves/lumenari-crystal-01.json';
import mapLanes2 from './maps/lanes-2-hollows.json';
import mapLanes3 from './maps/lanes-3-prism.json';
import mapLanes4 from './maps/lanes-4-warrens.json';
import mapKing2 from './maps/king-2-foundry.json';
import mapKing3 from './maps/king-3-elderfork.json';
import mapKing4 from './maps/king-4-throne.json';
import wavesLanes2 from './waves/lanes-2-hollows.json';
import wavesLanes3 from './waves/lanes-3-prism.json';
import wavesLanes4 from './waves/lanes-4-warrens.json';
import wavesKing2 from './waves/king-2-foundry.json';
import wavesKing3 from './waves/king-3-elderfork.json';
import wavesKing4 from './waves/king-4-throne.json';

export const CONTENT_VERSION: string = racesJson.content_version;

export const content: ContentPack = {
  version: CONTENT_VERSION,
  races: racesJson.races as RaceDef[],
  towers: towersJson.towers as TowerDef[],
  creeps: creepsJson.creeps as CreepDef[],
  damage: damageJson as DamageMatrix,
};

const mapList = [mapRootkinForest01, mapAssemblyScrap01, mapChitinHive01, mapLumenariCrystal01, mapLanes2, mapLanes3, mapLanes4, mapKing2, mapKing3, mapKing4] as MapDef[];
const waveList = [wavesRootkinForest01, wavesAssemblyScrap01, wavesChitinHive01, wavesLumenariCrystal01] as WaveScript[];
const versusWaveList = [wavesLanes2, wavesLanes3, wavesLanes4, wavesKing2, wavesKing3, wavesKing4] as WaveScript[];

export const maps: Record<string, MapDef> = Object.fromEntries(mapList.map((m) => [m.id, m]));
export const waveScripts: Record<string, WaveScript> = Object.fromEntries([...waveList, ...versusWaveList].map((w) => [w.id, w]));

export interface LevelEntry {
  id: string;
  map: MapDef;
  waves: WaveScript;
  /** Race whose creeps attack on this level (from the wave script's first group). */
  enemyRace: string;
}

function entry(w: WaveScript): LevelEntry {
  const map = maps[w.map];
  const firstCreep = content.creeps.find((c) => c.id === w.waves[0].groups[0].creep);
  return { id: w.id, map, waves: w, enemyRace: firstCreep?.race ?? 'assembly' };
}

/** Playable levels in campaign order: one per home world, easy to hard (single player, co-op, parallel race, Mirror). */
export const levels: LevelEntry[] = waveList.map(entry);

/** Versus maps: Lanes (a lane per player) and King of the Maze (a shared trail forking to a base per player or team). */
export const versusLevels: LevelEntry[] = versusWaveList.map(entry);

/** Any level by id, campaign or versus. */
export function levelById(id: string): LevelEntry | undefined {
  return levels.find((l) => l.id === id) ?? versusLevels.find((l) => l.id === id);
}

/** The versus maps for a mode and a lobby: Lanes take a lane per player; King a base per player, or two bases for 2 v 2. */
export function versusMapsFor(mode: 'lanes' | 'king', players: number, teams: boolean): LevelEntry[] {
  const slots = mode === 'king' && teams ? 2 : players;
  return versusLevels.filter((l) => l.map.mode === mode && (l.map.slots ?? 0) === slots);
}

export function raceById(id: string): RaceDef {
  return content.races.find((r) => r.id === id) ?? content.races[0];
}

/** A race's tower roster in build-bar order: the shared role slots, same order for every race. */
const ROLE_ORDER = ['starter', 'heavy', 'control', 'splash', 'range', 'economy', 'support', 'trap'];
export function towersForRace(raceId: string): TowerDef[] {
  return content.towers.filter((t) => t.race === raceId).sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
}

/** How a race's damage fares against each other race's creeps, from the damage matrix. */
export interface Matchups {
  /** Races whose creeps take extra damage from this race's towers. */
  strongAgainst: RaceDef[];
  /** Races whose creeps shrug off part of this race's damage. */
  weakAgainst: RaceDef[];
  /** The multiplier against every race, by race id (the best of the race's damage types). */
  multiplier: Record<string, number>;
}

export function matchupsFor(raceId: string): Matchups {
  const race = raceById(raceId);
  const m = content.damage.multipliers;
  const multiplier: Record<string, number> = {};
  for (const other of content.races) multiplier[other.id] = Math.max(...race.damageTypes.map((t) => m[t][other.creepArmor]));
  const others = content.races.filter((r) => r.id !== raceId);
  return {
    strongAgainst: others.filter((r) => multiplier[r.id] > 1.05),
    weakAgainst: others.filter((r) => multiplier[r.id] < 0.95),
    multiplier,
  };
}

/** A race's money, lower case ("scrap"); `currencyLabel` gives the capitalised form ("Scrap"). */
export function currencyOf(raceId: string): string {
  return raceById(raceId).currency;
}

export function currencyLabel(raceId: string): string {
  const c = currencyOf(raceId);
  return c.charAt(0).toUpperCase() + c.slice(1);
}

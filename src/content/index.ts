// Extra Terram — src/content/index.ts v0.5.0 — matchups (strong/weak against which race) and race currencies
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

export const CONTENT_VERSION: string = racesJson.content_version;

export const content: ContentPack = {
  version: CONTENT_VERSION,
  races: racesJson.races as RaceDef[],
  towers: towersJson.towers as TowerDef[],
  creeps: creepsJson.creeps as CreepDef[],
  damage: damageJson as DamageMatrix,
};

const mapList = [mapRootkinForest01, mapAssemblyScrap01, mapChitinHive01, mapLumenariCrystal01] as MapDef[];
const waveList = [wavesRootkinForest01, wavesAssemblyScrap01, wavesChitinHive01, wavesLumenariCrystal01] as WaveScript[];

export const maps: Record<string, MapDef> = Object.fromEntries(mapList.map((m) => [m.id, m]));
export const waveScripts: Record<string, WaveScript> = Object.fromEntries(waveList.map((w) => [w.id, w]));

export interface LevelEntry {
  id: string;
  map: MapDef;
  waves: WaveScript;
  /** Race whose creeps attack on this level (from the wave script's first group). */
  enemyRace: string;
}

/** Playable levels in campaign order: one per home world, easy to hard. */
export const levels: LevelEntry[] = waveList.map((w) => {
  const map = maps[w.map];
  const firstCreep = content.creeps.find((c) => c.id === w.waves[0].groups[0].creep);
  return { id: w.id, map, waves: w, enemyRace: firstCreep?.race ?? 'assembly' };
});

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

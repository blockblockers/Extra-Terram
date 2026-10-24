// Extra Terram — src/content/index.ts v0.4.0 — four races, four maps
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

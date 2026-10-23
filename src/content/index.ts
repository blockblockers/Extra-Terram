// Extra Terram — src/content/index.ts v0.1.0 — Phase 1 scaffold
// Assembles the typed ContentPack from the JSON files. The engine never imports JSON itself;
// it is handed a pack, so the same engine runs on the server with content loaded another way.
import type { ContentPack, CreepDef, DamageMatrix, MapDef, RaceDef, TowerDef, WaveScript } from '../engine/types';
import racesJson from './races.json';
import towersJson from './towers.json';
import creepsJson from './creeps.json';
import damageJson from './damage-matrix.json';
import mapRootkinForest01 from './maps/rootkin-forest-01.json';
import wavesRootkinForest01 from './waves/rootkin-forest-01.json';

export const CONTENT_VERSION: string = racesJson.content_version;

export const content: ContentPack = {
  version: CONTENT_VERSION,
  races: racesJson.races as RaceDef[],
  towers: towersJson.towers as TowerDef[],
  creeps: creepsJson.creeps as CreepDef[],
  damage: damageJson as DamageMatrix,
};

export const maps: Record<string, MapDef> = {
  [mapRootkinForest01.id]: mapRootkinForest01 as MapDef,
};

export const waveScripts: Record<string, WaveScript> = {
  [wavesRootkinForest01.id]: wavesRootkinForest01 as WaveScript,
};

export interface LevelEntry {
  id: string;
  map: MapDef;
  waves: WaveScript;
}

/** Playable levels in campaign order. One for Phase 1; Phase 2 adds a set per world and tier. */
export const levels: LevelEntry[] = [{ id: 'rootkin-forest-01', map: maps['rootkin-forest-01'], waves: waveScripts['rootkin-forest-01'] }];

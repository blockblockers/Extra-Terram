// Extra Terram — src/engine/index.ts v0.1.0 — Phase 1 scaffold
// Public surface of the headless engine. UI, renderer and scripts import from here only.
export * from './types';
export { createRng, nextU32, nextFloat, nextInt, fnv1a32, type RngState } from './rng';
export { parseMap, pathLength, cellIndex, type ParsedMap } from './map';
export { createContext, createSim, stepSim, beginWave, simView, towerStats, damageMultiplier, isAnimating, tileAt, towerAt, type TowerStats } from './sim';
export { applyInput, validateInput, replay, sellValue, upgradeCost, type InputResult } from './inputs';
export { serialize, deserialize, cloneState, hashState } from './snapshot';

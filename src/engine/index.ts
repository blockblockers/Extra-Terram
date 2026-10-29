// Extra Terram — src/engine/index.ts v0.7.0 — versus boards: sides, live slots, placements
// Public surface of the headless engine. UI, renderer and scripts import from here only.
export * from './types';
export { createRng, nextU32, nextFloat, nextInt, fnv1a32, type RngState } from './rng';
export { parseMap, parseZones, pathLength, cellIndex, sharedPrefix, type ParsedMap } from './map';
export { createContext, createSim, stepSim, beginWave, simView, towerStats, buffFor, NO_BUFF, damageMultiplier, isAnimating, tileAt, towerAt, levelScaling, waveMultipliers, passiveFor, passiveMods, effectiveStats, towerCost, sendCost, sendIncomeFor, sendableCreeps, sendAllowed, wallet, mergeEffects, runRules, isStandardRun, waveAt, hasBoss, bossFor, bossScale, bossBountyScale, roundScoreMult, endlessGrowth, liveSlots, liveSides, sideOf, rankSides, previewNextWave, waveCountMult, rampShare, type TowerStats, type Buff, type PassiveMods, type ScalingState } from './sim';
export { applyInput, validateInput, replay, sellValue, upgradeCost, reinforceCost, type InputResult } from './inputs';
export { serialize, deserialize, cloneState, hashState } from './snapshot';

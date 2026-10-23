// Extra Terram — src/engine/snapshot.ts v0.1.0 — Phase 1 scaffold
// Snapshot = the whole sim as JSON (rejoin, resync, suspended-run saves).
// Hash = a cheap fingerprint of that JSON (desync detection in shared-board modes).
import { fnv1a32 } from './rng';
import type { SimState } from './types';

export function serialize(state: SimState): string {
  return JSON.stringify(state);
}

export function deserialize(json: string): SimState {
  const state = JSON.parse(json) as SimState;
  if (typeof state.tick !== 'number' || !Array.isArray(state.creeps)) throw new Error('Not a sim snapshot.');
  return state;
}

/** Deep copy through JSON; the sim is plain data, so this is exact. */
export function cloneState(state: SimState): SimState {
  return JSON.parse(JSON.stringify(state)) as SimState;
}

/**
 * 32-bit fingerprint of the state. The input log is excluded so two clients that received the
 * same inputs in a different order (impossible under lockstep, but cheap to guard) still compare
 * the board itself. Hex-formatted for logs and comparisons.
 */
export function hashState(state: SimState): string {
  const { inputLog, ...board } = state;
  void inputLog;
  return fnv1a32(JSON.stringify(board)).toString(16).padStart(8, '0');
}

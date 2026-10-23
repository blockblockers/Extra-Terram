// Extra Terram — src/net/index.ts v0.1.0 — Phase 1 scaffold
// Phase 3 (accounts, run_results, leaderboards) and Phase 4 (matches over Supabase Realtime
// Broadcast) land here. Nothing in Phase 1 touches the network; single-player is offline-first.
//
// Planned shape, so the engine and UI don't have to change when it arrives:
//   submitRun(seed, mapId, result, inputLog)      -> SECURITY DEFINER RPC `submit_run`
//   findMatch(mode, players) / joinMatch(code)    -> RPCs creating `matches` + `match_players`
//   MatchChannel: Broadcast + Presence on `match:<id>`; events for mirrored boards, the host's
//   ordered input frames for a shared board (see the design doc, §6).

export const NET_PHASE = 'offline-only (Phase 1)';

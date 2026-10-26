// Extra Terram — scripts/lockstep-smoke.ts v0.1.0 — the shared-board protocol over an in-memory channel
//   1. host and client stay in step through inputs from both seats,
//   2. a client input the host refuses comes back as a reject,
//   3. a lost frame makes the client ask for a snapshot and resync, then keep in step,
//   4. a hash mismatch (a tampered client board) is caught by the host and resynced.
// Run with: npm run sim:lockstep
import { content, levels, towersForRace } from '../src/content';
import { createContext, createSim, hashState, stepSim, tileAt, TILE, type SimState } from '../src/engine';
import type { MatchChannelLike, MatchEvent, SeatPresence } from '../src/net/match';
import { FRAME_TICKS, HASH_EVERY, Lockstep, type SimHolder } from '../src/app/lockstep';

let failures = 0;
function check(cond: boolean, what: string): void {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures++;
}

/** Two ends of one wire. Messages are delivered when `flush()` runs, so the test controls timing and can drop one. */
class Wire {
  queue: Array<{ to: FakeChannel; from: string; event: MatchEvent }> = [];
  drop: ((e: MatchEvent) => boolean) | null = null;
  dropped = 0;
  flush(): void {
    const batch = this.queue;
    this.queue = [];
    for (const m of batch) {
      if (this.drop && this.drop(m.event)) {
        this.dropped++;
        continue;
      }
      m.to.deliver(m.event, m.from);
    }
  }
}

class FakeChannel implements MatchChannelLike {
  readonly matchId = 'm';
  peers: FakeChannel[] = [];
  private handlers = new Set<(e: MatchEvent, from: string) => void>();
  constructor(
    readonly userId: string,
    private wire: Wire,
  ) {}
  async open(): Promise<void> {}
  on(handler: (e: MatchEvent, from: string) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
  onPresence(): () => void {
    return () => undefined;
  }
  presence(): SeatPresence[] {
    return [];
  }
  send(event: MatchEvent): void {
    for (const p of this.peers) this.wire.queue.push({ to: p, from: this.userId, event });
  }
  deliver(event: MatchEvent, from: string): void {
    for (const h of this.handlers) h(event, from);
  }
  async update(): Promise<void> {}
  async close(): Promise<void> {}
}

const level = levels[0];
const ctx = createContext(content, level.map, level.waves);
const starter = towersForRace('rootkin')[0];
function pads(state: SimState, n: number): Array<{ col: number; row: number }> {
  const out: Array<{ col: number; row: number }> = [];
  for (let row = 0; row < state.rows && out.length < n; row++) for (let col = 0; col < state.cols && out.length < n; col++) if (tileAt(state, col, row) === TILE.pad) out.push({ col, row });
  return out;
}

function setup() {
  const wire = new Wire();
  const chA = new FakeChannel('A', wire);
  const chB = new FakeChannel('B', wire);
  chA.peers = [chB];
  chB.peers = [chA];
  const opts = { seats: 2, party: 2, coop: true };
  const host: SimHolder = { state: createSim(ctx, 'lock', opts), ctx };
  const client: SimHolder = { state: createSim(ctx, 'lock', opts), ctx };
  const rejects: string[] = [];
  let resyncs = 0;
  const lockA = new Lockstep(host, chA, { seat: 0, userId: 'A' }, true, { onReject: (r) => rejects.push(`host:${r}`), onResync: () => undefined });
  const lockB = new Lockstep(client, chB, { seat: 1, userId: 'B' }, false, { onReject: (r) => rejects.push(`client:${r}`), onResync: () => resyncs++ });
  let now = 0;
  /** One "animation frame": the host steps `n` ticks, the wire flushes, the client steps what it may. */
  const frame = (n = FRAME_TICKS) => {
    for (let i = 0; i < n; i++) {
      lockA.beforeStep();
      stepSim(host.state, ctx);
    }
    wire.flush();
    now += 50 * n;
    let stepped = 0;
    for (let i = 0; i < n * 3; i++) {
      if (!lockB.canStep(now)) break;
      lockB.beforeStep();
      stepSim(client.state, ctx);
      stepped++;
    }
    wire.flush();
    return stepped;
  };
  return { wire, host, client, lockA, lockB, frame, rejects, resyncs: () => resyncs, now: () => now };
}

// ---------------------------------------------------------------- 1. in step
{
  const t = setup();
  const p = pads(t.host.state, 3);
  t.lockA.submit({ type: 'place', tower: starter.id, col: p[0].col, row: p[0].row });
  t.lockB.submit({ type: 'place', tower: starter.id, col: p[1].col, row: p[1].row });
  for (let i = 0; i < 4; i++) t.frame();
  check(t.host.state.towers.length === 2 && t.client.state.towers.length === 2, 'both boards hold both towers');
  check(t.host.state.towers[1].owner === 1 && t.client.state.towers[1].owner === 1, 'the client’s tower is owned by seat 1 on both boards');
  t.lockB.submit({ type: 'start-wave' });
  for (let i = 0; i < 60; i++) t.frame();
  check(t.client.state.tick === t.host.state.tick && hashState(t.client.state) === hashState(t.host.state), `in step through a wave (tick ${t.host.state.tick}, same hash)`);
  check(t.rejects.length === 0, 'no rejects');
}

// ---------------------------------------------------------------- 2. rejects
{
  const t = setup();
  const p = pads(t.host.state, 1);
  t.lockA.submit({ type: 'place', tower: starter.id, col: p[0].col, row: p[0].row });
  t.lockB.submit({ type: 'place', tower: starter.id, col: p[0].col, row: p[0].row }); // same pad: the host wins the tie
  for (let i = 0; i < 3; i++) t.frame();
  check(t.host.state.towers.length === 1 && t.client.state.towers.length === 1, 'one tower on the contested pad');
  check(t.rejects.some((r) => r.startsWith('client:') && /taken/.test(r)), `client told why: ${t.rejects.join(' / ')}`);
}

// ---------------------------------------------------------------- 3. a lost frame
{
  const t = setup();
  const p = pads(t.host.state, 2);
  t.lockA.submit({ type: 'place', tower: starter.id, col: p[0].col, row: p[0].row });
  t.frame();
  t.frame();
  let dropOne = true;
  t.wire.drop = (e) => {
    if (e.type === 'frame' && dropOne) {
      dropOne = false;
      return true;
    }
    return false;
  };
  const stepped = t.frame(); // this frame's inputs never arrive
  t.frame(); // the next one does: a gap
  check(t.wire.dropped === 1 && t.client.state.tick < t.host.state.tick, `client stalls after a lost frame (stepped ${stepped}, client ${t.client.state.tick} vs host ${t.host.state.tick})`);
  // the client asks for a snapshot (rate-limited), the host answers at its next boundary
  for (let i = 0; i < 4; i++) t.frame();
  check(t.resyncs() === 1, 'client resynced from a host snapshot');
  t.lockB.submit({ type: 'place', tower: starter.id, col: p[1].col, row: p[1].row });
  for (let i = 0; i < 6; i++) t.frame();
  check(t.client.state.tick === t.host.state.tick && hashState(t.client.state) === hashState(t.host.state) && t.client.state.towers.length === 2, `back in step after the resync (tick ${t.host.state.tick}, 2 towers, same hash)`);
}

// ---------------------------------------------------------------- 4. a tampered board
{
  const t = setup();
  for (let i = 0; i < 2; i++) t.frame();
  t.client.state.wallets[1] += 1; // the client's board drifts
  const before = t.resyncs();
  for (let i = 0; i < Math.ceil(HASH_EVERY / FRAME_TICKS) + 3; i++) t.frame();
  check(t.resyncs() === before + 1, 'host caught the hash mismatch and sent a snapshot');
  for (let i = 0; i < 4; i++) t.frame();
  check(hashState(t.client.state) === hashState(t.host.state) && t.client.state.wallets[1] === t.host.state.wallets[1], 'boards agree again');
}

console.log(failures === 0 ? '\nLOCKSTEP SMOKE PASSED' : `\nLOCKSTEP SMOKE FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);

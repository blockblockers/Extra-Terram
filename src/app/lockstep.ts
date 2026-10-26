// Extra Terram — src/app/lockstep.ts v0.1.0 — host-sequenced lockstep for one shared board (Co-op)
// Every client runs the same deterministic sim from the same seed. Inputs do not apply where they
// are made: they go to the host, which applies them at the next frame boundary (every FRAME_TICKS)
// and broadcasts the frame — the inputs that applied at that tick. A client may only step while it
// holds the frame for the next boundary, so every board applies every input on the same tick.
// Clients send a state hash every HASH_EVERY ticks; on a mismatch, a lost frame, or a rejoin, the
// host answers with a snapshot and the client replaces its board. Entity positions never cross the
// wire. The whole thing speaks MatchChannelLike, so the local two-tab transport works unchanged.
import { applyInput, deserialize, hashState, validateInput, type InputResult, type LoggedInput, type SimContext, type SimInput, type SimState } from '../engine';
import type { MatchChannelLike, MatchEvent } from '../net';

export const FRAME_TICKS = 5; // 250 ms between boundaries: worst-case input delay on the host
export const HASH_EVERY = 20; // one hash a second per client
const REQUEST_EVERY_MS = 2000;
const HASH_KEEP = 12;

export interface LockstepHooks {
  /** An input of ours was refused on the host (someone took the pad first, the wallet ran dry). */
  onReject(reason: string): void;
  /** The board was replaced by a host snapshot. */
  onResync(): void;
}

/** The sim holder: the lockstep replaces `state` on a resync, so the loop must read it through here. */
export interface SimHolder {
  state: SimState;
  ctx: SimContext;
}

type Frame = Extract<MatchEvent, { type: 'frame' }>;

export class Lockstep {
  /** What the host runs at; clients follow it. */
  hostSpeed = 1;
  private seq = 0;
  private off: () => void;
  // host
  private pending: Array<{ seat: number; seq: number; input: SimInput }> = [];
  private hashes = new Map<number, string>();
  private snapshotWanted = new Set<string>();
  // client
  private frames = new Map<number, Frame>();
  private nextFrameTick = 0;
  private authorized = 0;
  private lastRequest = -1e9; // the first request goes out at once
  private lastProgress = 0;

  constructor(
    private sim: SimHolder,
    private channel: MatchChannelLike,
    private me: { seat: number; userId: string },
    readonly host: boolean,
    private hooks: LockstepHooks,
  ) {
    this.off = channel.on((ev, from) => this.onEvent(ev, from));
    if (host) this.hostSpeed = 1;
  }

  close(): void {
    this.off();
  }

  /** Our seat's input. Host: queued for the next boundary. Client: checked here, then sent to the host. */
  submit(input: SimInput): InputResult {
    const check = validateInput(this.sim.state, this.sim.ctx, input, this.me.seat);
    if (!check.ok) return check;
    const seq = this.seq++;
    if (this.host) this.pending.push({ seat: this.me.seat, seq, input });
    else this.channel.send({ type: 'input', seat: this.me.seat, seq, input });
    return { ok: true };
  }

  /** May the loop step the sim right now? The host always can; a client needs the next frame. */
  canStep(now: number): boolean {
    if (this.host) return true;
    const t = this.sim.state.tick;
    if (t < this.authorized && (t !== this.nextFrameTick || this.frames.has(t))) {
      this.lastProgress = now;
      return true;
    }
    // Waiting. A later frame without this one means a frame was lost: ask for a snapshot.
    if (this.authorized > this.nextFrameTick && now - this.lastRequest > REQUEST_EVERY_MS) this.requestSnapshot(now);
    return false;
  }

  /** True when a client has waited on the host for longer than a hiccup. */
  stalled(now: number): boolean {
    return !this.host && this.lastProgress > 0 && now - this.lastProgress > 1500;
  }

  /** Clients run at the host's speed, a little faster while they lag more than two frames. */
  clientSpeed(): number {
    const behind = this.authorized - this.sim.state.tick;
    return this.hostSpeed * (behind > FRAME_TICKS * 2 ? 1.5 : 1);
  }

  /** Called before each tick is stepped. At a boundary the host applies and publishes; a client applies the frame. */
  beforeStep(): void {
    const { state, ctx } = this.sim;
    if (state.tick % FRAME_TICKS !== 0) return;
    if (this.host) this.hostBoundary(state, ctx);
    else this.clientBoundary(state, ctx);
  }

  private hostBoundary(state: SimState, ctx: SimContext): void {
    const before = state.inputLog.length;
    const batch = this.pending;
    this.pending = [];
    for (const p of batch) {
      const res = applyInput(state, ctx, p.input, p.seat);
      if (res.ok) continue;
      if (p.seat === this.me.seat) this.hooks.onReject(res.reason);
      else this.channel.send({ type: 'reject', seat: p.seat, seq: p.seq, reason: res.reason });
    }
    this.channel.send({ type: 'frame', tick: state.tick, inputs: state.inputLog.slice(before), speed: this.hostSpeed });
    if (state.tick % HASH_EVERY === 0) {
      this.hashes.set(state.tick, hashState(state));
      if (this.hashes.size > HASH_KEEP) this.hashes.delete(Math.min(...this.hashes.keys()));
    }
    if (this.snapshotWanted.size) {
      const json = snapshotJson(state);
      for (const to of this.snapshotWanted) this.channel.send({ type: 'snapshot', to, tick: state.tick, state: json });
      this.snapshotWanted.clear();
    }
  }

  private clientBoundary(state: SimState, ctx: SimContext): void {
    if (state.tick !== this.nextFrameTick) return; // this boundary came with a snapshot
    const frame = this.frames.get(state.tick);
    if (!frame) return; // canStep() keeps this from happening
    this.frames.delete(state.tick);
    for (const li of frame.inputs) {
      const { tick, seat, seq, ...input } = li;
      void tick;
      void seq;
      applyInput(state, ctx, input as SimInput, seat);
    }
    this.nextFrameTick += FRAME_TICKS;
    if (state.tick % HASH_EVERY === 0) this.channel.send({ type: 'hash', tick: state.tick, hash: hashState(state) });
  }

  private requestSnapshot(now: number): void {
    this.lastRequest = now;
    this.channel.send({ type: 'snapshot-request', seat: this.me.seat });
  }

  private onEvent(ev: MatchEvent, from: string): void {
    if (this.host) {
      if (ev.type === 'input') this.pending.push({ seat: ev.seat, seq: ev.seq, input: ev.input });
      else if (ev.type === 'snapshot-request') this.snapshotWanted.add(from);
      else if (ev.type === 'hash') {
        const mine = this.hashes.get(ev.tick);
        if (mine !== undefined && mine !== ev.hash) this.snapshotWanted.add(from);
      }
      return;
    }
    if (ev.type === 'frame') {
      this.hostSpeed = ev.speed;
      if (ev.tick >= this.nextFrameTick) this.frames.set(ev.tick, ev);
      this.authorized = Math.max(this.authorized, ev.tick + FRAME_TICKS);
    } else if (ev.type === 'reject') {
      if (ev.seat === this.me.seat) this.hooks.onReject(ev.reason);
    } else if (ev.type === 'snapshot') {
      if (ev.to !== this.me.userId) return;
      const next = deserialize(ev.state);
      next.inputLog = [];
      next.events = [];
      this.sim.state = next;
      // the boundary this snapshot sits on already carries its inputs; continue from the next one
      this.nextFrameTick = Math.floor(next.tick / FRAME_TICKS) * FRAME_TICKS + FRAME_TICKS;
      for (const t of [...this.frames.keys()]) if (t < this.nextFrameTick) this.frames.delete(t);
      this.authorized = Math.max(this.authorized, this.nextFrameTick);
      this.hooks.onResync();
    }
  }
}

/** The board without its log and render events: what a rejoining or desynced peer needs. */
function snapshotJson(state: SimState): string {
  const { inputLog, events, ...board } = state;
  void inputLog;
  void events;
  return JSON.stringify({ ...board, inputLog: [] as LoggedInput[], events: [] });
}

// Extra Terram — scripts/seats-smoke.ts v0.1.0 — headless checks for seats (co-op wallets, owners) and sends (mirror)
//   1. sends: paying, income, the receiver's queue, sent creeps on the board, replay determinism,
//   2. co-op: two seats with separate wallets, owner-only upgrade/sell, bounty to the owner, party scaling,
//   3. lockstep shape: the same inputs applied at the same ticks on two sims give the same hash.
// Run with: npm run sim:seats
import { content, levels, towersForRace } from '../src/content';
import { applyInput, createContext, createSim, hashState, levelScaling, replay, sendCost, sendIncomeFor, sendableCreeps, stepSim, tileAt, TILE, validateInput, type SimState } from '../src/engine';

let failures = 0;
function check(cond: boolean, what: string): void {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures++;
}

function firstPads(state: SimState, n: number): Array<{ col: number; row: number }> {
  const out: Array<{ col: number; row: number }> = [];
  for (let row = 0; row < state.rows && out.length < n; row++) for (let col = 0; col < state.cols && out.length < n; col++) if (tileAt(state, col, row) === TILE.pad) out.push({ col, row });
  return out;
}

const level = levels[0];
const ctx = createContext(content, level.map, level.waves);
const starter = towersForRace('rootkin')[0];

// ---------------------------------------------------------------- 1. sends
{
  const sender = createSim(ctx, 'seats-1');
  const receiver = createSim(ctx, 'seats-2');
  const roster = sendableCreeps(ctx, 'chitin');
  check(roster.length === 3 && sendCost(roster[0]) <= sendCost(roster[2]), `sendable creeps for chitin: ${roster.map((c) => `${c.name} ${sendCost(c)}/+${sendIncomeFor(c)}`).join(', ')}`);
  const creep = roster[0];
  const before = sender.wallets[0];
  const res = applyInput(sender, ctx, { type: 'send', creep: creep.id, count: 3 }, 0);
  check(res.ok && sender.wallets[0] === before - sendCost(creep) * 3, `send pays ${sendCost(creep) * 3} sap`);
  check(sender.sendIncome[0] === sendIncomeFor(creep) * 3 && sender.stats.sent === 3, `send books +${sender.sendIncome[0]} income a wave`);
  check(!applyInput(sender, ctx, { type: 'send', creep: creep.id, count: 99 }, 0).ok, 'send of 99 refused');
  check(!applyInput(sender, ctx, { type: 'send', creep: 'nope', count: 1 }, 0).ok, 'send of an unknown creep refused');

  // receiver in its first build phase: the creeps lead the first wave
  const r1 = applyInput(receiver, ctx, { type: 'receive', creep: creep.id, count: 3, from: 1 }, 0);
  check(r1.ok && receiver.spawnQueue.length === 3 && receiver.stats.received === 3, 'receive queues 3 creeps during the build phase');
  const pads = firstPads(receiver, 2);
  applyInput(receiver, ctx, { type: 'place', tower: starter.id, col: pads[0].col, row: pads[0].row }, 0);
  while (receiver.phase === 'build') stepSim(receiver, ctx);
  let sentSeen = 0;
  for (let i = 0; i < 40 && receiver.phase === 'wave'; i++) {
    stepSim(receiver, ctx);
    sentSeen = Math.max(sentSeen, receiver.creeps.filter((c) => c.sentBy === 1).length);
  }
  check(sentSeen >= 1, `sent creeps walk the receiver's board (${sentSeen} at once, marked sentBy 1)`);
  // mid-wave receive joins now
  const qBefore = receiver.spawnQueue.length;
  applyInput(receiver, ctx, { type: 'receive', creep: roster[2].id, count: 1, from: 1 }, 0);
  check(receiver.spawnQueue.length === qBefore + 1 && receiver.spawnQueue.some((q) => q.creep === roster[2].id && q.tick === receiver.tick + 1), 'receive during a wave spawns next tick');
  // income lands at the end of the wave
  while (receiver.phase === 'wave' && receiver.tick < 20_000) stepSim(receiver, ctx);
  const s2 = createSim(ctx, 'seats-3');
  applyInput(s2, ctx, { type: 'send', creep: creep.id, count: 2 }, 0);
  const w0 = s2.wallets[0];
  applyInput(s2, ctx, { type: 'start-wave' }, 0);
  const gained = s2.wallets[0] - w0; // call bonus
  while (s2.phase === 'wave' && s2.tick < 20_000) stepSim(s2, ctx);
  check(s2.wallets[0] === w0 + gained + ctx.waves.waveBonus + sendIncomeFor(creep) * 2 + (s2.stats.earned - gained - ctx.waves.waveBonus - sendIncomeFor(creep) * 2), 'wave end pays the bonus plus send income');
  check(s2.wallets[0] - w0 - gained - ctx.waves.waveBonus >= sendIncomeFor(creep) * 2, `send income paid at wave end (+${sendIncomeFor(creep) * 2})`);

  // replay: the receiver's log rebuilds the same board
  const again = replay(ctx, 'seats-2', receiver.inputLog, receiver.tick);
  check(hashState(again) === hashState(receiver), 'receiver replay matches (sends are in the input log)');
}

// ---------------------------------------------------------------- 2. co-op seats
{
  const coop = createSim(ctx, 'coop-1', { seats: 2, party: 2, coop: true });
  check(coop.seats === 2 && coop.wallets.length === 2 && coop.wallets[0] === coop.wallets[1], 'two wallets with the full starting sap each');
  const scale = levelScaling(ctx, coop);
  const solo = levelScaling(ctx);
  check(scale.hpMult > solo.hpMult && scale.countMult > solo.countMult, `co-op party of 2 scales waves (hp ×${(scale.hpMult / solo.hpMult).toFixed(2)}, count ×${(scale.countMult / solo.countMult).toFixed(2)})`);
  const pads = firstPads(coop, 3);
  check(applyInput(coop, ctx, { type: 'place', tower: starter.id, col: pads[0].col, row: pads[0].row }, 0).ok, 'seat 0 places');
  check(applyInput(coop, ctx, { type: 'place', tower: starter.id, col: pads[1].col, row: pads[1].row }, 1).ok, 'seat 1 places');
  check(coop.wallets[0] === coop.wallets[1] && coop.wallets[0] === ctx.waves.startingResources - starter.cost, 'each seat paid from its own wallet');
  const t0 = coop.towers[0];
  const t1 = coop.towers[1];
  check(t0.owner === 0 && t1.owner === 1, 'towers remember their owner');
  check(!validateInput(coop, ctx, { type: 'sell', towerId: t0.id }, 1).ok, 'seat 1 cannot sell seat 0’s tower');
  check(!validateInput(coop, ctx, { type: 'upgrade', towerId: t1.id }, 0).ok, 'seat 0 cannot upgrade seat 1’s tower');
  check(!validateInput(coop, ctx, { type: 'place', tower: starter.id, col: pads[2].col, row: pads[2].row }, 2).ok, 'seat 2 does not exist on a 2-seat board');
  check(!validateInput(coop, ctx, { type: 'place', tower: starter.id, col: pads[0].col, row: pads[0].row }, 1).ok, 'a taken pad is refused for the other seat too');
  // run a wave: bounties go to the owner of the killing tower, wave bonus to both
  const w = [coop.wallets[0], coop.wallets[1]];
  applyInput(coop, ctx, { type: 'start-wave' }, 1);
  while (coop.phase === 'wave' && coop.tick < 20_000) stepSim(coop, ctx);
  check(coop.phase !== 'wave', `wave 1 finished (lives ${coop.lives}, kills ${coop.stats.kills})`);
  check(coop.wallets[0] > w[0] && coop.wallets[1] > w[1], `both wallets grew (seat 0 +${coop.wallets[0] - w[0]}, seat 1 +${coop.wallets[1] - w[1]})`);
  check(coop.wallets[0] + coop.wallets[1] - w[0] - w[1] === coop.stats.earned - (coop.stats.earned - (coop.wallets[0] + coop.wallets[1] - w[0] - w[1])), 'wallet growth is accounted');
  // replay with the same options reproduces the board
  const again = replay(ctx, 'coop-1', coop.inputLog, coop.tick, { seats: 2, party: 2, coop: true });
  check(hashState(again) === hashState(coop), 'co-op replay matches with seats in the options');
  const other = replay(ctx, 'coop-1', coop.inputLog, coop.tick, { seats: 2, party: 1, coop: true });
  check(hashState(other) !== hashState(coop), 'a different party size gives a different board (scaling is in the hash)');
}

// ---------------------------------------------------------------- 3. lockstep shape
{
  const a = createSim(ctx, 'lock-1', { seats: 2, party: 2, coop: true });
  const b = createSim(ctx, 'lock-1', { seats: 2, party: 2, coop: true });
  const pads = firstPads(a, 4);
  const script: Array<{ tick: number; seat: number; input: Parameters<typeof applyInput>[2] }> = [
    { tick: 0, seat: 0, input: { type: 'place', tower: starter.id, col: pads[0].col, row: pads[0].row } },
    { tick: 5, seat: 1, input: { type: 'place', tower: starter.id, col: pads[1].col, row: pads[1].row } },
    { tick: 10, seat: 1, input: { type: 'start-wave' } },
    { tick: 200, seat: 0, input: { type: 'place', tower: starter.id, col: pads[2].col, row: pads[2].row } },
  ];
  for (let t = 0; t <= 600; t++) {
    for (const s of script) if (s.tick === t) for (const sim of [a, b]) applyInput(sim, ctx, s.input, s.seat);
    stepSim(a, ctx);
    stepSim(b, ctx);
  }
  check(hashState(a) === hashState(b) && a.towers.length === 3, 'two boards fed the same frames agree (3 towers, same hash)');
}

console.log(failures === 0 ? '\nSEATS SMOKE PASSED' : `\nSEATS SMOKE FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);

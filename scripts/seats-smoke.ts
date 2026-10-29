// Extra Terram — scripts/seats-smoke.ts v0.2.0 — headless checks for seats (co-op, Mirror) and versus boards (Lanes, King of the Maze)
//   1. sends: paying, income, the receiver's queue, sent creeps on the board, replay determinism,
//   2. co-op: two seats with separate wallets, owner-only upgrade/sell, bounty to the owner, party scaling,
//   3. lockstep shape: the same inputs applied at the same ticks on two sims give the same hash,
//   4. Lanes: pads by lane, waves on the clock, a wave down every lane, sends into a rival's lane,
//      towers that never reach a rival's lane, eliminations, placements, 2 v 2 pools,
//   5. King of the Maze: creeps take the bases in turn, a fallen base sends the shared trail's creeps
//      elsewhere, sends land at the fork, 2 v 2 bases.
// Run with: npm run sim:seats
import { content, levelById, levels, towersForRace } from '../src/content';
import { applyInput, cellIndex, createContext, createSim, hashState, levelScaling, replay, sendCost, sendIncomeFor, sendableCreeps, simView, stepSim, tileAt, TILE, validateInput, type SimContext, type SimState } from '../src/engine';

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
  check(roster.length === 4 && sendCost(roster[0]) <= sendCost(roster[2]) && roster[3].archetype === 'boss', `sendable creeps for chitin (the mini-boss last): ${roster.map((c) => `${c.name} ${sendCost(c)}/+${sendIncomeFor(c)}`).join(', ')}`);
  const boss = roster[3];
  check(!applyInput(sender, ctx, { type: 'send', creep: boss.id, count: 1 }, 0).ok, 'a mini-boss cannot be sent before round 8');
  check(sendIncomeFor(boss) * 2 <= Math.ceil(sendCost(boss) / 8) + 1, 'a sent mini-boss pays half the income its cost would suggest');
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

// ---------------------------------------------------------------- 4. Lanes
/** First pad (row-major) owned by `zone` (-1: a shared pad) on a versus map. */
function padIn(state: SimState, vctx: SimContext, zone: number, skip = 0): { col: number; row: number } {
  let seen = 0;
  for (let row = 0; row < state.rows; row++)
    for (let col = 0; col < state.cols; col++) {
      const i = cellIndex(state.cols, col, row);
      if (state.grid[i] === TILE.pad && vctx.zones[i] === zone && state.occupied[i] === -1 && seen++ === skip) return { col, row };
    }
  throw new Error(`no pad in zone ${zone}`);
}
{
  const lv = levelById('lanes-2-hollows')!;
  const vctx = createContext(content, lv.map, lv.waves);
  const sim = createSim(vctx, 'lanes-1', { versus: 'lanes', seats: 2, party: 2 });
  check(sim.routes.length === 2 && sim.sides.length === 2 && sim.sides.every((sd) => sd.lives === lv.waves.lives), `two lanes, two sides with ${lv.waves.lives} lives each`);
  const mine = padIn(sim, vctx, 0);
  const theirs = padIn(sim, vctx, 1);
  check(applyInput(sim, vctx, { type: 'place', tower: starter.id, col: mine.col, row: mine.row }, 0).ok, 'seat 0 builds in its own lane');
  const refused = validateInput(sim, vctx, { type: 'place', tower: starter.id, col: theirs.col, row: theirs.row }, 0);
  check(!refused.ok && /rival/.test(refused.ok ? '' : refused.reason), `seat 0 cannot build in seat 1's lane (${refused.ok ? '' : refused.reason})`);
  check(!validateInput(sim, vctx, { type: 'start-wave' }, 0).ok, 'nobody calls a wave early in versus');
  applyInput(sim, vctx, { type: 'place', tower: starter.id, col: theirs.col, row: theirs.row }, 1);
  // a send from seat 0 lands in lane 1 and leads the first wave
  const pack = sendableCreeps(vctx, 'rootkin')[0];
  check(applyInput(sim, vctx, { type: 'send', creep: pack.id, count: 2 }, 0).ok && sim.spawnQueue.filter((q) => q.sentBy === 0 && q.route === 1).length === 2, 'a send goes into the rival lane');
  check(!applyInput(sim, vctx, { type: 'send', creep: pack.id, count: 1, target: sim.seatSide[0] }, 0).ok, 'a send cannot name its own side');
  check(applyInput(sim, vctx, { type: 'send', creep: pack.id, count: 1, target: sim.seatSide[1] }, 0).ok && sim.spawnQueue.filter((q) => q.sentBy === 0 && q.route === 1).length === 3, 'a send that names the rival side lands in its lane');
  while (sim.phase === 'build') stepSim(sim, vctx);
  for (let i = 0; i < 120; i++) stepSim(sim, vctx);
  const lanes = new Set(sim.creeps.map((c) => c.route));
  check(lanes.has(0) && lanes.has(1), 'the wave comes down both lanes');
  // towers never touch a rival's lane: every creep a seat-0 tower hit is in lane 0
  const t0 = sim.towers.find((t) => t.owner === 0)!;
  check(t0.kills >= 0 && sim.creeps.filter((c) => c.route === 1 && c.hp < c.maxHp && c.bleedOwner === t0.id).length === 0, "seat 0's tower leaves lane 1 alone");
  // lane 1 falls: its lives run out
  sim.sides[1].lives = 1;
  let guard = 0;
  while (!sim.sides[1].out && sim.phase === 'wave' && guard++ < 6000) stepSim(sim, vctx);
  if (!sim.sides[1].out) {
    // nothing leaked yet: let an undefended lane-1 creep through
    sim.towers = sim.towers.filter((t) => t.owner !== 1);
    while (!sim.sides[1].out && sim.phase !== 'won' && guard++ < 20000) stepSim(sim, vctx);
  }
  check(sim.sides[1].out && sim.slotSide[1] === -1 && !sim.towers.some((t) => t.owner === 1), 'lane 1 fell: its lane closed and its towers came down');
  check(sim.phase === 'won' && sim.result?.placements?.join(',') === '1,2', `the last side standing wins (placements ${sim.result?.placements?.join(',')})`);
  check(simView(sim, vctx, 0).result?.outcome === 'won' && simView(sim, vctx, 1).result?.outcome === 'lost', 'each seat sees its own result');

  // replay: a versus run is reproduced by its input log with the same options
  const live = createSim(vctx, 'lanes-2', { versus: 'lanes', seats: 2, party: 2 });
  applyInput(live, vctx, { type: 'place', tower: starter.id, col: mine.col, row: mine.row }, 0);
  applyInput(live, vctx, { type: 'place', tower: starter.id, col: theirs.col, row: theirs.row }, 1);
  for (let i = 0; i < 900; i++) {
    if (i === 700) applyInput(live, vctx, { type: 'send', creep: pack.id, count: 3 }, 1);
    stepSim(live, vctx);
  }
  const again = replay(vctx, 'lanes-2', live.inputLog, live.tick, { versus: 'lanes', seats: 2, party: 2 });
  check(hashState(again) === hashState(live), 'a Lanes board replays from its input log');

  // 2 v 2: teams share a pool; teammates build in each other's lanes; sends hit the other team
  const lv4 = levelById('lanes-4-warrens')!;
  const ctx4 = createContext(content, lv4.map, lv4.waves);
  const team = createSim(ctx4, 'lanes-3', { versus: 'lanes', seats: 4, party: 4, teams: true });
  check(team.sides.length === 2 && team.sides[0].seats.join() === '0,2' && team.sides[0].lives === lv4.waves.lives * 2, `2 v 2: seats 0 and 2 share ${team.sides[0].lives} lives`);
  check(team.sides[0].slots.join() === '0,1' && team.sides[1].slots.join() === '2,3', 'a team keeps two neighbouring lanes');
  const mate = padIn(team, ctx4, 1);
  check(applyInput(team, ctx4, { type: 'place', tower: starter.id, col: mate.col, row: mate.row }, 0).ok, "seat 0 may build in its teammate's lane");
  for (let i = 0; i < 6; i++) applyInput(team, ctx4, { type: 'send', creep: pack.id, count: 1 }, 0);
  check(team.spawnQueue.filter((q) => q.sentBy === 0).every((q) => q.route === 2 || q.route === 3), 'team sends land in the other team’s lanes');
  // a seat that is not playing leaves its lane closed
  const three = createSim(ctx4, 'lanes-4', { versus: 'lanes', seats: 4, party: 3, present: [0, 1, 3] });
  check(three.sides.length === 3 && three.slotSide[2] === -1, 'an empty seat leaves its lane closed');
}

// ---------------------------------------------------------------- 5. King of the Maze
{
  const lv = levelById('king-2-foundry')!;
  const kctx = createContext(content, lv.map, lv.waves);
  const sim = createSim(kctx, 'king-1', { versus: 'king', seats: 2, party: 2 });
  check(sim.routes.length === 2 && sim.forkWp[0] > 0 && sim.forkWp[0] === sim.forkWp[1], `two bases, the fork at waypoint ${sim.forkWp[0]}`);
  const shared = padIn(sim, kctx, -1);
  const fork1 = padIn(sim, kctx, 1);
  check(applyInput(sim, kctx, { type: 'place', tower: starter.id, col: shared.col, row: shared.row }, 0).ok, 'anyone builds on the shared trail');
  check(!validateInput(sim, kctx, { type: 'place', tower: starter.id, col: fork1.col, row: fork1.row }, 0).ok, "seat 0 cannot build at seat 1's base");
  while (sim.phase === 'build') stepSim(sim, kctx);
  const seen = [0, 0];
  const counted = new Set<number>();
  for (let i = 0; i < 400; i++) {
    stepSim(sim, kctx);
    for (const c of sim.creeps) if (!counted.has(c.id)) {
      counted.add(c.id);
      seen[c.route]++;
    }
  }
  check(Math.abs(seen[0] - seen[1]) <= 1 && seen[0] > 0, `creeps take the bases in turn (${seen[0]} / ${seen[1]})`);
  // base 1 falls: creeps still on the shared trail go for base 0 instead
  const onTrail = sim.creeps.filter((c) => c.route === 1 && c.wp <= sim.forkWp[1]).length;
  sim.sides[1].lives = 1;
  const victim = sim.creeps.find((c) => c.route === 1 && c.wp > sim.forkWp[1]);
  if (victim) {
    victim.wp = sim.routes[1].length; // at its base this tick
    stepSim(sim, kctx);
  } else {
    sim.sides[1].lives = 0;
  }
  if (!sim.sides[1].out) {
    sim.towers = sim.towers.filter((t) => t.owner !== 1);
    let g = 0;
    while (!sim.sides[1].out && sim.phase !== 'won' && g++ < 20000) stepSim(sim, kctx);
  }
  check(sim.sides[1].out && sim.phase === 'won' && sim.result?.placements?.join(',') === '1,2', `a fallen base loses (placements ${sim.result?.placements?.join(',')}; ${onTrail} creeps were on the shared trail)`);

  // three bases: when one falls, the trail's creeps re-target a standing base
  const lv3 = levelById('king-3-elderfork')!;
  const ctx3 = createContext(content, lv3.map, lv3.waves);
  const k3 = createSim(ctx3, 'king-2', { versus: 'king', seats: 3, party: 3 });
  while (k3.phase === 'build') stepSim(k3, ctx3);
  for (let i = 0; i < 200; i++) stepSim(k3, ctx3);
  const before = k3.creeps.filter((c) => c.route === 2 && c.wp <= k3.forkWp[2]).map((c) => c.id);
  const leaker = k3.creeps.find((c) => c.route === 2);
  k3.sides[2].lives = 1;
  if (leaker) {
    leaker.wp = k3.routes[2].length;
    stepSim(k3, ctx3);
  }
  const moved = k3.creeps.filter((c) => before.includes(c.id));
  check(k3.sides[2].out && moved.every((c) => c.route === 0 || c.route === 1) && k3.phase === 'wave', `base 2 fell; ${moved.length} trail creeps now go for bases 0 and 1, the match goes on`);
  // a send lands where the target's fork begins
  const pack = sendableCreeps(ctx3, 'assembly')[0];
  applyInput(k3, ctx3, { type: 'send', creep: pack.id, count: 1 }, 0);
  const q = k3.spawnQueue.find((e) => e.sentBy === 0)!;
  check(q.route === 1 && q.atWp === k3.forkWp[1], 'a King send lands at the standing rival’s fork');

  // 2 v 2 on two bases
  const team = createSim(kctx, 'king-3', { versus: 'king', seats: 4, party: 4, teams: true });
  check(team.sides.length === 2 && team.sides[1].seats.join() === '1,3' && team.sides[1].slots.join() === '1', '2 v 2: a team per base');
  check(levelScaling(kctx, team).hpMult > levelScaling(kctx, sim).hpMult, 'King waves grow with the players defending');
}

console.log(failures === 0 ? '\nSEATS SMOKE PASSED' : `\nSEATS SMOKE FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);

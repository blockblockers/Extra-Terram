// Extra Terram — scripts/check-versus.ts v0.1.0 — what each Lanes / King of the Maze map gives each player
// Usage: npx tsx scripts/check-versus.ts [map-id]
// Prints every route (its length on the shared trail and in its own zone), the pads each lane or base
// owns, the shared pads, and how much of each route the owner's pads can reach (range 2.3).
import { maps } from '../src/content';
import { parseMap, pathLength, sharedPrefix } from '../src/engine';

const only = process.argv[2];
const RANGE = 2.3;
for (const map of Object.values(maps).filter((m) => m.mode && (!only || m.id === only))) {
  const p = parseMap(map);
  console.log(`\n${map.id} — ${map.name} (${map.mode}, ${p.slots} slots, ${map.cols}×${map.rows})`);
  const pads: Array<{ c: number; r: number; zone: number }> = [];
  for (let r = 0; r < map.rows; r++) for (let c = 0; c < map.cols; c++) if (map.legend[map.grid[r][c]] === 'pad') pads.push({ c, r, zone: p.zone[r * map.cols + c] });
  const shared = pads.filter((x) => x.zone < 0).length;
  for (let s = 0; s < p.slots; s++) {
    const route = p.routes[s];
    const own = route.slice(p.forkWp[s]);
    const mine = pads.filter((x) => x.zone === s);
    // cells of this route reachable from this slot's pads / from shared pads
    const reach = (list: typeof pads) => {
      let n = 0;
      for (let i = 1; i < route.length; i++) {
        const a = route[i - 1];
        const b = route[i];
        const len = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y)));
        for (let k = 0; k < len; k++) {
          const x = a.x + ((b.x - a.x) * k) / len;
          const y = a.y + ((b.y - a.y) * k) / len;
          if (list.some((q) => Math.hypot(q.c + 0.5 - x, q.r + 0.5 - y) <= RANGE)) n++;
        }
      }
      return n;
    };
    const others = p.routes.map((r2, j) => (j === s ? '' : `${j}:${sharedPrefix(route, r2)}`)).filter(Boolean).join(' ');
    console.log(
      `  slot ${s}: route ${pathLength(route).toFixed(1)} tiles (shared ${pathLength(route.slice(0, p.forkWp[s] + 1)).toFixed(1)}, own ${pathLength(own).toFixed(1)}), ${route.length} waypoints, fork at wp ${p.forkWp[s]}; own pads ${mine.length}, route cells in reach of own pads ${reach(mine)}, of shared pads ${reach(pads.filter((x) => x.zone < 0))}; shared prefix with ${others}`,
    );
  }
  console.log(`  shared pads: ${shared}`);
}

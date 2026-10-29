// Extra Terram — src/engine/map.ts v0.2.0 — routes: one per lane (Lanes) or per base (King of the Maze), plus pad zones
// Turns a painted tile grid into the engine's grid plus waypoint routes.
// Mazes are fixed, so routes are derived once here (breadth-first search over the walkable tiles)
// and never recomputed during play. The map author paints tiles; nobody types coordinates.
//
// Solo maps have one spawn, one exit, one route. Versus maps add a `zones` layer (same size as the
// grid): a digit marks a cell as belonging to that lane or base, '.' is shared.
//   lanes  each lane is its own spawn → exit trail, all cells carrying the lane's digit.
//   king   one spawn; a shared trail ('.') forks toward one exit per base; each fork carries its
//          base's digit. Route n is spawn → base n. Every route keeps its fork points as waypoints, so
//          all routes share an identical prefix along the shared trail (creeps can switch base there).
import { TILE, type MapDef, type Point, type TileKind } from './types';

export interface ParsedMap {
  cols: number;
  rows: number;
  grid: TileKind[];
  spawn: Point;
  exit: Point;
  /** Route 0 (the only route on a solo map). */
  waypoints: Point[];
  /** One route per slot: lane n, or the way to base n. */
  routes: Point[][];
  /** Per route: index of its first waypoint inside its own zone (where King sends land); 0 on lanes and solo maps. */
  forkWp: number[];
  /** Per cell: the slot (lane or base) it belongs to, -1 for shared cells. */
  zone: number[];
  /** Lanes or bases (1 on a solo map). */
  slots: number;
}

export const cellIndex = (cols: number, col: number, row: number): number => row * cols + col;

/** Per-cell zone digits from a map's `zones` layer (-1 everywhere when it has none). */
export function parseZones(map: MapDef): number[] {
  const zone = new Array<number>(map.cols * map.rows).fill(-1);
  if (!map.zones) return zone;
  if (map.zones.length !== map.rows) throw new Error(`map ${map.id}: zones has ${map.zones.length} rows, expected ${map.rows}`);
  for (let r = 0; r < map.rows; r++) {
    const line = map.zones[r];
    if (line.length !== map.cols) throw new Error(`map ${map.id}: zones row ${r} has ${line.length} columns, expected ${map.cols}`);
    for (let c = 0; c < map.cols; c++) {
      const ch = line[c];
      if (ch >= '0' && ch <= '9') zone[cellIndex(map.cols, c, r)] = ch.charCodeAt(0) - 48;
    }
  }
  return zone;
}

export function parseMap(map: MapDef): ParsedMap {
  const { cols, rows } = map;
  if (map.grid.length !== rows) throw new Error(`map ${map.id}: grid has ${map.grid.length} rows, expected ${rows}`);
  const grid: TileKind[] = new Array(cols * rows).fill(TILE.scenery);
  const spawns: Point[] = [];
  const exits: Point[] = [];

  for (let r = 0; r < rows; r++) {
    const line = map.grid[r];
    if (line.length !== cols) throw new Error(`map ${map.id}: row ${r} has ${line.length} columns, expected ${cols}`);
    for (let c = 0; c < cols; c++) {
      const kindName = map.legend[line[c]];
      if (!kindName) throw new Error(`map ${map.id}: row ${r}, col ${c}: '${line[c]}' is not in the legend`);
      const kind = TILE[kindName];
      grid[cellIndex(cols, c, r)] = kind;
      if (kind === TILE.spawn) spawns.push({ x: c, y: r });
      if (kind === TILE.exit) exits.push({ x: c, y: r });
    }
  }
  const zone = parseZones(map);
  const zoneAt = (p: Point) => zone[cellIndex(cols, p.x, p.y)];

  if (!map.mode) {
    if (spawns.length !== 1 || exits.length !== 1) throw new Error(`map ${map.id}: needs one spawn and one exit`);
    const cells = bfsPath(grid, cols, rows, spawns[0], exits[0], () => true);
    if (!cells) throw new Error(`map ${map.id}: no path from spawn to exit`);
    const waypoints = compress(cells, new Set());
    return { cols, rows, grid, spawn: spawns[0], exit: exits[0], waypoints, routes: [waypoints], forkWp: [0], zone, slots: 1 };
  }

  const slots = map.slots ?? 0;
  if (slots < 1) throw new Error(`map ${map.id}: a ${map.mode} map needs "slots"`);
  const routes: Point[][] = [];
  const forkWp: number[] = [];
  for (let s = 0; s < slots; s++) {
    const exit = exits.find((p) => zoneAt(p) === s);
    if (!exit) throw new Error(`map ${map.id}: no exit in zone ${s}`);
    let spawn: Point | undefined;
    let allowed: (i: number) => boolean;
    if (map.mode === 'lanes') {
      spawn = spawns.find((p) => zoneAt(p) === s);
      allowed = (i) => zone[i] === s;
    } else {
      spawn = spawns.find((p) => zoneAt(p) === -1);
      allowed = (i) => zone[i] === -1 || zone[i] === s;
    }
    if (!spawn) throw new Error(`map ${map.id}: no spawn for slot ${s}`);
    const cells = bfsPath(grid, cols, rows, spawn, exit, allowed);
    if (!cells) throw new Error(`map ${map.id}: no path to the exit of slot ${s}`);
    // keep fork points and the first cell of the route's own zone as waypoints, so routes line up
    const keep = new Set<number>();
    let first = -1;
    cells.forEach((p, i) => {
      if (degree(grid, cols, rows, p) >= 3) keep.add(i);
      if (first < 0 && zoneAt(p) === s) {
        first = i;
        keep.add(i);
      }
    });
    const route = compress(cells, keep);
    routes.push(route);
    forkWp.push(map.mode === 'king' ? Math.max(0, route.findIndex((w) => zoneAt({ x: Math.floor(w.x), y: Math.floor(w.y) }) === s)) : 0);
  }
  return { cols, rows, grid, spawn: spawns[0], exit: exits[0], waypoints: routes[0], routes, forkWp, zone, slots };
}

const walkable = (k: TileKind): boolean => k === TILE.path || k === TILE.spawn || k === TILE.exit;

/** Walkable neighbours of a walkable cell (a fork point has three or more). */
function degree(grid: TileKind[], cols: number, rows: number, p: Point): number {
  let n = 0;
  for (const [dc, dr] of [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ]) {
    const c = p.x + dc;
    const r = p.y + dr;
    if (c >= 0 && r >= 0 && c < cols && r < rows && walkable(grid[cellIndex(cols, c, r)])) n++;
  }
  return n;
}

/** Shortest cell path over walkable tiles that `allowed` admits, 4-neighbourhood, deterministic neighbour order. */
function bfsPath(grid: TileKind[], cols: number, rows: number, from: Point, to: Point, allowed: (i: number) => boolean): Point[] | null {
  const start = cellIndex(cols, from.x, from.y);
  const goal = cellIndex(cols, to.x, to.y);
  const prev = new Int32Array(cols * rows).fill(-2); // -2 unvisited, -1 start
  prev[start] = -1;
  const queue: number[] = [start];
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    if (cur === goal) break;
    const c = cur % cols;
    const r = (cur - c) / cols;
    const neighbours = [
      [c, r - 1],
      [c + 1, r],
      [c, r + 1],
      [c - 1, r],
    ];
    for (const [nc, nr] of neighbours) {
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const ni = cellIndex(cols, nc, nr);
      if (prev[ni] !== -2 || !walkable(grid[ni]) || !allowed(ni)) continue;
      prev[ni] = cur;
      queue.push(ni);
    }
  }
  if (prev[goal] === -2) return null;
  const out: Point[] = [];
  for (let i = goal; i !== -1; i = prev[i]) out.push({ x: i % cols, y: Math.floor(i / cols) });
  out.reverse();
  return out;
}

/** Cell centres, dropping the interior points of straight runs (except `keep` indices) so creeps only steer at corners. */
function compress(cells: Point[], keep: Set<number>): Point[] {
  const points = cells.map((p) => ({ x: p.x + 0.5, y: p.y + 0.5 }));
  if (points.length <= 2) return points;
  const out: Point[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const a = out[out.length - 1];
    const b = points[i];
    const c = points[i + 1];
    const collinear = (b.x - a.x) * (c.y - b.y) === (b.y - a.y) * (c.x - b.x);
    if (!collinear || keep.has(i)) out.push(b);
  }
  out.push(points[points.length - 1]);
  return out;
}

/** How many leading waypoints two routes share exactly (King routes share the trail before their forks). */
export function sharedPrefix(a: Point[], b: Point[]): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n].x === b[n].x && a[n].y === b[n].y) n++;
  return n;
}

/** Euclidean length of the waypoint path, in tiles. */
export function pathLength(waypoints: Point[]): number {
  let len = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const dx = waypoints[i].x - waypoints[i - 1].x;
    const dy = waypoints[i].y - waypoints[i - 1].y;
    len += Math.sqrt(dx * dx + dy * dy);
  }
  return len;
}

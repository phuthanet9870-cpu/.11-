// A* pathfinding on the collision grid (8-directional, no corner cutting),
// followed by line-of-sight smoothing for natural click-to-move paths.
import { boxBlocked, isBlockedCell, TILE, type CompiledMap } from './mapCompiler';

interface Node { i: number; g: number; f: number }

class MinHeap {
  private a: Node[] = [];
  get size() { return this.a.length; }
  push(n: Node) {
    const a = this.a;
    a.push(n);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): Node {
    const a = this.a;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/** Finds the nearest walkable cell to (cx,cy) within `radius` cells. */
export function nearestWalkable(map: CompiledMap, cx: number, cy: number, radius = 4): { x: number; y: number } | null {
  if (!isBlockedCell(map, cx, cy)) return { x: cx, y: cy };
  for (let r = 1; r <= radius; r++) {
    let best: { x: number; y: number; d: number } | null = null;
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
      if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r || isBlockedCell(map, x, y)) continue;
      const d = (x - cx) ** 2 + (y - cy) ** 2;
      if (!best || d < best.d) best = { x, y, d };
    }
    if (best) return { x: best.x, y: best.y };
  }
  return null;
}

export function findPath(map: CompiledMap, fromX: number, fromY: number, toX: number, toY: number, maxNodes = 6000): { x: number; y: number }[] | null {
  const W = map.width;
  const sx = Math.floor(fromX / TILE), sy = Math.floor(fromY / TILE);
  const goal = nearestWalkable(map, Math.floor(toX / TILE), Math.floor(toY / TILE));
  if (!goal) return null;
  const start = nearestWalkable(map, sx, sy, 2);
  if (!start) return null;
  const gi = goal.y * W + goal.x, si = start.y * W + start.x;
  if (gi === si) return [{ x: toX, y: toY }];

  const g = new Float32Array(W * map.height).fill(Infinity);
  const came = new Int32Array(W * map.height).fill(-1);
  const closed = new Uint8Array(W * map.height);
  const h = (i: number) => {
    const dx = Math.abs((i % W) - goal.x), dy = Math.abs(Math.floor(i / W) - goal.y);
    return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
  };
  const open = new MinHeap();
  g[si] = 0;
  open.push({ i: si, g: 0, f: h(si) });
  let expanded = 0;
  while (open.size) {
    const cur = open.pop();
    if (closed[cur.i]) continue;
    closed[cur.i] = 1;
    if (cur.i === gi) break;
    if (++expanded > maxNodes) return null;
    const cx = cur.i % W, cy = Math.floor(cur.i / W);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = cx + dx, ny = cy + dy;
      if (isBlockedCell(map, nx, ny)) continue;
      if (dx && dy && (isBlockedCell(map, cx + dx, cy) || isBlockedCell(map, cx, cy + dy))) continue;
      const ni = ny * W + nx;
      if (closed[ni]) continue;
      const ng = cur.g + (dx && dy ? 1.414 : 1);
      if (ng < g[ni]) {
        g[ni] = ng;
        came[ni] = cur.i;
        open.push({ i: ni, g: ng, f: ng + h(ni) });
      }
    }
  }
  if (came[gi] < 0) return null;
  const cells: number[] = [];
  for (let i = gi; i !== si && i >= 0; i = came[i]) cells.push(i);
  cells.reverse();
  const pts = cells.map((i) => ({ x: (i % W) * TILE + TILE / 2, y: Math.floor(i / W) * TILE + TILE / 2 }));
  // Final point: exact click position if walkable, otherwise the goal cell centre.
  const tcx = Math.floor(toX / TILE), tcy = Math.floor(toY / TILE);
  if (tcx === goal.x && tcy === goal.y) pts[pts.length - 1] = { x: toX, y: toY };
  return smoothPath(map, fromX, fromY, pts);
}

export function lineClear(map: CompiledMap, ax: number, ay: number, bx: number, by: number, halfW = 9, halfH = 6): boolean {
  const dist = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(1, Math.ceil(dist / 6));
  for (let s = 1; s <= steps; s++) {
    const x = ax + ((bx - ax) * s) / steps, y = ay + ((by - ay) * s) / steps;
    if (boxBlocked(map, x, y, halfW, halfH)) return false;
  }
  return true;
}

function smoothPath(map: CompiledMap, sx: number, sy: number, pts: { x: number; y: number }[]): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  let ax = sx, ay = sy, i = 0;
  while (i < pts.length) {
    let j = pts.length - 1;
    while (j > i && !lineClear(map, ax, ay, pts[j].x, pts[j].y)) j--;
    out.push(pts[j]);
    ax = pts[j].x; ay = pts[j].y;
    i = j + 1;
  }
  return out;
}

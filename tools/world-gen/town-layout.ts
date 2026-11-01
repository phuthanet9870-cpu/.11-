// Town layouts. Every town gets its own street plan (one of seven plans, never two towns
// with the same one) with random details from the town's seed: where the plaza sits,
// how the streets run, where each building stands, water, hedges, trees. NPCs are then
// placed by what they do: the innkeeper at the inn door, guild masters in front of the
// guild hall, the courier on the plaza, and so on. Deterministic: same seed, same town.

type J = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export type Plan = 'ring' | 'grid' | 'river' | 'diagonal' | 'quarters' | 'harbor' | 'star';
export type Side = 'N' | 'S' | 'E' | 'W';
export interface Exit { side: Side; inner: [number, number] }
export interface Rect { x: number; y: number; w: number; h: number }

export interface TownDesign {
  id: string;
  name: string;
  W: number;
  H: number;
  plan: Plan;
  seed: number;
  base: string;
  road: string;
  trees: string[];
  treeDensity: number;
  /** Tile for the quarter walls of the 'quarters' plan. */
  wallTile?: string;
  exits: Exit[];
  /** Buildings that NPCs use, by role. Placed first, close to the plaza. */
  buildings: { role: string; style: string; sign?: string; w: number; h: number }[];
  houses: number;
  /** Interactive objects to place: kind + id (the map's `objects` entries keep their text). */
  objects: { id: string; kind: string; near: 'plaza' | 'park' | 'gate' | 'road' }[];
  plazaName: string;
}

export interface TownLayout {
  paint: J[];
  spawn: { x: number; y: number };
  /** Where each building's door opens (the walkable cell below it), by role. */
  doors: Record<string, { x: number; y: number }>;
  objects: Record<string, { x: number; y: number }>;
  plaza: Rect;
  placeNpcs(roles: [string, string][]): { npcId: string; x: number; y: number; facing: 'down' }[];
}

function rng(seed: number) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

// Grid cell kinds while laying out.
const FREE = 0, ROAD = 1, BLD = 2, WATER = 3, OBJ = 4, PLAZA = 5, WALL = 6, MARGIN = 7, APRON = 8;
const WALKABLE = new Set([FREE, ROAD, PLAZA, MARGIN, APRON]);
const BORDER = 2; // thicket ring of every town

export function layoutTown(d: TownDesign): TownLayout {
  const { W, H } = d;
  const r = rng(d.seed);
  const ri = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  const grid = new Uint8Array(W * H);
  const at = (x: number, y: number) => grid[y * W + x];
  const inside = (x: number, y: number) => x >= BORDER + 1 && y >= BORDER + 1 && x < W - BORDER - 1 && y < H - BORDER - 1;
  const set = (x: number, y: number, v: number) => { if (x >= 0 && y >= 0 && x < W && y < H) grid[y * W + x] = v; };
  const waterOps: J[] = [], wallOps: J[] = [], roadOps: J[] = [], plazaOps: J[] = [], buildingOps: J[] = [], objectOps: J[] = [], tail: J[] = [];

  // ---------------------------------------------------------------- drawing helpers (same raster as the map compiler)
  const roadCells = (points: [number, number][], width: number, fn: (x: number, y: number) => void) => {
    for (let s = 0; s < points.length - 1; s++) {
      const [ax, ay] = points[s], [bx, by] = points[s + 1];
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 4));
      for (let k = 0; k <= steps; k++) {
        const px = Math.round(ax + ((bx - ax) * k) / steps), py = Math.round(ay + ((by - ay) * k) / steps);
        for (let j = 0; j < width; j++) for (let i = 0; i < width; i++) fn(px + i, py + j);
      }
    }
  };
  const road = (points: [number, number][], width = 2, tile = d.road) => {
    const pts = points.map(([x, y]) => [Math.max(BORDER, Math.min(W - BORDER - width, x)), Math.max(BORDER, Math.min(H - BORDER - width, y))] as [number, number]);
    roadOps.push({ op: 'path', tile, points: pts, width });
    roadCells(pts, width, (x, y) => { if (x >= 0 && y >= 0 && x < W && y < H && at(x, y) !== PLAZA) set(x, y, ROAD); });
  };
  /** L-shaped street (horizontal leg first or vertical first). */
  const lroad = (a: [number, number], b: [number, number], hFirst: boolean, width = 2) =>
    road(hFirst ? [a, [b[0], a[1]], b] : [a, [a[0], b[1]], b], width);
  const water = (x: number, y: number, w: number, h: number) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      if (xx < BORDER || yy < BORDER || xx >= W - BORDER || yy >= H - BORDER) continue;
      set(xx, yy, WATER);
    }
    waterOps.push({ op: 'rect', tile: 'water', x: Math.max(BORDER, x), y: Math.max(BORDER, y), w: Math.min(w, W - BORDER - Math.max(BORDER, x)), h: Math.min(h, H - BORDER - Math.max(BORDER, y)) });
  };
  const wallLine = (x: number, y: number, w: number, h: number) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (at(xx, yy) === FREE) set(xx, yy, WALL);
    wallOps.push({ op: 'rect', tile: d.wallTile ?? 'hedge', layer: 'wall', x, y, w, h });
  };

  // ---------------------------------------------------------------- the plan: plaza and street skeleton
  const cx = Math.floor(W / 2), cy = Math.floor(H / 2);
  let plaza: Rect = { x: 0, y: 0, w: 12, h: 9 };
  const placePlaza = (px: number, py: number, w: number, h: number) => { plaza = { x: px - Math.floor(w / 2), y: py - Math.floor(h / 2), w, h }; };
  const pc = () => [plaza.x + Math.floor(plaza.w / 2), plaza.y + Math.floor(plaza.h / 2)] as [number, number];

  switch (d.plan) {
    case 'ring': {
      // A loop road around the plaza; four spokes; districts outside the loop.
      placePlaza(cx + ri(-6, 6), cy + ri(-4, 4), ri(12, 15), ri(9, 10));
      const [px, py] = pc();
      const rx = ri(17, 22), ry = ri(13, 16);
      const x0 = Math.max(6, px - rx), x1 = Math.min(W - 8, px + rx), y0 = Math.max(6, py - ry), y1 = Math.min(H - 8, py + ry);
      road([[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]);
      road([[px, py], [px, y0]]); road([[px, py], [px, y1]]); road([[px, py], [x0, py]]); road([[px, py], [x1, py]]);
      // A second, outer lane on one random side.
      const s = ri(0, 3);
      if (s === 0) road([[x0, y0 - 1], [x0 - 4, 5]]); else if (s === 1) road([[x1, y1], [W - 6, H - 7]]); else if (s === 2) road([[x0, y1], [5, H - 7]]); else road([[x1, y0], [W - 7, 5]]);
      break;
    }
    case 'grid': {
      // Straight streets every 14–19 tiles both ways; the plaza fills one block.
      const sx = ri(14, 19), sy = ri(13, 17), ox = ri(5, 10), oy = ri(5, 9);
      const xs: number[] = [], ys: number[] = [];
      for (let x = ox; x < W - 7; x += sx) xs.push(x);
      for (let y = oy; y < H - 7; y += sy) ys.push(y);
      for (const x of xs) road([[x, 4], [x, H - 6]]);
      for (const y of ys) road([[4, y], [W - 6, y]]);
      const bi = Math.max(0, Math.min(xs.length - 2, Math.floor(xs.length / 2) - 1 + ri(0, 1)));
      const bj = Math.max(0, Math.min(ys.length - 2, Math.floor(ys.length / 2) - 1 + ri(0, 1)));
      plaza = { x: xs[bi] + 2, y: ys[bj] + 2, w: Math.min(16, xs[bi + 1] - xs[bi] - 2), h: Math.min(12, ys[bj + 1] - ys[bj] - 2) };
      break;
    }
    case 'river': {
      // A winding stream down one side of town, crossed by bridges; the plaza on the wider bank.
      const left = r() < 0.5;
      const bx = left ? Math.round(W * (0.26 + r() * 0.08)) : Math.round(W * (0.66 + r() * 0.08));
      let x = bx;
      for (let y = BORDER; y < H - BORDER; y += 2) {
        x += ri(-1, 1); x = Math.max(bx - 4, Math.min(bx + 4, x));
        water(x, y, ri(4, 6), 2);
      }
      placePlaza(left ? Math.round(W * 0.58) + ri(-4, 4) : Math.round(W * 0.38) + ri(-4, 4), cy + ri(-5, 5), ri(12, 14), ri(9, 10));
      const [px, py] = pc();
      road([[5, py], [W - 7, py]], 3);
      const b1 = ri(10, py - 10), b2 = ri(py + 10, H - 12);
      road([[left ? 5 : px, b1], [left ? px : W - 7, b1]]);
      road([[left ? 5 : px, b2], [left ? px : W - 7, b2]]);
      road([[px, b1], [px, b2]]);
      road([[left ? bx + 9 : bx - 7, 6], [left ? bx + 9 : bx - 7, H - 8]]);
      break;
    }
    case 'diagonal': {
      // One long avenue climbing across town from corner to corner, side lanes branching off it.
      const flip = r() < 0.5;
      const a: [number, number] = flip ? [7, H - 10] : [7, 8], b: [number, number] = flip ? [W - 10, 8] : [W - 10, H - 10];
      const m: [number, number] = [Math.round((a[0] + b[0]) / 2) + ri(-4, 4), Math.round((a[1] + b[1]) / 2) + ri(-3, 3)];
      road([a, m, b], 3);
      placePlaza(m[0], m[1], ri(12, 14), ri(9, 10));
      for (let k = 0; k < 4; k++) {
        const t = 0.15 + k * 0.22 + r() * 0.06;
        const sx = Math.round(a[0] + (b[0] - a[0]) * t), sy = Math.round(a[1] + (b[1] - a[1]) * t);
        const up = k % 2 === 0;
        road([[sx, sy], [sx, up ? 5 : H - 7]]);
      }
      break;
    }
    case 'quarters': {
      // Two off-centre main streets cut the town into four walled quarters with gates.
      const vx = cx + ri(-8, 8), hy = cy + ri(-6, 6);
      road([[vx, 4], [vx, H - 6]], 3);
      road([[4, hy], [W - 6, hy]], 3);
      placePlaza(vx + 1, hy + 1, ri(13, 15), ri(10, 11));
      // Walled quarters set back from the main streets (shops line the streets in front of
      // them), each with two gates where lanes from the main streets enter.
      const gap = 11;
      const quarters: Rect[] = [
        { x: 6, y: 6, w: vx - 6 - gap, h: hy - 6 - gap }, { x: vx + 3 + gap, y: 6, w: W - 9 - vx - gap, h: hy - 6 - gap },
        { x: 6, y: hy + 3 + gap, w: vx - 6 - gap, h: H - 9 - hy - gap }, { x: vx + 3 + gap, y: hy + 3 + gap, w: W - 9 - vx - gap, h: H - 9 - hy - gap },
      ];
      for (const q of quarters) {
        if (q.w < 12 || q.h < 10) continue;
        wallLine(q.x, q.y, q.w, 1); wallLine(q.x, q.y + q.h - 1, q.w, 1);
        wallLine(q.x, q.y, 1, q.h); wallLine(q.x + q.w - 1, q.y, 1, q.h);
        const gx = q.x + ri(3, q.w - 5), gy = q.y + ri(3, q.h - 5);
        road([[gx, hy], [gx, gy]]);
        road([[vx, gy], [gx, gy]]);
      }
      break;
    }
    case 'harbor': {
      // Open water along one side, a promenade on the shore, piers into the water.
      const exits = new Set(d.exits.map((e) => e.side));
      const side: Side = (['W', 'E', 'N', 'S'] as Side[]).find((s) => !exits.has(s)) ?? 'W';
      const depth = ri(14, 18);
      if (side === 'W' || side === 'E') {
        const x0 = side === 'W' ? BORDER : W - BORDER - depth;
        for (let y = BORDER; y < H - BORDER; y += 2) {
          const wob = ri(-2, 2);
          if (side === 'W') water(x0, y, depth + wob, 2); else water(x0 - wob, y, depth + wob, 2);
        }
        const sx = side === 'W' ? x0 + depth + 4 : x0 - 6;
        road([[sx, 6], [sx, H - 8]], 3);
        placePlaza(side === 'W' ? sx + 10 : sx - 8, cy + ri(-6, 6), ri(12, 14), ri(10, 11));
        for (let k = 0; k < 3; k++) {
          const py = 10 + Math.round(((H - 22) * (k + 0.5)) / 3) + ri(-2, 2);
          road([[sx, py], [side === 'W' ? sx - depth + 3 : sx + depth - 2, py]], 2);
        }
        const [px, py] = pc();
        road([[sx, py], [px, py]], 3);
        road([[px, 6], [px, H - 8]]);
      } else {
        const y0 = side === 'N' ? BORDER : H - BORDER - depth;
        for (let x = BORDER; x < W - BORDER; x += 2) {
          const wob = ri(-2, 2);
          if (side === 'N') water(x, y0, 2, depth + wob); else water(x, y0 - wob, 2, depth + wob);
        }
        const sy = side === 'N' ? y0 + depth + 4 : y0 - 6;
        road([[6, sy], [W - 8, sy]], 3);
        placePlaza(cx + ri(-8, 8), side === 'N' ? sy + 9 : sy - 7, ri(12, 14), ri(9, 10));
        for (let k = 0; k < 3; k++) {
          const px = 12 + Math.round(((W - 26) * (k + 0.5)) / 3) + ri(-2, 2);
          road([[px, sy], [px, side === 'N' ? sy - depth + 3 : sy + depth - 2]], 2);
        }
        const [px, py] = pc();
        road([[px, sy], [px, py]], 3);
        road([[6, py], [W - 8, py]]);
      }
      break;
    }
    case 'star': {
      // A round court with avenues radiating out like a star, joined by an outer lane.
      placePlaza(cx + ri(-4, 4), cy + ri(-3, 3), ri(14, 16), ri(11, 12));
      const [px, py] = pc();
      const n = ri(6, 8), rot = r() * Math.PI;
      const tips: [number, number][] = [];
      for (let k = 0; k < n; k++) {
        const ang = rot + (k / n) * Math.PI * 2;
        const len = ri(22, 30);
        const tx = Math.max(6, Math.min(W - 8, Math.round(px + Math.cos(ang) * len * 1.25)));
        const ty = Math.max(6, Math.min(H - 8, Math.round(py + Math.sin(ang) * len)));
        road([[px, py], [tx, ty]]);
        tips.push([tx, ty]);
      }
      tips.sort((a, b) => Math.atan2(a[1] - py, a[0] - px) - Math.atan2(b[1] - py, b[0] - px));
      road([...tips, tips[0]]);
      break;
    }
  }

  // Paved plaza on top of the streets.
  plazaOps.push({ op: 'rect', tile: d.road, x: plaza.x, y: plaza.y, w: plaza.w, h: plaza.h });
  for (let y = plaza.y; y < plaza.y + plaza.h; y++) for (let x = plaza.x; x < plaza.x + plaza.w; x++) set(x, y, PLAZA);

  // Every exit gets a street to the nearest street (bridging water if it must).
  for (const e of d.exits) {
    const [ix, iy] = e.inner;
    let best: [number, number] = pc(), bd = Infinity;
    for (let y = BORDER + 2; y < H - BORDER - 2; y++) for (let x = BORDER + 2; x < W - BORDER - 2; x++) {
      const v = at(x, y);
      if (v !== ROAD && v !== PLAZA) continue;
      const dd = Math.abs(x - ix) + Math.abs(y - iy);
      if (dd < bd) { bd = dd; best = [x, y]; }
    }
    lroad([ix, iy], best, e.side === 'E' || e.side === 'W', 3);
  }

  // ---------------------------------------------------------------- buildings
  const doors: Record<string, { x: number; y: number }> = {};
  const [pcx, pcy] = pc();
  const roadish = (v: number) => v === ROAD || v === PLAZA;
  /** Shortest walk from (x, y) to a street, through open ground; null when it's too far. */
  const routeToRoad = (x: number, y: number, max = 14): [number, number][] | null => {
    const prev = new Map<number, number>();
    const start = y * W + x;
    prev.set(start, -1);
    let frontier = [start];
    for (let dist = 0; dist <= max && frontier.length; dist++) {
      const next: number[] = [];
      for (const c of frontier) {
        const cxx = c % W, cyy = Math.floor(c / W);
        if (roadish(grid[c])) {
          const path: [number, number][] = [];
          for (let k = c; k !== -1; k = prev.get(k)!) path.push([k % W, Math.floor(k / W)]);
          return path.reverse();
        }
        for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
          const nx = cxx + dx, ny = cyy + dy;
          if (!inside(nx, ny)) continue;
          const n = ny * W + nx;
          if (prev.has(n)) continue;
          const v = grid[n];
          if (v !== FREE && v !== MARGIN && v !== ROAD && v !== PLAZA && v !== APRON) continue;
          prev.set(n, c);
          next.push(n);
        }
      }
      frontier = next;
    }
    return null;
  };
  const fits = (x: number, y: number, w: number, h: number) => {
    if (x < BORDER + 2 || y < BORDER + 2 || x + w > W - BORDER - 2 || y + h + 2 > H - BORDER - 1) return false;
    for (let yy = y - 1; yy <= y + h; yy++) for (let xx = x - 1; xx <= x + w; xx++) if (at(xx, yy) !== FREE) return false;
    const dx = x + Math.floor(w / 2);
    const below = at(dx, y + h + 1);
    return below === FREE || roadish(below) || below === MARGIN;
  };
  const build = (b: { role?: string; style: string; sign?: string; w: number; h: number }, near: boolean): boolean => {
    let best: { x: number; y: number; score: number; route: [number, number][] } | null = null;
    for (let tries = 0; tries < (near ? 900 : 260); tries++) {
      // Stand just above a random street cell (doors face down), or anywhere for houses.
      let x: number, y: number;
      if (r() < 0.8) {
        const rx = ri(BORDER + 3, W - BORDER - 4), ry = ri(BORDER + 3, H - BORDER - 4);
        if (!roadish(at(rx, ry))) continue;
        x = rx - Math.floor(b.w / 2) + ri(-1, 1); y = ry - b.h - ri(1, 2);
      } else { x = ri(4, W - b.w - 5); y = ri(4, H - b.h - 6); }
      if (!fits(x, y, b.w, b.h)) continue;
      const doorX = x + Math.floor(b.w / 2);
      const route = routeToRoad(doorX, y + b.h, near ? 6 : 12);
      if (!route) continue;
      const score = near ? Math.hypot(doorX - pcx, y + b.h - pcy) + r() * 10 + route.length * 2 : r();
      if (!best || score < best.score) best = { x, y, score, route };
      if (!near) break;
    }
    if (!best) return false;
    const { x, y, route } = best;
    const door = Math.floor(b.w / 2);
    buildingOps.push({ op: 'building', style: b.style, x, y, w: b.w, h: b.h, door, ...(b.sign ? { sign: b.sign } : {}) });
    for (let yy = y - 1; yy <= y + b.h; yy++) for (let xx = x - 1; xx <= x + b.w; xx++) if (at(xx, yy) === FREE) set(xx, yy, MARGIN);
    for (let yy = y; yy < y + b.h; yy++) for (let xx = x; xx < x + b.w; xx++) set(xx, yy, BLD);
    if (route.length > 1) { roadOps.push({ op: 'path', tile: d.road, points: route, width: 1 }); for (const [rx, ry] of route) if (!roadish(at(rx, ry))) set(rx, ry, ROAD); }
    for (let dx = -1; dx <= 1; dx++) if (at(x + door + dx, y + b.h) === MARGIN || at(x + door + dx, y + b.h) === FREE) set(x + door + dx, y + b.h, APRON);
    if (b.role) doors[b.role] = { x: x + door, y: y + b.h };
    return true;
  };
  for (const b of d.buildings) if (!build(b, true)) throw new Error(`${d.id}: no room for the ${b.role} building`);
  let houses = 0;
  for (let k = 0; k < d.houses * 3 && houses < d.houses; k++) {
    if (build({ style: 'house', w: 8, h: 5 }, false)) houses++;
  }

  // ---------------------------------------------------------------- objects
  const objects: Record<string, { x: number; y: number }> = {};
  const freeRect = (x: number, y: number, w: number, h: number, ok: (v: number) => boolean = (v) => v === FREE || v === MARGIN) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (!inside(xx, yy) || !ok(at(xx, yy))) return false;
    return true;
  };
  const putObject = (kind: string, x: number, y: number, w: number, h: number, id?: string) => {
    objectOps.push({ op: 'object', kind, x, y, ...(id ? { id } : {}) });
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) set(xx, yy, OBJ);
  };
  /** First free spot (w×h) found spiralling out from (x, y), next to a street. */
  const spotNear = (x: number, y: number, w: number, h: number, ok?: (v: number) => boolean, maxR = 16): [number, number] | null => {
    for (let rad = 0; rad <= maxR; rad++) for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue;
      const sx = x + dx, sy = y + dy;
      if (!freeRect(sx, sy, w, h, ok)) continue;
      // Must touch a street so the object can be reached.
      let touches = false;
      for (let yy = sy - 1; yy <= sy + h && !touches; yy++) for (let xx = sx - 1; xx <= sx + w; xx++) if (roadish(at(xx, yy))) { touches = true; break; }
      if (touches) return [sx, sy];
    }
    return null;
  };
  // Fountain in the plaza, lamps on its corners, planters along the edges.
  const fx = pcx - 1, fy = pcy - 2;
  putObject('fountain', fx, fy, 3, 2, `${d.id}_fountain`);
  objects[`${d.id}_fountain`] = { x: fx, y: fy };
  for (const [lx, ly] of [[plaza.x, plaza.y], [plaza.x + plaza.w - 1, plaza.y], [plaza.x, plaza.y + plaza.h - 1], [plaza.x + plaza.w - 1, plaza.y + plaza.h - 1]]) putObject('lamp_post', lx, ly, 1, 1);
  for (let k = 0; k < 4; k++) {
    const p = spotNear(plaza.x + ri(0, plaza.w - 1), r() < 0.5 ? plaza.y - 2 : plaza.y + plaza.h + 1, 1, 1);
    if (p) putObject('planter', p[0], p[1], 1, 1);
  }
  // Work clutter by the smithy and the shops.
  const clutter: Record<string, string[]> = { smithy: ['anvil'], market: ['crate', 'barrel'], stable: ['haystack'] };
  for (const [role, kinds] of Object.entries(clutter)) {
    const dr = doors[role];
    if (!dr) continue;
    for (const kind of kinds) { const p = spotNear(dr.x + (r() < 0.5 ? -3 : 3), dr.y, 1, 1, undefined, 5); if (p) putObject(kind, p[0], p[1], 1, 1); }
  }
  // A small park (flowers, planters, a bench of bushes) — the pet keeper and the elder like it there.
  let park: [number, number] | null = null;
  for (let tries = 0; tries < 200 && !park; tries++) {
    const x = ri(6, W - 14), y = ri(6, H - 12);
    if (freeRect(x, y, 8, 6, (v) => v === FREE)) {
      let touches = false;
      for (let yy = y - 1; yy <= y + 6 && !touches; yy++) for (let xx = x - 1; xx <= x + 8; xx++) if (roadish(at(xx, yy))) { touches = true; break; }
      if (touches) park = [x, y];
    }
  }
  if (park) {
    const [kx, ky] = park;
    tail.push({ op: 'scatter', kind: 'deco:flowers', area: { x: kx, y: ky, w: 8, h: 6 }, density: 0.35, seed: d.seed + 7 });
    putObject('planter', kx, ky, 1, 1); putObject('planter', kx + 7, ky, 1, 1);
    putObject('bush', kx, ky + 5, 1, 1); putObject('bush', kx + 7, ky + 5, 1, 1);
  }
  // Named objects (wells, signposts...).
  for (const o of d.objects) {
    const [w, h] = o.kind === 'well' ? [2, 2] : o.kind === 'fountain' ? [3, 2] : [1, 1];
    let target: [number, number] = park ? [park[0] + 3, park[1] + 2] : [pcx + 8, pcy + 6];
    if (o.near === 'plaza') target = [plaza.x - 2, pcy];
    if (o.near === 'gate' && d.exits[0]) target = d.exits[0].inner;
    if (o.near === 'road') target = [ri(10, W - 10), ri(10, H - 10)];
    const p = spotNear(target[0], target[1], w, h, (v) => v === FREE || v === MARGIN, 30);
    if (!p) throw new Error(`${d.id}: no room for ${o.id}`);
    putObject(o.kind, p[0], p[1], w, h, o.id);
    objects[o.id] = { x: p[0], y: p[1] };
  }
  // Signposts at the town gates.
  for (const e of d.exits) {
    const p = spotNear(e.inner[0], e.inner[1], 1, 1, undefined, 5);
    if (p) putObject('signpost', p[0], p[1], 1, 1);
  }

  // Greenery last: trees only grow on open grass, never on streets, plaza or doorsteps.
  for (const [i, t] of d.trees.entries()) tail.push({ op: 'scatter', kind: t, density: i === 0 ? d.treeDensity : d.treeDensity / 3, seed: d.seed + 11 + i });
  tail.push({ op: 'scatter', kind: 'deco:flowers', density: 0.03, seed: d.seed + 3 });
  tail.push({ op: 'scatter', kind: 'deco:tuft', density: 0.03, seed: d.seed + 5 });

  const spawn = { x: pcx, y: Math.min(plaza.y + plaza.h - 2, fy + 3) };

  // ---------------------------------------------------------------- NPC placement
  const reach = new Uint8Array(W * H);
  {
    const q = [spawn.y * W + spawn.x];
    reach[q[0]] = 1;
    while (q.length) {
      const c = q.pop()!;
      for (const dd of [1, -1, W, -W]) {
        const n = c + dd;
        if (n < 0 || n >= W * H || reach[n] || !WALKABLE.has(grid[n])) continue;
        reach[n] = 1; q.push(n);
      }
    }
  }
  const taken: [number, number][] = [];
  const doorCols = Object.values(doors);
  const okNpc = (x: number, y: number) => {
    if (!inside(x, y) || !reach[y * W + x]) return false;
    const v = at(x, y);
    if (v === APRON) return false;
    // Next to a street, so trees never wall it in.
    if (!roadish(v)) {
      let near = false;
      for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) if (roadish(at(x + dx, y + dy))) near = true;
      if (!near) return false;
    }
    if (doorCols.some((dr) => x === dr.x && y >= dr.y && y <= dr.y + 2)) return false; // keep doorways clear
    if (Math.abs(x - spawn.x) <= 1 && Math.abs(y - spawn.y) <= 1) return false;
    if (d.exits.some((e) => Math.abs(x - e.inner[0]) <= 3 && Math.abs(y - e.inner[1]) <= 3)) return false;
    return !taken.some(([tx, ty]) => Math.abs(tx - x) < 2 && Math.abs(ty - y) < 2);
  };
  const anchorOf = (role: string): [number, number] => {
    const dr = doors[role];
    if (dr) return [dr.x, dr.y + 2];
    if (role === 'park' && park) return [park[0] + 4, park[1] + 6];
    if (role === 'gate' && d.exits[0]) {
      const [ix, iy] = d.exits[0].inner;
      return [Math.round((ix * 2 + pcx) / 3), Math.round((iy * 2 + pcy) / 3)];
    }
    const hw = Math.floor(plaza.w / 2) - 1;
    return [pcx + ri(-hw, hw), pcy + ri(-2, 3)];
  };
  const placeNpcs = (roles: [string, string][]) => roles.map(([npcId, role]) => {
    const [ax, ay] = anchorOf(role);
    for (let rad = 0; rad <= 18; rad++) {
      const ring: [number, number][] = [];
      for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === rad) ring.push([ax + dx, ay + dy]);
      // Prefer the row in front of a building, then the nearest cells.
      ring.sort((p, q) => Math.abs(p[1] - ay) - Math.abs(q[1] - ay) || r() - 0.5);
      const hit = ring.find(([x, y]) => okNpc(x, y));
      if (hit) { taken.push(hit); return { npcId, x: hit[0], y: hit[1], facing: 'down' as const }; }
    }
    throw new Error(`${d.id}: no place for NPC ${npcId} (anchor ${ax},${ay}; spawn ${spawn.x},${spawn.y} kind ${at(spawn.x, spawn.y)}; reachable ${reach.reduce((a, v) => a + v, 0)})`);
  });

  return {
    paint: [...waterOps, ...wallOps, ...roadOps, ...plazaOps, ...buildingOps, ...objectOps, ...tail],
    spawn, doors, objects, plaza, placeNpcs,
  };
}

/** Which building (or place) an NPC belongs to, from its id and title. */
export function npcRole(id: string, title: string): string {
  const t = title.toLowerCase();
  if (id.startsWith('guild_')) return 'guild';
  if (id.endsWith('_trader') && t.includes('market')) return 'market';
  if (id.endsWith('_market')) return 'market';
  if (t.includes('innkeeper')) return 'inn';
  if (t.includes('smith') || t.includes('armorer') || t.includes('refiner') || t.includes('enchant')) return 'smithy';
  if (t.includes('merchant') && !t.includes('guild master') || t.includes('goods trader') || t.includes('tool')) return 'shop';
  if (t.includes('courier') || t.includes('storage')) return 'courier';
  if (id.startsWith('guild_') || t.includes('job master') || t.includes('guild master') || t.includes('oracle') || t.includes('cleric')) return 'guild';
  if (t.includes('stable')) return 'stable';
  if (t.includes('pet') || t.includes('elder')) return 'park';
  if (t.includes('guard')) return 'gate';
  return 'plaza';
}

// Willowbrook ground tileset (32×32).
// Layered corner-based autotiling ("dual grid"): grass is the base; every
// other terrain is an overlay with 15 corner masks (NW=1, NE=2, SW=4, SE=8).
// Textures are periodic in 32 px and edge masks depend only on the shared
// corners, so any combination tiles without seams.
import { Mat } from './mat';
import { Pixmap, rng, type RGBA } from './pixel';
import { R, type Ramp } from './palette';

export const T = 32;

/** Periodic 1D hash wave for seamless edge wobble. */
function wave(v: number, seed: number) {
  const r = rng(seed);
  const a1 = r() * Math.PI * 2, a2 = r() * Math.PI * 2;
  return Math.sin((v / T) * Math.PI * 2 + a1) * 0.6 + Math.sin((v / T) * Math.PI * 4 + a2) * 0.4;
}

// ------------------------------------------------------------------ base textures (periodic)
function grassTex(variant: number): Pixmap {
  const p = new Pixmap(T, T);
  const g = R.grass;
  p.rect(0, 0, T, T, g.b);
  const r = rng(100 + variant * 17);
  // soft clumps of lighter / darker grass
  for (let i = 0; i < 6; i++) {
    const cx = Math.floor(r() * T), cy = Math.floor(r() * T), dark = r() < 0.5;
    for (let k = 0; k < 9; k++) p.set((cx + Math.floor(r() * 5)) % T, (cy + Math.floor(r() * 3)) % T, dark ? g.s : g.l);
  }
  // blades: 2px strokes, light tip upper-left, shadow below
  for (let i = 0; i < 14; i++) {
    const x = Math.floor(r() * T), y = Math.floor(r() * T);
    p.set(x, y, g.l); p.set(x, (y + 1) % T, g.b); p.set((x + 1) % T, (y + 1) % T, g.s);
  }
  if (variant === 3) for (let i = 0; i < 3; i++) { const x = Math.floor(r() * T), y = Math.floor(r() * T); p.set(x, y, R.flower_yellow.b); }
  return p;
}

function dirtTex(variant: number): Pixmap {
  const p = new Pixmap(T, T), d = R.dirt, r = rng(200 + variant * 13);
  p.rect(0, 0, T, T, d.b);
  for (let i = 0; i < 40; i++) p.set(Math.floor(r() * T), Math.floor(r() * T), r() < 0.5 ? d.s : d.l);
  for (let i = 0; i < 5; i++) { // pebbles lit from the upper-left
    const x = Math.floor(r() * (T - 2)), y = Math.floor(r() * (T - 2));
    p.set(x, y, R.stone.l); p.set(x + 1, y, R.stone.b); p.set(x, y + 1, R.stone.b); p.set(x + 1, y + 1, R.stone.s);
  }
  return p;
}

function cobbleTex(variant: number): Pixmap {
  // Stones laid in a 16×8 running bond, periodic in 32.
  const p = new Pixmap(T, T), s = R.stone, r = rng(300 + variant * 7);
  p.rect(0, 0, T, T, s.d);
  for (let row = 0; row < 4; row++) {
    const off = row % 2 ? 8 : 0;
    for (let k = -1; k < 2; k++) {
      const x0 = k * 16 + off, y0 = row * 8;
      const tone = r();
      const base = tone < 0.33 ? s.s : tone < 0.66 ? s.b : s.b;
      for (let y = 1; y < 7; y++) for (let x = 1; x < 15; x++) {
        const px = (x0 + x + T) % T;
        let c: RGBA = base;
        if (y === 1 || x === 1) c = s.l; else if (y === 6 || x === 14) c = s.s;
        if ((y === 1 && x === 1) || (y === 6 && x === 14)) c = y === 1 ? s.l : s.d;
        p.set(px, y0 + y, c);
      }
    }
  }
  for (let i = 0; i < 6; i++) p.set(Math.floor(r() * T), Math.floor(r() * T), R.grass.s); // moss
  return p;
}

function soilTex(variant: number): Pixmap {
  const p = new Pixmap(T, T), d = R.bark, r = rng(400 + variant);
  p.rect(0, 0, T, T, d.s);
  for (let y = 2; y < T; y += 8) { p.rect(0, y, T, 3, d.b); p.rect(0, y, T, 1, d.l); p.rect(0, y + 3, T, 1, d.d); }
  for (let i = 0; i < 12; i++) p.set(Math.floor(r() * T), Math.floor(r() * T), d.d);
  return p;
}

// ------------------------------------------------------------------ overlay masks
const CORNERS = [[0, 0], [1, 0], [0, 1], [1, 1]] as const;

/** Terrain coverage inside a tile for a corner mask (bilinear + periodic wobble). */
function maskFn(mask: number, seed: number): (x: number, y: number) => boolean {
  const c = CORNERS.map((_, i) => ((mask >> i) & 1 ? 1 : 0));
  return (x, y) => {
    const u = (x + 0.5) / T, v = (y + 0.5) / T;
    const val = c[0] * (1 - u) * (1 - v) + c[1] * u * (1 - v) + c[2] * (1 - u) * v + c[3] * u * v;
    const wob = (wave(x, seed) + wave(y, seed + 1)) * 0.07;
    return val + wob > 0.5;
  };
}

/** Overlay tile: terrain texture where the mask covers, grass rim shading on its border. */
function overlayTile(tex: Pixmap, mask: number, seed: number, rim: Ramp, hardEdge: boolean): Pixmap {
  const p = new Pixmap(T, T);
  const inside = maskFn(mask, seed);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= T || y >= T ? inside(Math.max(0, Math.min(T - 1, x)), Math.max(0, Math.min(T - 1, y))) : inside(x, y));
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    if (!inside(x, y)) continue;
    let c = tex.get(x, y);
    // Edge: the grass casts a soft shadow onto lower terrain (light from upper-left).
    const nearTop = !at(x, y - 1) || !at(x - 1, y);
    const nearBot = !at(x, y + 1) || !at(x + 1, y);
    if (hardEdge) {
      if (nearTop) c = rim.d; else if (nearBot) c = rim.l;
      else if (!at(x, y - 2) || !at(x - 2, y)) c = rim.s;
    } else {
      if (nearTop) c = rim.s; else if (!at(x, y - 2) || !at(x - 2, y)) c = blend(c, rim.s);
    }
    p.set(x, y, c);
  }
  // Grass tufts overhanging the top edge of the terrain.
  const r = rng(seed * 31 + mask);
  for (let i = 0; i < 6; i++) {
    const x = 1 + Math.floor(r() * (T - 2)), y = 1 + Math.floor(r() * (T - 2));
    if (inside(x, y) && !inside(x, y - 1)) { p.set(x, y, R.grass.b); p.set(x, y + 1, R.grass.s); }
  }
  return p;
}

function blend(a: RGBA, b: RGBA): RGBA {
  return [Math.round((a[0] + b[0]) / 2), Math.round((a[1] + b[1]) / 2), Math.round((a[2] + b[2]) / 2), 255];
}

// ------------------------------------------------------------------ decorations (transparent)
function decoTile(kind: string, seed: number): Pixmap {
  const p = new Pixmap(T, T), r = rng(seed);
  if (kind === 'flowers') {
    const cols = [R.flower_pink, R.flower_yellow, R.flower_white];
    for (let i = 0; i < 5; i++) {
      const x = 3 + Math.floor(r() * 26), y = 4 + Math.floor(r() * 24), c = cols[Math.floor(r() * 3)];
      p.set(x, y + 2, R.grass.s); p.set(x, y + 3, R.grass.s);
      p.set(x, y, c.l); p.set(x - 1, y + 1, c.b); p.set(x + 1, y + 1, c.s); p.set(x, y + 1, R.flower_yellow.l); p.set(x, y - 1, c.b);
    }
  } else if (kind === 'tuft') {
    for (let i = 0; i < 3; i++) {
      const x = 4 + Math.floor(r() * 24), y = 8 + Math.floor(r() * 20);
      for (const [dx, h] of [[0, 4], [2, 5], [4, 3]] as const) { for (let k = 0; k < h; k++) p.set(x + dx, y - k, k === h - 1 ? R.grass.l : R.grass.s); }
    }
  } else if (kind === 'pebbles') {
    for (let i = 0; i < 4; i++) { const x = 3 + Math.floor(r() * 26), y = 3 + Math.floor(r() * 26); p.set(x, y, R.stone.l); p.set(x + 1, y, R.stone.b); p.set(x + 1, y + 1, R.stone.s); }
  } else if (kind === 'crops') {
    for (let x = 4; x < T; x += 8) for (let y = 3; y < T; y += 8) {
      p.set(x, y + 4, R.leaf.s); p.set(x, y + 3, R.leaf.b); p.set(x, y + 2, R.leaf.b);
      p.set(x - 1, y + 1, R.leaf.l); p.set(x + 1, y + 2, R.leaf.b); p.set(x - 1, y + 3, R.leaf.s); p.set(x + 1, y, R.leaf.l);
    }
  }
  return p;
}

// ------------------------------------------------------------------ walls
function wallTile(kind: string, seed: number): Pixmap {
  const m = new Mat(T, T);
  const r = rng(seed);
  if (kind === 'thicket') {
    // Dense foliage that tiles: leaves wrap around the edges.
    const leaf = m.id(R.leaf, { band2: true });
    m.rect(0, 0, T, T, leaf);
    const p = m.render(false);
    for (let i = 0; i < 16; i++) {
      const x = Math.floor(r() * T), y = Math.floor(r() * T);
      for (const [dx, dy, c] of [[0, 0, R.leaf.l], [1, 0, R.leaf.l], [0, 1, R.leaf.b], [2, 1, R.leaf.s], [1, 2, R.leaf.s], [2, 2, R.leaf.d]] as const) p.set((x + dx) % T, (y + dy) % T, c);
    }
    for (let i = 0; i < 10; i++) { const x = Math.floor(r() * T), y = Math.floor(r() * T); p.set(x, y, R.leaf.o); }
    return p;
  }
  if (kind === 'fence_h') {
    const wood = m.id(R.wood);
    m.rect(0, 12, T, 3, wood); m.rect(0, 20, T, 3, wood);
    m.rect(5, 7, 4, 20, wood); m.rect(23, 7, 4, 20, wood);
    return m.render(true);
  }
  if (kind === 'fence_v') {
    const wood = m.id(R.wood);
    m.rect(14, 0, 4, T, wood);
    m.rect(12, 4, 8, 4, wood); m.rect(12, 20, 8, 4, wood);
    return m.render(true);
  }
  if (kind === 'canopy') {
    // Above-player overhang: leaves hanging down from the top border.
    const leaf = m.id(R.leaf, { band2: true });
    m.rect(0, 0, T, 12, leaf);
    for (let x = 0; x < T; x += 6) m.ellipse(x + 3, 12, 4, 4 + Math.floor(r() * 4), leaf);
    return m.render(true);
  }
  return new Pixmap(T, T);
}

// ------------------------------------------------------------------ tileset assembly
export interface TileEntry { id: number; name: string; terrain?: string; mask?: number; variant?: number; layer: 'ground' | 'overlay' | 'deco' | 'wall' | 'above' }

export function buildWillowbrookTileset(): { image: Pixmap; tiles: TileEntry[]; columns: number } {
  const tiles: { pix: Pixmap; meta: Omit<TileEntry, 'id'> }[] = [];
  for (let v = 0; v < 4; v++) tiles.push({ pix: grassTex(v), meta: { name: `grass_${v}`, terrain: 'grass', mask: 15, variant: v, layer: 'ground' } });
  const overlays: [string, (v: number) => Pixmap, Ramp, boolean][] = [
    ['dirt', dirtTex, R.dirt, false],
    ['path_stone', cobbleTex, R.stone, true],
    ['soil', soilTex, R.bark, false],
  ];
  for (const [name, tex, rim, hard] of overlays) {
    for (let mask = 1; mask <= 15; mask++) tiles.push({ pix: overlayTile(tex(0), mask, 7 + name.length, rim, hard), meta: { name: `${name}_${mask}`, terrain: name, mask, variant: 0, layer: 'overlay' } });
    for (let v = 1; v < 3; v++) tiles.push({ pix: overlayTile(tex(v), 15, 7 + name.length, rim, hard), meta: { name: `${name}_15_v${v}`, terrain: name, mask: 15, variant: v, layer: 'overlay' } });
  }
  for (const [k, n] of [['flowers', 3], ['tuft', 2], ['pebbles', 1], ['crops', 1]] as const) {
    for (let v = 0; v < n; v++) tiles.push({ pix: decoTile(k, 500 + v * 11 + k.length), meta: { name: `${k}_${v}`, terrain: k, variant: v, layer: 'deco' } });
  }
  for (const k of ['thicket', 'fence_h', 'fence_v']) tiles.push({ pix: wallTile(k, 600 + k.length), meta: { name: k, terrain: k, layer: 'wall' } });
  tiles.push({ pix: wallTile('canopy', 700), meta: { name: 'canopy_overhang', terrain: 'canopy_overhang', layer: 'above' } });
  const columns = 8;
  const rows = Math.ceil(tiles.length / columns);
  const image = new Pixmap(columns * T, rows * T);
  tiles.forEach((t, i) => image.blit(t.pix, (i % columns) * T, Math.floor(i / columns) * T));
  return { image, tiles: tiles.map((t, i) => ({ id: i, ...t.meta })), columns };
}

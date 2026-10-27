// Willowbrook environment props & buildings (y-sorted sprites, bottom-centre origin).
import { Mat } from './mat';
import { Pixmap, rng } from './pixel';
import { R, type Ramp } from './palette';

export interface PropSprite { key: string; pix: Pixmap; footprint: { w: number; h: number }; origin: { x: number; y: number } }

function prop(key: string, w: number, h: number, fw: number, fh: number, draw: (m: Mat, w: number, h: number) => void, extra?: (p: Pixmap) => void): PropSprite {
  const m = new Mat(w, h);
  draw(m, w, h);
  const pix = m.render(true);
  extra?.(pix);
  return { key, pix, footprint: { w: fw, h: fh }, origin: { x: 0.5, y: 1 } };
}

function leafClusters(m: Mat, cx: number, cy: number, rx: number, ry: number, seed: number, leaf: Ramp) {
  const r = rng(seed);
  const base = m.id(leaf, { band2: true });
  m.ellipse(cx, cy, rx, ry, base);
  // bumpy silhouette
  for (let i = 0; i < 14; i++) {
    const a = r() * Math.PI * 2;
    m.ellipse(cx + Math.cos(a) * rx * 0.85, cy + Math.sin(a) * ry * 0.85, 4 + r() * 3, 3 + r() * 3, base);
  }
  // Volume: lit clumps on the upper-left, shaded clumps on the lower-right.
  const lit = m.id(leaf, { tone: 'l' }), shade = m.id(leaf, { tone: 's' });
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * (1.0 + r() * 0.6), d = 0.35 + r() * 0.3;
    m.ellipse(cx + Math.cos(a) * rx * d, cy + Math.sin(a) * ry * d, 3 + r() * 2, 2 + r() * 1.5, lit);
  }
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.05 + r() * 0.55), d = 0.45 + r() * 0.35;
    m.ellipse(cx + Math.cos(a) * rx * d, cy + Math.sin(a) * ry * d, 3 + r() * 3, 2 + r() * 2, shade);
  }
}

function treeOak(variant: number): PropSprite {
  return prop(`tree_oak_${variant}`, 72, 96, 1, 1, (m, w, h) => {
    const bark = m.id(R.bark, { band2: true });
    const cx = w / 2, base = h - 3;
    m.poly([[cx - 5, base], [cx + 5, base], [cx + 4, base - 34], [cx - 4, base - 34]], bark);
    m.poly([[cx - 9, base], [cx - 4, base - 6], [cx - 3, base]], bark); m.poly([[cx + 9, base], [cx + 4, base - 6], [cx + 3, base]], bark);
    leafClusters(m, cx + (variant - 1) * 2, base - 52, 25 - variant, 20, 40 + variant, R.leaf);
  }, (p) => {
    // canopy light flecks (upper-left)
    const r = rng(90 + variant);
    for (let i = 0; i < 26; i++) {
      const x = 14 + Math.floor(r() * 30), y = 22 + Math.floor(r() * 28);
      if (p.alpha(x, y) && p.alpha(x + 1, y + 1) && p.alpha(x - 2, y - 2)) { p.set(x, y, R.leaf.l); p.set(x + 1, y, R.leaf.l); }
    }
  });
}

function bush(): PropSprite {
  return prop('bush', 36, 30, 1, 1, (m, w, h) => leafClusters(m, w / 2, h - 11, 13, 9, 7, R.leaf), (p) => {
    p.set(12, 9, R.flower_pink.l); p.set(20, 12, R.flower_pink.b); p.set(16, 7, R.flower_white.l);
  });
}

function rock(): PropSprite {
  return prop('rock', 32, 26, 1, 1, (m) => {
    const s = m.id(R.stone, { band2: true });
    m.poly([[4, 23], [6, 12], [12, 6], [22, 5], [28, 12], [29, 23]], s);
  });
}

function crate(): PropSprite {
  return prop('crate', 30, 32, 1, 1, (m) => {
    const w = m.id(R.wood), dark = m.id(R.timber);
    m.rect(3, 6, 24, 24, w);
    m.rect(3, 6, 24, 3, dark); m.rect(3, 17, 24, 2, dark); m.rect(14, 6, 2, 24, dark);
  });
}

function barrel(): PropSprite {
  return prop('barrel', 26, 32, 1, 1, (m) => {
    const w = m.id(R.wood, { band2: true }), hoop = m.id(R.steel);
    m.ellipse(13, 17, 10, 13, w);
    m.rect(3, 9, 20, 2, hoop); m.rect(3, 23, 20, 2, hoop);
    m.ellipse(13, 6, 9, 3, m.id(R.wood, { tone: 'l' }));
  });
}

function well(): PropSprite {
  return prop('well', 64, 80, 2, 2, (m, w, h) => {
    const s = m.id(R.stone, { band2: true }), water = m.id(R.water, { tone: 'b' }), dark = m.id(R.water, { tone: 'd' });
    const post = m.id(R.timber), roof = m.id(R.roof_red, { band2: true }), rope = m.id(R.sand), bucket = m.id(R.wood);
    const base = h - 3;
    m.ellipse(w / 2, base - 14, 27, 14, s);
    m.ellipse(w / 2, base - 22, 20, 6, dark);
    m.ellipse(w / 2, base - 21, 17, 4, water);
    m.rect(8, base - 64, 5, 48, post); m.rect(w - 13, base - 64, 5, 48, post);
    m.poly([[2, base - 58], [w - 2, base - 58], [w - 12, base - 74], [12, base - 74]], roof);
    m.rect(w / 2 - 1, base - 58, 2, 24, rope);
    m.rect(w / 2 - 4, base - 36, 8, 7, bucket);
  }, (p) => {
    // stone joints
    for (let x = 10; x < 56; x += 7) for (let y = 62; y < 74; y += 5) if (p.alpha(x, y)) p.set(x, y, R.stone.s);
  });
}

function fountain(): PropSprite {
  return prop('fountain', 96, 84, 3, 2, (m, w, h) => {
    const s = m.id(R.stone, { band2: true }), water = m.id(R.water, { band2: true }), statue = m.id(R.stone);
    const base = h - 3;
    m.ellipse(w / 2, base - 16, 44, 15, s);
    m.ellipse(w / 2, base - 19, 38, 10, water);
    m.rect(w / 2 - 5, base - 52, 10, 34, statue);
    m.ellipse(w / 2, base - 52, 13, 5, s);
    m.ellipse(w / 2, base - 53, 10, 3, water);
    m.poly([[w / 2, base - 64], [w / 2 + 4, base - 56], [w / 2 - 4, base - 56]], m.id(R.brass)); // star finial
  }, (p) => {
    for (const [x, y] of [[40, 63], [41, 63], [60, 65], [30, 66]] as const) p.set(x, y, R.water.l);
    for (let y = 22; y < 30; y++) p.set(48, y, R.water.l);
  });
}

function signpost(): PropSprite {
  return prop('signpost', 32, 44, 1, 1, (m) => {
    const w = m.id(R.timber), board = m.id(R.wood);
    m.rect(14, 14, 4, 28, w);
    m.poly([[3, 6], [26, 6], [30, 11], [26, 16], [3, 16]], board);
  }, (p) => { p.rect(7, 10, 14, 1, R.wood.d); p.rect(7, 13, 9, 1, R.wood.d); }); // carved marks, not text
}

function anvil(): PropSprite {
  return prop('anvil', 32, 26, 1, 1, (m) => {
    const s = m.id(R.steel, { band2: true }), w = m.id(R.wood);
    m.rect(11, 16, 10, 8, w);
    m.poly([[3, 8], [26, 8], [29, 11], [24, 14], [9, 14], [6, 11]], s);
  });
}

function lampPost(): PropSprite {
  return prop('lamp_post', 24, 72, 1, 1, (m) => {
    const iron = m.id(R.roof_slate), glass = m.id(R.flower_yellow, { tone: 'l' });
    m.rect(10, 16, 4, 54, iron); m.rect(7, 66, 10, 4, iron);
    m.rect(5, 4, 14, 3, iron); m.rect(6, 7, 12, 10, iron); m.rect(8, 8, 8, 8, glass);
  });
}

function planter(): PropSprite {
  return prop('planter', 32, 28, 1, 1, (m) => {
    const box = m.id(R.wood, { band2: true });
    m.rect(3, 12, 26, 13, box);
    leafClusters(m, 16, 10, 11, 5, 3, R.leaf);
  }, (p) => { for (const [x, y, c] of [[8, 7, R.flower_pink.l], [15, 5, R.flower_yellow.l], [22, 8, R.flower_white.l], [12, 10, R.flower_pink.b], [19, 9, R.flower_yellow.b]] as const) p.set(x, y, c); });
}

function haystack(): PropSprite {
  return prop('haystack', 36, 34, 1, 1, (m) => {
    m.ellipse(18, 20, 15, 12, m.id(R.flower_yellow, { band2: true }));
  }, (p) => { const r = rng(5); for (let i = 0; i < 18; i++) { const x = 6 + Math.floor(r() * 24), y = 10 + Math.floor(r() * 18); if (p.alpha(x, y + 2)) p.set(x, y, R.flower_yellow.s); } });
}

export function buildWillowbrookProps(): PropSprite[] {
  return [treeOak(0), treeOak(1), treeOak(2), bush(), rock(), crate(), barrel(), well(), fountain(), signpost(), anvil(), lampPost(), planter(), haystack()];
}

// ------------------------------------------------------------------ buildings
const STYLE: Record<string, { roof: Ramp; icon: string }> = {
  inn: { roof: R.roof_red, icon: 'mug' }, smithy: { roof: R.roof_slate, icon: 'anvil' }, shop: { roof: R.roof_blue, icon: 'potion' },
  guild: { roof: R.roof_purple, icon: 'crest' }, house: { roof: R.roof_brown, icon: '' },
};

/** Timber-framed building for a footprint of w×h tiles, door column `door` (bottom row). */
export function building(style: string, wTiles: number, hTiles: number, door?: number): PropSprite {
  const st = STYLE[style] ?? STYLE.house;
  const W = wTiles * 32 + 8, H = hTiles * 32 + 20;
  const base = H - 3, wallH = 60, wallTop = base - wallH;
  const m = new Mat(W, H);
  const plaster = m.id(R.plaster), timber = m.id(R.timber), roof = m.id(st.roof, { band2: true }), stone = m.id(R.stone);
  const glass = m.id(R.flower_yellow, { tone: 'b' }), glassL = m.id(R.flower_yellow, { tone: 'l' }), doorW = m.id(R.wood, { band2: true });
  // stone footing + plaster wall
  m.rect(4, wallTop, W - 8, wallH, plaster);
  m.rect(4, base - 6, W - 8, 6, stone);
  // timber frame
  m.rect(4, wallTop, W - 8, 3, timber);
  m.rect(4, wallTop + 28, W - 8, 2, timber);
  for (let x = 4; x < W - 6; x += 32) m.rect(x, wallTop, 3, wallH - 6, timber);
  m.rect(W - 7, wallTop, 3, wallH - 6, timber);
  // windows (two per bay, skipping the door bay)
  for (let i = 0; i < wTiles; i++) {
    if (door != null && i === door) continue;
    if (i % 2 === 0 && wTiles > 3 && i !== wTiles - 1 && i !== 0) continue;
    const x = 4 + i * 32 + 9;
    m.rect(x - 1, wallTop + 8, 16, 16, timber);
    m.rect(x + 1, wallTop + 10, 12, 12, glass);
    m.rect(x + 1, wallTop + 10, 5, 5, glassL);
    m.rect(x + 6, wallTop + 10, 2, 12, timber); m.rect(x + 1, wallTop + 15, 12, 2, timber);
  }
  // door
  if (door != null) {
    const dx = 4 + door * 32 + 5;
    m.rect(dx - 2, base - 42, 26, 42, timber);
    m.rect(dx, base - 40, 22, 40, doorW);
  }
  // roof: hip roof covering the upper tiles, overhanging the walls
  const roofTop = 6;
  m.poly([[0, wallTop + 6], [W, wallTop + 6], [W - 16, roofTop], [16, roofTop]], roof);
  if (style === 'smithy') m.rect(W - 40, roofTop - 4, 14, 26, m.id(R.stone, { band2: true }));
  if (style === 'inn') m.rect(18, roofTop - 2, 12, 22, m.id(R.stone, { band2: true }));
  const pix = m.render(true);
  // shingle rows (lit from the upper-left: light top line, dark lower line)
  for (let y = roofTop + 5; y < wallTop + 4; y += 6) {
    for (let x = 0; x < W; x++) {
      if (!pix.alpha(x, y) || !pix.alpha(x, y + 1)) continue;
      const c = pix.get(x, y);
      if (c[0] === st.roof.b[0] && c[1] === st.roof.b[1]) { pix.set(x, y, st.roof.s); if ((x + y) % 7 === 0) pix.set(x, y - 1, st.roof.s); }
    }
  }
  // door knob, window glow already; signboard icon (no text)
  if (door != null) pix.set(4 + door * 32 + 22, base - 20, R.brass.l);
  if (st.icon) signIcon(pix, Math.floor(W / 2) - 8, wallTop - 2, st.icon);
  return { key: `${style}_${wTiles}x${hTiles}`, pix, footprint: { w: wTiles, h: hTiles }, origin: { x: 0.5, y: 1 } };
}

function signIcon(p: Pixmap, x: number, y: number, icon: string) {
  const m = new Mat(18, 14);
  const board = m.id(R.wood, { band2: true });
  m.rect(0, 0, 18, 14, board);
  const g = m.render(true);
  const put = (dx: number, dy: number, c: Ramp, t: 'l' | 'b' | 's' = 'b') => g.set(dx, dy, c[t]);
  if (icon === 'mug') { for (let yy = 4; yy < 11; yy++) for (let xx = 5; xx < 11; xx++) put(xx, yy, R.flower_yellow, xx === 5 ? 'l' : 'b'); put(11, 6, R.wood, 's'); put(12, 7, R.wood, 's'); put(11, 8, R.wood, 's'); for (let xx = 5; xx < 11; xx++) put(xx, 3, R.flower_white, 'l'); }
  if (icon === 'anvil') { for (let xx = 4; xx < 14; xx++) put(xx, 6, R.steel, 'l'); for (let xx = 6; xx < 12; xx++) put(xx, 7, R.steel); for (let yy = 8; yy < 11; yy++) for (let xx = 7; xx < 11; xx++) put(xx, yy, R.steel, 's'); }
  if (icon === 'potion') { for (let yy = 6; yy < 11; yy++) for (let xx = 6; xx < 12; xx++) put(xx, yy, R.mush_cap, xx === 6 || yy === 6 ? 'l' : 'b'); put(8, 4, R.flower_white); put(9, 4, R.flower_white); put(8, 5, R.flower_white); put(9, 5, R.flower_white); }
  if (icon === 'crest') { for (let yy = 3; yy < 10; yy++) for (let xx = 5; xx < 13; xx++) put(xx, yy, R.mush_cap, yy === 3 ? 'l' : 'b'); for (let xx = 6; xx < 12; xx++) put(xx, 10, R.mush_cap, 's'); put(8, 11, R.mush_cap, 's'); put(9, 11, R.mush_cap, 's'); put(8, 6, R.brass, 'l'); put(9, 6, R.brass, 'l'); }
  p.blit(g, x, y);
}

export const WILLOWBROOK_BUILDINGS: { style: string; w: number; h: number; door?: number }[] = [
  { style: 'inn', w: 8, h: 6, door: 4 }, { style: 'smithy', w: 8, h: 6, door: 3 }, { style: 'shop', w: 7, h: 5, door: 3 },
  { style: 'guild', w: 10, h: 6, door: 5 }, { style: 'house', w: 6, h: 5, door: 3 }, { style: 'house', w: 5, h: 4, door: 2 },
];

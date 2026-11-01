// Procedural monster sprite sheets in the "shadow" style: dark silhouettes tinted by the monster's
// colour, a neon rim light, glowing markings in the monster's own colour and glowing eyes in a colour
// of their own (art.eye, a different hue for every monster). One row facing left, mirrored at runtime
// for right-facing. Layout: see MON_ANIMS in spriteMeta.ts.
import type { MonsterDef } from '../../core/types';
import { addOutline, ellipse, hexToRgb, makeCanvas, poly, px } from './canvas';
import { overrideCanvas, spriteOverride } from './spriteOverrides';
import { MON_ANIMS, MON_SHEET_COLS, type MonAnim } from './spriteMeta';

interface MPose {
  sx: number; sy: number; dx: number; dy: number; legs: number; open: number; tint: string | null; alpha: number; flat: number; wing: number; t: number;
  /** Tilt about the feet (radians; + leans back, away from the facing side). */
  rot: number;
  /** Slash arc in front (0..1), impact spark, dissolve into motes (0..1). */
  swoosh: number; spark: boolean; melt: number;
  /** Cycle phase 0..1 (legs, tails, wings and wisps move with it); afterimage behind a lunge (0..1). */
  ph: number; blur: number;
}
const P0: MPose = { sx: 1, sy: 1, dx: 0, dy: 0, legs: 0, open: 0, tint: null, alpha: 1, flat: 0, wing: 0, t: 0, rot: 0, swoosh: 0, spark: false, melt: 0, ph: 0, blur: 0 };

/**
 * Key poses per animation (frame counts in MON_ANIMS):
 *  idle 6  — slow breathing (squash and stretch), a slight sway;
 *  walk 8  — a hop per step: squash on landing, stretch in the air, leaning into the move;
 *  attack 7 — wind-up (coil back), lunge, impact (slash arc + spark), follow-through, recover;
 *  hit 3   — white flash and recoil, red flash, settle;
 *  death 7 — flash and stagger, rear up, topple, collapse, dissolve into glowing motes.
 */
function pose(anim: MonAnim, f: number): MPose {
  switch (anim) {
    case 'idle': {
      const ph = (f / 6) * Math.PI * 2, br = (1 - Math.cos(ph)) / 2;
      return { ...P0, sy: 1 - 0.06 * br, sx: 1 + 0.045 * br, rot: 0.025 * Math.sin(ph), wing: (1 - Math.cos(ph * 2)) / 2, t: f % 3, ph: f / 6, legs: 0.3 * Math.sin(ph) };
    }
    case 'walk': {
      const ph = (f / 8) * Math.PI * 2, hop = Math.abs(Math.sin(ph));
      return { ...P0, dy: -Math.round(hop * 3), legs: Math.sin(ph) * 1.8, sy: 0.92 + 0.12 * hop, sx: 1.06 - 0.08 * hop, rot: -0.07 + 0.03 * Math.cos(ph * 2), wing: (1 - Math.cos(ph * 2)) / 2, t: f % 3, ph: f / 8 };
    }
    case 'attack': return [
      { ...P0, dx: 2, rot: 0.08, sy: 0.9, sx: 1.07, open: 0.2 },
      { ...P0, dx: 3, rot: 0.13, sy: 0.84, sx: 1.1, open: 0.45, t: 1, wing: 1, ph: 0.25 },
      { ...P0, dx: -4, rot: -0.1, sy: 1.05, sx: 1.1, open: 1, swoosh: 0.45, t: 1, wing: 0, blur: 1, ph: 0.5 },
      { ...P0, dx: -6, rot: -0.14, sy: 0.97, sx: 1.12, open: 1, swoosh: 1, spark: true, t: 2, wing: 0.2, blur: 0.5, ph: 0.6 },
      { ...P0, dx: -5, rot: -0.08, open: 0.7, swoosh: 0.4, t: 2 },
      { ...P0, dx: -2, rot: -0.02, sy: 1.03, open: 0.3, t: 1 },
      { ...P0, dx: -1, rot: 0.01, sy: 0.98 },
    ][f];
    case 'hit': return [
      { ...P0, dx: 3, rot: 0.12, sx: 0.92, sy: 1.06, tint: 'rgba(255,255,255,0.65)' },
      { ...P0, dx: 2, rot: 0.07, sx: 0.96, tint: 'rgba(255,50,70,0.32)' },
      { ...P0, dx: 1, rot: 0.02 },
    ][f];
    case 'death': return [
      { ...P0, dx: 2, rot: 0.1, tint: 'rgba(255,255,255,0.55)' },
      { ...P0, dx: 3, dy: -2, rot: 0.2, sy: 1.06, tint: 'rgba(30,0,20,0.2)', t: 1 },
      { ...P0, dx: 3, rot: 0.32, sy: 0.96, tint: 'rgba(30,0,20,0.3)', t: 2 },
      { ...P0, dx: 3, rot: 0.36, flat: 0.35, tint: 'rgba(30,0,20,0.35)', alpha: 0.95 },
      { ...P0, dx: 2, rot: 0.3, flat: 0.6, melt: 0.25, tint: 'rgba(30,0,20,0.35)', alpha: 0.9 },
      { ...P0, dx: 2, rot: 0.24, flat: 0.8, melt: 0.55, alpha: 0.75 },
      { ...P0, dx: 2, rot: 0.2, flat: 0.9, melt: 0.85, alpha: 0.55 },
    ][f];
  }
}

// ------------------------------------------------------------------ colours
type RGB = [number, number, number];
const hex = ([r, g, b]: RGB) => `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
const mixRgb = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const toRgb = (c: string): RGB => (c.startsWith('#') ? hexToRgb(c) : (c.match(/\d+/g) ?? ['0', '0', '0']).slice(0, 3).map(Number) as RGB);

function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
export function hslHex(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return hex([f(0) * 255, f(8) * 255, f(4) * 255]);
}
/** A bright neon version of a colour (greys stay pale and cool). */
function neon(c: string, l = 0.62): string {
  const [h, s] = rgbToHsl(toRgb(c));
  return s < 0.12 ? hslHex(h || 200, 0.35, 0.82) : hslHex(h, Math.max(0.8, s), l);
}
/** Eye colour: the monster's own (art.eye) or one picked from its id. */
export function monsterEyeColor(def: Pick<MonsterDef, 'id' | 'art'>): string {
  const e = (def.art as { eye?: string }).eye;
  if (e) return e;
  let hsh = 0; for (const ch of def.id) hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0;
  return hslHex(hsh % 360, 1, 0.6);
}

interface Pal { k0: string; k1: string; k2: string; k3: string; g: string; gl: string; g2: string; e: string; el: string }
function palette(def: MonsterDef): Pal {
  const c = def.art.colors.length ? def.art.colors : ['#808080'];
  const tint = toRgb(c[0]);
  const dark = (base: RGB, t: number) => hex(mixRgb(base, tint, t));
  // Glow: the most colourful of the monster's colours; second glow: the next one.
  const bySat = [...c].map((x) => [x, rgbToHsl(toRgb(x))[1]] as const).sort((a, b) => b[1] - a[1]);
  const g = neon(bySat[0][0]), g2 = neon((bySat[1] ?? bySat[0])[0], 0.68);
  const e = monsterEyeColor(def);
  return {
    k0: dark([4, 3, 8], 0.05), k1: dark([10, 9, 16], 0.08), k2: dark([19, 18, 28], 0.11), k3: dark([33, 31, 45], 0.14),
    g, gl: hex(mixRgb(toRgb(g), [255, 255, 255], 0.55)), g2, e, el: hex(mixRgb(toRgb(e), [255, 255, 255], 0.7)),
  };
}

// ------------------------------------------------------------------ drawing helpers
type Ctx = CanvasRenderingContext2D;
type Painter = (ctx: Ctx, w: number, h: number, P: Pal, p: MPose) => void;

function alpha(ctx: Ctx, a: number, fn: () => void) { const o = ctx.globalAlpha; ctx.globalAlpha = o * a; fn(); ctx.globalAlpha = o; }
/** A glowing eye: soft halo, coloured iris and a pale hot core. */
function eye(ctx: Ctx, P: Pal, x: number, y: number, w = 2, h = 2) {
  alpha(ctx, 0.28, () => ellipse(ctx, x + w / 2, y + h / 2, w / 2 + 2, h / 2 + 2, P.e));
  px(ctx, x, y, w, h, P.e);
  px(ctx, x, y, Math.max(1, w - 1), Math.max(1, h - 1), P.el);
}
/** Angry slanted brow above an eye (body coloured, cuts into the glow). */
const brow = (ctx: Ctx, P: Pal, x: number, y: number, w: number, dir: 1 | -1) => { for (let i = 0; i < w; i++) px(ctx, x + i, y + (dir > 0 ? i : w - 1 - i) * 0.5 - 1, 1, 1, P.k0); };
/** A glowing mark: halo plus bright line. */
function mark(ctx: Ctx, x: number, y: number, w: number, h: number, c: string, core?: string) {
  alpha(ctx, 0.3, () => px(ctx, x - 1, y - 1, w + 2, h + 2, c));
  px(ctx, x, y, w, h, c);
  if (core && w * h > 2) px(ctx, x + (w > 2 ? 1 : 0), y + (h > 2 ? 1 : 0), Math.max(1, w - 2), Math.max(1, h - 2), core);
}
function orb(ctx: Ctx, x: number, y: number, r: number, c: string, core: string) {
  alpha(ctx, 0.22, () => ellipse(ctx, x, y, r + 2, r + 2, c));
  alpha(ctx, 0.5, () => ellipse(ctx, x, y, r + 1, r + 1, c));
  ellipse(ctx, x, y, r, r, c);
  if (r >= 2) ellipse(ctx, x - 0.5, y - 0.5, Math.max(1, r - 1.5), Math.max(1, r - 1.5), core);
}
function seg(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, w: number, c: string) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let i = 0; i <= n; i++) { const t = i / n; px(ctx, x0 + (x1 - x0) * t - w / 2 + 0.01, y0 + (y1 - y0) * t, w, 1, c); }
}
const fangs = (ctx: Ctx, x: number, y: number, n: number, c = '#f4f0ff') => { for (let i = 0; i < n; i++) px(ctx, x + i * 2, y, 1, 2, c); };

// ------------------------------------------------------------------ bodies
const painters: Record<string, Painter> = {
  // Training dummy: a black post and straw body, glowing target rings and stitched eyes.
  dummy(ctx, w, h, P, p) {
    const cx = w / 2 + p.dx * 0.5, base = h - 4, lean = p.tint ? -2 : p.open ? 2 : 0, hx = cx + lean * 1.5;
    px(ctx, cx - 2, base - 22, 4, 22, P.k1); px(ctx, cx - 7, base - 3, 14, 3, P.k0); px(ctx, cx - 1, base - 22, 1, 20, P.k3);
    ellipse(ctx, cx + lean, base - 30, 9, 11, P.k2);
    for (const y of [-36, -30, -24]) px(ctx, cx - 9 + lean, base + y, 18, 1, P.k0);
    for (let i = 0; i < 5; i++) px(ctx, cx - 6 + i * 3 + lean, base - 40, 1, 3, P.k3);
    px(ctx, cx - 14 + lean, base - 33, 28, 3, P.k1);
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) px(ctx, cx + lean + s * (15 + i), base - 34 + i, 1, 2, P.k3);
    ellipse(ctx, hx, base - 46, 7, 7, P.k2);
    // stitched X eyes and a glowing target on the chest
    for (const ex of [-3, 2]) { px(ctx, hx + ex, base - 48, 1, 1, P.e); px(ctx, hx + ex + 1, base - 47, 1, 1, P.el); px(ctx, hx + ex + 2, base - 48, 1, 1, P.e); px(ctx, hx + ex, base - 46, 1, 1, P.e); px(ctx, hx + ex + 2, base - 46, 1, 1, P.e); }
    ctx.strokeStyle = P.g; ctx.lineWidth = 1;
    for (const r of [5, 2.5]) { ctx.beginPath(); ctx.arc(cx + lean + 0.5, base - 27.5, r, 0, Math.PI * 2); ctx.stroke(); }
    mark(ctx, cx + lean, base - 28, 1, 1, P.gl);
  },

  // Slime: an inky jelly with a glowing nucleus, bubbles and a bright rim at the base.
  slime(ctx, w, h, P, p) {
    // Jelly wobble: width and height trade places twice per cycle.
    const wob = Math.sin(p.ph * Math.PI * 4) * 0.05;
    const cx = w / 2 + p.dx, base = h - 4, rx = 15 * p.sx * (1 + wob), ry = 12 * p.sy * (1 - wob), cy = base - ry;
    ellipse(ctx, cx, cy, rx, ry, P.k1);
    ellipse(ctx, cx - 2, cy - 2, rx * 0.78, ry * 0.7, P.k2);
    alpha(ctx, 0.45, () => ellipse(ctx, cx + 3, cy + 3, rx * 0.45, ry * 0.4, P.g));
    orb(ctx, cx + 3, cy + 3, 2, P.g, P.gl);
    for (const [bx, by, r] of [[-8, 4, 1], [9, -1, 1], [6, 6, 1]] as const) alpha(ctx, 0.8, () => ellipse(ctx, cx + bx, cy + by - p.t, r, r, P.g2));
    alpha(ctx, 0.6, () => px(ctx, cx - rx * 0.8, base - 1, rx * 1.6, 1, P.g));
    px(ctx, cx - 7, cy - ry * 0.55, 3, 1, P.k3); px(ctx, cx - 8, cy - ry * 0.45, 1, 2, P.k3);
    // drip crown
    poly(ctx, [[cx - 2, cy - ry + 1], [cx + 1, cy - ry - 5 - p.t], [cx + 3, cy - ry + 1]], P.k1);
    mark(ctx, cx + 1, cy - ry - 4 - p.t, 1, 2, P.g2);
    eye(ctx, P, cx - 8, cy - 2, 2, 3); eye(ctx, P, cx - 1, cy - 2, 2, 3);
    if (p.open) { px(ctx, cx - 6, cy + 4, 5, 2 + p.open * 2, P.k0); fangs(ctx, cx - 6, cy + 4, 3); }
  },

  // Horned rabbit: glowing inner ears, a spiral horn and a light-puff tail.
  rabbit(ctx, w, h, P, p) {
    const cx = w / 2 + p.dx, base = h - 4, hy = base - 16 + p.dy;
    px(ctx, cx - 4 + p.legs, base - 3, 4, 3, P.k0); px(ctx, cx + 6 - p.legs, base - 3, 5, 3, P.k0);
    ellipse(ctx, cx + 2, base - 9, 11 * p.sx, 8 * p.sy, P.k1);
    ellipse(ctx, cx + 1, base - 11, 8 * p.sx, 5 * p.sy, P.k2);
    orb(ctx, cx + 13, base - 11, 3, P.g2, P.gl);
    ellipse(ctx, cx - 8, hy, 7, 7, P.k1); ellipse(ctx, cx - 9, hy - 1, 5, 5, P.k2);
    px(ctx, cx - 11, hy - 15, 3, 10, P.k1); px(ctx, cx - 7, hy - 16, 3, 11, P.k1);
    mark(ctx, cx - 10, hy - 13, 1, 7, P.g); mark(ctx, cx - 6, hy - 14, 1, 7, P.g);
    // spiral horn
    for (let i = 0; i < 4; i++) mark(ctx, cx - 8 + (i % 2), hy - 9 - i * 2, 2, 1, i % 2 ? P.gl : P.g2);
    eye(ctx, P, cx - 13, hy - 2, 2, 3);
    px(ctx, cx - 15, hy + 3, 2, 1, P.k3);
    if (p.open) fangs(ctx, cx - 14, hy + 4, 2);
  },

  // Mushroom: bioluminescent spots on a dark cap, glowing gills and angry eyes.
  mushroom(ctx, w, h, P, p) {
    const cx = w / 2 + p.dx, base = h - 4, top = base - 20 * p.sy;
    px(ctx, cx - 6 + p.legs, base - 3, 4, 3, P.k0); px(ctx, cx + 2 - p.legs, base - 3, 4, 3, P.k0);
    px(ctx, cx - 7, base - 18 * p.sy, 14, 16 * p.sy, P.k1); px(ctx, cx - 5, base - 17 * p.sy, 3, 13 * p.sy, P.k2);
    ellipse(ctx, cx, top, 17 * p.sx, 10, P.k1);
    ellipse(ctx, cx - 3, top - 3, 12 * p.sx, 6, P.k2);
    alpha(ctx, 0.75, () => { for (let i = -12; i <= 12; i += 4) px(ctx, cx + i, top + 7, 2, 1, P.g); });
    for (const [x, y, r] of [[-8, -4, 2], [6, -2, 2], [1, -7, 2], [-13, 1, 1], [12, 2, 1]] as const) orb(ctx, cx + x, top + y, r, P.g, P.gl);
    eye(ctx, P, cx - 5, base - 14, 2, 2); eye(ctx, P, cx + 2, base - 14, 2, 2);
    brow(ctx, P, cx - 6, base - 15, 4, 1); brow(ctx, P, cx + 1, base - 15, 4, -1);
    if (p.open) px(ctx, cx - 3, base - 9, 5, 2, P.k0);
  },

  // Wasp: translucent neon wings with veins, glowing stripes and stinger, big compound eye.
  wasp(ctx, w, h, P, p) {
    const cx = w / 2 + p.dx, cy = h / 2 - 2 + p.dy;
    alpha(ctx, 0.35, () => { ellipse(ctx, cx + 2, cy - 10 - p.wing * 2, 8, 4, P.g2); ellipse(ctx, cx + 9, cy - 8 - p.wing * 2, 6, 3, P.g2); });
    alpha(ctx, 0.8, () => { seg(ctx, cx - 4, cy - 9 - p.wing * 2, cx + 9, cy - 11 - p.wing * 2, 1, P.g2); seg(ctx, cx + 4, cy - 7 - p.wing * 2, cx + 14, cy - 8 - p.wing * 2, 1, P.g2); });
    ellipse(ctx, cx + 7, cy + 3, 9 * p.sx, 7, P.k1);
    for (const sx of [3, 8, 13]) mark(ctx, cx + sx, cy - 2, 2, 10, P.g, P.gl);
    poly(ctx, [[cx + 15, cy + 2], [cx + 21 + p.open * 3, cy + 4], [cx + 15, cy + 6]], P.k0);
    mark(ctx, cx + 19 + p.open * 3, cy + 3, 2, 2, P.g2);
    px(ctx, cx - 2, cy + 6, 1, 5, P.k0); px(ctx, cx + 2, cy + 7, 1, 5, P.k0);
    ellipse(ctx, cx - 6, cy, 6, 6, P.k2); ellipse(ctx, cx - 5, cy - 1, 4, 4, P.k1);
    eye(ctx, P, cx - 11, cy - 3, 3, 4);
    px(ctx, cx - 9, cy - 9, 1, 4, P.k0); px(ctx, cx - 6, cy - 10, 1, 4, P.k0); mark(ctx, cx - 9, cy - 10, 1, 1, P.g); mark(ctx, cx - 6, cy - 11, 1, 1, P.g);
    if (p.open) fangs(ctx, cx - 11, cy + 4, 2);
  },

  // Goblin: wiry shadow with long ears, glowing war paint and a club studded with runes.
  goblin(ctx, w, h, P, p) {
    const cx = w / 2 + p.dx, base = h - 4;
    px(ctx, cx - 5 + p.legs, base - 10, 4, 10, P.k0); px(ctx, cx + 2 - p.legs, base - 10, 4, 10, P.k0);
    px(ctx, cx - 7, base - 24, 14, 15, P.k1); px(ctx, cx - 5, base - 23, 5, 12, P.k2);
    px(ctx, cx - 7, base - 14, 14, 2, P.k0); mark(ctx, cx - 1, base - 14, 2, 2, P.g2);
    mark(ctx, cx - 4, base - 21, 1, 4, P.g); mark(ctx, cx + 2, base - 21, 1, 4, P.g); mark(ctx, cx - 3, base - 18, 5, 1, P.g);
    ellipse(ctx, cx - 1, base - 31, 9, 8, P.k1); ellipse(ctx, cx - 2, base - 32, 6, 5, P.k2);
    poly(ctx, [[cx - 8, base - 34], [cx - 19, base - 38], [cx - 8, base - 30]], P.k1);
    poly(ctx, [[cx + 7, base - 34], [cx + 17, base - 38], [cx + 7, base - 30]], P.k1);
    px(ctx, cx - 9, base - 41, 15, 4, P.k2); px(ctx, cx + 6, base - 40, 4, 2, P.k2); mark(ctx, cx - 9, base - 38, 15, 1, P.g2);
    eye(ctx, P, cx - 7, base - 33, 2, 2); eye(ctx, P, cx - 1, base - 33, 2, 2);
    brow(ctx, P, cx - 8, base - 34, 4, 1); brow(ctx, P, cx - 2, base - 34, 4, -1);
    px(ctx, cx - 5, base - 27, 6, 1 + p.open, P.k0); fangs(ctx, cx - 5, base - 27, 3);
    const ax = cx - 12 - p.open * 4, ay = base - 26 - p.open * 6;
    px(ctx, ax, ay, 3, 14, P.k1); ellipse(ctx, ax + 1, ay - 2, 3, 4, P.k2);
    mark(ctx, ax, ay - 4, 1, 1, P.g2); mark(ctx, ax + 2, ay - 1, 1, 1, P.g2); mark(ctx, ax + 1, ay + 3, 1, 1, P.g2);
    px(ctx, cx + 7, base - 22, 3, 9, P.k1);
  },

  // Spore: a floating puffball with glowing pores and drifting light spores.
  spore(ctx, w, h, P, p) {
    const cx = w / 2 + p.dx, base = h - 6 + p.dy;
    for (let i = 0; i < 6; i++) { const sx = cx - 14 + i * 6 + Math.sin((p.ph + i / 6) * Math.PI * 2) * 1.5, sy = base - 34 - ((i * 7 + p.ph * 9) % 9); px(ctx, sx, sy, 2, 2, P.g); px(ctx, sx, sy, 1, 1, P.gl); }
    ellipse(ctx, cx, base - 16, 14 * p.sx, 14 * p.sy, P.k1);
    ellipse(ctx, cx - 3, base - 19, 9 * p.sx, 8 * p.sy, P.k2);
    for (const [x, y] of [[-8, -24], [6, -26], [9, -12], [-10, -10], [1, -6], [10, -20]]) orb(ctx, cx + x, base + y, 1, P.g, P.gl);
    eye(ctx, P, cx - 6, base - 18, 2, 3); eye(ctx, P, cx + 1, base - 18, 2, 3);
    brow(ctx, P, cx - 7, base - 19, 4, 1); brow(ctx, P, cx, base - 19, 4, -1);
    if (p.open) { ellipse(ctx, cx - 2, base - 11, 3, 1 + p.open * 2, P.k0); alpha(ctx, 0.6, () => ellipse(ctx, cx - 2, base - 11, 1, 1, P.g2)); }
    px(ctx, cx - 3, base - 3, 6, 4, P.k0);
  },

  // Wolf: a lean shadow hound with glowing spines down its back and a burning eye.
  wolf(ctx, w, h, P, p) {
    const cx = w / 2 + p.dx, base = h - 4;
    // Four legs in a trot: diagonal pairs move together; a leg swinging forward is lifted.
    for (const [x, o] of [[-14, 0], [-6, 0.5], [6, 0.5], [13, 0]] as const) {
      const a = Math.sin((p.ph + o) * Math.PI * 2) * Math.min(1, Math.abs(p.legs)), lift = Math.max(0, Math.cos((p.ph + o) * Math.PI * 2)) * 2 * Math.min(1, Math.abs(p.legs));
      px(ctx, cx + x - a * 2.5, base - 9, 4, 9 - lift, P.k0); px(ctx, cx + x - a * 2.5 - 1, base - 2 - lift, 5, 2, P.k0);
    }
    ellipse(ctx, cx + 2, base - 15, 16 * p.sx, 8 * p.sy, P.k1);
    ellipse(ctx, cx, base - 17, 12 * p.sx, 4 * p.sy, P.k2);
    for (let i = -10; i <= 12; i += 5) { poly(ctx, [[cx + i - 1, base - 21], [cx + i + 1, base - 27 - (i % 2 ? 1 : 0)], [cx + i + 3, base - 21]], P.k1); mark(ctx, cx + i + 1, base - 25, 1, 3, P.g); }
    const tail = Math.sin(p.ph * Math.PI * 2) * 2.5;
    poly(ctx, [[cx + 15, base - 18], [cx + 26, base - 25 + tail], [cx + 24, base - 21 + tail * 0.5], [cx + 16, base - 14]], P.k1);
    mark(ctx, cx + 22, base - 23 + tail, 2, 1, P.g);
    ellipse(ctx, cx - 16, base - 19, 8, 7, P.k1); ellipse(ctx, cx - 17, base - 20, 5, 4, P.k2);
    px(ctx, cx - 27, base - 18, 9, 5, P.k1); px(ctx, cx - 28, base - 19, 2, 2, P.k3);
    poly(ctx, [[cx - 19, base - 24], [cx - 18, base - 32], [cx - 15, base - 25]], P.k1);
    poly(ctx, [[cx - 14, base - 24], [cx - 12, base - 32], [cx - 10, base - 25]], P.k1);
    mark(ctx, cx - 18, base - 29, 1, 3, P.g2);
    eye(ctx, P, cx - 20, base - 22, 3, 2);
    if (p.open) { px(ctx, cx - 27, base - 13, 9, 2, P.k0); alpha(ctx, 0.5, () => px(ctx, cx - 26, base - 13, 7, 1, P.g)); fangs(ctx, cx - 26, base - 14, 4); }
  },

  // Skeleton: dark bones with a glowing soul in the ribcage, burning sockets and a rune blade.
  skeleton(ctx, w, h, P, p) {
    const cx = w / 2 + p.dx, base = h - 4;
    px(ctx, cx - 5 + p.legs, base - 13, 3, 13, P.k3); px(ctx, cx + 2 - p.legs, base - 13, 3, 13, P.k3);
    px(ctx, cx - 6, base - 15, 12, 3, P.k3);
    orb(ctx, cx, base - 25, 3, P.g, P.gl);
    for (let i = 0; i < 4; i++) px(ctx, cx - 6, base - 31 + i * 4, 12, 2, P.k3);
    px(ctx, cx - 1, base - 32, 2, 18, P.k2);
    ellipse(ctx, cx, base - 39, 8, 8, P.k3); ellipse(ctx, cx - 1, base - 40, 6, 6, P.k2);
    px(ctx, cx - 6, base - 42, 4, 4, P.k0); px(ctx, cx + 1, base - 42, 4, 4, P.k0);
    eye(ctx, P, cx - 5, base - 41, 2, 2); eye(ctx, P, cx + 2, base - 41, 2, 2);
    px(ctx, cx - 3, base - 35, 6, 2, P.k0); fangs(ctx, cx - 3, base - 35, 3, P.k3);
    px(ctx, cx - 9, base - 47, 18, 4, P.k1); px(ctx, cx - 2, base - 51, 4, 4, P.k1); mark(ctx, cx - 9, base - 44, 18, 1, P.g2);
    const sx = cx - 13 - p.open * 3, sy = base - 34 - p.open * 6;
    px(ctx, sx, sy, 3, 18, P.k2); mark(ctx, sx + 1, sy + 1, 1, 15, P.g2); px(ctx, sx - 2, sy + 16, 7, 2, P.k1);
    ellipse(ctx, cx + 9, base - 24, 5, 7, P.k1); ellipse(ctx, cx + 9, base - 24, 3, 5, P.k2); mark(ctx, cx + 8, base - 26, 2, 4, P.g);
  },

  // Bat: wide shadow wings with glowing veins, ember eyes and pale fangs.
  bat(ctx, w, h, P, p) {
    const cx = w / 2 + p.dx, cy = h / 2 - 4 + p.dy - p.wing * 2, flap = 3 - 9 * p.wing;
    for (const dir of [-1, 1]) {
      poly(ctx, [[cx + dir * 4, cy], [cx + dir * 20, cy + flap - 7], [cx + dir * 17, cy + flap + 2], [cx + dir * 12, cy + flap], [cx + dir * 8, cy + 5]], P.k1);
      alpha(ctx, 0.7, () => { seg(ctx, cx + dir * 5, cy + 1, cx + dir * 19, cy + flap - 6, 1, P.g); seg(ctx, cx + dir * 7, cy + 3, cx + dir * 12, cy + flap, 1, P.g); });
    }
    ellipse(ctx, cx, cy + 1, 6 * p.sx, 7 * p.sy, P.k2); ellipse(ctx, cx, cy + 3, 4, 4, P.k1);
    poly(ctx, [[cx - 5, cy - 4], [cx - 4, cy - 11], [cx - 2, cy - 5]], P.k2); poly(ctx, [[cx + 2, cy - 5], [cx + 4, cy - 11], [cx + 5, cy - 4]], P.k2);
    eye(ctx, P, cx - 4, cy - 2, 2, 2); eye(ctx, P, cx + 2, cy - 2, 2, 2);
    px(ctx, cx - 2, cy + 3, 1, 2 + p.open, '#f4f0ff'); px(ctx, cx + 1, cy + 3, 1, 2 + p.open, '#f4f0ff');
  },

  // Crab: an armoured shell with glowing seams, glowing claw tips and eyes on stalks.
  crab(ctx, w, h, P, p) {
    const cx = w / 2 + p.dx, base = h - 4, pinch = p.open * 4;
    for (let i = -1; i <= 1; i++) { const a = Math.sin((p.ph + i / 3) * Math.PI * 2) * 1.5; px(ctx, cx - 16 + i * 3 + a, base - 6, 2, 6 - Math.max(0, a), P.k0); px(ctx, cx + 14 - i * 3 - a, base - 6, 2, 6 - Math.max(0, -a), P.k0); }
    ellipse(ctx, cx, base - 9, 14 * p.sx, 8 * p.sy, P.k1);
    ellipse(ctx, cx - 2, base - 11, 10 * p.sx, 5 * p.sy, P.k2);
    alpha(ctx, 0.9, () => { seg(ctx, cx - 9, base - 7, cx + 9, base - 7, 1, P.g); px(ctx, cx - 1, base - 14, 1, 6, P.g); });
    for (const s of [-1, 1]) {
      const x = cx + s * (18 + pinch), y = base - 16 - pinch;
      seg(ctx, cx + s * 11, base - 10, x, y + 2, 2, P.k1);
      ellipse(ctx, x, y, 5, 4, P.k2);
      px(ctx, x + (s < 0 ? -3 : 0), y - 5, 3, 3, P.k1);
      mark(ctx, x + (s < 0 ? -3 : 2), y - 5, 1, 2, P.g2);
    }
    px(ctx, cx - 5, base - 21, 1, 5, P.k1); px(ctx, cx + 4, base - 21, 1, 5, P.k1);
    eye(ctx, P, cx - 6, base - 24, 3, 3); eye(ctx, P, cx + 3, base - 24, 3, 3);
  },

  // Golem: cracked black stone, molten veins in its colour and a glowing core.
  golem(ctx, w, h, P, p) {
    const cx = w / 2 + p.dx, base = h - 4, arm = p.open * 6;
    px(ctx, cx - 11 + p.legs, base - 12, 8, 12, P.k0); px(ctx, cx + 3 - p.legs, base - 12, 8, 12, P.k0);
    px(ctx, cx - 14, base - 34, 28, 23, P.k1);
    px(ctx, cx - 13, base - 33, 13, 10, P.k2); px(ctx, cx - 14, base - 34, 28, 2, P.k3);
    alpha(ctx, 0.95, () => {
      seg(ctx, cx - 10, base - 30, cx - 4, base - 24, 1, P.g); seg(ctx, cx - 4, base - 24, cx - 6, base - 15, 1, P.g);
      seg(ctx, cx + 11, base - 31, cx + 5, base - 22, 1, P.g); seg(ctx, cx + 5, base - 22, cx + 9, base - 14, 1, P.g);
    });
    orb(ctx, cx, base - 24, 3, P.g2, P.gl);
    px(ctx, cx - 8, base - 44, 16, 11, P.k1); px(ctx, cx - 7, base - 43, 8, 5, P.k2);
    px(ctx, cx - 7, base - 40, 5, 3, P.k0); px(ctx, cx + 2, base - 40, 5, 3, P.k0);
    eye(ctx, P, cx - 6, base - 40, 4, 2); eye(ctx, P, cx + 2, base - 40, 4, 2);
    for (const s of [-1, 1]) {
      const ax = s < 0 ? cx - 22 : cx + 14;
      px(ctx, ax, base - 32 - arm, 8, 18, P.k1); px(ctx, ax + 1, base - 31 - arm, 3, 8, P.k2);
      mark(ctx, ax + 3, base - 18 - arm, 2, 1, P.g); px(ctx, ax - 1, base - 15 - arm, 10, 3, P.k0);
    }
  },

  // Ghost: a translucent shadow wisp outlined in light, with hollow glowing eyes.
  ghost(ctx, w, h, P, p) {
    const cx = w / 2 + p.dx, base = h - 8 + p.dy - p.wing * 2;
    const body = () => {
      ellipse(ctx, cx, base - 20, 12 * p.sx, 14 * p.sy, P.k2);
      px(ctx, cx - 12, base - 20, 24, 12, P.k2);
      for (let i = 0; i < 4; i++) ellipse(ctx, cx - 9 + i * 6, base - 7 + Math.sin((p.ph + i / 4) * Math.PI * 2) * 1.5, 3, 3, P.k2);
    };
    alpha(ctx, 0.35, () => { ctx.save(); ctx.translate(0, -1); body(); ctx.restore(); });
    // glowing outline: draw the body in the glow colour one pixel bigger, then the dark body inside
    alpha(ctx, 0.7, () => {
      ellipse(ctx, cx, base - 20, 12 * p.sx + 1, 14 * p.sy + 1, P.g);
      px(ctx, cx - 13, base - 20, 26, 12, P.g);
      for (let i = 0; i < 4; i++) ellipse(ctx, cx - 9 + i * 6, base - 7 + Math.sin((p.ph + i / 4) * Math.PI * 2) * 1.5, 4, 4, P.g);
    });
    alpha(ctx, 0.92, body);
    alpha(ctx, 0.8, () => ellipse(ctx, cx - 3, base - 25, 6, 5, P.k3));
    for (const s of [-1, 1]) poly(ctx, [[cx + s * 11, base - 22], [cx + s * (18 + p.open * 3), base - 19], [cx + s * 11, base - 16]], P.k2);
    px(ctx, cx - 7, base - 25, 4, 5, P.k0); px(ctx, cx + 2, base - 25, 4, 5, P.k0);
    eye(ctx, P, cx - 6, base - 24, 2, 3); eye(ctx, P, cx + 3, base - 24, 2, 3);
    ellipse(ctx, cx - 1, base - 16, 2, 1 + p.open * 2, P.k0);
    alpha(ctx, 0.5, () => ellipse(ctx, cx - 1, base - 16, 1, p.open, P.g2));
  },

  // Scorpion: segmented black armour, glowing joints and a burning stinger.
  scorpion(ctx, w, h, P, p) {
    const cx = w / 2 + p.dx, base = h - 4, sting = p.open * 5, sway = Math.sin(p.ph * Math.PI * 2) * 1.5;
    for (let i = 0; i < 4; i++) { seg(ctx, cx - 9 + i * 5, base - 6, cx - 11 + i * 5 + Math.sin((p.ph + i * 0.25) * Math.PI * 2) * 2 * Math.min(1, Math.abs(p.legs) + 0.2), base, 1, P.k0); }
    ellipse(ctx, cx, base - 8, 13 * p.sx, 6 * p.sy, P.k1); ellipse(ctx, cx - 1, base - 9, 9 * p.sx, 3 * p.sy, P.k2);
    for (let i = -8; i <= 8; i += 4) mark(ctx, cx + i, base - 12, 1, 1, P.g);
    for (let i = 0; i < 4; i++) { const sw = sway * (i / 3); ellipse(ctx, cx + 12 + i * 3 + sw, base - 12 - i * 5, 4, 3, i % 2 ? P.k1 : P.k2); mark(ctx, cx + 12 + i * 3 + sw, base - 14 - i * 5, 1, 1, P.g); }
    ellipse(ctx, cx + 20 - sting + sway, base - 33 + sting, 4, 4, P.k1);
    poly(ctx, [[cx + 17 - sting + sway, base - 34 + sting], [cx + 11 - sting + sway, base - 30 + sting], [cx + 17 - sting + sway, base - 30 + sting]], P.k0);
    orb(ctx, cx + 20 - sting + sway, base - 33 + sting, 2, P.g2, P.gl);
    for (const y of [-12, -9]) { ellipse(ctx, cx - 17, base + y + 2, 5, 3, P.k1); }
    ellipse(ctx, cx - 22, base - 12, 4, 3, P.k2); px(ctx, cx - 27, base - 15, 3, 2, P.k1); px(ctx, cx - 27, base - 11, 3, 2, P.k1);
    mark(ctx, cx - 27, base - 15, 1, 1, P.g2);
    eye(ctx, P, cx - 11, base - 13, 2, 2); eye(ctx, P, cx - 7, base - 13, 2, 2); eye(ctx, P, cx - 9, base - 15, 1, 1);
  },

  // Drake: a black wyrmling with glowing wing veins, belly scales and fire in its throat.
  drake(ctx, w, h, P, p) {
    const cx = w / 2 + p.dx, base = h - 4, wy = base - 38 - p.wing * 4;
    poly(ctx, [[cx - 1, base - 21], [cx + 10, wy], [cx + 20, base - 25], [cx + 13, base - 22]], P.k1);
    alpha(ctx, 0.8, () => { seg(ctx, cx + 2, base - 22, cx + 10, wy + 2, 1, P.g); seg(ctx, cx + 10, wy + 2, cx + 18, base - 25, 1, P.g); seg(ctx, cx + 10, wy + 2, cx + 12, base - 23, 1, P.g); });
    px(ctx, cx - 9 + p.legs, base - 8, 4, 8, P.k0); px(ctx, cx + 5 - p.legs, base - 8, 4, 8, P.k0);
    ellipse(ctx, cx, base - 15, 12 * p.sx, 9 * p.sy, P.k1); ellipse(ctx, cx - 1, base - 17, 8 * p.sx, 5 * p.sy, P.k2);
    for (let i = -6; i <= 4; i += 3) mark(ctx, cx + i, base - 9, 2, 1, P.g);
    px(ctx, cx + 10, base - 14, 10, 4, P.k1); poly(ctx, [[cx + 19, base - 16], [cx + 26, base - 20], [cx + 22, base - 12]], P.k1);
    mark(ctx, cx + 23, base - 18, 1, 2, P.g2);
    ellipse(ctx, cx - 14, base - 24, 8, 6, P.k1); ellipse(ctx, cx - 15, base - 25, 5, 4, P.k2);
    px(ctx, cx - 24, base - 24, 9, 4, P.k1); px(ctx, cx - 25, base - 24, 2, 1, P.k3);
    poly(ctx, [[cx - 17, base - 28], [cx - 15, base - 36], [cx - 13, base - 29]], P.k2); poly(ctx, [[cx - 12, base - 28], [cx - 9, base - 35], [cx - 9, base - 28]], P.k2);
    mark(ctx, cx - 15, base - 34, 1, 2, P.g2); mark(ctx, cx - 10, base - 33, 1, 2, P.g2);
    eye(ctx, P, cx - 18, base - 27, 3, 2);
    if (p.open) {
      px(ctx, cx - 24, base - 21, 7, 2, P.k0);
      orb(ctx, cx - 30, base - 22, 2 + p.open * 1.5, P.g2, '#fff6d0'); alpha(ctx, 0.6, () => orb(ctx, cx - 36, base - 23, 1 + p.open, P.g, P.gl));
    }
  },

  // Goblin King: a hulking shadow in bark armour, a crown of glowing thorns and a rune club.
  goblin_king(ctx, w, h, P, p) {
    const cx = w / 2 + p.dx, base = h - 6;
    px(ctx, cx - 16 + p.legs * 2, base - 22, 12, 22, P.k0); px(ctx, cx + 4 - p.legs * 2, base - 22, 12, 22, P.k0);
    px(ctx, cx - 18, base - 4, 14, 4, P.k1); px(ctx, cx + 4, base - 4, 14, 4, P.k1);
    ellipse(ctx, cx, base - 44, 26 * p.sx, 24 * p.sy, P.k1);
    px(ctx, cx - 20, base - 52, 40, 22, P.k2); px(ctx, cx - 18, base - 51, 16, 10, P.k3);
    for (let i = -18; i <= 14; i += 8) { px(ctx, cx + i, base - 56, 4, 6, P.k1); mark(ctx, cx + i + 1, base - 56, 2, 2, P.g); }
    px(ctx, cx - 20, base - 33, 40, 4, P.k0);
    orb(ctx, cx, base - 31, 3, P.g2, P.gl);
    for (const [a, b, c2, d] of [[-14, -48, -6, -40], [6, -48, 14, -40], [-4, -46, 4, -38]]) alpha(ctx, 0.9, () => seg(ctx, cx + a, base + b, cx + c2, base + d, 1, P.g));
    ellipse(ctx, cx - 2, base - 74, 16, 14, P.k1); ellipse(ctx, cx - 4, base - 76, 11, 9, P.k2);
    poly(ctx, [[cx - 16, base - 78], [cx - 34, base - 86], [cx - 16, base - 72]], P.k1);
    poly(ctx, [[cx + 12, base - 78], [cx + 30, base - 86], [cx + 12, base - 72]], P.k1);
    eye(ctx, P, cx - 11, base - 78, 4, 3); eye(ctx, P, cx + 2, base - 78, 4, 3);
    brow(ctx, P, cx - 12, base - 80, 6, 1); brow(ctx, P, cx + 1, base - 80, 6, -1);
    px(ctx, cx - 9, base - 67, 14, 3 + p.open * 2, P.k0); fangs(ctx, cx - 8, base - 67, 7);
    alpha(ctx, 0.5, () => px(ctx, cx - 8, base - 65, 12, 1 + p.open, P.g2));
    px(ctx, cx - 14, base - 90, 26, 5, P.k1);
    for (let i = -14; i <= 10; i += 6) { poly(ctx, [[cx + i, base - 90], [cx + i + 1.5, base - 99], [cx + i + 3, base - 90]], P.k1); mark(ctx, cx + i + 1, base - 98, 1, 2, P.g2); }
    mark(ctx, cx - 14, base - 87, 26, 1, P.g2);
    px(ctx, cx + 22, base - 54, 8, 22, P.k1);
    const ax = cx - 34 - p.open * 6, ay = base - 70 - p.open * 14;
    px(ctx, cx - 30, base - 54, 8, 20, P.k1);
    px(ctx, ax, ay, 6, 40, P.k0); ellipse(ctx, ax + 3, ay - 2, 9, 11, P.k1); ellipse(ctx, ax + 2, ay - 4, 6, 7, P.k2);
    for (const [x, y] of [[-8, -6], [8, -2], [0, -12], [-6, 6], [7, 8], [1, 1]]) mark(ctx, ax + 3 + x, ay + y, 2, 2, P.g, P.gl);
  },
};


// ------------------------------------------------------------------ texture and volume
type Material = 'gel' | 'fur' | 'fungus' | 'chitin' | 'skin' | 'spore' | 'bone' | 'membrane' | 'stone' | 'mist' | 'scales' | 'bark' | 'straw';
const MATERIAL: Record<string, Material> = {
  slime: 'gel', rabbit: 'fur', mushroom: 'fungus', wasp: 'chitin', goblin: 'skin', spore: 'spore', wolf: 'fur', skeleton: 'bone',
  bat: 'membrane', crab: 'chitin', golem: 'stone', ghost: 'mist', scorpion: 'chitin', drake: 'scales', goblin_king: 'bark', dummy: 'straw',
};
/** How shiny each material is (specular strength) and how much light passes into it (gel, mist). */
const GLOSS: Record<Material, number> = { gel: 1, fur: 0.05, fungus: 0.15, chitin: 0.7, skin: 0.25, spore: 0.2, bone: 0.35, membrane: 0.3, stone: 0.1, mist: 0.2, scales: 0.8, bark: 0.1, straw: 0.05 };

const hash2 = (x: number, y: number) => ((Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) ^ 0x5bd1e995) >>> 0;
const rnd = (x: number, y: number) => {
  let h = hash2(x, y); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
/** Smooth value noise in 0..1. */
function vnoise(x: number, y: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = rnd(x0, y0), b = rnd(x0 + 1, y0), c = rnd(x0, y0 + 1), d = rnd(x0 + 1, y0 + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
/** Cells (scales, stones, pores): distance to the nearest cell centre f1 and to the second f2. */
function cells(x: number, y: number, size: number): [number, number] {
  const gx = Math.floor(x / size), gy = Math.floor(y / size);
  let f1 = 9, f2 = 9;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = (gx + i + 0.15 + rnd(gx + i, gy + j) * 0.7) * size, cy = (gy + j + 0.15 + rnd(gy + j, gx + i + 99) * 0.7) * size;
    const d = Math.hypot(x - cx, y - cy) / size;
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
  }
  return [f1, f2];
}
/** Surface relief of a material at a body point: -1 (groove, shadow) .. 1 (raised, lit). */
function relief(m: Material, x: number, y: number, seed: number): number {
  switch (m) {
    case 'fur': { const n = rnd(Math.floor(x + y * 0.35), Math.floor(y / 3) + seed); return (n - 0.5) * 1.4 + (vnoise(x / 4, y / 4) - 0.5) * 0.6; }
    case 'straw': return (rnd(Math.floor(x), Math.floor(y / 4) + seed) - 0.5) * 1.6;
    case 'scales': { const [f1, f2] = cells(x + (Math.floor(y / 3) % 2) * 1.5, y * 1.3, 3.2); return f2 - f1 < 0.12 ? -1 : 0.7 - f1 * 1.2; }
    case 'stone': { const [f1, f2] = cells(x, y, 5.5); return f2 - f1 < 0.09 ? -1.2 : (vnoise(x / 2, y / 2) - 0.5) * 0.9 + (rnd(x | 0, y | 0) - 0.5) * 0.4; }
    case 'chitin': return Math.sin(y * 1.15 + vnoise(x / 6, y / 6) * 2) * 0.55 + (vnoise(x / 3, y / 3) - 0.5) * 0.3;
    case 'bone': return Math.sin(y * 0.9 + x * 0.15) * 0.25 + (vnoise(x / 2, y / 5) - 0.5) * 0.7 - (rnd(x | 0, y | 0) > 0.94 ? 0.8 : 0);
    case 'spore': { const [f1] = cells(x, y, 3.5); return f1 < 0.22 ? -1 : (vnoise(x / 3, y / 3) - 0.5) * 0.6; }
    case 'fungus': return (vnoise(x / 2.5, y / 2.5) - 0.5) * 0.9 + (rnd(x | 0, y | 0) - 0.5) * 0.3;
    case 'membrane': return (vnoise(x / 5, y / 2) - 0.5) * 0.8 + (Math.abs(vnoise(x / 3, y / 3) - 0.5) < 0.04 ? -0.9 : 0);
    case 'bark': return (vnoise(x / 1.5, y / 6) - 0.5) * 1.5 + (rnd(Math.floor(x / 2), Math.floor(y / 7)) - 0.5) * 0.4;
    case 'mist': return (vnoise(x / 3, y / 8 - seed * 0.3) - 0.5) * 1.1;
    case 'gel': return (vnoise(x / 6, y / 6) - 0.5) * 0.3;
    case 'skin': return (vnoise(x / 2, y / 2) - 0.5) * 0.6 + (rnd(x | 0, y | 0) > 0.95 ? 0.6 : 0);
  }
}

/**
 * Gives the flat silhouette volume and a surface: a height map from the distance to the edge
 * (bodies bulge in the middle), lit from the upper left with soft shadow underneath, the material's
 * relief and sheen, and light coloured by the monster. Bright glowing parts (eyes, marks) stay as they are.
 */
function sculpt(ctx: Ctx, w: number, h: number, def: MonsterDef, P: Pal, p: MPose) {
  const m = MATERIAL[def.art.shape] ?? 'skin', gloss = GLOSS[m];
  const img = ctx.getImageData(0, 0, w, h), d = img.data, n = w * h;
  // Distance to the silhouette edge (chamfer 3-4).
  const dist = new Float32Array(n);
  for (let i = 0; i < n; i++) dist[i] = d[i * 4 + 3] > 100 ? 1e4 : 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!dist[i]) continue;
    let v = dist[i];
    if (x > 0) v = Math.min(v, dist[i - 1] + 3); else v = Math.min(v, 3);
    if (y > 0) { v = Math.min(v, dist[i - w] + 3); if (x > 0) v = Math.min(v, dist[i - w - 1] + 4); if (x < w - 1) v = Math.min(v, dist[i - w + 1] + 4); } else v = Math.min(v, 3);
    dist[i] = v;
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x; if (!dist[i]) continue;
    let v = dist[i];
    if (x < w - 1) v = Math.min(v, dist[i + 1] + 3); else v = Math.min(v, 3);
    if (y < h - 1) { v = Math.min(v, dist[i + w] + 3); if (x < w - 1) v = Math.min(v, dist[i + w + 1] + 4); if (x > 0) v = Math.min(v, dist[i + w - 1] + 4); } else v = Math.min(v, 3);
    dist[i] = v;
  }
  const R = Math.max(3, Math.min(w, h) * 0.16) * 3;
  const H = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : Math.sqrt(Math.min(1, dist[y * w + x] / R)));
  const [tr, tg, tb] = toRgb(def.art.colors[0] ?? '#808080'), [gr, gg, gb] = toRgb(P.gl);
  const L = [-0.55, -0.7, 0.45], Ll = Math.hypot(L[0], L[1], L[2]);
  const seed = def.id.length * 7;
  // Texture stays on the body as it moves.
  const ox = Math.round(p.dx), oy = Math.round(p.dy);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, o = i * 4;
    if (d[o + 3] < 100) continue;
    const r = d[o], g = d[o + 1], b = d[o + 2];
    if (Math.max(r, g, b) > 95) continue; // glowing parts, teeth, highlights
    const bx = x - ox, by = y - oy;
    const rel = relief(m, bx, by, seed);
    // Normal from the height map plus the material's relief.
    const nx = (H(x - 1, y) - H(x + 1, y)) * 2.2 + (relief(m, bx - 1, by, seed) - relief(m, bx + 1, by, seed)) * 0.18;
    const ny = (H(x, y - 1) - H(x, y + 1)) * 2.2 + (relief(m, bx, by - 1, seed) - relief(m, bx, by + 1, seed)) * 0.18;
    const nl = Math.hypot(nx, ny, 1);
    const diff = Math.max(0, (nx * L[0] + ny * L[1] + L[2]) / (nl * Ll));
    const spec = gloss * Math.pow(diff, 12) * (0.4 + 0.6 * H(x, y));
    // Underside and deep folds darker (ambient occlusion).
    const ao = 0.62 + 0.38 * Math.min(1, H(x, y) * 1.6) - Math.max(0, (y - h * 0.6) / h) * 0.35;
    const k = Math.max(0.22, (0.4 + 1.15 * diff + rel * 0.34) * ao);
    // Base keeps the dark shadow look; light picks up the monster's own colour.
    const lit = (0.3 + rel * 0.08) * diff * ao;
    let nr = r * k + tr * lit, ng = g * k + tg * lit, nb = b * k + tb * lit;
    if (m === 'gel' || m === 'mist') { const sub = H(x, y) * 0.22; nr += gr * sub * 0.35; ng += gg * sub * 0.35; nb += gb * sub * 0.35; }
    nr += gr * spec * 0.55 + 255 * spec * 0.25; ng += gg * spec * 0.55 + 255 * spec * 0.25; nb += gb * spec * 0.55 + 255 * spec * 0.25;
    d[o] = Math.min(132, nr); d[o + 1] = Math.min(132, ng); d[o + 2] = Math.min(132, nb);
  }
  ctx.putImageData(img, 0, 0);
}

/** Neon rim light: dark body pixels on the upper and outer edges pick up the glow colour. */
function rimLight(ctx: Ctx, w: number, h: number, glow: string) {
  const img = ctx.getImageData(0, 0, w, h), d = img.data, [gr, gg, gb] = toRgb(glow);
  const a = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[(y * w + x) * 4 + 3]);
  const rim: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (d[i + 3] < 200 || Math.max(d[i], d[i + 1], d[i + 2]) > 110) continue;
    const top = a(x, y - 1) < 60, side = a(x - 1, y) < 60 || a(x + 1, y) < 60;
    if (top || side) rim.push(i, top ? 0.5 : 0.25);
  }
  for (let k = 0; k < rim.length; k += 2) {
    const i = rim[k], t = rim[k + 1];
    d[i] += (gr - d[i]) * t; d[i + 1] += (gg - d[i + 1]) * t; d[i + 2] += (gb - d[i + 2]) * t;
  }
  ctx.putImageData(img, 0, 0);
}

/** Sheets drawn for the old 13-frame layout (idle 2, walk 4, attack 3, hit 1, death 3) still work:
 *  their frames are spread over the longer clips. */
const OLD_LAYOUT: Record<MonAnim, [number, number]> = { idle: [0, 2], walk: [2, 4], attack: [6, 3], hit: [9, 1], death: [10, 3] };
function fromOldLayout(img: HTMLCanvasElement, w: number, h: number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(w * MON_SHEET_COLS, h);
  const sw = img.width / 13;
  for (const [anim, meta] of Object.entries(MON_ANIMS) as [MonAnim, typeof MON_ANIMS[MonAnim]][]) {
    const [s0, sn] = OLD_LAYOUT[anim];
    for (let f = 0; f < meta.count; f++) ctx.drawImage(img, (s0 + Math.min(sn - 1, Math.floor((f * sn) / meta.count))) * sw, 0, sw, img.height, (meta.start + f) * w, 0, w, h);
  }
  return canvas;
}

/** Erases a growing share of the body's pixels (a fixed pattern, so frames follow each other). */
function melt(ctx: Ctx, w: number, h: number, amount: number) {
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // Hashed noise (no stripes), the top going first.
    const n = (((Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0) % 1000) / 1000;
    if (n < amount * 1.35 - (y / h) * 0.35) d[(y * w + x) * 4 + 3] = 0;
  }
  ctx.putImageData(img, 0, 0);
}

export function generateMonsterSheet(def: MonsterDef): HTMLCanvasElement {
  const { w, h, shape } = def.art;
  const drawn = spriteOverride(`sprites/monster/${def.id}`);
  if (drawn) {
    // A sheet drawn in the Studio: in the old 13-frame layout when its shape says so, otherwise the current one.
    const ratio = drawn.width / drawn.height;
    const old = Math.abs(ratio - (13 * w) / h) < Math.abs(ratio - (MON_SHEET_COLS * w) / h);
    return old ? fromOldLayout(overrideCanvas(`sprites/monster/${def.id}`, w * 13, h)!, w, h) : overrideCanvas(`sprites/monster/${def.id}`, w * MON_SHEET_COLS, h)!;
  }
  const P = palette(def);
  const { canvas, ctx } = makeCanvas(w * MON_SHEET_COLS, h);
  const paint = painters[shape] ?? painters.slime;
  const tmp = makeCanvas(w, h);
  for (const [anim, meta] of Object.entries(MON_ANIMS) as [MonAnim, typeof MON_ANIMS[MonAnim]][]) {
    for (let f = 0; f < meta.count; f++) {
      const p = pose(anim, f);
      const c = tmp.ctx;
      c.clearRect(0, 0, w, h);
      c.save();
      // Tilt and squash about the feet.
      c.translate(w / 2, h - 3);
      if (p.rot) c.rotate(p.rot);
      if (p.flat) c.scale(1 + p.flat * 0.3, 1 - p.flat * 0.7);
      c.translate(-w / 2, -(h - 3));
      // Scaled art (bosses that reuse a regular body type): paint at 1/scale size, magnified about the feet.
      const k = def.art.scale ?? 1;
      if (k !== 1) { c.translate(w / 2, h - 2); c.scale(k, k); c.translate(-w / (2 * k), -(h / k - 2 / k)); }
      paint(c, k !== 1 ? Math.round(w / k) : w, k !== 1 ? Math.round(h / k) : h, P, p);
      c.restore();
      sculpt(c, w, h, def, P, p);
      rimLight(c, w, h, P.g);
      addOutline(c, 0, 0, w, h, '#05040a');
      if (p.tint) {
        c.globalCompositeOperation = 'source-atop';
        c.fillStyle = p.tint;
        c.fillRect(0, 0, w, h);
        c.globalCompositeOperation = 'source-over';
      }
      if (p.melt) {
        melt(c, w, h, p.melt);
        // Glowing motes rising from the body as it fades.
        for (let i = 0; i < 9; i++) {
          const mx = w * (0.2 + ((i * 37) % 60) / 100), my = h - 6 - ((i * 23) % 20) - p.melt * h * 0.35;
          c.globalAlpha = 0.9 * (1 - p.melt * 0.6);
          px(c, mx, my, i % 3 ? 1 : 2, i % 3 ? 1 : 2, i % 2 ? P.g : P.gl);
        }
        c.globalAlpha = 1;
      }
      // Slash arc in front (the sheet faces left) and a spark at the moment of impact.
      if (p.swoosh) {
        const r = Math.min(w, h) * 0.42, cx = w / 2 + p.dx * 0.5, cy = h * 0.55;
        c.lineCap = 'round';
        for (const [lw, col, al] of [[4, P.g, 0.25], [2, P.g, 0.7], [1, P.gl, 1]] as const) {
          c.globalAlpha = al * p.swoosh; c.strokeStyle = col; c.lineWidth = lw;
          c.beginPath(); c.arc(cx, cy, r, Math.PI * 0.62, Math.PI * (0.62 + 0.75 * p.swoosh)); c.stroke();
        }
        c.globalAlpha = 1;
      }
      if (p.spark) {
        const sx = Math.max(3, w * 0.12), sy = h * 0.55;
        c.globalAlpha = 0.35; ellipse(c, sx, sy, 4, 4, P.g); c.globalAlpha = 1;
        px(c, sx - 4, sy, 9, 1, P.gl); px(c, sx, sy - 4, 1, 9, P.gl); px(c, sx - 1, sy - 1, 3, 3, '#ffffff');
      }
      // Afterimage behind a lunge: a faint copy of the body where it came from.
      if (p.blur) {
        const ghost = makeCanvas(w, h);
        ghost.ctx.globalAlpha = 0.28 * p.blur; ghost.ctx.drawImage(tmp.canvas, 7, 0); ghost.ctx.globalAlpha = 0.14 * p.blur; ghost.ctx.drawImage(tmp.canvas, 13, 0);
        ghost.ctx.globalCompositeOperation = 'source-atop'; ghost.ctx.fillStyle = P.g; ghost.ctx.globalAlpha = 0.35; ghost.ctx.fillRect(0, 0, w, h);
        c.globalCompositeOperation = 'destination-over'; c.drawImage(ghost.canvas, 0, 0); c.globalCompositeOperation = 'source-over';
      }
      // Ground shadow last, underneath (it shrinks as the body melts away).
      c.globalCompositeOperation = 'destination-over';
      ellipse(c, w / 2 + p.dx * 0.3, h - 4, Math.max(6, w * 0.3 * (1 - p.melt * 0.5) * p.sx), 3, `rgba(0,0,0,${0.3 * (1 - p.melt * 0.6)})`);
      c.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = p.alpha;
      ctx.drawImage(tmp.canvas, (meta.start + f) * w, 0);
      ctx.globalAlpha = 1;
    }
  }
  return canvas;
}

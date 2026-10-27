// Batch 001 combat & special VFX. Crisp pixels only: fades use ordered
// dithering instead of translucency, so effects stay pixel-perfect.
import { Pixmap, Sheet, rng, type RGBA } from './pixel';
import { R, type Ramp } from './palette';

const BAYER4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
/** Keep a pixel when its ordered-dither threshold is below `opacity` (0..1). */
const keep = (x: number, y: number, opacity: number) => BAYER4[y & 3][x & 3] / 16 < opacity;

export interface VfxDef {
  key: string; folder: string; fw: number; fh: number; frames: number; frameMs: number; loop: boolean;
  origin: { x: number; y: number }; blend: 'normal' | 'add'; attach: 'caster' | 'target' | 'world';
  impactFrame?: number; sound: string; draw: (f: number) => Pixmap;
}

function ring(p: Pixmap, cx: number, cy: number, r: number, ry: number, c: RGBA, opacity = 1, thick = 1) {
  for (let a = 0; a < Math.PI * 2; a += 0.5 / Math.max(r, 1)) {
    for (let t = 0; t < thick; t++) {
      const x = Math.round(cx + Math.cos(a) * (r - t)), y = Math.round(cy + Math.sin(a) * (ry - t * (ry / r)));
      if (keep(x, y, opacity)) p.set(x, y, c);
    }
  }
}

function star(p: Pixmap, x: number, y: number, size: number, ramp: Ramp) {
  p.set(x, y, ramp.l);
  for (let i = 1; i <= size; i++) {
    const c = i === size ? ramp.s : ramp.b;
    p.set(x + i, y, c); p.set(x - i, y, c); p.set(x, y + i, c); p.set(x, y - i, c);
  }
  if (size >= 2) { p.set(x + 1, y + 1, ramp.b); p.set(x - 1, y - 1, ramp.b); p.set(x + 1, y - 1, ramp.b); p.set(x - 1, y + 1, ramp.b); }
}

// ------------------------------------------------------------------ sword slash (64×64, 6 frames)
function slash(f: number): Pixmap {
  const p = new Pixmap(64, 64);
  const W = R.fx_white;
  // Crescent sweeping from upper-left to lower-right; head of the arc at angle `head`.
  const sweep = [0.15, 0.45, 0.85, 1.0, 1.0, 1.0][f];
  const fade = [1, 1, 1, 0.75, 0.45, 0.2][f];
  const cx = 30, cy = 34, r0 = 22;
  const start = -2.4, end = start + 2.8 * sweep;
  for (let a = start; a <= end; a += 0.01) {
    const t = (a - start) / (end - start + 1e-6); // 0 tail → 1 head
    const width = Math.max(1, Math.round(1 + 5 * Math.sin(t * Math.PI) * (f < 3 ? 1 : 0.7)));
    for (let k = 0; k < width; k++) {
      const r = r0 - k;
      const x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r * 0.85);
      const c = k === 0 ? W.l : k === 1 ? W.b : k < width - 1 ? W.s : W.d;
      if (keep(x, y, fade * (0.3 + t * 0.7))) p.set(x, y, c);
    }
  }
  if (f >= 2 && f <= 4) {
    const r = rng(f);
    for (let i = 0; i < 6 - f; i++) star(p, Math.round(cx + Math.cos(end) * r0 + (r() - 0.5) * 10), Math.round(cy + Math.sin(end) * r0 * 0.85 + (r() - 0.5) * 10), f === 2 ? 3 : 2, W);
  }
  if (f === 5) { star(p, 46, 46, 1, W); star(p, 40, 52, 1, W); }
  return p;
}

// ------------------------------------------------------------------ basic hit (48×48, 5 frames)
function hit(f: number): Pixmap {
  const p = new Pixmap(48, 48);
  const G = R.fx_gold, W = R.fx_white;
  const cx = 24, cy = 24;
  if (f === 0) { star(p, cx, cy, 3, W); }
  if (f === 1) { star(p, cx, cy, 6, W); ring(p, cx, cy, 6, 6, G.b); }
  if (f === 2) {
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; for (let k = 6; k < 13; k++) p.set(Math.round(cx + Math.cos(a) * k), Math.round(cy + Math.sin(a) * k), k < 9 ? W.l : G.b); }
    ring(p, cx, cy, 10, 10, G.l);
    star(p, cx, cy, 2, W);
  }
  if (f === 3) { for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.2; for (let k = 12; k < 17; k++) p.set(Math.round(cx + Math.cos(a) * k), Math.round(cy + Math.sin(a) * k), G.s); } ring(p, cx, cy, 14, 14, G.b, 0.6); }
  if (f === 4) { ring(p, cx, cy, 17, 17, G.s, 0.3); for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.6; p.set(Math.round(cx + Math.cos(a) * 18), Math.round(cy + Math.sin(a) * 18), G.l); } }
  return p;
}

// ------------------------------------------------------------------ heal (64×96, 10 frames)
function heal(f: number): Pixmap {
  const p = new Pixmap(64, 96);
  const H = R.fx_heal;
  const cx = 32, feet = 80;
  // Ground ring opens then fades.
  const ringR = [6, 14, 20, 24, 26, 27, 28, 28, 28, 28][f];
  const ringO = [1, 1, 1, 1, 0.9, 0.8, 0.6, 0.4, 0.25, 0.1][f];
  ring(p, cx, feet, ringR, ringR * 0.3, H.l, ringO, 2);
  ring(p, cx, feet, Math.max(2, ringR - 4), (ringR - 4) * 0.3, H.s, ringO * 0.8);
  // Rising "+" crosses and motes on fixed lanes.
  const r = rng(77);
  const lanes = Array.from({ length: 7 }, () => ({ x: 10 + r() * 44, delay: Math.floor(r() * 4), speed: 5 + r() * 3, big: r() < 0.4 }));
  for (const l of lanes) {
    const t = f - l.delay;
    if (t < 0 || t > 6) continue;
    const y = Math.round(feet - 6 - t * l.speed), x = Math.round(l.x + Math.sin(t + l.x) * 2);
    const o = t > 4 ? 0.5 : 1;
    if (l.big) {
      for (let k = -2; k <= 2; k++) { if (keep(x + k, y, o)) p.set(x + k, y, H.b); if (keep(x, y + k, o)) p.set(x, y + k, H.b); }
      p.set(x, y, H.l); p.set(x - 1, y - 1, H.s); p.set(x + 1, y + 1, H.s);
    } else if (keep(x, y, o)) { p.set(x, y, H.l); p.set(x, y + 1, H.b); }
  }
  // Soft column of light (dithered) in the middle frames.
  const col = [0, 0.15, 0.3, 0.4, 0.35, 0.25, 0.15, 0.08, 0, 0][f];
  for (let y = feet - 66; y < feet; y++) for (let x = cx - 10; x <= cx + 10; x++) if (keep(x, y, col * (1 - Math.abs(x - cx) / 11) * Math.min(1, (y - (feet - 66)) / 18))) p.set(x, y, H.l);
  return p;
}

// ------------------------------------------------------------------ level up (96×128, 12 frames)
function levelUp(f: number): Pixmap {
  const p = new Pixmap(96, 128);
  const G = R.fx_gold;
  const cx = 48, feet = 108;
  const pillar = [0.2, 0.5, 0.8, 1, 1, 0.9, 0.75, 0.6, 0.45, 0.3, 0.15, 0][f];
  const halfW = [4, 8, 12, 14, 14, 13, 12, 11, 10, 9, 8, 7][f];
  for (let y = 4; y < feet; y++) {
    const top = 1 - (feet - y) / feet;
    for (let x = cx - halfW; x <= cx + halfW; x++) {
      const edge = Math.abs(x - cx) / (halfW + 1);
      const o = pillar * (1 - edge * 0.8) * (0.3 + top * 0.7);
      if (!keep(x, y, o)) continue;
      p.set(x, y, edge < 0.3 ? G.l : edge < 0.7 ? G.b : G.s);
    }
  }
  // Expanding ground rings.
  for (let k = 0; k < 2; k++) {
    const t = f - k * 3;
    if (t < 0 || t > 8) continue;
    const rr = Math.min(42, 8 + t * 5);
    ring(p, cx, feet, rr, rr * 0.25, G.l, 1 - t / 9, 2);
  }
  // Rising stars.
  const r = rng(9);
  for (let i = 0; i < 10; i++) {
    const x = 18 + r() * 60, delay = Math.floor(r() * 5), speed = 7 + r() * 4;
    const t = f - delay;
    if (t < 0 || t > 6) continue;
    star(p, Math.round(x), Math.round(feet - 10 - t * speed), t < 4 ? 2 : 1, G);
  }
  return p;
}

export const BATCH001_VFX: VfxDef[] = [
  { key: 'fx_sword_slash', folder: 'physical', fw: 64, fh: 64, frames: 6, frameMs: 50, loop: false, origin: { x: 0.5, y: 0.55 }, blend: 'normal', attach: 'target', impactFrame: 2, sound: 'skill_slash', draw: slash },
  { key: 'fx_hit_basic', folder: 'physical', fw: 48, fh: 48, frames: 5, frameMs: 45, loop: false, origin: { x: 0.5, y: 0.5 }, blend: 'normal', attach: 'target', impactFrame: 1, sound: 'hit', draw: hit },
  { key: 'fx_heal', folder: 'holy', fw: 64, fh: 96, frames: 10, frameMs: 70, loop: false, origin: { x: 0.5, y: 80 / 96 }, blend: 'normal', attach: 'target', impactFrame: 2, sound: 'heal', draw: heal },
  { key: 'fx_level_up', folder: 'special', fw: 96, fh: 128, frames: 12, frameMs: 80, loop: false, origin: { x: 0.5, y: 108 / 128 }, blend: 'normal', attach: 'caster', impactFrame: 3, sound: 'level_up', draw: levelUp },
];

export function buildVfxSheet(d: VfxDef): Sheet {
  const s = new Sheet(d.fw, d.fh, d.frames, 1);
  for (let f = 0; f < d.frames; f++) s.put(f, 0, d.draw(f));
  return s;
}

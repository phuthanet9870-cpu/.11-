// Item icons: 32x32 pixel art with a five-tone ramp per colour, hard outline, rim light and
// rarity sparkle. Every icon shape has several variants (picked from the item id) and weapon
// types get their own drawings, so no two items look the same.
import type { ItemDef } from '../../core/types';
import { addOutline, ellipse, hexToRgb, poly, px } from './canvas';

type Ramp = [string, string, string, string, string]; // deep, shadow, base, light, highlight

const rgb = (r: number, g: number, b: number) => `rgb(${Math.round(Math.max(0, Math.min(255, r)))},${Math.round(Math.max(0, Math.min(255, g)))},${Math.round(Math.max(0, Math.min(255, b)))})`;
/** Five tones of a colour: darker steps lean cool, lighter steps lean warm (classic pixel-art hue shift). */
export function ramp(hex: string): Ramp {
  const [r, g, b] = hexToRgb(hex);
  const dk = (k: number) => rgb(r * k - 6, g * k - 2, b * k + 14 * (1 - k));
  const lt = (k: number) => rgb(r + (255 - r) * k + 8 * k, g + (255 - g) * k, b + (255 - b) * k * 0.8);
  return [dk(0.38), dk(0.66), rgb(r, g, b), lt(0.35), lt(0.72)];
}
export const hashId = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

/** Pixel line (Bresenham). */
function ln(c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, col: string, w = 1) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    px(c, x0 - Math.floor((w - 1) / 2), y0 - Math.floor((w - 1) / 2), w, w, col);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
const P = poly;

interface Ctx { c: CanvasRenderingContext2D; R: Ramp; A: Ramp; v: number; h: number; item: ItemDef }
type Painter = (k: Ctx) => void;

/** A diagonal blade from (x0,y0) to the tip (x1,y1), `w` wide, with a lit edge and a fuller. */
function blade(c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, w: number, S: Ramp, curve = 0) {
  const ang = Math.atan2(y1 - y0, x1 - x0), nx = -Math.sin(ang), ny = Math.cos(ang), len = Math.hypot(x1 - x0, y1 - y0);
  const pts: [number, number][] = [];
  for (let i = 0; i <= 6; i++) { const t = i / 6, b = Math.sin(t * Math.PI) * curve, ww = w * (1 - t * 0.55); pts.push([x0 + (x1 - x0) * t + nx * (ww + b), y0 + (y1 - y0) * t + ny * (ww + b)]); }
  pts.push([x1 + Math.cos(ang) * 2, y1 + Math.sin(ang) * 2]);
  for (let i = 6; i >= 0; i--) { const t = i / 6, b = Math.sin(t * Math.PI) * curve, ww = w * (1 - t * 0.55); pts.push([x0 + (x1 - x0) * t - nx * (ww - b), y0 + (y1 - y0) * t - ny * (ww - b)]); }
  P(c, pts, S[2]);
  ln(c, x0 + nx * (w - 1), y0 + ny * (w - 1), x1, y1, S[4]);
  ln(c, x0 - nx * (w - 1), y0 - ny * (w - 1), x1 - Math.cos(ang), y1 - Math.sin(ang), S[1]);
  if (len > 12) ln(c, x0 + Math.cos(ang) * 2, y0 + Math.sin(ang) * 2, x0 + (x1 - x0) * 0.6, y0 + (y1 - y0) * 0.6, S[3]);
}
/** A round gem with a highlight. */
function gem(c: CanvasRenderingContext2D, x: number, y: number, r: number, G: Ramp) {
  ellipse(c, x, y, r, r, G[1]); ellipse(c, x - 0.5, y - 0.5, Math.max(1, r - 1), Math.max(1, r - 1), G[2]);
  px(c, x - Math.max(1, r - 1), y - Math.max(1, r - 1), 1, 1, G[4]); if (r >= 2) px(c, x - r + 2, y - r + 1, 1, 1, G[3]);
}
const WOOD: Ramp = ramp('#8b5a2b'), STEEL: Ramp = ramp('#b8c0d0'), LEATHER: Ramp = ramp('#7a4a2a'), GLASS: Ramp = ramp('#d8ecff');

const PAINT: Record<string, Painter> = {
  // ---------------------------------------------------------------- weapons
  sword: ({ c, R, A, v }) => {
    const metal = v % 2 ? R : STEEL;
    blade(c, 9, 23, 27, 4, v === 2 ? 3.4 : 2.4, metal, v === 3 ? 2 : 0);
    const guard: [number, number][] = v === 1 ? [[4, 20], [7, 17], [14, 25], [11, 28]] : [[5, 19], [7, 17], [15, 25], [13, 27]];
    P(c, guard, A[2]); ln(c, 6, 18, 13, 25, A[4]);
    ln(c, 9, 24, 4, 29, LEATHER[2], 2); ln(c, 8, 25, 5, 28, LEATHER[3]);
    gem(c, 3, 29, 2, A); gem(c, 10, 22, 1, R);
  },
  twohand_sword: ({ c, R, A, v }) => {
    blade(c, 9, 22, 28, 2, 3.6, v % 2 ? R : STEEL, v === 2 ? 1.5 : 0);
    P(c, [[3, 18], [6, 15], [16, 25], [13, 28]], A[2]); ln(c, 5, 16, 15, 26, A[4]);
    for (const [x, y] of [[4, 17], [14, 27]]) gem(c, x, y, 1, R);
    ln(c, 8, 24, 2, 30, LEATHER[2], 2); ln(c, 7, 25, 3, 29, LEATHER[4]);
  },
  dagger: ({ c, R, A, v }) => {
    blade(c, 13, 19, 26, 6, 2.2, v % 2 ? R : STEEL, v === 2 ? 2.5 : 0);
    P(c, [[9, 16], [11, 14], [17, 21], [15, 23]], A[2]); ln(c, 10, 15, 16, 21, A[4]);
    ln(c, 13, 20, 7, 26, LEATHER[2], 2); gem(c, 6, 27, 2, A);
  },
  katar: ({ c, R, A, v }) => {
    // Punch-dagger held point-up: long triangular blade, cross bar and two side bars around the grip.
    const S = v % 2 ? R : STEEL;
    P(c, [[10, 18], [22, 18], [16, 1]], S[2]); ln(c, 16, 2, 11, 17, S[4]); ln(c, 16, 2, 21, 17, S[1]); ln(c, 16, 4, 16, 17, S[3]);
    if (v >= 2) { P(c, [[7, 18], [10, 18], [8, 9]], S[1]); P(c, [[22, 18], [25, 18], [24, 9]], S[1]); }
    px(c, 8, 18, 16, 3, A[2]); px(c, 8, 18, 16, 1, A[4]);
    px(c, 9, 21, 2, 8, A[1]); px(c, 21, 21, 2, 8, A[1]); px(c, 9, 28, 14, 2, A[1]); px(c, 9, 28, 14, 1, A[3]);
    px(c, 13, 23, 6, 3, LEATHER[2]); px(c, 13, 23, 6, 1, LEATHER[4]); gem(c, 16, 19, 1, R);
  },
  knuckle: ({ c, R, A, v }) => {
    // A fist in a studded gauntlet.
    P(c, [[7, 12], [12, 8], [23, 8], [27, 12], [27, 22], [22, 27], [10, 27], [6, 22]], LEATHER[2]);
    for (let i = 0; i < 4; i++) { ellipse(c, 10 + i * 5, 11, 3, 3, LEATHER[3]); px(c, 9 + i * 5, 9, 2, 1, LEATHER[4]); }
    P(c, [[6, 17], [12, 15], [15, 19], [9, 22]], LEATHER[1]);
    px(c, 7, 13, 20, 4, R[2]); px(c, 7, 13, 20, 1, R[4]);
    for (let i = 0; i < 4; i++) { const x = 10 + i * 5; if (v >= 2) P(c, [[x - 2, 13], [x + 2, 13], [x, 7]], STEEL[3]); else { px(c, x - 1, 13, 3, 3, STEEL[2]); px(c, x - 1, 13, 1, 1, STEEL[4]); } }
    px(c, 9, 25, 14, 4, A[2]); px(c, 9, 25, 14, 1, A[4]); gem(c, 16, 21, v % 2 ? 2 : 1, A);
  },
  axe: ({ c, R, A, v }) => {
    ln(c, 7, 28, 22, 6, WOOD[2], 2); ln(c, 8, 28, 23, 6, WOOD[3]);
    const head: [number, number][] = v === 1 ? [[17, 6], [28, 4], [29, 14], [21, 13]] : v === 2 ? [[16, 5], [27, 2], [30, 9], [27, 16], [20, 13]] : [[17, 5], [26, 3], [29, 11], [24, 16], [20, 12]];
    P(c, head, R[2]); ln(c, head[1][0], head[1][1], head[2][0], head[2][1], R[4]); ln(c, head[0][0], head[0][1], head[head.length - 1][0], head[head.length - 1][1], R[1]);
    if (v === 3) P(c, [[19, 11], [12, 9], [14, 4]], R[1]);
    px(c, 19, 8, 3, 3, A[2]); px(c, 19, 8, 1, 1, A[4]);
  },
  spear: ({ c, R, A, v }) => {
    ln(c, 4, 29, 21, 10, WOOD[2], 2); ln(c, 5, 29, 22, 10, WOOD[3]);
    P(c, v === 2 ? [[20, 13], [29, 2], [26, 15]] : [[19, 11], [24, 6], [29, 2], [25, 8], [21, 14]], R[2]); ln(c, 21, 11, 29, 2, R[4]);
    if (v % 2) { P(c, [[17, 11], [21, 9], [19, 14]], A[2]); P(c, [[21, 15], [23, 12], [24, 17]], A[2]); }
    px(c, 18, 12, 3, 3, A[3]); ln(c, 18, 15, 15, 20, A[2]);
  },
  club: ({ c, R, A, v }) => {
    ln(c, 6, 28, 17, 13, WOOD[2], 3); ln(c, 7, 27, 17, 14, WOOD[3]);
    ellipse(c, 21, 9, 7, 7, R[2]); ellipse(c, 20, 8, 5, 5, R[3]); px(c, 17, 5, 2, 2, R[4]);
    const studs = v === 1 ? [[21, 2], [28, 9], [21, 16], [14, 9]] : [[24, 4], [26, 13], [16, 13], [17, 4]];
    for (const [x, y] of studs) { px(c, x - 1, y - 1, 3, 3, A[1]); px(c, x - 1, y - 1, 1, 1, A[4]); }
    if (v >= 2) px(c, 5, 27, 3, 3, A[2]);
  },
  bow: ({ c, R, A, v }) => {
    for (let i = 0; i <= 24; i++) { const t = i / 24, x = 7 + Math.sin(t * Math.PI) * (v === 2 ? 14 : 12), y = 4 + t * 24; px(c, x, y, 2, 1, i % 4 ? R[2] : R[1]); px(c, x + 1, y, 1, 1, R[4]); }
    ln(c, 7, 4, 7, 28, '#e8e0d0');
    px(c, 17, 14, 3, 4, LEATHER[2]); px(c, 5, 3, 3, 2, A[2]); px(c, 5, 27, 3, 2, A[2]);
    if (v % 2) { ln(c, 8, 16, 27, 16, WOOD[3]); P(c, [[27, 14], [30, 16], [27, 18]], STEEL[3]); }
  },
  crossbow: ({ c, R, A, v }) => {
    px(c, 6, 15, 22, 3, WOOD[2]); px(c, 6, 15, 22, 1, WOOD[3]);
    for (let i = 0; i <= 18; i++) { const t = i / 18, y = 6 + t * 20, x = 22 - Math.sin(t * Math.PI) * 6; px(c, x, y, 2, 1, R[2]); }
    ln(c, 22, 6, 22, 26, '#e8e0d0'); px(c, 4, 14, 4, 6, A[2]); px(c, 12, 18, 2, 5, LEATHER[2]);
    if (v % 2) P(c, [[27, 14], [30, 16], [27, 18]], STEEL[3]);
  },
  wand: ({ c, R, A, v }) => {
    ln(c, 7, 27, 19, 12, WOOD[2], 2); ln(c, 8, 27, 19, 13, WOOD[3]);
    if (v === 1) { P(c, [[18, 10], [22, 4], [26, 10], [22, 16]], R[2]); ln(c, 22, 5, 25, 10, R[4]); }
    else if (v === 2) { for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 - Math.PI / 2; ln(c, 22, 9, 22 + Math.cos(a) * 6, 9 + Math.sin(a) * 6, R[3]); } gem(c, 22, 9, 3, R); }
    else { gem(c, 22, 9, 4, R); P(c, [[17, 13], [20, 12], [19, 16]], A[2]); P(c, [[24, 14], [26, 11], [27, 15]], A[2]); }
    px(c, 8, 26, 3, 2, A[2]);
  },
  staff: ({ c, R, A, v }) => {
    ln(c, 6, 30, 20, 9, WOOD[2], 2); ln(c, 7, 30, 21, 9, WOOD[3]);
    if (v % 2) { for (let i = 0; i < 8; i++) { const a = i * 0.8; px(c, 22 + Math.cos(a) * 5, 7 + Math.sin(a) * 5, 1, 1, A[3]); } }
    else { ln(c, 20, 9, 17, 4, WOOD[2], 2); ln(c, 21, 9, 26, 5, WOOD[2], 2); }
    gem(c, 22, 6, 4, R); px(c, 20, 3, 2, 1, R[4]);
    if (v >= 2) for (const [x, y] of [[15, 15], [11, 21]]) px(c, x, y, 3, 2, A[2]);
  },
  instrument: ({ c, R, A, v }) => {
    // Lute / lyre.
    if (v % 2) {
      P(c, [[8, 8], [12, 26], [20, 26], [24, 8], [20, 13], [12, 13]], R[2]); ln(c, 9, 8, 13, 25, R[4]);
      for (let i = 0; i < 4; i++) ln(c, 13 + i * 2, 13, 13 + i * 2, 25, '#f0e8d0');
      px(c, 7, 6, 4, 3, A[2]); px(c, 21, 6, 4, 3, A[2]);
    } else {
      ellipse(c, 13, 21, 7, 7, R[2]); ellipse(c, 12, 20, 5, 5, R[3]); ellipse(c, 13, 21, 2, 2, R[0]);
      ln(c, 17, 16, 26, 5, WOOD[2], 3); px(c, 25, 3, 4, 3, A[2]);
      for (let i = -1; i <= 1; i++) ln(c, 12 + i, 26, 26 + i, 6, '#f0e8d0');
    }
    if (v >= 2) gem(c, 16, 28, 1, A);
  },
  book: ({ c, R, A, v }) => {
    P(c, [[6, 7], [24, 5], [26, 26], [8, 28]], R[2]); P(c, [[8, 28], [26, 26], [26, 28], [8, 30]], '#f0e8d0');
    ln(c, 6, 7, 8, 28, R[0], 2); ln(c, 9, 8, 24, 6, R[4]);
    P(c, [[12, 11], [21, 10], [22, 22], [13, 23]], A[1]);
    if (v === 1) { gem(c, 17, 16, 3, A); } else if (v === 2) { for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; px(c, 17 + Math.cos(a) * 4, 16 + Math.sin(a) * 4, 1, 1, A[4]); } px(c, 16, 15, 2, 2, A[4]); }
    else { ln(c, 14, 13, 20, 20, A[4]); ln(c, 20, 13, 14, 20, A[4]); }
    px(c, 23, 26, 2, 5, A[2]);
  },
  // ---------------------------------------------------------------- armour
  armor: ({ c, R, A, v }) => {
    P(c, [[7, 6], [12, 4], [20, 4], [25, 6], [27, 13], [24, 14], [23, 27], [9, 27], [8, 14], [5, 13]], R[2]);
    P(c, [[12, 4], [16, 9], [20, 4]], R[0]);
    ln(c, 8, 7, 9, 26, R[3]); ln(c, 23, 14, 23, 26, R[1]);
    px(c, 9, 17, 14, 2, A[2]); px(c, 9, 17, 14, 1, A[4]);
    if (v === 1) { ln(c, 16, 10, 16, 26, R[1]); for (let y = 11; y < 26; y += 4) px(c, 15, y, 3, 1, A[3]); }
    else if (v === 2) { P(c, [[16, 9], [20, 13], [16, 17], [12, 13]], A[2]); gem(c, 16, 13, 1, A); }
    else { for (let y = 20; y < 27; y += 3) ln(c, 10, y, 22, y, R[1]); }
    ellipse(c, 6, 9, 3, 3, R[3]); ellipse(c, 26, 9, 3, 3, R[1]);
  },
  robe: ({ c, R, A, v }) => {
    P(c, [[11, 4], [21, 4], [25, 10], [27, 29], [5, 29], [7, 10]], R[2]);
    P(c, [[13, 4], [16, 10], [19, 4]], R[0]); ln(c, 16, 10, 16, 29, A[2]); ln(c, 8, 11, 6, 28, R[3]);
    px(c, 10, 15, 12, 2, A[2]);
    for (let x = 6; x < 27; x += 3) px(c, x, 28, 2, 1, A[3]);
    if (v % 2) { gem(c, 16, 14, 2, A); } else { for (let i = 0; i < 3; i++) px(c, 12 + i * 3, 20 + i * 2, 2, 2, A[3]); }
  },
  shirt: ({ c, R, A, v }) => {
    P(c, [[10, 5], [22, 5], [28, 11], [24, 14], [23, 27], [9, 27], [8, 14], [4, 11]], R[2]);
    P(c, [[13, 5], [16, 9], [19, 5]], R[0]); ln(c, 9, 14, 9, 26, R[3]); ln(c, 22, 14, 22, 26, R[1]);
    px(c, 9, 21, 14, 2, LEATHER[2]); px(c, 15, 21, 2, 2, A[3]);
    if (v % 2) for (let y = 11; y < 20; y += 3) px(c, 15, y, 2, 1, A[2]);
  },
  hat: ({ c, R, A, v }) => {
    if (v === 1) { P(c, [[5, 22], [27, 22], [22, 18], [18, 3], [12, 16], [10, 18]], R[2]); ln(c, 18, 4, 13, 16, R[4]); }
    else if (v === 2) { ellipse(c, 16, 21, 13, 4, R[1]); ellipse(c, 16, 16, 8, 7, R[2]); px(c, 9, 18, 14, 2, A[2]); ln(c, 22, 14, 28, 5, A[3], 2); }
    else { ellipse(c, 16, 22, 12, 4, R[1]); P(c, [[8, 22], [10, 10], [16, 7], [22, 10], [24, 22]], R[2]); px(c, 9, 18, 14, 2, A[2]); ln(c, 11, 11, 10, 20, R[4]); }
    if (v === 3) for (let i = 0; i < 3; i++) gem(c, 12 + i * 4, 15, 1, A);
    ellipse(c, 16, 23, 10, 2, R[0]);
  },
  helm: ({ c, R, A, v }) => {
    P(c, [[7, 26], [7, 14], [10, 7], [16, 4], [22, 7], [25, 14], [25, 26]], R[2]);
    ln(c, 8, 14, 10, 8, R[4]); ln(c, 24, 14, 24, 25, R[1]);
    if (v === 1) { px(c, 10, 15, 12, 2, R[0]); px(c, 15, 13, 2, 10, R[0]); }
    else if (v === 2) { for (let x = 10; x < 23; x += 3) px(c, x, 16, 2, 6, R[0]); }
    else px(c, 10, 15, 12, 3, R[0]);
    px(c, 7, 24, 18, 2, A[2]);
    if (v === 3) { P(c, [[7, 12], [2, 4], [8, 9]], A[3]); P(c, [[25, 12], [30, 4], [24, 9]], A[3]); }
    else P(c, [[15, 4], [17, 4], [20, 0], [18, 6]], A[2]);
  },
  mask: ({ c, R, A }) => {
    ellipse(c, 16, 16, 12, 10, R[2]); ellipse(c, 15, 14, 10, 7, R[3]);
    ellipse(c, 11, 15, 3, 2, R[0]); ellipse(c, 21, 15, 3, 2, R[0]); px(c, 13, 22, 6, 1, R[0]);
    P(c, [[4, 10], [1, 4], [8, 8]], A[2]); P(c, [[28, 10], [31, 4], [24, 8]], A[2]);
  },
  shield: ({ c, R, A, v }) => {
    const pts: [number, number][] = v === 1 ? Array.from({ length: 12 }, (_, i) => [16 + Math.cos(i / 12 * Math.PI * 2) * 12, 16 + Math.sin(i / 12 * Math.PI * 2) * 12] as [number, number])
      : [[5, 4], [27, 4], [27, 15], [16, 29], [5, 15]];
    P(c, pts, R[2]); ln(c, pts[0][0] + 1, pts[0][1] + 1, pts[v === 1 ? 6 : 4][0] + 1, pts[v === 1 ? 6 : 4][1], R[4]);
    if (v === 2) { px(c, 15, 6, 3, 20, A[2]); px(c, 7, 12, 19, 3, A[2]); }
    else if (v === 3) { P(c, [[16, 8], [22, 14], [16, 22], [10, 14]], A[2]); }
    else { ellipse(c, 16, 15, 4, 4, A[2]); }
    gem(c, 16, 15, 2, A);
  },
  cape: ({ c, R, A, v }) => {
    P(c, [[10, 4], [22, 4], [26, 27], [21, 25], [16, 28], [11, 25], [6, 27]], R[2]);
    ln(c, 11, 5, 8, 25, R[4]); ln(c, 16, 7, 16, 27, R[1]); ln(c, 21, 5, 24, 25, R[1]);
    px(c, 10, 3, 12, 3, A[2]); gem(c, 16, 5, 2, A);
    if (v % 2) for (let x = 7; x < 26; x += 4) px(c, x, 25, 2, 2, A[3]);
  },
  boots: ({ c, R, A, v }) => {
    for (const ox of [0, 11]) {
      P(c, [[5 + ox, 6], [12 + ox, 6], [12 + ox, 20], [17 + ox, 23], [17 + ox, 27], [4 + ox, 27]], ox ? R[1] : R[2]);
      ln(c, 6 + ox, 7, 6 + ox, 25, R[4]); px(c, 4 + ox, 26, 13, 2, LEATHER[1]);
      px(c, 5 + ox, 9, 7, 2, A[2]);
      if (v === 1) P(c, [[11 + ox, 9], [16 + ox, 6], [13 + ox, 12]], A[3]);
      if (v === 2) for (let y = 13; y < 20; y += 3) px(c, 7 + ox, y, 3, 1, A[3]);
    }
  },
  ring: ({ c, R, A, v }) => {
    ellipse(c, 16, 20, 9, 8, A[2]);
    c.globalCompositeOperation = 'destination-out'; ellipse(c, 16, 20, 5, 4, '#000'); c.globalCompositeOperation = 'source-over';
    ln(c, 8, 18, 11, 13, A[4]); ln(c, 24, 21, 21, 26, A[1]);
    if (v === 1) { P(c, [[16, 4], [21, 9], [16, 14], [11, 9]], R[2]); ln(c, 16, 5, 20, 9, R[4]); } else gem(c, 16, 10, v === 2 ? 3 : 4, R);
    px(c, 13, 12, 6, 2, A[1]);
  },
  amulet: ({ c, R, A, v }) => {
    for (let i = 0; i <= 16; i++) { const a = Math.PI + (i / 16) * Math.PI; px(c, 16 + Math.cos(a) * 11, 13 + Math.sin(a) * 9, 1, 1, A[3]); }
    ln(c, 5, 13, 13, 19, A[3]); ln(c, 27, 13, 19, 19, A[3]);
    if (v % 2) { P(c, [[16, 16], [22, 22], [16, 30], [10, 22]], A[2]); gem(c, 16, 23, 3, R); }
    else { ellipse(c, 16, 23, 6, 6, A[2]); gem(c, 16, 23, 4, R); }
  },
  crown: ({ c, R, A }) => {
    P(c, [[5, 24], [5, 10], [10, 16], [16, 6], [22, 16], [27, 10], [27, 24]], A[2]); ln(c, 6, 11, 6, 23, A[4]); px(c, 5, 22, 23, 3, A[1]);
    for (const x of [9, 16, 23]) gem(c, x, 21, 2, R);
  },
  // ---------------------------------------------------------------- consumables and materials
  potion: ({ c, R, v }) => {
    const round = v % 2 === 0;
    px(c, 13, 3, 6, 3, '#9a6a3a'); px(c, 13, 3, 6, 1, '#c8986a');
    px(c, 14, 6, 4, 4, GLASS[2]);
    if (round) { ellipse(c, 16, 19, 10, 10, GLASS[1]); ellipse(c, 16, 20, 9, 8, R[2]); ellipse(c, 16, 23, 8, 5, R[1]); }
    else { P(c, [[12, 9], [20, 9], [26, 28], [6, 28]], GLASS[1]); P(c, [[11, 15], [21, 15], [25, 27], [7, 27]], R[2]); P(c, [[9, 22], [23, 22], [25, 27], [7, 27]], R[1]); }
    px(c, 10, 14, 2, 6, R[4]); px(c, 11, 13, 1, 1, '#ffffff');
    if (v >= 2) for (const [x, y] of [[19, 18], [17, 23], [21, 22]]) px(c, x, y, 1, 1, R[4]);
  },
  flask: ({ c, R, v }) => {
    px(c, 14, 3, 4, 9, GLASS[2]); px(c, 13, 2, 6, 2, '#9a6a3a');
    P(c, [[13, 11], [19, 11], [26, 27], [6, 27]], GLASS[1]); P(c, [[11, 17], [21, 17], [25, 26], [7, 26]], R[2]);
    ln(c, 12, 13, 8, 25, GLASS[4]); for (const [x, y] of [[15, 21], [19, 23], [13, 24]]) px(c, x, y, 2, 2, R[4]);
    if (v % 2) px(c, 9, 22, 14, 1, R[3]);
  },
  apple: ({ c, R, A, v }) => {
    if (v === 1) { ellipse(c, 16, 18, 10, 8, R[2]); ellipse(c, 13, 15, 4, 3, R[3]); for (let i = 0; i < 4; i++) px(c, 9 + i * 4, 19 + (i % 2), 2, 1, R[1]); }
    else if (v === 2) { for (const [x, y] of [[12, 15], [20, 15], [16, 21], [11, 22], [21, 22]]) { ellipse(c, x, y, 4, 4, R[2]); px(c, x - 2, y - 2, 2, 1, R[4]); } }
    else { ellipse(c, 16, 18, 10, 10, R[2]); ellipse(c, 13, 15, 4, 4, R[3]); px(c, 11, 12, 2, 2, R[4]); ellipse(c, 19, 22, 5, 4, R[1]); }
    ln(c, 16, 9, 17, 4, WOOD[2], 2); ellipse(c, 21, 6, 4, 2, A[2] === R[2] ? '#5fae3a' : A[2]);
  },
  coin: ({ c, R }) => {
    ellipse(c, 16, 16, 11, 11, R[1]); ellipse(c, 15, 15, 10, 10, R[2]); ellipse(c, 15, 15, 7, 7, R[3]); ellipse(c, 15, 15, 5, 5, R[2]);
    px(c, 12, 10, 3, 1, R[4]); px(c, 14, 13, 2, 5, R[1]);
  },
  wing: ({ c, R, v }) => {
    for (let i = 0; i < 6; i++) { const y = 8 + i * 3, len = 20 - i * 2; P(c, [[6, y], [6 + len, y - 4 + i], [6 + len - 3, y + 2]], i % 2 ? R[2] : R[3]); }
    ln(c, 6, 8, 6, 26, R[1], 2);
    if (v % 2) for (let i = 0; i < 3; i++) px(c, 22 - i * 3, 6 + i * 4, 1, 1, R[4]);
  },
  blob: ({ c, R, v }) => {
    P(c, [[5, 26], [7, 16], [12, 10], [20, 9], [26, 15], [27, 26]], R[2]); ellipse(c, 12, 15, 4, 3, R[3]); px(c, 10, 13, 2, 1, R[4]);
    ellipse(c, 16, 26, 11, 2, R[1]);
    if (v % 2) for (const [x, y] of [[20, 18], [14, 22]]) ellipse(c, x, y, 1, 1, R[4]);
  },
  horn: ({ c, R, A, v }) => {
    // Curved horn: thick base tapering to a point, ridged.
    const pts: [number, number][] = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10, x = 6 + t * 20, y = 26 - Math.sin(t * Math.PI * 0.85) * 16 - t * 5, w = 6.5 * (1 - t) + 0.5; pts.push([x - w * 0.5, y - w]); }
    for (let i = 10; i >= 0; i--) { const t = i / 10, x = 6 + t * 20, y = 26 - Math.sin(t * Math.PI * 0.85) * 16 - t * 5, w = 6.5 * (1 - t) + 0.5; pts.push([x + w * 0.5, y + w * 0.6]); }
    P(c, pts, R[2]);
    for (let i = 1; i < 9; i++) { const t = i / 10, x = 6 + t * 20, y = 26 - Math.sin(t * Math.PI * 0.85) * 16 - t * 5, w = 6.5 * (1 - t); ln(c, x - w * 0.5, y - w, x + w * 0.4, y + w * 0.5, i % 2 ? R[1] : R[3]); }
    for (let i = 0; i < 10; i++) { const t = i / 10; px(c, 6 + t * 20 - 3 * (1 - t), 26 - Math.sin(t * Math.PI * 0.85) * 16 - t * 5 - 6 * (1 - t), 1, 1, R[4]); }
    if (v % 2) ellipse(c, 6, 25, 3, 3, A[2]); else px(c, 3, 24, 6, 4, R[0]);
  },
  fang: ({ c, R, v }) => {
    P(c, [[10, 4], [22, 4], [20, 12], [16, 29], [12, 12]], R[2]); ln(c, 11, 5, 15, 26, R[4]); ln(c, 21, 5, 17, 26, R[1]);
    px(c, 10, 4, 12, 3, R[1]);
    if (v % 2) { P(c, [[22, 8], [28, 8], [25, 20]], R[3]); }
  },
  dust: ({ c, R, v, h }) => {
    // A small heap of powder in a cloth pouch, sparkling.
    P(c, [[6, 26], [9, 15], [13, 11], [19, 11], [23, 15], [26, 26]], ramp('#c8b090')[2]); ln(c, 9, 16, 7, 25, ramp('#c8b090')[4]);
    px(c, 12, 10, 8, 2, ramp('#8b6b3e')[2]); px(c, 14, 7, 4, 4, ramp('#c8b090')[1]);
    ellipse(c, 16, 21, 8, 5, R[1]); ellipse(c, 16, 20, 7, 4, R[2]); ellipse(c, 14, 19, 4, 2, R[3]);
    for (let i = 0; i < 7; i++) { const x = 9 + ((h >> (i * 3)) % 14), y = 16 + ((h >> (i + 2)) % 7); px(c, x, y, 1, 1, i % 2 ? R[4] : '#ffffff'); }
    if (v % 2) for (const [x, y] of [[5, 8], [26, 6], [24, 12]]) { px(c, x, y - 1, 1, 3, R[4]); px(c, x - 1, y, 3, 1, R[4]); }
  },
  pelt: ({ c, R, A, v }) => {
    P(c, [[6, 8], [12, 5], [20, 5], [26, 8], [28, 16], [24, 26], [16, 28], [8, 26], [4, 16]], R[2]);
    for (let i = 0; i < 6; i++) ln(c, 8 + i * 3, 9 + (i % 2), 9 + i * 3, 24, R[1]);
    ln(c, 7, 9, 5, 16, R[4]);
    if (v % 2) for (const [x, y] of [[12, 12], [19, 16], [14, 20]]) ellipse(c, x, y, 2, 1, A[1]);
  },
  bone: ({ c, R, v }) => {
    ln(c, 8, 24, 24, 8, R[2], 4); ln(c, 9, 22, 22, 9, R[4]);
    for (const [x, y] of [[6, 22], [10, 26], [22, 6], [26, 10]]) { ellipse(c, x, y, 3, 3, R[2]); px(c, x - 1, y - 2, 2, 1, R[4]); }
    if (v % 2) for (let i = 0; i < 3; i++) px(c, 13 + i * 2, 17 - i * 2, 2, 1, R[1]);
  },
  mushroom: ({ c, R, A }) => {
    px(c, 12, 16, 8, 12, '#e8dcc0'); px(c, 12, 16, 2, 12, '#ffffff');
    ellipse(c, 16, 14, 13, 8, R[2]); ellipse(c, 14, 11, 8, 4, R[3]);
    for (const [x, y] of [[9, 14], [17, 10], [22, 15]]) ellipse(c, x, y, 2, 2, A[3]);
  },
  ore: ({ c, R, A, v }) => {
    P(c, [[4, 24], [8, 12], [16, 6], [26, 10], [28, 22], [20, 28], [9, 28]], ramp('#6a6470')[2]);
    ln(c, 8, 13, 15, 7, ramp('#6a6470')[4]);
    for (const [x, y, s] of v % 2 ? [[11, 17, 3], [20, 14, 4], [17, 23, 2]] : [[13, 13, 3], [21, 20, 3], [10, 22, 2], [19, 11, 2]]) { P(c, [[x, y - s], [x + s, y], [x, y + s], [x - s, y]], R[2]); px(c, x - 1, y - s + 1, 1, 1, R[4]); }
    void A;
  },
  gem: ({ c, R, v }) => {
    const pts: [number, number][] = v === 1 ? [[16, 3], [27, 13], [16, 29], [5, 13]] : v === 2 ? [[9, 6], [23, 6], [28, 14], [16, 28], [4, 14]] : v === 3 ? [[16, 3], [26, 9], [26, 22], [16, 28], [6, 22], [6, 9]] : [[10, 5], [22, 5], [27, 12], [16, 28], [5, 12]];
    P(c, pts, R[2]);
    P(c, [pts[0], pts[1], [16, 13]], R[3]); P(c, [pts[pts.length - 1], pts[0], [16, 13]], R[4]);
    P(c, [[16, 13], pts[1], pts[2]], R[1]);
    ln(c, pts[0][0] + 1, pts[0][1] + 2, 16, 13, '#ffffff');
  },
  leaf: ({ c, R, v }) => {
    P(c, [[5, 27], [8, 14], [16, 6], [27, 4], [25, 15], [18, 24]], R[2]); ln(c, 6, 26, 25, 6, R[1]);
    for (let i = 0; i < 4; i++) { ln(c, 10 + i * 4, 22 - i * 4, 7 + i * 4, 16 - i * 4, R[3]); ln(c, 10 + i * 4, 22 - i * 4, 15 + i * 4, 21 - i * 4, R[1]); }
    if (v % 2) px(c, 20, 8, 2, 2, R[4]);
  },
  // ---------------------------------------------------------------- rune stones
  rune: ({ c, R, A, h, item }) => {
    // A cut hexagonal stone with a glowing engraved rune; small gems along the bottom show its level.
    const S = ramp('#4a4458');
    P(c, [[16, 2], [28, 9], [28, 23], [16, 30], [4, 23], [4, 9]], S[2]);
    P(c, [[16, 2], [28, 9], [16, 16]], S[3]); P(c, [[4, 9], [16, 2], [16, 16]], S[4]); P(c, [[4, 23], [4, 9], [16, 16]], S[3]);
    P(c, [[16, 30], [28, 23], [16, 16]], S[1]); P(c, [[28, 23], [28, 9], [16, 16]], S[1]);
    P(c, [[16, 6], [24, 11], [24, 21], [16, 26], [8, 21], [8, 11]], S[2]);
    // Engraved rune: a stave with two branches, placed by the stone's kind.
    // Same rune mark for every level of a kind (its glyph comes from the kind, not the item).
    const k = hashId(item.runeStone?.kind ?? '') % 12; void h;
    const glowLine = (x0: number, y0: number, x1: number, y1: number) => { ln(c, x0, y0, x1, y1, R[1], 3); ln(c, x0, y0, x1, y1, R[3]); };
    glowLine(16, 9, 16, 23);
    const b1 = 10 + (k % 4) * 2, b2 = 14 + (k % 3) * 3, d1 = k % 2 ? 1 : -1;
    glowLine(16, b1, 16 + 5 * d1, b1 + 4); glowLine(16, b2, 16 - 5 * d1, b2 + (k % 2 ? -4 : 4));
    if (k % 3 === 0) glowLine(12, 9, 20, 9);
    px(c, 15, 15, 2, 2, R[4]);
    const lv = item.runeStone?.level ?? 1;
    for (let i = 0; i < lv; i++) { const x = 16 - (lv - 1) * 2.5 + i * 5; px(c, x - 1, 27, 2, 2, A[2]); px(c, x - 1, 27, 1, 1, '#ffffff'); }
  },
  // ---------------------------------------------------------------- cards (portrait drawn by itemIconCanvas)
  card: ({ c, R, A }) => {
    P(c, [[5, 2], [27, 2], [27, 30], [5, 30]], A[1]); P(c, [[6, 3], [26, 3], [26, 29], [6, 29]], '#f2e8cf');
    px(c, 8, 5, 16, 15, R[1]); px(c, 8, 22, 16, 1, '#a08c6a'); px(c, 8, 25, 12, 1, '#a08c6a'); px(c, 6, 3, 20, 1, '#ffffff');
  },
};

/** Painter for an item: weapons by weapon type, everything else by icon shape. */
function painterFor(item: ItemDef): Painter {
  const wt = item.weaponType;
  if (wt && PAINT[wt]) return PAINT[wt];
  return PAINT[item.icon.shape] ?? PAINT.gem;
}

const RARITY_GLOW: Record<string, string | null> = { common: null, uncommon: '#7fe08a', rare: '#7fb8ff', epic: '#c48aff', legendary: '#ffd34d' };

/**
 * Draws an item icon (32x32). `portrait` draws a monster into a card's picture area.
 */
export function drawItemIcon(c: CanvasRenderingContext2D, item: ItemDef, portrait?: (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => void) {
  const h = hashId(item.id);
  const R = ramp(item.icon.color), A = ramp(item.icon.accent ?? item.icon.color);
  painterFor(item)({ c, R, A, v: h % 4, h, item });
  // Two id-placed glints on the item itself, so items sharing a shape and colours still differ.
  const img = c.getImageData(0, 0, 32, 32).data;
  for (let k = 0, tries = 0; k < 2 && tries < 40; tries++) {
    const x = 8 + ((h >>> (tries % 24)) + tries * 7) % 16, y = 8 + ((h >>> ((tries + 5) % 24)) + tries * 11) % 16;
    if (img[(y * 32 + x) * 4 + 3] < 200) continue;
    px(c, x, y, 1, 1, k ? A[4] : R[4]); k++;
  }
  if (item.type === 'card' && portrait) portrait(c, 8, 5, 16, 15);
  addOutline(c, 0, 0, 32, 32, '#160f1c');
  // Rarity: sparkles in the rarity colour (more for rarer items), placed by the item id.
  const g = RARITY_GLOW[item.rarity ?? 'common'];
  if (g) {
    const n = item.rarity === 'uncommon' ? 1 : item.rarity === 'rare' ? 2 : 3;
    for (let i = 0; i < n; i++) {
      const x = 3 + ((h >> (i * 5)) % 26), y = 3 + ((h >> (i * 5 + 3)) % 8);
      px(c, x, y - 1, 1, 3, g); px(c, x - 1, y, 3, 1, g); px(c, x, y, 1, 1, '#ffffff');
    }
  }
  // Enhanced weapon level: small pips in the corner.
  if (item.weaponLevel && item.weaponLevel > 1) for (let i = 0; i < item.weaponLevel - 1; i++) px(c, 1 + i * 3, 29, 2, 2, '#ffd34d');
}

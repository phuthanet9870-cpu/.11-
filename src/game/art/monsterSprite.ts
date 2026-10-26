// Procedural monster sprite sheets (placeholder art). One row facing left,
// mirrored at runtime for right-facing. Layout: see MON_ANIMS in spriteMeta.ts.
import type { MonsterDef } from '../../core/types';
import { addOutline, ellipse, makeCanvas, px, shade } from './canvas';
import { MON_ANIMS, MON_SHEET_COLS, type MonAnim } from './spriteMeta';

interface MPose { sx: number; sy: number; dx: number; dy: number; legs: number; open: number; tint: string | null; alpha: number; flat: number; wing: number }
const P0: MPose = { sx: 1, sy: 1, dx: 0, dy: 0, legs: 0, open: 0, tint: null, alpha: 1, flat: 0, wing: 0 };

function pose(anim: MonAnim, f: number): MPose {
  switch (anim) {
    case 'idle': return { ...P0, sy: f ? 0.94 : 1, sx: f ? 1.05 : 1, wing: f };
    case 'walk': return { ...P0, dy: [0, -2, 0, -1][f], legs: [1, 0, -1, 0][f], sy: [1, 1.05, 1, 0.97][f], wing: f % 2 };
    case 'attack': return [{ ...P0, dx: 3, sy: 0.9, open: 0.5 }, { ...P0, dx: -6, sx: 1.1, open: 1 }, { ...P0, dx: -2, open: 0.3 }][f];
    case 'hit': return { ...P0, dx: 3, tint: 'rgba(255,255,255,0.65)' };
    case 'death': return { ...P0, flat: [0.25, 0.55, 0.85][f], alpha: [0.9, 0.7, 0.45][f], tint: 'rgba(40,0,0,0.25)' };
  }
}

type Painter = (ctx: CanvasRenderingContext2D, w: number, h: number, c: string[], p: MPose) => void;

function eyes(ctx: CanvasRenderingContext2D, x: number, y: number, gap: number, size = 2, color = '#1c1622', angry = false) {
  px(ctx, x, y, size, size + 1, color); px(ctx, x + gap, y, size, size + 1, color);
  px(ctx, x, y, 1, 1, '#ffffff'); px(ctx, x + gap, y, 1, 1, '#ffffff');
  if (angry) { px(ctx, x - 1, y - 2, size + 1, 1, color); px(ctx, x + gap, y - 2, size + 1, 1, color); }
}

const painters: Record<string, Painter> = {
  slime(ctx, w, h, c, p) {
    const cx = w / 2 + p.dx, base = h - 4;
    const rx = 15 * p.sx, ry = 12 * p.sy;
    ellipse(ctx, cx, base - ry, rx, ry, c[0]);
    ellipse(ctx, cx - 3, base - ry - 3, rx * 0.6, ry * 0.55, shade(c[0], 0.15));
    ellipse(ctx, cx - 6, base - ry * 1.5, 3, 2, c[2]);
    // leaf on top
    px(ctx, cx - 1, base - ry * 2 - 4, 2, 4, '#5a3a1e'); ellipse(ctx, cx + 3, base - ry * 2 - 4, 4, 2, c[1]);
    eyes(ctx, cx - 7, base - ry - 1, 8);
    if (p.open) px(ctx, cx - 4, base - ry + 5, 4, 2 + p.open * 2, '#2a1a2a');
  },
  rabbit(ctx, w, h, c, p) {
    const cx = w / 2 + p.dx, base = h - 4;
    ellipse(ctx, cx + 2, base - 9, 11 * p.sx, 8 * p.sy, c[0]);
    ellipse(ctx, cx - 8, base - 16 + p.dy, 7, 7, c[0]);
    px(ctx, cx - 11, base - 30 + p.dy, 3, 10, c[0]); px(ctx, cx - 7, base - 31 + p.dy, 3, 11, c[0]);
    px(ctx, cx - 10, base - 28 + p.dy, 1, 7, '#f0b0b0'); px(ctx, cx - 6, base - 29 + p.dy, 1, 7, '#f0b0b0');
    // spiral horn
    px(ctx, cx - 9, base - 26 + p.dy, 2, 4, c[2]); px(ctx, cx - 10, base - 28 + p.dy, 2, 2, shade(c[2], -0.2));
    ellipse(ctx, cx + 12, base - 11, 3, 3, '#ffffff');
    px(ctx, cx - 12, base - 17 + p.dy, 2, 3, '#1c1622'); px(ctx, cx - 12, base - 17 + p.dy, 1, 1, '#fff');
    px(ctx, cx - 4 + p.legs, base - 2, 4, 2, c[1]); px(ctx, cx + 6 - p.legs, base - 2, 4, 2, c[1]);
  },
  mushroom(ctx, w, h, c, p) {
    const cx = w / 2 + p.dx, base = h - 4;
    px(ctx, cx - 7, base - 18 * p.sy, 14, 18 * p.sy, c[2]);
    ellipse(ctx, cx, base - 20 * p.sy, 17 * p.sx, 10, c[0]);
    ellipse(ctx, cx - 3, base - 23 * p.sy, 12 * p.sx, 6, shade(c[0], 0.12));
    ellipse(ctx, cx - 8, base - 24 * p.sy, 3, 2, c[1]); ellipse(ctx, cx + 6, base - 22 * p.sy, 2, 2, c[1]); ellipse(ctx, cx + 1, base - 27 * p.sy, 2, 2, c[1]);
    eyes(ctx, cx - 5, base - 13, 6, 2, '#1c1622', true);
    px(ctx, cx - 6 + p.legs, base - 2, 4, 3, shade(c[2], -0.3)); px(ctx, cx + 2 - p.legs, base - 2, 4, 3, shade(c[2], -0.3));
  },
  wasp(ctx, w, h, c, p) {
    const cx = w / 2 + p.dx, cy = h / 2 - 2 + p.dy;
    ctx.globalAlpha = 0.6;
    ellipse(ctx, cx + 2, cy - 10 - p.wing * 2, 7, 4, c[2]); ellipse(ctx, cx + 8, cy - 8 - p.wing * 2, 6, 3, c[2]);
    ctx.globalAlpha = 1;
    ellipse(ctx, cx + 7, cy + 3, 9 * p.sx, 7, c[0]);
    px(ctx, cx + 3, cy - 3, 2, 12, c[1]); px(ctx, cx + 8, cy - 3, 2, 12, c[1]);
    px(ctx, cx + 15, cy + 3, 4, 2, c[1]); // stinger
    ellipse(ctx, cx - 6, cy, 6, 6, c[0]);
    px(ctx, cx - 10, cy - 2, 3, 3, '#c82a2a'); px(ctx, cx - 10, cy - 2, 1, 1, '#fff');
    px(ctx, cx - 9, cy - 9, 1, 4, c[1]); px(ctx, cx - 6, cy - 10, 1, 4, c[1]);
  },
  goblin(ctx, w, h, c, p) {
    const cx = w / 2 + p.dx, base = h - 4;
    px(ctx, cx - 5 + p.legs, base - 10, 4, 10, shade(c[0], -0.2)); px(ctx, cx + 2 - p.legs, base - 10, 4, 10, shade(c[0], -0.2));
    px(ctx, cx - 7, base - 24, 14, 15, c[1]);
    px(ctx, cx - 7, base - 14, 14, 2, '#3a2a1a');
    ellipse(ctx, cx - 1, base - 31, 9, 8, c[0]);
    px(ctx, cx - 16, base - 34, 7, 3, c[0]); px(ctx, cx + 8, base - 34, 6, 3, c[0]); // ears
    eyes(ctx, cx - 7, base - 33, 6, 2, '#f2d23a', true);
    px(ctx, cx - 5, base - 26, 6, 1, '#2a1a1a'); px(ctx, cx - 4, base - 26, 1, 2, '#fff'); px(ctx, cx, base - 26, 1, 2, '#fff');
    px(ctx, cx - 8, base - 40, 14, 4, c[2]); // bandana
    // club
    const ax = cx - 12 - p.open * 4, ay = base - 26 - p.open * 6;
    px(ctx, ax, ay, 3, 14, '#6a4a2a'); px(ctx, ax - 1, ay - 5, 5, 6, '#7a5634');
    px(ctx, cx + 7, base - 22, 3, 9, c[0]);
  },
  spore(ctx, w, h, c, p) {
    const cx = w / 2 + p.dx, base = h - 6 + p.dy;
    ctx.globalAlpha = 0.35;
    for (let i = 0; i < 5; i++) ellipse(ctx, cx - 12 + i * 6, base - 34 - ((i * 7 + p.wing * 5) % 8), 1, 1, c[1]);
    ctx.globalAlpha = 1;
    ellipse(ctx, cx, base - 16, 14 * p.sx, 14 * p.sy, c[0]);
    ellipse(ctx, cx - 4, base - 20, 6, 5, shade(c[0], 0.2));
    for (const [x, y] of [[-8, -24], [6, -26], [9, -12], [-10, -10], [0, -6]]) ellipse(ctx, cx + x, base + y, 2, 2, c[1]);
    eyes(ctx, cx - 6, base - 18, 7, 2, '#1c1622', true);
    if (p.open) ellipse(ctx, cx - 2, base - 10, 3, 2 + p.open, '#2a1a2a');
    px(ctx, cx - 3, base - 3, 6, 4, shade(c[0], -0.3));
  },
  wolf(ctx, w, h, c, p) {
    const cx = w / 2 + p.dx, base = h - 4;
    px(ctx, cx - 14 + p.legs * 2, base - 9, 4, 9, shade(c[0], -0.25)); px(ctx, cx - 6 - p.legs * 2, base - 9, 4, 9, shade(c[0], -0.25));
    px(ctx, cx + 6 + p.legs * 2, base - 9, 4, 9, shade(c[0], -0.25)); px(ctx, cx + 13 - p.legs * 2, base - 9, 4, 9, shade(c[0], -0.25));
    ellipse(ctx, cx + 2, base - 15, 16 * p.sx, 8 * p.sy, c[0]);
    for (let i = -10; i <= 12; i += 5) px(ctx, cx + i, base - 25, 2, 4, c[2]); // thorns
    px(ctx, cx + 16, base - 22, 8, 3, c[0]); // tail
    ellipse(ctx, cx - 16, base - 19, 8, 7, c[0]);
    px(ctx, cx - 26, base - 18, 8, 5, shade(c[0], 0.1)); // snout
    px(ctx, cx - 27, base - 19, 2, 2, '#1c1622');
    px(ctx, cx - 18, base - 30, 3, 6, c[0]); px(ctx, cx - 13, base - 30, 3, 6, c[0]); // ears
    px(ctx, cx - 18, base - 22, 2, 2, '#f2d23a');
    if (p.open) { px(ctx, cx - 26, base - 13, 8, 2, '#2a1a1a'); px(ctx, cx - 25, base - 13, 1, 2, '#fff'); px(ctx, cx - 21, base - 13, 1, 2, '#fff'); }
  },
  skeleton(ctx, w, h, c, p) {
    const cx = w / 2 + p.dx, base = h - 4;
    px(ctx, cx - 5 + p.legs, base - 13, 3, 13, c[0]); px(ctx, cx + 2 - p.legs, base - 13, 3, 13, c[0]);
    px(ctx, cx - 6, base - 15, 12, 3, c[0]);
    for (let i = 0; i < 4; i++) px(ctx, cx - 6, base - 31 + i * 4, 12, 2, c[0]);
    px(ctx, cx - 1, base - 32, 2, 18, shade(c[0], -0.15));
    ellipse(ctx, cx, base - 39, 8, 8, c[0]);
    px(ctx, cx - 6, base - 41, 4, 4, '#1c1622'); px(ctx, cx + 1, base - 41, 4, 4, '#1c1622');
    px(ctx, cx - 5, base - 40, 2, 2, c[2]); px(ctx, cx + 2, base - 40, 2, 2, c[2]);
    px(ctx, cx - 3, base - 34, 6, 2, '#1c1622');
    px(ctx, cx - 9, base - 46, 18, 4, c[1]); // helmet
    // rusty sword + shield
    const sx = cx - 13 - p.open * 3;
    px(ctx, sx, base - 34 - p.open * 6, 3, 18, '#9aa0aa'); px(ctx, sx - 2, base - 18 - p.open * 6, 7, 2, '#6a4a2a');
    ellipse(ctx, cx + 9, base - 24, 5, 7, c[1]); px(ctx, cx + 8, base - 26, 2, 4, c[2]);
  },
  goblin_king(ctx, w, h, c, p) {
    const cx = w / 2 + p.dx, base = h - 6;
    // legs
    px(ctx, cx - 16 + p.legs * 2, base - 22, 12, 22, shade(c[0], -0.25)); px(ctx, cx + 4 - p.legs * 2, base - 22, 12, 22, shade(c[0], -0.25));
    px(ctx, cx - 18, base - 4, 14, 4, '#3a2a1a'); px(ctx, cx + 4, base - 4, 14, 4, '#3a2a1a');
    // body + armour of bark
    ellipse(ctx, cx, base - 44, 26 * p.sx, 24 * p.sy, c[0]);
    px(ctx, cx - 20, base - 52, 40, 22, c[1]);
    for (let i = -18; i <= 14; i += 8) px(ctx, cx + i, base - 54, 4, 6, '#7fd65a');
    px(ctx, cx - 20, base - 33, 40, 4, '#2a1a10');
    px(ctx, cx - 4, base - 34, 8, 6, c[2]);
    // head
    ellipse(ctx, cx - 2, base - 74, 16, 14, c[0]);
    px(ctx, cx - 30, base - 80, 12, 5, c[0]); px(ctx, cx + 14, base - 80, 12, 5, c[0]);
    eyes(ctx, cx - 11, base - 78, 13, 3, '#ff4a2a', true);
    px(ctx, cx - 9, base - 66, 14, 3, '#2a1a1a');
    for (let i = -8; i <= 4; i += 4) px(ctx, cx + i, base - 66, 2, 3, '#fff');
    // thorn crown
    px(ctx, cx - 14, base - 90, 26, 5, '#5a7a2e');
    for (let i = -14; i <= 10; i += 6) { px(ctx, cx + i, base - 97, 3, 7, '#5a7a2e'); px(ctx, cx + i + 1, base - 99, 1, 2, c[2]); }
    // arms + club
    px(ctx, cx + 22, base - 54, 8, 22, c[0]);
    const ax = cx - 34 - p.open * 6, ay = base - 70 - p.open * 14;
    px(ctx, cx - 30, base - 54, 8, 20, c[0]);
    px(ctx, ax, ay, 6, 40, '#4a3220'); ellipse(ctx, ax + 3, ay - 2, 9, 11, '#5a3a22');
    for (const [x, y] of [[-8, -6], [8, -2], [0, -12], [-6, 6], [7, 8]]) px(ctx, ax + 3 + x, ay + y, 2, 2, '#7fd65a');
  },
};

export function generateMonsterSheet(def: MonsterDef): HTMLCanvasElement {
  const { w, h, colors, shape } = def.art;
  const { canvas, ctx } = makeCanvas(w * MON_SHEET_COLS, h);
  const paint = painters[shape] ?? painters.slime;
  const tmp = makeCanvas(w, h);
  for (const [anim, meta] of Object.entries(MON_ANIMS) as [MonAnim, typeof MON_ANIMS[MonAnim]][]) {
    for (let f = 0; f < meta.count; f++) {
      const p = pose(anim, f);
      tmp.ctx.clearRect(0, 0, w, h);
      tmp.ctx.save();
      if (p.flat) {
        tmp.ctx.translate(w / 2, h - 3);
        tmp.ctx.scale(1 + p.flat * 0.3, 1 - p.flat * 0.7);
        tmp.ctx.translate(-w / 2, -(h - 3));
      }
      ellipse(tmp.ctx, w / 2, h - 4, Math.max(6, w * 0.3), 3, 'rgba(0,0,0,0.22)');
      paint(tmp.ctx, w, h, colors, p);
      tmp.ctx.restore();
      addOutline(tmp.ctx, 0, 0, w, h);
      if (p.tint) {
        tmp.ctx.globalCompositeOperation = 'source-atop';
        tmp.ctx.fillStyle = p.tint;
        tmp.ctx.fillRect(0, 0, w, h);
        tmp.ctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalAlpha = p.alpha;
      ctx.drawImage(tmp.canvas, (meta.start + f) * w, 0);
      ctx.globalAlpha = 1;
    }
  }
  return canvas;
}

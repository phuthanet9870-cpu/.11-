// "Shadow" character style: original designs of slim black silhouettes with glowing eyes and
// a glowing accent per job (cloth tatters, scarves, horns, hats). Every job line has its own
// silhouette; transcendent jobs add glowing trim, third jobs add an aura and a signature piece.
// Drawn into the same 48x64 frames and animations as the classic chibi sheets (spriteMeta.ts).
import type { Direction } from '../../core/types';
import { ellipse, poly, px, shade } from './canvas';

type HeadKind = 'bare' | 'sprout' | 'hood' | 'pointed_hood' | 'ears_hood' | 'horn_hood' | 'helm' | 'horn_helm' | 'great_helm'
  | 'witch_hat' | 'wide_hat' | 'tricorn' | 'mitre' | 'cap' | 'goggles' | 'bandana' | 'topknot' | 'circlet' | 'flame_crown' | 'antlers';
type BodyKind = 'slim' | 'armor' | 'robe' | 'cloak' | 'coat' | 'apron';
type Eyes = 'dots' | 'slit' | 'visor' | 'cross';

export interface ShadowDesign {
  head: HeadKind;
  body: BodyKind;
  eyes: Eyes;
  /** Glow colour: eyes, edges of weapons, trims and emblems. */
  glow: string;
  scarf?: boolean;
  cape?: 'short' | 'long';
  pauldrons?: boolean;
  bag?: boolean;
  mask?: boolean;
  beads?: boolean;
  emblem?: 'cross' | 'gem' | 'flame' | 'note' | 'flask';
  wings?: boolean;
  halo?: boolean;
  /** Floating glowing motes around the body (books, flasks, embers, beads). */
  orbs?: number;
  fur?: boolean;
  trim?: boolean;
  aura?: boolean;
}

const D = (d: ShadowDesign) => d;
const LINES: Record<string, ShadowDesign> = {
  novice: D({ head: 'sprout', body: 'slim', eyes: 'dots', glow: '#9fe8ff', bag: true }),
  knight: D({ head: 'helm', body: 'armor', eyes: 'visor', glow: '#7fd6ff', pauldrons: true, cape: 'short' }),
  ranger: D({ head: 'pointed_hood', body: 'cloak', eyes: 'dots', glow: '#9cff8a', scarf: true }),
  mage: D({ head: 'witch_hat', body: 'robe', eyes: 'dots', glow: '#7fd6ff' }),
  cleric: D({ head: 'hood', body: 'robe', eyes: 'dots', glow: '#ffe27a', emblem: 'cross' }),
  rogue: D({ head: 'bandana', body: 'slim', eyes: 'slit', glow: '#ff4a5a', mask: true, scarf: true }),
  merchant: D({ head: 'cap', body: 'apron', eyes: 'dots', glow: '#ffcc33', bag: true }),
  dragoon: D({ head: 'horn_helm', body: 'armor', eyes: 'visor', glow: '#5fb8ff', pauldrons: true, cape: 'long' }),
  templar: D({ head: 'great_helm', body: 'armor', eyes: 'cross', glow: '#ffd860', pauldrons: true, cape: 'long', emblem: 'cross' }),
  beastmaster: D({ head: 'ears_hood', body: 'cloak', eyes: 'dots', glow: '#d8ff6a', fur: true }),
  minstrel: D({ head: 'wide_hat', body: 'coat', eyes: 'dots', glow: '#ff8ad8', scarf: true, emblem: 'note' }),
  sorcerer: D({ head: 'pointed_hood', body: 'robe', eyes: 'slit', glow: '#ff7a3a', emblem: 'flame', orbs: 2 }),
  sage: D({ head: 'circlet', body: 'robe', eyes: 'dots', glow: '#7fffd0', cape: 'long', emblem: 'gem' }),
  bishop: D({ head: 'mitre', body: 'robe', eyes: 'dots', glow: '#ffe27a', emblem: 'cross', cape: 'long' }),
  ascetic: D({ head: 'topknot', body: 'slim', eyes: 'slit', glow: '#ffb04a', beads: true }),
  shadowblade: D({ head: 'hood', body: 'cloak', eyes: 'slit', glow: '#b48aff', mask: true, scarf: true }),
  outlaw: D({ head: 'tricorn', body: 'coat', eyes: 'dots', glow: '#ffd34d', scarf: true }),
  artisan: D({ head: 'goggles', body: 'apron', eyes: 'dots', glow: '#ff8a3a', pauldrons: true }),
  alchemist: D({ head: 'goggles', body: 'coat', eyes: 'dots', glow: '#7fff7a', emblem: 'flask', bag: true }),
};

/** Third jobs: the second-job silhouette plus a signature piece and an aura. */
const THIRD: Record<string, [string, Partial<ShadowDesign>]> = {
  dragon_lord: ['dragoon', { wings: true, glow: '#4ad0ff' }],
  high_templar: ['templar', { halo: true }],
  wildlord: ['beastmaster', { head: 'antlers', cape: 'long' }],
  maestro: ['minstrel', { cape: 'long', orbs: 3 }],
  archsorcerer: ['sorcerer', { head: 'flame_crown', cape: 'long', orbs: 3 }],
  archsage: ['sage', { orbs: 3 }],
  archbishop: ['bishop', { halo: true }],
  grandmaster: ['ascetic', { orbs: 4, scarf: true }],
  shadow_reaper: ['shadowblade', { head: 'horn_hood', glow: '#c06aff', cape: 'long' }],
  phantom_outlaw: ['outlaw', { glow: '#7affe0', cape: 'long' }],
  mastersmith: ['artisan', { head: 'horn_helm', cape: 'short', orbs: 2 }],
  grand_alchemist: ['alchemist', { orbs: 3, cape: 'short' }],
};

/** Shadow design of a job; unknown ids fall back to the novice silhouette. */
export function shadowDesign(classId: string): ShadowDesign {
  const third = THIRD[classId];
  if (third) return { ...LINES[third[0]], ...third[1], trim: true, aura: true };
  if (classId.startsWith('high_')) {
    const base = LINES[classId.slice(5)];
    if (base) return { ...base, trim: true, cape: base.cape ?? 'short' };
  }
  return LINES[classId] ?? LINES.novice;
}


/** Pose subset the shadow renderer uses (same values as the classic renderer's poses). */
export interface ShadowPose {
  bob: number; legL: number; legR: number; armL: number; armR: number;
  weaponAngle: number; weaponRaise: number; castGlow: number; armsUp: boolean;
}

const K0 = '#0b0b12', K1 = '#171723', K2 = '#262638', K3 = '#34344a';
const CX = 24, FEET = 60;

/** 1-2px wide line between two points, on whole pixels. */
function line(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, w: number, color: string) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  ctx.fillStyle = color;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    ctx.fillRect(Math.round(x0 + (x1 - x0) * t - w / 2 + 0.01), Math.round(y0 + (y1 - y0) * t), w, 1);
  }
}

function glowDot(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, glow: string) {
  ctx.globalAlpha = 0.15; px(ctx, x - 1, y - 1, w + 2, h + 2, glow); ctx.globalAlpha = 1;
  px(ctx, x, y, w, h, shade(glow, 0.35));
}

// ------------------------------------------------------------------ weapons
function drawShadowWeapon(ctx: CanvasRenderingContext2D, type: string | null, x: number, y: number, angle: number, glow: string) {
  if (!type) return;
  const g = glow, gl = shade(glow, 0.4);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  switch (type) {
    case 'dagger': px(ctx, -1, -2, 3, 3, K1); px(ctx, -3, 1, 7, 1, K2); px(ctx, -1, 2, 3, 9, K0); px(ctx, 1, 3, 1, 8, g); break;
    case 'katar':
      px(ctx, -3, -2, 7, 3, K1); px(ctx, -3, 1, 2, 10, K0); px(ctx, 2, 1, 2, 10, K0); px(ctx, -2, 2, 1, 9, g); px(ctx, 3, 2, 1, 9, g); px(ctx, -1, 11, 4, 2, K0);
      break;
    case 'sword': px(ctx, -1, -4, 3, 4, K1); px(ctx, -4, 0, 9, 2, K2); px(ctx, -1, 2, 4, 17, K0); px(ctx, 2, 3, 1, 16, g); px(ctx, 0, 19, 2, 2, K0); break;
    case 'twohand_sword':
      px(ctx, -1, -6, 3, 6, K1); px(ctx, -5, 0, 11, 2, K2); px(ctx, -2, 2, 6, 22, K0); px(ctx, 3, 3, 1, 21, g); px(ctx, -1, 24, 4, 2, K0); px(ctx, 0, 26, 2, 1, K0);
      break;
    case 'spear': px(ctx, 0, -12, 2, 30, K1); px(ctx, -2, 17, 6, 2, K2); poly(ctx, [[-1, 19], [3, 19], [1, 29]], K0); px(ctx, 1, 20, 1, 7, g); break;
    case 'axe': px(ctx, 0, -4, 2, 22, K1); poly(ctx, [[2, 9], [10, 6], [10, 21], [2, 18]], K0); px(ctx, 9, 7, 1, 13, g); break;
    case 'club': px(ctx, 0, -2, 3, 10, K1); ellipse(ctx, 1, 11, 3, 4, K0); px(ctx, 3, 9, 1, 4, g); break;
    case 'staff':
      px(ctx, 0, -18, 2, 32, K1); poly(ctx, [[-3, -18], [1, -26], [5, -18], [1, -20]], K0);
      ctx.globalAlpha = 0.4; ellipse(ctx, 1, -22, 4, 4, g); ctx.globalAlpha = 1; ellipse(ctx, 1, -22, 2, 2, gl);
      break;
    case 'wand': px(ctx, 0, -4, 2, 14, K1); ctx.globalAlpha = 0.4; ellipse(ctx, 1, -6, 3, 3, g); ctx.globalAlpha = 1; px(ctx, 0, -7, 2, 2, gl); break;
    case 'bow': case 'crossbow':
      ctx.strokeStyle = K0; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(-6, 4, 12, -1.1, 1.1); ctx.stroke();
      ctx.strokeStyle = g; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-6 + 12 * Math.cos(-1.1), 4 + 12 * Math.sin(-1.1)); ctx.lineTo(-6 + 12 * Math.cos(1.1), 4 + 12 * Math.sin(1.1)); ctx.stroke();
      if (type === 'crossbow') px(ctx, -8, 3, 14, 2, K1);
      break;
    case 'instrument': ellipse(ctx, 1, 8, 5, 6, K0); px(ctx, 0, -6, 2, 10, K1); px(ctx, -1, 7, 4, 2, g); px(ctx, 1, -6, 1, 13, shade(g, -0.3)); break;
    case 'book': px(ctx, -4, 2, 9, 7, K1); px(ctx, 0, 2, 1, 7, K0); px(ctx, -3, 4, 2, 1, g); px(ctx, 2, 4, 2, 1, g); px(ctx, -3, 6, 2, 1, g); break;
    case 'knuckle': ctx.globalAlpha = 0.45; ellipse(ctx, 1, 2, 4, 4, g); ctx.globalAlpha = 1; px(ctx, -1, 0, 4, 4, K0); px(ctx, 0, 1, 2, 1, gl); break;
    default: px(ctx, -1, 0, 3, 12, K0); px(ctx, 1, 1, 1, 10, g);
  }
  ctx.restore();
}

// ------------------------------------------------------------------ head
function drawShadowHead(ctx: CanvasRenderingContext2D, d: ShadowDesign, hx: number, hy: number, dir: Direction, phase: number) {
  const g = d.glow, side = dir === 'left', back = dir === 'up';
  const hooded = d.head === 'hood' || d.head === 'pointed_hood' || d.head === 'ears_hood' || d.head === 'horn_hood';
  const helm = d.head === 'helm' || d.head === 'horn_helm' || d.head === 'great_helm';
  // Things behind the head.
  if (d.head === 'bandana' || d.head === 'topknot') {
    const tx = side ? 6 : back ? 0 : 5, s = phase;
    poly(ctx, [[hx + tx, hy - 3], [hx + tx + 7, hy - 1 + s], [hx + tx + 6, hy + 1 + s], [hx + tx, hy - 1]], K1);
    poly(ctx, [[hx + tx, hy - 2], [hx + tx + 5, hy + 3 + s], [hx + tx + 3, hy + 4 + s], [hx + tx - 1, hy]], K0);
  }
  // Skull / hood shell.
  if (hooded) {
    ellipse(ctx, hx, hy, 8, 8, K1);
    if (side) poly(ctx, [[hx + 2, hy - 7], [hx + 9, hy + 2 + phase], [hx + 6, hy + 9], [hx, hy + 7]], K1);
    if (!back) ellipse(ctx, side ? hx - 3 : hx, hy + 1, side ? 3 : 5, 5, K0);
    px(ctx, hx - 5, hy - 7, 4, 1, K3);
  } else if (helm) {
    ellipse(ctx, hx, hy, 7, 7, K1);
    if (d.head === 'great_helm') px(ctx, hx - 7, hy - 4, 14, 11, K1);
    px(ctx, hx - 4, hy - 6, 3, 1, K3); px(ctx, hx - 6, hy - 3, 1, 3, K2);
  } else {
    ellipse(ctx, hx, hy, 6, 6, K0);
    px(ctx, hx - 4, hy - 5, 3, 1, K2); px(ctx, hx - 5, hy - 4, 1, 2, K2);
  }
  // Eyes.
  if (!back) {
    const ey = hy + 1;
    if (d.eyes === 'visor' || (helm && d.eyes !== 'cross')) {
      if (side) glowDot(ctx, hx - 7, ey, 5, 1, g); else glowDot(ctx, hx - 4, ey, 9, 1, g);
    } else if (d.eyes === 'cross') {
      if (side) { glowDot(ctx, hx - 7, ey, 4, 1, g); px(ctx, hx - 6, ey - 3, 1, 7, shade(g, 0.2)); }
      else { glowDot(ctx, hx - 4, ey, 9, 1, g); px(ctx, hx, ey - 4, 1, 9, shade(g, 0.2)); }
    } else if (d.eyes === 'slit') {
      if (side) glowDot(ctx, hx - 5, ey, 3, 1, g); else { glowDot(ctx, hx - 4, ey, 3, 1, g); glowDot(ctx, hx + 1, ey, 3, 1, g); }
    } else {
      if (side) glowDot(ctx, hx - 5, ey - 1, 2, 2, g); else { glowDot(ctx, hx - 4, ey - 1, 2, 2, g); glowDot(ctx, hx + 2, ey - 1, 2, 2, g); }
    }
    if (d.mask) { if (side) px(ctx, hx - 6, hy + 3, 7, 4, K1); else px(ctx, hx - 6, hy + 3, 12, 4, K1); }
  }
  // Headgear on top.
  const m = (pts: [number, number][]) => pts.map(([x, y]) => [hx + x, hy + y] as [number, number]);
  switch (d.head) {
    case 'sprout':
      line(ctx, hx, hy - 6, hx + 1, hy - 10, 1, K0);
      poly(ctx, m([[1, -10], [5, -13], [4, -9]]), K0); px(ctx, hx + 3, hy - 11, 1, 1, shade(g, -0.2));
      break;
    case 'pointed_hood': poly(ctx, m(side ? [[-2, -7], [9, -13 + phase], [11, -11 + phase], [6, -3]] : back ? [[-5, -6], [0, -15], [5, -6]] : [[-5, -6], [3, -15], [5, -13], [6, -5]]), K1); break;
    case 'ears_hood':
      for (const s of side ? [1] : [-1, 1]) poly(ctx, m([[s * 3, -6], [s * 7, -14], [s * 8, -4]]), K1);
      if (d.fur) { px(ctx, hx - 8, hy + 6, 16, 3, K1); for (let x = -8; x < 8; x += 3) poly(ctx, m([[x, 8], [x + 3, 8], [x + 1, 11]]), K1); }
      break;
    case 'horn_hood':
      for (const s of side ? [1] : [-1, 1]) poly(ctx, m([[s * 3, -6], [s * 8, -11], [s * 12, -17], [s * 10, -10], [s * 7, -4]]), K0);
      break;
    case 'helm': poly(ctx, m(side ? [[-1, -7], [6, -12], [12, -8 + phase], [10, -6 + phase], [4, -6]] : [[-1, -7], [0, -13], [2, -14], [7, -9 + phase], [5, -6]]), K0); break;
    case 'horn_helm':
      for (const s of side ? [1] : [-1, 1]) poly(ctx, m([[s * 4, -4], [s * 10, -8], [s * 14, -15], [s * 11, -7], [s * 6, -2]]), K0);
      break;
    case 'great_helm': px(ctx, hx - 7, hy - 6, 14, 2, K2); break;
    case 'witch_hat':
      ellipse(ctx, hx, hy - 5, 11, 2, K0);
      poly(ctx, m([[-6, -5], [6, -5], [3, -14], [8, -19], [10, -17], [1, -12]].map(([x, y]) => [side ? x + 1 : x, y] as [number, number])), K0);
      px(ctx, hx - 6, hy - 7, 12, 1, shade(g, -0.35));
      break;
    case 'wide_hat':
      ellipse(ctx, hx, hy - 5, 12, 3, K0); px(ctx, hx - 6, hy - 11, 12, 6, K0); px(ctx, hx - 6, hy - 7, 12, 1, shade(g, -0.3));
      line(ctx, hx + 5, hy - 10, hx + 11, hy - 17, 1, g); line(ctx, hx + 6, hy - 10, hx + 10, hy - 15, 1, shade(g, -0.4));
      break;
    case 'tricorn':
      poly(ctx, m([[-11, -5], [0, -9], [11, -5], [6, -3], [0, -5], [-6, -3]]), K0); px(ctx, hx - 6, hy - 12, 12, 6, K0);
      px(ctx, hx - 2, hy - 10, 4, 2, shade(g, -0.2));
      break;
    case 'mitre':
      poly(ctx, m([[-5, -5], [-5, -12], [0, -19], [5, -12], [5, -5]]), K1);
      px(ctx, hx, hy - 16, 1, 9, g); px(ctx, hx - 2, hy - 13, 5, 1, g);
      break;
    case 'cap':
      ellipse(ctx, hx, hy - 4, 7, 4, K1);
      if (side) px(ctx, hx - 10, hy - 3, 6, 2, K1); else px(ctx, hx - 7, hy - 2, 14, 2, K1);
      break;
    case 'goggles':
      px(ctx, hx - 7, hy - 4, 14, 2, K1);
      if (side) glowDot(ctx, hx - 6, hy - 5, 3, 3, g); else { glowDot(ctx, hx - 5, hy - 5, 3, 3, g); glowDot(ctx, hx + 2, hy - 5, 3, 3, g); }
      break;
    case 'bandana': px(ctx, hx - 6, hy - 4, 12, 3, K1); break;
    case 'topknot': ellipse(ctx, hx, hy - 8, 3, 3, K0); px(ctx, hx - 2, hy - 6, 4, 1, g); break;
    case 'circlet':
      px(ctx, hx - 6, hy - 3, 12, 1, shade(g, -0.2));
      glowDot(ctx, side ? hx - 5 : hx - 1, hy - 4, 2, 2, g);
      break;
    case 'flame_crown':
      for (const [x, t] of side ? [[-4, 6], [-1, 8], [2, 6]] : [[-5, 5], [-2, 8], [1, 9], [4, 6]]) {
        poly(ctx, m([[x - 1, -5], [x + 1, -5 - t + phase], [x + 3, -5]]), shade(g, -0.2));
        px(ctx, hx + x + 1, hy - 7, 1, 2, shade(g, 0.4));
      }
      break;
    case 'antlers':
      ellipse(ctx, hx, hy, 8, 8, K1); if (!back) ellipse(ctx, side ? hx - 3 : hx, hy + 1, side ? 3 : 5, 5, K0);
      if (!back) { if (side) glowDot(ctx, hx - 5, hy, 2, 2, g); else { glowDot(ctx, hx - 4, hy, 2, 2, g); glowDot(ctx, hx + 2, hy, 2, 2, g); } }
      for (const s of side ? [1] : [-1, 1]) {
        line(ctx, hx + s * 4, hy - 6, hx + s * 9, hy - 15, 1, K0);
        line(ctx, hx + s * 6, hy - 10, hx + s * 11, hy - 11, 1, K0);
        line(ctx, hx + s * 8, hy - 13, hx + s * 7, hy - 18, 1, K0);
      }
      break;
    default: break;
  }
}

// ------------------------------------------------------------------ body
/** Draws one frame facing left/down/up (right is mirrored by the sheet builder). */
export function drawShadowFrame(ctx: CanvasRenderingContext2D, d: ShadowDesign, weapon: string | null, shield: boolean, dir: Direction, p: ShadowPose) {
  const by = p.bob, g = d.glow, side = dir === 'left', back = dir === 'up';
  const sway = (p.armL - p.armR) / 2; // walk cycle: 2, 0, -2, 0
  const phase = Math.round(sway / 2) + (p.bob ? 1 : 0);
  const hx = CX, hy = by + 17;
  const sh = by + 25, hip = by + 41;
  const handX = dir === 'down' ? CX + 9 : back ? CX - 9 : CX - 6;
  const handY = by + 40 - p.weaponRaise;
  const wAngle = side ? p.weaponAngle + 0.2 : -p.weaponAngle;
  const isBow = weapon === 'bow' || weapon === 'crossbow';

  // Aura at the feet (third jobs).
  if (d.aura) {
    ctx.globalAlpha = 0.15; ellipse(ctx, CX, FEET - 1, 13, 4, g); ctx.globalAlpha = 1;
    for (const [x, y] of [[-10, -8], [9, -14], [-6, -22], [11, -4]] as [number, number][]) px(ctx, CX + x, FEET + y - (phase & 1), 1, 1, shade(g, 0.3));
  } else ellipse(ctx, CX, FEET, 10, 3, 'rgba(0,0,0,0.3)');

  // Behind the body: wings, cape, scarf tails, bag, weapon held at the back.
  if (d.wings) {
    for (const s of side ? [1] : [-1, 1]) {
      const wx = side ? CX + 3 : CX + s * 4;
      poly(ctx, [[wx, sh + 1], [wx + s * 10, sh - 10 - phase], [wx + s * 17, sh - 6 - phase], [wx + s * 14, sh + 2], [wx + s * 11, sh - 1], [wx + s * 9, sh + 6], [wx + s * 5, sh + 4]], K1);
      line(ctx, wx, sh + 1, wx + s * 10, sh - 10 - phase, 1, shade(g, -0.45));
    }
  }
  const capeLen = d.cape === 'long' ? 56 : 46;
  if (d.cape && !back) {
    const pts: [number, number][] = side
      ? [[CX - 1, sh], [CX + 5, sh], [CX + 9 + sway, by + capeLen], [CX + 4 + sway, by + capeLen + 2], [CX + 1, by + capeLen]]
      : [[CX - 7, sh], [CX + 7, sh], [CX + 10, by + capeLen], [CX - 10, by + capeLen]];
    poly(ctx, pts, K1);
    if (d.trim) line(ctx, side ? CX + 9 + sway : CX - 10, by + capeLen, side ? CX + 1 : CX + 10, by + capeLen, 1, shade(g, -0.3));
  }
  if (d.scarf && !back) {
    const sx = side ? CX + 4 : CX + 5;
    poly(ctx, [[sx, sh - 1], [sx + 9, sh + 2 + phase], [sx + 13, sh + 1 + phase], [sx + 10, sh + 5 + phase], [sx + 1, sh + 3]], K0);
    poly(ctx, [[sx, sh], [sx + 7, sh + 8 + phase], [sx + 4, sh + 9 + phase], [sx - 1, sh + 3]], K1);
  }
  if (d.bag && !back) { if (side) px(ctx, CX + 3, sh + 1, 6, 9, K1); else px(ctx, CX - 9, sh + 2, 18, 8, K1); }
  if (back) drawShadowWeapon(ctx, weapon, handX, handY, isBow ? Math.PI : wAngle, g);

  // Legs.
  const legW = d.body === 'armor' ? 4 : 3;
  const legH = (lift: number) => FEET - lift * 1.5;
  if (d.body !== 'robe') {
    if (side) {
      const swing = (p.legL - p.legR) * 1.5;
      px(ctx, CX - 2 + swing, hip, legW, legH(p.legR) - hip, K0); px(ctx, CX - 4 + swing, legH(p.legR) - 2, 5, 2, K0);
      px(ctx, CX - 1 - swing, hip, legW, legH(p.legL) - hip, K1); px(ctx, CX - 3 - swing, legH(p.legL) - 2, 5, 2, K1);
    } else {
      px(ctx, CX - 4 - (legW - 3), hip, legW, legH(p.legL) - hip, K0); px(ctx, CX - 5 - (legW - 3), legH(p.legL) - 2, legW + 1, 2, K0);
      px(ctx, CX + 1, hip, legW, legH(p.legR) - hip, K0); px(ctx, CX + 1, legH(p.legR) - 2, legW + 1, 2, K0);
    }
  } else {
    const fy = FEET - 2;
    if (side) px(ctx, CX - 5 + sway, fy, 4, 2, K0); else { px(ctx, CX - 5, fy - p.legL, 4, 2, K0); px(ctx, CX + 1, fy - p.legR, 4, 2, K0); }
  }

  // Coat tails hang behind the legs; the torso goes on top.
  if (d.body === 'coat') {
    poly(ctx, side ? [[CX - 3, by + 36], [CX + 4, by + 36], [CX + 9 + sway, by + 52], [CX + 2 + sway, by + 51]] : [[CX - 6, by + 36], [CX + 6, by + 36], [CX + 8, by + 51], [CX + 2, by + 49], [CX - 2, by + 49], [CX - 8, by + 51]], K1);
  }
  const w = side ? 0.75 : 1;
  const torso = (pts: [number, number][], c: string) => poly(ctx, pts.map(([x, y]) => [CX + x * w, by + y] as [number, number]), c);
  switch (d.body) {
    case 'slim': torso([[-6, 24], [6, 24], [5, 42], [-5, 42]], K0); break;
    case 'armor': torso([[-8, 24], [8, 24], [6, 42], [-6, 42]], K0); px(ctx, CX - 5 * w, by + 37, 10 * w, 2, K2); break;
    case 'apron': torso([[-6, 24], [6, 24], [5, 42], [-5, 42]], K0); if (!back) torso([[-5, 32], [5, 32], [6, 50], [-6, 50]], K1); break;
    case 'coat': torso([[-6, 24], [6, 24], [6, 42], [-6, 42]], K0); break;
    case 'robe': {
      const hem = Math.min(58, 58 - by);
      const s = side ? sway : 0;
      torso([[-6, 24], [6, 24], [10 + s, hem], [-9 + s, hem]], K0);
      if (!back) torso([[-1, 30], [1, 30], [2, hem], [-2, hem]], K1);
      break;
    }
    case 'cloak': {
      const s = side ? sway + 2 : sway / 2;
      const pts: [number, number][] = [[-7, 23], [7, 23], [11 + s, 50]];
      for (let x = 11; x > -11; x -= 4) pts.push([x - 2 + s, 54 + ((x / 4) & 1) * 2], [x - 4 + s, 50]);
      pts.push([-11 + s, 50]);
      torso(pts, K0);
      if (!back) torso([[-1, 26], [1, 26], [1, 50], [-1, 50]], K1);
      break;
    }
  }
  // Rim light on the lit (left/top) edge of the torso.
  px(ctx, CX - 6 * w, by + 25, 1, 8, K2);
  if (d.trim) px(ctx, CX - 5 * w, by + 41, 10 * w, 1, shade(g, -0.25));
  if (d.pauldrons && !(side && back)) {
    for (const s of side ? [0] : [-1, 1]) { ellipse(ctx, CX + s * 8, by + 26, 4, 3, K1); px(ctx, CX + s * 8 - 3, by + 24, 4, 1, K3); }
  }
  if (d.beads && !back) for (let i = -3; i <= 3; i++) px(ctx, CX + i * 2 * w, by + 26 + Math.abs(i) * -0.5 + 3, 1, 1, i % 2 ? g : shade(g, -0.3));
  if (d.emblem && !back) {
    const ex = side ? CX - 2 : CX, ey = by + 31;
    switch (d.emblem) {
      case 'cross': px(ctx, ex - 1, ey - 2, 1, 6, g); px(ctx, ex - 3, ey, 5, 1, g); break;
      case 'gem': glowDot(ctx, ex - 1, ey, 2, 2, g); break;
      case 'flame': poly(ctx, [[ex - 2, ey + 3], [ex, ey - 3 + phase], [ex + 2, ey + 3]], g); break;
      case 'note': px(ctx, ex, ey - 2, 1, 5, g); px(ctx, ex - 2, ey + 2, 3, 2, g); px(ctx, ex + 1, ey - 2, 2, 1, g); break;
      case 'flask': px(ctx, ex - 1, ey - 2, 2, 2, K2); ellipse(ctx, ex, ey + 2, 2, 2, g); break;
    }
  }
  if (d.cape && back) {
    const pts: [number, number][] = [[CX - 8, sh - 1], [CX + 8, sh - 1], [CX + 10 + sway / 2, by + capeLen], [CX - 10 + sway / 2, by + capeLen]];
    poly(ctx, pts, K1); px(ctx, CX - 8, sh - 1, 16, 1, K3);
    if (d.trim) line(ctx, CX - 10, by + capeLen, CX + 10, by + capeLen, 1, shade(g, -0.3));
  }
  if (d.bag && back) px(ctx, CX - 7, sh + 1, 14, 11, K1);

  // Arms: thin and dark; the weapon hand follows the pose.
  const aw = d.body === 'armor' ? 3 : 2;
  if (p.armsUp) {
    const ax = side ? [CX - 2] : [CX - 6, CX + 6];
    for (const x of ax) line(ctx, x, by + 27, x + (x < CX ? -3 : 3), by + 18, aw, K1);
  } else if (side) {
    line(ctx, CX, by + 27, handX, handY, aw, K1);
  } else {
    line(ctx, CX - 7, by + 27, CX - 9, by + 39 + p.armL, aw, K1);
    line(ctx, CX + 7, by + 27, handX, handY, aw, K1);
  }

  drawShadowHead(ctx, d, hx, hy, dir, phase);

  if (d.halo) { ctx.strokeStyle = g; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(hx + 0.5, hy - 12.5 + (phase & 1), 6, 2, 0, 0, Math.PI * 2); ctx.stroke(); }
  if (shield && !back) {
    const sx = dir === 'down' ? CX - 14 : CX - 9, sy = by + 32;
    poly(ctx, [[sx, sy], [sx + 8, sy], [sx + 8, sy + 7], [sx + 4, sy + 11], [sx, sy + 7]], K1);
    px(ctx, sx + 3, sy + 3, 2, 3, g);
  }
  if (!back) {
    if (p.armsUp) drawShadowWeapon(ctx, weapon, dir === 'down' ? CX + 9 : CX - 5, by + 20, -0.1, g);
    else drawShadowWeapon(ctx, weapon, handX, handY, isBow ? (side ? 0 : -Math.PI / 2) : wAngle, g);
  }
  if (d.orbs) {
    for (let i = 0; i < d.orbs; i++) {
      const a = (i / d.orbs) * Math.PI * 2 + phase * 0.6 + (p.castGlow ? 0.8 : 0);
      const ox = CX + Math.cos(a) * 14, oy = by + 30 + Math.sin(a) * 6 - 4;
      if (back && Math.sin(a) > 0) continue;
      glowDot(ctx, Math.round(ox), Math.round(oy), 2, 2, g);
    }
  }
  if (p.castGlow) {
    // A spell orb gathering above the raised hands.
    const r = 1 + Math.floor(p.castGlow / 2);
    ctx.globalAlpha = 0.15; ellipse(ctx, CX, by + 5, r + 3, r + 3, g); ctx.globalAlpha = 1;
    ellipse(ctx, CX, by + 5, r, r, shade(g, 0.4));
  }
}

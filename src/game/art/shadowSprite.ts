// "Shadow" character style: original designs of slim black silhouettes with glowing eyes and
// a glowing accent per job (cloth tatters, scarves, horns, hats). Every job line has its own
// silhouette; transcendent jobs add glowing trim, third jobs add an aura and a signature piece.
// Drawn into the same 48x64 frames and animations as the classic chibi sheets (spriteMeta.ts).
import type { Direction } from '../../core/types';
import { addOutline, ellipse, makeCanvas, poly, px, shade } from './canvas';
import { CHAR_DIRECTIONS, CHAR_FRAME_H, CHAR_FRAME_W, type CharAnim } from './spriteMeta';

type HeadKind = 'bare' | 'sprout' | 'hood' | 'pointed_hood' | 'ears_hood' | 'horn_hood' | 'helm' | 'horn_helm' | 'great_helm'
  | 'witch_hat' | 'wide_hat' | 'tricorn' | 'mitre' | 'cap' | 'goggles' | 'bandana' | 'topknot' | 'circlet' | 'flame_crown' | 'antlers'
  // NPC-only headwear (never used by player jobs)
  | 'top_hat' | 'turban' | 'straw_hat' | 'veil' | 'chef_hat' | 'mentor_hat' | 'kerchief' | 'bonnet';
type BodyKind = 'slim' | 'armor' | 'robe' | 'cloak' | 'coat' | 'apron'
  // NPC-only clothes
  | 'gown' | 'longcoat' | 'smock';
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

/** NPC roles drawn as shadows: each role has its own silhouette, tool and glow colour. */
const NPC_LOOK: Record<string, [ShadowDesign, string | null]> = {
  smith: [D({ head: 'kerchief', body: 'smock', eyes: 'dots', glow: '#ff9a4a' }), 'hammer'],
  shop: [D({ head: 'straw_hat', body: 'smock', eyes: 'dots', glow: '#ffe27a', bag: true }), 'keys'],
  inn: [D({ head: 'chef_hat', body: 'smock', eyes: 'dots', glow: '#ffb0a0' }), 'ladle'],
  courier: [D({ head: 'top_hat', body: 'longcoat', eyes: 'dots', glow: '#7fd6ff', bag: true }), 'scroll'],
  warp: [D({ head: 'veil', body: 'gown', eyes: 'dots', glow: '#7fd6ff', orbs: 2 }), 'crystal'],
  market: [D({ head: 'top_hat', body: 'longcoat', eyes: 'dots', glow: '#ffd34d', trim: true }), 'scales'],
  trader: [D({ head: 'turban', body: 'longcoat', eyes: 'dots', glow: '#ffd34d', bag: true }), 'scales'],
  storage: [D({ head: 'kerchief', body: 'longcoat', eyes: 'dots', glow: '#c8a26b' }), 'keys'],
  enchant: [D({ head: 'veil', body: 'gown', eyes: 'slit', glow: '#c9a6ff', orbs: 3 }), 'crystal'],
  stable: [D({ head: 'straw_hat', body: 'longcoat', eyes: 'dots', glow: '#c8a060' }), 'lantern'],
  dungeon: [D({ head: 'turban', body: 'gown', eyes: 'slit', glow: '#ff8a7a', cape: 'long' }), 'lantern'],
  arena: [D({ head: 'top_hat', body: 'longcoat', eyes: 'slit', glow: '#ff8a8a', cape: 'long' }), 'banner'],
  mvp: [D({ head: 'veil', body: 'longcoat', eyes: 'slit', glow: '#ff5a5a', cape: 'long', aura: true }), 'bell'],
  reset: [D({ head: 'mentor_hat', body: 'gown', eyes: 'dots', glow: '#9fe8ff' }), 'scroll'],
  runes: [D({ head: 'turban', body: 'gown', eyes: 'dots', glow: '#c9a6ff', orbs: 4 }), 'crystal'],
  townsfolk: [D({ head: 'bonnet', body: 'smock', eyes: 'dots', glow: '#e8e4d8' }), null],
};

/** Shadow look of an NPC: job masters look like the job they teach, everyone else like their trade. */
export function npcShadowLook(role: string, jobClass?: string, id = ''): { design: ShadowDesign; weapon: string | null } {
  // Job masters: a mentor's cap and long coat (not the job's own player look), glowing in the job's colour,
  // with a banner of that colour.
  if (role === 'job' && jobClass) return { design: D({ head: 'mentor_hat', body: 'longcoat', eyes: 'dots', glow: shadowDesign(jobClass).glow, cape: 'long', trim: true }), weapon: 'banner' };
  const [design, weapon] = NPC_LOOK[role] ?? NPC_LOOK.townsfolk;
  if (role === 'townsfolk' && id) {
    // Townsfolk differ from each other: hat, clothes and what they carry come from their id.
    let hsh = 0; for (const ch of id) hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0;
    const heads: HeadKind[] = ['bonnet', 'straw_hat', 'kerchief', 'top_hat'], bodies: BodyKind[] = ['smock', 'gown', 'longcoat'];
    const glows = ['#e8e4d8', '#ffd8a0', '#a8e0ff', '#c8f0a8'];
    return { design: { ...design, head: heads[hsh % 4], body: bodies[(hsh >> 3) % 3], glow: glows[(hsh >> 6) % 4], scarf: (hsh >> 9) % 2 === 0 }, weapon: [null, 'lantern', 'scroll', null][(hsh >> 11) % 4] };
  }
  return { design, weapon };
}

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
function drawShadowWeapon(ctx: CanvasRenderingContext2D, type: string | null, x: number, y: number, angle: number, glow: string, draw = 0, nocked = false) {
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
    case 'bow': case 'crossbow': {
      // Belly toward local +x (the shot direction); the string is pulled back toward -x.
      ctx.strokeStyle = K0; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(-6, 4, 12, -1.1, 1.1); ctx.stroke();
      const tx = -6 + 12 * Math.cos(1.1), ty = 12 * Math.sin(1.1), pull = tx - 7 * draw;
      line(ctx, tx, 4 - ty, pull, 4, 1, g); line(ctx, pull, 4, tx, 4 + ty, 1, g);
      if (type === 'crossbow') px(ctx, -10, 3, 16, 2, K1);
      if (nocked) { px(ctx, Math.round(pull), 4, 15, 1, K2); px(ctx, Math.round(pull) + 14, 3, 2, 3, gl); }
      break;
    }
    case 'instrument': ellipse(ctx, 1, 8, 5, 6, K0); px(ctx, 0, -6, 2, 10, K1); px(ctx, -1, 7, 4, 2, g); px(ctx, 1, -6, 1, 13, shade(g, -0.3)); break;
    case 'book': px(ctx, -4, 2, 9, 7, K1); px(ctx, 0, 2, 1, 7, K0); px(ctx, -3, 4, 2, 1, g); px(ctx, 2, 4, 2, 1, g); px(ctx, -3, 6, 2, 1, g); break;
    case 'knuckle': ctx.globalAlpha = 0.45; ellipse(ctx, 1, 2, 4, 4, g); ctx.globalAlpha = 1; px(ctx, -1, 0, 4, 4, K0); px(ctx, 0, 1, 2, 1, gl); break;
    // ---- NPC-only things to hold
    case 'lantern': line(ctx, 0, 0, 0, 5, 1, K2); px(ctx, -3, 5, 7, 8, K1); ctx.globalAlpha = 0.45; ellipse(ctx, 0, 9, 5, 5, g); ctx.globalAlpha = 1; px(ctx, -1, 7, 3, 4, gl); px(ctx, -3, 5, 7, 1, K3); break;
    case 'scales': px(ctx, 0, -2, 1, 14, K2); px(ctx, -7, 0, 15, 1, K2); line(ctx, -6, 1, -7, 7, 1, K3); line(ctx, 6, 1, 7, 7, 1, K3); px(ctx, -10, 7, 6, 2, g); px(ctx, 5, 7, 6, 2, g); break;
    case 'scroll': px(ctx, -2, 0, 5, 12, K2); px(ctx, -3, 0, 7, 2, K1); px(ctx, -3, 11, 7, 2, K1); px(ctx, -1, 3, 3, 1, g); px(ctx, -1, 6, 3, 1, g); break;
    case 'keys': ctx.strokeStyle = K3; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 4, 3, 0, Math.PI * 2); ctx.stroke(); for (const k of [-2, 0, 2]) { px(ctx, k, 6, 1, 6, K2); px(ctx, k, 11, 2, 1, g); } break;
    case 'hammer': px(ctx, 0, -2, 2, 14, K1); px(ctx, -5, 10, 12, 6, K0); px(ctx, -5, 10, 12, 1, K3); px(ctx, 6, 11, 1, 4, g); break;
    case 'ladle': px(ctx, 0, -2, 1, 13, K2); ellipse(ctx, 0, 13, 3, 2, K1); px(ctx, -1, 12, 3, 1, g); break;
    case 'crystal': ctx.globalAlpha = 0.4; ellipse(ctx, 0, -4, 6, 6, g); ctx.globalAlpha = 1; ellipse(ctx, 0, -4, 3, 3, gl); px(ctx, -1, -6, 1, 1, '#ffffff'); break;
    case 'banner': px(ctx, 0, -16, 2, 30, K1); poly(ctx, [[2, -16], [12, -14], [10, -10], [12, -6], [2, -6]], g); px(ctx, -1, -18, 4, 2, K3); break;
    case 'bell': px(ctx, 0, -14, 2, 26, K1); poly(ctx, [[-4, -8], [5, -8], [3, -15], [-2, -15]], K2); px(ctx, 0, -7, 2, 2, g); break;
    default: px(ctx, -1, 0, 3, 12, K0); px(ctx, 1, 1, 1, 10, g);
  }
  ctx.restore();
}

// ------------------------------------------------------------------ head
function drawShadowHead(ctx: CanvasRenderingContext2D, d: ShadowDesign, hx: number, hy: number, dir: Direction, phase: number, blink = false) {
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
    // Blink: dots and slits close to a dim line for a frame (visors and helmets do not blink).
    if (blink && (d.eyes === 'dots' || d.eyes === 'slit') && !helm) {
      const dim = shade(g, -0.35);
      if (side) px(ctx, hx - 5, ey, 3, 1, dim); else { px(ctx, hx - 4, ey, 3, 1, dim); px(ctx, hx + 1, ey, 3, 1, dim); }
    } else if (d.eyes === 'visor' || (helm && d.eyes !== 'cross')) {
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
    // ---- NPC-only headwear
    case 'top_hat':
      px(ctx, hx - 8, hy - 6, 16, 2, K0); px(ctx, hx - 5, hy - 17, 10, 11, K0); px(ctx, hx - 5, hy - 9, 10, 2, shade(g, -0.2)); px(ctx, hx - 4, hy - 16, 1, 6, K2);
      break;
    case 'turban':
      ellipse(ctx, hx, hy - 5, 8, 5, K1); ellipse(ctx, hx, hy - 9, 6, 3, K1);
      for (let i = 0; i < 3; i++) px(ctx, hx - 7 + i, hy - 7 + i * 2, 14 - i * 2, 1, K2);
      if (!back) glowDot(ctx, side ? hx - 6 : hx - 1, hy - 7, 2, 2, g);
      poly(ctx, m([[3, -11], [6, -18], [5, -10]]), shade(g, -0.3));
      break;
    case 'straw_hat':
      ellipse(ctx, hx, hy - 4, 13, 3, K1); ellipse(ctx, hx, hy - 8, 6, 4, K1); px(ctx, hx - 6, hy - 6, 12, 1, shade(g, -0.25));
      for (let x = -12; x <= 12; x += 4) px(ctx, hx + x, hy - 4, 1, 1, K3);
      break;
    case 'veil':
      ellipse(ctx, hx, hy, 8, 8, K1);
      poly(ctx, m([[-8, 0], [8, 0], [9, 14], [-9, 14]]), K1);
      if (!back) for (let x = -6; x <= 6; x += 3) px(ctx, hx + x, hy + 3, 1, 10, K2);
      ellipse(ctx, hx, hy - 8, 5, 2, shade(g, -0.35));
      break;
    case 'chef_hat':
      px(ctx, hx - 6, hy - 7, 12, 3, K2); ellipse(ctx, hx - 4, hy - 12, 4, 4, K2); ellipse(ctx, hx + 4, hy - 12, 4, 4, K2); ellipse(ctx, hx, hy - 15, 5, 4, K3);
      break;
    case 'mentor_hat':
      // Scholar's square cap with a glowing tassel.
      poly(ctx, m([[-11, -8], [0, -13], [11, -8], [0, -3]]), K0); px(ctx, hx - 6, hy - 7, 12, 3, K1);
      line(ctx, hx + 6, hy - 9, hx + 9, hy - 2 + phase, 1, g); glowDot(ctx, hx + 8, hy - 2 + phase, 2, 2, g);
      break;
    case 'kerchief':
      px(ctx, hx - 7, hy - 6, 14, 4, K1); poly(ctx, m([[-2, -6], [-6, -11], [-1, -8]]), K1); poly(ctx, m([[2, -6], [6, -11], [1, -8]]), K1);
      for (let x = -6; x < 7; x += 3) px(ctx, hx + x, hy - 5, 1, 1, shade(g, -0.2));
      break;
    case 'bonnet':
      ellipse(ctx, hx, hy - 3, 8, 6, K1); px(ctx, hx - 8, hy - 1, 16, 2, K2);
      if (!back) { line(ctx, hx - 5, hy + 1, hx - 3, hy + 7, 1, shade(g, -0.2)); line(ctx, hx + 5, hy + 1, hx + 3, hy + 7, 1, shade(g, -0.2)); }
      break;
    default: break;
  }
}


// ------------------------------------------------------------------ poses
/** How a weapon attacks: sweeping slash, thrust, bow shot, spell bolt or fists. */
export type AttackStyle = 'slash' | 'thrust' | 'shoot' | 'magic' | 'punch';
export function attackStyle(weapon: string | null): AttackStyle {
  switch (weapon) {
    case 'spear': case 'katar': return 'thrust';
    case 'bow': case 'crossbow': return 'shoot';
    case 'staff': case 'wand': case 'book': case 'instrument': return 'magic';
    case 'knuckle': case null: return 'punch';
    default: return 'slash';
  }
}

export interface ShadowPose {
  bob: number;
  /** Foot lift (front/back views). */
  legL: number; legR: number;
  /** Side-view stride, -1..1 (front leg forward). */
  stride: number;
  /** Off-hand swing (+ = down/forward) and punch reach 0..1. */
  armL: number; offReach: number;
  /** Both arms raised (casting), 0..1. */
  armsUp: number;
  /** Weapon hand offset: [forward, up] in px. */
  hand: [number, number];
  /** Weapon angle (side-view convention: 0 = pointing down, PI/2 = forward, PI = up). */
  a: number;
  /** Body shift toward the facing direction. */
  lean: number;
  /** Cloth flutter step and how far cloth trails behind. */
  wind: number; sway: number;
  trail?: [number, number, number];
  bowDraw?: number; nocked?: boolean; arrow?: number;
  charge?: number; bolt?: number;
  thrustFx?: number;
  impact?: 'hand' | 'off' | 'tip';
  cast?: number;
  /** Eyes closed for this frame (idle blink). */
  blink?: boolean;
  /** Whole-body tilt about the feet in side view (radians; + leans back, - leans into the move). */
  tilt?: number;
  /** Head offset [forward, down] in px: it trails the body a little (follow-through). */
  head?: [number, number];
  /** Walk cycle 0..1: the swinging foot lifts and the knee bends. */
  gait?: number;
  /** Weight shift sideways in front/back views (px). */
  shiftX?: number;
}

const P0: ShadowPose = { bob: 0, legL: 0, legR: 0, stride: 0, armL: 0, offReach: 0, armsUp: 0, hand: [0, 0], a: 0.3, lean: 0, wind: 0, sway: 0 };

/** Key pose index 0..5 for frame f of n (fewer frames sample the key poses). */
const key6 = (f: number, n: number) => (n >= 6 ? Math.min(5, Math.floor((f * 6) / n)) : Math.round((f * 5) / Math.max(1, n - 1)));

export function shadowPose(anim: CharAnim, f: number, n: number, weapon: string | null): ShadowPose {
  const t = f / n, k = key6(f, n);
  switch (anim) {
    case 'idle': {
      // Slow breath (the body sinks a pixel on the out-breath), cloth drifting, a blink near the end.
      const br = (1 - Math.cos(t * Math.PI * 2)) / 2;
      return { ...P0, bob: br > 0.55 ? 1 : 0, wind: Math.floor(t * 4), sway: Math.round(br * 2), hand: [Math.round(br), br > 0.5 ? -1 : 0], armL: br > 0.5 ? 1 : 0, blink: n >= 6 && f === n - 2,
        tilt: 0.025 * Math.sin(t * Math.PI * 2), head: [0, br > 0.75 ? 1 : 0], shiftX: Math.round(Math.sin(t * Math.PI * 2) * 0.7) };
    }
    case 'walk': {
      const s = Math.sin(t * Math.PI * 2), c = Math.cos(t * Math.PI * 2);
      return { ...P0, legL: Math.max(0, s) * 3, legR: Math.max(0, -s) * 3, stride: s, armL: Math.round(-s * 3), hand: [Math.round(s * 3), Math.round(Math.abs(s))], bob: Math.abs(c) < 0.5 ? -1 : 0, wind: f % 4, sway: 2 + Math.round(Math.abs(s)),
        gait: t, tilt: -0.07 - 0.02 * Math.abs(c), head: [Math.abs(c) < 0.5 ? 0 : -1, Math.abs(c) < 0.5 ? 1 : 0], shiftX: Math.round(s) };
    }
    case 'attack': {
      // More frames than key poses: ease between the six keys (wind-up slow, strike fast, settle slow).
      if (n > 6) {
        const u = easeKeys(f, n), k0 = Math.floor(u), k1 = Math.min(5, k0 + 1), w = u - k0;
        const a = attackKey(weapon, k0), b = attackKey(weapon, k1);
        return w < 0.01 ? a : lerpPose(a, b, w);
      }
      return attackKey(weapon, k);
    }
    case 'cast': return { ...P0, armsUp: 1, a: -1.4, cast: t, wind: f % 4, sway: -1, bob: f % 2 ? -1 : 0, tilt: 0.05 + 0.02 * Math.sin(t * Math.PI * 2), head: [0, -1] };
    case 'hit': { const h = Math.min(2, Math.round((f * 2) / Math.max(1, n - 1))); return { ...P0, lean: [-3, -2, -1][h], bob: [0, 1, 0][h], armL: 3, a: 0.7, hand: [-1, -1], sway: -1, tilt: [0.2, 0.12, 0.04][h], head: [[-2, 1], [-1, 1], [0, 0]][h] as [number, number], stride: [-0.4, -0.3, -0.1][h] }; }
    case 'death': {
      // With three frames f is the key itself (also used to blend the keys of longer death clips).
      const j = n === 3 ? Math.min(2, f) : Math.min(2, k);
      return { ...P0, lean: [-2, -1, 0][j], bob: [0, 4, 7][j], armL: [2, 4, 5][j], a: [0.8, 1.4, 1.6][j], hand: [0, [-1, -3, -5][j]], sway: -1, tilt: [0.14, 0.24, 0.32][j], head: [[-2, 0], [-1, 2], [1, 3]][j] as [number, number], stride: [-0.5, -0.2, 0.3][j] };
    }
  }
}

/** Position on the 0..5 key-pose scale for frame f of n: slow wind-up, fast strike, slow recovery. */
function easeKeys(f: number, n: number): number {
  const t = f / Math.max(1, n - 1);
  const e = t < 0.35 ? 0.35 * Math.pow(t / 0.35, 1.6) : t < 0.6 ? 0.35 + (t - 0.35) * 1.8 : 0.8 + 0.2 * (1 - Math.pow(1 - (t - 0.6) / 0.4, 2));
  return Math.min(5, e * 5);
}

/** Numeric pose fields blend; the rest (trails, projectiles, impacts) come from the nearer key. */
function lerpPose(a: ShadowPose, b: ShadowPose, w: number): ShadowPose {
  const L = (x: number, y: number) => x + (y - x) * w;
  const near = w < 0.5 ? a : b;
  return {
    ...near,
    bob: Math.round(L(a.bob, b.bob)), legL: L(a.legL, b.legL), legR: L(a.legR, b.legR), stride: L(a.stride, b.stride),
    armL: Math.round(L(a.armL, b.armL)), offReach: L(a.offReach, b.offReach), armsUp: L(a.armsUp, b.armsUp),
    hand: [Math.round(L(a.hand[0], b.hand[0])), Math.round(L(a.hand[1], b.hand[1]))], a: L(a.a, b.a), lean: Math.round(L(a.lean, b.lean)),
    bowDraw: a.bowDraw !== undefined && b.bowDraw !== undefined ? L(a.bowDraw, b.bowDraw) : near.bowDraw,
    tilt: L(a.tilt ?? 0, b.tilt ?? 0),
    head: [Math.round(L(a.head?.[0] ?? 0, b.head?.[0] ?? 0)), Math.round(L(a.head?.[1] ?? 0, b.head?.[1] ?? 0))],
  };
}

function attackKey(weapon: string | null, k: number): ShadowPose {
  {
    {
      const lean = { slash: [0, -1, 2, 3, 2, 1], thrust: [0, -1, 4, 4, 2, 0], shoot: [0, 0, -1, -2, -1, 0], magic: [0, 0, -1, 2, 1, 0], punch: [0, 2, 0, 3, 2, 0] };
      const tilt = { slash: [0.04, 0.11, -0.06, -0.14, -0.1, -0.03], thrust: [0.03, 0.1, -0.12, -0.15, -0.07, 0], shoot: [0, 0.03, 0.06, 0.08, 0.03, 0], magic: [0, 0.07, 0.09, -0.09, -0.05, 0], punch: [0, -0.06, 0.05, -0.13, -0.08, 0] };
      const step = { slash: [0, -0.3, 0.3, 0.8, 0.7, 0.3], thrust: [0, -0.4, 0.8, 1, 0.6, 0.2], shoot: [0, -0.2, -0.3, -0.3, -0.2, 0], magic: [0, -0.2, -0.2, 0.5, 0.4, 0.1], punch: [0, 0.4, 0.1, 0.9, 0.7, 0.2] };
      const head: [number, number][] = [[0, 0], [-1, 1], [0, 0], [1, 0], [1, 0], [0, 0]];
      const st = attackStyle(weapon), base = { ...P0, lean: lean[st][k], wind: k % 4, sway: 1 + (k >= 2 && k <= 4 ? 1 : 0), tilt: tilt[st][k], stride: step[st][k], head: head[k] };
      switch (st) {
        case 'slash': {
          const a = [-1.2, -2.5, -3.9, -5.0, -5.4, -5.0][k];
          const hand: [number, number][] = [[1, 2], [3, 7], [-2, 6], [-5, 0], [-4, -2], [-1, 0]];
          const trail: ([number, number, number] | undefined)[] = [undefined, undefined, [-2.5, -3.9, 1], [-3.4, -5.0, 1], [-4.4, -5.4, 0.45], undefined];
          return { ...base, a, hand: hand[k], trail: trail[k], armL: k >= 3 ? 2 : -1 };
        }
        case 'thrust': {
          const hand: [number, number][] = [[0, 1], [-4, 1], [7, 1], [8, 1], [3, 1], [0, 1]];
          return { ...base, a: k === 0 ? 1.2 : 1.55, hand: hand[k], thrustFx: k === 2 ? 1 : k === 3 ? 0.5 : 0, impact: k === 3 ? 'tip' : undefined };
        }
        case 'shoot':
          return { ...base, hand: [0, [4, 5, 5, 5, 4, 2][k]], bowDraw: [0.2, 0.7, 1, 0, 0, 0][k], nocked: k <= 2, arrow: k === 3 ? 4 : k === 4 ? 14 : undefined };
        case 'magic': {
          const hand: [number, number][] = [[0, 2], [1, 8], [1, 9], [-4, 6], [-3, 4], [0, 1]];
          return { ...base, a: [-1.0, -2.6, -2.6, 1.9, 1.6, 0.8][k], hand: hand[k], charge: k === 1 ? 1 : k === 2 ? 2 : 0, bolt: k === 3 ? 5 : k === 4 ? 14 : undefined };
        }
        case 'punch': {
          const hand: [number, number][] = [[0, 8], [-1, 8], [0, 8], [9, 7], [8, 7], [2, 6]];
          return { ...base, hand: hand[k], offReach: [0, 1, 0.3, 0, 0, 0][k], impact: k === 1 ? 'off' : k === 3 ? 'hand' : undefined };
        }
      }
      return base;
    }
  }
}

// ------------------------------------------------------------------ body
const WEAPON_LEN: Record<string, number> = { dagger: 11, katar: 12, sword: 20, twohand_sword: 26, axe: 20, club: 14, spear: 29, staff: 22, wand: 7 };

/** Where a point at `len` along a weapon held at canvas angle `th` ends up. */
const tipOf = (hx: number, hy: number, th: number, len: number): [number, number] => [hx - Math.sin(th) * len, hy + Math.cos(th) * len];

function spark(fx: CanvasRenderingContext2D, x: number, y: number, g: string) {
  const c = shade(g, 0.5);
  px(fx, x - 4, y, 9, 1, c); px(fx, x, y - 4, 1, 9, c);
  px(fx, x - 2, y - 2, 1, 1, g); px(fx, x + 2, y - 2, 1, 1, g); px(fx, x - 2, y + 2, 1, 1, g); px(fx, x + 2, y + 2, 1, 1, g);
  fx.globalAlpha = 0.3; ellipse(fx, x, y, 4, 4, g); fx.globalAlpha = 1;
}

/**
 * Draws one frame facing left/down/up (right is mirrored by the sheet builder). The body goes on
 * `ctx` (it gets the outline); glows, trails and projectiles go on `fx`, which is laid on top.
 */
export function drawShadowFrame(ctx: CanvasRenderingContext2D, fx: CanvasRenderingContext2D, d: ShadowDesign, weapon: string | null, shield: boolean, dir: Direction, p: ShadowPose) {
  const g = d.glow, side = dir === 'left', back = dir === 'up';
  const ox = side ? -p.lean : (p.shiftX ?? 0), oy = dir === 'down' ? Math.round(p.lean * 0.6) : back ? -Math.round(p.lean * 0.6) : 0;
  ctx.save(); fx.save(); ctx.translate(ox, oy); fx.translate(ox, oy);
  const by = p.bob, sway = p.sway, phase = [0, 1, 1, 0][((p.wind % 4) + 4) % 4];
  const hx = CX - (side ? (p.head?.[0] ?? 0) : 0), hy = by + 17 + (p.head?.[1] ?? 0), sh = by + 25, hip = by + 41;
  const [fwd, up] = p.hand;
  const handX = dir === 'down' ? CX + 9 : back ? CX - 9 : CX - 6 - fwd;
  const handY = by + 40 - up + (dir === 'down' ? Math.round(fwd * 0.4) : back ? -Math.round(fwd * 0.4) : 0);
  const isBow = weapon === 'bow' || weapon === 'crossbow';
  const th = isBow ? (side ? Math.PI : back ? -Math.PI / 2 : Math.PI / 2) : side ? p.a : -p.a;

  // Shadow on the ground, aura of third jobs.
  if (d.aura) {
    fx.globalAlpha = 0.18; ellipse(fx, CX - ox, FEET - 1 - oy, 13, 4, g); fx.globalAlpha = 1;
    for (const [x, y] of [[-10, -8], [9, -14], [-6, -22], [11, -4]] as [number, number][]) px(fx, CX + x - ox, FEET + y - ((p.wind + x) & 3) - oy, 1, 1, shade(g, 0.3));
  } else ellipse(ctx, CX - ox, FEET - oy, 10, 3, 'rgba(0,0,0,0.3)');

  // Spell circle under the feet while casting.
  if (p.cast !== undefined) {
    const cy = FEET - 1 - oy, rot = p.cast * Math.PI * 2;
    fx.strokeStyle = g; fx.lineWidth = 1; fx.globalAlpha = 0.75;
    fx.beginPath(); fx.ellipse(CX + 0.5, cy + 0.5, 16, 5, 0, 0, Math.PI * 2); fx.stroke();
    fx.globalAlpha = 0.4; fx.beginPath(); fx.ellipse(CX + 0.5, cy + 0.5, 11, 3.5, 0, 0, Math.PI * 2); fx.stroke();
    fx.globalAlpha = 1;
    for (let i = 0; i < 6; i++) { const a = rot / 3 + (i / 6) * Math.PI * 2; px(fx, Math.round(CX + Math.cos(a) * 16), Math.round(cy + Math.sin(a) * 5), 1, 1, shade(g, 0.5)); }
    for (let i = 0; i < 4; i++) {
      const u = (p.cast + i / 4) % 1;
      fx.globalAlpha = 1 - u; px(fx, CX + [-12, -5, 6, 12][i], Math.round(cy - 3 - u * 30), 1, 2, shade(g, 0.3)); fx.globalAlpha = 1;
    }
  }

  // Behind the body: wings, cape, scarf tails, bag, weapon held at the back.
  if (d.wings) {
    const flap = p.cast !== undefined ? 2 : phase;
    for (const s of side ? [1] : [-1, 1]) {
      const wx = side ? CX + 3 : CX + s * 4;
      poly(ctx, [[wx, sh + 1], [wx + s * 10, sh - 10 - flap], [wx + s * 17, sh - 6 - flap], [wx + s * 14, sh + 2], [wx + s * 11, sh - 1], [wx + s * 9, sh + 6], [wx + s * 5, sh + 4]], K1);
      line(ctx, wx, sh + 1, wx + s * 10, sh - 10 - flap, 1, shade(g, -0.45));
    }
  }
  const capeLen = d.cape === 'long' ? 56 : 46;
  if (d.cape && !back) {
    const pts: [number, number][] = side
      ? [[CX - 1, sh], [CX + 5, sh], [CX + 8 + sway, by + capeLen - Math.max(0, sway - 1)], [CX + 4 + sway, by + capeLen + 2 - Math.max(0, sway - 1)], [CX + 1, by + capeLen]]
      : [[CX - 7, sh], [CX + 7, sh], [CX + 10 + phase, by + capeLen], [CX - 10 + phase, by + capeLen]];
    poly(ctx, pts, K1);
    if (d.trim) line(fx, side ? CX + 8 + sway : CX - 10 + phase, by + capeLen, side ? CX + 1 : CX + 10 + phase, by + capeLen, 1, shade(g, -0.3));
  }
  if (d.scarf && !back) {
    const sx = side ? CX + 4 : CX + 5, lift = sway - 1 + phase;
    poly(ctx, [[sx, sh - 1], [sx + 9, sh + 2 - lift], [sx + 13, sh + 1 - lift], [sx + 10, sh + 5 - lift], [sx + 1, sh + 3]], K0);
    poly(ctx, [[sx, sh], [sx + 7, sh + 8 - lift], [sx + 4, sh + 9 - lift], [sx - 1, sh + 3]], K1);
  }
  if (d.bag && !back) { if (side) px(ctx, CX + 3, sh + 1, 6, 9, K1); else px(ctx, CX - 9, sh + 2, 18, 8, K1); }
  if (back) drawShadowWeapon(ctx, weapon, handX, handY, th, g, p.bowDraw ?? 0, !!p.nocked);

  // Legs.
  const legW = d.body === 'armor' ? 4 : 3;
  const footY = (lift: number) => FEET - oy - lift * 1.5;
  if (d.body !== 'robe' && d.body !== 'gown') {
    if (side) {
      // Two-part legs: hip → knee → foot. The knee bends forward, more while the foot is lifted;
      // during a walk the leg swinging forward lifts its foot.
      const g2 = p.gait !== undefined ? Math.cos(p.gait * Math.PI * 2) : 0;
      const leg = (fwd: number, lift: number, col: string, hipX: number) => {
        const footX = hipX - fwd * 4.5, fy = FEET - oy - lift;
        const kx = (hipX + footX) / 2 - (1.2 + lift * 0.9), ky = hip + (fy - hip) * 0.5 - lift * 0.4;
        line(ctx, hipX, hip, kx, ky, legW, col); line(ctx, kx, ky, footX, fy - 1, legW, col);
        px(ctx, Math.round(footX) - 3, Math.round(fy) - 2, 5, 2, col);
      };
      leg(-p.stride, p.gait !== undefined ? Math.max(0, -g2) * 3 : p.legL * 1.5, K1, CX);
      leg(p.stride, p.gait !== undefined ? Math.max(0, g2) * 3 : p.legR * 1.5, K0, CX - 1);
    } else {
      const fl = footY(p.legL), fr = footY(p.legR);
      px(ctx, CX - 4 - (legW - 3), hip, legW, fl - hip, K0); px(ctx, CX - 5 - (legW - 3), fl - 2, legW + 1, 2, K0);
      px(ctx, CX + 1, hip, legW, fr - hip, K0); px(ctx, CX + 1, fr - 2, legW + 1, 2, K0);
    }
  } else {
    const fy = FEET - oy - 2;
    if (side) { const sw = Math.round(p.stride * 4); px(ctx, CX - 4 - sw, fy - p.legR, 4, 2, K0); px(ctx, CX - 2 + sw, fy - p.legL, 4, 2, K1); }
    else { px(ctx, CX - 5, fy - p.legL, 4, 2, K0); px(ctx, CX + 1, fy - p.legR, 4, 2, K0); }
  }

  // Side view: the far arm swings behind the body, opposite to the near leg.
  if (side && !p.armsUp && !p.offReach) line(ctx, CX + 1, by + 27, CX + 1 + Math.round(p.stride * 4), by + 38 - Math.round(Math.abs(p.stride)), 2, K2);
  // Coat tails hang behind the legs; the torso goes on top.
  if (d.body === 'coat') {
    poly(ctx, side ? [[CX - 3, by + 36], [CX + 4, by + 36], [CX + 7 + sway, by + 52 - Math.max(0, sway - 2)], [CX + 1 + sway, by + 51]] : [[CX - 6, by + 36], [CX + 6, by + 36], [CX + 8, by + 51], [CX + 2, by + 49], [CX - 2, by + 49], [CX - 8, by + 51]], K1);
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
      const s = side ? Math.round(sway / 2) + Math.round(p.stride) : 0;
      const flare = p.cast !== undefined ? 2 : 0;
      torso([[-6, 24], [6, 24], [10 + s + flare, hem], [-9 + s - flare, hem]], K0);
      if (!back) torso([[-1, 30], [1, 30], [2, hem], [-2, hem]], K1);
      break;
    }
    case 'gown': {
      // Long flared gown with a frilled hem and a sash.
      const hem = Math.min(59, 59 - by), s = side ? Math.round(sway / 2) : 0;
      torso([[-5, 24], [5, 24], [6, 34], [12 + s, hem], [-12 + s, hem], [-6, 34]], K0);
      for (let x = -11; x < 12; x += 3) poly(ctx, [[CX + (x + s) * w, by + hem - 2], [CX + (x + 3 + s) * w, by + hem - 2], [CX + (x + 1.5 + s) * w, by + hem + 1]], K1);
      if (!back) px(ctx, CX - 5 * w, by + 33, 10 * w, 2, K2);
      break;
    }
    case 'longcoat': {
      // Knee-length coat: lapels, a row of glowing buttons and split tails.
      torso([[-7, 24], [7, 24], [8, 52], [1, 50], [-1, 50], [-8, 52]], K0);
      if (!back) { torso([[-3, 24], [0, 32], [3, 24]], K2); for (let y = 30; y < 46; y += 4) px(ctx, CX - 0.5, by + y, 1, 1, shade(d.glow, -0.1)); }
      break;
    }
    case 'smock': {
      // Short loose work smock with rolled sleeves and a pocket.
      torso([[-6, 24], [6, 24], [9, 45], [-9, 45]], K0);
      if (!back) { px(ctx, CX - 3 * w, by + 36, 6 * w, 4, K1); px(ctx, CX - 3 * w, by + 36, 6 * w, 1, K2); }
      break;
    }
    case 'cloak': {
      const s = side ? sway + 1 : (phase - 0.5);
      const flare = p.cast !== undefined ? 2 : 0;
      const pts: [number, number][] = [[-7, 23], [7, 23], [11 + s + flare, 50]];
      for (let x = 11; x > -11; x -= 4) pts.push([x - 2 + s, 54 + (((x / 4) + p.wind) & 1) * 2], [x - 4 + s, 50]);
      pts.push([-11 + s - flare, 50]);
      torso(pts, K0);
      if (!back) torso([[-1, 26], [1, 26], [1, 50], [-1, 50]], K1);
      break;
    }
  }
  px(ctx, CX - 6 * w, by + 25, 1, 8, K2);
  if (d.trim) px(fx, CX - 5 * w, by + 41, 10 * w, 1, shade(g, -0.25));
  if (d.pauldrons) for (const s of side ? [0] : [-1, 1]) { ellipse(ctx, CX + s * 8, by + 26, 4, 3, K1); px(ctx, CX + s * 8 - 3, by + 24, 4, 1, K3); }
  if (d.beads && !back) for (let i = -3; i <= 3; i++) px(fx, CX + i * 2 * w, by + 29 - Math.abs(i) * 0.5, 1, 1, i % 2 ? g : shade(g, -0.3));
  if (d.emblem && !back) {
    const ex = side ? CX - 2 : CX, ey = by + 31;
    switch (d.emblem) {
      case 'cross': px(fx, ex - 1, ey - 2, 1, 6, g); px(fx, ex - 3, ey, 5, 1, g); break;
      case 'gem': glowDot(fx, ex - 1, ey, 2, 2, g); break;
      case 'flame': poly(fx, [[ex - 2, ey + 3], [ex, ey - 3 + phase], [ex + 2, ey + 3]], g); break;
      case 'note': px(fx, ex, ey - 2, 1, 5, g); px(fx, ex - 2, ey + 2, 3, 2, g); px(fx, ex + 1, ey - 2, 2, 1, g); break;
      case 'flask': px(fx, ex - 1, ey - 2, 2, 2, K2); ellipse(fx, ex, ey + 2, 2, 2, g); break;
    }
  }
  if (d.cape && back) {
    poly(ctx, [[CX - 8, sh - 1], [CX + 8, sh - 1], [CX + 10 + phase, by + capeLen], [CX - 10 + phase, by + capeLen]], K1); px(ctx, CX - 8, sh - 1, 16, 1, K3);
    if (d.trim) line(fx, CX - 10 + phase, by + capeLen, CX + 10 + phase, by + capeLen, 1, shade(g, -0.3));
  }
  if (d.bag && back) px(ctx, CX - 7, sh + 1, 14, 11, K1);

  // Arms: thin and dark; the weapon hand follows the pose.
  const aw = d.body === 'armor' ? 3 : 2;
  const fist = (x: number, y: number) => px(ctx, Math.round(x) - 1, Math.round(y) - 1, 3, 3, K0);
  let offX = CX - 9, offY = by + 39 + p.armL;
  if (p.armsUp) {
    const lift = Math.round(p.armsUp * 9);
    for (const x of side ? [CX - 2] : [CX - 6, CX + 6]) line(ctx, x, by + 27, x + (x < CX ? -3 : 3), by + 27 - lift, aw, K1);
  } else if (side) {
    if (p.offReach) { offX = CX - 4 - 11 * p.offReach; offY = by + 31; line(ctx, CX - 1, by + 27, offX, offY, aw, K0); fist(offX, offY); }
    line(ctx, CX, by + 27, handX, handY, aw, K1);
    if (!weapon) fist(handX, handY);
  } else {
    if (p.offReach) { offX = CX - 7; offY = by + 33 + (back ? -2 : 4) * p.offReach; }
    line(ctx, CX - 7, by + 27, offX, offY, aw, K1);
    line(ctx, CX + 7, by + 27, handX, handY, aw, K1);
    if (!weapon) { fist(handX, handY); if (p.offReach) fist(offX, offY); }
  }

  drawShadowHead(ctx, d, hx, hy, dir, phase, !!p.blink);

  if (d.halo) { fx.strokeStyle = g; fx.lineWidth = 1; fx.beginPath(); fx.ellipse(hx + 0.5, hy - 12.5 + (phase & 1), 6, 2, 0, 0, Math.PI * 2); fx.stroke(); }
  if (shield && !back) {
    const sx = dir === 'down' ? CX - 14 : CX - 9, sy = by + 32;
    poly(ctx, [[sx, sy], [sx + 8, sy], [sx + 8, sy + 7], [sx + 4, sy + 11], [sx, sy + 7]], K1);
    px(fx, sx + 3, sy + 3, 2, 3, g);
  }
  const wx = p.armsUp ? (dir === 'down' ? CX + 9 : CX - 5) : handX, wy = p.armsUp ? by + 18 : handY;
  if (!back) drawShadowWeapon(ctx, weapon, wx, wy, p.armsUp ? -0.1 : th, g, p.bowDraw ?? 0, !!p.nocked);

  // Effects: swing trail, thrust lines, arrow, spell bolt, impact sparks.
  const len = WEAPON_LEN[weapon ?? ''] ?? 14;
  if (p.trail && weapon) {
    const [a0, a1, str] = p.trail;
    for (let i = 0; i <= 14; i++) {
      const a = a0 + ((a1 - a0) * i) / 14, cth = side ? a : -a, fade = (i / 14) * str;
      for (const r of [len - 3, len - 1, len + 1]) {
        const [x, y] = tipOf(handX, handY, cth, r);
        fx.globalAlpha = Math.min(1, fade * (r === len - 1 ? 1 : 0.55));
        px(fx, Math.round(x), Math.round(y), 1, 1, r === len - 1 ? shade(g, 0.55) : g);
      }
    }
    fx.globalAlpha = 1;
  }
  if (p.thrustFx) {
    fx.globalAlpha = p.thrustFx;
    for (const o of [-3, 0, 3]) {
      if (side) px(fx, handX + 6, handY + o, 7 - Math.abs(o), 1, shade(g, 0.3));
      else px(fx, handX + o, dir === 'down' ? handY - 9 : handY + 3, 1, 6 - Math.abs(o), shade(g, 0.3));
    }
    fx.globalAlpha = 1;
  }
  const tipPoint = (): [number, number] => {
    if (weapon === 'staff' || weapon === 'wand') { const r = weapon === 'staff' ? 22 : 6; return tipOf(wx, wy, th + Math.PI, r); }
    return tipOf(wx, wy, th, len);
  };
  if (p.charge) {
    const [tx, ty] = tipPoint();
    fx.globalAlpha = 0.25; ellipse(fx, Math.round(tx), Math.round(ty), 3 + p.charge * 2, 3 + p.charge * 2, g); fx.globalAlpha = 1;
    ellipse(fx, Math.round(tx), Math.round(ty), p.charge, p.charge, shade(g, 0.6));
  }
  if (p.bolt !== undefined) {
    const [tx, ty] = tipPoint();
    const [bx, by2] = side ? [tx - p.bolt, ty] : back ? [tx, ty - p.bolt] : [tx, Math.min(FEET - oy, ty + p.bolt * 0.6)];
    const fade = p.bolt > 10 ? 0.6 : 1;
    fx.globalAlpha = 0.3 * fade; ellipse(fx, Math.round(bx), Math.round(by2), 4, 4, g);
    fx.globalAlpha = fade; ellipse(fx, Math.round(bx), Math.round(by2), 2, 2, shade(g, 0.6));
    for (let i = 1; i <= 3; i++) { fx.globalAlpha = fade * (1 - i / 4); px(fx, Math.round(side ? bx + i * 3 : bx), Math.round(side ? by2 : back ? by2 + i * 3 : by2 - i * 2), 1, 1, g); }
    fx.globalAlpha = 1;
    if (weapon === 'instrument') { px(fx, Math.round(bx) - 3, Math.round(by2) - 6, 1, 4, g); px(fx, Math.round(bx) - 5, Math.round(by2) - 3, 2, 2, g); }
  }
  if (p.arrow !== undefined) {
    const fade = p.arrow > 10 ? 0.55 : 1;
    fx.globalAlpha = fade;
    if (side) { const x = handX - 12 - p.arrow; px(fx, x, handY + 4, 9, 1, K3); px(fx, x - 1, handY + 3, 2, 3, shade(g, 0.5)); px(fx, x + 9, handY + 4, 6, 1, g); }
    else if (back) { const y = handY - 12 - p.arrow; px(fx, handX - 1, y, 1, 9, K3); px(fx, handX - 2, y - 1, 3, 2, shade(g, 0.5)); }
    else { const y = Math.min(FEET - 4 - oy, handY + 10 + p.arrow * 0.5); px(fx, handX + 1, y - 6, 1, 7, K3); px(fx, handX, y, 3, 2, shade(g, 0.5)); }
    fx.globalAlpha = 1;
  }
  if (p.impact) {
    const at: [number, number] = p.impact === 'off' ? (side ? [offX - 3, offY] : [offX, offY + 3]) : p.impact === 'hand' ? (side ? [handX - 4, handY] : [handX, handY + 3]) : tipPoint();
    spark(fx, Math.round(at[0]), Math.round(at[1]), g);
  }
  if (d.orbs) {
    for (let i = 0; i < d.orbs; i++) {
      const a = (i / d.orbs) * Math.PI * 2 + p.wind * (Math.PI / 8) + (p.cast !== undefined ? p.cast * Math.PI * 2 : 0);
      if (back && Math.sin(a) > 0) continue;
      glowDot(fx, Math.round(CX + Math.cos(a) * 14), Math.round(by + 26 + Math.sin(a) * 6), 2, 2, g);
    }
  }
  if (p.cast !== undefined) {
    const r = 2 + Math.round(Math.sin(p.cast * Math.PI * 2) + 1);
    fx.globalAlpha = 0.2; ellipse(fx, CX, by + 6, r + 3, r + 3, g); fx.globalAlpha = 1;
    ellipse(fx, CX, by + 6, r, r, shade(g, 0.45));
    // Eyes flare while channelling.
    if (!back) { fx.globalAlpha = 0.5; px(fx, CX - 5, hy, 10, 2, shade(g, 0.4)); fx.globalAlpha = 1; }
  }
  ctx.restore(); fx.restore();
}

// ------------------------------------------------------------------ sheet
const W = CHAR_FRAME_W, H = CHAR_FRAME_H;
type AnimTable = Record<CharAnim, { start: number; count: number }>;

function dissolve(ctx: CanvasRenderingContext2D, amount: number) {
  const img = ctx.getImageData(0, 0, W, H), dt = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if ((((Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0) % 1000) / 1000 < amount) dt[(y * W + x) * 4 + 3] = 0;
  }
  ctx.putImageData(img, 0, 0);
}

function tiltCanvas(c: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }, angle: number) {
  const copy = makeCanvas(W, H);
  copy.ctx.drawImage(c.canvas, 0, 0);
  c.ctx.clearRect(0, 0, W, H);
  c.ctx.save(); c.ctx.imageSmoothingEnabled = false;
  c.ctx.translate(CX, FEET); c.ctx.rotate(angle); c.ctx.translate(-CX, -FEET);
  c.ctx.drawImage(copy.canvas, 0, 0);
  c.ctx.restore();
}

function renderFrame(d: ShadowDesign, weapon: string | null, shield: boolean, dir: Direction, anim: CharAnim, f: number, n: number): HTMLCanvasElement {
  const body = makeCanvas(W, H), fx = makeCanvas(W, H);
  let tilt = 0;
  // Death on a continuous 0..5 scale: stagger and buckle (0–2.5), topple to the ground (2.5–4),
  // melt into a pool of shadow with two fading eyes (3.7–5).
  const u = anim === 'death' ? (f * 5) / Math.max(1, n - 1) : 0;
  if (anim === 'death' && u >= 2.5) {
    const clamp = (x: number) => Math.max(0, Math.min(1, x));
    const fallen = makeCanvas(W, H), junk = makeCanvas(W, H);
    drawShadowFrame(fallen.ctx, junk.ctx, d, null, false, dir, shadowPose('death', 2, 3, weapon));
    addOutline(fallen.ctx, 0, 0, W, H, '#05050a');
    const c = body.ctx, ang = 0.55 + clamp((u - 2.5) / 1.5) * 1.02, melt = clamp((u - 3.7) / 1.3), pool = clamp((u - 2.5) / 2.5);
    if (melt < 0.95) {
      c.save(); c.translate(CX, FEET); c.rotate(dir === 'left' ? -ang : ang); c.translate(-CX, -FEET + 2); c.drawImage(fallen.canvas, 0, 0); c.restore();
      if (melt > 0) dissolve(c, melt * 0.8);
    }
    ellipse(c, CX, FEET - 1, Math.round(5 + 8 * pool), 1 + Math.round(pool * 2), K0);
    if (melt > 0.6) { ellipse(c, CX - 5, FEET - 2, 3, 2, K1); ellipse(c, CX + 4, FEET - 2, 4, 2, K0); }
    // Wisps of shadow and a few motes of the job's glow drift up.
    for (const [x, y, r] of [[-6, 10, 2], [3, 16, 3], [8, 7, 2], [-1, 22, 2]] as [number, number, number][]) {
      const rise = (u - 2.5) * 5;
      fx.ctx.globalAlpha = Math.max(0, 0.38 - (u - 2.5) * 0.1); ellipse(fx.ctx, CX + x, FEET - y - rise, r, r, K2); fx.ctx.globalAlpha = 1;
    }
    if (melt > 0) for (const [x, y] of [[-7, 6], [5, 12], [0, 18], [9, 4], [-3, 25]] as [number, number][]) {
      fx.ctx.globalAlpha = 0.85 * (1 - melt * 0.7); px(fx.ctx, CX + x, Math.round(FEET - y - melt * 14), 1, 2, shade(d.glow, 0.3)); fx.ctx.globalAlpha = 1;
    }
    if (melt > 0.6 && dir !== 'up') { fx.ctx.globalAlpha = 0.4 + 0.4 * melt; px(fx.ctx, CX - 3, FEET - 3, 2, 1, d.glow); px(fx.ctx, CX + 2, FEET - 3, 2, 1, d.glow); fx.ctx.globalAlpha = 1; }
  } else if (anim === 'death' && n > 3) {
    // Stagger back, knees buckle: ease between the three standing death keys.
    const uj = Math.min(2, u * 0.8), j0 = Math.floor(uj), j1 = Math.min(2, j0 + 1);
    const a = shadowPose('death', j0, 3, weapon), b = shadowPose('death', j1, 3, weapon);
    const pz = lerpPose(a, b, uj - j0);
    drawShadowFrame(body.ctx, fx.ctx, d, weapon, shield, dir, pz);
    tilt = pz.tilt ?? 0;
  } else {
    const pz = shadowPose(anim, f, n, weapon);
    drawShadowFrame(body.ctx, fx.ctx, d, weapon, shield, dir, pz);
    tilt = pz.tilt ?? 0;
  }
  // Side view: the whole figure leans about its feet (nearest-pixel rotation keeps it crisp).
  if (dir === 'left' && Math.abs(tilt) > 0.005) { tiltCanvas(body, tilt); tiltCanvas(fx, tilt); }
  addOutline(body.ctx, 0, 0, W, H, '#05050a');
  const tint = (color: string) => { body.ctx.globalCompositeOperation = 'source-atop'; body.ctx.fillStyle = color; body.ctx.fillRect(0, 0, W, H); body.ctx.globalCompositeOperation = 'source-over'; };
  if (anim === 'hit') { const h = Math.min(2, Math.round((f * 2) / Math.max(1, n - 1))); if (h === 0) tint('rgba(255,255,255,0.55)'); else if (h === 1) tint('rgba(255,40,60,0.35)'); }
  if (anim === 'death' && f === 0) tint('rgba(255,255,255,0.4)');
  body.ctx.drawImage(fx.canvas, 0, 0);
  return body.canvas;
}

/** Full sheet in the given layout (frame counts can differ from the classic sheet). */
export function buildShadowSheet(d: ShadowDesign, weapon: string | null, shield: boolean, anims: AnimTable, cols: number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(W * cols, H * CHAR_DIRECTIONS.length);
  for (const [row, dir] of CHAR_DIRECTIONS.entries()) {
    const drawDir: Direction = dir === 'right' ? 'left' : dir;
    for (const [anim, meta] of Object.entries(anims) as [CharAnim, { start: number; count: number }][]) {
      for (let f = 0; f < meta.count; f++) {
        const fr = renderFrame(d, weapon, shield, drawDir, anim, f, meta.count);
        const dx = (meta.start + f) * W, dy = row * H;
        if (dir === 'right') { ctx.save(); ctx.translate(dx + W, dy); ctx.scale(-1, 1); ctx.drawImage(fr, 0, 0); ctx.restore(); }
        else ctx.drawImage(fr, dx, dy);
      }
    }
  }
  return canvas;
}

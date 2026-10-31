// Procedural item & skill icons rendered to data URLs for the HTML UI.
import type { ItemDef, MonsterDef, SkillDef } from '../../core/types';
import { makeCanvas } from './canvas';
import { overrideCanvas } from './spriteOverrides';
import { drawItemIcon, hashId, ramp } from './iconArt';
import { generateMonsterSheet } from './monsterSprite';
import { drawSignatureFrame, fallbackSignature, SIGNATURES } from '../render/vfxSignature';
import MONSTERS from '../../data/monsters.json';

const cache = new Map<string, string>();

/** Monster art for card icons (shipped data). */
const MONSTER_BY_ID = new Map(((MONSTERS as unknown as { monsters?: MonsterDef[] }).monsters ?? (MONSTERS as unknown as MonsterDef[])).map((m) => [m.id, m]));
const portraits = new Map<string, HTMLCanvasElement>();

/** The monster's idle frame cropped to its body, for the picture on its card. */
function cardPortrait(monsterId: string) {
  return (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
    const m = MONSTER_BY_ID.get(monsterId);
    if (!m) return;
    let sheet = portraits.get(monsterId);
    if (!sheet) { sheet = generateMonsterSheet(m); portraits.set(monsterId, sheet); }
    const fw = m.art.w, fh = m.art.h, k = Math.min(w / fw, h / fh) * 1.25;
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
    c.imageSmoothingEnabled = true;
    c.drawImage(sheet, 0, 0, fw, fh, x + (w - fw * k) / 2, y + h - fh * k + 2, fw * k, fh * k);
    c.restore();
  };
}

export function itemIconCanvas(def: ItemDef): HTMLCanvasElement {
  const drawn = overrideCanvas(`icons/item/${def.id}`, 32, 32);
  if (drawn) return drawn;
  const { canvas, ctx } = makeCanvas(32, 32);
  drawItemIcon(ctx, def, def.card?.monsterId ? cardPortrait(def.card.monsterId) : undefined);
  return canvas;
}

export function itemIconUrl(def: ItemDef): string {
  const key = `item:${def.id}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const url = itemIconCanvas(def).toDataURL();
  cache.set(key, url);
  return url;
}

export function skillIconUrl(def: SkillDef): string {
  const key = `skill:${def.id}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const drawn = overrideCanvas(`icons/skill/${def.id}`, 32, 32);
  if (drawn) { const u = drawn.toDataURL(); cache.set(key, u); return u; }
  const canvas = skillIconCanvas(def);
  const url = canvas.toDataURL();
  cache.set(key, url);
  return url;
}

/**
 * Skill icon: a framed badge (gold for ultimates, teal for buffs, steel for actives, slate for
 * passives) around a still of the skill's own signature effect.
 */
/** Moment of each motif's animation that reads best as a still. */
const ICON_T: Record<string, number> = { arrowfan: 0.32, starfall: 0.5, drops: 0.5, fireworks: 0.62, swords: 0.62, flasks: 0.3, blades: 0.3, beast: 0.45, hand: 0.38, cage: 0.3, shards: 0.3, feathers: 0.45, fang: 0.42, seal: 0.32, coin: 0.25 };

export function skillIconCanvas(def: SkillDef): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(32, 32);
  const col = def.icon.color, R = ramp(col);
  const frame = def.kind === 'ultimate' ? ramp('#e2b23a') : def.kind === 'buff' ? ramp('#3aa0a0') : def.kind === 'passive' ? ramp('#6a7488') : ramp('#a8b0c0');
  // Background: dark radial glow of the skill colour.
  const g = ctx.createRadialGradient(16, 14, 2, 16, 16, 20);
  g.addColorStop(0, R[1]); g.addColorStop(0.6, R[0]); g.addColorStop(1, '#0c0812');
  ctx.fillStyle = g; ctx.fillRect(2, 2, 28, 28);
  // Signature still, thickened before shrinking so thin strokes stay visible.
  const sig = SIGNATURES[def.id] ?? fallbackSignature(def.id);
  const still = drawSignatureFrame(sig, col, def.icon.glyph, hashId(def.id), ICON_T[sig.m] ?? 0.5);
  const bold = document.createElement('canvas'); bold.width = still.width; bold.height = still.height;
  const b = bold.getContext('2d')!;
  for (const [dx, dy] of [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]]) b.drawImage(still, dx, dy);
  // Zoom onto the drawn part (square crop around everything visible) so small motifs fill the badge.
  const px4 = b.getImageData(0, 0, bold.width, bold.height).data;
  let x0 = bold.width, y0 = bold.height, x1 = 0, y1 = 0;
  for (let y = 0; y < bold.height; y += 2) for (let x = 0; x < bold.width; x += 2) if (px4[(y * bold.width + x) * 4 + 3] > 50) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  let side = Math.max(48, x1 - x0, y1 - y0) + 8;
  if (x1 < x0) { x0 = 0; y0 = 0; x1 = bold.width; y1 = bold.height; side = bold.width; }
  const sx = Math.max(0, Math.min(bold.width - side, (x0 + x1) / 2 - side / 2)), sy = Math.max(0, Math.min(bold.height - side, (y0 + y1) / 2 - side / 2));
  ctx.save(); ctx.beginPath(); ctx.rect(3, 3, 26, 26); ctx.clip();
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bold, sx, sy, Math.min(side, bold.width), Math.min(side, bold.height), 3, 3, 26, 26);
  ctx.restore();
  // Frame with bevel; ultimates get corner studs, passives a dimmed overlay.
  ctx.fillStyle = frame[1]; ctx.fillRect(0, 0, 32, 2); ctx.fillRect(0, 30, 32, 2); ctx.fillRect(0, 0, 2, 32); ctx.fillRect(30, 0, 2, 32);
  ctx.fillStyle = frame[3]; ctx.fillRect(1, 1, 30, 1); ctx.fillRect(1, 1, 1, 30);
  ctx.fillStyle = frame[0]; ctx.fillRect(1, 30, 30, 1); ctx.fillRect(30, 1, 1, 30);
  ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(3, 3, 26, 6);
  if (def.kind === 'ultimate') for (const [x, y] of [[0, 0], [29, 0], [0, 29], [29, 29]]) { ctx.fillStyle = frame[4]; ctx.fillRect(x, y, 3, 3); ctx.fillStyle = frame[1]; ctx.fillRect(x + 1, y + 1, 1, 1); }
  if (def.kind === 'passive') { ctx.fillStyle = 'rgba(20,24,36,0.18)'; ctx.fillRect(2, 2, 28, 28); }
  return canvas;
}

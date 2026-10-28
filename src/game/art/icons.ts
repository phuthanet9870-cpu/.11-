// Procedural item & skill icons rendered to data URLs for the HTML UI.
import type { ItemDef, SkillDef } from '../../core/types';
import { addOutline, ellipse, makeCanvas, px, shade } from './canvas';
import { fileUrlFor } from '../assetOverrides';

const cache = new Map<string, string>();

function drawItemShape(ctx: CanvasRenderingContext2D, shape: string, c: string, a: string) {
  const L = shade(c, 0.35), D = shade(c, -0.3);
  switch (shape) {
    case 'potion':
      px(ctx, 13, 4, 6, 4, '#c8b89a'); px(ctx, 12, 3, 8, 2, '#8b5a2b');
      ellipse(ctx, 16, 18, 9, 9, '#e8f0ff'); ellipse(ctx, 16, 19, 8, 7, c); ellipse(ctx, 13, 16, 2, 3, L); px(ctx, 13, 9, 6, 3, '#e8f0ff');
      break;
    case 'flask':
      px(ctx, 14, 4, 4, 8, '#e8f0ff'); ctx.fillStyle = '#e8f0ff'; ctx.beginPath(); ctx.moveTo(8, 27); ctx.lineTo(24, 27); ctx.lineTo(18, 12); ctx.lineTo(14, 12); ctx.closePath(); ctx.fill();
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(9, 26); ctx.lineTo(23, 26); ctx.lineTo(20, 18); ctx.lineTo(12, 18); ctx.closePath(); ctx.fill();
      break;
    case 'apple':
      ellipse(ctx, 16, 18, 9, 9, c); ellipse(ctx, 13, 15, 3, 3, L); px(ctx, 15, 5, 2, 5, '#6a4a2a'); ellipse(ctx, 20, 7, 4, 2, '#5fae3a');
      break;
    case 'wing':
      for (let i = 0; i < 5; i++) ellipse(ctx, 10 + i * 3, 20 - i * 3, 7 - i, 3, i % 2 ? c : a);
      break;
    case 'coin':
      ellipse(ctx, 16, 16, 11, 11, D); ellipse(ctx, 16, 16, 9, 9, c); px(ctx, 14, 10, 4, 12, L);
      break;
    case 'blob':
      ellipse(ctx, 16, 19, 11, 8, c); ellipse(ctx, 13, 16, 4, 3, L);
      break;
    case 'horn':
      for (let i = 0; i < 7; i++) px(ctx, 8 + i * 2, 24 - i * 3, 5 - i * 0.4, 4, i % 2 ? c : D);
      break;
    case 'mushroom':
      px(ctx, 13, 16, 6, 10, a); ellipse(ctx, 16, 14, 11, 7, c); ellipse(ctx, 12, 12, 2, 2, a); ellipse(ctx, 19, 13, 2, 2, a);
      break;
    case 'fang':
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(10, 6); ctx.lineTo(22, 6); ctx.lineTo(16, 28); ctx.closePath(); ctx.fill(); px(ctx, 12, 7, 3, 10, L);
      break;
    case 'dust':
      for (let i = 0; i < 12; i++) ellipse(ctx, 8 + ((i * 7) % 16), 8 + ((i * 11) % 16), 2, 2, i % 3 ? c : L);
      break;
    case 'pelt':
      ellipse(ctx, 16, 16, 12, 9, c); for (let i = 6; i < 26; i += 4) px(ctx, i, 8, 2, 4, '#7fd65a');
      break;
    case 'bone':
      px(ctx, 9, 14, 14, 4, c); ellipse(ctx, 8, 13, 3, 3, c); ellipse(ctx, 8, 19, 3, 3, c); ellipse(ctx, 24, 13, 3, 3, c); ellipse(ctx, 24, 19, 3, 3, c);
      break;
    case 'crown':
      px(ctx, 6, 16, 20, 8, c); for (let i = 6; i <= 22; i += 5) { px(ctx, i, 8, 3, 8, c); px(ctx, i + 1, 6, 1, 2, a); } px(ctx, 14, 18, 4, 4, a);
      break;
    case 'card':
      px(ctx, 7, 3, 18, 26, '#f2ead8'); px(ctx, 8, 4, 16, 24, '#d8c8a8');
      px(ctx, 9, 6, 14, 12, c); ellipse(ctx, 16, 12, 4, 4, a); px(ctx, 14, 11, 1, 1, '#1c1622'); px(ctx, 17, 11, 1, 1, '#1c1622');
      px(ctx, 9, 20, 14, 1, '#8a7a5a'); px(ctx, 9, 23, 10, 1, '#8a7a5a'); px(ctx, 9, 26, 12, 1, '#8a7a5a');
      break;
    case 'ore':
      ellipse(ctx, 16, 19, 11, 8, c); ellipse(ctx, 11, 14, 6, 5, c); ellipse(ctx, 21, 15, 6, 6, shade(c, -0.15));
      px(ctx, 10, 12, 3, 2, a); px(ctx, 19, 17, 2, 2, a); px(ctx, 14, 21, 2, 2, a); px(ctx, 22, 12, 1, 1, '#ffffff');
      break;
    case 'gem':
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(16, 4); ctx.lineTo(26, 14); ctx.lineTo(16, 28); ctx.lineTo(6, 14); ctx.closePath(); ctx.fill(); px(ctx, 12, 10, 3, 6, '#ffffff');
      break;
    case 'amulet':
      ctx.strokeStyle = '#c8b89a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(16, 10, 8, Math.PI, 0); ctx.stroke();
      ellipse(ctx, 16, 20, 7, 7, '#d8b46a'); ellipse(ctx, 16, 20, 5, 5, c); px(ctx, 14, 18, 2, 2, '#fff');
      break;
    case 'ring':
      ellipse(ctx, 16, 18, 9, 9, c); ellipse(ctx, 16, 18, 6, 6, 'rgba(0,0,0,0)'); ctx.clearRect(11, 13, 10, 10); ellipse(ctx, 16, 9, 3, 3, '#9ad8ff');
      break;
    case 'dagger':
      px(ctx, 15, 4, 3, 16, '#d8dde8'); px(ctx, 16, 4, 1, 15, '#fff'); px(ctx, 11, 20, 11, 3, '#b8a060'); px(ctx, 15, 23, 3, 6, '#5a3a1e');
      break;
    case 'sword':
      px(ctx, 15, 2, 4, 20, c); px(ctx, 16, 2, 1, 19, '#fff'); px(ctx, 9, 21, 16, 3, a ?? '#b8a060'); px(ctx, 15, 24, 4, 6, '#5a3a1e');
      break;
    case 'axe':
      px(ctx, 15, 4, 3, 26, '#8b5a2b'); ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(17, 4); ctx.lineTo(27, 2); ctx.lineTo(27, 16); ctx.lineTo(17, 13); ctx.closePath(); ctx.fill(); px(ctx, 25, 3, 2, 12, '#fff');
      break;
    case 'spear':
      px(ctx, 15, 8, 2, 22, '#8b5a2b'); ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(16, 1); ctx.lineTo(20, 9); ctx.lineTo(12, 9); ctx.closePath(); ctx.fill(); px(ctx, 13, 9, 6, 2, a ?? '#b33a3a');
      break;
    case 'club':
      px(ctx, 14, 14, 4, 16, '#6a4a2a'); ellipse(ctx, 16, 10, 7, 8, c);
      break;
    case 'bow':
      ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(8, 16, 14, -1.1, 1.1); ctx.stroke();
      ctx.strokeStyle = '#e8e0d0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(14.5, 3.5); ctx.lineTo(14.5, 28.5); ctx.stroke();
      if (a) px(ctx, 20, 14, 3, 4, a);
      break;
    case 'wand':
      px(ctx, 15, 10, 3, 20, c); ellipse(ctx, 16, 7, 4, 4, a ?? '#7fd6ff'); px(ctx, 15, 5, 1, 1, '#fff');
      break;
    case 'staff':
      px(ctx, 15, 8, 3, 23, c); ellipse(ctx, 16, 6, 5, 5, a ?? '#9a7aff'); px(ctx, 14, 4, 2, 2, '#fff');
      break;
    case 'shirt': case 'robe':
      px(ctx, 9, 8, 14, shape === 'robe' ? 20 : 16, c); px(ctx, 4, 8, 6, 8, c); px(ctx, 22, 8, 6, 8, c); px(ctx, 13, 8, 6, 3, D);
      break;
    case 'armor':
      px(ctx, 8, 8, 16, 18, c); px(ctx, 4, 7, 7, 7, L); px(ctx, 21, 7, 7, 7, L); px(ctx, 12, 12, 8, 8, D);
      break;
    case 'hat':
      ellipse(ctx, 16, 20, 13, 4, D); ellipse(ctx, 16, 15, 8, 7, c);
      break;
    case 'helm':
      ellipse(ctx, 16, 16, 10, 10, c); px(ctx, 6, 16, 20, 10, c); px(ctx, 10, 18, 12, 3, '#1c1622'); px(ctx, 15, 6, 2, 10, L);
      break;
    case 'mask':
      ellipse(ctx, 16, 16, 11, 11, c); px(ctx, 10, 13, 4, 3, '#f2d23a'); px(ctx, 18, 13, 4, 3, '#f2d23a'); px(ctx, 11, 21, 10, 2, '#2a1a1a');
      break;
    case 'shield':
      ellipse(ctx, 16, 15, 11, 12, c); ellipse(ctx, 16, 15, 7, 8, a ?? L); px(ctx, 15, 6, 2, 18, D);
      break;
    case 'cape':
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(9, 6); ctx.lineTo(23, 6); ctx.lineTo(27, 28); ctx.lineTo(5, 28); ctx.closePath(); ctx.fill(); px(ctx, 9, 6, 14, 3, L);
      break;
    case 'leaf':
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(6, 26); ctx.quadraticCurveTo(6, 6, 26, 6); ctx.quadraticCurveTo(26, 26, 6, 26); ctx.fill();
      ctx.strokeStyle = L; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(7, 25); ctx.lineTo(23, 9); ctx.stroke();
      px(ctx, 4, 26, 4, 2, D);
      break;
    case 'boots':
      px(ctx, 8, 6, 7, 18, c); px(ctx, 8, 22, 12, 6, D); px(ctx, 18, 8, 6, 16, shade(c, -0.1));
      break;
    default:
      ellipse(ctx, 16, 16, 10, 10, c);
  }
}

export function itemIconCanvas(def: ItemDef): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(32, 32);
  drawItemShape(ctx, def.icon.shape, def.icon.color, def.icon.accent ?? shade(def.icon.color, 0.3));
  addOutline(ctx, 0, 0, 32, 32);
  return canvas;
}

export function itemIconUrl(def: ItemDef): string {
  const key = `item:${def.id}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const url = fileUrlFor(`icon_item_${def.id}`) ?? itemIconCanvas(def).toDataURL();
  cache.set(key, url);
  return url;
}

export function skillIconUrl(def: SkillDef): string {
  const key = `skill:${def.id}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const file = fileUrlFor(`icon_skill_${def.id}`);
  if (file) { cache.set(key, file); return file; }
  const { canvas, ctx } = makeCanvas(32, 32);
  const c = def.icon.color;
  const g = ctx.createLinearGradient(0, 0, 32, 32);
  g.addColorStop(0, shade(c, 0.25));
  g.addColorStop(1, shade(c, -0.45));
  ctx.fillStyle = g;
  ctx.fillRect(1, 1, 30, 30);
  ctx.strokeStyle = def.kind === 'ultimate' ? '#ffd34d' : def.kind === 'passive' ? '#9aa0aa' : '#2a2030';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 30, 30);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(2, 2, 28, 10);
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillText(def.icon.glyph, 17, 18);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(def.icon.glyph, 16, 17);
  const url = canvas.toDataURL();
  cache.set(key, url);
  return url;
}

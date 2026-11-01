// Draws a job costume on the chibi character (body, cape, headgear and accessories) for one frame.
// Frames are 48×64; the character faces down, left or up (right is the mirrored left).
import type { Direction } from '../../core/types';
import { ellipse, px, shade } from './canvas';
import type { Costume } from './costumes';

export const CX = 24;
const GOLD = '#e8c048', GOLD_D = '#a8822a', STEEL = '#c8ccd8', BOOT = '#4a3424', BANDAGE = '#e8e0cc';

export interface Pal { prim: string; sec: string; acc: string; skin: string; slim: boolean }
export interface BodyPose { legL: number; legR: number; armL: number; armR: number; armsUp: boolean }

/** A shaded block: light top/left edge, dark bottom/right edge. */
function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) {
  px(ctx, x, y, w, h, c);
  if (w > 2 && h > 2) {
    px(ctx, x, y, w, 1, shade(c, 0.2)); px(ctx, x, y, 1, h, shade(c, 0.12));
    px(ctx, x + w - 1, y + 1, 1, h - 1, shade(c, -0.22)); px(ctx, x + 1, y + h - 1, w - 1, 1, shade(c, -0.28));
  }
}

const capeOf = (c: Costume, p: Pal) => (c.capeColor === 'primary' ? p.prim : c.capeColor === 'accent' ? p.acc : c.capeColor?.startsWith('#') ? c.capeColor : p.sec);

/** Cape behind the body (down and side views). */
export function drawCapeBack(ctx: CanvasRenderingContext2D, c: Costume, p: Pal, dir: Direction, by: number) {
  if (!c.cape || dir === 'up') return;
  const col = capeOf(c, p), bottom = by + (c.cape === 'long' ? 57 : 47), top = by + 31;
  if (dir === 'down') {
    for (let y = top; y < bottom; y++) {
      const spread = 9 + Math.floor((y - top) / 4);
      px(ctx, CX - spread, y, spread * 2, 1, (y - top) % 6 === 5 ? shade(col, -0.25) : shade(col, -0.1));
    }
    if (c.trim) px(ctx, CX - 9 - Math.floor((bottom - top) / 4), bottom - 1, (9 + Math.floor((bottom - top) / 4)) * 2, 1, GOLD);
  } else {
    // Side view: the cape trails behind the back (to the right, as the frame faces left).
    for (let y = top; y < bottom; y++) {
      const w = 4 + Math.floor((y - top) / 3);
      px(ctx, CX + 1, y, w, 1, (y - top) % 6 === 5 ? shade(col, -0.25) : col);
    }
    if (c.trim) px(ctx, CX + 1, bottom - 1, 4 + Math.floor((bottom - top) / 3), 1, GOLD);
  }
}

/** Cape over the back (up view, drawn after the body). */
export function drawCapeFront(ctx: CanvasRenderingContext2D, c: Costume, p: Pal, dir: Direction, by: number) {
  if (!c.cape || dir !== 'up') return;
  const col = capeOf(c, p), bottom = by + (c.cape === 'long' ? 57 : 47), top = by + 30;
  for (let y = top; y < bottom; y++) {
    const half = 8 + Math.floor((y - top) / 5);
    px(ctx, CX - half, y, half * 2, 1, col);
    px(ctx, CX - half, y, 1, 1, shade(col, 0.15)); px(ctx, CX + half - 1, y, 1, 1, shade(col, -0.3));
  }
  for (let y = top + 4; y < bottom; y += 5) px(ctx, CX - 1, y, 2, 3, shade(col, -0.2));
  if (c.trim) { const half = 8 + Math.floor((bottom - top) / 5); px(ctx, CX - half, bottom - 1, half * 2, 1, GOLD); }
  px(ctx, CX - 8, top, 16, 2, shade(col, -0.25));
}

function drawLegs(ctx: CanvasRenderingContext2D, c: Costume, p: Pal, dir: Direction, by: number, bp: BodyPose) {
  const y = by + 45;
  const pants = c.torso === 'plate' || c.torso === 'tabard' ? shade(p.sec, -0.2) : shade(p.sec, -0.35);
  const boot = c.torso === 'plate' || c.torso === 'tabard' ? STEEL : c.legs === 'shorts' ? '#6a4a2a' : BOOT;
  const legs: [number, number][] = dir === 'down' || dir === 'up' ? [[CX - 5, bp.legL], [CX + 1, bp.legR]] : [[CX - 3, bp.legL], [CX - 1, bp.legR]];
  for (const [lx, lift] of legs) {
    if (c.legs === 'robe') { box(ctx, lx - 1, y + 9 - lift, 5, 3, boot); continue; }
    if (c.legs === 'shorts') { box(ctx, lx, y - lift, 4, 4, pants); px(ctx, lx, y + 4 - lift, 4, 5, p.skin); }
    else box(ctx, lx, y - lift, 4, 9, pants);
    box(ctx, lx - (dir === 'left' ? 1 : 0), y + 8 - lift, 5, 4, boot);
  }
}

function drawArms(ctx: CanvasRenderingContext2D, c: Costume, p: Pal, dir: Direction, top: number, sw: number, bp: BodyPose) {
  const sleeve = c.torso === 'plate' || c.torso === 'tabard' ? STEEL : c.torso === 'labcoat' ? p.sec : c.torso === 'suit' ? p.prim : p.prim;
  const hand = c.arms === 'gauntlet' ? STEEL : p.skin;
  const arm = (x: number, y: number, len: number) => {
    if (c.arms === 'bare' || c.arms === 'wrap') {
      box(ctx, x, y, 3, len, p.skin);
      if (c.arms === 'wrap') for (let i = 3; i < len; i += 3) px(ctx, x, y + i, 3, 1, BANDAGE);
      px(ctx, x, y, 3, 2, shade(p.prim, -0.1));
    } else if (c.arms === 'short') { box(ctx, x, y, 3, 4, sleeve); box(ctx, x, y + 4, 3, len - 4, p.skin); }
    else { box(ctx, x, y, 3, len, sleeve); if (c.arms === 'gauntlet') box(ctx, x, y + len - 4, 3, 4, shade(STEEL, -0.1)); }
    box(ctx, x, y + len, 3, 3, hand);
    if (c.trim && c.arms === 'sleeve') px(ctx, x, y + len - 1, 3, 1, GOLD);
  };
  if (bp.armsUp) { arm(CX - sw - 3, top - 9, 10); arm(CX + sw, top - 9, 10); return; }
  if (dir === 'left' || dir === 'right') { arm(CX - 2 - bp.armL, top + 1, 10); return; }
  arm(CX - sw - 3, top + 1 + Math.max(0, bp.armL), 10);
  arm(CX + sw, top + 1 + Math.max(0, bp.armR), 10);
}

/** Body: legs, torso, arms, shoulder pieces and chest details. */
export function drawCostumeBody(ctx: CanvasRenderingContext2D, c: Costume, p: Pal, dir: Direction, by: number, bp: BodyPose) {
  const side = dir === 'left' || dir === 'right', front = dir === 'down';
  const sw = side ? 5 : p.slim ? 6 : 7;
  const tx = CX - sw, tw = sw * 2, top = by + 31;
  drawLegs(ctx, c, p, dir, by, bp);
  if (side) drawArmsBack(ctx, c, p, top, bp);
  switch (c.torso) {
    case 'plate': {
      box(ctx, tx, top, tw, 13, p.prim);
      if (!side) { box(ctx, CX - 4, top + 2, 8, 7, shade(p.prim, 0.22)); px(ctx, CX - 1, top + 3, 2, 5, front ? p.acc : shade(p.prim, 0.1)); }
      for (let i = 0; i < 3; i++) px(ctx, tx + 1, top + 10 + i * 0, tw - 2, 1, shade(p.prim, -0.3));
      box(ctx, tx - 1, top + 13, tw + 2, 4, shade(p.sec, -0.05)); // tasset skirt
      for (let x = tx; x < tx + tw; x += 3) px(ctx, x, top + 13, 1, 4, shade(p.sec, -0.35));
      break;
    }
    case 'tabard': {
      box(ctx, tx, top, tw, 14, STEEL);
      for (let y = top + 2; y < top + 14; y += 2) px(ctx, tx + 1, y, tw - 2, 1, shade(STEEL, -0.15)); // mail
      if (!side) { box(ctx, CX - sw + 2, top + 1, tw - 4, 21, p.prim); if (front) { px(ctx, CX - 1, top + 4, 2, 9, p.sec); px(ctx, CX - 4, top + 7, 8, 2, p.sec); } }
      else box(ctx, CX - 3, top + 1, 6, 21, p.prim);
      break;
    }
    case 'robe': {
      for (let y = top; y < by + 57 - Math.max(bp.legL, bp.legR); y++) {
        const half = sw + Math.floor((y - top) / 5);
        px(ctx, CX - half, y, half * 2, 1, p.prim);
        px(ctx, CX - half, y, 1, 1, shade(p.prim, 0.15)); px(ctx, CX + half - 1, y, 1, 1, shade(p.prim, -0.25));
      }
      const hem = by + 56 - Math.max(bp.legL, bp.legR), hh = sw + Math.floor((hem - top) / 5);
      px(ctx, CX - hh, hem, hh * 2, 1, c.trim ? GOLD : shade(p.prim, -0.3));
      if (front) { px(ctx, CX - 1, top + 2, 2, hem - top - 2, c.trim ? GOLD : p.acc); px(ctx, CX - sw, top + 9, tw, 2, p.sec); }
      else px(ctx, CX - sw, top + 9, tw, 2, p.sec);
      for (let y = top + 13; y < hem; y += 4) px(ctx, CX + (side ? 1 : 3), y, 1, 3, shade(p.prim, -0.18)); // folds
      break;
    }
    case 'vest': {
      box(ctx, tx, top, tw, 14, p.sec);
      if (!side) { box(ctx, tx, top, 4, 14, p.prim); box(ctx, tx + tw - 4, top, 4, 14, p.prim); }
      else box(ctx, CX, top, 5, 14, p.prim);
      break;
    }
    case 'coat': case 'frock': {
      box(ctx, tx, top, tw, 15, p.prim);
      // tails reach the knees
      if (!side) { box(ctx, tx - 1, top + 13, 4, 7, shade(p.prim, -0.1)); box(ctx, tx + tw - 3, top + 13, 4, 7, shade(p.prim, -0.15)); }
      else box(ctx, CX + 1, top + 12, 5, 8, shade(p.prim, -0.15));
      if (front) {
        px(ctx, CX - 2, top, 4, 11, p.sec);
        for (let y = top + 3; y < top + 13; y += 3) px(ctx, CX - 3, y, 1, 1, p.acc);
        if (c.torso === 'frock') for (let y = top + 1; y < top + 8; y += 2) px(ctx, CX - 2, y, 4, 1, '#ffffff');
      }
      break;
    }
    case 'apron': {
      box(ctx, tx, top, tw, 14, p.sec);
      if (!side) { box(ctx, tx + 2, top + 3, tw - 4, 17, p.prim); if (front) box(ctx, CX - 3, top + 11, 6, 4, shade(p.prim, -0.12)); px(ctx, tx + 2, top, 1, 3, p.prim); px(ctx, tx + tw - 3, top, 1, 3, p.prim); }
      else box(ctx, CX - 5, top + 3, 4, 17, p.prim);
      break;
    }
    case 'gi': {
      box(ctx, tx, top, tw, 14, p.prim);
      if (front) { for (let i = 0; i < 6; i++) { px(ctx, CX - 3 + i, top + i, 1, 1, p.skin); px(ctx, CX + 2 - i, top + i, 1, 1, p.skin); } px(ctx, CX - 1, top, 2, 5, p.skin); }
      box(ctx, tx - 1, top + 9, tw + 2, 3, p.sec);
      if (front) { px(ctx, CX + 2, top + 12, 2, 6, p.sec); px(ctx, CX + 4, top + 12, 2, 5, shade(p.sec, -0.2)); }
      break;
    }
    case 'suit': {
      box(ctx, tx, top, tw, 14, p.prim);
      px(ctx, tx + 1, top + 4, tw - 2, 1, p.sec); px(ctx, tx + 1, top + 9, tw - 2, 2, p.sec);
      if (front) for (const x of [CX - 4, CX + 3]) px(ctx, x, top + 1, 1, 12, shade(p.prim, 0.2));
      break;
    }
    case 'labcoat': {
      box(ctx, tx, top, tw, 14, p.prim); // shirt
      if (!side) {
        box(ctx, tx - 1, top, 5, 22, p.sec); box(ctx, tx + tw - 4, top, 5, 22, shade(p.sec, -0.08));
        if (front) { px(ctx, tx + 3, top, 1, 6, shade(p.sec, -0.25)); px(ctx, tx + tw - 4, top, 1, 6, shade(p.sec, -0.25)); box(ctx, tx + tw - 3, top + 12, 3, 3, shade(p.sec, -0.15)); }
      } else box(ctx, CX - 2, top, 7, 22, p.sec);
      break;
    }
    default: { // tunic
      box(ctx, tx, top, tw, 14, p.prim);
      if (front) { px(ctx, CX - 2, top, 4, 3, p.acc); px(ctx, CX - 1, top + 3, 2, 1, p.acc); }
    }
  }
  if (c.belt && c.torso !== 'gi') { px(ctx, tx, top + 10, tw, 2, '#5a3a1e'); if (front) px(ctx, CX - 1, top + 10, 2, 2, GOLD); }
  if (c.trim && c.torso !== 'robe') { px(ctx, tx, top, tw, 1, GOLD); if (!side) { px(ctx, tx, top, 1, 13, GOLD); px(ctx, tx + tw - 1, top, 1, 13, GOLD); } }
  // Chest details (front only).
  if (front) {
    if (c.emblem === 'cross') { px(ctx, CX - 1, top + 3, 2, 7, GOLD); px(ctx, CX - 3, top + 5, 6, 2, GOLD); }
    if (c.emblem === 'gem') { px(ctx, CX - 2, top + 3, 4, 3, p.acc); px(ctx, CX - 1, top + 3, 1, 1, '#ffffff'); }
    if (c.emblem === 'flame') { px(ctx, CX - 1, top + 2, 2, 5, '#ff7a3a'); px(ctx, CX - 2, top + 4, 4, 2, '#ffb84a'); }
    if (c.emblem === 'star') { px(ctx, CX - 1, top + 3, 2, 4, GOLD); px(ctx, CX - 2, top + 4, 4, 2, GOLD); }
    if (c.beads) for (let i = -4; i <= 4; i += 2) px(ctx, CX + i, top + 2 + Math.abs(i) / 2, 2, 2, i === 0 ? GOLD : p.acc);
    if (c.bag) { for (let i = 0; i < 12; i++) px(ctx, CX - sw + 1 + i, top + i, 1, 1, '#6a4a2a'); box(ctx, CX + sw - 3, top + 10, 6, 5, '#8a5a2a'); }
  } else if (c.bag && side) box(ctx, CX + 3, top + 8, 4, 5, '#8a5a2a');
  // Arms and shoulders.
  drawArms(ctx, c, p, dir, top, sw, side ? { ...bp, armL: bp.armL } : bp);
  if (c.pauldrons && !bp.armsUp) {
    const col = c.pauldrons === 'fur' ? '#8a6a44' : p.sec;
    const spots = side ? [CX - 2] : [CX - sw - 2, CX + sw + 1];
    for (const sx of spots) {
      ellipse(ctx, sx, top + 1, c.pauldrons === 'wing' ? 5 : 4, 3, col);
      px(ctx, sx - 2, top - 1, 3, 1, shade(col, 0.3));
      if (c.pauldrons === 'wing') { px(ctx, sx - 5, top - 3, 2, 3, p.acc); px(ctx, sx + 3, top - 3, 2, 3, p.acc); }
      if (c.pauldrons === 'fur') for (let i = -3; i <= 3; i += 2) px(ctx, sx + i, top + 3, 1, 2, shade(col, -0.3));
      if (c.trim) px(ctx, sx - 3, top + 3, 7, 1, GOLD);
    }
  }
  if (c.collar && !side) { px(ctx, CX - 8, top - 4, 3, 6, p.sec); px(ctx, CX + 5, top - 4, 3, 6, p.sec); if (c.trim) { px(ctx, CX - 8, top - 4, 3, 1, GOLD); px(ctx, CX + 5, top - 4, 3, 1, GOLD); } }
  if (c.scarf) {
    if (front) { box(ctx, CX - 6, top - 1, 12, 3, p.acc); box(ctx, CX + 3, top + 2, 3, 9, shade(p.acc, -0.1)); }
    else if (side) { box(ctx, CX - 5, top - 1, 9, 3, p.acc); box(ctx, CX + 3, top, 6, 3, shade(p.acc, -0.1)); px(ctx, CX + 8, top + 2, 3, 2, shade(p.acc, -0.2)); }
    else box(ctx, CX - 6, top - 1, 12, 3, p.acc);
  }
}

/** The far arm in the side view (behind the body). */
function drawArmsBack(ctx: CanvasRenderingContext2D, c: Costume, p: Pal, top: number, bp: BodyPose) {
  if (bp.armsUp) return;
  const col = c.arms === 'bare' || c.arms === 'wrap' ? shade(p.skin, -0.15) : shade(c.torso === 'plate' || c.torso === 'tabard' ? STEEL : p.prim, -0.25);
  px(ctx, CX - 1 + bp.armL, top + 1, 3, 10, col);
}

/** Face mask over the mouth and nose (after the head is drawn). */
export function drawMask(ctx: CanvasRenderingContext2D, c: Costume, p: Pal, dir: Direction, hx: number, hy: number) {
  if (!c.mask || dir === 'up') return;
  const col = c.torso === 'suit' ? p.sec : shade(p.sec, -0.1);
  if (dir === 'down') { px(ctx, hx - 8, hy + 4, 16, 6, col); px(ctx, hx - 8, hy + 4, 16, 1, shade(col, 0.2)); }
  else { px(ctx, hx - 9, hy + 4, 10, 6, col); px(ctx, hx - 9, hy + 4, 10, 1, shade(col, 0.2)); }
}

/** Hats, helmets, hoods and other headgear (after the head). */
export function drawHeadgear(ctx: CanvasRenderingContext2D, c: Costume, p: Pal, dir: Direction, hx: number, hy: number) {
  const side = dir === 'left' || dir === 'right', back = dir === 'up';
  const prim = p.prim, sec = p.sec, acc = p.acc;
  switch (c.head) {
    case 'cap':
      ellipse(ctx, hx, hy - 7, 10, 4, prim); px(ctx, hx - 10, hy - 6, 20, 2, shade(prim, -0.2));
      if (!back) px(ctx, side ? hx - 13 : hx - 7, hy - 5, side ? 6 : 14, 2, sec);
      break;
    case 'feather_cap':
      ellipse(ctx, hx, hy - 7, 10, 4, prim); px(ctx, hx - 10, hy - 6, 20, 2, shade(prim, -0.25));
      px(ctx, side ? hx + 4 : hx + 5, hy - 15, 2, 8, acc); px(ctx, side ? hx + 6 : hx + 7, hy - 17, 2, 6, shade(acc, 0.2));
      break;
    case 'wide_hat':
      ellipse(ctx, hx, hy - 6, 15, 3, shade(prim, -0.15));
      for (let i = 0; i < 16; i++) { const w = Math.max(1, 8 - Math.floor(i / 2)); px(ctx, hx - w + (i > 10 ? (side ? 2 : 1) : 0), hy - 8 - i, w * 2, 1, i % 5 === 4 ? shade(prim, -0.2) : prim); }
      px(ctx, hx - 8, hy - 9, 16, 2, acc);
      if (c.trim) px(ctx, hx - 15, hy - 6, 30, 1, GOLD);
      break;
    case 'mitre':
      for (let i = 0; i < 15; i++) { const w = i > 10 ? 6 - (i - 10) : 6; px(ctx, hx - w, hy - 6 - i, w * 2, 1, i % 4 === 0 ? shade('#f4f0e0', -0.08) : '#f4f0e0'); }
      if (!back) { px(ctx, hx - 1, hy - 18, 2, 10, GOLD); px(ctx, hx - 3, hy - 15, 6, 2, GOLD); }
      px(ctx, hx - 6, hy - 7, 12, 2, GOLD);
      break;
    case 'hood':
    case 'beast_hood': {
      const col = c.head === 'beast_hood' ? '#8a6a44' : prim;
      ellipse(ctx, hx, hy - 4, 11, 7, col);
      if (back) { ellipse(ctx, hx, hy, 11, 10, col); px(ctx, hx - 11, hy, 22, 13, col); px(ctx, hx - 1, hy + 2, 2, 11, shade(col, -0.2)); }
      else if (side) { px(ctx, hx - 2, hy - 6, 13, 16, col); px(ctx, hx - 2, hy - 6, 2, 16, shade(col, -0.25)); }
      else { px(ctx, hx - 11, hy - 4, 3, 14, col); px(ctx, hx + 8, hy - 4, 3, 14, col); px(ctx, hx - 9, hy - 5, 18, 1, shade(col, -0.3)); }
      px(ctx, hx - 4, hy - 10, 6, 1, shade(col, 0.25));
      if (c.head === 'beast_hood') { for (const ex of side ? [hx + 2] : [hx - 8, hx + 5]) { px(ctx, ex, hy - 14, 4, 4, col); px(ctx, ex + 1, hy - 13, 2, 2, '#e8b090'); } }
      break;
    }
    case 'bandana':
      px(ctx, hx - 10, hy - 6, 20, 4, sec); px(ctx, hx - 10, hy - 6, 20, 1, shade(sec, 0.25));
      if (!side || dir === 'left') { px(ctx, back ? hx - 1 : hx + 9, hy - 4, 3, 5, shade(sec, -0.15)); px(ctx, back ? hx + 1 : hx + 11, hy - 2, 2, 5, shade(sec, -0.25)); }
      break;
    case 'goggles':
      px(ctx, hx - 10, hy - 5, 20, 2, '#3a2a1e');
      if (!back) for (const gx of side ? [hx - 7] : [hx - 7, hx + 1]) { ellipse(ctx, gx + 3, hy - 5, 3, 3, '#6a4a2a'); ellipse(ctx, gx + 3, hy - 5, 2, 2, acc); px(ctx, gx + 2, hy - 6, 1, 1, '#ffffff'); }
      break;
    case 'glasses':
      if (!back) for (const gx of side ? [hx - 8] : [hx - 7, hx + 1]) { ctx.strokeStyle = '#3a3a48'; ctx.lineWidth = 1; ctx.strokeRect(gx + 0.5, hy + 0.5, 5, 5); px(ctx, gx + 1, hy + 1, 1, 1, '#ffffffaa'); }
      if (dir === 'down') px(ctx, hx - 2, hy + 2, 3, 1, '#3a3a48');
      break;
    case 'circlet':
      px(ctx, hx - 10, hy - 6, 20, 2, GOLD); if (!back) { px(ctx, side ? hx - 9 : hx - 1, hy - 7, 3, 3, acc); px(ctx, side ? hx - 8 : hx, hy - 7, 1, 1, '#ffffff'); }
      break;
    case 'crown':
      px(ctx, hx - 8, hy - 9, 16, 4, GOLD); px(ctx, hx - 8, hy - 6, 16, 1, GOLD_D);
      for (let i = -8; i <= 6; i += 4) px(ctx, hx + i, hy - 12, 2, 3, GOLD);
      if (!back) px(ctx, hx - 1, hy - 9, 2, 2, acc);
      break;
    case 'horn_helm':
      ellipse(ctx, hx, hy - 5, 11, 7, STEEL); px(ctx, hx - 11, hy - 4, 22, 3, shade(STEEL, -0.2));
      if (!back && !side) px(ctx, hx - 1, hy - 4, 2, 6, shade(STEEL, -0.35));
      for (const s of side ? [1] : [-1, 1]) { const bx = hx + s * 9; px(ctx, bx - 1, hy - 11, 3, 4, acc); px(ctx, bx + s * 2 - 1, hy - 15, 3, 4, acc); px(ctx, bx + s * 4 - 1, hy - 17, 2, 3, shade(acc, 0.25)); }
      if (c.trim) px(ctx, hx - 11, hy - 4, 22, 1, GOLD);
      break;
    case 'beret':
      ellipse(ctx, hx + (side ? 2 : 1), hy - 8, 11, 4, prim); px(ctx, hx - 9, hy - 6, 18, 1, shade(prim, -0.3));
      px(ctx, hx + 5, hy - 16, 2, 8, acc); px(ctx, hx + 7, hy - 18, 2, 6, shade(acc, 0.2)); px(ctx, hx + 6, hy - 12, 1, 1, '#ffffff');
      break;
    case 'headband':
      px(ctx, hx - 10, hy - 5, 20, 3, acc); px(ctx, hx - 10, hy - 5, 20, 1, shade(acc, 0.25));
      if (dir !== 'down') { px(ctx, back ? hx - 1 : hx + 9, hy - 3, 2, 7, acc); px(ctx, back ? hx + 1 : hx + 11, hy - 2, 2, 6, shade(acc, -0.2)); }
      break;
    case 'mortar':
      ellipse(ctx, hx, hy - 7, 10, 4, '#2a2a3a'); px(ctx, hx - 11, hy - 12, 22, 3, '#2a2a3a'); px(ctx, hx - 11, hy - 12, 22, 1, '#4a4a5a');
      px(ctx, hx + (side ? 6 : 8), hy - 11, 1, 7, acc); px(ctx, hx + (side ? 5 : 7), hy - 5, 3, 2, acc);
      break;
    case 'tricorn':
      px(ctx, hx - 13, hy - 8, 26, 3, shade(prim, -0.2)); px(ctx, hx - 13, hy - 9, 3, 2, shade(prim, -0.2)); px(ctx, hx + 10, hy - 9, 3, 2, shade(prim, -0.2));
      ellipse(ctx, hx, hy - 11, 8, 4, prim); px(ctx, hx - 13, hy - 6, 26, 1, acc);
      break;
  }
}

// Procedural anime-chibi character sprite sheets (placeholder art).
// Sheet layout and animation metadata are defined in spriteMeta.ts and are the
// contract real artwork must follow to replace these sheets.
import type { Appearance, Direction } from '../../core/types';
import { addOutline, ellipse, makeCanvas, px, shade } from './canvas';
import { overrideCanvas } from './spriteOverrides';
import { costumeFor } from './costumes';
import { drawCapeBack, drawCapeFront, drawCostumeBody, drawHeadgear, drawMask } from './costumeDraw';
import { CHAR_ANIMS, CHAR_DIRECTIONS, CHAR_FRAME_H, CHAR_FRAME_W, CHAR_SHEET_COLS, type CharAnim } from './spriteMeta';

export interface CharacterLook {
  appearance: Appearance;
  outfit: { primary: string; secondary: string; accent: string; style: string; costume?: string };
  weapon: string | null; // weapon type: dagger, sword, bow, staff, wand, spear, club...
  shield?: boolean;
  /** Studio sheet that replaces the drawn one: `npc/<id>` or `class/<classId>`. */
  sheet?: string;
}

const W = CHAR_FRAME_W, H = CHAR_FRAME_H;
/** Headgear that covers the crown of the head. */
const COVERING = new Set(['hood', 'beast_hood', 'wide_hat', 'mitre', 'horn_helm', 'mortar', 'tricorn', 'cap', 'feather_cap', 'beret']);
const CX = 24, FEET = 60;

interface Pose {
  bob: number;        // vertical body offset
  legL: number; legR: number; // leg lift (px)
  armL: number; armR: number; // arm swing offset (px, +down/forward)
  weaponAngle: number; // radians, 0 = pointing down-forward
  weaponRaise: number;
  lunge: number;
  castGlow: number;
  armsUp: boolean;
}

const basePose: Pose = { bob: 0, legL: 0, legR: 0, armL: 0, armR: 0, weaponAngle: 0.3, weaponRaise: 0, lunge: 0, castGlow: 0, armsUp: false };

function poseFor(anim: CharAnim, f: number): Pose {
  switch (anim) {
    case 'idle': return { ...basePose, bob: f === 1 ? 1 : 0 };
    case 'walk': {
      const cyc = [[2, 0, 2, -2], [0, 0, 0, 0], [0, 2, -2, 2], [0, 0, 0, 0]][f];
      return { ...basePose, legL: cyc[0], legR: cyc[1], armL: cyc[2], armR: cyc[3], bob: f % 2 === 1 ? -1 : 0 };
    }
    case 'attack': return [
      { ...basePose, weaponAngle: -2.2, weaponRaise: 4, armR: -3 },
      { ...basePose, weaponAngle: 1.2, lunge: 3, armR: 3 },
      { ...basePose, weaponAngle: 0.6, lunge: 1 },
    ][f];
    case 'cast': return { ...basePose, armsUp: true, castGlow: 3 + f * 2, weaponAngle: -1.4, bob: f === 1 ? -1 : 0 };
    case 'hit': return { ...basePose, lunge: -3, bob: 1 };
    case 'death': return { ...basePose, bob: 6 };
  }
}

function drawWeapon(ctx: CanvasRenderingContext2D, type: string | null, x: number, y: number, angle: number, accent: string) {
  if (!type) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const steel = '#d8dde8', dark = '#6a6f7a', wood = '#8b5a2b';
  switch (type) {
    case 'dagger':
      px(ctx, -1, -2, 3, 2, '#5a3a1e'); px(ctx, -3, 0, 7, 2, '#b8a060'); px(ctx, -1, 2, 3, 9, steel); px(ctx, 0, 2, 1, 9, '#ffffff');
      break;
    case 'sword': case 'twohand_sword':
      px(ctx, -1, -4, 3, 4, '#5a3a1e'); px(ctx, -4, 0, 9, 2, accent); px(ctx, -1, 2, 4, 17, steel); px(ctx, 0, 2, 1, 16, '#ffffff'); px(ctx, 0, 19, 2, 2, steel);
      break;
    case 'spear':
      px(ctx, 0, -12, 2, 30, wood); px(ctx, -1, 18, 4, 3, dark); px(ctx, -1, 21, 4, 5, steel); px(ctx, 0, 26, 2, 2, steel);
      break;
    case 'axe':
      px(ctx, 0, -4, 2, 22, wood); px(ctx, 2, 10, 6, 9, steel); px(ctx, 7, 10, 1, 9, '#ffffff');
      break;
    case 'club':
      px(ctx, 0, -2, 3, 10, wood); px(ctx, -1, 8, 5, 6, shade(wood, -0.2)); px(ctx, 0, 9, 1, 2, '#c8a26b');
      break;
    case 'staff':
      px(ctx, 0, -18, 2, 32, wood); ellipse(ctx, 1, -20, 3, 3, accent); px(ctx, 0, -21, 1, 1, '#ffffff');
      break;
    case 'wand':
      px(ctx, 0, -4, 2, 14, '#b48a5a'); ellipse(ctx, 1, -5, 2, 2, accent);
      break;
    case 'bow': case 'crossbow':
      ctx.strokeStyle = '#7a4a22'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(-6, 4, 12, -1.1, 1.1); ctx.stroke();
      ctx.strokeStyle = '#e8e0d0'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-6 + 12 * Math.cos(-1.1), 4 + 12 * Math.sin(-1.1)); ctx.lineTo(-6 + 12 * Math.cos(1.1), 4 + 12 * Math.sin(1.1)); ctx.stroke();
      break;
    default:
      px(ctx, -1, 0, 3, 12, steel);
  }
  ctx.restore();
}

/** Filled polygon on whole pixels (scanline), so hair keeps hard pixel-art edges. */
function poly(ctx: CanvasRenderingContext2D, pts: [number, number][], color: string) {
  ctx.fillStyle = color;
  const ys = pts.map((p) => p[1]);
  for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
      if ((y + 0.5 >= Math.min(y1, y2)) && (y + 0.5 < Math.max(y1, y2))) xs.push(x1 + ((y + 0.5 - y1) * (x2 - x1)) / (y2 - y1));
    }
    xs.sort((m, n) => m - n);
    for (let i = 0; i + 1 < xs.length; i += 2) ctx.fillRect(Math.round(xs[i]), y, Math.max(1, Math.round(xs[i + 1]) - Math.round(xs[i])), 1);
  }
}
const at = (hx: number, hy: number, pts: [number, number][]) => pts.map(([x, y]) => [hx + x, hy + y] as [number, number]);
const mirror = (pts: [number, number][]) => pts.map(([x, y]) => [-x, y] as [number, number]);

/** Hair that hangs behind the head and shoulders. */
function drawHairBack(ctx: CanvasRenderingContext2D, a: Appearance, hx: number, hy: number, dir: Direction) {
  const c = a.hairColor, d = shade(c, -0.22), s = a.hairStyle;
  if (dir === 'down') {
    if (s === 'long') { poly(ctx, at(hx, hy, [[-11, -4], [-12, 10], [-11, 21], [-7, 25], [7, 25], [11, 21], [12, 10], [11, -4]]), d); for (let x = -8; x <= 6; x += 4) px(ctx, hx + x, hy + 12, 1, 11, shade(d, -0.15)); }
    if (s === 'bob') poly(ctx, at(hx, hy, [[-11, -4], [-12, 7], [-9, 11], [9, 11], [12, 7], [11, -4]]), d);
    if (s === 'ponytail') poly(ctx, at(hx, hy, [[8, -8], [14, -3], [14, 9], [11, 15], [9, 6]]), d);
  } else if (dir === 'up') {
    if (s === 'long') poly(ctx, at(hx, hy, [[-11, 0], [-12, 12], [-10, 22], [-6, 26], [6, 26], [10, 22], [12, 12], [11, 0]]), c);
    if (s === 'ponytail') poly(ctx, at(hx, hy, [[-3, -6], [3, -6], [4, 8], [2, 16], [-2, 16], [-4, 8]]), d);
  } else {
    if (s === 'long') { poly(ctx, at(hx, hy, [[1, -6], [11, -4], [13, 10], [11, 21], [7, 25], [3, 20], [3, 6]]), d); px(ctx, hx + 8, hy + 10, 1, 12, shade(d, -0.15)); }
    if (s === 'bob') poly(ctx, at(hx, hy, [[1, -6], [11, -4], [12, 7], [8, 11], [2, 10]]), d);
    if (s === 'ponytail') poly(ctx, at(hx, hy, [[8, -9], [16, -5], [16, 7], [12, 14], [10, 5]]), d);
  }
}

/** Spiky hair: tufts fanning out from the crown. */
function spikes(ctx: CanvasRenderingContext2D, hx: number, hy: number, c: string, dir: Direction) {
  const tips: [number, number][] = dir === 'down' || dir === 'up'
    ? [[-12, -9], [-8, -14], [-2, -16], [4, -15], [9, -12], [12, -7]]
    : [[-10, -12], [-4, -16], [3, -15], [9, -12], [12, -7], [13, -1]];
  for (const [tx, ty] of tips) { const bx = tx * 0.35; poly(ctx, at(hx, hy, [[bx - 4, -5], [tx, ty], [bx + 4, -5]]), c); }
}

/** `covered`: a hat or hood sits on top, so spiky tufts stay hidden under it. */
function drawHead(ctx: CanvasRenderingContext2D, a: Appearance, hx: number, hy: number, dir: Direction, covered = false) {
  const skin = a.skinTone, hair = a.hairColor, hairD = shade(hair, -0.25), hairL = shade(hair, 0.3);
  const style = a.hairStyle;
  // (Hair hanging behind the body is drawn before the body: see drawFrame.)
  // Face
  ellipse(ctx, hx, hy, 9, 9, skin);
  px(ctx, hx - 6, hy + 8, 12, 1, shade(skin, -0.12));
  if (dir === 'up') {
    ellipse(ctx, hx, hy - 1, 10, 10, hair);
    if (style === 'spiky' && !covered) spikes(ctx, hx, hy, hair, dir);
    if (style === 'long') poly(ctx, at(hx, hy, [[-10, 2], [-11, 12], [-8, 22], [8, 22], [11, 12], [10, 2]]), hair);
    if (style === 'bob') poly(ctx, at(hx, hy, [[-11, 0], [-11, 9], [-8, 11], [8, 11], [11, 9], [11, 0]]), hair);
    px(ctx, hx - 5, hy - 8, 6, 2, hairL); px(ctx, hx - 1, hy + 2, 1, 7, hairD);
    return;
  }
  if (dir === 'down') {
    if (style === 'spiky' && !covered) spikes(ctx, hx, hy, hair, dir);
    ellipse(ctx, hx, hy - 4, 10, 7, hair);
    // Fringe: points falling over the forehead.
    for (let i = 0, x = -10; x < 10; x += 4, i++) poly(ctx, at(hx, hy, [[x, -5], [x + 4, -5], [x + 2 + (i % 2 ? -1 : 1), i % 2 ? 0 : 2]]), hair);
    // Side locks by style.
    const lock: [number, number][] = style === 'long' ? [[-11, -4], [-12, 12], [-9, 15], [-8, 1]] : style === 'bob' ? [[-11, -4], [-12, 7], [-9, 10], [-7, 9], [-8, 0]] : [[-11, -4], [-11, 4], [-8, 2]];
    poly(ctx, at(hx, hy, lock), hair); poly(ctx, at(hx, hy, mirror(lock)), hair);
    px(ctx, hx - 6, hy - 9, 6, 1, hairL); px(ctx, hx - 7, hy - 8, 3, 1, hairL); px(ctx, hx + 6, hy - 7, 2, 2, hairD);
    // Eyes (large, anime style), mouth, blush.
    const eye = a.eyeColor;
    for (const ex of [hx - 6, hx + 2]) {
      px(ctx, ex, hy + 1, 4, 5, '#1c1622');
      px(ctx, ex, hy + 2, 4, 3, eye);
      px(ctx, ex + 1, hy + 4, 2, 1, shade(eye, 0.35));
      px(ctx, ex + 2, hy + 2, 1, 1, '#ffffff');
      px(ctx, ex - 1, hy, 6, 1, '#1c1622');
    }
    px(ctx, hx - 1, hy + 7, 2, 1, shade(skin, -0.35));
    px(ctx, hx - 8, hy + 5, 2, 1, '#f0a0a0'); px(ctx, hx + 6, hy + 5, 2, 1, '#f0a0a0');
  } else {
    // Side view (drawn facing left; the right view is mirrored).
    if (style === 'spiky' && !covered) spikes(ctx, hx, hy, hair, dir);
    ellipse(ctx, hx + 1, hy - 4, 10, 7, hair);
    px(ctx, hx - 1, hy - 4, 11, 10, hair);
    poly(ctx, at(hx, hy, [[2, 4], [10, 2], [9, 9], [4, 8]]), hairD);
    for (let i = 0, x = -10; x < -1; x += 3, i++) poly(ctx, at(hx, hy, [[x, -5], [x + 3, -5], [x + 1, i % 2 ? 0 : 2]]), hair);
    px(ctx, hx - 4, hy - 9, 6, 1, hairL);
    px(ctx, hx - 9, hy + 2, 1, 2, shade(skin, -0.05));
    const eye = a.eyeColor;
    px(ctx, hx - 7, hy + 1, 3, 5, '#1c1622'); px(ctx, hx - 7, hy + 2, 3, 3, eye); px(ctx, hx - 6, hy + 2, 1, 1, '#ffffff'); px(ctx, hx - 8, hy, 4, 1, '#1c1622');
    px(ctx, hx - 7, hy + 7, 2, 1, shade(skin, -0.35));
    px(ctx, hx + 1, hy + 1, 2, 3, shade(skin, -0.12));
  }
}

function drawShield(ctx: CanvasRenderingContext2D, dir: Direction, by: number, accent: string) {
  if (dir === 'up') return;
  const x = dir === 'down' ? CX - 14 : CX + 3;
  const y = by + 36;
  ellipse(ctx, x + 3, y + 4, 5, 6, '#7a5634');
  ellipse(ctx, x + 3, y + 4, 3, 4, '#9a6a3a');
  px(ctx, x + 2, y + 3, 2, 2, accent);
}

/** Draws one frame facing left/down/up (the right direction is mirrored from left). */
function drawFrame(ctx: CanvasRenderingContext2D, look: CharacterLook, dir: Direction, anim: CharAnim, f: number) {
  const p = poseFor(anim, f);
  const by = p.bob;
  const lunge = dir === 'left' ? -p.lunge : dir === 'down' ? 0 : 0;
  const lungeY = dir === 'down' ? p.lunge : dir === 'up' ? -p.lunge : 0;
  ctx.save();
  ctx.translate(lunge, lungeY);
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ellipse(ctx, CX, FEET, 10, 3, 'rgba(0,0,0,0.25)');
  const handX = dir === 'down' ? CX + 9 : dir === 'up' ? CX - 9 : CX - 4;
  const handY = by + 44 - p.weaponRaise;
  const wAngle = dir === 'left' ? p.weaponAngle + 0.2 : dir === 'up' ? -p.weaponAngle : -p.weaponAngle;
  const isBow = look.weapon === 'bow' || look.weapon === 'crossbow';
  if (dir === 'up') drawWeapon(ctx, look.weapon, handX, handY, isBow ? Math.PI : wAngle, look.outfit.accent);
  if (dir === 'up' && look.shield) drawShield(ctx, 'down', by, look.outfit.accent);
  // Job costume (cape behind, body, head, mask and headgear on top).
  const costume = costumeFor(look.outfit.costume, look.outfit.style);
  const pal = { prim: look.outfit.primary, sec: look.outfit.secondary, acc: look.outfit.accent, skin: look.appearance.skinTone, slim: look.appearance.body === 'b' };
  drawCapeBack(ctx, costume, pal, dir, by);
  // Hoods keep long hair tucked in.
  if (dir !== 'up' && costume.head !== 'hood' && costume.head !== 'beast_hood') drawHairBack(ctx, look.appearance, CX, by + 21, dir);
  drawCostumeBody(ctx, costume, pal, dir, by, p);
  drawHead(ctx, look.appearance, CX, by + 21, dir, COVERING.has(costume.head));
  drawMask(ctx, costume, pal, dir, CX, by + 21);
  drawHeadgear(ctx, costume, pal, dir, CX, by + 21);
  drawCapeFront(ctx, costume, pal, dir, by);
  if (dir === 'down' && look.shield) drawShield(ctx, dir, by, look.outfit.accent);
  if (dir !== 'up') {
    if (p.armsUp) drawWeapon(ctx, look.weapon, dir === 'down' ? CX + 9 : CX - 7, by + 22, -0.1, look.outfit.accent);
    else drawWeapon(ctx, look.weapon, handX, handY, isBow ? (dir === 'left' ? 0 : -Math.PI / 2) : wAngle, look.outfit.accent);
  }
  if (dir === 'left' && look.shield) drawShield(ctx, dir, by, look.outfit.accent);
  if (p.castGlow) {
    ctx.globalAlpha = 0.55;
    ellipse(ctx, CX, by + 20, p.castGlow + 4, p.castGlow + 4, look.outfit.accent);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

export function generateCharacterSheet(look: CharacterLook): HTMLCanvasElement {
  const drawn = look.sheet ? overrideCanvas(`sprites/${look.sheet}`, W * CHAR_SHEET_COLS, H * CHAR_DIRECTIONS.length) : null;
  if (drawn) return drawn;
  const { canvas, ctx } = makeCanvas(W * CHAR_SHEET_COLS, H * CHAR_DIRECTIONS.length);
  const tmp = makeCanvas(W, H);
  for (const [row, dir] of CHAR_DIRECTIONS.entries()) {
    for (const [anim, meta] of Object.entries(CHAR_ANIMS) as [CharAnim, typeof CHAR_ANIMS[CharAnim]][]) {
      for (let f = 0; f < meta.count; f++) {
        tmp.ctx.clearRect(0, 0, W, H);
        const drawDir: Direction = dir === 'right' ? 'left' : dir;
        if (anim === 'death') {
          // Kneel → topple → lie down, rotating the idle pose around the feet.
          const t2 = makeCanvas(W, H);
          drawFrame(t2.ctx, look, drawDir, 'idle', 0);
          addOutline(t2.ctx, 0, 0, W, H);
          tmp.ctx.save();
          tmp.ctx.translate(CX, FEET);
          tmp.ctx.rotate([0.25, 0.9, 1.5][f]);
          tmp.ctx.translate(-CX, -FEET + [3, 2, 0][f]);
          tmp.ctx.globalAlpha = [1, 0.95, 0.85][f];
          tmp.ctx.drawImage(t2.canvas, 0, 0);
          tmp.ctx.restore();
        } else {
          drawFrame(tmp.ctx, look, drawDir, anim, f);
          addOutline(tmp.ctx, 0, 0, W, H);
          if (anim === 'hit') {
            tmp.ctx.globalCompositeOperation = 'source-atop';
            tmp.ctx.fillStyle = 'rgba(255,60,60,0.45)';
            tmp.ctx.fillRect(0, 0, W, H);
            tmp.ctx.globalCompositeOperation = 'source-over';
          }
        }
        const dx = (meta.start + f) * W, dy = row * H;
        if (dir === 'right') {
          ctx.save();
          ctx.translate(dx + W, dy);
          ctx.scale(-1, 1);
          ctx.drawImage(tmp.canvas, 0, 0);
          ctx.restore();
        } else ctx.drawImage(tmp.canvas, dx, dy);
      }
    }
  }
  return canvas;
}

/** Head-and-shoulders portrait cropped from the front idle frame and scaled up. */
export function portraitFromSheet(sheet: HTMLCanvasElement, scale = 3): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(32 * scale, 32 * scale);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sheet, 8, 6, 32, 32, 0, 0, 32 * scale, 32 * scale);
  return canvas;
}

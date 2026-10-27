// Procedural anime-chibi character sprite sheets (placeholder art).
// Sheet layout and animation metadata are defined in spriteMeta.ts and are the
// contract real artwork must follow to replace these sheets.
import type { Appearance, Direction } from '../../core/types';
import { addOutline, ellipse, makeCanvas, px, shade } from './canvas';
import { CHAR_ANIMS, CHAR_DIRECTIONS, CHAR_FRAME_H, CHAR_FRAME_W, CHAR_SHEET_COLS, type CharAnim } from './spriteMeta';

export interface CharacterLook {
  appearance: Appearance;
  outfit: { primary: string; secondary: string; accent: string; style: string };
  weapon: string | null; // weapon type: dagger, sword, bow, staff, wand, spear, club...
  shield?: boolean;
}

const W = CHAR_FRAME_W, H = CHAR_FRAME_H;
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

function drawHairBack(ctx: CanvasRenderingContext2D, a: Appearance, hx: number, hy: number, dir: Direction) {
  const c = a.hairColor, d = shade(c, -0.25);
  if (a.hairStyle === 'long') {
    px(ctx, hx - 10, hy - 2, 20, 18, d);
    if (dir === 'up') px(ctx, hx - 10, hy - 2, 20, 20, c);
  }
  if (a.hairStyle === 'ponytail') {
    const side = dir === 'left' ? 9 : dir === 'right' ? -11 : -2;
    if (dir === 'up' || dir === 'left' || dir === 'right') { px(ctx, hx + side, hy - 4, 4, 16, d); px(ctx, hx + side + 1, hy - 3, 2, 14, c); }
    else px(ctx, hx - 2, hy - 13, 4, 4, d);
  }
}

function drawHead(ctx: CanvasRenderingContext2D, a: Appearance, hx: number, hy: number, dir: Direction) {
  const skin = a.skinTone, hair = a.hairColor, hairD = shade(hair, -0.25), hairL = shade(hair, 0.25);
  drawHairBack(ctx, a, hx, hy, dir);
  // Face/skull
  ellipse(ctx, hx, hy, 9, 9, skin);
  if (dir !== 'up') {
    // Ears
    if (dir === 'down') { px(ctx, hx - 10, hy, 2, 3, shade(skin, -0.1)); px(ctx, hx + 8, hy, 2, 3, shade(skin, -0.1)); }
  }
  // Hair cap
  ellipse(ctx, hx, hy - 4, 10, 7, hair);
  px(ctx, hx - 10, hy - 4, 20, 3, hair);
  const style = a.hairStyle;
  if (dir === 'up') {
    ellipse(ctx, hx, hy - 1, 10, 9, hair);
    px(ctx, hx - 3, hy - 9, 3, 2, hairL);
    if (style === 'spiky') for (let i = -8; i <= 6; i += 4) px(ctx, hx + i, hy - 12, 3, 3, hair);
    return;
  }
  if (dir === 'down') {
    // Bangs
    for (let i = -9; i <= 6; i += 3) px(ctx, hx + i, hy - 3, 3, 3 + ((i + 9) % 2), hair);
    px(ctx, hx - 10, hy - 3, 2, 9, hair); px(ctx, hx + 8, hy - 3, 2, 9, hair);
    if (style === 'bob' || style === 'long') { px(ctx, hx - 11, hy - 2, 3, 12, hair); px(ctx, hx + 8, hy - 2, 3, 12, hair); }
    if (style === 'spiky') for (let i = -9; i <= 7; i += 4) { px(ctx, hx + i, hy - 13, 3, 3, hair); px(ctx, hx + i + 1, hy - 15, 1, 2, hair); }
    px(ctx, hx - 4, hy - 9, 4, 1, hairL);
    // Eyes (anime style)
    const eye = a.eyeColor;
    for (const ex of [hx - 6, hx + 2]) {
      px(ctx, ex, hy + 1, 4, 5, '#1c1622');
      px(ctx, ex, hy + 2, 4, 3, eye);
      px(ctx, ex + 1, hy + 4, 2, 1, shade(eye, 0.35));
      px(ctx, ex + 2, hy + 2, 1, 1, '#ffffff');
      px(ctx, ex, hy, 4, 1, '#1c1622');
    }
    px(ctx, hx - 1, hy + 7, 2, 1, shade(skin, -0.3)); // mouth
    px(ctx, hx - 8, hy + 5, 2, 1, '#f0a0a0'); px(ctx, hx + 6, hy + 5, 2, 1, '#f0a0a0'); // blush
  } else {
    // Side view (drawn facing left; the right view is mirrored).
    px(ctx, hx - 1, hy - 3, 11, 12, hair);
    if (style === 'bob' || style === 'long') px(ctx, hx + 1, hy - 2, 9, 14, hair);
    for (let i = -9; i <= -1; i += 3) px(ctx, hx + i, hy - 3, 3, 3, hair);
    if (style === 'spiky') for (let i = -6; i <= 8; i += 4) px(ctx, hx + i, hy - 13, 3, 3, hair);
    px(ctx, hx - 9, hy + 2, 1, 2, shade(skin, -0.05)); // nose tip
    const eye = a.eyeColor;
    px(ctx, hx - 7, hy + 1, 3, 5, '#1c1622'); px(ctx, hx - 7, hy + 2, 3, 3, eye); px(ctx, hx - 6, hy + 2, 1, 1, '#ffffff');
    px(ctx, hx - 7, hy + 7, 2, 1, shade(skin, -0.3));
    px(ctx, hx + 1, hy, 2, 3, shade(skin, -0.1)); // ear
    px(ctx, hx, hy - 9, 4, 1, hairD);
  }
}

function drawBody(ctx: CanvasRenderingContext2D, look: CharacterLook, dir: Direction, p: Pose, by: number) {
  const { outfit, appearance } = look;
  const skin = appearance.skinTone;
  const slim = appearance.body === 'b';
  const sw = slim ? 13 : 15; // shoulder width
  const top = by + 32, waist = by + 44;
  const prim = outfit.primary, sec = outfit.secondary, acc = outfit.accent;
  const legColor = outfit.style === 'robe' ? prim : shade(sec, -0.35);
  const boot = '#4a3424';
  // Legs
  const legY = by + 46;
  if (outfit.style !== 'robe') {
    px(ctx, CX - 5, legY - p.legL, 4, 12, legColor); px(ctx, CX + 1, legY - p.legR, 4, 12, legColor);
    px(ctx, CX - 6, legY + 9 - p.legL, 5, 3, boot); px(ctx, CX + 1, legY + 9 - p.legR, 5, 3, boot);
  } else {
    px(ctx, CX - 6, legY + 10 - p.legL, 5, 2, boot); px(ctx, CX + 1, legY + 10 - p.legR, 5, 2, boot);
  }
  // Torso by style
  const x0 = CX - Math.floor(sw / 2);
  switch (outfit.style) {
    case 'robe':
      px(ctx, x0 - 1, top, sw + 2, 26 - Math.max(p.legL, p.legR), prim);
      px(ctx, x0 - 2, top + 16, sw + 4, 10 - Math.max(p.legL, p.legR), shade(prim, -0.15));
      if (dir === 'down') { px(ctx, CX - 1, top, 2, 24, acc); px(ctx, x0, top, sw, 2, acc); }
      px(ctx, x0, top + 9, sw, 2, sec);
      break;
    case 'plate':
      px(ctx, x0, top, sw, 13, prim);
      px(ctx, x0 - 2, top - 1, 5, 5, sec); px(ctx, x0 + sw - 3, top - 1, 5, 5, sec);
      if (dir === 'down') { px(ctx, CX - 3, top + 3, 6, 6, shade(prim, 0.2)); px(ctx, CX - 1, top + 4, 2, 4, acc); }
      px(ctx, x0, top + 12, sw, 2, acc);
      px(ctx, x0 + 1, top + 14, sw - 2, 3, shade(prim, -0.2));
      break;
    case 'hood':
      px(ctx, x0, top, sw, 15, prim);
      px(ctx, x0 - 1, top + 2, sw + 2, 13, shade(prim, -0.12));
      if (dir === 'down') { px(ctx, CX - 3, top, 6, 13, sec); px(ctx, CX - 1, top + 1, 2, 2, acc); }
      px(ctx, x0, top + 11, sw, 2, '#5a3a1e');
      break;
    case 'apron':
      px(ctx, x0, top, sw, 15, sec);
      if (dir !== 'up') px(ctx, x0 + 2, top + 3, sw - 4, 14, prim);
      px(ctx, x0, top + 9, sw, 1, shade(prim, -0.3));
      break;
    case 'coat':
      px(ctx, x0, top, sw, 17, prim);
      if (dir === 'down') { px(ctx, CX - 2, top, 4, 12, sec); px(ctx, CX - 3, top + 4, 1, 1, acc); px(ctx, CX - 3, top + 8, 1, 1, acc); }
      px(ctx, x0, top + 10, sw, 2, shade(prim, -0.3));
      break;
    default: // tunic
      px(ctx, x0, top, sw, 15, prim);
      px(ctx, x0, top + 9, sw, 2, sec);
      if (dir === 'down') px(ctx, CX - 2, top, 4, 3, acc);
  }
  void waist;
  // Arms
  const armColor = outfit.style === 'plate' ? sec : prim;
  if (p.armsUp) {
    px(ctx, x0 - 3, top - 8, 3, 10, armColor); px(ctx, x0 + sw, top - 8, 3, 10, armColor);
    px(ctx, x0 - 3, top - 10, 3, 3, skin); px(ctx, x0 + sw, top - 10, 3, 3, skin);
  } else if (dir === 'left' || dir === 'right') {
    px(ctx, CX - 2 - p.armL, top + 1, 4, 11, shade(armColor, -0.1));
    px(ctx, CX - 2 - p.armL, top + 11, 4, 3, skin);
  } else {
    px(ctx, x0 - 3, top + 1 + Math.max(0, p.armL), 3, 11, armColor); px(ctx, x0 + sw, top + 1 + Math.max(0, p.armR), 3, 11, armColor);
    px(ctx, x0 - 3, top + 11 + Math.max(0, p.armL), 3, 3, skin); px(ctx, x0 + sw, top + 11 + Math.max(0, p.armR), 3, 3, skin);
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
  drawBody(ctx, look, dir, p, by);
  drawHead(ctx, look.appearance, CX, by + 21, dir);
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

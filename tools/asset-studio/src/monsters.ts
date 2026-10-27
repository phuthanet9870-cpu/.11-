// Batch 001 monsters: Leaf Slime, Mushling, Horn Rabbit.
// 48×48 cells, 4 directions (down, left, right, up), baseline y=45.
// Side views are designed facing left and mirrored at the material level,
// so lighting stays upper-left on both sides.
import { Mat } from './mat';
import { Pixmap, Sheet, type RGBA } from './pixel';
import { R } from './palette';

export const MW = 48, MH = 48, MB = 45;
export type MView = 'down' | 'left' | 'right' | 'up';
export const MVIEWS: MView[] = ['down', 'left', 'right', 'up'];

export interface MonsterAnimDef { name: string; frames: number; frameMs: number; loop: boolean; events: { frame: number; event: string }[] }
export const MONSTER_ANIMS: MonsterAnimDef[] = [
  { name: 'idle', frames: 5, frameMs: 160, loop: true, events: [] },
  { name: 'walk', frames: 8, frameMs: 90, loop: true, events: [{ frame: 5, event: 'land' }] },
  { name: 'attack', frames: 6, frameMs: 75, loop: false, events: [{ frame: 2, event: 'impact' }] },
  { name: 'hit', frames: 3, frameMs: 90, loop: false, events: [] },
  { name: 'death', frames: 8, frameMs: 110, loop: false, events: [{ frame: 7, event: 'despawn' }] },
];

type Draw = (m: Mat, ctx: { view: MView; side: boolean }) => void;

function mirrorMat(m: Mat) {
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w / 2; x++) {
    const a = y * m.w + x, b = y * m.w + (m.w - 1 - x);
    const t = m.m[a]; m.m[a] = m.m[b]; m.m[b] = t;
  }
}

/** Part with its own line art; optional mirroring for the right-facing view. */
function part(dst: Pixmap, view: MView, draw: Draw) {
  const m = new Mat(MW, MH);
  draw(m, { view, side: view === 'left' || view === 'right' });
  if (view === 'right') mirrorMat(m);
  dst.blit(m.render(true), 0, 0);
}

/** Paint details (eyes etc.) in left-facing coordinates, mirrored for the right view. */
function paint(dst: Pixmap, view: MView, x: number, y: number, c: RGBA) {
  dst.set(view === 'right' ? MW - 1 - x : x, y, c);
}

function eye(dst: Pixmap, view: MView, x: number, y: number, state: 'open' | 'closed' | 'hurt' | 'x', big = false) {
  const o = R.eye.o, w: RGBA = [255, 255, 255, 255];
  if (state === 'closed') { paint(dst, view, x, y + 1, o); paint(dst, view, x + 1, y + 1, o); return; }
  if (state === 'hurt' || state === 'x') { paint(dst, view, x, y, o); paint(dst, view, x + 1, y + 1, o); paint(dst, view, x, y + 2, o); if (state === 'x') { paint(dst, view, x + 2, y, o); paint(dst, view, x + 2, y + 2, o); } return; }
  paint(dst, view, x, y, o); paint(dst, view, x + 1, y, o);
  paint(dst, view, x, y + 1, w); paint(dst, view, x + 1, y + 1, o);
  if (big) { paint(dst, view, x, y + 2, o); paint(dst, view, x + 1, y + 2, o); }
}

// ------------------------------------------------------------------ Leaf Slime
interface SlimePose { sx: number; sy: number; dy: number; dx: number; eyes: 'open' | 'closed' | 'hurt' | 'x'; melt: number; drops: number; sway: number }
function slimePose(anim: string, f: number): SlimePose {
  const P = (o: Partial<SlimePose>): SlimePose => ({ sx: 1, sy: 1, dy: 0, dx: 0, eyes: 'open', melt: 0, drops: 0, sway: 0, ...o });
  switch (anim) {
    case 'idle': return P({ sx: [1, 1.03, 1.06, 1.03, 1][f], sy: [1, 0.97, 0.94, 0.97, 1][f], sway: [0, 1, 1, 0, -1][f], eyes: f === 4 ? 'closed' : 'open' });
    case 'walk': return [
      P({ sx: 1.15, sy: 0.82 }), P({ sx: 0.9, sy: 1.15, dy: -2 }), P({ sx: 0.92, sy: 1.1, dy: -6 }), P({ sx: 0.95, sy: 1.05, dy: -8 }),
      P({ sx: 0.97, sy: 1.04, dy: -6 }), P({ sx: 1.18, sy: 0.8 }), P({ sx: 1.08, sy: 0.92 }), P({ sx: 1, sy: 1 }),
    ][f];
    case 'attack': return [
      P({ sx: 1.2, sy: 0.78, dx: 2 }), P({ sx: 1.25, sy: 0.72, dx: 3, eyes: 'closed' }), P({ sx: 0.8, sy: 1.2, dx: -7, dy: -3 }),
      P({ sx: 1.1, sy: 0.9, dx: -6 }), P({ sx: 1.05, sy: 0.95, dx: -3 }), P({ sx: 1, sy: 1, dx: -1 }),
    ][f];
    case 'hit': return [P({ sx: 1.25, sy: 0.75, dx: 3, eyes: 'hurt' }), P({ sx: 0.85, sy: 1.15, dx: 2, eyes: 'hurt' }), P({ sx: 1.05, sy: 0.95, dx: 1 })][f];
    case 'death': return [
      P({ sx: 1.2, sy: 0.72, eyes: 'x' }), P({ sx: 1.3, sy: 0.6, eyes: 'x', melt: 1 }), P({ sx: 1.38, sy: 0.48, eyes: 'x', melt: 2, drops: 1 }), P({ sx: 1.45, sy: 0.36, eyes: 'x', melt: 2, drops: 2 }),
      P({ sx: 1.5, sy: 0.26, eyes: 'closed', melt: 3, drops: 3 }), P({ sx: 1.5, sy: 0.18, melt: 3, drops: 4 }), P({ sx: 1.4, sy: 0.14, melt: 2, drops: 5 }), P({ sx: 1.25, sy: 0.12, melt: 1, drops: 0 }),
    ][f];
  }
  return P({});
}

function drawSlime(view: MView, anim: string, f: number): Pixmap {
  const pz = slimePose(anim, f);
  const out = new Pixmap(MW, MH);
  const side = view === 'left' || view === 'right';
  // Forward direction for dx: side = -x; front = +y (toward camera); back = -y.
  const fx = side ? pz.dx : 0, fy = 0; // front/back lunges read through squash & stretch, never below the baseline
  const rx = 13 * pz.sx, ry = 11 * pz.sy;
  const cx = 24 + fx, cy = MB - 0.5 - ry + pz.dy + fy;
  part(out, view, (m) => {
    const body = m.id(R.slime, { band2: true });
    m.ellipse(cx, cy, rx, ry, body);
    { const y0 = Math.round(cy + ry * 0.4); m.rect(Math.round(cx - rx * 0.8), y0, Math.round(rx * 1.6), Math.round(cy + ry) - y0, body); }
    if (pz.melt) m.ellipse(cx, MB - 2, Math.min(20, rx + pz.melt), 1.6, body);
    // jelly highlight (upper-left)
    const shine = m.id(R.slime, { tone: 'l' });
    if (pz.sy > 0.3) { m.ellipse(cx - rx * 0.45, cy - ry * 0.45, Math.max(1, rx * 0.18), Math.max(1, ry * 0.15), shine); }
  });
  // Leaf sprout on top (wilts when dying)
  if (pz.sy > 0.25) part(out, view, (m) => {
    const stem = m.id(R.bark), leaf = m.id(R.leaf);
    const top = Math.round(cy - ry);
    const wilt = pz.melt ? 3 : 0;
    m.line(cx, top, cx + (side ? 1 : 0), top - 3 + wilt, stem);
    m.ellipse(cx + 3 + wilt + pz.sway, top - 4 + wilt, 3.5, 1.8, leaf);
    if (!side || true) m.ellipse(cx - 3, top - 3 + wilt, 2.5, 1.4, leaf);
  });
  // Face
  if (view !== 'up' && pz.sy > 0.3) {
    const ey = Math.round(cy - 1);
    if (view === 'down') { eye(out, view, Math.round(cx - 6), ey, pz.eyes, true); eye(out, view, Math.round(cx + 4), ey, pz.eyes, true); out.set(Math.round(cx), ey + 4, R.slime.o); out.set(Math.round(cx) - 1, ey + 3, R.slime.o); out.set(Math.round(cx) + 1, ey + 3, R.slime.o); }
    else { eye(out, view, Math.round(cx - 9), ey, pz.eyes, true); eye(out, view, Math.round(cx - 3), ey, pz.eyes, true); paint(out, view, Math.round(cx - 6), ey + 4, R.slime.o); }
  }
  // Death droplets rise and fade
  if (pz.drops) for (let i = 0; i < 3; i++) {
    const x = 14 + i * 9, y = MB - 6 - pz.drops * 3 - i * 2;
    out.set(x, y, R.slime.l); out.set(x, y + 1, R.slime.b);
  }
  return out;
}

// ------------------------------------------------------------------ Mushling
interface MushPose { bob: number; tilt: number; lean: number; footA: number; footB: number; squash: number; eyes: 'open' | 'closed' | 'hurt' | 'x'; fall: number; sink: number }
function mushPose(anim: string, f: number): MushPose {
  const P = (o: Partial<MushPose>): MushPose => ({ bob: 0, tilt: 0, lean: 0, footA: 0, footB: 0, squash: 0, eyes: 'open', fall: 0, sink: 0, ...o });
  switch (anim) {
    case 'idle': return P({ bob: [0, -1, -1, 0, 0][f], squash: [0, 0, 1, 1, 0][f], tilt: [0, 0, 0, 1, -1][f], eyes: f === 4 ? 'closed' : 'open' });
    case 'walk': { const t = (f / 8) * Math.PI * 2; return P({ bob: Math.abs(Math.sin(t)) > 0.7 ? -1 : 0, tilt: Math.round(Math.sin(t) * 1.5), footA: Math.round(Math.cos(t) * 3), footB: -Math.round(Math.cos(t) * 3) }); }
    case 'attack': return [P({ lean: 2, squash: 2 }), P({ lean: 3, squash: 3, eyes: 'closed' }), P({ lean: -6, bob: -2, tilt: -2 }), P({ lean: -5, tilt: -1 }), P({ lean: -2, squash: 1 }), P({ lean: 0 })][f];
    case 'hit': return [P({ lean: 3, squash: 2, eyes: 'hurt' }), P({ lean: 2, squash: 1, eyes: 'hurt', tilt: 1 }), P({ lean: 1 })][f];
    case 'death': return [P({ lean: 2, eyes: 'x' }), P({ squash: 2, eyes: 'x', tilt: 1 }), P({ squash: 3, eyes: 'x', tilt: 2, sink: 2 }), P({ squash: 4, eyes: 'closed', tilt: 3, sink: 4 }), P({ fall: 1, sink: 5, eyes: 'closed' }), P({ fall: 2, sink: 6, eyes: 'closed' }), P({ fall: 3, sink: 7, eyes: 'closed' }), P({ fall: 3, sink: 8, eyes: 'closed' })][f];
  }
  return P({});
}

function drawMushling(view: MView, anim: string, f: number): Pixmap {
  const pz = mushPose(anim, f);
  const out = new Pixmap(MW, MH);
  const side = view === 'left' || view === 'right';
  const lean = side ? -pz.lean : 0;            // forward = -x in left-facing space
  const leanY = 0;
  const cx = 24 + lean * 0.5, base = MB + pz.bob;
  // feet
  part(out, view, (m) => {
    const foot = m.id(R.mush_stem);
    if (pz.fall < 2) {
      if (side) { m.ellipse(23 + pz.footA, MB - 2, 3, 2, foot); m.ellipse(26 + pz.footB, MB - 2, 3, 2, foot); }
      else { m.ellipse(19, MB - 2 - Math.max(0, pz.footA) * 0.5, 3, 2, foot); m.ellipse(29, MB - 2 - Math.max(0, pz.footB) * 0.5, 3, 2, foot); }
    }
  });
  // stem body
  part(out, view, (m) => {
    const stem = m.id(R.mush_stem, { band2: true });
    const h = 16 - pz.squash - pz.sink;
    if (h > 2) {
      m.ellipse(cx, base - 2 - h / 2 + leanY, 8 + pz.squash * 0.5, h / 2 + 2, stem);
    }
  });
  // cap
  part(out, view, (m) => {
    const cap = m.id(R.mush_cap, { band2: true }), spot = m.id(R.mush_stem, { tone: 'l' });
    const capY = base - 18 + pz.squash + pz.sink + leanY;
    const ccx = cx + lean * 0.5 + pz.tilt + pz.fall * 2;
    const ry = 7 - (pz.fall ? 1 : 0);
    m.ellipse(ccx, capY, 14, ry, cap);
    m.rect(Math.round(ccx - 14), Math.round(capY), 28, 3, cap);
    for (let i = Math.round(ccx - 14); i <= ccx + 14; i++) m.erase(i, Math.round(capY) + 3);
    // white spots
    const spots: [number, number, number][] = view === 'up' ? [[-6, -3, 2], [4, -4, 2.5], [0, 0, 1.6], [8, 0, 1.4]] : [[-7, -2, 2], [2, -4, 2.6], [8, -1, 1.6], [-2, 1, 1.4]];
    for (const [dx, dy, r] of spots) m.ellipse(ccx + dx, capY + dy, r, r * 0.8, spot);
  });
  // face on the stem
  if (view !== 'up' && pz.sink < 6) {
    const fy = Math.round(base - 11 + pz.squash * 0.5 + pz.sink * 0.5 + leanY);
    if (view === 'down') { eye(out, view, Math.round(cx - 5), fy, pz.eyes, true); eye(out, view, Math.round(cx + 3), fy, pz.eyes, true); out.rect(Math.round(cx) - 1, fy + 5, 3, 1, R.mush_stem.o); out.set(Math.round(cx) - 7, fy + 3, R.pink.b); out.set(Math.round(cx) + 7, fy + 3, R.pink.b); }
    else { eye(out, view, Math.round(cx - 7), fy, pz.eyes, true); paint(out, view, Math.round(cx - 8), fy + 5, R.mush_stem.o); paint(out, view, Math.round(cx - 7), fy + 5, R.mush_stem.o); }
  }
  return out;
}

// ------------------------------------------------------------------ Horn Rabbit
interface RabbitPose { head: number; dy: number; dx: number; stretch: number; ears: number; legs: 'sit' | 'push' | 'tuck' | 'land'; eyes: 'open' | 'closed' | 'hurt' | 'x'; lie: number }
function rabbitPose(anim: string, f: number): RabbitPose {
  const P = (o: Partial<RabbitPose>): RabbitPose => ({ head: 0, dy: 0, dx: 0, stretch: 0, ears: 0, legs: 'sit', eyes: 'open', lie: 0, ...o });
  switch (anim) {
    case 'idle': return P({ ears: [0, 1, 1, 0, -1][f], head: [0, 0, -1, -1, 0][f], eyes: f === 4 ? 'closed' : 'open' });
    case 'walk': return [
      P({ legs: 'sit' }), P({ legs: 'push', stretch: 2, dy: -1, dx: 1 }), P({ legs: 'tuck', stretch: 3, dy: -5, ears: -1 }), P({ legs: 'tuck', stretch: 2, dy: -7, dx: -1, ears: -1 }),
      P({ legs: 'tuck', stretch: 1, dy: -4, dx: -1, ears: -1 }), P({ legs: 'land', dy: -1, ears: 1 }), P({ legs: 'sit', ears: 1 }), P({ legs: 'sit', stretch: 1, head: 1 }),
    ][f];
    case 'attack': return [P({ dx: 2, legs: 'sit', ears: -1 }), P({ dx: 3, legs: 'sit', ears: -2, eyes: 'closed' }), P({ dx: -4, dy: -3, stretch: 3, legs: 'push', ears: -2 }), P({ dx: -5, dy: -1, stretch: 2, legs: 'land', ears: -1 }), P({ dx: -3, legs: 'sit', ears: 1 }), P({ dx: -1, legs: 'sit' })][f];
    case 'hit': return [P({ dx: 3, eyes: 'hurt', ears: 2 }), P({ dx: 4, eyes: 'hurt', ears: 1, stretch: 1 }), P({ dx: 1 })][f];
    case 'death': return [P({ dx: 3, eyes: 'x', ears: 2 }), P({ dx: 3, dy: -2, eyes: 'x', ears: 2, legs: 'push' }), P({ dx: 2, dy: -3, eyes: 'x', ears: 2, lie: 1 }), P({ dx: 1, dy: -1, eyes: 'x', lie: 2 }), P({ eyes: 'x', lie: 3, dy: 0 }), P({ eyes: 'x', lie: 3, dy: -1 }), P({ eyes: 'closed', lie: 3, dx: 1, head: -1 }), P({ eyes: 'closed', lie: 4, dx: 1 })][f];
  }
  return P({});
}

function drawRabbit(view: MView, anim: string, f: number): Pixmap {
  const pz = rabbitPose(anim, f);
  const out = new Pixmap(MW, MH);
  const side = view === 'left' || view === 'right';
  const dx = side ? pz.dx : 0;
  const dyFwd = 0;
  const lie = pz.lie; // 0..3 tips over onto its side
  const cy = MB + pz.dy + dyFwd;
  if (side) {
    const bx = 27 + dx; // body centre (facing left: head on the left)
    part(out, view, (m) => { // far legs + tail
      const fur = m.id(R.rabbit), tail = m.id(R.flower_white);
      if (lie < 3) m.ellipse(bx + 9, cy - 9 + lie * 2, 3, 3, tail);
      if (lie < 2) {
        if (pz.legs === 'push' || pz.legs === 'tuck') m.ellipse(bx + 8, cy - 3 + (pz.legs === 'tuck' ? -2 : 0), 5, 2, fur);
        else m.ellipse(bx + 5, cy - 3.5, 5, 3, fur);
      }
    });
    part(out, view, (m) => { // body
      const fur = m.id(R.rabbit, { band2: true });
      const bodyRx = 9 + pz.stretch, bodyRy = 7 - pz.stretch * 0.4;
      m.ellipse(bx, cy - 8 + Math.min(lie, 3) * 1.5, bodyRx, lie >= 4 ? 4 : lie >= 3 ? 5 : bodyRy, fur);
    });
    part(out, view, (m) => { // head, ears, front paw
      const fur = m.id(R.rabbit, { band2: true }), inner = m.id(R.pink, { tone: 'b' });
      const hx = bx - 10 - pz.stretch, hy = cy - 13 + pz.stretch * 0.5 + Math.min(lie, 3) * 3 + pz.head;
      m.ellipse(hx, hy, 6.5, 5.5, fur);
      if (lie < 3) {
        const ear = (x: number, tilt: number) => { m.limb(x, hy - 4, x + 2 + tilt + pz.ears, hy - 14 + Math.abs(pz.ears), 1.8, fur); };
        ear(hx + 1, 1); ear(hx + 4, 3);
        m.line(hx + 2, hy - 6, hx + 3 + pz.ears, hy - 12 + Math.abs(pz.ears), inner);
      }
      m.ellipse(hx + (pz.legs === 'tuck' ? -2 : 1), cy - 2, 2.5, 2, fur); // front paw
    });
    part(out, view, (m) => { // spiral horn
      const horn = m.id(R.horn);
      const hx = bx - 10 - pz.stretch, hy = cy - 13 + pz.stretch * 0.5 + Math.min(lie, 3) * 3 + pz.head;
      m.limb(hx - 3, hy - 4, hx - 7, hy - 9, 1.3, horn);
      m.set(hx - 8, hy - 10, horn);
    });
    const hx = Math.round(27 + dx - 10 - pz.stretch), hy = Math.round(cy - 13 + pz.stretch * 0.5 + Math.min(lie, 3) * 3 + pz.head);
    eye(out, view, hx - 4, hy - 1, pz.eyes);
    paint(out, view, hx - 6, hy + 2, R.pink.s);
    return out;
  }
  // Front / back
  const cx = 24;
  part(out, view, (m) => { // feet + body
    const fur = m.id(R.rabbit, { band2: true });
    m.ellipse(cx, cy - 9 + lie, 10 + Math.min(lie, 3), 8 - Math.min(lie, 3) - (lie >= 4 ? 1 : 0), fur);
    if (lie < 2) { m.ellipse(cx - 6, cy - 2, 3.5, 2, fur); m.ellipse(cx + 6, cy - 2, 3.5, 2, fur); }
    if (view === 'up' && lie < 3) m.ellipse(cx, cy - 6, 3.5, 3.5, m.id(R.flower_white));
  });
  part(out, view, (m) => { // head + ears
    const fur = m.id(R.rabbit, { band2: true }), inner = m.id(R.pink, { tone: 'b' });
    const hy = cy - 17 + Math.min(lie, 3) * 3 + pz.head + (pz.legs === 'tuck' ? 1 : 0);
    m.ellipse(cx, hy, 7.5, 6.5, fur);
    if (lie < 3) {
      m.limb(cx - 4, hy - 5, cx - 6 - pz.ears, hy - 15 + Math.abs(pz.ears), 2, fur);
      m.limb(cx + 4, hy - 5, cx + 6 + pz.ears, hy - 15 + Math.abs(pz.ears), 2, fur);
      if (view === 'down') { m.line(cx - 5, hy - 7, cx - 6 - pz.ears, hy - 13 + Math.abs(pz.ears), inner); m.line(cx + 5, hy - 7, cx + 6 + pz.ears, hy - 13 + Math.abs(pz.ears), inner); }
    }
  });
  if (view === 'down') {
    part(out, view, (m) => { const horn = m.id(R.horn); const hy = cy - 17 + Math.min(lie, 3) * 3 + pz.head + (pz.legs === 'tuck' ? 1 : 0); m.limb(cx, hy - 5, cx + 1, hy - 11, 1.3, horn); });
    const hy = Math.round(cy - 17 + Math.min(lie, 3) * 3 + pz.head + (pz.legs === 'tuck' ? 1 : 0));
    eye(out, view, cx - 5, hy, pz.eyes); eye(out, view, cx + 3, hy, pz.eyes);
    out.set(cx, hy + 3, R.pink.s); out.set(cx - 1, hy + 4, R.rabbit.o); out.set(cx + 1, hy + 4, R.rabbit.o);
  } else {
    part(out, view, (m) => { const horn = m.id(R.horn); const hy = cy - 17 + Math.min(lie, 3) * 3 + pz.head + (pz.legs === 'tuck' ? 1 : 0); m.limb(cx, hy - 5, cx + 1, hy - 11, 1.3, horn); });
  }
  return out;
}

// ------------------------------------------------------------------ registry
export const BATCH001_MONSTERS = [
  { id: 'leaf_slime', name: 'Leaf Slime', draw: drawSlime },
  { id: 'mushling', name: 'Mushling', draw: drawMushling },
  { id: 'horn_rabbit', name: 'Horn Rabbit', draw: drawRabbit },
] as const;

export function buildMonsterSheets(draw: (v: MView, anim: string, f: number) => Pixmap) {
  return MONSTER_ANIMS.map((def) => {
    const sheet = new Sheet(MW, MH, def.frames, 4);
    MVIEWS.forEach((v, row) => { for (let f = 0; f < def.frames; f++) sheet.put(f, row, draw(v, def.name, f)); });
    return { def, sheet };
  });
}

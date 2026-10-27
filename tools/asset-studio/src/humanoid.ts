// Humanoid rig for 48×64 anime-chibi characters (4 directions).
// Every frame is posed from joints, drawn part-by-part on material canvases
// (automatic upper-left cel shading + selective outline), and split into
// modular layers: hairBack, weaponUnder, body, hairFront, weaponOver.
import { Mat } from './mat';
import { Pixmap, type RGBA } from './pixel';
import { R, type Ramp } from './palette';

export const FW = 48, FH = 64, BASE_Y = 61, CX = 24;
export type View = 'down' | 'left' | 'right' | 'up';
export const VIEWS: View[] = ['down', 'left', 'right', 'up'];
export type HairStyle = 'short' | 'long' | 'spiky' | 'ponytail' | 'bob';
export const HAIR_STYLES: HairStyle[] = ['short', 'long', 'spiky', 'ponytail', 'bob'];
export type Eyes = 'open' | 'closed' | 'hurt' | 'happy';

type P = { x: number; y: number };
const p = (x: number, y: number): P => ({ x, y });

export interface Pose {
  bob: number;        // whole body vertical offset
  lean: number;       // upper body shift toward facing direction (side) / downwards (front)
  crouch: number;     // hips lowered, knees bend
  headDy: number;
  eyes: Eyes;
  // Feet: stride (forward +) and lift; side view uses stride, front uses lift.
  footN: { stride: number; lift: number };
  footF: { stride: number; lift: number };
  // Hands relative to the default hanging hand: forward +, up +.
  handN: { fwd: number; up: number };
  handF: { fwd: number; up: number };
  weaponAng: number;  // radians: 0 = blade pointing forward, -PI/2 = up, PI/2 = down
  weaponShow: boolean;
  shear?: number;     // death fall: lean whole body (pixels per row from the feet)
  lying?: boolean;
  bodyType?: 'a' | 'b';
}

export const POSE0: Pose = {
  bob: 0, lean: 0, crouch: 0, headDy: 0, eyes: 'open',
  footN: { stride: 0, lift: 0 }, footF: { stride: 0, lift: 0 },
  handN: { fwd: 0, up: 0 }, handF: { fwd: 0, up: 0 }, weaponAng: Math.PI * 0.35, weaponShow: true,
};

export interface Outfit {
  tunic: Ramp; pants: Ramp; boots: Ramp; belt: Ramp; buckle: Ramp; collar: Ramp; bag?: Ramp;
  sleeves: 'short' | 'long';
}

export interface LayerFrames { hairBack: Pixmap; weaponUnder: Pixmap; body: Pixmap; hairFront: Pixmap; weaponOver: Pixmap }
export interface FrameMeta { hand: P; weaponAngle: number; weaponOver: boolean; headTop: number; feet: number }

// ------------------------------------------------------------------ joints
interface Joints {
  hipN: P; hipF: P; kneeN: P; kneeF: P; footN: P; footF: P;
  shN: P; shF: P; elN: P; elF: P; handN: P; handF: P;
  head: P; neckY: number; hemY: number; torsoTopY: number; torsoShift: number;
}

/** Joint positions for a view. Side views are computed facing LEFT (forward = -x) and mirrored later. */
function joints(view: View, pose: Pose): Joints {
  const b = pose.bob + pose.crouch;
  const slim = pose.bodyType === 'b' ? 1 : 0;
  if (view === 'left' || view === 'right') {
    const fx = -1; // forward
    const hipY = 47 + b;
    const lean = pose.lean;
    const foot = (f: { stride: number; lift: number }, depth: number) => p(CX + depth + fx * f.stride, BASE_Y - 2 - f.lift);
    const footN = foot(pose.footN, -1), footF = foot(pose.footF, 1);
    const knee = (hip: P, ft: P, lift: number) => p((hip.x + ft.x) / 2 + fx * (1 + lift * 0.7 + pose.crouch * 0.5), (hip.y + ft.y) / 2 - lift * 0.3);
    const hipN = p(CX - 1, hipY), hipF = p(CX + 1, hipY);
    const shY = 35 + pose.bob + Math.round(pose.crouch * 0.9);
    const shN = p(CX - 1 + fx * lean, shY), shF = p(CX + 1 + fx * lean, shY);
    const hand = (sh: P, h: { fwd: number; up: number }) => p(sh.x + fx * h.fwd, sh.y + 9 - h.up);
    const handN = hand(shN, pose.handN), handF = hand(shF, pose.handF);
    const elbow = (sh: P, hd: P) => p((sh.x + hd.x) / 2 - fx * 1, (sh.y + hd.y) / 2 + 1);
    return {
      hipN, hipF, footN, footF, kneeN: knee(hipN, footN, pose.footN.lift), kneeF: knee(hipF, footF, pose.footF.lift),
      shN, shF, handN, handF, elN: elbow(shN, handN), elF: elbow(shF, handF),
      head: p(CX + fx * Math.round(lean * 0.8), 24 + pose.bob + Math.round(pose.crouch * 0.9) + pose.headDy),
      neckY: 32 + pose.bob, hemY: 48 + b, torsoTopY: 33 + pose.bob + Math.round(pose.crouch * 0.9), torsoShift: fx * lean,
    };
  }
  // Front / back. "N" = screen-left limb, "F" = screen-right limb.
  const hipY = 47 + b;
  const lean = view === 'down' ? pose.lean : -pose.lean; // leaning toward the camera reads as a downward shift
  const shY = 35 + pose.bob + Math.round(pose.crouch * 0.9) + Math.max(0, Math.round(lean * 0.5));
  const hipN = p(21, hipY), hipF = p(27, hipY);
  const footN = p(21 - Math.round(pose.crouch * 0.3), BASE_Y - 2 - pose.footN.lift);
  const footF = p(27 + Math.round(pose.crouch * 0.3), BASE_Y - 2 - pose.footF.lift);
  const knee = (hip: P, ft: P, out: number) => p((hip.x + ft.x) / 2 + out * pose.crouch * 0.4, (hip.y + ft.y) / 2);
  const shN = p(18 + slim, shY), shF = p(30 - slim, shY);
  const dir = view === 'down' ? 1 : -1;
  const hand = (sh: P, h: { fwd: number; up: number }, side: number) => p(sh.x + side * (1 - h.fwd * 0.25) - side * Math.max(0, h.up) * 0.15, sh.y + 9 - h.up + dir * h.fwd * 0.4);
  const handN = hand(shN, pose.handN, -1), handF = hand(shF, pose.handF, 1);
  const elbow = (sh: P, hd: P, side: number) => p((sh.x + hd.x) / 2 + side * 1, (sh.y + hd.y) / 2);
  return {
    hipN, hipF, footN, footF, kneeN: knee(hipN, footN, -1), kneeF: knee(hipF, footF, 1),
    shN, shF, handN, handF, elN: elbow(shN, handN, -1), elF: elbow(shF, handF, 1),
    head: p(CX, 24 + pose.bob + Math.round(pose.crouch * 0.9) + pose.headDy + Math.max(0, Math.round(lean * 0.4))),
    neckY: 32 + pose.bob, hemY: 48 + b, torsoTopY: 33 + pose.bob + Math.round(pose.crouch * 0.9), torsoShift: 0,
  };
}

// ------------------------------------------------------------------ helpers
function mirrorMat(m: Mat): void {
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w / 2; x++) {
    const a = y * m.w + x, b = y * m.w + (m.w - 1 - x);
    const t = m.m[a]; m.m[a] = m.m[b]; m.m[b] = t;
  }
}

/** Geometric transform applied to every part BEFORE shading, so light stays upper-left. */
export interface Xf { mirror: boolean; shear: number; shearDir: number; lie: number; lift?: number }
function xfPoint(xf: Xf, x: number, y: number): [number, number] {
  // Fall transforms work in the un-mirrored (left-facing) design space; mirroring is applied last.
  if (xf.shear) x = x + Math.round((BASE_Y - y) * xf.shear) * xf.shearDir;
  if (xf.lie) {
    // Lie down along the baseline: head toward +x (lie=1) or -x (lie=-1).
    const along = BASE_Y - y;               // 0 at the feet
    const across = x - 10;                  // 0..28 across the body
    x = xf.lie > 0 ? along + 2 : FW - 3 - along;
    y = BASE_Y - 28 + across - (xf.lift ?? 0);
  }
  if (xf.mirror) x = FW - 1 - x;
  return [x, y];
}

/** Draws one part on its own material canvas (own line art) and composites it. */
function part(dst: Pixmap, xf: Xf | boolean, draw: (m: Mat) => void) {
  const t: Xf = typeof xf === 'boolean' ? { mirror: xf, shear: 0, shearDir: 1, lie: 0 } : xf;
  const m = new Mat(FW, FH);
  draw(m);
  let out = m;
  if (t.mirror || t.shear || t.lie) {
    out = m.cloneEmpty();
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
      const id = m.at(x, y);
      if (!id) continue;
      const [nx, ny] = xfPoint(t, x, y);
      out.set(nx, ny, id);
    }
  }
  dst.blit(out.render(true), 0, 0);
}

const mx = (x: number, mirror: boolean) => (mirror ? FW - 1 - x : x);

// ------------------------------------------------------------------ body parts
function drawLeg(m: Mat, hip: P, knee: P, foot: P, pants: number, boots: number, side: boolean) {
  m.limb(hip.x, hip.y, knee.x, knee.y, 1.7, pants);
  m.limb(knee.x, knee.y, foot.x, foot.y - 1, 1.6, pants);
  // Boot: 4-5 px wide, toe points forward in side view.
  if (side) { m.rect(Math.round(foot.x) - 3, Math.round(foot.y) - 2, 5, 4, boots); m.rect(Math.round(foot.x) - 3, Math.round(foot.y) + 1, 6, 1, boots); }
  else { m.rect(Math.round(foot.x) - 2, Math.round(foot.y) - 2, 4, 4, boots); }
}

function drawArm(m: Mat, sh: P, el: P, hand: P, sleeve: number, skin: number, short: boolean) {
  m.limb(sh.x, sh.y, el.x, el.y, 1.6, sleeve);
  if (short) m.limb(el.x, el.y, hand.x, hand.y, 1.3, skin);
  else m.limb(el.x, el.y, hand.x, hand.y, 1.4, sleeve);
  m.ellipse(hand.x, hand.y + 0.5, 1.6, 1.6, skin);
}

function drawTorso(m: Mat, view: View, j: Joints, o: Outfit, ids: Record<string, number>, slim: boolean) {
  const top = j.torsoTopY, hem = j.hemY;
  if (view === 'left' || view === 'right') {
    const sx = j.torsoShift;
    m.poly([[CX - 4 + sx, top], [CX + 4 + sx, top], [CX + 5, hem], [CX - 6, hem]], ids.tunic);
    m.rect(CX - 5 + Math.round(sx / 2), hem - 6, 10, 2, ids.belt);
    m.rect(CX - 4 + sx, top, 5, 2, ids.collar);
    if (ids.bag) m.rect(CX + 2, hem - 6, 4, 5, ids.bag);
    return;
  }
  const w = slim ? 5 : 6;
  m.poly([[CX - w, top], [CX + w + 1, top], [CX + w + 2, hem], [CX - w - 1, hem]], ids.tunic);
  if (slim) { m.erase(CX - w - 1, hem - 7); m.erase(CX + w + 1, hem - 7); }
  m.rect(CX - w, hem - 6, w * 2 + 1, 2, ids.belt);
  if (view === 'down') {
    // V collar
    for (let i = 0; i < 3; i++) { m.set(CX - 1 - i, top + i, ids.collar); m.set(CX + 1 + i, top + i, ids.collar); }
    m.rect(CX - 1, top, 3, 1, ids.collar);
    if (ids.bag) { // satchel strap from left shoulder to right hip
      for (let i = 0; i < 10; i++) m.set(CX - 4 + i, top + 1 + i, ids.strap);
    }
  }
}

function drawHead(m: Mat, view: View, j: Joints, skin: number) {
  const h = j.head;
  if (view === 'left' || view === 'right') {
    m.ellipse(h.x, h.y, 7.6, 8, skin);
    m.rect(Math.round(h.x) - 9, Math.round(h.y) + 1, 2, 2, skin); // nose / cheek forward
    m.rect(Math.round(h.x) - 2, Math.round(h.y) + 6, 4, 3, skin); // neck/jaw
  } else {
    m.ellipse(h.x, h.y, 8.6, 8, skin);
    m.rect(Math.round(h.x) - 2, Math.round(h.y) + 7, 4, 2, skin);
  }
}

function drawFace(dst: Pixmap, view: View, j: Joints, eyes: Eyes, mirror: boolean, xf: Xf) {
  if (view === 'up') return;
  // Face details are painted in un-mirrored screen space; only fall/lie transforms apply.
  const t: Xf = { ...xf, mirror: false };
  const px = {
    set: (x: number, y: number, c: RGBA) => { const [a, b] = xfPoint(t, x, y); dst.set(a, b, c); },
    rect: (x: number, y: number, w: number, h: number, c: RGBA) => { for (let jj = 0; jj < h; jj++) for (let ii = 0; ii < w; ii++) px.set(x + ii, y + jj, c); },
  };
  const e = R.eye, s = R.skin;
  const hx = Math.round(j.head.x), hy = Math.round(j.head.y);
  const eye = (x: number, y: number) => {
    if (eyes === 'closed') { px.rect(x, y + 2, 3, 1, e.o); return; }
    if (eyes === 'happy') { px.set(x, y + 2, e.o); px.set(x + 1, y + 1, e.o); px.set(x + 2, y + 2, e.o); return; }
    if (eyes === 'hurt') { px.set(x, y + 1, e.o); px.set(x + 1, y + 2, e.o); px.set(x + 2, y + 1, e.o); px.set(x + 2, y + 3, e.o); px.set(x, y + 3, e.o); return; }
    px.rect(x, y, 3, 1, e.o);           // upper lash
    px.set(x, y + 1, e.l);              // highlight (upper-left light)
    px.set(x + 1, y + 1, e.b); px.set(x + 2, y + 1, e.s);
    px.set(x, y + 2, e.b); px.set(x + 1, y + 2, e.s); px.set(x + 2, y + 2, e.d);
    px.set(x + 1, y + 3, e.d);
  };
  if (view === 'down') {
    eye(hx - 6, hy + 1);
    eye(hx + 3, hy + 1);
    px.set(hx - 7, hy + 5, s.s); px.set(hx + 6, hy + 5, s.s); // blush
    px.rect(hx - 1, hy + 6, 2, 1, s.d); // mouth
  } else {
    const ex = mirror ? mx(hx - 7, true) - 2 : hx - 7;
    eye(ex, hy + 1);
    const mxp = mirror ? mx(hx - 6, true) - 1 : hx - 6;
    px.rect(mxp, hy + 6, 2, 1, s.d);
    px.set(mirror ? mx(hx - 5, true) : hx - 5, hy + 5, s.s);
  }
}

// ------------------------------------------------------------------ hair
function drawHair(m: Mat, view: View, j: Joints, style: HairStyle, hair: number, layer: 'back' | 'front') {
  const h = j.head;
  const x = h.x, y = h.y;
  const side = view === 'left' || view === 'right';
  if (layer === 'back') {
    if (style === 'long') {
      if (view === 'down') m.rect(x - 10, y - 2, 21, 20, hair);
      else if (view === 'up') return; // covered by the front layer in back view
      else m.poly([[x - 1, y - 4], [x + 9, y - 2], [x + 10, y + 17], [x + 1, y + 16]], hair);
    }
    if (style === 'ponytail' && side) m.poly([[x + 6, y - 4], [x + 10, y - 3], [x + 12, y + 12], [x + 8, y + 14]], hair);
    return;
  }
  // Cap sits high so the eyes stay visible (anime proportions).
  if (view === 'up') {
    m.ellipse(x, y - 2, 9.6, 9, hair);
    if (style === 'long') { m.rect(x - 7, y, 15, 15, hair); m.poly([[x - 7, y + 14], [x + 8, y + 14], [x + 5, y + 18], [x - 4, y + 18]], hair); }
    if (style === 'bob') m.rect(x - 9, y, 19, 7, hair);
    if (style === 'ponytail') { m.ellipse(x, y - 3, 2.5, 2.5, hair); m.limb(x, y, x + 1, y + 14, 2.2, hair); }
    if (style === 'short' || style === 'spiky') m.rect(x - 7, y + 2, 15, 4, hair);
  } else if (side) {
    m.ellipse(x + 1, y - 5, 8.8, 5.4, hair);
    m.rect(x + 1, y - 5, 8, 11, hair);           // back of the head
    m.poly([[x - 9, y - 6], [x - 1, y - 9], [x - 1, y - 2], [x - 4, y - 3], [x - 6, y - 1], [x - 8, y - 3]], hair); // fringe
    if (style === 'bob' || style === 'long') m.rect(x + 1, y + 2, 8, 6, hair);
    if (style === 'bob') m.rect(x - 2, y + 1, 3, 6, hair);
  } else {
    m.ellipse(x, y - 5, 9.8, 5.4, hair);
    // Fringe with three points; tips stop above the eyes.
    m.poly([[x - 10, y - 6], [x + 11, y - 6], [x + 10, y - 1], [x + 7, y - 3], [x + 4, y], [x + 1, y - 3], [x - 2, y], [x - 5, y - 3], [x - 8, y], [x - 10, y - 2]], hair);
    const lock = style === 'bob' || style === 'long' ? 11 : 7;
    m.rect(x - 10, y - 4, 3, lock, hair);
    m.rect(x + 8, y - 4, 3, lock, hair);
  }
  // Anime hair shine (upper-left light).
  const shine = m.id(R.hair, { tone: 'l' });
  if (view === 'up') { m.line(x - 6, y - 7, x - 2, y - 9, shine); m.set(x - 7, y - 6, shine); }
  else if (side) { m.line(x - 3, y - 8, x + 2, y - 9, shine); m.set(x + 3, y - 9, shine); }
  else { m.line(x - 7, y - 7, x - 3, y - 9, shine); m.line(x - 1, y - 9, x + 1, y - 9, shine); }
  if (style === 'spiky') {
    const tips: [number, number][] = side ? [[-6, -13], [-1, -14], [4, -13], [8, -10]] : [[-8, -11], [-4, -14], [0, -15], [4, -14], [8, -11]];
    for (const [dx, dy] of tips) m.poly([[x + dx - 2, y - 8], [x + dx + 2, y - 8], [x + dx + (side ? 1 : 0), y + dy]], hair);
  }
  if (style === 'ponytail' && view === 'down') m.ellipse(x + 8, y - 9, 2.4, 2.4, hair);
}

// ------------------------------------------------------------------ weapon
export function weaponSprite(kind: 'dagger'): Pixmap {
  // Drawn pointing right (angle 0), grip at the left: 14×5.
  const m = new Mat(12, 5);
  const steel = m.id(R.steel), wood = m.id(R.leather), brass = m.id(R.brass);
  void kind;
  m.rect(0, 2, 3, 2, wood);
  m.rect(3, 1, 1, 4, brass);
  m.rect(4, 1, 6, 3, steel);
  m.set(10, 2, steel);
  m.erase(9, 1);
  return m.render(true);
}

/** Blit a weapon rotated about its grip so that the grip sits in the hand. */
function drawWeapon(dst: Pixmap, w: Pixmap, hand: P, ang: number) {
  const size = 32;
  const big = new Pixmap(size, size);
  big.blit(w, size / 2 - 1, size / 2 - 2); // grip at the centre
  const r = big.rotated(ang, size);
  dst.blit(r, Math.round(hand.x - size / 2), Math.round(hand.y - size / 2));
}

// ------------------------------------------------------------------ frame
export interface CharacterSpec {
  outfit: Outfit;
  hair: HairStyle;
  weapon: Pixmap | null;
}

export function renderFrame(view: View, pose: Pose, spec: CharacterSpec): { layers: LayerFrames; meta: FrameMeta } {
  const side = view === 'left' || view === 'right';
  const mirror = view === 'right';
  const lift = pose.lying ? pose.bob : 0;
  if (pose.lying) pose = { ...pose, bob: 0 };
  const j = joints(view, pose);
  const fallDir = side ? -1 : 1; // side views fall forward (design space faces left)
  const xf: Xf = { mirror, shear: pose.shear ?? 0, shearDir: fallDir, lie: pose.lying ? fallDir : 0, lift };
  const xf0: Xf = { ...xf, mirror: false };
  const o = spec.outfit;
  const slim = pose.bodyType === 'b';
  const L: LayerFrames = {
    hairBack: new Pixmap(FW, FH), weaponUnder: new Pixmap(FW, FH), body: new Pixmap(FW, FH),
    hairFront: new Pixmap(FW, FH), weaponOver: new Pixmap(FW, FH),
  };
  const ids = (m: Mat) => ({
    skin: m.id(R.skin), pants: m.id(o.pants), boots: m.id(o.boots), tunic: m.id(o.tunic, {}), belt: m.id(o.belt),
    collar: m.id(o.collar), bag: o.bag ? m.id(o.bag) : 0, strap: m.id(o.belt), hair: m.id(R.hair),
  });

  // Hair behind the body
  part(L.hairBack, xf, (m) => drawHair(m, view, j, spec.hair, ids(m).hair, 'back'));

  const body = L.body;
  if (side) {
    // far limbs (behind torso)
    part(body, xf, (m) => { const k = ids(m); drawArm(m, j.shF, j.elF, j.handF, k.tunic, k.skin, o.sleeves === 'short'); });
    part(body, xf, (m) => { const k = ids(m); drawLeg(m, j.hipF, j.kneeF, j.footF, k.pants, k.boots, true); });
    part(body, xf, (m) => { const k = ids(m); drawLeg(m, j.hipN, j.kneeN, j.footN, k.pants, k.boots, true); });
    part(body, xf, (m) => drawTorso(m, view, j, o, ids(m), slim));
    part(body, xf, (m) => drawHead(m, view, j, ids(m).skin));
    drawFace(body, view, j, pose.eyes, mirror, xf);
    part(body, xf, (m) => { const k = ids(m); drawArm(m, j.shN, j.elN, j.handN, k.tunic, k.skin, o.sleeves === 'short'); });
  } else {
    part(body, xf0, (m) => { const k = ids(m); drawLeg(m, j.hipN, j.kneeN, j.footN, k.pants, k.boots, false); });
    part(body, xf0, (m) => { const k = ids(m); drawLeg(m, j.hipF, j.kneeF, j.footF, k.pants, k.boots, false); });
    if (view === 'up' && o.bag) part(body, xf0, (m) => m.rect(CX - 4, j.hemY - 13, 9, 7, m.id(o.bag!)));
    part(body, xf0, (m) => drawTorso(m, view, j, o, ids(m), slim));
    if (view === 'up' && o.bag) part(body, xf0, (m) => { m.rect(CX - 4, j.torsoTopY + 3, 9, 6, m.id(o.bag!)); m.rect(CX - 3, j.torsoTopY + 3, 7, 1, m.id(o.belt)); });
    part(body, xf0, (m) => drawHead(m, view, j, ids(m).skin));
    drawFace(body, view, j, pose.eyes, false, xf0);
    part(body, xf0, (m) => { const k = ids(m); drawArm(m, j.shN, j.elN, j.handN, k.tunic, k.skin, o.sleeves === 'short'); });
    part(body, xf0, (m) => { const k = ids(m); drawArm(m, j.shF, j.elF, j.handF, k.tunic, k.skin, o.sleeves === 'short'); });
    if (view === 'down') {
      const put = (x: number, y: number, c: RGBA) => { const [a, b] = xfPoint(xf0, x, y); body.set(a, b, c); };
      put(CX, j.hemY - 6, o.buckle.l); put(CX + 1, j.hemY - 6, o.buckle.b); put(CX, j.hemY - 5, o.buckle.s); put(CX + 1, j.hemY - 5, o.buckle.d);
    }
  }

  part(L.hairFront, xf, (m) => drawHair(m, view, j, spec.hair, ids(m).hair, 'front'));

  // Weapon in the near hand (side) / screen-left hand (front) / screen-right hand (back).
  const handRaw = side ? j.handN : view === 'down' ? j.handN : j.handF;
  const [hx2, hy2] = xfPoint(xf, handRaw.x, handRaw.y);
  const hand = p(hx2, hy2);
  // Convert pose angle (0 = forward) to screen angle.
  let ang = pose.weaponAng;
  if (view === 'left') ang = Math.PI - ang;
  else if (view === 'down') ang = Math.PI / 2 + (ang - Math.PI / 2) * 0.6 + 0.35;
  else if (view === 'up') ang = -Math.PI / 2 - (ang - Math.PI / 2) * 0.6 - 0.35;
  const over = view !== 'up';
  if (spec.weapon && pose.weaponShow) drawWeapon(over ? L.weaponOver : L.weaponUnder, spec.weapon, hand, ang);

  const meta: FrameMeta = { hand: { x: Math.round(hand.x), y: Math.round(hand.y) }, weaponAngle: +ang.toFixed(3), weaponOver: over, headTop: Math.round(j.head.y - 12), feet: BASE_Y };
  return { layers: L, meta };
}

/** Composite layers in draw order. */
export function composite(l: LayerFrames): Pixmap {
  const out = new Pixmap(FW, FH);
  for (const k of ['hairBack', 'weaponUnder', 'body', 'hairFront', 'weaponOver'] as const) out.blit(l[k], 0, 0);
  return out;
}

export const HAIR_KEY: Ramp = R.hair;
export const SKIN_KEY: Ramp = R.skin;
export const EYE_KEY: Ramp = R.eye;
export type { RGBA };

// Playback of the skill effect recipes (vfxRecipes.ts) with the animated sheets (vfxArt.ts).
import Phaser from 'phaser';
import type { SkillDef } from '../../core/types';
import { VFX_SHEETS } from './vfxArt';
import { skillVfx, type VfxStep } from './vfxRecipes';
import { drawSignatureSheet, GROUND_MOTIFS, SIG_FPS, SIG_FRAMES, SIG_H, SIG_W, SIGNATURES } from './vfxSignature';

export { skillVfx, SKILL_VFX_IDS } from './vfxRecipes';

// ------------------------------------------------------------------ playback
/** Sheets drawn standing on the ground (anchored at their bottom edge). */
const GROUNDED = new Set(['pillar', 'bolt', 'tornado', 'spikes', 'rise', 'aura', 'tendrils', 'cloud', 'notes', 'flame', 'holycross']);
const FLAT = new Set(['ring', 'circle', 'whirl']);

const baseCanvas = new Map<string, HTMLCanvasElement>();
function drawBase(name: string): HTMLCanvasElement {
  let canvas = baseCanvas.get(name);
  if (canvas) return canvas;
  const sh = VFX_SHEETS[name];
  canvas = document.createElement('canvas');
  canvas.width = sh.w * sh.frames; canvas.height = sh.h;
  const c = canvas.getContext('2d')!;
  for (let f = 0; f < sh.frames; f++) {
    c.save(); c.beginPath(); c.rect(f * sh.w, 0, sh.w, sh.h); c.clip(); c.translate(f * sh.w, 0);
    sh.draw(c, sh.frames > 1 ? f / (sh.frames - 1) : 0, f, sh.w, sh.h);
    c.restore();
  }
  baseCanvas.set(name, canvas);
  return canvas;
}

const rgbOf = (hex: string): [number, number, number] => { const n = parseInt(hex.replace('#', '').slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
/**
 * Recolours a white/grey sheet with a three-step ramp of the skill colour: deep shade in the dim
 * edges, the full colour in the body and a white-hot core where the sheet is brightest and solid.
 */
function recolour(src: HTMLCanvasElement, hex: string): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = src.width; out.height = src.height;
  const c = out.getContext('2d')!;
  c.drawImage(src, 0, 0);
  const img = c.getImageData(0, 0, out.width, out.height), d = img.data;
  const [r, g, b] = rgbOf(hex);
  // Pale colours still get a saturated body so they do not read as plain white.
  const mx = Math.max(r, g, b, 1), sat = (v: number) => Math.round((v / mx) * 255 * 0.55 + v * 0.45);
  const body: [number, number, number] = [sat(r), sat(g), sat(b)], deep: [number, number, number] = [body[0] * 0.45, body[1] * 0.45, body[2] * 0.45];
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (!a) continue;
    const L = (d[i] + d[i + 1] + d[i + 2]) / 765;
    let o: [number, number, number];
    if (L > 0.97 && a > 150) { const k = Math.min(1, (a - 150) / 105); o = [body[0] + (255 - body[0]) * k * 0.85, body[1] + (255 - body[1]) * k * 0.85, body[2] + (255 - body[2]) * k * 0.85]; }
    else if (L > 0.7) { const k = (L - 0.7) / 0.3; o = [deep[0] + (body[0] - deep[0]) * (0.6 + k * 0.4), deep[1] + (body[1] - deep[1]) * (0.6 + k * 0.4), deep[2] + (body[2] - deep[2]) * (0.6 + k * 0.4)]; }
    else { const k = L / 0.7; o = [deep[0] + (body[0] - deep[0]) * k * 0.6, deep[1] + (body[1] - deep[1]) * k * 0.6, deep[2] + (body[2] - deep[2]) * k * 0.6]; }
    d[i] = o[0]; d[i + 1] = o[1]; d[i + 2] = o[2];
  }
  c.putImageData(img, 0, 0);
  return out;
}

/** Texture + animation of a sheet in a colour (made on first use and kept). Returns the anim key. */
function sheetAnim(scene: Phaser.Scene, name: string, color?: string): string {
  const sh = VFX_SHEETS[name];
  const col = sh.tinted ? (color && /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : '#ffffff') : '';
  const key = `vxt_${name}${col ? `_${col.slice(1)}` : ''}`;
  if (!scene.textures.exists(key)) {
    const base = drawBase(name);
    const tex = scene.textures.addCanvas(key, col ? recolour(base, col) : base)!;
    for (let f = 0; f < sh.frames; f++) tex.add(f, 0, f * sh.w, 0, sh.w, sh.h);
  }
  if (!scene.anims.exists(key)) scene.anims.create({ key, frames: Array.from({ length: sh.frames }, (_, f) => ({ key, frame: f })), frameRate: sh.fps, repeat: sh.loop ? -1 : 0 });
  return key;
}

/** Particle textures of the effects (soft dot, four-point spark, big soft glow, shard). */
export function ensureVfxSheets(scene: Phaser.Scene) {
  const make = (key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) => {
    if (scene.textures.exists(key)) return;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d')!); scene.textures.addCanvas(key, cv);
  };
  const soft = (c: CanvasRenderingContext2D, r: number) => { const g = c.createRadialGradient(r, r, 0, r, r, r); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, r * 2, r * 2); };
  make('vxp_dot', 8, 8, (c) => soft(c, 4));
  make('vxp_glow', 64, 64, (c) => soft(c, 32));
  make('vxp_spark', 12, 12, (c) => { c.fillStyle = '#fff'; c.fillRect(5, 0, 2, 12); c.fillRect(0, 5, 12, 2); c.fillRect(4, 4, 4, 4); });
  make('vxp_shard', 6, 10, (c) => { c.fillStyle = '#fff'; c.beginPath(); c.moveTo(3, 0); c.lineTo(6, 5); c.lineTo(3, 10); c.lineTo(0, 5); c.closePath(); c.fill(); });
  make('vxp_smoke', 24, 24, (c) => { const g = c.createRadialGradient(12, 12, 0, 12, 12, 12); g.addColorStop(0, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 24, 24); });
}

const tintOf = (hex?: string) => (hex && /^#[0-9a-f]{6}$/i.test(hex) ? Phaser.Display.Color.HexStringToColor(hex).color : 0xffffff);
const lighten = (hex: string, k: number) => { const [r, g, b] = rgbOf(hex); return ((r + (255 - r) * k) << 16) | ((g + (255 - g) * k) << 8) | (b + (255 - b) * k); };

/** Particle burst: colour ramp from white-hot to the skill colour, additive. */
function particles(scene: Phaser.Scene, x: number, y: number, color: string, o: { tex?: string; n: number; speed: [number, number]; life: number; scale?: [number, number]; gravityY?: number; angle?: [number, number]; spread?: number; depth: number; add?: boolean }) {
  const col = /^#[0-9a-f]{6}$/i.test(color) ? color : '#ffffff';
  const em = scene.add.particles(x, y, o.tex ?? 'vxp_dot', {
    speed: { min: o.speed[0], max: o.speed[1] }, angle: o.angle ? { min: o.angle[0], max: o.angle[1] } : { min: 0, max: 360 },
    lifespan: { min: o.life * 0.6, max: o.life }, scale: { start: o.scale?.[0] ?? 0.8, end: o.scale?.[1] ?? 0 }, alpha: { start: 1, end: 0 },
    gravityY: o.gravityY ?? 0, tint: [0xffffff, lighten(col, 0.5), tintOf(col), tintOf(col)], rotate: o.tex === 'vxp_shard' ? { min: 0, max: 360 } : 0,
    blendMode: o.add === false ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD, emitting: false,
    ...(o.spread ? { emitZone: { type: 'random', source: new Phaser.Geom.Circle(0, 0, o.spread) } as never } : {}),
  });
  em.setDepth(o.depth);
  em.explode(o.n);
  scene.time.delayedCall(o.life + 120, () => em.destroy());
}

/** A soft light flash. */
function flash(scene: Phaser.Scene, x: number, y: number, color: string, size: number, ms: number, depth: number) {
  const g = scene.add.image(x, y, 'vxp_glow').setBlendMode(Phaser.BlendModes.ADD).setTint(lighten(/^#[0-9a-f]{6}$/i.test(color) ? color : '#ffffff', 0.3)).setScale(size / 64).setDepth(depth).setAlpha(0.9);
  scene.tweens.add({ targets: g, alpha: 0, scale: (size * 1.4) / 64, duration: ms, ease: 'Quad.easeOut', onComplete: () => g.destroy() });
}

/** Dark mark left on the ground by explosions and strikes. */
function scorch(scene: Phaser.Scene, x: number, y: number, size: number) {
  const g = scene.add.ellipse(x, y, size, size * 0.45, 0x0a0806, 0.45).setDepth(y - 45);
  scene.tweens.add({ targets: g, alpha: 0, delay: 900, duration: 1200, onComplete: () => g.destroy() });
}

/** Extra layers that make each sheet richer: particles, flashes, debris, ground marks. */
function extras(scene: Phaser.Scene, name: string, x: number, y: number, color: string, sc: number) {
  const d = y + 2001, n = (k: number) => Math.max(2, Math.round(k * sc));
  switch (name) {
    case 'slash': case 'cross': case 'claw':
      particles(scene, x, y, color, { tex: 'vxp_spark', n: n(10), speed: [60, 180], life: 380, scale: [0.6, 0], depth: d });
      flash(scene, x, y, color, 46 * sc, 180, d); break;
    case 'hit': particles(scene, x, y, color, { tex: 'vxp_spark', n: n(5), speed: [50, 130], life: 260, scale: [0.45, 0], depth: d }); break;
    case 'burst': case 'crit':
      particles(scene, x, y, color, { tex: 'vxp_spark', n: n(name === 'crit' ? 22 : 12), speed: [90, 240], life: 420, scale: [0.7, 0], depth: d });
      flash(scene, x, y, color, (name === 'crit' ? 110 : 70) * sc, 260, d); break;
    case 'fist':
      particles(scene, x, y + 14, '#c8b49a', { tex: 'vxp_smoke', n: n(8), speed: [40, 110], life: 600, scale: [1, 1.8], angle: [150, 390], depth: d - 1, add: false });
      flash(scene, x, y, color, 90 * sc, 260, d); break;
    case 'explode':
      particles(scene, x, y, '#ffb040', { n: n(28), speed: [80, 260], life: 700, scale: [0.9, 0], gravityY: 160, depth: d });
      particles(scene, x, y - 6, '#4a3c34', { tex: 'vxp_smoke', n: n(10), speed: [20, 70], life: 1100, scale: [1.2, 2.6], gravityY: -40, depth: d - 1, add: false });
      flash(scene, x, y, '#ffa040', 160 * sc, 380, d); scorch(scene, x, y + 14 * sc, 54 * sc); break;
    case 'bolt':
      particles(scene, x, y, color, { tex: 'vxp_spark', n: n(16), speed: [80, 220], life: 380, scale: [0.6, 0], angle: [180, 360], depth: d });
      flash(scene, x, y - 40, color, 150 * sc, 220, d); scorch(scene, x, y, 36 * sc); break;
    case 'spikes':
      particles(scene, x, y - 6, color, { tex: 'vxp_shard', n: n(14), speed: [70, 190], life: 650, scale: [1, 0.2], angle: [200, 340], gravityY: 380, depth: d });
      particles(scene, x, y, '#9a8a78', { tex: 'vxp_smoke', n: n(6), speed: [20, 60], life: 800, scale: [1, 2], depth: d - 1, add: false }); break;
    case 'pillar': case 'holycross':
      particles(scene, x, y - 20, color, { n: n(18), speed: [10, 40], life: 1100, scale: [0.7, 0], gravityY: -120, spread: 18, depth: d });
      flash(scene, x, y - 30, color, 120 * sc, 500, d); break;
    case 'tornado':
      particles(scene, x, y - 30, color, { n: n(24), speed: [40, 120], life: 900, scale: [0.6, 0], gravityY: -90, spread: 24, depth: d }); break;
    case 'flame':
      particles(scene, x, y - 10, '#ff8a2a', { n: n(16), speed: [20, 70], life: 800, scale: [0.7, 0], gravityY: -140, spread: 14, depth: d }); break;
    case 'cloud':
      particles(scene, x, y - 14, color, { tex: 'vxp_smoke', n: n(10), speed: [10, 40], life: 1300, scale: [0.8, 2], gravityY: -30, spread: 30, depth: d, add: false }); break;
    case 'tendrils':
      particles(scene, x, y - 10, color, { tex: 'vxp_smoke', n: n(10), speed: [10, 50], life: 1000, scale: [0.8, 1.8], gravityY: -60, spread: 26, depth: d, add: false });
      particles(scene, x, y - 20, color, { n: n(10), speed: [10, 40], life: 900, scale: [0.5, 0], gravityY: -80, spread: 30, depth: d }); break;
    case 'rise': case 'notes':
      particles(scene, x, y - 10, color, { n: n(14), speed: [5, 25], life: 1200, scale: [0.6, 0], gravityY: -70, spread: 22, depth: d }); break;
    case 'aura':
      particles(scene, x, y - 16, color, { n: n(20), speed: [10, 40], life: 900, scale: [0.6, 0], gravityY: -150, spread: 20, depth: d }); break;
    case 'shield':
      particles(scene, x, y, color, { tex: 'vxp_spark', n: n(10), speed: [5, 20], life: 900, scale: [0.4, 0], spread: 30, depth: d }); flash(scene, x, y, color, 80 * sc, 400, d); break;
    case 'ring':
      particles(scene, x, y, '#b8a890', { tex: 'vxp_smoke', n: n(10), speed: [60, 140], life: 600, scale: [0.8, 1.6], depth: y - 39, add: false }); break;
    case 'whirl':
      particles(scene, x, y, color, { tex: 'vxp_spark', n: n(18), speed: [120, 260], life: 420, scale: [0.6, 0], depth: d }); break;
    case 'pierce':
      flash(scene, x, y, color, 60 * sc, 200, d); break;
    case 'smoke':
      particles(scene, x, y, color, { tex: 'vxp_smoke', n: n(8), speed: [20, 60], life: 900, scale: [1, 2.2], depth: d, add: false }); break;
    case 'coins':
      particles(scene, x, y, '#ffd34d', { tex: 'vxp_spark', n: n(12), speed: [40, 120], life: 700, scale: [0.5, 0], gravityY: 120, depth: d }); break;
    case 'wind':
      particles(scene, x, y, color, { n: n(12), speed: [80, 180], life: 500, scale: [0.4, 0], angle: [-20, 20], depth: d }); break;
    case 'circle':
      particles(scene, x, y, color, { n: n(16), speed: [5, 20], life: 1200, scale: [0.5, 0], gravityY: -60, spread: 48, depth: d }); break;
  }
}

/** Plays one sheet at a point; looping sheets stay `ms` and fade out. */
export function playSheet(scene: Phaser.Scene, name: string, x: number, y: number, o: { color?: string; scale?: number; rot?: number; under?: boolean; ms?: number; delay?: number; plain?: boolean } = {}) {
  const sh = VFX_SHEETS[name];
  if (!sh) return;
  const go = () => {
    if (!scene.sys.isActive()) return;
    const anim = sheetAnim(scene, name, o.color);
    const sc = o.scale ?? 1;
    const spr = scene.add.sprite(x, y, anim, 0).setBlendMode(Phaser.BlendModes.ADD).setScale(sc);
    if (GROUNDED.has(name)) spr.setOrigin(0.5, 0.92);
    if (o.rot !== undefined) spr.setRotation(o.rot);
    spr.setDepth(o.under ? y - 40 : y + 2000);
    spr.play(anim);
    if (sh.loop) {
      if (name === 'circle') { spr.setScale(sc * 0.2); scene.tweens.add({ targets: spr, scale: sc, duration: 220, ease: 'Back.easeOut' }); }
      scene.tweens.add({ targets: spr, alpha: 0, delay: Math.max(0, (o.ms ?? 900) - 300), duration: 300, onComplete: () => spr.destroy() });
    } else spr.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => spr.destroy());
    if (!o.plain) extras(scene, name, x, y, o.color ?? '#ffffff', sc);
  };
  if (o.delay) scene.time.delayedCall(o.delay, go); else go();
}

/** Points where a step's copies play. */
function placements(st: VfxStep, from: { x: number; y: number }, to: { x: number; y: number }, radius: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const ang = Math.atan2(to.y - from.y, to.x - from.x);
  for (let i = 0; i < st.n; i++) {
    switch (st.at) {
      case 'self': out.push({ ...from }); break;
      case 'target': out.push({ ...to }); break;
      case 'area': {
        const centre = st.n > 1 || radius ? to : from;
        if (st.n === 1) { out.push({ ...centre }); break; }
        const a = (i / st.n) * Math.PI * 2 + i * 0.7, r = radius * (0.35 + ((i * 37) % 10) / 15);
        out.push({ x: centre.x + Math.cos(a) * r, y: centre.y + Math.sin(a) * r * 0.6 });
        break;
      }
      case 'line': { const k = (i + 1) / (st.n + 1), len = Math.max(48, Math.hypot(to.x - from.x, to.y - from.y)); out.push({ x: from.x + Math.cos(ang) * len * k, y: from.y + Math.sin(ang) * len * k }); break; }
      case 'row': { const off = (i - (st.n - 1) / 2) * 26; out.push({ x: to.x - Math.sin(ang) * off, y: to.y + Math.cos(ang) * off * 0.7 }); break; }
    }
  }
  return out;
}

/** Glowing particle trail behind a moving sprite; call the returned function to stop it. */
function trail(scene: Phaser.Scene, target: Phaser.GameObjects.Sprite, color: string, size: number, depth: number): () => void {
  const col = /^#[0-9a-f]{6}$/i.test(color) ? color : '#ffffff';
  const em = scene.add.particles(0, 0, 'vxp_dot', {
    speed: { min: 0, max: 12 }, lifespan: 320, scale: { start: size, end: 0 }, alpha: { start: 0.9, end: 0 },
    tint: [0xffffff, lighten(col, 0.4), tintOf(col)], blendMode: Phaser.BlendModes.ADD, frequency: 16, quantity: 2,
  });
  em.setDepth(depth); em.startFollow(target);
  return () => { em.stop(); scene.time.delayedCall(360, () => em.destroy()); };
}

/** Casting flourish: gathering motes on the caster; ultimates also dim the screen and open a big circle. */
function castFlourish(scene: Phaser.Scene, kind: string, at: { x: number; y: number }, color: string) {
  const col = /^#[0-9a-f]{6}$/i.test(color) ? color : '#ffffff';
  const em = scene.add.particles(at.x, at.y - 20, 'vxp_dot', {
    emitZone: { type: 'edge', source: new Phaser.Geom.Circle(0, 0, kind === 'ultimate' ? 46 : 30), quantity: 18 } as never,
    moveToX: at.x, moveToY: at.y - 20, lifespan: 360, scale: { start: 0.2, end: 0.7 }, alpha: { start: 0, end: 1 },
    tint: [0xffffff, tintOf(col)], blendMode: Phaser.BlendModes.ADD, emitting: false,
  });
  em.setDepth(at.y + 2001); em.explode(kind === 'ultimate' ? 26 : 12);
  scene.time.delayedCall(450, () => em.destroy());
  if (kind !== 'ultimate') return;
  const cam = scene.cameras.main;
  const dim = scene.add.rectangle(cam.worldView.centerX, cam.worldView.centerY, cam.worldView.width + 40, cam.worldView.height + 40, 0x05040a, 0).setDepth(at.y - 60);
  scene.tweens.add({ targets: dim, fillAlpha: 0.38, duration: 160, yoyo: true, hold: 700, onComplete: () => dim.destroy() });
  playSheet(scene, 'circle', at.x, at.y, { color: col, scale: 1.4, under: true, ms: 1300, plain: true });
  playSheet(scene, 'pillar', at.x, at.y, { color: col, scale: 0.7, plain: true });
  flash(scene, at.x, at.y - 24, col, 140, 500, at.y + 2002);
}

function runSteps(scene: Phaser.Scene, list: VfxStep[], from: { x: number; y: number }, to: { x: number; y: number }, radius: number, color: string, delay: number) {
  const ang = Math.atan2(to.y - from.y, to.x - from.x);
  for (const st of list) {
    const pts = placements(st, from, to, radius);
    pts.forEach((pt, i) => {
      const d = delay + st.d + i * st.stag, col = st.c ?? color;
      const lift = GROUNDED.has(st.s) || FLAT.has(st.s) ? 0 : -18;
      if (st.fall) {
        scene.time.delayedCall(d, () => {
          if (!scene.sys.isActive()) return;
          const anim = sheetAnim(scene, st.s, col);
          const spr = scene.add.sprite(pt.x - 70, pt.y - 220, anim, 0).setBlendMode(Phaser.BlendModes.ADD).setScale(st.sc).setDepth(pt.y + 2100);
          spr.setRotation(Math.atan2(220, 70) - (st.s === 'meteor' ? Math.PI / 4 : 0)).play(anim);
          const tr = trail(scene, spr, st.s === 'meteor' ? '#ff8a2a' : col, st.s === 'meteor' ? 1.4 : 0.6, pt.y + 2099);
          scene.tweens.add({ targets: spr, x: pt.x, y: pt.y, duration: st.s === 'meteor' ? 380 : 220, ease: 'Quad.easeIn', onComplete: () => {
            spr.destroy(); tr();
            if (st.then) playSheet(scene, st.then, pt.x, pt.y + (GROUNDED.has(st.then) || FLAT.has(st.then) ? 0 : -12), { color: col, scale: st.s === 'meteor' ? 0.8 : 0.7 });
          } });
        });
        return;
      }
      playSheet(scene, st.s, pt.x, pt.y + lift, { color: col, scale: st.sc, under: st.under || st.s === 'circle', ms: st.ms, delay: d, rot: st.rot ? ang : undefined });
    });
  }
}

const hashId = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

/** Plays the skill's own signature animation (vfxSignature.ts) at a point. */
export function playSignature(scene: Phaser.Scene, skill: { id: string; icon?: { color?: string; glyph?: string } }, x: number, y: number, delay = 0): boolean {
  const sig = SIGNATURES[skill.id];
  if (!sig) return false;
  const key = `vxs_${skill.id}`;
  if (!scene.textures.exists(key)) {
    const col = skill.icon?.color && /^#[0-9a-f]{6}$/i.test(skill.icon.color) ? skill.icon.color : '#ffffff';
    const tex = scene.textures.addCanvas(key, drawSignatureSheet(sig, col, skill.icon?.glyph ?? '', hashId(skill.id)))!;
    for (let f = 0; f < SIG_FRAMES; f++) tex.add(f, 0, f * SIG_W, 0, SIG_W, SIG_H);
  }
  if (!scene.anims.exists(key)) scene.anims.create({ key, frames: Array.from({ length: SIG_FRAMES }, (_, f) => ({ key, frame: f })), frameRate: SIG_FPS, repeat: 0 });
  scene.time.delayedCall(delay, () => {
    if (!scene.sys.isActive()) return;
    const ground = GROUND_MOTIFS.has(sig.m);
    const spr = scene.add.sprite(x, ground ? y + 4 : y - 26, key, 0).setBlendMode(Phaser.BlendModes.ADD).setDepth(y + 2003);
    if (ground) spr.setOrigin(0.5, 0.95);
    spr.play(key);
    spr.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => spr.destroy());
  });
  return true;
}

/**
 * Plays a skill: cast effects on the caster, projectiles to the target, then the hit effects.
 * `color` is the skill's icon colour; `radius` its area (px) when it has one.
 */
export function playSkillVfx(scene: Phaser.Scene, skill: Pick<SkillDef, 'id' | 'fx' | 'kind' | 'targeting'> & { icon?: { color?: string; glyph?: string } }, from: { x: number; y: number }, to: { x: number; y: number }, radius = 0): boolean {
  const v = skillVfx(skill);
  if (!v) return false;
  const color = skill.icon?.color ?? '#ffffff';
  const r = radius || 60;
  if (skill.kind === 'ultimate' || skill.kind === 'buff' || v.cast.length) castFlourish(scene, skill.kind, from, color);
  runSteps(scene, v.cast, from, to, r, color, 0);
  let travel = 0;
  if (v.proj && Math.hypot(to.x - from.x, to.y - from.y) > 8) {
    const p = v.proj, dist = Math.hypot(to.x - from.x, to.y - from.y);
    travel = Math.max(90, (dist / 520) * 1000);
    for (let i = 0; i < p.n; i++) {
      scene.time.delayedCall(i * p.stag, () => {
        if (!scene.sys.isActive()) return;
        const sx = from.x, sy = from.y - 24, ex = to.x + (i - (p.n - 1) / 2) * 4, ey = to.y - 16;
        const pc = p.c ?? color, anim = sheetAnim(scene, p.s, pc);
        const spr = scene.add.sprite(sx, sy, anim, 0).setBlendMode(Phaser.BlendModes.ADD).setScale(p.sc).setDepth(Math.max(sy, ey) + 2000);
        const ang = Math.atan2(ey - sy, ex - sx);
        if (p.s === 'bird') spr.setFlipX(ex < sx); else spr.setRotation(ang);
        spr.play(anim);
        flash(scene, sx, sy, pc, 40, 160, sy + 2001);
        const tr = trail(scene, spr, pc, p.s === 'arrow' || p.s === 'shard' ? 0.45 : 0.8, Math.max(sy, ey) + 1999);
        const arc = p.n > 1 ? (i - (p.n - 1) / 2) * 14 : 0;
        scene.tweens.addCounter({ from: 0, to: 1, duration: travel, onUpdate: (tw) => {
          const t = tw.getValue() ?? 0;
          spr.setPosition(sx + (ex - sx) * t, sy + (ey - sy) * t - Math.sin(t * Math.PI) * arc);
        }, onComplete: () => { spr.destroy(); tr(); flash(scene, ex, ey, pc, 56, 200, ey + 2001); } });
      });
    }
  }
  runSteps(scene, v.hit, from, to, r, color, travel);
  const onSelf = skill.targeting === 'self';
  playSignature(scene, skill, onSelf ? from.x : to.x, onSelf ? from.y : to.y, onSelf ? 60 : travel + 40);
  if (v.shake) scene.time.delayedCall(travel + 100, () => scene.cameras.main.shake(180 + v.shake * 60, 0.002 * v.shake));
  if (skill.kind === 'ultimate') scene.time.delayedCall(travel + 120, () => scene.cameras.main.flash(160, 255, 255, 255, false));
  return true;
}

/** Sheet layers added to the general effects (hits, level ups, status...) by effect name. */
export const FX_SHEETS: Record<string, [string, string, number?][]> = {
  slash_small: [['hit', '#ffffff', 0.9]], crit: [['crit', '#ffd34d']], counter: [['cross', '#ffffff', 0.6]],
  level_up: [['pillar', '#ffd34d'], ['ring', '#ffd34d']], job_up: [['pillar', '#7fd6ff'], ['ring', '#7fd6ff']],
  job_change: [['pillar', '#9a7aff', 1.2], ['circle', '#9a7aff'], ['ring', '#c9a6ff']], teleport: [['pillar', '#7fd6ff', 0.8], ['smoke', '#7fd6ff']],
  heal: [['rise', '#6fe08a']], spawn: [['smoke', '#8a4fbf']], sparkle: [['burst', '#ffd34d', 0.6]], drop_rare: [['pillar', '#c9a6ff', 0.5]],
  boss_entrance: [['tendrils', '#8a4fbf', 1.6], ['ring', '#8a4fbf', 1.6]], enrage: [['aura', '#ff3b30', 1.3], ['ring', '#ff3b30']],
  slam: [['spikes', '#c8a26b'], ['ring', '#c8a26b']], thorns: [['spikes', '#6fae3a', 1.2]], dash: [['smoke', '#c8a26b', 0.7]],
  fire: [['explode', '', 0.5]], ice: [['spikes', '#9ad8ff', 0.4]], lightning: [['bolt', '#fff27a', 0.8]], wind: [['wind', '#b6f0d0', 0.6]],
  poison: [['cloud', '#7dd94f', 0.5]], holy: [['holycross', '#ffe9a8', 0.6]], shadow: [['tendrils', '#8a4fbf', 0.6]], meteor: [['explode', '', 1]],
  taunt: [['burst', '#ff3b30', 0.5]], quest_complete: [['burst', '#ffd34d']],
  status_poison: [['cloud', '#7dd94f', 0.4]], status_burn: [['flame', '', 0.5]], status_freeze: [['spikes', '#9ad8ff', 0.4]], status_stun: [['burst', '#ffe14d', 0.5]],
  status_curse: [['tendrils', '#8a4fbf', 0.5]], status_sleep: [['notes', '#b4b4ff', 0.6]], status_silence: [['smoke', '#c9a6ff', 0.5]], status_bleed: [['claw', '#d6303a', 0.5]],
  status_slow: [['smoke', '#9db4c9', 0.5]], status_blind: [['smoke', '#555566', 0.5]],
};

export function playFxSheets(scene: Phaser.Scene, fx: string, x: number, y: number) {
  for (const [s, color, sc] of FX_SHEETS[fx] ?? []) {
    const lift = GROUNDED.has(s) || FLAT.has(s) ? 0 : -14;
    playSheet(scene, s, x, y + lift, { color: color || undefined, scale: sc ?? 1, under: s === 'circle', ms: 900 });
  }
}

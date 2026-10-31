// Playback of the skill effect recipes (vfxRecipes.ts) with the animated sheets (vfxArt.ts).
import Phaser from 'phaser';
import type { SkillDef } from '../../core/types';
import { VFX_SHEETS } from './vfxArt';
import { skillVfx, type VfxStep } from './vfxRecipes';

export { skillVfx, SKILL_VFX_IDS } from './vfxRecipes';

// ------------------------------------------------------------------ playback
/** Sheets drawn standing on the ground (anchored at their bottom edge). */
const GROUNDED = new Set(['pillar', 'bolt', 'tornado', 'spikes', 'rise', 'aura', 'tendrils', 'cloud', 'notes', 'flame', 'holycross']);
const FLAT = new Set(['ring', 'circle', 'whirl']);

export function ensureVfxSheets(scene: Phaser.Scene) {
  for (const [name, sh] of Object.entries(VFX_SHEETS)) {
    const key = `vxt_${name}`;
    if (scene.textures.exists(key)) continue;
    const canvas = document.createElement('canvas');
    canvas.width = sh.w * sh.frames; canvas.height = sh.h;
    const c = canvas.getContext('2d')!;
    for (let f = 0; f < sh.frames; f++) {
      c.save(); c.beginPath(); c.rect(f * sh.w, 0, sh.w, sh.h); c.clip(); c.translate(f * sh.w, 0);
      sh.draw(c, sh.frames > 1 ? f / (sh.frames - 1) : 0, f, sh.w, sh.h);
      c.restore();
    }
    const tex = scene.textures.addCanvas(key, canvas)!;
    for (let f = 0; f < sh.frames; f++) tex.add(f, 0, f * sh.w, 0, sh.w, sh.h);
    if (!scene.anims.exists(`vx_${name}`)) {
      scene.anims.create({ key: `vx_${name}`, frames: Array.from({ length: sh.frames }, (_, f) => ({ key, frame: f })), frameRate: sh.fps, repeat: sh.loop ? -1 : 0 });
    }
  }
}

const tintOf = (hex?: string) => (hex ? Phaser.Display.Color.HexStringToColor(hex).color : 0xffffff);

/** Plays one sheet at a point; looping sheets stay `ms` and fade out. */
export function playSheet(scene: Phaser.Scene, name: string, x: number, y: number, o: { color?: string; scale?: number; rot?: number; under?: boolean; ms?: number; delay?: number } = {}) {
  const sh = VFX_SHEETS[name];
  if (!sh) return;
  const go = () => {
    if (!scene.sys.isActive()) return;
    const spr = scene.add.sprite(x, y, `vxt_${name}`, 0).setBlendMode(Phaser.BlendModes.ADD).setScale(o.scale ?? 1);
    if (sh.tinted) spr.setTint(tintOf(o.color));
    if (GROUNDED.has(name)) spr.setOrigin(0.5, 0.92);
    if (o.rot !== undefined) spr.setRotation(o.rot);
    spr.setDepth(o.under ? y - 40 : y + 2000);
    spr.play(`vx_${name}`);
    if (sh.loop) {
      scene.tweens.add({ targets: spr, alpha: 0, delay: Math.max(0, (o.ms ?? 900) - 250), duration: 250, onComplete: () => spr.destroy() });
    } else spr.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => spr.destroy());
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
          const spr = scene.add.sprite(pt.x - 70, pt.y - 220, `vxt_${st.s}`, 0).setBlendMode(Phaser.BlendModes.ADD).setScale(st.sc).setDepth(pt.y + 2100);
          if (VFX_SHEETS[st.s].tinted) spr.setTint(tintOf(col));
          spr.setRotation(Math.atan2(220, 70) - (st.s === 'meteor' ? Math.PI / 4 : 0)).play(`vx_${st.s}`);
          scene.tweens.add({ targets: spr, x: pt.x, y: pt.y, duration: st.s === 'meteor' ? 380 : 220, ease: 'Quad.easeIn', onComplete: () => {
            spr.destroy();
            if (st.then) playSheet(scene, st.then, pt.x, pt.y + (GROUNDED.has(st.then) || FLAT.has(st.then) ? 0 : -12), { color: col, scale: st.s === 'meteor' ? 0.8 : 0.7 });
          } });
        });
        return;
      }
      playSheet(scene, st.s, pt.x, pt.y + lift, { color: col, scale: st.sc, under: st.under || st.s === 'circle', ms: st.ms, delay: d, rot: st.rot ? ang : undefined });
    });
  }
}

/**
 * Plays a skill: cast effects on the caster, projectiles to the target, then the hit effects.
 * `color` is the skill's icon colour; `radius` its area (px) when it has one.
 */
export function playSkillVfx(scene: Phaser.Scene, skill: Pick<SkillDef, 'id' | 'fx' | 'kind' | 'targeting'> & { icon?: { color?: string } }, from: { x: number; y: number }, to: { x: number; y: number }, radius = 0): boolean {
  const v = skillVfx(skill);
  if (!v) return false;
  const color = skill.icon?.color ?? '#ffffff';
  const r = radius || 60;
  runSteps(scene, v.cast, from, to, r, color, 0);
  let travel = 0;
  if (v.proj && Math.hypot(to.x - from.x, to.y - from.y) > 8) {
    const p = v.proj, dist = Math.hypot(to.x - from.x, to.y - from.y);
    travel = Math.max(90, (dist / 520) * 1000);
    for (let i = 0; i < p.n; i++) {
      scene.time.delayedCall(i * p.stag, () => {
        if (!scene.sys.isActive()) return;
        const sx = from.x, sy = from.y - 24, ex = to.x + (i - (p.n - 1) / 2) * 4, ey = to.y - 16;
        const spr = scene.add.sprite(sx, sy, `vxt_${p.s}`, 0).setBlendMode(Phaser.BlendModes.ADD).setScale(p.sc).setDepth(Math.max(sy, ey) + 2000);
        if (VFX_SHEETS[p.s].tinted) spr.setTint(tintOf(p.c ?? color));
        const ang = Math.atan2(ey - sy, ex - sx);
        if (p.s === 'bird') spr.setFlipX(ex < sx); else spr.setRotation(ang);
        spr.play(`vx_${p.s}`);
        const arc = p.n > 1 ? (i - (p.n - 1) / 2) * 14 : 0;
        scene.tweens.addCounter({ from: 0, to: 1, duration: travel, onUpdate: (tw) => {
          const t = tw.getValue() ?? 0;
          spr.setPosition(sx + (ex - sx) * t, sy + (ey - sy) * t - Math.sin(t * Math.PI) * arc);
        }, onComplete: () => spr.destroy() });
      });
    }
  }
  runSteps(scene, v.hit, from, to, r, color, travel);
  if (v.shake) scene.time.delayedCall(travel + 100, () => scene.cameras.main.shake(180 + v.shake * 60, 0.002 * v.shake));
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

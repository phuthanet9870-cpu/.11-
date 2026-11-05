// "Game feel" effects drawn by the scene at full frame rate on top of the sprites: weapon swing arcs,
// impact sparks, footstep dust and monster death bursts. All are short-lived, additive and cheap.
import Phaser from 'phaser';
import type { Direction } from '../../core/types';

const hexNum = (c: string) => {
  if (c.startsWith('#')) return parseInt(c.slice(1, 7), 16);
  const m = c.match(/\d+/g); return m ? (Number(m[0]) << 16) | (Number(m[1]) << 8) | Number(m[2]) : 0xffffff;
};
const angleOf = (dir: Direction) => (dir === 'right' ? 0 : dir === 'left' ? Math.PI : dir === 'down' ? Math.PI / 2 : -Math.PI / 2);

/**
 * A melee swing: a glowing crescent that sweeps across the facing side (slash), a long thin stab
 * (thrust) or a short burst (punch). Drawn as layered strokes: wide and faint outside, thin and bright inside.
 */
export function swingArc(scene: Phaser.Scene, x: number, y: number, dir: Direction, style: 'slash' | 'thrust' | 'punch', color: string, big = false) {
  const col = hexNum(color), a0 = angleOf(dir), s = big ? 1.25 : 1;
  // Two layers: the colour in normal blend (reads on any ground) and a bright additive core on top.
  const base = scene.add.graphics({ x, y }).setDepth(y + 2049);
  const g = scene.add.graphics({ x, y }).setBlendMode(Phaser.BlendModes.ADD).setDepth(y + 2050);
  const draw = (t: number) => {
    g.clear(); base.clear();
    if (style === 'slash') {
      // Sweep from upper-back to lower-front; the trail thins toward its tail.
      const span = 2.3, head = a0 - span / 2 + span * Math.min(1, t * 1.6), tail = Math.max(a0 - span / 2, head - 1.6);
      for (let i = 0; i < 12; i++) {
        const u = i / 11, aa = tail + (head - tail) * u, w = (1.5 + 7 * u) * s;
        const r = (26 + 5 * u) * s;
        base.lineStyle(w, col, (0.12 + 0.7 * u) * (1 - t)); base.beginPath(); base.arc(0, 0, r, aa - 0.15, aa + 0.02); base.strokePath();
      }
      g.lineStyle(3 * s, col, 0.8 * (1 - t)); g.beginPath(); g.arc(0, 0, 30 * s, Math.max(tail, head - 0.9), head); g.strokePath();
      g.lineStyle(1.5 * s, 0xffffff, 1 - t); g.beginPath(); g.arc(0, 0, 30 * s, Math.max(tail, head - 0.55), head); g.strokePath();
    } else if (style === 'thrust') {
      const len = (18 + 30 * Math.min(1, t * 2)) * s, c = Math.cos(a0), sn = Math.sin(a0), px = -sn, py = c;
      for (const [w, al] of [[8, 0.35], [4, 0.8]] as const) {
        base.fillStyle(col, al * (1 - t));
        base.fillTriangle(c * 6 + px * w, sn * 6 + py * w, c * 6 - px * w, sn * 6 - py * w, c * len, sn * len);
      }
      g.fillStyle(0xffffff, 1 - t); g.fillTriangle(c * 6 + px * 1.5, sn * 6 + py * 1.5, c * 6 - px * 1.5, sn * 6 - py * 1.5, c * len, sn * len);
    } else {
      const r = (6 + 16 * t) * s, cx = Math.cos(a0) * 14 * s, cy = Math.sin(a0) * 14 * s;
      base.lineStyle(4 * s, col, 0.8 * (1 - t)); base.strokeCircle(cx, cy, r);
      g.lineStyle(1, 0xffffff, 0.9 * (1 - t)); g.strokeCircle(cx, cy, r * 0.6);
    }
  };
  draw(0);
  scene.tweens.addCounter({ from: 0, to: 1, duration: style === 'slash' ? 230 : 180, ease: 'Cubic.easeOut', onUpdate: (tw) => draw(tw.getValue() ?? 1), onComplete: () => { g.destroy(); base.destroy(); } });
}

/** Sparks flying out of a hit; crits throw more and further, with a white core flash. */
export function hitSparks(scene: Phaser.Scene, x: number, y: number, color: string, crit: boolean) {
  const col = hexNum(color), n = crit ? 12 : 6;
  const flash = scene.add.image(x, y, 'fx_glow').setBlendMode(Phaser.BlendModes.ADD).setTint(crit ? 0xffffff : col).setScale(crit ? 0.6 : 0.35).setAlpha(0.85).setDepth(y + 2060);
  scene.tweens.add({ targets: flash, scale: flash.scale * 1.6, alpha: 0, duration: crit ? 220 : 150, ease: 'Quad.easeOut', onComplete: () => flash.destroy() });
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, d = (crit ? 26 : 14) + Math.random() * (crit ? 22 : 12);
    const sp = scene.add.image(x, y, 'fx_spark').setBlendMode(Phaser.BlendModes.ADD).setTint(i % 3 ? col : 0xffffff).setScale(0.6 + Math.random() * 0.5).setRotation(a).setDepth(y + 2061);
    scene.tweens.add({ targets: sp, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.7 + 4, alpha: 0, scale: 0.15, duration: 220 + Math.random() * 160, ease: 'Cubic.easeOut', onComplete: () => sp.destroy() });
  }
}

/** A small puff of dust at the feet (footsteps, landing). */
export function dustPuff(scene: Phaser.Scene, x: number, y: number) {
  for (let i = 0; i < 2; i++) {
    const p = scene.add.image(x + (i ? 5 : -5), y - 1, 'fx_dot').setTint(0xb8a890).setAlpha(0.35).setScale(0.5).setDepth(y - 2);
    scene.tweens.add({ targets: p, x: p.x + (i ? 6 : -6), y: y - 5, scale: 1.3, alpha: 0, duration: 380, ease: 'Quad.easeOut', onComplete: () => p.destroy() });
  }
}

/** Monster death: shards of its glow bursting out and a soul wisp rising and fading. */
export function deathBurst(scene: Phaser.Scene, x: number, y: number, color: string, big: boolean) {
  const col = hexNum(color), n = big ? 22 : 12;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.6, d = 18 + Math.random() * (big ? 46 : 26);
    const sh = scene.add.rectangle(x, y, 2, 4 + Math.random() * 4, i % 4 ? col : 0xffffff).setBlendMode(Phaser.BlendModes.ADD).setRotation(a).setDepth(y + 2040);
    scene.tweens.add({ targets: sh, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, alpha: 0, angle: sh.angle + (Math.random() - 0.5) * 360, duration: 450 + Math.random() * 300, ease: 'Cubic.easeOut', onComplete: () => sh.destroy() });
  }
  const wisp = scene.add.image(x, y, 'fx_glow').setBlendMode(Phaser.BlendModes.ADD).setTint(col).setScale(big ? 0.75 : 0.45).setAlpha(0.8).setDepth(y + 2045);
  scene.tweens.add({ targets: wisp, y: y - (big ? 70 : 44), scaleX: wisp.scale * 0.4, scaleY: wisp.scale * 1.3, alpha: 0, duration: 1000, ease: 'Sine.easeOut', onComplete: () => wisp.destroy() });
  const ring = scene.add.ellipse(x, y + 8, 10, 4).setStrokeStyle(2, col, 0.9).setBlendMode(Phaser.BlendModes.ADD).setDepth(y - 3);
  scene.tweens.add({ targets: ring, scaleX: big ? 7 : 4.5, scaleY: big ? 7 : 4.5, alpha: 0, duration: 520, ease: 'Quad.easeOut', onComplete: () => ring.destroy() });
}

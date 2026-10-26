// Visual effects driven by world events: elemental particles, skill bursts,
// level-up columns, teleport, item drops, boss entrance, damage numbers.
import Phaser from 'phaser';

interface FxSpec {
  tint: number[];
  count: number;
  speed: [number, number];
  life: number;
  scale: [number, number];
  gravityY?: number;
  angle?: [number, number];
  texture?: string;
  ring?: number; // ring color for a shockwave
  column?: number; // vertical light column color
  shake?: number;
  blend?: boolean;
}

const C = {
  fire: [0xff6a2e, 0xffb84d, 0xff3d1e], ice: [0x9ad8ff, 0xe0f6ff, 0x5ab4ff], lightning: [0xfff27a, 0xffffff, 0xb4e0ff],
  poison: [0x7dd94f, 0xa9e04a, 0x4f9a3a], holy: [0xffe9a8, 0xffffff, 0xffd34d], shadow: [0x8a4fbf, 0x3a1f5a, 0xc9a6ff],
  heal: [0x6fe08a, 0xc8ffd8, 0xffffff], earth: [0x8b6b3e, 0x6fae3a, 0xc8a26b], wind: [0xb6f0d0, 0xffffff, 0x7ad0e0],
  white: [0xffffff, 0xfff6c0], gold: [0xffd34d, 0xfff6c0, 0xffffff], red: [0xff3b30, 0xff8a7a], arcane: [0x9a7aff, 0xd8c8ff, 0x7fd6ff],
};

const SPECS: Record<string, FxSpec> = {
  fire: { tint: C.fire, count: 26, speed: [30, 120], life: 600, scale: [0.9, 0], gravityY: -160, blend: true },
  meteor: { tint: C.fire, count: 60, speed: [80, 260], life: 800, scale: [1.4, 0], gravityY: -60, ring: 0xff6a2e, shake: 0.008, blend: true },
  ice: { tint: C.ice, count: 24, speed: [40, 140], life: 600, scale: [0.8, 0], texture: 'fx_spark', blend: true },
  lightning: { tint: C.lightning, count: 22, speed: [60, 200], life: 350, scale: [0.8, 0], texture: 'fx_spark', column: 0xfff27a, blend: true },
  wind: { tint: C.wind, count: 20, speed: [60, 160], life: 500, scale: [0.6, 0], blend: true },
  poison: { tint: C.poison, count: 18, speed: [10, 50], life: 900, scale: [0.7, 0], gravityY: -40, blend: true },
  holy: { tint: C.holy, count: 24, speed: [20, 90], life: 900, scale: [0.7, 0], gravityY: -80, texture: 'fx_spark', blend: true },
  shadow: { tint: C.shadow, count: 22, speed: [20, 90], life: 700, scale: [0.9, 0], blend: false },
  heal: { tint: C.heal, count: 18, speed: [10, 40], life: 900, scale: [0.6, 0], gravityY: -90, texture: 'fx_spark', blend: true },
  cure: { tint: C.heal, count: 12, speed: [10, 30], life: 700, scale: [0.5, 0], gravityY: -60, blend: true },
  buff: { tint: C.gold, count: 16, speed: [10, 30], life: 900, scale: [0.6, 0], gravityY: -120, texture: 'fx_spark', blend: true },
  arcane: { tint: C.arcane, count: 22, speed: [20, 80], life: 800, scale: [0.7, 0], gravityY: -50, blend: true },
  crit: { tint: C.white, count: 14, speed: [80, 200], life: 300, scale: [0.8, 0], texture: 'fx_spark', blend: true },
  slash: { tint: C.white, count: 10, speed: [120, 220], life: 220, scale: [0.6, 0], texture: 'fx_spark', blend: true },
  slash_small: { tint: C.white, count: 5, speed: [80, 160], life: 180, scale: [0.4, 0], texture: 'fx_spark', blend: true },
  pierce: { tint: C.gold, count: 16, speed: [120, 260], life: 260, scale: [0.6, 0], texture: 'fx_spark', blend: true },
  whirl: { tint: C.white, count: 40, speed: [140, 240], life: 400, scale: [0.7, 0], texture: 'fx_spark', ring: 0xffffff, blend: true },
  shout: { tint: C.red, count: 12, speed: [40, 120], life: 400, scale: [0.6, 0], ring: 0xff8a3a, blend: true },
  taunt: { tint: C.red, count: 6, speed: [10, 30], life: 600, scale: [0.5, 0], gravityY: -60, blend: true },
  arrow: { tint: C.white, count: 6, speed: [30, 90], life: 250, scale: [0.4, 0], blend: true },
  arrow_rain: { tint: C.white, count: 30, speed: [20, 60], life: 500, scale: [0.4, 0], texture: 'fx_spark', blend: true },
  falcon: { tint: C.gold, count: 18, speed: [80, 180], life: 400, scale: [0.6, 0], texture: 'fx_spark', blend: true },
  level_up: { tint: C.gold, count: 50, speed: [20, 80], life: 1400, scale: [0.9, 0], gravityY: -140, texture: 'fx_spark', column: 0xffd34d, blend: true },
  job_up: { tint: C.ice, count: 36, speed: [20, 70], life: 1200, scale: [0.8, 0], gravityY: -130, texture: 'fx_spark', column: 0x7fd6ff, blend: true },
  job_change: { tint: C.arcane, count: 80, speed: [30, 140], life: 1600, scale: [1, 0], gravityY: -100, texture: 'fx_spark', column: 0x9a7aff, ring: 0x9a7aff, blend: true },
  quest_complete: { tint: C.gold, count: 30, speed: [40, 120], life: 900, scale: [0.7, 0], gravityY: -60, texture: 'fx_spark', blend: true },
  teleport: { tint: C.ice, count: 40, speed: [10, 40], life: 900, scale: [0.8, 0], gravityY: -200, column: 0x7fd6ff, blend: true },
  drop: { tint: C.white, count: 6, speed: [20, 50], life: 400, scale: [0.4, 0], texture: 'fx_spark', blend: true },
  drop_rare: { tint: C.arcane, count: 20, speed: [20, 70], life: 900, scale: [0.6, 0], texture: 'fx_spark', column: 0xc9a6ff, blend: true },
  spawn: { tint: C.shadow, count: 12, speed: [10, 50], life: 500, scale: [0.6, 0], blend: false },
  sparkle: { tint: C.gold, count: 14, speed: [10, 40], life: 800, scale: [0.5, 0], gravityY: -40, texture: 'fx_spark', blend: true },
  counter: { tint: C.white, count: 10, speed: [80, 160], life: 250, scale: [0.6, 0], texture: 'fx_spark', blend: true },
  boss_entrance: { tint: C.shadow, count: 60, speed: [60, 220], life: 1000, scale: [1.2, 0], ring: 0x8a4fbf, shake: 0.012, blend: false },
  enrage: { tint: C.red, count: 50, speed: [60, 200], life: 900, scale: [1, 0], ring: 0xff3b30, shake: 0.01, blend: true },
  slam: { tint: C.earth, count: 40, speed: [60, 200], life: 600, scale: [1, 0], gravityY: 200, ring: 0xc8a26b, shake: 0.01, blend: false },
  thorns: { tint: C.earth, count: 60, speed: [100, 260], life: 600, scale: [0.9, 0], ring: 0x6fae3a, shake: 0.008, blend: false },
  dash: { tint: C.earth, count: 20, speed: [20, 80], life: 500, scale: [0.8, 0], blend: false },
  beam: { tint: C.white, count: 1, speed: [0, 0], life: 1, scale: [0, 0] },
  spit: { tint: C.poison, count: 8, speed: [20, 60], life: 400, scale: [0.5, 0], blend: true },
  magic_orb: { tint: C.ice, count: 6, speed: [20, 60], life: 300, scale: [0.5, 0], blend: true },
  status_poison: { tint: C.poison, count: 8, speed: [10, 30], life: 600, scale: [0.5, 0], gravityY: -40, blend: true },
  status_burn: { tint: C.fire, count: 10, speed: [10, 40], life: 500, scale: [0.6, 0], gravityY: -80, blend: true },
  status_freeze: { tint: C.ice, count: 14, speed: [20, 60], life: 600, scale: [0.6, 0], texture: 'fx_spark', blend: true },
  status_stun: { tint: [0xffe14d], count: 8, speed: [20, 40], life: 600, scale: [0.5, 0], texture: 'fx_spark', blend: true },
  status_bleed: { tint: [0xd6303a], count: 8, speed: [20, 60], life: 500, scale: [0.5, 0], gravityY: 120, blend: false },
  status_sleep: { tint: [0xb4b4ff], count: 6, speed: [5, 20], life: 900, scale: [0.5, 0], gravityY: -30, blend: true },
  status_curse: { tint: C.shadow, count: 10, speed: [10, 30], life: 800, scale: [0.6, 0], blend: false },
  status_silence: { tint: [0xc9a6ff], count: 6, speed: [10, 20], life: 600, scale: [0.4, 0], blend: true },
  status_slow: { tint: [0x9db4c9], count: 6, speed: [10, 20], life: 600, scale: [0.4, 0], blend: true },
  status_blind: { tint: [0x333344], count: 8, speed: [10, 20], life: 600, scale: [0.6, 0], blend: false },
  casting: { tint: C.arcane, count: 10, speed: [10, 30], life: 600, scale: [0.4, 0], gravityY: -40, blend: true },
};

export const ELEMENT_FX: Record<string, string> = {
  fire: 'fire', water: 'ice', wind: 'wind', earth: 'slam', holy: 'holy', shadow: 'shadow', poison: 'poison', undead: 'shadow', neutral: 'slash_small',
};

export function playFx(scene: Phaser.Scene, fx: string, x: number, y: number, radius?: number) {
  const spec = SPECS[fx];
  if (!spec || spec.count <= 1) return;
  const spread = radius ? Math.min(radius, 160) : 0;
  const emitter = scene.add.particles(x, y - 12, spec.texture ?? 'fx_dot', {
    speed: { min: spec.speed[0], max: spec.speed[1] },
    angle: spec.angle ? { min: spec.angle[0], max: spec.angle[1] } : { min: 0, max: 360 },
    lifespan: spec.life,
    scale: { start: spec.scale[0], end: spec.scale[1] },
    alpha: { start: 1, end: 0 },
    gravityY: spec.gravityY ?? 0,
    tint: spec.tint,
    blendMode: spec.blend ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL,
    emitting: false,
    ...(spread ? { emitZone: { type: 'random', source: new Phaser.Geom.Circle(0, 0, spread) } as never } : {}),
  });
  emitter.setDepth(y + 2000);
  emitter.explode(Math.round(spec.count * (radius ? 1 + Math.min(2, radius / 80) : 1)));
  scene.time.delayedCall(spec.life + 100, () => emitter.destroy());

  if (spec.ring) {
    const ring = scene.add.circle(x, y, 8, spec.ring, 0).setStrokeStyle(4, spec.ring, 0.9).setDepth(y + 1999);
    if (spec.blend) ring.setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({ targets: ring, radius: radius ?? 90, alpha: 0, duration: 450, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
  }
  if (spec.column) {
    const col = scene.add.rectangle(x, y - 60, 34, 140, spec.column, 0.35).setBlendMode(Phaser.BlendModes.ADD).setDepth(y + 1998);
    scene.tweens.add({ targets: col, scaleX: 0.1, alpha: 0, duration: spec.life, ease: 'Quad.easeIn', onComplete: () => col.destroy() });
  }
  if (spec.shake) scene.cameras.main.shake(250, spec.shake);
  if (fx === 'lightning') lightningBolt(scene, x, y);
  if (fx === 'meteor') meteorFall(scene, x, y);
}

function lightningBolt(scene: Phaser.Scene, x: number, y: number) {
  const g = scene.add.graphics().setDepth(y + 2100).setBlendMode(Phaser.BlendModes.ADD);
  g.lineStyle(3, 0xfff6a0, 1);
  g.beginPath();
  let cx = x + Phaser.Math.Between(-20, 20), cy = y - 220;
  g.moveTo(cx, cy);
  while (cy < y - 10) { cx += Phaser.Math.Between(-14, 14); cy += Phaser.Math.Between(18, 32); g.lineTo(cx, Math.min(cy, y - 10)); }
  g.strokePath();
  scene.tweens.add({ targets: g, alpha: 0, duration: 260, onComplete: () => g.destroy() });
}

function meteorFall(scene: Phaser.Scene, x: number, y: number) {
  for (let i = 0; i < 4; i++) {
    const tx = x + Phaser.Math.Between(-60, 60), ty = y + Phaser.Math.Between(-30, 30);
    const m = scene.add.image(tx - 120, ty - 260, 'fx_glow').setTint(0xff7a2e).setScale(0.8).setBlendMode(Phaser.BlendModes.ADD).setDepth(ty + 2100);
    scene.tweens.add({ targets: m, x: tx, y: ty, duration: 300 + i * 140, ease: 'Quad.easeIn', onComplete: () => { m.destroy(); playFx(scene, 'fire', tx, ty, 40); } });
  }
}

/** Projectile flying from A to B. */
export function playProjectile(scene: Phaser.Scene, fx: string, fromX: number, fromY: number, toX: number, toY: number, ms: number, color?: string) {
  const isArrow = fx === 'arrow' || fx === 'arrow_rain' || fx === 'pierce' || fx === 'double_shot';
  const tint = color ? Phaser.Display.Color.HexStringToColor(color).color : (SPECS[fx]?.tint[0] ?? 0xffffff);
  const obj = isArrow
    ? scene.add.image(fromX, fromY, 'fx_arrow').setRotation(Math.atan2(toY - fromY, toX - fromX))
    : scene.add.image(fromX, fromY, 'fx_glow').setTint(tint).setScale(0.45).setBlendMode(Phaser.BlendModes.ADD);
  obj.setDepth(Math.max(fromY, toY) + 2000);
  scene.tweens.add({ targets: obj, x: toX, y: toY, duration: Math.max(60, ms), onComplete: () => obj.destroy() });
}

export function floatText(scene: Phaser.Scene, x: number, y: number, text: string, color: string, size = 16, stroke = '#1c1622') {
  const t = scene.add.text(x + Phaser.Math.Between(-8, 8), y, text, {
    fontFamily: '"Trebuchet MS", Verdana, sans-serif', fontSize: `${size}px`, fontStyle: 'bold', color, stroke, strokeThickness: 4,
  }).setOrigin(0.5).setDepth(1e6);
  scene.tweens.add({ targets: t, y: y - 42, alpha: { from: 1, to: 0 }, scale: { from: size > 18 ? 1.3 : 1, to: 1 }, duration: 950, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
}

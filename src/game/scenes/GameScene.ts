// Renders the World simulation with Phaser and turns mouse input into world
// commands. All game rules live in src/core; this scene only draws them.
import Phaser from 'phaser';
import type { World, WorldEvent, MonsterActor, AnimState } from '../../core/world';
import { TILE } from '../../core/mapCompiler';
import type { Direction } from '../../core/types';
import { npcQuestMarker } from '../../core/quests';
import {
  ensureCharacterTexture, ensureFxTextures, ensureItemTexture, ensureMapTextures, ensureMonsterTexture,
} from '../assets';
import type { CharacterLook } from '../art/characterSprite';
import { CHAR_ANIMS, CHAR_DIRECTIONS, CHAR_PIVOT, CHAR_SHEET_COLS, MON_ANIMS, MON_SHEET_COLS, type CharAnim, type MonAnim } from '../art/spriteMeta';
import { characterRig, clipFrame, monsterRig, type Clip, type Rig } from '../batchArt';
import { ELEMENT_FX, floatText, playFx, playProjectile, playSpriteFx } from '../render/effects';
import { audio } from '../audio/audio';
import type { GameHost } from '../host';

interface MonView { sprite: Phaser.GameObjects.Sprite; name: Phaser.GameObjects.Text; deadAt: number; rig: Rig }
interface NpcView { sprite: Phaser.GameObjects.Sprite; name: Phaser.GameObjects.Text; marker: Phaser.GameObjects.Text }

const ZOOM = 1.5;

export class GameScene extends Phaser.Scene {
  host!: GameHost;
  world!: World;
  private mapObjects: Phaser.GameObjects.GameObject[] = [];
  private player!: Phaser.GameObjects.Sprite;
  private playerName!: Phaser.GameObjects.Text;
  private playerLookKey = '';
  private playerRig!: Rig;
  private monViews = new Map<string, MonView>();
  private npcViews = new Map<string, NpcView>();
  private groundViews = new Map<string, Phaser.GameObjects.Image>();
  private groundGlows = new Map<string, Phaser.GameObjects.Image>();
  private zoneEmitters = new Map<string, Phaser.GameObjects.Particles.ParticleEmitter>();
  private gfx!: Phaser.GameObjects.Graphics; // telegraphs, zones, cast circle
  private bars!: Phaser.GameObjects.Graphics; // hp bars
  private collisionGfx: Phaser.GameObjects.Graphics | null = null;
  private hovered: { kind: 'monster' | 'npc' | 'item' | 'object' | null; id: string | null } = { kind: null, id: null };
  private markerTimer = 0;
  private stepTimer = 0;
  private builtMapId = '';
  private builtMap: World['map'] | null = null;

  constructor() { super('Game'); }

  init(data: { host: GameHost }) {
    this.host = data.host;
    this.world = data.host.world;
  }

  create() {
    ensureFxTextures(this);
    this.cameras.main.setZoom(ZOOM);
    this.cameras.main.setRoundPixels(true);
    this.cameras.main.setBackgroundColor('#0c0a12');
    this.input.mouse?.disableContextMenu();
    this.buildMap();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointerDown(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onPointerMove(p));
    this.events.on('shutdown', () => this.clearMap());
  }

  // ---------------------------------------------------------------- map build
  private clearMap() {
    for (const o of this.mapObjects) o.destroy();
    this.mapObjects = [];
    this.monViews.clear();
    this.npcViews.clear();
    this.groundViews.clear();
    this.groundGlows.clear();
    for (const e of this.zoneEmitters.values()) e.destroy();
    this.zoneEmitters.clear();
    this.collisionGfx = null;
  }

  private track<T extends Phaser.GameObjects.GameObject>(o: T): T { this.mapObjects.push(o); return o; }

  buildMap() {
    this.clearMap();
    const w = this.world, map = w.map, data = w.data;
    this.builtMapId = map.def.id;
    this.builtMap = map;
    const tex = ensureMapTextures(this, data, map);
    const W = map.width * TILE, H = map.height * TILE;
    this.track(this.add.image(0, 0, tex.ground).setOrigin(0).setDepth(-20));
    this.track(this.add.image(0, 0, tex.walls).setOrigin(0).setDepth(-10));
    this.track(this.add.image(0, 0, tex.above).setOrigin(0).setDepth(1e5));

    for (const o of map.objects) {
      const kind = data.objectKinds.get(o.kind)!;
      const key = tex.objects.get(o.uid)!;
      const bx = (o.x + o.w / 2) * TILE, by = (o.y + o.h) * TILE;
      const img = this.track(this.add.image(bx, by + 2, key).setOrigin(0.5, 1).setDepth(by - 1));
      if (kind.id === 'glint') {
        img.setDepth(-5).setBlendMode(Phaser.BlendModes.ADD).setY(by - 6);
        this.tweens.add({ targets: img, alpha: { from: 0.3, to: 1 }, scale: { from: 0.7, to: 1.1 }, yoyo: true, repeat: -1, duration: 700 });
      }
      if (kind.id === 'campfire') {
        const em = this.track(this.add.particles(bx, by - 14, 'fx_dot', {
          speed: { min: 10, max: 30 }, angle: { min: 250, max: 290 }, lifespan: 700, scale: { start: 0.6, end: 0 },
          tint: [0xff7a2e, 0xffd34d], blendMode: Phaser.BlendModes.ADD, frequency: 90, gravityY: -30,
        }).setDepth(by));
        void em;
      }
      if (kind.id === 'obelisk') {
        this.track(this.add.particles(bx, by - 50, 'fx_spark', {
          speed: { min: 5, max: 20 }, lifespan: 1200, scale: { start: 0.5, end: 0 }, tint: [0x9ad8ff, 0xffffff],
          blendMode: Phaser.BlendModes.ADD, frequency: 220, gravityY: -20, emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(-10, -40, 20, 80) } as never,
        }).setDepth(by + 1));
      }
    }
    map.buildings.forEach((b, i) => {
      const img = this.add.image(b.x * TILE - 4, (b.y + b.h) * TILE + 4, tex.buildings[i]).setOrigin(0, 1).setDepth((b.y + b.h) * TILE - 2);
      this.track(img);
    });

    // Portals
    for (const p of map.def.portals) {
      const cx = (p.x + p.w / 2) * TILE, cy = (p.y + p.h / 2) * TILE;
      const glow = this.track(this.add.ellipse(cx, cy + 6, p.w * TILE + 10, p.h * TILE * 0.6, 0x7fd6ff, 0.25).setDepth(-4).setBlendMode(Phaser.BlendModes.ADD));
      this.tweens.add({ targets: glow, alpha: { from: 0.15, to: 0.45 }, yoyo: true, repeat: -1, duration: 900 });
      this.track(this.add.particles(cx, cy, 'fx_spark', {
        speed: { min: 5, max: 25 }, angle: { min: 260, max: 280 }, lifespan: 1400, scale: { start: 0.6, end: 0 },
        tint: [0x7fd6ff, 0xffffff], blendMode: Phaser.BlendModes.ADD, frequency: 120, gravityY: -40,
        emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(-p.w * 16, -p.h * 16, p.w * 32, p.h * 32) } as never,
      }).setDepth(cy + 40));
      const label = this.track(this.add.text(cx, cy - p.h * 16 - 10, `▶ ${p.label}`, labelStyle('#bfe9ff')).setOrigin(0.5).setDepth(1e5 + 1));
      label.setResolution(2);
    }

    // NPCs
    for (const n of w.npcs) {
      const look: CharacterLook = { appearance: n.def.appearance, outfit: n.def.outfit, weapon: null };
      const key = ensureCharacterTexture(this, look, `npc_${n.npcId}`);
      const s = this.track(this.add.sprite(n.x, n.y, key, frameIndex(n.dir, 'idle', 0)).setOrigin(CHAR_PIVOT.x, CHAR_PIVOT.y));
      s.setDepth(n.y);
      const name = this.track(this.add.text(n.x, n.y + 6, n.def.name, labelStyle('#ffe9a8')).setOrigin(0.5, 0).setDepth(1e5 + 2).setResolution(2));
      const marker = this.track(this.add.text(n.x, n.y - 72, '', { fontFamily: 'Verdana', fontSize: '22px', fontStyle: 'bold', color: '#ffd34d', stroke: '#1c1622', strokeThickness: 5 }).setOrigin(0.5).setDepth(1e5 + 3).setResolution(2));
      this.tweens.add({ targets: marker, y: n.y - 78, yoyo: true, repeat: -1, duration: 600, ease: 'Sine.easeInOut' });
      this.npcViews.set(n.npcId, { sprite: s, name, marker });
    }

    // Player
    this.playerLookKey = '';
    this.player = this.track(this.add.sprite(w.player.x, w.player.y, '__DEFAULT'));
    this.ensurePlayerTexture();
    this.playerName = this.track(this.add.text(0, 0, w.char.name, labelStyle('#ffffff')).setOrigin(0.5, 0).setDepth(1e5 + 2).setResolution(2));

    this.gfx = this.track(this.add.graphics().setDepth(-3));
    this.bars = this.track(this.add.graphics().setDepth(1e5 + 5));

    // Map atmosphere tint (forest is darker).
    const tintColor = map.def.tileset === 'whispering_forest' ? 0x0a2a1a : map.def.tileset === 'sunny_meadow' ? 0xfff2c0 : 0xffe0b0;
    const tintAlpha = map.def.tileset === 'whispering_forest' ? 0.18 : 0.05;
    this.track(this.add.rectangle(0, 0, W, H, tintColor, tintAlpha).setOrigin(0).setDepth(1e5 - 1));

    const cam = this.cameras.main;
    cam.setBounds(0, 0, W, H);
    cam.startFollow(this.player, true, 0.15, 0.15);
    cam.fadeIn(350, 0, 0, 0);
    if (this.host.settings.showCollision) this.drawCollision();
    audio.playMusic(map.def.bgm);
    audio.playAmbient(map.def.ambient);
  }

  setCollisionVisible(on: boolean) {
    if (on && !this.collisionGfx) this.drawCollision();
    if (!on && this.collisionGfx) { this.collisionGfx.destroy(); this.collisionGfx = null; }
  }

  private drawCollision() {
    const map = this.world.map;
    const g = this.track(this.add.graphics().setDepth(1e5 + 10));
    g.fillStyle(0xff0040, 0.28);
    for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) if (map.collision[y * map.width + x]) g.fillRect(x * TILE, y * TILE, TILE, TILE);
    g.lineStyle(1, 0x7fd6ff, 0.8);
    for (const p of map.def.portals) g.strokeRect(p.x * TILE, p.y * TILE, p.w * TILE, p.h * TILE);
    g.lineStyle(1, 0xffd34d, 0.6);
    for (const s of map.def.monsterSpawns) g.strokeRect(s.area.x * TILE, s.area.y * TILE, s.area.w * TILE, s.area.h * TILE);
    this.collisionGfx = g;
  }

  /** Player rig: production art for classes that have it, else the procedural sheet. */
  private ensurePlayerTexture() {
    const c = this.world.char;
    const cls = this.world.data.classes.get(c.classId)!;
    const weapon = c.equipment.weapon ? this.world.data.items.get(c.equipment.weapon.itemId)?.weaponType ?? null : null;
    const lookId = JSON.stringify([c.classId, c.appearance, weapon, !!c.equipment.shield]);
    if (lookId === this.playerLookKey && this.playerRig) return;
    this.playerLookKey = lookId;
    const look: CharacterLook = { appearance: c.appearance, outfit: cls.outfit, weapon, shield: !!c.equipment.shield };
    this.playerRig = characterRig(this, c.classId, c.appearance, weapon) ?? proceduralCharRig(ensureCharacterTexture(this, look, `chr_${c.classId}`));
    if (this.player?.active) this.player.setOrigin(this.playerRig.originX, this.playerRig.originY);
  }

  // ---------------------------------------------------------------- input
  worldPoint(p: Phaser.Input.Pointer) {
    return this.cameras.main.getWorldPoint(p.x, p.y);
  }

  private pick(wx: number, wy: number): { kind: 'monster' | 'npc' | 'item' | 'object' | null; id: string | null } {
    // Monsters (topmost first)
    let best: { id: string; depth: number } | null = null;
    for (const [id, v] of this.monViews) {
      const m = this.world.monsters.get(id);
      if (!m || m.dead) continue;
      const b = v.sprite.getBounds();
      Phaser.Geom.Rectangle.Inflate(b, 6, 6);
      if (b.contains(wx, wy) && (!best || v.sprite.depth > best.depth)) best = { id, depth: v.sprite.depth };
    }
    if (best) return { kind: 'monster', id: best.id };
    for (const [id, v] of this.npcViews) {
      const b = v.sprite.getBounds();
      Phaser.Geom.Rectangle.Inflate(b, -8, -4);
      if (b.contains(wx, wy)) return { kind: 'npc', id };
    }
    for (const [id, img] of this.groundViews) if (Phaser.Math.Distance.Between(img.x, img.y, wx, wy) < 18) return { kind: 'item', id };
    for (const o of this.world.map.def.objects) {
      const placed = this.world.map.objects.find((p) => p.id === o.id);
      if (!placed || !o.interact) continue;
      const kind = this.world.data.objectKinds.get(placed.kind)!;
      const cx = (placed.x + placed.w / 2) * TILE, by = (placed.y + placed.h) * TILE;
      if (wx > cx - kind.spriteW / 2 && wx < cx + kind.spriteW / 2 && wy > by - kind.spriteH && wy < by + 4) return { kind: 'object', id: o.id };
    }
    return { kind: null, id: null };
  }

  private onPointerMove(p: Phaser.Input.Pointer) {
    const wp = this.worldPoint(p);
    this.host.pointerWorld = { x: wp.x, y: wp.y };
    this.hovered = this.pick(wp.x, wp.y);
    const cursor = this.hovered.kind === 'monster' ? 'crosshair' : this.hovered.kind ? 'pointer' : 'default';
    this.input.setDefaultCursor(cursor);
  }

  private onPointerDown(p: Phaser.Input.Pointer) {
    audio.unlock();
    if (this.world.player.dead) return;
    const wp = this.worldPoint(p);
    if (p.rightButtonDown()) { this.world.stop(); return; }
    const target = this.pick(wp.x, wp.y);
    switch (target.kind) {
      case 'monster': this.world.attack(target.id!); break;
      case 'npc': this.world.interactNpc(target.id!); break;
      case 'item': this.world.pickupCmd(target.id!); break;
      case 'object': this.world.interactObjectCmd(target.id!); break;
      default: {
        this.world.moveTo(wp.x, wp.y);
        const ring = this.add.circle(wp.x, wp.y, 10, 0xffffff, 0).setStrokeStyle(2, 0xffffff, 0.8).setDepth(-2);
        this.tweens.add({ targets: ring, radius: 2, alpha: 0, duration: 350, onComplete: () => ring.destroy() });
      }
    }
  }

  // ---------------------------------------------------------------- frame
  update(_time: number, delta: number) {
    const w = this.world;
    if (!this.host.paused) w.update(delta);
    const events = w.drainEvents();
    let mapChanged = false;
    for (const e of events) {
      if (e.type === 'mapChanged') mapChanged = true;
      else this.handleEvent(e);
    }
    this.host.onWorldEvents(events);
    if (mapChanged && (w.map.def.id !== this.builtMapId || w.map !== this.builtMap)) { this.buildMap(); return; }
    this.syncPlayer(delta);
    this.syncMonsters();
    this.syncNpcs(delta);
    this.syncGround();
    this.drawOverlays();
    this.host.onFrame();
  }

  private handleEvent(e: WorldEvent) {
    const w = this.world;
    const show = this.host.settings.showDamageNumbers;
    switch (e.type) {
      case 'damage': {
        if (!show) break;
        const tgt = e.targetId === 'player' ? w.player : w.monsters.get(e.targetId);
        if (!tgt) break;
        const y = tgt.y - (e.targetId === 'player' ? 64 : ((tgt as MonsterActor).def?.art.h ?? 48)) - 4;
        if (e.miss) floatText(this, tgt.x, y, 'MISS', '#c8c8d8', 14);
        else if (e.kind === 'heal') floatText(this, tgt.x, y, `+${e.amount}`, '#6fe08a', 16);
        else if (e.kind === 'mp') floatText(this, tgt.x, y, `+${e.amount}`, '#7fb0ff', 14);
        else {
          const isPlayer = e.targetId === 'player';
          const col = isPlayer ? '#ff5a5a' : e.crit ? '#ffd34d' : e.kind === 'magic' ? '#c9a6ff' : e.kind === 'dot' ? '#a9e04a' : '#ffffff';
          floatText(this, tgt.x, y, e.crit ? `${e.amount}!` : `${e.amount}`, col, e.crit ? 24 : isPlayer ? 15 : 17);
          if (e.kind === 'physical') {
            const dy = isPlayer ? 30 : 16;
            playSpriteFx(this, 'fx_hit_basic', tgt.x, tgt.y - dy, { follow: () => ({ x: tgt.x, y: tgt.y - dy }) });
          }
          if (!isPlayer && e.element && e.element !== 'neutral' && e.kind !== 'dot') playFx(this, ELEMENT_FX[e.element] ?? 'slash_small', tgt.x, tgt.y - 10);
        }
        break;
      }
      case 'fx': {
        // Effects that carry an offset are attached to their target and move with it.
        const actor = e.offsetY === undefined ? undefined : e.targetId === 'player' ? w.player : e.targetId ? w.monsters.get(e.targetId) : undefined;
        const ox = 0, oy = e.offsetY ?? 0;
        const follow = actor ? () => (e.targetId === 'player' || !(actor as MonsterActor).dead ? { x: actor.x + ox, y: actor.y + oy } : null) : undefined;
        playFx(this, e.fx, e.x, e.y, e.radius, { flipX: e.fx.startsWith('slash') && w.player.x > e.x, follow });
        break;
      }
      case 'projectile': playProjectile(this, e.fx, e.fromX, e.fromY, e.toX, e.toY, e.durationMs, e.color); break;
      case 'sound': audio.play(e.key); break;
      case 'levelUp': floatText(this, w.player.x, w.player.y - 90, e.kind === 'base' ? 'LEVEL UP!' : 'JOB LEVEL UP!', e.kind === 'base' ? '#ffd34d' : '#7fd6ff', 22); break;
      case 'death': {
        const v = this.monViews.get(e.id);
        if (v) v.deadAt = this.time.now;
        break;
      }
      case 'bossIntro': this.cameras.main.flash(400, 80, 20, 80); audio.playMusic('boss_battle'); break;
      case 'bossDefeated': this.cameras.main.flash(600, 255, 230, 160); this.time.delayedCall(3000, () => audio.playMusic(this.world.map.def.bgm)); break;
      case 'playerDied': this.cameras.main.shake(300, 0.01); break;
      case 'jobChanged': this.ensurePlayerTexture(); break;
      case 'statsChanged': this.ensurePlayerTexture(); break;
      default: break;
    }
  }

  private syncPlayer(delta: number) {
    const p = this.world.player;
    this.player.setPosition(Math.round(p.x), Math.round(p.y)).setDepth(p.y);
    const clip = this.playerRig.clips[toCharAnim(p.anim)] ?? this.playerRig.clips.idle;
    const fr = clipFrame(clip, p.dir, this.clipStep(clip, p.animAt));
    this.player.setTexture(clip.key, fr.frame).setFlipX(fr.flipX);
    this.player.setAlpha(this.world.playerStealthed ? 0.45 : 1);
    this.playerName.setPosition(Math.round(p.x), Math.round(p.y) + 6);
    if (p.moving) {
      this.stepTimer -= delta;
      if (this.stepTimer <= 0) { audio.play('footstep'); this.stepTimer = 330; }
    }
  }

  private clipStep(clip: Clip, animAt: number, now = this.world.time): number {
    const f = Math.floor(Math.max(0, now - animAt) / clip.frameMs);
    return clip.loop ? f % clip.count : Math.min(clip.count - 1, f);
  }

  private syncMonsters() {
    const w = this.world;
    for (const [id, m] of w.monsters) {
      let v = this.monViews.get(id);
      if (!v) {
        const rig = monsterRig(this, m.def.id) ?? proceduralMonRig(ensureMonsterTexture(this, m.def));
        const sprite = this.track(this.add.sprite(m.x, m.y, rig.clips.idle.key, 0).setOrigin(rig.originX, rig.originY));
        if (m.boss) sprite.setScale(1.15);
        const name = this.track(this.add.text(m.x, m.y + 4, `${m.def.name}  Lv.${m.def.level}`, labelStyle(m.boss ? '#ff8a7a' : '#ffffff')).setOrigin(0.5, 0).setDepth(1e5 + 2).setResolution(2));
        v = { sprite, name, deadAt: 0, rig };
        this.monViews.set(id, v);
      }
      const s = v.sprite;
      if (m.dead) {
        const since = this.time.now - (v.deadAt || this.time.now);
        const fr = clipFrame(v.rig.clips.death, m.dir, this.clipStep(v.rig.clips.death, 0, since));
        s.setTexture(v.rig.clips.death.key, fr.frame).setFlipX(fr.flipX);
        s.setAlpha(Math.max(0, 1 - since / 1400));
        v.name.setVisible(false);
        s.setVisible(since < 1400);
        continue;
      }
      if (!s.visible || s.alpha < 1) { s.setVisible(true).setAlpha(1); }
      s.setPosition(Math.round(m.x), Math.round(m.y) + (v.rig.originY < 1 ? 1 : 3)).setDepth(m.y);
      const clip = v.rig.clips[toMonAnim(m.anim)] ?? v.rig.clips.idle;
      const fr = clipFrame(clip, m.dir, this.clipStep(clip, m.animAt));
      s.setTexture(clip.key, fr.frame).setFlipX(fr.flipX);
      const frozen = m.statuses.some((st) => st.id === 'freeze');
      const tint = frozen ? 0x9ad8ff : m.statuses.some((st) => st.id === 'poison') ? 0xb8ff9a : m.statuses.some((st) => st.id === 'burn') ? 0xffb08a : m.boss?.enraged ? 0xff8a8a : 0xffffff;
      s.setTint(tint);
      const target = w.currentTarget?.id === id;
      const hover = this.hovered.kind === 'monster' && this.hovered.id === id;
      v.name.setVisible(target || hover || !!m.boss).setPosition(Math.round(m.x), Math.round(m.y) + 6);
      v.name.setColor(target ? '#ffd34d' : m.boss ? '#ff8a7a' : '#ffffff');
    }
    for (const [id, v] of this.monViews) {
      if (!w.monsters.has(id)) { v.sprite.destroy(); v.name.destroy(); this.monViews.delete(id); }
    }
  }

  private syncNpcs(delta: number) {
    this.markerTimer -= delta;
    const refreshMarkers = this.markerTimer <= 0;
    if (refreshMarkers) this.markerTimer = 400;
    for (const n of this.world.npcs) {
      const v = this.npcViews.get(n.npcId);
      if (!v) continue;
      v.sprite.setFrame(frameIndex(n.dir, 'idle', Math.floor(this.time.now / 520) % 2));
      if (refreshMarkers) {
        const mk = npcQuestMarker(this.world.data, this.world.char, n.npcId, this.world.now());
        v.marker.setText(mk === '…' ? '' : mk ?? '').setColor(mk === '?' ? '#7fffa0' : '#ffd34d');
      }
    }
  }

  private syncGround() {
    const w = this.world;
    for (const [id, g] of w.groundItems) {
      if (this.groundViews.has(id)) continue;
      const def = w.data.items.get(g.itemId)!;
      if (def.rarity !== 'common') {
        const glowColor = { uncommon: 0x6fe08a, rare: 0x7fb0ff, epic: 0xc9a6ff, legendary: 0xffd34d }[def.rarity] ?? 0xffffff;
        const glow = this.track(this.add.image(g.x, g.y, 'fx_glow').setTint(glowColor).setScale(0.6).setBlendMode(Phaser.BlendModes.ADD).setDepth(g.y - 21));
        this.tweens.add({ targets: glow, alpha: { from: 0.4, to: 1 }, yoyo: true, repeat: -1, duration: 600 });
        this.time.delayedCall(100, () => { if (!w.groundItems.has(id)) glow.destroy(); });
        this.groundGlows.set(id, glow);
      }
      const img = this.track(this.add.image(g.x, g.y, ensureItemTexture(this, def)).setScale(0.75).setDepth(g.y - 20));
      this.tweens.add({ targets: img, y: g.y - 4, yoyo: true, repeat: -1, duration: 700, ease: 'Sine.easeInOut' });
      this.groundViews.set(id, img);
    }
    for (const [id, img] of this.groundViews) {
      if (w.groundItems.has(id)) continue;
      img.destroy();
      this.groundViews.delete(id);
      this.groundGlows.get(id)?.destroy();
      this.groundGlows.delete(id);
    }
  }

  private drawOverlays() {
    const w = this.world, g = this.gfx, b = this.bars;
    g.clear(); b.clear();
    const now = w.time;
    // Ground zones (Fire Wall, Wind Trap...)
    for (const z of w.zones) {
      const col = z.effect.element === 'fire' ? 0xff6a2e : z.effect.element === 'wind' ? 0x7ad0e0 : 0x9a7aff;
      const pulse = 0.25 + 0.1 * Math.sin(now / 120);
      g.fillStyle(col, pulse); g.fillCircle(z.x, z.y, z.radius);
      g.lineStyle(2, col, 0.8); g.strokeCircle(z.x, z.y, z.radius);
      if (!this.zoneEmitters.has(z.id)) {
        const em = this.track(this.add.particles(z.x, z.y, 'fx_dot', {
          speed: { min: 10, max: 40 }, angle: { min: 250, max: 290 }, lifespan: 600, scale: { start: 0.6, end: 0 }, tint: [col, 0xffffff],
          blendMode: Phaser.BlendModes.ADD, frequency: 60, gravityY: -60,
          emitZone: { type: 'random', source: new Phaser.Geom.Circle(0, 0, z.radius) } as never,
        }).setDepth(z.y + 10));
        this.zoneEmitters.set(z.id, em);
      }
    }
    for (const [id, em] of this.zoneEmitters) if (!w.zones.some((z) => z.id === id)) { em.destroy(); this.zoneEmitters.delete(id); }

    // Boss telegraphs: danger area + fill showing time until impact.
    for (const t of w.telegraphs) {
      const p = Phaser.Math.Clamp((now - t.startsAt) / (t.endsAt - t.startsAt), 0, 1);
      const a = t.endsAt < now ? 0.5 : 0.22;
      if (t.shape === 'circle') {
        g.fillStyle(0xff2a1a, a); g.fillCircle(t.x, t.y, t.radius);
        g.fillStyle(0xff2a1a, 0.35); g.fillCircle(t.x, t.y, t.radius * p);
        g.lineStyle(2, 0xff5a3a, 0.9); g.strokeCircle(t.x, t.y, t.radius);
      } else if (t.shape === 'ring') {
        const inner = t.innerRadius ?? 0;
        g.lineStyle(t.radius - inner, 0xff2a1a, a + 0.1 * p);
        g.strokeCircle(t.x, t.y, (t.radius + inner) / 2);
        g.lineStyle(2, 0xff5a3a, 0.9); g.strokeCircle(t.x, t.y, t.radius); g.strokeCircle(t.x, t.y, inner);
      } else if (t.shape === 'line') {
        const ang = Math.atan2(t.y2! - t.y, t.x2! - t.x), half = (t.width ?? 60) / 2;
        const nx = -Math.sin(ang) * half, ny = Math.cos(ang) * half;
        const pts = [new Phaser.Math.Vector2(t.x + nx, t.y + ny), new Phaser.Math.Vector2(t.x2! + nx, t.y2! + ny), new Phaser.Math.Vector2(t.x2! - nx, t.y2! - ny), new Phaser.Math.Vector2(t.x - nx, t.y - ny)];
        g.fillStyle(0xff2a1a, a + 0.15 * p); g.fillPoints(pts, true);
        g.lineStyle(2, 0xff5a3a, 0.9); g.strokePoints(pts, true);
      }
    }

    // Casting circle under the player.
    const p = w.player;
    if (p.cast) {
      const prog = (now - p.cast.startedAt) / (p.cast.endsAt - p.cast.startedAt);
      g.lineStyle(2, 0x9a7aff, 0.9); g.strokeEllipse(p.x, p.y, 56, 22);
      g.lineStyle(2, 0xd8c8ff, 0.9);
      g.beginPath(); g.arc(p.x, p.y, 20, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2); g.strokePath();
    }
    // Target ring under the current target.
    const tgt = w.currentTarget;
    if (tgt && !tgt.dead) { g.lineStyle(2, 0xffd34d, 0.9); g.strokeEllipse(tgt.x, tgt.y + 2, tgt.halfW * 3 + 10, tgt.halfW + 8); }

    // HP bars: player (+MP) and damaged / targeted monsters.
    const bar = (x: number, y: number, wdt: number, pct: number, col: number) => {
      b.fillStyle(0x1c1622, 0.85); b.fillRect(x - wdt / 2 - 1, y - 1, wdt + 2, 5);
      b.fillStyle(col, 1); b.fillRect(x - wdt / 2, y, Math.max(0, wdt * pct), 3);
    };
    if (!p.dead) {
      bar(p.x, p.y + 20, 36, w.char.hp / w.stats.maxHp, 0x5ad86a);
      bar(p.x, p.y + 25, 36, w.char.mp / w.stats.maxMp, 0x5a9aff);
    }
    for (const m of w.monsters.values()) {
      if (m.dead || m.boss) continue;
      if (m.hp < m.maxHp || tgt === m) bar(m.x, m.y + 18, 32, m.hp / m.maxHp, 0xe04a3a);
    }
  }
}

function labelStyle(color: string): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontFamily: '"Trebuchet MS", Verdana, sans-serif', fontSize: '11px', color, stroke: '#1c1622', strokeThickness: 3 };
}

function toCharAnim(a: AnimState): CharAnim {
  return a === 'dead' ? 'death' : a;
}
function toMonAnim(a: AnimState): MonAnim {
  return a === 'dead' ? 'death' : a === 'cast' ? 'attack' : a;
}
export function frameIndex(dir: Direction, anim: CharAnim, f: number): number {
  return CHAR_DIRECTIONS.indexOf(dir) * CHAR_SHEET_COLS + CHAR_ANIMS[anim].start + f;
}

const procClips = <A extends string>(key: string, anims: Record<A, { start: number; count: number; frameMs: number; loop: boolean }>, cols: number, rows: number) =>
  Object.fromEntries(Object.entries(anims).map(([name, a]) => {
    const m = a as { start: number; count: number; frameMs: number; loop: boolean };
    return [name, { key, cols, rows, directions: CHAR_DIRECTIONS, ...m }];
  })) as Record<string, Clip>;
function proceduralCharRig(key: string): Rig {
  return { clips: procClips(key, CHAR_ANIMS, CHAR_SHEET_COLS, CHAR_DIRECTIONS.length), originX: CHAR_PIVOT.x, originY: CHAR_PIVOT.y };
}
function proceduralMonRig(key: string): Rig {
  return { clips: procClips(key, MON_ANIMS, MON_SHEET_COLS, 1), originX: 0.5, originY: 1 };
}

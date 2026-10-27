// The world simulation: map instance, player, monsters, NPCs, combat, skills,
// loot and portals. It is renderer-agnostic (no Phaser) so it can be unit
// tested headlessly and later run authoritative on the server (Phase 3).
import type { GameData } from './data';
import {
  profileFromDerived, profileFromMonster, resolveAttack, rollStatus,
  type AttackOptions, type CombatProfile,
} from './combat';
import { addExperience, computeDerivedStats, expToNextBase, mergeMods, specialMods } from './formulas';
import {
  addItem, buyItem, canAddItem, canDiscard, depositToStorage, equipItem, findInstance, inventoryWeight,
  removeByUid, sellItem, sortInventory, toggleLock, unequipItem, withdrawFromStorage, type OpResult,
} from './inventory';
import { allocateStat, learnSkill, resetSkills, resetStats } from './character';
import {
  acceptQuest, abandonQuest, questEvents, refreshAllQuests, turnInQuest, type TurnInResult,
} from './quests';
import { compileMap, moveWithCollision, TILE, type CompiledMap } from './mapCompiler';
import { findPath, lineClear } from './pathfinding';
import { Rng } from './rng';
import type {
  BossDef, BossSkillDef, CharacterState, DerivedStats, Direction, Element, EquipSlot, MonsterDef,
  NpcDef, SkillDef, SkillEffect, StatKey, StatModifiers, StatusId,
} from './types';

// ------------------------------------------------------------------ runtime types
export type AnimState = 'idle' | 'walk' | 'attack' | 'cast' | 'hit' | 'dead';

export interface Buff {
  id: string;
  name: string;
  mods: StatModifiers;
  expiresAt: number;
  durationMs: number;
  flags?: string[];
  color: string;
}

export interface StatusInst { id: StatusId; expiresAt: number; stacks: number; nextTickAt: number }

interface MoveState { path: { x: number; y: number }[]; goalX: number; goalY: number; repathAt: number; stuckMs?: number }

interface ActorBase {
  id: string;
  x: number; y: number;
  dir: Direction;
  hp: number; maxHp: number;
  statuses: StatusInst[];
  buffs: Buff[];
  dead: boolean;
  kb: { vx: number; vy: number; until: number } | null;
  anim: AnimState;
  animAt: number;
  moving: boolean;
  move: MoveState | null;
  halfW: number; halfH: number;
}

export type PlayerIntent =
  | { type: 'none' }
  | { type: 'move' }
  | { type: 'attack'; targetId: string }
  | { type: 'cast'; skillId: string; targetId?: string; x?: number; y?: number }
  | { type: 'npc'; npcId: string }
  | { type: 'object'; objectId: string }
  | { type: 'pickup'; groundId: string };

export interface PlayerActor extends ActorBase {
  kind: 'player';
  intent: PlayerIntent;
  moveDir: { x: number; y: number };
  attackReadyAt: number;
  cast: { skillId: string; level: number; startedAt: number; endsAt: number; targetId?: string; x?: number; y?: number } | null;
  cooldowns: Record<string, number>;
  itemCooldowns: Record<string, number>;
  lastCombatAt: number;
  regenAt: number;
  portalArmed: boolean;
  diedAt: number;
}

export type AiState = 'idle' | 'patrol' | 'chase' | 'attack' | 'return' | 'dead';

export interface BossRuntime {
  def: BossDef;
  phase: number;
  engagedAt: number;
  enraged: boolean;
  skillReadyAt: Record<string, number>;
  casting: { skill: BossSkillDef; endsAt: number; x: number; y: number; x2?: number; y2?: number; telegraphId: string } | null;
  introShown: boolean;
  minions: string[];
}

export interface MonsterActor extends ActorBase {
  kind: 'monster';
  def: MonsterDef;
  spawnGroup: number;
  home: { x: number; y: number };
  state: AiState;
  stateUntil: number;
  targetId: string | null;
  attackReadyAt: number;
  patrol: { x: number; y: number } | null;
  threat: Record<string, number>;
  damageBy: Record<string, number>;
  respawnAt: number;
  boss: BossRuntime | null;
  summoned: boolean;
  /** Spawned by a GM command: gives normal rewards but never respawns. */
  temporary?: boolean;
  tauntUntil: number;
}

export interface NpcActor { id: string; npcId: string; def: NpcDef; x: number; y: number; dir: Direction }

export interface GroundItem { id: string; itemId: string; qty: number; x: number; y: number; expiresAt: number; droppedAt: number }

export interface GroundZone {
  id: string; skillId: string; zoneId: string; x: number; y: number; radius: number;
  expiresAt: number; nextTickAt: number; tickMs: number; level: number;
  effect: Extract<SkillEffect, { type: 'groundZone' }>;
}

export interface Telegraph {
  id: string;
  shape: 'circle' | 'ring' | 'line';
  x: number; y: number;
  radius: number;
  innerRadius?: number;
  x2?: number; y2?: number;
  width?: number;
  startsAt: number;
  endsAt: number;
}

export type WorldEvent =
  | { type: 'damage'; targetId: string; amount: number; crit: boolean; miss: boolean; kind: 'physical' | 'magic' | 'heal' | 'mp' | 'dot'; element?: Element }
  | { type: 'fx'; fx: string; x: number; y: number; radius?: number; targetId?: string; /** offset from the target, for effects that follow it */ offsetY?: number }
  | { type: 'projectile'; fromX: number; fromY: number; toX: number; toY: number; durationMs: number; fx: string; color?: string }
  | { type: 'levelUp'; kind: 'base' | 'job'; level: number }
  | { type: 'death'; id: string }
  | { type: 'loot'; itemId: string; qty: number }
  | { type: 'message'; text: string; channel: 'system' | 'combat' | 'loot' | 'quest' | 'error' }
  | { type: 'bossIntro'; name: string; title: string; text: string }
  | { type: 'bossPhase'; name: string; text: string }
  | { type: 'bossEnrage'; name: string }
  | { type: 'bossDefeated'; name: string }
  | { type: 'telegraph'; telegraph: Telegraph }
  | { type: 'mapChanged'; mapId: string }
  | { type: 'sound'; key: string }
  | { type: 'npcInteract'; npcId: string }
  | { type: 'objectInteract'; objectId: string; name: string; text: string }
  | { type: 'playerDied' }
  | { type: 'questUpdate'; questIds: string[] }
  | { type: 'jobChanged'; classId: string }
  | { type: 'castStart'; skillId: string; durationMs: number }
  | { type: 'castEnd'; skillId: string; interrupted: boolean }
  | { type: 'statsChanged' };

export interface WorldOptions {
  rng?: Rng;
  now?: () => number;
  autoLoot?: boolean;
}

const INTERACT_RANGE = 64;
const SERVICE_RANGE = 140;
const PLAYER_HALF_W = 9;
const PLAYER_HALF_H = 6;

function dist(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(bx - ax, by - ay);
}

function dirFromVector(dx: number, dy: number, fallback: Direction): Direction {
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return fallback;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

// ------------------------------------------------------------------ World
export class World {
  readonly data: GameData;
  readonly char: CharacterState;
  readonly rng: Rng;
  readonly now: () => number;
  autoLoot: boolean;

  time = 0;
  map!: CompiledMap;
  player: PlayerActor;
  stats!: DerivedStats;
  monsters = new Map<string, MonsterActor>();
  npcs: NpcActor[] = [];
  groundItems = new Map<string, GroundItem>();
  zones: GroundZone[] = [];
  /** GM god mode: the player takes no damage. */
  godMode = false;
  telegraphs: Telegraph[] = [];
  private pending: { at: number; fn: () => void }[] = [];
  private events: WorldEvent[] = [];
  private compiled = new Map<string, CompiledMap>();
  private spawnCells: { x: number; y: number }[][] = [];
  private bossRespawnAt: Record<string, number> = {};
  private nextId = 1;
  private statsDirty = true;
  private visitedAreas = new Set<string>();

  constructor(data: GameData, character: CharacterState, opts: WorldOptions = {}) {
    this.data = data;
    this.char = character;
    this.rng = opts.rng ?? new Rng();
    this.now = opts.now ?? (() => Date.now());
    this.autoLoot = opts.autoLoot ?? false;
    this.player = {
      id: 'player', kind: 'player', x: 0, y: 0, dir: 'down', hp: 1, maxHp: 1, statuses: [], buffs: [], dead: false,
      kb: null, anim: 'idle', animAt: 0, moving: false, move: null, halfW: PLAYER_HALF_W, halfH: PLAYER_HALF_H,
      intent: { type: 'none' }, moveDir: { x: 0, y: 0 }, attackReadyAt: 0, cast: null, cooldowns: {}, itemCooldowns: {},
      lastCombatAt: -99999, regenAt: 0, portalArmed: false, diedAt: 0,
    };
    this.recomputeStats();
    character.hp = Math.min(Math.max(1, character.hp), this.stats.maxHp);
    character.mp = Math.min(Math.max(0, character.mp), this.stats.maxMp);
    refreshAllQuests(data, character);
    const pos = character.position;
    this.enterMap(pos.mapId, { x: pos.x, y: pos.y });
  }

  // ---------------------------------------------------------------- utils
  private uid(prefix: string) { return `${prefix}${this.nextId++}`; }
  emit(e: WorldEvent) { this.events.push(e); }
  drainEvents(): WorldEvent[] { const e = this.events; this.events = []; return e; }
  message(text: string, channel: Extract<WorldEvent, { type: 'message' }>['channel'] = 'system') {
    this.emit({ type: 'message', text, channel });
  }
  private schedule(delayMs: number, fn: () => void) { this.pending.push({ at: this.time + delayMs, fn }); }

  getCompiledMap(mapId: string): CompiledMap {
    let m = this.compiled.get(mapId);
    if (!m) {
      const def = this.data.maps.get(mapId);
      if (!def) throw new Error(`Unknown map ${mapId}`);
      m = compileMap(this.data, def);
      this.compiled.set(mapId, m);
    }
    return m;
  }

  invalidateStats() { this.statsDirty = true; }

  private runtimeMods(): StatModifiers[] {
    const mods: StatModifiers[] = this.player.buffs.map((b) => b.mods);
    for (const s of this.player.statuses) {
      const def = this.data.statuses.get(s.id);
      if (def?.mods) mods.push(def.mods);
    }
    return mods;
  }

  recomputeStats() {
    const before = this.stats;
    this.stats = computeDerivedStats(this.data, this.char, this.runtimeMods());
    this.player.maxHp = this.stats.maxHp;
    this.char.hp = Math.min(this.char.hp, this.stats.maxHp);
    this.char.mp = Math.min(this.char.mp, this.stats.maxMp);
    this.player.hp = this.char.hp;
    this.statsDirty = false;
    if (before) this.emit({ type: 'statsChanged' });
  }

  get weightLimit() { return this.stats.weightLimit; }
  get weight() { return inventoryWeight(this.data, this.char); }

  // ---------------------------------------------------------------- map lifecycle
  enterMap(mapId: string, spawn: string | { x: number; y: number }) {
    const map = this.getCompiledMap(mapId);
    this.map = map;
    this.monsters.clear();
    this.groundItems.clear();
    this.zones = [];
    this.telegraphs = [];
    this.pending = [];
    this.visitedAreas.clear();

    let pos: { x: number; y: number };
    if (typeof spawn === 'string') {
      const sp = map.def.spawnPoints[spawn] ?? map.def.spawnPoints.default;
      pos = { x: sp.x * TILE + TILE / 2, y: sp.y * TILE + TILE / 2 };
    } else {
      pos = spawn;
      const cx = Math.floor(pos.x / TILE), cy = Math.floor(pos.y / TILE);
      if (cx < 0 || cy < 0 || cx >= map.width || cy >= map.height || map.collision[cy * map.width + cx] || !map.reachable[cy * map.width + cx]) {
        const sp = map.def.spawnPoints.default;
        pos = { x: sp.x * TILE + TILE / 2, y: sp.y * TILE + TILE / 2 };
      }
    }
    const p = this.player;
    p.x = pos.x; p.y = pos.y;
    p.intent = { type: 'none' };
    p.move = null;
    p.cast = null;
    p.kb = null;
    p.portalArmed = false;
    this.char.position = { mapId, x: p.x, y: p.y };

    this.npcs = map.def.npcs.map((n) => ({
      id: `npc:${n.npcId}`, npcId: n.npcId, def: this.data.npcs.get(n.npcId)!,
      x: n.x * TILE + TILE / 2, y: n.y * TILE + TILE / 2 + 4, dir: n.facing ?? 'down',
    }));

    this.spawnCells = map.def.monsterSpawns.map((s) => {
      const cells: { x: number; y: number }[] = [];
      for (let y = s.area.y; y < s.area.y + s.area.h; y++) for (let x = s.area.x; x < s.area.x + s.area.w; x++) {
        const i = y * map.width + x;
        if (x >= 0 && y >= 0 && x < map.width && y < map.height && !map.collision[i] && map.reachable[i]) cells.push({ x, y });
      }
      return cells;
    });
    map.def.monsterSpawns.forEach((s, gi) => {
      for (let k = 0; k < s.count; k++) this.spawnMonster(s.monsterId, gi);
    });
    if (map.def.bossSpawn && (this.bossRespawnAt[map.def.bossSpawn.bossId] ?? 0) <= this.time) this.spawnBoss();

    this.emit({ type: 'mapChanged', mapId });
    const updated = questEvents.explore(this.data, this.char, mapId);
    if (updated.length) this.questUpdated(updated);
    this.message(`Entered ${map.def.name}${map.def.levelRange ? ` (Lv.${map.def.levelRange[0]}–${map.def.levelRange[1]})` : ''}.`);
  }

  private randomSpawnPoint(group: number): { x: number; y: number } {
    const cells = this.spawnCells[group];
    if (!cells?.length) {
      const sp = this.map.def.spawnPoints.default;
      return { x: sp.x * TILE + TILE / 2, y: sp.y * TILE + TILE / 2 };
    }
    // Avoid spawning right on top of the player.
    for (let tries = 0; tries < 8; tries++) {
      const c = this.rng.pick(cells);
      const pt = { x: c.x * TILE + TILE / 2, y: c.y * TILE + TILE / 2 };
      if (dist(pt.x, pt.y, this.player.x, this.player.y) > 160 || tries === 7) return pt;
    }
    const c = cells[0];
    return { x: c.x * TILE + TILE / 2, y: c.y * TILE + TILE / 2 };
  }

  private makeMonster(def: MonsterDef, x: number, y: number, group: number): MonsterActor {
    const r = def.collisionRadius;
    return {
      id: this.uid('m'), kind: 'monster', def, x, y, dir: 'down', hp: def.maxHp, maxHp: def.maxHp,
      statuses: [], buffs: [], dead: false, kb: null, anim: 'idle', animAt: this.time, moving: false, move: null,
      halfW: Math.max(6, Math.round(r * 0.7)), halfH: Math.max(4, Math.round(r * 0.45)),
      spawnGroup: group, home: { x, y }, state: 'idle', stateUntil: this.time + this.rng.range(500, 3000),
      targetId: null, attackReadyAt: 0, patrol: null, threat: {}, damageBy: {}, respawnAt: 0, boss: null, summoned: false, tauntUntil: 0,
    };
  }

  spawnMonster(monsterId: string, group: number): MonsterActor {
    const def = this.data.monsters.get(monsterId)!;
    const pt = this.randomSpawnPoint(group);
    const m = this.makeMonster(def, pt.x, pt.y, group);
    this.monsters.set(m.id, m);
    return m;
  }

  /** Places a monster at a point (GM tool). It fights and rewards normally but does not respawn. */
  spawnMonsterAt(monsterId: string, x: number, y: number): MonsterActor | null {
    const def = this.data.monsters.get(monsterId);
    if (!def) return null;
    const m = this.makeMonster(def, x, y, -1);
    m.temporary = true;
    this.monsters.set(m.id, m);
    this.emit({ type: 'fx', fx: 'spawn', x, y });
    return m;
  }

  private spawnBoss() {
    const bs = this.map.def.bossSpawn!;
    const bossDef = this.data.bosses.get(bs.bossId)!;
    const def = this.data.monsters.get(bossDef.monsterId)!;
    const m = this.makeMonster(def, bs.x * TILE + TILE / 2, bs.y * TILE + TILE / 2, -1);
    m.boss = { def: bossDef, phase: 0, engagedAt: 0, enraged: false, skillReadyAt: {}, casting: null, introShown: false, minions: [] };
    this.monsters.set(m.id, m);
  }

  // ---------------------------------------------------------------- main loop
  update(dtMs: number) {
    const dt = Math.min(dtMs, 100);
    this.time += dt;
    this.char.stats_meta.playTimeMs += dt;

    if (this.statsDirty) this.recomputeStats();
    this.updatePlayer(dt);
    for (const m of this.monsters.values()) this.updateMonster(m, dt);
    this.updateZones();
    this.updatePending();
    this.updateGroundItems();
    this.telegraphs = this.telegraphs.filter((t) => t.endsAt > this.time - 200);
    if (this.statsDirty) this.recomputeStats();
    this.char.position = { mapId: this.map.def.id, x: this.player.x, y: this.player.y };
  }

  private updatePending() {
    if (!this.pending.length) return;
    const due = this.pending.filter((p) => p.at <= this.time);
    if (!due.length) return;
    this.pending = this.pending.filter((p) => p.at > this.time);
    for (const p of due) p.fn();
  }

  private updateGroundItems() {
    for (const [id, g] of this.groundItems) if (g.expiresAt <= this.time) this.groundItems.delete(id);
  }

  // ---------------------------------------------------------------- statuses / buffs
  private hasStatusFlag(a: ActorBase, flag: 'preventsMove' | 'preventsAction' | 'preventsSkills'): boolean {
    return a.statuses.some((s) => this.data.statuses.get(s.id)?.[flag]);
  }

  private tickStatuses(a: PlayerActor | MonsterActor) {
    let changed = false;
    for (const s of [...a.statuses]) {
      const def = this.data.statuses.get(s.id)!;
      if (def.dot && s.nextTickAt <= this.time && !a.dead) {
        s.nextTickAt = this.time + def.dot.tickMs;
        const maxHp = a.kind === 'player' ? this.stats.maxHp : a.maxHp;
        let dmg = Math.round((maxHp * def.dot.pctMaxHp + def.dot.flat) * s.stacks);
        const curHp = a.kind === 'player' ? this.char.hp : a.hp;
        if (!def.dot.canKill) dmg = Math.min(dmg, curHp - 1);
        if (dmg > 0) {
          if (a.kind === 'player') this.damagePlayer(dmg, 'dot', def.dot.element, null, false);
          else this.damageMonster(a, dmg, 'dot', def.dot.element, false, false, true);
        }
      }
      if (s.expiresAt <= this.time) {
        a.statuses.splice(a.statuses.indexOf(s), 1);
        changed = true;
      }
    }
    for (const b of [...a.buffs]) if (b.expiresAt <= this.time) {
      a.buffs.splice(a.buffs.indexOf(b), 1);
      changed = true;
      if (a.kind === 'player') this.message(`${b.name} has worn off.`);
    }
    if (changed && a.kind === 'player') this.invalidateStats();
  }

  applyStatus(a: PlayerActor | MonsterActor, status: StatusId, chance: number, durationMs?: number): boolean {
    if (a.dead) return false;
    const def = this.data.statuses.get(status);
    if (!def) return false;
    let dur: number;
    if (a.kind === 'player') {
      const total = this.stats.totalStats;
      dur = rollStatus(this.data, this.rng, { element: 'neutral', resistValue: (k) => total[k as StatKey] ?? 0 }, status, chance, durationMs);
    } else {
      const m = a.def;
      dur = rollStatus(this.data, this.rng, { element: m.element, resistValue: () => m.level * 0.5, immune: m.statusImmune }, status, chance, durationMs);
    }
    if (!dur) return false;
    const existing = a.statuses.find((s) => s.id === status);
    if (existing) {
      existing.stacks = Math.min(def.stackLimit, existing.stacks + 1);
      existing.expiresAt = Math.max(existing.expiresAt, this.time + dur);
    } else {
      a.statuses.push({ id: status, expiresAt: this.time + dur, stacks: 1, nextTickAt: this.time + (def.dot?.tickMs ?? 1000) });
    }
    if (def.preventsAction && a.kind === 'player' && a.cast) this.interruptCast();
    if (def.preventsMove) { a.move = null; a.moving = false; }
    this.emit({ type: 'fx', fx: `status_${status}`, x: a.x, y: a.y, targetId: a.id });
    if (a.kind === 'player') {
      this.message(`You are afflicted with ${def.name}!`, 'combat');
      this.invalidateStats();
    }
    return true;
  }

  cureStatuses(a: PlayerActor | MonsterActor, ids: StatusId[]): number {
    const before = a.statuses.length;
    a.statuses = a.statuses.filter((s) => !ids.includes(s.id));
    if (a.kind === 'player') this.invalidateStats();
    return before - a.statuses.length;
  }

  addBuff(a: PlayerActor | MonsterActor, buff: Omit<Buff, 'expiresAt'>) {
    a.buffs = a.buffs.filter((b) => b.id !== buff.id);
    a.buffs.push({ ...buff, expiresAt: this.time + buff.durationMs });
    if (a.kind === 'player') this.invalidateStats();
  }

  private breakStealth() {
    const p = this.player;
    const before = p.buffs.length;
    p.buffs = p.buffs.filter((b) => !b.flags?.includes('breakOnAttack'));
    if (p.buffs.length !== before) { this.invalidateStats(); this.message('You reveal yourself.'); }
  }

  get playerStealthed(): boolean {
    return specialMods(this.player.buffs.map((b) => b.mods)).stealth > 0;
  }

  // ---------------------------------------------------------------- movement helpers
  private stepActor(a: ActorBase, tx: number, ty: number, speed: number, dt: number): boolean {
    const d = dist(a.x, a.y, tx, ty);
    if (d < 1) return true;
    const step = Math.min(d, (speed * dt) / 1000);
    const dx = ((tx - a.x) / d) * step, dy = ((ty - a.y) / d) * step;
    const r = moveWithCollision(this.map, a.x, a.y, dx, dy, a.halfW, a.halfH);
    a.x = r.x; a.y = r.y;
    a.dir = dirFromVector(dx, dy, a.dir);
    a.moving = true;
    return dist(a.x, a.y, tx, ty) < 2;
  }

  /** Moves toward a goal using direct steps when clear, otherwise A*. Returns true on arrival. */
  private moveToward(a: ActorBase, gx: number, gy: number, speed: number, dt: number, stopDist = 2): boolean {
    if (dist(a.x, a.y, gx, gy) <= stopDist) { a.move = null; return true; }
    const needRepath = !a.move || a.move.repathAt <= this.time || dist(a.move.goalX, a.move.goalY, gx, gy) > 24;
    if (needRepath) {
      const stuckMs = a.move?.stuckMs ?? 0;
      if (lineClear(this.map, a.x, a.y, gx, gy, a.halfW, a.halfH)) {
        a.move = { path: [{ x: gx, y: gy }], goalX: gx, goalY: gy, repathAt: this.time + 250, stuckMs };
      } else {
        const path = findPath(this.map, a.x, a.y, gx, gy);
        a.move = { path: path ?? [], goalX: gx, goalY: gy, repathAt: this.time + 600, stuckMs };
        if (!path) return false;
      }
    }
    const mv = a.move!;
    let budget = dt;
    while (mv.path.length && budget > 0) {
      const wp = mv.path[0];
      const before = { x: a.x, y: a.y };
      const arrived = this.stepActor(a, wp.x, wp.y, speed, budget);
      const moved = dist(before.x, before.y, a.x, a.y);
      if (arrived) { mv.path.shift(); budget -= (moved / speed) * 1000 + 1; mv.stuckMs = 0; }
      else {
        if (moved < 0.05) {
          // No progress (e.g. squeezed against an obstacle): repath, and give up after a moment.
          mv.repathAt = 0;
          mv.stuckMs = (mv.stuckMs ?? 0) + dt;
          if (mv.stuckMs > 800) { a.move = null; return true; }
        } else mv.stuckMs = 0;
        break;
      }
      if (dist(a.x, a.y, gx, gy) <= stopDist) { a.move = null; return true; }
    }
    if (!mv.path.length) { a.move = null; return dist(a.x, a.y, gx, gy) <= Math.max(stopDist, 4); }
    return false;
  }

  private applyKnockback(a: ActorBase, dt: number): boolean {
    if (!a.kb) return false;
    if (a.kb.until <= this.time) { a.kb = null; return false; }
    const r = moveWithCollision(this.map, a.x, a.y, (a.kb.vx * dt) / 1000, (a.kb.vy * dt) / 1000, a.halfW, a.halfH);
    a.x = r.x; a.y = r.y;
    return true;
  }

  // ---------------------------------------------------------------- player
  private updatePlayer(dt: number) {
    const p = this.player;
    p.moving = false;
    if (p.dead) return;
    this.tickStatuses(p);
    if (p.dead) return;
    this.regen();
    if (this.applyKnockback(p, dt)) return;

    const cannotMove = this.hasStatusFlag(p, 'preventsMove');
    const cannotAct = this.hasStatusFlag(p, 'preventsAction');

    if (p.cast && !cannotAct && this.time >= p.cast.endsAt) {
      const c = p.cast;
      p.cast = null;
      this.emit({ type: 'castEnd', skillId: c.skillId, interrupted: false });
      this.executeSkill(c.skillId, c.level, c.targetId, c.x, c.y);
    }
    if (p.cast) return;

    // Keyboard movement overrides everything else.
    if ((p.moveDir.x || p.moveDir.y) && !cannotMove) {
      p.intent = { type: 'none' };
      p.move = null;
      const len = Math.hypot(p.moveDir.x, p.moveDir.y);
      const step = (this.stats.moveSpeed * dt) / 1000;
      const dx = (p.moveDir.x / len) * step, dy = (p.moveDir.y / len) * step;
      const r = moveWithCollision(this.map, p.x, p.y, dx, dy, p.halfW, p.halfH);
      p.x = r.x; p.y = r.y;
      p.dir = dirFromVector(dx, dy, p.dir);
      p.moving = true;
      this.afterPlayerMoved();
      if (p.anim !== 'hit' || this.time - p.animAt > 400) this.setAnim(p, 'walk');
      return;
    }

    const it = p.intent;
    switch (it.type) {
      case 'move': {
        if (cannotMove || !p.move) { if (!p.move) p.intent = { type: 'none' }; break; }
        const goal = p.move;
        if (this.moveToward(p, goal.goalX, goal.goalY, this.stats.moveSpeed, dt, 3)) p.intent = { type: 'none' };
        break;
      }
      case 'attack': {
        const m = this.monsters.get(it.targetId);
        if (!m || m.dead) { p.intent = { type: 'none' }; p.move = null; break; }
        const range = this.stats.attackRange + m.halfW;
        const d = dist(p.x, p.y, m.x, m.y);
        if (d > range) {
          if (!cannotMove) this.moveToward(p, m.x, m.y, this.stats.moveSpeed, dt, range - 6);
        } else {
          p.move = null;
          p.dir = dirFromVector(m.x - p.x, m.y - p.y, p.dir);
          if (!cannotAct && this.time >= p.attackReadyAt) this.playerBasicAttack(m);
        }
        break;
      }
      case 'cast': {
        const skill = this.data.skills.get(it.skillId)!;
        let tx = it.x, ty = it.y;
        if (it.targetId) {
          const m = this.monsters.get(it.targetId);
          if (!m || m.dead) { p.intent = { type: 'none' }; break; }
          tx = m.x; ty = m.y;
        }
        if (tx == null || ty == null) { p.intent = { type: 'none' }; break; }
        const range = skill.range + (it.targetId ? this.monsters.get(it.targetId)!.halfW : 0);
        if (dist(p.x, p.y, tx, ty) > range) {
          if (!cannotMove) this.moveToward(p, tx, ty, this.stats.moveSpeed, dt, range - 8);
        } else {
          p.move = null;
          p.intent = it.targetId ? { type: 'attack', targetId: it.targetId } : { type: 'none' };
          this.beginCast(skill, it.targetId, tx, ty);
        }
        break;
      }
      case 'npc': {
        const n = this.npcs.find((x) => x.npcId === it.npcId);
        if (!n) { p.intent = { type: 'none' }; break; }
        if (dist(p.x, p.y, n.x, n.y) <= INTERACT_RANGE) {
          p.move = null;
          p.intent = { type: 'none' };
          p.dir = dirFromVector(n.x - p.x, n.y - p.y, p.dir);
          this.talkToNpc(n.npcId);
        } else if (!cannotMove) this.moveToward(p, n.x, n.y, this.stats.moveSpeed, dt, INTERACT_RANGE - 12);
        break;
      }
      case 'object': {
        const o = this.map.objects.find((x) => x.id === it.objectId);
        if (!o) { p.intent = { type: 'none' }; break; }
        const ox = (o.x + o.w / 2) * TILE, oy = (o.y + o.h / 2) * TILE;
        const reach = INTERACT_RANGE + Math.max(o.w, o.h) * 10;
        if (dist(p.x, p.y, ox, oy) <= reach) {
          p.move = null;
          p.intent = { type: 'none' };
          this.interactObject(it.objectId);
        } else if (!cannotMove) this.moveToward(p, ox, oy + (o.h * TILE) / 2 + 8, this.stats.moveSpeed, dt, reach - 16);
        break;
      }
      case 'pickup': {
        const g = this.groundItems.get(it.groundId);
        if (!g) { p.intent = { type: 'none' }; break; }
        if (dist(p.x, p.y, g.x, g.y) <= this.data.balance.combat.pickupRange) {
          p.move = null;
          p.intent = { type: 'none' };
          this.pickup(g.id);
        } else if (!cannotMove) this.moveToward(p, g.x, g.y, this.stats.moveSpeed, dt, 10);
        break;
      }
      case 'none': break;
    }
    if (p.moving) this.afterPlayerMoved();
    if (p.anim !== 'attack' && p.anim !== 'cast' && p.anim !== 'hit' || this.time - p.animAt > 400) {
      this.setAnim(p, p.moving ? 'walk' : 'idle');
    }
  }

  private setAnim(a: ActorBase, anim: AnimState) {
    if (a.anim !== anim) { a.anim = anim; a.animAt = this.time; }
  }

  private afterPlayerMoved() {
    const p = this.player;
    const cx = p.x / TILE, cy = p.y / TILE;
    const inAny = this.map.def.portals.find((pt) => cx >= pt.x && cx < pt.x + pt.w && cy >= pt.y && cy < pt.y + pt.h);
    if (!inAny) p.portalArmed = true;
    else if (p.portalArmed) {
      this.message(`Travelling to ${inAny.label}...`);
      this.emit({ type: 'sound', key: 'teleport' });
      this.emit({ type: 'fx', fx: 'teleport', x: p.x, y: p.y });
      this.enterMap(inAny.targetMap, inAny.targetSpawn);
      return;
    }
    for (const area of this.map.def.areas) {
      const r = area.rect;
      if (cx >= r.x && cx < r.x + r.w && cy >= r.y && cy < r.y + r.h && !this.visitedAreas.has(area.id)) {
        this.visitedAreas.add(area.id);
        this.message(`— ${area.name} —`);
        const updated = questEvents.explore(this.data, this.char, this.map.def.id, area.id);
        if (updated.length) this.questUpdated(updated);
      }
    }
  }

  private regen() {
    const p = this.player;
    if (this.time < p.regenAt) return;
    p.regenAt = this.time + this.data.balance.stats.regenIntervalMs;
    const overweight = this.weight > (this.weightLimit * this.data.balance.stats.overweightRegenStopPct) / 100;
    if (overweight) return;
    const inCombat = this.time - p.lastCombatAt < this.data.balance.combat.combatTagMs;
    const mul = inCombat ? 1 : this.data.balance.stats.outOfCombatRegenMul;
    const hp = Math.min(this.stats.maxHp - this.char.hp, this.stats.hpRegen * mul);
    const mp = Math.min(this.stats.maxMp - this.char.mp, this.stats.mpRegen * mul);
    if (hp > 0) { this.char.hp += hp; p.hp = this.char.hp; }
    if (mp > 0) this.char.mp += mp;
  }

  playerProfile(): CombatProfile {
    return profileFromDerived(this.char.baseLevel, this.stats, 'neutral');
  }

  private monsterProfile(m: MonsterActor): CombatProfile {
    let atkMul = 1;
    if (m.boss) {
      atkMul = m.boss.def.phases[m.boss.phase].atkMul * (m.boss.enraged ? m.boss.def.enrage.atkMul : 1);
    }
    const prof = profileFromMonster(this.data, m.def, atkMul);
    for (const s of m.statuses) {
      const d = this.data.statuses.get(s.id);
      if (d?.mods?.pdefPct) prof.pdef = Math.floor(prof.pdef * (1 + d.mods.pdefPct / 100));
      if (d?.mods?.patkPct) prof.patk = Math.floor(prof.patk * (1 + d.mods.patkPct / 100));
      if (d?.mods?.hit) prof.hit += d.mods.hit;
      if (d?.mods?.flee) prof.flee += d.mods.flee;
    }
    return prof;
  }

  private playerBasicAttack(m: MonsterActor, isCounter = false) {
    const p = this.player;
    if (!isCounter) p.attackReadyAt = this.time + this.stats.attackIntervalMs;
    p.lastCombatAt = this.time;
    this.setAnim(p, 'attack');
    p.animAt = this.time;
    this.breakStealth();
    const kind = this.stats.attackKind;
    const opts: AttackOptions = {
      kind: kind === 'magic' ? 'magic' : 'physical',
      multiplier: kind === 'magic' ? 0.75 : 1,
      element: this.stats.weaponElement,
    };
    const resolve = () => {
      if (m.dead) return;
      const res = resolveAttack(this.data, this.rng, this.playerProfile(), this.monsterProfile(m), opts);
      if (!res.hit) {
        this.emit({ type: 'damage', targetId: m.id, amount: 0, crit: false, miss: true, kind: 'physical' });
        this.aggroMonster(m, 1);
        return;
      }
      this.emit({ type: 'sound', key: res.crit ? 'crit' : 'hit' });
      if (res.crit) this.emit({ type: 'fx', fx: 'crit', x: m.x, y: m.y - 16 });
      this.damageMonster(m, res.damage, opts.kind, opts.element, res.crit, false);
    };
    if (kind === 'melee') {
      this.emit({ type: 'sound', key: 'swing' });
      this.emit({ type: 'fx', fx: 'slash_small', x: m.x, y: m.y - 12, targetId: m.id, offsetY: -12 });
      resolve();
    } else {
      const travel = (dist(p.x, p.y, m.x, m.y) / this.data.balance.combat.projectileSpeed) * 1000;
      this.emit({ type: 'sound', key: kind === 'magic' ? 'zap' : 'bow' });
      this.emit({
        type: 'projectile', fromX: p.x, fromY: p.y - 24, toX: m.x, toY: m.y - 14, durationMs: travel,
        fx: kind === 'magic' ? 'magic_orb' : 'arrow', color: kind === 'magic' ? '#9ad8ff' : undefined,
      });
      this.schedule(travel, resolve);
    }
  }

  // ---------------------------------------------------------------- damage
  damageMonster(m: MonsterActor, amount: number, kind: 'physical' | 'magic' | 'dot', element: Element, crit: boolean, _fromZone: boolean, silentAggro = false) {
    if (m.dead) return;
    m.hp = Math.max(0, m.hp - amount);
    m.damageBy.player = (m.damageBy.player ?? 0) + amount;
    this.emit({ type: 'damage', targetId: m.id, amount, crit, miss: false, kind: kind === 'dot' ? 'dot' : kind, element });
    // Sleep/freeze break on damage.
    m.statuses = m.statuses.filter((s) => !this.data.statuses.get(s.id)?.breaksOnDamage || kind === 'dot');
    if (m.hp <= 0) { this.killMonster(m); return; }
    if (this.time - m.animAt > 250) this.setAnim(m, 'hit');
    this.player.lastCombatAt = this.time;
    if (!silentAggro || m.state !== 'return') this.aggroMonster(m, amount);
  }

  private aggroMonster(m: MonsterActor, threat: number) {
    if (m.dead || m.state === 'return') return;
    m.threat.player = (m.threat.player ?? 0) + threat;
    if (m.targetId) return;
    m.targetId = 'player';
    m.state = 'chase';
    this.onBossEngage(m);
    // Assist: when first provoked, a few nearby monsters of the same kind join in.
    const assist = m.def.aiType === 'assist' || m.def.aiFlags?.includes('assist');
    if (assist) {
      const { assistRange, assistMax } = this.data.balance.combat;
      const helpers = [...this.monsters.values()]
        .filter((o) => o !== m && !o.dead && o.def.id === m.def.id && !o.targetId && o.state !== 'return' && dist(o.x, o.y, m.x, m.y) <= assistRange)
        .sort((a, b) => dist(a.x, a.y, m.x, m.y) - dist(b.x, b.y, m.x, m.y))
        .slice(0, assistMax);
      for (const o of helpers) { o.targetId = 'player'; o.state = 'chase'; o.threat.player = 1; }
    }
  }

  damagePlayer(amount: number, kind: 'physical' | 'magic' | 'dot', element: Element, attacker: MonsterActor | null, crit: boolean) {
    const p = this.player;
    if (p.dead) return;
    if (this.godMode) { this.emit({ type: 'damage', targetId: 'player', amount: 0, crit: false, miss: true, kind: kind === 'dot' ? 'dot' : kind }); return; }
    const special = specialMods(p.buffs.map((b) => b.mods));
    let hpDmg = amount;
    if (special.damageToMpPct > 0 && kind !== 'dot' && this.char.mp > 0) {
      const toMp = Math.min(this.char.mp, Math.floor((amount * special.damageToMpPct) / 100));
      this.char.mp -= toMp;
      hpDmg -= toMp;
      if (toMp > 0) this.emit({ type: 'damage', targetId: 'player', amount: toMp, crit: false, miss: false, kind: 'mp' });
    }
    this.char.hp = Math.max(0, this.char.hp - hpDmg);
    p.hp = this.char.hp;
    p.lastCombatAt = this.time;
    this.emit({ type: 'damage', targetId: 'player', amount: hpDmg, crit, miss: false, kind: kind === 'dot' ? 'dot' : kind, element });
    if (kind !== 'dot') {
      const before = p.statuses.length;
      p.statuses = p.statuses.filter((s) => !this.data.statuses.get(s.id)?.breaksOnDamage);
      if (p.statuses.length !== before) this.invalidateStats();
      if (!p.cast && this.time - p.animAt > 300 && p.anim !== 'attack') this.setAnim(p, 'hit');
    }
    if (this.char.hp <= 0) { this.killPlayer(); return; }
    // Counter Attack stance.
    if (attacker && kind === 'physical' && special.counterChance > 0 && !attacker.dead &&
        dist(p.x, p.y, attacker.x, attacker.y) <= this.stats.attackRange + attacker.halfW + 8 &&
        this.rng.chance(special.counterChance / 100)) {
      this.emit({ type: 'fx', fx: 'counter', x: p.x, y: p.y - 30 });
      this.playerBasicAttack(attacker, true);
    }
  }

  private killPlayer() {
    const p = this.player;
    p.dead = true;
    p.diedAt = this.time;
    p.intent = { type: 'none' };
    p.move = null;
    p.cast = null;
    p.statuses = [];
    p.buffs = [];
    this.setAnim(p, 'dead');
    this.char.stats_meta.deaths++;
    const penalty = Math.floor((expToNextBase(this.data, this.char.baseLevel) * this.data.balance.levels.deathExpPenaltyPct) / 100);
    const lost = Math.min(this.char.baseExp, penalty);
    this.char.baseExp -= lost;
    this.emit({ type: 'playerDied' });
    this.emit({ type: 'sound', key: 'death' });
    this.message(`You have been defeated...${lost ? ` Lost ${lost} Base EXP.` : ''}`, 'error');
    for (const m of this.monsters.values()) if (m.targetId === 'player') this.monsterReturn(m);
    this.invalidateStats();
  }

  respawn() {
    const p = this.player;
    if (!p.dead) return;
    p.dead = false;
    this.recomputeStats();
    this.char.hp = Math.max(1, Math.floor(this.stats.maxHp * this.data.balance.combat.playerRespawnHpPct));
    this.char.mp = Math.max(this.char.mp, Math.floor(this.stats.maxMp * 0.3));
    p.hp = this.char.hp;
    this.setAnim(p, 'idle');
    this.enterMap(this.char.savePoint.mapId, this.char.savePoint.spawn);
    this.emit({ type: 'fx', fx: 'heal', x: p.x, y: p.y });
  }

  private killMonster(m: MonsterActor) {
    m.dead = true;
    m.state = 'dead';
    m.hp = 0;
    m.move = null;
    m.statuses = [];
    this.setAnim(m, 'dead');
    this.emit({ type: 'death', id: m.id });
    this.emit({ type: 'sound', key: m.boss ? 'boss_death' : 'monster_death' });
    const p = this.player;
    if (p.intent.type === 'attack' && p.intent.targetId === m.id) p.intent = { type: 'none' };

    if (m.summoned) { this.schedule(1500, () => this.monsters.delete(m.id)); return; }

    const contributed = (m.damageBy.player ?? 0) > 0;
    if (contributed) {
      this.char.stats_meta.kills++;
      this.grantExp(m.def.exp, m.def.jobExp, m.def.name);
      this.rollDrops(m);
      const updated = questEvents.kill(this.data, this.char, m.def.id);
      if (m.boss) {
        updated.push(...questEvents.bossKill(this.data, this.char, m.boss.def.id));
        this.char.stats_meta.bossKills[m.boss.def.id] = (this.char.stats_meta.bossKills[m.boss.def.id] ?? 0) + 1;
      }
      if (updated.length) this.questUpdated([...new Set(updated)]);
    }
    if (m.boss) {
      const b = m.boss;
      this.emit({ type: 'bossDefeated', name: m.def.name });
      this.message(`${m.def.name} has been defeated!`, 'quest');
      for (const id of b.minions) { const mm = this.monsters.get(id); if (mm && !mm.dead) this.killMinionSilently(mm); }
      const pct = ((m.damageBy.player ?? 0) / m.def.maxHp) * 100;
      if (pct >= b.def.contributionRewards.minDamagePct) {
        const cr = b.def.contributionRewards;
        this.char.luma += cr.luma;
        for (const r of cr.items) this.giveItem(r.itemId, r.qty, 'Contribution reward');
        this.message(`Contribution reward: ${cr.luma} Luma.`, 'loot');
      }
      const respawnSec = this.map.def.bossSpawn?.respawnSeconds ?? m.def.respawnSeconds;
      this.bossRespawnAt[b.def.id] = this.time + respawnSec * 1000;
      const mapId = this.map.def.id;
      this.schedule(respawnSec * 1000, () => {
        if (this.map.def.id === mapId) { this.monsters.delete(m.id); this.spawnBoss(); this.message('You feel a malevolent presence return to the forest...'); }
      });
      this.telegraphs = [];
    } else if (m.temporary) {
      this.schedule(1500, () => this.monsters.delete(m.id));
    } else {
      m.respawnAt = this.time + m.def.respawnSeconds * 1000;
    }
  }

  private killMinionSilently(m: MonsterActor) {
    m.dead = true; m.state = 'dead'; this.setAnim(m, 'dead');
    this.emit({ type: 'death', id: m.id });
    this.schedule(1200, () => this.monsters.delete(m.id));
  }

  grantExp(base: number, job: number, source?: string) {
    const c = this.char;
    const res = addExperience(this.data, c, base, job);
    if (source) this.message(`+${base} Base EXP, +${job} Job EXP (${source})`, 'combat');
    if (res.baseLevelsGained) {
      this.recomputeStats();
      c.hp = this.stats.maxHp; c.mp = this.stats.maxMp; this.player.hp = c.hp;
      this.emit({ type: 'levelUp', kind: 'base', level: c.baseLevel });
      this.emit({ type: 'fx', fx: 'level_up', x: this.player.x, y: this.player.y, targetId: 'player', offsetY: 0 });
      this.emit({ type: 'sound', key: 'level_up' });
      this.message(`Base Level up! You are now level ${c.baseLevel}. Stat points: ${c.statPoints}`, 'quest');
    }
    if (res.jobLevelsGained) {
      this.emit({ type: 'levelUp', kind: 'job', level: c.jobLevel });
      this.emit({ type: 'fx', fx: 'job_up', x: this.player.x, y: this.player.y });
      this.emit({ type: 'sound', key: 'level_up' });
      this.message(`Job Level up! Job level ${c.jobLevel}. Skill points: ${c.skillPoints}`, 'quest');
    }
    if (res.baseLevelsGained || res.jobLevelsGained) {
      refreshAllQuests(this.data, c);
      this.invalidateStats();
    }
  }

  private rollDrops(m: MonsterActor) {
    const table = this.data.drops.get(m.def.dropTableId);
    if (!table) return;
    if (table.luma) {
      const l = this.rng.int(table.luma[0], table.luma[1]);
      this.char.luma += l;
      this.message(`+${l} Luma`, 'loot');
    }
    let n = 0;
    for (const e of table.entries) {
      if (!this.rng.chance(e.chance)) continue;
      const qty = this.rng.int(e.min ?? 1, e.max ?? 1);
      const angle = (n++ / 5) * Math.PI * 2 + this.rng.next();
      const r = n === 1 ? 0 : 18 + this.rng.next() * 10;
      this.dropToGround(e.itemId, qty, m.x + Math.cos(angle) * r, m.y + Math.sin(angle) * r * 0.6);
    }
  }

  dropToGround(itemId: string, qty: number, x: number, y: number): GroundItem {
    const g: GroundItem = {
      id: this.uid('g'), itemId, qty, x, y, droppedAt: this.time,
      expiresAt: this.time + this.data.balance.combat.groundItemLifetimeMs,
    };
    this.groundItems.set(g.id, g);
    const rarity = this.data.items.get(itemId)?.rarity;
    this.emit({ type: 'fx', fx: rarity === 'rare' || rarity === 'epic' || rarity === 'legendary' ? 'drop_rare' : 'drop', x, y });
    if (this.autoLoot) this.pickup(g.id, true);
    return g;
  }

  pickup(groundId: string, silentFail = false): OpResult {
    const g = this.groundItems.get(groundId);
    if (!g) return { ok: false, error: 'Item is gone.' };
    const r = addItem(this.data, this.char, g.itemId, g.qty, { weightLimit: this.weightLimit });
    if (!r.ok) { if (!silentFail) this.message(r.error, 'error'); return r; }
    this.groundItems.delete(groundId);
    const name = this.data.items.get(g.itemId)!.name;
    this.emit({ type: 'loot', itemId: g.itemId, qty: g.qty });
    this.emit({ type: 'sound', key: 'pickup' });
    this.message(`Obtained ${name}${g.qty > 1 ? ` ×${g.qty}` : ''}.`, 'loot');
    this.afterInventoryChange();
    return { ok: true };
  }

  /** Puts an item straight into the inventory, or on the ground if it does not fit. */
  giveItem(itemId: string, qty: number, reason?: string) {
    const r = addItem(this.data, this.char, itemId, qty, { ignoreWeight: true });
    const name = this.data.items.get(itemId)?.name ?? itemId;
    if (r.ok) {
      this.message(`Received ${name}${qty > 1 ? ` ×${qty}` : ''}${reason ? ` (${reason})` : ''}.`, 'loot');
      this.emit({ type: 'loot', itemId, qty });
    } else {
      this.dropToGround(itemId, qty, this.player.x, this.player.y + 10);
      this.message(`${name} was dropped at your feet (${r.error})`, 'error');
    }
    this.afterInventoryChange();
  }

  private afterInventoryChange() {
    refreshAllQuests(this.data, this.char);
    this.invalidateStats();
    this.emit({ type: 'questUpdate', questIds: [] });
  }

  private questUpdated(ids: string[]) {
    this.emit({ type: 'questUpdate', questIds: ids });
    for (const id of ids) {
      const prog = this.char.quests[id];
      const q = this.data.quests.get(id);
      if (q && prog?.status === 'ready') {
        this.message(`Quest objectives complete: ${q.name}. Return to ${this.data.npcs.get(q.turnInNpc)?.name}.`, 'quest');
        this.emit({ type: 'sound', key: 'quest' });
      }
    }
  }

  // ---------------------------------------------------------------- monsters
  private updateMonster(m: MonsterActor, dt: number) {
    m.moving = false;
    if (m.dead) {
      if (!m.boss && !m.summoned && m.respawnAt && this.time >= m.respawnAt) this.respawnMonster(m);
      return;
    }
    this.tickStatuses(m);
    if (m.dead) return;
    if (this.applyKnockback(m, dt)) return;
    if (this.hasStatusFlag(m, 'preventsAction')) { if (m.boss?.casting) this.cancelBossCast(m); return; }
    const cannotMove = this.hasStatusFlag(m, 'preventsMove');
    const slowMul = m.statuses.some((s) => s.id === 'slow') ? 0.65 : 1;
    const phaseMul = m.boss ? m.boss.def.phases[m.boss.phase].speedMul : 1;
    const speed = m.def.moveSpeed * slowMul * phaseMul;
    const combat = this.data.balance.combat;
    const p = this.player;
    const playerTargetable = !p.dead && !this.playerStealthed;

    if (m.boss) this.updateBossPhase(m);
    if (m.boss?.casting) { this.updateBossCast(m); return; }

    switch (m.state) {
      case 'idle':
      case 'patrol': {
        const aggressive = ['aggressive', 'ranged', 'magic', 'elite', 'boss'].includes(m.def.aiType);
        if (aggressive && playerTargetable && dist(m.x, m.y, p.x, p.y) <= (m.def.aggroRange ?? combat.aggroRange)) {
          m.targetId = 'player'; m.state = 'chase'; m.threat.player = 1;
          this.onBossEngage(m);
          break;
        }
        if (m.state === 'idle') {
          if (this.time >= m.stateUntil && !m.boss) {
            const cells = this.spawnCells[m.spawnGroup];
            if (cells?.length) {
              const c = this.rng.pick(cells);
              m.patrol = { x: c.x * TILE + TILE / 2, y: c.y * TILE + TILE / 2 };
              if (dist(m.patrol.x, m.patrol.y, m.x, m.y) > 200) {
                const ang = Math.atan2(m.patrol.y - m.y, m.patrol.x - m.x);
                m.patrol = { x: m.x + Math.cos(ang) * 150, y: m.y + Math.sin(ang) * 150 };
              }
              m.state = 'patrol';
              m.stateUntil = this.time + 6000;
            } else m.stateUntil = this.time + 3000;
          }
        } else if (m.patrol && !cannotMove) {
          const arrived = this.moveToward(m, m.patrol.x, m.patrol.y, speed * 0.5, dt, 4);
          if (arrived || this.time > m.stateUntil) {
            m.state = 'idle'; m.patrol = null; m.move = null;
            m.stateUntil = this.time + this.rng.range(2000, 6000);
          }
        }
        break;
      }
      case 'chase':
      case 'attack': {
        if (!playerTargetable || m.targetId !== 'player') { this.monsterReturn(m); break; }
        const leash = m.def.leashRange ?? combat.leashRange;
        if (dist(m.x, m.y, m.home.x, m.home.y) > leash && this.time > m.tauntUntil) { this.monsterReturn(m); break; }
        const d = dist(m.x, m.y, p.x, p.y);
        const range = m.def.attackRange + p.halfW + m.halfW;
        if (m.boss && this.tryBossSkill(m, d)) break;
        if (d > range) {
          m.state = 'chase';
          if (!cannotMove) this.moveToward(m, p.x, p.y, speed, dt, range - 6);
        } else {
          m.state = 'attack';
          m.move = null;
          m.dir = dirFromVector(p.x - m.x, p.y - m.y, m.dir);
          if (this.time >= m.attackReadyAt) this.monsterAttack(m);
        }
        break;
      }
      case 'return': {
        m.hp = Math.min(m.maxHp, m.hp + (m.maxHp * combat.returnRegenPctPerSec * dt) / 1000);
        if (this.moveToward(m, m.home.x, m.home.y, speed * 1.5, dt, 6) || dist(m.x, m.y, m.home.x, m.home.y) < 8) {
          m.state = 'idle';
          m.stateUntil = this.time + 2000;
          m.hp = m.maxHp;
          m.threat = {};
          m.damageBy = {};
        }
        break;
      }
    }
    if (m.anim !== 'attack' && m.anim !== 'hit' || this.time - m.animAt > 450) this.setAnim(m, m.moving ? 'walk' : 'idle');
  }

  private monsterReturn(m: MonsterActor) {
    m.targetId = null;
    m.state = 'return';
    m.move = null;
    if (m.boss) this.resetBoss(m);
  }

  private respawnMonster(m: MonsterActor) {
    const pt = this.randomSpawnPoint(m.spawnGroup);
    Object.assign(m, {
      x: pt.x, y: pt.y, hp: m.def.maxHp, dead: false, state: 'idle', stateUntil: this.time + 1500, targetId: null,
      threat: {}, damageBy: {}, statuses: [], buffs: [], move: null, kb: null, respawnAt: 0,
    });
    m.home = { x: pt.x, y: pt.y };
    this.setAnim(m, 'idle');
    this.emit({ type: 'fx', fx: 'spawn', x: pt.x, y: pt.y });
  }

  private monsterAttack(m: MonsterActor) {
    const p = this.player;
    const aspdMul = m.boss?.enraged ? m.boss.def.enrage.aspdMul : 1;
    m.attackReadyAt = this.time + m.def.attackIntervalMs / aspdMul;
    this.setAnim(m, 'attack');
    m.animAt = this.time;
    const isMagic = m.def.aiType === 'magic';
    const opts: AttackOptions = { kind: isMagic ? 'magic' : 'physical', multiplier: 1, element: m.def.projectile?.element ?? (isMagic ? m.def.element : 'neutral') };
    const resolve = () => {
      if (m.dead || p.dead) return;
      const res = resolveAttack(this.data, this.rng, this.monsterProfile(m), this.playerProfile(), opts);
      if (!res.hit) {
        this.emit({ type: 'damage', targetId: 'player', amount: 0, crit: false, miss: true, kind: 'physical' });
        return;
      }
      this.emit({ type: 'sound', key: 'player_hurt' });
      this.damagePlayer(res.damage, opts.kind, opts.element, isMagic || m.def.projectile ? null : m, res.crit);
      if (m.def.onHitStatus && !p.dead) this.applyStatus(p, m.def.onHitStatus.status, m.def.onHitStatus.chance, m.def.onHitStatus.durationMs);
    };
    if (m.def.projectile) {
      const travel = (dist(m.x, m.y, p.x, p.y) / (this.data.balance.combat.projectileSpeed * 0.6)) * 1000;
      this.emit({ type: 'projectile', fromX: m.x, fromY: m.y - 16, toX: p.x, toY: p.y - 20, durationMs: travel, fx: 'spit', color: m.def.projectile.color });
      this.schedule(travel, resolve);
    } else {
      this.emit({ type: 'sound', key: 'monster_attack' });
      resolve();
    }
  }

  // ---------------------------------------------------------------- bosses
  private onBossEngage(m: MonsterActor) {
    const b = m.boss;
    if (!b) return;
    if (!b.engagedAt) b.engagedAt = this.time;
    if (!b.introShown) {
      b.introShown = true;
      // Give the player a moment before the first special attack.
      for (const s of b.def.skills) b.skillReadyAt[s.id] = this.time + 2500 + this.rng.range(0, 2500);
      this.emit({ type: 'bossIntro', name: m.def.name, title: b.def.title, text: b.def.intro });
      this.emit({ type: 'sound', key: 'boss_intro' });
      this.emit({ type: 'fx', fx: 'boss_entrance', x: m.x, y: m.y });
    }
  }

  private resetBoss(m: MonsterActor) {
    const b = m.boss!;
    if (b.casting) this.cancelBossCast(m);
    for (const id of b.minions) { const mm = this.monsters.get(id); if (mm && !mm.dead) this.killMinionSilently(mm); }
    b.minions = [];
    b.phase = 0; b.enraged = false; b.engagedAt = 0; b.introShown = false;
    m.statuses = [];
  }

  private updateBossPhase(m: MonsterActor) {
    const b = m.boss!;
    if (!b.engagedAt) return;
    const hpPct = (m.hp / m.maxHp) * 100;
    for (let i = b.def.phases.length - 1; i > b.phase; i--) {
      if (hpPct <= b.def.phases[i].hpPct) {
        b.phase = i;
        this.emit({ type: 'bossPhase', name: b.def.phases[i].name, text: b.def.phases[i].message });
        this.emit({ type: 'sound', key: 'boss_phase' });
        this.message(b.def.phases[i].message, 'combat');
        break;
      }
    }
    if (!b.enraged && (this.time - b.engagedAt > b.def.enrage.afterMs || hpPct <= b.def.enrage.hpPct)) {
      b.enraged = true;
      this.emit({ type: 'bossEnrage', name: m.def.name });
      this.emit({ type: 'fx', fx: 'enrage', x: m.x, y: m.y });
      this.message(`${m.def.name} becomes ENRAGED!`, 'combat');
    }
  }

  private tryBossSkill(m: MonsterActor, distToPlayer: number): boolean {
    const b = m.boss!;
    const p = this.player;
    const ready = b.def.skills.filter((s) => s.minPhase <= b.phase && (b.skillReadyAt[s.id] ?? 0) <= this.time);
    if (!ready.length) return false;
    const skill = ready[Math.floor(this.rng.next() * ready.length)];
    if (skill.kind === 'charge' && distToPlayer < 90) return false;
    if (skill.kind === 'self_circle' && distToPlayer > (skill.radius ?? 0) + 60) return false;
    b.skillReadyAt[skill.id] = this.time + skill.cooldownMs * (b.enraged ? 0.75 : 1);
    const tid = this.uid('t');
    const endsAt = this.time + skill.telegraphMs;
    let tele: Telegraph | null = null;
    let cast: BossRuntime['casting'] = { skill, endsAt, x: m.x, y: m.y, telegraphId: tid };
    switch (skill.kind) {
      case 'circle':
        cast = { ...cast, x: p.x, y: p.y };
        tele = { id: tid, shape: 'circle', x: p.x, y: p.y, radius: skill.radius!, startsAt: this.time, endsAt };
        break;
      case 'self_circle':
        tele = { id: tid, shape: 'circle', x: m.x, y: m.y, radius: skill.radius!, startsAt: this.time, endsAt };
        break;
      case 'ring':
        tele = { id: tid, shape: 'ring', x: m.x, y: m.y, radius: skill.radius!, innerRadius: skill.radius! * 0.4, startsAt: this.time, endsAt };
        break;
      case 'charge': {
        const ang = Math.atan2(p.y - m.y, p.x - m.x);
        const len = Math.min(320, distToPlayer + 60);
        const x2 = m.x + Math.cos(ang) * len, y2 = m.y + Math.sin(ang) * len;
        cast = { ...cast, x2, y2 };
        tele = { id: tid, shape: 'line', x: m.x, y: m.y, x2, y2, width: (skill.radius ?? 40) * 2, radius: 0, startsAt: this.time, endsAt };
        break;
      }
      case 'summon':
        break;
    }
    b.casting = cast;
    m.move = null;
    m.state = 'attack';
    this.setAnim(m, 'attack');
    if (tele) { this.telegraphs.push(tele); this.emit({ type: 'telegraph', telegraph: tele }); }
    this.message(`${m.def.name} prepares ${skill.name}!`, 'combat');
    this.emit({ type: 'sound', key: 'telegraph' });
    return true;
  }

  private cancelBossCast(m: MonsterActor) {
    const b = m.boss!;
    if (b.casting) this.telegraphs = this.telegraphs.filter((t) => t.id !== b.casting!.telegraphId);
    b.casting = null;
  }

  private updateBossCast(m: MonsterActor) {
    const b = m.boss!;
    const c = b.casting!;
    if (this.time < c.endsAt) return;
    b.casting = null;
    const s = c.skill;
    const p = this.player;
    const hitPlayer = (inside: boolean) => {
      if (!inside || p.dead) return;
      const res = resolveAttack(this.data, this.rng, this.monsterProfile(m), this.playerProfile(), {
        kind: 'physical', multiplier: s.multiplier ?? 1, element: s.element ?? 'neutral', alwaysHit: true, canCrit: false,
      });
      this.damagePlayer(res.damage, 'physical', s.element ?? 'neutral', null, false);
      if (s.status && !p.dead) this.applyStatus(p, s.status.status, s.status.chance, s.status.durationMs);
    };
    this.emit({ type: 'fx', fx: s.fx, x: c.x, y: c.y, radius: s.radius });
    this.emit({ type: 'sound', key: 'boss_slam' });
    switch (s.kind) {
      case 'circle':
      case 'self_circle':
        hitPlayer(dist(p.x, p.y, c.x, c.y) <= (s.radius ?? 0) + p.halfW);
        break;
      case 'ring': {
        const d = dist(p.x, p.y, c.x, c.y);
        hitPlayer(d <= (s.radius ?? 0) && d >= (s.radius ?? 0) * 0.4);
        break;
      }
      case 'charge': {
        const x2 = c.x2!, y2 = c.y2!;
        // Dash along the line (stopping at walls), damaging the player if inside the corridor.
        const inside = distToSegment(p.x, p.y, c.x, c.y, x2, y2) <= (s.radius ?? 40) + p.halfW;
        const steps = 24;
        for (let i = 1; i <= steps; i++) {
          const nx = c.x + ((x2 - c.x) * i) / steps, ny = c.y + ((y2 - c.y) * i) / steps;
          const r = moveWithCollision(this.map, m.x, m.y, nx - m.x, ny - m.y, m.halfW, m.halfH);
          if (r.blocked) break;
          m.x = r.x; m.y = r.y;
        }
        this.emit({ type: 'fx', fx: 'dash', x: m.x, y: m.y });
        hitPlayer(inside);
        break;
      }
      case 'summon': {
        const sm = s.summon!;
        for (let i = 0; i < sm.count; i++) {
          const ang = (i / sm.count) * Math.PI * 2;
          let x = m.x + Math.cos(ang) * 70, y = m.y + Math.sin(ang) * 50;
          const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
          if (this.map.collision[cy * this.map.width + cx]) { x = m.x; y = m.y; }
          const def = this.data.monsters.get(sm.monsterId)!;
          const mm = this.makeMonster(def, x, y, -1);
          mm.summoned = true;
          mm.targetId = 'player';
          mm.state = 'chase';
          mm.threat.player = 1;
          this.monsters.set(mm.id, mm);
          b.minions.push(mm.id);
          this.emit({ type: 'fx', fx: 'spawn', x, y });
        }
        break;
      }
    }
    m.attackReadyAt = this.time + 600;
  }

  // ---------------------------------------------------------------- zones
  private updateZones() {
    for (const z of [...this.zones]) {
      if (z.expiresAt <= this.time) { this.zones.splice(this.zones.indexOf(z), 1); continue; }
      if (z.nextTickAt > this.time) continue;
      z.nextTickAt = this.time + z.tickMs;
      const e = z.effect;
      for (const m of this.monsters.values()) {
        if (m.dead || dist(m.x, m.y, z.x, z.y) > z.radius + m.halfW) continue;
        const res = resolveAttack(this.data, this.rng, this.playerProfile(), this.monsterProfile(m), {
          kind: e.kind, multiplier: e.multiplier + e.perLevel * (z.level - 1), element: e.element,
        });
        if (!res.hit) continue;
        this.damageMonster(m, res.damage, e.kind, e.element, res.crit, true);
        if (e.status && !m.dead) this.applyStatus(m, e.status, e.statusChance ?? 0, e.statusDurationMs);
      }
    }
  }

  // ---------------------------------------------------------------- skills
  skillLevel(skillId: string): number { return this.char.skills[skillId] ?? 0; }

  skillMpCost(skill: SkillDef, level: number): number {
    return skill.mpCost + skill.mpCostPerLevel * (level - 1);
  }

  canUseSkill(skillId: string): OpResult {
    const skill = this.data.skills.get(skillId);
    const lvl = this.skillLevel(skillId);
    const p = this.player;
    if (!skill) return { ok: false, error: 'Unknown skill.' };
    if (lvl <= 0) return { ok: false, error: `You have not learned ${skill.name}.` };
    if (skill.kind === 'passive') return { ok: false, error: `${skill.name} is a passive skill.` };
    if (p.dead) return { ok: false, error: 'You are dead.' };
    if (this.hasStatusFlag(p, 'preventsSkills')) return { ok: false, error: 'You are silenced!' };
    if (this.hasStatusFlag(p, 'preventsAction')) return { ok: false, error: 'You cannot act right now.' };
    if ((p.cooldowns[skillId] ?? 0) > this.time) return { ok: false, error: `${skill.name} is on cooldown.` };
    if (this.char.mp < this.skillMpCost(skill, lvl)) return { ok: false, error: 'Not enough MP.' };
    if (skill.requiresWeapon) {
      const w = this.char.equipment.weapon && this.data.items.get(this.char.equipment.weapon.itemId);
      if (!w?.weaponType || !skill.requiresWeapon.includes(w.weaponType)) return { ok: false, error: `${skill.name} requires a ${skill.requiresWeapon.join(' or ')}.` };
    }
    if (p.cast) return { ok: false, error: 'Already casting.' };
    return { ok: true };
  }

  /** Player command: use a skill. Enemy skills use targetId (or the current target), ground skills use x/y. */
  castSkill(skillId: string, target?: { targetId?: string; x?: number; y?: number }): OpResult {
    const chk = this.canUseSkill(skillId);
    if (!chk.ok) { this.message(chk.error, 'error'); return chk; }
    const skill = this.data.skills.get(skillId)!;
    const p = this.player;
    if (skill.targeting === 'self') {
      this.beginCast(skill, undefined, p.x, p.y);
      return { ok: true };
    }
    if (skill.targeting === 'enemy') {
      const tid = target?.targetId ?? (p.intent.type === 'attack' ? p.intent.targetId : undefined);
      const m = tid ? this.monsters.get(tid) : undefined;
      if (!m || m.dead) { const e = 'Select a target first.'; this.message(e, 'error'); return { ok: false, error: e }; }
      p.intent = { type: 'cast', skillId, targetId: m.id };
      return { ok: true };
    }
    if (skill.targeting === 'ground') {
      let x = target?.x, y = target?.y;
      if (target?.targetId) { const m = this.monsters.get(target.targetId); if (m && !m.dead) { x = m.x; y = m.y; } }
      if (x == null || y == null) {
        const tid = p.intent.type === 'attack' ? p.intent.targetId : undefined;
        const m = tid ? this.monsters.get(tid) : undefined;
        if (m && !m.dead) { x = m.x; y = m.y; } else { x = p.x; y = p.y; }
      }
      p.intent = { type: 'cast', skillId, x, y };
      return { ok: true };
    }
    return { ok: false, error: 'Cannot use that skill.' };
  }

  private beginCast(skill: SkillDef, targetId: string | undefined, x?: number, y?: number) {
    const p = this.player;
    const chk = this.canUseSkill(skill.id);
    if (!chk.ok) { this.message(chk.error, 'error'); p.intent = { type: 'none' }; return; }
    const lvl = this.skillLevel(skill.id);
    const castMs = Math.round(skill.castTimeMs * this.stats.castTimeMul);
    if (x != null && y != null) p.dir = dirFromVector(x - p.x, y - p.y, p.dir);
    if (castMs <= 0) {
      this.executeSkill(skill.id, lvl, targetId, x, y);
      return;
    }
    p.cast = { skillId: skill.id, level: lvl, startedAt: this.time, endsAt: this.time + castMs, targetId, x, y };
    p.move = null;
    this.setAnim(p, 'cast');
    this.emit({ type: 'castStart', skillId: skill.id, durationMs: castMs });
    this.emit({ type: 'fx', fx: 'casting', x: p.x, y: p.y, targetId: 'player' });
    this.emit({ type: 'sound', key: 'cast' });
  }

  interruptCast() {
    const p = this.player;
    if (!p.cast) return;
    this.emit({ type: 'castEnd', skillId: p.cast.skillId, interrupted: true });
    p.cast = null;
  }

  private executeSkill(skillId: string, level: number, targetId?: string, x?: number, y?: number) {
    const skill = this.data.skills.get(skillId)!;
    const p = this.player;
    const cost = this.skillMpCost(skill, level);
    if (this.char.mp < cost) { this.message('Not enough MP.', 'error'); return; }
    let target = targetId ? this.monsters.get(targetId) : undefined;
    if (skill.targeting === 'enemy' && (!target || target.dead)) { this.message('Target lost.', 'error'); return; }
    this.char.mp -= cost;
    p.cooldowns[skillId] = this.time + skill.cooldownMs * (1 - this.stats.cdrPct / 100);
    p.lastCombatAt = this.time;
    this.setAnim(p, skill.targeting === 'self' && skill.kind === 'buff' ? 'cast' : 'attack');
    p.animAt = this.time;
    // Basic attack resets after a skill to prevent double-dipping.
    p.attackReadyAt = Math.max(p.attackReadyAt, this.time + 300);

    const cx = target ? target.x : x ?? p.x;
    const cy = target ? target.y : y ?? p.y;
    const centre = skill.targeting === 'self' ? { x: p.x, y: p.y } : { x: cx, y: cy };
    const isOffensive = skill.effects.some((e) => e.type === 'damage' || e.type === 'groundZone' || e.type === 'taunt');
    if (isOffensive) this.breakStealth();

    this.emit({ type: 'fx', fx: skill.fx, x: centre.x, y: centre.y, radius: skill.effects.find((e) => 'radius' in e && e.radius)?.['radius' as never], targetId: target?.id });
    this.emit({ type: 'sound', key: `skill_${skill.fx}` });
    if (skill.targeting === 'enemy' && target && dist(p.x, p.y, target.x, target.y) > 80) {
      this.emit({ type: 'projectile', fromX: p.x, fromY: p.y - 24, toX: target.x, toY: target.y - 14, durationMs: 180, fx: skill.fx });
    }

    let lineTargets: MonsterActor[] | null = null;
    let lastTargets: MonsterActor[] = target ? [target] : [];
    for (const e of skill.effects) {
      switch (e.type) {
        case 'line': {
          const ang = Math.atan2(cy - p.y, cx - p.x);
          const x2 = p.x + Math.cos(ang) * e.length, y2 = p.y + Math.sin(ang) * e.length;
          lineTargets = [...this.monsters.values()].filter((m) => !m.dead && distToSegment(m.x, m.y, p.x, p.y, x2, y2) <= e.width / 2 + m.halfW);
          this.emit({ type: 'fx', fx: 'beam', x: p.x, y: p.y - 20, radius: e.length, targetId: `${x2},${y2}` });
          break;
        }
        case 'damage': {
          const targets = lineTargets ?? (e.radius ? this.monstersInRadius(centre.x, centre.y, e.radius) : target ? [target] : []);
          lastTargets = targets;
          const hits = e.hits ?? 1;
          const element: Element = e.element === 'weapon' || !e.element ? this.stats.weaponElement : e.element;
          const mult = e.multiplier + e.perLevel * (level - 1);
          for (const m of targets) {
            for (let h = 0; h < hits; h++) {
              const doHit = () => {
                if (m.dead) return;
                const res = resolveAttack(this.data, this.rng, this.playerProfile(), this.monsterProfile(m), {
                  kind: e.kind, multiplier: mult, element, ignoreDefPct: e.ignoreDefPct, alwaysHit: e.alwaysHit,
                });
                if (!res.hit) { this.emit({ type: 'damage', targetId: m.id, amount: 0, crit: false, miss: true, kind: e.kind }); this.aggroMonster(m, 1); return; }
                this.damageMonster(m, res.damage, e.kind, element, res.crit, false);
              };
              if (h === 0) doHit(); else this.schedule(h * 160, doHit);
            }
          }
          break;
        }
        case 'status': {
          const targets = e.radius ? this.monstersInRadius(centre.x, centre.y, e.radius) : lastTargets;
          const chance = e.chance + (e.perLevel ?? 0) * level;
          for (const m of targets) if (!m.dead && chance > 0) this.applyStatus(m, e.status, chance, e.durationMs);
          break;
        }
        case 'heal': {
          const amount = Math.round(e.base + e.perLevel * level + e.intScale * this.stats.totalStats.int + this.stats.matk * 0.2);
          const healed = Math.min(amount, this.stats.maxHp - this.char.hp);
          this.char.hp += healed;
          p.hp = this.char.hp;
          this.emit({ type: 'damage', targetId: 'player', amount: healed, crit: false, miss: false, kind: 'heal' });
          break;
        }
        case 'buff': {
          const mods: StatModifiers = {};
          mergeMods(mods, e.mods);
          if (e.modsPerLevel) mergeMods(mods, e.modsPerLevel, level - 1);
          this.addBuff(p, {
            id: e.buffId, name: skill.name, mods, flags: e.flags,
            durationMs: e.durationMs + (e.perLevelMs ?? 0) * (level - 1), color: skill.icon.color,
          });
          this.message(`${skill.name} Lv.${level} active.`);
          break;
        }
        case 'knockback': {
          for (const m of lastTargets) {
            if (m.dead || m.boss) continue;
            const ang = Math.atan2(m.y - p.y, m.x - p.x);
            const v = (e.distance / this.data.balance.combat.knockbackMs) * 1000;
            m.kb = { vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, until: this.time + this.data.balance.combat.knockbackMs };
          }
          break;
        }
        case 'taunt': {
          const tgs = e.radius ? this.monstersInRadius(centre.x, centre.y, e.radius) : lastTargets;
          for (const m of tgs) {
            if (m.dead) continue;
            m.targetId = 'player'; m.state = 'chase'; m.tauntUntil = this.time + 4000;
            m.threat.player = (m.threat.player ?? 0) + 1000;
            this.onBossEngage(m);
            this.emit({ type: 'fx', fx: 'taunt', x: m.x, y: m.y - 30 });
          }
          break;
        }
        case 'groundZone': {
          this.zones.push({
            id: this.uid('z'), skillId, zoneId: e.zoneId, x: centre.x, y: centre.y, radius: e.radius,
            expiresAt: this.time + e.durationMs, nextTickAt: this.time, tickMs: e.tickMs, level, effect: e,
          });
          break;
        }
        case 'dash':
          break;
      }
    }
    this.emit({ type: 'statsChanged' });
  }

  monstersInRadius(x: number, y: number, r: number): MonsterActor[] {
    const out: MonsterActor[] = [];
    for (const m of this.monsters.values()) if (!m.dead && dist(m.x, m.y, x, y) <= r + m.halfW) out.push(m);
    return out;
  }

  // ---------------------------------------------------------------- player commands
  moveTo(x: number, y: number) {
    const p = this.player;
    if (p.dead) return;
    if (p.cast) this.interruptCast();
    p.intent = { type: 'move' };
    p.move = null;
    const path = findPath(this.map, p.x, p.y, x, y);
    if (!path || !path.length) { p.intent = { type: 'none' }; return; }
    const last = path[path.length - 1];
    p.move = { path, goalX: last.x, goalY: last.y, repathAt: Infinity };
  }

  setMoveDir(dx: number, dy: number) {
    const p = this.player;
    if ((dx || dy) && p.cast) this.interruptCast();
    p.moveDir = { x: dx, y: dy };
  }

  attack(monsterId: string) {
    const p = this.player;
    const m = this.monsters.get(monsterId);
    if (p.dead || !m || m.dead) return;
    if (p.cast) return;
    p.intent = { type: 'attack', targetId: monsterId };
  }

  stop() {
    const p = this.player;
    p.intent = { type: 'none' };
    p.move = null;
    this.interruptCast();
  }

  interactNpc(npcId: string) {
    if (this.player.dead) return;
    this.player.intent = { type: 'npc', npcId };
  }

  interactObjectCmd(objectId: string) {
    if (this.player.dead) return;
    this.player.intent = { type: 'object', objectId };
  }

  pickupCmd(groundId: string) {
    if (this.player.dead) return;
    this.player.intent = { type: 'pickup', groundId };
  }

  /** Picks up the nearest ground item within reach, if any. */
  pickupNearest(): boolean {
    const p = this.player;
    let best: GroundItem | null = null, bd = Infinity;
    for (const g of this.groundItems.values()) {
      const d = dist(p.x, p.y, g.x, g.y);
      if (d < bd) { bd = d; best = g; }
    }
    if (!best || bd > 200) return false;
    this.pickupCmd(best.id);
    return true;
  }

  targetNearestMonster(): MonsterActor | null {
    const p = this.player;
    let best: MonsterActor | null = null, bd = Infinity;
    for (const m of this.monsters.values()) {
      if (m.dead) continue;
      const d = dist(p.x, p.y, m.x, m.y);
      if (d < bd) { bd = d; best = m; }
    }
    if (best && bd < 420) { this.attack(best.id); return best; }
    return null;
  }

  private talkToNpc(npcId: string) {
    const updated = questEvents.talk(this.data, this.char, npcId);
    if (updated.length) this.questUpdated(updated);
    this.emit({ type: 'npcInteract', npcId });
    this.emit({ type: 'sound', key: 'ui_open' });
  }

  private interactObject(objectId: string) {
    const meta = this.map.def.objects.find((o) => o.id === objectId);
    if (!meta?.interact) return;
    let text = meta.interact.text;
    if (meta.interact.questFlag) {
      const before = JSON.stringify(Object.values(this.char.quests).map((q) => q.counts));
      const updated = questEvents.interact(this.data, this.char, objectId);
      const progressed = before !== JSON.stringify(Object.values(this.char.quests).map((q) => q.counts));
      if (progressed && meta.interact.giveItem) {
        this.giveItem(meta.interact.giveItem.itemId, meta.interact.giveItem.qty);
      } else if (!progressed && meta.interact.giveItem) {
        text = 'There is nothing more to find here right now.';
      }
      if (updated.length) this.questUpdated(updated);
      this.emit({ type: 'fx', fx: 'sparkle', x: (meta.x + 0.5) * TILE, y: (meta.y + 0.5) * TILE });
    }
    this.emit({ type: 'objectInteract', objectId, name: meta.name, text });
  }

  // ---------------------------------------------------------------- items
  useItem(uid: string): OpResult {
    const p = this.player;
    const inst = findInstance(this.char, uid);
    if (!inst) return this.err('Item not found.');
    const def = this.data.items.get(inst.itemId)!;
    if (def.type === 'equipment') return this.equip(uid);
    if (def.type !== 'consumable' || !def.use) return this.err(`${def.name} cannot be used.`);
    if (p.dead) return this.err('You are dead.');
    if ((p.itemCooldowns[def.id] ?? 0) > this.time) return this.err('Wait a moment before using that again.');
    for (const u of def.use) {
      if (u.type === 'returnToSave' && p.cast) return this.err('Cannot use while casting.');
    }
    const r = removeByUid(this.char, uid, 1);
    if (!r.ok) return this.err(r.error);
    p.itemCooldowns[def.id] = this.time + (def.cooldownMs ?? 500);
    for (const u of def.use) {
      switch (u.type) {
        case 'heal': {
          const hp = Math.min(this.stats.maxHp - this.char.hp, (u.hp ?? 0) + Math.floor((this.stats.maxHp * (u.hpPct ?? 0)) / 100));
          const mp = Math.min(this.stats.maxMp - this.char.mp, (u.mp ?? 0) + Math.floor((this.stats.maxMp * (u.mpPct ?? 0)) / 100));
          this.char.hp += Math.max(0, hp);
          this.char.mp += Math.max(0, mp);
          p.hp = this.char.hp;
          if (hp > 0) this.emit({ type: 'damage', targetId: 'player', amount: hp, crit: false, miss: false, kind: 'heal' });
          if (mp > 0) this.emit({ type: 'damage', targetId: 'player', amount: mp, crit: false, miss: false, kind: 'mp' });
          this.emit({ type: 'fx', fx: 'heal', x: p.x, y: p.y, targetId: 'player' });
          break;
        }
        case 'cure': {
          const n = this.cureStatuses(p, u.statuses);
          if (n) this.message('You feel cleansed.');
          this.emit({ type: 'fx', fx: 'cure', x: p.x, y: p.y, targetId: 'player' });
          break;
        }
        case 'buff':
          this.addBuff(p, { id: u.buffId, name: def.name, mods: u.mods, durationMs: u.durationMs, color: def.icon.color });
          this.emit({ type: 'fx', fx: 'buff', x: p.x, y: p.y, targetId: 'player' });
          break;
        case 'returnToSave':
          this.emit({ type: 'fx', fx: 'teleport', x: p.x, y: p.y });
          this.enterMap(this.char.savePoint.mapId, this.char.savePoint.spawn);
          break;
        case 'resetStats':
          resetStats(this.data, this.char);
          this.message('Your stat points have been refunded.');
          break;
        case 'resetSkills':
          { const rs = resetSkills(this.data, this.char); if (rs.ok && rs.message) this.message(rs.message); }
          break;
      }
    }
    this.emit({ type: 'sound', key: 'potion' });
    this.afterInventoryChange();
    return { ok: true };
  }

  /** Uses the first stack of an item type (for hotbar slots bound to items). */
  useItemById(itemId: string): OpResult {
    const inst = this.char.inventory.find((i) => i.itemId === itemId);
    if (!inst) return this.err(`You have no ${this.data.items.get(itemId)?.name ?? itemId}.`);
    return this.useItem(inst.uid);
  }

  private err(error: string): OpResult {
    this.message(error, 'error');
    this.emit({ type: 'sound', key: 'error' });
    return { ok: false, error };
  }

  private wrap(r: OpResult, after?: () => void): OpResult {
    if (!r.ok) return this.err(r.error);
    if (r.message) this.message(r.message);
    after?.();
    this.afterInventoryChange();
    return r;
  }

  equip(uid: string, slot?: EquipSlot): OpResult {
    if (this.player.cast) return this.err('Cannot change equipment while casting.');
    return this.wrap(equipItem(this.data, this.char, uid, slot), () => this.emit({ type: 'sound', key: 'equip' }));
  }
  unequip(slot: EquipSlot): OpResult { return this.wrap(unequipItem(this.data, this.char, slot), () => this.emit({ type: 'sound', key: 'equip' })); }
  allocate(stat: StatKey, amount = 1): OpResult { return this.wrap(allocateStat(this.data, this.char, stat, amount)); }
  learn(skillId: string): OpResult { return this.wrap(learnSkill(this.data, this.char, skillId), () => this.emit({ type: 'sound', key: 'learn' })); }
  /** NPC services are only usable while standing next to an NPC that offers them (server-style validation). */
  private nearService(match: (s: NpcDef['services'][number]) => boolean): boolean {
    const p = this.player;
    return this.npcs.some((n) => dist(p.x, p.y, n.x, n.y) <= SERVICE_RANGE && n.def.services.some(match));
  }

  buy(shopId: string, itemId: string, qty: number): OpResult {
    if (!this.nearService((s) => s.type === 'shop' && s.shopId === shopId)) return this.err('You are too far from the merchant.');
    return this.wrap(buyItem(this.data, this.char, shopId, itemId, qty, this.weightLimit), () => this.emit({ type: 'sound', key: 'coin' }));
  }
  sell(uid: string, qty: number): OpResult {
    if (!this.nearService((s) => s.type === 'shop')) return this.err('You are too far from a merchant.');
    return this.wrap(sellItem(this.data, this.char, uid, qty), () => this.emit({ type: 'sound', key: 'coin' })); }
  deposit(uid: string, qty: number): OpResult {
    if (!this.nearService((s) => s.type === 'storage')) return this.err('You are too far from the storage keeper.');
    return this.wrap(depositToStorage(this.data, this.char, uid, qty)); }
  withdraw(uid: string, qty: number): OpResult {
    if (!this.nearService((s) => s.type === 'storage')) return this.err('You are too far from the storage keeper.');
    return this.wrap(withdrawFromStorage(this.data, this.char, uid, qty, this.weightLimit)); }
  sort(mode: 'type' | 'name' | 'rarity'): OpResult { sortInventory(this.data, this.char, mode); return this.wrap({ ok: true }); }
  lock(uid: string): OpResult { return this.wrap(toggleLock(this.char, uid)); }
  doResetStats(cost: number): OpResult {
    if (!this.nearService((s) => s.type === 'resetStats')) return this.err('Only a guild master can reset your stats.');
    if (this.char.luma < cost) return this.err('Not enough Luma.');
    this.char.luma -= cost;
    return this.wrap(resetStats(this.data, this.char));
  }
  doResetSkills(cost: number): OpResult {
    if (!this.nearService((s) => s.type === 'resetSkills')) return this.err('Only a guild master can reset your skills.');
    if (this.char.luma < cost) return this.err('Not enough Luma.');
    this.char.luma -= cost;
    return this.wrap(resetSkills(this.data, this.char));
  }

  dropItem(uid: string, qty: number): OpResult {
    const inst = findInstance(this.char, uid);
    if (!inst) return this.err('Item not found.');
    const can = canDiscard(this.data, inst);
    if (!can.ok) return this.err(can.error);
    const itemId = inst.itemId;
    const r = removeByUid(this.char, uid, qty);
    if (!r.ok) return this.err(r.error);
    this.dropToGround(itemId, qty, this.player.x + 14, this.player.y + 8);
    return this.wrap({ ok: true, message: `Dropped ${this.data.items.get(itemId)!.name}.` });
  }

  healAtInn(cost: number): OpResult {
    if (!this.nearService((s) => s.type === 'heal')) return this.err('You need to be at an inn to rest.');
    if (this.char.luma < cost) return this.err('Not enough Luma.');
    this.char.luma -= cost;
    this.recomputeStats();
    this.char.hp = this.stats.maxHp;
    this.char.mp = this.stats.maxMp;
    this.player.hp = this.char.hp;
    this.cureStatuses(this.player, ['poison', 'burn', 'bleed', 'curse', 'blind', 'silence', 'slow']);
    this.emit({ type: 'fx', fx: 'heal', x: this.player.x, y: this.player.y, targetId: 'player', offsetY: 0 });
    this.emit({ type: 'sound', key: 'heal' });
    return { ok: true, message: 'You feel fully rested.' };
  }

  setSavePoint(): OpResult {
    if (!this.nearService((s) => s.type === 'save')) return this.err('You can only save at an inn or camp.');
    const sp = this.nearestSpawnKey();
    this.char.savePoint = { mapId: this.map.def.id, spawn: sp };
    this.message(`Save point set: ${this.map.def.name}.`, 'system');
    return { ok: true };
  }

  private nearestSpawnKey(): string {
    let best = 'default', bd = Infinity;
    for (const [k, s] of Object.entries(this.map.def.spawnPoints)) {
      const d = dist(this.player.x, this.player.y, s.x * TILE, s.y * TILE);
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }

  accept(questId: string): OpResult {
    const r = acceptQuest(this.data, this.char, questId, this.now());
    if (!r.ok) return this.err(r.error);
    this.message(r.message!, 'quest');
    this.emit({ type: 'sound', key: 'quest' });
    // Talk objectives targeting the giver complete immediately.
    this.questUpdated([questId]);
    this.emit({ type: 'questUpdate', questIds: [questId] });
    return r;
  }

  abandon(questId: string): OpResult {
    const r = abandonQuest(this.data, this.char, questId);
    if (!r.ok) return this.err(r.error);
    this.message(r.message!, 'quest');
    this.emit({ type: 'questUpdate', questIds: [questId] });
    return r;
  }

  turnIn(questId: string): TurnInResult {
    const before = { b: this.char.baseLevel, j: this.char.jobLevel };
    const r = turnInQuest(this.data, this.char, questId, this.weightLimit, this.now());
    if (!r.ok) { this.err(r.error!); return r; }
    const q = this.data.quests.get(questId)!;
    this.message(`Quest complete: ${q.name}!`, 'quest');
    const rw = q.rewards;
    const parts = [rw.exp ? `${rw.exp} Base EXP` : '', rw.jobExp ? `${rw.jobExp} Job EXP` : '', rw.luma ? `${rw.luma} Luma` : '',
      ...(rw.items ?? []).map((i) => `${this.data.items.get(i.itemId)!.name} ×${i.qty}`)].filter(Boolean);
    if (parts.length) this.message(`Rewards: ${parts.join(', ')}`, 'loot');
    this.emit({ type: 'sound', key: 'quest_complete' });
    this.emit({ type: 'fx', fx: 'quest_complete', x: this.player.x, y: this.player.y });
    if (this.char.baseLevel > before.b) {
      this.recomputeStats();
      this.char.hp = this.stats.maxHp; this.char.mp = this.stats.maxMp;
      this.emit({ type: 'levelUp', kind: 'base', level: this.char.baseLevel });
      this.emit({ type: 'fx', fx: 'level_up', x: this.player.x, y: this.player.y, targetId: 'player', offsetY: 0 });
      this.message(`Base Level up! You are now level ${this.char.baseLevel}.`, 'quest');
    }
    if (this.char.jobLevel > before.j && !r.jobChanged) {
      this.emit({ type: 'levelUp', kind: 'job', level: this.char.jobLevel });
      this.message(`Job Level up! Job level ${this.char.jobLevel}.`, 'quest');
    }
    if (r.jobChanged) {
      const cls = this.data.classes.get(r.jobChanged)!;
      this.emit({ type: 'jobChanged', classId: r.jobChanged });
      this.emit({ type: 'fx', fx: 'job_change', x: this.player.x, y: this.player.y });
      this.message(`Congratulations! You are now a ${cls.name}!`, 'quest');
    }
    this.afterInventoryChange();
    return r;
  }

  // ---------------------------------------------------------------- queries
  getMonster(id: string) { return this.monsters.get(id); }
  get currentTarget(): MonsterActor | undefined {
    const it = this.player.intent;
    const id = it.type === 'attack' ? it.targetId : it.type === 'cast' ? it.targetId : undefined;
    return id ? this.monsters.get(id) : undefined;
  }
  get activeBoss(): MonsterActor | undefined {
    for (const m of this.monsters.values()) if (m.boss && !m.dead && m.boss.engagedAt) return m;
    return undefined;
  }
  canCarry(itemId: string, qty: number): boolean {
    return canAddItem(this.data, this.char, itemId, qty, { weightLimit: this.weightLimit }).ok;
  }
}

export function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax, vy = by - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len2)) : 0;
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}

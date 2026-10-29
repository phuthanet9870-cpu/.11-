// The world simulation: map instance, player, monsters, NPCs, combat, skills,
// loot and portals. It is renderer-agnostic (no Phaser) so it can be unit
// tested headlessly and later run authoritative on the server (Phase 3).
import { traderBuy, traderSell } from './market';
import type { GameData } from './data';
import {
  elementModifier, profileFromDerived, profileFromMonster, resolveAttack, rollStatus,
  type AttackOptions, type CombatProfile,
} from './combat';
import { addExperience, computeDerivedStats, expToNextBase, mergeMods, specialMods } from './formulas';
import {
  addItem, buyItem, putInCart, takeFromCart, canAddItem, canDiscard, depositToStorage, equipItem, findInstance, inventoryWeight,
  removeByUid, sellItem, sortInventory, toggleLock, unequipItem, withdrawFromStorage, type OpResult,
} from './inventory';
import { allocateStat, changeJob, learnSkill, rebirth, resetSkills, resetStats } from './character';
import { refineItem, type RefineResult } from './refine';
import { PVP_MAPS, type PresenceInfo } from '../net/protocol';
import { AutoPilot } from './autopilot';
import { learnRune, resetRunes } from './runes';
import { classLineage } from './lineage';
import { addHomunExp, createHomunculus, evolveHomun, feedHomun, homunStats, releaseHomun, reviveHomun, tickHomun } from './homunculus';
import { equipPetAccessory, evolvePet, removePetAccessory } from './pets';
import { captureChance, feedPet, hatchEgg, petForMonster, petMods, petOwnerDied, renamePet, returnToEgg, tickPet, newPetState } from './pets';
import { compoundCard } from './cards';
import { enchantAdd, enchantReroll, rollDropOptions } from './options';
import { forgeWeapon, type ForgeChoice, type ForgeResult } from './forge';
import {
  acceptQuest, abandonQuest, questEvents, refreshAllQuests, turnInQuest, type TurnInResult,
} from './quests';
import { compileMap, moveWithCollision, TILE, type CompiledMap } from './mapCompiler';
import { findPath, lineClear } from './pathfinding';
import { Rng } from './rng';
import { bonusNow, checkAchievements, claimDaily, setTitle } from './achievements';
import { brew, BREW_BOWL, canBrew } from './brewing';
import type {
  BossDef, BossSkillDef, CharacterState, DerivedStats, Direction, Element, EquipSlot, MonsterDef,
  NpcDef, SkillDef, SkillEffect, StatKey, StatModifiers, StatusId,
} from './types';
import { EQUIP_SLOTS } from './types';

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
  /** Weapon element while the buff lasts. */
  endow?: Element;
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
  /** Attack another player (PvP maps) or the castle Emperium. */
  | { type: 'attackRemote'; id: string }
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
  /** A thief already stole from this monster. */
  stolen?: boolean;
  /** Part of a world-event raid. */
  eventRaid?: 'leader' | 'raider';
  mugged?: boolean;
  /** Items a looter monster picked up; dropped when it dies. */
  loot?: { itemId: string; qty: number; options?: { key: string; value: number }[] }[];
}

export interface NpcActor { id: string; npcId: string; def: NpcDef; x: number; y: number; dir: Direction }

export interface GroundItem { id: string; itemId: string; qty: number; x: number; y: number; expiresAt: number; droppedAt: number; options?: { key: string; value: number }[] }

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
  | { type: 'achievement'; id: string }
  | { type: 'openWindow'; id: 'brew' }
  | { type: 'death'; id: string }
  | { type: 'loot'; itemId: string; qty: number }
  | { type: 'message'; text: string; channel: 'system' | 'combat' | 'loot' | 'quest' | 'error' }
  | { type: 'bossIntro'; name: string; title: string; text: string }
  | { type: 'bossPhase'; name: string; text: string }
  | { type: 'bossEnrage'; name: string }
  | { type: 'bossDefeated'; name: string }
  | { type: 'mvp'; name: string; killer: string; exp: number; items: string[] }
  /** Online play: hits on other players / the Emperium, deaths in PvP, party EXP to share. */
  | { type: 'remoteHit'; target: string; damage: number; crit: boolean }
  | { type: 'pvpDeath'; killer: string }
  | { type: 'partyExp'; base: number; job: number; mapId: string; monsterLevel: number }
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

export interface RemoteActor { id: string; name: string; x: number; y: number; dir: Direction; anim: string; hpPct: number; info: PresenceInfo | null; emperium?: boolean }
export function remoteProfile(r: RemoteActor): CombatProfile {
  const v = r.emperium ? { level: 90, pdef: 40, mdef: 40, flee: 0, perfectDodge: 0, element: 'holy' } : r.info!.pvp;
  return { level: v.level, patk: 0, matk: 0, pdef: v.pdef, mdef: v.mdef, hit: 0, flee: v.flee, crit: 0, critDmg: 100, element: v.element as Element, elementLevel: 1,
    elementDamagePct: {}, elementResistPct: {}, race: r.emperium ? 'formless' : 'demihuman', size: r.emperium ? 'large' : 'medium', raceDamagePct: {}, sizeDamagePct: {}, raceResistPct: {}, perfectDodge: v.perfectDodge, weaponType: 'none' };
}

export interface WorldOptions {
  rng?: Rng;
  now?: () => number;
  autoLoot?: boolean;
  /** Turn off timed world events (tests that need a quiet world). */
  noEvents?: boolean;
}

/** World events: one every 15 minutes of play, lasting 10 minutes. */
export const EVENT_INTERVAL_MS = 15 * 60000;
/** Idle monsters farther than this from the player do not patrol (saves work on big maps). */
export const DORMANT_RANGE = 1600;
export const EVENT_DURATION_MS = 10 * 60000;

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
  /** MVP tombstones (Ragnarok-style): where a boss fell, who took MVP, when it returns. */
  tombstones: Record<string, { mapId: string; x: number; y: number; boss: string; killer: string; killedAt: number; respawnAt: number }> = {};
  private nextId = 1;
  private statsDirty = true;
  private visitedAreas = new Set<string>();

  constructor(data: GameData, character: CharacterState, opts: WorldOptions = {}) {
    this.data = data;
    this.char = character;
    this.rng = opts.rng ?? new Rng();
    this.now = opts.now ?? (() => Date.now());
    this.autoLoot = opts.autoLoot ?? false;
    this.eventsOn = !opts.noEvents;
    this.timedBonuses = !opts.noEvents;
    this.nextEventAt = 5 * 60000;
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
    if (character.pet) character.pet.nextHungerAt = undefined;
    if (character.homunculus) character.homunculus.nextHungerAt = undefined;
    const pos = character.position;
    this.enterMap(pos.mapId, { x: pos.x, y: pos.y });
  }

  // ---------------------------------------------------------------- utils
  private uid(prefix: string) { return `${prefix}${this.nextId++}`; }
  emit(e: WorldEvent) { this.events.push(e); for (const fn of this.listeners) fn(e); }
  private listeners = new Set<(e: WorldEvent) => void>();
  /** Immediate event hook (online play sends hits / shared EXP without waiting for a rendered frame). */
  onEvent(fn: (e: WorldEvent) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
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
    const pet = petMods(this.data, this.char);
    if (pet) mods.push(pet);
    if (this.char.flags.gmInvisible) mods.push({ stealth: 1 });
    if (this.char.flags.gmSpeed) mods.push({ moveSpeedPct: Number(this.char.flags.gmSpeed) });
    if (this.char.flags.mounted && this.canMount) mods.push({ moveSpeedPct: 25, weightLimit: 1000, aspdPct: -40 + 8 * (this.char.skills.drake_riding ?? 0) });
    for (const s of this.player.statuses) {
      const def = this.data.statuses.get(s.id);
      if (def?.mods) mods.push(def.mods);
    }
    return mods;
  }

  recomputeStats() {
    const before = this.stats;
    this.stats = computeDerivedStats(this.data, this.char, this.runtimeMods());
    const endow = this.player.buffs.find((b) => b.endow)?.endow;
    if (endow) this.stats.weaponElement = endow;
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
    if (this.instance) {
      const ins = this.instance;
      if (map.def.instanceId === ins.id) { ins.floor = map.def.floor ?? ins.floor; ins.cleared = false; }
      else {
        if (!ins.done) this.message(`You left the ${this.data.instances.get(ins.id)?.name}. The run is over.`, 'error');
        this.instance = null;
      }
    } else if (map.def.instanceId) {
      // Arriving on an instance floor without a run (e.g. a saved position): send the player back out.
      const def = this.data.instances.get(map.def.instanceId)!;
      this.enterMap(def.exitMap, 'default');
      return;
    }
    this.map = map;
    this.monsters.clear();
    this.petActor = null;
    this.homunActor = null;
    this.remotes.clear();
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
    delete this.tombstones[this.map.def.bossSpawn!.bossId];
    const bs = this.map.def.bossSpawn!;
    const bossDef = this.data.bosses.get(bs.bossId)!;
    const def = this.data.monsters.get(bossDef.monsterId)!;
    const m = this.makeMonster(def, bs.x * TILE + TILE / 2, bs.y * TILE + TILE / 2, -1);
    m.boss = { def: bossDef, phase: 0, engagedAt: 0, enraged: false, skillReadyAt: {}, casting: null, introShown: false, minions: [] };
    this.monsters.set(m.id, m);
  }

  // ---------------------------------------------------------------- main loop
  update(dtMs: number) {
    const scale = this.char.flags.gmTimeScale ? Math.max(1, Math.min(10, Math.floor(Number(this.char.flags.gmTimeScale)))) : 1;
    for (let i = 0; i < scale; i++) this.step(dtMs);
  }

  private step(dtMs: number) {
    const dt = Math.min(dtMs, 100);
    this.time += dt;
    this.char.stats_meta.playTimeMs += dt;

    if (this.statsDirty) this.recomputeStats();
    this.auto.update();
    this.updatePlayer(dt);
    for (const m of this.monsters.values()) this.updateMonster(m, dt);
    this.updateZones();
    this.updatePending();
    this.updateGroundItems();
    this.updatePet(dt);
    this.updateHomun(dt);
    this.updateInstance();
    this.updateEvents();
    if (this.time >= this.nextAchCheck) { this.nextAchCheck = this.time + 1000; this.updateAchievements(); }
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

  /** Where the pet is drawn: it trails a little behind the player. */
  petActor: { x: number; y: number; dir: Direction; moving: boolean } | null = null;

  private updatePet(dt: number) {
    const c = this.char;
    if (!c.pet) { this.petActor = null; return; }
    const wasLoyal = !!petMods(this.data, c);
    const ev = tickPet(this.data, c, this.time);
    if (ev === 'ranAway') { this.message('Your pet was so neglected that it ran away...', 'error'); this.petActor = null; this.invalidateStats(); return; }
    if (ev === 'hungry') this.message(`${c.pet.name} is hungry.`, 'system');
    if (wasLoyal !== !!petMods(this.data, c)) this.invalidateStats();
    const p = this.player;
    const a = (this.petActor ??= { x: p.x - 24, y: p.y + 8, dir: p.dir, moving: false });
    const dx = p.x - a.x, dy = p.y - a.y, d = Math.hypot(dx, dy);
    if (d > 400) { a.x = p.x - 24; a.y = p.y + 8; a.moving = false; return; }
    a.moving = d > 40;
    if (a.moving) {
      const step = Math.min(d - 36, (this.stats.moveSpeed * 1.1 * dt) / 1000);
      a.x += (dx / d) * step; a.y += (dy / d) * step;
      a.dir = dirFromVector(dx, dy, a.dir);
    }
  }

  // ---------------------------------------------------------------- memorial dungeons
  /** The running instance: floor progress and time limit (world time). */
  instance: { id: string; floor: number; endsAt: number; cleared: boolean; done: boolean } | null = null;
  private lastSealMsgAt = 0;

  /** Real-time ms until this instance can be entered again (0 = ready). */
  instanceCooldownLeft(id: string): number {
    const until = Number(this.char.flags[`instcd_${id}`] ?? 0);
    return Math.max(0, until - this.now());
  }

  enterInstance(id: string): OpResult {
    const def = this.data.instances.get(id);
    if (!def) return this.err('Unknown dungeon.');
    if (!this.nearService((s) => s.type === 'instance' && s.instanceId === id)) return this.err('Talk to the dungeon keeper first.');
    if (this.char.baseLevel < def.minLevel) return this.err(`${def.name} requires Base Level ${def.minLevel}.`);
    const cd = this.instanceCooldownLeft(id);
    if (cd > 0) return this.err(`${def.name} can be entered again in ${Math.ceil(cd / 60000)} min.`);
    this.char.flags[`instcd_${id}`] = this.now() + def.cooldownMs;
    this.instance = { id, floor: 1, endsAt: this.time + def.timeLimitMs, cleared: false, done: false };
    this.emit({ type: 'fx', fx: 'teleport', x: this.player.x, y: this.player.y });
    this.enterMap(def.floors[0], 'default');
    this.message(`${def.name} — Floor 1. Defeat every monster to unseal the way up. Time limit ${Math.round(def.timeLimitMs / 60000)} min.`, 'quest');
    return { ok: true };
  }

  private updateInstance() {
    const ins = this.instance;
    if (!ins) return;
    const def = this.data.instances.get(ins.id)!;
    if (!ins.done && this.time >= ins.endsAt) {
      this.message(`Time is up! You are pulled out of the ${def.name}.`, 'error');
      this.instance = null;
      this.enterMap(def.exitMap, 'default');
      return;
    }
    if (ins.cleared || this.map.def.instanceId !== ins.id) return;
    if ([...this.monsters.values()].some((m) => !m.dead)) return;
    ins.cleared = true;
    if (ins.floor < def.floors.length) {
      this.message(`Floor ${ins.floor} cleared! The seal on the portal breaks.`, 'quest');
      this.emit({ type: 'sound', key: 'level_up' });
      const ms = def.milestones?.find((x) => x.floor === ins.floor);
      if (ms) {
        this.char.luma += ms.reward.luma;
        for (const it of ms.reward.items) addItem(this.data, this.char, it.itemId, it.qty, { ignoreWeight: true });
        this.grantExp(ms.reward.exp, ms.reward.jobExp, `${def.name} floor ${ins.floor}`);
        this.char.flags[`instbest_${def.id}`] = Math.max(Number(this.char.flags[`instbest_${def.id}`] ?? 0), ins.floor);
        this.message(`Milestone reward for floor ${ins.floor}: ${ms.reward.luma.toLocaleString()} Luma and ${ms.reward.items.map((x) => `${x.qty}× ${this.data.items.get(x.itemId)?.name}`).join(', ')}.`, 'quest');
        this.afterInventoryChange();
      }
      return;
    }
    ins.done = true;
    const r = def.reward;
    this.message(`${def.name} conquered! Step into the exit portal to leave. Rewards: ${r.luma.toLocaleString()} Luma and ${r.items.map((x) => `${x.qty}× ${this.data.items.get(x.itemId)?.name}`).join(', ')}.`, 'quest');
    this.char.luma += r.luma;
    for (const it of r.items) addItem(this.data, this.char, it.itemId, it.qty, { ignoreWeight: true });
    this.grantExp(r.exp, r.jobExp, def.name);
    this.char.flags[`instclear_${def.id}`] = Number(this.char.flags[`instclear_${def.id}`] ?? 0) + 1;
    this.emit({ type: 'sound', key: 'level_up' });
    this.afterInventoryChange();
  }

  // ---------------------------------------------------------------- online play (set by the app's network client)
  /** Other players on this map (and the Emperium in the castle), for drawing and PvP. */
  remotes = new Map<string, RemoteActor>();
  /** Party members on this map within the level gap: the killer keeps 1/(n+1) of the EXP. */
  partyShareWith = 0;
  /** Bonus EXP % (the guild holding Castle Veyl gets 10%). */
  expBonusPct = 0;

  attackRemote(id: string): OpResult {
    if (!PVP_MAPS.includes(this.map.def.id)) return this.err('You can only fight other players in the Proving Grounds or the castle during the guild war.');
    if (!this.remotes.has(id)) return this.err('Target not found.');
    this.player.intent = { type: 'attackRemote', id };
    return { ok: true };
  }

  /** A hit from another player arrived from the server. */
  receivePvpHit(from: string, damage: number, crit: boolean) {
    if (!PVP_MAPS.includes(this.map.def.id) || this.player.dead) return;
    this.damagePlayer(damage, 'physical', 'neutral', null, crit);
    if (this.player.dead) this.emit({ type: 'pvpDeath', killer: from });
  }

  /** EXP shared by a party member's kill. */
  receivePartyExp(base: number, job: number, from: string) { this.grantExp(base, job, `party: ${from}`); }

  // ---------------------------------------------------------------- world events (raids)
  private eventsOn = true;
  /** Timed bonus events (EXP hours, weekend drops) by the real clock. Off in tests. */
  timedBonuses = true;
  private nextAchCheck = 0;

  /** Current timed bonus (EXP / drop multipliers). */
  bonus() { return this.timedBonuses ? bonusNow(this.now()) : { exp: 1, drop: 1, labels: [] as string[], nextChangeMs: 3_600_000 }; }
  private nextEventAt = 0;
  event: { mapId: string; mapName: string; leaderDefId: string; raiderDefId: string; endsAt: number; done: boolean } | null = null;

  /** End the current raid now (GM): raiders leave. */
  endEvent() {
    if (!this.event) return false;
    for (const m of [...this.monsters.values()]) if (m.eventRaid) this.monsters.delete(m.id);
    this.message(`The raid on ${this.event.mapName} was ended by a GM.`, 'system');
    this.event = null;
    return true;
  }

  private updateEvents() {
    if (!this.eventsOn && !this.event) return;
    const ev = this.event;
    if (ev && !ev.done && this.time >= ev.endsAt) {
      this.message(`The raid on ${ev.mapName} is over. The raiders withdrew.`, 'system');
      for (const m of [...this.monsters.values()]) if (m.eventRaid) this.monsters.delete(m.id);
      this.event = null;
    }
    if (ev?.done && this.time >= ev.endsAt) this.event = null;
    if (this.eventsOn && !this.event && this.time >= this.nextEventAt) this.startEvent();
    const cur = this.event;
    if (cur && !cur.done && cur.mapId === this.map.def.id && ![...this.monsters.values()].some((m) => m.eventRaid)) this.spawnRaid();
  }

  /** Start a raid on a field map near the player's level. */
  startEvent(mapId?: string): boolean {
    const lv = this.char.baseLevel;
    const fields = [...this.data.maps.values()].filter((m) => m.type === 'field' && m.levelRange && m.monsterSpawns.length);
    const fit = fields.filter((m) => m.levelRange![0] <= lv + 8 && m.levelRange![1] >= lv - 8);
    const pool = fit.length ? fit : fields;
    const map = mapId ? this.data.maps.get(mapId) : pool[Math.floor(this.rng.next() * pool.length)];
    if (!map) return false;
    const mons = map.monsterSpawns.map((s) => this.data.monsters.get(s.monsterId)!).filter((m) => m.aiType !== 'boss');
    const raider = mons.filter((m) => !m.elite).sort((a, b) => b.level - a.level)[0];
    const leader = mons.find((m) => m.elite) ?? raider;
    if (!raider) return false;
    this.event = { mapId: map.id, mapName: map.name, leaderDefId: leader.id, raiderDefId: raider.id, endsAt: this.time + EVENT_DURATION_MS, done: false };
    this.nextEventAt = this.time + EVENT_INTERVAL_MS;
    this.message(`⚔ RAID! ${leader.name} leads a band of ${raider.name}s against ${map.name} (Lv ${map.levelRange!.join('–')}). Defeat the leader within 10 minutes!`, 'quest');
    this.emit({ type: 'sound', key: 'boss_roar' });
    return true;
  }

  private spawnRaid() {
    const ev = this.event!;
    const p = this.player;
    const spots = this.spawnCells.flat();
    const pick = () => { const c = spots[Math.floor(this.rng.next() * spots.length)] ?? { x: p.x / TILE, y: p.y / TILE }; return { x: c.x * TILE + TILE / 2, y: c.y * TILE + TILE / 2 }; };
    const at = pick();
    const leader = this.spawnMonsterAt(ev.leaderDefId, at.x, at.y);
    if (leader) { leader.eventRaid = 'leader'; leader.maxHp = leader.hp = Math.round(leader.maxHp * (leader.def.elite ? 1.5 : 6)); }
    for (let i = 0; i < 8; i++) {
      const m = this.spawnMonsterAt(ev.raiderDefId, at.x + this.rng.range(-120, 120), at.y + this.rng.range(-90, 90));
      if (m) m.eventRaid = 'raider';
    }
    this.message(`The raiders of ${ev.mapName} are here!`, 'quest');
  }

  private onRaidKill(m: MonsterActor) {
    const ev = this.event;
    if (!ev || m.eventRaid !== 'leader' || ev.done) return;
    ev.done = true; ev.endsAt = this.time + 30000;
    const lv = m.def.level;
    const luma = lv * 300;
    this.char.luma += luma;
    this.grantExp(m.def.exp * 3, m.def.jobExp * 3, 'Raid leader');
    const album = this.rng.chance(0.3);
    if (album) addItem(this.data, this.char, 'card_album', 1, { ignoreWeight: true });
    this.char.flags.raidsWon = Number(this.char.flags.raidsWon ?? 0) + 1;
    this.message(`Raid repelled! +${luma.toLocaleString()} Luma${album ? ' and a Faded Card Album' : ''}.`, 'quest');
    for (const x of [...this.monsters.values()]) if (x.eventRaid === 'raider') this.schedule(2000, () => this.monsters.delete(x.id));
    this.afterInventoryChange();
  }

  // ---------------------------------------------------------------- homunculus
  homunActor: { x: number; y: number; dir: Direction; moving: boolean; attackReadyAt: number; skillReadyAt: number; targetId: string | null; animAt: number; anim: 'idle' | 'attack' } | null = null;

  homunProfile(): CombatProfile {
    const st = homunStats(this.data, this.char.homunculus!);
    const lv = this.char.homunculus!.level;
    return {
      level: lv, patk: st.atk, matk: st.matk, pdef: st.def, mdef: Math.round(st.def / 2), hit: st.hit + lv, flee: st.flee + lv, crit: 2, critDmg: 140,
      element: st.element, elementLevel: 1, elementDamagePct: {}, elementResistPct: {}, race: 'formless', size: 'small',
      raceDamagePct: {}, sizeDamagePct: {}, raceResistPct: {}, perfectDodge: 0, weaponType: 'monster',
    };
  }

  private damageHomun(amount: number, crit: boolean) {
    const h = this.char.homunculus;
    if (!h?.alive) return;
    h.hp = Math.max(0, h.hp - amount);
    this.emit({ type: 'damage', targetId: 'homun', amount, crit, miss: false, kind: 'physical' });
    if (h.hp <= 0) {
      h.alive = false; h.out = false; this.homunActor = null;
      h.intimacy = Math.max(0, h.intimacy - 20);
      for (const m of this.monsters.values()) delete m.threat.homun;
      this.message(`${h.name} has fallen! Use a Revival Tonic to bring it back.`, 'error');
    }
  }

  private updateHomun(dt: number) {
    const c = this.char, h = c.homunculus;
    const ev = tickHomun(c, this.time);
    if (ev === 'left') { this.message('Your homunculus was starved of affection and left you...', 'error'); this.homunActor = null; return; }
    if (ev === 'hungry' && h) this.message(`${h.name} is hungry.`);
    if (!h || !h.alive || !h.out || this.player.dead) { this.homunActor = null; return; }
    const st = homunStats(this.data, h);
    const p = this.player;
    const a = (this.homunActor ??= { x: p.x + 24, y: p.y + 8, dir: p.dir, moving: false, attackReadyAt: 0, skillReadyAt: this.time + 2000, targetId: null, animAt: 0, anim: 'idle' });
    // Natural regen out of combat.
    if (this.time - p.lastCombatAt > 4000 && h.hp < st.maxHp) h.hp = Math.min(st.maxHp, h.hp + (st.maxHp * 0.02 * dt) / 1000);
    // Pick a target: the owner's target, else a monster attacking the owner.
    let target = a.targetId ? this.monsters.get(a.targetId) : undefined;
    if (!target || target.dead || dist(target.x, target.y, p.x, p.y) > 450) {
      target = this.currentTarget && !this.currentTarget.dead ? this.currentTarget
        : [...this.monsters.values()].find((m) => !m.dead && m.targetId === 'player' && dist(m.x, m.y, p.x, p.y) < 260);
      a.targetId = target?.id ?? null;
    }
    const speed = this.stats.moveSpeed * 1.1;
    const step = (gx: number, gy: number, stop: number) => {
      const dx = gx - a.x, dy = gy - a.y, d = Math.hypot(dx, dy);
      if (d > 600) { a.x = gx; a.y = gy; a.moving = false; return true; }
      a.moving = d > stop;
      if (!a.moving) return true;
      const s = Math.min(d - stop, (speed * dt) / 1000);
      a.x += (dx / d) * s; a.y += (dy / d) * s; a.dir = dirFromVector(dx, dy, a.dir);
      return false;
    };
    const d = this.data.homunculi.get(h.typeId)!;
    // Support skills work without a target.
    if (this.time >= a.skillReadyAt && d.skill.kind === 'heal' && c.hp < this.stats.maxHp * 0.6) {
      const heal = Math.round((this.stats.maxHp * d.skill.value) / 100 + st.matk);
      const healed = Math.min(heal, this.stats.maxHp - c.hp);
      c.hp += healed; p.hp = c.hp;
      this.emit({ type: 'damage', targetId: 'player', amount: healed, crit: false, miss: false, kind: 'heal' });
      this.emit({ type: 'fx', fx: 'heal', x: p.x, y: p.y, targetId: 'player', offsetY: 0 });
      a.skillReadyAt = this.time + d.skill.cooldownMs;
    }
    if (this.time >= a.skillReadyAt && d.skill.kind === 'taunt') {
      const near = [...this.monsters.values()].filter((m) => !m.dead && m.targetId === 'player' && dist(m.x, m.y, a.x, a.y) <= d.skill.value);
      if (near.length) {
        for (const m of near) m.threat.homun = (m.threat.player ?? 0) + 500;
        this.emit({ type: 'fx', fx: 'taunt', x: a.x, y: a.y - 20 });
        a.skillReadyAt = this.time + d.skill.cooldownMs;
      }
    }
    if (!target) { step(p.x + 28, p.y + 10, 30); return; }
    const range = st.range + target.halfW;
    if (dist(a.x, a.y, target.x, target.y) > range) { step(target.x, target.y, range - 6); return; }
    a.moving = false;
    a.dir = dirFromVector(target.x - a.x, target.y - a.y, a.dir);
    if (this.time < a.attackReadyAt) return;
    a.attackReadyAt = this.time + st.aspdMs;
    a.anim = 'attack'; a.animAt = this.time;
    const hit = (mult: number, element: Element, kind: 'physical' | 'magic') => {
      if (target!.dead) return;
      const res = resolveAttack(this.data, this.rng, this.homunProfile(), this.monsterProfile(target!), { kind, multiplier: mult, element });
      if (!res.hit) { this.emit({ type: 'damage', targetId: target!.id, amount: 0, crit: false, miss: true, kind }); return; }
      this.damageMonster(target!, res.damage, kind, element, res.crit, false, false, true);
    };
    const kind = st.magic ? 'magic' : 'physical';
    if (st.magic) this.emit({ type: 'projectile', fromX: a.x, fromY: a.y - 18, toX: target.x, toY: target.y - 14, durationMs: 200, fx: 'magic_orb', color: '#c9a6ff' });
    if (this.time >= a.skillReadyAt && (d.skill.kind === 'flurry' || d.skill.kind === 'bolt')) {
      a.skillReadyAt = this.time + d.skill.cooldownMs;
      if (d.skill.kind === 'flurry') { for (let i = 0; i < d.skill.value; i++) this.schedule(i * 140, () => hit(0.8, st.element, 'physical')); }
      else { const els: Element[] = ['fire', 'water', 'wind', 'earth', 'shadow']; hit(d.skill.value, els[Math.floor(this.rng.next() * els.length)], 'magic'); }
      this.emit({ type: 'message', text: `${h.name}: ${d.skill.name}!`, channel: 'combat' });
      return;
    }
    hit(1, st.element, kind);
  }

  createHomunCmd(): OpResult {
    const r = createHomunculus(this.data, this.char, () => this.rng.next());
    if (!r.ok) return this.err(r.error);
    this.message(r.message!, 'quest'); this.afterInventoryChange();
    return r;
  }
  homunCallRest(): OpResult {
    const h = this.char.homunculus;
    if (!h) return this.err('You have no homunculus.');
    if (!h.alive) return this.err(`${h.name} has fallen. Revive it first.`);
    if (h.out && h.hp < homunStats(this.data, h).maxHp * 0.8) return this.err(`${h.name} needs 80% HP to rest (as in RO's Vaporize).`);
    h.out = !h.out;
    if (!h.out) this.homunActor = null;
    this.message(h.out ? `${h.name} is by your side.` : `${h.name} is resting.`);
    return { ok: true };
  }
  homunFeedCmd(): OpResult { const r = feedHomun(this.char); if (!r.ok) return this.err(r.error); this.message(r.message!); this.afterInventoryChange(); return r; }
  homunReviveCmd(): OpResult { const r = reviveHomun(this.data, this.char); if (!r.ok) return this.err(r.error); this.message(r.message!); this.afterInventoryChange(); return r; }
  homunEvolveCmd(): OpResult { const r = evolveHomun(this.data, this.char); if (!r.ok) return this.err(r.error); this.message(r.message!, 'quest'); this.emit({ type: 'fx', fx: 'job_change', x: this.homunActor?.x ?? this.player.x, y: this.homunActor?.y ?? this.player.y }); this.afterInventoryChange(); return r; }
  homunReleaseCmd(): OpResult { const r = releaseHomun(this.data, this.char); if (!r.ok) return this.err(r.error); this.homunActor = null; this.message(r.message!); this.afterInventoryChange(); return r; }

  // ---------------------------------------------------------------- pets
  /** Use a lure on a monster: consumes the lure and rolls the capture chance. */
  tamePet(lureUid: string, targetId?: string): OpResult {
    const inst = findInstance(this.char, lureUid);
    const def = inst && this.data.items.get(inst.itemId);
    if (!inst || !def?.lure) return this.err('That is not a lure.');
    const m = targetId ? this.monsters.get(targetId) : this.currentTarget;
    if (!m || m.dead) return this.err(`Target a ${this.data.monsters.get(def.lure)?.name ?? 'monster'} first.`);
    if (m.def.id !== def.lure) return this.err(`${def.name} only works on a ${this.data.monsters.get(def.lure)?.name}.`);
    if (m.boss) return this.err('Bosses cannot be tamed.');
    if (dist(this.player.x, this.player.y, m.x, m.y) > 160) return this.err('Get closer to it first.');
    const pd = petForMonster(this.data, m.def.id)!;
    removeByUid(this.char, lureUid, 1);
    const chance = captureChance(pd, this.char.baseLevel, m.def.level, this.stats.totalStats.luk, m.hp / m.maxHp);
    this.afterInventoryChange();
    if (!this.rng.chance(chance)) {
      this.aggroMonster(m, 1);
      this.emit({ type: 'fx', fx: 'spawn', x: m.x, y: m.y - 10 });
      return this.err(`Taming failed (${Math.round(chance * 100)}% chance). The ${m.def.name} is angry!`);
    }
    // Success: the monster becomes an egg (no EXP or drops) and respawns later as usual.
    m.dead = true; m.state = 'dead'; m.hp = 0; m.move = null; m.statuses = []; this.setAnim(m, 'dead');
    this.emit({ type: 'death', id: m.id });
    if (m.temporary || m.summoned) this.schedule(800, () => this.monsters.delete(m.id)); else m.respawnAt = this.time + m.def.respawnSeconds * 1000;
    if (this.player.intent.type === 'attack' && this.player.intent.targetId === m.id) this.player.intent = { type: 'none' };
    addItem(this.data, this.char, pd.eggItem, 1, { ignoreWeight: true });
    const egg = [...this.char.inventory].reverse().find((i) => i.itemId === pd.eggItem && !i.pet)!;
    egg.pet = newPetState(pd);
    this.emit({ type: 'fx', fx: 'sparkle', x: m.x, y: m.y - 10 });
    this.emit({ type: 'sound', key: 'level_up' });
    this.message(`You tamed a ${m.def.name}! Its egg is in your inventory.`, 'loot');
    this.afterInventoryChange();
    return { ok: true };
  }

  hatchPet(eggUid: string): OpResult {
    const r = hatchEgg(this.data, this.char, eggUid);
    if (!r.ok) return this.err(r.error);
    this.petActor = null;
    this.message(r.message!);
    this.emit({ type: 'fx', fx: 'sparkle', x: this.player.x - 24, y: this.player.y });
    this.invalidateStats(); this.afterInventoryChange();
    return r;
  }

  petToEgg(): OpResult {
    const r = returnToEgg(this.data, this.char);
    if (!r.ok) return this.err(r.error);
    this.petActor = null;
    this.message(r.message!);
    this.invalidateStats(); this.afterInventoryChange();
    return r;
  }

  feedPetCmd(): OpResult {
    const wasLoyal = !!petMods(this.data, this.char);
    const r = feedPet(this.data, this.char);
    if (!r.ok) return this.err(r.error);
    this.message(r.message!, r.delta! < 0 ? 'error' : 'system');
    if (this.petActor) this.emit({ type: 'fx', fx: r.delta! < 0 ? 'spawn' : 'heal', x: this.petActor.x, y: this.petActor.y - 10 });
    if (wasLoyal !== !!petMods(this.data, this.char)) { this.invalidateStats(); if (!wasLoyal) this.message(`${this.char.pet!.name} is now Loyal! Its bonus is active.`, 'loot'); }
    this.afterInventoryChange();
    return r;
  }

  petAccessoryCmd(uid?: string): OpResult {
    const r = uid ? equipPetAccessory(this.data, this.char, uid) : removePetAccessory(this.data, this.char);
    if (!r.ok) return this.err(r.error);
    this.message(r.message!); this.invalidateStats(); this.afterInventoryChange();
    return r;
  }

  evolvePetCmd(): OpResult {
    const r = evolvePet(this.data, this.char);
    if (!r.ok) return this.err(r.error);
    this.message(r.message!, 'quest'); this.petActor = null; this.invalidateStats(); this.afterInventoryChange();
    if (this.player) this.emit({ type: 'fx', fx: 'job_change', x: this.player.x - 24, y: this.player.y });
    return r;
  }

  renamePetCmd(name: string): OpResult {
    const r = renamePet(this.char, name);
    if (!r.ok) return this.err(r.error);
    this.message(r.message!);
    return r;
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
  private moveToward(a: ActorBase, gx: number, gy: number, speed: number, dt: number, stopDist = 2, maxNodes = 6000): boolean {
    if (dist(a.x, a.y, gx, gy) <= stopDist) { a.move = null; return true; }
    const needRepath = !a.move || a.move.repathAt <= this.time || dist(a.move.goalX, a.move.goalY, gx, gy) > 24;
    if (needRepath) {
      const stuckMs = a.move?.stuckMs ?? 0;
      if (lineClear(this.map, a.x, a.y, gx, gy, a.halfW, a.halfH)) {
        a.move = { path: [{ x: gx, y: gy }], goalX: gx, goalY: gy, repathAt: this.time + 250, stuckMs };
      } else {
        const path = findPath(this.map, a.x, a.y, gx, gy, maxNodes);
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
          if (!cannotAct && this.time >= p.attackReadyAt) {
            if (this.majorOverweight) { p.intent = { type: 'none' }; this.err('You are carrying too much to attack (90%+ weight).'); }
            else this.playerBasicAttack(m);
          }
        }
        break;
      }
      case 'attackRemote': {
        const r = this.remotes.get(it.id);
        if (!r || !PVP_MAPS.includes(this.map.def.id)) { p.intent = { type: 'none' }; p.move = null; break; }
        const range = this.stats.attackRange + 12;
        if (dist(p.x, p.y, r.x, r.y) > range) { if (!cannotMove) this.moveToward(p, r.x, r.y, this.stats.moveSpeed, dt, range - 6); break; }
        p.move = null;
        p.dir = dirFromVector(r.x - p.x, r.y - p.y, p.dir);
        if (cannotAct || this.time < p.attackReadyAt) break;
        p.attackReadyAt = this.time + this.stats.attackIntervalMs;
        this.setAnim(p, 'attack'); p.animAt = this.time; p.lastCombatAt = this.time;
        const kind = this.stats.attackKind === 'magic' ? 'magic' : 'physical';
        const res = resolveAttack(this.data, this.rng, this.playerProfile(), remoteProfile(r), { kind, multiplier: kind === 'magic' ? 0.75 : 1, element: this.stats.weaponElement });
        this.emit({ type: 'damage', targetId: `remote:${r.id}`, amount: res.hit ? res.damage : 0, crit: res.crit, miss: !res.hit, kind });
        if (res.hit) this.emit({ type: 'remoteHit', target: r.id, damage: res.damage, crit: res.crit });
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
      if (this.map.def.instanceId && !this.instance?.cleared) {
        if (this.time - this.lastSealMsgAt > 2000) { this.lastSealMsgAt = this.time; this.message('The portal is sealed. Defeat every monster on this floor first.', 'error'); }
        return;
      }
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

  /** Ragnarok rule: at 90%+ of the weight limit you cannot attack or use skills. */
  get majorOverweight(): boolean { return this.weight >= (this.weightLimit * this.data.balance.stats.overweightActionStopPct) / 100; }

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
      // Double Attack (daggers): a second strike in the same swing.
      if (!m.dead && this.stats.doubleAttackPct > 0 && this.rng.chance(this.stats.doubleAttackPct / 100)) {
        const res2 = resolveAttack(this.data, this.rng, this.playerProfile(), this.monsterProfile(m), { ...opts, alwaysHit: true });
        this.damageMonster(m, res2.damage, opts.kind, opts.element, res2.crit, false);
        this.emit({ type: 'fx', fx: 'slash_small', x: m.x, y: m.y - 18, targetId: m.id, offsetY: -18 });
      }
      // Autocast (cards / gear): a free spell at the target.
      for (const ac of this.stats.autocasts) {
        if (m.dead || !this.rng.chance(ac.chancePct / 100)) continue;
        const sk = this.data.skills.get(ac.skillId);
        if (!sk) continue;
        this.emit({ type: 'message', text: `Autocast: ${sk.name} Lv.${ac.level}!`, channel: 'combat' });
        this.executeSkill(sk.id, ac.level, sk.targeting === 'enemy' ? m.id : undefined, m.x, m.y, true);
      }
      // Card / option procs on basic attacks: status on hit and HP drain.
      for (const [st, pct] of Object.entries(this.stats.onHitStatusPct)) if (pct && !m.dead) this.applyStatus(m, st as StatusId, pct / 100);
      if (this.stats.hpDrainPct > 0 && !this.player.dead) {
        const heal = Math.min(this.stats.maxHp - this.char.hp, Math.floor((res.damage * this.stats.hpDrainPct) / 100));
        if (heal > 0) { this.char.hp += heal; this.player.hp = this.char.hp; this.emit({ type: 'damage', targetId: 'player', amount: heal, crit: false, miss: false, kind: 'heal' }); }
      }
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
  damageMonster(m: MonsterActor, amount: number, kind: 'physical' | 'magic' | 'dot', element: Element, crit: boolean, _fromZone: boolean, silentAggro = false, fromHomun = false) {
    if (m.dead) return;
    if (this.gm.oneHitKill && !fromHomun && kind !== 'dot') amount = Math.max(amount, m.hp);
    m.hp = Math.max(0, m.hp - amount);
    // The owner gets the kill credit for homunculus damage (as in RO); the homunculus also draws threat.
    m.damageBy.player = (m.damageBy.player ?? 0) + amount;
    if (fromHomun) { m.damageBy.homun = (m.damageBy.homun ?? 0) + amount; m.threat.homun = (m.threat.homun ?? 0) + amount; }
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
    if (petOwnerDied(this.data, this.char) === 'ranAway') this.message('Your pet ran away...', 'error');
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
      const mul = (1 + this.expBonusPct / 100) * this.bonus().exp, n = this.partyShareWith + 1;
      const base = Math.round(m.def.exp * mul), job = Math.round(m.def.jobExp * mul);
      this.grantExp(Math.floor(base / n), Math.floor(job / n), m.def.name);
      if (n > 1) this.emit({ type: 'partyExp', base, job, mapId: this.map.def.id, monsterLevel: m.def.level });
      if (m.eventRaid) this.onRaidKill(m);
      const hm = this.char.homunculus;
      if (hm?.alive && (m.damageBy.homun ?? 0) > 0) {
        const lv = addHomunExp(this.data, hm, Math.ceil(m.def.exp * 0.5));
        if (lv) this.message(`${hm.name} reached Lv ${hm.level}!`, 'quest');
      }
      this.rollDrops(m);
      for (const l of m.loot ?? []) { const g = this.dropToGround(l.itemId, l.qty, m.x + this.rng.range(-16, 16), m.y + this.rng.range(-10, 10), true); if (l.options) g.options = l.options; if (this.autoLoot) this.pickup(g.id, true); }
      m.loot = [];
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
      // MVP goes to the top damage dealer, and only if they are still alive (Ragnarok rule).
      const top = Object.entries(m.damageBy).sort((a, c) => c[1] - a[1])[0]?.[0];
      const isMvp = top === 'player' && !this.player.dead;
      const respawnSec = this.map.def.bossSpawn?.respawnSeconds ?? m.def.respawnSeconds;
      if (isMvp) {
        const mvp = b.def.mvp ?? { expPct: 50, items: [] };
        const exp = Math.round((m.def.exp * mvp.expPct) / 100);
        const got: string[] = [];
        for (const it of mvp.items) if (this.rng.chance(it.chance)) { this.giveItem(it.itemId, 1, 'MVP reward'); got.push(it.itemId); }
        this.grantExp(exp, 0, 'MVP');
        this.message(`MVP! ${this.char.name} is the MVP of ${m.def.name}! +${exp} MVP EXP.`, 'quest');
        this.emit({ type: 'mvp', name: m.def.name, killer: this.char.name, exp, items: got });
        this.emit({ type: 'fx', fx: 'level_up', x: this.player.x, y: this.player.y, targetId: 'player', offsetY: 0 });
      }
      this.bossRespawnAt[b.def.id] = this.time + respawnSec * 1000;
      this.tombstones[b.def.id] = { mapId: this.map.def.id, x: m.x, y: m.y, boss: m.def.name, killer: isMvp ? this.char.name : 'unknown', killedAt: this.now(), respawnAt: this.time + respawnSec * 1000 };
      const mapId = this.map.def.id;
      this.schedule(respawnSec * 1000, () => {
        if (this.map.def.id === mapId) { this.monsters.delete(m.id); this.spawnBoss(); this.message(`${m.def.name} has returned to ${this.map.def.name}...`); }
      });
      this.telegraphs = [];
    } else if (m.temporary) {
      this.schedule(1500, () => this.monsters.delete(m.id));
    } else {
      m.respawnAt = this.time + m.def.respawnSeconds * 1000;
    }
  }

  /** Looter AI: walk to a nearby item that has lain on the ground a few seconds and take it. */
  private updateLooter(m: MonsterActor, speed: number, dt: number): boolean {
    let best: GroundItem | null = null, bd = 170;
    for (const g of this.groundItems.values()) {
      if (this.time - g.droppedAt < 3000) continue;
      const d = dist(m.x, m.y, g.x, g.y);
      if (d < bd) { bd = d; best = g; }
    }
    if (!best) return false;
    if (bd <= 14) {
      this.groundItems.delete(best.id);
      (m.loot ??= []).push({ itemId: best.itemId, qty: best.qty, options: best.options });
      this.emit({ type: 'fx', fx: 'drop', x: best.x, y: best.y });
      return true;
    }
    m.state = 'patrol';
    this.moveToward(m, best.x, best.y, speed * 0.7, dt, 4);
    return true;
  }

  private killMinionSilently(m: MonsterActor) {
    m.dead = true; m.state = 'dead'; this.setAnim(m, 'dead');
    this.emit({ type: 'death', id: m.id });
    this.schedule(1200, () => this.monsters.delete(m.id));
  }

  grantExp(base: number, job: number, source?: string) {
    const c = this.char;
    const rate = this.gm.expRate;
    if (rate !== 100) { base = Math.round((base * rate) / 100); job = Math.round((job * rate) / 100); }
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
      const l = Math.round((this.rng.int(table.luma[0], table.luma[1]) * this.gm.lumaRate) / 100);
      this.char.luma += l;
      this.message(`+${l} Luma`, 'loot');
    }
    let n = 0;
    const bonus = this.bonus().drop;
    for (const e of table.entries) {
      if (!this.rng.chance(Math.min(1, (e.chance * this.gm.dropRate * bonus) / 100))) continue;
      const qty = this.rng.int(e.min ?? 1, e.max ?? 1);
      const angle = (n++ / 5) * Math.PI * 2 + this.rng.next();
      const r = n === 1 ? 0 : 18 + this.rng.next() * 10;
      const g = this.dropToGround(e.itemId, qty, m.x + Math.cos(angle) * r, m.y + Math.sin(angle) * r * 0.6, true);
      // Equipment from monsters may carry random options (Ragnarok Zero style).
      const def = this.data.items.get(e.itemId);
      if (def?.type === 'equipment') { const opts = rollDropOptions(def, () => this.rng.next()); if (opts.length) g.options = opts; }
      if (this.autoLoot) this.pickup(g.id, true);
    }
  }

  dropToGround(itemId: string, qty: number, x: number, y: number, deferLoot = false): GroundItem {
    const g: GroundItem = {
      id: this.uid('g'), itemId, qty, x, y, droppedAt: this.time,
      expiresAt: this.time + this.data.balance.combat.groundItemLifetimeMs,
    };
    this.groundItems.set(g.id, g);
    const rarity = this.data.items.get(itemId)?.rarity;
    this.emit({ type: 'fx', fx: rarity === 'rare' || rarity === 'epic' || rarity === 'legendary' ? 'drop_rare' : 'drop', x, y });
    if (this.autoLoot && !deferLoot) this.pickup(g.id, true);
    return g;
  }

  pickup(groundId: string, silentFail = false): OpResult {
    const g = this.groundItems.get(groundId);
    if (!g) return { ok: false, error: 'Item is gone.' };
    const r = addItem(this.data, this.char, g.itemId, g.qty, { weightLimit: this.weightLimit });
    if (!r.ok) { if (!silentFail) this.message(r.error, 'error'); return r; }
    if (g.options?.length) {
      const inst = [...this.char.inventory].reverse().find((i) => i.itemId === g.itemId && !i.options && !i.crafter);
      if (inst) inst.options = g.options;
    }
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

  afterInventoryChange() {
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
      if (!m.boss && !m.summoned && m.respawnAt && this.time >= m.respawnAt && !this.map.def.instanceId) this.respawnMonster(m);
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
        if (m.def.looter && !cannotMove && this.updateLooter(m, speed, dt)) break;
        // Far from the player, idle monsters doze (as in Ragnarok, only monsters near players act).
        if (!m.boss && dist(m.x, m.y, p.x, p.y) > DORMANT_RANGE) { if (m.state === 'patrol') { m.state = 'idle'; m.patrol = null; m.move = null; } break; }
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
          const arrived = this.moveToward(m, m.patrol.x, m.patrol.y, speed * 0.5, dt, 4, 500);
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
      threat: {}, damageBy: {}, statuses: [], buffs: [], move: null, kb: null, respawnAt: 0, loot: [], stolen: false, mugged: false,
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
    // A homunculus that holds more threat than its owner and stands in reach takes the hit instead.
    const ha = this.homunActor, hs = this.char.homunculus;
    if (ha && hs?.alive && (m.threat.homun ?? 0) > (m.threat.player ?? 0) && dist(m.x, m.y, ha.x, ha.y) <= m.def.attackRange + m.halfW + 24) {
      const res = resolveAttack(this.data, this.rng, this.monsterProfile(m), this.homunProfile(), opts);
      if (!res.hit) { this.emit({ type: 'damage', targetId: 'homun', amount: 0, crit: false, miss: true, kind: 'physical' }); return; }
      this.damageHomun(res.damage, res.crit);
      return;
    }
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
    // One wave of servants at a time: no new summon while the last wave is alive (big halls let them live long).
    if (skill.kind === 'summon' && b.minions.some((id) => { const x = this.monsters.get(id); return x && !x.dead; })) return false;
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

  skillLumaCost(skill: SkillDef, level: number): number {
    return skill.lumaCost ? skill.lumaCost + (skill.lumaCostPerLevel ?? 0) * (level - 1) : 0;
  }

  canUseSkill(skillId: string): OpResult {
    const skill = this.data.skills.get(skillId);
    const lvl = this.skillLevel(skillId);
    const p = this.player;
    if (!skill) return { ok: false, error: 'Unknown skill.' };
    if (lvl <= 0) return { ok: false, error: `You have not learned ${skill.name}.` };
    if (skill.kind === 'passive') return { ok: false, error: `${skill.name} is a passive skill.` };
    if (this.majorOverweight) return { ok: false, error: 'You are carrying too much to use skills (90%+ weight).' };
    if (p.dead) return { ok: false, error: 'You are dead.' };
    if (this.hasStatusFlag(p, 'preventsSkills')) return { ok: false, error: 'You are silenced!' };
    if (this.hasStatusFlag(p, 'preventsAction')) return { ok: false, error: 'You cannot act right now.' };
    if ((p.cooldowns[skillId] ?? 0) > this.time) return { ok: false, error: `${skill.name} is on cooldown.` };
    if (!this.gm.noCooldown && this.char.mp < this.skillMpCost(skill, lvl)) return { ok: false, error: 'Not enough MP.' };
    if (this.char.luma < this.skillLumaCost(skill, lvl)) return { ok: false, error: `${skill.name} needs ${this.skillLumaCost(skill, lvl)} Luma.` };
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

  /** `free`: an autocast — no MP/Luma cost, no cooldown, no animation or attack delay. */
  private executeSkill(skillId: string, level: number, targetId?: string, x?: number, y?: number, free = false) {
    const skill = this.data.skills.get(skillId)!;
    const p = this.player;
    const cost = free || this.gm.noCooldown ? 0 : this.skillMpCost(skill, level);
    if (this.char.mp < cost) { this.message('Not enough MP.', 'error'); return; }
    let target = targetId ? this.monsters.get(targetId) : undefined;
    if (skill.targeting === 'enemy' && (!target || target.dead)) { if (!free) this.message('Target lost.', 'error'); return; }
    const luma = free ? 0 : this.skillLumaCost(skill, level);
    if (this.char.luma < luma) { this.message(`${skill.name} needs ${luma} Luma.`, 'error'); return; }
    this.char.mp -= cost;
    this.char.luma -= luma;
    p.lastCombatAt = this.time;
    if (!free) {
      p.cooldowns[skillId] = this.gm.noCooldown ? 0 : this.time + skill.cooldownMs * (1 - this.stats.cdrPct / 100);
      this.setAnim(p, skill.targeting === 'self' && skill.kind === 'buff' ? 'cast' : 'attack');
      p.animAt = this.time;
      // Basic attack resets after a skill to prevent double-dipping.
      p.attackReadyAt = Math.max(p.attackReadyAt, this.time + 300);
    }

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
        case 'endow': {
          p.buffs = p.buffs.filter((b) => !b.endow);
          this.addBuff(p, { id: `endow_${e.element}`, name: skill.name, mods: {}, durationMs: e.durationMs + (e.perLevelMs ?? 0) * (level - 1), color: skill.icon.color, endow: e.element });
          this.message(`Your weapon is now ${e.element}.`);
          break;
        }
        case 'cure': {
          const n = this.cureStatuses(p, e.statuses);
          if (n) this.message('You feel cleansed.');
          this.emit({ type: 'fx', fx: 'cure', x: p.x, y: p.y, targetId: 'player' });
          break;
        }
        case 'mug': {
          for (const m of lastTargets) {
            if (m.mugged || m.boss) continue;
            m.mugged = true;
            const gain = Math.round(m.def.level * (level * e.perLevel + this.stats.totalStats.luk / 10));
            this.char.luma += gain;
            this.message(`You pocket ${gain} Luma.`, 'loot');
          }
          break;
        }
        case 'steal': {
          for (const m of lastTargets) {
            if (m.dead) continue;
            this.aggroMonster(m, 1);
            if (m.stolen || m.boss) { this.message(m.boss ? 'You cannot steal from a boss.' : 'Nothing left to steal.', 'error'); continue; }
            // Chance rises with DEX and skill level, falls with the monster's level.
            const chance = (e.chance + e.perLevel * level + (this.stats.totalStats.dex - m.def.level) / 2) / 100;
            const pool = (this.data.drops.get(m.def.dropTableId)?.entries ?? []).filter((d) => this.data.items.get(d.itemId)?.type !== 'card');
            const pick = pool.find((d) => this.rng.chance(Math.min(1, chance * Math.max(d.chance, 0.05) * 5)));
            if (!pick) { this.message('Steal failed.'); continue; }
            m.stolen = true;
            const r = addItem(this.data, this.char, pick.itemId, 1);
            if (r.ok) this.message(`You stole ${this.data.items.get(pick.itemId)!.name}!`, 'loot');
            else this.dropToGround(pick.itemId, 1, p.x, p.y);
            this.afterInventoryChange();
          }
          break;
        }
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
    const path = findPath(this.map, p.x, p.y, x, y, 40000);
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

  /**
   * GM controls for this world (see core/gm.ts). Rates are in % (100 = normal).
   * Stored on the character (flags.gm*) so they survive a reload.
   */
  get gm() {
    const f = this.char.flags;
    return {
      expRate: Number(f.gmExpRate ?? 100), dropRate: Number(f.gmDropRate ?? 100), lumaRate: Number(f.gmLumaRate ?? 100),
      oneHitKill: !!f.gmOneHit, noCooldown: !!f.gmNoCooldown, invisible: !!f.gmInvisible, moveSpeedPct: Number(f.gmSpeed ?? 0), timeScale: Number(f.gmTimeScale ?? 1),
    };
  }

  /** Respawn the map's boss now (GM). */
  respawnBossNow(): boolean {
    if (!this.map.def.bossSpawn) return false;
    for (const m of [...this.monsters.values()]) if (m.boss) this.monsters.delete(m.id);
    this.spawnBoss();
    return true;
  }

  /** Last NPC the player talked to (Auto Quest uses it to know a conversation happened). */
  lastNpcTalk: { npcId: string; at: number } | null = null;
  /** Auto Farm / Auto Quest. */
  auto = new AutoPilot(this);

  private talkToNpc(npcId: string) {
    this.lastNpcTalk = { npcId, at: this.time };
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
    if (def.lure) return this.tamePet(uid);
    if (def.id === 'homun_embryo') return this.createHomunCmd();
    if (def.id === 'homun_ration') return this.homunFeedCmd();
    if (def.id === 'homun_revive') return this.homunReviveCmd();
    if (def.petEgg) return this.hatchPet(uid);
    if (def.petFood) return this.feedPetCmd();
    if (def.petAccessory) return this.petAccessoryCmd(uid);
    if (def.id === BREW_BOWL) {
      if (!canBrew(this.char)) return this.err('Only an Alchemist who knows Potion Research can brew.');
      this.emit({ type: 'openWindow', id: 'brew' });
      return { ok: true };
    }
    if (def.type !== 'consumable' || !def.use) return this.err(`${def.name} cannot be used.`);
    if (p.dead) return this.err('You are dead.');
    if ((p.itemCooldowns[def.id] ?? 0) > this.time) return this.err('Wait a moment before using that again.');
    let throwAt: MonsterActor | undefined;
    for (const u of def.use) {
      if (u.type === 'returnToSave' && p.cast) return this.err('Cannot use while casting.');
      if (u.type === 'throw') {
        throwAt = this.throwTarget();
        if (!throwAt) return this.err('No monster close enough to throw at.');
      }
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
          this.emit({ type: 'fx', fx: 'heal', x: p.x, y: p.y, targetId: 'player', offsetY: 0 });
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
        case 'endow':
          this.player.buffs = this.player.buffs.filter((b) => !b.endow);
          this.addBuff(p, { id: `endow_${u.element}`, name: def.name, mods: {}, durationMs: u.durationMs, color: def.icon.color, endow: u.element });
          this.invalidateStats();
          this.message(`Your weapon is now ${u.element}.`);
          this.emit({ type: 'fx', fx: 'buff', x: p.x, y: p.y, targetId: 'player' });
          break;
        case 'randomTeleport': {
          // Random walkable spot on this map (reachable from the spawn), like a fly wing.
          const cells: number[] = [];
          this.map.reachable.forEach((v, i) => { if (v) cells.push(i); });
          const cell = cells[Math.floor(this.rng.next() * cells.length)];
          this.emit({ type: 'fx', fx: 'teleport', x: p.x, y: p.y });
          p.x = (cell % this.map.width) * TILE + TILE / 2; p.y = Math.floor(cell / this.map.width) * TILE + TILE / 2;
          p.move = null; p.intent = { type: 'none' };
          this.emit({ type: 'fx', fx: 'teleport', x: p.x, y: p.y });
          break;
        }
        case 'returnToSave':
          this.emit({ type: 'fx', fx: 'teleport', x: p.x, y: p.y });
          this.enterMap(this.char.savePoint.mapId, this.char.savePoint.spawn);
          break;
        case 'randomCard': {
          const pool = [...this.data.items.values()].filter((i) => i.type === 'card' && i.card && this.data.monsters.get(i.card.monsterId)?.aiType !== 'boss');
          const card = pool[Math.floor(this.rng.next() * pool.length)];
          addItem(this.data, this.char, card.id, 1, { ignoreWeight: true });
          this.message(`The album held a ${card.name}!`, 'loot');
          this.emit({ type: 'fx', fx: 'drop_rare', x: p.x, y: p.y });
          break;
        }
        case 'resetStats':
          resetStats(this.data, this.char);
          this.message('Your stat points have been refunded.');
          break;
        case 'resetSkills':
          { const rs = resetSkills(this.data, this.char); if (rs.ok && rs.message) this.message(rs.message); }
          break;
        case 'throw': {
          const t = throwAt!;
          this.emit({ type: 'projectile', fromX: p.x, fromY: p.y - 18, toX: t.x, toY: t.y - 14, durationMs: 250, fx: 'magic_orb', color: def.icon.color });
          const base = u.damage + u.perLevel * this.char.baseLevel;
          const mul = 1 + 0.05 * (this.char.skills.potion_research ?? 0);
          const hits = u.radius ? [...this.monsters.values()].filter((m) => !m.dead && Math.hypot(m.x - t.x, m.y - t.y) <= u.radius!) : [t];
          for (const m of hits) {
            const amount = Math.max(1, Math.round(base * mul * elementModifier(this.data, u.element, m.def.element, m.def.elementLevel ?? 1) * (0.9 + this.rng.next() * 0.2)));
            this.damageMonster(m, amount, 'physical', u.element, false, false);
            if (u.status && !m.dead) this.applyStatus(m, u.status, u.statusChance ?? 0);
          }
          if (u.radius) this.emit({ type: 'fx', fx: u.element === 'fire' ? 'fire' : 'hit', x: t.x, y: t.y, radius: u.radius });
          break;
        }
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
    const def = this.data.items.get(findInstance(this.char, uid)?.itemId ?? '');
    return this.wrap(equipItem(this.data, this.char, uid, slot), () => {
      this.emit({ type: 'sound', key: 'equip' });
      const s = EQUIP_SLOTS.find((k) => this.char.equipment[k]?.uid === uid) ?? def?.slot;
      if (s) this.questTick(questEvents.equip(this.data, this.char, s));
    });
  }

  /** Compound a card into an unequipped piece of equipment (permanent). */
  compound(cardUid: string, equipUid: string): OpResult {
    return this.wrap(compoundCard(this.data, this.char, cardUid, equipUid), () => {
      this.emit({ type: 'sound', key: 'equip' });
      this.emit({ type: 'fx', fx: 'sparkle', x: this.player.x, y: this.player.y - 20 });
    });
  }

  /** Enchanter NPC: add one random option, or reroll all options. */
  enchant(uid: string, mode: 'add' | 'reroll'): OpResult {
    if (!this.nearService((s) => s.type === 'enchant')) return this.err('Talk to an enchanter first.');
    return this.wrap((mode === 'add' ? enchantAdd : enchantReroll)(this.data, this.char, uid, () => this.rng.next()), () => {
      this.emit({ type: 'sound', key: 'learn' });
      this.emit({ type: 'fx', fx: 'arcane', x: this.player.x, y: this.player.y - 20 });
    });
  }

  /** Forge a weapon at a forge NPC. */
  forge(choice: ForgeChoice): ForgeResult {
    if (!this.nearService((s) => s.type === 'forge')) return this.err('You need a forge master to forge weapons.');
    const r = forgeWeapon(this.data, this.char, choice, this.rng.next());
    if (!r.ok) return this.err(r.error);
    this.message(r.message!, r.success ? 'loot' : 'error');
    this.emit({ type: 'sound', key: r.success ? 'level_up' : 'error' });
    this.emit({ type: 'fx', fx: r.success ? 'sparkle' : 'spawn', x: this.player.x, y: this.player.y - 20 });
    this.afterInventoryChange();
    return r;
  }

  /** Refine an equipped or carried item at a refine NPC. */
  refine(uid: string, enriched = false): RefineResult {
    if (!this.nearService((s) => s.type === 'refine')) return this.err('You are too far from the refiner.');
    const r = refineItem(this.data, this.char, uid, this.rng.next(), enriched, this.rng.next());
    if (!r.ok) return this.err(r.error);
    this.message(r.message!, r.outcome === 'success' ? 'system' : 'error');
    this.emit({ type: 'sound', key: r.outcome === 'success' ? 'level_up' : 'error' });
    this.emit({ type: 'fx', fx: r.outcome === 'success' ? 'sparkle' : 'spawn', x: this.player.x, y: this.player.y - 20 });
    if (r.outcome === 'success') this.questTick(questEvents.refine(this.data, this.char, r.level!));
    if (r.wasEquipped) this.recomputeStats();
    this.afterInventoryChange();
    return r;
  }

  /** Job change at a class guild NPC (requirements from classes.json). */
  changeJobAt(classId: string): OpResult {
    if (!this.nearService((s) => s.type === 'jobChange' && s.classIds.includes(classId))) return this.err('Talk to the guild master to change job.');
    const r = changeJob(this.data, this.char, classId);
    if (!r.ok) return this.err(r.error);
    this.recomputeStats();
    this.message(r.message!, 'quest');
    this.emit({ type: 'jobChanged', classId });
    this.emit({ type: 'fx', fx: 'job_change', x: this.player.x, y: this.player.y });
    this.emit({ type: 'sound', key: 'level_up' });
    return r;
  }

  rebirthAt(): OpResult {
    if (!this.nearService((s) => s.type === 'rebirth')) return this.err('Only the Oracle of Rebirth can do this.');
    const r = rebirth(this.data, this.char);
    if (!r.ok) return this.err(r.error);
    // Gear the High Novice can no longer wear goes back to the bag.
    for (const slot of EQUIP_SLOTS) { const inst = this.char.equipment[slot]; if (inst) { delete this.char.equipment[slot]; this.char.inventory.push(inst); } }
    this.recomputeStats();
    this.char.hp = this.stats.maxHp; this.char.mp = this.stats.maxMp; this.player.hp = this.char.hp;
    this.message(r.message!, 'quest');
    this.emit({ type: 'jobChanged', classId: 'high_novice' });
    this.emit({ type: 'fx', fx: 'job_change', x: this.player.x, y: this.player.y });
    this.emit({ type: 'sound', key: 'level_up' });
    return r;
  }

  // ---------------------------------------------------------------- rune constellation
  learnRuneCmd(id: string): OpResult {
    const r = learnRune(this.data, this.char, id);
    if (!r.ok) return this.err(r.error);
    this.invalidateStats(); this.message(r.message!);
    return r;
  }
  resetRunesCmd(): OpResult {
    let cost = 0;
    if (!this.nearService((s) => s.type === 'runeReset' && ((cost = s.cost), true))) return this.err('Only an Astrologer can reset the constellations.');
    const r = resetRunes(this.char, cost);
    if (!r.ok) return this.err(r.error);
    this.invalidateStats(); this.message(r.message!);
    return r;
  }

  // ---------------------------------------------------------------- mount & cart
  get canMount(): boolean { return classLineage(this.data, this.char.classId).includes('knight'); }
  rentMount(): OpResult {
    let cost = 0;
    if (!this.nearService((s) => s.type === 'stable' && ((cost = s.cost), true))) return this.err('Talk to the stable master.');
    if (!this.canMount) return this.err('Only the Knight line can ride war-drakes.');
    if (this.char.flags.mountOwned) return this.err('You already have a war-drake.');
    if (this.char.luma < cost) return this.err(`Needs ${cost} Luma.`);
    this.char.luma -= cost; this.char.flags.mountOwned = true;
    this.message('You now own a war-drake. Mount or dismount from the Status window.', 'quest');
    return this.toggleMount();
  }
  /** Ride: +25% move speed and +1000 weight, but −40% attack speed (Drake Riding gives 8% back per level). */
  toggleMount(): OpResult {
    if (!this.char.flags.mountOwned || !this.canMount) return this.err('You have no mount.');
    this.char.flags.mounted = !this.char.flags.mounted;
    this.invalidateStats();
    this.message(this.char.flags.mounted ? 'You mount your war-drake.' : 'You dismount.');
    return { ok: true };
  }
  get canCart(): boolean { return classLineage(this.data, this.char.classId).includes('merchant'); }
  rentCart(): OpResult {
    let cost = 0;
    if (!this.nearService((s) => s.type === 'cart' && ((cost = s.cost), true))) return this.err('Talk to the Merchant guild.');
    if (!this.canCart) return this.err('Only the Merchant line can push a cart.');
    if (this.char.cart) return this.err('You already have a pushcart.');
    if (this.char.luma < cost) return this.err(`Needs ${cost} Luma.`);
    this.char.luma -= cost; this.char.cart = [];
    this.message('You rent a pushcart: 100 slots, 8,000 weight. Open it from the Items window.', 'quest');
    return { ok: true };
  }
  cartPut(uid: string, qty: number): OpResult { return this.wrap(putInCart(this.data, this.char, uid, qty)); }
  cartTake(uid: string, qty: number): OpResult { return this.wrap(takeFromCart(this.data, this.char, uid, qty, this.weightLimit)); }

  /** Paid teleport at a warp-service NPC. */
  warpTo(mapId: string): OpResult {
    let dest: { mapId: string; spawn: string; cost: number } | undefined;
    if (!this.nearService((s) => s.type === 'warp' && !!(dest = s.destinations.find((d) => d.mapId === mapId)))) return this.err('No warp service here for that destination.');
    if (this.char.luma < dest!.cost) return this.err(`Needs ${dest!.cost} Luma.`);
    this.char.luma -= dest!.cost;
    this.emit({ type: 'sound', key: 'teleport' });
    this.enterMap(dest!.mapId, dest!.spawn);
    return { ok: true, message: `Warped to ${this.data.maps.get(mapId)!.name}.` };
  }

  private questTick(updated: string[]) { if (updated.length) this.questUpdated([...new Set(updated)]); }
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
    const r = this.data.shops.get(shopId)?.market
      ? traderBuy(this.data, this.char, shopId, itemId, qty, this.now(), this.weightLimit)
      : buyItem(this.data, this.char, shopId, itemId, qty, this.weightLimit);
    return this.wrap(r, () => {
      this.emit({ type: 'sound', key: 'coin' });
      this.questTick(questEvents.buy(this.data, this.char, itemId));
    });
  }
  private updateAchievements() {
    for (const a of checkAchievements(this.data, this.char, this.now())) {
      this.message(`Achievement unlocked: ${a.name}! Title "${a.title}" is now yours.`, 'quest');
      this.emit({ type: 'sound', key: 'level_up' });
      this.emit({ type: 'achievement', id: a.id });
    }
  }

  /** Who a thrown bottle hits: the current target if it is close enough, else the nearest monster. */
  private throwTarget(): MonsterActor | undefined {
    const p = this.player, range = 260;
    const t = this.currentTarget;
    if (t && !t.dead && Math.hypot(t.x - p.x, t.y - p.y) <= range) return t;
    let best: MonsterActor | undefined, bd = range;
    for (const m of this.monsters.values()) {
      if (m.dead || m.summoned) continue;
      const d = Math.hypot(m.x - p.x, m.y - p.y);
      if (d <= bd) { bd = d; best = m; }
    }
    return best;
  }

  /** Alchemist brewing: one try at a recipe (uses a Medicine Bowl). */
  brew(recipeId: string): OpResult {
    const st = this.stats.totalStats;
    const r = brew(this.data, this.char, recipeId, { dex: st.dex, luk: st.luk, int: st.int }, this.rng.next());
    if (!r.ok) return this.err(r.error);
    const name = this.data.items.get(recipeId.replace(/^brew_/, ''))?.name ?? recipeId;
    if (r.success) { this.message(`Brewing succeeded: ${name}! (${r.chance}% chance)`, 'loot'); this.emit({ type: 'sound', key: 'potion' }); }
    else this.message(`Brewing failed — the mixture spoiled. (${r.chance}% chance)`, 'error');
    this.afterInventoryChange();
    return { ok: true };
  }

  claimDaily(): OpResult {
    const r = claimDaily(this.data, this.char, this.now());
    if (!r.ok) return this.err(r.error!);
    this.message(`Daily reward claimed (day ${r.day}).`, 'loot');
    this.emit({ type: 'sound', key: 'coin' });
    return { ok: true };
  }

  setTitle(id: string | null): OpResult {
    const r = setTitle(this.char, id);
    return r.ok ? { ok: true } : this.err(r.error!);
  }

  /** Sell to a Market Trader at the current market price. */
  traderSell(uid: string, qty: number): OpResult {
    if (!this.nearService((s) => s.type === 'trader')) return this.err('You are too far from the Market Trader.');
    return this.wrap(traderSell(this.data, this.char, uid, qty, this.now()), () => this.emit({ type: 'sound', key: 'coin' }));
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

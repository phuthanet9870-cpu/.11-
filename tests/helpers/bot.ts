// A scripted player used by integration tests. It only uses the same public
// World commands that the real UI uses (moveTo, attack, castSkill, useItem...).
import { TILE } from '../../src/core/mapCompiler';
import { distToSegment, type MonsterActor, type Telegraph, type World, type WorldEvent } from '../../src/core/world';
import type { StatKey } from '../../src/core/types';
import { data } from './fixtures';

export class Bot {
  events: WorldEvent[] = [];
  log: string[] = [];
  simMs = 0;
  deaths = 0;
  constructor(public w: World, public statPlan: StatKey[] = ['str', 'agi', 'vit', 'dex'], public skillPlan: string[] = []) {}

  step(ms = 50) {
    this.w.update(ms);
    this.simMs += ms;
    const ev = this.w.drainEvents();
    this.events.push(...ev);
    if (this.events.length > 5000) this.events.splice(0, this.events.length - 2000);
    for (const e of ev) if (e.type === 'message' && (e.channel === 'quest' || e.channel === 'error')) this.log.push(`[${Math.round(this.simMs / 1000)}s] ${e.text}`);
    return ev;
  }

  runUntil(pred: () => boolean, maxMs: number, ms = 50): boolean {
    for (let t = 0; t < maxMs; t += ms) {
      if (pred()) return true;
      this.step(ms);
      if (this.w.player.dead) this.handleDeath();
    }
    return pred();
  }

  handleDeath() {
    this.deaths++;
    this.log.push(`[${Math.round(this.simMs / 1000)}s] DIED on ${this.w.map.def.id} (lv ${this.w.char.baseLevel})`);
    this.step(1000);
    this.w.respawn();
    this.step(50);
  }

  get c() { return this.w.char; }

  // ------------------------------------------------------------- travel
  mapOfNpc(npcId: string): string {
    for (const m of data.maps.values()) if (m.npcs.some((n) => n.npcId === npcId)) return m.id;
    throw new Error(`npc ${npcId} not placed`);
  }

  travelTo(mapId: string) {
    let guard = 0;
    while (this.w.map.def.id !== mapId) {
      if (++guard > 10) throw new Error(`cannot reach ${mapId}`);
      const hop = this.nextHop(this.w.map.def.id, mapId);
      const portal = this.w.map.def.portals.find((p) => p.targetMap === hop)!;
      const from = this.w.map.def.id;
      const tx = (portal.x + portal.w / 2) * TILE, ty = (portal.y + portal.h / 2) * TILE;
      const ok = this.runUntil(() => {
        if (this.w.map.def.id !== from) return true;
        if (!this.w.player.move && this.w.player.intent.type !== 'move') this.w.moveTo(tx, ty);
        return false;
      }, 120_000);
      if (!ok) throw new Error(`travel ${from} → ${hop} timed out at ${this.w.player.x},${this.w.player.y}`);
    }
  }

  private nextHop(from: string, to: string): string {
    const prev = new Map<string, string>();
    const q = [from];
    const seen = new Set([from]);
    while (q.length) {
      const cur = q.shift()!;
      if (cur === to) break;
      for (const p of data.maps.get(cur)!.portals) if (!seen.has(p.targetMap)) { seen.add(p.targetMap); prev.set(p.targetMap, cur); q.push(p.targetMap); }
    }
    let step = to;
    while (prev.get(step) !== from) step = prev.get(step)!;
    return step;
  }

  talkTo(npcId: string) {
    this.travelTo(this.mapOfNpc(npcId));
    this.events = [];
    const mapId = this.mapOfNpc(npcId);
    const ok = this.runUntil(() => {
      if (this.events.some((e) => e.type === 'npcInteract' && e.npcId === npcId)) return true;
      if (this.w.map.def.id !== mapId) this.travelTo(mapId);
      this.potionCheck();
      if (this.w.player.intent.type !== 'npc') this.w.interactNpc(npcId);
      return false;
    }, 180_000);
    if (!ok) throw new Error(`could not reach npc ${npcId}`);
  }

  interactObject(mapId: string, objectId: string) {
    this.travelTo(mapId);
    this.events = [];
    const ok = this.runUntil(() => {
      if (this.events.some((e) => e.type === 'objectInteract' && e.objectId === objectId)) return true;
      if (this.w.map.def.id !== mapId) this.travelTo(mapId);
      if (this.w.player.intent.type !== 'object') this.w.interactObjectCmd(objectId);
      return false;
    }, 180_000);
    if (!ok) throw new Error(`could not reach object ${objectId}`);
  }

  accept(questId: string) {
    const q = data.quests.get(questId)!;
    this.talkTo(q.giverNpc);
    const r = this.w.accept(questId);
    if (!r.ok) throw new Error(`accept ${questId}: ${r.error}`);
  }

  turnIn(questId: string) {
    const q = data.quests.get(questId)!;
    this.talkTo(q.turnInNpc);
    const r = this.w.turnIn(questId);
    if (!r.ok) throw new Error(`turn in ${questId}: ${r.error} ${JSON.stringify(this.c.quests[questId])}`);
    this.spendPoints();
  }

  // ------------------------------------------------------------- progression
  spendPoints() {
    let i = 0;
    while (this.c.statPoints > 0 && i < 500) {
      const stat = this.statPlan[i++ % this.statPlan.length];
      this.w.allocate(stat, 1);
    }
    for (const s of this.skillPlan) {
      while (this.c.skillPoints > 0 && this.w.learn(s).ok) { /* keep learning */ }
    }
    this.w.drainEvents();
  }

  // ------------------------------------------------------------- combat
  potionCheck() {
    const hpPct = this.c.hp / this.w.stats.maxHp;
    if (hpPct < 0.45) {
      for (const id of ['yellow_potion', 'orange_potion', 'red_potion', 'meadow_apple']) {
        if (this.c.inventory.some((i) => i.itemId === id) && (this.w.player.itemCooldowns[id] ?? 0) <= this.w.time) {
          this.w.useItemById(id);
          break;
        }
      }
    }
    if (this.c.mp < this.w.stats.maxMp * 0.25 && this.c.inventory.some((i) => i.itemId === 'blue_potion') && (this.w.player.itemCooldowns.blue_potion ?? 0) <= this.w.time) {
      this.w.useItemById('blue_potion');
    }
    if (this.w.player.statuses.some((s) => s.id === 'poison' || s.id === 'curse') && this.c.inventory.some((i) => i.itemId === 'green_potion')) {
      if ((this.w.player.itemCooldowns.green_potion ?? 0) <= this.w.time) this.w.useItemById('green_potion');
    }
  }

  combatSkills: { id: string; when?: (m: MonsterActor) => boolean; ground?: boolean }[] = [];
  selfBuffs: string[] = [];

  useSkills(m: MonsterActor) {
    const p = this.w.player;
    if (p.cast || m.dead || !this.w.monsters.has(m.id)) return;
    for (const b of this.selfBuffs) {
      if (!p.buffs.some((x) => x.name === data.skills.get(b)!.name) && this.w.canUseSkill(b).ok && this.c.mp > 30) { this.w.castSkill(b); return; }
    }
    for (const s of this.combatSkills) {
      if ((s.when && !s.when(m)) || !this.w.canUseSkill(s.id).ok) continue;
      if (this.c.mp < this.w.stats.maxMp * 0.15) return;
      this.w.castSkill(s.id, s.ground ? { x: m.x, y: m.y } : { targetId: m.id });
      return;
    }
  }

  nearestMonster(ids: string[]): MonsterActor | null {
    const p = this.w.player;
    let best: MonsterActor | null = null, bd = Infinity;
    for (const m of this.w.monsters.values()) {
      if (m.dead || !ids.includes(m.def.id) || m.state === 'return') continue;
      const d = Math.hypot(m.x - p.x, m.y - p.y);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  /** Kills one monster of the given kinds (fighting back against anything that attacks). */
  killOne(ids: string[], maxMs = 90_000): boolean {
    const target = this.nearestMonster(ids);
    if (!target) { this.step(500); return false; }
    this.w.attack(target.id);
    let cur = target;
    const ok = this.runUntil(() => {
      this.potionCheck();
      if (this.w.player.dead) return true;
      // If something else is hitting us, deal with the closest attacker first.
      if (cur.dead) {
        const attacker = [...this.w.monsters.values()].find((m) => !m.dead && m.targetId === 'player');
        if (!attacker) return true;
        cur = attacker;
        this.w.attack(cur.id);
      }
      if (this.w.player.intent.type === 'none' && !this.w.player.cast) this.w.attack(cur.id);
      this.useSkills(cur);
      return false;
    }, maxMs);
    this.lootAll();
    this.spendPoints();
    this.rest();
    return ok && target.dead;
  }

  /** Waits for HP to regenerate between fights, like a careful player. */
  rest(threshold = 0.6) {
    if (this.c.hp >= this.w.stats.maxHp * threshold) return;
    this.runUntil(() => this.w.player.dead || this.c.hp >= this.w.stats.maxHp * 0.95 ||
      [...this.w.monsters.values()].some((m) => !m.dead && m.targetId === 'player'), 120_000, 250);
  }

  lootAll() {
    for (let i = 0; i < 12; i++) {
      if (!this.w.pickupNearest()) break;
      const before = this.w.groundItems.size;
      this.runUntil(() => this.w.groundItems.size < before || this.w.player.intent.type === 'none', 8000);
      if (this.w.groundItems.size >= before) break;
    }
  }

  mapOfMonsters(ids: string[]): string {
    const here = this.w.map.def;
    if (here.monsterSpawns.some((s) => ids.includes(s.monsterId))) return here.id;
    for (const m of data.maps.values()) if (m.monsterSpawns.some((s) => ids.includes(s.monsterId))) return m.id;
    throw new Error(`no map spawns ${ids}`);
  }

  grind(ids: string[], until: () => boolean, maxMs = 3_600_000) {
    const start = this.simMs;
    while (!until()) {
      if (this.simMs - start > maxMs) throw new Error(`grind ${ids} timed out (lv ${this.c.baseLevel}/${this.c.jobLevel})\n${this.log.slice(-15).join('\n')}`);
      this.travelTo(this.mapOfMonsters(ids));
      this.killOne(ids);
    }
  }

  buy(npcId: string, shopId: string, itemId: string, qty: number) {
    this.talkTo(npcId);
    return this.w.buy(shopId, itemId, qty);
  }
}

export function threatened(t: Telegraph, x: number, y: number): boolean {
  if (t.shape === 'circle') return Math.hypot(x - t.x, y - t.y) <= t.radius + 24;
  if (t.shape === 'ring') { const d = Math.hypot(x - t.x, y - t.y); return d <= t.radius + 20 && d >= (t.innerRadius ?? 0) - 20; }
  return distToSegment(x, y, t.x, t.y, t.x2!, t.y2!) <= (t.width ?? 60) / 2 + 24;
}

export function escapePoint(t: Telegraph, x: number, y: number): { x: number; y: number } {
  if (t.shape === 'ring') return { x: t.x + (x - t.x) * 0.15, y: t.y + (y - t.y) * 0.15 };
  if (t.shape === 'line') {
    const ang = Math.atan2(t.y2! - t.y, t.x2! - t.x) + Math.PI / 2;
    return { x: x + Math.cos(ang) * 90, y: y + Math.sin(ang) * 90 };
  }
  const ang = Math.atan2(y - t.y, x - t.x) || 0.5;
  return { x: t.x + Math.cos(ang) * (t.radius + 60), y: t.y + Math.sin(ang) * (t.radius + 60) };
}

/** Fights the map boss: dodges telegraphs, kills minions first, uses skills and potions. */
export function fightBoss(bot: Bot, maxMs = 600_000, kite = 0): boolean {
  const w = bot.w;
  const boss = [...w.monsters.values()].find((m) => m.boss && !m.dead);
  if (!boss) return false;
  w.attack(boss.id);
  bot.runUntil(() => {
    if (w.player.dead || boss.dead || !w.monsters.has(boss.id)) return true;
    bot.potionCheck();
    const danger = w.telegraphs.find((t) => t.endsAt > w.time && threatened(t, w.player.x, w.player.y));
    if (danger) {
      if (w.player.intent.type !== 'move') { const e = escapePoint(danger, w.player.x, w.player.y); w.moveTo(e.x, e.y); }
      return false;
    }
    const minion = [...w.monsters.values()].find((m) => m.summoned && !m.dead);
    const target = minion ?? boss;
    // Ranged classes step back when the boss is in melee range.
    if (kite && !w.player.cast && Math.hypot(boss.x - w.player.x, boss.y - w.player.y) < kite && w.player.intent.type !== 'move') {
      const ang = Math.atan2(w.player.y - boss.y, w.player.x - boss.x);
      w.moveTo(w.player.x + Math.cos(ang) * 130, w.player.y + Math.sin(ang) * 130);
      return false;
    }
    if (w.player.intent.type === 'move' && w.player.move) return false;
    const it = w.player.intent;
    if (!(it.type === 'attack' && it.targetId === target.id) && !w.player.cast) w.attack(target.id);
    bot.useSkills(target);
    return false;
  }, maxMs);
  return boss.dead;
}

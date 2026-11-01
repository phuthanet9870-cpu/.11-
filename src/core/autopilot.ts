// Auto Farm and Auto Quest. A small state machine the World ticks every frame.
// It only uses the same commands a player has (move, attack, skills, potions,
// loot, talk, accept / turn in, buy, equip, refine), so it obeys every rule of
// the game. Any manual click or key stops it.
//
// Auto Farm: fight monsters near the spot where it was started, use hotbar
// skills and potions, pick up loot, rest when low without potions, and stop
// when overweight or when the character dies.
// Auto Quest: follow the quest chain — walk to givers, accept, do each
// objective (travel and hunt, talk, buy and equip a weapon, refine to the
// target, level up), then walk back and turn in.
import type { World, MonsterActor } from './world';
import type { GameData } from './data';
import type { ItemDef, QuestDef, QuestObjective } from './types';
import { TILE } from './mapCompiler';
import { canEquip, countItem } from './inventory';
import { isQuestAvailable, objectiveTarget } from './quests';
import { refineInfo, safeLimit } from './refine';

export type AutoMode = 'off' | 'farm' | 'quest';

export interface AutoSettings {
  /** Fight within this many pixels of the start point (farm mode). */
  radius: number;
  /** Drink a healing potion below this HP %. */
  hpPotionPct: number;
  /** Drink an MP potion below this MP %. */
  mpPotionPct: number;
  /** Cast skills placed on the hotbar. */
  useSkills: boolean;
  /** Pick up drops. */
  loot: boolean;
  /** Leave elites and bosses alone. */
  skipElites: boolean;
  /** Monster species to farm. Only the ones living on the current map count; none picked = every monster. */
  targets: string[];
}

export const DEFAULT_AUTO: AutoSettings = { radius: 520, hpPotionPct: 45, mpPotionPct: 20, useSkills: true, loot: true, skipElites: true, targets: [] };

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

export class AutoPilot {
  mode: AutoMode = 'off';
  private loaded: AutoSettings | null = null;
  /** Settings are kept with the character (read when first needed: the World sets its character after creating the AutoPilot). */
  get settings(): AutoSettings {
    if (!this.loaded) {
      this.loaded = { ...DEFAULT_AUTO };
      try { const s = this.w.char?.flags.autoSettings; if (typeof s === 'string') this.loaded = { ...DEFAULT_AUTO, ...JSON.parse(s) }; } catch { /* keep defaults */ }
    }
    return this.loaded!;
  }
  set settings(v: AutoSettings) { this.loaded = v; }
  /** One line for the HUD. */
  status = '';
  private anchor: { mapId: string; x: number; y: number } | null = null;
  private resting = false;
  private nextThinkAt = 0;
  private lastProgress = { key: '', at: 0 };
  private wanderAt = 0;
  private lootTries = new Map<string, number>();

  constructor(private w: World) {}

  saveSettings() { this.w.char.flags.autoSettings = JSON.stringify(this.settings); }

  /** Monster species living on the current map (what Auto Farm can be told to hunt), weakest first. */
  mapSpecies(): string[] {
    const ids = new Set(this.w.map.def.monsterSpawns.map((s) => s.monsterId));
    return [...ids].filter((id) => this.data.monsters.has(id)).sort((a, b) => this.data.monsters.get(a)!.level - this.data.monsters.get(b)!.level);
  }

  /** The picked species that live on this map, or null for "every monster". */
  pickedOnMap(): string[] | null {
    const here = this.mapSpecies(), picked = this.settings.targets.filter((id) => here.includes(id));
    return picked.length ? picked : null;
  }

  private get data(): GameData { return this.w.data; }
  private get c() { return this.w.char; }

  start(mode: 'farm' | 'quest') {
    this.mode = mode;
    this.anchor = { mapId: this.w.map.def.id, x: this.w.player.x, y: this.w.player.y };
    this.resting = false;
    this.lastProgress = { key: '', at: this.w.time };
    this.w.message(mode === 'farm' ? 'Auto Farm on. Click anywhere or press a movement key to take control.' : 'Auto Quest on. Click anywhere or press a movement key to take control.', 'system');
  }

  stop(reason?: string) {
    if (this.mode === 'off') return;
    this.mode = 'off';
    this.status = '';
    this.w.player.intent = { type: 'none' };
    this.w.player.move = null;
    this.w.message(`Auto stopped${reason ? `: ${reason}` : '.'}`, reason && reason !== 'manual control' ? 'error' : 'system');
  }

  update() {
    if (this.mode === 'off') return;
    const w = this.w, p = w.player;
    if (p.dead) return this.stop('your character was defeated');
    if (w.time < this.nextThinkAt) return;
    this.nextThinkAt = w.time + 150;
    if (w.majorOverweight) return this.stop('carrying too much (90%+ weight)');
    this.usePotions();
    if (this.mode === 'farm') this.farmTick(null);
    else this.questTick();
    // Give up if nothing has changed for a long time (stuck somewhere).
    const key = `${w.map.def.id}|${Math.round(p.x / 64)}|${Math.round(p.y / 64)}|${this.c.baseExp}|${this.c.jobExp}|${JSON.stringify(Object.values(this.c.quests).map((q) => [q.status, q.counts]))}`;
    if (key !== this.lastProgress.key || p.cast || p.intent.type === 'attack') this.lastProgress = { key, at: w.time };
    else if (w.time - this.lastProgress.at > 90_000) this.stop('stuck (no progress for 90 seconds)');
  }

  // ---------------------------------------------------------------- shared
  private usePotions() {
    const w = this.w, c = this.c, s = w.stats, p = w.player;
    const pick = (want: 'hp' | 'mp') => {
      let best: { uid: string; def: ItemDef } | null = null;
      for (const inst of c.inventory) {
        const def = this.data.items.get(inst.itemId);
        const heal = def?.use?.find((u) => u.type === 'heal');
        if (!def || !heal || heal.type !== 'heal') continue;
        if (want === 'hp' && !(heal.hp || heal.hpPct)) continue;
        if (want === 'mp' && !(heal.mp || heal.mpPct)) continue;
        if ((p.itemCooldowns[def.id] ?? 0) > w.time) continue;
        // Cheapest potion that does the job.
        if (!best || def.price < best.def.price) best = { uid: inst.uid, def };
      }
      return best;
    };
    if (c.hp < s.maxHp * (this.settings.hpPotionPct / 100)) { const b = pick('hp'); if (b) w.useItem(b.uid); }
    if (c.mp < s.maxMp * (this.settings.mpPotionPct / 100)) { const b = pick('mp'); if (b) w.useItem(b.uid); }
  }

  private hasHealing(): boolean {
    return this.c.inventory.some((i) => this.data.items.get(i.itemId)?.use?.some((u) => u.type === 'heal' && (u.hp || u.hpPct)));
  }

  /** Cast hotbar skills: buffs when missing, attacks on the target. */
  private useSkills(target: MonsterActor) {
    if (!this.settings.useSkills) return;
    const w = this.w, p = w.player;
    if (p.cast) return;
    for (const slot of this.c.hotbar) {
      if (slot?.type !== 'skill') continue;
      const sk = this.data.skills.get(slot.id);
      if (!sk || !w.canUseSkill(sk.id).ok) continue;
      if (sk.kind === 'buff' || (sk.targeting === 'self' && !sk.effects.some((e) => e.type === 'damage'))) {
        const buffIds = sk.effects.flatMap((e) => (e.type === 'buff' ? [e.buffId] : e.type === 'endow' ? [`endow_${e.element}`] : []));
        const isHeal = sk.effects.some((e) => e.type === 'heal');
        if (isHeal && this.c.hp > w.stats.maxHp * 0.6) continue;
        if (!isHeal && (!buffIds.length || buffIds.every((id) => p.buffs.some((b) => b.id === id)))) continue;
        w.castSkill(sk.id);
        return;
      }
      if (sk.targeting === 'enemy' || sk.targeting === 'ground') { w.castSkill(sk.id, { targetId: target.id }); return; }
      if (sk.targeting === 'self' && dist(p.x, p.y, target.x, target.y) < 130) { w.castSkill(sk.id); return; }
    }
  }

  /** Walk to another map through portals (shortest route). Returns true when there. */
  private travelTo(mapId: string): boolean {
    const w = this.w;
    if (w.map.def.id === mapId) return true;
    const hop = this.nextHop(w.map.def.id, mapId);
    const portal = hop && w.map.def.portals.find((pt) => pt.targetMap === hop);
    if (!portal) { this.stop(`no route to ${this.data.maps.get(mapId)?.name ?? mapId}`); return false; }
    this.status = `Travelling to ${this.data.maps.get(mapId)?.name}`;
    const tx = (portal.x + portal.w / 2) * TILE, ty = (portal.y + portal.h / 2) * TILE;
    const busy = w.player.intent.type === 'attack' && !w.monsters.get(w.player.intent.targetId)?.dead;
    // Defend yourself on the way.
    const attacker = [...w.monsters.values()].find((m) => !m.dead && m.targetId === 'player' && dist(m.x, m.y, w.player.x, w.player.y) < 160);
    if (attacker) { if (!busy) w.attack(attacker.id); this.useSkills(attacker); return false; }
    if (!w.player.move || w.player.intent.type !== 'move') w.moveTo(tx, ty);
    return false;
  }

  private nextHop(from: string, to: string): string | null {
    const prev = new Map<string, string>();
    const q = [from];
    const seen = new Set([from]);
    while (q.length) {
      const cur = q.shift()!;
      if (cur === to) break;
      for (const pt of this.data.maps.get(cur)?.portals ?? []) {
        const t = this.data.maps.get(pt.targetMap);
        if (!t || seen.has(pt.targetMap) || t.type === 'instance' || t.type === 'arena') continue;
        seen.add(pt.targetMap); prev.set(pt.targetMap, cur); q.push(pt.targetMap);
      }
    }
    if (!prev.has(to)) return null;
    let step = to;
    while (prev.get(step) !== from) step = prev.get(step)!;
    return step;
  }

  private mapOfNpc(npcId: string): string | null {
    for (const m of this.data.maps.values()) if (m.type !== 'instance' && m.npcs.some((n) => n.npcId === npcId)) return m.id;
    return null;
  }

  /** Walk to an NPC and talk to it. Returns true once the conversation happened (this tick or earlier). */
  private talkTo(npcId: string): boolean {
    const w = this.w;
    const mapId = this.mapOfNpc(npcId);
    if (!mapId) { this.stop(`cannot find ${npcId}`); return false; }
    if (!this.travelTo(mapId)) return false;
    if (w.lastNpcTalk?.npcId === npcId && w.time - w.lastNpcTalk.at < 3000) return true;
    this.status = `Walking to ${this.data.npcs.get(npcId)?.name}`;
    if (w.player.intent.type !== 'npc') w.interactNpc(npcId);
    return false;
  }

  // ---------------------------------------------------------------- farm
  /** One farm step. `only` restricts targets to these monster ids (quest hunting). */
  private farmTick(only: string[] | null) {
    const w = this.w, p = w.player, c = this.c, s = w.stats;
    const anchor = this.anchor && this.anchor.mapId === w.map.def.id ? this.anchor : { mapId: w.map.def.id, x: p.x, y: p.y };
    if (!this.anchor || this.anchor.mapId !== w.map.def.id) this.anchor = anchor;
    // Big maps: only answer attackers near the farm spot, and never chase one out of the area.
    const leash = this.settings.radius + 300;
    const attackers = [...w.monsters.values()].filter((m) => !m.dead && m.targetId === 'player' && (!!only || dist(m.x, m.y, anchor.x, anchor.y) <= leash));
    // Out of potions and hurt: rest until 80% unless something attacks.
    if (!this.hasHealing() && c.hp < s.maxHp * 0.35) this.resting = true;
    if (this.resting) {
      if (c.hp >= s.maxHp * 0.8 || attackers.length) this.resting = false;
      else { this.status = 'Resting (no healing potions)'; if (p.intent.type !== 'none') w.stop(); return; }
    }
    const cur = p.intent.type === 'attack' ? w.monsters.get(p.intent.targetId) : undefined;
    if (cur && !cur.dead && (only || dist(cur.x, cur.y, anchor.x, anchor.y) <= leash)) { this.status = `Fighting ${cur.def.name}`; this.useSkills(cur); return; }
    if (!only && !attackers.length && dist(p.x, p.y, anchor.x, anchor.y) > this.settings.radius + 200) {
      this.status = 'Returning to the farm spot';
      if (!p.move || p.intent.type === 'attack') w.moveTo(anchor.x, anchor.y);
      return;
    }
    // Loot first when nothing is attacking.
    if (this.settings.loot && !attackers.length && p.intent.type !== 'pickup') {
      const near = [...w.groundItems.values()].filter((g) => dist(g.x, g.y, p.x, p.y) < 320 && (this.lootTries.get(g.id) ?? 0) < 3);
      if (near.length) {
        near.sort((a, b) => dist(a.x, a.y, p.x, p.y) - dist(b.x, b.y, p.x, p.y));
        this.lootTries.set(near[0].id, (this.lootTries.get(near[0].id) ?? 0) + 1);
        this.status = 'Picking up loot';
        w.pickupCmd(near[0].id);
        return;
      }
    }
    if (p.intent.type === 'pickup') return;
    // Quest hunting uses its own list; otherwise the species picked in the Auto settings (on this map).
    const picked = only ? null : this.pickedOnMap();
    const ok = (m: MonsterActor) => !m.dead && (!only || only.includes(m.def.id)) && (!picked || picked.includes(m.def.id) || m.targetId === 'player')
      && !(this.settings.skipElites && (m.boss || m.def.elite) && m.targetId !== 'player');
    const pool = attackers.filter(ok).length ? attackers.filter(ok)
      : [...w.monsters.values()].filter((m) => ok(m) && dist(m.x, m.y, anchor.x, anchor.y) <= (only ? 5000 : this.settings.radius));
    if (pool.length) {
      pool.sort((a, b) => dist(a.x, a.y, p.x, p.y) - dist(b.x, b.y, p.x, p.y));
      w.attack(pool[0].id);
      this.status = `Fighting ${pool[0].def.name}`;
      this.useSkills(pool[0]);
      return;
    }
    // Nothing in range: wander inside the area so monsters come into view.
    this.status = 'Looking for monsters';
    if (w.time >= this.wanderAt && !p.move) {
      this.wanderAt = w.time + 4000;
      const ang = this.w.rng.next() * Math.PI * 2, r = this.w.rng.next() * (only ? 600 : this.settings.radius * 0.8);
      const tx = anchor.x + Math.cos(ang) * r, ty = anchor.y + Math.sin(ang) * r;
      // Never wander into (or right next to) a portal: Auto Farm stays on its map.
      const nearPortal = w.map.def.portals.some((q) => tx > (q.x - 4) * TILE && tx < (q.x + q.w + 4) * TILE && ty > (q.y - 4) * TILE && ty < (q.y + q.h + 4) * TILE);
      if (!nearPortal) w.moveTo(tx, ty);
    }
  }

  // ---------------------------------------------------------------- quest
  /** The quest to work on: ready to hand in, else active, else the next one we can take. */
  currentQuest(): QuestDef | null {
    const c = this.c;
    const list = [...this.data.quests.values()];
    return list.find((q) => c.quests[q.id]?.status === 'ready')
      ?? list.find((q) => c.quests[q.id]?.status === 'active')
      ?? list.find((q) => !c.quests[q.id] && isQuestAvailable(this.data, c, q, this.w.now()))
      ?? null;
  }

  private questTick() {
    const w = this.w, c = this.c;
    const q = this.currentQuest();
    if (!q) return this.stop('no quests left to do — try Auto Farm');
    const prog = c.quests[q.id];
    if (!prog) {
      this.status = `${q.name}: accepting from ${this.data.npcs.get(q.giverNpc)?.name}`;
      if (this.talkTo(q.giverNpc)) { w.accept(q.id); w.lastNpcTalk = null; }
      return;
    }
    if (prog.status === 'ready') {
      this.status = `${q.name}: handing in to ${this.data.npcs.get(q.turnInNpc)?.name}`;
      if (this.talkTo(q.turnInNpc)) { w.turnIn(q.id); w.lastNpcTalk = null; }
      return;
    }
    const idx = q.objectives.findIndex((o, i) => (prog.counts[i] ?? 0) < objectiveTarget(o));
    if (idx < 0) return; // waiting for the quest to refresh to 'ready'
    const o = q.objectives[idx];
    this.status = `${q.name}: ${o.label}${objectiveTarget(o) > 1 ? ` ${prog.counts[idx] ?? 0}/${objectiveTarget(o)}` : ''}`;
    this.doObjective(o);
  }

  private doObjective(o: QuestObjective) {
    const w = this.w, c = this.c;
    switch (o.type) {
      case 'talk': if (this.talkTo(o.npcId)) w.lastNpcTalk = null; return;
      case 'deliver': if (this.talkTo(o.npcId)) w.lastNpcTalk = null; return;
      case 'kill': return this.hunt([o.monsterId]);
      case 'collect': {
        const sources = [...this.data.monsters.values()].filter((m) => this.data.drops.get(m.dropTableId)?.entries.some((e) => e.itemId === o.itemId)).map((m) => m.id);
        if (!sources.length) return this.stop(`nobody drops ${this.data.items.get(o.itemId)?.name}`);
        return this.hunt(sources);
      }
      case 'reachLevel': return this.levelUp();
      case 'equip': {
        const best = c.inventory.filter((i) => { const d = this.data.items.get(i.itemId); return d?.slot === o.slot && canEquip(this.data, c, d).ok; })
          .sort((a, b) => (this.data.items.get(b.itemId)!.mods?.patk ?? 0) - (this.data.items.get(a.itemId)!.mods?.patk ?? 0))[0];
        if (best) { w.equip(best.uid); return; }
        return this.buyFor(o.slot);
      }
      case 'buy': return o.itemId ? this.buyItem(o.itemId) : this.buyFor(o.slot ?? 'weapon');
      case 'refine': return this.refineTo(o.level);
      case 'explore': { if (this.travelTo(o.mapId)) this.farmTick(null); return; }
      default: return this.stop(`"${o.label}" has to be done by hand`);
    }
  }

  /** Go where these monsters live and fight only them. */
  private hunt(ids: string[]) {
    const here = this.w.map.def.monsterSpawns.some((s) => ids.includes(s.monsterId));
    const mapId = here ? this.w.map.def.id : this.nearestMapWith(ids);
    if (!mapId) return this.stop('cannot find where those monsters live');
    if (this.travelTo(mapId)) this.farmTick(ids);
  }

  private nearestMapWith(ids: string[]): string | null {
    // Breadth-first from here so the closest map wins.
    const seen = new Set([this.w.map.def.id]);
    const q = [this.w.map.def.id];
    while (q.length) {
      const cur = q.shift()!;
      const m = this.data.maps.get(cur)!;
      if (m.type !== 'instance' && m.type !== 'arena' && m.monsterSpawns.some((s) => ids.includes(s.monsterId))) return cur;
      for (const pt of m.portals) if (!seen.has(pt.targetMap)) { seen.add(pt.targetMap); q.push(pt.targetMap); }
    }
    return null;
  }

  /** Farm the closest field whose level range fits the character. */
  private levelUp() {
    const lv = this.c.baseLevel;
    const fields = [...this.data.maps.values()].filter((m) => (m.type === 'field' || m.type === 'dungeon') && m.levelRange && m.monsterSpawns.length);
    const fit = fields.filter((m) => m.levelRange![0] <= lv + 2).sort((a, b) => b.levelRange![0] - a.levelRange![0]);
    const target = fit.find((m) => m.levelRange![0] <= lv && m.type === 'field') ?? fit[fit.length - 1];
    const here = this.w.map.def;
    if (here.levelRange && here.monsterSpawns.length && here.levelRange[0] <= lv + 2 && here.levelRange[1] >= lv - 3) { this.farmTick(null); return; }
    if (!target) return this.stop('no hunting ground for your level');
    if (this.travelTo(target.id)) this.farmTick(null);
  }

  /** Buy the cheapest item for a slot that this character can equip and afford. */
  private buyFor(slot: string) {
    const c = this.c;
    let best: { npcId: string; shopId: string; def: ItemDef } | null = null;
    for (const n of this.data.npcs.values()) for (const s of n.services) {
      if (s.type !== 'shop') continue;
      for (const id of this.data.shops.get(s.shopId)?.items ?? []) {
        const d = this.data.items.get(id)!;
        if ((d.slot === slot || (slot.startsWith('accessory') && d.slot === 'accessory')) && canEquip(this.data, c, d).ok && d.price <= c.luma && (!best || d.price < best.def.price) && this.mapOfNpc(n.id)) best = { npcId: n.id, shopId: s.shopId, def: d };
      }
    }
    if (!best) return this.stop(`cannot afford anything for the ${slot} slot`);
    this.status += ` (${best.def.name})`;
    if (this.talkTo(best.npcId)) { this.w.buy(best.shopId, best.def.id, 1); this.w.lastNpcTalk = null; }
  }

  private buyItem(itemId: string) {
    for (const n of this.data.npcs.values()) for (const s of n.services) {
      if (s.type === 'shop' && this.data.shops.get(s.shopId)?.items.includes(itemId) && this.mapOfNpc(n.id)) {
        if (this.talkTo(n.id)) { this.w.buy(s.shopId, itemId, 1); this.w.lastNpcTalk = null; }
        return;
      }
    }
    this.stop(`no shop sells ${this.data.items.get(itemId)?.name}`);
  }

  /** Refine the equipped weapon (or armor) to the level, only inside the safe limit. */
  private refineTo(level: number) {
    const w = this.w, c = this.c;
    const inst = c.equipment.weapon ?? c.equipment.armor;
    if (!inst) return this.buyFor('weapon');
    const def = this.data.items.get(inst.itemId)!;
    if ((inst.refine ?? 0) >= safeLimit(def) && (inst.refine ?? 0) < level) return this.stop('the next refine could break the item — do it by hand');
    const info = refineInfo(this.data, c, inst.uid);
    const refiner = [...this.data.npcs.values()].find((n) => n.services.some((s) => s.type === 'refine') && this.mapOfNpc(n.id) === w.map.def.id)
      ?? [...this.data.npcs.values()].find((n) => n.services.some((s) => s.type === 'refine') && this.mapOfNpc(n.id));
    if (!refiner) return this.stop('no refiner found');
    if (countItem(c, info.ore) < 1) return this.buyItem(info.ore);
    if (c.luma < info.fee) return this.stop(`refining needs ${info.fee} Luma`);
    if (this.talkTo(refiner.id)) { w.refine(inst.uid); w.lastNpcTalk = null; }
  }
}

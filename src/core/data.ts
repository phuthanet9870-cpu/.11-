// Static game data registry. All content is loaded from JSON data files so that
// classes, monsters, items, maps and quests can be added without code changes.
import balanceJson from '../config/balance.json';
import elementsJson from '../data/elements.json';
import statusJson from '../data/statusEffects.json';
import classesJson from '../data/classes.json';
import skillsJson from '../data/skills.json';
import itemsJson from '../data/items.json';
import monstersJson from '../data/monsters.json';
import bossesJson from '../data/bosses.json';
import dropsJson from '../data/drops.json';
import npcsJson from '../data/npcs.json';
import shopsJson from '../data/shops.json';
import recipesJson from '../data/recipes.json';
import petsJson from '../data/pets.json';
import combosJson from '../data/combos.json';
import instancesJson from '../data/instances.json';
import homunculiJson from '../data/homunculi.json';
import runesJson from '../data/runes.json';
import type { Constellation } from './runes';
import type { HomunDef } from './homunculus';
import questsJson from '../data/quests.json';
import tilesJson from '../data/tiles.json';
import tilesetsJson from '../data/tilesets.json';
import objectsJson from '../data/objects.json';
import { MAP_FILES } from '../data/maps';
import { STUDIO_DATA, STUDIO_MAPS, STUDIO_OBJECTS, STUDIO_TILESETS } from '../data/studio';
import type {
  BossDef, DropTable, Element, ItemDef, JobClassDef, MapDef, MonsterDef, NpcDef,
  ComboDef, InstanceDef, ObjectKindDef, PetDef, QuestDef, RecipeDef, ShopDef, SkillDef, StatusDef, StatusId, TileDef, TilesetDef,
} from './types';

export type Balance = typeof balanceJson;

export interface GameData {
  balance: Balance;
  /** elementTables[level 1-4][attack][defend] in %. */
  elementTables: Record<string, Record<Element, Record<Element, number>>>;
  /** Level-1 table (kept for callers that ignore element levels). */
  elementTable: Record<Element, Record<Element, number>>;
  statuses: Map<StatusId, StatusDef>;
  classes: Map<string, JobClassDef>;
  skills: Map<string, SkillDef>;
  items: Map<string, ItemDef>;
  monsters: Map<string, MonsterDef>;
  bosses: Map<string, BossDef>;
  drops: Map<string, DropTable>;
  npcs: Map<string, NpcDef>;
  shops: Map<string, ShopDef>;
  recipes: Map<string, RecipeDef>;
  pets: Map<string, PetDef>;
  combos: Map<string, ComboDef>;
  instances: Map<string, InstanceDef>;
  homunculi: Map<string, HomunDef>;
  runes: Map<string, Constellation>;
  quests: Map<string, QuestDef>;
  tiles: Map<string, TileDef>;
  tilesets: Map<string, TilesetDef>;
  objectKinds: Map<string, ObjectKindDef>;
  maps: Map<string, MapDef>;
}

function byId<T extends { id: string }>(list: T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const e of list) {
    if (m.has(e.id)) throw new Error(`Duplicate id "${e.id}"`);
    m.set(e.id, e);
  }
  return m;
}

let cached: GameData | null = null;

export function loadGameData(): GameData {
  if (cached) return cached;
  cached = {
    balance: balanceJson,
    elementTables: elementsJson.levels as unknown as GameData['elementTables'],
    elementTable: elementsJson.levels['1'] as unknown as GameData['elementTable'],
    statuses: byId(statusJson as StatusDef[]) as Map<StatusId, StatusDef>,
    classes: byId(classesJson as JobClassDef[]),
    skills: byId(skillsJson as SkillDef[]),
    items: byId(itemsJson as ItemDef[]),
    monsters: byId(monstersJson as MonsterDef[]),
    bosses: byId(bossesJson as BossDef[]),
    drops: byId(dropsJson as DropTable[]),
    npcs: byId(npcsJson as NpcDef[]),
    shops: byId(shopsJson as ShopDef[]),
    recipes: byId(recipesJson as unknown as RecipeDef[]),
    pets: byId(petsJson as unknown as PetDef[]),
    combos: byId(combosJson as unknown as ComboDef[]),
    instances: byId(instancesJson as unknown as InstanceDef[]),
    homunculi: byId(homunculiJson as unknown as HomunDef[]),
    runes: byId(runesJson as unknown as Constellation[]),
    quests: byId(questsJson as QuestDef[]),
    tiles: byId(tilesJson.tiles as TileDef[]),
    tilesets: byId(tilesetsJson as unknown as TilesetDef[]),
    objectKinds: byId((STUDIO_OBJECTS ?? objectsJson) as ObjectKindDef[]),
    maps: byId(MAP_FILES as unknown as MapDef[]),
  };
  // Studio layer (committed edits) over the generated data.
  for (const t of STUDIO_TILESETS) cached.tilesets.set(t.id, t);
  for (const m of STUDIO_MAPS) cached.maps.set(m.id, m);
  for (const [k, list] of Object.entries(STUDIO_DATA)) replaceCollection(cached, k as StudioCollection, list);
  return cached;
}

/** Game data the Studio's database editor can change (each is a list of entries with an `id`). */
export const STUDIO_COLLECTIONS = ['items', 'monsters', 'skills', 'classes', 'npcs', 'shops', 'quests', 'drops', 'pets', 'recipes', 'bosses', 'combos', 'homunculi', 'runes', 'statuses', 'instances'] as const;
export type StudioCollection = (typeof STUDIO_COLLECTIONS)[number];

/** Replaces one whole collection (all entries) of the data. */
export function replaceCollection(d: GameData, key: StudioCollection, list: unknown[]) {
  const m = d[key] as Map<string, unknown>;
  m.clear();
  for (const e of list as { id: string }[]) m.set(e.id, e);
}

/** Cross-reference validation. Returns a list of problems (empty = valid). */
export function validateGameData(d: GameData): string[] {
  const errors: string[] = [];
  const need = (ok: unknown, msg: string) => { if (!ok) errors.push(msg); };

  for (const c of d.classes.values()) {
    for (const s of c.skills) need(d.skills.get(s)?.classId === c.id, `class ${c.id}: skill ${s} missing or wrong class`);
    if (c.parent) need(d.classes.has(c.parent), `class ${c.id}: parent ${c.parent} missing`);
    if (c.requirements?.questId) need(d.quests.has(c.requirements.questId), `class ${c.id}: quest missing`);
  }
  for (const s of d.skills.values()) {
    need(d.classes.has(s.classId), `skill ${s.id}: class ${s.classId} missing`);
    for (const r of s.requires ?? []) need(d.skills.has(r.skillId), `skill ${s.id}: requires unknown ${r.skillId}`);
    for (const e of s.effects) if (e.type === 'status') need(d.statuses.has(e.status), `skill ${s.id}: status ${e.status}`);
  }
  for (const m of d.monsters.values()) {
    need(d.drops.has(m.dropTableId), `monster ${m.id}: drop table ${m.dropTableId} missing`);
    need(m.maxHp > 0 && m.level > 0, `monster ${m.id}: invalid hp/level`);
    need(d.elementTable[m.element], `monster ${m.id}: element ${m.element}`);
    need(m.elementLevel === undefined || (m.elementLevel >= 1 && m.elementLevel <= 4), `monster ${m.id}: element level ${m.elementLevel}`);
    if (m.bossId) need(d.bosses.has(m.bossId), `monster ${m.id}: boss ${m.bossId} missing`);
  }
  for (const b of d.bosses.values()) {
    need(d.monsters.has(b.monsterId), `boss ${b.id}: monster missing`);
    need(b.phases.length === 3, `boss ${b.id}: must have 3 phases`);
    for (const s of b.skills) if (s.summon) need(d.monsters.has(s.summon.monsterId), `boss ${b.id}: summon missing`);
    for (const r of b.contributionRewards.items) need(d.items.has(r.itemId), `boss ${b.id}: reward ${r.itemId}`);
  }
  for (const t of d.drops.values()) for (const e of t.entries) need(d.items.has(e.itemId), `drops ${t.id}: item ${e.itemId}`);
  for (const sh of d.shops.values()) for (const i of sh.items) need(d.items.has(i), `shop ${sh.id}: item ${i}`);
  for (const r of d.recipes.values()) { need(d.items.get(r.itemId)?.slot === 'weapon', `recipe ${r.id}: weapon`); for (const m of r.materials) need(d.items.has(m.itemId), `recipe ${r.id}: ${m.itemId}`); }
  for (const it of d.items.values()) if (it.type === 'card') {
    need(!!it.card && d.monsters.has(it.card.monsterId), `card ${it.id}: monster`);
    need(!!it.card && ['weapon', 'armor', 'headgear', 'shield', 'garment', 'boots', 'accessory'].includes(it.card.equip), `card ${it.id}: slot`);
  }
  for (const ins of d.instances.values()) {
    for (const f of ins.floors) need(d.maps.get(f)?.instanceId === ins.id, `instance ${ins.id}: floor ${f}`);
    need(d.maps.has(ins.exitMap), `instance ${ins.id}: exit ${ins.exitMap}`);
    for (const r of [...ins.reward.items, ...(ins.milestones ?? []).flatMap((m) => m.reward.items)]) need(d.items.has(r.itemId), `instance ${ins.id}: reward ${r.itemId}`);
  }
  for (const k of d.runes.values()) for (const n of k.nodes) for (const r of n.requires) need(k.nodes.some((x) => x.id === r), `rune ${n.id}: requires ${r}`);
  for (const hd of d.homunculi.values()) need(d.monsters.has(hd.art), `homunculus ${hd.id}: art ${hd.art}`);
  for (const cb of d.combos.values()) for (const part of cb.parts) need(d.items.has(part), `combo ${cb.id}: ${part}`);
  for (const it of d.items.values()) for (const ac of [it.autocast, it.card?.autocast]) if (ac) need(d.skills.has(ac.skillId), `item ${it.id}: autocast ${ac.skillId}`);
  for (const p of d.pets.values()) {
    need(d.monsters.has(p.monsterId), `pet ${p.id}: monster`);
    for (const i of [p.lureItem, p.eggItem, p.foodItem]) need(d.items.has(i), `pet ${p.id}: item ${i}`);
    need(d.items.get(p.lureItem)?.lure === p.monsterId && d.items.get(p.eggItem)?.petEgg === p.monsterId, `pet ${p.id}: lure/egg link`);
    if (p.accessoryItem) need(d.items.get(p.accessoryItem)?.petAccessory === p.monsterId, `pet ${p.id}: accessory`);
    for (const m of p.evolution?.materials ?? []) need(d.items.has(m.itemId), `pet ${p.id}: evolution ${m.itemId}`);
  }
  for (const n of d.npcs.values()) for (const s of n.services) {
    if (s.type === 'shop') need(d.shops.has(s.shopId), `npc ${n.id}: shop ${s.shopId}`);
    if (s.type === 'jobChange') for (const c of s.classIds) need(d.classes.has(c), `npc ${n.id}: class ${c}`);
    if (s.type === 'instance') need(d.instances.has(s.instanceId), `npc ${n.id}: instance ${s.instanceId}`);
    if (s.type === 'warp') for (const t of s.destinations) need(!!d.maps.get(t.mapId)?.spawnPoints[t.spawn], `npc ${n.id}: warp ${t.mapId}/${t.spawn}`);
  }
  for (const it of d.items.values()) {
    if (it.type === 'equipment') need(!!it.slot, `item ${it.id}: equipment without slot`);
    if (it.classes) for (const c of it.classes) need(d.classes.has(c), `item ${it.id}: class ${c}`);
  }
  const npcOnMap = new Set<string>();
  for (const m of d.maps.values()) {
    need(d.tilesets.has(m.tileset), `map ${m.id}: tileset ${m.tileset}`);
    need(d.tiles.has(m.base), `map ${m.id}: base tile ${m.base}`);
    for (const p of m.portals) {
      const target = d.maps.get(p.targetMap);
      need(target, `map ${m.id}: portal ${p.id} → unknown map ${p.targetMap}`);
      if (target) need(target.spawnPoints[p.targetSpawn], `map ${m.id}: portal ${p.id} → unknown spawn ${p.targetSpawn}`);
    }
    for (const n of m.npcs) { need(d.npcs.has(n.npcId), `map ${m.id}: npc ${n.npcId}`); npcOnMap.add(n.npcId); }
    for (const s of m.monsterSpawns) need(d.monsters.has(s.monsterId), `map ${m.id}: monster ${s.monsterId}`);
    if (m.bossSpawn) need(d.bosses.has(m.bossSpawn.bossId), `map ${m.id}: boss ${m.bossSpawn.bossId}`);
    for (const op of m.paint) {
      if (op.op === 'object' || (op.op === 'scatter' && !op.kind.startsWith('deco:'))) {
        need(d.objectKinds.has(op.kind), `map ${m.id}: object kind ${op.kind}`);
      }
      if (op.op === 'scatter' && op.kind.startsWith('deco:')) need(d.tiles.has(op.kind.slice(5)), `map ${m.id}: deco ${op.kind}`);
      if ((op.op === 'rect' || op.op === 'path' || op.op === 'blob') && !d.tiles.has(op.tile)) errors.push(`map ${m.id}: tile ${op.tile}`);
    }
    for (const o of m.objects) {
      if (o.interact?.giveItem) need(d.items.has(o.interact.giveItem.itemId), `map ${m.id}: object ${o.id} item`);
    }
  }
  for (const q of d.quests.values()) {
    need(npcOnMap.has(q.giverNpc), `quest ${q.id}: giver ${q.giverNpc} not placed on any map`);
    need(npcOnMap.has(q.turnInNpc), `quest ${q.id}: turn-in ${q.turnInNpc} not placed on any map`);
    for (const p of q.prerequisites.quests ?? []) need(d.quests.has(p), `quest ${q.id}: prereq ${p}`);
    for (const o of q.objectives) {
      if (o.type === 'kill') need(d.monsters.has(o.monsterId), `quest ${q.id}: monster ${o.monsterId}`);
      if (o.type === 'collect' || o.type === 'deliver') need(d.items.has(o.itemId), `quest ${q.id}: item ${o.itemId}`);
      if (o.type === 'talk' || o.type === 'deliver') need(npcOnMap.has(o.npcId), `quest ${q.id}: npc ${o.npcId}`);
      if (o.type === 'defeatBoss') need(d.bosses.has(o.bossId), `quest ${q.id}: boss ${o.bossId}`);
      if (o.type === 'explore') need(d.maps.has(o.mapId), `quest ${q.id}: map ${o.mapId}`);
      if (o.type === 'buy' && o.itemId) need(d.items.has(o.itemId), `quest ${q.id}: item ${o.itemId}`);
      if (o.type === 'interact') {
        need([...d.maps.values()].some((m) => m.objects.some((ob) => ob.id === o.objectId)), `quest ${q.id}: object ${o.objectId}`);
      }
    }
    for (const r of q.rewards.items ?? []) need(d.items.has(r.itemId), `quest ${q.id}: reward ${r.itemId}`);
    if (q.rewards.jobChange) need(d.classes.has(q.rewards.jobChange), `quest ${q.id}: job ${q.rewards.jobChange}`);
  }
  return errors;
}

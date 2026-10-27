// Equipment refinement (+1 … +20), Ragnarok-style. Weapons have a weapon level
// (1–4): higher levels are stronger but less safe to refine. Each attempt costs
// one ore of the right grade and a Luma fee. Up to the safe limit an attempt
// always succeeds; above it the chance drops, and up to +10 a failure destroys
// the item (and any compounded cards). Over-upgrading +11…+20 (renewal rules)
// uses Stellar / Lunar Shards and 100,000 Luma: a failure breaks the item 20% of
// the time and otherwise drops it 3 levels. Results come from the World's Rng.
import type { GameData } from './data';
import type { CharacterState, EquipSlot, ItemDef, ItemInstance } from './types';
import { EQUIP_SLOTS } from './types';
import { removeItem, type OpResult } from './inventory';

export const MAX_REFINE = 20;
/** Highest level reachable with the classic ores (and enriched ores). */
export const NORMAL_MAX = 10;
export const HIGH_WEAPON_ORE = 'stellar_shard';
export const HIGH_ARMOR_ORE = 'lunar_shard';
export const HIGH_FEE = 100000;
/** Over-upgrade failure: chance the item breaks; otherwise it loses HIGH_DOWNGRADE levels. */
export const HIGH_BREAK_CHANCE = 0.2;
export const HIGH_DOWNGRADE = 3;
/** Ore per weapon level (1–4) and for armor. Levels 1–2 are sold by NPCs; Starsteel / Moonstone only drop. */
export const WEAPON_ORES = ['glimmer_ore', 'bright_ore', 'starsteel_ore', 'starsteel_ore'];
export const ARMOR_ORE = 'moonstone_ore';
/** Enriched ores work on any weapon level / any armor and use the better ENRICHED table. */
export const ENRICHED_WEAPON_ORE = 'enriched_starsteel';
export const ENRICHED_ARMOR_ORE = 'enriched_moonstone';
/** Success chance for the attempt that reaches refine level N (index N). Classic normal-ore table. */
const CHANCE: Record<string, number[]> = {
  w1: [1, 1, 1, 1, 1, 1, 1, 1, 0.6, 0.4, 0.2],
  w2: [1, 1, 1, 1, 1, 1, 1, 0.6, 0.4, 0.2, 0.2],
  w3: [1, 1, 1, 1, 1, 1, 0.6, 0.5, 0.2, 0.2, 0.2],
  w4: [1, 1, 1, 1, 1, 0.6, 0.4, 0.4, 0.2, 0.2, 0.1],
  armor: [1, 1, 1, 1, 1, 0.6, 0.4, 0.4, 0.2, 0.2, 0.1],
};
/** Enriched-ore table (same source): one more safe-ish step and better odds above the safe limit. */
const ENRICHED: Record<string, number[]> = {
  w1: [1, 1, 1, 1, 1, 1, 1, 1, 0.9, 0.7, 0.3],
  w2: [1, 1, 1, 1, 1, 1, 1, 0.9, 0.7, 0.4, 0.3],
  w3: [1, 1, 1, 1, 1, 1, 0.9, 0.8, 0.4, 0.4, 0.3],
  w4: [1, 1, 1, 1, 1, 0.9, 0.7, 0.7, 0.4, 0.4, 0.2],
  armor: [1, 1, 1, 1, 1, 0.9, 0.7, 0.7, 0.4, 0.4, 0.2],
};
// +11…+20 success chances (rAthena renewal refine.yml): weapon Lv 1–3 18/17/15%, weapon Lv 4 and armor 8/7/5%.
const HIGH_LOW = [0.18, 0.18, 0.18, 0.18, 0.18, 0.17, 0.17, 0.17, 0.15, 0.15];
const HIGH_HARD = [0.08, 0.08, 0.08, 0.08, 0.07, 0.07, 0.07, 0.07, 0.05, 0.05];
for (const t of [CHANCE, ENRICHED]) for (const k of Object.keys(t)) t[k] = [...t[k], ...(k === 'w4' || k === 'armor' ? HIGH_HARD : HIGH_LOW)];
/** Total refine ATK at +11…+20 by weapon level (renewal Bonus / 100); armor DEF at +11…+20. */
export const HIGH_WEAPON_ATK = [
  [22, 24, 26, 28, 30, 48, 51, 54, 57, 60], [33, 36, 39, 42, 45, 80, 85, 90, 95, 100],
  [55, 60, 65, 70, 75, 112, 119, 126, 133, 140], [77, 84, 91, 98, 105, 160, 170, 180, 190, 200],
];
export const HIGH_ARMOR_DEF = [8, 9, 10, 11, 13, 14, 16, 18, 19, 21];
/** Luma per attempt (classic refiner prices). */
const FEE: Record<string, number> = { w1: 50, w2: 200, w3: 5000, w4: 20000, armor: 2000 };
/** ATK added per refine level, by weapon level. */
export const ATK_PER_REFINE = [2, 3, 5, 7];

export type RefineKind = 'w1' | 'w2' | 'w3' | 'w4' | 'armor';
/** Success chance for each attempt (index = level reached) for a weapon level / armor, normal or enriched ore. */
export function refineTable(k: RefineKind, enriched = false): number[] { return (enriched ? ENRICHED : CHANCE)[k]; }
export function refineFee(k: RefineKind, nextLevel = 1): number { return nextLevel > NORMAL_MAX ? HIGH_FEE : FEE[k]; }
export function refineOre(k: RefineKind, enriched = false, nextLevel = 1): string {
  if (nextLevel > NORMAL_MAX) return k === 'armor' ? HIGH_ARMOR_ORE : HIGH_WEAPON_ORE;
  if (enriched) return k === 'armor' ? ENRICHED_ARMOR_ORE : ENRICHED_WEAPON_ORE;
  return k === 'armor' ? ARMOR_ORE : WEAPON_ORES[Number(k.slice(1)) - 1];
}

export interface RefineSim { steps: { level: number; chance: number }[]; survive: number; expectedAttempts: number; expectedItems: number; expectedOre: number; expectedLuma: number }
/**
 * Refine simulator (like the database sites' calculators): going from +from to +to.
 * `survive` is the chance one item reaches the target without being destroyed;
 * expected ore / Luma / items assume you start again from +from with another copy
 * after every break. Above +10 a failure usually only drops 3 levels, so the
 * simulator solves that as a Markov chain.
 */
export function simulateRefine(k: RefineKind, from: number, to: number, enriched = false): RefineSim {
  const t = refineTable(k, enriched);
  to = Math.min(MAX_REFINE, to);
  const steps: { level: number; chance: number }[] = [];
  for (let lv = from + 1; lv <= to; lv++) steps.push({ level: lv, chance: t[lv] });
  // P[l] = chance to reach `to` from l before breaking; A[l] = expected attempts until success or break; L[l] = expected Luma.
  const P = new Array(to + 1).fill(0), A = new Array(to + 1).fill(0), L = new Array(to + 1).fill(0);
  P[to] = 1;
  for (let iter = 0; iter < 4000; iter++) {
    for (let l = to - 1; l >= Math.min(from, NORMAL_MAX); l--) {
      const c = t[l + 1], fee = refineFee(k, l + 1);
      if (l + 1 <= NORMAL_MAX) { P[l] = c * P[l + 1]; A[l] = 1 + c * A[l + 1]; L[l] = fee + c * L[l + 1]; continue; }
      const down = Math.max(NORMAL_MAX, l + 1 - 1 - HIGH_DOWNGRADE), keep = (1 - c) * (1 - HIGH_BREAK_CHANCE);
      const dl = down;
      P[l] = c * P[l + 1] + keep * P[dl];
      A[l] = 1 + c * A[l + 1] + keep * A[dl];
      L[l] = fee + c * L[l + 1] + keep * L[dl];
    }
  }
  const survive = P[from];
  const items = survive > 0 ? 1 / survive : Infinity;
  return { steps, survive, expectedAttempts: A[from], expectedItems: items, expectedOre: A[from] * items, expectedLuma: L[from] * items };
}

export function weaponLevel(def: ItemDef): number { return Math.min(4, Math.max(1, def.weaponLevel ?? 1)); }
const kind = (def: ItemDef) => (def.slot === 'weapon' ? `w${weaponLevel(def)}` : 'armor');
/** Highest refine level that can never fail. */
export function safeLimit(def: ItemDef): number { return CHANCE[kind(def)].findIndex((c, i) => i > 0 && c < 1) - 1; }

export interface RefineInfo { ok: boolean; error?: string; current: number; next: number; chance: number; safe: number; ore: string; fee: number; enriched: boolean }

export function locateItem(c: CharacterState, uid: string): { inst: ItemInstance; slot: EquipSlot | null } | null {
  const inv = c.inventory.find((i) => i.uid === uid);
  if (inv) return { inst: inv, slot: null };
  for (const s of EQUIP_SLOTS) if (c.equipment[s]?.uid === uid) return { inst: c.equipment[s]!, slot: s };
  return null;
}

export function refineInfo(data: GameData, c: CharacterState, uid: string, enriched = false): RefineInfo {
  const at = locateItem(c, uid);
  const blank = { current: 0, next: 0, chance: 0, safe: 0, ore: '', fee: 0, enriched };
  if (!at) return { ok: false, error: 'Item not found.', ...blank };
  const def = data.items.get(at.inst.itemId)!;
  if (def.type !== 'equipment' || !def.slot || def.slot === 'accessory') return { ok: false, error: 'Only weapons and armor can be refined.', ...blank };
  const k = kind(def) as RefineKind, cur = at.inst.refine ?? 0, next = cur + 1;
  const info = {
    current: cur, next, chance: (enriched ? ENRICHED : CHANCE)[k][Math.min(MAX_REFINE, next)], safe: safeLimit(def),
    ore: refineOre(k, enriched, next), fee: refineFee(k, next), enriched,
  };
  if (cur >= MAX_REFINE) return { ok: false, error: `Already at +${MAX_REFINE}.`, ...info };
  if (enriched && next > NORMAL_MAX) return { ok: false, error: 'Enriched ore only works up to +10. Past +10 use Stellar / Lunar Shards.', ...info };
  if (c.luma < info.fee) return { ok: false, error: `Needs ${info.fee} Luma.`, ...info };
  if (!c.inventory.some((i) => i.itemId === info.ore && i.qty > 0)) return { ok: false, error: `Needs 1 ${data.items.get(info.ore)?.name ?? info.ore}.`, ...info };
  return { ok: true, ...info };
}

export type RefineResult = OpResult & { outcome?: 'success' | 'broken' | 'downgraded'; level?: number; itemId?: string; wasEquipped?: boolean };

/** One refine attempt. `roll` (success) and `breakRoll` (over-upgrade failures) are uniform [0,1) numbers from the world Rng. */
export function refineItem(data: GameData, c: CharacterState, uid: string, roll: number, enriched = false, breakRoll = 0): RefineResult {
  const info = refineInfo(data, c, uid, enriched);
  if (!info.ok) return { ok: false, error: info.error! };
  const at = locateItem(c, uid)!;
  const def = data.items.get(at.inst.itemId)!;
  removeItem(c, info.ore, 1);
  c.luma -= info.fee;
  if (roll < info.chance) {
    at.inst.refine = info.next;
    return { ok: true, message: `${def.name} is now +${info.next}!`, outcome: 'success', level: info.next, itemId: def.id, wasEquipped: !!at.slot };
  }
  if (info.next > NORMAL_MAX && breakRoll >= HIGH_BREAK_CHANCE) {
    at.inst.refine = Math.max(NORMAL_MAX, info.current - HIGH_DOWNGRADE);
    return { ok: true, message: `Refining failed. The ${def.name} dropped to +${at.inst.refine}.`, outcome: 'downgraded', level: at.inst.refine, itemId: def.id, wasEquipped: !!at.slot };
  }
  if (at.slot) delete c.equipment[at.slot];
  else c.inventory = c.inventory.filter((i) => i.uid !== uid);
  const lost = at.inst.cards?.length ? ` along with ${at.inst.cards.length} compounded card${at.inst.cards.length > 1 ? 's' : ''}` : '';
  return { ok: true, message: `Refining failed… the +${info.current} ${def.name} shattered${lost}.`, outcome: 'broken', level: info.current, itemId: def.id, wasEquipped: !!at.slot };
}

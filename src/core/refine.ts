// Refinement of weapons, armor and rune stones, up to +10. Every level is harder than the last
// (and higher weapon levels, armor and higher rune stones are harder still). Weapons and armor use
// one ore per attempt plus Luma; rune stones only Luma. +1…+5 never break: a failure just leaves
// the item as it was. From +6 a failure also rolls, separately, for the item to break; the break
// chance climbs every level. Results come from the World's Rng.
import type { GameData } from './data';
import type { CharacterState, EquipSlot, ItemDef, ItemInstance } from './types';
import { EQUIP_SLOTS } from './types';
import { removeItem, type OpResult } from './inventory';

export const MAX_REFINE = 10;
/** Highest level reachable with the classic ores (and enriched ores). */
export const NORMAL_MAX = 10;
/** Up to this level a failed refine never breaks anything. */
export const SAFE_MAX = 5;
/** Ore per weapon level (1–4) and for armor. Levels 1–2 are sold by NPCs; Starsteel / Moonstone only drop. */
export const WEAPON_ORES = ['glimmer_ore', 'bright_ore', 'starsteel_ore', 'starsteel_ore'];
export const ARMOR_ORE = 'moonstone_ore';
/** Enriched ores work on any weapon level / any armor and add ENRICHED_BONUS to the success chance. */
export const ENRICHED_WEAPON_ORE = 'enriched_starsteel';
export const ENRICHED_ARMOR_ORE = 'enriched_moonstone';
export const ENRICHED_BONUS = 0.1;
/** Base success chance of the attempt that reaches +N (index N): harder every level. */
const BASE = [1, 1, 0.95, 0.9, 0.85, 0.8, 0.65, 0.5, 0.4, 0.3, 0.2];
/** Harder items: weapon levels, armor and rune stones (by stone level) lose this much chance. */
const PENALTY: Record<string, number> = { w1: 0, w2: 0.02, w3: 0.05, w4: 0.08, armor: 0.05, rune1: 0, rune2: 0.03, rune3: 0.06, rune4: 0.09, rune5: 0.12 };
/**
 * Break chance when an attempt at +N fails (index N), rolled on its own: +1…+5 never break,
 * from +6 the risk climbs every level. A failure that does not break leaves the item as it was.
 */
export const BREAK_CHANCE = [0, 0, 0, 0, 0, 0, 0.15, 0.25, 0.35, 0.45, 0.55];
/** Total refine ATK at +11…+20 by weapon level (renewal Bonus / 100); armor DEF at +11…+20. */
export const HIGH_WEAPON_ATK = [
  [22, 24, 26, 28, 30, 48, 51, 54, 57, 60], [33, 36, 39, 42, 45, 80, 85, 90, 95, 100],
  [55, 60, 65, 70, 75, 112, 119, 126, 133, 140], [77, 84, 91, 98, 105, 160, 170, 180, 190, 200],
];
export const HIGH_ARMOR_DEF = [8, 9, 10, 11, 13, 14, 16, 18, 19, 21];
/** Luma per attempt at +1 (it grows with the level). */
const FEE: Record<string, number> = { w1: 50, w2: 200, w3: 5000, w4: 20000, armor: 2000, rune1: 400, rune2: 800, rune3: 1600, rune4: 3200, rune5: 6400 };
/** ATK added per refine level, by weapon level. */
export const ATK_PER_REFINE = [2, 3, 5, 7];

export type RefineKind = 'w1' | 'w2' | 'w3' | 'w4' | 'armor' | 'rune1' | 'rune2' | 'rune3' | 'rune4' | 'rune5';
/** Success chance for each attempt (index = level reached) for a weapon level / armor, normal or enriched ore. */
export function refineTable(k: RefineKind, enriched = false): number[] {
  return BASE.map((c, n) => (n === 0 ? 1 : Math.max(0.05, Math.min(1, c - (n > 1 ? PENALTY[k] ?? 0 : 0) + (enriched ? ENRICHED_BONUS : 0)))));
}
export function refineFee(k: RefineKind, nextLevel = 1): number { return Math.round((FEE[k] ?? 1000) * (1 + 0.5 * (nextLevel - 1))); }
/** Ore used per attempt ('' = none: rune stones are refined with Luma only). */
export function refineOre(k: RefineKind, enriched = false, _nextLevel = 1): string {
  if (k.startsWith('rune')) return '';
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
  // From +l: success → +l+1; failure → breaks with BREAK_CHANCE[l+1], otherwise stays at +l and tries again.
  // P[l] = chance to reach `to` before breaking; A[l] = expected attempts; L[l] = expected Luma.
  const P = new Array(to + 1).fill(0), A = new Array(to + 1).fill(0), L = new Array(to + 1).fill(0);
  P[to] = 1;
  for (let l = to - 1; l >= from; l--) {
    const c = t[l + 1], b = BREAK_CHANCE[l + 1], fee = refineFee(k, l + 1);
    const end = c + (1 - c) * b; // chance an attempt ends this level (success or break)
    P[l] = (c / end) * P[l + 1];
    A[l] = 1 / end + (c / end) * A[l + 1];
    L[l] = fee / end + (c / end) * L[l + 1];
  }
  const survive = P[from];
  const items = survive > 0 ? 1 / survive : Infinity;
  return { steps, survive, expectedAttempts: A[from], expectedItems: items, expectedOre: k.startsWith('rune') ? 0 : A[from] * items, expectedLuma: L[from] * items };
}

export function weaponLevel(def: ItemDef): number { return Math.min(4, Math.max(1, def.weaponLevel ?? 1)); }
const kind = (def: ItemDef): RefineKind => (def.runeStone ? `rune${Math.min(5, Math.max(1, def.runeStone.level))}` as RefineKind : def.slot === 'weapon' ? `w${weaponLevel(def)}` as RefineKind : 'armor');
export const refineKindOf = kind;
/** Highest refine level whose attempts can never break the item. */
export function safeLimit(_def?: ItemDef): number { return SAFE_MAX; }

export interface RefineInfo { ok: boolean; error?: string; current: number; next: number; chance: number; breakChance: number; safe: number; ore: string; fee: number; enriched: boolean }

export function locateItem(c: CharacterState, uid: string): { inst: ItemInstance; slot: EquipSlot | null } | null {
  const inv = c.inventory.find((i) => i.uid === uid);
  if (inv) return { inst: inv, slot: null };
  for (const s of EQUIP_SLOTS) if (c.equipment[s]?.uid === uid) return { inst: c.equipment[s]!, slot: s };
  return null;
}

export function refineInfo(data: GameData, c: CharacterState, uid: string, enriched = false): RefineInfo {
  const at = locateItem(c, uid);
  const blank = { current: 0, next: 0, chance: 0, breakChance: 0, safe: 0, ore: '', fee: 0, enriched };
  if (!at) return { ok: false, error: 'Item not found.', ...blank };
  const def = data.items.get(at.inst.itemId)!;
  if (def.type !== 'equipment' || !def.slot || def.slot === 'accessory') return { ok: false, error: 'Only weapons, armor and rune stones can be refined.', ...blank };
  const k = kind(def), cur = at.inst.refine ?? 0, next = cur + 1;
  const rune = !!def.runeStone;
  const info = {
    current: cur, next, chance: refineTable(k, enriched && !rune)[Math.min(MAX_REFINE, next)], breakChance: BREAK_CHANCE[Math.min(MAX_REFINE, next)], safe: SAFE_MAX,
    ore: refineOre(k, enriched, next), fee: refineFee(k, next), enriched: enriched && !rune,
  };
  if (cur >= MAX_REFINE) return { ok: false, error: `Already at +${MAX_REFINE}.`, ...info };
  if (c.luma < info.fee) return { ok: false, error: `Needs ${info.fee} Luma.`, ...info };
  if (info.ore && !c.inventory.some((i) => i.itemId === info.ore && i.qty > 0)) return { ok: false, error: `Needs 1 ${data.items.get(info.ore)?.name ?? info.ore}.`, ...info };
  return { ok: true, ...info };
}

export type RefineResult = OpResult & { outcome?: 'success' | 'broken' | 'failed'; level?: number; itemId?: string; wasEquipped?: boolean };

/**
 * One refine attempt. `roll` decides success; on a failure `breakRoll` is rolled on its own
 * against the break chance of that level (none up to +5). A failure that does not break leaves
 * the item exactly as it was. Both are uniform [0,1) numbers from the world Rng.
 */
export function refineItem(data: GameData, c: CharacterState, uid: string, roll: number, enriched = false, breakRoll = 1): RefineResult {
  const info = refineInfo(data, c, uid, enriched);
  if (!info.ok) return { ok: false, error: info.error! };
  const at = locateItem(c, uid)!;
  const def = data.items.get(at.inst.itemId)!;
  if (info.ore) removeItem(c, info.ore, 1);
  c.luma -= info.fee;
  if (roll < info.chance) {
    at.inst.refine = info.next;
    return { ok: true, message: `${def.name} is now +${info.next}!`, outcome: 'success', level: info.next, itemId: def.id, wasEquipped: !!at.slot };
  }
  if (breakRoll >= info.breakChance) {
    return { ok: true, message: `Refining failed, but the ${def.name} held together (still +${info.current}).`, outcome: 'failed', level: info.current, itemId: def.id, wasEquipped: !!at.slot };
  }
  if (at.slot) delete c.equipment[at.slot];
  else c.inventory = c.inventory.filter((i) => i.uid !== uid);
  const lost = at.inst.cards?.length ? ` along with ${at.inst.cards.length} compounded card${at.inst.cards.length > 1 ? 's' : ''}` : '';
  return { ok: true, message: `Refining failed… the +${info.current} ${def.name} shattered${lost}.`, outcome: 'broken', level: info.current, itemId: def.id, wasEquipped: !!at.slot };
}

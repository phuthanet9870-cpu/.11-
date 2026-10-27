// Equipment refinement (+1 … +10), Ragnarok-style. Weapons have a weapon level
// (1–4): higher levels are stronger but less safe to refine. Each attempt costs
// one ore of the right grade and a Luma fee. Up to the safe limit an attempt
// always succeeds; above it the chance drops, and a failure destroys the item
// (and any compounded cards). Results come from the World's seeded Rng.
import type { GameData } from './data';
import type { CharacterState, EquipSlot, ItemDef, ItemInstance } from './types';
import { EQUIP_SLOTS } from './types';
import { removeItem, type OpResult } from './inventory';

export const MAX_REFINE = 10;
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
/** Luma per attempt (classic refiner prices). */
const FEE: Record<string, number> = { w1: 50, w2: 200, w3: 5000, w4: 20000, armor: 2000 };
/** ATK added per refine level, by weapon level. */
export const ATK_PER_REFINE = [2, 3, 5, 7];

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
  const k = kind(def), cur = at.inst.refine ?? 0;
  const info = {
    current: cur, next: cur + 1, chance: (enriched ? ENRICHED : CHANCE)[k][Math.min(MAX_REFINE, cur + 1)], safe: safeLimit(def),
    ore: enriched ? (def.slot === 'weapon' ? ENRICHED_WEAPON_ORE : ENRICHED_ARMOR_ORE) : def.slot === 'weapon' ? WEAPON_ORES[weaponLevel(def) - 1] : ARMOR_ORE, fee: FEE[k], enriched,
  };
  if (cur >= MAX_REFINE) return { ok: false, error: `Already at +${MAX_REFINE}.`, ...info };
  if (c.luma < info.fee) return { ok: false, error: `Needs ${info.fee} Luma.`, ...info };
  if (!c.inventory.some((i) => i.itemId === info.ore && i.qty > 0)) return { ok: false, error: `Needs 1 ${data.items.get(info.ore)?.name ?? info.ore}.`, ...info };
  return { ok: true, ...info };
}

export type RefineResult = OpResult & { outcome?: 'success' | 'broken'; level?: number; itemId?: string; wasEquipped?: boolean };

/** One refine attempt. `roll` is a uniform [0,1) number from the world Rng. */
export function refineItem(data: GameData, c: CharacterState, uid: string, roll: number, enriched = false): RefineResult {
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
  if (at.slot) delete c.equipment[at.slot];
  else c.inventory = c.inventory.filter((i) => i.uid !== uid);
  const lost = at.inst.cards?.length ? ` along with ${at.inst.cards.length} compounded card${at.inst.cards.length > 1 ? 's' : ''}` : '';
  return { ok: true, message: `Refining failed… the +${info.current} ${def.name} shattered${lost}.`, outcome: 'broken', level: info.current, itemId: def.id, wasEquipped: !!at.slot };
}

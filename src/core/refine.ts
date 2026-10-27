// Equipment refinement (+1 … +10), Ragnarok-style: each attempt costs one ore
// and a Luma fee. Up to the safe limit an attempt always succeeds; above it the
// chance drops per level, and a failure destroys the item. Weapons use
// Starsteel Ore, everything else Moonstone Ore. Results come from the World's
// seeded Rng, so a server can replay them.
import type { GameData } from './data';
import type { CharacterState, EquipSlot, ItemDef, ItemInstance } from './types';
import { EQUIP_SLOTS } from './types';
import { removeItem, type OpResult } from './inventory';

export const MAX_REFINE = 10;
export const WEAPON_ORE = 'starsteel_ore';
export const ARMOR_ORE = 'moonstone_ore';
const SAFE = { weapon: 5, armor: 4 };
/** Success chance for the attempt that would reach refine level N (index N). */
const CHANCE = {
  weapon: [1, 1, 1, 1, 1, 1, 0.6, 0.5, 0.4, 0.3, 0.2],
  armor: [1, 1, 1, 1, 1, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1],
};
const FEE = [0, 100, 150, 200, 300, 400, 600, 800, 1000, 1500, 2000];

export interface RefineInfo { ok: boolean; error?: string; current: number; next: number; chance: number; safe: number; ore: string; fee: number }

const kind = (def: ItemDef) => (def.slot === 'weapon' ? 'weapon' : 'armor');

export function locateItem(c: CharacterState, uid: string): { inst: ItemInstance; slot: EquipSlot | null } | null {
  const inv = c.inventory.find((i) => i.uid === uid);
  if (inv) return { inst: inv, slot: null };
  for (const s of EQUIP_SLOTS) if (c.equipment[s]?.uid === uid) return { inst: c.equipment[s]!, slot: s };
  return null;
}

export function refineInfo(data: GameData, c: CharacterState, uid: string): RefineInfo {
  const at = locateItem(c, uid);
  const blank = { current: 0, next: 0, chance: 0, safe: 0, ore: '', fee: 0 };
  if (!at) return { ok: false, error: 'Item not found.', ...blank };
  const def = data.items.get(at.inst.itemId)!;
  if (def.type !== 'equipment' || !def.slot || def.slot === 'accessory') return { ok: false, error: 'Only weapons and armor can be refined.', ...blank };
  const k = kind(def), cur = at.inst.refine ?? 0;
  const info = { current: cur, next: cur + 1, chance: CHANCE[k][Math.min(MAX_REFINE, cur + 1)], safe: SAFE[k], ore: k === 'weapon' ? WEAPON_ORE : ARMOR_ORE, fee: FEE[Math.min(MAX_REFINE, cur + 1)] };
  if (cur >= MAX_REFINE) return { ok: false, error: `Already at +${MAX_REFINE}.`, ...info };
  if (c.luma < info.fee) return { ok: false, error: `Needs ${info.fee} Luma.`, ...info };
  if (!c.inventory.some((i) => i.itemId === info.ore && i.qty > 0)) return { ok: false, error: `Needs 1 ${data.items.get(info.ore)?.name ?? info.ore}.`, ...info };
  return { ok: true, ...info };
}

export type RefineResult = OpResult & { outcome?: 'success' | 'broken'; level?: number; itemId?: string; wasEquipped?: boolean };

/** One refine attempt. `roll` is a uniform [0,1) number from the world Rng. */
export function refineItem(data: GameData, c: CharacterState, uid: string, roll: number): RefineResult {
  const info = refineInfo(data, c, uid);
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
  return { ok: true, message: `Refining failed… the +${info.current} ${def.name} shattered.`, outcome: 'broken', level: info.current, itemId: def.id, wasEquipped: !!at.slot };
}

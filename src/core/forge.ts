// Weapon forging, Ragnarok-style. A forge NPC turns materials into a weapon.
// Optional additions: one element stone (the weapon takes that element) and up
// to three star crumbs (bonus ATK). Each addition lowers the success chance:
//   chance% = 50 + JobLv×0.2 + DEX×0.1 + LUK×0.1 + forge bonus
//             − (weapon Lv 2: 20, Lv 3: 30) − 20 if elemental − 15 per crumb
// Materials and fee are consumed on failure too. Forged weapons carry the
// maker's name and have no card slots.
import type { GameData } from './data';
import type { CharacterState, Element, ItemInstance } from './types';
import { addItem, countItem, removeItem, type OpResult } from './inventory';

export const ELEMENT_STONES: Record<string, Element> = { flame_stone: 'fire', frost_stone: 'water', gale_stone: 'wind', terra_stone: 'earth' };
export const STAR_CRUMB = 'star_crumb';
/** Bonus ATK for 1 / 2 / 3 star crumbs ("Very Strong" … "Very Very Very Strong"). */
export const CRUMB_ATK = [0, 5, 10, 40];
const CRUMB_TITLE = ['', 'Very Strong', 'Very Very Strong', 'Very Very Very Strong'];
/** Bonus from the NPC forge master's equipment (stands in for a smith's forging skills). */
export const FORGE_BONUS = 20;

export interface ForgeChoice { recipeId: string; stone?: string; crumbs?: number }

export function forgeChance(data: GameData, c: CharacterState, choice: ForgeChoice): number {
  const r = data.recipes.get(choice.recipeId);
  if (!r) return 0;
  const wl = data.items.get(r.itemId)?.weaponLevel ?? 1;
  const total = (k: 'dex' | 'luk') => c.stats[k];
  let p = 50 + c.jobLevel * 0.2 + total('dex') * 0.1 + total('luk') * 0.1 + FORGE_BONUS;
  p -= wl === 2 ? 20 : wl >= 3 ? 30 : 0;
  if (choice.stone) p -= 20;
  p -= 15 * (choice.crumbs ?? 0);
  return Math.max(5, Math.min(100, p)) / 100;
}

export function canForge(data: GameData, c: CharacterState, choice: ForgeChoice): OpResult {
  const r = data.recipes.get(choice.recipeId);
  if (!r) return { ok: false, error: 'Unknown recipe.' };
  const crumbs = choice.crumbs ?? 0;
  if (!Number.isInteger(crumbs) || crumbs < 0 || crumbs > 3) return { ok: false, error: 'Up to 3 star crumbs.' };
  if (choice.stone && !ELEMENT_STONES[choice.stone]) return { ok: false, error: 'That is not an element stone.' };
  for (const m of r.materials) if (countItem(c, m.itemId) < m.qty) return { ok: false, error: `Needs ${m.qty} ${data.items.get(m.itemId)?.name}.` };
  if (choice.stone && countItem(c, choice.stone) < 1) return { ok: false, error: `Needs ${data.items.get(choice.stone)?.name}.` };
  if (countItem(c, STAR_CRUMB) < crumbs) return { ok: false, error: `Needs ${crumbs} Star Crumb.` };
  if (c.luma < r.fee) return { ok: false, error: `Needs ${r.fee} Luma.` };
  return { ok: true };
}

export type ForgeResult = OpResult & { success?: boolean; item?: ItemInstance };

/** One forging attempt; `roll` is uniform [0,1) from the world Rng. */
export function forgeWeapon(data: GameData, c: CharacterState, choice: ForgeChoice, roll: number): ForgeResult {
  const chk = canForge(data, c, choice);
  if (!chk.ok) return chk;
  const r = data.recipes.get(choice.recipeId)!, def = data.items.get(r.itemId)!;
  const chance = forgeChance(data, c, choice), crumbs = choice.crumbs ?? 0;
  for (const m of r.materials) removeItem(c, m.itemId, m.qty);
  if (choice.stone) removeItem(c, choice.stone, 1);
  if (crumbs) removeItem(c, STAR_CRUMB, crumbs);
  c.luma -= r.fee;
  if (roll >= chance) return { ok: true, success: false, message: `Forging failed. The materials were lost.` };
  const add = addItem(data, c, def.id, 1, { ignoreWeight: true });
  if (!add.ok) return add;
  // addItem creates a fresh instance for non-stackables: tag the newest one.
  const inst = [...c.inventory].reverse().find((i) => i.itemId === def.id && !i.crafter && !(i.refine ?? 0))!;
  inst.crafter = c.name;
  if (choice.stone) inst.element = ELEMENT_STONES[choice.stone];
  if (crumbs) inst.starCrumbs = crumbs;
  return { ok: true, success: true, item: inst, message: `You forged ${forgedName(def.name, inst)}!` };
}

export function forgedName(base: string, inst: ItemInstance): string {
  if (!inst.crafter) return base;
  const el = inst.element ? `${inst.element[0].toUpperCase()}${inst.element.slice(1)} ` : '';
  const strong = inst.starCrumbs ? `${CRUMB_TITLE[inst.starCrumbs]} ` : '';
  return `${inst.crafter}'s ${strong}${el}${base}`;
}


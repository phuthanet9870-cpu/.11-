// Alchemist brewing (Ragnarok-style Pharmacy, original recipes).
//
// An Alchemist (or Grand Alchemist) who knows Potion Research brews with a Medicine Bowl, which is
// used up on every try. The chance to succeed grows with Potion Research, Job Level, DEX, LUK and INT;
// harder recipes are less likely. A failed brew loses the materials, as in RO.

import type { GameData } from './data';
import { addItem, countItem, removeItem, type OpResult } from './inventory';
import type { CharacterState } from './types';

export interface BrewRecipe {
  id: string;
  itemId: string;
  qty: number;
  materials: { itemId: string; qty: number }[];
  /** Lowers the success chance (percentage points). */
  difficulty: number;
}

export const BREW_BOWL = 'medicine_bowl';

export const BREW_RECIPES: BrewRecipe[] = [
  { id: 'brew_red_potion', itemId: 'red_potion', qty: 1, difficulty: 0, materials: [{ itemId: 'red_herb', qty: 1 }, { itemId: 'empty_bottle', qty: 1 }] },
  { id: 'brew_orange_potion', itemId: 'orange_potion', qty: 1, difficulty: 5, materials: [{ itemId: 'red_herb', qty: 1 }, { itemId: 'yellow_herb', qty: 1 }, { itemId: 'empty_bottle', qty: 1 }] },
  { id: 'brew_yellow_potion', itemId: 'yellow_potion', qty: 1, difficulty: 10, materials: [{ itemId: 'yellow_herb', qty: 2 }, { itemId: 'empty_bottle', qty: 1 }] },
  { id: 'brew_green_potion', itemId: 'green_potion', qty: 1, difficulty: 0, materials: [{ itemId: 'green_herb', qty: 1 }, { itemId: 'empty_bottle', qty: 1 }] },
  { id: 'brew_blue_potion', itemId: 'blue_potion', qty: 1, difficulty: 15, materials: [{ itemId: 'blue_herb', qty: 1 }, { itemId: 'spore_dust', qty: 1 }, { itemId: 'empty_bottle', qty: 1 }] },
  { id: 'brew_alcohol', itemId: 'alcohol', qty: 1, difficulty: 10, materials: [{ itemId: 'mushling_cap', qty: 2 }, { itemId: 'spore_dust', qty: 1 }, { itemId: 'empty_bottle', qty: 1 }] },
  { id: 'brew_fire_bottle', itemId: 'fire_bottle', qty: 1, difficulty: 15, materials: [{ itemId: 'alcohol', qty: 1 }, { itemId: 'wolf_pelt', qty: 1 }, { itemId: 'empty_bottle', qty: 1 }] },
  { id: 'brew_acid_bottle', itemId: 'acid_bottle', qty: 1, difficulty: 15, materials: [{ itemId: 'wasp_stinger', qty: 2 }, { itemId: 'yellow_herb', qty: 1 }, { itemId: 'empty_bottle', qty: 1 }] },
];

export function canBrew(c: CharacterState): boolean {
  return (c.skills.potion_research ?? 0) >= 1;
}

/** Success chance in percent (5–95). */
export function brewChance(c: CharacterState, r: BrewRecipe, stats: { dex: number; luk: number; int: number }): number {
  const pr = c.skills.potion_research ?? 0;
  const grand = c.classId === 'grand_alchemist' ? 10 : 0;
  const raw = 30 + pr * 4 + c.jobLevel * 0.3 + stats.dex * 0.2 + stats.luk * 0.15 + stats.int * 0.1 + grand - r.difficulty;
  return Math.max(5, Math.min(95, Math.round(raw)));
}

export function missingFor(c: CharacterState, r: BrewRecipe, times = 1): { itemId: string; need: number; have: number }[] {
  const need = [...r.materials, { itemId: BREW_BOWL, qty: 1 }];
  return need.map((m) => ({ itemId: m.itemId, need: m.qty * times, have: countItem(c, m.itemId) })).filter((m) => m.have < m.need);
}

/** One brew. `roll` is a 0–1 random number. */
export function brew(data: GameData, c: CharacterState, recipeId: string, stats: { dex: number; luk: number; int: number }, roll: number): OpResult & { success?: boolean; chance?: number } {
  const r = BREW_RECIPES.find((x) => x.id === recipeId);
  if (!r) return { ok: false, error: 'Unknown recipe.' };
  if (!canBrew(c)) return { ok: false, error: 'Only an Alchemist who knows Potion Research can brew.' };
  const miss = missingFor(c, r);
  if (miss.length) return { ok: false, error: `You need ${miss.map((m) => `${data.items.get(m.itemId)?.name ?? m.itemId} ×${m.need - m.have}`).join(', ')} more.` };
  const chance = brewChance(c, r, stats);
  const success = roll * 100 < chance;
  if (success) {
    const add = addItem(data, c, r.itemId, r.qty, { ignoreWeight: true });
    if (!add.ok) return add;
  }
  removeItem(c, BREW_BOWL, 1);
  for (const m of r.materials) removeItem(c, m.itemId, m.qty);
  return { ok: true, success, chance };
}

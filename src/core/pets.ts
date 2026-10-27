// Pets, Ragnarok-style. Use a monster's lure on it to try to tame it; success
// gives an egg. Hatch the egg to bring the pet out. A pet gets hungry over time;
// feeding it at the right moment raises intimacy, overfeeding or starving it
// lowers it. A Loyal pet gives its owner a bonus. At 0 intimacy it runs away.
import type { GameData } from './data';
import type { CharacterState, ItemInstance, PetDef, PetState, StatModifiers } from './types';
import { addItem, removeByUid, type OpResult } from './inventory';

export const MAX_HUNGER = 100;
export const MAX_INTIMACY = 1000;
export const LOYAL_AT = 910;
const FEED_HUNGER = 20;

export function petDef(data: GameData, petId: string): PetDef | undefined { return data.pets.get(petId); }
export function petForMonster(data: GameData, monsterId: string): PetDef | undefined {
  for (const p of data.pets.values()) if (p.monsterId === monsterId) return p;
  return undefined;
}

/** Capture chance (0–1): (rate + (baseLv − monLv) × 30 + LUK × 20) × (200 − HP%) / 100, in 1/100 %. */
export function captureChance(def: PetDef, baseLevel: number, monsterLevel: number, luk: number, hpPct: number): number {
  const raw = (def.captureRate + (baseLevel - monsterLevel) * 30 + luk * 20) * (200 - Math.round(hpPct * 100)) / 100;
  return Math.max(0, Math.min(1, raw / 10000));
}

export function intimacyLabel(i: number): string {
  if (i >= LOYAL_AT) return 'Loyal';
  if (i >= 750) return 'Cordial';
  if (i >= 250) return 'Neutral';
  if (i >= 100) return 'Shy';
  return 'Awkward';
}

export function hungerLabel(h: number): string {
  if (h > 90) return 'Stuffed';
  if (h > 75) return 'Satisfied';
  if (h > 25) return 'Neutral';
  if (h > 10) return 'Hungry';
  return 'Very hungry';
}

export function newPetState(def: PetDef): PetState {
  return { petId: def.id, name: def.name, hunger: MAX_HUNGER, intimacy: def.intimacyStart };
}

/** Bonus for the active pet (only when Loyal). */
export function petMods(data: GameData, c: CharacterState): StatModifiers | null {
  const p = c.pet;
  if (!p || p.intimacy < LOYAL_AT) return null;
  return petDef(data, p.petId)?.loyalBonus ?? null;
}

/** Hatch an egg from the inventory. Only one pet can be out. */
export function hatchEgg(data: GameData, c: CharacterState, uid: string): OpResult {
  if (c.pet) return { ok: false, error: 'Return your current pet to its egg first.' };
  const inst = c.inventory.find((i) => i.uid === uid);
  const def = inst && data.items.get(inst.itemId);
  if (!inst || !def?.petEgg) return { ok: false, error: 'That is not a pet egg.' };
  const pd = petForMonster(data, def.petEgg);
  if (!pd) return { ok: false, error: 'Unknown pet.' };
  const state = inst.pet ?? newPetState(pd);
  const r = removeByUid(c, uid, 1);
  if (!r.ok) return r;
  c.pet = { ...state, nextHungerAt: undefined };
  return { ok: true, message: `${state.name} hatched!` };
}

/** Put the active pet back into an egg in the inventory. */
export function returnToEgg(data: GameData, c: CharacterState): OpResult {
  const p = c.pet;
  if (!p) return { ok: false, error: 'You have no pet out.' };
  const pd = petDef(data, p.petId)!;
  const r = addItem(data, c, pd.eggItem, 1, { ignoreWeight: true });
  if (!r.ok) return r;
  const egg = [...c.inventory].reverse().find((i) => i.itemId === pd.eggItem && !i.pet)!;
  egg.pet = { petId: p.petId, name: p.name, hunger: p.hunger, intimacy: p.intimacy };
  c.pet = null;
  return { ok: true, message: `${p.name} returned to its egg.` };
}

/** Feed the active pet its food. Intimacy rises when it is hungry, falls when overfed. */
export function feedPet(data: GameData, c: CharacterState): OpResult & { delta?: number } {
  const p = c.pet;
  if (!p) return { ok: false, error: 'You have no pet out.' };
  const pd = petDef(data, p.petId)!;
  const food = c.inventory.find((i) => i.itemId === pd.foodItem);
  if (!food) return { ok: false, error: `${p.name} only eats ${data.items.get(pd.foodItem)?.name ?? pd.foodItem}.` };
  removeByUid(c, food.uid, 1);
  let delta: number;
  if (p.hunger > 90) delta = -pd.intimacyOverfed;
  else if (p.hunger > 75) delta = Math.floor(pd.intimacyFed / 2);
  else delta = pd.intimacyFed;
  p.intimacy = Math.max(0, Math.min(MAX_INTIMACY, p.intimacy + delta));
  p.hunger = Math.min(MAX_HUNGER, p.hunger + FEED_HUNGER);
  return { ok: true, delta, message: delta < 0 ? `${p.name} is overfed and upset. (Intimacy ${delta})` : `${p.name} happily eats. (Intimacy +${delta})` };
}

export function renamePet(c: CharacterState, name: string): OpResult {
  const n = name.trim().slice(0, 16);
  if (!c.pet) return { ok: false, error: 'You have no pet out.' };
  if (!n) return { ok: false, error: 'Enter a name.' };
  c.pet.name = n;
  return { ok: true, message: `Your pet is now called ${n}.` };
}

/**
 * Advance hunger. Every hungerTickMs the pet loses `fullness` hunger; while
 * starving (0) it also loses intimacy. Returns 'ranAway' when intimacy hits 0.
 */
export function tickPet(data: GameData, c: CharacterState, now: number): 'ranAway' | 'hungry' | null {
  const p = c.pet;
  if (!p) return null;
  const pd = petDef(data, p.petId);
  if (!pd) { c.pet = null; return null; }
  p.nextHungerAt ??= now + pd.hungerTickMs;
  let ev: 'hungry' | null = null;
  while (now >= p.nextHungerAt) {
    p.nextHungerAt += pd.hungerTickMs;
    const before = p.hunger;
    p.hunger = Math.max(0, p.hunger - pd.fullness);
    if (before > 25 && p.hunger <= 25) ev = 'hungry';
    if (p.hunger <= 0) p.intimacy = Math.max(0, p.intimacy - pd.intimacyHungry);
    if (p.intimacy <= 0) { c.pet = null; return 'ranAway'; }
  }
  return ev;
}

/** The owner died: the pet loses intimacy. */
export function petOwnerDied(data: GameData, c: CharacterState): 'ranAway' | null {
  const p = c.pet;
  if (!p) return null;
  p.intimacy = Math.max(0, p.intimacy - (petDef(data, p.petId)?.intimacyOwnerDie ?? 20));
  if (p.intimacy <= 0) { c.pet = null; return 'ranAway'; }
  return null;
}

export function eggLabel(inst: ItemInstance): string | null {
  return inst.pet ? `${inst.pet.name} · ${intimacyLabel(inst.pet.intimacy)}` : null;
}

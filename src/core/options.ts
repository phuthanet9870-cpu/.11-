// Random options (affixes), Ragnarok Zero style: equipment dropped by monsters
// can roll up to three random bonuses; an enchanter NPC can add one more
// option (up to the cap) or reroll them all. Pools are weighted; stat bonuses
// are the most common and big HP bonuses the rarest.
import type { GameData } from './data';
import type { CharacterState, ItemDef } from './types';
import type { OpResult } from './inventory';

export interface OptionDef { key: string; label: string; min: number; max: number; weight: number; pool: 'weapon' | 'armor' | 'any' }

const RACES = ['undead', 'beast', 'plant', 'insect', 'formless', 'demihuman', 'dragon', 'fish'];
const ELEMENTS = ['neutral', 'fire', 'water', 'wind', 'earth', 'shadow', 'holy', 'poison', 'undead', 'ghost'];

export const OPTIONS: OptionDef[] = [
  ...['str', 'agi', 'vit', 'int', 'dex', 'luk'].map((k): OptionDef => ({ key: k, label: `${k.toUpperCase()} +{v}`, min: 1, max: 3, weight: 6, pool: 'any' })),
  { key: 'maxHp', label: 'Max HP +{v}', min: 100, max: 300, weight: 3, pool: 'armor' },
  { key: 'maxMp', label: 'Max MP +{v}', min: 30, max: 90, weight: 3, pool: 'armor' },
  { key: 'pdef', label: 'DEF +{v}', min: 2, max: 6, weight: 5, pool: 'armor' },
  { key: 'mdef', label: 'MDEF +{v}', min: 2, max: 6, weight: 5, pool: 'armor' },
  { key: 'flee', label: 'FLEE +{v}', min: 3, max: 10, weight: 5, pool: 'armor' },
  ...ELEMENTS.map((e): OptionDef => ({ key: `elementResistPct.${e}`, label: `${e} resist +{v}%`, min: 5, max: 15, weight: 2, pool: 'armor' })),
  { key: 'patk', label: 'ATK +{v}', min: 5, max: 15, weight: 5, pool: 'weapon' },
  { key: 'matk', label: 'MATK +{v}', min: 5, max: 15, weight: 5, pool: 'weapon' },
  { key: 'hit', label: 'HIT +{v}', min: 3, max: 10, weight: 5, pool: 'weapon' },
  { key: 'crit', label: 'CRIT +{v}', min: 2, max: 6, weight: 5, pool: 'weapon' },
  { key: 'aspdPct', label: 'Attack speed +{v}%', min: 2, max: 5, weight: 4, pool: 'weapon' },
  ...RACES.map((r): OptionDef => ({ key: `raceDamagePct.${r}`, label: `+{v}% damage vs ${r}`, min: 5, max: 10, weight: 2, pool: 'weapon' })),
  ...['small', 'medium', 'large'].map((s): OptionDef => ({ key: `sizeDamagePct.${s}`, label: `+{v}% damage vs ${s}`, min: 5, max: 10, weight: 2, pool: 'weapon' })),
  ...['stun', 'poison', 'bleed', 'blind'].map((st): OptionDef => ({ key: `onHitStatusPct.${st}`, label: `{v}% chance to ${st} on hit`, min: 2, max: 5, weight: 1, pool: 'weapon' })),
  { key: 'hpDrainPct', label: 'Drain {v}% of damage as HP', min: 1, max: 3, weight: 1, pool: 'weapon' },
];

export const MAX_OPTIONS = 3;
/** Chance a dropped piece of equipment has 0, 1, 2, 3 options. */
export const DROP_OPTION_COUNT = [0.6, 0.25, 0.11, 0.04];
export const ENCHANT_COST = 5000;
export const REROLL_COST = 10000;

export function optionLabel(o: { key: string; value: number }): string {
  const def = OPTIONS.find((d) => d.key === o.key);
  return (def?.label ?? `${o.key} +{v}`).replace('{v}', String(o.value));
}

/** Each option's chance to be picked for one roll on a weapon or on armor (for the database's option list). */
export function optionOdds(pool: 'weapon' | 'armor'): { def: OptionDef; pct: number }[] {
  const list = OPTIONS.filter((o) => o.pool === 'any' || o.pool === pool);
  const total = list.reduce((a, o) => a + o.weight, 0);
  return list.map((def) => ({ def, pct: (def.weight / total) * 100 })).sort((a, b) => b.pct - a.pct);
}

function poolFor(def: ItemDef) { return OPTIONS.filter((o) => o.pool === 'any' || o.pool === (def.slot === 'weapon' ? 'weapon' : 'armor')); }

/** One random option for this item (never a key it already has). `rand` is uniform [0,1). */
export function rollOption(def: ItemDef, taken: string[], rand: () => number): { key: string; value: number } {
  const pool = poolFor(def).filter((o) => !taken.includes(o.key));
  const total = pool.reduce((a, o) => a + o.weight, 0);
  let x = rand() * total;
  const pick = pool.find((o) => (x -= o.weight) < 0) ?? pool[pool.length - 1];
  return { key: pick.key, value: pick.min + Math.floor(rand() * (pick.max - pick.min + 1)) };
}

export function rollDropOptions(def: ItemDef, rand: () => number): { key: string; value: number }[] {
  let x = rand(), n = 0;
  for (; n < DROP_OPTION_COUNT.length - 1; n++) { x -= DROP_OPTION_COUNT[n]; if (x < 0) break; }
  const out: { key: string; value: number }[] = [];
  for (let i = 0; i < n; i++) out.push(rollOption(def, out.map((o) => o.key), rand));
  return out;
}

/** Enchanter: add one option (if under the cap). */
export function enchantAdd(data: GameData, c: CharacterState, uid: string, rand: () => number): OpResult {
  const inst = c.inventory.find((i) => i.uid === uid);
  const def = inst && data.items.get(inst.itemId);
  if (!inst || !def || def.type !== 'equipment') return { ok: false, error: 'Choose an unequipped piece of equipment.' };
  if ((inst.options?.length ?? 0) >= MAX_OPTIONS) return { ok: false, error: `Already has ${MAX_OPTIONS} options.` };
  if (c.luma < ENCHANT_COST) return { ok: false, error: `Needs ${ENCHANT_COST} Luma.` };
  c.luma -= ENCHANT_COST;
  const o = rollOption(def, (inst.options ?? []).map((x) => x.key), rand);
  inst.options = [...(inst.options ?? []), o];
  return { ok: true, message: `${def.name} gained: ${optionLabel(o)}.` };
}

/** Enchanter: reroll every option (keeps the count, at least one). */
export function enchantReroll(data: GameData, c: CharacterState, uid: string, rand: () => number): OpResult {
  const inst = c.inventory.find((i) => i.uid === uid);
  const def = inst && data.items.get(inst.itemId);
  if (!inst || !def || def.type !== 'equipment') return { ok: false, error: 'Choose an unequipped piece of equipment.' };
  if (!inst.options?.length) return { ok: false, error: 'This item has no options to reroll.' };
  if (c.luma < REROLL_COST) return { ok: false, error: `Needs ${REROLL_COST} Luma.` };
  c.luma -= REROLL_COST;
  const out: { key: string; value: number }[] = [];
  for (let i = 0; i < inst.options.length; i++) out.push(rollOption(def, out.map((o) => o.key), rand));
  inst.options = out;
  return { ok: true, message: `${def.name}: ${out.map(optionLabel).join(', ')}.` };
}

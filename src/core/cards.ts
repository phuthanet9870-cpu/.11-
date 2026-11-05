// Monster cards, Ragnarok-style: every monster has one card (very rare drop).
// A card is compounded permanently into a free slot of a matching piece of
// equipment and adds its bonuses while that equipment is worn. Cards cannot be
// removed, and they are lost if the equipment is destroyed (e.g. by refining).
import type { GameData } from './data';
import type { CharacterState, ItemDef, ItemInstance } from './types';
import { removeByUid, type OpResult } from './inventory';
import { forgedName } from './forge';

export function freeSlots(def: ItemDef, inst: ItemInstance): number {
  if (inst.crafter) return 0; // forged weapons have no card slots
  return Math.max(0, (def.cardSlots ?? 0) - (inst.cards?.length ?? 0));
}

/** Inventory equipment a card can go into (right slot type, a free slot). */
export function compoundTargets(data: GameData, c: CharacterState, cardItemId: string): ItemInstance[] {
  const card = data.items.get(cardItemId)?.card;
  if (!card) return [];
  return c.inventory.filter((i) => {
    const def = data.items.get(i.itemId);
    return !!def && def.type === 'equipment' && def.slot === card.equip && freeSlots(def, i) > 0;
  });
}

export function compoundCard(data: GameData, c: CharacterState, cardUid: string, equipUid: string): OpResult {
  const cardInst = c.inventory.find((i) => i.uid === cardUid);
  const target = c.inventory.find((i) => i.uid === equipUid);
  if (!cardInst || !target) return { ok: false, error: 'Card or equipment not found (unequip the item first).' };
  const cardDef = data.items.get(cardInst.itemId)!, def = data.items.get(target.itemId)!;
  if (!cardDef.card) return { ok: false, error: 'That is not a card.' };
  if (def.type !== 'equipment' || def.slot !== cardDef.card.equip) return { ok: false, error: `${cardDef.name} only fits ${cardDef.card.equip} equipment.` };
  if (freeSlots(def, target) <= 0) return { ok: false, error: `${def.name} has no free card slot.` };
  const r = removeByUid(c, cardUid, 1);
  if (!r.ok) return r;
  target.cards = [...(target.cards ?? []), cardDef.id];
  return { ok: true, message: `${cardDef.name} was compounded into ${def.name}.` };
}

/** Display name with refine and slots, e.g. "+3 Iron Sword [1/2]". */
export function itemDisplayName(def: ItemDef, inst?: ItemInstance): string {
  const ref = inst?.refine ? `+${inst.refine} ` : '';
  const slots = def.cardSlots && !inst?.crafter ? ` [${inst?.cards?.length ?? 0}/${def.cardSlots}]` : '';
  return `${ref}${inst ? forgedName(def.name, inst) : def.name}${slots}`;
}

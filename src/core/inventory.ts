// Inventory, equipment, storage and shop operations on CharacterState.
// Every operation validates first and only mutates when it can fully succeed,
// so a failed call never leaves items half-moved (no duplication / loss).
import type { GameData } from './data';
import { slotForItem } from './formulas';
import type { CharacterState, EquipSlot, ItemDef, ItemInstance, ItemType } from './types';

export type OpResult = { ok: true; message?: string } | { ok: false; error: string };
const ok = (message?: string): OpResult => ({ ok: true, message });
const fail = (error: string): OpResult => ({ ok: false, error });

let uidCounter = 0;
export function newUid(): string {
  uidCounter = (uidCounter + 1) % 1e6;
  return `i${Date.now().toString(36)}${uidCounter.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function itemDef(data: GameData, id: string): ItemDef {
  const d = data.items.get(id);
  if (!d) throw new Error(`Unknown item ${id}`);
  return d;
}

export function inventoryWeight(data: GameData, c: CharacterState): number {
  let w = 0;
  for (const inst of c.inventory) w += (data.items.get(inst.itemId)?.weight ?? 0) * inst.qty;
  for (const inst of Object.values(c.equipment)) if (inst) w += data.items.get(inst.itemId)?.weight ?? 0;
  return w;
}

export function countItem(c: CharacterState, itemId: string): number {
  let n = 0;
  for (const inst of c.inventory) if (inst.itemId === itemId) n += inst.qty;
  return n;
}

/** How many new inventory slots adding `qty` of an item would need. */
function slotsNeeded(data: GameData, list: ItemInstance[], itemId: string, qty: number): number {
  const def = itemDef(data, itemId);
  if (!def.stackable) return qty;
  let room = 0;
  for (const inst of list) if (inst.itemId === itemId && !inst.locked) room += def.maxStack - inst.qty;
  const rest = Math.max(0, qty - room);
  return Math.ceil(rest / def.maxStack);
}

export interface AddOptions { ignoreWeight?: boolean; weightLimit?: number; bound?: boolean }

export function canAddItem(data: GameData, c: CharacterState, itemId: string, qty: number, opts: AddOptions = {}): OpResult {
  if (qty <= 0 || !Number.isInteger(qty)) return fail('Invalid quantity.');
  const def = data.items.get(itemId);
  if (!def) return fail('Unknown item.');
  const maxSlots = data.balance.economy.inventorySlots;
  if (c.inventory.length + slotsNeeded(data, c.inventory, itemId, qty) > maxSlots) return fail('Inventory is full.');
  if (!opts.ignoreWeight && opts.weightLimit != null) {
    if (inventoryWeight(data, c) + def.weight * qty > opts.weightLimit) return fail('You are carrying too much weight.');
  }
  return ok();
}

/** Adds items to a list (inventory or storage) assuming validation passed. */
function pushItems(data: GameData, list: ItemInstance[], itemId: string, qty: number, bound?: boolean, template?: Partial<ItemInstance>) {
  const def = itemDef(data, itemId);
  let left = qty;
  if (def.stackable) {
    for (const inst of list) {
      if (left <= 0) break;
      if (inst.itemId === itemId && inst.qty < def.maxStack) {
        const add = Math.min(left, def.maxStack - inst.qty);
        inst.qty += add;
        left -= add;
      }
    }
    while (left > 0) {
      const add = Math.min(left, def.maxStack);
      list.push({ uid: newUid(), itemId, qty: add, bound: bound || def.bound || undefined });
      left -= add;
    }
  } else {
    for (let i = 0; i < left; i++) {
      list.push({ uid: newUid(), itemId, qty: 1, bound: bound || def.bound || undefined, ...(i === 0 ? template : {}) });
    }
  }
}

export function addItem(data: GameData, c: CharacterState, itemId: string, qty: number, opts: AddOptions = {}): OpResult {
  const check = canAddItem(data, c, itemId, qty, opts);
  if (!check.ok) return check;
  pushItems(data, c.inventory, itemId, qty, opts.bound);
  return ok();
}

/** Removes qty of an item type (from unlocked stacks). Fails without changes if not enough. */
export function removeItem(c: CharacterState, itemId: string, qty: number): OpResult {
  if (qty <= 0) return fail('Invalid quantity.');
  if (countItem(c, itemId) < qty) return fail('Not enough items.');
  let left = qty;
  for (let i = c.inventory.length - 1; i >= 0 && left > 0; i--) {
    const inst = c.inventory[i];
    if (inst.itemId !== itemId) continue;
    const take = Math.min(left, inst.qty);
    inst.qty -= take;
    left -= take;
    if (inst.qty <= 0) c.inventory.splice(i, 1);
  }
  return ok();
}

export function findInstance(c: CharacterState, uid: string): ItemInstance | undefined {
  return c.inventory.find((i) => i.uid === uid);
}

export function removeByUid(c: CharacterState, uid: string, qty: number): OpResult {
  const idx = c.inventory.findIndex((i) => i.uid === uid);
  if (idx < 0) return fail('Item not found.');
  const inst = c.inventory[idx];
  if (qty <= 0 || qty > inst.qty || !Number.isInteger(qty)) return fail('Invalid quantity.');
  inst.qty -= qty;
  if (inst.qty === 0) c.inventory.splice(idx, 1);
  return ok();
}

export function toggleLock(c: CharacterState, uid: string): OpResult {
  const inst = findInstance(c, uid);
  if (!inst) return fail('Item not found.');
  inst.locked = !inst.locked;
  return ok(inst.locked ? 'Item locked.' : 'Item unlocked.');
}

export function canDiscard(data: GameData, inst: ItemInstance): OpResult {
  const def = itemDef(data, inst.itemId);
  if (inst.locked) return fail('This item is locked.');
  if (inst.bound || def.bound) return fail('Bound items cannot be dropped or sold.');
  if (def.type === 'quest') return fail('Quest items cannot be dropped.');
  return ok();
}

// ------------------------------------------------------------------ equipment
export function canEquip(data: GameData, c: CharacterState, def: ItemDef): OpResult {
  if (def.type !== 'equipment' || !def.slot) return fail('That item cannot be equipped.');
  if ((def.equipLevel ?? 1) > c.baseLevel) return fail(`Requires base level ${def.equipLevel}.`);
  if (def.classes && !def.classes.includes(c.classId)) {
    const names = def.classes.map((id) => data.classes.get(id)?.name ?? id).join(', ');
    return fail(`Only ${names} can equip this.`);
  }
  if (def.slot === 'weapon' && def.weaponType) {
    const cls = data.classes.get(c.classId)!;
    if (!cls.weaponTypes.includes(def.weaponType)) return fail(`${cls.name} cannot use ${def.weaponType}s.`);
  }
  return ok();
}

export function equipItem(data: GameData, c: CharacterState, uid: string, preferSlot?: EquipSlot): OpResult {
  const idx = c.inventory.findIndex((i) => i.uid === uid);
  if (idx < 0) return fail('Item not found.');
  const inst = c.inventory[idx];
  const def = itemDef(data, inst.itemId);
  const check = canEquip(data, c, def);
  if (!check.ok) return check;

  let slot = slotForItem(def, c)!;
  if (def.slot === 'accessory' && preferSlot && preferSlot.startsWith('accessory')) slot = preferSlot;
  const toUnequip: EquipSlot[] = [];
  if (c.equipment[slot]) toUnequip.push(slot);
  if (slot === 'shield') {
    const w = c.equipment.weapon && data.items.get(c.equipment.weapon.itemId);
    if (w?.twoHanded) toUnequip.push('weapon');
  }
  if (slot === 'weapon' && def.twoHanded && c.equipment.shield) toUnequip.push('shield');

  // Removing the equipped item frees one slot; unequipping others needs space.
  const freeAfter = data.balance.economy.inventorySlots - (c.inventory.length - 1);
  if (toUnequip.length > freeAfter) return fail('Inventory is full.');

  c.inventory.splice(idx, 1);
  for (const s of toUnequip) {
    const old = c.equipment[s]!;
    delete c.equipment[s];
    c.inventory.push(old);
  }
  c.equipment[slot] = { ...inst, qty: 1 };
  return ok(`Equipped ${def.name}.`);
}

export function unequipItem(data: GameData, c: CharacterState, slot: EquipSlot): OpResult {
  const inst = c.equipment[slot];
  if (!inst) return fail('Nothing equipped there.');
  if (c.inventory.length >= data.balance.economy.inventorySlots) return fail('Inventory is full.');
  delete c.equipment[slot];
  c.inventory.push(inst);
  return ok(`Unequipped ${itemDef(data, inst.itemId).name}.`);
}

// ------------------------------------------------------------------ sorting / filters
const TYPE_ORDER: ItemType[] = ['equipment', 'consumable', 'material', 'quest', 'card', 'misc'];
const RARITY_ORDER = ['legendary', 'epic', 'rare', 'uncommon', 'common'];

export function sortInventory(data: GameData, c: CharacterState, mode: 'type' | 'name' | 'rarity' = 'type'): void {
  const key = (i: ItemInstance) => {
    const d = itemDef(data, i.itemId);
    if (mode === 'name') return d.name;
    if (mode === 'rarity') return `${RARITY_ORDER.indexOf(d.rarity)}-${d.name}`;
    return `${TYPE_ORDER.indexOf(d.type)}-${d.slot ?? ''}-${d.name}`;
  };
  // Merge partial stacks first.
  const merged: ItemInstance[] = [];
  for (const inst of c.inventory) {
    const d = itemDef(data, inst.itemId);
    if (d.stackable && !inst.locked) {
      const target = merged.find((m) => m.itemId === inst.itemId && !m.locked && m.qty < d.maxStack && !!m.bound === !!inst.bound);
      if (target) {
        const add = Math.min(inst.qty, d.maxStack - target.qty);
        target.qty += add;
        if (inst.qty - add > 0) merged.push({ ...inst, qty: inst.qty - add });
        continue;
      }
    }
    merged.push({ ...inst });
  }
  merged.sort((a, b) => key(a).localeCompare(key(b)));
  c.inventory = merged;
}

export function filterInventory(data: GameData, c: CharacterState, filter: 'all' | ItemType): ItemInstance[] {
  if (filter === 'all') return c.inventory;
  return c.inventory.filter((i) => itemDef(data, i.itemId).type === filter);
}

// ------------------------------------------------------------------ shops
export function buyItem(data: GameData, c: CharacterState, shopId: string, itemId: string, qty: number, weightLimit: number): OpResult {
  const shop = data.shops.get(shopId);
  if (!shop || !shop.items.includes(itemId)) return fail('That item is not sold here.');
  if (!Number.isInteger(qty) || qty <= 0 || qty > 999) return fail('Invalid quantity.');
  const def = itemDef(data, itemId);
  const cost = buyPrice(data, c, itemId) * qty;
  if (cost > c.luma) return fail('Not enough Luma.');
  const check = canAddItem(data, c, itemId, qty, { weightLimit });
  if (!check.ok) return check;
  c.luma -= cost;
  pushItems(data, c.inventory, itemId, qty);
  return ok(`Bought ${qty}× ${def.name} for ${cost} Luma.`);
}

/** Passive trade skills (Discount / Overcharge): total % from learned skills. */
function tradePct(data: GameData, c: CharacterState | undefined, key: 'discountPct' | 'overchargePct'): number {
  if (!c) return 0;
  let pct = 0;
  for (const [id, lv] of Object.entries(c.skills)) pct += (data.skills.get(id)?.passive?.[key] ?? 0) * lv;
  return Math.min(24, pct);
}

/** NPC shop price for this character (Discount applies). */
export function buyPrice(data: GameData, c: CharacterState | undefined, itemId: string): number {
  const p = itemDef(data, itemId).price;
  return Math.max(1, Math.floor((p * (100 - tradePct(data, c, 'discountPct'))) / 100));
}

/** What an NPC pays for one (Overcharge applies). */
export function sellPrice(data: GameData, itemId: string, c?: CharacterState): number {
  const base = itemDef(data, itemId).price * data.balance.economy.sellPriceRatio;
  return Math.floor((base * (100 + tradePct(data, c, 'overchargePct'))) / 100);
}

export function sellItem(data: GameData, c: CharacterState, uid: string, qty: number): OpResult {
  const inst = findInstance(c, uid);
  if (!inst) return fail('Item not found.');
  const can = canDiscard(data, inst);
  if (!can.ok) return can;
  if (!Number.isInteger(qty) || qty <= 0 || qty > inst.qty) return fail('Invalid quantity.');
  const def = itemDef(data, inst.itemId);
  const gain = sellPrice(data, inst.itemId, c) * qty;
  const r = removeByUid(c, uid, qty);
  if (!r.ok) return r;
  c.luma += gain;
  return ok(`Sold ${qty}× ${def.name} for ${gain} Luma.`);
}

// ------------------------------------------------------------------ storage
export function depositToStorage(data: GameData, c: CharacterState, uid: string, qty: number): OpResult {
  const inst = findInstance(c, uid);
  if (!inst) return fail('Item not found.');
  if (inst.locked) return fail('This item is locked.');
  if (!Number.isInteger(qty) || qty <= 0 || qty > inst.qty) return fail('Invalid quantity.');
  const def = itemDef(data, inst.itemId);
  if (def.type === 'quest') return fail('Quest items cannot be stored.');
  const fee = data.balance.economy.storageFee;
  if (c.luma < fee) return fail(`Storage costs ${fee} Luma.`);
  const need = def.stackable ? slotsNeeded(data, c.storage, inst.itemId, qty) : 1;
  if (c.storage.length + need > data.balance.economy.storageSlots) return fail('Storage is full.');
  c.luma -= fee;
  if (def.stackable) {
    removeByUid(c, uid, qty);
    pushItems(data, c.storage, inst.itemId, qty, inst.bound);
  } else {
    c.inventory.splice(c.inventory.indexOf(inst), 1);
    c.storage.push(inst);
  }
  return ok(`Stored ${def.name}.`);
}

export function withdrawFromStorage(data: GameData, c: CharacterState, uid: string, qty: number, weightLimit: number): OpResult {
  const idx = c.storage.findIndex((i) => i.uid === uid);
  if (idx < 0) return fail('Item not found in storage.');
  const inst = c.storage[idx];
  if (!Number.isInteger(qty) || qty <= 0 || qty > inst.qty) return fail('Invalid quantity.');
  const def = itemDef(data, inst.itemId);
  const check = canAddItem(data, c, inst.itemId, qty, { weightLimit });
  if (!check.ok) return check;
  if (def.stackable) {
    inst.qty -= qty;
    if (inst.qty === 0) c.storage.splice(idx, 1);
    pushItems(data, c.inventory, inst.itemId, qty, inst.bound);
  } else {
    c.storage.splice(idx, 1);
    c.inventory.push(inst);
  }
  return ok(`Withdrew ${def.name}.`);
}
